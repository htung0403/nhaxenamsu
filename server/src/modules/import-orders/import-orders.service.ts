import { supabaseService } from '../../config/supabase';
import { format } from 'date-fns';
import type { UserPayload } from '../../types';
import {
  fetchDriverScopeForUser,
  goodsScopeFullAccess,
  goodsScopeIsDriverRole,
  goodsScopeIsStaffRole,
  importOrderRowMatchesGoodsScope,
  type DriverScope,
} from '../../utils/goodsScope';
import { assignVegetableTaiRanksByDate } from '../../utils/vegetableTaiRank';

export class ImportOrderService {
  private static resolvePaymentAmounts(mainData: any) {
    const hasPaymentStatus = typeof mainData.payment_status === 'string';
    const hasPaidAmount = mainData.paid_amount !== undefined && mainData.paid_amount !== null;
    const hasDebtAmount = mainData.debt_amount !== undefined && mainData.debt_amount !== null;
    const totalAmount = Number(mainData.total_amount) || 0;

    let paidAmount = hasPaidAmount ? Number(mainData.paid_amount) || 0 : undefined;
    let debtAmount = hasDebtAmount ? Number(mainData.debt_amount) || 0 : undefined;

    if (hasPaymentStatus) {
      if (mainData.payment_status === 'paid') {
        if (debtAmount === undefined) debtAmount = totalAmount;
        if (paidAmount === undefined) paidAmount = debtAmount;
      } else if (mainData.payment_status === 'unpaid') {
        if (debtAmount === undefined) debtAmount = totalAmount;
        if (paidAmount === undefined) paidAmount = 0;
      }
    }

    return { paidAmount, debtAmount };
  }

