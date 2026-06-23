import { motion, type Variants } from 'framer-motion';
import { ArrowRight, Boxes, MapPin, PackageCheck, Route, Truck, Warehouse } from 'lucide-react';
import { services } from '../data/services';

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

const serviceIcons = [Truck, Route, Warehouse, Boxes, PackageCheck, MapPin];

export function Services() {
  const featuredServices = services.slice(0, 2);
  const supportingServices = services.slice(2);

  return (
    <section id="services" className="bg-[#f8f9fa] px-4 py-28 md:py-40">
      <div className="mx-auto max-w-7xl">
        <motion.div className="mb-14 max-w-4xl" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={item}>
          <span className="rounded-full border border-[#e63946]/25 bg-[#e63946] px-4 py-2 text-sm font-black text-white shadow-lg shadow-red-950/10">Dịch vụ</span>
          <h2 className="font-headline mt-5 text-4xl font-black tracking-[-0.045em] text-[#1a2f5e] md:text-6xl">Dịch vụ vận chuyển</h2>
          <p className="text-pretty mt-5 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">Nhận vận chuyển đa dạng hàng hóa trên tuyến Đức Trọng ↔ TP.HCM.</p>
        </motion.div>

        <motion.div className="grid gap-5 lg:grid-cols-2" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={container}>
          {featuredServices.map(({ title, description }, index) => {
            const Icon = serviceIcons[index];
            const featuredClassName = index === 0
              ? 'from-[#1a2f5e] via-[#18366f] to-[#0a1432] shadow-blue-950/20'
              : 'from-[#c0392b] via-[#d7333f] to-[#e63946] shadow-red-950/25';

            return (
              <motion.article key={title} variants={item} whileHover={{ y: -8 }} className={`group relative overflow-hidden rounded-[2.25rem] bg-gradient-to-br ${featuredClassName} p-7 text-white shadow-2xl transition md:p-9`}>
                <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/10 blur-2xl transition group-hover:scale-125" />
                <div className="relative flex h-full min-h-72 flex-col justify-between gap-10">
                  <div>
                    <div className="mb-8 flex items-center justify-between gap-4">
                      <span className="grid h-16 w-16 place-items-center rounded-2xl border border-white/20 bg-white/12 text-white shadow-xl shadow-black/10 backdrop-blur">
                        <Icon className="h-8 w-8" />
                      </span>
                      <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white backdrop-blur">Tuyến chính</span>
                    </div>
                    <h3 className="font-headline max-w-xl text-3xl font-black leading-tight tracking-[-0.035em] text-white md:text-4xl">{title}</h3>
                    <p className="text-pretty mt-5 max-w-xl text-lg font-semibold leading-8 text-white/78">{description}</p>
                  </div>

                  <div className="inline-flex w-fit items-center gap-3 rounded-full bg-white px-5 py-3 font-black text-[#1a2f5e] shadow-xl shadow-black/15 transition group-hover:translate-x-1">
                    Xem chi tiết
                    <ArrowRight className="h-5 w-5" />
                  </div>
                </div>
              </motion.article>
            );
          })}
        </motion.div>

        <motion.div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={container}>
          {supportingServices.map(({ title, description }, index) => {
            const Icon = serviceIcons[index + 2];

            return (
              <motion.article key={title} variants={item} whileHover={{ y: -8 }} className="cargo-card group flex min-h-64 cursor-pointer flex-col rounded-[2rem] border border-slate-200/80 bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[#1a2f5e]/30 hover:shadow-lg">
                <div className="mb-7 grid h-14 w-14 place-items-center rounded-2xl bg-[#1a2f5e] text-white transition duration-300 group-hover:-translate-y-1 group-hover:bg-[#e63946]">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="text-2xl font-black tracking-tight text-[#1a2f5e]">{title}</h3>
                <p className="mt-4 flex-1 leading-7 text-slate-600">{description}</p>
                <div className="mt-8 inline-flex w-fit items-center gap-2 rounded-full border border-[#1a2f5e]/10 px-4 py-2 text-sm font-black text-[#1a2f5e] transition group-hover:border-[#e63946]/20 group-hover:bg-red-50 group-hover:text-[#e63946]">
                  Xem chi tiết
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
