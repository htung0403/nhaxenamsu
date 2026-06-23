import { CheckCircle2, Clock3, Facebook, Map, MapPin, MessageCircle, Phone, Route, Truck } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
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

type FooterLink = {
  label: string;
  detail: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  ariaLabel: string;
  featured?: boolean;
};

type FooterInfo = {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
};

type ServiceItem = {
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const displayHotline = hotline || '090x xxx xxx';
const routeLabel = 'Đức Trọng ↔ TP.HCM';

const shippingInfo: FooterInfo[] = [
  { label: 'Điểm nhận Đức Trọng', value: ducTrongAddress, icon: MapPin },
  { label: 'Điểm nhận TP.HCM', value: hcmAddress, icon: MapPin },
  { label: 'Giờ làm việc', value: workingHours, icon: Clock3 },
  { label: 'Tuyến vận chuyển', value: routeLabel, icon: Route },
];

const quickContacts: FooterLink[] = [
  { label: 'Hotline', detail: displayHotline, href: phoneHref, icon: Phone, ariaLabel: `Gọi hotline ${displayHotline}`, featured: true },
  { label: 'Zalo', detail: displayHotline, href: zaloHref, icon: MessageCircle, ariaLabel: `Chat Zalo ${displayHotline}` },
  { label: 'Facebook', detail: 'Nhà xe Năm Sự', href: facebookHref, icon: Facebook, ariaLabel: 'Mở Facebook Nhà xe Năm Sự' },
  { label: 'Google Maps', detail: 'Xem điểm nhận hàng', href: googleMapsHref, icon: Map, ariaLabel: 'Mở Google Maps điểm nhận hàng' },
];

const serviceItems: ServiceItem[] = [
  ...footerServices.map((label) => ({ label, icon: CheckCircle2 })),
  ...footerRoutes.map((label) => ({ label, icon: Truck })),
];

const focusRingClassName = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061633]';
const cardClassName = 'rounded-[1.25rem] border border-white/10 bg-white/[0.065] p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.16)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-red-400/25 hover:bg-white/[0.09] hover:shadow-[0_16px_40px_rgba(0,0,0,0.20)] sm:p-4';
const columnTitleClassName = 'font-headline text-[17px] font-black tracking-tight text-white';
const mutedTextClassName = 'text-[13px] font-medium leading-5 text-slate-300';

