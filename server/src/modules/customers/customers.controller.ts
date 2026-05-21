import { Request, Response } from 'express';
import { CustomerService } from './customers.service';
import { GeocodingService } from './geocoding.service';
import { successResponse, errorResponse } from '../../utils/response';
import { z } from 'zod';

const createCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  customer_type: z.enum(['retail', 'wholesale', 'grocery', 'vegetable', 'grocery_sender', 'grocery_receiver', 'vegetable_sender', 'vegetable_receiver']).default('retail'),
  user_id: z.string().uuid().optional(),
  aliases: z.array(z.string()).optional(),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  customer_type: z.enum(['retail', 'wholesale', 'grocery', 'vegetable', 'grocery_sender', 'grocery_receiver', 'vegetable_sender', 'vegetable_receiver']).optional(),
  is_loyal: z.boolean().optional(),
  aliases: z.array(z.string()).optional(),
});

const bulkLoyalSchema = z.object({
  customer_ids: z.array(z.string().uuid()),
  is_loyal: z.boolean(),
});

const updatePricesSchema = z.object({
  updates: z.array(z.object({
    deliveryOrderId: z.string().uuid(),
    unitPrice: z.number().min(0),
  })),
});

const debtPaymentSchema = z.object({
  amount: z.number().min(0),
  payment_date: z.string().optional(),
  payment_time: z.string().optional(),
  collector_id: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const createAccountSchema = z.object({
  email: z.string().email().optional().nullable(),
  phone: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  full_name: z.string().min(1).optional(),
  customer_id: z.string().uuid(),
});

const mergeCustomerSchema = z.object({
  source_id: z.string().uuid(),
  target_id: z.string().uuid(),
});

const undoMergeSchema = z.object({
  mergeId: z.string().uuid(),
});

const geocodeSchema = z.object({
  address: z.string().min(5),
});

const autocompleteAddressSchema = z.object({
  text: z.string().min(2),
});

const resolveAddressSchema = z.object({
  refId: z.string().min(1),
});

const customerSelfOrderItemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  package_type: z.string().optional().nullable(),
  item_note: z.string().optional().nullable(),
  weight_kg: z.number().optional().nullable(),
  quantity: z.number().int().positive(),
  unit_price: z.number().optional().nullable(),
  image_url: z.string().optional().nullable(),
  image_urls: z.array(z.string()).optional().nullable(),
  payment_status: z.enum(['paid', 'unpaid']).optional(),
});

const createMyOrderSchema = z.object({
  order_date: z.string().optional(),
  order_time: z.string().optional(),
  sender_name: z.string().optional(),
  sender_id: z.string().uuid().optional().nullable(),
  receiver_name: z.string().optional(),
  receiver_phone: z.string().optional(),
  receiver_address: z.string().optional(),
  warehouse_id: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  order_category: z.enum(['standard', 'vegetable']).optional(),
  total_amount: z.number().optional().nullable(),
  is_custom_amount: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  receipt_image_url: z.string().optional().nullable(),
  receipt_image_urls: z.array(z.string()).optional().nullable(),
  items: z.array(customerSelfOrderItemSchema).optional(),
  selected_alias: z.string().optional().nullable(),
});

const updateMyOrderSchema = createMyOrderSchema.partial();

