type UserRole = 'admin' | 'manager' | 'staff' | 'driver' | 'customer' | string | undefined;

const DRIVER_LIKE_LEGACY_PATHS: string[] = [
  '/',
  '/ho-so',
  '/hang-hoa',
  '/hang-hoa/giao-hang',
  '/hang-hoa/giao-hang-rau',
  '/hanh-chinh-nhan-su',
  '/hanh-chinh-nhan-su/nghi-phep',
  '/hanh-chinh-nhan-su/cham-cong',
  '/hanh-chinh-nhan-su/ung-luong',
  '/hanh-chinh-nhan-su/chi-phi',
  '/chi-phi',
  '/chi-phi/phieu',
  '/chi-phi/lich-su',
  '/quan-ly-xe',
  '/quan-ly-xe/check-in',
  '/quan-ly-xe/chuyen-giao-cua-toi',
  '/quan-ly-xe/dang-giao',
  '/quan-ly-xe/ban-do-tai-xe',
  '/quan-ly-xe/thu-tien',
  '/ke-toan',
  '/ke-toan/thu-tien-sg',
  '/khach-hang',
  '/khach-hang/nguoi-gui-rau',
  '/khach-hang/vua-rau',
  '/khach-hang/nguoi-gui-tap-hoa',
  '/khach-hang/nguoi-nhan-tap-hoa',
];

const LEGACY_ALLOWED_PATHS_BY_ROLE: Record<string, string[]> = {
  ke_toan: [
    '/',
    '/ho-so',
    '/ke-toan',
    '/ke-toan/khach-hang-tap-hoa',
    '/ke-toan/khach-hang-rau',
    '/ke-toan/vua-rau',
    '/ke-toan/cong-no',
    '/ke-toan/thu-tien-sg',
    '/ke-toan/doanh-thu',
    '/khach-hang',
    '/khach-hang/nguoi-gui-rau',
    '/khach-hang/vua-rau',
    '/khach-hang/nguoi-gui-tap-hoa',
    '/khach-hang/nguoi-nhan-tap-hoa',
  ],
  staff: [
    '/',
    '/ho-so',
    '/hang-hoa',
    '/hang-hoa/nhap-hang',
    '/hang-hoa/nhap-hang-rau',
    '/hang-hoa/hang-rau',
    '/hang-hoa/giao-hang-rau',
    '/hang-hoa/kho-rau',
    '/hang-hoa/xuat-hang',
    '/hang-hoa/giao-hang',
    '/hang-hoa/kho',
    '/hanh-chinh-nhan-su',
    '/hanh-chinh-nhan-su/nghi-phep',
    '/hanh-chinh-nhan-su/cham-cong',
    '/hanh-chinh-nhan-su/luong',
    '/hanh-chinh-nhan-su/ung-luong',
    '/hanh-chinh-nhan-su/chi-phi',
    '/chi-phi',
    '/chi-phi/phieu',
    '/chi-phi/lich-su',
    '/ke-toan',
    '/ke-toan/khach-hang-tap-hoa',
    '/ke-toan/khach-hang-rau',
    '/ke-toan/vua-rau',
    '/ke-toan/cong-no',
    '/ke-toan/doanh-thu',
    '/quan-ly-xe',
    '/quan-ly-xe/thu-tien',
    '/ke-toan/thu-tien-sg',
    '/khach-hang',
    '/khach-hang/nguoi-gui-rau',
    '/khach-hang/vua-rau',
    '/khach-hang/nguoi-gui-tap-hoa',
    '/khach-hang/nguoi-nhan-tap-hoa',
  ],
  driver: DRIVER_LIKE_LEGACY_PATHS,
  customer: ['/ho-so'],
};

const hasBaselineRoleAccess = (path: string, role: UserRole): boolean => {
  const roleKey = role || '';
  const baselinePaths = LEGACY_ALLOWED_PATHS_BY_ROLE[roleKey];
  return Boolean(baselinePaths?.includes(path));
};

export const isAllRoutesAllowed = (role: UserRole): boolean => role === 'admin' || role === 'manager';

export const isDriverLikeRoleKey = (role: string): boolean => {
  const r = role.toLowerCase();
  return r === 'driver' || r.includes('tai_xe') || r.includes('tài xế') || r.includes('lo_xe') || r.includes('lơ xe');
};

export const buildAllowedRouteSet = (role: UserRole): Set<string> => {
  if (isAllRoutesAllowed(role)) return new Set();
  const key = role || '';
  if (key && LEGACY_ALLOWED_PATHS_BY_ROLE[key]) {
    return new Set(LEGACY_ALLOWED_PATHS_BY_ROLE[key]);
  }
  if (isDriverLikeRoleKey(key)) {
    return new Set(DRIVER_LIKE_LEGACY_PATHS);
  }
  return new Set();
};

export const canAccessRoute = (path: string | undefined, role: UserRole, allowedSet: Set<string>): boolean => {
  if (!path) return true;
  if (isAllRoutesAllowed(role)) return true;
  if (hasBaselineRoleAccess(path, role)) return true;
  return allowedSet.has(path);
};

export const canAccessAnyRoute = (paths: string[], role: UserRole, allowedSet: Set<string>): boolean => {
  if (isAllRoutesAllowed(role)) return true;
  return paths.some((path) => canAccessRoute(path, role, allowedSet));
};

export const canAccessModuleRoute = (
  moduleRootPath: string,
  moduleChildPaths: string[],
  role: UserRole,
  allowedSet: Set<string>
): boolean => {
  if (isAllRoutesAllowed(role)) return true;

  if (canAccessRoute(moduleRootPath, role, allowedSet)) {
    return true;
  }

  return canAccessAnyRoute(moduleChildPaths, role, allowedSet);
};
