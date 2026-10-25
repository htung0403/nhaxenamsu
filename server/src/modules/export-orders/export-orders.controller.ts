import { Request, Response } from 'express';
import { ExportOrderService } from './export-orders.service';
import { successResponse, errorResponse } from '../../utils/response';
import { z } from 'zod';

const exportOrderSchema = z.object({
  export_date: z.string().min(1, 'Ngày xuất không được để trống'),
  export_time: z.string().optional(),
  product_id: z.string().min(1, 'Hàng hóa không hợp lệ'),
  product_name: z.string().optional(),
  quantity: z.number().positive('Số lượng phải lớn hơn 0'),
  customer_id: z.string().uuid('Khách hàng không hợp lệ'),
  debt_amount: z.number().min(0, 'Công nợ không được âm').optional(),
  payment_status: z.enum(['unpaid', 'partial', 'paid']).optional(),
  paid_amount: z.number().optional(),
});

const paymentUpdateSchema = z.object({
  paid_amount: z.number(),
  status: z.enum(['unpaid', 'partial', 'paid']),
});

export class ExportOrderController {
  static async getAll(req: Request, res: Response) {
    try {
      const { page, limit, date, customer_id } = req.query;
      console.log('[ExportOrderController.getAll] User:', req.user?.id, 'Role:', req.user?.role);
      console.log('[ExportOrderController.getAll] Query params:', { page, limit, date, customer_id });
      const { data, meta } = await ExportOrderService.getAll({ ...req.query, allowedDirections: res.locals.groceryDirections }, req.user);
      console.log('[ExportOrderController.getAll] Success, rows:', data?.length ?? 0, 'total:', meta?.total);
      return res.status(200).json(successResponse(data, undefined, meta));
    } catch (err: any) {
      console.error('[ExportOrderController.getAll] ERROR:', err);
      console.error('[ExportOrderController.getAll] Error message:', err.message);
      console.error('[ExportOrderController.getAll] Error details:', JSON.stringify(err, null, 2));
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const validated = exportOrderSchema.parse(req.body);
      const data = await ExportOrderService.create(validated, req.user!.id);
      return res.status(201).json(successResponse(data, 'Export order tracked'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async bulkDelete(req: Request, res: Response) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json(errorResponse('Danh sách ID không hợp lệ'));
      }
      const data = await ExportOrderService.bulkDelete(ids);
      return res.status(200).json(successResponse(data, 'Đã xóa đơn xuất hàng'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async updatePayment(req: Request, res: Response) {
    try {
      const validated = paymentUpdateSchema.parse(req.body);
      const data = await ExportOrderService.updatePayment(req.params.id as string, validated as any);
      return res.status(200).json(successResponse(data, 'Payment updated'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }
}
