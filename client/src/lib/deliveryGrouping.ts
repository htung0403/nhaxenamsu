import type { DeliveryOrder } from '../types';

type GroupDeliveryOrdersOptions = {
  includeWarehouseConfirmation?: boolean;
};

const pickRelation = <T,>(relation: T | T[] | null | undefined): T | undefined => {
  if (Array.isArray(relation)) return relation[0];
  return relation || undefined;
};

export const getReceiverDisplayName = (order: DeliveryOrder) => {
  const orderObj = pickRelation(order.import_orders) || pickRelation(order.vegetable_orders);
  if (!orderObj) return '-';

  if (order.status === 'hang_o_sg' && orderObj.selected_alias) {
    return orderObj.selected_alias;
  }

  return orderObj.customers?.name || orderObj.receiver_name?.trim() || orderObj.profiles?.full_name || '-';
};

export const getDeliveryGroupKey = (order: DeliveryOrder) => {
  const deliveryDate = order.delivery_date || 'N/A';
  const category = order.order_category || 'standard';
  const receiver = getReceiverDisplayName(order);
  const product = (order.product_name || '').trim();
  return `${deliveryDate}|${category}|${receiver}|${product}`;
};

export const getDeliveryViewGroupKey = (order: DeliveryOrder) =>
  order.status === 'hang_o_sg' ? `single:${order.id}` : getDeliveryGroupKey(order);

export const groupDeliveryOrderBuckets = (orders: DeliveryOrder[]) => {
  const grouped = new Map<string, DeliveryOrder[]>();

  orders.forEach((order) => {
    const key = getDeliveryViewGroupKey(order);
    const list = grouped.get(key) || [];
    list.push(order);
    grouped.set(key, list);
  });

  return grouped;
};

export const mergeDeliveryOrderGroup = (
  group: DeliveryOrder[],
  options: GroupDeliveryOrdersOptions = {}
) => {
  const ordered = [...group].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const first = ordered[0];
  const totalQuantity = ordered.reduce((sum, order) => sum + (Number(order.total_quantity) || 0), 0);
  const mergedDeliveryVehicles = ordered.flatMap((order) => order.delivery_vehicles || []);
  const mergedPaymentCollections = ordered.flatMap((order) => order.payment_collections || []);
  const sourceIds = ordered.map((order) => order.id);
  const allHangOsg = ordered.every((order) => order.status === 'hang_o_sg');
  const hasDaGiao = ordered.some((order) => order.status === 'da_giao');

  const mergedOrder: DeliveryOrder = {
    ...first,
    total_quantity: totalQuantity,
    delivery_vehicles: mergedDeliveryVehicles,
    payment_collections: mergedPaymentCollections,
    source_order_ids: sourceIds,
    source_orders: ordered,
    status: allHangOsg ? 'hang_o_sg' : (hasDaGiao ? 'da_giao' : 'can_giao'),
  };

  if (options.includeWarehouseConfirmation) {
    const allWarehouseConfirmed = ordered.every((order) => Boolean(order.warehouse_confirmed_at));
    mergedOrder.warehouse_confirmed_at = allWarehouseConfirmed ? first.warehouse_confirmed_at : null;
  }

  return mergedOrder;
};

export const groupDeliveryOrdersForView = (
  orders: DeliveryOrder[],
  options?: GroupDeliveryOrdersOptions
) => Array.from(groupDeliveryOrderBuckets(orders).values()).map((group) => mergeDeliveryOrderGroup(group, options));

export const createDeliveryGroupSourceIdsMap = (orders: DeliveryOrder[]) => {
  const map = new Map<string, string[]>();
  orders.forEach((order) => {
    map.set(order.id, order.source_order_ids && order.source_order_ids.length > 0 ? order.source_order_ids : [order.id]);
  });
  return map;
};
