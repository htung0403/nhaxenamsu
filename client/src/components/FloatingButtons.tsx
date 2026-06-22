import { motion } from 'framer-motion';
import { MessageCircle, Phone } from 'lucide-react';
import { phoneHref, zaloHref } from '../data/site';

export function FloatingButtons() {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3">
      <motion.a href={phoneHref} aria-label="Gọi Nhà xe Năm Sự" className="grid h-14 w-14 place-items-center rounded-full bg-[#E11D2E] text-white shadow-2xl shadow-red-600/35" animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.8, repeat: Infinity }} whileHover={{ scale: 1.12 }}>
        <Phone className="h-6 w-6" />
      </motion.a>
      <motion.a href={zaloHref} aria-label="Chat Zalo Nhà xe Năm Sự" className="grid h-14 w-14 place-items-center rounded-full bg-[#071A3D] text-white shadow-2xl shadow-blue-950/35" animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.8, repeat: Infinity, delay: 0.35 }} whileHover={{ scale: 1.12 }}>
        <MessageCircle className="h-6 w-6" />
      </motion.a>
    </div>
  );
}
