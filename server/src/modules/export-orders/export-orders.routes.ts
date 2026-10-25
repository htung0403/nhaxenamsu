import { Router } from 'express';
import { orderReadMetrics } from '../../middlewares/orderReadMetrics';
import { ExportOrderController } from './export-orders.controller';
import { authMiddleware } from '../../middlewares/auth';
import { requireGroceryAccess } from '../../middlewares/groceryDirection';

const router = Router();
router.use(orderReadMetrics('export-orders'));

router.use(authMiddleware);
router.use(requireGroceryAccess('export'));

router.get('/', ExportOrderController.getAll);
router.post('/', ExportOrderController.create);
router.put('/:id/payment', ExportOrderController.updatePayment);
router.post('/bulk-delete', ExportOrderController.bulkDelete);

export default router;
