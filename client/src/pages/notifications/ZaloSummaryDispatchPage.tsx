import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ExternalLink, RefreshCw, SendHorizonal } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/shared/PageHeader';
import { DatePicker } from '../../components/shared/DatePicker';
import { SearchInput } from '../../components/ui/SearchInput';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { zaloSummaryApi, type ZaloSummaryStatusItem, type ZaloSummaryType } from '../../api/zaloSummaryApi';
import { matchesSearch } from '../../lib/str-utils';

type Props = {
  type: ZaloSummaryType;
  title: string;
  description: string;
  backPath?: string;
};

const statusClassMap: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  skipped: 'bg-amber-100 text-amber-700 border-amber-200',
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
};

const statusLabelMap: Record<string, string> = {
  success: 'Đã gửi',
  failed: 'Thất bại',
  skipped: 'Bỏ qua',
  pending: 'Chưa gửi',
};

const triggerLabelMap: Record<string, string> = {
  scheduler: 'Tự động',
  manual: 'Thủ công',
};

const formatDateTime = (value: string | null): string => {
  if (!value) return '-';
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '-';
  return format(time, 'dd/MM/yyyy HH:mm:ss');
};

const summaryTypeLabelMap: Record<ZaloSummaryType, string> = {
  grocery: 'khách tạp hóa',
  grocery_receiver: 'khách tạp hóa',
  supplier: 'vựa rau',
  sender: 'người gửi rau',
};

const statusFilterOptions = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending', label: 'Chưa gửi' },
  { value: 'success', label: 'Đã gửi' },
  { value: 'failed', label: 'Thất bại' },
  { value: 'skipped', label: 'Bỏ qua' },
];

const errorFilterOptions = [
  { value: 'all', label: 'Tất cả' },
  { value: 'has_error', label: 'Có lỗi' },
  { value: 'no_error', label: 'Không lỗi' },
];

const SummaryStatCard: React.FC<{ label: string; value: number; colorClass?: string }> = ({ label, value, colorClass }) => (
  <div className={`rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm shadow-black/[0.02] md:p-3 ${colorClass || ''}`}>
    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide md:text-[11px]">{label}</div>
    <div className="text-xl font-black leading-tight text-foreground tabular-nums mt-0.5 md:mt-1 md:text-2xl">{value}</div>
  </div>
);

