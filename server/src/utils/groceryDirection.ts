export const GROCERY_DIRECTIONS = ['sg_to_duc_trong', 'duc_trong_to_sg'] as const;
export type GroceryDirection = typeof GROCERY_DIRECTIONS[number];

export function parseGroceryDirection(value: unknown): GroceryDirection | undefined {
  if (value === undefined) return undefined;
  if (value === 'sg_to_duc_trong' || value === 'duc_trong_to_sg') return value;
  throw new Error('Invalid grocery direction');
}

export function groceryDirection(order: { is_return_to_sg?: boolean }): GroceryDirection {
  return order.is_return_to_sg ? 'duc_trong_to_sg' : 'sg_to_duc_trong';
}

export function resolveGroceryFlag(payload: { direction?: unknown; is_return_to_sg?: boolean; order_category?: string }, existing?: { is_return_to_sg?: boolean }) {
  const direction = parseGroceryDirection(payload.direction);
  if (payload.order_category === 'vegetable') {
    if (direction || payload.is_return_to_sg) throw new Error('Grocery direction is not valid for vegetables');
    return undefined;
  }
  const flag = direction ? direction === 'duc_trong_to_sg' : payload.is_return_to_sg;
  if (direction && payload.is_return_to_sg !== undefined && flag !== payload.is_return_to_sg) {
    throw new Error('Conflicting grocery direction');
  }
  if (existing && flag !== undefined && flag !== Boolean(existing.is_return_to_sg)) {
    throw new Error('Order direction cannot be changed');
  }
  return flag ?? Boolean(existing?.is_return_to_sg);
}

export function sourceMatchesDirections(source: any, directions?: readonly GroceryDirection[]): boolean {
  if (!directions) return true;
  const order = Array.isArray(source) ? source[0] : source;
  return Boolean(order) && directions.includes(groceryDirection(order));
}

export function groceryHistoryFields(order: any) {
  const sender = order.is_return_to_sg ? order.customers?.name || order.sender_name || '-' : order.selected_alias || order.customers?.name || order.sender_name || '-';
  const receiver = order.is_return_to_sg ? order.receiver_name || '-' : order.profiles?.full_name || order.selected_alias || order.receiver_name || '-';
  const vehicles = new Set<string>();
  if (order.license_plate) vehicles.add(order.license_plate);
  for (const delivery of order.delivery_orders || []) {
    for (const assignment of delivery.delivery_vehicles || []) {
      if (assignment.vehicles?.license_plate) vehicles.add(assignment.vehicles.license_plate);
    }
  }
  return { sender, receiver, vehicles: [...vehicles] };
}

export function filterGroceryHistory(rows: any[], search?: string, rawFilters?: string) {
  const filters = rawFilters ? JSON.parse(rawFilters) : {};
  for (const key of ['sender', 'receiver', 'vehicle']) {
    if (filters[key] !== undefined && (!Array.isArray(filters[key]) || !filters[key].every((value: unknown) => typeof value === 'string'))) throw new Error('Invalid history filters');
  }
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
  const term = normalize(search || '');
  const options = { senders: new Set<string>(), receivers: new Set<string>(), vehicles: new Set<string>() };
  const data = rows.filter(order => {
    const fields = groceryHistoryFields(order);
    options.senders.add(fields.sender);
    options.receivers.add(fields.receiver);
    fields.vehicles.forEach(vehicle => options.vehicles.add(vehicle));
    if (filters.sender?.length && !filters.sender.includes(fields.sender)) return false;
    if (filters.receiver?.length && !filters.receiver.includes(fields.receiver)) return false;
    if (filters.vehicle?.length && !fields.vehicles.some(vehicle => filters.vehicle.includes(vehicle))) return false;
    const haystack = [order.order_code, fields.sender, fields.receiver, ...(order.import_order_items || []).map((item: any) => item.products?.name || item.package_type)].filter(Boolean).join(' ');
    return !term || normalize(haystack).includes(term);
  });
  return { data, filterOptions: { senders: [...options.senders], receivers: [...options.receivers], vehicles: [...options.vehicles] } };
}
