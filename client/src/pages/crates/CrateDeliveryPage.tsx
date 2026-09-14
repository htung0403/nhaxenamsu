import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { AlertCircle, Camera, CheckCircle, ImagePlus, Package, RefreshCw, Truck, X } from 'lucide-react';
import { cratesApi, type CrateAccount, type CrateDelivery } from '../../api/cratesApi';
import { uploadApi } from '../../api/uploadApi';
import EmptyState from '../../components/shared/EmptyState';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import PageHeader from '../../components/shared/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { useAuth } from '../../context/AuthContext';
import { useVehicles } from '../../hooks/queries/useVehicles';
import type { Vehicle } from '../../types';

const formatNumber = (value?: number | null) => new Intl.NumberFormat('vi-VN').format(value || 0);
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra';

type DeliveryStatus = 'can_giao' | 'da_giao' | 'dang_no' | 'all';
type DeliveryForm = { quantity: string; notes: string; files: File[] };
type CrateDeliveryRow = CrateAccount & { delivered_total?: number; isDeliveredHistory?: boolean };

type DeliveryModalState = {
  receiver: CrateAccount;
  vehicleId: string | null;
};

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  can_giao: 'Cần giao',
  da_giao: 'Đã giao',
  dang_no: 'Đang nợ',
  all: 'Tất cả',
};

const STATUS_COLORS: Record<DeliveryStatus, { bg: string; text: string }> = {
  can_giao: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-500' },
  da_giao: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-500' },
  dang_no: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-500' },
  all: { bg: 'bg-muted', text: 'text-muted-foreground' },
};

const getDefaultForm = (): DeliveryForm => ({ quantity: '', notes: '', files: [] });

const vehicleSupportsGoodsCategory = (vehicle: Vehicle, category: 'grocery' | 'vegetable') => {
  if (!vehicle.goods_categories || vehicle.goods_categories.length === 0) return true;
  return vehicle.goods_categories.includes(category);
};

