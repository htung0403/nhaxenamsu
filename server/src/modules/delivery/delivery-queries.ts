import { supabaseService } from '../../config/supabase';
import { measureOrderRead } from '../../utils/orderReadMetrics';
import type { UserPayload } from '../../types';
import { groceryDirection, sourceMatchesDirections, type GroceryDirection } from '../../utils/groceryDirection';
import {
  deliveryOrderRowMatchesGoodsScope,
  fetchDriverScopeForUser,
  goodsScopeFullAccess,
  goodsScopeIsDriverRole,
  goodsScopeIsStaffRole,
  importOrderRowMatchesGoodsScope,
  type DriverScope,
} from '../../utils/goodsScope';

function deliverySelect(orderCategory?: string, compact = false): string {
  if (compact) {
    const source = 'deleted_at, received_by, license_plate, driver_name, is_return_to_sg, admin_confirmed_at, receiver_name, selected_alias, total_amount, payment_status, profiles:profiles!received_by(full_name, role)';
    const relations = ['id, status, delivery_date, created_at, order_category, product_name, import_order_id, vegetable_order_id'];
    if (orderCategory !== 'vegetable') relations.push(`import_orders(${source}, customers:customers!import_orders_customer_id_fkey(name))`);
    if (orderCategory !== 'standard') relations.push(`vegetable_orders(${source.replace('is_return_to_sg, ', '')}, customers:customers!vegetable_orders_customer_id_fkey(name))`);
    relations.push('delivery_vehicles(driver_id, vehicle_id, profiles:profiles!delivery_vehicles_driver_id_fkey(full_name), vehicles(license_plate))');
    return relations.join(', ');
  }
  const relations = ['*'];
  if (orderCategory !== 'vegetable') relations.push('import_orders(order_code, order_date, order_time, created_at, sender_name, sender_id, receiver_name, receiver_phone, customer_id, selected_alias, is_return_to_sg, license_plate, driver_name, received_by, admin_confirmed_at, customers:customers!import_orders_customer_id_fkey(name, phone), sender_customers:customers!import_orders_sender_id_fkey(name, phone), total_amount, payment_status, profiles:profiles!received_by(full_name, role), receipt_image_url, receipt_image_urls, import_order_items(id, image_url, image_urls, products(name)), deleted_at)');
  if (orderCategory !== 'standard') relations.push('vegetable_orders(order_code, order_date, order_time, created_at, sender_name, sender_id, receiver_name, receiver_phone, customer_id, selected_alias, license_plate, driver_name, received_by, customers:customers!vegetable_orders_customer_id_fkey(name, phone), sender_customers:customers!vegetable_orders_sender_id_fkey(name, phone), total_amount, payment_status, profiles:profiles!received_by(full_name), receipt_image_url, receipt_image_urls, vegetable_order_items(id, image_url, image_urls, products(name)), deleted_at)');
  relations.push('delivery_vehicles(*, profiles:profiles!delivery_vehicles_driver_id_fkey(full_name, phone), vehicles(license_plate, in_charge_id)), payment_collections(id, status, vehicle_id, delivery_vehicle_id, expected_amount, collected_amount, image_url)');
  return relations.join(', ');
}

function deliverySourceIsSoftDeleted(row: any): boolean {
  const io = row?.import_orders;
  const vo = row?.vegetable_orders;
  const ioDel = Array.isArray(io) ? io[0]?.deleted_at : io?.deleted_at;
  const voDel = Array.isArray(vo) ? vo[0]?.deleted_at : vo?.deleted_at;
  return Boolean(ioDel || voDel);
}

function pickDeliveryRelation(relation: any): any {
  if (Array.isArray(relation)) return relation[0];
  return relation || undefined;
}

function getDeliveryReceiverForGroup(row: any): string {
  const src = pickDeliveryRelation(row?.import_orders) || pickDeliveryRelation(row?.vegetable_orders);
  if (!src) return '-';
  if (src.is_return_to_sg) return src.receiver_name?.trim() || '-';
  if (row?.status === 'hang_o_sg' && src.selected_alias) return src.selected_alias;
  return src.customers?.name || src.receiver_name?.trim() || src.profiles?.full_name || '-';
}

