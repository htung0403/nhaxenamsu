import { supabaseService } from '../../config/supabase';
import { Role } from '../../types';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');

export class RolesService {
  private static async getPagePathsByRoleIds(roleIds: string[]) {
    if (!roleIds.length) return [] as string[];

    const { data: rolePermissions, error: rolePermissionsError } = await supabaseService
      .from('app_role_permissions')
      .select('permission_id')
      .in('role_id', roleIds);

    if (rolePermissionsError) throw rolePermissionsError;

    const permissionIds = (rolePermissions || []).map((item) => item.permission_id).filter(Boolean);
    if (!permissionIds.length) return [] as string[];

    const { data: permissions, error: permissionsError } = await supabaseService
      .from('app_permissions')
      .select('page_path')
      .in('id', permissionIds)
      .eq('is_active', true);

    if (permissionsError) throw permissionsError;

    return Array.from(new Set((permissions || []).map((item) => item.page_path).filter(Boolean)));
  }

  private static async getPagePathsByRoleKey(roleKey: Role) {
    const { data: role, error: roleError } = await supabaseService
      .from('app_roles')
      .select('id')
      .eq('role_key', roleKey)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (roleError || !role?.id) {
      return [] as string[];
    }

    return this.getPagePathsByRoleIds([role.id]);
  }

  static async getPermissions() {
    const { data, error } = await supabaseService
      .from('app_permissions')
      .select('*')
      .order('module_name', { ascending: true })
      .order('page_name', { ascending: true });

    if (error) throw error;
    return data;
  }

  static async getRoles() {
    const { data, error } = await supabaseService
      .from('app_roles')
      .select('*, app_role_permissions(permission_id, app_permissions(permission_key, page_path, page_name, module_key, module_name))')
      .eq('is_active', true)
      .order('is_system', { ascending: false })
      .order('role_name', { ascending: true });

    if (error) throw error;

    return (data || []).map((role: any) => ({
      ...role,
      page_paths: (role.app_role_permissions || [])
        .map((rp: any) => rp.app_permissions?.page_path)
        .filter(Boolean),
    }));
  }

  static async createRole(payload: { role_name: string; role_key?: string; description?: string }) {
    const roleKey = payload.role_key ? slugify(payload.role_key) : slugify(payload.role_name);
    const { data, error } = await supabaseService
      .from('app_roles')
      .insert({
        role_key: roleKey,
        role_name: payload.role_name,
        description: payload.description,
        is_system: false,
        is_active: true,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteRole(roleId: string) {
    const { data: role, error: roleError } = await supabaseService
      .from('app_roles')
      .select('id, role_name, is_system, is_active')
      .eq('id', roleId)
      .limit(1)
      .maybeSingle();

    if (roleError) throw roleError;
    if (!role) throw new Error('Không tìm thấy quyền');
    if (!role.is_active) return { id: roleId, deleted: true };

    const { error: userRoleDeleteError } = await supabaseService
      .from('app_user_roles')
      .delete()
      .eq('role_id', roleId);

    if (userRoleDeleteError) throw userRoleDeleteError;

    const { error: rolePermissionDeleteError } = await supabaseService
      .from('app_role_permissions')
      .delete()
      .eq('role_id', roleId);

    if (rolePermissionDeleteError) throw rolePermissionDeleteError;

    const { error: deactivateError } = await supabaseService
      .from('app_roles')
      .update({ is_active: false })
      .eq('id', roleId);

    if (deactivateError) throw deactivateError;

    return { id: roleId, role_name: role.role_name, deleted: true };
  }

  static async updateRolePermissions(roleId: string, pagePaths: string[]) {
    // Clear existing role-permission mappings first
    const { error: deleteError } = await supabaseService
      .from('app_role_permissions')
      .delete()
      .eq('role_id', roleId);

    if (deleteError) throw deleteError;

    if (!pagePaths.length) {
      return { role_id: roleId, page_paths: [] };
    }

    // Find existing permissions by page_path
    const { data: existingPerms, error: existingError } = await supabaseService
      .from('app_permissions')
      .select('id, page_path')
      .in('page_path', pagePaths);

    if (existingError) throw existingError;

    const existingPathSet = new Set((existingPerms || []).map((p) => p.page_path));
    const missingPaths = pagePaths.filter((p) => !existingPathSet.has(p));

    // Auto-create missing app_permissions rows
    if (missingPaths.length) {
      const newPermissions = missingPaths.map((pagePath) => {
        const permKey = 'page.view.' + pagePath.replace(/^\//g, '').replace(/\//g, '.');
        // Derive module from path prefix
        const pathSegments = pagePath.split('/').filter(Boolean);
        const segment = pathSegments[0] === 'app' ? pathSegments[1] || 'other' : pathSegments[0] || 'other';
        const moduleMap: Record<string, { key: string; name: string }> = {
          'hang-hoa': { key: 'products', name: 'Hàng hóa' },
          'hanh-chinh-nhan-su': { key: 'hr', name: 'Hành chính nhân sự' },
          'ke-toan': { key: 'accounting', name: 'Kế toán' },
          'quan-ly-xe': { key: 'vehicles', name: 'Quản lý xe' },
        };
        const mod = moduleMap[segment] || { key: segment, name: segment };
        return {
          permission_key: permKey,
          page_path: pagePath,
          page_name: pagePath,
          module_key: mod.key,
          module_name: mod.name,
          is_active: true,
        };
      });

      const { data: inserted, error: insertPermError } = await supabaseService
        .from('app_permissions')
        .upsert(newPermissions, { onConflict: 'page_path' })
        .select('id, page_path');

      if (insertPermError) throw insertPermError;
      if (inserted) existingPerms!.push(...inserted);
    }

    const permissionIds = (existingPerms || []).map((p) => p.id);
    const rows = permissionIds.map((permissionId) => ({ role_id: roleId, permission_id: permissionId }));
    const { error: insertError } = await supabaseService.from('app_role_permissions').insert(rows);

    if (insertError) throw insertError;

    return { role_id: roleId, page_paths: pagePaths };
  }

  static async getUserRoles(userId: string) {
    const { data, error } = await supabaseService
      .from('app_user_roles')
      .select('role_id, app_roles(id, role_key, role_name, description, is_system, is_active)')
      .eq('user_id', userId);

    if (error) throw error;

    return {
      user_id: userId,
      roles: (data || []).map((r: any) => r.app_roles).filter(Boolean),
      role_ids: (data || []).map((r: any) => r.role_id),
    };
  }

  static async assignUserRoles(userId: string, roleIds: string[]) {
    const { error: deleteError } = await supabaseService
      .from('app_user_roles')
      .delete()
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    if (!roleIds.length) {
      return { user_id: userId, role_ids: [] };
    }

    const rows = roleIds.map((roleId) => ({ user_id: userId, role_id: roleId }));
    const { error: insertError } = await supabaseService.from('app_user_roles').insert(rows);

    if (insertError) throw insertError;

    return { user_id: userId, role_ids: roleIds };
  }

  static async getMyPermissions(userId: string, profileRole: Role) {
    const { data: userRoles, error: userRolesError } = await supabaseService
      .from('app_user_roles')
      .select('role_id')
      .eq('user_id', userId);

    if (userRolesError) throw userRolesError;

    const roleIds = (userRoles || []).map((item) => item.role_id).filter(Boolean);

    // Prefer explicit role assignments; fallback to legacy profile role mapping when absent.
    const page_paths = roleIds.length
      ? await this.getPagePathsByRoleIds(roleIds)
      : await this.getPagePathsByRoleKey(profileRole);

    return { user_id: userId, page_paths };
  }
}
