import { Router } from 'express';
import { orderReadMetrics } from '../../middlewares/orderReadMetrics';
import { ImportOrderController } from './import-orders.controller';
import { authMiddleware } from '../../middlewares/auth';
import { requireGroceryAccess } from '../../middlewares/groceryDirection';
import { requireRolesOnly } from '../../middlewares/role';

import type { OrderCategory } from '../../types/order-category';
import type { ImportOrderOperations } from './category-order.service';

export function createImportOrderRouter(category?: OrderCategory, service?: ImportOrderOperations) {
  const router = Router();
  router.use(orderReadMetrics(category ? `${category}-orders` : 'import-orders'));

  router.use(authMiddleware);
  router.use((_req, res, next) => {
    if (service) res.locals.importOrderService = service;
    next();
  });
  router.use(requireGroceryAccess('import', category));

  router.get('/', ImportOrderController.getAll);
  router.get('/daily-sequence', ImportOrderController.getNextSequence);
  router.get('/:id', ImportOrderController.getById);
  router.post('/', ImportOrderController.create);
  router.put('/:id', ImportOrderController.update);
  router.patch('/:id/admin-confirm', requireRolesOnly('admin'), ImportOrderController.confirmByAdmin);
  router.delete('/:id', ImportOrderController.delete);
  return router;
}

export default createImportOrderRouter();
