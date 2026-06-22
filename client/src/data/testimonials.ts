export interface TestimonialItem {
  quote: string;
  author: string;
  location: string;
}

export const testimonials: TestimonialItem[] = [
  {
    quote: 'Gửi hàng nhanh, đúng giờ, giá hợp lý. Tôi gửi hàng tạp hóa thường xuyên và rất yên tâm.',
    author: 'Anh Nam',
    location: 'Đức Trọng',
  },
  {
    quote: 'Hàng rau củ được vận chuyển cẩn thận, giao đúng hẹn.',
    author: 'Chị Hương',
    location: 'Lâm Đồng',
  },
  {
    quote: 'Liên hệ nhanh qua Zalo, nhà xe hỗ trợ rất nhiệt tình.',
    author: 'Anh Phúc',
    location: 'TP.HCM',
  },
];