  static async getAll(filters: any, actor?: UserPayload) {
    const isVegOnly = filters.order_category === 'vegetable';
    const isStandardOnly = filters.order_category === 'standard';
    const fetchBoth = !isVegOnly && !isStandardOnly;

    // Pagination params
    const page = filters.page ? parseInt(filters.page, 10) : 1;
    const pageSize = filters.pageSize ? parseInt(filters.pageSize, 10) : 20;
    const offset = (page - 1) * pageSize;
    const limit = pageSize;

    // Search param
    const search = filters.search ? String(filters.search).trim() : null;

    const buildQuery = (tName: string, iName: string, forCount = false) => {
      // import_orders có 2 FK tới profiles (received_by, sg_cash_handover_confirmed_by) → bắt buộc chỉ rõ quan hệ
      const receivedByProfile =
        tName === 'import_orders'
          ? 'profiles:profiles!received_by(full_name, role)'
          : 'profiles:profiles!received_by(full_name, role)';
      const senderCustomerJoin =
        tName === 'import_orders'
          ? 'sender_customers:customers!import_orders_sender_id_fkey(id, name, phone)'
          : 'sender_customers:customers!vegetable_orders_sender_id_fkey(id, name, phone)';
      const customerJoin =
        tName === 'import_orders'
          ? 'customers:customers!import_orders_customer_id_fkey(id, name, phone, address, aliases)'
          : 'customers:customers!vegetable_orders_customer_id_fkey(id, name, phone, address, aliases)';
      
      // Use count option for total count, otherwise select with joins
      let q = forCount
        ? supabaseService.from(tName).select('*', { count: 'exact', head: true })
        : supabaseService
            .from(tName)
            .select(`*, ${receivedByProfile}, warehouses(name), ${customerJoin}, ${senderCustomerJoin}, ${iName}(*, products(*)), delivery_orders(*, delivery_vehicles(*, vehicles(license_plate, profiles:profiles!vehicles_driver_id_fkey(full_name, phone), responsible_profile:profiles!vehicles_in_charge_id_fkey(full_name, phone)), profiles!driver_id(full_name, phone)))`);

      q = q.is('deleted_at', null);
      
      if (filters.dateFrom) q = q.gte('order_date', filters.dateFrom);
      if (filters.dateTo) q = q.lte('order_date', filters.dateTo);
      if (filters.status) {
        if (filters.status.includes(',')) {
          q = q.in('status', filters.status.split(','));
        } else {
          q = q.eq('status', filters.status);
        }
      }
      if (filters.supplier_name) q = q.ilike('supplier_name', `%${filters.supplier_name}%`);
      if (filters.license_plate) {
        const plates = filters.license_plate.split(',').map((p: string) => p.trim()).filter(Boolean);
        if (plates.length === 1) {
          q = q.ilike('license_plate', `%${plates[0]}%`);
        } else if (plates.length > 1) {
          const orClause = plates.map((p: string) => `license_plate.ilike.%${p}%`).join(',');
          q = q.or(orClause);
        }
      }
      if (filters.sender) {
        const senders = filters.sender.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (senders.length === 1) {
          q = q.ilike('sender_name', `%${senders[0]}%`);
        } else if (senders.length > 1) {
          const orClause = senders.map((s: string) => `sender_name.ilike.%${s}%`).join(',');
          q = q.or(orClause);
        }
      }
      if (filters.receiver) {
        const receivers = filters.receiver.split(',').map((r: string) => r.trim()).filter(Boolean);
        if (receivers.length === 1) {
          q = q.ilike('receiver_name', `%${receivers[0]}%`);
        } else if (receivers.length > 1) {
          const orClause = receivers.map((r: string) => `receiver_name.ilike.%${r}%`).join(',');
          q = q.or(orClause);
        }
      }
      if (filters.customer_id) q = q.eq('customer_id', filters.customer_id);
      if (filters.admin_confirmation_status === 'pending_customer') {
        q = q.is('admin_confirmed_at', null);
      }
      
      // Apply search filter using .or() for order_code, sender_name, receiver_name, selected_alias
      if (search) {
        const searchPattern = `%${search}%`;
        q = q.or(`order_code.ilike.${searchPattern},sender_name.ilike.${searchPattern},receiver_name.ilike.${searchPattern},selected_alias.ilike.${searchPattern}`);
      }
      
      // Fix missing newly created orders by sorting descending BEFORE Supabase limits the results (max-rows)
      q = q.order('created_at', { ascending: false });
      
      // Apply pagination at database level
      if (!forCount) {
        q = q.range(offset, offset + limit - 1);
      }
      
      return q;
    };

    // Get total counts for pagination metadata
    let totalStandard = 0;
    let totalVeg = 0;
    
    if (fetchBoth || isStandardOnly) {
      const { count: standardCount, error: standardCountError } = await buildQuery('import_orders', 'import_order_items', true);
      if (standardCountError) throw standardCountError;
      totalStandard = standardCount || 0;
    }
    
    if (fetchBoth || isVegOnly) {
      const { count: vegCount, error: vegCountError } = await buildQuery('vegetable_orders', 'vegetable_order_items', true);
      if (vegCountError) throw vegCountError;
      totalVeg = vegCount || 0;
    }
    
    const total = totalStandard + totalVeg;

    let allData: any[] = [];
    
    if (fetchBoth || isStandardOnly) {
      const { data, error } = await buildQuery('import_orders', 'import_order_items');
      if (error) throw error;
      if (data) allData = allData.concat(data.map((d: any) => ({ ...d, order_category: 'standard' })));
    }
    
    if (fetchBoth || isVegOnly) {
      const { data, error } = await buildQuery('vegetable_orders', 'vegetable_order_items');
      if (error) throw error;
      if (data) {
        allData = allData.concat(data.map((d: any) => {
           const mapped = { ...d, order_category: 'vegetable' };
           if (mapped.vegetable_order_items) {
             mapped.import_order_items = mapped.vegetable_order_items;
             delete mapped.vegetable_order_items;
           }
           return mapped;
        }));
      }
    }

    // Sort by created_at desc
    allData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Compute total_order_amount
    let mapped = allData.map((order: any) => {
      return { ...order, total_order_amount: Number(order.total_amount) || 0 };
    });

    const isCustomerSubmittedOrder = (order: any) => {
      const profile = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles;
      return profile?.role === 'customer';
    };

    if (filters.admin_confirmation_status === 'pending_customer') {
      mapped = mapped.filter((order: any) =>
        order.order_category === 'standard' && isCustomerSubmittedOrder(order) && Boolean(order.sender_id) && !order.admin_confirmed_at,
      );
    }

    if (filters.admin_confirmation_status === 'return_to_sg') {
      mapped = mapped.filter((order: any) =>
        order.order_category === 'standard' && isCustomerSubmittedOrder(order) && Boolean(order.customer_id),
      );
    }

    if (filters.admin_confirmation_status === 'official') {
      mapped = mapped.filter((order: any) => !isCustomerSubmittedOrder(order) || Boolean(order.admin_confirmed_at));
    }

    assignVegetableTaiRanksByDate(mapped);

    if (actor && !goodsScopeFullAccess(actor.role)) {
      const isStaff = goodsScopeIsStaffRole(actor.role);
      const isDriver = goodsScopeIsDriverRole(actor.role);
      if (isStaff || isDriver) {
        let driverScope: DriverScope | null = null;
        if (isDriver) {
          driverScope = await fetchDriverScopeForUser(actor.id);
        }
        mapped = mapped.filter((row: any) => importOrderRowMatchesGoodsScope(row, actor, driverScope));
      }
    }

    // Return paginated response with metadata
    return {
      data: mapped,
      total: filters.admin_confirmation_status ? mapped.length : total,
      page,
      pageSize,
    };
  }

