import { Clock3, Facebook, Map, MapPin, MessageCircle, Phone, Route } from 'lucide-react';
import {
  ducTrongAddress,
  facebookHref,
  footerRoutes,
  footerServices,
  googleMapsHref,
  hcmAddress,
  hotline,
  phoneHref,
  workingHours,
  zaloHref,
} from '../data/site';
import logoUrl from '../assets/logo-remove-bg.png';

const contactItems = [
  { label: `Hotline: ${hotline}`, href: phoneHref, icon: Phone },
  { label: `Zalo: ${hotline}`, href: zaloHref, icon: MessageCircle },
  { label: 'Facebook Nhà xe Năm Sự', href: facebookHref, icon: Facebook },
  { label: 'Google Maps', href: googleMapsHref, icon: Map },
];

const infoItems = [
  { label: 'Nhận hàng Đức Trọng', value: ducTrongAddress, icon: MapPin },
  { label: 'Nhận hàng TP.HCM', value: hcmAddress, icon: MapPin },
  { label: 'Giờ làm việc', value: workingHours, icon: Clock3 },
  { label: 'Tuyến vận chuyển', value: 'Đức Trọng ↔ TP.HCM', icon: Route },
];

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-[#071A3D] px-4 py-12 text-white md:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_1.4fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 backdrop-blur">
            <div className="flex items-center gap-4">
              <img src={logoUrl} alt="Logo Nhà xe Năm Sự" className="h-16 w-16 rounded-full bg-white object-contain p-1 ring-4 ring-white/10" />
              <div>
                <strong className="block text-2xl font-black">Nhà xe Năm Sự</strong>
                <span className="text-sm font-bold text-red-100">Vận chuyển hàng hóa mỗi ngày</span>
              </div>
            </div>
            <p className="mt-5 leading-8 text-slate-300">
              Chuyên vận chuyển hàng hóa, nông sản, hàng tạp hóa và kiện cá nhân trên tuyến Đức Trọng ↔ TP.HCM.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <a href={phoneHref} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#E11D2E] px-5 py-3 font-black text-white shadow-lg shadow-red-950/20">
                <Phone className="h-4 w-4" /> Gọi ngay
              </a>
              <a href={zaloHref} className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 font-black text-[#071A3D]">
                <MessageCircle className="h-4 w-4" /> Chat Zalo
              </a>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {infoItems.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5">
                <div className="flex items-center gap-3 text-red-100">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10"><Icon className="h-5 w-5" /></span>
                  <span className="text-sm font-black uppercase tracking-wide">{label}</span>
                </div>
                <p className="mt-4 text-lg font-black leading-7 text-white">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <h3 className="font-black text-white">Liên hệ nhanh</h3>
              <ul className="mt-4 grid gap-3">
                {contactItems.map(({ label, href, icon: Icon }) => (
                  <li key={label}>
                    <a href={href} className="flex items-center gap-3 font-bold text-slate-300 transition hover:text-white">
                      <Icon className="h-4 w-4 text-red-200" /> {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-black text-white">Dịch vụ & tuyến</h3>
              <ul className="mt-4 grid gap-2 text-sm font-bold text-slate-300">
                {footerServices.map((item) => <li key={item}>• {item}</li>)}
                {footerRoutes.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm font-bold text-slate-400 md:flex-row md:items-center md:justify-between">
          <span>© 2026 Nhà xe Năm Sự. All rights reserved.</span>
          <span>Đức Trọng, Lâm Đồng ↔ TP.HCM</span>
        </div>
      </div>
    </footer>
  );
}
