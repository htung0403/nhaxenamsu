import { randomUUID } from 'crypto';
import { supabaseService } from '../../config/supabase';
import { hashPassword } from '../../utils/password';
import { normalizeEntityNameKey } from '../../utils/normalizeEntityName';
import { ImportOrderService } from '../import-orders/import-orders.service';
import { ProductService } from '../products/products.service';
import { DeliveryService } from '../delivery/delivery.service';
import {
  applyCustomerBinding,
  isCustomerOrderEditable,
  resolveCustomerOrderPolicy,
} from './customer-order-policy';

export class CustomerService {
  private static sanitizeCustomerOrderPayload(payload: Record<string, unknown>) {
    const items = Array.isArray(payload.items)
      ? payload.items.map((rawItem) => {
          const item = rawItem && typeof rawItem === 'object' ? rawItem as Record<string, unknown> : {};
          return {
            product_id: item.product_id,
            package_type: item.package_type,
            item_note: item.item_note,
            weight_kg: item.weight_kg,
            quantity: item.quantity,
            unit_price: item.unit_price,
            image_url: item.image_url,
            image_urls: item.image_urls,
            payment_status: 'unpaid',
          };
        })
      : undefined;

    return {
      order_date: payload.order_date,
      order_time: payload.order_time,
      sender_name: payload.sender_name,
      receiver_name: payload.receiver_name,
      receiver_phone: payload.receiver_phone,
      receiver_address: payload.receiver_address,
      total_amount: payload.total_amount,
      is_custom_amount: payload.is_custom_amount,
      notes: payload.notes,
      receipt_image_url: payload.receipt_image_url,
      receipt_image_urls: payload.receipt_image_urls,
      selected_alias: payload.selected_alias,
      order_category: payload.order_category,
      ...(items ? { items } : {}),
    };
  }

  private static assertCustomerOrderItems(payload: Record<string, unknown>) {
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error('Vui lòng thêm ít nhất 1 mặt hàng');
    }

    const hasInvalidItem = payload.items.some((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object') return true;
      const item = rawItem as Record<string, unknown>;
      const quantity = Number(item.quantity);
      return typeof item.product_id !== 'string' || !item.product_id || !Number.isFinite(quantity) || quantity <= 0;
    });

