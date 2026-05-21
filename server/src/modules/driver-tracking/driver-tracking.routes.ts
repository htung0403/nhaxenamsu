import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/role';
import { DriverTrackingController } from './driver-tracking.controller';
import { driverTrackingMetrics } from './driver-tracking.metrics';
import { errorResponse } from '../../utils/response';

const router = Router();

router.use(authMiddleware);

const driverLocationRateLimit = rateLimit({
  windowMs: 5_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip || 'unknown-driver',
  handler: (_req, res) => {
    driverTrackingMetrics.incrementRateLimited();
    return res
      .status(429)
      .json(errorResponse('Gửi vị trí quá nhanh. Vui lòng thử lại sau vài giây.', 'DRIVER_LOCATION_RATE_LIMITED'));
  },
});

// Middleware rate limit: 1 request/5s/driver protects the request layer from buggy/spammy driver apps.
router.post('/location', driverLocationRateLimit, DriverTrackingController.recordLocation);

router.get('/latest', requireRole('manager'), DriverTrackingController.getLatest);
router.get('/config', requireRole('manager'), DriverTrackingController.getConfig);
router.get('/health', requireRole('manager'), DriverTrackingController.getHealth);
router.post('/cleanup-history', requireRole('manager'), DriverTrackingController.cleanupHistory);
router.get('/:driverId/history', requireRole('manager'), DriverTrackingController.getHistory);

export default router;
