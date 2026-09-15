import { Request, Response } from 'express';
import { z } from 'zod';
import { successResponse, errorResponse } from '../../utils/response';
import { CratesService, CrateReceiptType } from './crates.service';

const uuidSchema = z.string().uuid();
const roleSchema = z.enum(['sender', 'receiver']);
const receiptTypeSchema = z.enum(['intake', 'allocation', 'delivery']);
const dateQuerySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD');

const historyQuerySchema = z.object({
  customer_id: uuidSchema.optional(),
  start_date: dateQuerySchema.optional(),
  end_date: dateQuerySchema.optional(),
});

const setRolesSchema = z.object({
  customer_ids: z.array(uuidSchema).min(1),
  role: roleSchema,
  enabled: z.boolean().default(true),
});

const intakeSchema = z.object({
  sender_customer_id: uuidSchema,
  quantity: z.number().int().positive(),
  notes: z.string().optional().nullable(),
});

const allocationSchema = z.object({
  sender_customer_id: uuidSchema,
  receiver_customer_id: uuidSchema,
  quantity: z.number().int().positive(),
  notes: z.string().optional().nullable(),
});

const deliverySchema = z.object({
  receiver_customer_id: uuidSchema,
  quantity: z.number().int().positive(),
  notes: z.string().optional().nullable(),
  image_urls: z.array(z.string().url()).optional().default([]),
  vehicle_id: uuidSchema.optional().nullable(),
});

export class CratesController {
  static async listAccounts(req: Request, res: Response) {
    try {
      const role = req.query.role ? roleSchema.parse(req.query.role) : undefined;
      const data = await CratesService.listAccounts(role);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async setRoles(req: Request, res: Response) {
    try {
      const payload = setRolesSchema.parse(req.body);
      const data = await CratesService.setRoles(payload.customer_ids, payload.role, payload.enabled);
      return res.status(200).json(successResponse(data, 'Đã cập nhật danh sách khách két'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async createIntake(req: Request, res: Response) {
    try {
      const payload = intakeSchema.parse(req.body) as { sender_customer_id: string; quantity: number; notes?: string | null };
      const data = await CratesService.createIntake(payload, req.user?.id);
      return res.status(201).json(successResponse(data, 'Đã nhập két'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async createAllocation(req: Request, res: Response) {
    try {
      const payload = allocationSchema.parse(req.body) as { sender_customer_id: string; receiver_customer_id: string; quantity: number; notes?: string | null };
      const data = await CratesService.createAllocation(payload, req.user?.id);
      return res.status(201).json(successResponse(data, 'Đã chia két'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async createDelivery(req: Request, res: Response) {
    try {
      const payload = deliverySchema.parse(req.body) as { receiver_customer_id: string; quantity: number; notes?: string | null; image_urls?: string[]; vehicle_id?: string | null };
      const data = await CratesService.createDelivery(payload, req.user);
      return res.status(201).json(successResponse(data, 'Đã giao két'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getHistory(req: Request, res: Response) {
    try {
      const query = historyQuerySchema.parse(req.query);
      const data = await CratesService.getHistory(query.customer_id, {
        startDate: query.start_date,
        endDate: query.end_date,
      });
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getReceipt(req: Request, res: Response) {
    try {
      const type = receiptTypeSchema.parse(req.params.type) as CrateReceiptType;
      const transactionId = uuidSchema.parse(req.params.id);
      const data = await CratesService.getReceipt(type, transactionId);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async resendNotification(req: Request, res: Response) {
    try {
      const type = receiptTypeSchema.parse(req.params.type) as CrateReceiptType;
      const transactionId = uuidSchema.parse(req.params.id);
      const targetCustomerId = req.body?.target_customer_id ? uuidSchema.parse(req.body.target_customer_id) : undefined;
      const data = await CratesService.resendNotification(type, transactionId, targetCustomerId, req.user?.id);
      return res.status(200).json(successResponse(data, 'Đã gửi lại phiếu Zalo'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }
}




