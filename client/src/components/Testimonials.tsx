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

const initialsByAuthor: Record<string, string> = {
  'Anh Nam': 'AN',
  'Chị Hương': 'CH',
  'Anh Phúc': 'AP',
};

export function Testimonials() {
  return (
    <section className="bg-gray-50 px-4 pb-20 pt-10 md:pb-28 md:pt-14">
      <div className="mx-auto max-w-7xl">
        <motion.div className="mx-auto mb-14 max-w-5xl text-center" initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.7 }}>
          <span className="rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-black text-[#E11D2E]">Đánh giá</span>
          <h2 className="font-headline mt-5 text-4xl font-black tracking-[-0.045em] text-[#071A3D] md:text-6xl">Khách hàng nói gì về Nhà xe Năm Sự</h2>
        </motion.div>

        <motion.div className="grid gap-5 lg:grid-cols-3" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={container}>
          {testimonials.map((item) => (
            <motion.article key={item.quote} variants={card} className="cargo-card relative flex flex-col justify-between rounded-[2rem] border border-gray-100 bg-white p-7 shadow-lg transition hover:border-[#E11D2E]/20 hover:shadow-2xl hover:shadow-red-950/[0.08]">
              <span className="pointer-events-none absolute left-4 top-4 font-headline text-6xl font-black leading-none text-red-500/20">&quot;</span>
              <p className="relative font-headline text-2xl font-black leading-snug tracking-tight text-[#071A3D]">{item.quote}</p>
              <div className="mt-5 flex text-sm text-amber-400">
                {Array.from({ length: 5 }).map((_, index) => (
                  <motion.span key={index} initial={{ scale: 0.8 }} whileInView={{ scale: 1 }} transition={{ delay: index * 0.05 }} viewport={{ once: true }}>
                    <Star className="h-4 w-4 fill-current" />
                  </motion.span>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0f1f3d] text-sm font-black text-white">{initialsByAuthor[item.author]}</span>
                <div>
                  <p className="font-black leading-tight text-[#071A3D]">{item.author}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-500">{item.location}</p>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}