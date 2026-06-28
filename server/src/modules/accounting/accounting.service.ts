import { supabaseService } from '../../config/supabase';

export type VehicleDebtCustomerType = 'loyal' | 'grocery_non_loyal';

export interface VehicleDebtRow {
  id: string;
  delivery_vehicle_id: string;
  delivery_order_id: string;
  order_id: string;
  order_code: string;
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
        delivery_orders (
          id,
          unit_price,
          delivery_date,
          delivery_time,
          import_orders (
            id,
            order_code,
            order_date,
            customer_id,
            customers!import_orders_customer_id_fkey(id, name, phone, address, is_loyal)
          )
        )
      `)
      .eq('export_payment_status', 'unpaid')
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

        if (!deliveryOrder || !importOrder || !customer) return null;

        const isLoyal = customer.is_loyal === true;
        if (customerType === 'loyal' && !isLoyal) return null;
        if (customerType === 'grocery_non_loyal' && isLoyal) return null;

        const expectedAmount = Number(row.expected_amount || 0);
        const assignedQuantity = Number(row.assigned_quantity || 0);
        const unitPrice = Number(deliveryOrder.unit_price || 0);

        return {
          id: row.id,
          delivery_vehicle_id: row.id,
          delivery_order_id: row.delivery_order_id,
          order_id: importOrder.id,
          order_code: importOrder.order_code || `#${String(importOrder.id).slice(0, 8).toUpperCase()}`,
          order_date: importOrder.order_date,
          delivery_date: row.delivery_date || deliveryOrder.delivery_date,
          delivery_time: row.delivery_time || deliveryOrder.delivery_time,
          assigned_at: row.assigned_at,
          customer: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            address: customer.address,
            is_loyal: customer.is_loyal,
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
