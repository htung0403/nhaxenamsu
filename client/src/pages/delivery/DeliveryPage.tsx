import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { Calendar, PlusCircle, Truck, CheckCircle, Check, Store, Package, User, Image as ImageIcon, Eye, Trash2, Pencil, RotateCcw, ChevronLeft, ChevronRight, Phone, PhoneCall } from 'lucide-react';

import { DatePicker } from '../../components/shared/DatePicker';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import PageHeader from '../../components/shared/PageHeader';
import { useDeliveryOrders, useConfirmDelivery, useDeleteDeliveryOrders } from '../../hooks/queries/useDelivery';
import { useVehicles } from '../../hooks/queries/useVehicles';
import { useAuth } from '../../context/AuthContext';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import AssignVehicleDialog from './dialogs/AssignVehicleDialog';
import OrderImagesDialog from './dialogs/OrderImagesDialog';
import EditDeliveryDialog from './dialogs/EditDeliveryDialog';
import BulkAssignVehicleDialog from './dialogs/BulkAssignVehicleDialog';
import BulkEditDeliveryDialog from './dialogs/BulkEditDeliveryDialog';
import RevertVehicleDialog from './dialogs/RevertVehicleDialog';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import { Filter, X, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SearchInput } from '../../components/ui/SearchInput';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { matchesSearch } from '../../lib/str-utils';
import { getDeliveryAnchorDateString } from '../../lib/deliveryDayAnchor';
import { isOldOrderForAgeRule, getEffectiveDeliveryStatus } from '../../lib/deliveryAgeRule';
import {
  createDeliveryGroupSourceIdsMap,
  getDeliveryViewGroupKey,
  getReceiverDisplayName,
  groupDeliveryOrderBuckets,
  groupDeliveryOrdersForView,
  mergeDeliveryOrderGroup,
} from '../../lib/deliveryGrouping';
import type { DeliveryOrder, Vehicle } from '../../types';
import { isSoftDeletedSourceOrder } from '../../utils/softDeletedOrder';
import { deliveryOrderVisibleToUser, hasFullGoodsModuleAccess } from '../../utils/goodsModuleScope';
import { VehicleCellTooltip } from './components/VehicleCellTooltip';

const formatNumber = (val?: number) => {
  if (val == null) return '0';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val);
};

