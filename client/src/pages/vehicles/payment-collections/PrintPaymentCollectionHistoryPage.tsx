import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { format } from 'date-fns';
import ErrorState from '../../../components/shared/ErrorState';
import { usePaymentCollections } from '../../../hooks/queries/usePaymentCollections';
import { matchesSearch } from '../../../lib/str-utils';
import type { PaymentCollection } from '../../../types';
import { formatCurrency, formatDate, formatTime } from '../../../utils/formatters';

const getConfirmerName = (payment: PaymentCollection) => {
  if (payment.status === 'self_confirmed') return payment.driverName || 'Tài xế tự xác nhận';
  return payment.confirmedByName || payment.receiverName || '--';
};

const formatDateInput = (date: Date) => format(date, 'yyyy-MM-dd');

const getDefaultDateRange = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 6);
  return {
    dateFrom: formatDateInput(from),
    dateTo: formatDateInput(to),
  };
};

const PrintPaymentCollectionHistoryPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const dateFrom = searchParams.get('dateFrom') || defaultRange.dateFrom;
  const dateTo = searchParams.get('dateTo') || defaultRange.dateTo;
  const driverId = searchParams.get('driverId') || '';
  const vehicleId = searchParams.get('vehicleId') || '';
  const search = searchParams.get('search') || '';

  const { data: collections, isLoading, isError, refetch } = usePaymentCollections({
    driverId: driverId || undefined,
    vehicleId: vehicleId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const rows = useMemo(() => {
    return (collections || [])
      .filter((payment) => payment.status === 'confirmed' || payment.status === 'self_confirmed')
      .filter((payment) => {
        if (!search.trim()) return true;
        return matchesSearch(
          [
            payment.deliveryOrderCode,
            payment.productName,
            payment.customerName,
            payment.licensePlate,
            payment.driverName,
            payment.receiverName,
            payment.confirmedByName,
          ].filter(Boolean).join(' '),
          search
        );
      })
      .sort((a, b) => new Date(a.confirmedAt || a.collectedAt).getTime() - new Date(b.confirmedAt || b.collectedAt).getTime());
  }, [collections, search]);

  const totalAmount = rows.reduce((sum, payment) => sum + payment.collectedAmount, 0);

  useEffect(() => {
    if (!isLoading && !isError) {
      const timer = window.setTimeout(() => window.print(), 300);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [isLoading, isError]);

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-page { width: 190mm !important; min-height: auto !important; box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; }
          .print-table th, .print-table td { padding: 5px 6px !important; font-size: 10px !important; }
        }
      `}</style>

      <div className="no-print max-w-[210mm] mx-auto mb-4 flex justify-end">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700 flex items-center gap-2"
        >
          <Printer size={16} /> In lại
        </button>
      </div>

      <main className="print-page max-w-[210mm] min-h-[297mm] mx-auto bg-white p-8 shadow-sm border border-slate-200 text-slate-900">
        <header className="border-b-2 border-slate-900 pb-4 mb-5">
          <div className="flex justify-between gap-6">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-slate-500">Báo cáo thu tiền hàng</p>
              <h1 className="text-2xl font-extrabold uppercase mt-1">Lịch sử phiếu thu đã xác nhận</h1>
              <p className="text-[12px] text-slate-500 mt-2">
                Khoảng ngày: {dateFrom || dateTo ? `${dateFrom || '...'} - ${dateTo || '...'}` : 'Tất cả thời gian'}
                {search ? ` • Từ khóa: ${search}` : ''}
              </p>
            </div>
            <div className="text-right text-[12px] text-slate-600">
              <p>Ngày in: {formatDate(new Date().toISOString())}</p>
              <p>Giờ in: {formatTime(new Date().toISOString())}</p>
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="h-40 flex items-center justify-center text-sm">Đang tải dữ liệu...</div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <>
            <section className="grid grid-cols-3 gap-3 mb-5">
              <div className="border border-slate-300 rounded-lg p-3">
                <p className="text-[11px] uppercase text-slate-500 font-bold">Số phiếu</p>
                <p className="text-xl font-extrabold">{rows.length}</p>
              </div>
              <div className="border border-slate-300 rounded-lg p-3 col-span-2">
                <p className="text-[11px] uppercase text-slate-500 font-bold">Tổng tiền đã xác nhận</p>
                <p className="text-xl font-extrabold">{formatCurrency(totalAmount)}</p>
              </div>
            </section>

            <table className="print-table w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-2 py-2 text-left">#</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">Tên hàng</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">Khách</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">Xe</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">Tài xế</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">Gửi cho NV</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">Xác nhận bởi</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">Số tiền</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">Ngày XN</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="border border-slate-300 px-2 py-8 text-center text-slate-500">Không có dữ liệu</td>
                  </tr>
                ) : rows.map((payment, index) => (
                  <tr key={payment.id}>
                    <td className="border border-slate-300 px-2 py-2 align-top">{index + 1}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{payment.productName || '--'}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{payment.customerName || '--'}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top font-bold">{payment.licensePlate || '--'}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{payment.driverName || '--'}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{payment.receiverName || (payment.status === 'self_confirmed' ? 'Tự xác nhận' : '--')}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top font-bold">{getConfirmerName(payment)}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top text-right font-bold">{formatCurrency(payment.collectedAmount)}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{payment.confirmedAt ? `${formatDate(payment.confirmedAt)} ${formatTime(payment.confirmedAt)}` : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </main>
    </div>
  );
};

export default PrintPaymentCollectionHistoryPage;
