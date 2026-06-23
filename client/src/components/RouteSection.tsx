import { motion } from 'framer-motion';
import { ArrowLeftRight, CalendarDays, Clock, MapPin, PackageCheck, Timer, Truck } from 'lucide-react';

export function RouteSection() {
  const routeDirections = [
    {
      title: 'Đức Trọng → TP.HCM',
      details: [
        { icon: Clock, label: 'Xuất phát', value: '6:00 sáng', important: true },
        { icon: Timer, label: 'Thời gian', value: '~4-5 tiếng' },
        { icon: PackageCheck, label: 'Nhận hàng', value: 'Đến 22:00 hôm trước' },
        { icon: CalendarDays, label: 'Lịch chạy', value: 'Thứ 2 - Chủ nhật' },
      ],
    },
    {
      title: 'TP.HCM → Đức Trọng',
      details: [
        { icon: Clock, label: 'Xuất phát', value: '7:00 sáng', important: true },
        { icon: Timer, label: 'Thời gian', value: '~4-5 tiếng' },
        { icon: PackageCheck, label: 'Nhận hàng', value: 'Đến 22:00 hôm trước' },
        { icon: CalendarDays, label: 'Lịch chạy', value: 'Thứ 2 - Chủ nhật' },
      ],
    },
  ];

  return (
    <section id="route" className="bg-[#f8f9fa] px-4 py-24 md:py-32">
      <div className="mx-auto max-w-7xl">
        <motion.div className="mb-10 max-w-3xl" initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.7 }}>
          <span className="rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white shadow-[0_10px_24px_rgba(230,57,70,0.22)]">Tuyến đường</span>
          <h2 className="font-headline mt-5 text-4xl font-black tracking-[-0.045em] text-[#071A3D] md:text-6xl">Tuyến vận chuyển cố định</h2>
          <p className="text-pretty mt-5 max-w-3xl text-lg leading-8 text-slate-600 md:text-xl">Tập trung vào một tuyến chính để tối ưu tốc độ, chi phí và sự ổn định cho khách gửi hàng.</p>
        </motion.div>

        <div className="mb-8 rounded-[2rem] border border-[#1a2f5e]/10 bg-white px-5 py-6 shadow-[0_20px_70px_rgba(26,47,94,0.07)] md:px-8">
          <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-6">
            <div className="flex w-full items-center justify-center gap-3 rounded-full border border-[#1a2f5e]/10 bg-[#f8f9fa] px-5 py-3 font-black text-[#071A3D]">
              <MapPin className="h-5 w-5 text-[#e63946]" />
              Đức Trọng
            </div>
            <div className="flex w-full items-center justify-center gap-3 text-[#1a2f5e]">
              <span className="h-px flex-1 bg-[#1a2f5e]/20" />
              <ArrowLeftRight className="h-5 w-5 text-[#e63946]" />
              <motion.span className="grid h-11 w-11 place-items-center rounded-full bg-[#1a2f5e] text-white shadow-[0_10px_30px_rgba(26,47,94,0.22)]" animate={{ x: [-10, 10, -10] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
                <Truck className="h-5 w-5" />
              </motion.span>
              <span className="h-px flex-1 bg-[#1a2f5e]/20" />
            </div>
            <div className="flex w-full items-center justify-center gap-3 rounded-full border border-[#1a2f5e]/10 bg-[#f8f9fa] px-5 py-3 font-black text-[#071A3D]">
              <MapPin className="h-5 w-5 text-[#e63946]" />
              TP.HCM
            </div>
          </div>
        </div>

        <div className="grid w-full gap-5 md:grid-cols-2 md:items-stretch">
          {routeDirections.map(({ title, details }) => (
            <div key={title} className="rounded-[1.75rem] border border-[#1a2f5e]/15 bg-white p-6 shadow-[0_18px_55px_rgba(26,47,94,0.08)] md:p-8">
              <div className="border-b border-[#1a2f5e]/10 pb-5">
                <h3 className="text-2xl font-black tracking-[-0.03em] text-[#071A3D] md:text-3xl">{title}</h3>
                <p className="mt-2 text-sm font-semibold text-slate-500">Hai chiều mỗi ngày, lịch nhận hàng cố định</p>
              </div>

              <div className="mt-6 space-y-5">
                {details.map(({ icon: Icon, label, value, important }) => (
                  <div key={`${title}-${label}`} className="flex gap-4">
                    <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e63946]/10 text-[#e63946]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="text-sm font-black uppercase tracking-[0.08em] text-[#1a2f5e]">{label}</div>
                      <div className={`mt-1 text-lg font-black leading-7 ${important ? 'text-[#e63946]' : 'text-[#071A3D]'}`}>{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

        </div>
      </div>
    </section>
  );
}
