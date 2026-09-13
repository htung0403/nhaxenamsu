import { describe, expect, it } from 'vitest';

import { getDeliveryRemainingQty, getEffectiveDeliveryStatus } from './deliveryAgeRule';
import type { DeliveryOrder, DeliveryVehicle } from '../types';

const makeOrder = (overrides: Partial<DeliveryOrder> = {}): DeliveryOrder => ({
  id: 'delivery-1',
  product_name: 'Bao',
  total_quantity: 10,
  delivered_quantity: 0,
  remaining_quantity: 10,
  status: 'can_giao',
  created_at: '2026-08-04T00:00:00.000Z',
  updated_at: '2026-08-04T00:00:00.000Z',
  delivery_vehicles: [],
  ...overrides,
});

describe('deliveryAgeRule', () => {
  it('keeps orders with remaining quantity in can_giao', () => {
    const order = makeOrder({
      delivery_vehicles: [{ assigned_quantity: 5 } as DeliveryVehicle],
    });

    expect(getDeliveryRemainingQty(order)).toBe(5);
    expect(getEffectiveDeliveryStatus(order)).toBe('can_giao');
  });

  it('moves fully assigned can_giao orders out of can_giao', () => {
    const order = makeOrder({
      delivery_vehicles: [
        { assigned_quantity: 5 } as DeliveryVehicle,
        { assigned_quantity: 5 } as DeliveryVehicle,
      ],
    });

    expect(getDeliveryRemainingQty(order)).toBe(0);
    expect(getEffectiveDeliveryStatus(order)).toBe('da_giao');
  });

  it('keeps warehouse orders in hang_o_sg regardless of assignment quantity', () => {
    const order = makeOrder({
      status: 'hang_o_sg',
      delivery_vehicles: [{ assigned_quantity: 10 } as DeliveryVehicle],
    });

    expect(getEffectiveDeliveryStatus(order)).toBe('hang_o_sg');
  });
});