function getDeliveryScopeGroupKey(row: any): string {
  if (row?.status === 'hang_o_sg') return `single:${row?.id}`;
  const src = pickDeliveryRelation(row?.import_orders) || pickDeliveryRelation(row?.vegetable_orders);
  if (Number(src?.total_amount) > 0 && src?.payment_status !== 'paid') return `single:${row?.id}`;
  const deliveryDate = row?.delivery_date || 'N/A';
  const category = row?.order_category || 'standard';
  const receiver = getDeliveryReceiverForGroup(row);
  const product = (row?.product_name || '').trim();
  return `${deliveryDate}|${category}|${src ? groceryDirection(src) : 'unknown'}|${receiver}|${product}`;
}

function eligibleDeliveryRows(rows: any[], actor?: UserPayload, driverScope: DriverScope | null = null, directions?: readonly GroceryDirection[]) {
  let data = rows.filter(row => !deliverySourceIsSoftDeleted(row) && (row.vegetable_order_id || sourceMatchesDirections(row.import_orders, directions)));
  data = data.filter(row => {
    if ((row.order_category || 'standard') !== 'standard') return true;
    const source = pickDeliveryRelation(row.import_orders);
    if (source?.is_return_to_sg || source?.profiles?.role !== 'customer') return true;
    return Boolean(source.admin_confirmed_at);
  });
  if (actor && !goodsScopeFullAccess(actor.role) && (goodsScopeIsStaffRole(actor.role) || goodsScopeIsDriverRole(actor.role))) {
    const keys = new Set(data.filter(row => deliveryOrderRowMatchesGoodsScope(row, actor, driverScope)).map(getDeliveryScopeGroupKey));
    data = data.filter(row => keys.has(getDeliveryScopeGroupKey(row)));
  }
  return data;
}

