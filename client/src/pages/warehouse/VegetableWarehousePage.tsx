import React, { useState, useMemo } from 'react';
import { isSoftDeletedSourceOrder } from '../../utils/softDeletedOrder';
import PageHeader from '../../components/shared/PageHeader';
import { useDeliveryOrders, useDeleteDeliveryOrders } from '../../hooks/queries/useDelivery';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { Leaf, Calendar, User, Truck, Package, Filter, X, Trash2 } from 'lucide-react';
import AssignVehicleDialog from '../delivery/dialogs/AssignVehicleDialog';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useVehicles } from '../../hooks/queries/useVehicles';
import { deliveryOrderVisibleToUser, hasFullGoodsModuleAccess } from '../../utils/goodsModuleScope';

const formatNumber = (val?: number) => {
  if (val == null) return '0.00';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
};

const getTodayString = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getOneWeekAgoString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 6); // 7 days including today
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const VegetableWarehousePage: React.FC = () => {
  const { data: vehicles } = useVehicles();
  const today = getTodayString();
  const oneWeekAgo = getOneWeekAgoString();
  const [filterDateFrom, setFilterDateFrom] = useState(oneWeekAgo);
  const [filterDateTo, setFilterDateTo] = useState(today);
  const { data: deliveriesRaw, isLoading, isError, refetch } = useDeliveryOrders(filterDateFrom, filterDateTo, 'vegetable');
  const { user } = useAuth();
  const deliveries = useMemo(() => {
    let d = (deliveriesRaw || []).filter((x) => !isSoftDeletedSourceOrder(x));
    if (user && !hasFullGoodsModuleAccess(user)) {
      d = d.filter((x) =>
        deliveryOrderVisibleToUser(x, { id: user.id, role: user.role, full_name: user.full_name }, vehicles || [])
      );
    }
    return d;
  }, [deliveriesRaw, user, vehicles]);
  const deleteMutation = useDeleteDeliveryOrders();
  const isAdmin = user?.role === 'admin';
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Filter states
  const [filterReceiver, setFilterReceiver] = useState<string[]>([]);
  const [filterProduct, setFilterProduct] = useState<string[]>([]);

  // Mobile filter sheet
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isAssignClosing, setIsAssignClosing] = useState(false);

  const openAssign = (order: any) => {
    setSelectedOrder(order);
    setIsAssignOpen(true);
  };

  const closeAssign = () => {
    setIsAssignClosing(true);
    setTimeout(() => {
      setIsAssignOpen(false);
      setIsAssignClosing(false);
      setSelectedOrder(null);
    }, 350);
  };

  const openFilter = () => setIsFilterOpen(true);
  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 350);
  };

  // Calculate remaining for each delivery order and filter for > 0
  const inventoryItems = (deliveries || [])
    .map((d: any) => {
      const totalAssigned = (d.delivery_vehicles || []).reduce(
        (sum: number, dv: any) => sum + (dv.assigned_quantity || 0),
        0
      );
      const remaining = d.total_quantity - totalAssigned;
      return { ...d, remaining };
    })
    .filter((item: any) => item.remaining > 0);

  // Build filter options from data
  const { receiverOptions, productOptions } = useMemo(() => {
    const receiverSet = new Set<string>();
    const productSet = new Set<string>();

    inventoryItems.forEach((item: any) => {
      const orderData = item.vegetable_orders || item.import_orders || {};

      const rName = orderData.receiver_name?.trim() || orderData.customers?.name;
      if (rName) receiverSet.add(rName);

      if (item.product_name) productSet.add(item.product_name);
    });

    return {
      receiverOptions: Array.from(receiverSet).map(v => ({ label: v, value: v })),
      productOptions: Array.from(productSet).map(v => ({ label: v, value: v })),
    };
  }, [inventoryItems]);

  // Search + filter
  const filteredItems = inventoryItems.filter((item: any) => {
    const orderData = item.vegetable_orders || item.import_orders || {};
    const rName = orderData.receiver_name?.trim() || orderData.customers?.name || '';
    const sName = orderData.sender_name || orderData.customers?.name || '';
    const code = orderData.order_code || '';

    if (searchQuery) {
      const isMatch = matchesSearch(item.product_name, searchQuery) ||
        matchesSearch(code, searchQuery) ||
        matchesSearch(rName, searchQuery) ||
        matchesSearch(sName, searchQuery);
      if (!isMatch) return false;
    }

    // Receiver filter
    if (filterReceiver.length > 0 && !filterReceiver.includes(rName)) return false;

    // Product filter
    if (filterProduct.length > 0 && !filterProduct.includes(item.product_name)) return false;

    // Date filter
    if (filterDateFrom || filterDateTo) {
      const deliveryDate = item.delivery_date || '';
      if (filterDateFrom && deliveryDate < filterDateFrom) return false;
      if (filterDateTo && deliveryDate > filterDateTo) return false;
    }

    return true;
  });

  const hasActiveFilters = filterReceiver.length > 0 || filterProduct.length > 0 || !!filterDateFrom || !!filterDateTo;

  const clearFilters = () => {
    setFilterReceiver([]);
    setFilterProduct([]);
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Hàng trên Xe Tải lớn"
          description="Hàng rau tồn kho chờ giao hàng (Còn lại > 0)"
          backPath="/app/hang-hoa"
        />
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0">
        {/* Search & Filter Bar */}
        <div className="p-3 border-b border-border flex flex-row items-center gap-2">
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
            <div className="flex-1 min-w-0">
              <SearchInput
                placeholder="Tìm kiếm hàng rau, mã đơn..."
                onSearch={(raw) => setSearchQuery(raw)}
              />
            </div>
          )}

          {/* Desktop Filter Dropdowns - inline with search */}
          <div className="hidden md:flex gap-2 items-center shrink-0">
            <div className="w-[150px]">
              <MultiSearchableSelect
                options={receiverOptions}
                value={filterReceiver}
                onValueChange={setFilterReceiver}
                placeholder="Người nhận"
                className="bg-transparent"
                icon={<User size={15} />}
              />
            </div>
            <div className="w-[150px]">
              <MultiSearchableSelect
                options={productOptions}
                value={filterProduct}
                onValueChange={setFilterProduct}
                placeholder="Tên hàng"
                className="bg-transparent"
                icon={<Package size={15} />}
              />
            </div>
            <div className="hidden md:flex items-center gap-1 shrink-0 relative z-20">
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
                }}
              />
              {(filterDateFrom !== oneWeekAgo || filterDateTo !== today) && (
                <button
                  onClick={() => { setFilterDateFrom(oneWeekAgo); setFilterDateTo(today); }}
                  className="h-9.5 px-2.5 shrink-0 border border-border/80 rounded-xl text-[11px] font-bold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-all whitespace-nowrap"
                  title="Về một tuần qua"
                >
                  1 tuần qua
                </button>
              )}
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 rounded-xl border border-dashed border-red-300 text-red-500 text-[12px] font-bold hover:bg-red-50 transition-all shrink-0"
              >
                <X size={14} />
                Xóa lọc
              </button>
            )}
          </div>

          {/* Mobile Filter Button */}
          <button
            onClick={openFilter}
            className={`md:hidden flex items-center justify-center w-[38px] h-[38px] shrink-0 border border-border/80 rounded-xl transition-all ${hasActiveFilters ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' : 'bg-muted/20 text-muted-foreground hover:bg-muted'}`}
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

          <div className="flex shrink-0 items-center gap-1.5 px-3 py-2 bg-emerald-500/5 text-emerald-600 border border-emerald-500/10 rounded-xl text-[12px] font-bold">
            <Leaf size={14} />
            <span className="hidden sm:inline">Tổng cộng: {filteredItems.length} mặt hàng rau</span>
            <span className="sm:hidden">{filteredItems.length} MH</span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4"><LoadingSkeleton rows={10} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            title="Không có hàng rau tồn kho"
            description={searchQuery ? "Không tìm thấy hàng rau khớp với từ khóa." : "Tất cả đơn hàng rau đã được gán hết xe."}
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block flex-1 overflow-auto custom-scrollbar">
              <table className="w-full border-collapse min-w-[1000px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-emerald-50/60 border-b border-border">
                    {isAdmin && (
                      <th className="px-3 py-4 w-10">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-border text-emerald-600 focus:ring-emerald-500/20 cursor-pointer"
                          checked={filteredItems.length > 0 && filteredItems.every((i: any) => selectedIds.has(i.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(new Set(filteredItems.map((i: any) => i.id)));
                            } else {
                              setSelectedIds(new Set());
                            }
                          }}
                        />
                      </th>
                    )}
                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center">Ngày</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-left">Người gửi</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-left">Người nhận (vựa)</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center">Tổng số lượng</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center">Còn lại (Chưa gán)</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-left">Thông tin sản phẩm</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-left">Nhân viên nhận</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className={`hover:bg-emerald-50/30 transition-colors group ${isAdmin && selectedIds.has(item.id) ? 'bg-emerald-50/50' : ''}`}>
                      {isAdmin && (
                        <td className="px-3 py-4 w-10">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-border text-emerald-600 focus:ring-emerald-500/20 cursor-pointer"
                            checked={selectedIds.has(item.id)}
                            onChange={(e) => {
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              setSelectedIds(next);
                            }}
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[12px] font-bold text-foreground inline-flex items-center gap-1.5">
                            <Calendar size={14} className="text-emerald-500" />
                            {item.delivery_date ? new Date(item.delivery_date).toLocaleDateString('vi-VN') : '-'}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Ngày giao</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-[13px] font-medium text-muted-foreground">
                          {(() => {
                            const o = item.vegetable_orders || item.import_orders || {};
                            const sender = o.sender_name;
                            return sender || '-';
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
                          <User size={14} className="text-muted-foreground" />
                          {(() => {
                            const o = item.vegetable_orders || item.import_orders || {};
                            return o.receiver_name?.trim() || o.customers?.name || '-';
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[14px] font-bold text-muted-foreground tabular-nums">
                          {formatNumber(item.total_quantity)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="text-[16px] font-black text-emerald-600 tabular-nums">
                            {formatNumber(item.remaining)}
                          </span>
                          <div className="w-16 h-1 bg-emerald-100 rounded-full mt-1 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, (item.remaining / item.total_quantity) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                            <Leaf size={20} />
                          </div>
                          <div>
                            <h4 className="text-[14px] font-bold text-foreground">{item.product_name}</h4>
                            <span className="text-[11px] font-medium text-emerald-600 bg-emerald-500/5 px-2 py-0.5 rounded-full inline-block mt-1 uppercase tracking-tight">
                              {(item.vegetable_orders || item.import_orders)?.order_code || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-[13px] font-medium text-amber-700">
                          {(() => {
                            const o = item.vegetable_orders || item.import_orders || {};
                            return o.profiles?.full_name || '-';
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); openAssign(item); }}
                          className="px-3 py-1.5 bg-orange-100 text-orange-600 hover:bg-orange-200 font-bold text-[12px] rounded-lg transition-colors inline-flex items-center gap-1.5"
                        >
                          <Truck size={14} /> Phân xe
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden flex-1 overflow-y-auto p-3 flex flex-col gap-3">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-card rounded-2xl border shadow-sm p-4 cursor-pointer hover:shadow-md active:bg-muted/10 transition-all flex flex-col gap-3 group ${isAdmin && selectedIds.has(item.id) ? 'border-emerald-400/40 bg-emerald-50/30' : 'border-border'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {isAdmin && (
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500/20 cursor-pointer shrink-0"
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            setSelectedIds(next);
                          }}
                        />
                      )}
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex shrink-0 items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                        <User size={20} />
                      </div>
                      <div>
                        <h4 className="text-[14px] font-bold text-foreground line-clamp-1">
                          {(() => {
                            const o = item.vegetable_orders || item.import_orders || {};
                            return o.receiver_name?.trim() || o.customers?.name || '-';
                          })()}
                        </h4>
                        <span className="text-[11px] font-medium text-emerald-600 bg-emerald-500/5 px-2 py-0.5 rounded-full inline-block mt-1 uppercase tracking-tight">
                          {(item.vegetable_orders || item.import_orders)?.order_code || 'N/A'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); openAssign(item); }}
                      className="shrink-0 ml-2 px-3 py-1.5 bg-orange-100 text-orange-600 hover:bg-orange-200 font-bold text-[12px] rounded-xl transition-colors inline-flex items-center gap-1.5"
                    >
                      <Truck size={14} /> Phân xe
                    </button>
                  </div>

                  <div className="space-y-1.5 p-3 bg-emerald-50/40 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Leaf size={12} className="text-emerald-500 shrink-0" />
                      <span className="text-[13px] font-bold text-foreground">{item.product_name}</span>
                    </div>
                    {(() => {
                      const o = item.vegetable_orders || item.import_orders || {};
                      const sender = o.sender_name;
                      return sender ? (
                        <div className="flex items-center gap-2">
                          <span className="w-3 shrink-0" />
                          <span className="text-[11px] text-muted-foreground font-medium">Gửi: {sender}</span>
                        </div>
                      ) : null;
                    })()}
                    {(() => {
                      const o = item.vegetable_orders || item.import_orders || {};
                      const nv = o.profiles?.full_name;
                      return nv ? (
                        <div className="flex items-center gap-2">
                          <span className="w-3 shrink-0" />
                          <span className="text-[11px] text-amber-600 font-medium">NV: {nv}</span>
                        </div>
                      ) : null;
                    })()}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Tổng SL</span>
                      <span className="text-[13px] font-bold text-muted-foreground tabular-nums">
                        {formatNumber(item.total_quantity)}
                      </span>
                    </div>

                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Còn lại</span>
                      <span className="text-[14px] font-black text-emerald-600 tabular-nums">
                        {formatNumber(item.remaining)}
                      </span>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Ngày giao</span>
                      <span className="text-[12px] font-bold text-foreground inline-flex items-center gap-1">
                        <Calendar size={12} className="text-emerald-500" />
                        {item.delivery_date ? new Date(item.delivery_date).toLocaleDateString('vi-VN') : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <AssignVehicleDialog
        isOpen={isAssignOpen}
        isClosing={isAssignClosing}
        order={selectedOrder}
        onClose={closeAssign}
      />

      {/* Mobile Filter Bottom Sheet */}
      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={(filters) => {
          setFilterDateFrom(filters.dateFrom);
          setFilterDateTo(filters.dateTo);
        }}
        initialDateFrom={filterDateFrom}
        initialDateTo={filterDateTo}
        dateLabel="Ngày giao"
        onClear={() => {
          setFilterReceiver([]);
          setFilterProduct([]);
        }}
        showClearButton={filterReceiver.length > 0 || filterProduct.length > 0}
      >
        <div className="space-y-1.5 z-20">
          <label className="text-[13px] font-bold text-muted-foreground">Người nhận</label>
          <MultiSearchableSelect
            options={receiverOptions}
            value={filterReceiver}
            onValueChange={setFilterReceiver}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
            inline
            icon={<User size={15} />}
          />
        </div>
        <div className="space-y-1.5 z-10">
          <label className="text-[13px] font-bold text-muted-foreground">Tên hàng</label>
          <MultiSearchableSelect
            options={productOptions}
            value={filterProduct}
            onValueChange={setFilterProduct}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
            inline
            icon={<Package size={15} />}
          />
        </div>
      </MobileFilterSheet>

      {isAdmin && (
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Xác nhận xóa"
          message={`Bạn có chắc muốn xóa ${selectedIds.size} đơn giao hàng đã chọn? Hành động này không thể hoàn tác.`}
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
    </div>
  );
};

export default VegetableWarehousePage;
