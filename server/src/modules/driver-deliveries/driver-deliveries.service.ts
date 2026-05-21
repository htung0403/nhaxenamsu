import { supabaseService } from '../../config/supabase';

const DELIVERY_ASSIGNMENT_SELECT = `
  id,
  delivery_order_id,
  vehicle_id,
  driver_id,
  loader_name,
  assigned_quantity,
  expected_amount,
  image_urls,
  status,
  assigned_at,
  vehicles(id, license_plate),
  delivery_orders(
    id,
    product_name,
    total_quantity,
    delivered_quantity,
    status,
    delivery_date,
    delivery_time,
    order_category,
    driver_delivered_at,
    import_orders(
      order_code,
      receiver_name,
      receiver_phone,
      receiver_address,
      customers:customers!import_orders_customer_id_fkey(name, phone, address, latitude, longitude)
    ),
    vegetable_orders(
      order_code,
      receiver_name,
      receiver_phone,
      receiver_address,
      customers:customers!vegetable_orders_customer_id_fkey(name, phone, address, latitude, longitude)
    )
  )
`;

const pickRelation = (value: any) => (Array.isArray(value) ? value[0] : value || null);

const normalizeAssignment = (row: any) => {
  const order = pickRelation(row.delivery_orders);
  const source = pickRelation(order?.import_orders) || pickRelation(order?.vegetable_orders);
  const customer = pickRelation(source?.customers);

  return {
    id: row.id,
    deliveryOrderId: row.delivery_order_id,
    vehicleId: row.vehicle_id,
    vehicleLicensePlate: row.vehicles?.license_plate || null,
    driverId: row.driver_id,
    loaderName: row.loader_name,
    assignedQuantity: row.assigned_quantity || 0,
    expectedAmount: Number(row.expected_amount || 0),
    imageUrls: row.image_urls || [],
    status: row.status,
    assignedAt: row.assigned_at,
    order: {
      id: order?.id,
      orderCode: source?.order_code || order?.id?.slice(0, 8)?.toUpperCase() || '',
      productName: order?.product_name || '',
      totalQuantity: order?.total_quantity || 0,
      deliveredQuantity: order?.delivered_quantity || 0,
      status: order?.status,
      deliveryDate: order?.delivery_date,
      deliveryTime: order?.delivery_time,
      orderCategory: order?.order_category,
      receiverName: customer?.name || source?.receiver_name || null,
      receiverPhone: customer?.phone || source?.receiver_phone || null,
      receiverAddress: customer?.address || source?.receiver_address || null,
      latitude: customer?.latitude === null || customer?.latitude === undefined ? null : Number(customer.latitude),
      longitude: customer?.longitude === null || customer?.longitude === undefined ? null : Number(customer.longitude),
    },
  };
};

