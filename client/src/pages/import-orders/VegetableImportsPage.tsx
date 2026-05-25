import React, { useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, ChevronLeft, ChevronRight, Edit, Trash2, Filter, Store, Truck, UserCircle, Image as ImageIcon, Eye, Calendar, Printer, CheckCircle2, Send } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { useImportOrders, useDeleteImportOrder, useConfirmImportOrderByAdmin, useSendVegetableArrivalNotice } from '../../hooks/queries/useImportOrders';
import type { ImportOrder, ImportOrderFilters, OrderStatus } from '../../types';
import StatusBadge from '../../components/shared/StatusBadge';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import PageHeader from '../../components/shared/PageHeader';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { DatePicker } from '../../components/shared/DatePicker';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { SearchInput } from '../../components/ui/SearchInput';
import { ColumnSettings, type ColumnOption } from '../../components/shared/ColumnSettings';
import AddEditVegetableImportOrderDialog from './dialogs/AddEditVegetableImportOrderDialog';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import DraggableFAB from '../../components/shared/DraggableFAB';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useVehicles } from '../../hooks/queries/useVehicles';
import { useAssignVehicle } from '../../hooks/queries/useDelivery';
import { hasFullGoodsModuleAccess, importOrderVisibleToUser } from '../../utils/goodsModuleScope';
import type { DeliveryOrder, DeliveryVehicle, Vehicle } from '../../types';

import { removeAccents } from '../../lib/str-utils';
import { cloudinarySmall } from '../../lib/cloudinaryUrl';

const statusLabels: Record<OrderStatus, string> = {
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  delivered: 'Đã giao',
  returned: 'Trả lại',
};

const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const getSupplierName = (order: ImportOrder) => order.customers?.name || order.sender_name || 'Chưa rõ chủ vựa';
const getVegetableReceiverName = (order: ImportOrder) =>
  order.customers?.name || order.selected_alias || order.receiver_name || 'Chưa rõ vựa';
const getVegetableReceiverPhone = (order: ImportOrder) => order.customers?.phone || order.receiver_phone || null;

type ImportOrderWithRelations = ImportOrder & {
  delivery_orders?: DeliveryOrder[];
  profiles?: { full_name?: string; role?: string };
};

type ArrivalNoticeTarget = {
  key: string;
  name: string;
  phone: string | null;
  orderCount: number;
};

type ArrivalNoticeOption = {
  rank: number;
  orderCount: number;
  vehiclePlates: string;
  driverContacts: string;
  inChargeContacts: string;
};

const formatContact = (name?: string | null, phone?: string | null) => {
  if (!name) return '';
  return phone ? `${name} (${phone})` : name;
};

const formatDateDMY = (dateStr?: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
};

const getOrderVehicles = (order: ImportOrderWithRelations) => {
  const plates = new Set<string>();
  if (order.license_plate) plates.add(order.license_plate);
  if (order.delivery_orders) {
    order.delivery_orders.forEach((d: DeliveryOrder) => {
      if (d.delivery_vehicles) {
        d.delivery_vehicles.forEach((dv: DeliveryVehicle) => {
          if (dv.vehicles?.license_plate) plates.add(dv.vehicles.license_plate);
        });
      }
    });
  }
  return plates.size > 0 ? Array.from(plates).join(', ') : '';
};

const getOrderDriverName = (order: ImportOrderWithRelations) => {
  const names = new Set<string>();

  if (order.delivery_orders) {
    order.delivery_orders.forEach((d: DeliveryOrder) => {
      d.delivery_vehicles?.forEach((dv: DeliveryVehicle) => {
        if (dv.profiles?.full_name) names.add(dv.profiles.full_name);
      });
    });
  }

  if (names.size > 0) return Array.from(names).join(', ');
  if (order.driver_name) return order.driver_name;
  if (order.profiles?.role === 'driver') return order.profiles.full_name || '';
  return '';
};

const getOrderDriverContacts = (order: ImportOrderWithRelations) => {
  const contacts = new Set<string>();

  order.delivery_orders?.forEach((deliveryOrder: DeliveryOrder) => {
    deliveryOrder.delivery_vehicles?.forEach((deliveryVehicle: DeliveryVehicle) => {
      const directDriver = formatContact(deliveryVehicle.profiles?.full_name, deliveryVehicle.profiles?.phone);
      if (directDriver) contacts.add(directDriver);

      const vehicleDriver = formatContact(
        deliveryVehicle.vehicles?.profiles?.full_name,
        deliveryVehicle.vehicles?.profiles?.phone,
      );
      if (vehicleDriver) contacts.add(vehicleDriver);
    });
  });

  return Array.from(contacts).join('; ');
};

