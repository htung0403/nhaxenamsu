import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { MapPin, Truck } from 'lucide-react';

export function RouteSection() {
  const lineRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lineRef.current || !dotRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        gsap.fromTo(lineRef.current, { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: 'power3.out' });
        gsap.to(dotRef.current, { left: '82%', duration: 3.6, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        observer.disconnect();
      },
      { threshold: 0.35 },
    );

    observer.observe(lineRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="route" className="bg-white px-4 py-24 md:py-32">
      <div className="mx-auto max-w-7xl rounded-[3rem] bg-[#F5F7FA] p-6 md:p-12">
        <motion.div className="mb-12 max-w-3xl" initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.7 }}>
          <span className="rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-black text-[#E11D2E]">Tuyến đường</span>
          <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] text-[#071A3D] md:text-6xl">Tuyến vận chuyển cố định</h2>
          <p className="mt-5 text-lg leading-8 text-slate-600 md:text-xl">Tập trung vào một tuyến chính để tối ưu tốc độ, chi phí và sự ổn định cho khách gửi hàng.</p>
        </motion.div>

        <div className="relative mx-auto max-w-5xl py-10 md:py-16">
          <div className="relative flex items-center justify-between gap-4">
            <div className="absolute left-[18%] right-[18%] top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-200" />
            <div ref={lineRef} className="absolute left-[18%] right-[18%] top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#E11D2E] via-[#071A3D] to-[#22C55E] origin-left" />
            <div ref={dotRef} className="absolute left-[18%] top-1/2 z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E11D2E] shadow-[0_0_34px_rgba(225,29,46,0.9)] ring-4 ring-white" />
            {['Đức Trọng, Lâm Đồng', 'TP.HCM'].map((place) => (
              <div key={place} className="relative z-20 flex-1 rounded-[2rem] border border-slate-200 bg-white p-4 text-center shadow-xl shadow-slate-950/[0.05] md:p-7">
                <MapPin className="mx-auto mb-3 h-9 w-9 text-[#E11D2E]" />
                <strong className="text-base font-black text-[#071A3D] md:text-2xl">{place}</strong>
              </div>
            ))}
          </div>
          <motion.div className="mx-auto mt-12 flex w-fit items-center gap-3 rounded-full bg-white px-6 py-4 font-black text-[#071A3D] shadow-xl" animate={{ y: [0, -8, 0] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}>
            <Truck className="h-6 w-6 text-[#E11D2E]" />
            Hai chiều mỗi ngày
          </motion.div>
        </div>
      </div>
    </section>
  );
}
