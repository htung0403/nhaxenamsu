import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Edit, Trash2, Filter, Store, Truck, UserCircle, Image as ImageIcon, Eye } from 'lucide-react';
import { clsx } from 'clsx';
import { useImportOrders, useDeleteImportOrder } from '../../hooks/queries/useImportOrders';
import type { ImportOrder, ImportOrderFilters, OrderStatus } from '../../types';
import StatusBadge from '../../components/shared/StatusBadge';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import PageHeader from '../../components/shared/PageHeader';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import AddEditStandardImportOrderDialog from './dialogs/AddEditStandardImportOrderDialog';
import OrderImagesDialog from '../delivery/dialogs/OrderImagesDialog';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import DraggableFAB from '../../components/shared/DraggableFAB';
import { ColumnSettings, type ColumnOption } from '../../components/shared/ColumnSettings';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import { SearchInput } from '../../components/ui/SearchInput';
import { useAuth } from '../../context/AuthContext';
import { useVehicles } from '../../hooks/queries/useVehicles';
import { hasFullGoodsModuleAccess, importOrderVisibleToUser } from '../../utils/goodsModuleScope';
import { matchesSearch } from '../../lib/str-utils';

const statusLabels: Record<OrderStatus, string> = {
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  delivered: 'Đã giao',
  returned: 'Trả lại',
};

const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));

const getOrderVehicles = (order: any) => {
  const plates = new Set<string>();
  if (order.license_plate) plates.add(order.license_plate);
  if (order.delivery_orders) {
    order.delivery_orders.forEach((d: any) => {
      if (d.delivery_vehicles) {
        d.delivery_vehicles.forEach((dv: any) => {
          if (dv.vehicles?.license_plate) plates.add(dv.vehicles.license_plate);
        });
      }
    });
  }
  return plates.size > 0 ? Array.from(plates).join(', ') : '';
};

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const defaultColumns: ColumnOption[] = [
  { id: 'image', label: 'Ảnh', isVisible: true },
  { id: 'order_code', label: 'Mã đơn', isVisible: true },
  { id: 'order_date', label: 'Ngày', isVisible: true },
  { id: 'order_time', label: 'Giờ', isVisible: true },
  { id: 'sender', label: 'Chủ hàng', isVisible: true },
  { id: 'item_name', label: 'Tên hàng', isVisible: true },
  { id: 'quantity', label: 'Số lượng', isVisible: true },
  { id: 'payment_status', label: 'Tình trạng', isVisible: true },
  { id: 'total_amount', label: 'Tổng tiền', isVisible: true },
  { id: 'receiver', label: 'Người nhận', isVisible: true },
  { id: 'status', label: 'Trạng thái', isVisible: true },
  { id: 'actions', label: 'Thao tác', isVisible: true },
];