  static async getById(id: string, actor?: UserPayload) {
    let { data, error } = await supabaseService
      .from('import_orders')
      .select('*, profiles:profiles!received_by(full_name, role), warehouses(name), customers:customers!import_orders_customer_id_fkey(id, name, phone, address, aliases), sender_customers:customers!import_orders_sender_id_fkey(id, name, phone), import_order_items(*, products(*)), delivery_orders(*, delivery_vehicles(*, vehicles(license_plate, profiles:profiles!vehicles_driver_id_fkey(full_name, phone), responsible_profile:profiles!vehicles_in_charge_id_fkey(full_name, phone)), profiles!driver_id(full_name, phone)))')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    let isVeg = false;
    if (!data) {
      // Try vegetable_orders fallback
      const { data: vegData, error: vegError } = await supabaseService
        .from('vegetable_orders')
        .select('*, profiles:profiles!received_by(full_name, role), warehouses(name), customers:customers!vegetable_orders_customer_id_fkey(id, name, phone, address, aliases), sender_customers:customers!vegetable_orders_sender_id_fkey(id, name, phone), vegetable_order_items(*, products(*)), delivery_orders(*, delivery_vehicles(*, vehicles(license_plate, profiles:profiles!vehicles_driver_id_fkey(full_name, phone), responsible_profile:profiles!vehicles_in_charge_id_fkey(full_name, phone)), profiles!driver_id(full_name, phone)))')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
      data = vegData;
      error = vegError;
      isVeg = true;
    }

    if (error) throw error;
    if (!data) throw new Error('Order not found');
    
    const mappedOrder = { ...data, order_category: isVeg ? 'vegetable' : 'standard', total_order_amount: Number(data.total_amount) || 0 };
    if (isVeg && mappedOrder.vegetable_order_items) {
      mappedOrder.import_order_items = mappedOrder.vegetable_order_items;
      delete mappedOrder.vegetable_order_items;
    }

    if (actor && !goodsScopeFullAccess(actor.role)) {
      const isStaff = goodsScopeIsStaffRole(actor.role);
      const isDriver = goodsScopeIsDriverRole(actor.role);
      if (isStaff || isDriver) {
        let driverScope: DriverScope | null = null;
        if (isDriver) {
          driverScope = await fetchDriverScopeForUser(actor.id);
        }
        if (!importOrderRowMatchesGoodsScope(mappedOrder, actor, driverScope)) {
          throw new Error('Order not found');
        }
      }
    }

    return mappedOrder;
  }

