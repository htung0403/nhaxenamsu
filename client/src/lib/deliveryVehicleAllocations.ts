import type { DeliveryOrder, DeliveryVehicle } from '../types';

export const getDeliveryVehicleUnitPrice = (
  vehicle: DeliveryVehicle & { unit_price?: number },
  fallbackPrice = 0,
  sourceOrders: DeliveryOrder[] = [],
): number => {
  if (vehicle.unit_price != null && Number.isFinite(Number(vehicle.unit_price))) return Number(vehicle.unit_price);
  const quantity = Number(vehicle.assigned_quantity);
  const amount = Number(vehicle.expected_amount);
  if (quantity > 0 && amount > 0 && Number.isFinite(quantity) && Number.isFinite(amount)) {
    return amount / quantity / 1000;
  }
  const sourceOrder = sourceOrders.find(source => source.id === vehicle.delivery_order_id);
  return Number(sourceOrder?.unit_price ?? fallbackPrice) || 0;
};

export const getDeliveryVehicleAllocationKey = (vehicle: DeliveryVehicle): string => {
  if (!vehicle.allocation_group_id) return `trip:${vehicle.id}`;
  return JSON.stringify([
    vehicle.allocation_group_id,
    vehicle.vehicle_id,
    vehicle.driver_id,
    vehicle.loader_name,
    vehicle.delivery_date,
    vehicle.delivery_time,
    vehicle.export_payment_status,
    vehicle.status,
  ]);
};

export const groupDeliveryVehicleAllocations = <Vehicle extends DeliveryVehicle>(vehicles: Vehicle[]): Vehicle[] => {
  const groups = new Map<string, Vehicle>();
  const result: Vehicle[] = [];

  vehicles.forEach((vehicle) => {
    if (!vehicle.allocation_group_id) {
      result.push(vehicle);
      return;
    }

    const key = getDeliveryVehicleAllocationKey(vehicle);
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