export async function listDeliveryOrders(startDate?: string, endDate?: string, orderCategory?: string, actor?: UserPayload, directions?: readonly GroceryDirection[], includeExportPaymentStatus = true) {
  let driverScope: DriverScope | null = null;
  if (actor && goodsScopeIsDriverRole(actor.role) && !goodsScopeFullAccess(actor.role)) {
    driverScope = await fetchDriverScopeForUser(actor.id);
  }

  const compact = Boolean((actor && !goodsScopeFullAccess(actor.role) && (goodsScopeIsStaffRole(actor.role) || goodsScopeIsDriverRole(actor.role))) || (orderCategory !== 'vegetable' && directions && directions.length < 2));
  const selectClause = deliverySelect(orderCategory, compact);

  const pageSize = 1000;
  const rawData: any[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabaseService
      .from('delivery_orders')
      .select(selectClause)
      .order('delivery_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);

    if (orderCategory) query = query.eq('order_category', orderCategory);

    if (startDate) {
      const startT = `${startDate}T00:00:00.000Z`;
      const endDateStr = endDate || startDate;
      const endT = `${endDateStr}T23:59:59.999Z`;

      // Filter by (confirmed_at in range) OR (created_at in range)
      // Note: and() nested in or() is supported in modern PostgREST
      query = query.or(`and(confirmed_at.gte.${startT},confirmed_at.lte.${endT}),and(created_at.gte.${startT},created_at.lte.${endT})`);
    } else {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      query = query.gte('created_at', sevenDaysAgo.toISOString());
    }

    const { data: pageData, error } = await measureOrderRead(query, 'delivery');
    if (error) throw error;

    rawData.push(...(pageData || []));
    if (!pageData || pageData.length < pageSize) break;
  }

  let data = eligibleDeliveryRows(rawData, actor, driverScope, directions);

  if (compact && data.length) {
    const hydrated = new Map<string, any>();
    for (let from = 0; from < data.length; from += 400) {
      const batches = await Promise.all(Array.from({ length: Math.ceil(Math.min(400, data.length - from) / 100) }, async (_, index) => {
        const ids = data.slice(from + index * 100, from + (index + 1) * 100).map(row => row.id);
        const { data: rows, error } = await measureOrderRead(supabaseService.from('delivery_orders').select(deliverySelect(orderCategory)).in('id', ids).range(0, 99), 'hydrate');
        if (error) throw error;
        return rows || [];
      }));
      batches.flat().forEach((row: any) => hydrated.set(row.id, row));
    }
    data = eligibleDeliveryRows(data.flatMap(row => hydrated.has(row.id) ? [hydrated.get(row.id)] : []), actor, driverScope, directions);
  }

  if (data.length === 0) return data;

  const deliveryIds = data.map((row: any) => row.id).filter(Boolean);
  if (deliveryIds.length === 0) return data;

  const chunkSize = 100;
  let exportOrders: any[] = [];
  if (includeExportPaymentStatus) {
    for (let i = 0; i < deliveryIds.length; i += chunkSize * 4) {
      const batches = await Promise.all(Array.from({ length: Math.ceil(Math.min(chunkSize * 4, deliveryIds.length - i) / chunkSize) }, async (_, index) => {
        const chunk = deliveryIds.slice(i + index * chunkSize, i + (index + 1) * chunkSize);
        const { data: chunkData, error: exportOrdersError } = await measureOrderRead(supabaseService
          .from('export_orders')
          .select('product_id, payment_status, created_at')
          .in('product_id', chunk)
          .order('created_at', { ascending: false }), 'payments');

        if (exportOrdersError) throw exportOrdersError;
        return chunkData || [];
      }));
      exportOrders = exportOrders.concat(...batches);
    }
  }

  const paymentStatusByDeliveryId = new Map<string, 'unpaid' | 'partial' | 'paid'>();
  (exportOrders || []).forEach((row: any) => {
    if (!row.product_id || paymentStatusByDeliveryId.has(row.product_id)) return;
    paymentStatusByDeliveryId.set(row.product_id, row.payment_status || 'unpaid');
  });

  return data.map((row: any) => ({
    ...row,
    direction: row.import_orders ? groceryDirection(Array.isArray(row.import_orders) ? row.import_orders[0] : row.import_orders) : undefined,
    export_order_payment_status: paymentStatusByDeliveryId.get(row.id),
  }));
}

export async function listDeliveryInventory(orderCategory?: string, actor?: UserPayload, directions?: readonly GroceryDirection[]) {
  const fetchVeg = !orderCategory || orderCategory === 'vegetable';
  const fetchStd = !orderCategory || orderCategory === 'standard';

  const nestedDv =
    'delivery_orders(*, delivery_vehicles(*, vehicles(license_plate), profiles(full_name)))';

  let allData: any[] = [];
  if (fetchStd) {
    const { data, error } = await supabaseService
      .from('import_orders')
      .select(`*, warehouses(name), ${nestedDv}`)
      .eq('status', 'pending')
      .is('deleted_at', null);

    if (error) throw error;
    if (data) allData = allData.concat(data.filter(d => sourceMatchesDirections(d, directions)).map(d => ({ ...d, order_category: 'standard', direction: groceryDirection(d) })));
  }

  if (fetchVeg) {
    const { data, error } = await supabaseService
      .from('vegetable_orders')
      .select(`*, warehouses(name), ${nestedDv}`)
      .eq('status', 'pending')
      .is('deleted_at', null);

    if (error) throw error;
    if (data) allData = allData.concat(data.map(d => ({ ...d, order_category: 'vegetable' })));
  }

  if (actor && !goodsScopeFullAccess(actor.role)) {
    const isStaff = goodsScopeIsStaffRole(actor.role);
    const isDriver = goodsScopeIsDriverRole(actor.role);
    if (isStaff || isDriver) {
      let driverScope: DriverScope | null = null;
      if (isDriver) {
        driverScope = await fetchDriverScopeForUser(actor.id);
      }
      allData = allData.filter((row: any) => importOrderRowMatchesGoodsScope(row, actor, driverScope));
    }
  }

  return allData;
}
