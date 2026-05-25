import { supabaseService } from '../../config/supabase';

export class VehicleService {
  static async getAll() {
    const { data, error } = await supabaseService
      .from('vehicles')
      .select('*, profiles:profiles!vehicles_driver_id_fkey(full_name, phone), responsible_profile:profiles!vehicles_in_charge_id_fkey(full_name, phone)')
      .is('deleted_at', null);
    if (error) throw error;
    return data;
  }

  static async create(vehicleData: any) {
    const { data, error } = await supabaseService.from('vehicles').insert(vehicleData).select().single();
    if (error) throw error;
    return data;
  }

  static async update(id: string, vehicleData: any) {
    const { data, error } = await supabaseService.from('vehicles').update(vehicleData).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  static async checkin(vehicleId: string, driverId: string, checkinData: any) {
    const { data, error } = await supabaseService
      .from('vehicle_checkins')
      .insert({
        vehicle_id: vehicleId,
        driver_id: driverId,
        ...checkinData,
      })
      .select()
      .single();

    if (error) throw error;

    // Update vehicle status
    await supabaseService.from('vehicles').update({
      status: checkinData.checkin_type === 'in' ? 'in_transit' : 'available'
    }).eq('id', vehicleId);

    return data;
  }

  static async getCheckins(vehicleId: string) {
    const { data, error } = await supabaseService
      .from('vehicle_checkins')
      .select('*, profiles(full_name)')
      .eq('vehicle_id', vehicleId)
      .order('checkin_time', { ascending: false });
    if (error) throw error;
    return data;
  }


  static async getAssignments(vehicleId: string) {
    const { data, error } = await supabaseService
      .from('delivery_vehicles')
      .select('*, delivery_orders(*, import_orders(order_code, receiver_name, customers(name)))')
      .eq('vehicle_id', vehicleId)
      // Filter for orders that are NOT completed
      .not('delivery_orders.status', 'eq', 'completed')
      .order('assigned_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async softDelete(id: string) {
    const { error } = await supabaseService
      .from('vehicles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) throw error;
  }
}
