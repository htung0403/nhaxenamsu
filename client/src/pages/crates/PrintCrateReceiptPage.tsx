import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Printer, Send } from 'lucide-react';
import { cratesApi, type CrateAllocation, type CrateDelivery, type CrateIntake, type CrateNotificationLog, type CrateReceipt, type CrateReceiptType } from '../../api/cratesApi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3009/api';
const formatNumber = (value?: number | null) => new Intl.NumberFormat('vi-VN').format(value || 0);
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '-';
const formatTime = (value?: string | null) => value ? new Date(value).toLocaleTimeString('vi-VN', { hour12: false }) : '-';
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra';

const isReceiptType = (value?: string | null): value is CrateReceiptType => value === 'intake' || value === 'allocation' || value === 'delivery';

type ReceiptTableRow = {
  time: string;
  quantity: string;
  content: string;
  partner: string;
  balance: string;
  note: string;
};

type ReceiptView = {
  title: string;
  customerLabel: string;
  customerName: string;
  customerPhone?: string;
  date: string;
  staffName: string;
  receiptType: string;
  rows: ReceiptTableRow[];
  images?: string[];
};

const PrintCrateReceiptPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ type?: string; id?: string; token?: string }>();
  const [searchParams] = useSearchParams();
  const [receipt, setReceipt] = useState<CrateReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const type = params.type || searchParams.get('type');
  const id = params.id || searchParams.get('id');
  const isPublic = Boolean(params.token);
  const invalidMessage = !isReceiptType(type) || !id ? 'Thiếu thông tin phiếu két' : null;

  useEffect(() => {
    if (invalidMessage || !isReceiptType(type) || !id) return;
    const request = isPublic
      ? axios.get(`${API_URL}/public/crates/${type}/${id}/${params.token}`).then(res => (res.data?.data || res.data) as CrateReceipt)
      : cratesApi.getReceipt(type, id);

    request
      .then((data) => setReceipt(data))
      .catch((err: unknown) => setError(getErrorMessage(err) || 'Không tải được phiếu két'))
      .finally(() => setLoading(false));
  }, [type, id, params.token, isPublic, invalidMessage]);

  const views = useMemo<ReceiptView[]>(() => {
    if (!receipt) return [];
    if (receipt.type === 'intake') {
      const record = receipt.record as CrateIntake;
      const createdAt = record.created_at;
      return [{
        title: 'Phiếu nhập két',
        customerLabel: 'Khách gửi két',
        customerName: record.sender?.name || '-',
        customerPhone: record.sender?.phone || undefined,
        date: formatDateTime(createdAt),
        staffName: record.creator?.full_name || '-',
        receiptType: 'Nhập két',
        rows: [{
          time: formatTime(createdAt),
          quantity: `${formatNumber(record.quantity)} két`,
          content: record.notes || '-',
          partner: record.sender?.name || '-',
          balance: `${formatNumber(record.sender_balance_after)} két`,
          note: record.notes || '-',
        }],
      }];
    }

    if (receipt.type === 'allocation') {
      const record = receipt.record as CrateAllocation;
      const createdAt = record.created_at;
      const senderName = record.sender?.name || '-';
      const receiverName = record.receiver?.name || '-';
      const commonRow = {
        time: formatTime(createdAt),
        quantity: `${formatNumber(record.quantity)} két`,
        content: record.notes || '-',
        note: '-',
      };

      return [
        {
          title: 'Phiếu chia két',
          customerLabel: 'Người gửi két',
          customerName: senderName,
          customerPhone: record.sender?.phone || undefined,
          date: formatDateTime(createdAt),
          staffName: record.creator?.full_name || '-',
          receiptType: 'Chia két',
          rows: [{
            ...commonRow,
            partner: receiverName,
            balance: `${formatNumber(record.sender_balance_after)} két`,
          }],
        },
        {
          title: 'Phiếu nhận két',
          customerLabel: 'Người nhận két',
          customerName: receiverName,
          customerPhone: record.receiver?.phone || undefined,
          date: formatDateTime(createdAt),
          staffName: record.creator?.full_name || '-',
          receiptType: 'Nhận két',
          rows: [{
            ...commonRow,
            partner: senderName,
            balance: `${formatNumber(record.receiver_pending_after)} két`,
          }],
        },
      ];
    }

    const record = receipt.record as CrateDelivery;
    const deliveredAt = record.delivered_at || record.created_at;
    const deliveryNote = record.notes || (record.debt_created > 0 ? `Nợ phát sinh ${formatNumber(record.debt_created)} két` : '-');
    return [{
      title: 'Phiếu giao két',
      customerLabel: 'Khách nhận két',
      customerName: record.receiver?.name || '-',
      customerPhone: record.receiver?.phone || undefined,
      date: formatDateTime(deliveredAt),
      staffName: record.driver?.full_name || '-',
      receiptType: `Xe: ${record.vehicle?.license_plate || '-'}`,
      rows: [{
        time: formatTime(deliveredAt),
        quantity: `${formatNumber(record.quantity)} két`,
        content: 'Giao két',
        partner: record.receiver?.name || '-',
        balance: `${formatNumber(record.receiver_pending_after)} két`,
        note: deliveryNote,
      }],
      images: record.image_urls || [],
    }];
  }, [receipt]);

  const handleResend = async () => {
    if (!receipt || !id) return;
    try {
      const result = await cratesApi.resendZalo(receipt.type, id);
      const logs = (Array.isArray(result) ? result : [result]).filter(Boolean) as CrateNotificationLog[];
      const sent = logs.filter((log) => log.status === 'sent');
      const failed = logs.filter((log) => log.status !== 'sent');

      if (sent.length > 0 && failed.length === 0) {
        toast.success(logs.length > 1 ? `Đã gửi Zalo ${sent.length}/${logs.length} khách` : 'Đã gửi lại phiếu Zalo');
        return;
      }

      const firstFailed = failed[0];
      const failedTarget = firstFailed?.target_name || firstFailed?.target_phone || 'khách hàng';
      const failedReason = firstFailed?.error_message || 'Zalo chưa xác nhận đã gửi';

      if (sent.length > 0) {
        toast.error(`Gửi được ${sent.length}/${logs.length}. Lỗi ${failedTarget}: ${failedReason}`);
        return;
      }

      toast.error(`Chưa gửi được Zalo cho ${failedTarget}: ${failedReason}`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || 'Gửi lại Zalo thất bại');
    }
  };

  const renderReceiptCard = (view: ReceiptView) => {
    const isIntakeReceipt = view.receiptType === 'Nhập két';
    const isAllocationReceipt = view.receiptType === 'Chia két' || view.receiptType === 'Nhận két';
    const isDeliveryReceipt = view.title === 'Phiếu giao két';

    return (
      <div key={`${view.receiptType}-${view.customerName}`} className="receipt-page mx-auto w-full max-w-[920px] overflow-hidden rounded-xl border border-slate-900 bg-white shadow-md print:break-inside-avoid" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <div className="border-b border-slate-900 px-3 py-3 text-center text-[18px] font-bold md:text-[21px]">
          {view.title} Nhà xe Năm Sự
        </div>
        <div className="border-b border-slate-900 px-3 py-3 text-center text-[15px] md:text-[16px]">
          <span className="font-semibold">{view.customerLabel}: </span>{view.customerName}
          {view.customerPhone ? <span className="ml-2 text-slate-600">({view.customerPhone})</span> : null}
        </div>
        {isIntakeReceipt || isAllocationReceipt ? (
          <div className="grid border-b border-slate-900 text-[13px] md:grid-cols-2 md:text-[15px]">
            <div className="border-b border-slate-900 px-3 py-2 md:border-b-0 md:border-r"><span className="font-semibold">Ngày: </span>{view.date}</div>
            <div className="px-3 py-2"><span className="font-semibold">Tên NV: </span>{view.staffName}</div>
          </div>
        ) : (
          <div className="grid border-b border-slate-900 text-[13px] md:grid-cols-[1.1fr_1fr_0.9fr] md:text-[15px]">
            <div className="border-b border-slate-900 px-3 py-2 md:border-b-0 md:border-r"><span className="font-semibold">Ngày: </span>{view.date}</div>
            <div className="border-b border-slate-900 px-3 py-2 md:border-b-0 md:border-r"><span className="font-semibold">Tên NV: </span>{view.staffName}</div>
            <div className="px-3 py-2 text-left font-bold md:text-center">{view.receiptType}</div>
          </div>
        )}

        <div className="receipt-scroll overflow-x-auto">
          {isIntakeReceipt ? (
            <table className="w-full min-w-[760px] border-collapse text-[14px] md:text-[15px]">
              <colgroup>
                <col className="w-[240px]" />
                <col className="w-[240px]" />
                <col className="w-[170px]" />
                <col className="w-[250px]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-100">
                  <th className="border-b border-r border-slate-900 px-2 py-3 text-center font-bold">Ngày giờ</th>
                  <th className="border-b border-r border-slate-900 px-2 py-3 text-center font-bold">Nội dung</th>
                  <th className="border-b border-r border-slate-900 px-2 py-3 text-center font-bold">Số lượng</th>
                  <th className="border-b border-slate-900 px-2 py-3 text-center font-bold">Tổng số két hiện tại</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row, index) => (
                  <tr key={`${row.content}-${index}`}>
                    <td className="border-r border-slate-900 px-2 py-3 text-center">{view.date}</td>
                    <td className="border-r border-slate-900 px-2 py-3 text-center">{row.content}</td>
                    <td className="border-r border-slate-900 px-2 py-3 text-center font-bold">{row.quantity}</td>
                    <td className="px-2 py-3 text-center font-bold">{row.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : isAllocationReceipt ? (
            <table className="w-full min-w-[900px] border-collapse text-[14px] md:text-[15px]">
              <colgroup>
                <col className="w-[175px]" />
                <col className="w-[190px]" />
                <col className="w-[120px]" />
                <col className="w-[230px]" />
                <col className="w-[185px]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-100">
                  <th className="border-b border-r border-slate-900 px-2 py-3 text-center font-bold">Ngày giờ</th>
                  <th className="border-b border-r border-slate-900 px-2 py-3 text-center font-bold">{view.receiptType === 'Nhận két' ? 'Người gửi' : 'Người nhận'}</th>
                  <th className="border-b border-r border-slate-900 px-2 py-3 text-center font-bold">Số lượng</th>
                  <th className="border-b border-r border-slate-900 px-2 py-3 text-center font-bold">Ghi chú</th>
                  <th className="border-b border-slate-900 px-2 py-3 text-center font-bold">{view.receiptType === 'Nhận két' ? 'Két chờ giao' : 'Két còn gửi'}</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row, index) => (
                  <tr key={`${row.partner}-${index}`}>
                    <td className="border-r border-slate-900 px-2 py-3 text-center">{view.date}</td>
                    <td className="border-r border-slate-900 px-2 py-3">{row.partner}</td>
                    <td className="border-r border-slate-900 px-2 py-3 text-center font-bold">{row.quantity}</td>
                    <td className="border-r border-slate-900 px-2 py-3">{row.content}</td>
                    <td className="px-2 py-3 text-center font-bold">{row.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : isDeliveryReceipt ? (
            <table className="w-full min-w-[760px] border-collapse text-[14px] md:text-[15px]">
              <colgroup>
                <col className="w-[240px]" />
                <col className="w-[160px]" />
                <col className="w-[260px]" />
                <col className="w-[240px]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-100">
                  <th className="border-b border-r border-slate-900 px-2 py-3 text-center font-bold">Ngày giờ</th>
                  <th className="border-b border-r border-slate-900 px-2 py-3 text-center font-bold">Số lượng</th>
                  <th className="border-b border-r border-slate-900 px-2 py-3 text-center font-bold">Ghi chú</th>
                  <th className="border-b border-slate-900 px-2 py-3 text-center font-bold">Két còn chờ giao</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row, index) => (
                  <tr key={`${row.content}-${index}`}>
                    <td className="border-r border-slate-900 px-2 py-3 text-center">{view.date}</td>
                    <td className="border-r border-slate-900 px-2 py-3 text-center font-bold">{row.quantity}</td>
                    <td className="border-r border-slate-900 px-2 py-3">{row.note}</td>
                    <td className="px-2 py-3 text-center font-bold">{row.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>

        {view.images?.length ? (
          <div className="border-t border-slate-900 p-3 print:break-inside-avoid">
            <p className="mb-2 text-[14px] font-bold uppercase">Ảnh xác nhận</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {view.images.map((url) => <img key={url} src={url} alt="Ảnh giao két" className="h-44 w-full rounded-lg border border-slate-900 object-cover" />)}
            </div>
          </div>
        ) : null}

        <div className="border-t border-slate-900 px-3 py-2 text-[12px] text-slate-600 md:text-[13px]">
          Phiếu được lập tự động từ hệ thống quản lý két, dùng để đối chiếu nhanh số lượng két giữa các bên.
        </div>
      </div>
    );
  };

  if (invalidMessage) return <div className="min-h-screen grid place-items-center text-red-600 font-bold">{invalidMessage}</div>;
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Đang tải phiếu két...</div>;
  if (error || views.length === 0) return <div className="min-h-screen grid place-items-center text-red-600 font-bold">{error || 'Không có dữ liệu phiếu két'}</div>;

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto bg-[#e8edf3] px-3 pb-5 md:px-6 md:pb-6 print:h-auto print:overflow-visible print:bg-white print:p-0">
      <style>{`
        @page { margin: 8mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .receipt-page { max-width: none !important; box-shadow: none !important; border-radius: 0 !important; }
          .receipt-scroll { overflow: visible !important; }
        }
      `}</style>

      <div className="sticky top-0 z-20 -mx-3 mb-4 bg-[#e8edf3]/95 px-3 pb-4 pt-5 backdrop-blur md:-mx-6 md:px-6 md:pt-6 print:hidden">
        <div className="mx-auto flex w-full max-w-[920px] items-center justify-between gap-3">
          <button onClick={() => navigate(-1)} className="px-4 py-3 rounded-xl bg-white text-slate-900 font-bold shadow-sm border border-slate-200 flex items-center gap-2 hover:bg-slate-50"><ArrowLeft size={16} /> Quay lại</button>
          <div className="flex items-center gap-2">
            {!isPublic && <button onClick={() => void handleResend()} className="px-4 py-3 rounded-xl bg-blue-600 text-white font-bold shadow-sm flex items-center gap-2 hover:bg-blue-700"><Send size={16} /> Gửi Zalo</button>}
            <button onClick={() => window.print()} className="px-4 py-3 rounded-xl bg-slate-900 text-white font-bold shadow-sm flex items-center gap-2 hover:bg-slate-800"><Printer size={16} /> In phiếu</button>
          </div>
        </div>
      </div>

      <div className="space-y-5 print:space-y-4">
        {views.map((receiptView) => renderReceiptCard(receiptView))}
      </div>
    </div>
  );
};

export default PrintCrateReceiptPage;