const getOrderInChargeContacts = (order: ImportOrderWithRelations) => {
  const contacts = new Set<string>();

  order.delivery_orders?.forEach((deliveryOrder: DeliveryOrder) => {
    deliveryOrder.delivery_vehicles?.forEach((deliveryVehicle: DeliveryVehicle) => {
      const contact = formatContact(
        deliveryVehicle.vehicles?.responsible_profile?.full_name,
        deliveryVehicle.vehicles?.responsible_profile?.phone,
      );
      if (contact) contacts.add(contact);
    });
  });

  return Array.from(contacts).join('; ');
};

const getOrderReceiverName = (order: ImportOrderWithRelations) => {
  return order.selected_alias || order.receiver_name || order.profiles?.full_name || '-';
};

const normalizeRoleText = (value?: string | null) =>
  removeAccents(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isDriverRole = (role?: string | null) => {
  const normalized = normalizeRoleText(role).replace(/\s+/g, '_');
  return normalized === 'driver' || normalized.includes('tai_xe') || normalized.includes('driver');
};

const isCustomerSubmittedOrder = (order: ImportOrder) => order.profiles?.role === 'customer';

const isUnconfirmedCustomerOrder = (order: ImportOrder) =>
  isCustomerSubmittedOrder(order) && !order.admin_confirmed_at;

const vehicleSupportsVegetable = (vehicle: Vehicle) =>
  !vehicle.goods_categories || vehicle.goods_categories.length === 0 || vehicle.goods_categories.includes('vegetable');

const isLargeVehicle = (vehicle: Vehicle) => {
  const normalizedType = normalizeRoleText(vehicle.vehicle_type).replace(/\s+/g, '_');
  return (
    Number(vehicle.load_capacity_ton || 0) >= 1 ||
    normalizedType.includes('xe_lon') ||
    normalizedType.includes('tai_lon') ||
    normalizedType.includes('truck') ||
    normalizedType.includes('tai')
  );
};

const defaultColumns: ColumnOption[] = [
  { id: 'order_datetime', label: 'Ngày giờ', isVisible: true },
  { id: 'driver_received', label: 'Tài xế nhận', isVisible: true },
  { id: 'tai_rank', label: 'Tài', isVisible: true },
  { id: 'nguoi_gui', label: 'Người gửi', isVisible: true },
  { id: 'quantity', label: 'Số lượng', isVisible: true },
  { id: 'item_names', label: 'Tên hàng', isVisible: true },
  { id: 'total_amount', label: 'Thành tiền', isVisible: true },
  { id: 'status', label: 'Trạng thái', isVisible: true },
  { id: 'actions', label: 'Thao tác', isVisible: true },
];

const getTodayVN = () => {
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vnTime.toISOString().split('T')[0];
};

const VegetableImportsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [searchText, setSearchText] = useState('');
  const [filterDate, setFilterDate] = useState(getTodayVN());
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
  const [viewingImages, setViewingImages] = useState<string[]>([]);
  const [viewingImageIndex, setViewingImageIndex] = useState(0);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const allFilters: ImportOrderFilters = {};
  if (filterDate) {
    allFilters.dateFrom = filterDate;
    allFilters.dateTo = filterDate;
  }
  if (filterStatus.length > 0) allFilters.status = filterStatus.join(',');
  allFilters.order_category = 'vegetable';
  allFilters.pageSize = 9999;

  const { data: vehicles } = useVehicles();
  const { data: allApiResponse, isLoading, isError, refetch } = useImportOrders(allFilters);
  const rankSourceOrders = useMemo<ImportOrderWithRelations[]>(
    () => allApiResponse?.data || [],
    [allApiResponse?.data]
  );
  const allOrders = useMemo(() => {
    if (!user || hasFullGoodsModuleAccess(user)) return rankSourceOrders;
    return rankSourceOrders.filter((o) =>
      importOrderVisibleToUser(o, { id: user.id, role: user.role, full_name: user.full_name }, vehicles || [])
    );
  }, [rankSourceOrders, user, vehicles]);
  const deleteMutation = useDeleteImportOrder();
  const confirmMutation = useConfirmImportOrderByAdmin();
  const sendVegetableArrivalMutation = useSendVegetableArrivalNotice();
  const assignVehicleMutation = useAssignVehicle();
  const [confirmingOrder, setConfirmingOrder] = useState<ImportOrder | null>(null);
  const [selectedConfirmVehicleId, setSelectedConfirmVehicleId] = useState('');
  const [pendingArrivalNotice, setPendingArrivalNotice] = useState<ArrivalNoticeOption | null>(null);

  const vegetableDeliveryVehicles = useMemo(() => {
    const supportedVehicles = (vehicles || []).filter((vehicle) => vehicleSupportsVegetable(vehicle) && vehicle.driver_id);
    const largeVehicles = supportedVehicles.filter(isLargeVehicle);
    return largeVehicles.length > 0 ? largeVehicles : supportedVehicles;
  }, [vehicles]);
  const vegetableDeliveryVehicleOptions = useMemo(
    () =>
      vegetableDeliveryVehicles.map((vehicle) => {
        const label = [
          vehicle.license_plate,
          vehicle.profiles?.full_name ? `- ${vehicle.profiles.full_name}` : '',
          vehicle.vehicle_type ? `(${vehicle.vehicle_type})` : '',
        ].filter(Boolean).join(' ');

        return {
          value: vehicle.id,
          label,
          searchText: [
            vehicle.license_plate,
            vehicle.profiles?.full_name,
            vehicle.vehicle_type,
          ].filter(Boolean).join(' '),
        };
      }),
    [vegetableDeliveryVehicles],
  );

  const normalizedSearchText = useMemo(
    () => removeAccents(searchText || '').toLowerCase().trim(),
    [searchText]
  );

  const filteredOrders = useMemo(() => {
    if (!normalizedSearchText) return allOrders;
    return allOrders.filter((order) =>
      removeAccents(getSupplierName(order)).toLowerCase().includes(normalizedSearchText)
    );
  }, [allOrders, normalizedSearchText]);

  const dailyTaiRankMap = useMemo(() => {
    const map = new Map<string, number>();
    const byDate = new Map<string, ImportOrder[]>();
    rankSourceOrders.forEach((order) => {
      if (isUnconfirmedCustomerOrder(order)) return;
      const orderDate = order.order_date || '';
      const current = byDate.get(orderDate) || [];
      current.push(order);
      byDate.set(orderDate, current);
    });
    byDate.forEach((ordersOnDate) => {
      const byDriver = new Map<string, ImportOrder[]>();
      ordersOnDate.forEach((order) => {
        const driverName = getOrderDriverName(order) || order.sender_name || '_';
        const current = byDriver.get(driverName) || [];
        current.push(order);
        byDriver.set(driverName, current);
      });

      const driverFirstOrders: { driverName: string; firstOrder: ImportOrder }[] = [];
      byDriver.forEach((driverOrders, driverName) => {
        const sorted = [...driverOrders].sort((a, b) => {
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return a.id.localeCompare(b.id);
        });
        driverFirstOrders.push({ driverName, firstOrder: sorted[0] });
      });

      driverFirstOrders.sort((a, b) => {
        const timeA = new Date(a.firstOrder.created_at || 0).getTime();
        const timeB = new Date(b.firstOrder.created_at || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.firstOrder.id.localeCompare(b.firstOrder.id);
      });

      driverFirstOrders.forEach((item, idx) => {
        const driverOrders = byDriver.get(item.driverName) || [];
        driverOrders.forEach((order) => {
          map.set(order.id, idx + 1);
        });
      });
    });
    return map;
  }, [rankSourceOrders]);

  const getTaiRank = useCallback(
    (order: ImportOrderWithRelations) => {
      if (isUnconfirmedCustomerOrder(order)) return null;
      return order.tai_rank ?? dailyTaiRankMap.get(order.id) ?? 1;
    },
    [dailyTaiRankMap]
  );

  const taiArrivalOptions = useMemo<ArrivalNoticeOption[]>(() => {
    const counts = new Map<number, number>();
    const platesByRank = new Map<number, Set<string>>();
    const driversByRank = new Map<number, Set<string>>();
    const inChargesByRank = new Map<number, Set<string>>();
    allOrders.forEach((order) => {
      const rank = getTaiRank(order);
      if (rank == null) return;
      counts.set(rank, (counts.get(rank) || 0) + 1);

      const vehiclePlates = getOrderVehicles(order);
      if (vehiclePlates) {
        const current = platesByRank.get(rank) || new Set<string>();
        vehiclePlates.split(', ').forEach((plate) => current.add(plate));
        platesByRank.set(rank, current);
      }

      const driverContacts = getOrderDriverContacts(order);
      if (driverContacts) {
        const current = driversByRank.get(rank) || new Set<string>();
        driverContacts.split('; ').forEach((contact) => current.add(contact));
        driversByRank.set(rank, current);
      }

      const inChargeContacts = getOrderInChargeContacts(order);
      if (inChargeContacts) {
        const current = inChargesByRank.get(rank) || new Set<string>();
        inChargeContacts.split('; ').forEach((contact) => current.add(contact));
        inChargesByRank.set(rank, current);
      }
    });

    return Array.from(counts.entries())
      .sort(([rankA], [rankB]) => rankA - rankB)
      .map(([rank, orderCount]) => ({
        rank,
        orderCount,
        vehiclePlates: Array.from(platesByRank.get(rank) || []).join(', '),
        driverContacts: Array.from(driversByRank.get(rank) || []).join('; '),
        inChargeContacts: Array.from(inChargesByRank.get(rank) || []).join('; '),
      }));
  }, [allOrders, getTaiRank]);

  const arrivalNoticeTargets = useMemo<ArrivalNoticeTarget[]>(() => {
    if (!pendingArrivalNotice) return [];

    const targets = new Map<string, ArrivalNoticeTarget>();
    allOrders.forEach((order) => {
      if (getTaiRank(order) !== pendingArrivalNotice.rank) return;

      const phone = getVegetableReceiverPhone(order);
      const key = phone || order.customer_id || order.id;
      const existing = targets.get(key);
      if (existing) {
        existing.orderCount += 1;
        if (!existing.phone && phone) existing.phone = phone;
        return;
      }

      targets.set(key, {
        key,
        name: getVegetableReceiverName(order),
        phone,
        orderCount: 1,
      });
    });

    return Array.from(targets.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allOrders, getTaiRank, pendingArrivalNotice]);

  const { vuaOptions, taiOptions, nguoiNhapOptions } = useMemo(() => {
    if (!allOrders) return { vuaOptions: [], taiOptions: [], nguoiNhapOptions: [] };
    const vuaSet = new Set<string>();
    const taiSet = new Set<string>();
    const receiverSet = new Set<string>();

    allOrders.forEach(order => {
      const chuHang = order.customers?.name || order.sender_name;
      if (chuHang) vuaSet.add(chuHang);

      const tai = getOrderVehicles(order);
      if (tai) {
        tai.split(', ').forEach((t: string) => taiSet.add(t));
      }

      const receiver = getOrderReceiverName(order);
      if (receiver) receiverSet.add(receiver);
    });

    return {
      vuaOptions: Array.from(vuaSet).map(v => ({ label: v, value: v })),
      taiOptions: Array.from(taiSet).map(v => ({ label: v, value: v })),
      nguoiNhapOptions: Array.from(receiverSet).map(v => ({ label: v, value: v }))
    };
  }, [allOrders]);

  // Pagination handled client-side so tai rank is computed across full day
  const totalItems = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const orders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, page, pageSize]);

  const groupedByDateThenCustomer = useMemo(() => {
    const byDate = new Map<string, ImportOrder[]>();
    orders.forEach((order) => {
      const orderDate = order.order_date || '';
      const current = byDate.get(orderDate) || [];
      current.push(order);
      byDate.set(orderDate, current);
    });

    const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

    const result: [string, [string, ImportOrder[]][]][] = [];
    sortedDates.forEach((date) => {
      const ordersOnDate = byDate.get(date) || [];
      const byCustomer = new Map<string, ImportOrder[]>();
      ordersOnDate.forEach((order) => {
        const supplierName = getSupplierName(order);
        const current = byCustomer.get(supplierName) || [];
        current.push(order);
        byCustomer.set(supplierName, current);
      });

      const customerGroups: [string, ImportOrder[]][] = [];
      byCustomer.forEach((customerOrders, customerName) => {
        const sorted = [...customerOrders].sort((a, b) => {
          const rankA = getTaiRank(a) ?? Number.MAX_SAFE_INTEGER;
          const rankB = getTaiRank(b) ?? Number.MAX_SAFE_INTEGER;
          if (rankA !== rankB) return rankA - rankB;
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return a.id.localeCompare(b.id);
        });
        customerGroups.push([customerName, sorted]);
      });

      result.push([date, customerGroups]);
    });

    return result;
  }, [orders, getTaiRank]);

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

  const handleConfirmOrder = async () => {
    if (!confirmingOrder) return;
    const selectedVehicle = vegetableDeliveryVehicles.find((vehicle) => vehicle.id === selectedConfirmVehicleId);
    if (!selectedVehicle?.driver_id) {
      toast.error('Vui lòng chọn xe lớn có tài xế');
      return;
    }

    const deliveryRows = (confirmingOrder as ImportOrderWithRelations).delivery_orders || [];
    if (deliveryRows.length === 0) {
      toast.error('Đơn chưa có dòng giao hàng để gán xe');
      return;
    }

    await Promise.all(
      deliveryRows.map((row) =>
        assignVehicleMutation.mutateAsync({
          id: row.id,
          payload: {
            assignments: [
              {
                vehicle_id: selectedVehicle.id,
                driver_id: selectedVehicle.driver_id,
                loader_name: '',
                quantity: row.total_quantity || 1,
              },
            ],
            delivery_date: confirmingOrder.order_date,
            append_only: false,
          },
        })
      )
    );

    await confirmMutation.mutateAsync({ id: confirmingOrder.id, orderCategory: 'vegetable' });
    setConfirmingOrder(null);
    setSelectedConfirmVehicleId('');
  };

  const handleSendVegetableArrivalNotice = async (option: ArrivalNoticeOption) => {
    if (!filterDate) {
      toast.error('Vui lòng chọn ngày trước khi gửi Zalo');
      return;
    }

    setPendingArrivalNotice(option);
  };

  const confirmSendVegetableArrivalNotice = async () => {
    if (!filterDate || !pendingArrivalNotice) return;

    await sendVegetableArrivalMutation.mutateAsync({ date: filterDate, taiRank: pendingArrivalNotice.rank });
    setPendingArrivalNotice(null);
  };

  const renderConfirmButton = (order: ImportOrder, size: number) => {
    if (!isCustomerSubmittedOrder(order)) return null;

    const confirmed = Boolean(order.admin_confirmed_at);
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!confirmed) {
            setConfirmingOrder(order);
            setSelectedConfirmVehicleId('');
          }
        }}
        disabled={confirmed || confirmMutation.isPending || assignVehicleMutation.isPending}
        className={clsx(
          'rounded-lg transition-colors disabled:opacity-40',
          size >= 14 ? 'p-1.5' : 'p-1',
          confirmed
            ? 'text-emerald-600 bg-emerald-500/10'
            : 'text-emerald-500 hover:bg-emerald-500/10',
        )}
        title={confirmed ? 'Admin đã xác nhận' : 'Admin xác nhận đơn'}
      >
        <CheckCircle2 size={size} />
      </button>
    );
  };

  const clearFilters = () => {
    setSearchText('');
    setFilterDate(getTodayVN());
    setFilterStatus([]);
    setFilterCustomer([]);
    setFilterVehicle([]);
    setFilterReceiver([]);
    setPage(1);
  };

  const hasActiveFilters = !!filterDate || filterStatus.length > 0 || !!searchText || filterCustomer.length > 0 || filterVehicle.length > 0 || filterReceiver.length > 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Nhập hàng rau"
          description="Quản lý danh sách đơn nhập hàng rau"
          backPath="/hang-hoa"
          actions={
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {user?.role === 'admin' && taiArrivalOptions.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {taiArrivalOptions.map((option) => (
                    <button
                      key={option.rank}
                      onClick={() => handleSendVegetableArrivalNotice(option)}
                      disabled={sendVegetableArrivalMutation.isPending}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-[12px] font-bold hover:bg-emerald-500/15 transition-all disabled:opacity-50"
                      title={`Gửi Zalo báo Tài ${option.rank}${option.vehiclePlates ? ` - xe ${option.vehiclePlates}` : ''} đã tới khu vực`}
                    >
                      <Send size={15} />
                      <span>Tài {option.rank}</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => navigate('/hang-hoa/in-phieu-rau')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/30 bg-primary/5 text-primary text-[13px] font-bold hover:bg-primary/10 transition-all"
              >
                <Printer size={16} />
                <span className="hidden sm:inline">In phiếu</span>
              </button>
              <button
                onClick={openAddDialog}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Thêm đơn nhập</span>
                <span className="sm:hidden">Thêm</span>
              </button>
            </div>
          }
        />
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0">
        <div className="p-3 border-b border-border flex flex-col md:flex-row items-stretch md:items-center gap-2">
          <div className="flex w-full md:flex-1 gap-2">
            <div className="flex-1">
              <SearchInput
                placeholder="Tìm kiếm tên vựa (không dấu)..."
                defaultValue={searchText}
                onSearch={(val) => {
                  if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                  searchTimeoutRef.current = setTimeout(() => {
                    setSearchText(val);
                    setPage(1);
                  }, 500);
                }}
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

            <button
               onClick={() => navigate('/hang-hoa/in-phieu-rau')}
               className="md:hidden flex items-center justify-center w-[38px] shrink-0 border border-primary/30 bg-primary/10 text-primary rounded-xl transition-all hover:bg-primary/20"
            >
               <Printer size={18} />
            </button>
          </div>

          {user?.role === 'admin' && taiArrivalOptions.length > 0 && (
            <div className="md:hidden flex gap-2 overflow-x-auto pb-1">
              {taiArrivalOptions.map((option) => (
                <button
                  key={option.rank}
                  onClick={() => handleSendVegetableArrivalNotice(option)}
                  disabled={sendVegetableArrivalMutation.isPending}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-[12px] font-bold whitespace-nowrap disabled:opacity-50"
                >
                  <Send size={15} />
                  Gửi Zalo Tài {option.rank}
                </button>
              ))}
            </div>
          )}

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

          <div className="hidden md:block w-[180px] relative z-20">
            <DatePicker
              value={filterDate}
              onChange={(val: string) => { setFilterDate(val); setPage(1); }}
              placeholder="Chọn ngày"
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
            title="Chưa có đơn nhập hàng"
            description="Bắt đầu bằng cách thêm đơn nhập hàng mới."
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
                        case 'order_datetime': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left w-36">Ngày giờ</th>;
                        case 'driver_received': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left w-36">Tài xế nhận</th>;
                        case 'tai_rank': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center w-16">Tài</th>;
                        case 'nguoi_gui': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left min-w-[120px]">Người gửi</th>;
                        case 'quantity': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center w-24">Số lượng</th>;
                        case 'item_names': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left min-w-[150px]">Tên hàng</th>;
                        case 'total_amount': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right w-36">Thành tiền</th>;
                        case 'status': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center w-28">Trạng thái</th>;
                        case 'actions': return <th key={col.id} className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center w-24">Thao tác</th>;
                        default: return null;
                      }
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {groupedByDateThenCustomer.map(([dateKey, customerGroups]) => (
                    <React.Fragment key={`date-${dateKey}`}>
                      <tr className="bg-blue-500/10">
                        <td colSpan={columns.filter(c => c.isVisible).length} className="px-4 py-2">
                          <span className="text-[12px] font-black text-blue-700 uppercase tracking-wider flex items-center gap-1.5"><Calendar size={13} /> {formatDateDMY(dateKey)}</span>
                        </td>
                      </tr>
                      {customerGroups.map(([supplierName, ordersInSupplier]) => (
                        <React.Fragment key={`date-${dateKey}-supplier-${supplierName}`}>
                          <tr className="bg-primary/5">
                            <td colSpan={columns.filter(c => c.isVisible).length} className="px-4 py-1.5 pl-6">
                              <span className="text-[11px] font-bold text-primary uppercase tracking-wider">Chủ vựa: {supplierName}</span>
                            </td>
                          </tr>
                          {ordersInSupplier.map((order) => (
                            <tr
                              key={order.id}
                              onClick={() => openEditDialog(order)}
                              className="hover:bg-muted/20 transition-colors cursor-pointer"
                            >
                              {columns.filter(c => c.isVisible).map((col) => {
                                switch (col.id) {
                                  case 'order_datetime': return (
                                    <td key={col.id} className="px-4 py-3">
                                      <div className="flex flex-col">
                                        <span className="text-[12px] text-foreground font-bold tabular-nums">{formatDateDMY(order.order_date)}</span>
                                        <span className="text-[11px] text-muted-foreground tabular-nums">{order.order_time || '-'}</span>
                                      </div>
                                    </td>
                                  );
                                  case 'driver_received': return (
                                    <td key={col.id} className="px-4 py-3">
                                      <span className="text-[12px] font-medium text-foreground">{getOrderDriverName(order) || '-'}</span>
                                    </td>
                                  );
                                  case 'tai_rank': return (
                                    <td key={col.id} className="px-4 py-3 text-center">
                                      {getTaiRank(order) == null ? (
                                        <span className="text-[12px] text-muted-foreground">-</span>
                                      ) : (
                                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/10 text-amber-700 text-[12px] font-black">
                                          {getTaiRank(order)}
                                        </span>
                                      )}
                                    </td>
                                  );
                                  case 'nguoi_gui': return (
                                    <td key={col.id} className="px-4 py-3">
                                      <span className="text-[13px] font-medium text-foreground">{order.sender_name || '-'}</span>
                                    </td>
                                  );
                                  case 'quantity': {
                                    const totalQty = order.import_order_items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
                                    return (
                                      <td key={col.id} className="px-4 py-3 text-center font-bold text-blue-600 text-[13px]">
                                        {totalQty}
                                      </td>
                                    );
                                  }
                                  case 'item_names': {
                                    const items = order.import_order_items?.map(item => item.products?.name).filter(Boolean).join(', ') || '-';
                                    return (
                                      <td key={col.id} className="px-4 py-3">
                                        <span className="text-[12px] text-foreground line-clamp-2">{items}</span>
                                      </td>
                                    );
                                  }
                                  case 'total_amount': return (
                                    <td key={col.id} className="px-4 py-3 text-right text-[13px] font-black text-primary tabular-nums">
                                      {formatCurrency(order.total_amount)}
                                    </td>
                                  );
                                  case 'status': return (
                                    <td key={col.id} className="px-4 py-3 text-center">
                                      {order.admin_confirmed_at ? (
                                        <span className="inline-flex px-2 py-1 rounded-md text-[11px] font-bold text-emerald-700 bg-emerald-500/10">
                                          Đã xác nhận
                                        </span>
                                      ) : (
                                        <StatusBadge status={order.status} label={statusLabels[order.status]} />
                                      )}
                                    </td>
                                  );
                                  case 'actions': return (
                                    <td key={col.id} className="px-4 py-3 flex items-center justify-center gap-1">
                                        {renderConfirmButton(order, 14)}
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
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {groupedByDateThenCustomer.map(([dateKey, customerGroups]) => (
                  <div key={`mobile-date-${dateKey}`} className="flex flex-col gap-2">
                    <div className="px-2 py-2 rounded-lg bg-blue-500/10 border border-blue-100/20">
                      <span className="text-[11px] font-black text-blue-700 uppercase tracking-wider flex items-center gap-1"><Calendar size={12} /> {formatDateDMY(dateKey)}</span>
                    </div>

                  {customerGroups.map(([supplierName, ordersInSupplier]) => (
                    <div key={`mobile-${dateKey}-${supplierName}`} className="flex flex-col gap-2">
                      <div className="px-2 py-1 ml-1 rounded-lg bg-primary/5 border border-primary/10">
                        <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Chủ vựa: {supplierName}</span>
                      </div>

                      {ordersInSupplier.map((order) => {
                        const orderImage = order.receipt_image_url || order.import_order_items?.[0]?.image_url;
                        const taiRank = getTaiRank(order);
                        
                        const totalQuantity = order.import_order_items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
                        const itemNames = order.import_order_items?.map(item => item.products?.name).filter(Boolean).join(', ') || '';

                        return (
                          <div
                            key={order.id}
                            onClick={() => openEditDialog(order)}
                            className="bg-card rounded-xl border border-border shadow-sm cursor-pointer hover:shadow-md active:bg-muted/10 transition-all flex items-center gap-3 p-2.5 overflow-hidden"
                          >
                            <div className="w-[64px] h-[64px] shrink-0 bg-muted/20 rounded-lg overflow-hidden">
                              {orderImage ? (
                                <img src={cloudinarySmall(orderImage)} alt={supplierName} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImageIcon size={22} className="text-muted-foreground/30" />
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5 gap-2">
                                <span className="text-[13px] font-bold text-foreground truncate">{getSupplierName(order)}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {taiRank == null ? (
                                      <span className="text-[11px] text-muted-foreground">Tài -</span>
                                    ) : (
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/10 text-amber-700 text-[11px] font-black">{taiRank}</span>
                                    )}
                                    <StatusBadge status={order.status} label={statusLabels[order.status]} />
                                  </div>
                              </div>
                              <div className="mb-1.5">
                                <span className="text-[10px] text-muted-foreground tabular-nums">{order.order_date}</span>
                              </div>
                              {!isDriverRole(user?.role) && (
                                <>
                                  <div className="mb-1">
                                    <span className="text-[10px] text-muted-foreground">Tài xế: {getOrderDriverName(order) || '-'}</span>
                                  </div>
                                  <div className="mb-1.5">
                                    <span className="text-[10px] text-amber-700">Biển số: {getOrderVehicles(order) || '-'}</span>
                                  </div>
                                </>
                              )}
                              {(totalQuantity > 0 || itemNames) && (
                                <div className="mb-1.5">
                                  <span className="text-[10px] text-muted-foreground line-clamp-1">
                                    Mặt hàng: <span className="font-medium text-foreground">{itemNames || '-'}</span>
                                    {totalQuantity > 0 && <span className="ml-1 font-bold text-blue-600">({totalQuantity})</span>}
                                  </span>
                                </div>
                              )}
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
                                            const imgs: string[] = [];
                                            if (order.receipt_image_url) imgs.push(order.receipt_image_url);
                                            order.import_order_items?.forEach(item => { if (item.image_url && !imgs.includes(item.image_url)) imgs.push(item.image_url); });
                                            if (imgs.length > 0) { setViewingImages(imgs); setViewingImageIndex(0); }
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
                                      {renderConfirmButton(order, 13)}
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
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
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

      <AddEditVegetableImportOrderDialog
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

      <ConfirmDialog
        isOpen={!!confirmingOrder}
        title="Xác nhận đơn hàng rau"
        message={
          <span className="block space-y-3">
            <span className="block">
              Chọn tài xế xe lớn để giao đơn {confirmingOrder?.order_code || ''}. Sau khi xác nhận, khách hàng sẽ không thể tự sửa đơn này.
            </span>
            <label className="block space-y-1.5">
              <span className="block text-[12px] font-bold text-foreground">Xe lớn / tài xế</span>
              <SearchableSelect
                options={vegetableDeliveryVehicleOptions}
                value={selectedConfirmVehicleId}
                onValueChange={setSelectedConfirmVehicleId}
                placeholder="Chọn xe để tạo tài"
                searchPlaceholder="Tìm xe hoặc tài xế..."
                emptyMessage="Không có xe phù hợp."
              />
            </label>
            {vegetableDeliveryVehicles.length === 0 && (
              <span className="block text-[12px] font-semibold text-red-500">
                Chưa có xe rau có tài xế. Vui lòng cấu hình xe/tài xế trước.
              </span>
            )}
          </span>
        }
        confirmLabel="Gán xe & xác nhận"
        variant="primary"
        isLoading={confirmMutation.isPending || assignVehicleMutation.isPending}
        onConfirm={handleConfirmOrder}
        onCancel={() => {
          setConfirmingOrder(null);
          setSelectedConfirmVehicleId('');
        }}
      />

      <ConfirmDialog
        isOpen={!!pendingArrivalNotice}
        title={`Gửi Zalo Tài ${pendingArrivalNotice?.rank || ''}`}
        message={
          <span className="block space-y-3">
            <span className="block">
              Tin nhắn sẽ gửi cho {arrivalNoticeTargets.length} vựa nhận rau ngày {formatDateDMY(filterDate)}.
            </span>
            {pendingArrivalNotice?.vehiclePlates && (
              <span className="block rounded-xl bg-blue-500/10 px-3 py-2 text-[12px] font-bold text-blue-700">
                Biển số xe: {pendingArrivalNotice.vehiclePlates}
              </span>
            )}
            {(pendingArrivalNotice?.driverContacts || pendingArrivalNotice?.inChargeContacts) && (
              <span className="block rounded-xl bg-muted/30 px-3 py-2 text-[12px] text-foreground space-y-1">
                {pendingArrivalNotice?.driverContacts && (
                  <span className="block"><strong>Tài xế:</strong> {pendingArrivalNotice.driverContacts}</span>
                )}
                {pendingArrivalNotice?.inChargeContacts && (
                  <span className="block"><strong>Phụ trách xe:</strong> {pendingArrivalNotice.inChargeContacts}</span>
                )}
              </span>
            )}
            <span className="block rounded-xl border border-border bg-muted/20 overflow-hidden">
              <span className="block max-h-64 overflow-y-auto divide-y divide-border">
                {arrivalNoticeTargets.map((target) => (
                  <span key={target.key} className="flex items-start justify-between gap-3 px-3 py-2 text-left">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-foreground truncate">{target.name}</span>
                      <span className={clsx('block text-[11px] font-medium', target.phone ? 'text-muted-foreground' : 'text-red-500')}>
                        {target.phone || 'Thiếu số điện thoại'}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                      {target.orderCount} đơn
                    </span>
                  </span>
                ))}
              </span>
            </span>
            {arrivalNoticeTargets.some((target) => !target.phone) && (
              <span className="block text-[12px] font-semibold text-amber-600">
                Các vựa thiếu số điện thoại sẽ được bỏ qua khi gửi.
              </span>
            )}
            <span className="block rounded-xl bg-emerald-500/10 px-3 py-2 text-[12px] font-medium text-emerald-700">
              Nội dung: Tài {pendingArrivalNotice?.rank}{pendingArrivalNotice?.vehiclePlates ? ` - xe ${pendingArrivalNotice.vehiclePlates}` : ''} đã tới khu vực.
              {pendingArrivalNotice?.driverContacts ? ` Tài xế: ${pendingArrivalNotice.driverContacts}.` : ''}
              {pendingArrivalNotice?.inChargeContacts ? ` Người phụ trách xe: ${pendingArrivalNotice.inChargeContacts}.` : ''}
              {' '}Vui lòng ra lấy hàng rau.
            </span>
          </span>
        }
        confirmLabel="Gửi Zalo"
        cancelLabel="Để sau"
        variant="primary"
        isLoading={sendVegetableArrivalMutation.isPending}
        onConfirm={confirmSendVegetableArrivalNotice}
        onCancel={() => setPendingArrivalNotice(null)}
      />

      {viewingImages.length > 0 && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-200"
          onClick={() => setViewingImages([])}
        >
          <button
            onClick={() => setViewingImages([])}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
          >
            <X size={20} />
          </button>
          {viewingImages.length > 1 && (
            <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-white/10 text-white text-[12px] font-bold">
              {viewingImageIndex + 1} / {viewingImages.length}
            </div>
          )}
          <img
            src={viewingImages[viewingImageIndex]}
            alt="Receipt"
            className="max-w-[95vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          {viewingImages.length > 1 && (
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={(e) => { e.stopPropagation(); setViewingImageIndex(i => Math.max(0, i - 1)); }}
                disabled={viewingImageIndex <= 0}
                className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              {viewingImages.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setViewingImageIndex(i); }}
                  className={clsx('w-2 h-2 rounded-full transition-all', i === viewingImageIndex ? 'bg-white scale-125' : 'bg-white/30')}
                />
              ))}
              <button
                onClick={(e) => { e.stopPropagation(); setViewingImageIndex(i => Math.min(viewingImages.length - 1, i + 1)); }}
                disabled={viewingImageIndex >= viewingImages.length - 1}
                className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>,
        document.body
      )}

      <DraggableFAB 
        icon={<Plus size={24} />} 
        onClick={openAddDialog} 
      />

      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={(filters) => {
          setFilterStatus(filters.status);
          setPage(1);
        }}
        initialDateFrom={filterDate}
        initialDateTo={filterDate}
        hideDateFilter
        initialStatus={filterStatus}
        statusOptions={statusOptions}
        onClear={() => {
          setFilterDate(getTodayVN());
          setFilterCustomer([]);
          setFilterVehicle([]);
          setFilterReceiver([]);
        }}
        showClearButton={filterCustomer.length > 0 || filterVehicle.length > 0 || filterReceiver.length > 0}
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

export default VegetableImportsPage;
