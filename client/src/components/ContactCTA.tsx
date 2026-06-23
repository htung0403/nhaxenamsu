import { motion } from 'framer-motion';
import { MapPin, MessageCircle, Phone } from 'lucide-react';
import { hotline, phoneHref, zaloHref } from '../data/site';

export function ContactCTA() {
  return (
    <section id="contact" className="bg-white px-4 py-28 md:py-40">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#071A3D] via-[#0B2452] to-[#E11D2E] p-6 text-white shadow-2xl shadow-blue-950/25 md:p-12">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <motion.div initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.7 }}>
            <span className="rounded-full border border-white/30 bg-white/20 px-5 py-2 text-sm font-black text-white backdrop-blur">Liên hệ ngay</span>
            <h2 className="font-headline mt-6 max-w-5xl text-4xl font-black tracking-[-0.045em] md:text-7xl">Cần gửi hàng Đức Trọng ↔ TP.HCM?</h2>
            <p className="text-pretty mt-6 max-w-2xl text-lg leading-8 text-slate-200">Liên hệ Nhà xe Năm Sự để được tư vấn nhanh về lịch xe, giá cước và hình thức giao nhận.</p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <motion.a href={phoneHref} aria-label="Gọi ngay Nhà xe Năm Sự" className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-8 py-4 text-base font-bold text-[#071A3D] shadow-lg shadow-black/20 transition hover:bg-red-50" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
                <Phone className="h-5 w-5" /> Gọi ngay
              </motion.a>
              <motion.a href={zaloHref} aria-label="Chat Zalo Nhà xe Năm Sự" className="inline-flex items-center justify-center gap-3 rounded-full border border-white/50 bg-transparent px-8 py-4 font-black text-white shadow-xl shadow-black/10 transition hover:bg-white/10" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
                <MessageCircle className="h-5 w-5" /> Chat Zalo
              </motion.a>
            </div>
          </motion.div>

          <div className="grid gap-4">
            {[
              { text: `Hotline: ${hotline}`, icon: Phone, className: 'bg-red-600 py-4 text-lg font-bold text-white shadow-xl shadow-red-950/20' },
              { text: `Zalo: ${hotline}`, icon: MessageCircle, className: 'bg-red-500/70 text-base font-medium text-white shadow-xl shadow-red-950/20' },
              { text: 'Khu vực nhận hàng: Đức Trọng, Lâm Đồng', icon: MapPin, className: 'bg-white/10 text-white shadow-xl shadow-black/10 backdrop-blur' },
              { text: 'Khu vực giao nhận: TP.HCM', icon: MapPin, className: 'bg-white/10 text-white shadow-xl shadow-black/10 backdrop-blur' },
            ].map(({ text, icon: Icon, className }) => (
              <div key={text} className={`flex items-center gap-3 rounded-[1.5rem] p-5 ${className}`}>
                <Icon className="h-6 w-6 shrink-0" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
