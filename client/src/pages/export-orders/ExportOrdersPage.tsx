import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '../../components/shared/PageHeader';
import { useExportOrders, useDeleteExportOrders } from '../../hooks/queries/useExportOrders';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import StatusBadge from '../../components/shared/StatusBadge';
import { Plus, X, Filter, Image as ImageIcon, Eye, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import { clsx } from 'clsx';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import DraggableFAB from '../../components/shared/DraggableFAB';
import AddEditExportOrderDialog from './dialogs/AddEditExportOrderDialog';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';
import { cloudinaryFull } from '../../lib/cloudinaryUrl';

const paymentLabels: Record<string, string> = {
  unpaid: 'Chưa thanh toán',
  partial: 'Thanh toán một phần',
  paid: 'Đã thanh toán',
};

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const PAGE_SIZE = 50;

const ExportOrdersPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const { data: response, isLoading, isError, refetch } = useExportOrders({ page, limit: PAGE_SIZE });
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const deleteMutation = useDeleteExportOrders();

  const orders = response?.data || [];
  const meta = response?.meta;
  const totalPages = meta ? Math.ceil(meta.total / meta.limit) : 1;

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddClosing, setIsAddClosing] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);

  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const resetPage = () => setPage(1);

  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 300);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (searchText.trim()) {
        if (!matchesSearch((o as any).product_name || '', searchText)) {
          return false;
        }
      }
      if (filterDateFrom && o.export_date < filterDateFrom) return false;
      if (filterDateTo && o.export_date > filterDateTo) return false;
      return true;
    });
  }, [orders, searchText, filterDateFrom, filterDateTo]);

  const closeAddDialog = () => {
    setIsAddClosing(true);
    setTimeout(() => {
      setIsAddOpen(false);
      setIsAddClosing(false);
    }, 350);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Xuất hàng"
          description="Quản lý phiếu xuất kho"
          backPath="/app/hang-hoa"
          actions={
            <button
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
            >
              <Plus size={16} />
              Thêm phiếu xuất
            </button>
          }
        />
      </div>
      <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0">
        {/* Toolbar */}
        <div className="p-3 border-b border-border flex flex-col md:flex-row items-stretch md:items-center gap-2">
          <div className="flex w-full md:flex-1 gap-2">
            {isAdmin && selectedIds.size > 0 ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-[13px] font-bold text-foreground shrink-0">
                  Đã chọn {selectedIds.size} mục
                </span>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Bỏ chọn
                </button>
              </div>
            ) : (
          <div className="flex-1">
            <SearchInput
              placeholder="Tìm kiếm theo mặt hàng..."
              onSearch={(raw) => { setSearchText(raw); resetPage(); }}
            />
          </div>
            )}

            <button
              onClick={() => setIsFilterOpen(true)}
              className={clsx(
                "md:hidden flex items-center justify-center w-[38px] shrink-0 border border-border/80 rounded-xl transition-all",
                (filterDateFrom || filterDateTo) ? "bg-primary/10 text-primary border-primary/30" : "bg-muted/20 text-muted-foreground hover:bg-muted"
              )}
            >
              <Filter size={18} />
            </button>

            {/* Delete Button - visible when items selected (admin only) */}
            {isAdmin && selectedIds.size > 0 && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white hover:bg-red-600 rounded-xl text-[12px] font-bold transition-all shrink-0 shadow-sm"
              >
                <Trash2 size={14} />
                <span className="hidden sm:inline">Xóa ({selectedIds.size})</span>
                <span className="sm:hidden">{selectedIds.size}</span>
              </button>
            )}
          </div>
          <div className="hidden md:block relative z-20 flex-none">
            <DateRangePicker
              initialDateFrom={filterDateFrom || undefined}
              initialDateTo={filterDateTo || undefined}
              onUpdate={({ range }) => {
                const format = (d: Date) => {
                  const local = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
                  return local.toISOString().split('T')[0];
                };
                setFilterDateFrom(range.from ? format(range.from) : '');
                setFilterDateTo(range.to ? format(range.to) : '');
                resetPage();
              }}
            />
          </div>
          {(searchText || filterDateFrom || filterDateTo) && (
            <button
              onClick={() => { setSearchText(''); setFilterDateFrom(''); setFilterDateTo(''); resetPage(); }}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-dashed border-red-300 text-red-500 text-[12px] font-bold hover:bg-red-500/10 transition-all shrink-0 justify-center"
            >
              <X size={14} />
              Xóa lọc
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-4"><LoadingSkeleton rows={6} columns={6} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : filteredOrders.length === 0 ? (
          <EmptyState title="Không tìm thấy phiếu xuất" description="Thử thay đổi bộ lọc hoặc thêm phiếu xuất mới." />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block flex-1 overflow-auto custom-scrollbar">
              <table className="w-full border-collapse min-w-[700px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/30 border-b border-border">
                    {isAdmin && (
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/20 cursor-pointer"
                          checked={filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(o.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(new Set(filteredOrders.map((o) => o.id)));
                            } else {
                              setSelectedIds(new Set());
                            }
                          }}
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Ngày</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Giờ</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Khách hàng</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center">Ảnh</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Mặt hàng</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">SL</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Số tiền</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center">Thanh toán</th>
                    {isAdmin && <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className={`hover:bg-muted/20 transition-colors ${selectedIds.has(o.id) ? 'bg-primary/5' : ''}`}>
                      {isAdmin && (
                        <td className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                            checked={selectedIds.has(o.id)}
                            onChange={(e) => {
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(o.id);
                              else next.delete(o.id);
                              setSelectedIds(next);
                            }}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums">{o.export_date}</td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums">{(o as any).export_time || '—'}</td>
                      <td className="px-4 py-3 text-[13px] font-semibold text-foreground">{(o as any).customers?.name || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {o.image_url ? (
                          <div
                            className="w-10 h-10 rounded-lg bg-primary/10 text-primary cursor-pointer mx-auto border border-primary/20 group relative flex items-center justify-center hover:bg-primary/15 transition-colors"
                            onClick={(e) => { e.stopPropagation(); setViewingImage(o.image_url!); }}
                            title="Xem ảnh"
                          >
                            <Eye size={18} />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted/30 flex items-center justify-center text-muted-foreground mx-auto">
                            <ImageIcon size={16} className="opacity-30" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] font-bold text-foreground">{(o as any).product_name}</td>
                      <td className="px-4 py-3 text-[13px] font-bold text-foreground text-right tabular-nums">{o.quantity}</td>
                      <td className="px-4 py-3 text-[13px] font-bold text-primary text-right tabular-nums">{formatCurrency(o.debt_amount)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={o.payment_status} label={paymentLabels[o.payment_status]} /></td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIds(new Set([o.id]));
                              setShowDeleteConfirm(true);
                            }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
                            title="Xóa"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {filteredOrders.map((o) => (
                <div
                  key={o.id}
                  className={`bg-card rounded-2xl border shadow-sm p-3 hover:shadow-md active:bg-muted/10 transition-all flex flex-col gap-2 ${isAdmin && selectedIds.has(o.id) ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
                >
                  <div className="flex gap-3">
                    {/* Checkbox (admin only) */}
                    {isAdmin && (
                      <div className="flex items-center shrink-0 self-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/20 cursor-pointer"
                          checked={selectedIds.has(o.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(o.id);
                            else next.delete(o.id);
                            setSelectedIds(next);
                          }}
                        />
                      </div>
                    )}

                    {/* Left: Image action */}
                    <div
                      className="w-[64px] h-[64px] shrink-0 bg-muted/20 rounded-lg overflow-hidden border border-border/50 self-center"
                      onClick={(e) => {
                        if (o.image_url) {
                          e.stopPropagation();
                          setViewingImage(o.image_url!);
                        }
                      }}
                    >
                      {o.image_url ? (
                        <div className="w-full h-full flex flex-col items-center justify-center text-primary bg-primary/10 cursor-pointer">
                          <Eye size={22} className="mb-0.5" />
                          <span className="text-[9px] font-bold">XEM ẢNH</span>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                          <ImageIcon size={20} className="opacity-30 mb-0.5" />
                          <span className="text-[9px] font-medium opacity-50">NO IMG</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Data */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <span className="text-[13px] font-bold text-foreground leading-tight truncate">
                          {(o as any).customers?.name || '—'}
                        </span>
                        <StatusBadge status={o.payment_status} label={paymentLabels[o.payment_status]} />
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[12px] font-bold text-foreground">{(o as any).product_name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded">SL: {o.quantity.toLocaleString('vi-VN')}</span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{o.export_date}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {(o.debt_amount && o.debt_amount > 0) ? (
                    <div className="flex items-center justify-end">
                      <span className="text-[13px] font-black text-primary tabular-nums">
                        {formatCurrency(o.debt_amount)}
                      </span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination Footer */}
        {meta && meta.total > PAGE_SIZE && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">
              Hiển thị {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, meta.total)} / {meta.total} phiếu
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-[12px] font-bold transition-all ${
                      page === pageNum
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Floating Action Button */}
      <DraggableFAB
        icon={<Plus size={24} />}
        onClick={() => setIsAddOpen(true)}
      />

      <AddEditExportOrderDialog
        isOpen={isAddOpen}
        isClosing={isAddClosing}
        onClose={closeAddDialog}
      />

      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        initialDateFrom={filterDateFrom}
        initialDateTo={filterDateTo}
        onApply={(filters) => {
          setFilterDateFrom(filters.dateFrom);
          setFilterDateTo(filters.dateTo);
          closeFilter();
        }}
        dateLabel="Khoảng thời gian"
      />

      {/* Confirm Delete Dialog (admin only) */}
      {isAdmin && (
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Xác nhận xóa"
          message={`Bạn có chắc muốn xóa ${selectedIds.size} phiếu xuất hàng đã chọn? Hành động này không thể hoàn tác.`}
          confirmLabel="Xóa"
          isLoading={deleteMutation.isPending}
          onConfirm={() => {
            deleteMutation.mutate(Array.from(selectedIds), {
              onSuccess: () => {
                setSelectedIds(new Set());
                setShowDeleteConfirm(false);
              },
            });
          }}
          onCancel={() => setShowDeleteConfirm(false)}
          variant="danger"
        />
      )}

      {/* Fullscreen Image Viewer */}
      {viewingImage && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-200"
          onClick={() => setViewingImage(null)}
        >
          <button
            onClick={() => setViewingImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
          >
            <X size={20} />
          </button>

          <img loading="lazy" decoding="async"
            src={cloudinaryFull(viewingImage)}
            alt="View full"
            className="max-w-[95vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

export default ExportOrdersPage;
