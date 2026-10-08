import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Calendar, Camera, ChevronRight, Clock, FileText, Filter, Hash, History, ImagePlus, Package, PlusCircle, RefreshCw, Truck, Upload, User, X } from 'lucide-react';
import { cratesApi, type CrateAccount, type CrateDelivery } from '../../api/cratesApi';
import { uploadApi } from '../../api/uploadApi';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import EmptyState from '../../components/shared/EmptyState';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import PageHeader from '../../components/shared/PageHeader';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import { SearchInput } from '../../components/ui/SearchInput';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useAuth } from '../../context/AuthContext';
import { useVehicles } from '../../hooks/queries/useVehicles';
import type { Vehicle } from '../../types';

const formatNumber = (value?: number | null) => new Intl.NumberFormat('vi-VN').format(value || 0);
const formatDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok', hour12: false })
  : '-';
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra';

type DeliveryForm = { deliveredDate: string; deliveredTime: string; quantity: string; notes: string; files: File[] };
type CrateDeliveryRow = CrateAccount & { delivered_total?: number; isDeliveredHistory?: boolean; deliveryDateKey?: string; rowKey?: string; deliveryIds?: string[]; pendingDelivery?: CrateDelivery };

type DeliveryModalState = {
  receiver: CrateAccount | null;
  vehicleId: string | null;
  isManual?: boolean;
};

const getDefaultForm = (): DeliveryForm => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const [deliveredDate, deliveredTimeWithSeconds] = local.toISOString().split('T');
  return { deliveredDate, deliveredTime: deliveredTimeWithSeconds.slice(0, 5), quantity: '', notes: '', files: [] };
};

const getDeliveryDateKey = (delivery: CrateDelivery) => {
  const date = new Date(delivery.delivered_at || delivery.created_at);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getBangkokDateKey = (value?: string | null) => {
  if (!value) return '__active__';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '__active__';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};


const formatDateInputValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};
const toBangkokIso = (date: string, time: string) => {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}:00+07:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
};

const vehicleSupportsGoodsCategory = (vehicle: Vehicle, category: 'grocery' | 'vegetable') => {
  if (!vehicle.goods_categories || vehicle.goods_categories.length === 0) return true;
  return vehicle.goods_categories.includes(category);
};

const CrateDeliveryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: vehicles } = useVehicles();
  const [receivers, setReceivers] = useState<CrateAccount[]>([]);
  const [deliveries, setDeliveries] = useState<CrateDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterCustomerIds, setFilterCustomerIds] = useState<string[]>([]);
  const [filterVehicleIds, setFilterVehicleIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState<DeliveryModalState | null>(null);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>(getDefaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDeliveryId, setConfirmingDeliveryId] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const rows = await cratesApi.getAccounts('receiver');
      setReceivers(rows);

      try {
        const pendingDeliveries = await cratesApi.getDeliveries({ status: 'pending' });
        setDeliveries(pendingDeliveries || []);
      } catch (pendingError: unknown) {
        setDeliveries([]);
        toast.error(getErrorMessage(pendingError) || 'Không tải được phiếu giao chờ xác nhận');
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Không tải được danh sách người nhận két');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const openFilter = () => setIsFilterOpen(true);
  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 300);
  };

  const eligibleVehicles = useMemo(
    () => (vehicles || []).filter((vehicle) => vehicleSupportsGoodsCategory(vehicle, 'vegetable')),
    [vehicles]
  );
  const normalizedRole = (user?.role || '').toLowerCase();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const isLoader = normalizedRole.includes('lo_xe') || normalizedRole.includes('lơ xe');
  const isDriver =
    normalizedRole === 'driver' || normalizedRole.includes('tai_xe') || normalizedRole.includes('tài xế') || normalizedRole.includes('driver');
  const isDriverOrLoader = isDriver || isLoader;
  const myVehicleIds = useMemo(
    () => eligibleVehicles
      .filter((vehicle) =>
        vehicle.driver_id === user?.id ||
        vehicle.in_charge_id === user?.id ||
        (user?.full_name && vehicle.profiles?.full_name === user.full_name) ||
        (user?.full_name && vehicle.responsible_profile?.full_name === user.full_name)
      )
      .map((vehicle) => vehicle.id),
    [eligibleVehicles, user]
  );
  const myPrimaryVehicleId = myVehicleIds[0];
  const myVehicleIdSet = useMemo(() => new Set(myVehicleIds), [myVehicleIds]);
  const displayedVehicles = useMemo(
    () => isDriverOrLoader ? eligibleVehicles.filter((vehicle) => myVehicleIdSet.has(vehicle.id)) : eligibleVehicles,
    [eligibleVehicles, isDriverOrLoader, myVehicleIdSet]
  );

  const customerFilterOptions = useMemo(
    () => deliveries
      .filter(delivery => delivery.receiver_customer_id && delivery.receiver?.name)
      .map(delivery => ({
        value: delivery.receiver_customer_id,
        label: delivery.receiver?.phone ? `${delivery.receiver.name} · ${delivery.receiver.phone}` : delivery.receiver?.name || delivery.receiver_customer_id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    [deliveries]
  );

  const vehicleFilterOptions = useMemo(
    () => displayedVehicles.map(vehicle => ({ value: vehicle.id, label: vehicle.license_plate })),
    [displayedVehicles]
  );

  const activeRows = useMemo<CrateDeliveryRow[]>(() => deliveries.map(delivery => ({
    customer_id: delivery.receiver_customer_id,
    is_sender: false,
    is_receiver: true,
    sender_balance: 0,
    receiver_pending: delivery.receiver_pending_after ?? 0,
    receiver_debt: delivery.receiver_debt_after ?? 0,
    created_at: delivery.created_at,
    updated_at: delivery.created_at,
    customer: delivery.receiver as CrateAccount['customer'],
    delivered_total: delivery.quantity,
    isDeliveredHistory: true,
    deliveryDateKey: getDeliveryDateKey(delivery),
    rowKey: delivery.id,
    deliveryIds: [delivery.id],
    pendingDelivery: delivery,
  })), [deliveries]);



  const deliveriesByReceiverVehicle = useMemo(() => {
    return [...deliveries]
      .sort((a, b) => new Date(a.delivered_at || a.created_at).getTime() - new Date(b.delivered_at || b.created_at).getTime())
      .reduce<Record<string, CrateDelivery[]>>((acc, delivery) => {
        if (!delivery.vehicle_id) return acc;
        const key = `${delivery.receiver_customer_id}:${delivery.vehicle_id}`;
        acc[key] = [...(acc[key] || []), delivery];
        return acc;
      }, {});
  }, [deliveries]);

  const deliveriesByReceiverVehicleDate = useMemo(() => {
    return [...deliveries]
      .sort((a, b) => new Date(a.delivered_at || a.created_at).getTime() - new Date(b.delivered_at || b.created_at).getTime())
      .reduce<Record<string, CrateDelivery[]>>((acc, delivery) => {
        if (!delivery.vehicle_id) return acc;
        const key = `${delivery.receiver_customer_id}:${delivery.vehicle_id}:${getDeliveryDateKey(delivery)}`;
        acc[key] = [...(acc[key] || []), delivery];
        return acc;
      }, {});
  }, [deliveries]);

  const getDeliveryEntriesForRowVehicle = useCallback((row: CrateDeliveryRow, vehicleId: string) => {
    const baseKey = `${row.customer_id}:${vehicleId}`;
    return row.deliveryDateKey
      ? deliveriesByReceiverVehicleDate[`${baseKey}:${row.deliveryDateKey}`] || []
      : deliveriesByReceiverVehicle[baseKey] || [];
  }, [deliveriesByReceiverVehicle, deliveriesByReceiverVehicleDate]);

  const rowMatchesFilters = useCallback((row: CrateDeliveryRow) => {
    const query = search.trim().toLowerCase();
    const rowDateKey = row.deliveryDateKey || getBangkokDateKey(row.created_at);

    if (query && ![row.customer?.name, row.customer?.phone, row.customer?.address]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query)) return false;

    if (filterCustomerIds.length > 0 && !filterCustomerIds.includes(row.customer_id)) return false;
    if (filterDateFrom && rowDateKey < filterDateFrom) return false;
    if (filterDateTo && rowDateKey > filterDateTo) return false;
    if (filterVehicleIds.length > 0 && !filterVehicleIds.some(vehicleId => getDeliveryEntriesForRowVehicle(row, vehicleId).length > 0)) return false;

    return true;
  }, [filterCustomerIds, filterDateFrom, filterDateTo, filterVehicleIds, getDeliveryEntriesForRowVehicle, search]);


  const filteredRows = useMemo(() => {
    return activeRows
      .filter(rowMatchesFilters)
      .sort((a, b) => {
        const pendingCompare = b.receiver_pending - a.receiver_pending;
        if (pendingCompare !== 0) return pendingCompare;
        const debtCompare = b.receiver_debt - a.receiver_debt;
        if (debtCompare !== 0) return debtCompare;
        return (a.customer?.name || '').localeCompare(b.customer?.name || '', 'vi');
      });
  }, [activeRows, rowMatchesFilters]);

  const openManualDeliveryModal = () => {
    const resolvedVehicleId = myPrimaryVehicleId || (displayedVehicles.length === 1 ? displayedVehicles[0].id : null);
    setDeliveryModal({ receiver: null, vehicleId: resolvedVehicleId, isManual: true });
    setDeliveryForm(getDefaultForm());
  };

  const closeDeliveryModal = () => {
    if (submitting) return;
    setDeliveryModal(null);
    setDeliveryForm(getDefaultForm());
  };

  const handleDeliver = async () => {
    if (!deliveryModal) return;
    if (!deliveryModal.receiver) {
      toast.error('Vui lòng chọn khách nhận két');
      return;
    }
    if (deliveryModal.vehicleId && !(vehicles || []).some((vehicle) => vehicle.id === deliveryModal.vehicleId)) {
      toast.error('Vui lòng chọn xe tạo đơn giao hợp lệ');
      return;
    }
    const quantity = Number(deliveryForm.quantity || 0);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error('Số lượng phải là số nguyên dương');
      return;
    }
    const deliveredAt = toBangkokIso(deliveryForm.deliveredDate, deliveryForm.deliveredTime);
    if (!deliveredAt) {
      toast.error('Ngày giờ giao két không hợp lệ');
      return;
    }

    setSubmitting(true);
    try {
      const imageUrls: string[] = [];
      for (const file of deliveryForm.files) {
        const uploaded = await uploadApi.uploadFile(file, 'crates', 'crate-deliveries');
        imageUrls.push(uploaded.url);
      }
      await cratesApi.createDelivery({
        receiver_customer_id: deliveryModal.receiver.customer_id,
        quantity,
        notes: deliveryForm.notes || null,
        image_urls: imageUrls,
        vehicle_id: deliveryModal.vehicleId || null,
        delivered_at: deliveredAt,
      });
      toast.success('Đã tạo phiếu giao két, chờ admin xác nhận');
      setDeliveryModal(null);
      setDeliveryForm(getDefaultForm());
      await loadData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Tạo đơn giao thất bại');
    } finally {
      setSubmitting(false);
    }
  };


  const handleConfirmDelivery = async (deliveryId: string) => {
    if (!isAdmin) return;
    setConfirmingDeliveryId(deliveryId);
    try {
      await cratesApi.confirmDelivery(deliveryId);
      toast.success('Đã xác nhận phiếu giao két');
      await loadData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Xác nhận phiếu giao két thất bại');
    } finally {
      setConfirmingDeliveryId(null);
    }
  };

  const renderStatusBadge = () => {
    return <span className="inline-flex rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-black text-amber-700">Chờ admin xác nhận</span>;
  };

  const deliveryVehicleOptions = (vehicles || []).map(vehicle => ({
    value: vehicle.id,
    label: `${vehicle.license_plate}${vehicle.profiles?.full_name ? ` · ${vehicle.profiles.full_name}` : vehicle.responsible_profile?.full_name ? ` · ${vehicle.responsible_profile.full_name}` : ''}`,
    selectedLabel: vehicle.license_plate,
    searchText: `${vehicle.license_plate} ${vehicle.profiles?.full_name || ''} ${vehicle.responsible_profile?.full_name || ''}`,
  }));
  const deliveryReceiverOptions = receivers
    .filter(row => row.customer_id && row.customer?.name)
    .map(row => ({
      value: row.customer_id,
      label: row.customer?.name || row.customer_id,
      selectedLabel: row.customer?.name || row.customer_id,
      searchText: `${row.customer?.name || ''} ${row.customer?.phone || ''} ${row.receiver_pending} ${row.receiver_debt}`,
      content: (
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-bold text-foreground">{row.customer?.name || row.customer_id}</span>
          <span className="inline-flex shrink-0 items-center rounded-lg bg-blue-500/10 px-2 py-1 text-[11px] font-black text-blue-600">
            Chờ giao {formatNumber(row.receiver_pending)} két
          </span>
          <span className="inline-flex shrink-0 items-center rounded-lg bg-red-500/10 px-2 py-1 text-[11px] font-black text-red-600">
            Nợ {formatNumber(row.receiver_debt)} két
          </span>
        </span>
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  const canChangeDeliveryVehicle = isAdmin;
  const modalQuantity = Number(deliveryForm.quantity || 0);
  const modalPendingAfter = deliveryModal?.receiver
    ? Math.max(deliveryModal.receiver.receiver_pending - (Number.isFinite(modalQuantity) ? modalQuantity : 0), 0)
    : 0;
  const modalDebtWillCreate = deliveryModal
    ? Math.max((Number.isFinite(modalQuantity) ? modalQuantity : 0) - (deliveryModal.receiver?.receiver_pending || 0), 0)
    : 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader title="Giao két" description="Tạo và theo dõi đơn giao két" backPath="/app/hang-hoa" />
      </div>

      <div className="bg-card flex flex-row w-full gap-2 items-center rounded-2xl shadow-sm border border-border p-2.5 md:mb-6 mb-3 overflow-x-auto custom-scrollbar">
        <div className="flex-1 min-w-56 md:min-w-0">
          <SearchInput
            placeholder="Tìm khách nhận két..."
            onSearch={(raw) => setSearch(raw)}
            className="h-9.5"
          />
        </div>

        <div className="hidden md:flex items-center gap-2 shrink-0">
          <div className="w-56 shrink-0">
            <DateRangePicker
              initialDateFrom={filterDateFrom || undefined}
              initialDateTo={filterDateTo || undefined}
              onUpdate={({ range }) => {
                setFilterDateFrom(range.from ? formatDateInputValue(range.from) : '');
                setFilterDateTo(range.to ? formatDateInputValue(range.to) : '');
              }}
              className="h-9.5 w-full md:w-full bg-muted/20 border-border/80"
              hidePresets
            />
          </div>
          <div className="w-60 shrink-0">
            <MultiSearchableSelect
              options={customerFilterOptions}
              value={filterCustomerIds}
              onValueChange={setFilterCustomerIds}
              placeholder="Khách nhận két"
              className="h-9.5 bg-transparent"
              icon={<Package size={15} />}
            />
          </div>
          <div className="w-52 shrink-0">
            <MultiSearchableSelect
              options={vehicleFilterOptions}
              value={filterVehicleIds}
              onValueChange={setFilterVehicleIds}
              placeholder="Xe đã giao"
              className="h-9.5 bg-transparent"
              icon={<Truck size={15} />}
            />
          </div>
          {(filterDateFrom || filterDateTo || filterCustomerIds.length > 0 || filterVehicleIds.length > 0) && (
            <button
              onClick={() => {
                setFilterDateFrom('');
                setFilterDateTo('');
                setFilterCustomerIds([]);
                setFilterVehicleIds([]);
              }}
              className="h-9.5 px-3 shrink-0 border border-border/80 rounded-xl text-[12px] font-bold bg-muted/20 text-muted-foreground hover:bg-muted hover:text-foreground transition-all inline-flex items-center gap-1.5"
              title="Xóa bộ lọc"
            >
              <X size={14} />
              Xóa lọc
            </button>
          )}
        </div>

        <button
          onClick={openFilter}
          className={clsx(
            'md:hidden h-9.5 w-9.5 shrink-0 border rounded-xl transition-all inline-flex items-center justify-center relative',
            filterDateFrom || filterDateTo || filterCustomerIds.length > 0 || filterVehicleIds.length > 0
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-border/80 bg-muted/20 text-muted-foreground hover:bg-muted'
          )}
          aria-label="Mở bộ lọc"
        >
          <Filter size={17} />
          {(filterDateFrom || filterDateTo || filterCustomerIds.length > 0 || filterVehicleIds.length > 0) && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card" />
          )}
        </button>

        <button
          onClick={() => void loadData()}
          className="h-9.5 px-3 shrink-0 border border-border/80 rounded-xl text-[12px] font-bold bg-muted/20 text-foreground hover:bg-muted transition-all inline-flex items-center gap-2"
        >
          <RefreshCw size={15} />
          <span className="hidden md:inline">Tải lại</span>
        </button>

        <button
          onClick={() => navigate('/app/hang-hoa/giao-ket/lich-su')}
          className="h-9.5 px-3 shrink-0 border border-border/80 rounded-xl text-[12px] font-bold bg-muted/20 text-foreground hover:bg-muted transition-all inline-flex items-center gap-2"
        >
          <History size={15} />
          <span>Lịch sử</span>
        </button>

        <button
          onClick={openManualDeliveryModal}
          className="h-9.5 px-3 shrink-0 rounded-xl text-[12px] font-black bg-primary text-white hover:bg-primary/90 shadow-sm shadow-primary/20 transition-all inline-flex items-center gap-2"
        >
          <PlusCircle size={15} />
          <span className="hidden md:inline">Tạo đơn giao</span>
          <span className="md:hidden">Tạo</span>
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingSkeleton rows={10} columns={8} /></div>
        ) : !filteredRows.length ? (
          <EmptyState
            title="Không có phiếu chờ xác nhận"
            description="Chỉ hiển thị các đơn giao két đã tạo và đang chờ admin xác nhận."
          />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar bg-muted/30 p-3 md:p-4">
            <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <table className="w-full border-collapse">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-tight">Phiếu giao</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-tight">Người nhận</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-tight">Tình trạng</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-tight">Số lượng</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-tight">Xe / chi tiết</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-tight">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRows.map(row => {
                    const vehicleSummaries = displayedVehicles
                      .map(vehicle => ({ vehicle, entries: getDeliveryEntriesForRowVehicle(row, vehicle.id) }))
                      .filter(item => item.entries.length > 0);
                    const pendingDelivery = row.pendingDelivery;
                    const primaryQuantity = row.delivered_total || pendingDelivery?.quantity || 0;
                    return (
                      <tr key={row.rowKey || row.customer_id} className="group transition-colors hover:bg-muted/30">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className={clsx(
                              'flex h-10 w-10 items-center justify-center rounded-2xl',
                              'bg-orange-500/10 text-orange-600'
                            )}>
                              <Truck size={19} />
                            </div>
                            <div>
                              <div className="text-[13px] font-black text-foreground">Phiếu chờ xác nhận</div>
                              <div className="text-[12px] font-bold text-muted-foreground tabular-nums">
                                {formatDateTime(row.created_at)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-[13px] font-black text-foreground">{row.customer?.name || '-'}</div>
                          <div className="text-[12px] text-muted-foreground">{row.customer?.phone || '-'}</div>
                        </td>
                        <td className="px-4 py-4 text-center">{renderStatusBadge()}</td>
                        <td className="px-4 py-4 text-right">
                          <div className="text-lg font-black tabular-nums text-emerald-600">{formatNumber(primaryQuantity)}</div>
                          <div className="text-[11px] font-bold text-muted-foreground">két</div>
                        </td>
                        <td className="px-4 py-4">
                          {vehicleSummaries.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {vehicleSummaries.map(({ vehicle, entries }) => (
                                <span key={vehicle.id} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-card px-2 py-1 text-[11px] font-black text-blue-700 shadow-sm ring-1 ring-blue-500/5">
                                  <Truck size={12} className="text-blue-500" />
                                  {vehicle.license_plate}
                                  <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-blue-700 tabular-nums">{formatNumber(entries.reduce((sum, delivery) => sum + delivery.quantity, 0))}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[12px] font-bold text-muted-foreground">Chưa có xe giao</span>
                          )}
                          <div className="mt-1 text-[11px] font-bold text-muted-foreground">
                            Còn {formatNumber(row.receiver_pending)} · Nợ {formatNumber(row.receiver_debt)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-2">
                            {isAdmin && pendingDelivery ? (
                              <button
                                onClick={() => void handleConfirmDelivery(pendingDelivery.id)}
                                disabled={confirmingDeliveryId === pendingDelivery.id}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-[12px] font-black text-white shadow-sm shadow-emerald-500/20 transition-all hover:bg-emerald-600 disabled:opacity-60"
                              >
                                <PlusCircle size={14} /> {confirmingDeliveryId === pendingDelivery.id ? 'Đang xác nhận...' : 'Xác nhận'}
                              </button>
                            ) : (
                              <span className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-700">Chờ admin</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 md:hidden">
              {filteredRows.map(row => {
                const vehicleSummaries = displayedVehicles
                  .map(vehicle => ({ vehicle, entries: getDeliveryEntriesForRowVehicle(row, vehicle.id) }))
                  .filter(item => item.entries.length > 0);
                    const pendingDelivery = row.pendingDelivery;
                    const primaryQuantity = row.delivered_total || pendingDelivery?.quantity || 0;
                return (
                  <div key={row.rowKey || row.customer_id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                    <button
                      type="button"
                      className="w-full p-4 text-left"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[15px] font-black text-foreground">{row.customer?.name || '-'}</div>
                          <div className="text-[12px] text-muted-foreground">{row.customer?.phone || '-'}</div>
                        </div>
                        {renderStatusBadge()}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-emerald-500/10 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Số lượng</p>
                          <p className="mt-1 text-lg font-black tabular-nums text-emerald-700">{formatNumber(primaryQuantity)}</p>
                        </div>
                        <div className="rounded-xl bg-blue-500/10 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Còn</p>
                          <p className="mt-1 text-lg font-black tabular-nums text-blue-700">{formatNumber(row.receiver_pending)}</p>
                        </div>
                        <div className="rounded-xl bg-red-500/10 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Nợ</p>
                          <p className="mt-1 text-lg font-black tabular-nums text-red-700">{formatNumber(row.receiver_debt)}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                        <Calendar size={13} />
                        {formatDateTime(row.created_at)}
                      </div>
                      {vehicleSummaries.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {vehicleSummaries.map(({ vehicle, entries }) => (
                            <span key={vehicle.id} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-card px-2 py-1 text-[11px] font-black text-blue-700 shadow-sm ring-1 ring-blue-500/5">
                              <Truck size={12} className="text-blue-500" /> <span>{vehicle.license_plate}</span> <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-blue-700 tabular-nums">{formatNumber(entries.reduce((sum, delivery) => sum + delivery.quantity, 0))}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                    {pendingDelivery && (
                      <div className="flex border-t border-border divide-x divide-border">
                        {isAdmin ? (
                          <button
                            onClick={() => void handleConfirmDelivery(pendingDelivery.id)}
                            disabled={confirmingDeliveryId === pendingDelivery.id}
                            className="flex-1 py-3 text-[12px] font-black text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-60"
                          >
                            {confirmingDeliveryId === pendingDelivery.id ? 'Đang xác nhận...' : 'Xác nhận phiếu'}
                          </button>
                        ) : (
                          <span className="flex-1 py-3 text-center text-[12px] font-black text-amber-700">Chờ admin xác nhận</span>
                        )}

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={(filters) => {
          setFilterDateFrom(filters.dateFrom || '');
          setFilterDateTo(filters.dateTo || '');
        }}
        onClear={() => {
          setFilterDateFrom('');
          setFilterDateTo('');
          setFilterCustomerIds([]);
          setFilterVehicleIds([]);
        }}
        showClearButton={
          !!filterDateFrom ||
          !!filterDateTo ||
          filterCustomerIds.length > 0 ||
          filterVehicleIds.length > 0
        }
        initialDateFrom={filterDateFrom}
        initialDateTo={filterDateTo}
      >
        <div className="space-y-1.5 z-30">
          <label className="text-[13px] font-bold text-muted-foreground">Khách nhận két</label>
          <MultiSearchableSelect
            options={customerFilterOptions}
            value={filterCustomerIds}
            onValueChange={setFilterCustomerIds}
            placeholder="Tất cả khách..."
            className="w-full bg-muted/10 h-10.5 border-border/80 rounded-xl"
            inline
          />
        </div>
        <div className="space-y-1.5 z-20">
          <label className="text-[13px] font-bold text-muted-foreground">Xe đã giao két</label>
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
      {deliveryModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-end justify-center sm:items-center sm:p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300" onClick={closeDeliveryModal} />
          <div className="relative flex h-dvh w-full flex-col overflow-hidden rounded-none bg-background shadow-2xl animate-in slide-in-from-bottom-full duration-300 sm:h-auto sm:max-h-[92vh] sm:max-w-4xl sm:rounded-3xl sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4 sm:rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <Truck size={21} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-foreground">Tạo phiếu giao két</h3>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Nhập ngày giờ / nhân viên / xe / người nhận / số lượng / chi tiết / ảnh
                  </p>
                </div>
              </div>
              <button type="button" onClick={closeDeliveryModal} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <form id="crate-delivery-form" onSubmit={(event) => { event.preventDefault(); void handleDeliver(); }} className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    <Calendar size={14} /> Ngày tạo phiếu
                  </label>
                  <input
                    type="date"
                    value={deliveryForm.deliveredDate}
                    onChange={(event) => setDeliveryForm(prev => ({ ...prev, deliveredDate: event.target.value }))}
                    className="flex h-11 w-full rounded-xl border border-border bg-card px-3 text-sm font-black text-foreground shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    <Clock size={14} /> Giờ tạo phiếu
                  </label>
                  <input
                    type="time"
                    step={60}
                    value={deliveryForm.deliveredTime}
                    onChange={(event) => setDeliveryForm(prev => ({ ...prev, deliveredTime: event.target.value }))}
                    className="flex h-11 w-full rounded-xl border border-border bg-card px-3 text-sm font-black tabular-nums text-foreground shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    <User size={14} /> Nhân viên tạo phiếu
                  </label>
                  <div className="flex h-11 items-center rounded-xl border border-border bg-muted/30 px-3 text-sm font-black text-foreground">
                    {user?.full_name || '-'}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    <Truck size={14} /> Số xe
                  </label>
                  <SearchableSelect
                    options={deliveryVehicleOptions}
                    value={deliveryModal.vehicleId || ''}
                    onValueChange={(vehicleId) => setDeliveryModal(prev => prev ? { ...prev, vehicleId: vehicleId || null } : prev)}
                    placeholder="Chọn xe giao két..."
                    searchPlaceholder="Tìm biển số / tài xế..."
                    emptyMessage="Không có xe phù hợp."
                    className="h-11 bg-card font-bold"
                    disabled={!canChangeDeliveryVehicle}
                    icon={<Truck size={15} />}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    <Package size={14} /> Tên người nhận
                  </label>
                  <SearchableSelect
                    options={deliveryReceiverOptions}
                    value={deliveryModal.receiver?.customer_id || ''}
                    onValueChange={(customerId) => {
                      const receiver = receivers.find(row => row.customer_id === customerId) || null;
                      setDeliveryModal(prev => prev ? { ...prev, receiver } : prev);
                      if (receiver) {
                        setDeliveryForm(prev => ({ ...prev, quantity: receiver.receiver_pending > 0 ? String(receiver.receiver_pending) : prev.quantity }));
                      }
                    }}
                    placeholder="Chọn người nhận két..."
                    searchPlaceholder="Tìm tên / số điện thoại / công nợ..."
                    emptyMessage="Không có người nhận phù hợp."
                    className="h-11 bg-card font-bold"
                    icon={<Package size={15} />}
                  />
                  {deliveryModal.receiver && (
                    <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
                      <div className="rounded-xl border border-blue-200 bg-card px-3 py-2 shadow-sm ring-1 ring-blue-500/5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Đang còn chờ</p>
                        <p className="mt-1 text-lg font-black tabular-nums text-blue-700">{formatNumber(deliveryModal.receiver.receiver_pending)} két</p>
                      </div>
                      <div className="rounded-xl border border-red-200 bg-card px-3 py-2 shadow-sm ring-1 ring-red-500/5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Đang nợ</p>
                        <p className="mt-1 text-lg font-black tabular-nums text-red-700">{formatNumber(deliveryModal.receiver.receiver_debt)} két</p>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-card px-3 py-2 shadow-sm ring-1 ring-emerald-500/5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Trạng thái sau xác nhận</p>
                        <p className="mt-1 text-sm font-black text-emerald-700">
                          Còn {formatNumber(modalPendingAfter)} · Nợ thêm {formatNumber(modalDebtWillCreate)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    <Hash size={14} /> Số lượng két
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={deliveryForm.quantity}
                    onChange={(event) => setDeliveryForm(prev => ({ ...prev, quantity: event.target.value }))}
                    placeholder="Nhập số lượng"
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm font-black tabular-nums text-foreground outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                    required
                  />
                </div>
<div className="space-y-2 md:col-span-2">
                  <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    <FileText size={14} /> Chi tiết / ghi chú
                  </label>
                  <textarea
                    value={deliveryForm.notes}
                    onChange={(event) => setDeliveryForm(prev => ({ ...prev, notes: event.target.value }))}
                    rows={4}
                    placeholder="Nhập chi tiết giao két, lý do nợ phát sinh, ghi chú cho người nhận..."
                    className="w-full resize-none rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  />
                </div>

                <div className="space-y-3 md:col-span-2">
                  <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    <ImagePlus size={14} /> Ảnh xác nhận
                  </label>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {deliveryForm.files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                        <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setDeliveryForm(prev => ({ ...prev, files: prev.files.filter((_, fileIndex) => fileIndex !== index) }))}
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label="Xóa ảnh"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-emerald-500/50 hover:bg-emerald-50/50 hover:text-emerald-600">
                      <Upload size={20} className="mx-auto mb-1" />
                      <span className="text-[11px] font-bold">Tải ảnh</span>
                    </button>
                    <button type="button" onClick={() => cameraInputRef.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-blue-500/50 hover:bg-blue-50/50 hover:text-blue-600 md:hidden">
                      <Camera size={20} className="mx-auto mb-1" />
                      <span className="text-[11px] font-bold">Chụp ảnh</span>
                    </button>
                  </div>
                </div>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={event => setDeliveryForm(prev => ({ ...prev, files: [...prev.files, ...Array.from(event.target.files || [])] }))}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={event => setDeliveryForm(prev => ({ ...prev, files: [...prev.files, ...Array.from(event.target.files || [])] }))}
              />
            </form>

            <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-6 py-4 sm:rounded-b-3xl">
              <button type="button" onClick={closeDeliveryModal} disabled={submitting} className="rounded-xl border border-border px-6 py-2 text-[13px] font-bold text-foreground transition-all hover:bg-muted disabled:opacity-60">
                Hủy
              </button>
              <button
                type="submit"
                form="crate-delivery-form"
                disabled={submitting}
                className={clsx(
                  'group flex items-center gap-2 rounded-xl px-8 py-2 text-[13px] font-bold shadow-lg transition-all',
                  submitting
                    ? 'cursor-wait bg-emerald-500/50 text-white/60'
                    : 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600'
                )}
              >
                {submitting ? 'Đang tạo phiếu...' : 'Lưu phiếu giao'}
                {!submitting && <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" />}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CrateDeliveryPage;















