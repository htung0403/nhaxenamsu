import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Boxes, RefreshCw, Send, Truck } from 'lucide-react';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';
import { cratesApi, type CrateAccount, type CrateRole } from '../../api/cratesApi';

interface Props {
  role: CrateRole;
}

const formatNumber = (value?: number | null) => new Intl.NumberFormat('vi-VN').format(value || 0);
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra';

const pageCopyByRole: Record<CrateRole, { title: string; description: string; empty: string }> = {
  sender: {
    title: 'DS người gửi két',
    description: 'Danh sách người nhận rau/vựa đã được đánh dấu là người gửi két.',
    empty: 'Chưa có người gửi két',
  },
  receiver: {
    title: 'DS người nhận két',
    description: 'Danh sách người gửi rau đã được đánh dấu là người nhận két.',
    empty: 'Chưa có người nhận két',
  },
};

const CrateCustomersPage: React.FC<Props> = ({ role }) => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<CrateAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const copy = pageCopyByRole[role];
  const isSender = role === 'sender';

  const loadData = useCallback(async () => {
    setLoading(true);
    setIsError(false);
    try {
      const rows = await cratesApi.getAccounts(role);
      setAccounts(rows);
    } catch (error: unknown) {
      setIsError(true);
      toast.error(getErrorMessage(error) || 'Không tải được danh sách khách két');
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { void loadData(); }, [loadData]);

  const filteredAccounts = useMemo(() => accounts
    .filter((account) => {
      const customer = account.customer;
      return matchesSearch([customer?.name, customer?.phone, customer?.address].filter(Boolean).join(' '), searchTerm);
    })
    .sort((a, b) => (a.customer?.name || '').localeCompare(b.customer?.name || '', 'vi', { sensitivity: 'base' })), [accounts, searchTerm]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title={copy.title}
          description={copy.description}
          backPath="/app/khach-hang"
          actions={
            <div className="flex items-center gap-3">
              <SearchInput placeholder="Tìm khách két..." onSearch={setSearchTerm} className="w-64" />
              <button onClick={() => void loadData()} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-[13px] font-bold hover:bg-muted transition-all">
                <RefreshCw size={16} />
                Tải lại
              </button>
            </div>
          }
        />
      </div>

      <div className="md:hidden px-3 mb-3">
        <SearchInput placeholder="Tìm khách két..." onSearch={setSearchTerm} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 mb-4 px-3 md:px-0">
        <div className="rounded-2xl border border-border bg-card p-3 md:p-4">
          <p className="text-xs font-bold text-muted-foreground uppercase">Tổng khách</p>
          <p className="text-2xl md:text-3xl font-black">{formatNumber(accounts.length)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 md:p-4">
          <p className="text-xs font-bold text-muted-foreground uppercase">{isSender ? 'Tổng két đang gửi' : 'Tổng két chờ giao'}</p>
          <p className={`text-2xl md:text-3xl font-black ${isSender ? 'text-emerald-600' : 'text-blue-600'}`}>{formatNumber(accounts.reduce((sum, row) => sum + (isSender ? row.sender_balance : row.receiver_pending), 0))}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 md:p-4">
          <p className="text-xs font-bold text-muted-foreground uppercase">{isSender ? 'Có thể chia' : 'Tổng nợ két'}</p>
          <p className={`text-2xl md:text-3xl font-black ${isSender ? 'text-blue-600' : 'text-red-600'}`}>{formatNumber(accounts.reduce((sum, row) => sum + (isSender ? (row.sender_balance > 0 ? 1 : 0) : row.receiver_debt), 0))}</p>
        </div>
      </div>

      <div className="md:bg-white md:rounded-2xl md:border md:border-border md:shadow-sm flex flex-col flex-1 min-h-0 md:overflow-hidden px-3 md:px-0">
        {loading ? (
          <div className="p-4"><LoadingSkeleton rows={6} columns={6} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => void loadData()} />
        ) : !filteredAccounts.length ? (
          <EmptyState title={searchTerm ? 'Không tìm thấy khách két' : copy.empty} />
        ) : (
          <>
          <div className="hidden md:block flex-1 overflow-auto custom-scrollbar">
            <table className="w-full border-collapse min-w-[920px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Tên KH</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">SĐT</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Địa chỉ</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Đang gửi</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Chờ giao</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Nợ két</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredAccounts.map((account) => (
                  <tr key={account.customer_id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-[13px] font-bold text-foreground">{account.customer?.name || '-'}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{account.customer?.phone || '-'}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground max-w-64 truncate" title={account.customer?.address || ''}>{account.customer?.address || '-'}</td>
                    <td className="px-4 py-3 text-[13px] font-black text-emerald-600 text-right tabular-nums">{formatNumber(account.sender_balance)}</td>
                    <td className="px-4 py-3 text-[13px] font-black text-blue-600 text-right tabular-nums">{formatNumber(account.receiver_pending)}</td>
                    <td className="px-4 py-3 text-[13px] font-black text-red-600 text-right tabular-nums">{formatNumber(account.receiver_debt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => navigate(`/app/hang-hoa/chia-ket?${isSender ? 'senderId' : 'receiverId'}=${account.customer_id}`)} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors" title="Chia két">
                          <Send size={14} />
                        </button>
                        {!isSender && (
                          <button onClick={() => navigate('/app/hang-hoa/giao-ket')} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50 transition-colors" title="Giao két">
                            <Truck size={14} />
                          </button>
                        )}
                        <button onClick={() => navigate('/app/hang-hoa/quan-ly-ket')} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-colors" title="Quản lý két">
                          <Boxes size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-3">
            {filteredAccounts.map((account) => (
              <div key={account.customer_id} className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-black text-foreground truncate">{account.customer?.name || '-'}</h3>
                    <p className="text-sm text-muted-foreground">{account.customer?.phone || '-'}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{account.customer?.address || 'Chưa có địa chỉ'}</p>
                  </div>
                  <Boxes className="shrink-0 text-primary" size={22} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-emerald-500/10 p-2"><p className="text-[10px] font-bold uppercase text-muted-foreground">Đang gửi</p><p className="font-black text-emerald-600">{formatNumber(account.sender_balance)}</p></div>
                  <div className="rounded-xl bg-blue-500/10 p-2"><p className="text-[10px] font-bold uppercase text-muted-foreground">Chờ giao</p><p className="font-black text-blue-600">{formatNumber(account.receiver_pending)}</p></div>
                  <div className="rounded-xl bg-red-500/10 p-2"><p className="text-[10px] font-bold uppercase text-muted-foreground">Nợ két</p><p className="font-black text-red-600">{formatNumber(account.receiver_debt)}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => navigate(`/app/hang-hoa/chia-ket?${isSender ? 'senderId' : 'receiverId'}=${account.customer_id}`)} className="rounded-xl bg-primary px-3 py-2.5 text-sm font-black text-white flex items-center justify-center gap-1"><Send size={14} /> Chia két</button>
                  {!isSender ? (
                    <button onClick={() => navigate('/app/hang-hoa/giao-ket')} className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm font-black text-orange-600 flex items-center justify-center gap-1"><Truck size={14} /> Giao</button>
                  ) : (
                    <button onClick={() => navigate('/app/hang-hoa/quan-ly-ket')} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-black text-emerald-600 flex items-center justify-center gap-1"><Boxes size={14} /> Quản lý</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CrateCustomersPage;