const STATUS_LABELS: Record<string, string> = {
  all: 'Tất cả',
  hang_o_sg: 'Hàng ở SG',
  can_giao: 'Cần giao',
  da_giao: 'Đã giao',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  all: { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  hang_o_sg: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-500', dot: 'bg-blue-500' },
  can_giao: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-500', dot: 'bg-orange-500' },
  da_giao: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-500', dot: 'bg-green-500' },
};

const ASSIGNMENT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  assigned: { label: 'Chờ tài xế', className: 'bg-slate-500/10 text-slate-700 dark:text-slate-400' },
  in_transit: { label: 'Đang giao', className: 'bg-orange-500/10 text-orange-700 dark:text-orange-500' },
  completed: { label: 'Tài xế đã giao', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-500' },
};

const getAssignmentStatusSummary = (order: DeliveryOrder) => {
  const statuses = new Set((order.delivery_vehicles || [])
    .filter((dv) => (dv.assigned_quantity || 0) > 0)
    .map((dv) => dv.status));
  if (statuses.has('in_transit')) return ASSIGNMENT_STATUS_CONFIG.in_transit;
  if (statuses.size > 0 && Array.from(statuses).every((status) => status === 'completed')) return ASSIGNMENT_STATUS_CONFIG.completed;
  if (statuses.has('assigned')) return ASSIGNMENT_STATUS_CONFIG.assigned;
  return null;
};

const PAYMENT_STATUS_CONFIG = {
  unpaid: { label: 'Chưa thanh toán', className: 'bg-red-500/10 text-red-700 dark:text-red-500 border-red-200/20' },
  partial: { label: 'Thu một phần', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200/20' },
  paid_sg: { label: 'Đã trả cước SG', className: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-500 border-indigo-200/20' },
  paid_driver: { label: 'Đã thanh toán', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-200/20' },
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

const getOrderCreatedDateTimeVI = (order: DeliveryOrder) => {
  const createdAt = getOrderCreatedAt(order);
  return createdAt ? format(createdAt, 'd/M/yyyy · HH:mm') : '-';
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

const getImportOrderShortDate = (order: DeliveryOrder) => {
  const importOrder = Array.isArray(order.import_orders) ? order.import_orders[0] : order.import_orders;
  if (!importOrder?.created_at) return null;

  const createdAt = new Date(importOrder.created_at);
  if (Number.isNaN(createdAt.getTime())) return null;

  return format(createdAt, 'dd/MM');
};

const getDisplayProductName = (order: DeliveryOrder) => {
  const productName = order.product_name.includes(' - ')
    ? order.product_name.split(' - ').slice(1).join(' - ')
    : order.product_name;
  const createdDate = getImportOrderShortDate(order);
  return createdDate ? `${productName} (${createdDate})` : productName;
};

type DeliverySourceRelation = {
  profiles?: { full_name?: string | null } | null;
  customers?: { name?: string | null; phone?: string | null } | null;
  receiver_phone?: string | null;
  receipt_image_url?: string | null;
  receipt_image_urls?: string[] | null;
  import_order_items?: DeliveryItemImageRef[] | null;
  vegetable_order_items?: DeliveryItemImageRef[] | null;
};

type DeliveryItemImageRef = {
  image_url?: string | null;
  image_urls?: string[] | null;
  products?: { name?: string | null } | null;
};

const pickRelation = <T,>(relation: T | T[] | null | undefined): T | undefined => {
  if (Array.isArray(relation)) return relation[0];
  return relation || undefined;
};

/** Nhân viên nhận hàng (phiếu nhập — received_by) */
const getImportReceivedByStaffName = (order: DeliveryOrder) => {
  const src = pickRelation<DeliverySourceRelation>(order.import_orders) || pickRelation<DeliverySourceRelation>(order.vegetable_orders);
  const name = src?.profiles?.full_name?.trim();
  return name || '—';
};

const extractPhoneDigits = (phone?: string | null) => (phone || '').replace(/\D/g, '');

const toWhatsappPhone = (digits: string) => {
  if (!digits) return '';
  if (digits.startsWith('84')) return digits;
  if (digits.startsWith('0')) return `84${digits.slice(1)}`;
  return digits;
};

const getCustomerPhone = (order: DeliveryOrder) => {
  const src = pickRelation<DeliverySourceRelation>(order.import_orders) || pickRelation<DeliverySourceRelation>(order.vegetable_orders);
  return src?.customers?.phone || src?.receiver_phone || '';
};

const isRevertAllowed = (order: DeliveryOrder, isAdmin: boolean) => {
  if (isAdmin) {
    return (order.delivery_vehicles || []).some((dv) => (dv.assigned_quantity || 0) > 0);
  }

  const now = Date.now();
  return (order.delivery_vehicles || []).some((dv) => {
    if ((dv.assigned_quantity || 0) <= 0) return false;
    const assignedTime = dv.assigned_at ? new Date(dv.assigned_at).getTime() : 0;
    return now - assignedTime < 24 * 60 * 60 * 1000;
  });
};

const getOrderPreviewImage = (order: DeliveryOrder | null | undefined) => {
  if (!order) return null;
  const directImage = order.image_url;
  if (directImage) return directImage;
  if (order.image_urls && Array.isArray(order.image_urls) && order.image_urls.length > 0) return order.image_urls[0];

  const paymentImage = order.payment_collections?.find((pc) => pc.image_url)?.image_url;
  if (paymentImage) return paymentImage;

  const vehicleImage = (order.delivery_vehicles || [])
    .find((dv) => (dv.image_urls?.length || 0) > 0)?.image_urls?.[0];
  if (vehicleImage) return vehicleImage;

  const linkedImport = pickRelation<DeliverySourceRelation>(order.import_orders);
  const linkedVeg = pickRelation<DeliverySourceRelation>(order.vegetable_orders);

  if (linkedImport?.receipt_image_url) return linkedImport.receipt_image_url;
  if (linkedImport?.receipt_image_urls?.length) return linkedImport.receipt_image_urls[0];
  if (linkedVeg?.receipt_image_url) return linkedVeg.receipt_image_url;
  if (linkedVeg?.receipt_image_urls?.length) return linkedVeg.receipt_image_urls[0];

  const targetProductName = order.product_name ? (
    order.product_name.includes(' - ')
      ? order.product_name.split(' - ').slice(1).join(' - ').trim().toLowerCase()
      : order.product_name.trim().toLowerCase()
  ) : null;

  const collectFirstImage = (refs: DeliveryItemImageRef[] | DeliveryItemImageRef | null | undefined): string | null => {
    const list: DeliveryItemImageRef[] = Array.isArray(refs) ? refs : refs ? [refs] : [];

    // First try to find an item that matches the product name
    if (targetProductName) {
      for (const ref of list) {
        const itemName = ref.products?.name?.trim().toLowerCase();
        if (itemName === targetProductName) {
          if (ref.image_url) {
            if (typeof ref.image_url === 'string' && ref.image_url.includes(',')) return ref.image_url.split(',')[0].trim();
            if (typeof ref.image_url === 'string') return ref.image_url;
          }
          if (ref.image_urls && Array.isArray(ref.image_urls) && ref.image_urls.length > 0) {
            return ref.image_urls[0];
          }
        }
      }
    }

    // Fallback to any item if no exact match found or if item has no product info
    for (const ref of list) {
      if (ref.image_url) {
        if (typeof ref.image_url === 'string' && ref.image_url.includes(',')) return ref.image_url.split(',')[0].trim();
        if (typeof ref.image_url === 'string') return ref.image_url;
      }
      if (ref.image_urls && Array.isArray(ref.image_urls) && ref.image_urls.length > 0) {
        return ref.image_urls[0];
      }
    }
    return null;
  };

  const importItemImage = collectFirstImage(linkedImport?.import_order_items);
  if (importItemImage) return importItemImage;

  const vegItemImage = collectFirstImage(linkedVeg?.vegetable_order_items);
  if (vegItemImage) return vegItemImage;

  return null;
};

const getOrderPaymentStatus = (order: DeliveryOrder): keyof typeof PAYMENT_STATUS_CONFIG => {
  const sourceOrder = Array.isArray(order.import_orders) ? order.import_orders[0] : order.import_orders
    || (Array.isArray(order.vegetable_orders) ? order.vegetable_orders[0] : order.vegetable_orders);

  if (sourceOrder && sourceOrder.payment_status === 'paid') {
    return 'paid_sg';
  }

  if (order.export_order_payment_status) {
    return order.export_order_payment_status === 'paid' ? 'paid_driver' : order.export_order_payment_status as keyof typeof PAYMENT_STATUS_CONFIG;
  }

  const assignedVehicleIds = (order.delivery_vehicles || [])
    .filter((dv) => (dv.assigned_quantity || 0) > 0)
    .map((dv) => dv.vehicle_id)
    .filter((vehicleId): vehicleId is string => Boolean(vehicleId));

  if (assignedVehicleIds.length === 0) return 'unpaid';

  const paidVehicleIds = new Set(
    (order.payment_collections || [])
      .filter((pc) => isPaidCollectionStatus(pc.status))
      .map((pc) => pc.vehicle_id)
      .filter((vehicleId): vehicleId is string => Boolean(vehicleId))
  );

  const paidCount = assignedVehicleIds.filter((vehicleId) => paidVehicleIds.has(vehicleId)).length;

  if (paidCount === 0) return 'unpaid';
  if (paidCount === assignedVehicleIds.length) return 'paid_driver';
  return 'partial';
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

const isAgeFilterValue = (value: string): value is 'all' | 'new' | 'old' =>
  value === 'all' || value === 'new' || value === 'old';

const DeliveryPage: React.FC = () => {
  const navigate = useNavigate();
  const today = getTodayString();
  const oneWeekAgo = getOneWeekAgoString();
  const [startDate, setStartDate] = useState<string>(oneWeekAgo);
  const [endDate, setEndDate] = useState<string>(today);
  const [statusFilter, setStatusFilter] = useState<'all' | 'can_giao' | 'hang_o_sg' | 'da_giao'>('can_giao');
  const [ageFilter, setAgeFilter] = useState<'all' | 'new' | 'old'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 30;

  const { user } = useAuth();
  const { data: ordersRaw, isLoading: ordersLoading, isError, refetch } = useDeliveryOrders(startDate || undefined, endDate || undefined, 'standard');
  const { data: vehicles } = useVehicles();
  const baseOrders = React.useMemo(
    () => (ordersRaw || []).filter((o) => !isSoftDeletedSourceOrder(o)),
    [ordersRaw]
  );

  const groupedOrdersView = React.useMemo(() => {
    const grouped = groupDeliveryOrdersForView(baseOrders || []);

    if (!user || hasFullGoodsModuleAccess(user)) return grouped;

    const actor = { id: user.id, role: user.role, full_name: user.full_name };
    return grouped.filter((groupOrder) =>
      Array.isArray(groupOrder.source_orders) &&
      groupOrder.source_orders.some((sourceOrder) =>
        deliveryOrderVisibleToUser(sourceOrder, actor, vehicles || [])
      )
    );
  }, [baseOrders, user, vehicles]);

  const adminCanGiaoGroupKeySet = React.useMemo(() => {
    const keys = new Set<string>();
    groupDeliveryOrderBuckets(baseOrders).forEach((group, key) => {
      const adminViewOrder = mergeDeliveryOrderGroup(group);

      if (getEffectiveDeliveryStatus(adminViewOrder) === 'can_giao') {
        keys.add(key);
      }
    });

    return keys;
  }, [baseOrders]);

  const groupToSourceIdsMap = React.useMemo(
    () => createDeliveryGroupSourceIdsMap(groupedOrdersView),
    [groupedOrdersView]
  );

  const expandGroupedIds = React.useCallback((ids: string[]) => {
    const expanded = new Set<string>();
    ids.forEach((id) => {
      const sourceIds = groupToSourceIdsMap.get(id) || [id];
      sourceIds.forEach((sourceId) => expanded.add(sourceId));
    });
    return Array.from(expanded);
  }, [groupToSourceIdsMap]);

  const confirmMutation = useConfirmDelivery();
  const deleteMutation = useDeleteDeliveryOrders();

  const [revertingOrder, setRevertingOrder] = useState<DeliveryOrder | null>(null);
  const [isRevertClosing, setIsRevertClosing] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<'edit' | 'add-new' | 'view'>('edit');
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isAssignClosing, setIsAssignClosing] = useState(false);

  const [viewingImageOrder, setViewingImageOrder] = useState<DeliveryOrder | null>(null);
  const [isViewingClosing, setIsViewingClosing] = useState(false);

  const [editingOrder, setEditingOrder] = useState<DeliveryOrder | null>(null);
  const [isEditClosing, setIsEditClosing] = useState(false);

  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [isBulkAssignClosing, setIsBulkAssignClosing] = useState(false);

  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isBulkEditClosing, setIsBulkEditClosing] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);

  const [callDialog, setCallDialog] = useState<{ name: string; phone: string } | null>(null);

  const isLoading = ordersLoading;
  const isAdminRole = user?.role === 'admin';
  const isAdmin = isAdminRole || user?.role === 'manager';
  const normalizedRole = (user?.role || '').toLowerCase();
  const isLoader = normalizedRole.includes('lo_xe') || normalizedRole.includes('lơ xe');
  const isDriver = normalizedRole === 'driver' || normalizedRole.includes('tai_xe') || normalizedRole.includes('tài xế') || normalizedRole.includes('driver');
  const isDriverOrLoader = isDriver || isLoader;
  const eligibleVehicles = React.useMemo(
    () => (vehicles || []).filter((vehicle) => vehicleSupportsGoodsCategory(vehicle, 'grocery')),
    [vehicles]
  );
  const myVehicleIds = React.useMemo(
    () => eligibleVehicles.filter((v) =>
      v.driver_id === user?.id ||
      v.in_charge_id === user?.id ||
      (user?.full_name && v.profiles?.full_name === user?.full_name) ||
      (user?.full_name && v.responsible_profile?.full_name === user?.full_name)
    ).map((v) => v.id),
    [eligibleVehicles, user]
  );
  const myVehicleIdSet = React.useMemo(() => new Set(myVehicleIds), [myVehicleIds]);
  const myPrimaryVehicleId = myVehicleIds[0];
  const canShowAssignButton = isAdmin || isLoader || (isDriver && myVehicleIds.length > 0);

  const displayedVehicles = React.useMemo(() => {
    let filtered = eligibleVehicles;
    if (statusFilter === 'da_giao' && isDriverOrLoader) {
      filtered = eligibleVehicles.filter(v => myVehicleIdSet.has(v.id));
    }

    const VEHICLE_PLATE_TO_SLOT: Record<string, string> = {
      '06850': '1',
      '07744': '2',
      '09705': '3',
      '03889': '4',
      '08713': '5',
      '12918': '6',
      '10680': '7',
      '23763': '8',
      'ba1234': 'ba',
    };

    const getVehicleSlotIndex = (licensePlate: string): number => {
      const normalized = (licensePlate || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      for (const [key, slot] of Object.entries(VEHICLE_PLATE_TO_SLOT)) {
        if (normalized.endsWith(key) || normalized.includes(key)) {
          return parseInt(slot) || (slot === 'ba' ? 9 : 99);
        }
      }

      if (normalized.includes('ba')) return 9;
      return 99;
    };

    return [...filtered].sort((a, b) => {
      const indexA = getVehicleSlotIndex(a.license_plate || '');
      const indexB = getVehicleSlotIndex(b.license_plate || '');
      if (indexA !== indexB) return indexA - indexB;
      return (a.license_plate || '').localeCompare(b.license_plate || '', 'vi');
    });
  }, [eligibleVehicles, statusFilter, isDriverOrLoader, myVehicleIdSet]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCustomer, setFilterCustomer] = useState<string[]>([]);
  const [filterReceiver, setFilterReceiver] = useState<string[]>([]);
  const [filterVehicleIds, setFilterVehicleIds] = useState<string[]>([]);
  const [filterDeliveryDate, setFilterDeliveryDate] = useState<string>('');
  const [filterHasExcess, setFilterHasExcess] = useState(false);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, ageFilter, startDate, endDate, searchQuery, filterCustomer, filterReceiver, filterVehicleIds, filterHasExcess, filterDeliveryDate]);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);

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
    setSelectedVehicleId(vehicleId || null);
    setAssignMode(mode || 'edit');
    setIsAssignOpen(true);
  };

  const openEdit = (order: DeliveryOrder) => {
    setEditingOrder(order);
  };

  const openImageViewer = (order: DeliveryOrder) => {
    setViewingImageOrder(order);
  };

  const closeEdit = () => {
    setIsEditClosing(true);
    setTimeout(() => {
      setEditingOrder(null);
      setIsEditClosing(false);
    }, 300);
  };

  const openBulkEdit = () => setIsBulkEditOpen(true);
  const closeBulkEdit = () => {
    setIsBulkEditClosing(true);
    setTimeout(() => {
      setIsBulkEditOpen(false);
      setIsBulkEditClosing(false);
      setSelectedIds(new Set());
    }, 300);
  };

  const openBulkAssign = () => setIsBulkAssignOpen(true);
  const closeBulkAssign = () => {
    setIsBulkAssignClosing(true);
    setTimeout(() => {
      setIsBulkAssignOpen(false);
      setIsBulkAssignClosing(false);
      setSelectedIds(new Set());
    }, 300);
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

  const openRevert = (order: DeliveryOrder) => setRevertingOrder(order);
  const closeRevert = () => {
    setIsRevertClosing(true);
    setTimeout(() => {
      setRevertingOrder(null);
      setIsRevertClosing(false);
    }, 300);
  };

  const handleOrderClick = async (order: DeliveryOrder, vehicleId?: string, mode?: 'edit' | 'add-new' | 'view') => {
    if (isDriver && !isLoader && myVehicleIds.length === 0) return;

    const clickedVehicleId = vehicleId || (myVehicleIds.length === 1 ? myPrimaryVehicleId : undefined);

    openAssign(order, clickedVehicleId, mode);
  };

  const handleConfirm = async (orderIds: string[]) => {
    try {
      await confirmMutation.mutateAsync(expandGroupedIds(orderIds));
    } catch {
      // Error handled by mutation
    }
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setOrderToDelete('bulk');
    setDeleteConfirmOpen(true);
  };

  const handleDeleteOne = (id: string) => {
    setOrderToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setOrderToDelete(null);
  };

  const executeDelete = async () => {
    try {
      if (orderToDelete === 'bulk') {
        await deleteMutation.mutateAsync(expandGroupedIds(Array.from(selectedIds)));
        setSelectedIds(new Set());
      } else if (orderToDelete) {
        await deleteMutation.mutateAsync(expandGroupedIds([orderToDelete]));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(orderToDelete);
          return next;
        });
      }
      closeDeleteConfirm();
    } catch {
      // Error handled by mutation
    }
  };

  const handleOpenCallDialog = (name: string, phone?: string) => {
    const digits = extractPhoneDigits(phone);
    if (!digits) return;
    setCallDialog({ name, phone: digits });
  };

  const handleCallViaPhone = () => {
    if (!callDialog) return;
    window.open(`tel:${callDialog.phone}`);
    setCallDialog(null);
  };

  const handleCallViaWhatsApp = () => {
    if (!callDialog) return;
    const whatsappPhone = toWhatsappPhone(callDialog.phone);
    if (!whatsappPhone) return;
    window.open(`https://wa.me/${whatsappPhone}`, '_blank', 'noopener,noreferrer');
    setCallDialog(null);
  };

  const getTotalAssignedQuantity = React.useCallback(
    (order: DeliveryOrder) =>
      (order.delivery_vehicles || []).reduce((sum, dv) => sum + (dv.assigned_quantity || 0), 0),
    []
  );

  const hasMyVehicleAssignment = React.useCallback(
    (order: DeliveryOrder) =>
      (order.delivery_vehicles || []).some((dv) =>
        dv.vehicle_id && myVehicleIdSet.has(dv.vehicle_id) && (dv.assigned_quantity || 0) > 0
      ),
    [myVehicleIdSet]
  );

  const hasDeliveredSourceStatus = React.useCallback((order: DeliveryOrder) => {
    if (order.status === 'da_giao') return true;
    if (!Array.isArray(order.source_orders)) return false;
    return order.source_orders.some((sourceOrder) => sourceOrder?.status === 'da_giao');
  }, []);

  const isDeliveredTabOrder = React.useCallback((order: DeliveryOrder) => {
    if (hasDeliveredSourceStatus(order)) return true;
    const eff = getEffectiveDeliveryStatus(order);
    if (eff === 'da_giao') return true;
    const totalAssigned = getTotalAssignedQuantity(order);
    return totalAssigned > 0 && totalAssigned < order.total_quantity;
  }, [getTotalAssignedQuantity, hasDeliveredSourceStatus]);

  const isAdminCanGiaoOrder = React.useCallback((order: DeliveryOrder) =>
    adminCanGiaoGroupKeySet.has(getDeliveryViewGroupKey(order)),
    [adminCanGiaoGroupKeySet]
  );

  const anchorStr = getDeliveryAnchorDateString();

  const filteredOrders = React.useMemo(() => {
    let next = groupedOrdersView || [];

    if (ageFilter === 'new') {
      next = next.filter((o) => !isOldOrderForAgeRule(o, anchorStr));
    } else if (ageFilter === 'old') {
      next = next.filter((o) => isOldOrderForAgeRule(o, anchorStr));
    }

    return next.filter(o => {
      const cName = o.import_orders?.sender_name || o.import_orders?.customers?.name;
      const rName = o.import_orders?.customers?.name || o.import_orders?.receiver_name?.trim() || o.import_orders?.profiles?.full_name;

      if (searchQuery && !matchesSearch(rName || '', searchQuery)) return false;
      if (filterCustomer.length > 0 && cName && !filterCustomer.includes(cName)) return false;
      if (filterReceiver.length > 0 && rName && !filterReceiver.includes(rName)) return false;
      if (filterDeliveryDate) {
        const vehicleDateMatch = (o.delivery_vehicles || []).some(
          (dv) => (dv.assigned_quantity || 0) > 0 && dv.delivery_date === filterDeliveryDate
        );
        if (!vehicleDateMatch) return false;
      }

      if (filterVehicleIds.length > 0) {
        const assignedToSelected = (o.delivery_vehicles || []).some(
          (dv) =>
            dv.vehicle_id &&
            filterVehicleIds.includes(dv.vehicle_id) &&
            (dv.assigned_quantity || 0) > 0
        );
        if (!assignedToSelected) return false;
      }

      if (filterHasExcess) {
        const totalAssigned = getTotalAssignedQuantity(o);
        const remainingQty = o.total_quantity - totalAssigned;
        if (remainingQty >= 0) return false;
      }

      return true;
    });
  }, [groupedOrdersView, ageFilter, anchorStr, searchQuery, filterCustomer, filterReceiver, filterDeliveryDate, filterVehicleIds, filterHasExcess, getTotalAssignedQuantity]);

  const statusCounts = React.useMemo(() => ({
    all: filteredOrders.length,
    hang_o_sg: filteredOrders.filter((o) => getEffectiveDeliveryStatus(o) === 'hang_o_sg').length,
    can_giao: filteredOrders.filter((o) => {
      const remainingQty = o.total_quantity - getTotalAssignedQuantity(o);
      if (remainingQty <= 0) return false;
      const eff = getEffectiveDeliveryStatus(o, remainingQty);
      if (eff !== 'can_giao') return false;
      if (isDriverOrLoader && !isAdminCanGiaoOrder(o)) return false;
      return true;
    }).length,
    da_giao: filteredOrders.filter((o) => {
      if (!isDeliveredTabOrder(o)) return false;
      if (!isDriverOrLoader) return true;
      return hasMyVehicleAssignment(o);
    }).length,
  }), [filteredOrders, isDriverOrLoader, getTotalAssignedQuantity, hasMyVehicleAssignment, isAdminCanGiaoOrder, isDeliveredTabOrder]);

  const { customerOptions, receiverOptions } = React.useMemo(() => {
    if (!groupedOrdersView) return { customerOptions: [], receiverOptions: [] };
    const cSet = new Set<string>();
    const rSet = new Set<string>();
    groupedOrdersView.forEach(o => {
      const cName = o.import_orders?.sender_name || o.import_orders?.customers?.name;
      if (cName) cSet.add(cName);

      const rName = o.import_orders?.customers?.name || o.import_orders?.receiver_name?.trim() || o.import_orders?.profiles?.full_name;
      if (rName) rSet.add(rName);
    });
    return {
      customerOptions: Array.from(cSet).map(c => ({ label: c, value: c })),
      receiverOptions: Array.from(rSet).map(c => ({ label: c, value: c })),
    };
  }, [groupedOrdersView]);

  const vehicleFilterOptions = React.useMemo(
    () =>
      [...eligibleVehicles]
        .map((v) => ({
          label: v.license_plate?.trim() || '—',
          value: v.id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    [eligibleVehicles]
  );

  const displayedOrders = React.useMemo(() => {
    const statusFiltered = statusFilter === 'all'
      ? filteredOrders
      : filteredOrders.filter((o) => {
        const eff = getEffectiveDeliveryStatus(o);
        if (statusFilter === 'hang_o_sg') return eff === 'hang_o_sg';
        if (statusFilter === 'can_giao') {
          const remainingQty = o.total_quantity - getTotalAssignedQuantity(o);
          if (remainingQty <= 0) return false;
          if (getEffectiveDeliveryStatus(o, remainingQty) !== 'can_giao') return false;
          if (isDriverOrLoader && !isAdminCanGiaoOrder(o)) return false;
          return true;
        }
        if (statusFilter === 'da_giao') {
          if (!isDeliveredTabOrder(o)) return false;

          if (isDriverOrLoader) {
            return hasMyVehicleAssignment(o);
          }

          return true;
        }
        return true;
      });

    return [...statusFiltered].sort(compareOrderCreatedDesc);
  }, [filteredOrders, statusFilter, isDriverOrLoader, getTotalAssignedQuantity, hasMyVehicleAssignment, isAdminCanGiaoOrder, isDeliveredTabOrder]);

  const isAllSelected = displayedOrders.length > 0 && displayedOrders.every(o => selectedIds.has(o.id));
  const isSomeSelected = !isAllSelected && displayedOrders.some(o => selectedIds.has(o.id));
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedOrders.map(o => o.id)));
    }
  };
  const isPaginatedTab = statusFilter === 'da_giao' || statusFilter === 'all';
  const totalItems = displayedOrders.length;
  const totalPages = isPaginatedTab ? Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE)) : 1;
  const paginatedOrders = React.useMemo(
    () => isPaginatedTab
      ? displayedOrders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
      : displayedOrders,
    [isPaginatedTab, displayedOrders, currentPage]
  );

  const groupedOrders = React.useMemo(
    () => (paginatedOrders || []).reduce<Record<string, DeliveryOrder[]>>((acc, order) => {
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
  const selectedSourceOrderIds = React.useMemo(
    () => expandGroupedIds(Array.from(selectedIds)),
    [selectedIds, expandGroupedIds]
  );

  const selectedSourceOrders = React.useMemo(
    () => (baseOrders || []).filter((o) => selectedSourceOrderIds.includes(o.id)),
    [baseOrders, selectedSourceOrderIds]
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader title="Hàng cần giao" description="Danh sách đơn hàng cần giao" backPath="/app/hang-hoa" />
      </div>

      <div className="bg-card flex flex-row w-full gap-2 items-center rounded-2xl shadow-sm border border-border p-2.5 md:mb-6 mb-3 overflow-x-auto custom-scrollbar">
        {/* SEARCH BAR */}
        <div className="flex-1 min-w-50 md:max-w-full">
          <SearchInput
            placeholder="Tìm mã, vựa, hàng..."
            onSearch={(raw) => setSearchQuery(raw)}
            className="h-9.5"
          />
        </div>

        {/* AGE FILTER */}

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

          <div className="w-40">
            <MultiSearchableSelect
              options={receiverOptions}
              value={filterReceiver}
              onValueChange={setFilterReceiver}
              placeholder="Người nhận"
              className="bg-transparent"
              icon={<User size={15} />}
            />
          </div>

          <div className="w-44">
            <SearchableSelect
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'new', label: 'Hàng mới' },
                { value: 'old', label: 'Hàng cũ' },
              ]}
              value={ageFilter}
              onValueChange={(val) => {
                if (isAgeFilterValue(val)) setAgeFilter(val);
              }}
              placeholder="Phân loại..."
              className="h-9.5 bg-transparent"
              icon={<Package size={15} />}
            />
          </div>

          <div className="w-40">
            <MultiSearchableSelect
              options={vehicleFilterOptions}
              value={filterVehicleIds}
              onValueChange={setFilterVehicleIds}
              placeholder="Biển số xe"
              className="bg-transparent"
              icon={<Truck size={15} />}
            />
          </div>

          <label className="flex items-center gap-2 px-3 py-2 shrink-0 border border-border/80 rounded-xl bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={filterHasExcess}
              onChange={(e) => setFilterHasExcess(e.target.checked)}
              className="w-4 h-4 rounded border-border text-red-600 focus:ring-red-500 cursor-pointer"
            />
            <span className="text-[12px] font-bold text-foreground whitespace-nowrap">Hàng dư</span>
          </label>
          <div className="w-40">
            <DatePicker
              value={filterDeliveryDate}
              onChange={setFilterDeliveryDate}
              placeholder="Ngày giao"
              className="h-9.5 bg-muted/20 border-border/80"
            />
          </div>
        </div>

        {/* DESKTOP DATE FILTER */}
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

        {/* ACTIONS */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate(`/app/hang-hoa/in-phieu-giao?dateFrom=${startDate}&dateTo=${endDate}`)}
            className="flex items-center gap-2 justify-center h-9.5 px-3 shrink-0 border border-primary/20 rounded-xl transition-all bg-primary/10 text-primary hover:bg-primary/20 font-bold text-[13px]"
            title="In phiếu nhập hàng tạp hóa"
          >
            <Printer size={16} />
            <span className="hidden md:inline">In phiếu</span>
          </button>

          {/* MOBILE FILTER BUTTON */}
          <button
            onClick={openFilter}
            className="md:hidden flex items-center justify-center w-9.5 h-9.5 shrink-0 border border-border/80 rounded-xl transition-all bg-muted/20 text-muted-foreground hover:bg-muted"
          >
            <Filter size={17} />
          </button>
        </div>
      </div>


      <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Status Tabs */}
        <div className="flex flex-col shrink-0 border-b border-border bg-muted/50">
          <div className="grid grid-cols-4 gap-1 px-3 py-2 md:flex md:items-center md:gap-1 md:overflow-x-auto custom-scrollbar">
            {(['can_giao', 'hang_o_sg', 'da_giao', 'all'] as const).map(status => {
              const colors = STATUS_COLORS[status];
              const isActive = statusFilter === status;
              const count = statusCounts[status];
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={clsx(
                    "w-full flex items-center justify-center md:justify-start gap-1 px-1.5 md:px-3 py-1.5 rounded-lg text-[10px] md:text-[12px] font-bold transition-all whitespace-nowrap",
                    isActive
                      ? `${colors.bg} ${colors.text} shadow-sm ring-1 ring-black/5`
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {STATUS_LABELS[status]}
                  {count > 0 && (
                    <span className={clsx(
                      "text-[9px] md:text-[10px] font-black px-1 md:px-1.5 py-0.5 rounded-full min-w-4 md:min-w-5 text-center",
                      isActive ? `${colors.bg} ${colors.text}` : "bg-muted/60 text-muted-foreground"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Confirm All Button - desktop only inline */}
            {statusFilter === 'hang_o_sg' && isAdmin && displayedOrders.length > 0 && (
              <button
                onClick={() => handleConfirm(displayedOrders.map(o => o.id))}
                disabled={confirmMutation.isPending}
                className="hidden md:flex ml-auto items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-primary text-white hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50 whitespace-nowrap"
              >
                <Check size={14} strokeWidth={2.5} />
                {confirmMutation.isPending ? 'Đang xử lý...' : 'Xác nhận tất cả'}
              </button>
            )}
          </div>

          {/* Mobile Confirm All Button - separate row */}
          {statusFilter === 'hang_o_sg' && isAdmin && displayedOrders.length > 0 && (
            <div className="md:hidden px-3 pb-2">
              <button
                onClick={() => handleConfirm(displayedOrders.map(o => o.id))}
                disabled={confirmMutation.isPending}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-bold bg-primary text-white hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50"
              >
                <Check size={15} strokeWidth={2.5} />
                {confirmMutation.isPending ? 'Đang xử lý...' : `Xác nhận tất cả (${displayedOrders.length})`}
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="p-4"><LoadingSkeleton rows={10} columns={6} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !displayedOrders?.length ? (
          <EmptyState
            title={statusFilter === 'all' ? "Không có dữ liệu" : statusFilter === 'can_giao' ? "Không có đơn cần giao" : statusFilter === 'hang_o_sg' ? "Không có hàng ở SG" : "Không có đơn đã giao"}
            description={`Không có đơn hàng nào với trạng thái "${STATUS_LABELS[statusFilter]}" phù hợp với bộ lọc.`}
          />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar bg-muted/30 md:bg-transparent relative">
            {/* Desktop View */}
            <div className="hidden md:block">
              <table className="w-full border-collapse bg-card">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-card border-b border-border text-muted-foreground">
                    {isAdmin && (statusFilter !== 'all' || !isDriverOrLoader) && (
                      <th className="px-3 py-3 w-10 border-r border-border">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                            checked={isAllSelected}
                            onChange={toggleSelectAll}
                            ref={input => {
                              if (input) {
                                input.indeterminate = isSomeSelected;
                              }
                            }}
                          />
                        </div>
                      </th>
                    )}
                    {(isAdmin || statusFilter !== 'all') && (
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-24 border-r border-border">Thao tác</th>
                    )}
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">Loại</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-32 border-r border-border whitespace-nowrap">Ngày tạo đơn</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left min-w-20 border-r border-border">Người nhận</th>
                    <th className="px-3 py-3 text-[11px] font-bold uppercase tracking-tight text-left min-w-24 max-w-32 border-r border-border leading-tight">
                      NV nhận hàng
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-14 border-r border-border">Ảnh</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left border-r border-border">Hàng</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-17.5 border-r border-border">Trạng thái</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-28 border-r border-border">Thanh toán</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">SL Tổng</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">Còn lại</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">Dư</th>
                    {displayedVehicles.map(v => (
                      <th key={v.id} className={clsx(
                        "px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-28 border-r border-border last:border-r-0",
                        myVehicleIdSet.has(v.id) && "bg-primary/5 text-primary"
                      )}>
                        {v.license_plate}
                      </th>
                    ))}
                    {displayedVehicles.length === 0 && !(statusFilter === 'da_giao' && isDriverOrLoader) && ['1', '2', '3', '4', '5', '6', '7', '8', 'ba', 'kho'].map(col => (
                      <th key={col} className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-12 border-r border-border last:border-r-0">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedDates.map((date) => (
                    <React.Fragment key={date}>
                      {/* Date separator row */}
                      <tr className="bg-muted/80 dark:bg-muted/40 border-y border-border shadow-sm overflow-hidden">
                        <td colSpan={(isAdmin && (statusFilter !== 'all' || !isDriverOrLoader) ? 13 : 12) + (displayedVehicles.length || ((statusFilter === 'da_giao' && isDriverOrLoader) ? 0 : 10))} className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {isAdmin && (statusFilter !== 'all' || !isDriverOrLoader) && (
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer mr-2"
                                checked={groupedOrders[date].length > 0 && groupedOrders[date].every(o => selectedIds.has(o.id))}
                                onChange={(e) => {
                                  const isChecked = e.target.checked;
                                  setSelectedIds(prev => {
                                    const next = new Set(prev);
                                    groupedOrders[date].forEach(o => {
                                      if (isChecked) next.add(o.id);
                                      else next.delete(o.id);
                                    });
                                    return next;
                                  });
                                }}
                                ref={input => {
                                  if (input) {
                                    const someSelected = groupedOrders[date].some(o => selectedIds.has(o.id));
                                    const allSelected = groupedOrders[date].every(o => selectedIds.has(o.id));
                                    input.indeterminate = someSelected && !allSelected;
                                  }
                                }}
                              />
                            )}
                            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary">
                              <Calendar size={14} />
                            </div>
                            <span className="text-[13px] font-black text-foreground uppercase tracking-wider">Ngày tạo đơn: {new Date(date).toLocaleDateString('vi-VN')}</span>
                          </div>
                        </td>
                      </tr>
                      {/* Items for this date */}
                      {groupedOrders[date].map((o) => {
                        const totalAssigned = (o.delivery_vehicles || []).reduce(
                          (sum, dv) => sum + (dv.assigned_quantity || 0),
                          0
                        );
                        const remainingQty = o.total_quantity - totalAssigned;
                        const effectiveStatus = getEffectiveDeliveryStatus(o, remainingQty);
                        const statusColor = STATUS_COLORS[effectiveStatus] || STATUS_COLORS.can_giao;
                        const assignmentStatus = getAssignmentStatusSummary(o);
                        const paymentStatus = getOrderPaymentStatus(o);
                        const paymentConfig = PAYMENT_STATUS_CONFIG[paymentStatus];

                        return (
                          <tr key={o.id} className={clsx("transition-colors group", selectedIds.has(o.id) ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/50")}>
                            {isAdmin && (statusFilter !== 'all' || !isDriverOrLoader) && (
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
                            <td className="px-2 py-3 border-r border-border text-center">
                              <div className="flex items-center justify-center gap-1">
                                {statusFilter === 'hang_o_sg' && isAdmin && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleConfirm([o.id]);
                                    }}
                                    disabled={confirmMutation.isPending}
                                    className="p-1.5 rounded-md transition-colors bg-green-500/10 text-green-600 dark:text-green-500 hover:bg-green-500/20 disabled:opacity-50"
                                    title="Xác nhận giao"
                                  >
                                    <Check size={14} strokeWidth={2.5} />
                                  </button>
                                )}
                                {canShowAssignButton && statusFilter !== 'hang_o_sg' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOrderClick(o, undefined, 'add-new');
                                    }}
                                    className={clsx(
                                      "p-1.5 rounded-md transition-colors",
                                      remainingQty > 0
                                        ? "bg-orange-500/10 text-orange-600 dark:text-orange-500 hover:bg-orange-500/20"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                                    )}
                                    title={remainingQty > 0 ? "Phân xe" : "Chỉnh sửa phân xe"}
                                  >
                                    <Truck size={14} strokeWidth={2.5} />
                                  </button>
                                )}
                                {isAdmin && (statusFilter !== 'all' || !isDriverOrLoader) && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEdit(o);
                                      }}
                                      className="p-1.5 rounded-md transition-colors bg-blue-500/10 text-blue-600 dark:text-blue-500 hover:bg-blue-500/20"
                                      title="Chỉnh sửa đơn hàng"
                                    >
                                      <Pencil size={14} strokeWidth={2.5} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteOne(o.id);
                                      }}
                                      className="p-1.5 rounded-md transition-colors bg-red-500/10 text-red-600 dark:text-red-500 hover:bg-red-500/20"
                                      title="Xóa đơn hàng"
                                    >
                                      <Trash2 size={14} strokeWidth={2.5} />
                                    </button>
                                  </>
                                )}
                                {statusFilter === 'da_giao' && isAdminRole && totalAssigned > 0 && isRevertAllowed(o, isAdminRole) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openRevert(o);
                                    }}
                                    className="p-1.5 rounded-md transition-colors bg-amber-500/10 text-amber-600 dark:text-amber-500 hover:bg-amber-500/20"
                                    title="Hoàn tác giao hàng"
                                  >
                                    <RotateCcw size={14} strokeWidth={2.5} />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 border-r border-border text-center">
                              <div className="flex items-center justify-center">
                                {!isOldOrderForAgeRule(o, anchorStr) ? (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/10 text-emerald-700 uppercase">Mới</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-muted text-muted-foreground uppercase">Cũ</span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-3 border-r border-border text-center text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
                              {getOrderCreatedDateTimeVI(o)}
                            </td>
                            <td className="px-4 py-3 text-[12px] font-bold text-foreground border-r border-border">
                              {getReceiverDisplayName(o)}
                            </td>
                            <td className="px-3 py-3 text-[12px] text-muted-foreground border-r border-border max-w-32">
                              <span className="line-clamp-2" title={getImportReceivedByStaffName(o)}>
                                {getImportReceivedByStaffName(o)}
                              </span>
                            </td>
                            <td className="px-2 py-3 text-center border-r border-border cursor-pointer" onClick={(e) => {
                              const previewImage = getOrderPreviewImage(o);
                              if (previewImage) {
                                e.stopPropagation();
                                openImageViewer(o);
                              }
                            }}>
                              {getOrderPreviewImage(o) ? (
                                <div className="w-8 h-8 rounded-md bg-primary/10 text-primary mx-auto border border-primary/20 group relative flex items-center justify-center hover:bg-primary/15 transition-colors" title="Xem ảnh">
                                  <Eye size={14} />
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded-md bg-muted/20 flex items-center justify-center text-muted-foreground mx-auto">
                                  <ImageIcon size={14} className="opacity-30" />
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-[13px] font-medium text-muted-foreground border-r border-border">
                              {getDisplayProductName(o)}
                            </td>
                            <td className="px-2 py-3 border-r border-border">
                              <div className={clsx("flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold mx-auto w-fit", statusColor.bg, statusColor.text)}>
                                <div className={clsx("w-1.5 h-1.5 rounded-full", statusColor.dot)} />
                                {STATUS_LABELS[effectiveStatus] || effectiveStatus}
                              </div>
                              {assignmentStatus && (
                                <div className={clsx("mt-1 mx-auto w-fit rounded-md px-1.5 py-0.5 text-[9px] font-black", assignmentStatus.className)}>
                                  {assignmentStatus.label}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-3 border-r border-border text-center">
                              <span className={clsx("inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-bold border", paymentConfig.className)}>
                                {paymentConfig.label}
                              </span>
                            </td>
                            <td className="px-2 py-3 text-[13px] font-bold text-muted-foreground text-center tabular-nums border-r border-border">
                              {formatNumber(o.total_quantity)}
                              {(() => {
                                const assigned = (o.delivery_vehicles || []).reduce((sum, dv) => sum + (dv.assigned_quantity || 0), 0);
                                const isPartial = assigned > 0 && assigned < o.total_quantity;
                                if (isPartial && statusFilter === 'da_giao') {
                                  return (
                                    <div className="text-[10px] text-green-600 dark:text-green-500 mt-0.5 font-bold">
                                      Đã giao: {formatNumber(assigned)}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </td>
                            <td className="px-2 py-3 text-[13px] font-black text-orange-600 dark:text-orange-500 text-center tabular-nums border-r border-border">
                              {formatNumber(remainingQty > 0 ? remainingQty : 0)}
                            </td>
                            <td className="px-2 py-3 text-[13px] font-black text-red-600 dark:text-red-500 text-center tabular-nums border-r border-border">
                              {remainingQty < 0 ? formatNumber(remainingQty) : '-'}
                            </td>
                            {displayedVehicles.map(v => {
                              const dvs = (o.delivery_vehicles || []).filter((dv) => {
                                const vehicleMatch = dv.vehicle_id === v.id && (dv.assigned_quantity || 0) > 0;
                                if (!vehicleMatch) return false;
                                if (filterDeliveryDate) {
                                  return dv.delivery_date === filterDeliveryDate;
                                }
                                return true;
                              });
                              const totalQty = dvs.reduce((sum, dv) => sum + (dv.assigned_quantity || 0), 0);
                              const isEditableByMe = myVehicleIdSet.has(v.id);
                              const canEdit = isEditableByMe || isAdmin;

                              const isExportPaid = dvs.length > 0 && dvs.some(dv => dv.export_payment_status === 'paid');
                              const dvEntries = dvs.map((dv, idx) => ({
                                key: dv.id || `${dv.vehicle_id || 'vehicle'}-${idx}`,
                                qty: Number(dv.assigned_quantity || 0),
                                exportPaid: dv.export_payment_status === 'paid',
                                original: dv,
                              }));
                              const isCollectionPaid = (o.payment_collections || []).some(
                                (pc) => pc.vehicle_id === v.id && isPaidCollectionStatus(pc.status)
                              );

                              return (
                                <td
                                  key={v.id}
                                  onClick={() => {
                                    if (canEdit && statusFilter !== 'hang_o_sg' && totalQty === 0 && remainingQty > 0) {
                                      handleOrderClick(o, v.id, 'add-new');
                                    }
                                  }}
                                  className={clsx(
                                    "px-1 py-1 text-[13px] text-center tabular-nums border-r border-border last:border-r-0 transition-all relative group/cell",
                                    totalQty > 0 ? "font-bold" : "text-muted-foreground/30",
                                    canEdit && statusFilter !== 'hang_o_sg' && totalQty === 0 && remainingQty > 0 && "cursor-pointer hover:bg-primary/5 active:scale-95"
                                  )}
                                >
                                  {dvs.length > 0 ? (
                                    <div className="flex flex-col items-center justify-center">
                                      <div
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (canEdit && statusFilter !== 'hang_o_sg') {
                                            handleOrderClick(o, v.id, 'view');
                                          }
                                        }}
                                        className="cursor-pointer"
                                      >
                                        {dvEntries.map((entry, idx) => (
                                          <React.Fragment key={entry.key}>
                                            {idx > 0 && <span className="text-[10px] text-muted-foreground/50 mx-0.5">+</span>}
                                            <VehicleCellTooltip
                                              dv={entry.original}
                                              vehicle={v}
                                              qty={entry.qty}
                                              isPaid={isCollectionPaid}
                                              exportPaid={entry.exportPaid}
                                            >
                                              <span
                                                className={clsx(
                                                  "underline decoration-dotted underline-offset-2",
                                                  entry.exportPaid ? "text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 decoration-emerald-500/30" : "text-red-600 dark:text-red-500 hover:text-red-700 decoration-red-500/30"
                                                )}
                                              >
                                                {formatNumber(entry.qty)}
                                              </span>
                                            </VehicleCellTooltip>
                                          </React.Fragment>
                                        ))}
                                      </div>
                                      {canEdit && statusFilter !== 'hang_o_sg' && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOrderClick(o, v.id, 'edit');
                                          }}
                                          className={clsx(
                                            "absolute top-0.5 right-0.5 opacity-0 group-hover/cell:opacity-100 p-0.5 rounded transition-opacity",
                                            isExportPaid ? "text-emerald-600 hover:bg-emerald-500/20" : "text-red-600 hover:bg-red-500/20"
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
                                        {canEdit && statusFilter !== 'hang_o_sg' && remainingQty > 0 ? <PlusCircle size={14} className="mx-auto opacity-10 group-hover/cell:opacity-40" /> : '-'}
                                      </span>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            {displayedVehicles.length === 0 && !(statusFilter === 'da_giao' && isDriverOrLoader) && ['1', '2', '3', '4', '5', '6', '7', '8', 'ba', 'kho'].map(col => {
                              const getQtyForCol = (col: string) => {
                                const matches = (o.delivery_vehicles || []).filter((dv) => {
                                  const plate = (dv.vehicles?.license_plate || '').toLowerCase();
                                  let colMatch = false;
                                  if (col === 'ba') colMatch = plate.includes('ba');
                                  else if (col === 'kho') colMatch = plate.includes('kho');
                                  else colMatch = plate.includes(col);

                                  if (!colMatch) return false;
                                  if (filterDeliveryDate) {
                                    return dv.delivery_date === filterDeliveryDate;
                                  }
                                  return true;
                                });
                                return matches.reduce((sum, dv) => sum + (dv.assigned_quantity || 0), 0);
                              };
                              const qty = getQtyForCol(col);
                              return (
                                <td
                                  key={col}
                                  className={clsx(
                                    "px-2 py-3 text-[13px] text-center tabular-nums border-r border-border last:border-r-0",
                                    qty > 0 ? "font-bold text-orange-600 dark:text-orange-500 bg-orange-500/10" : "text-muted-foreground/30"
                                  )}
                                >
                                  {qty > 0 ? formatNumber(qty) : '-'}
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

            {/* Mobile View */}
            <div className="md:hidden flex flex-col gap-3 px-3 pt-0 pb-20 relative">
              {sortedDates.map((date) => (
                <div key={`mobile-${date}`} className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 sticky top-0 bg-muted/80 dark:bg-muted/40 backdrop-blur-md p-3 -mx-3 px-5 z-10 border-b border-border shadow-sm">
                    {isAdmin && (statusFilter !== 'all' || !isDriverOrLoader) && (
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded-md border-border text-primary focus:ring-primary mr-1"
                        checked={groupedOrders[date].length > 0 && groupedOrders[date].every(o => selectedIds.has(o.id))}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            groupedOrders[date].forEach(o => {
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


                  <div className="flex flex-col gap-2.5 px-0.5">
                    {groupedOrders[date].map((o) => {
                      const totalAssigned = (o.delivery_vehicles || []).reduce(
                        (sum, dv) => sum + (dv.assigned_quantity || 0),
                        0
                      );
                      const remainingQty = o.total_quantity - totalAssigned;
                      const displayCustomerName = getReceiverDisplayName(o);
                      const paymentStatus = getOrderPaymentStatus(o);
                      const paymentConfig = PAYMENT_STATUS_CONFIG[paymentStatus];

                      return (
                        <div
                          key={`mobile-order-${o.id}`}
                          onClick={() => {
                            handleOrderClick(o, undefined, 'add-new');
                          }}
                          className={clsx(
                            "bg-card rounded-xl border shadow-sm transition-all relative overflow-hidden cursor-pointer active:scale-[0.98]",
                            remainingQty > 0 ? "border-orange-500/30 dark:border-orange-500/20" : "border-border"
                          )}
                        >
                          {/* Card body */}
                          <div className="p-3 flex flex-col gap-2.5">
                            {isAdmin && (statusFilter !== 'all' || !isDriverOrLoader) && (
                              <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="w-5 h-5 rounded-md border-slate-300 text-primary focus:ring-primary"
                                  checked={selectedIds.has(o.id)}
                                  onChange={() => toggleSelectId(o.id)}
                                />
                              </div>
                            )}
                            <div className="flex gap-3">
                              {/* Left: Image action */}
                              <div
                                className="w-16 h-16 shrink-0 bg-muted/20 rounded-lg overflow-hidden border border-border/50 self-center"
                                onClick={(e) => {
                                  const previewImage = getOrderPreviewImage(o);
                                  if (previewImage) {
                                    e.stopPropagation();
                                    openImageViewer(o);
                                  }
                                }}
                              >
                                {getOrderPreviewImage(o) ? (
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
                              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                                {/* Row 1: Customer name + Product name */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <User size={13} className="text-muted-foreground/60 shrink-0 -mt-0.5" />
                                    <span className="text-[13px] font-bold text-primary">{displayCustomerName}</span>
                                  </div>
                                  <div className="w-1 h-1 rounded-full bg-border" />
                                  <span className="text-[13px] font-bold text-foreground">
                                    {getDisplayProductName(o)}
                                  </span>
                                </div>

                                <div className="text-[11px] text-muted-foreground">
                                  <span className="font-semibold text-foreground/80">NV nhận:</span>{' '}
                                  {getImportReceivedByStaffName(o)}
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {!isOldOrderForAgeRule(o, anchorStr) ? (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-700 uppercase shrink-0">Mới</span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-muted text-muted-foreground uppercase shrink-0">Cũ</span>
                                  )}
                                  <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                                    {getOrderCreatedDateTimeVI(o)}
                                  </span>
                                  <span className={clsx("inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0", paymentConfig.className)}>
                                    {paymentConfig.label}
                                  </span>
                                  <div className="flex items-center gap-1 ml-auto shrink-0">
                                    <span className="text-[10px] uppercase font-black tracking-wider text-muted-foreground/60">SL:</span>
                                    <span className="text-[14px] font-bold text-foreground tabular-nums">{formatNumber(o.total_quantity)}</span>
                                    {(() => {
                                      const assigned = (o.delivery_vehicles || []).reduce((sum, dv) => sum + (dv.assigned_quantity || 0), 0);
                                      const isPartial = assigned > 0 && assigned < o.total_quantity;
                                      if (isPartial && statusFilter === 'da_giao') {
                                        return (
                                          <span className="text-[11px] font-bold text-green-600 dark:text-green-500 ml-1">
                                            (Giao: {formatNumber(assigned)})
                                          </span>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Show assigned vehicles */}
                            {(() => {
                              const deliveryVehicles = o.delivery_vehicles || [];
                              return deliveryVehicles.length > 0 && deliveryVehicles.some((dv) => {
                                if ((dv.assigned_quantity || 0) <= 0) return false;
                                if (filterDeliveryDate && dv.delivery_date !== filterDeliveryDate) return false;
                                if (statusFilter === 'da_giao' && isDriverOrLoader) {
                                  return dv.vehicle_id && myVehicleIdSet.has(dv.vehicle_id);
                                }
                                return true;
                              });
                            })() && (
                                <div className="pt-2 border-t border-border flex flex-wrap gap-1.5">
                                  {(o.delivery_vehicles || []).filter((dv) => {
                                    if ((dv.assigned_quantity || 0) <= 0) return false;
                                    if (filterDeliveryDate && dv.delivery_date !== filterDeliveryDate) return false;
                                    if (statusFilter === 'da_giao' && isDriverOrLoader) {
                                      return dv.vehicle_id && myVehicleIdSet.has(dv.vehicle_id);
                                    }
                                    return true;
                                  }).map((dv) => {
                                    const isPaid = (o.payment_collections || []).some(
                                      (pc) => pc.vehicle_id === dv.vehicle_id && isPaidCollectionStatus(pc.status)
                                    );
                                    return (
                                      <div key={dv.id} className={clsx("flex items-center gap-1.5 px-2 py-1 rounded-md border", isPaid ? "bg-green-50 border-green-200" : "bg-blue-50 border-blue-100")} title={isPaid ? "Đã thu tiền" : undefined}>
                                        <Truck size={12} className={isPaid ? "text-green-500" : "text-blue-500"} />
                                        <span className={clsx("text-[11px] font-bold", isPaid ? "text-green-700 dark:text-green-500" : "text-blue-700 dark:text-blue-500")}>{dv.vehicles?.license_plate || '-'}</span>
                                        <span className="text-[11px] font-black text-foreground ml-1">{formatNumber(dv.assigned_quantity)}</span>
                                        {isPaid && <CheckCircle size={12} className="text-green-600 ml-0.5" />}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                          </div>

                          {/* Bottom action bar */}
                          {(isAdmin || canShowAssignButton) && (statusFilter !== 'all' || !isDriverOrLoader) ? (
                            <div className="flex border-t border-slate-100 divide-x divide-slate-100">
                              {statusFilter === 'hang_o_sg' && isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirm([o.id]);
                                  }}
                                  disabled={confirmMutation.isPending}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-50 text-green-700 dark:text-green-500 hover:bg-green-100 text-[12px] font-bold transition-colors disabled:opacity-50"
                                >
                                  <Check size={14} strokeWidth={2.5} />
                                  <span className="hidden min-[400px]:inline">Xác nhận</span>
                                </button>
                              )}
                              {canShowAssignButton && statusFilter !== 'hang_o_sg' && (remainingQty > 0 || isAdmin) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOrderClick(o, undefined, 'add-new');
                                  }}
                                  className={clsx(
                                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-bold transition-colors",
                                    remainingQty > 0
                                      ? "text-orange-600 dark:text-orange-500 hover:bg-orange-500/10"
                                      : "text-muted-foreground hover:bg-muted/50"
                                  )}
                                >
                                  <Truck size={14} strokeWidth={2.5} />
                                  <span className="hidden min-[400px]:inline">{remainingQty > 0 ? 'Phân xe' : 'Sửa PX'}</span>
                                </button>
                              )}
                              {isAdmin && (statusFilter !== 'all' || !isDriverOrLoader) && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEdit(o);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-blue-600 dark:text-blue-500 hover:bg-blue-500/10 text-[12px] font-bold transition-colors"
                                  >
                                    <Pencil size={14} strokeWidth={2.5} />
                                    <span className="hidden min-[400px]:inline">Sửa</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteOne(o.id);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-red-600 dark:text-red-500 hover:bg-red-500/10 text-[12px] font-bold transition-colors"
                                  >
                                    <Trash2 size={14} strokeWidth={2.5} />
                                    <span className="hidden min-[400px]:inline">Xóa</span>
                                  </button>
                                </>
                              )}
                              {statusFilter === 'da_giao' && isAdminRole && totalAssigned > 0 && isRevertAllowed(o, isAdminRole) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openRevert(o);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-amber-600 dark:text-amber-500 hover:bg-amber-500/10 text-[12px] font-bold transition-colors"
                                >
                                  <RotateCcw size={14} strokeWidth={2.5} />
                                  <span className="hidden min-[400px]:inline">Hoàn tác</span>
                                </button>
                              )}
                              {(() => {
                                const phone = getCustomerPhone(o);
                                return phone ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenCallDialog(getReceiverDisplayName(o), phone);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-500/10 text-[12px] font-bold transition-colors"
                                  >
                                    <Phone size={14} strokeWidth={2.5} />
                                    <span className="hidden min-[400px]:inline">Gọi</span>
                                  </button>
                                ) : null;
                              })()}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {isPaginatedTab && totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card sticky bottom-0 z-20">
                <div className="text-[12px] text-muted-foreground font-medium hidden md:block">
                  Hiển thị {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} trong {totalItems} đơn hàng
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
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
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
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

      {isAdmin && selectedIds.size > 0 && (statusFilter !== 'all' || !isDriverOrLoader) && createPortal(
        <div className="fixed bottom-0 md:bottom-6 left-0 right-0 md:left-1/2 md:-translate-x-1/2 bg-card md:rounded-2xl shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.15)] md:shadow-xl border-t md:border border-border p-3 z-[900] flex flex-col md:flex-row items-center gap-3 animate-in slide-in-from-bottom-10 md:min-w-[400px]">
          <div className="flex items-center gap-2 px-2 shrink-0 self-start md:self-auto w-full md:w-auto justify-between md:justify-start">
            <span className="text-[13px] font-bold text-foreground whitespace-nowrap">Đã chọn <strong className="text-primary">{selectedIds.size}</strong></span>
            <button onClick={() => setSelectedIds(new Set())} className="text-[12px] font-bold text-muted-foreground hover:text-foreground underline md:hidden">Bỏ chọn</button>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto custom-scrollbar pb-1 md:pb-0">
            {statusFilter === 'hang_o_sg' && (
              <button
                onClick={() => handleConfirm(Array.from(selectedIds))}
                disabled={confirmMutation.isPending}
                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] md:text-[13px] font-bold bg-green-600 text-white hover:bg-green-600 transition-all shadow-sm disabled:opacity-50"
              >
                <Check size={14} strokeWidth={2.5} />
                Xác nhận
              </button>
            )}
            {statusFilter !== 'hang_o_sg' && (
              <button
                onClick={openBulkAssign}
                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] md:text-[13px] font-bold bg-orange-600 text-white hover:bg-orange-600 transition-all shadow-sm"
              >
                <Truck size={14} strokeWidth={2.5} />
                Phân xe
              </button>
            )}
            <button
              onClick={openBulkEdit}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] md:text-[13px] font-bold bg-blue-600 text-white hover:bg-blue-600 transition-all shadow-sm"
            >
              <Pencil size={14} strokeWidth={2.5} />
              Sửa
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={deleteMutation.isPending}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] md:text-[13px] font-bold bg-red-600 text-white hover:bg-red-600 transition-all shadow-sm disabled:opacity-50"
            >
              <Trash2 size={14} strokeWidth={2.5} />
              Xóa
            </button>
          </div>

          <button onClick={() => setSelectedIds(new Set())} className="hidden md:flex ml-auto p-2 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted rounded-full transition-colors">
            <X size={16} />
          </button>
        </div>,
        document.body
      )}

      <AssignVehicleDialog
        isOpen={isAssignOpen}
        isClosing={isAssignClosing}
        order={selectedOrder}
        initialVehicleId={selectedVehicleId}
        allOrders={baseOrders || []}
        mode={assignMode}
        onClose={closeAssign}
      />

      <EditDeliveryDialog
        isOpen={!!editingOrder}
        isClosing={isEditClosing}
        order={editingOrder}
        onClose={closeEdit}
      />

      <BulkAssignVehicleDialog
        isOpen={isBulkAssignOpen}
        isClosing={isBulkAssignClosing}
        orders={displayedOrders.filter(o => selectedIds.has(o.id))}
        onClose={closeBulkAssign}
      />

      <BulkEditDeliveryDialog
        isOpen={isBulkEditOpen}
        isClosing={isBulkEditClosing}
        orders={selectedSourceOrders}
        onClose={closeBulkEdit}
      />

      <RevertVehicleDialog
        isOpen={!!revertingOrder}
        isClosing={isRevertClosing}
        order={revertingOrder}
        isAdmin={isAdminRole}
        myVehicleIds={myVehicleIds}
        onClose={closeRevert}
      />

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
          setFilterVehicleIds([]);
          setFilterDeliveryDate('');
          setFilterHasExcess(false);
          setAgeFilter('all');
        }}
        showClearButton={
          filterCustomer.length > 0 ||
          filterReceiver.length > 0 ||
          filterVehicleIds.length > 0 ||
          !!filterDeliveryDate ||
          filterHasExcess ||
          ageFilter !== 'all'
        }
        initialDateFrom={startDate}
        initialDateTo={endDate}
        dateLabel="Khoảng thời gian"
      >
        <div className="space-y-1.5 z-35">
          <label className="text-[13px] font-bold text-muted-foreground">Ngày giao</label>
          <DatePicker
            value={filterDeliveryDate}
            onChange={setFilterDeliveryDate}
            placeholder="Tất cả ngày..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
          />
        </div>
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
        <div className="space-y-1.5">
          <label className="text-[13px] font-bold text-muted-foreground">Phân loại hàng</label>
          <SearchableSelect
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'new', label: 'Hàng mới' },
              { value: 'old', label: 'Hàng cũ' },
            ]}
            value={ageFilter}
            onValueChange={(val) => {
              if (isAgeFilterValue(val)) setAgeFilter(val);
            }}
            placeholder="Chọn phân loại..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
            icon={<Package size={15} />}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[13px] font-bold text-muted-foreground">Bộ lọc khác</label>
          <label className="flex items-center gap-2 px-3 py-2.5 border border-border/80 rounded-xl bg-muted/10 cursor-pointer hover:bg-muted/20 transition-colors">
            <input
              type="checkbox"
              checked={filterHasExcess}
              onChange={(e) => setFilterHasExcess(e.target.checked)}
              className="w-4 h-4 rounded border-border text-red-600 focus:ring-red-500 cursor-pointer"
            />
            <span className="text-[13px] font-bold text-foreground">Chỉ hiện đơn hàng dư</span>
          </label>
        </div>


      </MobileFilterSheet>

      {/* Dialog xem ảnh chi tiết */}
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

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Xóa đơn hàng"
        message={
          orderToDelete === 'bulk'
            ? `Bạn có chắc chắn muốn xóa ${selectedIds.size} đơn hàng đã chọn? Hành động này không thể hoàn tác.`
            : 'Bạn có chắc chắn muốn xóa đơn hàng này? Hành động này không thể hoàn tác.'
        }
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={executeDelete}
        onCancel={closeDeleteConfirm}
      />

      {callDialog && createPortal(
        <div className="fixed inset-0 z-99999 flex items-center justify-center">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setCallDialog(null)} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border w-full max-w-95 mx-4 animate-in zoom-in-95 fade-in duration-200">
            <div className="p-6 border-b border-border">
              <h3 className="text-[17px] font-bold text-foreground">Chọn cách gọi</h3>
              <p className="text-[13px] text-muted-foreground mt-1">
                Khách hàng: <span className="font-bold text-foreground">{callDialog.name}</span>
              </p>
              <p className="text-[13px] text-muted-foreground mt-1">
                Số điện thoại: <span className="font-bold text-foreground">{callDialog.phone}</span>
              </p>
            </div>

            <div className="p-6 grid grid-cols-1 gap-3">
              <button
                onClick={handleCallViaPhone}
                className="w-full px-4 py-3 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Phone size={16} />
                Gọi bằng điện thoại
              </button>
              <button
                onClick={handleCallViaWhatsApp}
                className="w-full px-4 py-3 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition-all shadow-md flex items-center justify-center gap-2"
              >
                <PhoneCall size={16} />
                Gọi qua WhatsApp
              </button>
              <button
                onClick={() => setCallDialog(null)}
                className="w-full px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-foreground text-[13px] font-bold transition-all"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DeliveryPage;














