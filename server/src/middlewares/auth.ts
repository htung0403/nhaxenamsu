import { Request, Response, NextFunction } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { supabaseService } from '../config/supabase';
import { env } from '../config/env';
import { errorResponse } from '../utils/response';
import { UserPayload, Role } from '../types';

const profileCache = new Map<string, { profile: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

type LockScheduleItem = {
  role_key: string;
  start_time: string;
  end_time: string;
  days: number[];
};

const toMinutes = (value: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const getVietnamTime = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date());

  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0');

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    day: dayMap[weekday || 'Sun'] ?? 0,
    minuteOfDay: hour * 60 + minute,
  };
};

const isMinuteInRange = (minute: number, start: number, end: number): boolean => {
  if (start <= end) return minute >= start && minute <= end;
  return minute >= start || minute <= end;
};

const normalizeRoleKey = (roleKey: string): string =>
  (roleKey || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const getScheduleRoleAliases = (roleKey: string): string[] => {
  const normalized = normalizeRoleKey(roleKey);
  const aliases = new Set([normalized]);

  if (normalized.includes('tai_xe') && normalized.includes('lon')) {
    aliases.add('tai_xe_xe_lon');
    aliases.add('tai_xe_xe_tai_lon');
    aliases.add('tai_xe_tai_lon');
    aliases.add('tai_xe_xe_lon_chinh');
    aliases.add('tai_xe_xe_lon_phu');
  }

  if (normalized.includes('tai_xe') && normalized.includes('nho')) {
    aliases.add('tai_xe_xe_nho');
    aliases.add('tai_xe_xe_tai_nho');
    aliases.add('tai_xe_tai_nho');
    aliases.add('tai_xe_xe_nho_cu');
    aliases.add('tai_xe_xe_nho_moi');
  }

  return Array.from(aliases);
};

const getUserRoleKeys = async (userId: string, fallbackRole: Role): Promise<string[]> => {
  const { data, error } = await supabaseService
    .from('app_user_roles')
    .select('app_roles!inner(role_key, is_active)')
    .eq('user_id', userId)
    .eq('app_roles.is_active', true);

  if (error) return [fallbackRole];

  const assignedKeys = (data || [])
    .map((row: any) => row.app_roles?.role_key)
    .filter(Boolean);

  if (assignedKeys.length > 0) return Array.from(new Set(assignedKeys));
  return [fallbackRole];
};

const shouldDenyByLockSchedule = async (userId: string, profileRole: Role): Promise<boolean> => {
  if (profileRole === 'admin') return false;

  const { data, error } = await supabaseService
    .from('general_settings')
    .select('setting_value')
    .eq('setting_key', 'system_lock_schedule')
    .limit(1)
    .maybeSingle();

  if (error || !data?.setting_value) return false;

  const rawValue = data.setting_value;
  let parsedValue: any;
  try {
    parsedValue = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
  } catch {
    return false;
  }

  const schedules = Array.isArray(parsedValue?.schedules) ? parsedValue.schedules : [];
  if (!schedules.length) return false;

  const roleKeys = await getUserRoleKeys(userId, profileRole);
  const scheduleRoleKeys = new Set(roleKeys.flatMap(getScheduleRoleAliases));
  const applicableSchedules: LockScheduleItem[] = schedules.filter((item: LockScheduleItem) =>
    scheduleRoleKeys.has(normalizeRoleKey(item.role_key))
  );

  if (!applicableSchedules.length) return false;

  const { day, minuteOfDay } = getVietnamTime();

  const isAllowed = applicableSchedules.some((item) => {
    if (!Array.isArray(item.days) || !item.days.includes(day)) return false;
    const start = toMinutes(item.start_time);
    const end = toMinutes(item.end_time);
    if (start === null || end === null) return false;
    return isMinuteInRange(minuteOfDay, start, end);
  });

  return !isAllowed;
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json(errorResponse('No token provided', 'UNAUTHORIZED'));
  }

  const token = authHeader.split(' ')[1];
  const start = Date.now();

  try {
    let userId: string;
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      userId = decoded.sub as string;
      if (!userId) {
        return res.status(401).json(errorResponse('Invalid or expired token', 'UNAUTHORIZED'));
      }
    } catch {
      return res.status(401).json(errorResponse('Invalid or expired token', 'UNAUTHORIZED'));
    }

    const now = Date.now();
    let profile: any = null;
    const cachedProfile = profileCache.get(userId);

    if (cachedProfile && now - cachedProfile.timestamp < CACHE_TTL) {
      profile = cachedProfile.profile;
    } else {
      const { data, error: profileError } = await supabaseService
        .from('profiles')
        .select('role, full_name, email, personal_email, avatar_url')
        .eq('id', userId)
        .single();

      if (profileError || !data) {
        return res.status(401).json(errorResponse('User profile not found', 'UNAUTHORIZED'));
      }

      profile = data;
      profileCache.set(userId, { profile: data, timestamp: now });
    }

    const isTimeLocked = await shouldDenyByLockSchedule(userId, profile.role as Role);
    if (isTimeLocked) {
      return res.status(403).json(errorResponse('Ngoài khung giờ truy cập hệ thống', 'TIME_LOCKED'));
    }

    const displayEmail = (profile.email || profile.personal_email || '') as string;

    req.user = {
      id: userId,
      email: displayEmail,
      role: profile.role as Role,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url ?? undefined,
    } as UserPayload;
    req.token = token;

    const totalTime = Date.now() - start;
    if (totalTime > 200) {
      console.warn(`[PERF WARNING] authMiddleware took ${totalTime}ms`);
    }

    next();
  } catch (err: any) {
    console.error('Auth error:', err);
    return res.status(500).json(errorResponse('Internal server error during authentication', 'ERROR'));
  }
};