const StandardImportOrderHistoryPage: React.FC = () => {
  const [searchText, setSearchText] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState<string[]>([]);

  const [filterCustomer, setFilterCustomer] = useState<string[]>([]);
  const [filterVehicle, setFilterVehicle] = useState<string[]>([]);
  const [filterReceiver, setFilterReceiver] = useState<string[]>([]);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);

  const [columns, setColumns] = useState<ColumnOption[]>(defaultColumns);

  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDialogClosing, setIsDialogClosing] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ImportOrder | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [viewingImageOrder, setViewingImageOrder] = useState<any>(null);
  const [isViewingClosing, setIsViewingClosing] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSearch = useCallback((raw: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchText(raw);
      setPage(1);
    }, 300);
  }, []);

  const allFilters: ImportOrderFilters = {
    order_category: 'standard',
    pageSize: 5000,
  };
  if (filterDateFrom) allFilters.dateFrom = filterDateFrom;
  if (filterDateTo) allFilters.dateTo = filterDateTo;
  if (filterStatus.length > 0) allFilters.status = filterStatus.join(',');

  const { user } = useAuth();
  const { data: vehicles } = useVehicles();
  const { data: apiResponse, isLoading, isError, refetch } = useImportOrders(allFilters);

  const allOrders = useMemo(() => {
    const raw = apiResponse?.data || [];
    if (!user || hasFullGoodsModuleAccess(user)) return raw;
    return raw.filter((o) =>
      importOrderVisibleToUser(o, { id: user.id, role: user.role, full_name: user.full_name }, vehicles || [])
    );
  }, [apiResponse?.data, user, vehicles]);

  const filteredOrders = useMemo(() => {
    return allOrders.filter((o) => {
      // Search filter (accent-insensitive)
      if (searchText.trim()) {
        const orderCode = o.order_code || '';
        const senderName = o.selected_alias || o.customers?.name || o.sender_name || '';
        const receiverName = (o as any).profiles?.full_name || o.receiver_name || o.received_by || '';
        const items = o.import_order_items || [];
        const itemNames = items.map((i: any) => i.products?.name).filter(Boolean).join(', ');

        if (
          !matchesSearch(orderCode, searchText) &&
          !matchesSearch(senderName, searchText) &&
          !matchesSearch(receiverName, searchText) &&
          !matchesSearch(itemNames, searchText)
        ) {
          return false;
        }
      }

      // Customer filter
      if (filterCustomer.length > 0) {
        const senderName = o.selected_alias || o.customers?.name || o.sender_name;
        if (!senderName || !filterCustomer.includes(senderName)) return false;
      }

      // Vehicle filter
      if (filterVehicle.length > 0) {
        const plates = getOrderVehicles(o);
        if (!plates) return false;
        const plateList = plates.split(', ');
        const hasMatch = filterVehicle.some((v) => plateList.includes(v));
        if (!hasMatch) return false;
      }

      // Receiver filter
      if (filterReceiver.length > 0) {
        const receiver = (o as any).profiles?.full_name || o.receiver_name || o.received_by;
        if (!receiver || !filterReceiver.includes(receiver)) return false;
      }

      return true;
    });
  }, [allOrders, searchText, filterCustomer, filterVehicle, filterReceiver]);

  const totalItems = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const orders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, page, pageSize]);

  const deleteMutation = useDeleteImportOrder();

  const { vuaOptions, taiOptions, nguoiNhapOptions } = useMemo(() => {
    if (!allOrders) return { vuaOptions: [], taiOptions: [], nguoiNhapOptions: [] };
    const vuaSet = new Set<string>();
    const taiSet = new Set<string>();
    const receiverSet = new Set<string>();

    allOrders.forEach(order => {
      const senderName = order.selected_alias || order.customers?.name || order.sender_name;
      if (senderName) vuaSet.add(senderName);

      const tai = getOrderVehicles(order);
      if (tai) {
        tai.split(', ').forEach((t: string) => taiSet.add(t));
      }

      const receiver = (order as any).profiles?.full_name || order.receiver_name || order.received_by;
      if (receiver) receiverSet.add(receiver);
    });

    return {
      vuaOptions: Array.from(vuaSet).map(v => ({ label: v, value: v })),
      taiOptions: Array.from(taiSet).map(v => ({ label: v, value: v })),
      nguoiNhapOptions: Array.from(receiverSet).map(v => ({ label: v, value: v }))
    };
  }, [allOrders]);


  const openAddDialog = () => {
    setEditingOrder(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (order: ImportOrder) => {
    setEditingOrder(order);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogClosing(true);
    setTimeout(() => {
      setIsDialogOpen(false);
      setIsDialogClosing(false);
      setEditingOrder(null);
    }, 350);
  };

  const openFilter = () => {
    setIsFilterOpen(true);
  };

  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 300);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteMutation.mutateAsync(deleteId);
    setDeleteId(null);
  };

  const clearFilters = () => {
    setSearchText('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterStatus([]);
    setFilterCustomer([]);
    setFilterVehicle([]);
    setFilterReceiver([]);
    setPage(1);
  };

  const hasActiveFilters = !!filterDateFrom || !!filterDateTo || filterStatus.length > 0 || !!searchText || filterCustomer.length > 0 || filterVehicle.length > 0 || filterReceiver.length > 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Lịch sử nhập hàng tạp hóa"
          description="Xem toàn bộ lịch sử đơn nhập hàng tạp hóa"
          backPath="/app/hang-hoa"
          actions={
            <button
              onClick={openAddDialog}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Thêm đơn nhập</span>
              <span className="sm:hidden">Thêm</span>
            </button>
          }
        />
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0">
        <div className="p-3 border-b border-border flex flex-col md:flex-row items-stretch md:items-center gap-2">
          <div className="flex w-full md:flex-1 gap-2">
            <div className="flex-1">
              <SearchInput
                placeholder="Tìm kiếm theo mã đơn, người gửi, người nhận..."
                defaultValue={searchText}
                onSearch={handleSearch}
              />
            </div>

            <button
              onClick={openFilter}
              className={clsx(
                "md:hidden flex items-center justify-center w-[38px] shrink-0 border border-border/80 rounded-xl transition-all",
                (hasActiveFilters) ? "bg-primary/10 text-primary border-primary/30" : "bg-muted/20 text-muted-foreground hover:bg-muted"
              )}
            >
              <Filter size={18} />
            </button>
          </div>

          <div className="hidden xl:flex gap-2 items-center shrink-0">
            <div className="w-[180px]">
              <MultiSearchableSelect
                options={vuaOptions}
                value={filterCustomer}
                onValueChange={(v) => { setFilterCustomer(v); setPage(1); }}
                placeholder="Chủ hàng"
                className="bg-transparent"
                icon={<Store size={15} />}
              />
            </div>
            <div className="w-[150px]">
              <MultiSearchableSelect
                options={taiOptions}
                value={filterVehicle}
                onValueChange={(v) => { setFilterVehicle(v); setPage(1); }}
                placeholder="Tài"
                className="bg-transparent"
                icon={<Truck size={15} />}
              />
            </div>
            <div className="w-[180px]">
              <MultiSearchableSelect
                options={nguoiNhapOptions}
                value={filterReceiver}
                onValueChange={(v) => { setFilterReceiver(v); setPage(1); }}
                placeholder="Người nhận"
                className="bg-transparent"
                icon={<UserCircle size={15} />}
              />
            </div>
          </div>

          <div className="hidden md:block z-20">
            <MultiSearchableSelect
              value={filterStatus}
              onValueChange={(val) => { setFilterStatus(val); setPage(1); }}
              options={statusOptions}
              placeholder="Tất cả trạng thái"
              className="w-full md:w-[160px]"
            />
          </div>

          <div className="hidden md:block z-20">
            <ColumnSettings columns={columns} onColumnsChange={setColumns} />
          </div>

          <div className="hidden md:block relative z-20">
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
                setPage(1);
              }}
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="hidden md:flex items-center gap-1 px-3 py-2 rounded-xl border border-dashed border-red-300 text-red-500 text-[12px] font-bold hover:bg-red-500/10 transition-all shrink-0"
            >
              <X size={14} />
              Xóa lọc
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-4">
            <LoadingSkeleton rows={8} columns={8} />
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : orders.length === 0 ? (
          <EmptyState
            title="Chưa có lịch sử đơn nhập hàng tạp hóa"
            description="Các đơn nhập hàng sẽ xuất hiện tại đây sau khi được tạo."
            action={
              <button
                onClick={openAddDialog}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
              >
                <Plus size={16} />
                Thêm đơn nhập
              </button>
            }
          />
        ) : (
          <>
            <div className="hidden md:block flex-1 overflow-auto custom-scrollbar">
              <table className="w-full border-collapse min-w-[900px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/30 border-b border-border">
                    {columns.filter(c => c.isVisible).map((col) => {
                      switch (col.id) {
                        case 'image': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center w-16">Ảnh</th>;
                        case 'order_code': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left w-34">Mã đơn</th>;
                        case 'order_date': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left w-28">Ngày</th>;
                        case 'order_time': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left w-20">Giờ</th>;
                        case 'sender': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left min-w-[100px]">Chủ hàng</th>;
                        case 'item_name': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left w-36">Tên hàng</th>;
                        case 'quantity': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center w-24">Số lượng</th>;
                        case 'payment_status': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right w-24">Tình trạng</th>;
                        case 'total_amount': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right w-36">Tổng tiền</th>;
                        case 'receiver': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Người nhận</th>;
                        case 'status': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center w-28">Trạng thái</th>;
                        case 'actions': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center w-24">Thao tác</th>;
                        default: return null;
                      }
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => openEditDialog(order)}
                      className="hover:bg-muted/20 transition-colors cursor-pointer"
                    >
                      {columns.filter(c => c.isVisible).map((col) => {
                        switch (col.id) {
                          case 'image': {
                            let orderImage = order.receipt_image_url;
                            if (orderImage && orderImage.includes(',')) {
                              orderImage = orderImage.split(',')[0].trim();
                            }
                            if (!orderImage && order.import_order_items?.[0]) {
                              const firstItem = order.import_order_items[0];
                              if (firstItem.image_url) {
                                orderImage = firstItem.image_url.includes(',') ? firstItem.image_url.split(',')[0].trim() : firstItem.image_url;
                              } else if (firstItem.image_urls && firstItem.image_urls.length > 0) {
                                orderImage = firstItem.image_urls[0];
                              }
                            }
                            return (
                              <td key={col.id} className="px-4 py-2 text-center">
                                <div
                                  className={clsx(
                                    "w-9 h-9 shrink-0 bg-muted/20 rounded-md overflow-hidden transition-transform mx-auto",
                                    orderImage && "cursor-zoom-in hover:ring-2 hover:ring-primary/40 active:scale-95"
                                  )}
                                  onClick={(e) => {
                                    if (orderImage) {
                                      e.stopPropagation();
                                      setViewingImageOrder(order);
                                    }
                                  }}
                                >
                                  {orderImage ? (
                                    <div className="w-full h-full flex items-center justify-center text-primary bg-primary/10" title="Xem ảnh">
                                      <Eye size={16} />
                                    </div>
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <ImageIcon size={14} className="text-muted-foreground/30" />
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          }
                          case 'order_code': return (
                            <td key={col.id} className="px-4 py-3">
                              <span className="text-[13px] font-bold text-primary">{order.order_code}</span>
                            </td>
                          );
                          case 'order_date': return (
                            <td key={col.id} className="px-4 py-3">
                              <span className="text-[12px] text-muted-foreground font-medium tabular-nums">{order.order_date}</span>
                            </td>
                          );
                          case 'order_time': return (
                            <td key={col.id} className="px-4 py-3">
                              <span className="text-[12px] text-muted-foreground font-medium tabular-nums">{order.order_time || '-'}</span>
                            </td>
                          );
                          case 'sender': return (
                            <td key={col.id} className="px-4 py-3">
                              <span className="text-[13px] font-bold text-foreground">{order.selected_alias || order.customers?.name || order.sender_name || '-'}</span>
                            </td>
                          );
                          case 'item_name': {
                            const items = order.import_order_items || [];
                            const itemNames = items.map((i: any) => i.products?.name).filter(Boolean).join(', ');
                            return (
                              <td key={col.id} className="px-4 py-3">
                                <span className="text-[13px] font-medium text-foreground line-clamp-2" title={itemNames}>{itemNames || '-'}</span>
                              </td>
                            );
                          }
                          case 'quantity': {
                            const items = order.import_order_items || [];
                            const totalQty = items.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);
                            return (
                              <td key={col.id} className="px-4 py-3 text-center">
                                <span className="text-[13px] font-bold text-foreground tabular-nums">{totalQty > 0 ? totalQty : '-'}</span>
                              </td>
                            );
                          }
                          case 'payment_status': return (
                              <td key={col.id} className="px-4 py-3 text-right">
                                {order.payment_status === 'paid' ? (
                                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-md">Đã trả</span>
                                ) : order.payment_status === 'partial' ? (
                                  <span className="text-[11px] font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-md">1 phần</span>
                                ) : (
                                  <span className="text-[11px] font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded-md">Chưa trả</span>
                                )}
                              </td>
                          );
                          case 'total_amount': return (
                            <td key={col.id} className="px-4 py-3 text-right text-[13px] font-black text-primary tabular-nums">
                              {formatCurrency(order.total_amount)}
                            </td>
                          );
                          case 'receiver': return (
                            <td key={col.id} className="px-4 py-3">
                              <span className="text-[13px] font-medium text-foreground">{(order as any).profiles?.full_name || order.selected_alias || order.receiver_name || '-'}</span>
                            </td>
                          );
                          case 'status': return (
                            <td key={col.id} className="px-4 py-3 text-center">
                              <StatusBadge status={order.status} label={statusLabels[order.status]} />
                            </td>
                          );
                          case 'actions': return (
                            <td key={col.id} className="px-4 py-3 flex items-center justify-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditDialog(order); }}
                                  className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-500/10 transition-colors"
                                  title="Sửa"
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteId(order.id); }}
                                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                                  title="Xóa"
                                >
                                  <Trash2 size={14} />
                                </button>
                            </td>
                          );
                          default: return null;
                        }
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden flex-1 overflow-y-auto p-3 pb-20 flex flex-col gap-2.5">
              {orders.map((order) => {
                let orderImage = order.receipt_image_url;
                if (orderImage && orderImage.includes(',')) {
                  orderImage = orderImage.split(',')[0].trim();
                }
                if (!orderImage && order.import_order_items?.[0]) {
                  const firstItem = order.import_order_items[0];
                  if (firstItem.image_url) {
                    orderImage = firstItem.image_url.includes(',') ? firstItem.image_url.split(',')[0].trim() : firstItem.image_url;
                  } else if (firstItem.image_urls && firstItem.image_urls.length > 0) {
                    orderImage = firstItem.image_urls[0];
                  }
                }
                return (
                  <div
                    key={order.id}
                    onClick={() => openEditDialog(order)}
                    className="bg-card rounded-xl border border-border shadow-sm cursor-pointer hover:shadow-md active:scale-[0.98] transition-all"
                  >
                    <div className="p-3 flex gap-3">
                      <div
                        className={clsx(
                          "w-16 h-16 shrink-0 bg-muted/20 rounded-lg overflow-hidden transition-transform active:scale-95 self-center",
                          orderImage && "cursor-zoom-in hover:ring-2 hover:ring-primary/20"
                        )}
                        onClick={(e) => {
                          if (orderImage) {
                            e.stopPropagation();
                            setViewingImageOrder(order);
                          }
                        }}
                      >
                        {orderImage ? (
                          <div className="w-full h-full flex flex-col items-center justify-center text-primary bg-primary/10">
                            <Eye size={22} className="mb-0.5" />
                            <span className="text-[9px] font-bold">XEM ẢNH</span>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon size={22} className="text-muted-foreground/30" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-bold text-foreground truncate">{order.selected_alias || order.customers?.name || order.sender_name || '-'}</span>
                          <StatusBadge status={order.status} label={statusLabels[order.status]} />
                        </div>
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                          <span className="text-[11px] font-semibold text-primary">{order.order_code}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{order.order_date}</span>
                        </div>
                        <div className="text-[12px] text-muted-foreground line-clamp-1" title={order.import_order_items?.map((i: any) => i.products?.name).filter(Boolean).join(', ')}>
                          <span className="font-bold text-foreground">
                            {order.import_order_items?.map((i: any) => i.products?.name).filter(Boolean).join(', ') || 'Chưa có hàng'}
                          </span>
                          {' • '}
                          <span className="font-medium text-foreground">
                            SL {order.import_order_items?.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0) || 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {order.payment_status === 'paid' ? (
                              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">Đã trả</span>
                            ) : order.payment_status === 'partial' ? (
                              <span className="text-[9px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">1 phần</span>
                            ) : (
                              <span className="text-[9px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">Chưa trả</span>
                            )}
                            {(order.total_amount && order.total_amount > 0) ? (
                              <span className="text-[13px] font-black text-primary tabular-nums">
                                {formatCurrency(order.total_amount)}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-0.5">
                            {orderImage && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingImageOrder(order);
                                }}
                                className="p-1 rounded-lg text-violet-500 hover:bg-violet-500/10 transition-colors"
                              >
                                <Eye size={13} />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditDialog(order); }}
                              className="p-1 rounded-lg text-blue-500 hover:bg-blue-500/10 transition-colors"
                            >
                              <Edit size={13} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteId(order.id); }}
                              className="p-1 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-muted/5 shrink-0">
              <span className="text-[12px] text-muted-foreground font-medium">
                {totalItems > 0 ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalItems)}` : '0'} / Tổng {totalItems}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-20 transition-colors"
                >
                  <ChevronLeft size={15} />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={clsx(
                        'w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold transition-colors',
                        page === pageNum ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-20 transition-colors"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <AddEditStandardImportOrderDialog
        isOpen={isDialogOpen}
        isClosing={isDialogClosing}
        editingOrder={editingOrder}
        onClose={closeDialog}
      />

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Xóa đơn nhập hàng"
        message="Bạn có chắc chắn muốn xóa đơn nhập hàng này? Hành động này không thể hoàn tác."
        confirmLabel="Xóa"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      <OrderImagesDialog
        isOpen={!!viewingImageOrder}
        isClosing={isViewingClosing}
        order={viewingImageOrder}
        onClose={() => {
          setIsViewingClosing(true);
          setTimeout(() => {
            setViewingImageOrder(null);
            setIsViewingClosing(false);
          }, 300);
        }}
      />

      <DraggableFAB
        icon={<Plus size={24} />}
        onClick={openAddDialog}
      />

      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={(filters) => {
          setFilterDateFrom(filters.dateFrom);
          setFilterDateTo(filters.dateTo);
          setFilterStatus(filters.status);
          setPage(1);
        }}
        initialDateFrom={filterDateFrom}
        initialDateTo={filterDateTo}
        initialStatus={filterStatus}
        statusOptions={statusOptions}
        onClear={() => {
          setFilterCustomer([]);
          setFilterVehicle([]);
          setFilterReceiver([]);
        }}
        showClearButton={filterCustomer.length > 0 || filterVehicle.length > 0 || filterReceiver.length > 0}
      >
        <div className="space-y-1.5 z-30">
          <label className="text-[13px] font-bold text-muted-foreground">Chủ hàng</label>
          <MultiSearchableSelect
            options={vuaOptions}
            value={filterCustomer}
            onValueChange={setFilterCustomer}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
            inline
            icon={<Store size={15} />}
          />
        </div>
        <div className="space-y-1.5 z-20">
          <label className="text-[13px] font-bold text-muted-foreground">Tài (Xe)</label>
          <MultiSearchableSelect
            options={taiOptions}
            value={filterVehicle}
            onValueChange={setFilterVehicle}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
            inline
            icon={<Truck size={15} />}
          />
        </div>
        <div className="space-y-1.5 z-10">
          <label className="text-[13px] font-bold text-muted-foreground">Người nhận</label>
          <MultiSearchableSelect
            options={nguoiNhapOptions}
            value={filterReceiver}
            onValueChange={setFilterReceiver}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
            inline
            icon={<UserCircle size={15} />}
          />
        </div>
      </MobileFilterSheet>
    </div>
  );
};

export default StandardImportOrderHistoryPage;
