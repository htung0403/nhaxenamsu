import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { RefreshCw, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import PageHeader from '../../components/shared/PageHeader';
import { DatePicker } from '../../components/shared/DatePicker';
import { useImportOrders, useSendVegetableArrivalNotice } from '../../hooks/queries/useImportOrders';
import { zaloSummaryApi } from '../../api/zaloSummaryApi';
import type { DeliveryOrder, DeliveryVehicle, ImportOrder, ImportOrderFilters } from '../../types';

const formatDateDMY = (dateStr?: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
};

const formatContact = (name?: string | null, phone?: string | null) => {
  if (!name) return '';
  return phone ? `${name} (${phone})` : name;
};

const statusClassMap: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  skipped: 'bg-amber-100 text-amber-700 border-amber-200',
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
};

const statusLabelMap: Record<string, string> = {
  success: 'Đã gửi',
  failed: 'Thất bại',
  skipped: 'Bỏ qua',
  pending: 'Chưa gửi',
};

const triggerLabelMap: Record<string, string> = {
  scheduler: 'Tự động',
  manual: 'Thủ công',
};

const formatDateTime = (value: string | null): string => {
  if (!value) return '-';
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '-';
  return format(time, 'dd/MM/yyyy HH:mm:ss');
};

type ImportOrderWithRelations = ImportOrder & {
  delivery_orders?: DeliveryOrder[];
  profiles?: { full_name?: string; role?: string };
};

type ArrivalNoticeTarget = {
  key: string;
  name: string;
  phone: string | null;
  orderCount: number;
  vehiclePlates: string;
  driverContacts: string;
  inChargeContacts: string;
};

type ArrivalNoticeOption = {
  rank: number;
  orderCount: number;
  vehiclePlates: string;
  driverContacts: string;
  inChargeContacts: string;
};

const isCustomerSubmittedOrder = (order: ImportOrder) => order.profiles?.role === 'customer';
const isUnconfirmedCustomerOrder = (order: ImportOrder) => isCustomerSubmittedOrder(order) && !order.admin_confirmed_at;

const getVegetableReceiverName = (order: ImportOrder) =>
  order.customers?.name || order.selected_alias || order.receiver_name || 'Chưa rõ vựa';
const getVegetableReceiverPhone = (order: ImportOrder) => order.customers?.phone || order.receiver_phone || null;

const getOrderVehicles = (order: ImportOrderWithRelations) => {
  const plates = new Set<string>();
  if (order.license_plate) plates.add(order.license_plate);
  order.delivery_orders?.forEach((deliveryOrder) => {
    deliveryOrder.delivery_vehicles?.forEach((deliveryVehicle: DeliveryVehicle) => {
      if (deliveryVehicle.vehicles?.license_plate) plates.add(deliveryVehicle.vehicles.license_plate);
    });
  });
  return plates.size > 0 ? Array.from(plates).join(', ') : '';
};

const getOrderDriverName = (order: ImportOrderWithRelations) => {
  const names = new Set<string>();
  order.delivery_orders?.forEach((deliveryOrder) => {
    deliveryOrder.delivery_vehicles?.forEach((deliveryVehicle: DeliveryVehicle) => {
      if (deliveryVehicle.profiles?.full_name) names.add(deliveryVehicle.profiles.full_name);
    });
  });
  if (names.size > 0) return Array.from(names).join(', ');
  if (order.driver_name) return order.driver_name;
  if (order.profiles?.role === 'driver') return order.profiles.full_name || '';
  return '';
};