  static async generateOrderCode(date: string, isVeg: boolean) {
    const tName = isVeg ? 'vegetable_orders' : 'import_orders';
    const { count, error } = await supabaseService
      .from(tName)
      .select('*', { count: 'exact', head: true })
      .eq('order_date', date);

    if (error) throw error;

    const sequence = (count || 0) + 1;
    const dateStr = date.replace(/-/g, '');
    const seqStr = sequence.toString().padStart(3, '0');

    return `${dateStr}-${seqStr}`;
  }

  static async create(orderData: any, userId: string) {
    const { items, order_category, ...mainData } = orderData;
    const isVeg = order_category === 'vegetable';
    const tName = isVeg ? 'vegetable_orders' : 'import_orders';
    const iName = isVeg ? 'vegetable_order_items' : 'import_order_items';
    const fkName = isVeg ? 'vegetable_order_id' : 'import_order_id';
    const { paidAmount, debtAmount } = this.resolvePaymentAmounts(mainData);

    const orderDate = mainData.order_date || format(new Date(), 'yyyy-MM-dd');
    const orderCode = await this.generateOrderCode(orderDate, isVeg);

    // 1. Create order
    const { data: order, error: orderError } = await supabaseService
      .from(tName)
      .insert({
        order_date: orderDate,
        order_time: mainData.order_time || format(new Date(), 'HH:mm'),
        order_code: orderCode,
        received_by: mainData.received_by || userId,
        warehouse_id: mainData.warehouse_id,
        status: mainData.status || 'pending',
        notes: mainData.notes,
        license_plate: mainData.license_plate,
        driver_name: mainData.driver_name,
        supplier_name: mainData.supplier_name,
        sender_name: mainData.sender_name,
        sender_id: mainData.sender_id || null,
        receiver_name: mainData.receiver_name,
        receiver_phone: mainData.receiver_phone,
        receiver_address: mainData.receiver_address,
        selected_alias: mainData.selected_alias || null,
        sheet_number: mainData.sheet_number,
        customer_id: mainData.customer_id,
        is_custom_amount: mainData.is_custom_amount || false,
        total_amount: mainData.total_amount,
        paid_amount: paidAmount,
        debt_amount: debtAmount,
        receipt_image_url: mainData.receipt_image_url,
        receipt_image_urls: mainData.receipt_image_urls || [],
        payment_status: mainData.payment_status || 'unpaid',
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 2. Create items
    if (items && items.length > 0) {
      const itemsToInsert = items.map((item: any) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        weight_kg: item.weight_kg,
        package_type: item.package_type,
        item_note: item.item_note,
        package_quantity: item.package_quantity,
        unit_price: item.unit_price,
        image_url: (item.image_urls && item.image_urls.length > 0) ? item.image_urls.join(',') : (item.image_url || null),
        image_urls: item.image_urls || [],
        payment_status: item.payment_status || 'unpaid',
        [fkName]: (order as any).id,
      }));

      const { error: itemsError, data: insertedItems } = await supabaseService
        .from(iName)
        .insert(itemsToInsert)
        .select('*, products(name)');

      if (itemsError) throw itemsError;

      // Auto-create delivery orders
      if (insertedItems && insertedItems.length > 0) {
        const doInsert = insertedItems.map(item => ({
          [fkName]: (order as any).id,
          product_id: item.product_id,
          product_name: item.products?.name || item.package_type || 'Hàng hóa',
          total_quantity: item.quantity || 1,
          order_category: order_category || 'standard',
          delivery_date: orderDate,
          status: 'hang_o_sg'
        }));
        const { error: doError } = await supabaseService.from('delivery_orders').insert(doInsert);
        if (doError) console.error("Failed to auto-create delivery orders:", doError);
      }

    }

    return order;
  }

