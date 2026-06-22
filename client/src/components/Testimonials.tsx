import { motion, type Variants } from 'framer-motion';
import { Star } from 'lucide-react';
import { testimonials } from '../data/testimonials';

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const card: Variants = {
  hidden: { opacity: 0, x: -28 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

export function Testimonials() {
  return (
    <section className="bg-white px-4 py-24 md:py-32">
      <div className="mx-auto max-w-7xl">
        <motion.div className="mb-12 max-w-4xl" initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.7 }}>
          <span className="rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-black text-[#E11D2E]">Đánh giá</span>
          <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] text-[#071A3D] md:text-6xl">Khách hàng nói gì về Nhà xe Năm Sự</h2>
        </motion.div>

        <motion.div className="grid gap-5 lg:grid-cols-3" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={container}>
          {testimonials.map((item) => (
            <motion.article key={item.quote} variants={card} className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-950/[0.04]">
              <div className="mb-6 flex text-[#E11D2E]">
                {Array.from({ length: 5 }).map((_, index) => (
                  <motion.span key={index} initial={{ scale: 0.8 }} whileInView={{ scale: 1 }} transition={{ delay: index * 0.05 }} viewport={{ once: true }}>
                    <Star className="h-5 w-5 fill-current" />
                  </motion.span>
                ))}
              </div>
              <p className="text-2xl font-black leading-snug tracking-tight text-[#071A3D]">“{item.quote}”</p>
              <p className="mt-8 border-t border-slate-100 pt-5 font-bold text-slate-500">— {item.author}, {item.location}</p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