function FooterColumn({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  const titleId = `footer-${title.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <section className={`${cardClassName} ${className}`} aria-labelledby={titleId}>
      <h2 id={titleId} className={columnTitleClassName}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Footer() {
  return (
    <>
      <footer className="relative overflow-hidden border-t border-white/10 bg-[#061633] px-4 py-7 text-white md:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_13%_0%,rgba(225,29,46,0.16),transparent_26%),radial-gradient(circle_at_88%_16%,rgba(91,108,255,0.14),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.055),transparent_38%)]" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-[min(80rem,92vw)] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
        <div className="pointer-events-none absolute -bottom-28 right-0 h-56 w-56 rounded-full bg-red-500/8 blur-3xl" />

        <div className="relative mx-auto max-w-7xl">
          <div className="grid items-start gap-3 md:grid-cols-2 md:gap-3.5 xl:grid-cols-[1.28fr_1.04fr_0.92fr_0.78fr] xl:gap-3.5">
            <section className="relative overflow-hidden rounded-[1.25rem] border border-white/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.105),rgba(255,255,255,0.055)_48%,rgba(225,29,46,0.085))] p-4 shadow-[0_16px_46px_rgba(0,0,0,0.24)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-red-400/25 hover:shadow-[0_20px_54px_rgba(0,0,0,0.28)] sm:p-5" aria-labelledby="footer-brand">
              <div className="pointer-events-none absolute -right-12 -top-16 h-32 w-32 rounded-full bg-red-400/14 blur-3xl" />
              <div className="relative flex items-center gap-3.5">
                <img src={logoUrl} alt="Logo Nhà xe Năm Sự" className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain p-1.5 shadow-lg shadow-black/20 ring-1 ring-white/30" />
                <div className="min-w-0">
                  <h2 id="footer-brand" className="font-headline text-xl font-black tracking-tight text-white sm:text-[1.55rem]">
                    Nhà xe Năm Sự
                  </h2>
                  <p className="mt-0.5 text-sm font-black text-red-50">{routeLabel}</p>
                </div>
              </div>

              <p className={`${mutedTextClassName} relative mt-3 max-w-md`}>
                Vận chuyển hàng hóa mỗi ngày, nhận gửi rõ ràng, giao đúng tuyến và hỗ trợ khách nhanh chóng.
              </p>

              <div className="relative mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.065] px-3 py-1.5 text-xs font-bold text-slate-200 ring-1 ring-white/5">
                Uy tín <span className="px-1.5 text-red-100">•</span> Đúng giờ <span className="px-1.5 text-red-100">•</span> Tận tâm
              </div>

              <div className="relative mt-3 grid gap-2.5 sm:grid-cols-2">
                <a href={phoneHref} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#E11D2E] px-4 py-2 text-sm font-black text-white shadow-md shadow-black/20 transition hover:scale-[1.015] hover:bg-red-700 ${focusRingClassName}`} aria-label={`Gọi ngay ${displayHotline}`}>
                  <Phone className="h-4 w-4" /> Gọi ngay
                </a>
                <a href={zaloHref} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#071A3D] shadow-md shadow-black/10 transition hover:scale-[1.015] hover:bg-red-50 ${focusRingClassName}`} aria-label={`Chat Zalo ${displayHotline}`}>
                  <MessageCircle className="h-4 w-4" /> Chat Zalo
                </a>
              </div>
            </section>

            <FooterColumn title="Thông tin vận chuyển">
              <ul className="mt-3 grid gap-2">
                {shippingInfo.map(({ label, value, icon: Icon }) => (
                  <li key={label} className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-2.5 py-2 transition duration-300 hover:-translate-y-px hover:border-white/20 hover:bg-white/[0.07]">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-white/9 text-red-50 ring-1 ring-white/12">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-black uppercase leading-4 tracking-[0.12em] text-slate-400">{label}</span>
                      <span className="block text-[13.5px] font-bold leading-5 text-white">{value}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </FooterColumn>

            <FooterColumn title="Liên hệ nhanh">
              <p className={`${mutedTextClassName} mt-2`}>Chọn kênh liên hệ, ưu tiên hotline để được hỗ trợ nhanh.</p>
              <ul className="mt-3 grid gap-2">
                {quickContacts.map(({ label, detail, href, icon: Icon, ariaLabel, featured }) => (
                  <li key={label}>
                    <a href={href} className={`group flex min-h-10 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-sm text-slate-200 transition duration-300 hover:-translate-y-px hover:border-white/24 hover:bg-white/[0.075] hover:text-white ${featured ? 'border-red-300/30 bg-red-500/[0.10] shadow-[0_10px_24px_rgba(225,29,46,0.10)]' : 'border-white/10 bg-white/[0.04]'} ${focusRingClassName}`} aria-label={ariaLabel}>
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl transition group-hover:scale-105 ${featured ? 'bg-red-500 text-white' : 'bg-white/9 text-red-100'}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-black leading-5">{label}</span>
                        <span className={`block truncate text-xs font-semibold leading-4 ${featured ? 'text-red-50' : 'text-slate-300 group-hover:text-slate-100'}`}>{detail}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </FooterColumn>

            <FooterColumn title="Dịch vụ & tuyến">
              <ul className="mt-3 grid gap-1.5 text-sm font-medium leading-5 text-slate-300">
                {serviceItems.map(({ label, icon: Icon }) => (
                  <li key={label} className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-100" />
                    <span>{label}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 rounded-2xl border border-red-200/18 bg-red-500/[0.08] px-3 py-2.5">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-red-50">Nhận hàng mỗi ngày</p>
                <p className="mt-0.5 text-sm font-black text-white">{routeLabel}</p>
              </div>
            </FooterColumn>
          </div>

          <div className="mt-5 flex flex-col items-center gap-1.5 border-t border-white/10 pt-3 text-center text-xs font-medium text-slate-400 sm:flex-row sm:justify-between sm:text-left">
            <span>© 2026 Nhà xe Năm Sự. All rights reserved.</span>
            <span>Vận chuyển hàng hóa mỗi ngày</span>
          </div>
        </div>
      </footer>

      <div className="fixed bottom-3 right-3 z-50 flex flex-col gap-2 sm:bottom-5 sm:right-5" aria-label="Liên hệ nhanh">
        <a href={phoneHref} className={`grid h-11 w-11 place-items-center rounded-full bg-[#E11D2E] text-white shadow-md shadow-black/18 transition hover:scale-105 hover:bg-red-700 sm:h-12 sm:w-12 ${focusRingClassName}`} aria-label={`Gọi ngay ${displayHotline}`}>
          <Phone className="h-5 w-5" />
        </a>
        <a href={zaloHref} className={`grid h-11 w-11 place-items-center rounded-full bg-[#071A3D] text-white shadow-md shadow-black/18 ring-1 ring-white/15 transition hover:scale-105 hover:bg-[#0A2352] sm:h-12 sm:w-12 ${focusRingClassName}`} aria-label={`Chat Zalo ${displayHotline}`}>
          <MessageCircle className="h-5 w-5" />
        </a>
      </div>
    </>
  );
}

