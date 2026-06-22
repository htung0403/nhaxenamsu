import React from 'react';
import InvoiceOrdersPage from './InvoiceOrdersPage';

const InvoiceVegetablePage: React.FC = () => (
  <InvoiceOrdersPage
    category="vegetable"
    title="Hóa đơn rau"
    description="Quản lý xuất hóa đơn cho đơn hàng rau."
    backPath="/app/ke-toan"
  />
);

export default InvoiceVegetablePage;
