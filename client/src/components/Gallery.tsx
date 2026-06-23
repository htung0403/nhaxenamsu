import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { galleryItems } from '../data/site';

export function Gallery() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [48, -48]);

  return (
    <section id="gallery" ref={sectionRef} className="bg-gray-50 px-4 py-28 md:py-40">
      <div className="mx-auto max-w-7xl">
        <motion.div className="mb-12 max-w-3xl" initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.7 }}>
          <span className="rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-black text-[#E11D2E]">Hình ảnh</span>
          <h2 className="font-headline mt-5 text-4xl font-black tracking-[-0.045em] text-[#071A3D] md:text-6xl">Thực tế vận hành mỗi ngày</h2>
          <p className="text-pretty mt-5 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">Những khoảnh khắc quen thuộc trong hoạt động vận chuyển hằng ngày.</p>
        </motion.div>

        <motion.div style={{ y }} className="grid auto-rows-[230px] grid-flow-dense gap-5 md:grid-cols-3">
          {galleryItems.map((item) => (
            <motion.figure key={item.title} className={`cargo-card group relative overflow-hidden rounded-md bg-slate-200 shadow-xl shadow-blue-950/[0.08] ${item.className ?? ''}`} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.65 }} whileHover={{ y: -6 }}>
              <img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover saturate-110 transition duration-700 group-hover:scale-105" />
              <figcaption className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-6">
                <strong className="text-2xl font-black text-white">{item.title}</strong>
              </figcaption>
            </motion.figure>
          ))}
        </motion.div>
      </div>
    </section>
  );
}