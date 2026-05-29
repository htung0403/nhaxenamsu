import type { DeliveryOrder, DeliveryVehicle, ImportOrder } from '../types';
import { removeAccents } from '../lib/str-utils';

export type VegetableTaiRankOrder = ImportOrder & {
  delivery_orders?: Array<DeliveryOrder & { delivery_vehicles?: DeliveryVehicle[] }>;
  profiles?: { full_name?: string; role?: string };
};

const normalizeRoleText = (value?: string | null) =>
  removeAccents(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizePersonName = (value?: string | null) =>
  removeAccents(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isVegetableOrderSubmittedByUnconfirmedCustomer = (order: VegetableTaiRankOrder) =>
  normalizeRoleText(order.profiles?.role) === 'customer' && !order.admin_confirmed_at;

export const resolveVegetableOrderDriverKey = (order: VegetableTaiRankOrder): string => {
  const driverNames = new Set<string>();

  order.delivery_orders?.forEach((deliveryOrder) => {
    deliveryOrder.delivery_vehicles?.forEach((deliveryVehicle) => {
      const fullName = normalizePersonName(deliveryVehicle.profiles?.full_name);
      if (fullName) driverNames.add(fullName);
    });
  });

  if (driverNames.size > 0) {
    return `dn:${Array.from(driverNames).sort().join('|')}`;
  }

  const driverName = normalizePersonName(order.driver_name);
  if (driverName) return `dn:${driverName}`;

  const driverId = order.delivery_orders?.[0]?.delivery_vehicles?.[0]?.driver_id;
  if (driverId) return `dvid:${driverId}`;
  if (order.received_by) return `rb:${order.received_by}`;
  return 'unknown';
};

export const buildVegetableDailyTaiRankMap = (orders: VegetableTaiRankOrder[]): Map<string, number> => {
  const rankByOrderId = new Map<string, number>();
  const ordersByDate = new Map<string, VegetableTaiRankOrder[]>();

  orders.forEach((order) => {
    if (isVegetableOrderSubmittedByUnconfirmedCustomer(order)) return;
    const orderDate = order.order_date || '';
    const current = ordersByDate.get(orderDate) || [];
    current.push(order);
    ordersByDate.set(orderDate, current);
  });

  ordersByDate.forEach((ordersOnDate) => {
    const sortedOrders = [...ordersOnDate].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

    const rankByDriverKey = new Map<string, number>();
    let nextRank = 1;

    sortedOrders.forEach((order) => {
      const driverKey = resolveVegetableOrderDriverKey(order);
      if (!rankByDriverKey.has(driverKey)) {
        rankByDriverKey.set(driverKey, nextRank);
        nextRank += 1;
      }
      rankByOrderId.set(order.id, rankByDriverKey.get(driverKey) || 0);
    });
  });

  return rankByOrderId;
};

export const getVegetableTaiRank = (
  order: VegetableTaiRankOrder,
  dailyTaiRankMap: Map<string, number>,
): number | null => {
  if (isVegetableOrderSubmittedByUnconfirmedCustomer(order)) return null;
  return dailyTaiRankMap.get(order.id) ?? order.tai_rank ?? 1;
};