    if (hasInvalidItem) {
      throw new Error('Mỗi dòng hàng cần có mặt hàng và số lượng lớn hơn 0');
    }
  }

  private static async getCustomerByUserIdOrThrow(userId: string) {
    const customer = await this.getByUserId(userId);
    if (!customer?.id) {
      throw new Error('Không tìm thấy khách hàng gắn với tài khoản hiện tại');
    }

    const policy = resolveCustomerOrderPolicy(customer.customer_type);
    if (!policy) {
      throw new Error('Loại khách hàng hiện tại chưa được phép tự tạo đơn');
    }

    return { customer, policy };
  }

  private static async findOwnedOrderById(orderId: string, customerId: string) {
    const loadOrder = async (tableName: 'import_orders' | 'vegetable_orders', orderCategory: 'standard' | 'vegetable') => {
      const { data, error } = await supabaseService
        .from(tableName)
        .select('id, status, admin_confirmed_at, customer_id, sender_id, deleted_at')
        .eq('id', orderId)
        .is('deleted_at', null)
        .or(`customer_id.eq.${customerId},sender_id.eq.${customerId}`)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      return { ...data, order_category: orderCategory };
    };

    const importOrder = await loadOrder('import_orders', 'standard');
    if (importOrder) return importOrder;
    return loadOrder('vegetable_orders', 'vegetable');
  }

  static async getAll(type?: string, isLoyal?: boolean) {
    let query = supabaseService.from('customers').select('*').is('deleted_at', null);
    if (type) {
      query = query.eq('customer_type', type);
    }
    if (isLoyal !== undefined) {
      query = query.eq('is_loyal', isLoyal);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  static async bulkSetLoyal(customerIds: string[], isLoyal: boolean) {
    if (!customerIds || customerIds.length === 0) return [];
    
    const { data, error } = await supabaseService
      .from('customers')
      .update({ is_loyal: isLoyal })
      .in('id', customerIds)
      .select();
      
    if (error) throw error;
    return data;
  }

  static async getDeliveryOrders(id: string) {
    const { data: importOrders, error: ioError } = await supabaseService
      .from('import_orders')
      .select('id')
      .eq('customer_id', id);
      
    if (ioError) throw ioError;
    if (!importOrders || importOrders.length === 0) return [];

    const importOrderIds = importOrders.map((o: any) => o.id);
    const CHUNK_SIZE = 100;
    const allDeliveryOrders: any[] = [];
    
    for (let i = 0; i < importOrderIds.length; i += CHUNK_SIZE) {
      const chunk = importOrderIds.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabaseService
        .from('delivery_orders')
        .select('*, delivery_vehicles(*, profiles:driver_id(full_name))')
        .eq('order_category', 'standard')
        .in('import_order_id', chunk);
        
      if (error) throw error;
      if (data) allDeliveryOrders.push(...data);
    }
    
    return allDeliveryOrders;
  }

  static async getMyDeliveryOrders(userId: string) {
    const { customer, policy } = await this.getCustomerByUserIdOrThrow(userId);
    const customerId = customer.id;
    const orderCategory = policy.orderCategory;
    const binding = policy.binding;

    const deliveryOrders = await DeliveryService.getAllToday(undefined, undefined, orderCategory);
    return (deliveryOrders || []).filter((order: any) => {
      const sourceOrder = orderCategory === 'vegetable' ? order.vegetable_orders : order.import_orders;
      if (!sourceOrder) return false;
      if (binding === 'sender') return sourceOrder.sender_id === customerId;
      return sourceOrder.customer_id === customerId;
    });
  }

  static async getMyDeliveryVehicles(userId: string) {
    const { policy } = await this.getCustomerByUserIdOrThrow(userId);
    const goodsCategory = policy.orderCategory === 'vegetable' ? 'vegetable' : 'grocery';

    const { data, error } = await supabaseService
      .from('vehicles')
      .select('id, license_plate, goods_categories')
      .is('deleted_at', null)
      .order('license_plate', { ascending: true });

    if (error) throw error;

    return (data || []).filter((vehicle: any) => {
      if (!Array.isArray(vehicle.goods_categories) || vehicle.goods_categories.length === 0) return true;
      return vehicle.goods_categories.includes(goodsCategory);
    });
  }

  static async updateDeliveryOrderPrices(customerId: string, updates: { deliveryOrderId: string, unitPrice: number }[]) {
    const results = [];
    for (const update of updates) {
      const { data, error } = await supabaseService
        .from('delivery_orders')
        .update({ 
          unit_price: update.unitPrice, 
          price_confirmed: true 
        })
        .eq('id', update.deliveryOrderId)
        .select();
        
      if (error) throw error;
      if (data && data.length > 0) {
         results.push(data[0]);
      }
    }
    return results;
  }

  static async getById(id: string) {
    const { data, error } = await supabaseService
      .from('customers')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    if (error) throw error;
    return data;
  }

  static async getByUserId(userId: string) {
    const { data, error } = await supabaseService
      .from('customers')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is no rows returned, which is fine
    return data;
  }

  static async getOrders(id: string) {
    const { data: stdOrders, error: stdError } = await supabaseService
      .from('import_orders')
      .select('*')
      .eq('customer_id', id);
    if (stdError) throw stdError;

    const { data: vegOrders, error: vegError } = await supabaseService
      .from('vegetable_orders')
      .select('*')
      .eq('customer_id', id);
    if (vegError) throw vegError;

    const allData = [
      ...(stdOrders || []).map(o => ({ ...o, order_category: 'standard' })),
      ...(vegOrders || []).map(o => ({ ...o, order_category: 'vegetable' }))
    ];

    allData.sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime() || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return allData;
  }

  static async getMyOrders(userId: string) {
    const { customer } = await this.getCustomerByUserIdOrThrow(userId);
    const customerId = customer.id;

    const { data: stdOrders, error: stdError } = await supabaseService
      .from('import_orders')
      .select('*, import_order_items(*, products(*))')
      .is('deleted_at', null)
      .or(`customer_id.eq.${customerId},sender_id.eq.${customerId}`);
    if (stdError) throw stdError;

    const { data: vegOrders, error: vegError } = await supabaseService
      .from('vegetable_orders')
      .select('*, vegetable_order_items(*, products(*))')
      .is('deleted_at', null)
      .or(`customer_id.eq.${customerId},sender_id.eq.${customerId}`);
    if (vegError) throw vegError;

    const allData = [
      ...(stdOrders || []).map((order) => ({ ...order, order_category: 'standard' as const })),
      ...(vegOrders || []).map((order) => {
        const mapped = { ...order, order_category: 'vegetable' as const };
        if (mapped.vegetable_order_items) {
          mapped.import_order_items = mapped.vegetable_order_items;
          delete mapped.vegetable_order_items;
        }
        return mapped;
      }),
    ];

    allData.sort(
      (a, b) =>
        new Date(b.order_date).getTime() - new Date(a.order_date).getTime() ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return allData;
  }

  static async getMyOrderProducts(userId: string) {
    const { policy } = await this.getCustomerByUserIdOrThrow(userId);
    const products = await ProductService.getAll();
    return (products || []).filter((product: any) => {
      if (policy.orderCategory === 'vegetable') return product.category === 'vegetable';
      return product.category !== 'vegetable';
    });
  }

  static async createMyOrder(userId: string, payload: Record<string, unknown>) {
    const { customer, policy } = await this.getCustomerByUserIdOrThrow(userId);
    const sanitizedPayload = this.sanitizeCustomerOrderPayload(payload);
    this.assertCustomerOrderItems(sanitizedPayload);
    const requestedCategory = typeof sanitizedPayload.order_category === 'string' ? sanitizedPayload.order_category : undefined;

    if (requestedCategory && requestedCategory !== policy.orderCategory) {
      throw new Error('Bạn không thể tạo loại đơn hàng này');
    }

    const normalizedPayload = applyCustomerBinding(sanitizedPayload, customer, policy);
    const createdOrder = await ImportOrderService.create(normalizedPayload, userId);
    return { ...createdOrder, order_category: policy.orderCategory };
  }

  static async updateMyOrder(userId: string, orderId: string, payload: Record<string, unknown>) {
    const { customer, policy } = await this.getCustomerByUserIdOrThrow(userId);

    const ownedOrder = await this.findOwnedOrderById(orderId, customer.id);
    if (!ownedOrder) {
      throw new Error('Không tìm thấy đơn hàng của bạn');
    }

    if (!isCustomerOrderEditable(ownedOrder)) {
      throw new Error('Chỉ được sửa đơn trước khi admin xác nhận');
    }

    const sanitizedPayload = this.sanitizeCustomerOrderPayload(payload);
    this.assertCustomerOrderItems(sanitizedPayload);

    const requestedCategory = typeof sanitizedPayload.order_category === 'string' ? sanitizedPayload.order_category : undefined;
    if (requestedCategory && requestedCategory !== ownedOrder.order_category) {
      throw new Error('Không thể thay đổi loại đơn hàng');
    }

    const normalizedPayload = applyCustomerBinding(
      { ...sanitizedPayload, order_category: ownedOrder.order_category },
      customer,
      policy,
    );

    return ImportOrderService.update(orderId, normalizedPayload);
  }

  static async getExportOrders(id: string) {
    const { data, error } = await supabaseService
      .from('export_orders')
      .select('*')
      .eq('customer_id', id)
      .order('export_date', { ascending: false });
    if (error) throw error;
    return data;
  }

  static async getReceipts(id: string) {
    const { data, error } = await supabaseService
      .from('receipts')
      .select('*, profiles(full_name)')
      .eq('customer_id', id)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  static async create(customerData: any) {
    const customerType = customerData.customer_type || 'retail';
    const nameKey = normalizeEntityNameKey(customerData.name);
    if (nameKey) {
      const { data: candidates, error: findErr } = await supabaseService
        .from('customers')
        .select('*')
        .eq('customer_type', customerType)
        .is('deleted_at', null);
      if (findErr) throw findErr;
      const existing = (candidates || []).find(
        (c: any) => normalizeEntityNameKey(c.name) === nameKey,
      );
      if (existing) return existing;
    }

    const { data, error } = await supabaseService.from('customers').insert(customerData).select().single();
    if (error) throw error;
    return data;
  }

  static async update(
    id: string,
    payload: {
      name?: string;
      phone?: string | null;
      address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      customer_type?: 'retail' | 'wholesale' | 'grocery' | 'vegetable' | 'grocery_sender' | 'grocery_receiver' | 'vegetable_sender' | 'vegetable_receiver';
      aliases?: string[];
    }
  ) {
    const { data, error } = await supabaseService
      .from('customers')
      .update(payload)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  static async softDelete(id: string) {
    const { error } = await supabaseService
      .from('customers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) throw error;
  }

  static async updateDebtPayment(id: string, payload: { amount: number, payment_date?: string, payment_time?: string, collector_id?: string, notes?: string }, userId?: string) {
    const paymentDateStr = payload.payment_date || new Date().toISOString().split('T')[0];
    const createdBy = payload.collector_id || userId;
    
    // Combine datetime to TIMESTAMPTZ (assuming +07:00 or system timezone)
    let paymentTimestampStr = paymentDateStr;
    if (payload.payment_time) {
      paymentTimestampStr = `${paymentDateStr}T${payload.payment_time}:00+07:00`;
    }
    
    // Call the atomic RPC function that handles receipt creation, ledger, and FIFO distribution
    const { data, error } = await supabaseService.rpc('handle_customer_payment_fifo_atomic', {
      p_customer_id: id,
      p_amount: payload.amount,
      p_payment_date: paymentTimestampStr,
      p_notes: payload.notes || '',
      p_created_by: createdBy
    });

    if (error) throw error;
    return { success: true, data };
  }

  static async createCustomerAccount(
    customerId: string,
    payload: { email?: string; phone?: string; password?: string; fullName?: string },
  ) {
    const { data: customer, error: customerError } = await supabaseService
      .from('customers')
      .select('id, name, phone, user_id, deleted_at')
      .eq('id', customerId)
      .is('deleted_at', null)
      .single();

    if (customerError) throw customerError;
    if (!customer) throw new Error('Không tìm thấy khách hàng');
    if (customer.user_id) throw new Error('Khách hàng này đã có tài khoản');

    const phone = (payload.phone || customer.phone || '').trim();
    if (!phone) throw new Error('Vui lòng nhập số điện thoại đăng nhập');

    const id = randomUUID();
    const emailLower = payload.email?.trim().toLowerCase() || null;
    const password_hash = await hashPassword(payload.password || 'ResetPassword123');

    const { error: profileError } = await supabaseService.from('profiles').insert({
      id,
      full_name: payload.fullName?.trim() || customer.name,
      role: 'customer',
      phone,
      email: emailLower,
      personal_email: emailLower,
      password_hash,
    });

    if (profileError) throw profileError;

    const { error: linkError } = await supabaseService.from('customers').update({ user_id: id }).eq('id', customerId);

    if (linkError) throw linkError;

    const { data: customerRole } = await supabaseService
      .from('app_roles')
      .select('id')
      .eq('role_key', 'customer')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (customerRole?.id) {
      const { error: roleError } = await supabaseService
        .from('app_user_roles')
        .insert({ user_id: id, role_id: customerRole.id });
      if (roleError) throw roleError;
    }

    return { id };
  }

  static async merge(sourceId: string, targetId: string, mergedBy: string) {
    const { data, error } = await supabaseService.rpc('merge_customers_atomic', {
      p_source_id: sourceId,
      p_target_id: targetId,
      p_merged_by: mergedBy,
    });

    if (error) throw error;
    return data;
  }

  static async undoMerge(mergeId: string, undoneBy: string) {
    const { data, error } = await supabaseService.rpc('undo_customer_merge', {
      p_merge_id: mergeId,
      p_undone_by: undoneBy,
    });

    if (error) throw error;
    return data;
  }
}