const CrateDeliveryPage: React.FC = () => {
  const { user } = useAuth();
  const { data: vehicles } = useVehicles();
  const [receivers, setReceivers] = useState<CrateAccount[]>([]);
  const [deliveries, setDeliveries] = useState<CrateDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus>('can_giao');
  const [deliveryModal, setDeliveryModal] = useState<DeliveryModalState | null>(null);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>(getDefaultForm());
  const [submitting, setSubmitting] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rows, history] = await Promise.all([
        cratesApi.getAccounts('receiver'),
        cratesApi.getHistory(),
      ]);
      setReceivers(rows);
      setDeliveries(history.deliveries || []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Không tải được danh sách giao két');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const eligibleVehicles = useMemo(
    () => (vehicles || []).filter((vehicle) => vehicleSupportsGoodsCategory(vehicle, 'vegetable')),
    [vehicles]
  );

  const activeRows = useMemo(() => receivers.filter(row => row.receiver_pending > 0 || row.receiver_debt > 0), [receivers]);

  const deliveredRows = useMemo<CrateDeliveryRow[]>(() => {
    const byReceiver = new Map<string, CrateDeliveryRow>();
    for (const delivery of deliveries) {
      const existing = byReceiver.get(delivery.receiver_customer_id);
      if (existing) {
        existing.delivered_total = (existing.delivered_total || 0) + delivery.quantity;
        continue;
      }
      const account = receivers.find(row => row.customer_id === delivery.receiver_customer_id);
      byReceiver.set(delivery.receiver_customer_id, {
        customer_id: delivery.receiver_customer_id,
        is_sender: account?.is_sender || false,
        is_receiver: true,
        sender_balance: account?.sender_balance || 0,
        receiver_pending: account?.receiver_pending || 0,
        receiver_debt: account?.receiver_debt || 0,
        created_at: account?.created_at || delivery.created_at,
        updated_at: account?.updated_at || delivery.created_at,
        customer: (account?.customer || delivery.receiver) as CrateAccount['customer'],
        delivered_total: delivery.quantity,
        isDeliveredHistory: true,
      });
    }
    return Array.from(byReceiver.values()).sort((a, b) => (b.delivered_total || 0) - (a.delivered_total || 0));
  }, [deliveries, receivers]);

  const visibleRows = useMemo<CrateDeliveryRow[]>(() => {
    const merged = new Map<string, CrateDeliveryRow>();
    for (const row of activeRows) merged.set(row.customer_id, row);
    for (const row of deliveredRows) merged.set(row.customer_id, { ...row, ...merged.get(row.customer_id), delivered_total: row.delivered_total, isDeliveredHistory: row.isDeliveredHistory });
    return Array.from(merged.values());
  }, [activeRows, deliveredRows]);

  const statusCounts = useMemo(() => ({
    can_giao: activeRows.filter(row => row.receiver_pending > 0).length,
    da_giao: deliveredRows.length,
    dang_no: activeRows.filter(row => row.receiver_debt > 0).length,
    all: visibleRows.length,
  }), [activeRows, deliveredRows, visibleRows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sourceRows = statusFilter === 'da_giao' ? deliveredRows : visibleRows;
    return sourceRows
      .filter(row => {
        if (statusFilter === 'can_giao') return row.receiver_pending > 0;
        if (statusFilter === 'da_giao') return (row.delivered_total || 0) > 0;
        if (statusFilter === 'dang_no') return row.receiver_debt > 0;
        return true;
      })
      .filter(row => !query || [row.customer?.name, row.customer?.phone, row.customer?.address]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query))
      .sort((a, b) => {
        if (statusFilter === 'da_giao') return (b.delivered_total || 0) - (a.delivered_total || 0);
        return (b.receiver_pending - a.receiver_pending) || (b.receiver_debt - a.receiver_debt);
      });
  }, [deliveredRows, visibleRows, search, statusFilter]);

  const deliveredByReceiverVehicle = useMemo(() => {
    return deliveries.reduce<Record<string, number>>((acc, delivery) => {
      if (!delivery.vehicle_id) return acc;
      const key = `${delivery.receiver_customer_id}:${delivery.vehicle_id}`;
      acc[key] = (acc[key] || 0) + delivery.quantity;
      return acc;
    }, {});
  }, [deliveries]);

  const openDeliveryModal = (receiver: CrateDeliveryRow, vehicleId?: string | null) => {
    setDeliveryModal({ receiver, vehicleId: vehicleId || null });
    setDeliveryForm({ ...getDefaultForm(), quantity: receiver.receiver_pending > 0 ? String(receiver.receiver_pending) : '' });
  };

  const closeDeliveryModal = () => {
    if (submitting) return;
    setDeliveryModal(null);
    setDeliveryForm(getDefaultForm());
  };

  const handleDeliver = async () => {
    if (!deliveryModal) return;
    const quantity = Number(deliveryForm.quantity || 0);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error('Số két giao phải là số nguyên dương');
      return;
    }
    if (quantity > deliveryModal.receiver.receiver_pending && !deliveryForm.notes.trim()) {
      toast.error('Vui lòng nhập ghi chú khi giao vượt số két chờ giao');
      return;
    }

    setSubmitting(true);
    try {
      const imageUrls: string[] = [];
      for (const file of deliveryForm.files) {
        const uploaded = await uploadApi.uploadFile(file, 'crates', 'crate-deliveries');
        imageUrls.push(uploaded.url);
      }
      const result = await cratesApi.createDelivery({
        receiver_customer_id: deliveryModal.receiver.customer_id,
        quantity,
        notes: deliveryForm.notes || null,
        image_urls: imageUrls,
        vehicle_id: deliveryModal.vehicleId,
      });
      toast.success(result?.delivery?.debt_created > 0 ? 'Đã giao két và ghi nợ phát sinh' : 'Đã giao két');
      setDeliveryModal(null);
      setDeliveryForm(getDefaultForm());
      await loadData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Giao két thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBadge = (row: CrateDeliveryRow) => {
    if (row.receiver_pending > 0) {
      return <span className="inline-flex rounded-lg bg-orange-500/10 px-2 py-1 text-[11px] font-black text-orange-600">Cần giao</span>;
    }
    if ((row.delivered_total || 0) > 0) {
      return <span className="inline-flex rounded-lg bg-green-500/10 px-2 py-1 text-[11px] font-black text-green-600">Đã giao</span>;
    }
    return <span className="inline-flex rounded-lg bg-red-500/10 px-2 py-1 text-[11px] font-black text-red-600">Đang nợ</span>;
  };

  const selectedVehicle = deliveryModal?.vehicleId
    ? eligibleVehicles.find(vehicle => vehicle.id === deliveryModal.vehicleId)
    : null;
  const modalDebtWillCreate = deliveryModal
    ? Math.max(Number(deliveryForm.quantity || 0) - deliveryModal.receiver.receiver_pending, 0)
    : 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0 px-3 pb-24 md:px-0 md:pb-0">
      <div className="hidden md:block">
        <PageHeader title="Giao két" description="Danh sách khách nhận két cần giao" backPath="/app/hang-hoa" />
      </div>

      <div className="bg-card flex flex-row w-full gap-2 items-center rounded-2xl shadow-sm border border-border p-2 md:p-2.5 md:mb-6 mb-3 overflow-x-auto custom-scrollbar">
        <div className="flex-1 min-w-50 md:max-w-full">
          <SearchInput
            placeholder="Tìm khách nhận két..."
            onSearch={(raw) => setSearch(raw)}
            className="h-9.5"
          />
        </div>

        <div className="hidden md:flex items-center gap-2 shrink-0 text-xs font-bold text-muted-foreground px-3">
          <Truck size={15} className="text-primary" />
          Tài xế: <span className="text-foreground">{user?.full_name || 'Tài khoản hiện tại'}</span>
        </div>

        <button
          onClick={() => void loadData()}
          className="h-9.5 px-3 shrink-0 border border-border/80 rounded-xl text-[12px] font-bold bg-muted/20 text-foreground hover:bg-muted transition-all inline-flex items-center gap-2"
        >
          <RefreshCw size={15} />
          Tải lại
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-col shrink-0 border-b border-border bg-muted/50">
          <div className="grid grid-cols-4 gap-1 p-2 md:px-3 md:py-2 md:flex md:items-center md:gap-1 md:overflow-x-auto custom-scrollbar">
            {(['can_giao', 'da_giao', 'dang_no', 'all'] as const).map(status => {
              const colors = STATUS_COLORS[status];
              const isActive = statusFilter === status;
              const count = statusCounts[status];
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={clsx(
                    'w-full flex items-center justify-center md:justify-start gap-1 px-1.5 md:px-3 py-1.5 rounded-lg text-[10px] md:text-[12px] font-bold transition-all whitespace-nowrap',
                    isActive
                      ? `${colors.bg} ${colors.text} shadow-sm ring-1 ring-black/5`
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  {STATUS_LABELS[status]}
                  {count > 0 && (
                    <span className={clsx(
                      'text-[9px] md:text-[10px] font-black px-1 md:px-1.5 py-0.5 rounded-full min-w-4 md:min-w-5 text-center',
                      isActive ? `${colors.bg} ${colors.text}` : 'bg-muted/60 text-muted-foreground'
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="p-4"><LoadingSkeleton rows={10} columns={8} /></div>
        ) : !filteredRows.length ? (
          <EmptyState
            title={statusFilter === 'all' ? 'Không có khách nhận két' : statusFilter === 'can_giao' ? 'Không có két cần giao' : 'Không có khách đang nợ két'}
            description={`Không có khách nhận két nào với trạng thái "${STATUS_LABELS[statusFilter]}" phù hợp với bộ lọc.`}
          />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar bg-muted/30 md:bg-transparent relative">
            <div className="hidden md:block">
              <table className="w-full border-collapse bg-card">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-card border-b border-border text-muted-foreground">
                    <th className="px-3 py-3 w-10 border-r border-border text-center">
                      <input type="checkbox" disabled className="w-4 h-4 rounded border-border opacity-40" />
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-24 border-r border-border">Thao tác</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">Loại</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left min-w-48 border-r border-border">Người nhận két</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left min-w-60 border-r border-border">Địa chỉ</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">Trạng thái</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">Chờ giao</th>
                    <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">Nợ két</th>
                    {eligibleVehicles.map(vehicle => (
                      <th key={vehicle.id} className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-28 border-r border-border last:border-r-0">
                        {vehicle.license_plate}
                      </th>
                    ))}
                    {eligibleVehicles.length === 0 && ['1', '2', '3', '4', '5', '6', '7', '8', 'ba', 'kho'].map(col => (
                      <th key={col} className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-12 border-r border-border last:border-r-0">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="bg-muted/80 dark:bg-muted/40 border-y border-border shadow-sm">
                    <td colSpan={8 + (eligibleVehicles.length || 10)} className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary">
                          <Package size={14} />
                        </div>
                        <span className="text-[13px] font-black text-foreground uppercase tracking-wider">Danh sách két cần giao</span>
                        <span className="text-[11px] font-bold text-muted-foreground">{formatNumber(filteredRows.length)} khách · {formatNumber(filteredRows.reduce((sum, row) => sum + row.receiver_pending, 0))} két chờ · {formatNumber(filteredRows.reduce((sum, row) => sum + row.receiver_debt, 0))} két nợ</span>
                      </div>
                    </td>
                  </tr>
                  {filteredRows.map(row => (
                    <tr key={row.customer_id} className="group hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-3 border-r border-border text-center">
                        <input type="checkbox" disabled className="w-4 h-4 rounded border-border opacity-40" />
                      </td>
                      <td className="px-3 py-3 border-r border-border">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openDeliveryModal(row)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 transition-all hover:bg-orange-500/20"
                            title="Giao két"
                          >
                            <Truck size={16} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 border-r border-border text-center">
                        <span className="inline-flex rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-black text-emerald-600">KÉT</span>
                      </td>
                      <td className="px-4 py-3 border-r border-border">
                        <div className="font-black text-[13px] text-foreground">{row.customer?.name || '-'}</div>
                        <div className="text-[12px] text-muted-foreground">{row.customer?.phone || '-'}</div>
                      </td>
                      <td className="px-4 py-3 border-r border-border text-[13px] text-muted-foreground">{row.customer?.address || 'Chưa có địa chỉ'}</td>
                      <td className="px-2 py-3 border-r border-border text-center">{renderStatusBadge(row)}</td>
                      <td className="px-2 py-3 border-r border-border text-center font-black text-primary">{formatNumber(row.receiver_pending)}</td>
                      <td className="px-2 py-3 border-r border-border text-center font-black text-red-600">{formatNumber(row.receiver_debt)}</td>
                      {eligibleVehicles.map(vehicle => {
                        const deliveredQty = deliveredByReceiverVehicle[`${row.customer_id}:${vehicle.id}`] || 0;
                        const canOpen = row.receiver_pending > 0 || row.receiver_debt > 0;
                        return (
                          <td
                            key={vehicle.id}
                            onClick={() => canOpen && openDeliveryModal(row, vehicle.id)}
                            className={clsx(
                              'px-1 py-1 text-[13px] text-center tabular-nums border-r border-border last:border-r-0 transition-all relative group/cell',
                              deliveredQty > 0 ? 'font-bold text-blue-600 dark:text-blue-500 bg-blue-500/10' : 'text-muted-foreground/30',
                              canOpen && 'cursor-pointer hover:bg-primary/5 active:scale-95'
                            )}
                            title={`Giao két bằng xe ${vehicle.license_plate}`}
                          >
                            {deliveredQty > 0 ? (
                              <div className="flex flex-col items-center justify-center gap-0.5">
                                <span>{formatNumber(deliveredQty)}</span>
                                <span className="inline-flex items-center gap-0.5 rounded-sm bg-green-500/10 px-1 text-[9px] font-black text-green-600">
                                  <CheckCircle size={8} strokeWidth={3} /> Giao
                                </span>
                              </div>
                            ) : (
                              <Truck size={13} className="mx-auto opacity-20" />
                            )}
                          </td>
                        );
                      })}
                      {eligibleVehicles.length === 0 && ['1', '2', '3', '4', '5', '6', '7', '8', 'ba', 'kho'].map(col => (
                        <td key={col} className="px-1 py-1 text-center text-muted-foreground/20 border-r border-border last:border-r-0">○</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden p-2.5 space-y-3">
              {filteredRows.map(row => (
                <div key={row.customer_id} className="rounded-2xl border border-border bg-background p-4 space-y-3 shadow-sm">
                  <div className="flex justify-between gap-3">
                    <div>
                      <h2 className="font-black text-lg">{row.customer?.name || '-'}</h2>
                      <p className="text-sm text-muted-foreground">{row.customer?.phone || '-'} · {row.customer?.address || 'Chưa có địa chỉ'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground font-bold uppercase">Chờ / Nợ</p>
                      <p className="font-black"><span className="text-blue-600">{formatNumber(row.receiver_pending)}</span> / <span className="text-red-600">{formatNumber(row.receiver_debt)}</span></p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {eligibleVehicles.slice(0, 6).map(vehicle => {
                      const deliveredQty = deliveredByReceiverVehicle[`${row.customer_id}:${vehicle.id}`] || 0;
                      return (
                        <button
                          key={vehicle.id}
                          onClick={() => openDeliveryModal(row, vehicle.id)}
                          className={clsx(
                            'rounded-xl border border-border px-3 py-2 text-left text-xs font-bold transition-all',
                            deliveredQty > 0 ? 'bg-blue-500/10 text-blue-600' : 'bg-muted/20 text-muted-foreground'
                          )}
                        >
                          <span className="block text-foreground">{vehicle.license_plate}</span>
                          <span>{deliveredQty > 0 ? `Đã giao ${formatNumber(deliveredQty)}` : 'Chọn xe giao'}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => openDeliveryModal(row)} className="w-full px-4 py-3.5 rounded-xl bg-primary text-white font-black hover:bg-primary/90">
                    Xác nhận giao két
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {deliveryModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-end justify-center sm:items-center sm:p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={closeDeliveryModal} />
          <div className="relative flex h-dvh w-full flex-col rounded-none bg-background shadow-2xl animate-in slide-in-from-bottom-full duration-300 sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-3xl sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-4 shadow-sm sm:rounded-t-3xl sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-primary">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-foreground">Giao két</h3>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Người nhận: <span className="font-black text-foreground">{deliveryModal.receiver.customer?.name || '-'}</span>
                  </p>
                </div>
              </div>
              <button onClick={closeDeliveryModal} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5 custom-scrollbar sm:p-6">
              <div className="rounded-2xl border border-border bg-muted/50 p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Chờ giao</p>
                    <p className="text-xl font-black tabular-nums text-primary">{formatNumber(deliveryModal.receiver.receiver_pending)}</p>
                  </div>
                  <div className="hidden h-8 w-px bg-border sm:block" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">Nợ két</p>
                    <p className="text-xl font-black tabular-nums text-red-600">{formatNumber(deliveryModal.receiver.receiver_debt)}</p>
                  </div>
                  <div className="hidden h-8 w-px bg-border sm:block" />
                  <div className="sm:text-right">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Xe giao</p>
                    <p className="text-xl font-black tabular-nums text-foreground">{selectedVehicle?.license_plate || 'Chưa chọn'}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="mb-3 text-sm font-black uppercase text-foreground">Thông tin giao két</h4>
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr]">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Số két giao</label>
                      <input
                        type="number"
                        min={1}
                        value={deliveryForm.quantity}
                        onChange={event => setDeliveryForm(prev => ({ ...prev, quantity: event.target.value }))}
                        placeholder="Số két"
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-black outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Ghi chú</label>
                      <input
                        value={deliveryForm.notes}
                        onChange={event => setDeliveryForm(prev => ({ ...prev, notes: event.target.value }))}
                        placeholder="Ghi chú giao két"
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                  </div>

                  <div className="mt-5 border-t border-dashed border-border pt-4">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Ảnh xác nhận {selectedVehicle ? `/ ${selectedVehicle.license_plate}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-[12px] font-bold text-orange-600 transition-colors hover:bg-orange-50">
                        <Camera size={20} />
                        Chụp ảnh
                      </button>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-[12px] font-bold text-primary transition-colors hover:bg-primary/5">
                        <ImagePlus size={20} />
                        Chọn ảnh
                      </button>
                      {deliveryForm.files.length > 0 && (
                        <div className="flex min-h-20 flex-1 items-center rounded-2xl border border-blue-100 bg-blue-50 px-4 text-sm font-bold text-blue-700">
                          Đã chọn {deliveryForm.files.length} ảnh xác nhận
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {modalDebtWillCreate > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>Giao vượt chờ giao {formatNumber(modalDebtWillCreate)} két; hệ thống sẽ ghi nợ két cho khách.</span>
                </div>
              )}

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
            </div>

            <div className="shrink-0 border-t border-border bg-card p-5 sm:rounded-b-3xl sm:p-6">
              <div className="flex items-center gap-3">
                <button onClick={closeDeliveryModal} disabled={submitting} className="flex-1 rounded-xl border border-border py-3 text-sm font-bold text-foreground transition-all hover:bg-muted disabled:opacity-60">
                  Hủy bỏ
                </button>
                <button onClick={() => void handleDeliver()} disabled={submitting} className="flex-[2] rounded-xl bg-primary py-3 text-sm font-black text-white shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-primary/30 disabled:pointer-events-none disabled:opacity-60">
                  {submitting ? 'Đang giao...' : 'Xác nhận giao két'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CrateDeliveryPage;