const ZaloSummaryDispatchPage: React.FC<Props> = ({ type, title, description, backPath = '/app/cai-dat-he-thong' }) => {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'success' | 'failed' | 'skipped'>('all');
  const [errorFilter, setErrorFilter] = useState<'all' | 'has_error' | 'no_error'>('all');
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['zalo-summary-status', type, date],
    queryFn: () => zaloSummaryApi.getSummaryStatus(type, date),
  });

  const sendMutation = useMutation({
    mutationFn: (item: ZaloSummaryStatusItem) =>
      zaloSummaryApi.sendSummary({
        type,
        targetId: item.targetId,
        date,
      }),
    onSuccess: (response, item) => {
      if (response.success) {
        toast.success(`Đã gửi tổng kết cho ${item.targetName}`);
      } else {
        toast.error(response.error || `Không gửi được tổng kết cho ${item.targetName}`);
      }
      void queryClient.invalidateQueries({ queryKey: ['zalo-summary-status', type, date] });
    },
    onError: () => {
      toast.error('Gửi tổng kết thất bại');
    },
  });

  const bulkSendMutation = useMutation({
    mutationFn: async (targetItems: ZaloSummaryStatusItem[]) => {
      let successCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const failedTargets: string[] = [];

      for (const item of targetItems) {
        try {
          const response = await zaloSummaryApi.sendSummary({
            type,
            targetId: item.targetId,
            date,
          });

          if (response.success) {
            successCount += 1;
            continue;
          }

          if (response.status === 'skipped') {
            skippedCount += 1;
            continue;
          }

          failedCount += 1;
          failedTargets.push(item.targetName || item.targetId);
        } catch {
          failedCount += 1;
          failedTargets.push(item.targetName || item.targetId);
        }
      }

      return { successCount, failedCount, skippedCount, failedTargets, total: targetItems.length };
    },
    onSuccess: (result) => {
      const summary = `Thành công ${result.successCount}/${result.total}${
        result.skippedCount > 0 ? ` • Bỏ qua ${result.skippedCount}` : ''
      }${result.failedCount > 0 ? ` • Lỗi ${result.failedCount}` : ''}`;

      if (result.failedCount > 0) {
        toast.error(`Gửi hàng loạt xong: ${summary}`);
      } else {
        toast.success(`Gửi hàng loạt thành công: ${summary}`);
      }

      if (result.failedTargets.length > 0) {
        const names = result.failedTargets.slice(0, 3).join(', ');
        const suffix = result.failedTargets.length > 3 ? ` +${result.failedTargets.length - 3}` : '';
        toast.error(`Không gửi được: ${names}${suffix}`);
      }

      void queryClient.invalidateQueries({ queryKey: ['zalo-summary-status', type, date] });
      setSelectedTargetIds([]);
    },
    onError: () => {
      toast.error('Gửi hàng loạt thất bại');
    },
  });

  const items = data?.items || [];
  const stats = data?.summary || { total: 0, sent: 0, failed: 0, skipped: 0, pending: 0 };

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (!searchQuery.trim()) return true;
        const byName = matchesSearch(item.targetName || '', searchQuery);
        const byPhone = matchesSearch(item.targetPhone || '', searchQuery);
        return byName || byPhone;
      })
      .filter((item) => {
        if (statusFilter === 'all') return true;
        return item.status === statusFilter;
      })
      .filter((item) => {
        if (errorFilter === 'all') return true;
        const hasError = Boolean(item.lastError && item.lastError.trim());
        return errorFilter === 'has_error' ? hasError : !hasError;
      }),
    [items, searchQuery, statusFilter, errorFilter],
  );

  const sortedItems = useMemo(
    () =>
      [...filteredItems].sort((a, b) => {
        if (a.status === b.status) return a.targetName.localeCompare(b.targetName, 'vi');
        const order = ['failed', 'pending', 'skipped', 'success'];
        return order.indexOf(a.status) - order.indexOf(b.status);
      }),
    [filteredItems],
  );

  const selectedIdSet = useMemo(() => {
    const availableIds = new Set(items.map((item) => item.targetId));
    return new Set(selectedTargetIds.filter((targetId) => availableIds.has(targetId)));
  }, [items, selectedTargetIds]);
  const selectedItems = useMemo(
    () => sortedItems.filter((item) => selectedIdSet.has(item.targetId)),
    [sortedItems, selectedIdSet],
  );
  const allVisibleSelected =
    sortedItems.length > 0 && sortedItems.every((item) => selectedIdSet.has(item.targetId));
  const isAnySending = sendMutation.isPending || bulkSendMutation.isPending;

  const toggleSelectOne = (targetId: string, checked: boolean) => {
    setSelectedTargetIds((prev) => {
      if (checked) {
        if (prev.includes(targetId)) return prev;
        return [...prev, targetId];
      }
      return prev.filter((id) => id !== targetId);
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedTargetIds((prev) => {
      const visibleIds = sortedItems.map((item) => item.targetId);
      if (checked) {
        const merged = new Set(prev);
        visibleIds.forEach((id) => merged.add(id));
        return Array.from(merged);
      }
      const visibleSet = new Set(visibleIds);
      return prev.filter((id) => !visibleSet.has(id));
    });
  };

  const handleBulkSend = () => {
    if (selectedItems.length === 0) {
      toast.error('Vui lòng chọn ít nhất 1 khách để gửi');
      return;
    }
    bulkSendMutation.mutate(selectedItems);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader title={title} description={description} backPath={backPath} />
      </div>

      <div className="md:hidden mb-4">
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm shadow-black/[0.02] mb-4 sm:p-4">
        <div className="grid grid-cols-3 gap-2 md:flex md:items-end md:gap-3">
          <label className="order-1 col-span-1 flex min-w-0 flex-col gap-1 md:order-none">
            <span className="text-[12px] font-semibold text-muted-foreground">Ngày tổng kết</span>
            <DatePicker
              value={date}
              onChange={setDate}
              className="h-11 w-full bg-white text-xs md:h-10 md:min-w-[160px] md:text-sm"
            />
          </label>
          <div className="order-3 col-span-3 flex w-full flex-col gap-1 md:order-none md:max-w-[320px]">
            <span className="text-[12px] font-semibold text-muted-foreground">Tìm kiếm khách hàng</span>
            <SearchInput
              placeholder="Tên/SĐT (hỗ trợ không dấu)..."
              onSearch={(query) => setSearchQuery(query)}
              className="h-11 bg-white md:h-10"
            />
          </div>
          <div className="order-2 col-span-2 grid grid-cols-2 gap-2 md:order-none md:flex md:gap-3">
            <label className="flex min-w-0 flex-col gap-1 md:w-[170px]">
              <span className="text-[12px] font-semibold text-muted-foreground">Trạng thái</span>
              <SearchableSelect
                options={statusFilterOptions}
                value={statusFilter}
                onValueChange={(value) => setStatusFilter((value || 'all') as typeof statusFilter)}
                placeholder="Tất cả"
                searchPlaceholder="Tìm trạng thái..."
                className="h-11 min-w-0 bg-white px-2 text-xs md:h-10 md:px-3 md:text-[13px]"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 md:w-[170px]">
              <span className="text-[12px] font-semibold text-muted-foreground">Lỗi gửi</span>
              <SearchableSelect
                options={errorFilterOptions}
                value={errorFilter}
                onValueChange={(value) => setErrorFilter((value || 'all') as typeof errorFilter)}
                placeholder="Tất cả"
                searchPlaceholder="Tìm lỗi gửi..."
                className="h-11 min-w-0 bg-white px-2 text-xs md:h-10 md:px-3 md:text-[13px]"
              />
            </label>
          </div>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="order-4 col-span-3 h-11 w-full justify-center rounded-xl bg-primary px-4 text-[13px] font-bold text-white transition hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2 md:order-none md:h-10 md:w-auto"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <div className="h-16 bg-muted/40 rounded-xl animate-pulse" />
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Không tải được danh sách tổng kết. Vui lòng thử lại.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3 sm:gap-3 md:mb-4 md:grid-cols-5">
            <SummaryStatCard label="Tổng khách" value={stats.total} />
            <SummaryStatCard label="Đã gửi" value={stats.sent} colorClass="bg-emerald-50/70" />
            <SummaryStatCard label="Thất bại" value={stats.failed} colorClass="bg-red-50/70" />
            <SummaryStatCard label="Bỏ qua" value={stats.skipped} colorClass="bg-amber-50/70" />
            <SummaryStatCard label="Chưa gửi" value={stats.pending} colorClass="bg-slate-50/70" />
          </div>

          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              Đã chọn <span className="font-black text-foreground">{selectedItems.length}</span> khách trong danh sách lọc.
            </div>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground md:hidden">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                disabled={sortedItems.length === 0 || isAnySending}
                onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
              />
              Chọn tất cả đang hiển thị
            </label>
            <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
              <button
                onClick={() => setSelectedTargetIds([])}
                disabled={selectedItems.length === 0 || isAnySending}
                className="h-10 px-3 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold disabled:opacity-60 md:h-9"
              >
                Bỏ chọn
              </button>
              <button
                onClick={handleBulkSend}
                disabled={selectedItems.length === 0 || isAnySending}
                className="h-10 justify-center px-3 rounded-lg bg-primary text-white hover:bg-primary/90 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-60 md:h-9"
              >
                <SendHorizonal size={14} />
                {bulkSendMutation.isPending ? 'Đang gửi hàng loạt' : 'Gửi đã chọn'}
              </button>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {sortedItems.length === 0 ? (
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                Không có dữ liệu {summaryTypeLabelMap[type]} trong ngày đã chọn.
              </div>
            ) : (
              sortedItems.map((item, index) => {
                const isSending = sendMutation.isPending && sendMutation.variables?.targetId === item.targetId;
                return (
                  <article key={item.targetId} className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm shadow-black/[0.03]">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIdSet.has(item.targetId)}
                        disabled={isAnySending}
                        onChange={(e) => toggleSelectOne(item.targetId, e.target.checked)}
                        className="mt-1 h-5 w-5 rounded border-border text-primary focus:ring-primary/40"
                        aria-label={`Chọn ${item.targetName}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">#{index + 1}</div>
                            <h2 className="break-words text-base font-black leading-snug text-foreground">{item.targetName || '-'}</h2>
                          </div>
                          <span className={`shrink-0 inline-flex px-2 py-1 rounded-full border text-xs font-semibold ${statusClassMap[item.status]}`}>
                            {statusLabelMap[item.status]}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl bg-muted/40 p-2">
                            <div className="font-semibold text-muted-foreground">SĐT</div>
                            <div className="mt-1 font-bold text-foreground break-all">{item.targetPhone || '-'}</div>
                          </div>
                          <div className="rounded-xl bg-muted/40 p-2">
                            <div className="font-semibold text-muted-foreground">Đơn / dòng</div>
                            <div className="mt-1 font-bold text-foreground tabular-nums">{item.orderCount} / {item.itemRowCount}</div>
                          </div>
                          <div className="col-span-2 rounded-xl bg-muted/40 p-2">
                            <div className="font-semibold text-muted-foreground">Lần gửi cuối</div>
                            <div className="mt-1 text-foreground">{formatDateTime(item.lastSentAt)} • {item.triggeredBy ? triggerLabelMap[item.triggeredBy] : '-'}</div>
                          </div>
                          {item.lastError ? (
                            <div className="col-span-2 rounded-xl bg-red-50 p-2 text-red-700">
                              <div className="font-semibold">Lỗi gửi</div>
                              <div className="mt-1 break-words">{item.lastError}</div>
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => window.open(item.publicLink, '_blank', 'noopener,noreferrer')}
                            className="h-10 rounded-xl border border-border bg-background hover:bg-muted text-xs font-semibold inline-flex items-center justify-center gap-1"
                          >
                            <ExternalLink size={14} />
                            Mở link
                          </button>
                          <button
                            onClick={() => sendMutation.mutate(item)}
                            disabled={isSending || bulkSendMutation.isPending}
                            className="h-10 rounded-xl bg-primary text-white hover:bg-primary/90 text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-60"
                          >
                            <SendHorizonal size={14} />
                            {isSending ? 'Đang gửi' : 'Gửi lại'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <div className="hidden rounded-2xl border border-border/60 bg-card overflow-hidden min-h-0 md:block">
            <div
              className="overflow-auto max-h-[calc(100vh-320px)] md:max-h-[calc(100vh-340px)] custom-scrollbar pb-3"
              style={{ scrollbarGutter: 'stable both-edges' }}
            >
              <table className="w-full min-w-[980px] text-sm mb-2">
                <thead className="bg-white border-b border-border/60 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        disabled={sortedItems.length === 0 || isAnySending}
                        onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                        aria-label="Chọn tất cả khách hàng đang hiển thị"
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-muted-foreground">#</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-muted-foreground">Khách hàng</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-muted-foreground">SĐT</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-muted-foreground">Số đơn</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-muted-foreground">Dòng hàng</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-muted-foreground">Trạng thái</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-muted-foreground">Lần gửi gần nhất</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-muted-foreground">Lỗi</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-muted-foreground">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        Không có dữ liệu {summaryTypeLabelMap[type]} trong ngày đã chọn.
                      </td>
                    </tr>
                  ) : (
                    sortedItems.map((item, index) => {
                      const isSending = sendMutation.isPending && sendMutation.variables?.targetId === item.targetId;
                      return (
                        <tr key={item.targetId} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedIdSet.has(item.targetId)}
                              disabled={isAnySending}
                              onChange={(e) => toggleSelectOne(item.targetId, e.target.checked)}
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                              aria-label={`Chọn ${item.targetName}`}
                            />
                          </td>
                          <td className="px-3 py-2 text-muted-foreground tabular-nums">{index + 1}</td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-foreground">{item.targetName || '-'}</div>
                          </td>
                          <td className="px-3 py-2 text-foreground">{item.targetPhone || '-'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.orderCount}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.itemRowCount}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex px-2 py-1 rounded-full border text-xs font-semibold ${statusClassMap[item.status]}`}>
                              {statusLabelMap[item.status]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            <div>{formatDateTime(item.lastSentAt)}</div>
                            <div>{item.triggeredBy ? triggerLabelMap[item.triggeredBy] : '-'}</div>
                          </td>
                          <td className="px-3 py-2 text-xs text-red-600 max-w-[260px] break-words">{item.lastError || '-'}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => window.open(item.publicLink, '_blank', 'noopener,noreferrer')}
                                className="h-8 px-2 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold inline-flex items-center gap-1"
                              >
                                <ExternalLink size={14} />
                                Mở link
                              </button>
                              <button
                                onClick={() => sendMutation.mutate(item)}
                                disabled={isSending || bulkSendMutation.isPending}
                                className="h-8 px-2 rounded-lg bg-primary text-white hover:bg-primary/90 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-60"
                              >
                                <SendHorizonal size={14} />
                                {isSending ? 'Đang gửi' : 'Gửi lại'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ZaloSummaryDispatchPage;
