import { Request, Response } from 'express';
import { z } from 'zod';
import { AccountingService } from './accounting.service';
import { SgImportCashService } from './sg-import-cash.service';
import { successResponse, errorResponse } from '../../utils/response';

const vehicleDebtPaymentSchema = z.object({
  paid_at: z.string().min(1, 'Vui lòng chọn ngày giờ trả tiền'),
  quantity: z.number().min(0.000001, 'Vui lòng nhập số lượng/số tiền'),
  unit_price: z.number().min(0, 'Đơn giá không hợp lệ'),
  paid_amount: z.number().min(1, 'Thành tiền phải lớn hơn 0'),
  notes: z.string().optional(),
});

const bulkVehicleDebtPaymentSchema = z.object({
  items: z.array(z.object({
    delivery_vehicle_id: z.string().uuid(),
    paid_at: z.string().min(1, 'Vui lòng chọn ngày giờ trả tiền'),
    quantity: z.number().min(0.000001, 'Vui lòng nhập số lượng/số tiền'),
    unit_price: z.number().min(0, 'Đơn giá không hợp lệ'),
    paid_amount: z.number().min(1, 'Thành tiền phải lớn hơn 0'),
    notes: z.string().optional(),
  })).min(1, 'Vui lòng chọn ít nhất 1 đơn'),
});

export class AccountingController {
  static async getDebts(req: Request, res: Response) {
    try {
      const data = await AccountingService.getDebts();
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getRevenueByDate(req: Request, res: Response) {
    try {
      const from = req.query.from as string;
      const to = req.query.to as string;
      const data = await AccountingService.getRevenueByDate(from, to);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getRevenueByVehicle(req: Request, res: Response) {
    try {
      const date = req.query.date as string;
      const data = await AccountingService.getRevenueByVehicle(date);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getVehicleDebts(req: Request, res: Response) {
    try {
      const customerType = req.query.customerType as 'loyal' | 'grocery_non_loyal' | undefined;
      if (customerType !== 'loyal' && customerType !== 'grocery_non_loyal') {
        return res.status(400).json(errorResponse('Loại khách hàng không hợp lệ'));
      }

      const data = await AccountingService.getVehicleDebts(customerType);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getVehicleDebtPayments(req: Request, res: Response) {
    try {
      const customerType = req.query.customerType as 'loyal' | 'grocery_non_loyal' | undefined;
      if (customerType !== 'loyal' && customerType !== 'grocery_non_loyal') {
        return res.status(400).json(errorResponse('Loại khách hàng không hợp lệ'));
      }

      const data = await AccountingService.getVehicleDebtPayments(customerType);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async recordVehicleDebtPayment(req: Request, res: Response) {
    try {
      const validated = vehicleDebtPaymentSchema.parse(req.body);
      const data = await AccountingService.recordVehicleDebtPayment(req.params.id, validated as any, req.user?.id);
      return res.status(200).json(successResponse(data, 'Đã ghi nhận tiền trả'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async recordVehicleDebtPayments(req: Request, res: Response) {
    try {
      const validated = bulkVehicleDebtPaymentSchema.parse(req.body);
      const data = await AccountingService.recordVehicleDebtPayments(validated.items as any, req.user?.id);
      return res.status(200).json(successResponse(data, `Đã ghi nhận ${data.length} khoản trả tiền`));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async updateVehicleDebtPayment(req: Request, res: Response) {
    try {
      const validated = vehicleDebtPaymentSchema.parse(req.body);
      const data = await AccountingService.updateVehicleDebtPayment(req.params.id, validated as any, req.user?.id);
      return res.status(200).json(successResponse(data, 'Đã cập nhật lịch sử nhập tiền'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async listSgImportCash(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json(errorResponse('Authentication required', 'UNAUTHORIZED'));
      }
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const data = await SgImportCashService.list(req.user.id, req.user.role, { from, to });
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getSgImportCashDetail(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json(errorResponse('Authentication required', 'UNAUTHORIZED'));
      }
      const { id } = req.params;
      const data = await SgImportCashService.getPaidImportDetail(id, req.user);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async confirmSgHandover(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json(errorResponse('Authentication required', 'UNAUTHORIZED'));
      }
      const { id } = req.params;
      const result = await SgImportCashService.confirmHandover(id, req.user.id);
      return res.status(200).json(successResponse(result));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async bulkConfirmSgHandover(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json(errorResponse('Authentication required', 'UNAUTHORIZED'));
      }
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json(errorResponse('Vui lòng chọn ít nhất 1 phiếu'));
      }
      const result = await SgImportCashService.bulkConfirmHandover(ids, req.user.id);
      return res.status(200).json(successResponse(result, `Đã xác nhận ${result.updated} phiếu`));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getInvoiceOrders(req: Request, res: Response) {
    try {
      const category = (req.query.category as string) || 'standard';
      const filters = {
        category: category as 'standard' | 'vegetable',
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        customer_id: req.query.customer_id as string | undefined,
        invoice_status: (req.query.invoice_status as 'all' | 'exported' | 'not_exported') || 'all',
      };
      const data = await AccountingService.getInvoiceOrders(filters);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async bulkMarkInvoiceExported(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json(errorResponse('Authentication required', 'UNAUTHORIZED'));
      }
      const { ids, category, exported } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json(errorResponse('Vui lòng chọn ít nhất 1 đơn hàng'));
      }
      const result = await AccountingService.bulkMarkInvoiceExported(
        ids,
        category || 'standard',
        req.user.id,
        exported !== undefined ? exported : true,
      );
      return res.status(200).json(successResponse(result, `Đã cập nhật ${result.updated} đơn hàng`));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }
}