export class DriverDeliveriesService {
  static async getMyAssignments(driverId: string) {
    const { data, error } = await supabaseService
      .from('delivery_vehicles')
      .select(DELIVERY_ASSIGNMENT_SELECT)
      .eq('driver_id', driverId)
      .in('status', ['assigned', 'in_transit'])
      .order('assigned_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(normalizeAssignment);
  }

  static async startTrip(driverId: string, deliveryVehicleIds: string[]) {
    const uniqueIds = Array.from(new Set(deliveryVehicleIds));
    if (uniqueIds.length === 0) throw new Error('Vui lòng chọn ít nhất một đơn để bắt đầu giao');

    const { data: assignments, error: fetchError } = await supabaseService
      .from('delivery_vehicles')
      .select('id, driver_id, vehicle_id, delivery_order_id, status')
      .in('id', uniqueIds);

    if (fetchError) throw fetchError;
    if (!assignments || assignments.length !== uniqueIds.length) throw new Error('Không tìm thấy đủ đơn giao đã chọn');

    const invalid = assignments.find((item: any) => item.driver_id !== driverId || item.status !== 'assigned');
    if (invalid) throw new Error('Chỉ có thể bắt đầu các đơn đang chờ giao của chính tài xế');

    const startedAt = new Date().toISOString();
    const { error: updateError } = await supabaseService
      .from('delivery_vehicles')
      .update({ status: 'in_transit' })
      .in('id', uniqueIds);

    if (updateError) throw updateError;

    const vehicleIds = Array.from(new Set(assignments.map((item: any) => item.vehicle_id).filter(Boolean)));
    if (vehicleIds.length > 0) {
      await supabaseService.from('vehicles').update({ status: 'in_transit' }).in('id', vehicleIds);
    }

    const firstAssignment = assignments[0];
    const { data: latestLocation } = await supabaseService
      .from('driver_locations_latest')
      .select('latitude, longitude, recorded_at')
      .eq('driver_id', driverId)
      .maybeSingle();

    if (latestLocation?.latitude !== undefined && latestLocation?.longitude !== undefined) {
      await supabaseService
        .from('driver_locations_latest')
        .update({
          status: 'dang_giao',
          vehicle_id: firstAssignment.vehicle_id || null,
          current_delivery_vehicle_id: firstAssignment.id,
          updated_at: startedAt,
        })
        .eq('driver_id', driverId);
    }

    return this.getMyAssignments(driverId);
  }

  static async completeAssignment(driverId: string, deliveryVehicleId: string, imageUrls: string[]) {
    if (!imageUrls.length) throw new Error('Vui lòng tải ít nhất một ảnh xác nhận giao hàng');

    const { data: assignment, error: fetchError } = await supabaseService
      .from('delivery_vehicles')
      .select('id, driver_id, vehicle_id, delivery_order_id, status, image_urls')
      .eq('id', deliveryVehicleId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!assignment) throw new Error('Không tìm thấy đơn giao');
    if (assignment.driver_id !== driverId) throw new Error('Bạn không có quyền xác nhận đơn giao này');
    if (assignment.status !== 'in_transit') throw new Error('Chỉ có thể xác nhận đơn đang giao');

    const completedAt = new Date().toISOString();
    const mergedImages = Array.from(new Set([...(assignment.image_urls || []), ...imageUrls]));

    const { error: updateAssignmentError } = await supabaseService
      .from('delivery_vehicles')
      .update({ status: 'completed', image_urls: mergedImages })
      .eq('id', deliveryVehicleId);

    if (updateAssignmentError) throw updateAssignmentError;

    const { data: siblingAssignments, error: siblingsError } = await supabaseService
      .from('delivery_vehicles')
      .select('id, status')
      .eq('delivery_order_id', assignment.delivery_order_id);

    if (siblingsError) throw siblingsError;

    const allCompleted = (siblingAssignments || []).every((item: any) =>
      item.id === deliveryVehicleId ? true : item.status === 'completed'
    );

    if (allCompleted) {
      await supabaseService
        .from('delivery_orders')
        .update({ status: 'da_giao', driver_delivered_at: completedAt })
        .eq('id', assignment.delivery_order_id);
    }

    const { data: activeAssignments, error: activeError } = await supabaseService
      .from('delivery_vehicles')
      .select('id, vehicle_id')
      .eq('driver_id', driverId)
      .eq('status', 'in_transit');

    if (activeError) throw activeError;

    if (!activeAssignments?.length) {
      await supabaseService
        .from('driver_locations_latest')
        .update({
          status: 'online',
          current_delivery_vehicle_id: null,
          updated_at: completedAt,
        })
        .eq('driver_id', driverId);

      if (assignment.vehicle_id) {
        await supabaseService.from('vehicles').update({ status: 'available' }).eq('id', assignment.vehicle_id);
      }
    } else if (activeAssignments[0]?.id) {
      await supabaseService
        .from('driver_locations_latest')
        .update({
          status: 'dang_giao',
          vehicle_id: activeAssignments[0].vehicle_id || null,
          current_delivery_vehicle_id: activeAssignments[0].id,
          updated_at: completedAt,
        })
        .eq('driver_id', driverId);
    }

    return this.getMyAssignments(driverId);
  }
}
