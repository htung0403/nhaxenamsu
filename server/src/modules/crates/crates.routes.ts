import { Router } from 'express';
import { CratesController } from './crates.controller';
import { authMiddleware } from '../../middlewares/auth';
import { requirePolicy } from '../../middlewares/role';

const router = Router();

router.use(authMiddleware);
router.use(requirePolicy('PRODUCTS_DELIVERY_ACCESS', 'CUSTOMERS_DIRECTORY_READ'));

router.get('/accounts', CratesController.listAccounts);
router.put('/accounts/roles', CratesController.setRoles);
router.post('/intakes', CratesController.createIntake);
router.post('/allocations', CratesController.createAllocation);
router.post('/deliveries', CratesController.createDelivery);
router.post('/deliveries/revert', CratesController.revertDeliveries);
router.get('/history', CratesController.getHistory);
router.get('/receipts/:type/:id', CratesController.getReceipt);
router.post('/receipts/:type/:id/resend-zalo', CratesController.resendNotification);

export default router;
