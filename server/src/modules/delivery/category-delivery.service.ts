import type { UserPayload } from '../../types';
import type { OrderCategory } from '../../types/order-category';
import type { GroceryDirection } from '../../utils/groceryDirection';
import { listDeliveryInventory, listDeliveryOrders } from './delivery-queries';

export function createCategoryDeliveryService(category: OrderCategory) {
  return {
    getAllToday: (startDate?: string, endDate?: string, _category?: string, actor?: UserPayload, directions?: readonly GroceryDirection[], includeExportPaymentStatus = true) =>
      listDeliveryOrders(startDate, endDate, category, actor, category === 'standard' ? directions : undefined, includeExportPaymentStatus),
    getInventory: (_category?: string, actor?: UserPayload, directions?: readonly GroceryDirection[]) =>
      listDeliveryInventory(category, actor, category === 'standard' ? directions : undefined),
  };
}

export type DeliveryQueries = ReturnType<typeof createCategoryDeliveryService>;
