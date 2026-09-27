import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CalendarDays, ChevronLeft, History, ImageIcon, RefreshCw, Search, Truck, User } from 'lucide-react';
import { cratesApi, type CrateDelivery } from '../../api/cratesApi';
import { DateRangePicker } from '../../components/shared/DateRangePicker';

const formatNumber = (value?: number | null) => new Intl.NumberFormat('vi-VN').format(value || 0);
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok', hour12: false }) : '-';
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra';
const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultHistoryStartDate = () => {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return formatDateInput(date);
};

const getTodayDate = () => formatDateInput(new Date());

const cloudinaryThumb = (url: string) => url.includes('/upload/') ? url.replace('/upload/', '/upload/c_fill,w_160,h_120,q_auto,f_auto/') : url;

const CrateDeliveryHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const defaultStartDate = useMemo(() => getDefaultHistoryStartDate(), []);
  const defaultEndDate = useMemo(() => getTodayDate(), []);
  const [deliveries, setDeliveries] = useState<CrateDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const history = await cratesApi.getHistory(undefined, { start_date: startDate, end_date: endDate });
      setDeliveries(history.deliveries || []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Không tải được lịch sử giao két');
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate]);

  useEffect(() => { void loadData(); }, [loadData]);

  const filteredDeliveries = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return [...deliveries]
      .filter(delivery => {
        if (!keyword) return true;
        return [
          delivery.receiver?.name,
          delivery.receiver?.phone,
          delivery.receiver?.address,
          delivery.driver?.full_name,
          delivery.vehicle?.license_plate,
          delivery.notes,
          String(delivery.quantity),
        ].filter(Boolean).join(' ').toLowerCase().includes(keyword);
      })
      .sort((a, b) => new Date(b.delivered_at || b.created_at).getTime() - new Date(a.delivered_at || a.created_at).getTime());
  }, [deliveries, searchTerm]);

  const totalQuantity = useMemo(
    () => filteredDeliveries.reduce((sum, delivery) => sum + Number(delivery.quantity || 0), 0),
    [filteredDeliveries]
  );

  return (
    <div className="space-y-4 md:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button onClick={() => navigate('/app/hang-hoa/giao-ket')} className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted transition-colors shrink-0" title="Quay lại"><ChevronLeft size={18} /></button>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-foreground flex items-center gap-2"><History className="text-primary" /> Lịch sử giao két</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Tra cứu các phiếu giao két đã tạo theo ngày, khách nhận, tài xế và xe.</p>
          </div>
        </div>
        <button onClick={() => void loadData()} className="justify-center px-3 md:px-4 py-2.5 md:py-2 rounded-xl border border-border text-xs md:text-sm font-bold hover:bg-muted flex items-center gap-2"><RefreshCw size={16} /> Tải lại</button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 md:p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Tìm theo người nhận, SĐT, tài xế, biển số, ghi chú..."
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="flex w-full items-center gap-2 lg:w-[320px]">
            <DateRangePicker
              initialDateFrom={startDate}
              initialDateTo={endDate}
              onUpdate={(values) => {
                setStartDate(values.range.from ? formatDateInput(values.range.from) : '');
                setEndDate(values.range.to ? formatDateInput(values.range.to) : '');
              }}
              className="h-11 w-full justify-center rounded-xl border-border bg-background px-3 text-sm font-bold shadow-none md:w-full"
            />
            {(startDate !== defaultStartDate || endDate !== defaultEndDate) ? (
              <button onClick={() => { setStartDate(defaultStartDate); setEndDate(defaultEndDate); }} className="h-11 shrink-0 rounded-xl border border-border bg-background px-3 text-xs font-black text-muted-foreground transition hover:bg-muted">
                7 ngày
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
          <span className="rounded-full bg-muted px-3 py-1">Phiếu: {filteredDeliveries.length}</span>
          <span className="rounded-full bg-muted px-3 py-1">Tổng két: {formatNumber(totalQuantity)}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.3fr_1.2fr_.7fr_1fr_1.4fr] gap-3 bg-muted/60 px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-muted-foreground">
          <div>Phiếu giao</div>
          <div>Người nhận</div>
          <div className="text-right">Số lượng</div>
          <div>Xe / tài xế</div>
          <div>Chi tiết</div>
        </div>
        <div className="divide-y divide-border">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Đang tải lịch sử giao két...</div>
          ) : filteredDeliveries.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Không tìm thấy phiếu giao két phù hợp.</div>
          ) : filteredDeliveries.map(delivery => (
            <div key={delivery.id} className="grid gap-3 px-4 py-4 transition hover:bg-muted/30 md:grid-cols-[1.3fr_1.2fr_.7fr_1fr_1.4fr] md:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13px] font-black text-foreground"><Truck size={16} className="text-emerald-600" /> Phiếu đã giao</div>
                <div className="mt-1 flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground tabular-nums"><CalendarDays size={13} /> {formatDateTime(delivery.delivered_at || delivery.created_at)}</div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-black text-foreground">{delivery.receiver?.name || '-'}</div>
                <div className="truncate text-[12px] text-muted-foreground">{delivery.receiver?.phone || '-'}</div>
              </div>
              <div className="text-left md:text-right">
                <div className="text-lg font-black tabular-nums text-emerald-600">{formatNumber(delivery.quantity)}</div>
                <div className="text-[11px] font-bold text-muted-foreground">két</div>
              </div>
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-card px-2 py-1 text-[11px] font-black text-blue-700 shadow-sm ring-1 ring-blue-500/5">
                  <Truck size={12} className="text-blue-500" /> {delivery.vehicle?.license_plate || 'Chưa có xe'}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground"><User size={13} /> {delivery.driver?.full_name || '-'}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-muted-foreground line-clamp-2">{delivery.notes || 'Không có ghi chú'}</div>
                {delivery.image_urls?.length ? (
                  <div className="mt-2 flex items-center gap-2">
                    <ImageIcon size={14} className="text-muted-foreground" />
                    {delivery.image_urls.slice(0, 3).map((url, index) => (
                      <img key={`${delivery.id}-${index}`} src={cloudinaryThumb(url)} alt="Ảnh giao két" className="h-9 w-12 rounded-lg border border-border object-cover" />
                    ))}
                    {delivery.image_urls.length > 3 ? <span className="text-[11px] font-bold text-muted-foreground">+{delivery.image_urls.length - 3}</span> : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CrateDeliveryHistoryPage;

