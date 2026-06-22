import { motion } from 'framer-motion';
import { LogIn, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { navItems } from '../data/site';
import logoUrl from '../assets/logo-remove-bg.png';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

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

  return (
    <motion.header
      className="fixed left-0 right-0 top-0 z-50 px-4 pt-4"
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: hidden ? -96 : 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-white/70 bg-white/85 px-4 py-3 shadow-2xl shadow-slate-950/[0.06] backdrop-blur-2xl md:px-6">
        <a href="#home" onClick={handleAnchorClick('#home')} className="flex items-center gap-3" aria-label="Về trang chủ Nhà xe Năm Sự">
          <img src={logoUrl} alt="Logo Nhà xe Năm Sự" className="h-12 w-12 rounded-full object-cover ring-4 ring-red-50" />
          <span className="leading-tight">
            <span className="block font-black tracking-tight text-[#071A3D]">Nhà xe Năm Sự</span>
            <span className="hidden text-xs font-bold text-slate-500 sm:block">Đức Trọng ↔ TP.HCM</span>
          </span>
        </a>

        <div className="hidden items-center gap-8 lg:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} onClick={handleAnchorClick(item.href)} className="group relative text-sm font-bold text-slate-600 transition hover:text-[#E11D2E]">
              {item.label}
              <span className="absolute -bottom-2 left-0 h-0.5 w-0 rounded-full bg-[#E11D2E] transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <motion.a
            href="/login"
            aria-label="Đăng nhập hệ thống Nhà xe Năm Sự"
            className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-[#071A3D] shadow-lg shadow-slate-950/[0.04] transition hover:border-[#071A3D] hover:bg-slate-50 md:inline-flex"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.98 }}
          >
            <LogIn className="h-4 w-4" />
            Đăng nhập
          </motion.a>

          <button type="button" onClick={() => setIsOpen((value) => !value)} className="rounded-full border border-slate-200 p-3 text-slate-800 lg:hidden" aria-label="Mở menu điều hướng">
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {isOpen ? (
        <motion.div className="mx-auto mt-3 grid max-w-7xl gap-2 rounded-[2rem] border border-white/70 bg-white/95 p-4 shadow-xl backdrop-blur-2xl lg:hidden" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          {navItems.map((item) => (
            <a key={item.href} href={item.href} onClick={handleAnchorClick(item.href)} className="rounded-2xl px-4 py-3 font-bold text-slate-700 hover:bg-slate-100">
              {item.label}
            </a>
          ))}
          <a href="/login" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold text-[#071A3D] hover:bg-slate-100">
            Đăng nhập
          </a>
        </motion.div>
      ) : null}
    </motion.header>
  );
}





