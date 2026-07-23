import React from 'react';
import { format } from 'date-fns';
import { ArrowLeft, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CUSTOMER_DEBT_PRINT_STORAGE_KEY = 'customer-debt-a4-print-orders';

type PrintDebtOrder = {
  id: string;
  order_code?: string | null;
  order_date?: string | null;
  delivery_date?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  vehicle_plate?: string | null;
  driver_name?: string | null;
  product_name?: string | null;
  quantity: number;
  unit_price: number;
  expected_amount: number;
  paid_amount: number;
};

type PrintDebtPayload = {
  title?: string;
  mode?: string;
  printed_at?: string;
  orders?: PrintDebtOrder[];
};

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'dd/MM/yyyy');
};

const loadPrintPayload = (): PrintDebtPayload => {
  try {
    const raw = sessionStorage.getItem(CUSTOMER_DEBT_PRINT_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PrintDebtPayload;
  } catch {
    return {};
  }
};

const PrintCustomerDebtA4Page: React.FC = () => {
  const navigate = useNavigate();
  const payload = React.useMemo(loadPrintPayload, []);
  const orders = React.useMemo(() => {
    return [...(payload.orders || [])].sort((a, b) =>
      (a.customer_name || '').localeCompare(b.customer_name || '', 'vi'),
    );
  }, [payload.orders]);

  const totalQuantity = orders.reduce((sum, order) => sum + Number(order.quantity || 0), 0);
  const totalExpected = orders.reduce((sum, order) => sum + Number(order.expected_amount || 0), 0);
  const totalPaid = orders.reduce((sum, order) => sum + Number(order.paid_amount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-100 py-5 text-slate-950">
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          html, body { background: white !important; }
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area {
            position: absolute;
            inset: 0;
            width: 100%;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print { display: none !important; }
          .print-table { font-size: 11px !important; }
          .print-table th, .print-table td { border: 1px solid #111 !important; padding: 4px 5px !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
        .print-table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        .print-table th, .print-table td { border: 1px solid #111827; padding: 5px 6px; vertical-align: top; }
        .print-table th { background: #f1f5f9; font-weight: 800; text-align: center; }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft size={16} /> Quay lại
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black uppercase text-white shadow-sm hover:bg-emerald-700"
        >
          <Printer size={16} /> In A4
        </button>
      </div>

      <main className="print-area mx-auto min-h-[297mm] w-[210mm] bg-white p-[10mm] shadow-sm">
        <header className="mb-4 text-center">
          <h1 className="text-xl font-black uppercase tracking-wide">Danh sách công nợ cần thu</h1>
          <p className="mt-1 text-sm font-semibold text-slate-600">{payload.title || 'Công nợ khách hàng'}</p>
          <p className="mt-1 text-xs text-slate-500">Ngày in: {formatDate(payload.printed_at || new Date().toISOString())}</p>
        </header>

        {orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
            Chưa có dữ liệu để in. Vui lòng quay lại modal và chọn đơn cần in.
          </div>
        ) : (
          <>
            <table className="print-table text-[12px]">
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: '21%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Khách hàng</th>
                  <th>Tên hàng</th>
                  <th>Xe / tài xế</th>
                  <th>SL</th>
                  <th>Đơn giá</th>
                  <th>Công nợ</th>
                  <th>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, index) => (
                  <tr key={order.id || `${order.order_code}-${index}`}>
                    <td className="text-center font-bold">{index + 1}</td>
                    <td>
                      <div className="font-bold">{order.customer_name || '-'}</div>
                      {order.customer_phone && <div className="text-[11px] text-slate-600">{order.customer_phone}</div>}
                    </td>
                    <td className="font-semibold">{order.product_name || '-'}</td>
                    <td>
                      <div className="font-bold">{order.vehicle_plate || '-'}</div>
                      <div className="text-[11px] text-slate-600">{order.driver_name || '-'}</div>
                    </td>
                    <td className="text-center font-bold tabular-nums">{formatCurrency(order.quantity)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(order.unit_price)}</td>
                    <td className="text-right font-bold tabular-nums">{formatCurrency(order.expected_amount)}</td>
                    <td className="text-right font-bold tabular-nums">{formatCurrency(order.paid_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="text-right font-black uppercase">Tổng cộng</td>
                  <td className="text-center font-black tabular-nums">{formatCurrency(totalQuantity)}</td>
                  <td />
                  <td className="text-right font-black tabular-nums">{formatCurrency(totalExpected)}</td>
                  <td className="text-right font-black tabular-nums">{formatCurrency(totalPaid)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="mt-8 grid grid-cols-2 gap-8 text-center text-sm font-bold">
              <div>
                <p>Người lập phiếu</p>
                <p className="mt-16 text-xs font-normal italic">Ký, ghi rõ họ tên</p>
              </div>
              <div>
                <p>Người thu tiền</p>
                <p className="mt-16 text-xs font-normal italic">Ký, ghi rõ họ tên</p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default PrintCustomerDebtA4Page;
