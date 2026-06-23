import { motion } from 'framer-motion';
import { customerCategories } from '../data/site';

export function CustomerMarquee() {
  const marqueeItems = [...customerCategories, ...customerCategories, ...customerCategories];
  const trustStats = [
    { value: '1000+', label: 'Chuyến xe mỗi năm' },
    { value: '500+', label: 'Khách hàng thân thiết' },
    { value: '365', label: 'Ngày hoạt động' },
    { value: '24/7', label: 'Hỗ trợ khách hàng' },
  ];

  return (
    <section className="overflow-hidden border-y border-slate-200 bg-[#f8f9fa] py-20 md:py-28">
      <div className="mx-auto mb-10 max-w-7xl px-4">
        <span className="rounded-full border border-[#e63946]/15 bg-[#e63946]/10 px-4 py-2 text-sm font-black text-[#e63946]">Niềm tin địa phương</span>
        <h2 className="font-headline mt-5 text-4xl font-black tracking-[-0.045em] text-[#071A3D] md:text-6xl">Khách hàng tin tưởng</h2>
        <p className="text-pretty mt-4 max-w-2xl text-lg leading-8 text-slate-600">Đồng hành cùng cửa hàng, hộ kinh doanh và người gửi hàng trên tuyến Đức Trọng ↔ TP.HCM.</p>

        <div className="mt-10 grid grid-cols-2 gap-y-8 rounded-[2rem] border border-slate-200/80 bg-white/70 px-5 py-7 shadow-[0_20px_70px_rgba(26,47,94,0.07)] backdrop-blur-sm md:grid-cols-4 md:px-8 md:py-8">
          {trustStats.map(({ value, label }, index) => (
            <div key={label} className={`px-2 md:px-8 ${index > 0 ? 'md:border-l md:border-slate-200' : ''} ${index % 2 === 1 ? 'border-l border-slate-200 md:border-l' : ''}`}>
              <div className="text-4xl font-black tracking-[-0.04em] text-[#1a2f5e] md:text-5xl">{value}</div>
              <div className="mt-2 text-sm font-semibold leading-6 text-slate-500 md:text-base">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <motion.div className="flex min-w-max gap-4" animate={{ x: ['0%', '-33.333%'] }} transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}>
          {marqueeItems.map(({ name, icon: Icon }, index) => (
            <div key={`${name}-${index}`} className="cargo-card flex min-w-64 items-center gap-4 rounded-full border border-[#1a2f5e]/15 bg-white/95 px-6 py-4 shadow-[0_12px_34px_rgba(26,47,94,0.06)] transition duration-300 hover:-translate-y-0.5 hover:border-[#1a2f5e]/30 hover:shadow-[0_16px_42px_rgba(26,47,94,0.1)]">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-red-50 text-[#E11D2E]"><Icon className="h-5 w-5" /></span>
              <span className="font-black text-[#071A3D]">{name}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
