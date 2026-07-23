import { supabaseService } from '../../config/supabase';

export type VehicleDebtCustomerType = 'loyal' | 'grocery_non_loyal';

export interface VehicleDebtRow {
  id: string;
  delivery_vehicle_id: string;
  delivery_order_id: string;
  order_id: string;
  order_code: string;
  product_name?: string | null;
  order_date?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  assigned_at?: string | null;
  customer: {
    id: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    is_loyal?: boolean | null;
  };
  vehicle: {
    id?: string | null;
    license_plate?: string | null;
  };
  driver: {
    id?: string | null;
    full_name?: string | null;
    phone?: string | null;
  };
  assigned_quantity: number;
  unit_price: number;
  expected_amount: number;
  export_payment_status: 'unpaid';
}

export interface VehicleDebtPaymentRow {
  id: string;
  delivery_vehicle_id?: string | null;
  delivery_order_id: string;
  order_code?: string | null;
  product_name?: string | null;
  customer?: { id?: string | null; name?: string | null } | null;
  vehicle?: { id?: string | null; license_plate?: string | null } | null;
  driver?: { id?: string | null; full_name?: string | null } | null;
  entered_by?: { id?: string | null; full_name?: string | null } | null;
  paid_at: string;
  quantity: number;
  unit_price: number;
  paid_amount: number;
  expected_amount: number;
  notes?: string | null;
}

export interface VehicleDebtPaymentPayload {
  paid_at: string;
  quantity: number;
  unit_price: number;
  paid_amount: number;
  notes?: string;
}

const VEHICLE_DEBT_PAYMENT_NOTE_PREFIX = 'Thu tiền công nợ theo xe';

export class AccountingService {
  static async getDebts() {
    const { data, error } = await supabaseService
      .from('customers')
      .select('id, name, debt, total_revenue')
      .gt('debt', 0);
    if (error) throw error;
    return data;
  }

  static async getRevenueByDate(from: string, to: string) {
    const { data: stdData, error: stdError } = await supabaseService
      .from('import_orders')
      .select('total_amount, order_date')
      .gte('order_date', from)
      .lte('order_date', to);
    if (stdError) throw stdError;

    const { data: vegData, error: vegError } = await supabaseService
      .from('vegetable_orders')
      .select('total_amount, order_date')
      .gte('order_date', from)
      .lte('order_date', to);
    if (vegError) throw vegError;

    const data = [...(stdData || []), ...(vegData || [])];

    // Aggregating locally for simplicity, or use RPC for large datasets
    const aggregation = data?.reduce((acc: any, curr: any) => {
      const date = curr.order_date;
      acc[date] = (acc[date] || 0) + Number(curr.total_amount);
      return acc;
    }, {});

    return aggregation;
  }

  static async getRevenueByVehicle(date: string) {
    const { data, error } = await supabaseService
      .from('payment_collections')
      .select('amount, vehicle_id, vehicles(license_plate)')
      .eq('collected_date', date);
    
    if (error) throw error;

    const aggregation = data?.reduce((acc: any, curr: any) => {
      const plate = curr.vehicles?.license_plate || 'Unknown';
      acc[plate] = (acc[plate] || 0) + Number(curr.amount);
      return acc;
    }, {});

    return aggregation;
  }

