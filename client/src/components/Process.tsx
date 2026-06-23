import { motion, type Variants } from 'framer-motion';
import { processSteps } from '../data/services';

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const card: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

export function Process() {
  return (
    <section id="process" className="bg-white px-4 py-28 md:py-40">
      <div className="mx-auto max-w-7xl">
        <motion.div className="mb-12 max-w-3xl" initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.7 }}>
          <span className="rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-black text-[#E11D2E]">Quy trình</span>
          <h2 className="font-headline mt-5 text-4xl font-black tracking-[-0.045em] text-[#071A3D] md:text-6xl">Quy trình vận chuyển đơn giản</h2>
          <p className="text-pretty mt-5 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">Bốn bước rõ ràng giúp khách gửi hàng dễ theo dõi và yên tâm hơn.</p>
        </motion.div>

        <motion.div className="relative grid gap-5 md:grid-cols-4" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={container}>
          <motion.div className="absolute left-[12%] right-[12%] top-16 hidden h-0.5 bg-gradient-to-r from-[#E11D2E] via-[#071A3D] to-[#22C55E] md:block" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.1, ease: 'easeOut' }} style={{ transformOrigin: 'left' }} />
          {processSteps.map(({ title, description, icon: Icon }, index) => (
            <motion.article key={title} variants={card} className="cargo-card relative flex items-start gap-4 rounded-[2rem] border border-slate-200/80 bg-white p-5 md:block md:p-6">
              <div className="flex shrink-0 self-center md:mb-8 md:self-auto">
                <motion.span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#071A3D] text-white md:h-16 md:w-16" whileHover={{ y: -5 }}>
                  <Icon className="h-6 w-6 md:h-7 md:w-7" />
                </motion.span>
                <span className="absolute right-5 top-5 text-4xl font-black text-slate-100 md:static md:text-5xl">0{index + 1}</span>
              </div>
              <div className="min-w-0 flex-1 pr-10 md:pr-0">
                <h3 className="text-xl font-black leading-tight text-[#071A3D] md:text-2xl">{title}</h3>
                <p className="mt-2 leading-7 text-slate-600 md:mt-4">{description}</p>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}



