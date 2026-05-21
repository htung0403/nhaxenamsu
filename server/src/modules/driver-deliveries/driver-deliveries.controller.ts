import { Request, Response } from 'express';
import { z } from 'zod';
import { successResponse, errorResponse } from '../../utils/response';
import { goodsScopeIsDriverRole } from '../../utils/goodsScope';
import { DriverDeliveriesService } from './driver-deliveries.service';

const startTripSchema = z.object({
  deliveryVehicleIds: z.array(z.string().uuid()).min(1),
});

const completeSchema = z.object({
  image_urls: z.array(z.string().url()).min(1),
});

const assertDriver = (req: Request) => {
  if (!req.user || !goodsScopeIsDriverRole(req.user.role)) {
    throw new Error('Chỉ tài xế được thao tác chuyến giao');
  }
  return req.user.id;
};

export class DriverDeliveriesController {
  static async getMyAssignments(req: Request, res: Response) {
    try {
      const driverId = assertDriver(req);
      const data = await DriverDeliveriesService.getMyAssignments(driverId);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async startTrip(req: Request, res: Response) {
    try {
      const driverId = assertDriver(req);
      const { deliveryVehicleIds } = startTripSchema.parse(req.body);
      const data = await DriverDeliveriesService.startTrip(driverId, deliveryVehicleIds);
      return res.status(200).json(successResponse(data, 'Đã bắt đầu chuyến giao'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async completeAssignment(req: Request, res: Response) {
    try {
      const driverId = assertDriver(req);
      const { image_urls } = completeSchema.parse(req.body);
      const data = await DriverDeliveriesService.completeAssignment(driverId, req.params.deliveryVehicleId, image_urls);
      return res.status(200).json(successResponse(data, 'Đã xác nhận giao thành công'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }
}
