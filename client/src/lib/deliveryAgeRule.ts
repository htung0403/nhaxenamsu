import type { DeliveryOrder, DeliveryStatus } from '../types';

export const getDeliveryRemainingQty = (order: DeliveryOrder): number => {
  const totalAssigned = (order.delivery_vehicles || []).reduce(
    (sum, dv) => sum + (dv.assigned_quantity || 0),
    0
  );
  return order.total_quantity - totalAssigned;
};

/** Trạng thái hiển thị/lọc: chỉ còn hàng chưa phân hết mới là Cần giao. */
export const getEffectiveDeliveryStatus = (order: DeliveryOrder, remainingQty?: number): DeliveryStatus => {
  if (order.status === 'hang_o_sg') return 'hang_o_sg';
  const remaining = remainingQty ?? getDeliveryRemainingQty(order);
  if (remaining > 0) return 'can_giao';
  return 'da_giao';
};

export const isOldOrderForAgeRule = (order: DeliveryOrder, anchorDate: string): boolean => {
  const effectiveStatus = getEffectiveDeliveryStatus(order);
  if (effectiveStatus === 'hang_o_sg') return false;
  
  if (order.confirmed_at) {
    const confirmedAt = new Date(order.confirmed_at).getTime();
    const now = Date.now();
    return (now - confirmedAt) > 24 * 60 * 60 * 1000;
  }
  
  const refDate = order.delivery_date;
  return Boolean(refDate && refDate < anchorDate);
};
