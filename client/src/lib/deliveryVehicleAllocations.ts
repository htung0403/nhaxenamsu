import type { DeliveryVehicle } from '../types';

export const groupDeliveryVehicleAllocations = <Vehicle extends DeliveryVehicle>(vehicles: Vehicle[]): Vehicle[] => {
  const groups = new Map<string, Vehicle>();
  const result: Vehicle[] = [];

  vehicles.forEach((vehicle) => {
    if (!vehicle.allocation_group_id) {
      result.push(vehicle);
      return;
    }

    const key = JSON.stringify([
      vehicle.allocation_group_id,
      vehicle.vehicle_id,
      vehicle.driver_id,
      vehicle.loader_name,
      vehicle.delivery_date,
      vehicle.delivery_time,
      vehicle.export_payment_status,
      vehicle.status,
    ]);
    const existing = groups.get(key);
    if (existing) {
      existing.assigned_quantity = Number(existing.assigned_quantity || 0) + Number(vehicle.assigned_quantity || 0);
      existing.expected_amount = Number(existing.expected_amount || 0) + Number(vehicle.expected_amount || 0);
      existing.image_urls = [...new Set([...(existing.image_urls || []), ...(vehicle.image_urls || [])])];
    } else {
      const merged = { ...vehicle, image_urls: [...(vehicle.image_urls || [])] };
      groups.set(key, merged);
      result.push(merged);
    }
  });

  return result;
};
