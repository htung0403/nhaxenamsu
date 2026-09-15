import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Boxes, ChevronLeft, History, PackagePlus, RefreshCw, Send } from 'lucide-react';
import { cratesApi, type CrateAccount, type CrateHistory } from '../../api/cratesApi';
import { buildCrateHistoryEvents } from './crateHistoryEvents';

const formatNumber = (value?: number | null) => new Intl.NumberFormat('vi-VN').format(value || 0);
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '-';
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra';
const HISTORY_PAGE_SIZE = 10;

const CrateManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'senders' | 'receivers'>('senders');
  const [senders, setSenders] = useState<CrateAccount[]>([]);
  const [receivers, setReceivers] = useState<CrateAccount[]>([]);
  const [history, setHistory] = useState<CrateHistory>({ intakes: [], allocations: [], deliveries: [] });
  const [loading, setLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);

  const loadData = async () => {
    setLoading(true);
    try {
      const [senderRows, receiverRows, historyData] = await Promise.all([
        cratesApi.getAccounts('sender'),
        cratesApi.getAccounts('receiver'),
        cratesApi.getHistory(),
      ]);
      setSenders(senderRows);
      setReceivers(receiverRows);
      setHistory(historyData);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Không tải được dữ liệu két');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const currentRows = activeTab === 'senders' ? senders : receivers;

  const recentEvents = useMemo(() => buildCrateHistoryEvents(history), [history]);
  const historyPageCount = Math.max(1, Math.ceil(recentEvents.length / HISTORY_PAGE_SIZE));
  const visibleHistoryEvents = recentEvents.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  useEffect(() => {
    setHistoryPage(1);
  }, [history]);

  useEffect(() => {
    if (historyPage > historyPageCount) setHistoryPage(historyPageCount);
  }, [historyPage, historyPageCount]);

  return (
    <div className="space-y-4 md:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button onClick={() => navigate('/app/hang-hoa')} className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted transition-colors shrink-0" title="Quay lại"><ChevronLeft size={18} /></button>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-foreground flex items-center gap-2"><Boxes className="text-primary" /> Quản lý két</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Theo dõi khách gửi két, khách nhận két, nhập két và lịch sử phát sinh.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
          <button onClick={() => navigate('/app/hang-hoa/chia-ket')} className="justify-center px-3 md:px-4 py-2.5 md:py-2 rounded-xl bg-primary text-white text-xs md:text-sm font-bold hover:bg-primary/90 flex items-center gap-2"><Send size={16} /> Chia két</button>
          <button onClick={() => void loadData()} className="justify-center px-3 md:px-4 py-2.5 md:py-2 rounded-xl border border-border text-xs md:text-sm font-bold hover:bg-muted flex items-center gap-2"><RefreshCw size={16} /> Tải lại</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
        <div className="rounded-2xl border border-border bg-card p-3 md:p-4"><p className="text-xs font-bold text-muted-foreground uppercase">Khách gửi két</p><p className="text-2xl md:text-3xl font-black">{formatNumber(senders.length)}</p></div>
        <div className="rounded-2xl border border-border bg-card p-3 md:p-4"><p className="text-xs font-bold text-muted-foreground uppercase">Tổng két đang gửi</p><p className="text-2xl md:text-3xl font-black text-emerald-600">{formatNumber(senders.reduce((sum, row) => sum + row.sender_balance, 0))}</p></div>
        <div className="rounded-2xl border border-border bg-card p-3 md:p-4"><p className="text-xs font-bold text-muted-foreground uppercase">Chờ giao / Nợ</p><p className="text-2xl md:text-3xl font-black text-orange-600">{formatNumber(receivers.reduce((sum, row) => sum + row.receiver_pending, 0))} / {formatNumber(receivers.reduce((sum, row) => sum + row.receiver_debt, 0))}</p></div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="grid grid-cols-2 border-b border-border bg-muted/20 p-1">
          <button onClick={() => setActiveTab('senders')} className={`rounded-xl px-3 md:px-5 py-2.5 md:py-3 text-sm font-bold ${activeTab === 'senders' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}>Khách gửi két</button>
          <button onClick={() => setActiveTab('receivers')} className={`rounded-xl px-3 md:px-5 py-2.5 md:py-3 text-sm font-bold ${activeTab === 'receivers' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}>Khách nhận két</button>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-left">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-[34%] px-4 py-3">Khách hàng</th>
                <th className="w-[18%] px-4 py-3">Điện thoại</th>
                {activeTab === 'senders' ? (
                  <th className="w-[16%] px-4 py-3 text-center">Đang gửi</th>
                ) : (
                  <>
                    <th className="w-[14%] px-4 py-3 text-center">Chờ giao</th>
                    <th className="w-[14%] px-4 py-3 text-center">Nợ két</th>
                  </>
                )}
                <th className="w-[32%] px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={activeTab === 'senders' ? 4 : 5}>Đang tải...</td></tr> : currentRows.map(row => (
                <tr key={row.customer_id} className="group hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="font-black text-foreground">{row.customer?.name || '-'}</div>
                    {row.customer?.address && <div className="mt-0.5 max-w-[360px] truncate text-xs text-muted-foreground">{row.customer.address}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-muted-foreground">{row.customer?.phone || '-'}</td>
                  {activeTab === 'senders' ? (
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex min-w-16 justify-center rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-black text-emerald-600">{formatNumber(row.sender_balance)}</span>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex min-w-16 justify-center rounded-full bg-blue-500/10 px-3 py-1 text-sm font-black text-blue-600">{formatNumber(row.receiver_pending)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex min-w-16 justify-center rounded-full bg-red-500/10 px-3 py-1 text-sm font-black text-red-600">{formatNumber(row.receiver_debt)}</span>
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-right">
                    {activeTab === 'senders' ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button onClick={() => navigate(`/app/hang-hoa/nhap-ket?senderId=${row.customer_id}`)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 flex items-center gap-1"><PackagePlus size={14} /> Nhập két</button>
                        <button onClick={() => navigate(`/app/hang-hoa/chia-ket?senderId=${row.customer_id}`)} className="rounded-xl border border-border px-3 py-2 text-xs font-bold transition hover:bg-muted">Chia két</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button onClick={() => navigate(`/app/hang-hoa/chia-ket?receiverId=${row.customer_id}`)} className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-primary/90">Chia cho khách này</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && currentRows.length === 0 && <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={activeTab === 'senders' ? 4 : 5}>Chưa có khách trong danh sách này.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="md:hidden p-3 space-y-3">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Đang tải...</div>
          ) : currentRows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Chưa có khách trong danh sách này.</div>
          ) : currentRows.map(row => (
            <div key={row.customer_id} className="rounded-2xl border border-border bg-background p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-black text-foreground truncate">{row.customer?.name || '-'}</h3>
                  <p className="text-sm text-muted-foreground">{row.customer?.phone || '-'}</p>
                </div>
                <button onClick={() => navigate(`/app/hang-hoa/chia-ket?${activeTab === 'senders' ? 'senderId' : 'receiverId'}=${row.customer_id}`)} className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-black text-white">
                  Chia
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-emerald-500/10 p-2"><p className="text-[10px] font-bold uppercase text-muted-foreground">Đang gửi</p><p className="font-black text-emerald-600">{formatNumber(row.sender_balance)}</p></div>
                <div className="rounded-xl bg-blue-500/10 p-2"><p className="text-[10px] font-bold uppercase text-muted-foreground">Chờ giao</p><p className="font-black text-blue-600">{formatNumber(row.receiver_pending)}</p></div>
                <div className="rounded-xl bg-red-500/10 p-2"><p className="text-[10px] font-bold uppercase text-muted-foreground">Nợ két</p><p className="font-black text-red-600">{formatNumber(row.receiver_debt)}</p></div>
              </div>
              {activeTab === 'senders' ? (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => navigate(`/app/hang-hoa/nhap-ket?senderId=${row.customer_id}`)} className="rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-black text-white flex items-center justify-center gap-1"><PackagePlus size={14} /> Nhập két</button>
                  <button onClick={() => navigate(`/app/hang-hoa/chia-ket?senderId=${row.customer_id}`)} className="rounded-xl border border-border px-3 py-2.5 text-sm font-black text-foreground">Chia két</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  <button onClick={() => navigate('/app/hang-hoa/giao-ket')} className="w-full rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm font-black text-orange-600">Đi giao két</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 md:p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-black flex items-center gap-2"><History size={18} /> Lịch sử gần đây</h2>
          <button onClick={() => navigate('/app/hang-hoa/lich-su-ket')} className="self-start rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground transition hover:bg-muted sm:self-auto">Xem toàn bộ</button>
        </div>
        <div className="space-y-2">
          {visibleHistoryEvents.map(event => (
            <button key={`${event.type}-${event.id}`} onClick={() => navigate(event.href)} className="w-full text-left p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors">
              <div className="flex justify-between gap-3"><span className="font-bold text-sm">{event.type}</span><span className="text-xs text-muted-foreground">{formatDateTime(event.at)}</span></div>
              <p className="text-sm text-muted-foreground mt-1">{event.text}</p>
            </button>
          ))}
          {recentEvents.length === 0 && <p className="text-xs md:text-sm text-muted-foreground">Chưa có lịch sử két.</p>}
        </div>
        {recentEvents.length > HISTORY_PAGE_SIZE && (
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>Hiển thị {visibleHistoryEvents.length} / {recentEvents.length} dòng • Trang {historyPage}/{historyPageCount}</span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button onClick={() => setHistoryPage(page => Math.max(1, page - 1))} disabled={historyPage <= 1} className="rounded-xl border border-border px-3 py-2 font-bold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Trước</button>
              <button onClick={() => setHistoryPage(page => Math.min(historyPageCount, page + 1))} disabled={historyPage >= historyPageCount} className="rounded-xl border border-border px-3 py-2 font-bold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Sau</button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default CrateManagementPage;
