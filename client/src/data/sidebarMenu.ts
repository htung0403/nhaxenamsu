import {
  Home,
  Box,
  Contact,
  Users,
  Wallet,
  Car,
  MapPinned,
  Copyright,
  Receipt,
  ClipboardList,
  Send,
  CirclePlus,
} from 'lucide-react';
import React from 'react';

export type SidebarItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  hiddenForRoles?: string[];
};

export const sidebarMenu: SidebarItem[] = [
  { icon: Home, label: 'Trang chủ', path: '/app' },
  { icon: Users, label: 'Tài khoản khách hàng', path: '/app/tai-khoan', hiddenForRoles: ['admin'] },
  { icon: ClipboardList, label: 'Đơn của tôi', path: '/app/tai-khoan/don-hang', hiddenForRoles: ['admin'] },
  { icon: Send, label: 'Tạo đơn gửi', path: '/app/don-hang-cua-toi/tao-don-gui', hiddenForRoles: ['admin'] },
  { icon: CirclePlus, label: 'Tạo đơn đổi trả', path: '/app/don-hang-cua-toi/tao-don-doi-tra', hiddenForRoles: ['admin'] },
  { icon: Box, label: 'Hàng hóa', path: '/app/hang-hoa' },
  { icon: Contact, label: 'Khách hàng', path: '/app/khach-hang' },
  { icon: Receipt, label: 'Chi phí', path: '/app/chi-phi' },
  { icon: Users, label: 'Hành chính nhân sự', path: '/app/hanh-chinh-nhan-su' },
  { icon: Wallet, label: 'Kế toán', path: '/app/ke-toan' },
  { icon: Car, label: 'Quản lý xe', path: '/app/quan-ly-xe' },
  { icon: MapPinned, label: 'Bản đồ tài xế', path: '/app/quan-ly-xe/ban-do-tai-xe' },
];

// Additional items seen on the dashboard
export const extraMenuItems: SidebarItem[] = [
  { icon: Copyright, label: 'Thông tin bản quyền', path: '/app/ban-quyen' }
];

