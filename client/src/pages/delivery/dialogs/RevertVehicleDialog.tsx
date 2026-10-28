import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw, Truck, AlertTriangle, Loader2, Calendar } from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { useRevertVehicle } from '../../../hooks/queries/useDelivery';
import type { DeliveryOrder } from '../../../types';
import { getDeliveryVehicleAllocationKey, groupDeliveryVehicleAllocations } from '../../../lib/deliveryVehicleAllocations';

interface Props {
  isOpen: boolean;
  isClosing?: boolean;
  order: DeliveryOrder | null;
  isAdmin: boolean;
  myVehicleIds: string[];
  onClose: () => void;
}

const RevertVehicleDialog: React.FC<Props> = ({
  isOpen,
  isClosing,
  order,
  isAdmin,
  myVehicleIds,
  onClose,
}) => {
  const revertMutation = useRevertVehicle();
  const [selectedTripIds, setSelectedTripIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [revertedTripIds, setRevertedTripIds] = useState<Set<string>>(new Set());

  const orderId = order?.id || '';

  const revertableTrips = useMemo(() => {
    const candidates = (order?.delivery_vehicles || []).filter(dv =>
      dv.id && (dv.assigned_quantity || 0) > 0 && !revertedTripIds.has(dv.id)
      && (isAdmin || (dv.vehicle_id && myVehicleIds.includes(dv.vehicle_id)))
    );
    const members = new Map<string, Array<{ id: string; delivery_order_id: string }>>();
    candidates.forEach(dv => {
      const key = getDeliveryVehicleAllocationKey(dv);
      const rows = members.get(key) || [];
      rows.push({ id: dv.id, delivery_order_id: dv.delivery_order_id || orderId });
      members.set(key, rows);
    });
    return groupDeliveryVehicleAllocations(candidates).map(dv => ({
      ...dv,
      members: members.get(getDeliveryVehicleAllocationKey(dv)) || [],
    }));
  }, [order, orderId, isAdmin, myVehicleIds, revertedTripIds]);

  useEffect(() => {
    setSelectedTripIds(new Set());
    setRevertedTripIds(new Set());
  }, [orderId, isOpen]);

  const selectedTrips = useMemo(
    () => revertableTrips.filter((trip) => selectedTripIds.has(trip.id)),
    [revertableTrips, selectedTripIds]
  );

  const toggleTripSelection = (tripId: string, vehicleId?: string) => {
    setSelectedTripIds((prev) => {
      const next = new Set(prev);
      if (next.has(tripId)) {
        next.delete(tripId);
        return next;
      }

      const selectedVehicleIds = Array.from(next)
        .map((id) => revertableTrips.find((trip) => trip.id === id)?.vehicle_id)
        .filter((id): id is string => Boolean(id));

      if (vehicleId && selectedVehicleIds.length > 0 && selectedVehicleIds.some((id) => id !== vehicleId)) {
        return new Set([tripId]);
      }

      next.add(tripId);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selectedTrips.length === 0) return;

    const vehicleIds = Array.from(new Set(selectedTrips.map((trip) => trip.vehicle_id).filter(Boolean)));
    if (vehicleIds.length !== 1) return;
    const tripsByOrder = new Map<string, Set<string>>();
    selectedTrips.forEach(trip => trip.members.forEach(member => {
      const ids = tripsByOrder.get(member.delivery_order_id) || new Set<string>();
      ids.add(member.id);
      tripsByOrder.set(member.delivery_order_id, ids);
    }));

    setConfirming(true);
    try {
      for (const [id, ids] of tripsByOrder) {
        const tripIds = [...ids];
        await revertMutation.mutateAsync({ id, vehicleId: vehicleIds[0], tripIds });
        setRevertedTripIds(previous => new Set([...previous, ...tripIds]));
      }
      onClose();
    } catch {
      setSelectedTripIds(new Set());
    } finally {
      setConfirming(false);
    }
  };

  const formatNumber = (val?: number) => {
    if (val == null) return '0';
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val);
  };

  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy');
    } catch {
      return dateStr;
    }
  };

  if (!isOpen && !isClosing) return null;
  if (!order) return null;

  return createPortal(
    <div
      className={clsx(
        'fixed inset-0 z-[1000] flex items-center justify-center p-4',
        isClosing ? 'animate-out fade-out duration-200' : 'animate-in fade-in duration-200'
      )}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx(
          'relative bg-card rounded-2xl shadow-xl border border-border w-full max-w-md flex flex-col gap-0 overflow-hidden',
          isClosing ? 'animate-out zoom-out-95 duration-200' : 'animate-in zoom-in-95 duration-200'
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600">
              <RotateCcw size={16} strokeWidth={2.5} />
            </div>
            <span className="text-[15px] font-bold text-foreground">Hoàn tác giao hàng</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[13px] text-amber-700 dark:text-amber-500 font-medium leading-relaxed">
              Hoàn tác sẽ xóa chuyến được chọn khỏi đơn hàng này, xóa phiếu thu nháp tương ứng và cập nhật phiếu xuất.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Đơn hàng</span>
            <span className="text-[14px] font-bold text-foreground">{order.product_name}</span>
            <span className="text-[12px] text-muted-foreground">Tổng SL: {formatNumber(order.total_quantity)}</span>
          </div>

          {revertableTrips.length === 0 ? (
            <p className="text-[13px] text-muted-foreground text-center py-2">
              Không có chuyến nào bạn có thể hoàn tác.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Chọn lần phân xe muốn hoàn tác</span>
              {revertableTrips.map((dv) => {
                const checked = selectedTripIds.has(dv.id);
                return (
                  <button
                    key={dv.id}
                    onClick={() => toggleTripSelection(dv.id, dv.vehicle_id)}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left',
                      checked
                        ? 'border-amber-500/50 bg-amber-500/10'
                        : 'border-border bg-muted/20 hover:bg-muted/40'
                    )}
                  >
                    <div className={clsx(
                      'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0',
                      checked ? 'border-amber-500 bg-amber-500' : 'border-border'
                    )}>
                      {checked && <div className="w-1.5 h-1.5 rounded-sm bg-white" />}
                    </div>
                    <Truck size={14} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-foreground">
                        {dv.vehicles?.license_plate || 'N/A'}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>SL: {formatNumber(dv.assigned_quantity)}</span>
                        {dv.delivery_date && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Calendar size={10} />
                              {formatDisplayDate(dv.delivery_date)}
                            </span>
                          </>
                        )}
                        {dv.delivery_time && (
                          <>
                            <span>·</span>
                            <span>{(dv.delivery_time || '').slice(0, 5)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border text-[13px] font-bold text-muted-foreground hover:bg-muted transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleConfirm}
            disabled={
              revertMutation.isPending ||
              confirming ||
              revertableTrips.length === 0 ||
              selectedTrips.length === 0
            }
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-[13px] font-bold hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(revertMutation.isPending || confirming) ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RotateCcw size={14} strokeWidth={2.5} />
            )}
            Hoàn tác
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RevertVehicleDialog;
