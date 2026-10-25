import type { UserPayload } from '../../types';
import type { OrderCategory } from '../../types/order-category';
import { ImportOrderService } from './import-orders.service';
import { listImportOrders } from './import-order-list';

export type ImportOrderOperations = Pick<typeof ImportOrderService,
  'getAll' | 'getById' | 'create' | 'update' | 'delete' | 'generateOrderCode' | 'confirmByAdmin'>;

export function createCategoryOrderService(category: OrderCategory): ImportOrderOperations {
  return {
    getAll: (filters: Record<string, unknown>, actor?: UserPayload) =>
      listImportOrders({ ...filters, order_category: category }, actor),
    getById: (id: string, actor?: UserPayload) => ImportOrderService.getById(id, actor, category),
    create: (payload: Record<string, unknown>, userId: string) =>
      ImportOrderService.create({ ...payload, order_category: category }, userId),
    update: (id: string, payload: Record<string, unknown>) =>
      ImportOrderService.update(id, { ...payload, order_category: category }, category),
    delete: (id: string) => ImportOrderService.delete(id, category),
    generateOrderCode: (date: string) => ImportOrderService.generateOrderCode(date, category === 'vegetable'),
    confirmByAdmin: (id: string, userId: string) => ImportOrderService.confirmByAdmin(id, userId, category),
  };
}
