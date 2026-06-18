import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { sidebarMenu, extraMenuItems } from '../../data/sidebarMenu';
import type { SidebarItem } from '../../data/sidebarMenu';
import { clsx } from 'clsx';
import { Truck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { moduleData } from '../../data/moduleData';
import { buildAllowedRouteSet, canAccessModuleRoute, canAccessRoute } from '../../utils/routePermissions';
import { useMyPermissions } from '../../hooks/queries/useRoles';
import { isPathAllowedBeforeCheckin } from '../../hooks/useAttendanceGate';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  mustCheckIn: boolean;
  isLocked: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, mustCheckIn, isLocked }) => {
  const { user } = useAuth();
  const { data: myPermissionsData, isSuccess: permissionsReady } = useMyPermissions(!!user);
  const allowedPaths = permissionsReady
    ? new Set(myPermissionsData?.page_paths || [])
    : buildAllowedRouteSet(user?.role);

  const visibleSidebarMenu = sidebarMenu.filter((item) => {
    if ((mustCheckIn || isLocked) && !isPathAllowedBeforeCheckin(item.path)) return false;
    if (user?.role && item.hiddenForRoles?.includes(user.role)) return false;

    const moduleSections = moduleData[item.path];

    if (moduleSections) {
      const childPaths = moduleSections
        .flatMap((section) => section.items)
        .map((moduleItem) => moduleItem.path)
        .filter((path): path is string => Boolean(path));

      return canAccessModuleRoute(item.path, childPaths, user?.role, allowedPaths);
    }

    return canAccessRoute(item.path, user?.role, allowedPaths);
  });

  const visibleExtraMenuItems = (mustCheckIn || isLocked)
    ? []
    : extraMenuItems.filter((item) => canAccessRoute(item.path, user?.role, allowedPaths));

  return (
    <>
      {/* Overlay - visible whenever sidebar is open ON MOBILE */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[2000] lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-[2010] bg-card border-r border-border transition-all duration-300 flex flex-col h-full",
          // Mobile: hidden when closed, w-64 when open
          // Desktop: w-[72px] when closed, w-64 when open
          isOpen ? "w-64 translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-[72px]"
        )}
      >
        {/* Header / Logo */}
        <div className={clsx(
          "h-[55px] flex items-center border-b border-border overflow-hidden shrink-0 transition-all duration-300",
          isOpen ? "px-4" : "justify-center"
        )}>
          <div className={clsx(
            "rounded-xl bg-primary text-white flex items-center justify-center shrink-0 transition-all duration-300",
            isOpen ? "w-8 h-8" : "w-10 h-10"
          )}>
            <Truck size={20} />
          </div>
          <div className={clsx("flex flex-col ml-3 whitespace-nowrap transition-opacity duration-300", !isOpen && "opacity-0 hidden")}>
            <span className="font-bold text-[15px] leading-tight text-foreground">Nhà xe Năm Sự</span>
            <span className="text-[11px] text-muted-foreground leading-tight">Quản lý vận chuyển</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-2 custom-scrollbar flex flex-col items-center lg:items-stretch">
          {visibleSidebarMenu.map((item) => (
            <NavItem key={item.path} item={item} isOpen={isOpen} onClick={() => {
              if (window.innerWidth < 1024) setIsOpen(false);
            }} />
          ))}

          <div className="my-4 border-t border-border w-full"></div>

          {visibleExtraMenuItems.map((item) => (
            <NavItem key={item.path} item={item} isOpen={isOpen} onClick={() => {
              if (window.innerWidth < 1024) setIsOpen(false);
            }} />
          ))}
        </nav>
      </aside>
    </>
  );
};

function isSidebarItemActive(pathname: string, itemPath: string): boolean {
  if (itemPath === '/hanh-chinh-nhan-su') {
    return pathname === '/hanh-chinh-nhan-su' || pathname.startsWith('/hanh-chinh-nhan-su/');
  }
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

const NavItem = ({ item, onClick, isOpen }: { item: SidebarItem; onClick?: () => void; isOpen: boolean }) => {
  const location = useLocation();
  const isActive = isSidebarItemActive(location.pathname, item.path);

  return (
    <NavLink
      to={item.path}
      onClick={onClick}
      className={() =>
        clsx(
          'flex items-center rounded-xl text-sm font-medium transition-all duration-300 overflow-hidden whitespace-nowrap',
          isOpen ? 'px-3 py-2.5 w-full justify-start' : 'w-11 h-11 justify-center',
          isActive
            ? 'bg-primary text-white shadow-sm'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )
      }
      title={!isOpen ? item.label : undefined}
    >
      <div className={clsx("flex items-center justify-center shrink-0", isOpen && "w-5 mr-3")}>
        <item.icon size={22} className={clsx(!isOpen && "mt-0.5")} strokeWidth={1.75} />
      </div>
      <span className={clsx("transition-all duration-300", !isOpen && "opacity-0 w-0 hidden")}>{item.label}</span>
    </NavLink>
  );
};

export default Sidebar;
