import { motion, type Variants } from 'framer-motion';
import { Clock3, Handshake, MapPin, MessageCircle, PackageCheck, Phone, Search, Truck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { phoneHref, zaloHref } from '../data/site';

const heroStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 34 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
};

const trustBadges = [
  { label: 'Nhận hàng mỗi ngày', icon: Clock3 },
  { label: 'Giao nhận linh hoạt', icon: Handshake },
  { label: 'Hỗ trợ bốc xếp', icon: PackageCheck },
];

export function Hero() {
  const routeRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!routeRef.current || !dotRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(routeRef.current, { scaleX: 0 }, { scaleX: 1, duration: 1.35, ease: 'power3.out', delay: 0.6 });
      gsap.to(dotRef.current, { left: '82%', duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    });

    return () => ctx.revert();
  }, []);

  return (
    <section id="home" className="relative min-h-[100svh] overflow-hidden bg-[#0a1432] px-4 pb-14 pt-24 text-white md:pb-20 md:pt-28">
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=2200&q=88')] bg-cover bg-center bg-no-repeat" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,20,50,0.75),rgba(10,20,50,0.5))]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0a1432] to-transparent" />

      <motion.div className="relative mx-auto flex min-h-[calc(100svh-7rem)] max-w-7xl items-center" initial="hidden" animate="visible" variants={heroStagger}>
        <div className="w-full max-w-5xl py-8 md:py-10">
          <motion.span variants={heroItem} className="inline-flex rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-black text-white shadow-2xl shadow-black/15 backdrop-blur-md">
            Tuyến cố định mỗi ngày
          </motion.span>

          <motion.h2 variants={heroItem} className="font-headline mt-6 max-w-5xl text-5xl font-black leading-[0.95] tracking-[-0.055em] text-white drop-shadow-2xl sm:text-6xl md:text-8xl">
            Đức Trọng ↔ TP.HCM
          </motion.h2>

          <motion.p variants={heroItem} className="text-pretty mt-6 max-w-2xl text-lg font-semibold leading-8 text-white/85 drop-shadow md:text-2xl md:leading-10">
            Nhận hàng tạp hóa, hàng lẻ, hàng ghép, hàng cồng kềnh. Cam kết uy tín – đúng giờ – tận tâm.
          </motion.p>

          <motion.div variants={heroItem} className="mt-8 max-w-4xl rounded-[2rem] border border-white/18 bg-white/12 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl md:rounded-full md:p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-center">
              <div className="flex min-w-0 items-center gap-3 rounded-[1.5rem] bg-white px-4 py-4 text-[#1a2f5e] shadow-xl shadow-black/10 md:rounded-full md:px-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#1a2f5e] text-white">
                  <MapPin className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-black uppercase tracking-[0.18em] text-[#e63946]">Nhận hàng</span>
                  <strong className="block truncate text-base font-black md:text-lg">Đức Trọng, Lâm Đồng</strong>
                </span>
              </div>

              <div className="relative hidden h-2 w-24 rounded-full bg-white/20 md:block">
                <div ref={routeRef} className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-white via-white/80 to-white" />
                <div ref={dotRef} className="route-pulse absolute left-[18%] top-1/2 z-10 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#1a2f5e] ring-4 ring-white/30">
                  <Truck className="h-5 w-5" />
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-3 rounded-[1.5rem] bg-white px-4 py-4 text-[#1a2f5e] shadow-xl shadow-black/10 md:rounded-full md:px-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e63946] text-white">
                  <MapPin className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-black uppercase tracking-[0.18em] text-[#e63946]">Giao hàng</span>
                  <strong className="block truncate text-base font-black md:text-lg">TP.HCM</strong>
                </span>
              </div>

              <div className="flex items-center justify-center gap-2 rounded-[1.5rem] bg-[#1a2f5e] px-5 py-4 text-base font-black text-white shadow-2xl shadow-blue-950/35 md:rounded-full md:px-7">
                <Search className="h-5 w-5" />
                Tuyến vận chuyển
              </div>
            </div>
          </motion.div>

          <motion.div variants={heroItem} className="mt-7 flex flex-col gap-4 sm:flex-row">
            <motion.a href={phoneHref} aria-label="Gọi ngay Nhà xe Năm Sự" className="inline-flex items-center justify-center gap-3 rounded-full bg-[#e63946] px-9 py-5 text-lg font-black text-white shadow-2xl shadow-red-950/40 ring-1 ring-white/20 transition hover:bg-red-600" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
              <Phone className="h-6 w-6" /> Gọi ngay
            </motion.a>
            <motion.a href={zaloHref} aria-label="Nhắn Zalo báo giá Nhà xe Năm Sự" className="inline-flex items-center justify-center gap-3 rounded-full border border-white/25 bg-white px-9 py-5 text-lg font-black text-[#1a2f5e] shadow-2xl shadow-black/20 transition hover:bg-[#1a2f5e] hover:text-white" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
              <MessageCircle className="h-6 w-6" /> Nhắn Zalo báo giá
            </motion.a>
          </motion.div>

          <motion.div variants={heroItem} className="mt-7 grid gap-3 sm:grid-cols-3">
            {trustBadges.map(({ label, icon: Icon }) => (
              <div key={label} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-center text-sm font-black text-white shadow-xl shadow-black/15 backdrop-blur-md">
                <Icon className="h-4 w-4 shrink-0 text-white" />
                {label}
              </div>
            ))}
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
