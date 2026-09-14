import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Printer, Send } from 'lucide-react';
import { cratesApi, type CrateAllocation, type CrateDelivery, type CrateIntake, type CrateReceipt, type CrateReceiptType } from '../../api/cratesApi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3009/api';
const formatNumber = (value?: number | null) => new Intl.NumberFormat('vi-VN').format(value || 0);
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '-';
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra';

const isReceiptType = (value?: string | null): value is CrateReceiptType => value === 'intake' || value === 'allocation' || value === 'delivery';

type ReceiptView = {
  title: string;
  customerLabel: string;
  customer?: { name?: string; phone?: string; address?: string } | null;
  rows: Array<[string, string]>;
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

  const view = useMemo<ReceiptView | null>(() => {
    if (!receipt) return null;
    if (receipt.type === 'intake') {
      const record = receipt.record as CrateIntake;
      return {
        title: 'Phiếu nhập két',
        customerLabel: 'Khách gửi',
        customer: record.sender,
        rows: [
          ['Số két gửi', `${formatNumber(record.quantity)} két`],
          ['Số két đang gửi sau nhập', `${formatNumber(record.sender_balance_after)} két`],
          ['Ghi chú', record.notes || '-'],
          ['Người tạo', record.creator?.full_name || '-'],
          ['Thời gian', formatDateTime(record.created_at)],
        ],
      };
    }
    if (receipt.type === 'allocation') {
      const record = receipt.record as CrateAllocation;
      return {
        title: 'Phiếu chia két',
        customerLabel: 'Khách nhận',
        customer: record.receiver,
        rows: [
          ['Khách gửi', record.sender?.name || '-'],
          ['Khách nhận', record.receiver?.name || '-'],
          ['Số két chia', `${formatNumber(record.quantity)} két`],
          ['Bù nợ két', `${formatNumber(record.debt_applied)} két`],
          ['Tăng chờ giao', `${formatNumber(record.pending_added)} két`],
          ['Khách gửi còn', `${formatNumber(record.sender_balance_after)} két`],
          ['Khách nhận chờ giao', `${formatNumber(record.receiver_pending_after)} két`],
          ['Khách nhận nợ két', `${formatNumber(record.receiver_debt_after)} két`],
          ['Ghi chú', record.notes || '-'],
          ['Người tạo', record.creator?.full_name || '-'],
          ['Thời gian', formatDateTime(record.created_at)],
        ],
      };
    }

    const record = receipt.record as CrateDelivery;
    return {
      title: 'Phiếu giao két',
      customerLabel: 'Khách nhận',
      customer: record.receiver,
      rows: [
        ['Số két giao', `${formatNumber(record.quantity)} két`],
        ['Chờ giao trước đó', `${formatNumber(record.pending_before)} két`],
        ['Nợ phát sinh', `${formatNumber(record.debt_created)} két`],
        ['Chờ giao còn lại', `${formatNumber(record.receiver_pending_after)} két`],
        ['Nợ két sau giao', `${formatNumber(record.receiver_debt_after)} két`],
        ['Ghi chú', record.notes || '-'],
        ['Tài xế', record.driver?.full_name || '-'],
        ['Thời gian giao', formatDateTime(record.delivered_at || record.created_at)],
      ],
      images: record.image_urls || [],
    };
  }, [receipt]);

  const handleResend = async () => {
    if (!receipt || !id) return;
    try {
      await cratesApi.resendZalo(receipt.type, id);
      toast.success('Đã gửi lại phiếu Zalo');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || 'Gửi lại Zalo thất bại');
    }
  };

  if (invalidMessage) return <div className="min-h-screen grid place-items-center text-red-600 font-bold">{invalidMessage}</div>;
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Đang tải phiếu két...</div>;
  if (error || !view) return <div className="min-h-screen grid place-items-center text-red-600 font-bold">{error || 'Không có dữ liệu phiếu két'}</div>;

  const receiptDate = receipt?.type === 'delivery'
    ? (receipt.record as CrateDelivery).delivered_at || (receipt.record as CrateDelivery).created_at
    : receipt?.type === 'allocation'
      ? (receipt.record as CrateAllocation).created_at
      : (receipt?.record as CrateIntake | undefined)?.created_at;

  return (
    <div className="h-full min-h-screen overflow-y-auto bg-[#e8edf3] px-3 py-5 md:px-8 md:py-8 print:h-auto print:bg-white print:p-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .receipt-page { width: 100% !important; min-height: auto !important; box-shadow: none !important; border: 0 !important; }
        }
      `}</style>

      <div className="mb-4 flex w-full items-center justify-between gap-3 print:hidden">
        <button onClick={() => navigate(-1)} className="px-4 py-3 rounded-xl bg-white text-slate-900 font-bold shadow-sm border border-slate-200 flex items-center gap-2 hover:bg-slate-50"><ArrowLeft size={16} /> Quay lại</button>
        <div className="flex items-center gap-2">
          {!isPublic && <button onClick={() => void handleResend()} className="px-4 py-3 rounded-xl bg-blue-600 text-white font-bold shadow-sm flex items-center gap-2 hover:bg-blue-700"><Send size={16} /> Gửi Zalo</button>}
          <button onClick={() => window.print()} className="px-4 py-3 rounded-xl bg-slate-900 text-white font-bold shadow-sm flex items-center gap-2 hover:bg-slate-800"><Printer size={16} /> In phiếu</button>
        </div>
      </div>

      <div className="receipt-page mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white p-8 md:p-10 shadow-md border border-slate-300 print:p-0" style={{ fontFamily: 'Times New Roman, Times, serif' }}>
        <div className="grid grid-cols-2 gap-6 text-[13px] leading-tight">
          <div className="text-center uppercase font-bold">
            <p>NHÀ XE NĂM SỰ</p>
            <p className="mt-1 normal-case font-normal">Bộ phận quản lý két</p>
          </div>
          <div className="text-center font-bold">
            <p className="uppercase">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p className="mt-1 underline underline-offset-4">Độc lập - Tự do - Hạnh phúc</p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <h1 className="text-[24px] font-bold uppercase tracking-wide">{view.title}</h1>
          <p className="mt-2 text-[14px] italic">Ngày lập: {formatDateTime(receiptDate)}</p>
        </div>

        <table className="mt-8 w-full border-collapse text-[14px]">
          <tbody>
            <tr>
              <td className="w-36 border border-slate-900 px-3 py-2 font-bold bg-slate-100">Đối tượng</td>
              <td className="border border-slate-900 px-3 py-2 font-bold">{view.customerLabel}</td>
            </tr>
            <tr>
              <td className="border border-slate-900 px-3 py-2 font-bold bg-slate-100">Tên khách hàng</td>
              <td className="border border-slate-900 px-3 py-2 font-bold">{view.customer?.name || '-'}</td>
            </tr>
            <tr>
              <td className="border border-slate-900 px-3 py-2 font-bold bg-slate-100">Điện thoại</td>
              <td className="border border-slate-900 px-3 py-2">{view.customer?.phone || '-'}</td>
            </tr>
            <tr>
              <td className="border border-slate-900 px-3 py-2 font-bold bg-slate-100">Địa chỉ</td>
              <td className="border border-slate-900 px-3 py-2">{view.customer?.address || 'Chưa có địa chỉ'}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6">
          <p className="mb-2 text-[15px] font-bold uppercase">I. Nội dung phiếu</p>
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="w-14 border border-slate-900 px-2 py-2 text-center font-bold">STT</th>
                <th className="border border-slate-900 px-3 py-2 text-left font-bold">Nội dung</th>
                <th className="w-52 border border-slate-900 px-3 py-2 text-left font-bold">Giá trị</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map(([label, value], index) => (
                <tr key={label}>
                  <td className="border border-slate-900 px-2 py-2 text-center">{index + 1}</td>
                  <td className="border border-slate-900 px-3 py-2 font-medium">{label}</td>
                  <td className="border border-slate-900 px-3 py-2 font-bold">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {view.images?.length ? (
          <div className="mt-6 print:break-inside-avoid">
            <p className="mb-2 text-[15px] font-bold uppercase">II. Hình ảnh xác nhận</p>
            <div className="grid grid-cols-2 gap-3">
              {view.images.map((url) => <img key={url} src={url} alt="Ảnh giao két" className="h-44 w-full border border-slate-900 object-cover" />)}
            </div>
          </div>
        ) : null}

        <div className="mt-8 text-[14px]">
          <p><span className="font-bold">Ghi chú:</span> Phiếu này được lập tự động từ hệ thống quản lý két và là căn cứ đối chiếu số lượng két giữa các bên.</p>
        </div>

        <div className="mt-10 grid grid-cols-3 gap-6 text-center text-[14px] print:break-inside-avoid">
          <div>
            <p className="font-bold uppercase">Người lập phiếu</p>
            <p className="mt-1 italic">(Ký, ghi rõ họ tên)</p>
            <div className="h-20" />
          </div>
          <div>
            <p className="font-bold uppercase">Bên giao</p>
            <p className="mt-1 italic">(Ký, ghi rõ họ tên)</p>
            <div className="h-20" />
          </div>
          <div>
            <p className="font-bold uppercase">Bên nhận</p>
            <p className="mt-1 italic">(Ký, ghi rõ họ tên)</p>
            <div className="h-20" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintCrateReceiptPage;




