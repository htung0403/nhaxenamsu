import { motion, type Variants } from 'framer-motion';
import { MessageCircle, Phone, Truck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { phoneHref, zaloHref } from '../data/site';
import logoUrl from '../assets/logo-remove-bg.png';

const heroStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 34 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
};

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
    <section id="home" className="relative min-h-screen overflow-hidden bg-white px-4 pb-20 pt-36 md:pt-40">
      <motion.div className="absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[#E11D2E]/10 blur-3xl" animate={{ scale: [1, 1.15, 1], opacity: [0.55, 0.8, 0.55] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }} />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(7,26,61,0.04),transparent_42%,rgba(225,29,46,0.06))]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
        <motion.div initial="hidden" animate="visible" variants={heroStagger}>
          <motion.span variants={heroItem} className="inline-flex rounded-full border border-red-100 bg-red-50 px-5 py-2 text-sm font-black text-[#E11D2E]">
            Tuyến cố định mỗi ngày
          </motion.span>
          <motion.div variants={heroItem} className="mt-7">
            <img
              src={logoUrl}
              alt="Nhà xe Năm Sự"
              className="h-auto w-full max-w-[520px] object-contain md:max-w-[680px]"
            />
          </motion.div>
          <motion.h2 variants={heroItem} className="mt-4 text-4xl font-black tracking-[-0.04em] text-[#E11D2E] md:text-6xl">
            Đức Trọng ↔ TP.HCM
          </motion.h2>
          <motion.p variants={heroItem} className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl md:leading-9">
            Nhận hàng tạp hóa, hàng lẻ, hàng ghép, hàng cồng kềnh. Cam kết uy tín – đúng giờ – tận tâm.
          </motion.p>
          <motion.div variants={heroItem} className="mt-9 flex flex-col gap-4 sm:flex-row">
            <motion.a href={phoneHref} aria-label="Gọi ngay Nhà xe Năm Sự" className="inline-flex items-center justify-center gap-3 rounded-full bg-[#E11D2E] px-8 py-4 font-black text-white shadow-xl shadow-red-600/25 transition hover:bg-red-700" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
              <Phone className="h-5 w-5" /> Gọi ngay
            </motion.a>
            <motion.a href={zaloHref} aria-label="Nhắn Zalo báo giá Nhà xe Năm Sự" className="inline-flex items-center justify-center gap-3 rounded-full border border-slate-200 bg-white px-8 py-4 font-black text-[#071A3D] shadow-xl shadow-slate-950/[0.05] transition hover:border-[#071A3D]" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
              <MessageCircle className="h-5 w-5" /> Nhắn Zalo báo giá
            </motion.a>
          </motion.div>
          <motion.div variants={heroItem} className="mt-7 grid gap-3 sm:grid-cols-3">
            {['Nhận hàng mỗi ngày', 'Giao nhận linh hoạt', 'Hỗ trợ bốc xếp'].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-black text-[#071A3D] shadow-lg shadow-slate-950/[0.04] backdrop-blur">
                {item}
              </div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div className="relative" initial={{ opacity: 0, y: 34 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.35 }}>
          <div className="absolute inset-0 rounded-[3rem] bg-gradient-to-br from-red-500/10 to-blue-900/10 blur-2xl" />
          <div className="relative overflow-hidden rounded-[3rem] border border-white/80 bg-white/75 p-5 shadow-2xl shadow-slate-950/[0.08] backdrop-blur-xl md:p-8">
            <div className="flex items-center justify-between gap-4">
              {['Đức Trọng, Lâm Đồng', 'TP.HCM'].map((place) => (
                <div key={place} className="relative z-20 min-w-0 flex-1 rounded-[2rem] border border-slate-200 bg-white p-4 text-center shadow-xl shadow-slate-950/[0.05] md:p-6">
                  <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-[#071A3D] text-white ring-8 ring-blue-50">●</span>
                  <strong className="text-sm font-black leading-tight text-[#071A3D] sm:text-base md:text-xl">{place}</strong>
                </div>
              ))}
            </div>

            <div className="relative mx-auto my-10 h-20 max-w-xl">
              <div className="absolute left-[18%] right-[18%] top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-200" />
              <div ref={routeRef} className="absolute left-[18%] right-[18%] top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#E11D2E] via-[#071A3D] to-[#22C55E] origin-left" />
              <div ref={dotRef} className="absolute left-[18%] top-1/2 z-20 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#071A3D] shadow-[0_14px_35px_rgba(7,26,61,0.2)] ring-4 ring-white">
                <Truck className="h-6 w-6" />
              </div>
            </div>

            <img src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1400&q=88" alt="Xe tải vận chuyển hàng hóa Nhà xe Năm Sự" className="h-64 w-full rounded-[2rem] object-cover md:h-80" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}






