import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { ModuleCard } from '../components/ui/ModuleCard';
import { useLocation, useNavigate } from 'react-router-dom';
import { moduleData } from '../data/moduleData';
import { sidebarMenu } from '../data/sidebarMenu';
import { useAuth } from '../context/AuthContext';
import { buildAllowedRouteSet, buildAllowedRouteSetFromPagePaths, canAccessRoute } from '../utils/routePermissions';
import { useMyPermissions } from '../hooks/queries/useRoles';
import { useAttendanceGate, isPathAllowedBeforeCheckin } from '../hooks/useAttendanceGate';
import { SearchInput } from '../components/ui/SearchInput';
import { matchesSearch } from '../lib/str-utils';

const ModulePage: React.FC = () => {
  const { user } = useAuth();
  const { data: myPermissionsData, isSuccess: permissionsReady } = useMyPermissions(!!user);
  const { mustCheckIn } = useAttendanceGate();
  const [activeTab, setActiveTab] = useState<'tat-ca' | 'danh-dau'>('tat-ca');
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const data = moduleData[location.pathname] || [];
  const currentItem = sidebarMenu.find(item => item.path === location.pathname);
  const allowedPaths = permissionsReady
    ? buildAllowedRouteSetFromPagePaths(myPermissionsData?.page_paths)
    : buildAllowedRouteSet(user?.role);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full pb-24 sm:pb-4">
      {/* Mobile Header (Hidden as requested) */}
      <div className="hidden">
        <button onClick={() => navigate('/')} className="p-2 -ml-2 text-muted-foreground hover:bg-accent rounded-lg flex items-center justify-center bg-card border border-border shadow-sm">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-foreground">
          {currentItem?.label}
        </h1>
      </div>

      {/* Filter Bar */}
      <div className="bg-card sm:rounded-xl shadow-sm border-y border-border sm:border py-1.5 px-4 sm:p-2 flex flex-row items-center gap-1.5 sm:gap-3 mb-4 sm:mb-6 relative z-10 w-[calc(100%+2rem)] -ml-4 sm:w-full sm:ml-0 overflow-hidden">
        {/* Quay lại button */}
        <button 
          onClick={() => navigate('/')}
          className="flex items-center justify-center sm:gap-1.5 w-9 sm:w-auto px-0 sm:px-3 h-9 sm:h-10 rounded-lg border border-border hover:bg-muted text-muted-foreground text-[13px] font-medium transition-colors bg-card shadow-sm shrink-0"
          title="Quay lại"
        >
          <ChevronLeft size={18} className="sm:-ml-1" />
          <span className="hidden sm:inline">Quay lại</span>
        </button>

        {/* Tabs */}
        <div className="flex bg-muted rounded-lg p-0.5 sm:p-1 h-9 sm:h-10 shrink-0">
          <button
            onClick={() => setActiveTab('tat-ca')}
            className={clsx(
              "px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-md text-[12px] sm:text-[13px] font-bold transition-all duration-200 whitespace-nowrap",
              activeTab === 'tat-ca'
                ? "bg-card text-primary shadow-sm ring-1 ring-black/5"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Tất cả
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
        </div>

        {/* Search Input */}
        <div className="flex-1 min-w-0 h-9 sm:h-10">
          <SearchInput
            placeholder="Tìm module..."
            onSearch={(raw) => setSearchQuery(raw)}
            className="h-full border-none bg-transparent"
          />
        </div>
      </div>

      {/* Content Area */}
      {activeTab === 'danh-dau' ? (
        <div className="text-center py-16 text-muted-foreground bg-card/50 rounded-2xl border border-border mt-4">
          Chưa có module nào được đánh dấu.
        </div>
      ) : data.length > 0 ? (
        <div className="space-y-8">
          {data.map((section, idx) => {
            // Filter items by effective permission + search query.
            const filteredItems = section.items.filter(item => {
              if (mustCheckIn && !isPathAllowedBeforeCheckin(item.path || '')) {
                return false;
              }

              if (!canAccessRoute(item.path, user?.role, allowedPaths)) {
                return false;
              }

              return matchesSearch(item.title, searchQuery) || 
                     matchesSearch(item.description || '', searchQuery);
            });

            if (filteredItems.length === 0) return null;

            return (
              <div key={idx} className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
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
          
          {searchQuery && !data.some(s => s.items.some(i => matchesSearch(i.title, searchQuery) || matchesSearch(i.description || '', searchQuery))) && (
            <div className="text-center py-16 text-muted-foreground bg-card/50 rounded-2xl border border-border">
              Không tìm thấy kết quả phù hợp cho "{searchQuery}"
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground bg-card/50 rounded-2xl border border-border border-dashed mt-4">
          Module này đang được phát triển...
        </div>
      )}
    </div>
  );
};

export default ModulePage;
