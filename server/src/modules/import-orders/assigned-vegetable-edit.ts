import { supabaseService } from '../../config/supabase';

interface EditItem {
  id?: string;
  item_id?: string | null;
  product_id?: string | null;
  package_type?: string | null;
  item_note?: string | null;
  package_quantity?: number | null;
  weight_kg?: number | null;
  quantity: number;
  unit_price?: number | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  payment_status?: string;
}

interface Assignment {
  id?: string;
  vehicle_id?: string | null;
  driver_id?: string | null;
  loader_name?: string | null;
  allocation_group_id?: string | null;
  assigned_quantity?: number | null;
  expected_amount?: number | null;
  export_payment_status?: string;
  delivery_date?: string | null;
  delivery_time?: string | null;
  image_urls?: string[] | null;
}

interface Delivery {
  id: string;
  product_id?: string | null;
  product_name?: string;
  total_quantity: number;
  delivered_quantity?: number;
  unit_price?: number | null;
  delivery_date?: string | null;
  status?: string;
  driver_delivered_at?: string | null;
  delivery_vehicles?: Assignment[];
}

interface VegetableOrder {
  id: string;
  order_date: string;
  customer_id?: string | null;
  payment_status?: string;
  import_order_items?: EditItem[];
  paid_amount?: number;
  delivery_orders?: Delivery[];
}

interface EditFields {
  order_date?: string;
  customer_id?: string | null;
  payment_status?: string;
}

interface EditRow {
  itemId?: string;
  item: EditItem;
  delivery?: Delivery;
  productName?: string;
  assignments: Assignment[];
}

interface Collection {
  id: string;
  status: string;
  delivery_order_id?: string | null;
  delivery_vehicle_id?: string | null;
  source_order_ids?: string[] | null;
  expected_amount?: number;
  collected_amount?: number;
}

interface EditPlan {
  rows: EditRow[];
  removedItemIds: string[];
  removedDeliveryIds: string[];
  removedAssignmentIds: string[];
  dateChanged: boolean;
  orderDate: string;
  customerId?: string | null;
  previousCustomerId?: string | null;
  collections: Collection[];
}

