import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Boxes, ChevronLeft, PackagePlus, RefreshCw } from 'lucide-react';
import { cratesApi, type CrateAccount, type CrateNotificationLog } from '../../api/cratesApi';
import { customersApi } from '../../api/customersApi';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

const formatNumber = (value?: number | null) => new Intl.NumberFormat('vi-VN').format(value || 0);
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra';
const VEHICLE_STOCK_CUSTOMER_NAME = 'Nhà xe';
const VEHICLE_STOCK_PLACEHOLDER_ID = '__vehicle_stock__';
const CRATE_SENDER_CUSTOMER_TYPE = 'vegetable_receiver';

const normalizeName = (value?: string | null) => (value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .trim()
  .toLowerCase();

const showZaloReceiptToast = (notification?: CrateNotificationLog | null) => {
  if (!notification) return toast.error('Không xác nhận được trạng thái gửi Zalo');
  if (notification.status === 'sent') return toast.success('Đã gửi phiếu Zalo');
  const phone = notification.target_phone ? ` SĐT ${notification.target_phone}` : '';
  const reason = notification.error_message || (notification.status === 'skipped' ? 'Không đủ thông tin gửi Zalo' : 'Gửi Zalo thất bại');
  toast.error(`Không gửi được Zalo${phone}: ${reason}`);
};

const CrateIntakePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [senders, setSenders] = useState<CrateAccount[]>([]);
  const [senderId, setSenderId] = useState(searchParams.get('senderId') || '');
  const [isVehicleStockIntake, setIsVehicleStockIntake] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      setSenders(await cratesApi.getAccounts('sender'));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Không tải được danh sách khách gửi két');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const vehicleStockSender = useMemo(
    () => senders.find(row =>
      normalizeName(row.customer?.name) === normalizeName(VEHICLE_STOCK_CUSTOMER_NAME) &&
      row.customer?.customer_type === CRATE_SENDER_CUSTOMER_TYPE,
    ),
    [senders],
  );
  const senderOptions = useMemo(() => {
    const options = senders.map(row => {
      const label = `${row.customer?.name || 'Chưa có tên'}${row.customer?.phone ? ` - ${row.customer.phone}` : ''} · ${formatNumber(row.sender_balance)} két`;
      return {
        value: row.customer_id,
        label,
        searchText: [row.customer?.name, row.customer?.phone, row.customer?.address, label].filter(Boolean).join(' '),
      };
    });

    if (isVehicleStockIntake && !senderId) {
      return [
        {
          value: VEHICLE_STOCK_PLACEHOLDER_ID,
          label: `${VEHICLE_STOCK_CUSTOMER_NAME} · sẽ tạo khi nhập`,
          searchText: VEHICLE_STOCK_CUSTOMER_NAME,
        },
        ...options,
      ];
    }

    return options;
  }, [isVehicleStockIntake, senderId, senders]);

  const selectedSender = useMemo(() => senders.find(row => row.customer_id === senderId), [senders, senderId]);
  const parsedQuantity = Number(quantity || 0);
  const currentBalance = isVehicleStockIntake ? (vehicleStockSender?.sender_balance || 0) : (selectedSender?.sender_balance || 0);
  const balanceAfter = currentBalance + Math.max(parsedQuantity, 0);

  const handleVehicleStockToggle = (checked: boolean) => {
    setIsVehicleStockIntake(checked);
    setSenderId(checked ? (vehicleStockSender?.customer_id || '') : '');
  };

  const resolveVehicleStockSenderId = async () => {
    if (vehicleStockSender?.customer_id) return vehicleStockSender.customer_id;

    const existingCustomers = await customersApi.getAll(undefined, 1000);
    const vehicleStockCustomers = existingCustomers.filter(customer => normalizeName(customer.name) === normalizeName(VEHICLE_STOCK_CUSTOMER_NAME));
    const correctVehicleStockCustomer = vehicleStockCustomers.find(customer => customer.customer_type === CRATE_SENDER_CUSTOMER_TYPE);
    if (correctVehicleStockCustomer) return correctVehicleStockCustomer.id;

    const wrongTypeVehicleStockCustomer = vehicleStockCustomers[0];
    if (wrongTypeVehicleStockCustomer) {
      await customersApi.update(wrongTypeVehicleStockCustomer.id, { customer_type: CRATE_SENDER_CUSTOMER_TYPE });
      return wrongTypeVehicleStockCustomer.id;
    }

    const createdCustomer = await customersApi.create({
      name: VEHICLE_STOCK_CUSTOMER_NAME,
      customer_type: CRATE_SENDER_CUSTOMER_TYPE,
    });
    return createdCustomer.id;
  };

  const handleSubmit = async () => {
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) return toast.error('Số két nhập phải là số nguyên dương');

    setSubmitting(true);
    try {
      const targetSenderId = isVehicleStockIntake ? await resolveVehicleStockSenderId() : senderId;
      if (!targetSenderId) {
        toast.error('Vui lòng chọn khách gửi két');
        return;
      }

      const result = await cratesApi.createIntake({ sender_customer_id: targetSenderId, quantity: parsedQuantity, notes: notes || null });
      toast.success('Đã nhập két và tạo phiếu');
      if (!isVehicleStockIntake) showZaloReceiptToast(result?.notification);
      navigate(`/app/hang-hoa/in-phieu-ket?type=intake&id=${result.intake.id}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Nhập két thất bại');
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
            <h1 className="text-xl md:text-2xl font-black text-foreground flex items-center gap-2"><PackagePlus className="text-emerald-600" /> Nhập két</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Chọn khách gửi két, nhập số lượng và ghi chú để tạo phiếu nhập két.</p>
          </div>
        </div>
        <button onClick={() => void loadData()} className="justify-center px-4 py-2.5 md:py-2 rounded-xl border border-border text-sm font-bold hover:bg-muted flex items-center gap-2"><RefreshCw size={16} /> Tải lại</button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-border bg-card p-3 md:p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-black uppercase text-muted-foreground">1. Khách gửi két</p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              <input
                type="checkbox"
                checked={isVehicleStockIntake}
                disabled={Boolean(searchParams.get('senderId'))}
                onChange={e => handleVehicleStockToggle(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
              Nhập két cho nhà xe
            </label>
          </div>
          <SearchableSelect
            options={senderOptions}
            value={isVehicleStockIntake && !senderId ? VEHICLE_STOCK_PLACEHOLDER_ID : senderId}
            onValueChange={value => setSenderId(value === VEHICLE_STOCK_PLACEHOLDER_ID ? '' : value)}
            placeholder="Chọn khách gửi két"
            searchPlaceholder="Tìm tên, SĐT, địa chỉ..."
            emptyMessage="Không có khách gửi két phù hợp."
            disabled={Boolean(searchParams.get('senderId')) || isVehicleStockIntake}
            className="h-12 border-emerald-500 bg-background text-sm font-bold"
          />
          {loading && <p className="text-sm text-muted-foreground">Đang tải danh sách khách gửi két...</p>}
          {(selectedSender || isVehicleStockIntake) && <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm"><b>{isVehicleStockIntake ? VEHICLE_STOCK_CUSTOMER_NAME : selectedSender?.customer?.name}</b><br />Đang gửi hiện tại: <b>{formatNumber(currentBalance)}</b> két</div>}
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white"><Boxes size={22} /></span><div><p className="text-xs font-black uppercase text-muted-foreground">Tổng sau nhập</p><p className="text-2xl font-black text-emerald-700">{formatNumber(balanceAfter)} két</p></div></div>
          <p className="mt-3 text-sm text-muted-foreground">Số két nhập sẽ cộng vào tồn két đang gửi của khách và tự tạo phiếu để in/gửi Zalo.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 md:p-4 space-y-4">
        <p className="text-xs font-black uppercase text-muted-foreground">2. Thông tin nhập két</p>
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
          <input type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Số két" className="px-3 md:px-4 py-3 rounded-xl border border-border bg-background text-sm font-bold" />
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ghi chú nhập két" className="px-3 md:px-4 py-3 rounded-xl border border-border bg-background text-sm" />
        </div>
        <div className="rounded-xl bg-muted/30 p-3 text-sm text-muted-foreground">Dự kiến: nhập thêm <b className="text-foreground">{formatNumber(Math.max(parsedQuantity, 0))}</b> két cho {isVehicleStockIntake ? 'nhà xe' : 'khách gửi đã chọn'}.</div>
        <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 md:justify-end">
          <button onClick={() => navigate('/app/hang-hoa/quan-ly-ket')} className="px-4 md:px-5 py-3 rounded-xl border border-border font-bold text-sm hover:bg-muted">Quay lại</button>
          <button disabled={loading || submitting} onClick={() => void handleSubmit()} className="px-4 md:px-5 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-60">{submitting ? 'Đang nhập...' : 'Xác nhận nhập két'}</button>
        </div>
      </div>
    </div>
  );
};

export default CrateIntakePage;
