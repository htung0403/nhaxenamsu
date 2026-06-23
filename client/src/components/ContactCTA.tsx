import { motion } from 'framer-motion';
import { MessageCircle, Phone } from 'lucide-react';
import { hotline, phoneHref, zaloHref } from '../data/site';

export function ContactCTA() {
  return (
    <section id="contact" className="bg-white px-4 py-28 md:py-40">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[3rem] border border-white/10 bg-gradient-to-br from-[#071A3D] via-[#0B2452] to-[#E11D2E] p-6 text-white shadow-2xl shadow-blue-950/25 md:p-12">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <motion.div initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.7 }}>
            <span className="rounded-full bg-white/15 px-5 py-2 text-sm font-black backdrop-blur">Liên hệ ngay</span>
            <h2 className="font-headline mt-6 max-w-5xl text-4xl font-black tracking-[-0.045em] md:text-7xl">Cần gửi hàng Đức Trọng ↔ TP.HCM?</h2>
            <p className="text-pretty mt-6 max-w-2xl text-lg leading-8 text-slate-200">Liên hệ Nhà xe Năm Sự để được tư vấn nhanh về lịch xe, giá cước và hình thức giao nhận.</p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <motion.a href={phoneHref} aria-label="Gọi ngay Nhà xe Năm Sự" className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-8 py-4 font-black text-[#071A3D] shadow-xl shadow-black/15 transition hover:bg-red-50" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
                <Phone className="h-5 w-5" /> Gọi ngay
              </motion.a>
              <motion.a href={zaloHref} aria-label="Chat Zalo Nhà xe Năm Sự" className="inline-flex items-center justify-center gap-3 rounded-full border border-white/25 bg-white/10 px-8 py-4 font-black text-white shadow-xl shadow-black/10 backdrop-blur transition hover:bg-white/18" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
                <MessageCircle className="h-5 w-5" /> Chat Zalo
              </motion.a>
            </div>
          </motion.div>

          <div className="grid gap-4">
            {[
              `Hotline: ${hotline}`,
              `Zalo: ${hotline}`,
              'Khu vực nhận hàng: Đức Trọng, Lâm Đồng',
              'Khu vực giao nhận: TP.HCM',
            ].map((item) => (
              <div key={item} className="rounded-[1.5rem] border border-white/15 bg-white/12 p-5 text-lg font-black shadow-xl shadow-black/10 backdrop-blur">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
