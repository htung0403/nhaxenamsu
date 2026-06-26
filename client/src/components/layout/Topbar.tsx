import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell, Clock, Calendar, CheckCheck, Trash2, ChevronRight,
  Info, AlertTriangle, CheckCircle2, Home, PanelLeft,
  PanelLeftClose, User, Settings, LogOut, ChevronDown, ExternalLink
} from 'lucide-react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { sidebarMenu, extraMenuItems } from '../../data/sidebarMenu';
import { moduleData, type ModuleCardWithPath } from '../../data/moduleData';
import { clsx } from 'clsx';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useBreadcrumbs } from '../../context/BreadcrumbContext';
import axiosClient from '../../api/axiosClient';
import { cloudinaryThumb } from '../../lib/cloudinaryUrl';

interface Notification {
  id: string;
  title: string;
  description: string;
  time?: string;
  type: 'info' | 'warning' | 'success';
  is_read: boolean;
  created_at: string;
}

interface TopbarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const Topbar: React.FC<TopbarProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const [time, setTime] = useState(new Date());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const notificationDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { avatar } = useTheme();
  const { user, logout } = useAuth();
  const { dynamicLabels } = useBreadcrumbs();

  const userName = user?.full_name || 'Người dùng';
  const userRole = user?.role || 'staff';
  const roleLabels: Record<string, string> = { admin: 'Quản trị', manager: 'Quản lý', staff: 'Nhân viên', driver: 'Tài xế', customer: 'Khách hàng' };
  const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random&color=random`;
  const userAvatar = avatar || defaultAvatar;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await axiosClient.get('/notifications');
      if (res.data?.notifications) {
        setNotifications(res.data.notifications);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      const initialFetch = setTimeout(fetchNotifications, 0);
      const interval = setInterval(fetchNotifications, 60000);
      return () => {
        clearTimeout(initialFetch);
        clearInterval(interval);
      };
    }
  }, [user, fetchNotifications]);


  const unreadCount = notifications.filter(n => !n.is_read).length;
  const displayNotifications = isExpanded ? notifications : notifications.slice(0, 5);
  const hasMore = notifications.length > 5;

  // Enhanced breadcrumb logic
  const pathSegments = location.pathname.split('/').filter(Boolean);

  const getLabel = (path: string) => {
    // Check specific module items in moduleData first
    for (const mainPath in moduleData) {
      for (const section of moduleData[mainPath]) {
        const found = section.items.find((item: ModuleCardWithPath) => item.path === path);
        if (found) return found.title;
      }
    }

    // Check sidebar and extra menu items
    const menuItems = [...sidebarMenu, ...extraMenuItems, { path: '/app/ho-so', label: 'Hồ sơ cá nhân' }];
    const staticFound = menuItems.find(item => item.path === path);
    if (staticFound) return staticFound.label;

    // Check dynamic labels from context
    if (dynamicLabels[path]) return dynamicLabels[path];

    // Fallback labels for segments
    const segmentLabels: Record<string, string> = {
      'nhan-su': 'Nhân sự',
      'hanh-chinh': 'Hành chính',
      'kinh-doanh': 'Kinh doanh',
      'marketing': 'Marketing',
      'tai-chinh': 'Tài chính',
      'mua-hang': 'Mua hàng',
      'kho-van': 'Kho vận',
      'dieu-hanh': 'Điều hành',
      'he-thong': 'Hệ thống',
      'ung-vien': 'Ứng viên',
      'cai-dat': 'Cài đặt hệ thống',
      'khach-hang': 'Khách hàng',
      'ke-toan': 'Kế toán',
      'hang-hoa': 'Hàng hóa',
      'quan-ly-xe': 'Quản lý xe',
      'thu-tien-hang': 'Thu tiền hàng',
      'dang-giao': 'Đang giao',
      'chi-phi': 'Chi phí',
      'khach-hang-than-thiet': 'KH thân thiết',
      'cai-dat-he-thong': 'Cài đặt hệ thống',
      'zalo-tong-ket-tap-hoa': 'Tổng kết Zalo tạp hóa',
      'zalo-tong-ket-vua-rau': 'Tổng kết Zalo vựa rau',
      'zalo-tong-ket-nguoi-gui-rau': 'Tổng kết Zalo người gửi rau'
    };

    const segment = path.split('/').pop() || '';
    return segmentLabels[segment] || segment;
  };

  const breadcrumbs = pathSegments.map((_, index) => {
    const path = `/${pathSegments.slice(0, index + 1).join('/')}`;
    return {
      path,
      label: getLabel(path)
    };
  }).filter(crumb => crumb.path !== '/app');

  const pageTitle = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : 'Trang chủ';


  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationDropdownRef.current && !notificationDropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
        setIsExpanded(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('vi-VN', { hour12: false });
  };

  const formatDate = (date: Date) => {
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = days[date.getDay()];
    return `${dayName}, ${date.toLocaleDateString('vi-VN')}`;
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  };

  const markAllAsRead = async () => {
    try {
      await axiosClient.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const clearAll = async () => {
    try {
      for (const notification of notifications) {
        await axiosClient.delete(`/notifications/${notification.id}`);
      }
      setNotifications([]);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await axiosClient.patch(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'info': return <Info size={18} className="text-blue-500" />;
      case 'warning': return <AlertTriangle size={18} className="text-amber-500" />;
      case 'success': return <CheckCircle2 size={18} className="text-emerald-500" />;
    }
  };

  const getTypeStyles = (type: Notification['type'], isRead: boolean) => {
    if (isRead) return '';
    switch (type) {
      case 'info': return 'border-l-4 border-l-blue-500 bg-blue-500/10';
      case 'warning': return 'border-l-4 border-l-amber-500 bg-amber-500/10';
      case 'success': return 'border-l-4 border-l-emerald-500 bg-emerald-500/10';
    }
  };

  return (
    <header className="h-[55px] bg-card border-b border-border flex items-center justify-between px-4 lg:px-6 z-30 sticky top-0">
      {/* Left side: Hamburger & Title */}
      <div className="flex items-center gap-2 lg:gap-2.5">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 text-muted-foreground hover:bg-muted border border-border rounded-lg bg-card shadow-sm transition-colors shrink-0"
        >
          {sidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeft size={12} />}
        </button>

        <div className="hidden sm:flex items-center gap-2 lg:gap-2.5">
          <Link to="/app" className="text-muted-foreground hover:text-primary transition-colors">
            <Home size={14} strokeWidth={2} />
          </Link>

          <span className="text-muted-foreground/40 font-light">
            <svg width="5" height="8" viewBox="0 0 6 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 9L5 5L1 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>

          <Link to="/app" className="text-muted-foreground text-[13px] font-medium hover:text-primary transition-colors">
            Trang chủ
          </Link>

          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.path}>
              <span className="text-muted-foreground/40 font-light">
                <svg width="5" height="8" viewBox="0 0 6 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 9L5 5L1 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {idx === breadcrumbs.length - 1 ? (
                <div className="flex items-center bg-primary text-white px-1.5 py-0.5 rounded-lg text-[12px] font-bold shadow-sm ring-1 ring-primary/20">
                  {crumb.label}
                </div>
              ) : (
                <Link to={crumb.path} className="text-muted-foreground text-[13px] font-medium hover:text-primary transition-colors">
                  {crumb.label}
                </Link>
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="sm:hidden font-bold text-primary text-[15px] tracking-tight truncate">
          {pageTitle}
        </div>
      </div>

      {/* Right side: Clock, Notifications, User */}
      <div className="flex items-center gap-3 sm:gap-4">
        <Link
          to="/"
          aria-label="Xem trang giới thiệu"
          title="Xem trang giới thiệu"
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-[12px] font-semibold text-primary shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
        >
          <ExternalLink size={14} strokeWidth={2} />
          <span className="hidden lg:inline">Xem trang giới thiệu</span>
        </Link>

        {/* Clock & Date (Hidden on mobile) */}
        <div className="hidden md:flex items-center bg-card border border-border shadow-sm px-4 py-1.5 rounded-full gap-3 text-[13px]">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-primary" />
            <span className="font-bold text-foreground tabular-nums">{formatTime(time)}</span>
          </div>
          <div className="w-[1px] h-4 bg-border" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar size={16} className="text-primary" />
            <span className="font-medium whitespace-nowrap">{formatDate(time)}</span>
          </div>
        </div>

        {/* Notifications - Hidden on mobile, shown on mobile via MobileBottomNav */}
        <div className="relative hidden lg:block" ref={notificationDropdownRef}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserDropdown(false);
            }}
            className={clsx(
              "relative p-2 text-muted-foreground hover:bg-accent rounded-full transition-colors",
              showNotifications && "bg-accent text-primary"
            )}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-card">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-[350px] bg-card rounded-xl shadow-xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
              {/* Header */}
              <div className="p-3 border-b border-border flex items-center justify-between bg-card sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-primary" />
                  <h3 className="font-bold text-foreground text-[13px]">Thông báo</h3>
                  {unreadCount > 0 && (
                    <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={markAllAsRead}
                    className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md transition-colors"
                    title="Đánh dấu tất cả là đã đọc"
                  >
                    <CheckCheck size={16} />
                  </button>
                  <button
                    onClick={clearAll}
                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    title="Xóa tất cả"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className={clsx(
                "overflow-y-auto custom-scrollbar transition-all duration-300",
                isExpanded ? "max-h-[400px]" : "max-h-[350px]"
              )}>
                {notifications.length > 0 ? (
                  <div className="divide-y divide-border/50">
                    {displayNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        onClick={() => markAsRead(notification.id)}
                        className={clsx(
                          "p-3 transition-colors cursor-pointer hover:bg-muted/30 relative",
                          getTypeStyles(notification.type, notification.is_read)
                        )}
                      >
                        <div className="flex gap-2.5">
                          <div className={clsx(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            notification.type === 'info' && "bg-blue-50",
                            notification.type === 'warning' && "bg-amber-50",
                            notification.type === 'success' && "bg-emerald-50"
                          )}>
                            {getIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-0.5">
                              <h4 className={clsx(
                                "font-bold text-[13px] leading-tight transition-colors truncate",
                                notification.is_read ? "text-foreground/70" : "text-primary"
                              )}>
                                {notification.title}
                              </h4>
                              {!notification.is_read && (
                                <span className="w-1.5 h-1.5 bg-primary rounded-full shrink-0 mt-1" />
                              )}
                            </div>
                            <p className="text-[12px] text-muted-foreground leading-snug mb-0.5 line-clamp-1">
                              {notification.description}
                            </p>
                            <span className="text-[10px] text-muted-foreground/50">{formatRelativeTime(notification.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 flex flex-col items-center justify-center text-muted-foreground">
                    <Bell size={32} className="mb-2 opacity-20" />
                    <p className="text-[12px]">Không có thông báo nào</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              {hasMore && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="w-full p-2.5 text-center text-[12px] font-bold text-primary hover:bg-primary/5 border-t border-border transition-colors flex items-center justify-center gap-1"
                >
                  {isExpanded ? 'Thu gọn' : 'Xem tất cả thông báo'}
                  <ChevronRight size={14} className={clsx("transition-transform", isExpanded && "rotate-90")} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative" ref={userDropdownRef}>
          <div
            onClick={() => {
              setShowUserDropdown(!showUserDropdown);
              setShowNotifications(false);
            }}
            className={clsx(
              "flex items-center gap-3 pl-2 sm:pl-4 sm:border-l border-border cursor-pointer group transition-all duration-200",
              showUserDropdown && "opacity-80"
            )}
          >
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shadow-sm shadow-primary/5">
                <img loading="lazy" decoding="async"
                  src={cloudinaryThumb(userAvatar)}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card shadow-sm shadow-emerald-500/50"></div>
            </div>
            <div className="hidden sm:flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-[13px] font-bold leading-tight text-foreground group-hover:text-primary transition-colors">{userName}</span>
                <ChevronDown size={12} className={clsx("text-muted-foreground transition-transform duration-200", showUserDropdown && "rotate-180")} />
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight font-medium">{roleLabels[userRole] || userRole}</span>
            </div>
          </div>

          {/* User Dropdown Menu */}
          {showUserDropdown && (
            <div className="absolute right-0 mt-3 w-56 bg-card rounded-xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
              <div className="p-1.5 space-y-0.5">
                <button
                  onClick={() => {
                    navigate('/app/ho-so');
                    setShowUserDropdown(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary/70">
                    <User size={18} />
                  </div>
                  <span className="text-[13px] font-semibold">Hồ sơ cá nhân</span>
                </button>

                <button
                  onClick={() => {
                    navigate('/app/cai-dat');
                    setShowUserDropdown(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary/70">
                    <Settings size={18} />
                  </div>
                  <span className="text-[13px] font-semibold">Cài đặt hệ thống</span>
                </button>

                <div className="my-1 border-t border-border/50" />

                <button
                  onClick={async () => { setShowUserDropdown(false); await logout(); navigate('/login'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-all duration-200"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-500/5 flex items-center justify-center">
                    <LogOut size={18} />
                  </div>
                  <span className="text-[13px] font-bold">Đăng xuất</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;

