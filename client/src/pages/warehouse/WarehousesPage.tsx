import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import {
  Calendar,
  PlusCircle,
  Truck,
  Check,
  CheckCircle,
  Pencil,
  Store,
  Package,
  User,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import PageHeader from '../../components/shared/PageHeader';
import { useDeliveryOrders, useConfirmWarehouse } from '../../hooks/queries/useDelivery';
import { useVehicles } from '../../hooks/queries/useVehicles';
import { useAuth } from '../../context/AuthContext';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import AssignVehicleDialog from '../delivery/dialogs/AssignVehicleDialog';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';
import { getDeliveryAnchorDateString } from '../../lib/deliveryDayAnchor';
import { isOldOrderForAgeRule, getDeliveryRemainingQty } from '../../lib/deliveryAgeRule';
import {
  createDeliveryGroupSourceIdsMap,
  getReceiverDisplayName,
  groupDeliveryOrdersForView,
} from '../../lib/deliveryGrouping';
import type { DeliveryOrder, Vehicle } from '../../types';
import { isSoftDeletedSourceOrder } from '../../utils/softDeletedOrder';
import { deliveryOrderVisibleToUser, hasFullGoodsModuleAccess } from '../../utils/goodsModuleScope';
import { VehicleCellTooltip } from '../delivery/components/VehicleCellTooltip';

// ---------------------------------------------------------------------------
// Helpers (copied from DeliveryPage)
// ---------------------------------------------------------------------------

const formatNumber = (val?: number) => {
  if (val == null) return '0';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val);
};

const isPaidCollectionStatus = (status?: string) => status === 'confirmed' || status === 'self_confirmed';

const vehicleSupportsGoodsCategory = (vehicle: Vehicle, category: 'grocery' | 'vegetable') => {
  if (!vehicle.goods_categories || vehicle.goods_categories.length === 0) return true;
  return vehicle.goods_categories.includes(category);
};

const getOrderCreatedAt = (order: DeliveryOrder) => {
  const createdAt = new Date(order.created_at);
  return Number.isNaN(createdAt.getTime()) ? null : createdAt;
};

const getOrderCreatedDateKey = (order: DeliveryOrder) => {
  const createdAt = getOrderCreatedAt(order);
  return createdAt ? format(createdAt, 'yyyy-MM-dd') : 'N/A';
};

const compareOrderCreatedDesc = (a: DeliveryOrder, b: DeliveryOrder) => {
  const dateA = getOrderCreatedDateKey(a);
  const dateB = getOrderCreatedDateKey(b);
  if (dateA !== dateB) return dateB.localeCompare(dateA);

  const receiverCompare = getReceiverDisplayName(a).localeCompare(getReceiverDisplayName(b), 'vi');
  if (receiverCompare !== 0) return receiverCompare;

  const timeA = getOrderCreatedAt(a)?.getTime() ?? 0;
  const timeB = getOrderCreatedAt(b)?.getTime() ?? 0;
  return timeB - timeA;
};

const getDisplayProductName = (order: DeliveryOrder) =>
  order.product_name.includes(' - ')
    ? order.product_name.split(' - ').slice(1).join(' - ')
    : order.product_name;

const pickRelation = <T,>(relation: any): T | undefined => {
  if (Array.isArray(relation)) return relation[0];
  return relation || undefined;
};

