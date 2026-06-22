import { Building2, Facebook, Leaf, Pill, Store, Warehouse } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const hotline = '09xx xxx xxx';
export const phoneHref = 'tel:09xxxxxxxx';
export const zaloHref = 'https://zalo.me/09xxxxxxxx';
export const facebookHref = 'https://facebook.com/nhaxenamsu';
export const googleMapsHref = 'https://maps.google.com/?q=Nh%C3%A0%20xe%20N%C4%83m%20S%E1%BB%B1';
export const ducTrongAddress = 'Đức Trọng, Lâm Đồng';
export const hcmAddress = 'TP.HCM';
export const workingHours = '07:00 – 21:00 mỗi ngày';

export interface NavItem {
  label: string;
  href: string;
}

export const navItems: NavItem[] = [
  { label: 'Trang chủ', href: '#home' },
  { label: 'Dịch vụ', href: '#services' },
  { label: 'Tuyến đường', href: '#route' },
  { label: 'Quy trình', href: '#process' },
  { label: 'Hình ảnh', href: '#gallery' },
  { label: 'Liên hệ', href: '#contact' },
];

export interface CustomerCategory {
  name: string;
  icon: LucideIcon;
}

export const customerCategories: CustomerCategory[] = [
  { name: 'Cửa hàng tạp hóa', icon: Store },
  { name: 'Hộ kinh doanh', icon: Building2 },
  { name: 'Nhà vườn rau củ', icon: Leaf },
  { name: 'Đại lý phân phối', icon: Warehouse },
  { name: 'Nhà thuốc', icon: Pill },
  { name: 'Người gửi cá nhân', icon: Store },
];

export interface GalleryItem {
  title: string;
  image: string;
  className?: string;
}

export const galleryItems: GalleryItem[] = [
  {
    title: 'Xe tải vận chuyển',
    image: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=85',
    className: 'md:row-span-2',
  },
  {
    title: 'Hàng hóa',
    image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=85',
  },
  {
    title: 'Kho hàng',
    image: 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=85',
  },
  {
    title: 'Bốc xếp hàng',
    image: 'https://images.unsplash.com/photo-1559297434-fae8a1916a79?auto=format&fit=crop&w=1200&q=85',
  },
  {
    title: 'Giao hàng',
    image: 'https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=1200&q=85',
  },

];

export const footerServices = ['Hàng tạp hóa', 'Nông sản', 'Kiện cá nhân', 'Giao nhận tận nơi'];
export const footerRoutes = ['Đức Trọng → TP.HCM', 'TP.HCM → Đức Trọng'];
export const footerContacts = ['Hotline', 'Zalo', 'Facebook', 'Google Maps'];
export { Facebook };


