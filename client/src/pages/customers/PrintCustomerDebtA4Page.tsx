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

type CustomerDebtPrintGroup = {
  key: string;
  customerName: string;
  customerPhone?: string | null;
  orders: PrintDebtOrder[];
  totalQuantity: number;
  totalExpected: number;
  totalPaid: number;
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

const normalizeCustomerKey = (order: PrintDebtOrder) => {
  const name = (order.customer_name || 'Chưa có khách').trim().toLowerCase();
  const phone = (order.customer_phone || '').trim();
  return `${name}::${phone}`;
};

const buildCustomerGroups = (orders: PrintDebtOrder[]): CustomerDebtPrintGroup[] => {
  const groupMap = new Map<string, CustomerDebtPrintGroup>();

  orders.forEach((order) => {
    const key = normalizeCustomerKey(order);
    const existingGroup = groupMap.get(key);

    if (existingGroup) {
      existingGroup.orders.push(order);
      existingGroup.totalQuantity += Number(order.quantity || 0);
      existingGroup.totalExpected += Number(order.expected_amount || 0);
      existingGroup.totalPaid += Number(order.paid_amount || 0);
      return;
    }

    groupMap.set(key, {
      key,
      customerName: order.customer_name || 'Chưa có khách',
      customerPhone: order.customer_phone,
      orders: [order],
      totalQuantity: Number(order.quantity || 0),
      totalExpected: Number(order.expected_amount || 0),
      totalPaid: Number(order.paid_amount || 0),
    });
  });

  return Array.from(groupMap.values()).sort((a, b) => a.customerName.localeCompare(b.customerName, 'vi'));
};

const PrintCustomerDebtA4Page: React.FC = () => {
  const navigate = useNavigate();
  const payload = React.useMemo(() => loadPrintPayload(), []);
  const orders = React.useMemo(() => {
    return [...(payload.orders || [])].sort((a, b) =>
      (a.customer_name || '').localeCompare(b.customer_name || '', 'vi'),
    );
  }, [payload.orders]);

  const customerGroups = React.useMemo(() => buildCustomerGroups(orders), [orders]);
  const [activeCustomerIndex, setActiveCustomerIndex] = React.useState(0);
  const sidebarItemRefs = React.useRef<(HTMLAnchorElement | null)[]>([]);

  React.useEffect(() => {
    if (customerGroups.length === 0) return;

    let animationFrameId = 0;

    const updateActiveCustomer = () => {
      const sections = customerGroups
        .map((_, index) => document.getElementById(`customer-sheet-${index + 1}`))
        .filter((section): section is HTMLElement => Boolean(section));

      if (sections.length === 0) return;

      const viewportTop = 0;
      const viewportBottom = window.innerHeight;
      const viewportMiddle = window.innerHeight / 2;

      const activeIndex = sections.reduce((bestIndex, section, index) => {
        const rect = section.getBoundingClientRect();
        const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportBottom) - Math.max(rect.top, viewportTop));
        const bestRect = sections[bestIndex].getBoundingClientRect();
        const bestVisibleHeight = Math.max(0, Math.min(bestRect.bottom, viewportBottom) - Math.max(bestRect.top, viewportTop));

        if (visibleHeight !== bestVisibleHeight) {
          return visibleHeight > bestVisibleHeight ? index : bestIndex;
        }

        const currentDistance = Math.abs(rect.top + rect.height / 2 - viewportMiddle);
        const bestDistance = Math.abs(bestRect.top + bestRect.height / 2 - viewportMiddle);
        return currentDistance < bestDistance ? index : bestIndex;
      }, 0);

      setActiveCustomerIndex(activeIndex);
    };

    const handleScroll = () => {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(updateActiveCustomer);
    };

    updateActiveCustomer();
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', handleScroll);
    };
  }, [customerGroups]);

  React.useEffect(() => {
    sidebarItemRefs.current[activeCustomerIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeCustomerIndex]);

  const getMobileNavClass = (index: number) => {
    const isActive = activeCustomerIndex === index;
    return [
      'shrink-0 rounded-full border px-3 py-2 text-xs font-extrabold shadow-sm transition-colors',
      isActive
        ? 'border-emerald-500 bg-emerald-600 text-white shadow-emerald-200'
        : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700',
    ].join(' ');
  };

  const getSidebarNavClass = (index: number) => {
    const isActive = activeCustomerIndex === index;
    return [
      'block rounded-xl border px-3 py-2 text-sm font-extrabold transition-colors',
      isActive
        ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm shadow-emerald-200'
        : 'border-transparent text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700',
    ].join(' ');
  };

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
          .customer-sheet {
            min-height: auto !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: always;
            break-after: page;
          }
          .customer-sheet:last-child { page-break-after: auto; break-after: auto; }
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
        <div className="text-center text-xs font-bold text-slate-500">
          {customerGroups.length > 0 ? `${customerGroups.length} khách • mỗi khách 1 trang A4` : 'Chưa có dữ liệu in'}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black uppercase text-white shadow-sm hover:bg-emerald-700"
        >
          <Printer size={16} /> In A4
        </button>
      </div>

      {customerGroups.length > 0 && (
        <nav className="no-print mx-auto mb-4 flex max-w-[210mm] gap-2 overflow-x-auto px-2 pb-1 lg:hidden" aria-label="Danh sách khách hàng cần in">
          {customerGroups.map((group, index) => (
            <a
              key={group.key}
              href={`#customer-sheet-${index + 1}`}
              className={getMobileNavClass(index)}
            >
              {index + 1}. {group.customerName}
            </a>
          ))}
        </nav>
      )}

      <div className="mx-auto flex max-w-[calc(210mm+240px)] items-start justify-center gap-4 px-2">
        {customerGroups.length > 0 && (
          <aside className="no-print sticky top-5 hidden max-h-[calc(100vh-40px)] w-56 shrink-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:block" aria-label="Danh sách khách hàng cần in">
            <div className="mb-3 border-b border-slate-100 pb-3">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Khách hàng</p>
              <p className="mt-1 text-sm font-extrabold text-slate-700">{customerGroups.length} trang A4</p>
            </div>
            <nav className="space-y-1">
              {customerGroups.map((group, index) => (
                <a
                  key={group.key}
                  ref={(element) => {
                    sidebarItemRefs.current[index] = element;
                  }}
                  href={`#customer-sheet-${index + 1}`}
                  className={getSidebarNavClass(index)}
                >
                  {index + 1}. {group.customerName}
                </a>
              ))}
            </nav>
          </aside>
        )}

        <main className="print-area max-w-[210mm]">
        {orders.length === 0 ? (
          <div className="min-h-[297mm] w-[210mm] bg-white p-[10mm] shadow-sm">
            <header className="mb-4 text-center">
              <h1 className="text-xl font-black uppercase tracking-wide">Danh sách công nợ cần thu</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">{payload.title || 'Công nợ khách hàng'}</p>
              <p className="mt-1 text-xs text-slate-500">Ngày in: {formatDate(payload.printed_at || new Date().toISOString())}</p>
            </header>
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
              Chưa có dữ liệu để in. Vui lòng quay lại modal và chọn đơn cần in.
            </div>
          </div>
        ) : (
          customerGroups.map((group, groupIndex) => (
            <section
              key={group.key}
              id={`customer-sheet-${groupIndex + 1}`}
              className="customer-sheet mb-6 min-h-[297mm] w-[210mm] bg-white p-[10mm] shadow-sm"
            >
              <header className="mb-4 text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Phiếu công nợ khách hàng</p>
                <h1 className="mt-1 text-xl font-black uppercase tracking-wide">{group.customerName}</h1>
                <p className="mt-1 text-sm font-semibold text-slate-600">{payload.title || 'Công nợ khách hàng'}</p>
                <div className="mt-2 flex items-center justify-center gap-4 text-xs font-semibold text-slate-500">
                  <span>Ngày in: {formatDate(payload.printed_at || new Date().toISOString())}</span>
                  {group.customerPhone && <span>SĐT: {group.customerPhone}</span>}
                  <span>Trang {groupIndex + 1}/{customerGroups.length}</span>
                </div>
              </header>

              <table className="print-table text-[12px]">
                <colgroup>
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '14%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Ngày</th>
                    <th>Tên hàng</th>
                    <th>Xe / tài xế</th>
                    <th>SL</th>
                    <th>Đơn giá</th>
                    <th>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {group.orders.map((order, index) => (
                    <tr key={order.id || `${order.order_code}-${index}`}>
                      <td className="text-center font-bold">{index + 1}</td>
                      <td>
                        <div className="font-bold">{formatDate(order.delivery_date || order.order_date)}</div>
                      </td>
                      <td className="font-semibold">{order.product_name || '-'}</td>
                      <td>
                        <div className="font-bold">{order.vehicle_plate || '-'}</div>
                        <div className="text-[11px] text-slate-600">{order.driver_name || '-'}</div>
                      </td>
                      <td className="text-center font-bold tabular-nums">{formatCurrency(order.quantity)}</td>
                      <td className="text-right tabular-nums">{formatCurrency(order.unit_price)}</td>
                      <td className="text-right font-bold tabular-nums">{formatCurrency(order.paid_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="text-right font-black uppercase">Tổng cộng</td>
                    <td className="text-center font-black tabular-nums">{formatCurrency(group.totalQuantity)}</td>
                    <td />
                    <td className="text-right font-black tabular-nums">{formatCurrency(group.totalPaid)}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="mt-8 grid grid-cols-2 gap-8 text-center text-sm font-bold">
                <div>
                  <p>Người lập phiếu</p>
                  <p className="mt-16 text-xs font-normal italic">Ký, ghi rõ họ tên</p>
                </div>
                <div>
                  <p>Khách hàng xác nhận</p>
                  <p className="mt-16 text-xs font-normal italic">Ký, ghi rõ họ tên</p>
                </div>
              </div>
            </section>
          ))
        )}
        </main>
      </div>
    </div>
  );
};

export default PrintCustomerDebtA4Page;

