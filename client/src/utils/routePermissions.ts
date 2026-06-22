type UserRole = 'admin' | 'manager' | 'staff' | 'driver' | 'customer' | string | undefined;

const PAYMENT_COLLECTIONS_LEGACY_PATHS = new Set([
  '/quan-ly-xe/thu-tien',
  '/app/quan-ly-xe/thu-tien',
]);

const PAYMENT_COLLECTIONS_CURRENT_PATH = '/app/ke-toan/thu-tien-hang';

const expandPermissionPath = (path: string): string[] => {
  const normalizedPath = path.replace(/\/+$/, '') || '/';
  const paths = new Set([normalizedPath]);

  if (normalizedPath !== '/' && !normalizedPath.startsWith('/app/')) {
    paths.add(`/app${normalizedPath}`);
  }

  if (PAYMENT_COLLECTIONS_LEGACY_PATHS.has(normalizedPath)) {
    paths.add(PAYMENT_COLLECTIONS_CURRENT_PATH);
  }

  return Array.from(paths);
};

export const buildAllowedRouteSetFromPagePaths = (pagePaths: string[] | undefined): Set<string> => {
  return new Set((pagePaths || []).flatMap(expandPermissionPath));
};

const DRIVER_LIKE_LEGACY_PATHS: string[] = [
  '/',
  '/app/ho-so',
  '/app/hang-hoa',
  '/app/hang-hoa/giao-hang',
  '/app/hang-hoa/giao-hang-rau',
  '/app/hanh-chinh-nhan-su',
  '/app/hanh-chinh-nhan-su/nghi-phep',
  '/app/hanh-chinh-nhan-su/cham-cong',
  '/app/hanh-chinh-nhan-su/ung-luong',
  '/app/hanh-chinh-nhan-su/chi-phi',
  '/app/chi-phi',
  '/app/chi-phi/phieu',
  '/app/chi-phi/lich-su',
  '/app/quan-ly-xe',
  '/app/quan-ly-xe/check-in',
  '/app/quan-ly-xe/chuyen-giao-cua-toi',
  '/app/quan-ly-xe/dang-giao',
  '/app/quan-ly-xe/ban-do-tai-xe',
  '/app/ke-toan/thu-tien-hang',
  '/app/ke-toan',
  '/app/ke-toan/thu-tien-sg',
  '/app/khach-hang',
  '/app/khach-hang/nguoi-gui-rau',
  '/app/khach-hang/vua-rau',
  '/app/khach-hang/nguoi-gui-tap-hoa',
  '/app/khach-hang/nguoi-nhan-tap-hoa',
];

const LEGACY_ALLOWED_PATHS_BY_ROLE: Record<string, string[]> = {
  ke_toan: [
    '/',
    '/app/ho-so',
    '/app/ke-toan',
    '/app/ke-toan/khach-hang-tap-hoa',
    '/app/ke-toan/khach-hang-rau',
    '/app/ke-toan/vua-rau',
    '/app/ke-toan/cong-no',
    '/app/ke-toan/thu-tien-hang',
    '/app/ke-toan/thu-tien-sg',
    '/app/ke-toan/doanh-thu',
    '/app/khach-hang',
    '/app/khach-hang/nguoi-gui-rau',
    '/app/khach-hang/vua-rau',
    '/app/khach-hang/nguoi-gui-tap-hoa',
    '/app/khach-hang/nguoi-nhan-tap-hoa',
  ],
  staff: [
    '/',
    '/app/ho-so',
    '/app/hang-hoa',
    '/app/hang-hoa/nhap-hang',
    '/app/hang-hoa/xac-nhan-hang-gui',
    '/app/hang-hoa/hang-gui-sg',
    '/app/hang-hoa/nhap-hang-rau',
    '/app/hang-hoa/hang-rau',
    '/app/hang-hoa/giao-hang-rau',
    '/app/hang-hoa/kho-rau',
    '/app/hang-hoa/xuat-hang',
    '/app/hang-hoa/giao-hang',
    '/app/hang-hoa/kho',
    '/app/hanh-chinh-nhan-su',
    '/app/hanh-chinh-nhan-su/nghi-phep',
    '/app/hanh-chinh-nhan-su/cham-cong',
    '/app/hanh-chinh-nhan-su/luong',
    '/app/hanh-chinh-nhan-su/ung-luong',
    '/app/hanh-chinh-nhan-su/chi-phi',
    '/app/chi-phi',
    '/app/chi-phi/phieu',
    '/app/chi-phi/lich-su',
    '/app/ke-toan',
    '/app/ke-toan/khach-hang-tap-hoa',
    '/app/ke-toan/khach-hang-rau',
    '/app/ke-toan/vua-rau',
    '/app/ke-toan/cong-no',
    '/app/ke-toan/doanh-thu',
    '/app/quan-ly-xe',
    '/app/ke-toan/thu-tien-hang',
    '/app/ke-toan/thu-tien-sg',
    '/app/khach-hang',
    '/app/khach-hang/nguoi-gui-rau',
    '/app/khach-hang/vua-rau',
    '/app/khach-hang/nguoi-gui-tap-hoa',
    '/app/khach-hang/nguoi-nhan-tap-hoa',
  ],
  driver: DRIVER_LIKE_LEGACY_PATHS,
  customer: ['/app/ho-so'],
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

