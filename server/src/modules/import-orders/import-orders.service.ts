import { supabaseService } from '../../config/supabase';
import { format } from 'date-fns';
import type { UserPayload } from '../../types';
import type { OrderCategory } from '../../types/order-category';
import {
  fetchDriverScopeForUser,
  goodsScopeFullAccess,
  goodsScopeIsDriverRole,
  goodsScopeIsStaffRole,
  importOrderRowMatchesGoodsScope,
  type DriverScope,
} from '../../utils/goodsScope';
import { resolveGroceryFlag } from '../../utils/groceryDirection';
import { listImportOrders } from './import-order-list';
import { prepareAssignedVegetableEdit, applyAssignedVegetableEdit } from './assigned-vegetable-edit';

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
    return listImportOrders(filters, actor);
  }

  static async getById(id: string, actor?: UserPayload, category?: OrderCategory) {
    const table = category === 'vegetable' ? 'vegetable_orders' : 'import_orders';
    const items = category === 'vegetable' ? 'vegetable_order_items' : 'import_order_items';
    let { data, error } = await supabaseService
      .from(table)
      .select(`*, profiles:profiles!received_by(full_name, role), warehouses(name), customers:customers!${table}_customer_id_fkey(id, name, phone, address, aliases), sender_customers:customers!${table}_sender_id_fkey(id, name, phone), ${items}(*, products(*)), delivery_orders(*, delivery_vehicles(*, vehicles(license_plate, profiles:profiles!vehicles_driver_id_fkey(full_name, phone), responsible_profile:profiles!vehicles_in_charge_id_fkey(full_name, phone)), profiles!driver_id(full_name, phone)))`)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    let isVeg = category === 'vegetable';
    if (!data && !category) {
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
    const { items, order_category, direction, ...mainData } = orderData;
    const isVeg = order_category === 'vegetable';
    const tName = isVeg ? 'vegetable_orders' : 'import_orders';
    const iName = isVeg ? 'vegetable_order_items' : 'import_order_items';
    const fkName = isVeg ? 'vegetable_order_id' : 'import_order_id';
    mainData.is_return_to_sg = resolveGroceryFlag({ ...mainData, direction, order_category });
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
        ...(!isVeg ? { is_return_to_sg: mainData.is_return_to_sg || false } : {}),
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
          status: mainData.is_return_to_sg ? 'can_giao' : 'hang_o_sg'
        }));
        const { error: doError } = await supabaseService.from('delivery_orders').insert(doInsert);
        if (doError) console.error("Failed to auto-create delivery orders:", doError);
      }

    }

    return order;
  }

  static async update(id: string, orderData: any, category?: OrderCategory, actor?: UserPayload) {
    const existing = await this.getById(id, actor, category);
    if (orderData.order_category && existing.order_category !== orderData.order_category) throw new Error('Order category cannot be changed');
    const { items: submittedItems, direction, ...rest } = orderData;
    let items = submittedItems;
    let assignedEdit: Awaited<ReturnType<typeof prepareAssignedVegetableEdit>> | undefined;
    let itemPaymentUpdates: Array<{ id: string; payment_status: string }> = [];
    if (items !== undefined) {
      const fingerprint = (rows: any[]) => JSON.stringify(rows.map(item => ({
        product_id: item.product_id || null, quantity: Number(item.quantity),
        weight_kg: Number(item.weight_kg) || 0, package_type: item.package_type || null,
        item_note: item.item_note || null, unit_price: Number(item.unit_price) || 0,
        package_quantity: Number(item.package_quantity) || 0,
        images: item.image_urls?.length ? item.image_urls : (item.image_url ? String(item.image_url).split(',').map((url: string) => url.trim()) : []),
      })));
      const unchanged = fingerprint(items) === fingerprint(existing.import_order_items || []);
      const assigned = (existing.delivery_orders || []).some((delivery: any) => delivery.delivery_vehicles?.length);
      if (assigned && existing.order_category === 'vegetable' && actor && (actor.role === 'admin' || goodsScopeIsDriverRole(actor.role))) {
        assignedEdit = await prepareAssignedVegetableEdit(existing, items, rest);
        items = undefined;
      } else if (unchanged) {
        itemPaymentUpdates = items.flatMap((item: any, index: number) => {
          const previous = existing.import_order_items[index];
          return item.payment_status !== undefined && item.payment_status !== previous.payment_status
            ? [{ id: previous.id, payment_status: item.payment_status }] : [];
        });
        items = undefined;
      } else if (assigned) throw new Error('Cannot replace order items after vehicle assignment; edit the delivery instead');
    }
    const order_category = existing.order_category;
    const mainData = { ...rest, is_return_to_sg: resolveGroceryFlag({ ...rest, direction, order_category }, existing) };
    if (assignedEdit) {
      mainData.total_amount = assignedEdit.rows.reduce((sum, row) => sum + row.item.quantity * Number(row.item.unit_price || 0), 0);
      mainData.payment_status ??= existing.payment_status;
    }
    const isVeg = order_category === 'vegetable';
    const tName = isVeg ? 'vegetable_orders' : 'import_orders';
    const iName = isVeg ? 'vegetable_order_items' : 'import_order_items';
    const fkName = isVeg ? 'vegetable_order_id' : 'import_order_id';
    const markingVegetablePaid = isVeg && mainData.payment_status === 'paid';
    const { paidAmount, debtAmount } = this.resolvePaymentAmounts(
      markingVegetablePaid ? { ...mainData, total_amount: mainData.total_amount ?? existing.total_amount } : mainData
    );

    if (markingVegetablePaid) {
      const deliveryIds = (existing.delivery_orders || []).map((delivery: { id: string }) => delivery.id);
      if (deliveryIds.length > 0) {
        const { error: paymentError } = await supabaseService
          .from('delivery_vehicles')
          .update({ export_payment_status: 'paid' })
          .in('delivery_order_id', deliveryIds);
        if (paymentError) throw paymentError;
      }
    }

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
      ...(!isVeg ? { is_return_to_sg: mainData.is_return_to_sg } : {}),
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

    for (const item of itemPaymentUpdates) {
      const { error } = await supabaseService.from(iName).update({ payment_status: item.payment_status }).eq('id', item.id).eq(fkName, id);
      if (error) throw error;
    }

    if (assignedEdit && actor) {
      await applyAssignedVegetableEdit(id, assignedEdit, actor.id);
      const { error: totalsError } = await supabaseService.from(tName).update({
        total_amount: mainData.total_amount, paid_amount: paidAmount, debt_amount: debtAmount,
        payment_status: mainData.payment_status,
      }).eq('id', id).select().single();
      if (totalsError) throw totalsError;
      return this.getById(id, actor, category);
    }

    if (!isVeg && mainData.is_return_to_sg === true) {
      const { error: deliveryStatusError } = await supabaseService
        .from('delivery_orders')
        .update({ status: 'can_giao' })
        .eq('import_order_id', id)
        .eq('status', 'hang_o_sg');
      if (deliveryStatusError) throw deliveryStatusError;
    }

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
            status: mainData.is_return_to_sg ? 'can_giao' : 'hang_o_sg'
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

  static async delete(id: string, category?: OrderCategory) {
    const deletedAt = new Date().toISOString();

    if (category) {
      const { data, error } = await supabaseService
        .from(category === 'vegetable' ? 'vegetable_orders' : 'import_orders')
        .update({ deleted_at: deletedAt })
        .eq('id', id)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Order not found or already deleted');
      return;
    }

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
