import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/shared/PageHeader';
import { useExpenses } from '../../hooks/queries/useHR';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import StatusBadge from '../../components/shared/StatusBadge';
import { CustomSelect } from '../../components/shared/CustomSelect';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';
import { cloudinaryLarge, cloudinaryThumb } from '../../lib/cloudinaryUrl';
import { format } from 'date-fns';
import { Receipt, X, ChevronLeft, Image as ImageIcon, CalendarDays, User, Car, Banknote, CheckCircle2, ChevronRight as ChevronRightIcon, Printer } from 'lucide-react';
import { clsx } from 'clsx';
import type { Expense } from '../../types';

const VN_TZ = 'Asia/Ho_Chi_Minh';

function formatExpenseDateDisplay(raw: string): string {
  if (!raw) return '—';
  const ms = Date.parse(raw.length === 10 ? `${raw}T00:00:00+07:00` : raw);
  if (Number.isNaN(ms)) return raw;
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: VN_TZ, day: '2-digit' }).format(d);
  const month = new Intl.DateTimeFormat('en-GB', { timeZone: VN_TZ, month: '2-digit' }).format(d);
  const year = new Intl.DateTimeFormat('en-GB', { timeZone: VN_TZ, year: 'numeric' }).format(d);
  const tp = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hh = (tp.find((x) => x.type === 'hour')?.value ?? '00').padStart(2, '0');
  const min = (tp.find((x) => x.type === 'minute')?.value ?? '00').padStart(2, '0');
  return `${day}/${month}/${year} ${hh}:${min}`;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

