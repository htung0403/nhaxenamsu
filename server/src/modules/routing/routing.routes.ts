import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { RoutingController } from './routing.controller';

const router = Router();

router.use(authMiddleware);

router.post('/directions', RoutingController.getDirections);

export default router;
