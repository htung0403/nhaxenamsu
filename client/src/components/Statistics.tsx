import { useEffect, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { gsap } from 'gsap';
import { stats } from '../data/stats';

function Counter({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || !ref.current) return;
        const counter = { value: 0 };
        gsap.to(counter, {
          value,
          duration: 2,
          ease: 'power3.out',
          onUpdate: () => {
            if (ref.current) ref.current.textContent = `${Math.floor(counter.value)}${suffix}`;
          },
        });
        observer.disconnect();
      },
      { threshold: 0.35 },
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [suffix, value]);

  return <span ref={ref}>0{suffix}</span>;
}

export function Statistics() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  const imageY = useTransform(scrollYProgress, [0, 1], ['-12%', '12%']);

  return (
    <section ref={sectionRef} className="relative overflow-hidden px-4 py-24 md:py-36">
      <motion.img style={{ y: imageY }} src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1800&q=88" alt="Hoạt động kho vận và vận chuyển hàng hóa" className="absolute inset-0 h-[120%] w-full object-cover" />
      <div className="absolute inset-0 bg-[#071A3D]/85" />
      <div className="relative mx-auto max-w-7xl">
        <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-red-100">Năng lực vận hành</span>
        <h2 className="mt-5 max-w-3xl text-4xl font-black tracking-[-0.04em] text-white md:text-6xl">Đều đặn, rõ ràng và đáng tin cậy</h2>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">Nhà xe Năm Sự phục vụ nhu cầu vận chuyển hằng ngày cho cửa hàng, gia đình và người gửi hàng địa phương.</p>
        <div className="mt-10 grid grid-cols-2 gap-3 md:mt-12 md:grid-cols-4 md:gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-[1.5rem] border border-white/10 bg-white/10 p-4 text-white backdrop-blur-md md:rounded-[2rem] md:p-6">
              <div className="text-4xl font-black tracking-tight sm:text-5xl md:text-6xl"><Counter value={stat.value} suffix={stat.suffix} /></div>
              <p className="mt-3 text-sm font-bold leading-snug text-slate-300 sm:text-base md:mt-4">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

