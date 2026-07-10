import { Request, Response } from 'express';
import { PaymentCollectionsService } from './payment-collections.service';
import { successResponse, errorResponse } from '../../utils/response';
import { z } from 'zod';

const createSchema = z.object({
  deliveryOrderId: z.string().uuid(),
  sourceOrderIds: z.array(z.string().uuid()).optional(),
  collectedAmount: z.number().min(0),
  collectedAt: z.string(),
  notes: z.string().optional(),
  imageUrl: z.string().optional()
});

const updateSchema = z.object({
  collectedAmount: z.number().min(0).optional(),
  collectedAt: z.string().optional(),
  expectedAmount: z.number().min(0).optional(),
  pricePerPackage: z.number().min(0).optional(),
  totalPackages: z.number().min(0).optional(),
  notes: z.string().optional(),
  imageUrl: z.string().nullable().optional()
});

const submitSchema = z.object({
  receiverId: z.string().uuid(),
  receiverType: z.enum(['staff', 'manager']),
  submittedAt: z.string(),
  notes: z.string().optional()
});

const selfConfirmSchema = z.object({
  reason: z.string().min(1)
});

const confirmSchema = z.object({
  confirmedAt: z.string(),
  notes: z.string().optional()
});

export class PaymentCollectionsController {
  static async getAll(req: Request, res: Response) {
    try {
      const { role, id } = req.user!;
      const filters: any = { ...req.query };
      
      // Auto filter by role
      if (role === 'driver') {
        filters.driverId = id;
      }
      
      const data = await PaymentCollectionsService.getPaymentCollections(filters);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getSummaryByVehicle(req: Request, res: Response) {
    try {
      const data = await PaymentCollectionsService.getCollectionSummaryByVehicle(req.query);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const data = await PaymentCollectionsService.getPaymentCollectionById(req.params.id as string);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(404).json(errorResponse(err.message));
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const validated = createSchema.parse(req.body) as any;
      const data = await PaymentCollectionsService.createPaymentCollection(validated, req.user!.id);
      return res.status(201).json(successResponse(data, 'Đã tạo phiếu thu'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const validated = updateSchema.parse(req.body);
      const data = await PaymentCollectionsService.updatePaymentCollection(req.params.id as string, validated, req.user!);
      return res.status(200).json(successResponse(data, 'Đã cập nhật phiếu thu'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async submit(req: Request, res: Response) {
    try {
      const validated = submitSchema.parse(req.body) as any;
      const data = await PaymentCollectionsService.submitPaymentCollection(req.params.id as string, validated, req.user!);
      return res.status(200).json(successResponse(data, 'Đã nộp tiền thành công'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async selfConfirm(req: Request, res: Response) {
    try {
      const validated = selfConfirmSchema.parse(req.body);
      const data = await PaymentCollectionsService.selfConfirmPaymentCollection(req.params.id as string, validated.reason, req.user!.id);
      return res.status(200).json(successResponse(data, 'Tự xác nhận thành công'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async confirm(req: Request, res: Response) {
    try {
      const validated = confirmSchema.parse(req.body) as any;
      const data = await PaymentCollectionsService.confirmPaymentCollection(req.params.id as string, validated, req.user!.id);
      return res.status(200).json(successResponse(data, 'Đã xác nhận nhận tiền'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async revert(req: Request, res: Response) {
    try {
      const data = await PaymentCollectionsService.revertToDraft(req.params.id as string, req.user!.id);
      return res.status(200).json(successResponse(data, 'Đã hủy nộp'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }
}
