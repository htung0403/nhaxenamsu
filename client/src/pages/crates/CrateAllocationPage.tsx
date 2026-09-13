import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Boxes, RefreshCw } from 'lucide-react';
import { cratesApi, type CrateAccount } from '../../api/cratesApi';

const formatNumber = (value?: number | null) => new Intl.NumberFormat('vi-VN').format(value || 0);
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra';

const CrateAllocationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [senders, setSenders] = useState<CrateAccount[]>([]);
  const [receivers, setReceivers] = useState<CrateAccount[]>([]);
  const [senderId, setSenderId] = useState(searchParams.get('senderId') || '');
  const [receiverId, setReceiverId] = useState(searchParams.get('receiverId') || '');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [senderRows, receiverRows] = await Promise.all([
        cratesApi.getAccounts('sender'),
        cratesApi.getAccounts('receiver'),
      ]);
      setSenders(senderRows);
      setReceivers(receiverRows);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Không tải được danh sách két');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const selectedSender = useMemo(() => senders.find(row => row.customer_id === senderId), [senders, senderId]);
  const selectedReceiver = useMemo(() => receivers.find(row => row.customer_id === receiverId), [receivers, receiverId]);
  const parsedQuantity = Number(quantity || 0);
  const debtApplied = selectedReceiver ? Math.min(selectedReceiver.receiver_debt, Math.max(parsedQuantity, 0)) : 0;
  const pendingAdded = Math.max(parsedQuantity - debtApplied, 0);

  const handleSubmit = async () => {
    if (!senderId || !receiverId) {
      toast.error('Vui lòng chọn khách gửi và khách nhận két');
      return;
    }
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      toast.error('Số két chia phải là số nguyên dương');
      return;
    }
    if (selectedSender && parsedQuantity > selectedSender.sender_balance) {
      toast.error('Số két của khách gửi không đủ để chia');
      return;
    }

    setSubmitting(true);
    try {
      const result = await cratesApi.createAllocation({
        sender_customer_id: senderId,
        receiver_customer_id: receiverId,
        quantity: parsedQuantity,
        notes: notes || null,
      });
      toast.success('Đã chia két và tạo phiếu');
      navigate(`/app/hang-hoa/in-phieu-ket?type=allocation&id=${result.allocation.id}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Chia két thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-3 pb-24 pt-3 md:p-6 space-y-4 md:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-foreground flex items-center gap-2"><Boxes className="text-primary" /> Chia két</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Chọn khách gửi két, khách nhận két và số lượng cần chia.</p>
        </div>
        <button onClick={() => void loadData()} className="justify-center px-4 py-2.5 md:py-2 rounded-xl border border-border text-sm font-bold hover:bg-muted flex items-center gap-2"><RefreshCw size={16} /> Tải lại</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-start">
        <div className="rounded-2xl border border-border bg-card p-3 md:p-4 space-y-3">
          <p className="text-xs font-black uppercase text-muted-foreground">1. Khách gửi két</p>
          <select value={senderId} disabled={Boolean(searchParams.get('senderId'))} onChange={e => setSenderId(e.target.value)} className="w-full px-3 md:px-3 md:px-4 py-3 rounded-xl border border-border bg-background text-sm font-bold">
            <option value="">Chọn khách gửi két</option>
            {senders.map(row => <option key={row.customer_id} value={row.customer_id}>{row.customer?.name} - còn {formatNumber(row.sender_balance)} két</option>)}
          </select>
          {selectedSender && <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm"><b>{selectedSender.customer?.name}</b><br />Đang gửi: <b>{formatNumber(selectedSender.sender_balance)}</b> két</div>}
        </div>

        <div className="hidden lg:flex h-full items-center pt-16"><ArrowRight className="text-muted-foreground" /></div>

        <div className="rounded-2xl border border-border bg-card p-3 md:p-4 space-y-3">
          <p className="text-xs font-black uppercase text-muted-foreground">2. Khách nhận két</p>
          <select value={receiverId} disabled={Boolean(searchParams.get('receiverId'))} onChange={e => setReceiverId(e.target.value)} className="w-full px-3 md:px-3 md:px-4 py-3 rounded-xl border border-border bg-background text-sm font-bold">
            <option value="">Chọn khách nhận két</option>
            {receivers.map(row => <option key={row.customer_id} value={row.customer_id}>{row.customer?.name} - chờ {formatNumber(row.receiver_pending)}, nợ {formatNumber(row.receiver_debt)}</option>)}
          </select>
          {selectedReceiver && <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm"><b>{selectedReceiver.customer?.name}</b><br />Chờ giao: <b>{formatNumber(selectedReceiver.receiver_pending)}</b> · Nợ két: <b className="text-red-600">{formatNumber(selectedReceiver.receiver_debt)}</b></div>}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 md:p-4 space-y-4">
        <p className="text-xs font-black uppercase text-muted-foreground">3. Số lượng chia</p>
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
          <input type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Số két" className="px-3 md:px-3 md:px-4 py-3 rounded-xl border border-border bg-background text-sm font-bold" />
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ghi chú chia két" className="px-3 md:px-4 py-3 rounded-xl border border-border bg-background text-sm" />
        </div>
        <div className="rounded-xl bg-muted/30 p-3 text-sm text-muted-foreground">
          Dự kiến: bù nợ <b className="text-foreground">{formatNumber(debtApplied)}</b> két, tăng chờ giao <b className="text-foreground">{formatNumber(pendingAdded)}</b> két.
        </div>
        <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 md:justify-end">
          <button onClick={() => navigate('/app/hang-hoa/quan-ly-ket')} className="px-4 md:px-5 py-3 rounded-xl border border-border font-bold text-sm hover:bg-muted">Quay lại</button>
          <button disabled={loading || submitting} onClick={() => void handleSubmit()} className="px-4 md:px-5 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-60">{submitting ? 'Đang chia...' : 'Xác nhận chia két'}</button>
        </div>
      </div>
    </div>
  );
};

export default CrateAllocationPage;



