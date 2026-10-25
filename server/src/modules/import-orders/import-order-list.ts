import { supabaseService } from '../../config/supabase';
import { measureOrderRead } from '../../utils/orderReadMetrics';
import type { UserPayload } from '../../types';
import {
  fetchDriverScopeForUser,
  goodsScopeFullAccess,
  goodsScopeIsDriverRole,
  goodsScopeIsStaffRole,
  importOrderRowMatchesGoodsScope,
  type DriverScope,
} from '../../utils/goodsScope';
import { assignVegetableTaiRanksByDate } from '../../utils/vegetableTaiRank';
import { filterGroceryHistory, groceryDirection, parseGroceryDirection } from '../../utils/groceryDirection';

export async function listImportOrders(filters: any, actor?: UserPayload) {
  const direction = parseGroceryDirection(filters.direction);
  if (direction && filters.order_category === 'vegetable') throw new Error('Grocery direction is not valid for vegetables');
  const isVegOnly = filters.order_category === 'vegetable';
  const isStandardOnly = filters.order_category === 'standard';
  const fetchBoth = !isVegOnly && !isStandardOnly;

  // Pagination params
  const page = Math.max(1, Math.floor(Number(filters.page) || 1));
  const pageSize = Math.max(1, Math.min(9999, Math.floor(Number(filters.pageSize) || 20)));
  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  // Search param
  const search = filters.search ? String(filters.search).trim() : null;

  const buildQuery = (tName: string, iName: string, scanOffset: number, hydrate = false) => {
    // import_orders có 2 FK tới profiles (received_by, sg_cash_handover_confirmed_by) → bắt buộc chỉ rõ quan hệ
    const receivedByProfile = 'profiles:profiles!received_by(full_name, role)';
    const senderCustomerJoin =
      tName === 'import_orders'
        ? 'sender_customers:customers!import_orders_sender_id_fkey(id, name, phone)'
        : 'sender_customers:customers!vegetable_orders_sender_id_fkey(id, name, phone)';
    const customerJoin =
      tName === 'import_orders'
        ? 'customers:customers!import_orders_customer_id_fkey(id, name, phone, address, aliases)'
        : 'customers:customers!vegetable_orders_customer_id_fkey(id, name, phone, address, aliases)';

    const projection = [
      'id, created_at, order_date, order_code, sender_name, sender_id, receiver_name, customer_id, selected_alias, license_plate, driver_name, received_by, admin_confirmed_at, notes, total_amount',
      ...(tName === 'import_orders' ? ['is_return_to_sg'] : []),
      receivedByProfile,
      tName === 'import_orders' ? 'customers:customers!import_orders_customer_id_fkey(name)' : 'customers:customers!vegetable_orders_customer_id_fkey(name)',
      'delivery_orders(delivery_vehicles(driver_id, vehicle_id, vehicles(license_plate), profiles!driver_id(full_name)))',
      ...(filters.history_search ? [`${iName}(package_type, products(name))`] : []),
    ].join(', ');
    let q = supabaseService
      .from(tName)
      .select(hydrate ? `*, ${receivedByProfile}, warehouses(name), ${customerJoin}, ${senderCustomerJoin}, ${iName}(*, products(*)), delivery_orders(*, delivery_vehicles(*, vehicles(license_plate, profiles:profiles!vehicles_driver_id_fkey(full_name, phone), responsible_profile:profiles!vehicles_in_charge_id_fkey(full_name, phone)), profiles!driver_id(full_name, phone)))` : projection);

    q = q.is('deleted_at', null);
    if (actor && !goodsScopeFullAccess(actor.role) && goodsScopeIsStaffRole(actor.role) && !goodsScopeIsDriverRole(actor.role)) {
      q = q.eq('received_by', actor.id);
    }
    if (tName === 'import_orders') {
      if (direction) q = q.eq('is_return_to_sg', direction === 'duc_trong_to_sg');
      else if (filters.allowedDirections?.length === 1) q = q.eq('is_return_to_sg', filters.allowedDirections[0] === 'duc_trong_to_sg');
      else if (filters.allowedDirections?.length === 0) q = q.eq('id', '00000000-0000-0000-0000-000000000000');
    }

    if (filters.dateFrom) q = q.gte('order_date', filters.dateFrom);
    if (filters.dateTo) q = q.lte('order_date', filters.dateTo);
    if (filters.status) {
      if (filters.status.includes(',')) {
        q = q.in('status', filters.status.split(','));
      } else {
        q = q.eq('status', filters.status);
      }
    }
    if (filters.supplier_name) q = q.ilike('supplier_name', `%${filters.supplier_name}%`);
    if (filters.license_plate) {
      const plates = filters.license_plate.split(',').map((p: string) => p.trim()).filter(Boolean);
      if (plates.length === 1) {
        q = q.ilike('license_plate', `%${plates[0]}%`);
      } else if (plates.length > 1) {
        const orClause = plates.map((p: string) => `license_plate.ilike.%${p}%`).join(',');
        q = q.or(orClause);
      }
    }
    if (filters.sender) {
      const senders = filters.sender.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (senders.length === 1) {
        q = q.ilike('sender_name', `%${senders[0]}%`);
      } else if (senders.length > 1) {
        const orClause = senders.map((s: string) => `sender_name.ilike.%${s}%`).join(',');
        q = q.or(orClause);
      }
    }
    if (filters.receiver) {
      const receivers = filters.receiver.split(',').map((r: string) => r.trim()).filter(Boolean);
      if (receivers.length === 1) {
        q = q.ilike('receiver_name', `%${receivers[0]}%`);
      } else if (receivers.length > 1) {
        const orClause = receivers.map((r: string) => `receiver_name.ilike.%${r}%`).join(',');
        q = q.or(orClause);
      }
    }
    if (filters.customer_id) {
      const customerIds = String(filters.customer_id).split(',').map((id: string) => id.trim()).filter(Boolean);
      if (customerIds.length === 1) q = q.eq('customer_id', customerIds[0]);
      else if (customerIds.length > 1) q = q.in('customer_id', customerIds);
    }
    if (filters.admin_confirmation_status === 'pending_customer') {
      q = q.is('admin_confirmed_at', null);
    }

    // Apply search filter using .or() for order_code, sender_name, receiver_name, selected_alias
    if (search) {
      const searchPattern = `%${search}%`;
      q = q.or(`order_code.ilike.${searchPattern},sender_name.ilike.${searchPattern},receiver_name.ilike.${searchPattern},selected_alias.ilike.${searchPattern}`);
    }

    // Fix missing newly created orders by sorting descending BEFORE Supabase limits the results (max-rows)
    q = q.order('created_at', { ascending: false }).order('id', { ascending: false });

    // Apply pagination at database level
    q = q.range(scanOffset, scanOffset + 499);

    return q;
  };

  const fetchRows = async (table: string, items: string) => {
    const rows: any[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await measureOrderRead(buildQuery(table, items, from));
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 500) break;
    }
    return { data: rows, error: null };
  };
  let allData: any[] = [];

  if (fetchBoth || isStandardOnly) {
    const { data, error } = await fetchRows('import_orders', 'import_order_items');
    if (error) throw error;
    if (data) allData = allData.concat(data.map((d: any) => ({ ...d, order_category: 'standard' })));
  }

  if (fetchBoth || isVegOnly) {
    const { data, error } = await fetchRows('vegetable_orders', 'vegetable_order_items');
    if (error) throw error;
    if (data) {
      allData = allData.concat(data.map((d: any) => {
         const mapped = { ...d, order_category: 'vegetable' };
         if (mapped.vegetable_order_items) {
           mapped.import_order_items = mapped.vegetable_order_items;
           delete mapped.vegetable_order_items;
         }
         return mapped;
      }));
    }
  }

  // Sort by created_at desc
  allData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || String(b.id).localeCompare(String(a.id)));

  // Compute total_order_amount
  let mapped = allData.map((order: any) => {
    return { ...order, ...(order.order_category === 'standard' ? { direction: groceryDirection(order) } : {}), total_order_amount: Number(order.total_amount) || 0 };
  });

  const isCustomerSubmittedOrder = (order: any) => {
    const profile = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles;
    return profile?.role === 'customer';
  };

  const isReturnToSgOrder = (order: any) => {
    if (typeof order.is_return_to_sg === 'boolean') return order.is_return_to_sg;
    const notes = String(order.notes || '').toLocaleLowerCase('vi-VN');
    return order.order_category === 'standard'
      && Boolean(order.customer_id)
      && (isCustomerSubmittedOrder(order) || notes.includes('trả hàng lỗi về lại sg'));
  };

  if (filters.admin_confirmation_status === 'pending_customer') {
    mapped = mapped.filter((order: any) =>
      order.order_category === 'standard' && !isReturnToSgOrder(order) && isCustomerSubmittedOrder(order) && Boolean(order.sender_id) && !order.admin_confirmed_at,
    );
  }

  if (filters.admin_confirmation_status === 'return_to_sg') {
    mapped = mapped.filter((order: any) =>
      order.order_category === 'standard' && isReturnToSgOrder(order),
    );
  }

  if (filters.admin_confirmation_status === 'official') {
    mapped = mapped.filter((order: any) =>
      !isReturnToSgOrder(order) && (!isCustomerSubmittedOrder(order) || Boolean(order.admin_confirmed_at)),
    );
  }

  let driverScope: DriverScope | null = null;
  if (actor && !goodsScopeFullAccess(actor.role)) {
    const isStaff = goodsScopeIsStaffRole(actor.role);
    const isDriver = goodsScopeIsDriverRole(actor.role);
    if (isStaff || isDriver) {
      if (isDriver) {
        driverScope = await fetchDriverScopeForUser(actor.id);
      }
      mapped = mapped.filter((row: any) => importOrderRowMatchesGoodsScope(row, actor, driverScope));
    }
  }

  const history = filterGroceryHistory(mapped, filters.history_search, filters.history_filters);
  if (filters.history_search !== undefined || filters.history_filters !== undefined) mapped = history.data;
  const vegetableFilterOptions = { suppliers: new Set<string>(), vehicles: new Set<string>(), receivers: new Set<string>() };
  if (isVegOnly) {
    for (const row of mapped) {
      const supplier = row.customers?.name || row.sender_name;
      if (supplier) vegetableFilterOptions.suppliers.add(supplier);
      if (row.license_plate) row.license_plate.split(', ').forEach((plate: string) => vegetableFilterOptions.vehicles.add(plate));
      for (const delivery of row.delivery_orders || []) {
        for (const assignment of delivery.delivery_vehicles || []) {
          if (assignment.vehicles?.license_plate) assignment.vehicles.license_plate.split(', ').forEach((plate: string) => vegetableFilterOptions.vehicles.add(plate));
        }
      }
      vegetableFilterOptions.receivers.add(row.selected_alias || row.receiver_name || row.profiles?.full_name || '-');
    }
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
    const supplierSearch = normalize(String(filters.supplier_search || ''));
    if (supplierSearch) mapped = mapped.filter(row => normalize(row.customers?.name || row.sender_name || 'Chưa rõ chủ vựa').includes(supplierSearch));
  }
  const selected = mapped.slice(offset, offset + limit);
  const vegetableDates = [...new Set(selected.filter(row => row.order_category === 'vegetable').map(row => row.order_date).filter(Boolean))];
  const ranks = new Map<string, number | undefined>();
  for (let dateOffset = 0; dateOffset < vegetableDates.length; dateOffset += 100) {
    const population: any[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await measureOrderRead(supabaseService.from('vegetable_orders')
        .select('id, order_date, created_at, driver_name, received_by, admin_confirmed_at, profiles:profiles!received_by(role), delivery_orders(delivery_vehicles(driver_id, profiles!driver_id(full_name)))')
        .is('deleted_at', null)
        .in('order_date', vegetableDates.slice(dateOffset, dateOffset + 100))
        .order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(from, from + 499));
      if (error) throw error;
      population.push(...(data || []));
      if (!data || data.length < 500) break;
    }
    assignVegetableTaiRanksByDate(population);
    population.forEach(row => ranks.set(row.id, row.tai_rank));
  }
  const hydrated = new Map<string, any>();
  await Promise.all((['standard', 'vegetable'] as const).map(async category => {
    const ids = selected.filter(row => row.order_category === category).map(row => row.id);
    const table = category === 'standard' ? 'import_orders' : 'vegetable_orders';
    const items = category === 'standard' ? 'import_order_items' : 'vegetable_order_items';
    for (let from = 0; from < ids.length; from += 100) {
      const { data, error } = await measureOrderRead(buildQuery(table, items, 0, true).in('id', ids.slice(from, from + 100)));
      if (error) throw error;
      for (const row of (data || []) as any[]) hydrated.set(`${category}:${row.id}`, row);
    }
  }));
  const data = selected.flatMap(row => {
    const detail = hydrated.get(`${row.order_category}:${row.id}`);
    if (!detail || (actor && !importOrderRowMatchesGoodsScope(detail, actor, driverScope))) return [];
    const result = { ...detail, order_category: row.order_category, total_order_amount: Number(detail.total_amount) || 0 };
    if (row.order_category === 'standard') result.direction = groceryDirection(detail);
    else {
      result.import_order_items = detail.vegetable_order_items;
      delete result.vegetable_order_items;
      result.tai_rank = ranks.get(row.id) ?? null;
    }
    return [result];
  });
  return {
    filterOptions: history.filterOptions,
    ...(isVegOnly ? { vegetableFilterOptions: {
      suppliers: [...vegetableFilterOptions.suppliers], vehicles: [...vegetableFilterOptions.vehicles], receivers: [...vegetableFilterOptions.receivers],
    } } : {}),
    data,
    total: mapped.length,
    page,
    pageSize,
  };
}
