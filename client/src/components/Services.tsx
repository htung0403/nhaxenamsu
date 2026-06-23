import { motion, type Variants } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { services } from '../data/services';

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

export function Services() {
  return (
    <section id="services" className="bg-white px-4 py-28 md:py-40">
      <div className="mx-auto max-w-7xl">
        <motion.div className="mb-14 max-w-4xl" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={item}>
          <span className="rounded-full border border-[#E11D2E]/15 bg-red-50 px-4 py-2 text-sm font-black text-[#E11D2E]">Dịch vụ</span>
          <h2 className="font-headline mt-5 text-4xl font-black tracking-[-0.045em] text-[#071A3D] md:text-6xl">Dịch vụ vận chuyển</h2>
          <p className="text-pretty mt-5 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">Nhận vận chuyển đa dạng hàng hóa trên tuyến Đức Trọng ↔ TP.HCM.</p>
        </motion.div>

        <motion.div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={container}>
          {services.map(({ title, description, icon: Icon }) => (
            <motion.article key={title} variants={item} whileHover={{ y: -8 }} className="cargo-card group rounded-[2rem] border border-slate-200/80 bg-white p-6 transition hover:-translate-y-1 hover:border-[#E11D2E]/20 hover:shadow-2xl hover:shadow-red-950/[0.08]">
              <div className="mb-8 grid h-14 w-14 place-items-center rounded-2xl bg-[#071A3D] text-white transition duration-300 group-hover:-translate-y-1 group-hover:bg-[#E11D2E]">
                <Icon className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-black tracking-tight text-[#071A3D]">{title}</h3>
              <p className="mt-4 leading-7 text-slate-600">{description}</p>
              <ArrowRight className="mt-8 h-5 w-5 text-[#E11D2E] transition group-hover:translate-x-1" />
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
