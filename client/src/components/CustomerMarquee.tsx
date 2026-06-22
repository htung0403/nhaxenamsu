import { motion } from 'framer-motion';
import { customerCategories } from '../data/site';

export function CustomerMarquee() {
  const marqueeItems = [...customerCategories, ...customerCategories, ...customerCategories];

  return (
    <section className="overflow-hidden border-y border-slate-200 bg-[#F5F7FA] py-16 md:py-20">
      <div className="mx-auto mb-9 max-w-7xl px-4">
        <span className="rounded-full border border-green-100 bg-green-50 px-4 py-2 text-sm font-black text-[#22C55E]">Niềm tin địa phương</span>
        <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] text-[#071A3D] md:text-6xl">Khách hàng tin tưởng</h2>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">Đồng hành cùng cửa hàng, hộ kinh doanh và người gửi hàng trên tuyến Đức Trọng ↔ TP.HCM.</p>
      </div>

      <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <motion.div className="flex min-w-max gap-4" animate={{ x: ['0%', '-33.333%'] }} transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}>
          {marqueeItems.map(({ name, icon: Icon }, index) => (
            <div key={`${name}-${index}`} className="flex min-w-64 items-center gap-4 rounded-full border border-slate-200 bg-white px-6 py-4 shadow-lg shadow-slate-950/[0.03]">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-red-50 text-[#E11D2E]"><Icon className="h-5 w-5" /></span>
              <span className="font-black text-[#071A3D]">{name}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
