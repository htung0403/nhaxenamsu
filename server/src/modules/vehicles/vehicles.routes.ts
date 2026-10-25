import { Router } from 'express';
import { VehicleController } from './vehicles.controller';
import { authMiddleware } from '../../middlewares/auth';
import { requirePolicy } from '../../middlewares/role';

const router = Router();

router.use(authMiddleware);
router.get('/', requirePolicy('VEHICLES_OPERATIONS', 'VEHICLES_LOOKUP_READ'), VehicleController.getAll);
router.use(requirePolicy('VEHICLES_OPERATIONS'));
router.post('/', VehicleController.create);
router.put('/:id', VehicleController.update);
router.post('/:id/checkin', VehicleController.checkin);
router.get('/:id/checkins', VehicleController.getCheckins);
router.get('/:id/assignments', VehicleController.getAssignments);
router.delete('/:id', VehicleController.delete);

export default router;
