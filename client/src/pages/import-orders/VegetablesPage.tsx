import React, { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/shared/PageHeader';
import { useImportOrders, useDeleteImportOrder } from '../../hooks/queries/useImportOrders';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { Filter, FileDown, Store, Truck, UserCircle, ChevronLeft, ChevronRight, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import { DatePicker } from '../../components/shared/DatePicker';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';
import * as XLSX from 'xlsx';

import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import { ColumnSettings } from '../../components/shared/ColumnSettings';
import AddEditVegetableImportOrderDialog from './dialogs/AddEditVegetableImportOrderDialog';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { isSoftDeletedOrderRecord } from '../../utils/softDeletedOrder';
import { useAuth } from '../../context/AuthContext';
import { useVehicles } from '../../hooks/queries/useVehicles';
import { hasFullGoodsModuleAccess, importOrderVisibleToUser } from '../../utils/goodsModuleScope';

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN').format(value);
};

const getAssignedVehicles = (item: any) => {
  const plates = new Set<string>();

  if (item.order?.delivery_orders) {
    const matchedDeliveryOrders = item.order.delivery_orders.filter(
      (doItem: any) => doItem.product_id === item.product_id
    );

    matchedDeliveryOrders.forEach((d: any) => {
      if (d.delivery_vehicles) {
        d.delivery_vehicles.forEach((dv: any) => {
          if (dv.vehicles?.license_plate) plates.add(dv.vehicles.license_plate);
        });
      }
    });
  }

  if (plates.size > 0) {
    return Array.from(plates).join(', ');
  }

  return item.order?.license_plate || '-';
};

const getAssignedDrivers = (item: any) => {
  const names = new Set<string>();

  if (item.order?.delivery_orders) {
    const matchedDeliveryOrders = item.order.delivery_orders.filter(
      (doItem: any) => doItem.product_id === item.product_id
    );

    matchedDeliveryOrders.forEach((d: any) => {
      d.delivery_vehicles?.forEach((dv: any) => {
        if (dv.profiles?.full_name) names.add(dv.profiles.full_name);
      });
    });
  }

  if (names.size > 0) return Array.from(names).join(', ');
  if (item.order?.driver_name) return item.order.driver_name;
  if (item.order?.profiles?.role === 'driver') return item.order.profiles.full_name || '-';
  return '-';
};

const getReceiverName = (item: any) => {
  return item.order?.selected_alias || item.order?.receiver_name || '-';
};

const getItemTotalAmount = (item: any) => {
  if (typeof item.total_amount === 'number') return item.total_amount;
  if (typeof item.quantity === 'number' && typeof item.unit_price === 'number') {
    return item.quantity * item.unit_price;
  }
  if (typeof item.order?.total_amount === 'number') return item.order.total_amount;
  return null;
};

const COL_DEF: Record<string, { thClass: string, tdClass: string, render: (item: any) => React.ReactNode }> = {
  nguoi_nhan: { thClass: 'text-left', tdClass: '', render: (item: any) => <div className="font-bold text-[13px] text-foreground">{getReceiverName(item)}</div> },
  chu_hang: { thClass: 'text-left', tdClass: '', render: (item: any) => <div className="font-bold text-[13px] text-foreground">{item.order?.sender_name || item.order?.customers?.name || '-'}</div> },
  tai: {
    thClass: 'text-center w-20',
    tdClass: 'text-center',
    render: (item: any) => (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-50 text-amber-700 text-[12px] font-black">
        {item.order?.tai_rank || 1}
      </span>
    ),
  },
  tai_xe: { thClass: 'text-left w-40', tdClass: '', render: (item: any) => <span className="text-[13px] font-medium text-foreground">{getAssignedDrivers(item)}</span> },
  bien_so_xe: { thClass: 'text-left w-40', tdClass: '', render: (item: any) => <span className="text-[13px] font-medium text-muted-foreground tabular-nums">{getAssignedVehicles(item)}</span> },
  sl: { thClass: 'text-center w-24', tdClass: 'text-center', render: (item: any) => <span className="font-bold text-[13px] text-primary tabular-nums">{item.quantity}</span> },
  ten_hang: { thClass: 'text-left', tdClass: '', render: (item: any) => <div className="font-medium text-[13px] text-foreground">{item.products?.name || '-'}</div> },
  tong_tien: {
    thClass: 'text-right w-40',
    tdClass: 'text-right',
    render: (item: any) => {
      const amount = getItemTotalAmount(item);
      return <span className="text-[13px] font-bold text-primary tabular-nums">{amount != null ? formatCurrency(amount) : '-'}</span>;
    },
  },
  actions: { thClass: 'text-center w-24', tdClass: 'text-center', render: () => null },
};

const getTodayVN = () => {
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vnTime.toISOString().split('T')[0];
};

const VegetablesPage: React.FC = () => {
  const [columns, setColumns] = useState([
    { id: 'nguoi_nhan', label: 'Người Nhận', isVisible: true },
    { id: 'chu_hang', label: 'Chủ Hàng', isVisible: true },
    { id: 'tai', label: 'Tài', isVisible: true },
    { id: 'tai_xe', label: 'Tài Xế', isVisible: true },
    { id: 'bien_so_xe', label: 'Biển Số Xe', isVisible: true },
    { id: 'sl', label: 'SL', isVisible: true },
    { id: 'ten_hang', label: 'Tên Hàng', isVisible: true },
    { id: 'tong_tien', label: 'Tổng Tiền', isVisible: true },
    { id: 'actions', label: 'Thao Tác', isVisible: true },
  ]);

  const visibleColumns = columns.filter(c => c.isVisible);

  const [filterDate, setFilterDate] = useState<string>(getTodayVN());
  const [searchQuery, setSearchQuery] = useState('');

  const [filterCustomer, setFilterCustomer] = useState<string[]>([]);
  const [filterVehicle, setFilterVehicle] = useState<string[]>([]);
  const [filterReceiver, setFilterReceiver] = useState<string[]>([]);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);

  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDialogClosing, setIsDialogClosing] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteMutation = useDeleteImportOrder();

  const openEditDialog = (order: any) => {
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

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteMutation.mutateAsync(deleteId);
    setDeleteId(null);
  };

  const openFilter = () => setIsFilterOpen(true);
  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 300);
  };

  const filters: any = {};
  if (filterDate) {
    filters.dateFrom = filterDate;
    filters.dateTo = filterDate;
  }
  filters.order_category = 'vegetable';

  const { user } = useAuth();
  const { data: vehicles } = useVehicles();
  const { data: ordersRaw, isLoading, isError, refetch } = useImportOrders(filters);
  const orders = useMemo(() => {
    const raw = ordersRaw?.data || [];
    if (!user || hasFullGoodsModuleAccess(user)) return raw;
    return raw.filter((o) =>
      importOrderVisibleToUser(o, { id: user.id, role: user.role, full_name: user.full_name }, vehicles || [])
    );
  }, [ordersRaw, user, vehicles]);

  // Flatten items for table display
  const flattenedItems = useMemo(() => {
    if (!orders) return [];

    // Group by license_plate (Nhà Xe) if we wanted to visually group, but we will just list all
    const items: any[] = [];
    orders.forEach(order => {
      if (isSoftDeletedOrderRecord(order)) return;
      if (order.import_order_items && order.import_order_items.length > 0) {
        order.import_order_items.forEach(item => {
          items.push({
            ...item,
            order: order,
          });
        });
      }
    });

    // Sort logic could go here
    return items;
  }, [orders]);

  const { vuaOptions, taiOptions, nguoiNhapOptions } = useMemo(() => {
    if (!flattenedItems) return { vuaOptions: [], taiOptions: [], nguoiNhapOptions: [] };
    const vuaSet = new Set<string>();
    const taiSet = new Set<string>();
    const receiverSet = new Set<string>();

    flattenedItems.forEach(i => {
      const chuHang = i.order?.sender_name || i.order?.customers?.name;
      if (chuHang) vuaSet.add(chuHang);

      const tai = getAssignedVehicles(i);
      if (tai && tai !== '-') {
        tai.split(', ').forEach((t: string) => taiSet.add(t));
      }

      const receiver = getReceiverName(i);
      if (receiver) receiverSet.add(receiver);
    });

    return {
      vuaOptions: Array.from(vuaSet).map(v => ({ label: v, value: v })),
      taiOptions: Array.from(taiSet).map(v => ({ label: v, value: v })),
      nguoiNhapOptions: Array.from(receiverSet).map(v => ({ label: v, value: v }))
    };
  }, [flattenedItems]);

  const filteredItems = useMemo(() => {
    return flattenedItems.filter(i => {
      const chuHang = i.order?.sender_name || i.order?.customers?.name;
      const tai = getAssignedVehicles(i);
      const receiver = getReceiverName(i);

      let matches = true;
      if (searchQuery) {
        matches = matchesSearch(chuHang || '', searchQuery) || 
                  matchesSearch(receiver || '', searchQuery) || 
                  matchesSearch(i.products?.name || '', searchQuery);
      }

      if (!matches) return false;
      if (filterCustomer.length > 0 && chuHang && !filterCustomer.includes(chuHang)) return false;

      if (filterVehicle.length > 0) {
        if (!tai) return false;
        const itemPlates = tai.split(', ');
        const hasMatch = filterVehicle.some(v => itemPlates.includes(v));
        if (!hasMatch) return false;
      }

      if (filterReceiver.length > 0 && receiver && !filterReceiver.includes(receiver)) return false;

      return true;
    });
  }, [flattenedItems, searchQuery, filterCustomer, filterVehicle, filterReceiver]);

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedItems = useMemo(
    () => filteredItems.slice((page - 1) * pageSize, page * pageSize),
    [filteredItems, page]
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const groupedPaginatedItems = useMemo(() => {
    const grouped = new Map<string, any[]>();
    paginatedItems.forEach((item) => {
      const supplierName = item.order?.sender_name || item.order?.customers?.name || 'Chưa rõ chủ vựa';
      const current = grouped.get(supplierName) || [];
      current.push(item);
      grouped.set(supplierName, current);
    });

    grouped.forEach((itemsInSupplier, supplierName) => {
      const sortedByTai = [...itemsInSupplier].sort((a, b) => {
        const rankA = a.order?.tai_rank || 1;
        const rankB = b.order?.tai_rank || 1;
        if (rankA !== rankB) return rankA - rankB;

        const timeA = new Date(a.order?.created_at || 0).getTime();
        const timeB = new Date(b.order?.created_at || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;

        return String(a.id || '').localeCompare(String(b.id || ''));
      });

      grouped.set(supplierName, sortedByTai);
    });

    return Array.from(grouped.entries());
  }, [paginatedItems]);

  const totalAmount = filteredItems.reduce((acc, curr) => acc + (getItemTotalAmount(curr) || 0), 0);

  const exportExcel = () => {
    const wsData = filteredItems.map(item => ({
      "Người Nhận": getReceiverName(item),
      "Chủ Hàng": item.order?.sender_name || item.order?.customers?.name || '-',
      "Tài": item.order?.tai_rank || 1,
      "Tài Xế": getAssignedDrivers(item),
      "Biển Số Xe": getAssignedVehicles(item),
      "Số lượng": item.quantity,
      "Tên Hàng": item.products?.name || '-',
      "Tổng Tiền": getItemTotalAmount(item) || 0
    }));

    wsData.push({
      "Người Nhận": "TỔNG CỘNG",
      "Chủ Hàng": "",
      "Tài": "",
      "Tài Xế": "",
      "Biển Số Xe": "",
      "Số lượng": "",
      "Tên Hàng": "",
      "Tổng Tiền": totalAmount
    } as any);

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bảng Hàng Rau");
    const fileNameDate = filterDate || 'Tat_Ca';
    XLSX.writeFile(wb, `BangHangRau_${fileNameDate}.xlsx`);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Bảng Hàng Rau"
          description="Xem danh sách chi tiết các mặt hàng rau nhập trong ngày"
          backPath="/app/hang-hoa"
        />
      </div>

      <div className="bg-card flex flex-row w-full gap-2 items-center rounded-2xl shadow-sm border border-border p-2.5 md:mb-6 mb-3 overflow-x-auto custom-scrollbar">
        {/* SEARCH BAR */}
        <div className="flex-1 min-w-50 md:max-w-full">
          <SearchInput
            placeholder="Tên vựa, hàng..."
            onSearch={(raw) => { setSearchQuery(raw); setPage(1); }}
            className="h-9.5"
          />
        </div>

        {/* DESKTOP ADVANCED FILTERS */}
        <div className="hidden md:flex gap-2 items-center shrink-0">
          <div className="w-50">
            <MultiSearchableSelect
              options={vuaOptions}
              value={filterCustomer}
              onValueChange={(v) => { setFilterCustomer(v); setPage(1); }}
              placeholder="Chủ hàng"
              className="bg-transparent"
              icon={<Store size={15} />}
            />
          </div>
          <div className="w-50">
            <MultiSearchableSelect
              options={taiOptions}
              value={filterVehicle}
              onValueChange={(v) => { setFilterVehicle(v); setPage(1); }}
              placeholder="Tài"
              className="bg-transparent"
              icon={<Truck size={15} />}
            />
          </div>
          <div className="w-50">
            <MultiSearchableSelect
              options={nguoiNhapOptions}
              value={filterReceiver}
              onValueChange={(v) => { setFilterReceiver(v); setPage(1); }}
              placeholder="Người nhập"
              className="bg-transparent"
              icon={<UserCircle size={15} />}
            />
          </div>
        </div>

        {/* DESKTOP DATE FILTER */}
        <div className="hidden md:block w-[180px] shrink-0 relative z-20">
          <DatePicker
            value={filterDate}
            onChange={(val: string) => { setFilterDate(val); setPage(1); }}
            placeholder="Chọn ngày"
          />
        </div>

        {/* ACTIONS */}
        <div className="flex items-center gap-2 shrink-0">
          {/* MOBILE FILTER BUTTON */}
          <button
            onClick={openFilter}
            className="md:hidden flex items-center justify-center w-9.5 h-9.5 shrink-0 border border-border/80 rounded-xl transition-all bg-muted/20 text-muted-foreground hover:bg-muted"
          >
            <Filter size={17} />
          </button>

          <div className="hidden md:block">
            <ColumnSettings columns={columns} onColumnsChange={setColumns} />
          </div>

          <button
            onClick={exportExcel}
            title="Xuất dữ liệu Excel"
            className="flex items-center justify-center border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 h-9.5 w-9.5 md:w-auto md:px-3 rounded-xl shadow-sm transition-colors shrink-0"
          >
            <FileDown size={17} className="md:mr-2" />
            <span className="hidden md:inline text-[13px] font-bold">Xuất Excel</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton type="table" rows={10} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !filteredItems?.length ? (
        <EmptyState
          title="Không có dữ liệu hàng rau"
          description={
            filterDate
              ? `Không có mặt hàng nào được nhập vào ngày ${format(new Date(filterDate), 'dd/MM/yyyy')}`
              : "Chưa có mặt hàng nào được tạo."
          }
        />
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Desktop Table View */}
          <div className="hidden md:flex flex-1 bg-white rounded-2xl border border-border shadow-sm flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full border-collapse min-w-225">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/30 border-b border-border">
                    {visibleColumns.map((col) => (
                      <th key={col.id} className={`px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight ${COL_DEF[col.id].thClass}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {groupedPaginatedItems.map(([supplierName, itemsInSupplier]) => (
                    <React.Fragment key={`supplier-${supplierName}`}>
                      <tr className="bg-primary/5">
                        <td colSpan={visibleColumns.length} className="px-4 py-2">
                          <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Chủ vựa: {supplierName}</span>
                        </td>
                      </tr>
                      {itemsInSupplier.map((item, idx) => (
                        <tr key={`${item.order?.id || 'order'}-${item.id || idx}`} className="hover:bg-muted/20 transition-colors">
                          {visibleColumns.map((col) => {
                            if (col.id === 'actions') {
                              return (
                                <td key={col.id} className="px-4 py-3 text-center w-24">
                                  <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => openEditDialog(item.order)}
                                      className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                                      title="Chỉnh sửa phiếu nhập"
                                    >
                                      <Edit size={14} />
                                    </button>
                                    <button
                                      onClick={() => setDeleteId(item.order?.id)}
                                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                                      title="Xóa phiếu nhập"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              );
                            }
                            return (
                              <td key={col.id} className={`px-4 py-3 ${COL_DEF[col.id]?.tdClass || ''}`}>
                                {COL_DEF[col.id]?.render(item)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-10 bg-muted/60 shadow-[0_-2px_6px_rgba(0,0,0,0.05)]">
                  <tr>
                    {visibleColumns.map((col, idx) => {
                      if (col.id === 'tong_tien') {
                        return (
                          <td key={col.id} className="px-4 py-3 text-right text-[15px] font-black text-primary tabular-nums">
                            {formatCurrency(totalAmount)}
                          </td>
                        );
                      }
                      if (col.id === 'actions') {
                        return <td key={col.id} className="px-4 py-3"></td>;
                      }
                      return (
                        <td key={col.id} className={`${COL_DEF[col.id]?.tdClass || ''} px-4 py-3 text-[14px] font-black uppercase text-foreground`}>
                          {idx === 0 ? 'Tổng' : ''}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-2 mt-1">
              {groupedPaginatedItems.map(([supplierName, itemsInSupplier]) => (
                <div key={`mobile-${supplierName}`} className="flex flex-col gap-2">
                  <div className="px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
                    <span className="text-[11px] font-bold text-primary uppercase tracking-wider">Chủ vựa: {supplierName}</span>
                  </div>

                  {itemsInSupplier.map((item, idx) => (
                    <div key={`${item.order?.id || 'order'}-${item.id || idx}`} className="bg-white rounded-2xl border border-border shadow-sm p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 pr-2 min-w-0">
                          <div className="text-[14px] font-bold text-foreground mb-1 whitespace-normal leading-snug">
                            {getReceiverName(item)}
                          </div>
                          <div className="text-[12px] font-medium text-muted-foreground mb-2 whitespace-normal leading-snug">
                            Chủ hàng: {item.order?.sender_name || item.order?.customers?.name || '-'} • Tài {item.order?.tai_rank || 1}
                          </div>
                          <div className="space-y-1">
                            <div className="text-[12px] text-muted-foreground flex items-center gap-2">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase w-14 shrink-0">Tài xế</span>
                              <span className="font-medium text-foreground truncate">{getAssignedDrivers(item)}</span>
                            </div>
                            <div className="text-[12px] text-muted-foreground flex items-center gap-2">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase w-14 shrink-0">Biển số</span>
                              <span className="font-medium text-foreground truncate">{getAssignedVehicles(item)}</span>
                            </div>
                            <div className="text-[12px] text-muted-foreground flex items-center gap-2">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase w-14 shrink-0">Hàng</span>
                              <span className="font-medium text-foreground truncate">{item.products?.name || '-'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-[14px] font-black text-primary tabular-nums mb-1">
                            {getItemTotalAmount(item) != null ? formatCurrency(getItemTotalAmount(item)) : '-'}
                          </div>
                          <div className="text-[12px] text-muted-foreground mb-2">SL: <span className="font-bold text-foreground">{item.quantity}</span></div>
                          <div className="flex items-center justify-end gap-1 mt-3" onClick={(e) => e.stopPropagation()}>
                            <button
                               onClick={() => openEditDialog(item.order)}
                               className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors bg-blue-50/50"
                            >
                               <Edit size={13} />
                            </button>
                            <button
                               onClick={() => setDeleteId(item.order?.id)}
                               className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors bg-red-50/50"
                            >
                               <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Mobile Total Bar */}
            <div className="shrink-0 bg-white border border-border p-4 shadow-sm rounded-xl mt-2 flex items-center justify-between">
              <span className="text-[14px] font-black uppercase text-foreground">Tổng cộng</span>
              <span className="text-[16px] font-black text-primary tabular-nums">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-muted/5 shrink-0 mt-2 rounded-xl">
            <span className="text-[12px] text-muted-foreground font-medium">
              {totalItems > 0 ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalItems)}` : '0'} / Tổng {totalItems}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold transition-colors ${
                      page === pageNum ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-20 transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={() => {
          setPage(1);
        }}
        onClear={() => {
          setFilterDate(getTodayVN());
          setFilterCustomer([]);
          setFilterVehicle([]);
          setFilterReceiver([]);
          setPage(1);
        }}
        showClearButton={filterCustomer.length > 0 || filterVehicle.length > 0 || filterReceiver.length > 0}
        initialDateFrom={filterDate}
        initialDateTo={filterDate}
        hideDateFilter
        dateLabel="Ngày nhập"
      >
        <div className="space-y-1.5 z-40">
          <label className="text-[13px] font-bold text-muted-foreground">Ngày nhập</label>
          <DatePicker
            value={filterDate}
            onChange={(val: string) => { setFilterDate(val); setPage(1); }}
            placeholder="Chọn ngày"
            className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
          />
        </div>
        <div className="space-y-1.5 z-30">
          <label className="text-[13px] font-bold text-muted-foreground">Chủ hàng</label>
          <MultiSearchableSelect
            options={vuaOptions}
            value={filterCustomer}
            onValueChange={(v) => { setFilterCustomer(v); setPage(1); }}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
            inline
            icon={<Store size={15} />}
          />
        </div>
        <div className="space-y-1.5 z-20">
          <label className="text-[13px] font-bold text-muted-foreground">Tài (Xe)</label>
          <MultiSearchableSelect
            options={taiOptions}
            value={filterVehicle}
            onValueChange={(v) => { setFilterVehicle(v); setPage(1); }}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
            inline
            icon={<Truck size={15} />}
          />
        </div>
        <div className="space-y-1.5 z-10">
          <label className="text-[13px] font-bold text-muted-foreground">Người Nhập</label>
          <MultiSearchableSelect
            options={nguoiNhapOptions}
            value={filterReceiver}
            onValueChange={(v) => { setFilterReceiver(v); setPage(1); }}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
            inline
            icon={<UserCircle size={15} />}
          />
        </div>
      </MobileFilterSheet>

      <AddEditVegetableImportOrderDialog
        isOpen={isDialogOpen}
        isClosing={isDialogClosing}
        editingOrder={editingOrder}
        onClose={closeDialog}
        defaultCategory="vegetable"
      />

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Xóa phiếu nhập"
        message="Bạn có chắc chắn muốn xóa toàn bộ phiếu nhập này không? Việc này sẽ xóa tất cả các mặt hàng trong phiếu."
        confirmLabel="Xóa phiếu"
        cancelLabel="Hủy"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};

export default VegetablesPage;
