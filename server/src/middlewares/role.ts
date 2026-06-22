import { Request, Response, NextFunction } from 'express';
import { Role } from '../types';
import { errorResponse } from '../utils/response';
import { supabaseService } from '../config/supabase';
import { PAGE_POLICIES, PermissionPolicyName } from '../config/permission-policies';

const normalizePagePath = (rawPath?: string): string => {
  if (!rawPath) return '';

  try {
    const decoded = decodeURIComponent(rawPath).trim();
    if (!decoded) return '';

    // Accept either full URL or pathname.
    const candidate = decoded.startsWith('http') ? new URL(decoded).pathname : decoded;
    if (!candidate.startsWith('/')) return '';

    return candidate.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
};

const expandPagePathCandidates = (pagePath: string): string[] => {
  const normalizedPath = normalizePagePath(pagePath);
  if (!normalizedPath) return [];

  const candidates = new Set([normalizedPath]);
  if (normalizedPath.startsWith('/app/')) {
    candidates.add(normalizedPath.replace(/^\/app/, ''));
  } else if (normalizedPath !== '/') {
    candidates.add(`/app${normalizedPath}`);
  }

  return Array.from(candidates);
};

const hasPagePermission = async (userId: string, pagePath: string): Promise<boolean> => {
  const { data: userRoles, error: userRolesError } = await supabaseService
    .from('app_user_roles')
    .select('role_id')
    .eq('user_id', userId);

  if (userRolesError || !userRoles?.length) return false;

  const roleIds = userRoles.map((item) => item.role_id).filter(Boolean);
  if (!roleIds.length) return false;

  const pagePathCandidates = expandPagePathCandidates(pagePath);
  if (!pagePathCandidates.length) return false;

  const { data: rolePermissions, error: rolePermissionsError } = await supabaseService
    .from('app_role_permissions')
    .select('role_id, app_permissions!inner(page_path)')
    .in('role_id', roleIds)
    .in('app_permissions.page_path', pagePathCandidates)
    .limit(1);

  if (rolePermissionsError) return false;
  return !!rolePermissions?.length;
};

const hasAnyPagePermission = async (userId: string, pagePaths: string[]): Promise<boolean> => {
  if (!pagePaths.length) return false;

  const { data: userRoles, error: userRolesError } = await supabaseService
    .from('app_user_roles')
    .select('role_id')
    .eq('user_id', userId);

  if (userRolesError || !userRoles?.length) return false;

  const roleIds = userRoles.map((item) => item.role_id).filter(Boolean);
  if (!roleIds.length) return false;

  const pagePathCandidates = Array.from(new Set(pagePaths.flatMap(expandPagePathCandidates)));
  if (!pagePathCandidates.length) return false;

  const { data: rolePermissions, error: rolePermissionsError } = await supabaseService
    .from('app_role_permissions')
    .select('role_id, app_permissions!inner(page_path)')
    .in('role_id', roleIds)
    .in('app_permissions.page_path', pagePathCandidates)
    .limit(1);

  if (rolePermissionsError) return false;
  return !!rolePermissions?.length;
};

const hasAnyPagePermissionByRoleKey = async (roleKey: Role, pagePaths: string[]): Promise<boolean> => {
  if (!pagePaths.length) return false;

  const { data: role, error: roleError } = await supabaseService
    .from('app_roles')
    .select('id')
    .eq('role_key', roleKey)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (roleError || !role?.id) return false;

  const pagePathCandidates = Array.from(new Set(pagePaths.flatMap(expandPagePathCandidates)));
  if (!pagePathCandidates.length) return false;

  const { data: rolePermissions, error: rolePermissionsError } = await supabaseService
    .from('app_role_permissions')
    .select('role_id, app_permissions!inner(page_path)')
    .eq('role_id', role.id)
    .in('app_permissions.page_path', pagePathCandidates)
    .limit(1);

  if (rolePermissionsError) return false;
  return !!rolePermissions?.length;
};

export const requirePagePermission = (...pagePaths: string[]) => {
  const normalizedPaths = pagePaths
    .map((path) => normalizePagePath(path))
    .filter(Boolean);

  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json(errorResponse('Authentication required', 'UNAUTHORIZED'));
    }

    if (req.user.role === 'admin') {
      return next();
    }

    if (!normalizedPaths.length) {
      return res.status(500).json(errorResponse('Permission middleware misconfigured', 'ERROR'));
    }

    const allowedByAssignments = await hasAnyPagePermission(req.user.id, normalizedPaths);
    if (allowedByAssignments) {
      return next();
    }

    const allowedByLegacyRole = await hasAnyPagePermissionByRoleKey(req.user.role, normalizedPaths);
    if (allowedByLegacyRole) {
      return next();
    }

    return res.status(403).json(errorResponse('Bạn chưa có quyền thao tác trên trang này', 'FORBIDDEN'));
  };
};

export const requirePolicy = (...policyNames: PermissionPolicyName[]) => {
  const pagePaths = Array.from(
    new Set(policyNames.flatMap((policyName) => PAGE_POLICIES[policyName] || []))
  );

  return requirePagePermission(...pagePaths);
};

export const requireRole = (...roles: Role[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json(errorResponse('Authentication required', 'UNAUTHORIZED'));
    }

    if (req.user.role === 'admin' || roles.includes(req.user.role)) {
      return next();
    }

    // RBAC fallback: allow operations if user has permission for current page.
    const pagePath = normalizePagePath(req.header('x-page-path') || req.header('referer') || '');
    if (pagePath) {
      const allowedByPagePermission = await hasPagePermission(req.user.id, pagePath);
      if (allowedByPagePermission) {
        return next();
      }
    }

    return res.status(403).json(errorResponse('Bạn chưa có quyền thao tác trên trang này', 'FORBIDDEN'));
  };
};

/** Like requireRole but no page-permission fallback (strict role gate). */
export const requireRolesOnly = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json(errorResponse('Authentication required', 'UNAUTHORIZED'));
    }
    if (req.user.role === 'admin' || roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json(errorResponse('Bạn chưa có quyền thao tác trên trang này', 'FORBIDDEN'));
  };
};
