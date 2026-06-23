import { motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, LayoutDashboard, LogIn, LogOut, Menu, User, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { navItems } from '../data/site';
import logoUrl from '../assets/logo-remove-bg.png';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, isLoading, logout, user } = useAuth();

  const handleAnchorClick = (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const target = document.querySelector<HTMLElement>(href);
    if (!target) return;

    setIsOpen(false);
    window.history.pushState(null, '', href);
    window.scrollTo({
      top: target.offsetTop - 92,
      behavior: 'smooth',
    });
  };
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY;
      setHidden(currentY > lastY.current && currentY > 120);
      lastY.current = currentY;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <motion.header
      className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-[#0a1432]/35 px-4 backdrop-blur-xl"
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: hidden ? -96 : 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-0 py-3 md:px-0">
        <a href="#home" onClick={handleAnchorClick('#home')} className="flex items-center gap-3" aria-label="Về trang chủ Nhà xe Năm Sự">
          <img src={logoUrl} alt="Logo Nhà xe Năm Sự" className="h-12 w-12 rounded-full bg-white object-contain p-1 ring-4 ring-red-50" />
          <span className="leading-tight">
            <span className="font-headline block font-black tracking-tight text-white">Nhà xe Năm Sự</span>
            <span className="hidden text-xs font-bold text-white/70 sm:block">Đức Trọng ↔ TP.HCM</span>
          </span>
        </a>

        <div className="hidden items-center gap-8 lg:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} onClick={handleAnchorClick(item.href)} className="group relative text-sm font-bold text-white/78 transition hover:text-white">
              {item.label}
              <span className="absolute -bottom-2 left-0 h-0.5 w-0 rounded-full bg-[#E11D2E] transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {!isLoading && isAuthenticated ? (
            <div
              ref={userMenuRef}
              className="relative hidden md:block"
              onMouseEnter={() => setShowUserMenu(true)}
              onMouseLeave={() => setShowUserMenu(false)}
              onFocus={() => setShowUserMenu(true)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setShowUserMenu(false);
                }
              }}
            >
              <motion.button
                type="button"
                aria-label="Mở menu tài khoản"
                aria-expanded={showUserMenu}
                onClick={() => setShowUserMenu((value) => !value)}
                className="group inline-flex items-center gap-3 rounded-full border border-emerald-300/40 bg-emerald-400/15 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-black/10 backdrop-blur transition hover:bg-white hover:text-[#1a2f5e]"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-200/30 transition group-hover:text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span className="flex flex-col text-left leading-tight">
                  <span className="max-w-32 truncate">{user?.full_name || 'Quản trị viên'}</span>
                  <span className="text-[11px] font-bold text-white/70 group-hover:text-[#1a2f5e]/70">
                    Quản trị viên
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
              </motion.button>

              {showUserMenu ? (
                <motion.div
                  className="absolute right-0 top-full w-56 pt-3"
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  <div className="overflow-hidden rounded-3xl border border-white/70 bg-white p-2 text-[#071A3D] shadow-2xl shadow-black/20">
                    <div className="px-3 py-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Đang hoạt động</p>
                      <p className="truncate text-sm font-black">{user?.full_name || 'Quản trị viên'}</p>
                    </div>
                    <a href="/app" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition hover:bg-emerald-50 hover:text-emerald-700">
                      <LayoutDashboard className="h-4 w-4" />
                      Vào trang quản trị
                    </a>
                    <a href="/app/ho-so" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition hover:bg-slate-100">
                      <User className="h-4 w-4" />
                      Hồ sơ của tôi
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        setShowUserMenu(false);
                        await logout();
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-red-600 transition hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Đăng xuất
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </div>
          ) : (
            <motion.a
              href="/login"
              aria-label="Đăng nhập hệ thống Nhà xe Năm Sự"
              className="hidden items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white shadow-lg shadow-black/10 backdrop-blur transition hover:bg-white hover:text-[#1a2f5e] md:inline-flex"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.98 }}
            >
              <LogIn className="h-4 w-4" />
              Đăng nhập
            </motion.a>
          )}

          <button type="button" onClick={() => setIsOpen((value) => !value)} className="rounded-full border border-white/20 bg-white/10 p-3 text-white shadow-lg shadow-black/10 backdrop-blur lg:hidden" aria-label="Mở menu điều hướng">
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {isOpen ? (
        <motion.div className="cargo-card mx-auto mt-3 grid max-w-7xl gap-2 rounded-[2rem] border border-white/80 bg-white/95 p-4 backdrop-blur-2xl lg:hidden" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          {navItems.map((item) => (
            <a key={item.href} href={item.href} onClick={handleAnchorClick(item.href)} className="rounded-2xl px-4 py-3 font-bold text-slate-700 hover:bg-slate-100">
              {item.label}
            </a>
          ))}
          {!isLoading && isAuthenticated ? (
            <a href="/app" className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-700 hover:bg-emerald-100">
              <span>Đã đăng nhập</span>
              <LayoutDashboard className="h-4 w-4" />
            </a>
          ) : (
            <a href="/login" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold text-[#071A3D] hover:bg-slate-100">
              Đăng nhập
            </a>
          )}
        </motion.div>
      ) : null}
    </motion.header>
  );
}







