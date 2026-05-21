import { Request, Response } from 'express';
import { z } from 'zod';
import { successResponse, errorResponse } from '../../utils/response';
import { goodsScopeFullAccess, goodsScopeIsDriverRole } from '../../utils/goodsScope';
import { RoutingService, type DirectionsInput } from './routing.service';

const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const directionsSchema = z.object({
  origin: coordinateSchema,
  destination: coordinateSchema,
});

const assertCanRoute = (req: Request) => {
  const role = req.user?.role;
  if (!req.user || (!goodsScopeIsDriverRole(role) && !goodsScopeFullAccess(role))) {
    throw new Error('Bạn không có quyền tính chỉ dẫn đường');
  }
};

export class RoutingController {
  static async getDirections(req: Request, res: Response) {
    try {
      assertCanRoute(req);
      const input = directionsSchema.parse(req.body) as DirectionsInput;
      const data = await RoutingService.getDirections(input);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message || 'Không tính được đường đi'));
    }
  }
}
