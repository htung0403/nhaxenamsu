import { Request, Response } from 'express';
import { z } from 'zod';
import { DriverTrackingService, type DriverLocationInput } from './driver-tracking.service';
import { driverTrackingMetrics } from './driver-tracking.metrics';
import { successResponse, errorResponse } from '../../utils/response';
import { goodsScopeIsDriverRole } from '../../utils/goodsScope';

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().nonnegative().optional(),
  speed_mps: z.number().nonnegative().optional(),
  heading: z.number().min(0).max(360).optional(),
  battery_level: z.number().int().min(0).max(100).optional(),
  recorded_at: z.string().datetime().optional(),
  status: z.enum(['online', 'offline', 'dang_giao']).optional(),
});

const historyQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  deliveryVehicleId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export class DriverTrackingController {
  static async recordLocation(req: Request, res: Response) {
    try {
      if (!req.user || !goodsScopeIsDriverRole(req.user.role)) {
        return res.status(403).json(errorResponse('Chỉ tài xế được cập nhật vị trí', 'FORBIDDEN'));
      }

      const payload = locationSchema.parse(req.body) as DriverLocationInput;
      const result = await DriverTrackingService.recordLocation(req.user.id, payload);

      if (result.skipped) {
        driverTrackingMetrics.incrementSkipped();
        return res.status(200).json(successResponse(result, 'Location skipped by write threshold'));
      }

      driverTrackingMetrics.incrementAccepted();
      return res.status(201).json(successResponse(result.location, 'Location recorded'));
    } catch (err: any) {
      driverTrackingMetrics.incrementError();
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getLatest(req: Request, res: Response) {
    try {
      const data = await DriverTrackingService.getLatestLocations();
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      driverTrackingMetrics.incrementError();
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getHistory(req: Request, res: Response) {
    try {
      const query = historyQuerySchema.parse(req.query);
      const data = await DriverTrackingService.getHistory({
        driverId: req.params.driverId as string,
        ...query,
      });
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      driverTrackingMetrics.incrementError();
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getHealth(req: Request, res: Response) {
    try {
      const dbMetrics = await DriverTrackingService.getHealthMetrics();
      return res.status(200).json(successResponse({
        ...dbMetrics,
        counters: driverTrackingMetrics.snapshot(),
      }));
    } catch (err: any) {
      driverTrackingMetrics.incrementError();
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getConfig(req: Request, res: Response) {
    try {
      return res.status(200).json(successResponse(DriverTrackingService.getClientConfig()));
    } catch (err: any) {
      driverTrackingMetrics.incrementError();
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async cleanupHistory(req: Request, res: Response) {
    try {
      const data = await DriverTrackingService.cleanupHistory();
      return res.status(200).json(successResponse(data, 'Driver location history cleanup completed'));
    } catch (err: any) {
      driverTrackingMetrics.incrementError();
      return res.status(400).json(errorResponse(err.message));
    }
  }
}