export class CustomerController {
  static async getAll(req: Request, res: Response) {
    try {
      const type = req.query.type as string | undefined;
      let isLoyal: boolean | undefined = undefined;
      if (req.query.is_loyal !== undefined) {
        isLoyal = req.query.is_loyal === 'true';
      }
      const data = await CustomerService.getAll(type, isLoyal);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async bulkSetLoyal(req: Request, res: Response) {
    try {
      const validated = bulkLoyalSchema.parse(req.body);
      const data = await CustomerService.bulkSetLoyal(validated.customer_ids, validated.is_loyal);
      return res.status(200).json(successResponse(data, 'Customers loyalty status updated'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async geocode(req: Request, res: Response) {
    try {
      const validated = geocodeSchema.parse(req.body);
      const data = await GeocodingService.geocodeAddress(validated.address);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async autocompleteAddress(req: Request, res: Response) {
    try {
      const validated = autocompleteAddressSchema.parse(req.body);
      const data = await GeocodingService.autocompleteAddress(validated.text);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async resolveAddress(req: Request, res: Response) {
    try {
      const validated = resolveAddressSchema.parse(req.body);
      const data = await GeocodingService.resolveVietMapPlace(validated.refId);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getDeliveryOrders(req: Request, res: Response) {
    try {
      const data = await CustomerService.getDeliveryOrders(req.params.id as string);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async updateDeliveryOrderPrices(req: Request, res: Response) {
    try {
      const validated = updatePricesSchema.parse(req.body);
      const data = await CustomerService.updateDeliveryOrderPrices(req.params.id as string, validated.updates as { deliveryOrderId: string, unitPrice: number }[]);
      return res.status(200).json(successResponse(data, 'Delivery order prices updated'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const data = await CustomerService.getById(req.params.id as string);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getByUserId(req: Request, res: Response) {
    try {
      const data = await CustomerService.getByUserId(req.params.userId as string);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getMyOrders(req: Request, res: Response) {
    try {
      const data = await CustomerService.getMyOrders(req.user!.id);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getMyOrderProducts(req: Request, res: Response) {
    try {
      const data = await CustomerService.getMyOrderProducts(req.user!.id);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async createMyOrder(req: Request, res: Response) {
    try {
      const validated = createMyOrderSchema.parse(req.body);
      const data = await CustomerService.createMyOrder(req.user!.id, validated as Record<string, unknown>);
      return res.status(201).json(successResponse(data, 'Đã tạo đơn hàng của bạn'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async updateMyOrder(req: Request, res: Response) {
    try {
      const validated = updateMyOrderSchema.parse(req.body);
      const data = await CustomerService.updateMyOrder(
        req.user!.id,
        req.params.orderId as string,
        validated as Record<string, unknown>,
      );
      return res.status(200).json(successResponse(data, 'Đã cập nhật đơn hàng của bạn'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getOrders(req: Request, res: Response) {
    try {
      const data = await CustomerService.getOrders(req.params.id as string);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getExportOrders(req: Request, res: Response) {
    try {
      const data = await CustomerService.getExportOrders(req.params.id as string);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getReceipts(req: Request, res: Response) {
    try {
      const data = await CustomerService.getReceipts(req.params.id as string);
      return res.status(200).json(successResponse(data));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async getDebt(req: Request, res: Response) {
    try {
      const data = await CustomerService.getById(req.params.id as string);
      return res.status(200).json(successResponse({ debt: data.debt }));
    } catch (err: any) {
       return res.status(400).json(errorResponse(err.message));
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const validated = createCustomerSchema.parse(req.body);
      const data = await CustomerService.create(validated);
      return res.status(201).json(successResponse(data, 'Customer created'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const validated = updateCustomerSchema.parse(req.body);
      const data = await CustomerService.update(req.params.id as string, validated);
      return res.status(200).json(successResponse(data, 'Customer updated'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      await CustomerService.softDelete(req.params.id as string);
      return res.status(200).json(successResponse(null, 'Customer deleted'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async updatePayment(req: Request, res: Response) {
    try {
      const validated = debtPaymentSchema.parse(req.body);
      const userId = req.user?.id; // Assuming authentication middleware attaches user
      await CustomerService.updateDebtPayment(req.params.id as string, validated as any, userId);
      return res.status(200).json(successResponse(null, 'Payment recorded'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async createAccount(req: Request, res: Response) {
    try {
      const validated = createAccountSchema.parse(req.body);
      const data = await CustomerService.createCustomerAccount(
        validated.customer_id,
        {
          email: validated.email || undefined,
          phone: validated.phone,
          password: validated.password,
          fullName: validated.full_name,
        }
      );
      return res.status(201).json(successResponse(data, 'Account created'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async merge(req: Request, res: Response) {
    try {
      const validated = mergeCustomerSchema.parse(req.body);
      if (validated.source_id === validated.target_id) {
        return res.status(400).json(errorResponse('Không thể gộp khách hàng với chính mình'));
      }
      const data = await CustomerService.merge(validated.source_id, validated.target_id, req.user!.id);
      return res.status(200).json(successResponse(data, 'Gộp khách hàng thành công'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }

  static async undoMerge(req: Request, res: Response) {
    try {
      const validated = undoMergeSchema.parse({ mergeId: req.params.mergeId });
      const data = await CustomerService.undoMerge(validated.mergeId, req.user!.id);
      return res.status(200).json(successResponse(data, 'Hoàn tác gộp khách hàng thành công'));
    } catch (err: any) {
      return res.status(400).json(errorResponse(err.message));
    }
  }
}