const ExpenseHistoryPage = () => {
  const { data: expenses, isLoading, isError, refetch } = useExpenses();
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[] | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const openDetailDialog = (expense: Expense) => {
    setSelectedExpense(expense);
  };

  const closeDetailDialog = () => {
    setIsClosing(true);
    setTimeout(() => {
      setSelectedExpense(null);
      setIsClosing(false);
    }, 300);
  };

  const confirmedExpenses = useMemo(() => {
    if (!expenses?.length) return [];
    return expenses.filter((e) => e.payment_status === 'confirmed');
  }, [expenses]);

  const expenseTypes = useMemo(() => {
    const types = new Set<string>();
    confirmedExpenses.forEach((e) => {
      if (e.expense_name) types.add(e.expense_name);
    });
    return Array.from(types).sort();
  }, [confirmedExpenses]);

  const filterOptions = useMemo(() => {
    return [
      { value: 'all', label: 'Tất cả loại chi phí' },
      ...expenseTypes.map((t) => ({ value: t, label: t })),
    ];
  }, [expenseTypes]);

  const sorted = useMemo(() => {
    let result = [...confirmedExpenses];
    if (filterType !== 'all') {
      result = result.filter((e) => e.expense_name === filterType);
    }
    if (searchQuery) {
      result = result.filter((e) => {
        const matchName = matchesSearch(e.expense_name, searchQuery);
        const matchEmployee = e.employee?.full_name ? matchesSearch(e.employee.full_name, searchQuery) : false;
        const matchVehicle = e.vehicle?.license_plate ? matchesSearch(e.vehicle.license_plate, searchQuery) : false;
        return matchName || matchEmployee || matchVehicle;
      });
    }
    return result.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [confirmedExpenses, filterType, searchQuery]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Lịch sử chi phí"
          description="Danh sách phiếu theo thời điểm cập nhật gần nhất (hệ thống)."
          backPath="/chi-phi"
          actions={
            <Link
              to="/chi-phi/in-chi-phi"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
            >
              <Printer size={16} />
              In chi phí
            </Link>
          }
        />
      </div>

      <div className="bg-card rounded-2xl md:border md:border-border sm:shadow-sm flex flex-col flex-1 min-h-0 mt-0 md:mt-4">
        <div className="p-4 border-b border-border/50 flex flex-wrap items-center justify-start gap-4 bg-muted/5">
          <div className="w-full sm:w-[400px]">
            <SearchInput
              onSearch={(q) => setSearchQuery(q)}
              placeholder="Tìm kiếm..."
              className="bg-background shadow-sm"
            />
          </div>

          <CustomSelect
            value={filterType}
            onChange={setFilterType}
            options={filterOptions}
            placeholder="Loại chi phí..."
            className="w-full sm:w-[240px] shadow-sm"
          />
        </div>

        {isLoading ? (
          <div className="p-4">
            <LoadingSkeleton columns={6} rows={8} />
          </div>
        ) : isError ? (
          <ErrorState onRetry={refetch} />
        ) : !sorted.length ? (
          <EmptyState title="Chưa có dữ liệu chi phí" />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar">
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead className="bg-muted/30 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50">
                      Cập nhật lần cuối
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-l border-border/50">
                      Tên chi phí
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold text-emerald-600 uppercase tracking-wider text-right border-b border-l border-border/50">
                      Số tiền
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-l border-border/50 whitespace-nowrap">
                      Ngày giờ chi
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center border-b border-l border-border/50">
                      TT thanh toán
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center border-b border-l border-border/50">
                      Xác nhận
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-l border-border/50 w-24">
                      Mở
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {sorted.map((e: Expense) => (
                    <tr
                      key={e.id}
                      className="hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => openDetailDialog(e)}
                    >
                      <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums whitespace-nowrap">
                        {format(new Date(e.updated_at), 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="px-4 py-3 border-l border-border/30">
                        <div className="text-[14px] font-medium text-foreground">{e.expense_name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {e.employee?.full_name}
                          {e.vehicle?.license_plate && ` · ${e.vehicle.license_plate}`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right border-l border-border/30 font-bold text-emerald-600 tabular-nums">
                        {formatCurrency(Number(e.amount))}
                      </td>
                      <td className="px-4 py-3 border-l border-border/30 text-[13px] text-muted-foreground whitespace-nowrap">
                        {formatExpenseDateDisplay(e.expense_date)}
                      </td>
                      <td className="px-4 py-3 text-center border-l border-border/30">
                        <StatusBadge
                          status={e.payment_status === 'unpaid' ? 'unpaid' : 'paid'}
                          label={e.payment_status === 'unpaid' ? 'Chưa thanh toán' : 'Đã thanh toán'}
                        />
                      </td>
                      <td className="px-4 py-3 text-center border-l border-border/30">
                        <StatusBadge
                          status={e.payment_status === 'confirmed' ? 'approved' : 'pending'}
                          label={e.payment_status === 'confirmed' ? 'Đã xác nhận' : 'Chưa xác nhận'}
                        />
                      </td>
                      <td className="px-4 py-3 border-l border-border/30">
                        <button
                          onClick={() => openDetailDialog(e)}
                          className="inline-flex items-center gap-1 text-[12px] font-bold text-primary hover:underline"
                        >
                          Phiếu
                          <Receipt size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2 p-3 sm:hidden pb-20">
              {sorted.map((e: Expense) => (
                <div
                  key={e.id}
                  className="rounded-xl border border-border/60 bg-card p-3 text-[13px] space-y-2 shadow-sm cursor-pointer active:scale-[0.98] transition-all"
                  onClick={() => openDetailDialog(e)}
                >
                  <div className="flex justify-between gap-2 items-start">
                    <span className="font-bold text-foreground leading-snug">{e.expense_name}</span>
                    <span className="text-emerald-600 font-black tabular-nums shrink-0">
                      {formatCurrency(Number(e.amount))}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Cập nhật: {format(new Date(e.updated_at), 'dd/MM/yyyy HH:mm')}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <StatusBadge
                      status={e.payment_status === 'unpaid' ? 'unpaid' : 'paid'}
                      label={e.payment_status === 'unpaid' ? 'Chưa TT' : 'Đã TT'}
                    />
                    <StatusBadge
                      status={e.payment_status === 'confirmed' ? 'approved' : 'pending'}
                      label={e.payment_status === 'confirmed' ? 'Đã xác nhận' : 'Chưa xác nhận'}
                    />
                  </div>
                  <button
                    onClick={() => openDetailDialog(e)}
                    className="inline-flex items-center gap-1 text-[12px] font-bold text-primary"
                  >
                    Mở phiếu chi phí
                    <Receipt size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {(selectedExpense || isClosing) && createPortal(
        <div className="fixed inset-0 z-[9999] flex justify-end">
          <div
            className={clsx(
              'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-350 ease-out',
              isClosing ? 'opacity-0' : 'animate-in fade-in duration-300',
            )}
            onClick={closeDetailDialog}
          />
          <div
            className={clsx(
              'relative w-full max-w-[500px] bg-background shadow-2xl flex flex-col md:h-screen h-[100dvh] border-l border-border',
              isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
            )}
          >
            <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <Receipt size={20} />
                </div>
                <h2 className="text-lg font-bold text-foreground">Chi tiết phiếu chi</h2>
              </div>
              <button
                onClick={closeDetailDialog}
                className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Header Info */}
              <div className="bg-emerald-500/5 rounded-2xl border border-emerald-500/10 p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[12px] font-bold text-emerald-600 uppercase tracking-wider">Tổng số tiền</p>
                  <p className="text-2xl font-black text-emerald-600 tabular-nums">
                    {formatCurrency(Number(selectedExpense?.amount))}
                  </p>
                </div>
                <StatusBadge status="approved" label="Đã xác nhận" />
              </div>

              {/* General Details */}
              <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
                  <Receipt size={16} className="text-primary" />
                  <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Thông tin chung</span>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-[1fr_2fr] items-baseline gap-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Receipt size={14} />
                      <span className="text-[13px] font-medium">Tên chi phí</span>
                    </div>
                    <span className="text-[14px] font-bold text-foreground">{selectedExpense?.expense_name}</span>
                  </div>

                  <div className="grid grid-cols-[1fr_2fr] items-baseline gap-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User size={14} />
                      <span className="text-[13px] font-medium">Nhân viên</span>
                    </div>
                    <span className="text-[14px] font-medium text-foreground">{selectedExpense?.employee?.full_name}</span>
                  </div>

                  {selectedExpense?.vehicle && (
                    <div className="grid grid-cols-[1fr_2fr] items-baseline gap-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Car size={14} />
                        <span className="text-[13px] font-medium">Xe</span>
                      </div>
                      <span className="text-[14px] font-medium text-foreground">{selectedExpense.vehicle.license_plate}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-[1fr_2fr] items-baseline gap-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CalendarDays size={14} />
                      <span className="text-[13px] font-medium">Ngày giờ chi</span>
                    </div>
                    <span className="text-[14px] font-medium text-foreground tabular-nums">
                      {selectedExpense && formatExpenseDateDisplay(selectedExpense.expense_date)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Approval Details */}
              <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span className="text-[12px] font-bold text-emerald-500 uppercase tracking-wider">Xác nhận & Thanh toán</span>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-[1fr_2fr] items-baseline gap-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Banknote size={14} />
                      <span className="text-[13px] font-medium">TT thanh toán</span>
                    </div>
                    <StatusBadge
                      status={selectedExpense?.payment_status === 'unpaid' ? 'unpaid' : 'paid'}
                      label={selectedExpense?.payment_status === 'unpaid' ? 'Chưa thanh toán' : 'Đã thanh toán'}
                    />
                  </div>

                  <div className="grid grid-cols-[1fr_2fr] items-baseline gap-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User size={14} />
                      <span className="text-[13px] font-medium">Người xác nhận</span>
                    </div>
                    <span className="text-[14px] font-medium text-foreground">
                      {selectedExpense?.confirmer?.full_name || 'Hệ thống'}
                    </span>
                  </div>

                  <div className="grid grid-cols-[1fr_2fr] items-baseline gap-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CalendarDays size={14} />
                      <span className="text-[13px] font-medium">Thời điểm xác nhận</span>
                    </div>
                    <span className="text-[14px] font-medium text-muted-foreground tabular-nums">
                      {selectedExpense && format(new Date(selectedExpense.updated_at), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Images */}
              {selectedExpense?.image_urls && selectedExpense.image_urls.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ImageIcon size={16} />
                    <span className="text-[13px] font-bold uppercase tracking-wider">Hình ảnh / Hóa đơn</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedExpense.image_urls.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setPreviewImages(selectedExpense.image_urls);
                          setCurrentImageIndex(idx);
                        }}
                        className="relative aspect-[4/3] rounded-xl border border-border overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all group"
                      >
                        <img loading="lazy" decoding="async" src={cloudinaryThumb(url)} alt="Receipt" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card border-t border-border px-6 py-4 shrink-0">
              <button
                onClick={closeDetailDialog}
                className="w-full py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-[14px] font-bold transition-all"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {previewImages && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 animate-in fade-in duration-300">
          <button
            onClick={() => setPreviewImages(null)}
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-[10001]"
          >
            <X size={24} />
          </button>

          {previewImages.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : previewImages.length - 1));
                }}
                className="absolute left-6 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-[10001]"
              >
                <ChevronLeft size={32} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentImageIndex((prev) => (prev < previewImages.length - 1 ? prev + 1 : 0));
                }}
                className="absolute right-6 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-[10001]"
              >
                <ChevronRightIcon size={32} />
              </button>
            </>
          )}

          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">
            <img loading="lazy" decoding="async"
              src={cloudinaryLarge(previewImages[currentImageIndex])}
              alt="Preview"
              className="max-w-full max-h-[80vh] object-contain shadow-2xl rounded-lg animate-in zoom-in-95 duration-300"
            />
            {previewImages.length > 1 && (
              <div className="mt-4 px-4 py-2 bg-white/10 rounded-full text-white text-[13px] font-medium">
                {currentImageIndex + 1} / {previewImages.length}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ExpenseHistoryPage;
