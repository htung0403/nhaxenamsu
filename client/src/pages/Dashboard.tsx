import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ActionCard } from '../components/ui/ActionCard';
import type { ActionCardProps } from '../components/ui/ActionCard';
import { Box, Users, Wallet, Car, Copyright, ClipboardList, ChevronRight, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { moduleData } from '../data/moduleData';
import { ModuleCard } from '../components/ui/ModuleCard';
import ZaloLogo from '../assets/zalo-seeklogo.svg';
import { buildAllowedRouteSet, buildAllowedRouteSetFromPagePaths, canAccessModuleRoute, canAccessRoute } from '../utils/routePermissions';
import { useMyPermissions } from '../hooks/queries/useRoles';
import { useAttendanceGate, getVietnamCurrentHour } from '../hooks/useAttendanceGate';
import { Link } from 'react-router-dom';
import { SearchInput } from '../components/ui/SearchInput';
import { matchesSearch } from '../lib/str-utils';

const dashboardModules: ActionCardProps[] = [
  {
    icon: ClipboardList,
    title: 'Tài khoản khách hàng',
    description: 'Đơn hàng và khách hàng của tài khoản hiện tại.',
    href: '/app/tai-khoan',
    colorScheme: 'green'
  },  {
    icon: Box,
    title: 'Hàng hóa',
    description: 'Kho, nhập hàng, xuất hàng, tồn kho.',
    href: '/app/hang-hoa',
    colorScheme: 'teal'
  },
  {
    icon: Users,
    title: 'Hành chính nhân sự',
    description: 'Quản lý nhân sự và các thủ tục hành chính.',
    href: '/app/hanh-chinh-nhan-su',
    colorScheme: 'emerald'
  },
  {
    icon: Wallet,
    title: 'Kế toán',
    description: 'Công nợ, danh sách khách hàng.',
    href: '/app/ke-toan',
    colorScheme: 'blue'
  },
  {
    icon: Car,
    title: 'Quản lý xe',
    description: 'Theo dõi và quản lý phương tiện.',
    href: '/app/quan-ly-xe',
    colorScheme: 'orange'
  },
  {
    icon: Copyright,
    title: 'Thông tin bản quyền',
    description: 'Quản lý sở hữu trí tuệ.',
    href: '/app/ban-quyen',
    colorScheme: 'blue'
  },
  {
    iconSrc: ZaloLogo,
    title: 'Chat Zalo',
    description: 'Chuyển sang ứng dụng Zalo chat',
    href: 'https://chat.zalo.me/',
    colorScheme: 'blue'
  }
];

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { mustCheckIn, isLocked } = useAttendanceGate();
  const [activeTab, setActiveTab] = useState<'chuc-nang' | 'danh-dau' | 'tat-ca'>('chuc-nang');
  const [greeting, setGreeting] = useState('Chào bạn');

  useEffect(() => {
    const hour = getVietnamCurrentHour();
    if (hour < 12) setGreeting('Chào buổi sáng');
    else if (hour < 18) setGreeting('Chào buổi chiều');
    else setGreeting('Chào buổi tối');
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: myPermissionsData, isSuccess: permissionsReady } = useMyPermissions(!!user);

  const allSections = Object.values(moduleData).flat();
  const allowedPaths = permissionsReady
    ? buildAllowedRouteSetFromPagePaths(myPermissionsData?.page_paths)
    : buildAllowedRouteSet(user?.role);
  const visibleDashboardModules = dashboardModules.filter((item) => {
    if (!item.href || item.href.startsWith('http')) return true;

    const moduleSections = moduleData[item.href];
    if (moduleSections) {
      const childPaths = moduleSections
        .flatMap((section) => section.items)
        .map((moduleItem) => moduleItem.path)
        .filter((path): path is string => Boolean(path));

      return canAccessModuleRoute(item.href, childPaths, user?.role, allowedPaths);
    }

    return canAccessRoute(item.href, user?.role, allowedPaths);
  });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2 text-foreground">
          {greeting}, <span className="text-primary">{user?.full_name || 'Người dùng'}</span> 👋
        </h1>
      </div>

      {isLocked && (
        <div className="mb-6 lg:mb-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 lg:p-12 flex flex-col items-center gap-6 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent"></div>
            </div>
            
            <div className="w-20 h-20 rounded-3xl bg-slate-800 flex items-center justify-center shadow-inner relative z-10">
              <Lock size={40} className="text-primary animate-pulse" />
            </div>
            <div className="space-y-3 relative z-10">
              <h2 className="text-xl lg:text-2xl font-black text-white tracking-tight uppercase">
                Hệ thống đã khóa
              </h2>
                <p className="text-slate-400 max-w-md text-[14px] lg:text-[15px] leading-relaxed">
                  Bạn đang ngoài khung giờ truy cập được cấu hình cho vai trò hiện tại.
                  Vui lòng thử lại trong khung giờ cho phép.
                </p>
            </div>
            <div className="pt-4 flex flex-col items-center gap-4 relative z-10">
              <div className="px-4 py-2 bg-slate-800/50 rounded-full border border-slate-700/50 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-ping"></div>
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Giờ nghỉ ngơi</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {mustCheckIn && !isLocked && (
        <div className="mb-6 lg:mb-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 lg:p-8 flex flex-col items-center gap-4 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
              <ClipboardList size={28} className="text-amber-600" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-[16px] lg:text-[18px] font-bold text-amber-800">
                Bạn chưa chấm công hôm nay
              </h2>
              <p className="text-[13px] text-amber-600 max-w-md">
                Vui lòng chấm công trước khi sử dụng các chức năng khác của hệ thống.
              </p>
            </div>
            <Link
              to="/app/hanh-chinh-nhan-su/cham-cong"
              className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[14px] font-bold shadow-lg shadow-amber-500/20 transition-all active:scale-95"
            >
              <ClipboardList size={18} />
              Chấm công ngay
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      )}

      {!mustCheckIn && !isLocked && (
        <>
      <div className={clsx(
        "bg-card sm:rounded-xl shadow-sm border-y border-border sm:border py-1.5 px-4 sm:p-2 flex flex-row items-center gap-1.5 sm:gap-3 mb-6 lg:mb-8 transition-all duration-300 relative z-10 w-[calc(100%+2rem)] -ml-4 sm:ml-0 overflow-hidden",
        activeTab === 'tat-ca' ? "sm:w-full" : "sm:w-max"
      )}>
        <div className="flex bg-muted rounded-lg p-0.5 sm:p-1 shrink-0 h-9 sm:h-10 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('chuc-nang')}
            className={clsx(
              "px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-md text-[12px] sm:text-[13px] font-bold transition-all duration-200 whitespace-nowrap",
              activeTab === 'chuc-nang'
                ? "bg-card text-primary shadow-sm ring-1 ring-black/5"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Chức năng
          </button>
          <button
            onClick={() => setActiveTab('danh-dau')}
            className={clsx(
              "px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-md text-[12px] sm:text-[13px] font-bold transition-all duration-200 whitespace-nowrap",
              activeTab === 'danh-dau'
                ? "bg-card text-primary shadow-sm ring-1 ring-black/5"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Đánh dấu
          </button>
          <button
            onClick={() => setActiveTab('tat-ca')}
            className={clsx(
              "px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-md text-[12px] sm:text-[13px] font-bold transition-all duration-200 whitespace-nowrap",
              activeTab === 'tat-ca'
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Tất cả
          </button>
        </div>

        {/* Search Bar (Only shown on "Tất cả" tab) */}
        {activeTab === 'tat-ca' && (
          <div className="flex-1 flex min-w-0 items-center animate-in slide-in-from-left-2 duration-300">
            <SearchInput
              placeholder="Tìm kiếm..."
              onSearch={(raw) => setSearchQuery(raw)}
              className="h-9 sm:h-10 border-none bg-transparent"
              containerClassName="bg-muted/50 rounded-lg"
            />
          </div>
        )}
      </div>

      {activeTab === 'chuc-nang' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-5">
          {visibleDashboardModules.map((module, idx) => (
            <ActionCard
              key={idx}
              {...module}
            />
          ))}
        </div>
      )}

      {activeTab === 'danh-dau' && (
        <div className="text-center py-12 text-muted-foreground bg-card rounded-2xl border border-border border-dashed">
          Chưa có module nào được đánh dấu.
        </div>
      )}

      {activeTab === 'tat-ca' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="space-y-8">
            {allSections.map((section, idx) => {
              const filteredItems = section.items.filter(item => {
                if (!canAccessRoute(item.path, user?.role, allowedPaths)) {
                  return false;
                }

                return matchesSearch(item.title, searchQuery) ||
                       matchesSearch(item.description, searchQuery);
              });

              if (filteredItems.length === 0) return null;

              return (
                <div key={idx} className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: `${idx * 50}ms` }}>
                  <h2 className="text-[14px] font-bold text-primary mb-3 flex items-center gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="w-1 h-4 bg-primary rounded-full"></span>
                      <span>{section.section}</span>
                    </div>
                    <div className="h-px flex-1 bg-border/60"></div>
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filteredItems.map((item, itemIdx) => (
                      <ModuleCard key={itemIdx} {...item} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