function scaleAssignments(assignments: Assignment[], quantity: number, previousQuantity: number): Assignment[] {
  if (quantity === previousQuantity) return assignments.map((row) => ({ ...row }));
  const assigned = assignments.reduce((sum, row) => sum + Number(row.assigned_quantity || 0), 0);
  if (!assigned || !previousQuantity) return [];
  const target = Math.round(assigned * quantity / previousQuantity);
  const weights = assignments.map((row, index) => {
    const exact = Number(row.assigned_quantity || 0) * target / assigned;
    return { index, quantity: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const remainder = target - weights.reduce((sum, row) => sum + row.quantity, 0);
  const ranked = [...weights].sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remainder; index += 1) ranked[index].quantity += 1;
  return assignments.map((row, index) => ({
    ...row,
    assigned_quantity: weights[index].quantity,
    expected_amount: Number(row.assigned_quantity || 0) > 0
      ? Math.round(Number(row.expected_amount || 0) * weights[index].quantity / Number(row.assigned_quantity)) : 0,
  }));
}

export function buildAssignedVegetableEdit(order: VegetableOrder, submitted: EditItem[], fields: EditFields): EditPlan {
  const previousItems = order.import_order_items || [];
  const deliveries = order.delivery_orders || [];
  const usedItems = new Set<string>();
  const usedDeliveries = new Set<string>();
  const itemDeliveries = new Map<string, Delivery>();
  for (const item of previousItems) {
    const candidates = deliveries.filter((row) => !usedDeliveries.has(row.id) && row.product_id === item.product_id);
    const delivery = candidates.find((row) => Number(row.total_quantity) === Number(item.quantity)) || (candidates.length === 1 ? candidates[0] : undefined);
    if (delivery && item.id) {
      itemDeliveries.set(item.id, delivery);
      usedDeliveries.add(delivery.id);
    }
  }

  const allAssignments = deliveries.flatMap((row) => row.delivery_vehicles || []);
  const vehicleKeys = new Set(allAssignments.map((row) => `${row.vehicle_id}:${row.driver_id}`));
  const template = vehicleKeys.size === 1 ? allAssignments[0] : undefined;
  const identifiedPayload = submitted.some((item) => Object.prototype.hasOwnProperty.call(item, 'item_id'));
  const dateChanged = fields.order_date !== undefined && fields.order_date !== order.order_date;
  const orderDate = fields.order_date || order.order_date;
  const rows = submitted.map((item, index): EditRow => {
    if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) throw new Error('Số lượng dòng hàng phải lớn hơn 0');
    let previous = item.item_id ? previousItems.find((row) => row.id === item.item_id) : undefined;
    if (item.item_id && (!previous || usedItems.has(item.item_id))) throw new Error('ID dòng hàng không thuộc đơn hoặc bị trùng');
    if (!item.item_id && !identifiedPayload) {
      previous = previousItems.find((row) => row.id && !usedItems.has(row.id) && row.product_id === item.product_id)
        || (previousItems[index]?.id && !usedItems.has(previousItems[index].id!) ? previousItems[index] : undefined);
    }
    if (previous?.id) usedItems.add(previous.id);
    const delivery = previous?.id ? itemDeliveries.get(previous.id) : undefined;
    if (previous && !delivery && deliveries.length) throw new Error('Không xác định được đơn giao tương ứng với dòng hàng cần sửa');
    if (previous && (previous.product_id !== item.product_id || Number(previous.quantity) !== Number(item.quantity))
      && deliveries.filter((row) => row.product_id === previous.product_id && Number(row.total_quantity) === Number(previous.quantity)).length > 1) {
      throw new Error('Có nhiều đơn giao trùng mặt hàng và số lượng; cần đối chiếu phân xe trước khi sửa dòng này');
    }
    const quantity = Number(item.quantity);
    let assignments = delivery
      ? scaleAssignments(delivery.delivery_vehicles || [], quantity, Number(delivery.total_quantity))
      : template ? [{ ...template, id: undefined, allocation_group_id: undefined, assigned_quantity: quantity,
        expected_amount: Number(template.assigned_quantity || 0) > 0
          ? Math.round(Number(template.expected_amount || 0) * quantity / Number(template.assigned_quantity)) : 0 }] : [];
    assignments = assignments.map((row) => ({
      ...row,
      ...(fields.payment_status === 'paid' ? { export_payment_status: 'paid' }
        : order.payment_status === 'paid' && fields.payment_status === 'unpaid' ? { export_payment_status: 'unpaid' } : {}),
      ...(dateChanged ? { delivery_date: orderDate } : {}),
    }));
    return { itemId: previous?.id, item: { ...previous, ...item, quantity,
      ...(fields.payment_status !== undefined ? { payment_status: fields.payment_status } : {}) }, delivery, assignments };
  });
  const removedItemIds = previousItems.flatMap((row) => row.id && !usedItems.has(row.id) ? [row.id] : []);
  const retainedDeliveries = new Set(rows.flatMap((row) => row.delivery ? [row.delivery.id] : []));
  const removedDeliveryIds = deliveries.filter((row) => !retainedDeliveries.has(row.id)).map((row) => row.id);
  const removedAssignmentIds = rows.flatMap((row) => row.assignments.flatMap((assignment) => assignment.id && !assignment.assigned_quantity ? [assignment.id] : []));
  return { rows, removedItemIds, removedDeliveryIds, removedAssignmentIds, dateChanged, orderDate,
    customerId: fields.customer_id !== undefined ? fields.customer_id : order.customer_id,
    previousCustomerId: order.customer_id, collections: [] };
}

export async function prepareAssignedVegetableEdit(order: VegetableOrder, submitted: EditItem[], fields: EditFields) {
  const plan = buildAssignedVegetableEdit(order, submitted, fields);
  if (plan.customerId !== order.customer_id && !plan.customerId) throw new Error('Vui lòng chọn khách hàng nhận công nợ của đơn');
  if (plan.customerId !== order.customer_id && Number(order.paid_amount || 0) > 0) {
    throw new Error('Không thể đổi khách hàng khi đơn đã ghi nhận tiền thanh toán; cần xử lý phiếu thu trước');
  }
  const productIds = [...new Set(submitted.flatMap((row) => row.product_id ? [row.product_id] : []))];
  if (productIds.length) {
    const { data: products, error } = await supabaseService.from('products').select('id, name').in('id', productIds);
    if (error) throw error;
    for (const row of plan.rows) {
      const product = products?.find((candidate) => candidate.id === row.item.product_id);
      if (row.item.product_id && !product) throw new Error('Không tìm thấy sản phẩm của dòng hàng');
      row.productName = product?.name || row.item.package_type || 'Hàng hóa';
    }
  }
  const deliveryIds = (order.delivery_orders || []).map((row) => row.id);
  if (deliveryIds.length) {
    const { data, error } = await supabaseService.from('payment_collections')
      .select('id, status, delivery_order_id, delivery_vehicle_id, source_order_ids, expected_amount, collected_amount')
      .or(`delivery_order_id.in.(${deliveryIds.join(',')}),source_order_ids.ov.{${deliveryIds.join(',')}}`)
      .neq('status', 'cancelled');
    if (error) throw error;
    plan.collections = data || [];
    const hasLockedPayment = plan.collections.some((row) => row.status !== 'draft' && (
      plan.customerId !== order.customer_id
      || (row.delivery_vehicle_id && plan.removedAssignmentIds.includes(row.delivery_vehicle_id))
      || (!row.delivery_vehicle_id && plan.removedAssignmentIds.length > 0)
      || [row.delivery_order_id, ...(row.source_order_ids || [])].some((id) => id && plan.removedDeliveryIds.includes(id))
    ));
    if (hasLockedPayment) throw new Error('Không thể xóa phân xe hoặc đổi khách hàng có phiếu thu đã gửi/đã chốt; cần xử lý phiếu thu trước');
    if (plan.customerId !== order.customer_id && plan.collections.some((row) =>
      row.source_order_ids?.some((id) => !deliveryIds.includes(id)))) {
      throw new Error('Không thể đổi khách hàng khi phiếu thu đang gộp với đơn hàng khác');
    }
  }
  return plan;
}

function itemValues(item: EditItem) {
  return Object.fromEntries(Object.entries({
    product_id: item.product_id, package_type: item.package_type, item_note: item.item_note,
    package_quantity: item.package_quantity, weight_kg: item.weight_kg, quantity: item.quantity,
    unit_price: item.unit_price,
    image_url: item.image_urls?.length ? item.image_urls.join(',') : item.image_url,
    image_urls: item.image_urls, payment_status: item.payment_status,
  }).filter(([, value]) => value !== undefined));
}

export async function applyAssignedVegetableEdit(orderId: string, plan: EditPlan, actorId: string) {
  if (plan.customerId && plan.customerId !== plan.previousCustomerId) {
    const { data: entries, error: ledgerError } = await supabaseService.from('customer_debt_ledger')
      .select('customer_id, amount').eq('reference_id', orderId);
    if (ledgerError) throw ledgerError;
    const balances = new Map<string, number>();
    for (const entry of entries || []) {
      if (entry.customer_id !== plan.customerId) balances.set(entry.customer_id, (balances.get(entry.customer_id) || 0) + Number(entry.amount || 0));
    }
    const adjustments = [...balances].flatMap(([customerId, amount]) => amount ? [
      { customer_id: customerId, amount: -amount, transaction_type: 'adjustment', reference_id: orderId, created_by: actorId, notes: 'Admin changed vegetable order customer' },
      { customer_id: plan.customerId, amount, transaction_type: 'adjustment', reference_id: orderId, created_by: actorId, notes: 'Admin changed vegetable order customer' },
    ] : []);
    if (adjustments.length) {
      const { error } = await supabaseService.from('customer_debt_ledger').insert(adjustments);
      if (error) throw error;
    }
  }
  if (plan.removedDeliveryIds.length) {
    const { error } = await supabaseService.rpc('cancel_invoice_cascade_by_delivery_ids', {
      p_delivery_order_ids: plan.removedDeliveryIds, p_cancelled_by: actorId,
    });
    if (error) throw error;
  }
  if (plan.removedItemIds.length) {
    const { error } = await supabaseService.from('vegetable_order_items').delete()
      .eq('vegetable_order_id', orderId).in('id', plan.removedItemIds);
    if (error) throw error;
  }
  if (plan.removedAssignmentIds.length) {
    const { error: collectionError } = await supabaseService.from('payment_collections')
      .update({ status: 'cancelled', cancelled_by: actorId, cancelled_at: new Date().toISOString(), cancellation_reason: 'Admin updated vegetable order quantity' })
      .in('delivery_vehicle_id', plan.removedAssignmentIds).eq('status', 'draft');
    if (collectionError) throw collectionError;
    const { error } = await supabaseService.from('delivery_vehicles').delete().in('id', plan.removedAssignmentIds);
    if (error) throw error;
  }
  for (const row of plan.rows) {
    const itemQuery = row.itemId
      ? supabaseService.from('vegetable_order_items').update(itemValues(row.item)).eq('id', row.itemId).eq('vegetable_order_id', orderId)
      : supabaseService.from('vegetable_order_items').insert({ ...itemValues(row.item), vegetable_order_id: orderId });
    const { error: itemError } = await itemQuery;
    if (itemError) throw itemError;
    const assignments = row.assignments.filter((assignment) => Number(assignment.assigned_quantity) > 0);
    const assigned = assignments.reduce((sum, assignment) => sum + Number(assignment.assigned_quantity), 0);
    const status = assigned >= row.item.quantity ? 'da_giao' : assigned > 0 ? 'can_giao'
      : row.delivery?.status === 'hang_o_sg' ? 'hang_o_sg' : 'can_giao';
    const deliveryValues = {
      product_id: row.item.product_id, product_name: row.productName || row.delivery?.product_name || row.item.package_type || 'Hàng hóa',
      total_quantity: row.item.quantity, delivered_quantity: Math.min(Number(row.delivery?.delivered_quantity || 0), row.item.quantity),
      delivery_date: plan.dateChanged ? plan.orderDate : row.delivery?.delivery_date || plan.orderDate,
      status, driver_delivered_at: status === 'da_giao' ? row.delivery?.driver_delivered_at || new Date().toISOString() : null,
    };
    const deliveryQuery = row.delivery
      ? supabaseService.from('delivery_orders').update(deliveryValues).eq('id', row.delivery.id).eq('vegetable_order_id', orderId)
      : supabaseService.from('delivery_orders').insert({ ...deliveryValues, vegetable_order_id: orderId, order_category: 'vegetable' });
    const { data: delivery, error: deliveryError } = await deliveryQuery.select('id').single();
    if (deliveryError) throw deliveryError;
    for (const assignment of assignments) {
      const values = {
        assigned_quantity: assignment.assigned_quantity, expected_amount: assignment.expected_amount,
        export_payment_status: assignment.export_payment_status || 'unpaid',
        delivery_date: plan.dateChanged ? plan.orderDate : assignment.delivery_date,
      };
      const assignmentQuery = assignment.id
        ? supabaseService.from('delivery_vehicles').update(values).eq('id', assignment.id).eq('delivery_order_id', delivery.id)
        : supabaseService.from('delivery_vehicles').insert({ ...values, delivery_order_id: delivery.id,
          vehicle_id: assignment.vehicle_id, driver_id: assignment.driver_id, loader_name: assignment.loader_name,
          delivery_time: assignment.delivery_time, image_urls: [] });
      const { data: savedAssignment, error } = await assignmentQuery.select('id').single();
      if (error) throw error;
      if (!assignment.id && Number(assignment.expected_amount || 0) > 0) {
        const { error: collectionError } = await supabaseService.from('payment_collections').insert({
          delivery_order_id: delivery.id, delivery_vehicle_id: savedAssignment.id,
          customer_id: plan.customerId, vehicle_id: assignment.vehicle_id, driver_id: assignment.driver_id,
          expected_amount: assignment.expected_amount, collected_amount: assignment.expected_amount,
          collected_at: new Date().toISOString(), status: 'draft',
        });
        if (collectionError) throw collectionError;
      }
    }
    const { error: exportError } = await supabaseService.from('export_orders').update({
      product_name: deliveryValues.product_name, quantity: assigned, export_date: deliveryValues.delivery_date,
      customer_id: plan.customerId, debt_amount: assignments.reduce((sum, assignment) => sum + Number(assignment.expected_amount || 0), 0),
    }).eq('product_id', delivery.id);
    if (exportError) throw exportError;
  }

  for (const collection of plan.collections.filter((row) => row.status === 'draft')) {
    if ([collection.delivery_order_id, ...(collection.source_order_ids || [])].some((id) => id && plan.removedDeliveryIds.includes(id))
      || (collection.delivery_vehicle_id && plan.removedAssignmentIds.includes(collection.delivery_vehicle_id))) continue;
    const sources = collection.source_order_ids?.length ? collection.source_order_ids
      : collection.delivery_order_id ? [collection.delivery_order_id] : [];
    if (!sources.length) continue;
    let query = supabaseService.from('delivery_vehicles').select('expected_amount').in('delivery_order_id', sources);
    if (collection.delivery_vehicle_id) query = query.eq('id', collection.delivery_vehicle_id);
    const { data: assignments, error: amountError } = await query;
    if (amountError) throw amountError;
    const expected = (assignments || []).reduce((sum, assignment) => sum + Number(assignment.expected_amount || 0), 0);
    const { error } = await supabaseService.from('payment_collections')
      .update({ customer_id: plan.customerId, expected_amount: expected,
        collected_amount: Number(collection.collected_amount || 0) === Number(collection.expected_amount || 0) ? expected : collection.collected_amount })
      .eq('id', collection.id).eq('status', 'draft');
    if (error) throw error;
  }
}
