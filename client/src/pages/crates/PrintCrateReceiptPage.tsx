import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useSearchParams, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileText, Printer, Send } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-0">
        <div className="p-6 md:p-8 border-b border-slate-200 bg-gradient-to-r from-emerald-600 to-green-600 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase opacity-80">Nhà xe Năm Sử</p>
              <h1 className="text-3xl font-black mt-1 flex items-center gap-2"><FileText /> {view.title}</h1>
            </div>
            <div className="text-right text-sm opacity-90">Mã phiếu<br /><b>{id}</b></div>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-black uppercase text-slate-500">{view.customerLabel}</p>
            <h2 className="text-xl font-black mt-1">{view.customer?.name || '-'}</h2>
            <p className="text-sm text-slate-600 mt-1">{view.customer?.phone || '-'} · {view.customer?.address || 'Chưa có địa chỉ'}</p>
          </div>

          <table className="w-full border-collapse">
            <tbody>
              {view.rows.map(([label, value]) => (
                <tr key={label} className="border-b border-slate-100">
                  <td className="py-3 pr-4 text-sm font-bold text-slate-500 w-1/2">{label}</td>
                  <td className="py-3 text-sm font-black text-slate-900">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {view.images?.length ? (
            <div className="grid grid-cols-2 gap-3">
              {view.images.map((url) => <img key={url} src={url} alt="Ảnh giao két" className="rounded-xl border border-slate-200 object-cover w-full h-48" />)}
            </div>
          ) : null}

          <div className="text-center text-xs text-slate-500 pt-4">Phiếu được tạo tự động từ hệ thống quản lý két.</div>
        </div>
      </div>

      <div className="fixed bottom-4 right-4 flex gap-2 print:hidden">
        {!isPublic && <button onClick={() => void handleResend()} className="px-4 py-3 rounded-xl bg-blue-600 text-white font-bold shadow-lg flex items-center gap-2"><Send size={16} /> Gửi Zalo</button>}
        <button onClick={() => window.print()} className="px-4 py-3 rounded-xl bg-slate-900 text-white font-bold shadow-lg flex items-center gap-2"><Printer size={16} /> In phiếu</button>
      </div>
    </div>
  );
};

export default PrintCrateReceiptPage;


