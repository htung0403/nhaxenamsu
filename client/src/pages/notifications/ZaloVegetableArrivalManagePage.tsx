import React, { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { RefreshCw, Send } from 'lucide-react';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import PageHeader from '../../components/shared/PageHeader';
import { DatePicker } from '../../components/shared/DatePicker';
import { useImportOrders, useSendVegetableArrivalNotice } from '../../hooks/queries/useImportOrders';
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
      const key = phone || order.customer_id || order.id;
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

  const arrivalNoticeTargets = useMemo(() => {
    if (!pendingArrivalNotice) return [];
    return Array.from(targetsByTaiRank.get(pendingArrivalNotice.rank)?.values() || [])
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pendingArrivalNotice, targetsByTaiRank]);

  const confirmSendVegetableArrivalNotice = async () => {
    if (!pendingArrivalNotice) return;
    await sendMutation.mutateAsync({ date, taiRank: pendingArrivalNotice.rank });
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
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-[42px] px-4 rounded-xl border border-border bg-background text-[13px] font-bold hover:bg-muted/40 disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
            {isFetching ? 'Đang tải...' : 'Tải lại'}
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
                    onClick={() => setActiveTaiRank(option.rank)}
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
                        {activeTargets.length} người nhận
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

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-3 text-center w-14">#</th>
                        <th className="px-3 py-3 text-left min-w-[220px]">Người nhận</th>
                        <th className="px-3 py-3 text-left min-w-[130px]">SĐT</th>
                        <th className="px-3 py-3 text-right w-24">Số đơn</th>
                        <th className="px-3 py-3 text-left min-w-[150px]">Biển số</th>
                        <th className="px-3 py-3 text-left min-w-[220px]">Tài xế</th>
                        <th className="px-3 py-3 text-left min-w-[220px]">Phụ trách xe</th>
                        <th className="px-3 py-3 text-center w-28">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {activeTargets.map((target, index) => (
                        <tr key={target.key} className="hover:bg-muted/20">
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
                            <span className="inline-flex px-2 py-1 rounded-full border border-slate-200 bg-slate-100 text-slate-700 text-xs font-semibold">
                              Chưa gửi
                            </span>
                          </td>
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



