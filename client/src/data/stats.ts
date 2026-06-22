export interface StatItem {
  value: number;
  suffix: string;
  label: string;
}

export const stats: StatItem[] = [
  { value: 1000, suffix: '+', label: 'Chuyến xe mỗi năm' },
  { value: 500, suffix: '+', label: 'Khách hàng thân thiết' },
  { value: 365, suffix: '', label: 'Ngày hoạt động' },
  { value: 24, suffix: '/7', label: 'Hỗ trợ khách hàng' },
];
