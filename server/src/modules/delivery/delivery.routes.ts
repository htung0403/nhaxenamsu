import { Router } from 'express';
import { orderReadMetrics } from '../../middlewares/orderReadMetrics';
import { deliveryJsonCompression } from '../../middlewares/deliveryJsonCompression';
import { markOrderReadPhase } from '../../utils/orderReadMetrics';
import { DeliveryController } from './delivery.controller';
import { authMiddleware } from '../../middlewares/auth';
import { requireGroceryAccess } from '../../middlewares/groceryDirection';

import type { OrderCategory } from '../../types/order-category';
import type { DeliveryQueries } from './category-delivery.service';

export function createDeliveryRouter(category?: OrderCategory, service?: DeliveryQueries) {
  const router = Router();
  router.use(orderReadMetrics(category ? `${category}-deliveries` : 'delivery'));

  router.use(authMiddleware);
  router.use((_req, res, next) => {
    markOrderReadPhase('auth');
    if (service) res.locals.deliveryQueryService = service;
    next();
  });
  router.use(requireGroceryAccess('delivery', category));
  router.use((_req, _res, next) => {
    markOrderReadPhase('access');
    next();
  });

  router.get('/', deliveryJsonCompression, DeliveryController.getAllToday);
  router.get('/inventory', deliveryJsonCompression, DeliveryController.getInventory);
  router.post('/', DeliveryController.create);
  router.put('/confirm', DeliveryController.confirmOrders);
  router.put('/warehouse-confirm', DeliveryController.confirmWarehouse);
  router.put('/:id/assign-vehicle', DeliveryController.assignVehicle);
  router.put('/:id/update-qty', DeliveryController.updateQty);
  router.put('/:id/revert-vehicle', DeliveryController.revertVehicle);
  router.put('/:id', DeliveryController.update);
  router.post('/delete', DeliveryController.deleteOrders);
  return router;
}

export default createDeliveryRouter();