  static async getVehicleDebts(customerType: VehicleDebtCustomerType): Promise<VehicleDebtRow[]> {
    const { data, error } = await supabaseService
      .from('delivery_vehicles')
      .select(`
        id,
        delivery_order_id,
        vehicle_id,
        driver_id,
        assigned_quantity,
        expected_amount,
        delivery_date,
        delivery_time,
        assigned_at,
        export_payment_status,
        vehicles ( id, license_plate ),
        drivers:profiles!delivery_vehicles_driver_id_fkey(id, full_name, phone),
        delivery_orders!inner (
          id,
          product_name,
          unit_price,
          delivery_date,
          delivery_time,
          import_orders!inner (
            id,
            order_code,
            order_date,
            customer_id,
            receiver_name,
            receiver_phone,
            sender_name,
            customers!import_orders_customer_id_fkey(id, name, phone, address, is_loyal)
          )
        )
      `)
      .or('export_payment_status.eq.unpaid,export_payment_status.is.null')
      .range(0, 9999)
      .order('delivery_date', { ascending: false })
      .order('assigned_at', { ascending: false });

    if (error) throw error;

    return (data || [])
      .map((row: any): VehicleDebtRow | null => {
        const deliveryOrder = Array.isArray(row.delivery_orders) ? row.delivery_orders[0] : row.delivery_orders;
        const importOrder = Array.isArray(deliveryOrder?.import_orders)
          ? deliveryOrder.import_orders[0]
          : deliveryOrder?.import_orders;
        const customer = Array.isArray(importOrder?.customers) ? importOrder.customers[0] : importOrder?.customers;

        if (!deliveryOrder || !importOrder) return null;

        const isLoyal = customer?.is_loyal === true;
        if (customerType === 'loyal' && !isLoyal) return null;
        if (customerType === 'grocery_non_loyal' && isLoyal) return null;

        const customerName = customer?.name || importOrder.receiver_name || importOrder.sender_name || 'Khách tạp hóa';
        const customerPhone = customer?.phone || importOrder.receiver_phone || null;

        const expectedAmount = Number(row.expected_amount || 0);
        const assignedQuantity = Number(row.assigned_quantity || 0);
        const unitPrice = Number(deliveryOrder.unit_price || 0);

        return {
          id: row.id,
          delivery_vehicle_id: row.id,
          delivery_order_id: row.delivery_order_id,
          order_id: importOrder.id,
          order_code: importOrder.order_code || `#${String(importOrder.id).slice(0, 8).toUpperCase()}`,
          product_name: deliveryOrder.product_name,
          order_date: importOrder.order_date,
          delivery_date: row.delivery_date || deliveryOrder.delivery_date,
          delivery_time: row.delivery_time || deliveryOrder.delivery_time,
          assigned_at: row.assigned_at,
          customer: {
            id: customer?.id || importOrder.customer_id || importOrder.id,
            name: customerName,
            phone: customerPhone,
            address: customer?.address || null,
            is_loyal: customer?.is_loyal || false,
          },
          vehicle: {
            id: row.vehicles?.id || row.vehicle_id,
            license_plate: row.vehicles?.license_plate,
          },
          driver: {
            id: row.drivers?.id || row.driver_id,
            full_name: row.drivers?.full_name,
            phone: row.drivers?.phone,
          },
          assigned_quantity: assignedQuantity,
          unit_price: unitPrice,
          expected_amount: expectedAmount,
          export_payment_status: 'unpaid',
        };
      })
      .filter((row): row is VehicleDebtRow => row !== null);
  }

  static async recordVehicleDebtPayment(
    deliveryVehicleId: string,
    payload: VehicleDebtPaymentPayload,
    userId?: string,
  ): Promise<VehicleDebtPaymentRow> {
    const { data: row, error } = await supabaseService
      .from('delivery_vehicles')
      .select(`
        id,
        delivery_order_id,
        vehicle_id,
        driver_id,
        assigned_quantity,
        expected_amount,
        export_payment_status,
        vehicles ( id, license_plate ),
        drivers:profiles!delivery_vehicles_driver_id_fkey(id, full_name),
        delivery_orders!inner (
          id,
          product_name,
          unit_price,
          import_orders!inner (
            id,
            order_code,
            customer_id,
            receiver_name,
            customers!import_orders_customer_id_fkey(id, name)
          )
        )
      `)
      .eq('id', deliveryVehicleId)
      .single();

    if (error) throw error;
    if (!row) throw new Error('Không tìm thấy phân xe');
    if ((row as any).export_payment_status === 'paid') throw new Error('Phân xe này đã được ghi trả tiền');
    if (!(row as any).vehicle_id) throw new Error('Phân xe chưa có xe, không thể ghi nhận thanh toán');

    const deliveryOrder = Array.isArray((row as any).delivery_orders) ? (row as any).delivery_orders[0] : (row as any).delivery_orders;
    const importOrder = Array.isArray(deliveryOrder?.import_orders) ? deliveryOrder.import_orders[0] : deliveryOrder?.import_orders;
    const customer = Array.isArray(importOrder?.customers) ? importOrder.customers[0] : importOrder?.customers;
    const customerId = customer?.id || importOrder?.customer_id || null;
    const quantity = Number(payload.quantity || 0);
    const unitPrice = Number(payload.unit_price || 0);
    const paidAmount = Number(payload.paid_amount || 0);
    const paidAt = new Date(payload.paid_at);

    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Số lượng/số tiền phải lớn hơn 0');
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Đơn giá không hợp lệ');
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) throw new Error('Thành tiền phải lớn hơn 0');
    if (Number.isNaN(paidAt.getTime())) throw new Error('Ngày giờ trả tiền không hợp lệ');

