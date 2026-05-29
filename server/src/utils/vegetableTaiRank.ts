import { normalizePersonName } from './goodsScope';

export type VegetableTaiRankOrder = Record<string, any> & { tai_rank?: number };

export function resolveVegetableOrderDriverKey(order: VegetableTaiRankOrder): string {
  const driverNames = new Set<string>();

  if (Array.isArray(order.delivery_orders)) {
    order.delivery_orders.forEach((deliveryOrder: any) => {
      if (!Array.isArray(deliveryOrder?.delivery_vehicles)) return;
      deliveryOrder.delivery_vehicles.forEach((deliveryVehicle: any) => {
        const fullName = deliveryVehicle?.profiles?.full_name;
        if (fullName) driverNames.add(normalizePersonName(fullName));
      });
    });
  }

  if (driverNames.size > 0) {
    return `dn:${Array.from(driverNames).sort().join('|')}`;
  }
  if (order.driver_name) return `dn:${normalizePersonName(order.driver_name)}`;

  const driverId = order.delivery_orders?.[0]?.delivery_vehicles?.[0]?.driver_id;
  if (driverId) return `dvid:${driverId}`;
  if (order.received_by) return `rb:${order.received_by}`;
  return 'unknown';
}

export function isUnconfirmedVegetableCustomerOrder(order: VegetableTaiRankOrder): boolean {
  return order.profiles?.role === 'customer' && !order.admin_confirmed_at;
}

export function buildVegetableDailyDriverRankMap(orders: VegetableTaiRankOrder[]): Map<string, number> {
  const sortedOrders = orders
    .filter((order) => !isUnconfirmedVegetableCustomerOrder(order))
    .sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id).localeCompare(String(b.id));
    });

  const dailyDriverRankMap = new Map<string, number>();
  let rankCounter = 1;

  sortedOrders.forEach((order) => {
    const driverKey = resolveVegetableOrderDriverKey(order);
    if (!dailyDriverRankMap.has(driverKey)) {
      dailyDriverRankMap.set(driverKey, rankCounter++);
    }
  });

  return dailyDriverRankMap;
}

export function getVegetableTaiRank(
  order: VegetableTaiRankOrder,
  dailyDriverRankMap: Map<string, number>,
): number {
  return dailyDriverRankMap.get(resolveVegetableOrderDriverKey(order)) || 0;
}

export function assignVegetableTaiRanksByDate<T extends VegetableTaiRankOrder>(orders: T[]): T[] {
  const ordersByDate = new Map<string, T[]>();

  orders.forEach((order) => {
    const orderDate = order.order_date || '';
    const current = ordersByDate.get(orderDate) || [];
    current.push(order);
    ordersByDate.set(orderDate, current);
  });

  ordersByDate.forEach((ordersOnDate) => {
    const rankMap = buildVegetableDailyDriverRankMap(ordersOnDate);
    ordersOnDate.forEach((order) => {
      if (isUnconfirmedVegetableCustomerOrder(order)) return;
      order.tai_rank = getVegetableTaiRank(order, rankMap);
    });
  });

  return orders;
}