  static async update(id: string, orderData: any) {
    console.log('--- BACKEND UPDATE ORDER --- ID:', id, 'DATA:', orderData);
    const { items, order_category, ...mainData } = orderData;
    const isVeg = order_category === 'vegetable';
    const tName = isVeg ? 'vegetable_orders' : 'import_orders';
    const iName = isVeg ? 'vegetable_order_items' : 'import_order_items';
    const fkName = isVeg ? 'vegetable_order_id' : 'import_order_id';
    const { paidAmount, debtAmount } = this.resolvePaymentAmounts(mainData);

    // 1. Update main order
    const orderUpdateRaw: Record<string, unknown> = {
      order_date: mainData.order_date,
      order_time: mainData.order_time,
      warehouse_id: mainData.warehouse_id,
      status: mainData.status,
      notes: mainData.notes,
      license_plate: mainData.license_plate,
      driver_name: mainData.driver_name,
      supplier_name: mainData.supplier_name,
      sender_name: mainData.sender_name,
      sender_id: mainData.sender_id !== undefined ? (mainData.sender_id || null) : undefined,
      receiver_name: mainData.receiver_name,
      receiver_phone: mainData.receiver_phone,
      receiver_address: mainData.receiver_address,
      selected_alias: mainData.selected_alias !== undefined ? (mainData.selected_alias || null) : undefined,
      sheet_number: mainData.sheet_number,
      customer_id: mainData.customer_id,
      is_custom_amount: mainData.is_custom_amount !== undefined ? (mainData.is_custom_amount || false) : undefined,
      total_amount: mainData.total_amount,
      paid_amount: paidAmount,
      debt_amount: debtAmount,
      receipt_image_url: mainData.receipt_image_url,
      receipt_image_urls: mainData.receipt_image_urls !== undefined ? (mainData.receipt_image_urls || []) : undefined,
      payment_status: mainData.payment_status !== undefined ? (mainData.payment_status || 'unpaid') : undefined,
    };
    if (mainData.received_by != null && String(mainData.received_by).trim() !== '') {
      orderUpdateRaw.received_by = mainData.received_by;
    }
    const orderUpdate: Record<string, unknown> = Object.fromEntries(
      Object.entries(orderUpdateRaw).filter(([, v]) => v !== undefined)
    );

    const { data: order, error: orderError } = await supabaseService
      .from(tName)
      .update(orderUpdate)
      .eq('id', id)
      .select()
      .single();

    if (orderError) throw orderError;

    // Chỉ đồng bộ dòng hàng + delivery khi client gửi `items` (tránh xóa hết dòng khi chỉ PATCH tên khách/đại lý).
    if (items !== undefined) {
      const { error: deleteError } = await supabaseService
        .from(iName)
        .delete()
        .eq(fkName, id);

      if (deleteError) throw deleteError;

      if (items.length > 0) {
        const itemsToInsert = items.map((item: any) => {
          return {
            product_id: item.product_id,
            quantity: item.quantity,
            weight_kg: item.weight_kg,
            package_type: item.package_type,
            item_note: item.item_note,
            package_quantity: item.package_quantity,
            unit_price: item.unit_price,
            image_url: (item.image_urls && item.image_urls.length > 0) ? item.image_urls.join(',') : (item.image_url || null),
            image_urls: item.image_urls || [],
            payment_status: item.payment_status || 'unpaid',
            [fkName]: id,
          };
        });

        const { error: insertError, data: insertedItems } = await supabaseService
          .from(iName)
          .insert(itemsToInsert)
          .select('*, products(name)');

        if (insertError) throw insertError;

        const { data: existingDO } = await supabaseService
          .from('delivery_orders')
          .select('id, delivery_vehicles(id)')
          .eq(fkName, id);

        const deletableIds = existingDO?.filter(d => !d.delivery_vehicles || d.delivery_vehicles.length === 0).map(d => d.id) || [];

        if (deletableIds.length > 0) {
          await supabaseService.from('delivery_orders').delete().in('id', deletableIds);
        }

        if (insertedItems && insertedItems.length > 0) {
          const newDoInsert = insertedItems.map(item => ({
            [fkName]: id,
            product_id: item.product_id,
            product_name: item.products?.name || item.package_type || 'Hàng hóa',
            total_quantity: item.quantity || 1,
            order_category: order_category || 'standard',
            delivery_date: mainData.order_date || format(new Date(), 'yyyy-MM-dd'),
            status: 'hang_o_sg'
          }));
          const { error: doError } = await supabaseService.from('delivery_orders').insert(newDoInsert);
          if (doError) console.error("Failed to sync delivery orders on update:", doError);
        }
      }
    }

    return order;
  }