    const notes = [
      VEHICLE_DEBT_PAYMENT_NOTE_PREFIX,
      `Mã đơn ${importOrder?.order_code || String(importOrder?.id || '').slice(0, 8)}`,
      `SL ${quantity}`,
      `Đơn giá ${unitPrice}`,
      payload.notes?.trim(),
    ].filter(Boolean).join(' - ');

    const { data: payment, error: paymentError } = await supabaseService
      .from('payment_collections')
      .insert({
        delivery_order_id: (row as any).delivery_order_id,
        source_order_ids: [(row as any).delivery_order_id],
        customer_id: customerId,
        driver_id: (row as any).driver_id || userId,
        vehicle_id: (row as any).vehicle_id,
        delivery_vehicle_id: deliveryVehicleId,
        expected_amount: Number((row as any).expected_amount || 0),
        collected_amount: paidAmount,
        collected_at: paidAt.toISOString(),
        status: 'confirmed',
        submitted_at: paidAt.toISOString(),
        confirmed_at: paidAt.toISOString(),
        receiver_id: userId || null,
        receiver_type: 'staff',
        notes,
      })
      .select('id, delivery_vehicle_id, delivery_order_id, expected_amount, collected_amount, collected_at, notes')
      .single();

    if (paymentError) throw paymentError;

    const { error: updateError } = await supabaseService
      .from('delivery_vehicles')
      .update({ export_payment_status: 'paid' })
      .eq('id', deliveryVehicleId);
    if (updateError) throw updateError;

    if (customerId) {
      const { error: receiptError } = await supabaseService
        .from('receipts')
        .insert({
          customer_id: customerId,
          amount: paidAmount,
          payment_date: paidAt.toISOString(),
          notes,
          created_by: userId || null,
        });
      if (receiptError) console.error('Failed to log vehicle debt receipt', receiptError);
    }

