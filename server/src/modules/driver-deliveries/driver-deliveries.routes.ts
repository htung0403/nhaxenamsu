import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { DriverDeliveriesController } from './driver-deliveries.controller';

const router = Router();

router.use(authMiddleware);

router.get('/my-assignments', DriverDeliveriesController.getMyAssignments);
router.post('/start-trip', DriverDeliveriesController.startTrip);
router.post('/:deliveryVehicleId/complete', DriverDeliveriesController.completeAssignment);

export default router;
