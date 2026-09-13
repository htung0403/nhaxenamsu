import { describe, expect, it } from 'vitest';

import { groupDeliveryOrdersForView } from './deliveryGrouping';
import type { DeliveryOrder } from '../types';

const makeOrder = (overrides: Partial<DeliveryOrder>): DeliveryOrder => ({
  id: 'order-1',
  product_name: 'Kiện A',
  total_quantity: 1,
  delivered_quantity: 0,
  remaining_quantity: 1,
  order_category: 'standard',
  status: 'can_giao',
  delivery_date: '2026-08-04',
  created_at: '2026-08-04T00:00:00.000Z',
  updated_at: '2026-08-04T00:00:00.000Z',
  import_orders: {
    order_code: 'IO-1',
    sender_name: 'Người gửi',
    receiver_name: 'Người nhận',
    total_amount: 100000,
    payment_status: 'unpaid',
  },
  ...overrides,
});

describe('groupDeliveryOrdersForView', () => {
  it('merges same receiver and package orders when SG freight is unpaid', () => {
    const grouped = groupDeliveryOrdersForView([
      makeOrder({ id: 'order-1', created_at: '2026-08-04T01:00:00.000Z' }),
      makeOrder({ id: 'order-2', total_quantity: 2, created_at: '2026-08-04T02:00:00.000Z' }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].total_quantity).toBe(3);
    expect(grouped[0].source_order_ids).toEqual(['order-1', 'order-2']);
  });

  it('keeps SG warehouse orders separate', () => {
    const grouped = groupDeliveryOrdersForView([
      makeOrder({ id: 'order-1', status: 'hang_o_sg', created_at: '2026-08-04T01:00:00.000Z' }),
      makeOrder({ id: 'order-2', status: 'hang_o_sg', created_at: '2026-08-04T02:00:00.000Z' }),
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped.map((order) => order.source_order_ids)).toEqual([['order-1'], ['order-2']]);
  });

  it('still merges same receiver and package orders when SG freight is paid', () => {
    const grouped = groupDeliveryOrdersForView([
      makeOrder({
        id: 'order-1',
        total_quantity: 2,
        import_orders: {
          order_code: 'IO-1',
          sender_name: 'Người gửi',
          receiver_name: 'Người nhận',
          total_amount: 100000,
          payment_status: 'paid',
        },
      }),
      makeOrder({
        id: 'order-2',
        total_quantity: 3,
        created_at: '2026-08-04T02:00:00.000Z',
        import_orders: {
          order_code: 'IO-2',
          sender_name: 'Người gửi',
          receiver_name: 'Người nhận',
          total_amount: 100000,
          payment_status: 'paid',
        },
      }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].total_quantity).toBe(5);
    expect(grouped[0].source_order_ids).toEqual(['order-1', 'order-2']);
  });
});
