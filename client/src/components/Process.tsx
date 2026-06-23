import { motion } from 'framer-motion';
import { processSteps } from '../data/services';

export function Process() {
  return (
    <section id="process" className="bg-[#f8f9fa] px-4 py-28 md:py-40">
      <div className="mx-auto max-w-7xl">
        <motion.div className="mb-14 max-w-3xl" initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.7 }}>
          <span className="rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white shadow-[0_10px_24px_rgba(230,57,70,0.28)]">Quy trình</span>
          <h2 className="font-headline mt-5 text-4xl font-black tracking-[-0.045em] text-[#0f1f3d] md:text-6xl">Quy trình vận chuyển đơn giản</h2>
          <p className="text-pretty mt-5 max-w-2xl text-lg leading-8 text-gray-600 md:text-xl">Bốn bước rõ ràng giúp khách gửi hàng dễ theo dõi và yên tâm hơn.</p>
        </motion.div>

        <div className="relative pt-4">
          <motion.div className="absolute left-0 right-0 top-24 z-0 hidden h-0.5 bg-[#0f1f3d]/12 md:block" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.1, ease: 'easeOut' }} style={{ transformOrigin: 'left' }} />
          <motion.div className="absolute left-0 right-0 top-24 z-0 hidden h-0.5 bg-gradient-to-r from-red-500 via-[#0f1f3d]/25 to-red-500/60 md:block" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.25, ease: 'easeOut', delay: 0.1 }} style={{ transformOrigin: 'left' }} />

          <div className="relative z-10 grid gap-6 md:grid-cols-4">
            {processSteps.map(({ title, description, icon: Icon }, index) => (
              <motion.article
                key={title}
                className="relative min-h-64 rounded-[1.75rem] border border-slate-200/80 bg-white p-5 text-[#0f1f3d] shadow-[0_18px_48px_rgba(15,31,61,0.08)] md:p-6"
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.6, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="mb-6 flex items-start justify-between gap-4 md:mb-9">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-red-200 bg-red-50 text-red-600 shadow-[0_0_0_6px_rgba(248,249,250,0.95)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-headline text-6xl font-black leading-none tracking-[-0.08em] text-red-600 md:text-7xl">0{index + 1}</span>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xl font-black leading-tight text-[#0f1f3d] md:text-2xl">{title}</h3>
                  <p className="text-sm font-medium leading-7 text-gray-600 md:text-base">{description}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}