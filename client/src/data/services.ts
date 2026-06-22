import { Boxes, Home, Leaf, MapPin, PackageCheck, ShoppingBasket, Truck, UserRoundCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ServiceItem {
  title: string;
  description: string;
  icon: LucideIcon;
}

export const services: ServiceItem[] = [
  {
    title: 'Chuyển hàng Đức Trọng → TP.HCM',
    description: 'Nhận hàng tại Đức Trọng, giao hàng nhanh tại TP.HCM.',
    icon: Truck,
  },
  {
    title: 'Chuyển hàng TP.HCM → Đức Trọng',
    description: 'Nhận hàng từ TP.HCM, vận chuyển về Đức Trọng mỗi ngày.',
    icon: PackageCheck,
  },
  {
    title: 'Hàng tạp hóa',
    description: 'Phù hợp cho cửa hàng, đại lý và hộ kinh doanh.',
    icon: ShoppingBasket,
  },
  {
    title: 'Nông sản, rau củ',
    description: 'Hỗ trợ vận chuyển nông sản từ Lâm Đồng đi TP.HCM.',
    icon: Leaf,
  },
  {
    title: 'Kiện hàng cá nhân',
    description: 'Gửi đồ cá nhân, hàng gia đình, hàng nhỏ lẻ.',
    icon: Home,
  },
  {
    title: 'Giao nhận tận nơi',
    description: 'Hỗ trợ giao nhận linh hoạt theo nhu cầu khách hàng.',
    icon: MapPin,
  },
];

export const processSteps: ServiceItem[] = [
  {
    title: 'Liên hệ đặt xe',
    description: 'Khách gọi điện hoặc nhắn Zalo để báo thông tin hàng.',
    icon: UserRoundCheck,
  },
  {
    title: 'Nhận hàng',
    description: 'Nhà xe xác nhận địa điểm, thời gian và loại hàng.',
    icon: Boxes,
  },
  {
    title: 'Vận chuyển',
    description: 'Hàng được sắp xếp, bảo quản và vận chuyển theo tuyến.',
    icon: Truck,
  },
  {
    title: 'Giao tận nơi',
    description: 'Hỗ trợ giao hàng đến người nhận theo thỏa thuận.',
    icon: PackageCheck,
  },
];