    return {
      id: payment.id,
      delivery_vehicle_id: payment.delivery_vehicle_id,
      delivery_order_id: payment.delivery_order_id,
      order_code: importOrder?.order_code,
      product_name: deliveryOrder?.product_name,
      customer: customer ? { id: customer.id, name: customer.name } : null,
      vehicle: { id: (row as any).vehicles?.id || (row as any).vehicle_id, license_plate: (row as any).vehicles?.license_plate },
      driver: { id: (row as any).drivers?.id || (row as any).driver_id, full_name: (row as any).drivers?.full_name },
      entered_by: userId ? { id: userId, full_name: null } : null,
      paid_at: payment.collected_at,
      quantity,
      unit_price: unitPrice,
      paid_amount: Number(payment.collected_amount || paidAmount),
      expected_amount: Number(payment.expected_amount || 0),
      notes: payment.notes,
    };
  }

  static async recordVehicleDebtPayments(
    items: Array<VehicleDebtPaymentPayload & { delivery_vehicle_id: string }>,
    userId?: string,
  ): Promise<VehicleDebtPaymentRow[]> {
    if (!items || items.length === 0) throw new Error('Vui lòng chọn ít nhất 1 đơn');

    const results: VehicleDebtPaymentRow[] = [];
    for (const item of items) {
      const { delivery_vehicle_id, ...payload } = item;
      results.push(await this.recordVehicleDebtPayment(delivery_vehicle_id, payload, userId));
    }
    return results;
  }

  static async updateVehicleDebtPayment(
    paymentId: string,
    payload: VehicleDebtPaymentPayload,
    userId?: string,
  ): Promise<VehicleDebtPaymentRow> {
    const { data: current, error: currentError } = await supabaseService
      .from('payment_collections')
      .select('id, customer_id, collected_amount, delivery_vehicle_id')
      .eq('id', paymentId)
      .single();

    if (currentError) throw currentError;
    if (!current) throw new Error('Không tìm thấy lịch sử nhập tiền');

    const quantity = Number(payload.quantity || 0);
    const unitPrice = Number(payload.unit_price || 0);
    const paidAmount = Number(payload.paid_amount || 0);
    const paidAt = new Date(payload.paid_at);

    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Số lượng/số tiền phải lớn hơn 0');
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Đơn giá không hợp lệ');
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) throw new Error('Thành tiền phải lớn hơn 0');
    if (Number.isNaN(paidAt.getTime())) throw new Error('Ngày giờ trả tiền không hợp lệ');

    const notes = [
      VEHICLE_DEBT_PAYMENT_NOTE_PREFIX,
      `SL ${quantity}`,
      `Đơn giá ${unitPrice}`,
      payload.notes?.trim(),
    ].filter(Boolean).join(' - ');

    const { error: updateError } = await supabaseService
      .from('payment_collections')
      .update({
        collected_amount: paidAmount,
        collected_at: paidAt.toISOString(),
        confirmed_at: paidAt.toISOString(),
        notes,
      })
      .eq('id', paymentId);
    if (updateError) throw updateError;

    const delta = paidAmount - Number((current as any).collected_amount || 0);
    if ((current as any).customer_id && delta !== 0) {
      const { error: ledgerError } = await supabaseService
        .from('customer_debt_ledger')
        .insert({
          customer_id: (current as any).customer_id,
          amount: -delta,
          transaction_type: 'adjustment',
          reference_id: paymentId,
          notes: `Điều chỉnh lịch sử nhập tiền theo xe - ${paymentId}`,
          created_by: userId || null,
        });
      if (ledgerError) console.error('Failed to adjust customer debt ledger for payment edit', ledgerError);
    }

    const rows = await this.getVehicleDebtPayments('grocery_non_loyal');
    return rows.find((row) => row.id === paymentId) || (await this.getVehicleDebtPayments('loyal')).find((row) => row.id === paymentId) as VehicleDebtPaymentRow;
  }

  static async getVehicleDebtPayments(customerType: VehicleDebtCustomerType): Promise<VehicleDebtPaymentRow[]> {
    const { data, error } = await supabaseService
      .from('payment_collections')
      .select(`
        id,
        delivery_vehicle_id,
        delivery_order_id,
        expected_amount,
        collected_amount,
        collected_at,
        notes,
        vehicles ( id, license_plate ),
        drivers:profiles!payment_collections_driver_id_fkey(id, full_name),
        receivers:profiles!payment_collections_receiver_id_fkey(id, full_name),
        delivery_orders!inner (
          unit_price,
          product_name,
          delivery_vehicles ( id, assigned_quantity ),
          import_orders!inner (
            id,
            order_code,
            customer_id,
            receiver_name,
            customers!import_orders_customer_id_fkey(id, name, is_loyal)
          )
        )
      `)
      .eq('status', 'confirmed')
      .ilike('notes', `%${VEHICLE_DEBT_PAYMENT_NOTE_PREFIX}%`)
      .order('collected_at', { ascending: false })
      .range(0, 9999);

    if (error) throw error;

    return (data || [])
      .map((payment: any): VehicleDebtPaymentRow | null => {
        const deliveryOrder = Array.isArray(payment.delivery_orders) ? payment.delivery_orders[0] : payment.delivery_orders;
        const importOrder = Array.isArray(deliveryOrder?.import_orders) ? deliveryOrder.import_orders[0] : deliveryOrder?.import_orders;
        const customer = Array.isArray(importOrder?.customers) ? importOrder.customers[0] : importOrder?.customers;
        const isLoyal = customer?.is_loyal === true;
        if (customerType === 'loyal' && !isLoyal) return null;
        if (customerType === 'grocery_non_loyal' && isLoyal) return null;

        const deliveryVehicles = Array.isArray(deliveryOrder?.delivery_vehicles) ? deliveryOrder.delivery_vehicles : [];
        const matchedVehicle = deliveryVehicles.find((item: any) => item.id === payment.delivery_vehicle_id) || deliveryVehicles[0];
        const quantityMatch = String(payment.notes || '').match(/SL\s+([0-9.,]+)/i);
        const unitPriceMatch = String(payment.notes || '').match(/Đơn giá\s+([0-9.,]+)/i);
        const quantity = quantityMatch ? Number(quantityMatch[1].replace(/,/g, '')) : Number(matchedVehicle?.assigned_quantity || 0);
        const unitPrice = unitPriceMatch ? Number(unitPriceMatch[1].replace(/,/g, '')) : Number(deliveryOrder?.unit_price || 0);

        return {
          id: payment.id,
          delivery_vehicle_id: payment.delivery_vehicle_id,
          delivery_order_id: payment.delivery_order_id,
          order_code: importOrder?.order_code,
          product_name: deliveryOrder?.product_name,
          customer: customer ? { id: customer.id || importOrder?.customer_id, name: customer.name || importOrder?.receiver_name } : null,
          vehicle: { id: payment.vehicles?.id, license_plate: payment.vehicles?.license_plate },
          driver: { id: payment.drivers?.id, full_name: payment.drivers?.full_name },
          entered_by: payment.receivers ? { id: payment.receivers?.id, full_name: payment.receivers?.full_name } : null,
          paid_at: payment.collected_at,
          quantity,
          unit_price: unitPrice,
          paid_amount: Number(payment.collected_amount || 0),
          expected_amount: Number(payment.expected_amount || 0),
          notes: payment.notes,
        };
      })
      .filter((row): row is VehicleDebtPaymentRow => row !== null);
  }

  static async getInvoiceOrders(filters: {
    category: 'standard' | 'vegetable';
    dateFrom?: string;
    dateTo?: string;
    customer_id?: string;
    invoice_status?: 'all' | 'exported' | 'not_exported';
  }) {
    const isVeg = filters.category === 'vegetable';
    const tName = isVeg ? 'vegetable_orders' : 'import_orders';
    const customerJoin = isVeg
      ? 'customers:customers!vegetable_orders_customer_id_fkey(id, name, phone, address)'
      : 'customers:customers!import_orders_customer_id_fkey(id, name, phone, address)';
    const senderJoin = isVeg
      ? 'sender_customers:customers!vegetable_orders_sender_id_fkey(id, name, phone)'
      : 'sender_customers:customers!import_orders_sender_id_fkey(id, name, phone)';
    const receivedByJoin = 'profiles:profiles!received_by(full_name, role)';

    let q = supabaseService
      .from(tName)
      .select(`id, order_code, order_date, order_time, sender_name, receiver_name, total_amount, payment_status, delivery_orders(delivery_date, delivery_time, created_at), ${customerJoin}, ${senderJoin}, ${receivedByJoin}`)
      .is('deleted_at', null)
      .order('order_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters.dateFrom) q = q.gte('order_date', filters.dateFrom);
    if (filters.dateTo) q = q.lte('order_date', filters.dateTo);
    if (filters.customer_id) q = q.eq('customer_id', filters.customer_id);

    // Skip invoice_status filter as columns are missing in DB
    // if (filters.invoice_status === 'exported') {
    //   q = q.eq('invoice_exported', true);
    // } else if (filters.invoice_status === 'not_exported') {
    //   q = q.eq('invoice_exported', false);
    // }

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  static async bulkMarkInvoiceExported(
    ids: string[],
    category: 'standard' | 'vegetable',
    userId: string,
    exported: boolean = true,
  ) {
    if (!ids || ids.length === 0) throw new Error('Không có đơn hàng nào được chọn');

    const tName = category === 'vegetable' ? 'vegetable_orders' : 'import_orders';
    const now = new Date().toISOString();

    // Check if columns exist (simplified check by catching error)
    try {
      const updateData: Record<string, unknown> = {
        invoice_exported: exported,
        invoice_exported_at: exported ? now : null,
        invoice_exported_by: exported ? userId : null,
      };

      const { data, error } = await supabaseService
        .from(tName)
        .update(updateData)
        .in('id', ids)
        .select('id');

      if (error) throw error;
      return { updated: data?.length || 0 };
    } catch (err: any) {
      if (err.message?.includes('column') && err.message?.includes('does not exist')) {
        throw new Error('Tính năng này yêu cầu cập nhật cơ sở dữ liệu. Vui lòng liên hệ quản trị viên.');
      }
      throw err;
    }
  }
}
