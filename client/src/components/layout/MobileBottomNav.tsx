import React, { useState, useEffect } from 'react';
import { ArrowLeft, Home, Bell, ClipboardList } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { useNotifications } from '../../context/NotificationContext';
import MobileNotificationsModal from '../shared/MobileNotificationsModal';

interface MobileBottomNavProps {
  mustCheckIn: boolean;
  isLocked: boolean;
}

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ mustCheckIn, isLocked }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount, refreshNotifications } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  const isHome = location.pathname === '/app';
  const isAttendancePage = location.pathname === '/app/hanh-chinh-nhan-su/cham-cong';

  if (isLocked) {
    return (
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900 border-t border-slate-800 z-40 px-6 flex items-center justify-center pb-safe shadow-2xl">
        <button 
          onClick={() => navigate('/app')}
          className={clsx(
            "p-3 rounded-full transition-all",
            isHome ? "bg-primary text-white" : "text-slate-400 hover:text-white"
          )}
        >
          <Home size={28} />
        </button>
      </div>
    );
  }

  if (mustCheckIn) {
    return (
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border z-40 px-6 flex items-center justify-between pb-safe">
        <button 
          onClick={() => navigate('/app')}
          className={clsx(
            "p-2 transition-colors",
            isHome ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Home size={24} />
        </button>

        <button
          onClick={() => navigate('/app/hanh-chinh-nhan-su/cham-cong')}
          className={clsx(
            "w-12 h-12 rounded-full flex items-center justify-center -translate-y-4 shadow-lg transition-transform hover:scale-105 active:scale-95",
            isAttendancePage ? "bg-primary text-white" : "bg-amber-500 text-white animate-pulse"
          )}
        >
          <ClipboardList size={24} />
        </button>

        <div className="w-10" />
      </div>
    );
  }

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border z-40 px-6 flex items-center justify-between pb-safe">
      <button 
        onClick={() => navigate(-1)}
        className="p-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={24} />
      </button>

      <button
        onClick={() => navigate('/app')}
        className={clsx(
          "w-12 h-12 rounded-full flex items-center justify-center -translate-y-4 shadow-lg transition-transform hover:scale-105 active:scale-95",
          isHome ? "bg-primary text-white" : "bg-card text-muted-foreground border border-border"
        )}
      >
        <Home size={24} />
      </button>

      <button
        onClick={() => setShowNotifications(true)}
        className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bell size={24} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-background">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <MobileNotificationsModal
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </div>
  );
};

export default MobileBottomNav;


