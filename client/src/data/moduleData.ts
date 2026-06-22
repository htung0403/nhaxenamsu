import {
  Users,
  Warehouse, Download, Upload, Truck as DeliveryIcon,
  Banknote, Car, CalendarDays, ClipboardList, ClipboardCheck, DollarSign, FileText, Settings, Settings2, MapPin,
  Send, Store, Receipt, History, Heart,
  CirclePlus, CheckCircle2,
} from 'lucide-react';
import type { ModuleCardProps } from '../components/ui/ModuleCard';

export interface ModuleCardWithPath extends ModuleCardProps {
  path?: string;
}

// Comprehensive module data matching backend routes with navigation paths
export const moduleData: Record<string, { section: string; items: ModuleCardWithPath[] }[]> = {
  '/app/hang-hoa': [
    {
      section: 'Hàng hóa',
      items: [
        { icon: Warehouse, title: 'Tồn kho thực tế', description: 'Quản lý sản phẩm còn tồn kho chờ giao.', colorScheme: 'teal', path: '/app/hang-hoa/kho' },
        { icon: Upload, title: 'Xuất hàng', description: 'Quản lý phiếu xuất kho.', colorScheme: 'red', path: '/app/hang-hoa/xuat-hang' },
        { icon: Download, title: 'Nhập hàng', description: 'Quản lý phiếu nhập kho.', colorScheme: 'green', path: '/app/hang-hoa/nhap-hang' },
        { icon: History, title: 'Lịch sử nhập hàng', description: 'Xem toàn bộ lịch sử đơn nhập hàng tạp hóa.', colorScheme: 'slate', path: '/app/hang-hoa/nhap-hang/lich-su' },
        { icon: DeliveryIcon, title: 'Hàng cần giao', description: 'Danh sách các đơn hàng cần giao.', colorScheme: 'orange', path: '/app/hang-hoa/giao-hang' },
        { icon: CheckCircle2, title: 'Xác nhận hàng gửi', description: 'Duyệt đơn tạp hóa khách hàng gửi trước khi nhập chính thức.', colorScheme: 'emerald', path: '/app/hang-hoa/xac-nhan-hang-gui' },
        { icon: Send, title: 'Hàng gửi SG', description: 'Theo dõi đơn trả hàng do khách nhận tạp hóa tạo.', colorScheme: 'blue', path: '/app/hang-hoa/hang-gui-sg' },
        { icon: Settings2, title: 'Cài đặt hàng tạp hóa', description: 'Quản lý từ điển hàng tạp hóa.', colorScheme: 'slate', path: '/app/hang-hoa/cai-dat' },
      ]
    },
    {
      section: 'Hàng Rau',
      items: [
        { icon: Warehouse, title: 'Hàng trên Xe Tải Lớn', description: 'Hàng rau tồn kho chờ giao hàng.', colorScheme: 'teal', path: '/app/hang-hoa/kho-rau' },
        { icon: Download, title: 'Nhập hàng rau', description: 'Quản lý phiếu nhập kho mặt hàng rau.', colorScheme: 'green', path: '/app/hang-hoa/nhap-hang-rau' },
        { icon: History, title: 'Lịch sử nhập hàng rau', description: 'Xem toàn bộ lịch sử đơn nhập hàng rau.', colorScheme: 'slate', path: '/app/hang-hoa/nhap-hang-rau/lich-su' },
        { icon: ClipboardList, title: 'Bảng Hàng Rau', description: 'Bảng xem chi tiết các mặt hàng rau nhập.', colorScheme: 'purple', path: '/app/hang-hoa/hang-rau' },
        { icon: DeliveryIcon, title: 'Giao hàng rau', description: 'Danh sách các đơn hàng rau cần giao.', colorScheme: 'orange', path: '/app/hang-hoa/giao-hang-rau' },
        { icon: Settings2, title: 'Cài đặt hàng rau', description: 'Quản lý từ điển hàng vựa rau.', colorScheme: 'slate', path: '/app/hang-hoa/cai-dat-rau' },
      ]
    },
    {
      section: 'Quản trị',
      items: [
        { icon: Settings2, title: 'Phân quyền', description: 'Tạo quyền và cấp quyền theo trang cho nhân sự.', colorScheme: 'slate', path: '/app/hanh-chinh-nhan-su/phan-quyen' },
        { icon: Settings, title: 'Cài đặt hệ thống', description: 'Quản lý khung giờ truy cập, quy tắc chuyển hàng và cấu hình Zalo.', colorScheme: 'slate', path: '/app/cai-dat-he-thong' },
      ]
    }
  ],
  '/app/chi-phi': [
    {
      section: 'Chi phí',
      items: [
        {
          icon: Receipt,
          title: 'Phiếu chi phí',
          description: 'Tạo, sửa, xóa và duyệt phiếu chi phí.',
          colorScheme: 'amber',
          path: '/app/chi-phi/phieu',
        },
        {
          icon: History,
          title: 'Lịch sử',
          description: 'Xem phiếu theo thời điểm cập nhật gần nhất.',
          colorScheme: 'slate',
          path: '/app/chi-phi/lich-su',
        },
      ],
    },
  ],
  '/app/khach-hang': [
    {
      section: 'Khách hàng Rau',
      items: [
        { icon: Send, title: 'DS người gửi rau', description: 'Danh sách khách hàng gửi rau.', colorScheme: 'green', path: '/app/khach-hang/nguoi-gui-rau' },
        { icon: Store, title: 'DS người nhận rau (Vựa)', description: 'Danh sách vựa nhận rau.', colorScheme: 'emerald', path: '/app/khach-hang/vua-rau' },
      ]
    },
    {
      section: 'Khách hàng Tạp hóa',
      items: [
        { icon: Send, title: 'DS người gửi hàng tạp hóa', description: 'Danh sách khách hàng gửi hàng tạp hóa.', colorScheme: 'blue', path: '/app/khach-hang/nguoi-gui-tap-hoa' },
        { icon: Heart, title: 'DS KH thân thiết', description: 'Quản lý khách hàng thân thiết.', colorScheme: 'amber', path: '/app/khach-hang/khach-hang-than-thiet' },
        { icon: Store, title: 'DS người nhận hàng tạp hóa', description: 'Danh sách khách hàng nhận hàng tạp hóa.', colorScheme: 'purple', path: '/app/khach-hang/nguoi-nhan-tap-hoa' },
      ]
    }
  ],
  '/app/hanh-chinh-nhan-su': [
    {
      section: 'Nhân sự',
      items: [
        { icon: Users, title: 'Nhân sự', description: 'Quản lý danh sách nhân sự.', colorScheme: 'emerald', path: '/app/hanh-chinh-nhan-su/nhan-su' },
        { icon: ClipboardCheck, title: 'Duyệt đơn', description: 'Duyệt phiếu lương, ứng lương, chấm công bù.', colorScheme: 'cyan', path: '/app/hanh-chinh-nhan-su/duyet-don' },
        { icon: CalendarDays, title: 'Nghỉ phép', description: 'Quản lý đơn nghỉ phép.', colorScheme: 'blue', path: '/app/hanh-chinh-nhan-su/nghi-phep' },
      ]
    },
    {
      section: 'Chấm công',
      items: [
        { icon: ClipboardList, title: 'Chấm công', description: 'Bảng chấm công nhân viên.', colorScheme: 'purple', path: '/app/hanh-chinh-nhan-su/cham-cong' },
        { icon: MapPin, title: 'Cấu hình chấm công', description: 'Các điểm chấm công (GPS, bán kính); thay đổi được lưu ngay.', colorScheme: 'cyan', path: '/app/hanh-chinh-nhan-su/cau-hinh-cham-cong' },
      ]
    },
    {
      section: 'Tiền lương',
      items: [
        { icon: DollarSign, title: 'Bảng lương', description: 'Tính lương và chốt lương.', colorScheme: 'green', path: '/app/hanh-chinh-nhan-su/luong' },
        { icon: Banknote, title: 'Ứng lương', description: 'Tạo đơn ứng lương.', colorScheme: 'red', path: '/app/hanh-chinh-nhan-su/ung-luong' },
        { icon: Settings2, title: 'Cài đặt lương', description: 'Cấu hình mức lương cơ bản.', colorScheme: 'orange', path: '/app/hanh-chinh-nhan-su/cai-dat-luong' },
      ]
    },
  ],
  '/app/ke-toan': [
    {
      section: 'Hóa đơn & Chứng từ',
      items: [
        { icon: FileText, title: 'Hóa đơn tạp hóa', description: 'Quản lý xuất hóa đơn đơn hàng tạp hóa.', colorScheme: 'cyan', path: '/app/ke-toan/hoa-don-tap-hoa' },
        { icon: FileText, title: 'Hóa đơn rau', description: 'Quản lý xuất hóa đơn đơn hàng rau.', colorScheme: 'green', path: '/app/ke-toan/hoa-don-rau' },
        { icon: Banknote, title: 'Thu tiền SG', description: 'Tiền cước thu tại SG khi nhập tạp hóa (đã trả).', colorScheme: 'teal', path: '/app/ke-toan/thu-tien-sg' },
      ]
    },
    {
      section: 'Công nợ & Báo cáo',
      items: [
        { icon: Banknote, title: 'Công nợ KH', description: 'Theo dõi công nợ khách hàng.', colorScheme: 'orange', path: '/app/ke-toan/cong-no' },
        { icon: FileText, title: 'Báo cáo doanh thu', description: 'Báo cáo doanh thu theo ngày.', colorScheme: 'purple', path: '/app/ke-toan/doanh-thu' },
        { icon: Banknote, title: 'Thu tiền hàng', description: 'Quản lý thu nộp tiền giao hàng.', colorScheme: 'green', path: '/app/ke-toan/thu-tien-hang' },
      ]
    }
  ],
  '/app/quan-ly-xe': [
    {
      section: 'Quản lý xe',
        items: [
          { icon: Car, title: 'Danh sách xe', description: 'Quản lý thông tin và lịch trình xe.', colorScheme: 'blue', path: '/app/quan-ly-xe/danh-sach' },
          { icon: DeliveryIcon, title: 'Chuyến giao của tôi', description: 'Tài xế bắt đầu chuyến, xem map điểm giao và xác nhận giao hàng.', colorScheme: 'orange', path: '/app/quan-ly-xe/chuyen-giao-cua-toi' },
          { icon: DeliveryIcon, title: 'Đang giao', description: 'Mở màn hình dẫn tuyến và xác nhận các chuyến đang giao.', colorScheme: 'orange', path: '/app/quan-ly-xe/dang-giao' },
          { icon: MapPin, title: 'Bản đồ tài xế', description: 'Theo dõi vị trí tài xế và điểm giao đang hoạt động.', colorScheme: 'teal', path: '/app/quan-ly-xe/ban-do-tai-xe' },
        // { icon: MapPin, title: 'Điểm danh tài xế', description: 'Tài xế điểm danh Geolocation.', colorScheme: 'orange', path: '/app/quan-ly-xe/check-in' },
        ]
      }
  ],
  '/app/tai-khoan': [
    {
      section: 'Tài khoản khách hàng',
      items: [
        {
          icon: ClipboardList,
          title: 'Đơn hàng của tôi',
          description: 'Khách hàng xem và quản lý đơn hàng của chính mình.',
          colorScheme: 'blue',
          path: '/app/tai-khoan/don-hang',
        },
        {
          icon: CirclePlus,
          title: 'Quyền tự tạo đơn',
          description: 'Cho phép khách hàng tự tạo đơn từ trang tài khoản.',
          colorScheme: 'green',
          path: '/app/tai-khoan/don-hang/tao-don',
        },
        {
          icon: Send,
          title: 'Tạo đơn gửi tạp hóa',
          description: 'Trang tạo đơn gửi riêng cho khách gửi tạp hóa.',
          colorScheme: 'blue',
          path: '/app/don-hang-cua-toi/tao-don-gui',
        },
        {
          icon: CirclePlus,
          title: 'Tạo đơn đổi trả tạp hóa',
          description: 'Trang tạo đơn đổi trả riêng cho khách nhận tạp hóa.',
          colorScheme: 'orange',
          path: '/app/don-hang-cua-toi/tao-don-doi-tra',
        },
      ],
    },
  ],
};

