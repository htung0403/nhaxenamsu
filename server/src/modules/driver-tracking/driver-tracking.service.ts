import { supabaseService } from '../../config/supabase';
import { env } from '../../config/env';

export type DriverMapStatus = 'online' | 'offline' | 'dang_giao';

export type DriverLocationInput = {
  latitude: number;
  longitude: number;
  accuracy_m?: number;
  speed_mps?: number;
  heading?: number;
  battery_level?: number;
  recorded_at?: string;
  status?: DriverMapStatus;
};

type LatestLocationRow = {
  driver_id: string;
  vehicle_id: string | null;
  current_delivery_vehicle_id: string | null;
  latitude: number | string;
  longitude: number | string;
  accuracy_m: number | string | null;
  speed_mps: number | string | null;
  heading: number | string | null;
  battery_level: number | null;
  status: DriverMapStatus;
  recorded_at: string;
  updated_at: string;
  profiles?: { full_name?: string; phone?: string | null } | null;
  vehicles?: { license_plate?: string | null } | null;
  delivery_vehicles?: {
    id: string;
    delivery_order_id?: string;
    delivery_orders?: {
      id: string;
      product_name?: string | null;
      delivery_date?: string | null;
      delivery_time?: string | null;
      import_orders?: {
        receiver_name?: string | null;
        receiver_address?: string | null;
        customers?: { name?: string | null; address?: string | null; latitude?: number | string | null; longitude?: number | string | null } | null;
      } | null;
      vegetable_orders?: {
        receiver_name?: string | null;
        receiver_address?: string | null;
        customers?: { name?: string | null; address?: string | null; latitude?: number | string | null; longitude?: number | string | null } | null;
      } | null;
    } | null;
  } | null;
};