const getImportReceivedByStaffName = (order: DeliveryOrder) => {
  const src = pickRelation<any>(order.import_orders) || pickRelation<any>(order.vegetable_orders);
  const name = src?.profiles?.full_name?.trim();
  return name || '—';
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

const ITEMS_PER_PAGE = 30;

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

const WarehousesPage: React.FC = () => {
  const { user } = useAuth();
  const today = getTodayString();
  const oneWeekAgo = getOneWeekAgoString();
  const [startDate, setStartDate] = useState<string>(oneWeekAgo);
  const [endDate, setEndDate] = useState<string>(today);

  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCustomer, setFilterCustomer] = useState<string[]>([]);
  const [filterReceiver, setFilterReceiver] = useState<string[]>([]);
  const [filterProduct, setFilterProduct] = useState<string[]>([]);
  const [filterVehicleIds, setFilterVehicleIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Assign dialog
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<'edit' | 'add-new' | 'view'>('edit');
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isAssignClosing, setIsAssignClosing] = useState(false);

  // Mobile filter sheet
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);

  const { data: ordersRaw, isLoading, isError, refetch } = useDeliveryOrders(
    startDate || undefined,
    endDate || undefined,
    'standard'
  );
  const { data: vehicles } = useVehicles();
  const confirmWarehouseMutation = useConfirmWarehouse();

  // ---------------------------------------------------------------------------
  // Derived role / vehicle state
  // ---------------------------------------------------------------------------

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const normalizedRole = (user?.role || '').toLowerCase();
  const isLoader = normalizedRole.includes('lo_xe') || normalizedRole.includes('lơ xe');
  const isDriver =
    normalizedRole === 'driver' ||
    normalizedRole.includes('tai_xe') ||
    normalizedRole.includes('tài xế') ||
    normalizedRole.includes('driver');

  const eligibleVehicles = React.useMemo(
    () => (vehicles || []).filter((v) => vehicleSupportsGoodsCategory(v, 'grocery')),
    [vehicles]
  );

  const myVehicleIds = React.useMemo(
    () =>
      eligibleVehicles
        .filter(
          (v) =>
            v.driver_id === user?.id ||
            v.in_charge_id === user?.id ||
            (user?.full_name && v.profiles?.full_name === user?.full_name) ||
            (user?.full_name && v.responsible_profile?.full_name === user?.full_name)
        )
        .map((v) => v.id),
    [eligibleVehicles, user]
  );

  const myPrimaryVehicleId = myVehicleIds[0];
  const myVehicleIdSet = React.useMemo(() => new Set(myVehicleIds), [myVehicleIds]);
  const canShowAssignButton = isAdmin || isLoader || (isDriver && myVehicleIds.length > 0);

  // ---------------------------------------------------------------------------
  // Base orders (visibility filtered)
  // ---------------------------------------------------------------------------

  const baseOrders = React.useMemo(
    () => (ordersRaw || []).filter((o) => !isSoftDeletedSourceOrder(o)),
    [ordersRaw]
  );

  const orders = React.useMemo(() => {
    const grouped = groupDeliveryOrdersForView(baseOrders, { includeWarehouseConfirmation: true });

    if (!user || hasFullGoodsModuleAccess(user)) return grouped;

    const actor = { id: user.id, role: user.role, full_name: user.full_name };
    return grouped.filter((groupOrder) =>
      Array.isArray(groupOrder.source_orders) &&
      groupOrder.source_orders.some((sourceOrder) =>
        deliveryOrderVisibleToUser(sourceOrder, actor, vehicles || [])
      )
    );
  }, [baseOrders, user, vehicles]);

  const groupToSourceIdsMap = React.useMemo(
    () => createDeliveryGroupSourceIdsMap(orders),
    [orders]
  );

  const expandGroupedIds = React.useCallback((ids: string[]) => {
    const expanded = new Set<string>();
    ids.forEach((id) => {
      const sourceIds = groupToSourceIdsMap.get(id) || [id];
      sourceIds.forEach((sourceId) => expanded.add(sourceId));
    });
    return Array.from(expanded);
  }, [groupToSourceIdsMap]);

  // ---------------------------------------------------------------------------
  // Inventory orders: old + not yet warehouse confirmed
  // ---------------------------------------------------------------------------

  const anchorStr = getDeliveryAnchorDateString();

  const inventoryOrders = React.useMemo(() => {
    return orders.filter((o) => {
      if (o.warehouse_confirmed_at) return false; // already confirmed → hide permanently
      if (!isOldOrderForAgeRule(o, anchorStr)) return false; // only old orders
      return true;
    });
  }, [orders, anchorStr]);

  // ---------------------------------------------------------------------------
  // Filter options
  // ---------------------------------------------------------------------------

  const { customerOptions, receiverOptions, productOptions } = React.useMemo(() => {
    const cSet = new Set<string>();
    const rSet = new Set<string>();
    const pSet = new Set<string>();
    inventoryOrders.forEach((o) => {
      const cName = o.import_orders?.sender_name || o.import_orders?.customers?.name;
      if (cName) cSet.add(cName);
      const rName =
        o.import_orders?.customers?.name ||
        o.import_orders?.receiver_name?.trim() ||
        o.import_orders?.profiles?.full_name;
      if (rName) rSet.add(rName);
      const pName = getDisplayProductName(o);
      if (pName) pSet.add(pName);
    });
    return {
      customerOptions: Array.from(cSet).map((c) => ({ label: c, value: c })),
      receiverOptions: Array.from(rSet).map((r) => ({ label: r, value: r })),
      productOptions: Array.from(pSet).map((p) => ({ label: p, value: p })),
    };
  }, [inventoryOrders]);

  const vehicleFilterOptions = React.useMemo(
    () =>
      [...eligibleVehicles]
        .map((v) => ({ label: v.license_plate?.trim() || '—', value: v.id }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    [eligibleVehicles]
  );

  // ---------------------------------------------------------------------------
  // Reset page on filter change
  // ---------------------------------------------------------------------------

  React.useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, searchQuery, filterCustomer, filterReceiver, filterProduct, filterVehicleIds]);

  // ---------------------------------------------------------------------------
  // Filter + search
  // ---------------------------------------------------------------------------

  const filteredOrders = React.useMemo(() => {
    return inventoryOrders
      .filter((o) => {
        const cName = o.import_orders?.sender_name || o.import_orders?.customers?.name;
        const rName =
          o.import_orders?.customers?.name ||
          o.import_orders?.receiver_name?.trim() ||
          o.import_orders?.profiles?.full_name;
        const pName = getDisplayProductName(o);
        const staffRecv = getImportReceivedByStaffName(o);

        if (searchQuery) {
          if (
            !matchesSearch(cName || '', searchQuery) &&
            !matchesSearch(rName || '', searchQuery) &&
            !matchesSearch(pName || '', searchQuery) &&
            !matchesSearch(o.import_orders?.order_code || '', searchQuery) &&
            !matchesSearch(staffRecv === '—' ? '' : staffRecv, searchQuery)
          ) {
            return false;
          }
        }
        if (filterCustomer.length > 0 && cName && !filterCustomer.includes(cName)) return false;
        if (filterReceiver.length > 0 && rName && !filterReceiver.includes(rName)) return false;
        if (filterProduct.length > 0 && pName && !filterProduct.includes(pName)) return false;

        if (filterVehicleIds.length > 0) {
          const assignedToSelected = (o.delivery_vehicles || []).some(
            (dv) =>
              dv.vehicle_id &&
              filterVehicleIds.includes(dv.vehicle_id) &&
              (dv.assigned_quantity || 0) > 0
          );
          if (!assignedToSelected) return false;
        }

        return true;
      })
      .sort(compareOrderCreatedDesc);
  }, [inventoryOrders, searchQuery, filterCustomer, filterReceiver, filterProduct, filterVehicleIds]);

  // ---------------------------------------------------------------------------
  // Selection helpers (admin only)
  // ---------------------------------------------------------------------------

  const isAllSelected =
    filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(o.id));
  const isSomeSelected = !isAllSelected && filteredOrders.some((o) => selectedIds.has(o.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map((o) => o.id)));
    }
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  const totalItems = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const paginatedOrders = React.useMemo(
    () => filteredOrders.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    ),
    [filteredOrders, currentPage]
  );

  // ---------------------------------------------------------------------------
  // Date grouping
  // ---------------------------------------------------------------------------

  const groupedOrders = React.useMemo(
    () => paginatedOrders.reduce<Record<string, DeliveryOrder[]>>((acc, order) => {
      const date = getOrderCreatedDateKey(order);
      if (!acc[date]) acc[date] = [];
      acc[date].push(order);
      return acc;
    }, {}),
    [paginatedOrders]
  );

  const sortedDates = React.useMemo(
    () => Object.keys(groupedOrders).sort((a, b) => b.localeCompare(a)),
    [groupedOrders]
  );
  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const openFilter = () => setIsFilterOpen(true);
  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 300);
  };

  const openAssign = (order: DeliveryOrder, vehicleId?: string, mode?: 'edit' | 'add-new' | 'view') => {
    setSelectedOrder(order);
    setSelectedVehicleId(vehicleId || myPrimaryVehicleId || null);
    setAssignMode(mode || 'edit');
    setIsAssignOpen(true);
    setIsAssignClosing(false);
  };

  const closeAssign = () => {
    setIsAssignClosing(true);
    setTimeout(() => {
      setIsAssignOpen(false);
      setIsAssignClosing(false);
      setSelectedOrder(null);
      setSelectedVehicleId(null);
    }, 350);
  };

  const handleConfirmWarehouse = async (orderIds: string[]) => {
    try {
      await confirmWarehouseMutation.mutateAsync(expandGroupedIds(orderIds));
    } catch {
      // Error handled by mutation's onError
    }
  };

  // Bulk confirm for selected (admin only)
  const handleBulkConfirm = () => {
    const confirmableIds = Array.from(selectedIds).filter((id) => {
      const o = filteredOrders.find((x) => x.id === id);
      if (!o) return false;
      const remaining = getDeliveryRemainingQty(o);
      return remaining <= 0 && !o.warehouse_confirmed_at;
    });
    if (confirmableIds.length === 0) return;
    handleConfirmWarehouse(confirmableIds);
    setSelectedIds(new Set());
  };

  // ---------------------------------------------------------------------------
  // Column count helper (for colSpan)
  // ---------------------------------------------------------------------------

  const baseColCount = (isAdmin ? 1 : 0) + 7; // checkbox? + action + type + receiver + staff + product + total + remaining
  const totalColCount = baseColCount + eligibleVehicles.length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader title="Tồn kho" description="Đơn hàng cũ chờ xác nhận tồn kho" backPath="/app/hang-hoa" />
      </div>

      {/* Search / filter bar */}
      <div className="bg-card flex flex-row w-full gap-2 items-center rounded-2xl shadow-sm border border-border p-2.5 md:mb-6 mb-3 overflow-x-auto custom-scrollbar">
        {/* Search */}
        <div className="flex-1 min-w-50 md:max-w-full">
          <SearchInput
            placeholder="Tìm mã, vựa, hàng..."
            onSearch={(raw) => setSearchQuery(raw)}
            className="h-9.5"
          />
        </div>

        {/* Desktop advanced filters */}
        <div className="hidden md:flex gap-2 items-center shrink-0">
          <div className="w-50">
            <MultiSearchableSelect
              options={customerOptions}
              value={filterCustomer}
              onValueChange={setFilterCustomer}
              placeholder="Tên vựa / chủ"
              className="bg-transparent"
              icon={<Store size={15} />}
            />
          </div>
          <div className="w-50">
            <MultiSearchableSelect
              options={receiverOptions}
              value={filterReceiver}
              onValueChange={setFilterReceiver}
              placeholder="Người nhận"
              className="bg-transparent"
              icon={<User size={15} />}
            />
          </div>
          <div className="w-50">
            <MultiSearchableSelect
              options={productOptions}
              value={filterProduct}
              onValueChange={setFilterProduct}
              placeholder="Tên hàng"
              className="bg-transparent"
              icon={<Package size={15} />}
            />
          </div>
          <div className="w-50">
            <MultiSearchableSelect
              options={vehicleFilterOptions}
              value={filterVehicleIds}
              onValueChange={setFilterVehicleIds}
              placeholder="Biển số xe"
              className="bg-transparent"
              icon={<Truck size={15} />}
            />
          </div>
        </div>

        {/* Desktop date picker */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          <DateRangePicker
            initialDateFrom={startDate}
            initialDateTo={endDate}
            onUpdate={(values) => {
              if (values.range.from) {
                setStartDate(format(values.range.from, 'yyyy-MM-dd'));
              } else {
                setStartDate('');
              }
              if (values.range.to) {
                setEndDate(format(values.range.to, 'yyyy-MM-dd'));
              } else {
                setEndDate('');
              }
            }}
          />
          {(startDate !== oneWeekAgo || endDate !== today) && (
            <button
              onClick={() => { setStartDate(oneWeekAgo); setEndDate(today); }}
              className="h-9.5 px-2.5 shrink-0 border border-border/80 rounded-xl text-[11px] font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all whitespace-nowrap"
              title="Về một tuần qua"
            >
              1 tuần qua
            </button>
          )}
        </div>

        {/* Mobile filter button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={openFilter}
            className="md:hidden flex items-center justify-center w-9.5 h-9.5 shrink-0 border border-border/80 rounded-xl transition-all bg-muted/20 text-muted-foreground hover:bg-muted"
          >
            <Filter size={17} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <LoadingSkeleton rows={10} columns={6} />
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !filteredOrders.length ? (
          <EmptyState
            title="Không có đơn tồn kho"
            description="Không có đơn hàng cũ nào chờ xác nhận tồn kho phù hợp với bộ lọc."
          />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar bg-muted/30 md:bg-transparent relative">
            {/* Desktop Table */}
            <div className="hidden md:block">
              <table className="w-full border-collapse bg-card">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-card border-b border-border text-muted-foreground">
                    {isAdmin && (
                      <th className="px-3 py-3 w-10 border-r border-border">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                            checked={isAllSelected}
                            onChange={toggleSelectAll}
                            ref={(input) => {
                              if (input) input.indeterminate = isSomeSelected;
                            }}
                          />
                        </div>
                      </th>
                    )}
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-28 border-r border-border">
                      Thao tác
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-16 border-r border-border">
                      Loại
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left min-w-20 border-r border-border">
                      Người nhận
                    </th>
                    <th className="px-3 py-3 text-[11px] font-bold uppercase tracking-tight text-left min-w-24 max-w-32 border-r border-border leading-tight">
                      NV nhận hàng
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left border-r border-border">
                      Hàng
                    </th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">
                      SL Tổng
                    </th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">
                      Còn lại
                    </th>
                    {eligibleVehicles.map((v) => (
                      <th
                        key={v.id}
                        className={clsx(
                          'px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-28 border-r border-border last:border-r-0',
                          myVehicleIdSet.has(v.id) && 'bg-primary/5 text-primary'
                        )}
                      >
                        {v.license_plate}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedDates.map((date) => (
                    <React.Fragment key={date}>
                      {/* Date separator row */}
                      <tr className="bg-muted/80 dark:bg-muted/40 border-y border-border shadow-sm overflow-hidden">
                        <td colSpan={totalColCount} className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {isAdmin && (
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer mr-2"
                                checked={
                                  groupedOrders[date].length > 0 &&
                                  groupedOrders[date].every((o) => selectedIds.has(o.id))
                                }
                                onChange={(e) => {
                                  const isChecked = e.target.checked;
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    groupedOrders[date].forEach((o) => {
                                      if (isChecked) next.add(o.id);
                                      else next.delete(o.id);
                                    });
                                    return next;
                                  });
                                }}
                                ref={(input) => {
                                  if (input) {
                                    const someSelected = groupedOrders[date].some((o) => selectedIds.has(o.id));
                                    const allSelected = groupedOrders[date].every((o) => selectedIds.has(o.id));
                                    input.indeterminate = someSelected && !allSelected;
                                  }
                                }}
                              />
                            )}
                            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary">
                              <Calendar size={14} />
                            </div>
                            <span className="text-[13px] font-black text-foreground uppercase tracking-wider">
                              Ngày tạo đơn: {new Date(date).toLocaleDateString('vi-VN')}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Order rows */}
                      {groupedOrders[date].map((o) => {
                        const remainingQty = getDeliveryRemainingQty(o);

                        return (
                          <tr
                            key={o.id}
                            className={clsx(
                              'transition-colors group',
                              selectedIds.has(o.id)
                                ? 'bg-primary/5 dark:bg-primary/10'
                                : 'hover:bg-muted/50'
                            )}
                          >
                            {/* Checkbox (admin) */}
                            {isAdmin && (
                              <td className="px-3 py-3 border-r border-border text-center">
                                <div className="flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                                    checked={selectedIds.has(o.id)}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      toggleSelectId(o.id);
                                    }}
                                  />
                                </div>
                              </td>
                            )}

                            {/* Action buttons */}
                            <td className="px-2 py-3 border-r border-border text-center">
                              <div className="flex items-center justify-center gap-1">
                                {/* Phân xe: remaining > 0 + canShowAssignButton */}
                                {remainingQty > 0 && canShowAssignButton && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openAssign(o);
                                    }}
                                    className="p-1.5 rounded-md transition-colors bg-orange-500/10 text-orange-600 dark:text-orange-500 hover:bg-orange-500/20"
                                    title="Phân xe"
                                  >
                                    <Truck size={14} strokeWidth={2.5} />
                                  </button>
                                )}
                                {/* Xác nhận giao: admin + old + remaining<=0 + not confirmed */}
                                {remainingQty <= 0 && isAdmin && !o.warehouse_confirmed_at && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleConfirmWarehouse([o.id]);
                                    }}
                                    disabled={confirmWarehouseMutation.isPending}
                                    className="p-1.5 rounded-md transition-colors bg-green-500/10 text-green-600 dark:text-green-500 hover:bg-green-500/20 disabled:opacity-50"
                                    title="Xác nhận giao"
                                  >
                                    <Check size={14} strokeWidth={2.5} />
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Mới/Cũ badge */}
                            <td className="px-4 py-3 border-r border-border text-center">
                              <div className="flex items-center justify-center">
                                {!isOldOrderForAgeRule(o, anchorStr) ? (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/10 text-emerald-700 uppercase">
                                    Mới
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-muted text-muted-foreground uppercase">
                                    Cũ
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Người nhận */}
                            <td className="px-4 py-3 text-[12px] font-bold text-foreground border-r border-border">
                              {getReceiverDisplayName(o)}
                            </td>

                            {/* NV nhận hàng */}
                            <td className="px-3 py-3 text-[12px] text-muted-foreground border-r border-border max-w-32">
                              <span className="line-clamp-2" title={getImportReceivedByStaffName(o)}>
                                {getImportReceivedByStaffName(o)}
                              </span>
                            </td>

                            {/* Hàng */}
                            <td className="px-4 py-3 text-[13px] font-medium text-muted-foreground border-r border-border">
                              {getDisplayProductName(o)}
                            </td>

                            {/* SL Tổng */}
                            <td className="px-2 py-3 text-[13px] font-bold text-muted-foreground text-center tabular-nums border-r border-border">
                              {formatNumber(o.total_quantity)}
                            </td>

                            {/* Còn lại */}
                            <td className="px-2 py-3 text-[13px] font-black text-orange-600 dark:text-orange-500 text-center tabular-nums border-r border-border">
                              {formatNumber(remainingQty > 0 ? remainingQty : 0)}
                            </td>

                            {/* Vehicle columns */}
                            {eligibleVehicles.map((v) => {
                              const dvs = (o.delivery_vehicles || []).filter(
                                (deliveryVehicle) => deliveryVehicle.vehicle_id === v.id && (deliveryVehicle.assigned_quantity || 0) > 0
                              );
                              const totalQty = dvs.reduce((sum, dv) => sum + (dv.assigned_quantity || 0), 0);
                              const isEditableByMe = myVehicleIdSet.has(v.id);
                              const canEdit = isEditableByMe || isAdmin;
                              const isExportPaid = dvs.length > 0 && dvs.some(dv => dv.export_payment_status === 'paid');
                              const isCollectionPaid = (o.payment_collections || []).some(
                                (pc) => pc.vehicle_id === v.id && isPaidCollectionStatus(pc.status)
                              );

                              return (
                                <td
                                  key={v.id}
                                  onClick={() => {
                                    if (canEdit && totalQty === 0 && remainingQty > 0) {
                                      openAssign(o, v.id);
                                    }
                                  }}
                                  className={clsx(
                                    'px-1 py-1 text-[13px] text-center tabular-nums border-r border-border last:border-r-0 transition-all relative group/cell',
                                    totalQty > 0 ? 'font-bold' : 'text-muted-foreground/30',
                                    canEdit &&
                                      totalQty === 0 &&
                                      remainingQty > 0 &&
                                      'cursor-pointer hover:bg-primary/5 active:scale-95'
                                  )}
                                >
                                  {dvs.length > 0 ? (
                                    <div className="flex flex-col items-center justify-center">
                                      <div className="flex flex-wrap items-center justify-center gap-x-1">
                                        {dvs.map((dvItem, idx) => {
                                          const isDvExportPaid = dvItem.export_payment_status === 'paid';
                                          return (
                                            <React.Fragment key={dvItem.id || idx}>
                                              {idx > 0 && <span className="text-[10px] text-muted-foreground/50">+</span>}
                                              <VehicleCellTooltip dv={dvItem} vehicle={v} qty={dvItem.assigned_quantity || 0} isPaid={isCollectionPaid} exportPaid={isDvExportPaid}>
                                                <span
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (canEdit) {
                                                      openAssign(o, v.id, 'view');
                                                    }
                                                  }}
                                                  className={clsx(
                                                    'cursor-pointer underline decoration-dotted underline-offset-2',
                                                    isDvExportPaid ? 'text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 decoration-emerald-500/30' : 'text-red-600 dark:text-red-500 hover:text-red-700 decoration-red-500/30'
                                                  )}
                                                >
                                                  {formatNumber(dvItem.assigned_quantity)}
                                                </span>
                                              </VehicleCellTooltip>
                                            </React.Fragment>
                                          );
                                        })}
                                      </div>
                                      {canEdit && (
                                        <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openAssign(o, v.id, 'edit');
                                            }}
                                          className={clsx(
                                            'absolute top-0.5 right-0.5 opacity-0 group-hover/cell:opacity-100 p-0.5 rounded transition-opacity',
                                            isExportPaid ? 'text-emerald-600 hover:bg-emerald-500/20' : 'text-red-600 hover:bg-red-500/20'
                                          )}
                                          title="Chỉnh sửa phân xe"
                                        >
                                          <Pencil size={11} strokeWidth={2.5} />
                                        </button>
                                      )}
                                      {isCollectionPaid && (
                                        <div className="mt-0.5 flex items-center justify-center gap-0.5 text-green-600 bg-green-500/10 rounded-sm px-1" title="Đã xác nhận thu tiền">
                                          <CheckCircle size={8} strokeWidth={3} />
                                          <span className="text-[9px] font-black leading-none pb-px">Thu</span>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center">
                                      <span>
                                        {canEdit && remainingQty > 0 ? (
                                          <PlusCircle
                                            size={14}
                                            className="mx-auto opacity-10 group-hover/cell:opacity-40"
                                          />
                                        ) : (
                                          '-'
                                        )}
                                      </span>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden flex flex-col gap-3 px-3 pt-0 pb-20 relative">
              {sortedDates.map((date) => (
                <div key={`mobile-${date}`} className="flex flex-col gap-2.5">
                  {/* Date header */}
                  <div className="flex items-center gap-2 sticky top-0 bg-muted/80 dark:bg-muted/40 backdrop-blur-md p-3 -mx-3 px-5 z-10 border-b border-border shadow-sm">
                    {isAdmin && (
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded-md border-border text-primary focus:ring-primary mr-1"
                        checked={
                          groupedOrders[date].length > 0 &&
                          groupedOrders[date].every((o) => selectedIds.has(o.id))
                        }
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            groupedOrders[date].forEach((o) => {
                              if (isChecked) next.add(o.id);
                              else next.delete(o.id);
                            });
                            return next;
                          });
                        }}
                      />
                    )}
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary shrink-0">
                      <Calendar size={14} />
                    </div>
                    <span className="text-[13px] font-black text-foreground uppercase tracking-wider">
                      Ngày tạo đơn: {new Date(date).toLocaleDateString('vi-VN')}
                    </span>
                  </div>

                  {/* Order cards */}
                  <div className="flex flex-col gap-2.5 px-0.5">
                    {groupedOrders[date].map((o) => {
                      const remainingQty = getDeliveryRemainingQty(o);
                      const displayCustomerName = getReceiverDisplayName(o);

                      return (
                        <div
                          key={`mobile-order-${o.id}`}
                          className={clsx(
                            'bg-card rounded-xl border shadow-sm transition-all relative overflow-hidden',
                            remainingQty > 0
                              ? 'border-orange-500/30 dark:border-orange-500/20'
                              : 'border-border'
                          )}
                        >
                          {/* Card body */}
                          <div className="p-3 flex flex-col gap-2.5">
                            {isAdmin && (
                              <div
                                className="absolute top-2 right-2 z-10"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  className="w-5 h-5 rounded-md border-slate-300 text-primary focus:ring-primary"
                                  checked={selectedIds.has(o.id)}
                                  onChange={() => toggleSelectId(o.id)}
                                />
                              </div>
                            )}

                            {/* Row 1: Customer + Product */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <User size={13} className="text-muted-foreground/60 shrink-0 -mt-0.5" />
                                <span className="text-[13px] font-bold text-primary">
                                  {displayCustomerName}
                                </span>
                              </div>
                              <div className="w-1 h-1 rounded-full bg-border" />
                              <span className="text-[13px] font-bold text-foreground">
                                {getDisplayProductName(o)}
                              </span>
                            </div>

                            {/* NV nhận */}
                            <div className="text-[11px] text-muted-foreground">
                              <span className="font-semibold text-foreground/80">NV nhận:</span>{' '}
                              {getImportReceivedByStaffName(o)}
                            </div>

                            {/* Age badge + quantities */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {!isOldOrderForAgeRule(o, anchorStr) ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-700 uppercase shrink-0">
                                  Mới
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-muted text-muted-foreground uppercase shrink-0">
                                  Cũ
                                </span>
                              )}
                              <div className="flex items-center gap-1 ml-auto shrink-0">
                                <span className="text-[10px] uppercase font-black tracking-wider text-muted-foreground/60">
                                  SL:
                                </span>
                                <span className="text-[14px] font-bold text-foreground tabular-nums">
                                  {formatNumber(o.total_quantity)}
                                </span>
                                {remainingQty > 0 && (
                                  <span className="text-[11px] font-bold text-orange-600 dark:text-orange-500 ml-1">
                                    (Còn: {formatNumber(remainingQty)})
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Vehicle chips */}
                            {(o.delivery_vehicles || []).some((dv) => (dv.assigned_quantity || 0) > 0) && (
                              <div className="pt-2 border-t border-border flex flex-wrap gap-1.5">
                                {(o.delivery_vehicles || [])
                                  .filter((dv) => (dv.assigned_quantity || 0) > 0)
                                  .map((dv) => {
                                    const isPaid = (o.payment_collections || []).some(
                                      (pc) =>
                                        pc.vehicle_id === dv.vehicle_id &&
                                        isPaidCollectionStatus(pc.status)
                                    );
                                    return (
                                      <div
                                        key={dv.id}
                                        className={clsx(
                                          'flex items-center gap-1.5 px-2 py-1 rounded-md border',
                                          isPaid ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-100'
                                        )}
                                      >
                                        <Truck
                                          size={12}
                                          className={isPaid ? 'text-green-500' : 'text-blue-500'}
                                        />
                                        <span
                                          className={clsx(
                                            'text-[11px] font-bold',
                                            isPaid
                                              ? 'text-green-700 dark:text-green-500'
                                              : 'text-blue-700 dark:text-blue-500'
                                          )}
                                        >
                                          {dv.vehicles?.license_plate || '-'}
                                        </span>
                                        <span className="text-[11px] font-black text-foreground ml-1">
                                          {formatNumber(dv.assigned_quantity)}
                                        </span>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>

                          {/* Bottom action bar */}
                          {(isAdmin || canShowAssignButton) && (
                            <div className="flex border-t border-slate-100 divide-x divide-slate-100">
                              {/* Phân xe */}
                              {remainingQty > 0 && canShowAssignButton && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openAssign(o);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-orange-600 dark:text-orange-500 hover:bg-orange-500/10 text-[12px] font-bold transition-colors"
                                >
                                  <Truck size={14} strokeWidth={2.5} />
                                  Phân xe
                                </button>
                              )}
                              {/* Xác nhận giao */}
                              {remainingQty <= 0 && isAdmin && !o.warehouse_confirmed_at && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirmWarehouse([o.id]);
                                  }}
                                  disabled={confirmWarehouseMutation.isPending}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-50 text-green-700 dark:text-green-500 hover:bg-green-100 text-[12px] font-bold transition-colors disabled:opacity-50"
                                >
                                  <Check size={14} strokeWidth={2.5} />
                                  Xác nhận giao
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card sticky bottom-0 z-20">
                <div className="text-[12px] text-muted-foreground font-medium hidden md:block">
                  Hiển thị {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{' '}
                  {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} trong {totalItems} đơn hàng
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-[13px] font-bold disabled:opacity-50 hover:bg-muted transition-colors"
                  >
                    <ChevronLeft size={16} />
                    Trước
                  </button>
                  <span className="text-[13px] font-bold text-foreground">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-[13px] font-bold disabled:opacity-50 hover:bg-muted transition-colors"
                  >
                    Sau
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin bulk action bar (portal) */}
      {isAdmin && selectedIds.size > 0 &&
        createPortal(
          <div className="fixed bottom-0 md:bottom-6 left-0 right-0 md:left-1/2 md:-translate-x-1/2 bg-card md:rounded-2xl shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.15)] md:shadow-xl border-t md:border border-border p-3 z-[900] flex flex-col md:flex-row items-center gap-3 animate-in slide-in-from-bottom-10 md:min-w-[400px]">
            <div className="flex items-center gap-2 px-2 shrink-0 self-start md:self-auto w-full md:w-auto justify-between md:justify-start">
              <span className="text-[13px] font-bold text-foreground whitespace-nowrap">
                Đã chọn <strong className="text-primary">{selectedIds.size}</strong>
              </span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[12px] font-bold text-muted-foreground hover:text-foreground underline md:hidden"
              >
                Bỏ chọn
              </button>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto custom-scrollbar pb-1 md:pb-0">
              <button
                onClick={handleBulkConfirm}
                disabled={confirmWarehouseMutation.isPending}
                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] md:text-[13px] font-bold bg-green-600 text-white hover:bg-green-700 transition-all shadow-sm disabled:opacity-50"
              >
                <Check size={14} strokeWidth={2.5} />
                Xác nhận
              </button>
            </div>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="hidden md:flex ml-auto p-2 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted rounded-full transition-colors"
            >
              <X size={16} />
            </button>
          </div>,
          document.body
        )}

      {/* AssignVehicleDialog */}
      <AssignVehicleDialog
        isOpen={isAssignOpen}
        isClosing={isAssignClosing}
        order={selectedOrder}
        initialVehicleId={selectedVehicleId}
        allOrders={inventoryOrders}
        mode={assignMode}
        onClose={closeAssign}
      />

      {/* Mobile filter sheet */}
      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={(filters) => {
          setStartDate(filters.dateFrom || '');
          setEndDate(filters.dateTo || '');
        }}
        onClear={() => {
          setFilterCustomer([]);
          setFilterReceiver([]);
          setFilterProduct([]);
          setFilterVehicleIds([]);
        }}
        showClearButton={
          filterCustomer.length > 0 ||
          filterReceiver.length > 0 ||
          filterProduct.length > 0 ||
          filterVehicleIds.length > 0
        }
        initialDateFrom={startDate}
        initialDateTo={endDate}
        dateLabel="Khoảng thời gian"
      >
        <div className="space-y-1.5 z-30">
          <label className="text-[13px] font-bold text-muted-foreground">Tên vựa / chủ</label>
          <MultiSearchableSelect
            options={customerOptions}
            value={filterCustomer}
            onValueChange={setFilterCustomer}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
            inline
            icon={<Store size={15} />}
          />
        </div>
        <div className="space-y-1.5 z-25">
          <label className="text-[13px] font-bold text-muted-foreground">Người nhận</label>
          <MultiSearchableSelect
            options={receiverOptions}
            value={filterReceiver}
            onValueChange={setFilterReceiver}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
            inline
            icon={<User size={15} />}
          />
        </div>
        <div className="space-y-1.5 z-20">
          <label className="text-[13px] font-bold text-muted-foreground">Tên hàng</label>
          <MultiSearchableSelect
            options={productOptions}
            value={filterProduct}
            onValueChange={setFilterProduct}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
            inline
            icon={<Package size={15} />}
          />
        </div>
        <div className="space-y-1.5 z-[19]">
          <label className="text-[13px] font-bold text-muted-foreground">Xe (biển số)</label>
          <MultiSearchableSelect
            options={vehicleFilterOptions}
            value={filterVehicleIds}
            onValueChange={setFilterVehicleIds}
            placeholder="Tất cả xe..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
            inline
            icon={<Truck size={15} />}
          />
        </div>

      </MobileFilterSheet>
    </div>
  );
};

export default WarehousesPage;











