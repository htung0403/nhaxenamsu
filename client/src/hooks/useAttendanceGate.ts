import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAttendance } from './queries/useHR';
import { useLockSchedule } from './queries/useSystemSettings';
import type { LockSchedule } from '../types/systemSettings';

/**
 * Gets current date string in Vietnam timezone (YYYY-MM-DD)
 */
export function getVietnamTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

/**
 * Gets current time string in Vietnam timezone (HH:mm)
 */
export function getVietnamNowTimeStr(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date());
}

/**
 * Gets current hour in Vietnam timezone (0-23)
 */
export function getVietnamCurrentHour(): number {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      hour12: false
    }).format(new Date())
  );
}

function getVietnamCurrentDay(): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short'
  }).format(new Date());

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[weekday] ?? 0;
}

function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function isWithinRoleSchedule(roleSchedule: LockSchedule['schedules'][number]): boolean {
  const start = parseTimeToMinutes(roleSchedule.start_time);
  const end = parseTimeToMinutes(roleSchedule.end_time);

  if (start === null || end === null || start >= end) return true;

  const currentDay = getVietnamCurrentDay();
  if (!roleSchedule.days.includes(currentDay)) return false;

  const nowMinutes = parseTimeToMinutes(getVietnamNowTimeStr());
  if (nowMinutes === null) return true;

  return nowMinutes >= start && nowMinutes < end;
}

function normalizeRoleKey(roleKey?: string | null): string {
  return (roleKey || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getScheduleRoleAliases(roleKey?: string | null): string[] {
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
}

const ALLOWED_PATHS_BEFORE_CHECKIN = new Set([
  '/app/hanh-chinh-nhan-su',
  '/app/hanh-chinh-nhan-su/cham-cong',
  '/app/ho-so',
]);

export function useAttendanceGate() {
  const { user } = useAuth();
  const todayStr = getVietnamTodayStr();
  const currentHour = getVietnamCurrentHour();
  const isAdmin = user?.role === 'admin';
  const isCustomer = user?.role === 'customer';
  const isNhanVienNhanHang = user?.role === 'nhan_vien_nhan_hang';

  const { data: attendanceData, isLoading } = useAttendance(todayStr, todayStr, todayStr, !isCustomer);
  const { data: lockSchedule, isLoading: isLockScheduleLoading } = useLockSchedule();

  const hasCheckedIn = useMemo(() => {
    if (isCustomer) return true;
    if (!user || !attendanceData) return false;
    return attendanceData.some((a) => a.employee_id === user.id && a.is_present);
  }, [user, attendanceData, isCustomer]);

  const roleSchedule = useMemo(() => {
    if (!user || !lockSchedule?.schedules?.length) return null;
    const roleAliases = new Set(getScheduleRoleAliases(user.role));
    return lockSchedule.schedules.find((item) => roleAliases.has(normalizeRoleKey(item.role_key))) || null;
  }, [user, lockSchedule]);

  const lockedByRoleSchedule = useMemo(() => {
    if (!user || isAdmin || isCustomer || !roleSchedule) return false;
    return !isWithinRoleSchedule(roleSchedule);
  }, [user, isAdmin, isCustomer, roleSchedule]);

  const forcedTimeLocked = useMemo(() => {
    if (typeof window === 'undefined' || localStorage.getItem('time_locked') !== '1') return false;
    if (roleSchedule && !lockedByRoleSchedule) {
      localStorage.removeItem('time_locked');
      return false;
    }
    return true;
  }, [roleSchedule, lockedByRoleSchedule]);

  const isAfterHours = currentHour >= 19;
  const lockedByLegacyRule = !!user && !isAdmin && !isCustomer && !isNhanVienNhanHang && !roleSchedule && isAfterHours;
  const isLocked = !isCustomer && (forcedTimeLocked || lockedByRoleSchedule || lockedByLegacyRule);
  const gateLoading = !isCustomer && (isLoading || isLockScheduleLoading);
  const mustCheckIn = !!user && !isAdmin && !isCustomer && !gateLoading && !hasCheckedIn && !isLocked;

  return { mustCheckIn, isLoading: gateLoading, hasCheckedIn, isLocked };
}

export function isPathAllowedBeforeCheckin(path: string): boolean {
  if (path === '/') return true;
  if (ALLOWED_PATHS_BEFORE_CHECKIN.has(path)) return true;
  if (path.startsWith('/app/ho-so/')) return true;
  return false;
}