const toNumberOrNull = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const distanceMeters = (fromLat: number, fromLng: number, toLat: number, toLng: number): number => {
  const earthRadiusMeters = 6_371_000;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normalizeLatestLocation = (row: LatestLocationRow) => {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  const isDelivering = row.status === 'dang_giao';
  const deliveryOrder = row.delivery_vehicles?.delivery_orders || null;
  const destinationSource = deliveryOrder?.import_orders || deliveryOrder?.vegetable_orders || null;
  const destinationCustomer = destinationSource?.customers || null;

  return {
    driverId: row.driver_id,
    driverName: row.profiles?.full_name || 'Tài xế',
    vehicleId: row.vehicle_id,
    licensePlate: row.vehicles?.license_plate || null,
    currentDeliveryVehicleId: row.current_delivery_vehicle_id,
    currentDeliveryOrderId: row.delivery_vehicles?.delivery_order_id || null,
    currentDeliveryProduct: deliveryOrder?.product_name || null,
    destinationName: destinationCustomer?.name || destinationSource?.receiver_name || null,
    destinationAddress: destinationCustomer?.address || destinationSource?.receiver_address || null,
    destinationLatitude: toNumberOrNull(destinationCustomer?.latitude),
    destinationLongitude: toNumberOrNull(destinationCustomer?.longitude),
    latitude,
    longitude,
    accuracyM: toNumberOrNull(row.accuracy_m),
    speedMps: toNumberOrNull(row.speed_mps),
    heading: toNumberOrNull(row.heading),
    batteryLevel: row.battery_level,
    status: row.status,
    isDelivering,
    recordedAt: row.recorded_at,
    updatedAt: row.updated_at,
  };
};

export class DriverTrackingService {
  static async getActiveAssignment(driverId: string) {
    const { data, error } = await supabaseService
      .from('delivery_vehicles')
      .select('id, vehicle_id, delivery_order_id, status')
      .eq('driver_id', driverId)
      .in('status', ['assigned', 'in_transit'])
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getDriverVehicle(driverId: string) {
    const { data, error } = await supabaseService
      .from('vehicles')
      .select('id')
      .eq('driver_id', driverId)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  }

  static async recordLocation(driverId: string, input: DriverLocationInput) {
    const recordedAt = input.recorded_at ? new Date(input.recorded_at) : new Date();
    if (Number.isNaN(recordedAt.getTime())) {
      throw new Error('recorded_at không hợp lệ');
    }

    const { data: previous, error: previousError } = await supabaseService
      .from('driver_locations_latest')
      .select('latitude, longitude, recorded_at, status')
      .eq('driver_id', driverId)
      .maybeSingle();

    if (previousError) throw new Error(previousError.message);

    const activeAssignment = await this.getActiveAssignment(driverId);
    const driverVehicle = activeAssignment?.vehicle_id ? null : await this.getDriverVehicle(driverId);
    const vehicleId = activeAssignment?.vehicle_id || driverVehicle?.id || null;
    const currentDeliveryVehicleId = activeAssignment?.id || null;
    const derivedStatus: DriverMapStatus = input.status || (activeAssignment ? 'dang_giao' : 'online');

    if (previous) {
      const secondsSinceLastWrite =
        (recordedAt.getTime() - new Date(previous.recorded_at as string).getTime()) / 1000;
      const movedMeters = distanceMeters(
        Number(previous.latitude),
        Number(previous.longitude),
        input.latitude,
        input.longitude,
      );
      const statusChanged = previous.status !== derivedStatus;

      // Business rule: 10s + distance gate protects Supabase writes, realtime egress, and history size.
      if (
        !statusChanged &&
        secondsSinceLastWrite < env.DRIVER_LOCATION_MIN_INTERVAL_SECONDS &&
        movedMeters < env.DRIVER_LOCATION_MIN_DISTANCE_METERS
      ) {
        return {
          skipped: true,
          reason: 'below_write_threshold',
          secondsSinceLastWrite,
          movedMeters,
        };
      }
    }

    const payload = {
      driver_id: driverId,
      vehicle_id: vehicleId,
      current_delivery_vehicle_id: currentDeliveryVehicleId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy_m: input.accuracy_m ?? null,
      speed_mps: input.speed_mps ?? null,
      heading: input.heading ?? null,
      battery_level: input.battery_level ?? null,
      status: derivedStatus,
      recorded_at: recordedAt.toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: latest, error: latestError } = await supabaseService
      .from('driver_locations_latest')
      .upsert(payload, { onConflict: 'driver_id' })
      .select()
      .single();

    if (latestError) throw new Error(latestError.message);

    const { error: historyError } = await supabaseService.from('driver_location_history').insert({
      driver_id: driverId,
      vehicle_id: vehicleId,
      delivery_vehicle_id: currentDeliveryVehicleId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy_m: input.accuracy_m ?? null,
      speed_mps: input.speed_mps ?? null,
      heading: input.heading ?? null,
      recorded_at: recordedAt.toISOString(),
    });

    if (historyError) throw new Error(historyError.message);

    return { skipped: false, location: latest };
  }

  static async getLatestLocations() {
    const offlineCutoff = new Date(Date.now() - env.DRIVER_OFFLINE_AFTER_SECONDS * 1000).toISOString();

    const { data, error } = await supabaseService
      .from('driver_locations_latest')
      .select(`
        *,
        profiles:profiles!driver_locations_latest_driver_id_fkey(full_name, phone),
        vehicles:vehicles!driver_locations_latest_vehicle_id_fkey(license_plate),
        delivery_vehicles:delivery_vehicles!driver_locations_latest_current_delivery_vehicle_id_fkey(
          id,
          delivery_order_id,
          delivery_orders(
            id,
            product_name,
            delivery_date,
            delivery_time,
            import_orders(
              receiver_name,
              receiver_address,
              customers:customers!import_orders_customer_id_fkey(name, address, latitude, longitude)
            ),
            vegetable_orders(
              receiver_name,
              receiver_address,
              customers:customers!vegetable_orders_customer_id_fkey(name, address, latitude, longitude)
            )
          )
        )
      `)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((row: LatestLocationRow) => {
      const normalized = normalizeLatestLocation(row);
      return {
        ...normalized,
        status: normalized.updatedAt < offlineCutoff ? 'offline' : normalized.status,
        etaMinutes: normalized.isDelivering ? null : null,
      };
    });
  }

  static async getHistory(filters: {
    driverId: string;
    from?: string;
    to?: string;
    deliveryVehicleId?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(filters.limit || 500, 1), 500);
    let query = supabaseService
      .from('driver_location_history')
      .select('id, driver_id, vehicle_id, delivery_vehicle_id, latitude, longitude, accuracy_m, speed_mps, heading, recorded_at')
      .eq('driver_id', filters.driverId)
      .order('recorded_at', { ascending: true })
      .limit(limit);

    if (filters.from) query = query.gte('recorded_at', filters.from);
    if (filters.to) query = query.lte('recorded_at', filters.to);
    if (filters.deliveryVehicleId) query = query.eq('delivery_vehicle_id', filters.deliveryVehicleId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map((row: any) => ({
      id: row.id,
      driverId: row.driver_id,
      vehicleId: row.vehicle_id,
      deliveryVehicleId: row.delivery_vehicle_id,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracyM: toNumberOrNull(row.accuracy_m),
      speedMps: toNumberOrNull(row.speed_mps),
      heading: toNumberOrNull(row.heading),
      recordedAt: row.recorded_at,
    }));
  }

  static async getHealthMetrics() {
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const offlineCutoff = new Date(Date.now() - env.DRIVER_OFFLINE_AFTER_SECONDS * 1000).toISOString();

    const [{ count: updatesLastMinute }, { count: onlineDrivers }, { count: historyRowsToday }] = await Promise.all([
      supabaseService
        .from('driver_location_history')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', cutoff),
      supabaseService
        .from('driver_locations_latest')
        .select('driver_id', { count: 'exact', head: true })
        .gte('updated_at', offlineCutoff),
      supabaseService
        .from('driver_location_history')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    ]);

    const fallbackRecommended =
      new Date().getDate() < 20 && env.DRIVER_MAP_EGRESS_PERCENT >= 80;

    return {
      updatesLastMinute: updatesLastMinute || 0,
      onlineDrivers: onlineDrivers || 0,
      historyRowsToday: historyRowsToday || 0,
      realtimeEnabled: env.DRIVER_MAP_REALTIME_ENABLED === 'true',
      egressPercent: env.DRIVER_MAP_EGRESS_PERCENT,
      fallbackRecommended,
      fallbackRule: 'If egress exceeds 80% before day 20, disable DRIVER_MAP_REALTIME_ENABLED and poll every 20s.',
    };
  }

  static getClientConfig() {
    return {
      realtimeEnabled: env.DRIVER_MAP_REALTIME_ENABLED === 'true',
      pollingIntervalMs: 20_000,
      offlineAfterSeconds: env.DRIVER_OFFLINE_AFTER_SECONDS,
      supabaseUrl: env.SUPABASE_URL,
      supabaseAnonKey: env.SUPABASE_ANON_KEY,
    };
  }

  static async cleanupHistory() {
    const { data, error } = await supabaseService.rpc('cleanup_old_driver_location_history', {
      retention_days: env.DRIVER_LOCATION_RETENTION_DAYS,
    });
    if (error) throw new Error(error.message);
    return { deletedRows: data || 0 };
  }
}
