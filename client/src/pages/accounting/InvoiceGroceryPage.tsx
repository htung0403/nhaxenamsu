import React from 'react';
import InvoiceOrdersPage from './InvoiceOrdersPage';

const InvoiceGroceryPage: React.FC = () => (
  <InvoiceOrdersPage
    category="standard"
    title="Hóa đơn tạp hóa"
    description="Quản lý xuất hóa đơn cho đơn hàng tạp hóa."
    backPath="/app/ke-toan"
  />
);

export default InvoiceGroceryPage;
