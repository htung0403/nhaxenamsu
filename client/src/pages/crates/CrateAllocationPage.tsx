import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Boxes, Check, ChevronDown, ChevronLeft, Lock, RefreshCw } from 'lucide-react';
import { cratesApi, type CrateAccount } from '../../api/cratesApi';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { cn } from '../../lib/utils';
import { removeAccents } from '../../lib/str-utils';

const formatNumber = (value?: number | null) => new Intl.NumberFormat('vi-VN').format(value || 0);
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra';

type CrateCustomerPickerProps = {
  type: 'sender' | 'receiver';
  value: string;
  rows: CrateAccount[];
  disabled?: boolean;
  onChange: (value: string) => void;
};

const CrateCustomerPicker: React.FC<CrateCustomerPickerProps> = ({ type, value, rows, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const selected = rows.find(row => row.customer_id === value);
  const isSender = type === 'sender';
  const placeholder = isSender ? 'Chọn khách gửi két' : 'Chọn khách nhận két';
  const primaryValue = selected
    ? isSender
      ? selected.sender_balance
      : selected.receiver_pending
    : 0;

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'group flex w-full items-center justify-between gap-3 rounded-2xl border bg-gradient-to-br from-white to-slate-50 px-4 py-3 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-primary/10',
            open ? 'border-primary shadow-md ring-4 ring-primary/10' : 'border-border',
            disabled && 'cursor-not-allowed bg-slate-100 opacity-90 hover:border-border hover:shadow-sm'
          )}
        >
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate text-sm font-black', selected ? 'text-foreground' : 'text-muted-foreground')}>
              {selected ? selected.customer?.name || 'Chưa có tên' : placeholder}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              {selected ? (
                isSender ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Còn {formatNumber(primaryValue)} két</span>
                ) : (
                  <>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">Chờ {formatNumber(selected.receiver_pending)} két</span>
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">Nợ {formatNumber(selected.receiver_debt)} két</span>
                  </>
                )
              ) : (
                <span>Tìm theo tên, số điện thoại hoặc địa chỉ</span>
              )}
            </span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
            {disabled ? <Lock size={16} /> : <ChevronDown size={18} className={cn('transition-transform', open && 'rotate-180')} />}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-2xl border-border/70 p-0 shadow-2xl">
        <Command
          className="rounded-2xl"
          filter={(itemValue, search) => {
            const normalizedValue = removeAccents(itemValue).toLowerCase();
            const normalizedSearch = removeAccents(search).toLowerCase();
            return normalizedValue.includes(normalizedSearch) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={isSender ? 'Tìm khách gửi két...' : 'Tìm khách nhận két...'} className="h-12 text-sm" />
          <CommandList className="max-h-80 p-2">
            <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">Không tìm thấy khách két phù hợp</CommandEmpty>
            <CommandGroup>
              {rows.map(row => {
                const customerName = row.customer?.name || 'Chưa có tên';
                const searchText = [customerName, row.customer?.phone, row.customer?.address].filter(Boolean).join(' ');
                const active = value === row.customer_id;
                return (
                  <CommandItem
                    key={row.customer_id}
                    value={searchText}
                    onSelect={() => {
                      onChange(row.customer_id);
                      setOpen(false);
                    }}
                    className={cn(
                      'mb-1 flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-3 transition-all data-[selected=true]:bg-primary/5',
                      active && 'bg-primary/10 text-primary'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black">{customerName}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold">
                        {isSender ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Còn {formatNumber(row.sender_balance)} két</span>
                        ) : (
                          <>
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">Chờ {formatNumber(row.receiver_pending)} két</span>
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">Nợ {formatNumber(row.receiver_debt)} két</span>
                          </>
                        )}
                        {row.customer?.phone && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{row.customer.phone}</span>}
                      </div>
                    </div>
                    {active && <Check size={18} className="shrink-0 text-primary" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

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
    <div className="space-y-4 md:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button onClick={() => navigate('/app/hang-hoa/quan-ly-ket')} className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted transition-colors shrink-0" title="Quay lại"><ChevronLeft size={18} /></button>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-foreground flex items-center gap-2"><Boxes className="text-primary" /> Chia két</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Chọn khách gửi két, khách nhận két và số lượng cần chia.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 md:flex md:flex-wrap">
          <button onClick={() => void loadData()} className="justify-center px-4 py-2.5 md:py-2 rounded-xl border border-border text-sm font-bold hover:bg-muted flex items-center gap-2"><RefreshCw size={16} /> Tải lại</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-start">
        <div className="rounded-2xl border border-border bg-card p-3 md:p-4 space-y-3">
          <p className="text-xs font-black uppercase text-muted-foreground">1. Khách gửi két</p>
          <CrateCustomerPicker type="sender" value={senderId} rows={senders} disabled={Boolean(searchParams.get('senderId'))} onChange={setSenderId} />
          {selectedSender && <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm"><b>{selectedSender.customer?.name}</b><br />Đang gửi: <b>{formatNumber(selectedSender.sender_balance)}</b> két</div>}
        </div>

        <div className="hidden lg:flex h-full items-center pt-16"><ArrowRight className="text-muted-foreground" /></div>

        <div className="rounded-2xl border border-border bg-card p-3 md:p-4 space-y-3">
          <p className="text-xs font-black uppercase text-muted-foreground">2. Khách nhận két</p>
          <CrateCustomerPicker type="receiver" value={receiverId} rows={receivers} disabled={Boolean(searchParams.get('receiverId'))} onChange={setReceiverId} />
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



