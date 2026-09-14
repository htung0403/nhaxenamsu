import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Eye, History, RefreshCw, Search } from 'lucide-react';
import { cratesApi, type CrateHistory } from '../../api/cratesApi';
import { buildCrateHistoryEvents, type CrateHistoryEventKind } from './crateHistoryEvents';

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '-';
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra';

const typeOptions: Array<{ value: 'all' | CrateHistoryEventKind; label: string }> = [
  { value: 'all', label: 'Tất cả thao tác' },
  { value: 'intake', label: 'Nhập két' },
  { value: 'allocation', label: 'Chia két' },
  { value: 'delivery', label: 'Giao két' },
];

const CrateHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState<CrateHistory>({ intakes: [], allocations: [], deliveries: [] });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | CrateHistoryEventKind>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      setHistory(await cratesApi.getHistory());
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Không tải được lịch sử két');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const allEvents = useMemo(() => buildCrateHistoryEvents(history), [history]);
  const filteredEvents = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return allEvents.filter(event => {
      const matchesType = typeFilter === 'all' || event.kind === typeFilter;
      const matchesSearch = !keyword || event.searchableText.includes(keyword);
      return matchesType && matchesSearch;
    });
  }, [allEvents, searchTerm, typeFilter]);

  return (
    <div className="space-y-4 md:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button onClick={() => navigate('/app/hang-hoa/quan-ly-ket')} className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted transition-colors shrink-0" title="Quay lại"><ChevronLeft size={18} /></button>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-foreground flex items-center gap-2"><History className="text-primary" /> Lịch sử két</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Tìm kiếm, lọc và mở lại phiếu nhập/chia/giao két.</p>
          </div>
        </div>
        <button onClick={() => void loadData()} className="justify-center px-3 md:px-4 py-2.5 md:py-2 rounded-xl border border-border text-xs md:text-sm font-bold hover:bg-muted flex items-center gap-2"><RefreshCw size={16} /> Tải lại</button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 md:p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <label className="relative block">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Tìm theo tên khách, số điện thoại, ghi chú, tài xế, biển số..."
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value as 'all' | CrateHistoryEventKind)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:border-primary">
            {typeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
          <span className="rounded-full bg-muted px-3 py-1">Tổng: {allEvents.length}</span>
          <span className="rounded-full bg-muted px-3 py-1">Đang hiện: {filteredEvents.length}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 md:p-4 shadow-sm">
        <div className="space-y-2">
          {loading ? <div className="py-10 text-center text-sm text-muted-foreground">Đang tải lịch sử két...</div> : filteredEvents.map(event => (
            <div key={`${event.kind}-${event.id}`} className="rounded-xl border border-border bg-background p-3 transition-colors hover:bg-muted/40">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <button onClick={() => navigate(event.href)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-sm text-foreground">{event.type}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">{event.quantity} két</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-muted-foreground">{event.text}</p>
                  {event.note ? <p className="mt-1 text-xs text-muted-foreground line-clamp-2">Ghi chú: {event.note}</p> : null}
                </button>
                <div className="flex shrink-0 items-center justify-between gap-3 md:justify-end">
                  <span className="text-xs font-medium text-muted-foreground">{formatDateTime(event.at)}</span>
                  <button onClick={() => navigate(event.href)} className="rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground transition hover:bg-card flex items-center gap-1"><Eye size={14} /> Xem phiếu</button>
                </div>
              </div>
            </div>
          ))}
          {!loading && filteredEvents.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">Không tìm thấy lịch sử két phù hợp.</div>}
        </div>
      </div>
    </div>
  );
};

export default CrateHistoryPage;