const getOrderDriverContacts = (order: ImportOrderWithRelations) => {
  const contacts = new Set<string>();
  order.delivery_orders?.forEach((deliveryOrder) => {
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
  order.delivery_orders?.forEach((deliveryOrder) => {
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

const ZaloVegetableArrivalManagePage: React.FC = () => {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activeTaiRank, setActiveTaiRank] = useState<number | null>(null);
  const [pendingArrivalNotice, setPendingArrivalNotice] = useState<ArrivalNoticeOption | null>(null);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const filters = useMemo<ImportOrderFilters>(() => ({
    dateFrom: date,
    dateTo: date,
    order_category: 'vegetable',
    pageSize: 9999,
  }), [date]);

  const { data, isLoading, isError, refetch, isFetching } = useImportOrders(filters);
  const orders = useMemo<ImportOrderWithRelations[]>(() => data?.data || [], [data?.data]);
  const sendMutation = useSendVegetableArrivalNotice();

  const dailyTaiRankMap = useMemo(() => {
    const map = new Map<string, number>();
    const byDriver = new Map<string, ImportOrderWithRelations[]>();

    orders.forEach((order) => {
      if (isUnconfirmedCustomerOrder(order)) return;
      const driverName = getOrderDriverName(order) || order.sender_name || '_';
      const current = byDriver.get(driverName) || [];
      current.push(order);
      byDriver.set(driverName, current);
    });

    const driverFirstOrders: { driverName: string; firstOrder: ImportOrderWithRelations }[] = [];
    byDriver.forEach((driverOrders, driverName) => {
      const sorted = [...driverOrders].sort((a, b) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      });
      driverFirstOrders.push({ driverName, firstOrder: sorted[0] });
    });

    driverFirstOrders
      .sort((a, b) => {
        const timeA = new Date(a.firstOrder.created_at || 0).getTime();
        const timeB = new Date(b.firstOrder.created_at || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.firstOrder.id.localeCompare(b.firstOrder.id);
      })
      .forEach((item, idx) => {
        const driverOrders = byDriver.get(item.driverName) || [];
        driverOrders.forEach((order) => map.set(order.id, idx + 1));
      });

    return map;
  }, [orders]);

  const getTaiRank = useCallback(
    (order: ImportOrderWithRelations) => {
      if (isUnconfirmedCustomerOrder(order)) return null;
      return order.tai_rank ?? dailyTaiRankMap.get(order.id) ?? 1;
    },
    [dailyTaiRankMap],
  );

  const taiArrivalOptions = useMemo<ArrivalNoticeOption[]>(() => {
    const counts = new Map<number, number>();
    const platesByRank = new Map<number, Set<string>>();
    const driversByRank = new Map<number, Set<string>>();
    const inChargesByRank = new Map<number, Set<string>>();

    orders.forEach((order) => {
      const rank = getTaiRank(order);
      if (rank == null) return;
      counts.set(rank, (counts.get(rank) || 0) + 1);

      const vehiclePlates = getOrderVehicles(order);
      if (vehiclePlates) platesByRank.set(rank, new Set([...(platesByRank.get(rank) || []), ...vehiclePlates.split(', ')]));

      const driverContacts = getOrderDriverContacts(order);
      if (driverContacts) driversByRank.set(rank, new Set([...(driversByRank.get(rank) || []), ...driverContacts.split('; ')]));

      const inChargeContacts = getOrderInChargeContacts(order);
      if (inChargeContacts) inChargesByRank.set(rank, new Set([...(inChargesByRank.get(rank) || []), ...inChargeContacts.split('; ')]));
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
  }, [getTaiRank, orders]);

  const targetsByTaiRank = useMemo(() => {
    const byRank = new Map<number, Map<string, ArrivalNoticeTarget>>();

    orders.forEach((order) => {
      const rank = getTaiRank(order);
      if (rank == null) return;

      const phone = getVegetableReceiverPhone(order);
      const key = order.customer_id || phone || order.id;
      const rankTargets = byRank.get(rank) || new Map<string, ArrivalNoticeTarget>();
      const existing = rankTargets.get(key);

      if (existing) {
        existing.orderCount += 1;
        if (!existing.phone && phone) existing.phone = phone;
        return;
      }

      rankTargets.set(key, {
        key,
        name: getVegetableReceiverName(order),
        phone,
        orderCount: 1,
        vehiclePlates: getOrderVehicles(order),
        driverContacts: getOrderDriverContacts(order),
        inChargeContacts: getOrderInChargeContacts(order),
      });
      byRank.set(rank, rankTargets);
    });

    return byRank;
  }, [getTaiRank, orders]);

  const activeArrivalOption = useMemo(() => {
    if (taiArrivalOptions.length === 0) return null;
    return taiArrivalOptions.find((option) => option.rank === activeTaiRank) || taiArrivalOptions[0];
  }, [activeTaiRank, taiArrivalOptions]);

  const activeTargets = useMemo(() => {
    if (!activeArrivalOption) return [];
    return Array.from(targetsByTaiRank.get(activeArrivalOption.rank)?.values() || [])
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeArrivalOption, targetsByTaiRank]);

  const activeTaiRankForQuery = activeArrivalOption?.rank || 0;
  const {
    data: statusData,
    isFetching: isStatusFetching,
  } = useQuery({
    queryKey: ['zalo-vegetable-arrival-status', date, activeTaiRankForQuery],
    queryFn: () => zaloSummaryApi.getVegetableArrivalStatus(date, activeTaiRankForQuery),
    enabled: activeTaiRankForQuery > 0,
  });

  const statusByTargetId = useMemo(() => {
    const map = new Map<string, NonNullable<typeof statusData>['items'][number]>();
    statusData?.items.forEach((item) => map.set(item.targetId, item));
    return map;
  }, [statusData]);

  const activeRows = useMemo(() => activeTargets.map((target) => ({
    ...target,
    status: statusByTargetId.get(target.key)?.status || 'pending',
    lastError: statusByTargetId.get(target.key)?.lastError || null,
    messageId: statusByTargetId.get(target.key)?.messageId || null,
    lastSentAt: statusByTargetId.get(target.key)?.lastSentAt || null,
    triggeredBy: statusByTargetId.get(target.key)?.triggeredBy || null,
  })), [activeTargets, statusByTargetId]);

  const activeStats = statusData?.summary || {
    total: activeRows.length,
    sent: activeRows.filter((row) => row.status === 'success').length,
    failed: activeRows.filter((row) => row.status === 'failed').length,
    skipped: activeRows.filter((row) => row.status === 'skipped').length,
    pending: activeRows.filter((row) => row.status === 'pending').length,
  };

  const selectedRows = useMemo(
    () => activeRows.filter((row) => selectedTargetIds.includes(row.key)),
    [activeRows, selectedTargetIds],
  );

  const allVisibleSelected = activeRows.length > 0 && activeRows.every((row) => selectedTargetIds.includes(row.key));

  const bulkSendMutation = useMutation({
    mutationFn: async () => {
      if (!activeArrivalOption || selectedRows.length === 0) return null;
      return zaloSummaryApi.sendVegetableArrivalNotice({
        date,
        taiRank: activeArrivalOption.rank,
        targetIds: selectedRows.map((row) => row.key),
      });
    },
    onSuccess: (result) => {
      if (!result) return;
      toast.success(`Đã gửi ${result.sent}/${result.totalTargets} người nhận`);
      void queryClient.invalidateQueries({ queryKey: ['zalo-vegetable-arrival-status', date, activeTaiRankForQuery] });
      setSelectedTargetIds([]);
    },
    onError: () => toast.error('Gửi đã chọn thất bại'),
  });

  const arrivalNoticeTargets = useMemo(() => {
    if (!pendingArrivalNotice) return [];
    return Array.from(targetsByTaiRank.get(pendingArrivalNotice.rank)?.values() || [])
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pendingArrivalNotice, targetsByTaiRank]);

  const confirmSendVegetableArrivalNotice = async () => {
    if (!pendingArrivalNotice) return;
    await sendMutation.mutateAsync({ date, taiRank: pendingArrivalNotice.rank });
    void queryClient.invalidateQueries({ queryKey: ['zalo-vegetable-arrival-status', date, pendingArrivalNotice.rank] });
    setPendingArrivalNotice(null);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <PageHeader
        title="Báo tài rau"
        description="Gửi Zalo thông báo tài đã tới chợ cho các vựa rau theo từng tài trong ngày."
        backPath="/hang-hoa/nhap-hang-rau"
      />

      <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0 p-4 gap-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div className="space-y-1.5 w-full md:w-[260px]">
            <label className="text-[13px] font-bold text-muted-foreground">Ngày nhập</label>
            <DatePicker
              value={date}
              onChange={setDate}
              placeholder="Chọn ngày"
              className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
            />
          </div>
          <button
            onClick={() => { refetch(); void queryClient.invalidateQueries({ queryKey: ['zalo-vegetable-arrival-status', date, activeTaiRankForQuery] }); }}
            disabled={isFetching || isStatusFetching}
            className="h-[42px] px-4 rounded-xl border border-border bg-background text-[13px] font-bold hover:bg-muted/40 disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            <RefreshCw size={15} className={isFetching || isStatusFetching ? 'animate-spin' : ''} />
            {isFetching || isStatusFetching ? 'Đang tải...' : 'Tải lại'}
          </button>
        </div>

        {isLoading ? (
          <LoadingSkeleton rows={5} />
        ) : isError ? (
          <ErrorState message="Không tải được danh sách tài báo Zalo" onRetry={() => refetch()} />
        ) : taiArrivalOptions.length === 0 ? (
          <EmptyState title="Chưa có tài để báo" description={`Không có đơn nhập rau cần báo tài ngày ${formatDateDMY(date)}.`} />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {taiArrivalOptions.map((option) => {
                const isActive = activeArrivalOption?.rank === option.rank;
                return (
                  <button
                    key={option.rank}
                    onClick={() => { setActiveTaiRank(option.rank); setSelectedTargetIds([]); }}
                    className={`h-10 px-4 rounded-xl border text-[13px] font-bold whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-background text-muted-foreground border-border hover:bg-muted/40'
                    }`}
                  >
                    Tài {option.rank}
                    <span className={`ml-2 text-[11px] ${isActive ? 'text-white/80' : 'text-muted-foreground'}`}>
                      {option.orderCount} đơn
                    </span>
                  </button>
                );
              })}
            </div>

            {activeArrivalOption && (
              <div className="rounded-2xl border border-border bg-background overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-black text-foreground">Tài {activeArrivalOption.rank}</h3>
                      <span className="px-2 py-1 rounded-full bg-muted text-[12px] font-bold text-muted-foreground">
                        {activeRows.length} người nhận
                      </span>
                      <span className="px-2 py-1 rounded-full bg-primary/10 text-[12px] font-bold text-primary">
                        {activeArrivalOption.orderCount} đơn
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-muted-foreground truncate">
                      {activeArrivalOption.vehiclePlates || 'Chưa có biển số xe'}
                      {activeArrivalOption.driverContacts ? ` • ${activeArrivalOption.driverContacts}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => setPendingArrivalNotice(activeArrivalOption)}
                    disabled={sendMutation.isPending}
                    className="h-9 px-4 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                  >
                    <Send size={15} />
                    Gửi Zalo tài này
                  </button>
                </div>

                <div className="px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-[13px] text-muted-foreground">
                  <span>Đã chọn <strong>{selectedTargetIds.length}</strong> người nhận trong tài này.</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedTargetIds([])}
                      disabled={selectedTargetIds.length === 0 || bulkSendMutation.isPending}
                      className="h-9 px-3 rounded-lg border border-border bg-background font-semibold hover:bg-muted/40 disabled:opacity-50"
                    >
                      Bỏ chọn
                    </button>
                    <button
                      onClick={() => bulkSendMutation.mutate()}
                      disabled={selectedRows.length === 0 || bulkSendMutation.isPending}
                      className="h-9 px-4 rounded-lg bg-primary text-white font-bold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      <Send size={15} />
                      {bulkSendMutation.isPending ? 'Đang gửi' : 'Gửi đã chọn'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 px-4 pb-3">
                  <div className="rounded-xl border border-border/60 bg-card p-3"><div className="text-[11px] text-muted-foreground uppercase tracking-wide">Tổng khách</div><div className="text-2xl font-black text-foreground">{activeStats.total}</div></div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="text-[11px] text-muted-foreground uppercase tracking-wide">Đã gửi</div><div className="text-2xl font-black text-foreground">{activeStats.sent}</div></div>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3"><div className="text-[11px] text-muted-foreground uppercase tracking-wide">Thất bại</div><div className="text-2xl font-black text-foreground">{activeStats.failed}</div></div>
                  <div className="rounded-xl border border-border/60 bg-card p-3"><div className="text-[11px] text-muted-foreground uppercase tracking-wide">Bỏ qua</div><div className="text-2xl font-black text-foreground">{activeStats.skipped}</div></div>
                  <div className="rounded-xl border border-border/60 bg-card p-3"><div className="text-[11px] text-muted-foreground uppercase tracking-wide">Chưa gửi</div><div className="text-2xl font-black text-foreground">{activeStats.pending}</div></div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-3 text-center w-12">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={(event) => {
                              setSelectedTargetIds(event.target.checked ? activeRows.map((row) => row.key) : []);
                            }}
                          />
                        </th>
                        <th className="px-3 py-3 text-center w-14">#</th>
                        <th className="px-3 py-3 text-left min-w-[220px]">Người nhận</th>
                        <th className="px-3 py-3 text-left min-w-[130px]">SĐT</th>
                        <th className="px-3 py-3 text-right w-24">Số đơn</th>
                        <th className="px-3 py-3 text-left min-w-[150px]">Biển số</th>
                        <th className="px-3 py-3 text-left min-w-[220px]">Tài xế</th>
                        <th className="px-3 py-3 text-left min-w-[220px]">Phụ trách xe</th>
                        <th className="px-3 py-3 text-center w-28">Trạng thái</th>
                        <th className="px-3 py-3 text-left min-w-[170px]">Lần gửi gần nhất</th>
                        <th className="px-3 py-3 text-left min-w-[220px]">Lỗi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {activeRows.map((target, index) => (
                        <tr key={target.key} className="hover:bg-muted/20">
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedTargetIds.includes(target.key)}
                              onChange={(event) => {
                                setSelectedTargetIds((current) =>
                                  event.target.checked
                                    ? Array.from(new Set([...current, target.key]))
                                    : current.filter((id) => id !== target.key),
                                );
                              }}
                            />
                          </td>
                          <td className="px-3 py-3 text-center text-muted-foreground tabular-nums">{index + 1}</td>
                          <td className="px-3 py-3 font-bold text-foreground">{target.name}</td>
                          <td className={target.phone ? 'px-3 py-3 text-foreground' : 'px-3 py-3 text-red-500 font-semibold'}>
                            {target.phone || 'Thiếu SĐT'}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{target.orderCount}</td>
                          <td className="px-3 py-3 text-muted-foreground">{target.vehiclePlates || '-'}</td>
                          <td className="px-3 py-3 text-muted-foreground">{target.driverContacts || '-'}</td>
                          <td className="px-3 py-3 text-muted-foreground">{target.inChargeContacts || '-'}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex px-2 py-1 rounded-full border text-xs font-semibold ${statusClassMap[target.status]}`}>
                              {statusLabelMap[target.status]}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            <div>{formatDateTime(target.lastSentAt)}</div>
                            <div>{target.triggeredBy ? triggerLabelMap[target.triggeredBy] : '-'}</div>
                          </td>
                          <td className="px-3 py-3 text-xs text-red-600 max-w-[260px] break-words">{target.lastError || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!pendingArrivalNotice}
        title={`Gửi Zalo Tài ${pendingArrivalNotice?.rank || ''}`}
        message={
          <div className="space-y-3 text-left">
            <p>
              Tin nhắn sẽ gửi cho {arrivalNoticeTargets.length} vựa nhận rau ngày {formatDateDMY(date)}.
            </p>
            {pendingArrivalNotice?.vehiclePlates && (
              <p className="text-[13px] text-muted-foreground">Biển số xe: {pendingArrivalNotice.vehiclePlates}</p>
            )}
            {(pendingArrivalNotice?.driverContacts || pendingArrivalNotice?.inChargeContacts) && (
              <p className="text-[13px] text-muted-foreground">
                {pendingArrivalNotice?.driverContacts && (
                  <span className="block"><strong>Tài xế:</strong> {pendingArrivalNotice.driverContacts}</span>
                )}
                {pendingArrivalNotice?.inChargeContacts && (
                  <span className="block"><strong>Phụ trách xe:</strong> {pendingArrivalNotice.inChargeContacts}</span>
                )}
              </p>
            )}
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/20 divide-y divide-border/60">
              {arrivalNoticeTargets.map((target) => (
                <div key={target.key} className="p-2 text-[13px] flex justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground">{target.name}</div>
                    <div className="text-muted-foreground">{target.orderCount} đơn</div>
                  </div>
                  <div className={target.phone ? 'text-foreground' : 'text-red-500'}>{target.phone || 'Thiếu SĐT'}</div>
                </div>
              ))}
            </div>
            {arrivalNoticeTargets.some((target) => !target.phone) && (
              <p className="text-[12px] text-amber-600">Các vựa thiếu số điện thoại sẽ bị bỏ qua.</p>
            )}
          </div>
        }
        confirmLabel="Gửi Zalo"
        cancelLabel="Để sau"
        variant="primary"
        isLoading={sendMutation.isPending}
        onConfirm={confirmSendVegetableArrivalNotice}
        onCancel={() => setPendingArrivalNotice(null)}
      />
    </div>
  );
};

export default ZaloVegetableArrivalManagePage;