  static async confirmByAdmin(id: string, confirmedBy: string, orderCategory?: 'standard' | 'vegetable') {
    const tryConfirm = async (tableName: 'import_orders' | 'vegetable_orders') => {
      const { data: targetOrder, error: targetError } = await supabaseService
        .from(tableName)
        .select('id, profiles:profiles!received_by(role)')
        .eq('id', id)
        .is('deleted_at', null)
        .is('admin_confirmed_at', null)
        .maybeSingle();

      if (targetError) throw targetError;
      if (!targetOrder) return null;

      const receivedByProfile = Array.isArray((targetOrder as any).profiles)
        ? (targetOrder as any).profiles[0]
        : (targetOrder as any).profiles;
      if (receivedByProfile?.role !== 'customer') {
        throw new Error('Chỉ đơn do khách hàng tự tạo mới cần admin xác nhận');
      }

      if (tableName === 'vegetable_orders') {
        const { data: deliveryRows, error: deliveryError } = await supabaseService
          .from('delivery_orders')
          .select('id, delivery_vehicles(id)')
          .eq('vegetable_order_id', id);

        if (deliveryError) throw deliveryError;

        const hasUnassignedDelivery = !deliveryRows?.length
          || deliveryRows.some((row: any) => !Array.isArray(row.delivery_vehicles) || row.delivery_vehicles.length === 0);

        if (hasUnassignedDelivery) {
          throw new Error('Vui lòng chọn xe lớn và tài xế trước khi xác nhận đơn rau');
        }
      }

      const { data, error } = await supabaseService
        .from(tableName)
        .update({
          admin_confirmed_at: new Date().toISOString(),
          admin_confirmed_by: confirmedBy,
          received_by: confirmedBy,
        })
        .eq('id', id)
        .is('deleted_at', null)
        .is('admin_confirmed_at', null)
        .select('id, order_code, status, admin_confirmed_at, admin_confirmed_by, received_by')
        .maybeSingle();

      if (error) throw error;
      return data;
    };

    if (orderCategory === 'standard') {
      const data = await tryConfirm('import_orders');
      if (!data) throw new Error('Đơn không tồn tại hoặc đã được xác nhận');
      return { ...data, order_category: 'standard' as const };
    }

    if (orderCategory === 'vegetable') {
      const data = await tryConfirm('vegetable_orders');
      if (!data) throw new Error('Đơn không tồn tại hoặc đã được xác nhận');
      return { ...data, order_category: 'vegetable' as const };
    }

    const standardOrder = await tryConfirm('import_orders');
    if (standardOrder) {
      return { ...standardOrder, order_category: 'standard' as const };
    }

    const vegetableOrder = await tryConfirm('vegetable_orders');
    if (vegetableOrder) {
      return { ...vegetableOrder, order_category: 'vegetable' as const };
    }

    throw new Error('Đơn không tồn tại hoặc đã được xác nhận');
  }

  static async delete(id: string) {
    const deletedAt = new Date().toISOString();

    const { data: importOrder, error: importErr } = await supabaseService
      .from('import_orders')
      .update({ deleted_at: deletedAt })
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (importErr) throw importErr;
    if (importOrder) return;

    const { data: vegetableOrder, error: vegErr } = await supabaseService
      .from('vegetable_orders')
      .update({ deleted_at: deletedAt })
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (vegErr) throw vegErr;
    if (!vegetableOrder) throw new Error('Order not found or already deleted');
  }
}
