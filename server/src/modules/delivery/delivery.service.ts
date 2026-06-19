import { supabaseService } from '../../config/supabase';
import { format } from 'date-fns';
import type { UserPayload } from '../../types';
import {
  deliveryOrderRowMatchesGoodsScope,
  fetchDriverScopeForUser,
  goodsScopeFullAccess,
  goodsScopeIsDriverRole,
  goodsScopeIsStaffRole,
  importOrderRowMatchesGoodsScope,
  type DriverScope,
} from '../../utils/goodsScope';
import { zaloService } from '../notifications/zalo.service';
import { normalizePhoneForAuth } from '../../utils/phoneAuth';
import { logger } from '../../utils/logger';

export class DeliveryService {
  /** TIME / chuỗi từ DB → "HH:mm" cho phiếu xuất */
  private static formatDeliveryTimeHHmm(raw: unknown): string | null {
    if (raw == null || raw === '') return null;
    const s = String(raw);
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }

  /** ISO từ client (lúc bấm Lưu sau khi chụp/tải ảnh) — chỉ dùng khi chuyển sang da_giao */
  private static parseClientDeliveredAtIso(raw?: string | null): string | null {
    if (raw == null || typeof raw !== 'string' || raw.trim() === '') return null;
    const d = new Date(raw.trim());
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  /** TIMESTAMPTZ (UTC) → "HH:mm" theo Asia/Ho_Chi_Minh cho phiếu xuất */
  private static formatVnHHmmFromIsoUtc(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hour = parts.find((p) => p.type === 'hour')?.value;
    const minute = parts.find((p) => p.type === 'minute')?.value;
    if (hour == null || minute == null) return null;
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  /** Chỉ đánh dấu đã giao khi đã phân đủ số lượng; còn hàng thì can_giao. */
  private static resolveDeliveryStatusFromAssignedQuantity(
    totalQuantity: unknown,
    totalAssigned: number,
    options?: { previousStatus?: string | null; preserveHangOsgWhenUnassigned?: boolean }
  ): 'hang_o_sg' | 'can_giao' | 'da_giao' {
    const tq = Number(totalQuantity || 0);
    const ta = Math.max(0, Number(totalAssigned || 0));
    if (tq > 0 && ta >= tq) return 'da_giao';
    if (
      options?.preserveHangOsgWhenUnassigned &&
      options.previousStatus === 'hang_o_sg' &&
      ta === 0
    ) {
      return 'hang_o_sg';
    }
    return 'can_giao';
  }

  private static async syncExportOrderForDelivery(
    deliveryId: string,
    totalAssigned: number,
    userId?: string,
    exportPaymentStatus?: 'unpaid' | 'paid',
    assignments?: Array<{ expected_amount?: number | null }>
  ) {
    const { data: deliveryOrder, error: deliveryError } = await supabaseService
      .from('delivery_orders')
      .select(
        'id, product_name, unit_price, delivery_date, delivery_time, order_category, import_order_id, vegetable_order_id, image_url, image_urls, total_quantity, driver_delivered_at'
      )
      .eq('id', deliveryId)
      .single();

    if (deliveryError || !deliveryOrder) throw deliveryError || new Error('Không tìm thấy đơn giao hàng');

    const exportTimeFromDelivery =
      DeliveryService.formatVnHHmmFromIsoUtc((deliveryOrder as any).driver_delivered_at) ||
      DeliveryService.formatDeliveryTimeHHmm((deliveryOrder as any).delivery_time);

    // Chỉ đồng bộ phiếu xuất cho hàng tạp hóa (standard) từ trang DeliveryPage.
    if (deliveryOrder.order_category && deliveryOrder.order_category !== 'standard') {
      return;
    }

    let customerId: string | null = null;
    if (deliveryOrder.import_order_id) {
      const { data: importOrder } = await supabaseService
        .from('import_orders')
        .select('customer_id')
        .eq('id', deliveryOrder.import_order_id)
        .single();
      customerId = importOrder?.customer_id || null;
    } else if (deliveryOrder.vegetable_order_id) {
      const { data: vegetableOrder } = await supabaseService
        .from('vegetable_orders')
        .select('customer_id')
        .eq('id', deliveryOrder.vegetable_order_id)
        .single();
      customerId = vegetableOrder?.customer_id || null;
    }

    const exportDate = deliveryOrder.delivery_date || format(new Date(), 'yyyy-MM-dd');
    const safeQuantity = Math.max(0, totalAssigned || 0);
    const expectedAmountFromAssignments = (assignments || []).reduce(
      (sum, assignment) => sum + Math.max(0, Number(assignment?.expected_amount || 0)),
      0
    );
    const debtAmount = expectedAmountFromAssignments;

    const { data: existingExportOrder } = await supabaseService
      .from('export_orders')
      .select('id, paid_amount, export_time')
      .eq('product_id', deliveryId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingExportOrder) {
      const paidAmount = Number(existingExportOrder.paid_amount || 0);
      let nextPaidAmount = Math.min(paidAmount, debtAmount);
      let nextPaymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';

      if (exportPaymentStatus === 'paid') {
        nextPaidAmount = debtAmount;
        nextPaymentStatus = debtAmount > 0 ? 'paid' : 'unpaid';
      } else if (exportPaymentStatus === 'unpaid') {
        nextPaidAmount = 0;
        nextPaymentStatus = 'unpaid';
      } else if (nextPaidAmount > 0 && nextPaidAmount < debtAmount) {
        nextPaymentStatus = 'partial';
      } else if (debtAmount > 0 && nextPaidAmount >= debtAmount) {
        nextPaymentStatus = 'paid';
      }

      const updatePayload: Record<string, any> = {
        export_date: exportDate,
        export_time:
          exportTimeFromDelivery ||
          existingExportOrder.export_time ||
          format(new Date(), 'HH:mm'),
        product_name: deliveryOrder.product_name,
        quantity: safeQuantity,
        debt_amount: debtAmount,
        paid_amount: nextPaidAmount,
        payment_status: nextPaymentStatus,
      };

      if (customerId) {
        updatePayload.customer_id = customerId;
      }

      if (deliveryOrder.image_url) {
        updatePayload.image_url = deliveryOrder.image_url;
      }
      if (deliveryOrder.image_urls?.length) {
        updatePayload.image_urls = deliveryOrder.image_urls;
      }

      const { error: updateError } = await supabaseService
        .from('export_orders')
        .update(updatePayload)
        .eq('id', existingExportOrder.id);

      if (updateError) throw updateError;

      const exportSyncStatus = this.resolveDeliveryStatusFromAssignedQuantity(
        deliveryOrder.total_quantity,
        safeQuantity
      );
      await supabaseService.from('delivery_orders').update({ status: exportSyncStatus }).eq('id', deliveryId);

      return;
    }

    const createPayload: Record<string, any> = {
      export_date: exportDate,
      export_time: exportTimeFromDelivery || format(new Date(), 'HH:mm'),
      product_id: deliveryId,
      product_name: deliveryOrder.product_name,
      quantity: safeQuantity,
      debt_amount: debtAmount,
      payment_status: exportPaymentStatus === 'paid' && debtAmount > 0 ? 'paid' : 'unpaid',
      paid_amount: exportPaymentStatus === 'paid' ? debtAmount : 0,
    };

    if (userId) {
      createPayload.created_by = userId;
    }

    if (customerId) {
      createPayload.customer_id = customerId;
    }

    if (deliveryOrder.image_url) {
      createPayload.image_url = deliveryOrder.image_url;
    }
    if (deliveryOrder.image_urls?.length) {
      createPayload.image_urls = deliveryOrder.image_urls;
    }

    const { error: createError } = await supabaseService
      .from('export_orders')
      .insert(createPayload);

    if (createError) throw createError;

    const exportSyncStatus = this.resolveDeliveryStatusFromAssignedQuantity(
      deliveryOrder.total_quantity,
      safeQuantity
    );
    await supabaseService.from('delivery_orders').update({ status: exportSyncStatus }).eq('id', deliveryId);
  }

  private static deliverySourceIsSoftDeleted(row: any): boolean {
    const io = row?.import_orders;
    const vo = row?.vegetable_orders;
    const ioDel = Array.isArray(io) ? io[0]?.deleted_at : io?.deleted_at;
    const voDel = Array.isArray(vo) ? vo[0]?.deleted_at : vo?.deleted_at;
    return Boolean(ioDel || voDel);
  }

  private static pickDeliveryRelation(relation: any): any {
    if (Array.isArray(relation)) return relation[0];
    return relation || undefined;
  }

  private static getDeliveryReceiverForGroup(row: any): string {
    const src = this.pickDeliveryRelation(row?.import_orders) || this.pickDeliveryRelation(row?.vegetable_orders);
    if (!src) return '-';
    if (row?.status === 'hang_o_sg' && src.selected_alias) return src.selected_alias;
    return src.customers?.name || src.receiver_name?.trim() || src.profiles?.full_name || '-';
  }

  private static getDeliverySourcePaymentStatusForGroup(row: any): string {
    const src = this.pickDeliveryRelation(row?.import_orders) || this.pickDeliveryRelation(row?.vegetable_orders);
    return src?.payment_status || 'unpaid';
  }

  private static getDeliveryScopeGroupKey(row: any): string {
    if (row?.status === 'hang_o_sg') return `single:${row?.id}`;
    const deliveryDate = row?.delivery_date || 'N/A';
    const category = row?.order_category || 'standard';
    const receiver = this.getDeliveryReceiverForGroup(row);
    const product = (row?.product_name || '').trim();
    const paymentStatus = this.getDeliverySourcePaymentStatusForGroup(row);
    return `${deliveryDate}|${category}|${receiver}|${product}|${paymentStatus}`;
  }

  static async getAllToday(startDate?: string, endDate?: string, orderCategory?: string, actor?: UserPayload) {
    let driverScope: DriverScope | null = null;
    if (actor && goodsScopeIsDriverRole(actor.role) && !goodsScopeFullAccess(actor.role)) {
      driverScope = await fetchDriverScopeForUser(actor.id);
    }

    const selectClause =
      '*, import_orders(order_code, created_at, sender_name, sender_id, receiver_name, receiver_phone, customer_id, selected_alias, license_plate, driver_name, received_by, admin_confirmed_at, customers:customers!import_orders_customer_id_fkey(name, phone), sender_customers:customers!import_orders_sender_id_fkey(name, phone), total_amount, payment_status, profiles:profiles!received_by(full_name, role), receipt_image_url, receipt_image_urls, import_order_items(id, image_url, image_urls, products(name)), deleted_at), vegetable_orders(order_code, sender_name, sender_id, receiver_name, receiver_phone, customer_id, selected_alias, license_plate, driver_name, received_by, customers:customers!vegetable_orders_customer_id_fkey(name, phone), sender_customers:customers!vegetable_orders_sender_id_fkey(name, phone), total_amount, payment_status, profiles:profiles!received_by(full_name), receipt_image_url, receipt_image_urls, vegetable_order_items(id, image_url, image_urls, products(name)), deleted_at), delivery_vehicles(*, vehicles(license_plate, in_charge_id)), payment_collections(id, status, vehicle_id, image_url)';

    const pageSize = 1000;
    const rawData: any[] = [];

    for (let from = 0; ; from += pageSize) {
      let query = supabaseService
        .from('delivery_orders')
        .select(selectClause)
        .order('delivery_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (orderCategory) query = query.eq('order_category', orderCategory);

      if (startDate) {
        const startT = `${startDate}T00:00:00.000Z`;
        const endDateStr = endDate || startDate;
        const endT = `${endDateStr}T23:59:59.999Z`;

        // Filter by (confirmed_at in range) OR (created_at in range)
        // Note: and() nested in or() is supported in modern PostgREST
        query = query.or(`and(confirmed_at.gte.${startT},confirmed_at.lte.${endT}),and(created_at.gte.${startT},created_at.lte.${endT})`);
      } else {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        query = query.gte('created_at', sevenDaysAgo.toISOString());
      }

      const { data: pageData, error } = await query;
      if (error) throw error;

      rawData.push(...(pageData || []));
      if (!pageData || pageData.length < pageSize) break;
    }

    let data = (rawData || []).filter((row: any) => !this.deliverySourceIsSoftDeleted(row));
    data = data.filter((row: any) => {
      if ((row.order_category || 'standard') !== 'standard') return true;
      const sourceOrder = Array.isArray(row.import_orders) ? row.import_orders[0] : row.import_orders;
      if (sourceOrder?.profiles?.role !== 'customer') return true;
      return Boolean(sourceOrder.admin_confirmed_at);
    });

    if (actor && !goodsScopeFullAccess(actor.role)) {
      const isStaff = goodsScopeIsStaffRole(actor.role);
      const isDriver = goodsScopeIsDriverRole(actor.role);
      if (isStaff || isDriver) {
        const visibleRows = data.filter((row: any) => deliveryOrderRowMatchesGoodsScope(row, actor, driverScope));
        const visibleGroupKeys = new Set(
          visibleRows.map((row: any) => this.getDeliveryScopeGroupKey(row))
        );
        data = data.filter((row: any) => visibleGroupKeys.has(this.getDeliveryScopeGroupKey(row)));
      }
    }

    if (data.length === 0) return data;

    const deliveryIds = data.map((row: any) => row.id).filter(Boolean);
    if (deliveryIds.length === 0) return data;

    const chunkSize = 100;
    let exportOrders: any[] = [];
    for (let i = 0; i < deliveryIds.length; i += chunkSize) {
      const chunk = deliveryIds.slice(i, i + chunkSize);
      const { data: chunkData, error: exportOrdersError } = await supabaseService
        .from('export_orders')
        .select('product_id, payment_status, created_at')
        .in('product_id', chunk)
        .order('created_at', { ascending: false });

      if (exportOrdersError) throw exportOrdersError;
      if (chunkData) exportOrders = exportOrders.concat(chunkData);
    }

    const paymentStatusByDeliveryId = new Map<string, 'unpaid' | 'partial' | 'paid'>();
    (exportOrders || []).forEach((row: any) => {
      if (!row.product_id || paymentStatusByDeliveryId.has(row.product_id)) return;
      paymentStatusByDeliveryId.set(row.product_id, row.payment_status || 'unpaid');
    });

    return data.map((row: any) => ({
      ...row,
      export_order_payment_status: paymentStatusByDeliveryId.get(row.id),
    }));
  }

  static async create(deliveryData: any, userId?: string) {
    const { vehicles, ...orderData } = deliveryData;
    const insertRow: any = {
      ...orderData,
      order_category: orderData.order_category || 'standard',
      status: vehicles && vehicles.length > 0 ? 'can_giao' : 'hang_o_sg',
    };
    if (insertRow.delivery_time === '' || insertRow.delivery_time == null) {
      delete insertRow.delivery_time;
    }

    // 1. Create the delivery order
    const { data: order, error } = await supabaseService
      .from('delivery_orders')
      .insert(insertRow)
      .select()
      .single();

    if (error) throw error;

    // 2. Assign vehicles if provided
    if (vehicles && vehicles.length > 0) {
      const totalAssigned = vehicles.reduce((sum: number, v: any) => sum + v.quantity, 0);
      if (totalAssigned > order.total_quantity) {
        throw new Error('Tổng số lượng gán cho xe không được vượt quá số hàng trong đơn');
      }

      await this.assignVehicles(order.id, vehicles, undefined, userId);
    }

    return order;
  }

  static async assignVehicles(
    deliveryId: string,
    assignments: any[],
    image_url?: string | null,
    userId?: string,
    exportPaymentStatus?: 'unpaid' | 'paid',
    unit_price?: number,
    image_urls?: string[],
    clientDeliveredAtIso?: string | null,
    delivery_date?: string,
    delivery_time?: string,
    appendOnly?: boolean
  ) {
    const updateData: any = {};
    if (image_url !== undefined) {
      updateData.image_url = image_url;
    }
    if (image_urls !== undefined) {
      updateData.image_urls = image_urls;
    }
    if (unit_price !== undefined) {
      updateData.unit_price = unit_price;
    }
    if (delivery_date !== undefined) {
      updateData.delivery_date = delivery_date;
    }
    if (delivery_time !== undefined) {
      updateData.delivery_time = delivery_time;
    }

    if (Object.keys(updateData).length > 0) {
      const { error: doUpdateError } = await supabaseService
        .from('delivery_orders')
        .update(updateData)
        .eq('id', deliveryId);

      if (doUpdateError) throw doUpdateError;
    }

    // Fetch existing assigned vehicle IDs for this delivery order to handle un-assignments
    const { data: existingDvs } = await supabaseService
      .from('delivery_vehicles')
      .select('id, vehicle_id, assigned_quantity, driver_id, delivery_time, delivery_date, expected_amount')
      .eq('delivery_order_id', deliveryId);

    const existingVids = (existingDvs || []).map((dv: any) => dv.vehicle_id).filter(Boolean);
    const vIds = assignments.map(a => a.vehicle_id).filter(Boolean);
    // Union of existing + new vIds: ensures removed vehicles are also deleted
    const allVidsToDelete = Array.from(new Set([...existingVids, ...vIds]));

    // Identify which assignments are truly new or modified
    const unconsumedExisting = [...(existingDvs || [])];
    const isNewOrModified = assignments.map(a => {
      if (appendOnly) return true;

      const matchIdx = unconsumedExisting.findIndex(ed =>
        ed.vehicle_id === a.vehicle_id &&
        Number(ed.assigned_quantity) === Number(a.quantity) &&
        Number(ed.expected_amount || 0) === Number(a.expected_amount || 0) &&
        ed.driver_id === a.driver_id &&
        ed.delivery_time === (a.delivery_time || delivery_time || null) &&
        ed.delivery_date === (a.delivery_date || delivery_date || null)
      );

      if (matchIdx > -1) {
        unconsumedExisting.splice(matchIdx, 1);
        return false;
      }
      return true;
    });

    if (!appendOnly && allVidsToDelete.length > 0) {
      await supabaseService
        .from('delivery_vehicles')
        .delete()
        .eq('delivery_order_id', deliveryId)
        .in('vehicle_id', allVidsToDelete);

      await supabaseService
        .from('payment_collections')
        .delete()
        .eq('delivery_order_id', deliveryId)
        .in('vehicle_id', allVidsToDelete)
        .in('status', ['draft']);
    }

    const insertData = assignments.map(a => ({
      delivery_order_id: deliveryId,
      vehicle_id: a.vehicle_id,
      driver_id: a.driver_id,
      loader_name: a.loader_name || null,
      assigned_quantity: a.quantity,
      expected_amount: a.expected_amount || 0,
      image_urls: Array.isArray(a.image_urls) && a.image_urls.length > 0 ? a.image_urls : [],
      delivery_date: a.delivery_date || delivery_date || undefined,
      delivery_time: a.delivery_time || delivery_time || undefined,
      export_payment_status: a.export_payment_status || 'unpaid',
    }));

    const { data, error } = await supabaseService
      .from('delivery_vehicles')
      .insert(insertData)
      .select();

    if (error) throw error;

    // Tự động tạo phiếu thu nháp cho từng xe nếu có expected_amount > 0
    {
      const { data: doInfo } = await supabaseService
        .from('delivery_orders')
        .select('import_orders(customer_id), vegetable_orders(customer_id)')
        .eq('id', deliveryId)
        .single();

      if (doInfo) {
        const ioOrVeg: any = (doInfo as any).vegetable_orders || (doInfo as any).import_orders;
        const sourceOrder = Array.isArray(ioOrVeg) ? ioOrVeg[0] : ioOrVeg;
        const customerId = sourceOrder?.customer_id ?? null;

        for (const dv of (data || [])) {
          if (Number(dv.expected_amount || 0) > 0) {
            try {
              await supabaseService.from('payment_collections').insert({
                delivery_order_id: deliveryId,
                customer_id: customerId,
                driver_id: dv.driver_id,
                vehicle_id: dv.vehicle_id,
                expected_amount: dv.expected_amount,
                collected_amount: dv.expected_amount,
                collected_at: new Date().toISOString(),
                status: 'draft',
              });
            } catch (pcError) {
              console.error('Failed to auto-create payment collection for driver', dv.driver_id, pcError);
            }
          }
        }
      }
    }

    // Update vehicle status
    const vehicleIds = (assignments || []).map(a => a.vehicle_id).filter(id => !!id);
    if (vehicleIds.length > 0) {
      await supabaseService
        .from('vehicles')
        .update({ status: 'in_transit' })
        .in('id', vehicleIds);
    }

    // Trạng thái: chỉ da_giao khi đã phân đủ SL; còn hàng → can_giao (giữ hang_o_sg nếu chưa gán xe nào).
    const { data: allDvs } = await supabaseService
      .from('delivery_vehicles')
      .select('assigned_quantity, expected_amount')
      .eq('delivery_order_id', deliveryId);

    const totalAssigned = (allDvs || []).reduce((sum: number, dv: any) => sum + (dv.assigned_quantity || 0), 0);

    const { data: doData } = await supabaseService
      .from('delivery_orders')
      .select('total_quantity, status, order_category')
      .eq('id', deliveryId)
      .single();

    if (doData) {
      const nextStatus = this.resolveDeliveryStatusFromAssignedQuantity(
        doData.total_quantity,
        totalAssigned,
        { previousStatus: doData.status, preserveHangOsgWhenUnassigned: true }
      );
      const rowUpdate: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === 'da_giao' && doData.status !== 'da_giao') {
        rowUpdate.driver_delivered_at =
          DeliveryService.parseClientDeliveredAtIso(clientDeliveredAtIso) || new Date().toISOString();
      } else if (nextStatus !== 'da_giao') {
        rowUpdate.driver_delivered_at = null;
      }
      await supabaseService.from('delivery_orders').update(rowUpdate).eq('id', deliveryId);
    }

    await this.syncExportOrderForDelivery(
      deliveryId,
      totalAssigned,
      userId,
      exportPaymentStatus,
      allDvs
    );

    // Trigger immediate Zalo send asynchronously (fire-and-forget).
    // Always attempt after assignment save; service will decide if images/recipient are valid.
    // Trigger immediate Zalo send only for new/modified assignments
    const newAssignmentIds: string[] = [];
    if (data && data.length === assignments.length) {
      for (let i = 0; i < assignments.length; i++) {
        if (isNewOrModified[i]) {
          newAssignmentIds.push(data[i].id);
        }
      }
    }

    if (newAssignmentIds.length > 0) {
      zaloService
        .sendDeliveryImagesImmediate(
          deliveryId,
          supabaseService,
          logger,
          normalizePhoneForAuth,
          newAssignmentIds
        )
        .catch((err) => {
          logger.error('[assignVehicles] Async Zalo send error (non-blocking):', err);
        });
    }

    return data;
  }

  static async assignVehiclesByGroup(
    sourceOrderIds: string[],
    assignments: any[],
    userId?: string,
    exportPaymentStatus?: 'unpaid' | 'paid',
    unit_price?: number,
    clientDeliveredAtIso?: string | null,
    delivery_date?: string,
    delivery_time?: string,
    appendOnly?: boolean
  ) {
    const uniqueSourceIds = Array.from(new Set((sourceOrderIds || []).filter(Boolean)));
    if (uniqueSourceIds.length === 0) {
      throw new Error('Thiếu source_order_ids để phân xe theo nhóm.');
    }

    const { data: sourceOrders, error: sourceError } = await supabaseService
      .from('delivery_orders')
      .select('id, total_quantity, created_at')
      .in('id', uniqueSourceIds);

    if (sourceError) throw sourceError;
    if (!sourceOrders || sourceOrders.length === 0) {
      throw new Error('Không tìm thấy đơn nguồn để phân xe theo nhóm.');
    }

    const sourceById = new Map<string, any>();
    sourceOrders.forEach((order: any) => sourceById.set(order.id, order));

    const orderedSources = uniqueSourceIds
      .map((id) => sourceById.get(id))
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const perOrderAssignments = new Map<string, any[]>();
    orderedSources.forEach((order: any) => perOrderAssignments.set(order.id, []));

    const getUsedOfOrder = (orderId: string) => {
      const rows = perOrderAssignments.get(orderId) || [];
      return rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    };

    // Phân bổ: Không xé lẻ một dòng xe (assignment) ra nhiều đơn hàng.
    // Ưu tiên điền vào các đơn hàng còn trống, nếu hết đơn hàng còn trống thì dồn vào đơn cuối.
    for (const row of assignments) {
      const rowQty = Number(row.quantity) || 0;
      if (rowQty <= 0) continue;

      const rowExpectedAmount = Math.max(0, Number(row.expected_amount || 0));

      // Tìm đơn hàng nguồn đầu tiên còn "chỗ" (SL tổng > SL đã dùng trong đợt phân này)
      let targetSource = orderedSources.find(source => {
        const used = getUsedOfOrder(source.id);
        return (Number(source.total_quantity) || 0) > used;
      });

      // Nếu tất cả đã đầy hoặc vượt, dồn vào đơn cuối cùng của nhóm (để đảm bảo không bị mất dòng xe)
      if (!targetSource) {
        targetSource = orderedSources[orderedSources.length - 1];
      }

      if (!targetSource) continue; // Safety

      const sourceId = targetSource.id as string;
      const sourceRows = perOrderAssignments.get(sourceId) || [];
      sourceRows.push({
        ...row,
        quantity: rowQty,
        expected_amount: rowExpectedAmount,
      });
      perOrderAssignments.set(sourceId, sourceRows);
    }

    const result: Record<string, any> = {};
    // Khi appendOnly = false (Sửa), ta cần gọi assignVehicles cho TẤT CẢ các đơn trong nhóm 
    // để đảm bảo các xe liên quan được dọn dẹp sạch sẽ ở những đơn không còn được phân bổ xe đó.
    // Khi appendOnly = true (Thêm mới), chỉ cần gọi cho những đơn thực sự nhận hàng mới.
    const targetsToProcess = appendOnly
      ? orderedSources.filter(s => (perOrderAssignments.get(s.id) || []).length > 0)
      : orderedSources;

    for (const source of targetsToProcess) {
      const sourceId = source.id as string;
      const sourceRows = perOrderAssignments.get(sourceId) || [];

      const saved = await this.assignVehicles(
        sourceId,
        sourceRows,
        undefined,
        userId,
        exportPaymentStatus,
        unit_price,
        undefined,
        clientDeliveredAtIso,
        delivery_date,
        delivery_time,
        appendOnly
      );
      result[sourceId] = saved;
    }

    return { success: true, updated_orders: Object.keys(result).length, details: result };
  }

  static async updateQuantity(id: string, deliveredQty: number) {
    // 1. Get current data
    const { data: order, error: fetchError } = await supabaseService
      .from('delivery_orders')
      .select('total_quantity, delivered_quantity, status')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const newDelivered = (order.delivered_quantity || 0) + deliveredQty;
    const remaining = order.total_quantity - newDelivered;
    const status = remaining <= 0 ? 'da_giao' : 'can_giao';

    const updatePayload: Record<string, unknown> = {
      delivered_quantity: newDelivered,
      status,
    };
    if (status === 'da_giao' && order.status !== 'da_giao') {
      updatePayload.driver_delivered_at = new Date().toISOString();
    } else if (status !== 'da_giao') {
      updatePayload.driver_delivered_at = null;
    }

    // 2. Update with status logic
    const { data, error } = await supabaseService
      .from('delivery_orders')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async confirmOrders(ids: string[]) {
    const { data: sourceOrders, error: sourceError } = await supabaseService
      .from('delivery_orders')
      .select('id, import_order_id, vegetable_order_id')
      .in('id', ids)
      .eq('status', 'hang_o_sg');

    if (sourceError) throw sourceError;
    if (!sourceOrders || sourceOrders.length === 0) return { success: true, updated: 0 };

    const allImportIds = sourceOrders.map((o: any) => o.import_order_id).filter(Boolean);
    const allVegIds = sourceOrders.map((o: any) => o.vegetable_order_id).filter(Boolean);

    if (allImportIds.length > 0) {
      await supabaseService.from('import_orders').update({ selected_alias: null }).in('id', allImportIds);
    }
    if (allVegIds.length > 0) {
      await supabaseService.from('vegetable_orders').update({ selected_alias: null }).in('id', allVegIds);
    }

    const targetIds = sourceOrders.map((o: any) => o.id);
    const { error: updateError } = await supabaseService
      .from('delivery_orders')
      .update({ status: 'can_giao', confirmed_at: new Date().toISOString() })
      .in('id', targetIds);

    if (updateError) throw updateError;

    return { success: true, updated: targetIds.length };
  }


  static async getInventory(orderCategory?: string, actor?: UserPayload) {
    const fetchVeg = !orderCategory || orderCategory === 'vegetable';
    const fetchStd = !orderCategory || orderCategory === 'standard';

    const nestedDv =
      'delivery_orders(*, delivery_vehicles(*, vehicles(license_plate), profiles(full_name)))';

    let allData: any[] = [];
    if (fetchStd) {
      const { data, error } = await supabaseService
        .from('import_orders')
        .select(`*, warehouses(name), ${nestedDv}`)
        .eq('status', 'pending')
        .is('deleted_at', null);

      if (error) throw error;
      if (data) allData = allData.concat(data.map(d => ({ ...d, order_category: 'standard' })));
    }

    if (fetchVeg) {
      const { data, error } = await supabaseService
        .from('vegetable_orders')
        .select(`*, warehouses(name), ${nestedDv}`)
        .eq('status', 'pending')
        .is('deleted_at', null);

      if (error) throw error;
      if (data) allData = allData.concat(data.map(d => ({ ...d, order_category: 'vegetable' })));
    }

    if (actor && !goodsScopeFullAccess(actor.role)) {
      const isStaff = goodsScopeIsStaffRole(actor.role);
      const isDriver = goodsScopeIsDriverRole(actor.role);
      if (isStaff || isDriver) {
        let driverScope: DriverScope | null = null;
        if (isDriver) {
          driverScope = await fetchDriverScopeForUser(actor.id);
        }
        allData = allData.filter((row: any) => importOrderRowMatchesGoodsScope(row, actor, driverScope));
      }
    }

    return allData;
  }

  static async update(id: string, updateData: any) {
    const payload = { ...updateData };
    if (Object.prototype.hasOwnProperty.call(payload, 'delivery_time') && payload.delivery_time === '') {
      payload.delivery_time = null;
    }

    const { data: currentOrder, error: fetchError } = await supabaseService
      .from('delivery_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const { data, error } = await supabaseService
      .from('delivery_orders')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (currentOrder) {
      const sourceId = currentOrder.import_order_id || currentOrder.vegetable_order_id;
      const isVeg = !!currentOrder.vegetable_order_id;
      const fkName = isVeg ? 'vegetable_order_id' : 'import_order_id';
      const tName = isVeg ? 'vegetable_order_items' : 'import_order_items';

      if (sourceId) {
        const itemUpdate: any = {};
        if (payload.total_quantity !== undefined) itemUpdate.quantity = payload.total_quantity;
        if (payload.unit_price !== undefined) itemUpdate.unit_price = payload.unit_price;
        // Không đồng bộ ảnh từ delivery_orders sang import_order_items để tránh lẫn ảnh giao hàng vào nhập hàng.
        if (payload.product_name !== undefined && isVeg) itemUpdate.package_type = payload.product_name;
        if (payload.product_id !== undefined && !isVeg) itemUpdate.product_id = payload.product_id;

        if (Object.keys(itemUpdate).length > 0) {
          let query = supabaseService.from(tName).update(itemUpdate).eq(fkName, sourceId);
          if (currentOrder.product_id) {
            query = query.eq('product_id', currentOrder.product_id);
          } else {
            query = query.eq('package_type', currentOrder.product_name);
          }
          await query;

          if (itemUpdate.quantity !== undefined || itemUpdate.unit_price !== undefined) {
            const { data: allItems } = await supabaseService.from(tName).select('quantity, unit_price, weight_kg').eq(fkName, sourceId);
            if (allItems) {
              const newTotal = allItems.reduce((sum, item) => {
                const qty = Number(item.quantity) || 1;
                const price = Number(item.unit_price) || 0;
                const weight = Number(item.weight_kg) || 0;
                if (price > 0 && weight > 0 && qty > 0) {
                  return sum + (weight * price);
                }
                return sum + (qty * price);
              }, 0);
              const orderTableName = isVeg ? 'vegetable_orders' : 'import_orders';
              await supabaseService.from(orderTableName).update({ total_amount: newTotal }).eq('id', sourceId);
            }
          }
        }
      }
    }

    return data;
  }

  static async revertVehicle(deliveryId: string, vehicleId?: string, deliveryDate?: string, tripIds?: string[]) {
    const normalizedTripIds = Array.from(new Set((tripIds || []).filter(Boolean)));

    let revertedVehicleId = vehicleId;

    if (normalizedTripIds.length > 0) {
      const { data: targetTrips, error: targetTripsError } = await supabaseService
        .from('delivery_vehicles')
        .select('id, vehicle_id')
        .eq('delivery_order_id', deliveryId)
        .in('id', normalizedTripIds);

      if (targetTripsError) throw targetTripsError;
      if (!targetTrips || targetTrips.length === 0) {
        throw new Error('Không tìm thấy chuyến để hoàn tác.');
      }

      const uniqueVehicleIds = Array.from(new Set(targetTrips.map((row: any) => row.vehicle_id).filter(Boolean)));
      if (uniqueVehicleIds.length > 1) {
        throw new Error('Chỉ được hoàn tác các chuyến thuộc cùng một xe trong một lần.');
      }

      revertedVehicleId = uniqueVehicleIds[0] || revertedVehicleId;

      const { error: deleteError } = await supabaseService
        .from('delivery_vehicles')
        .delete()
        .eq('delivery_order_id', deliveryId)
        .in('id', normalizedTripIds);

      if (deleteError) throw deleteError;

      if (revertedVehicleId) {
        await supabaseService
          .from('payment_collections')
          .delete()
          .eq('delivery_order_id', deliveryId)
          .eq('vehicle_id', revertedVehicleId)
          .in('status', ['draft']);
      }
    } else {
      if (!vehicleId) {
        throw new Error('Thiếu vehicle_id để hoàn tác.');
      }

      let deleteQuery = supabaseService
        .from('delivery_vehicles')
        .delete()
        .eq('delivery_order_id', deliveryId)
        .eq('vehicle_id', vehicleId);

      if (deliveryDate) {
        deleteQuery = deleteQuery.eq('delivery_date', deliveryDate);
      }

      const { error: deleteError } = await deleteQuery;

      if (deleteError) throw deleteError;

      await supabaseService
        .from('payment_collections')
        .delete()
        .eq('delivery_order_id', deliveryId)
        .eq('vehicle_id', vehicleId)
        .in('status', ['draft']);
    }

    const { data: allDvs } = await supabaseService
      .from('delivery_vehicles')
      .select('assigned_quantity')
      .eq('delivery_order_id', deliveryId);

    const totalAssigned = (allDvs || []).reduce((sum: number, dv: any) => sum + (dv.assigned_quantity || 0), 0);

    const { data: doData } = await supabaseService
      .from('delivery_orders')
      .select('total_quantity, status, order_category')
      .eq('id', deliveryId)
      .single();

    if (doData) {
      const nextStatus = this.resolveDeliveryStatusFromAssignedQuantity(
        doData.total_quantity,
        totalAssigned,
        { previousStatus: doData.status, preserveHangOsgWhenUnassigned: false }
      );
      const rowUpdate: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === 'da_giao' && doData.status !== 'da_giao') {
        rowUpdate.driver_delivered_at = new Date().toISOString();
      } else if (nextStatus !== 'da_giao') {
        rowUpdate.driver_delivered_at = null;
      }
      await supabaseService.from('delivery_orders').update(rowUpdate).eq('id', deliveryId);

      if (doData.order_category === 'standard' || !doData.order_category) {
        const { data: existingExport } = await supabaseService
          .from('export_orders')
          .select('id, debt_amount, paid_amount')
          .eq('product_id', deliveryId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingExport) {
          const { data: remainingDvs } = await supabaseService
            .from('delivery_vehicles')
            .select('assigned_quantity, expected_amount')
            .eq('delivery_order_id', deliveryId);

          const newQty = (remainingDvs || []).reduce((sum: number, dv: any) => sum + (dv.assigned_quantity || 0), 0);
          const newDebt = (remainingDvs || []).reduce((sum: number, dv: any) => sum + Number(dv.expected_amount || 0), 0);

          if (newQty === 0) {
            await supabaseService.from('export_orders').delete().eq('id', existingExport.id);
          } else {
            const newPaid = Math.min(Number(existingExport.paid_amount || 0), newDebt);
            const newPaymentStatus = newPaid <= 0 ? 'unpaid' : newPaid >= newDebt ? 'paid' : 'partial';
            await supabaseService.from('export_orders').update({
              quantity: newQty,
              debt_amount: newDebt,
              paid_amount: newPaid,
              payment_status: newPaymentStatus,
            }).eq('id', existingExport.id);
          }
        }
      }
    }

    return { success: true };
  }

  static async deleteOrders(ids: string[], cancelledBy?: string) {
    if (!ids || ids.length === 0) return { cancelled_deliveries: 0, cancelled_payments: 0, reversed_entries: 0 };

    const { data, error } = await supabaseService.rpc('cancel_invoice_cascade_by_delivery_ids', {
      p_delivery_order_ids: ids,
      p_cancelled_by: cancelledBy || null,
    });

    if (error) throw error;
    return data;
  }

  static async confirmWarehouse(ids: string[]) {
    const { data, error } = await supabaseService
      .from('delivery_orders')
      .update({ warehouse_confirmed_at: new Date().toISOString() })
      .in('id', ids)
      .select('id');

    if (error) throw error;
    return { success: true, confirmed: (data || []).length };
  }

  /**
   * Public endpoint: returns delivery order info for customer-facing page.
   * No auth required. Only returns non-sensitive data.
   */
  static async getPublicById(id: string) {
    const { data: delivery, error } = await supabaseService
      .from('delivery_orders')
      .select(`
        id, product_name, total_quantity, unit_price, delivery_date, delivery_time, status, image_url, image_urls, created_at, order_category,
        import_orders (
          order_code, receiver_name, selected_alias, receipt_image_url, receipt_image_urls,
          customers:customers!import_orders_customer_id_fkey (name),
          import_order_items (id, quantity, unit_price, image_url, image_urls, products(name))
        ),
        vegetable_orders (
          order_code, receiver_name, selected_alias, receipt_image_url, receipt_image_urls,
          customers:customers!vegetable_orders_customer_id_fkey (name),
          vegetable_order_items (id, quantity, unit_price, image_url, image_urls, products(name))
        ),
        delivery_vehicles (
          id, assigned_quantity, expected_amount, delivery_time, delivery_date, image_urls,
          profiles (full_name, phone),
          vehicles (license_plate)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !delivery) return null;

    // Global images (Order images, not assignment-specific)
    const globalImages: string[] = [];
    const addGlobalImage = (url: string | null | undefined) => {
      if (url && typeof url === 'string') {
        url.split(',').forEach(u => { if (u.trim()) globalImages.push(u.trim()); });
      }
    };
    const addGlobalImages = (urls: string[] | null | undefined) => {
      if (Array.isArray(urls)) urls.forEach(u => addGlobalImage(u));
    };

    // Delivery order images (global)
    addGlobalImage(delivery.image_url);
    addGlobalImages(delivery.image_urls);

    // Source order images (global)
    const source: any = delivery.import_orders || delivery.vegetable_orders;
    if (source) {
      addGlobalImage(source.receipt_image_url);
      addGlobalImages(source.receipt_image_urls);
      const items = source.import_order_items || source.vegetable_order_items || [];
      for (const item of items) {
        addGlobalImage(item.image_url);
        addGlobalImages(item.image_urls);
      }
    }

    const uniqueGlobalImages = [...new Set(globalImages)];

    const customerName =
      source?.customers?.name ||
      source?.selected_alias ||
      source?.receiver_name ||
      'Khách hàng';

    const orderCode = source?.order_code || delivery.id.slice(0, 8).toUpperCase();

    // Get shop name
    const { data: shopNameSetting } = await supabaseService
      .from('general_settings')
      .select('setting_value')
      .eq('setting_key', 'SHOP_NAME')
      .maybeSingle();
    const shopName = shopNameSetting?.setting_value || 'Năm Sự';

    return {
      id: delivery.id,
      orderCode,
      shopName,
      customerName,
      productName: delivery.product_name,
      totalQuantity: delivery.total_quantity,
      unitPrice: delivery.unit_price,
      deliveryDate: delivery.delivery_date,
      deliveryTime: delivery.delivery_time,
      status: delivery.status,
      orderCategory: delivery.order_category,
      createdAt: delivery.created_at,
      images: uniqueGlobalImages,
      vehicles: (delivery.delivery_vehicles || []).map((dv: any) => ({
        staffName: dv.profiles?.full_name || 'NV Giao hàng',
        staffPhone: dv.profiles?.phone || '',
        licensePlate: dv.vehicles?.license_plate || '-',
        quantity: dv.assigned_quantity || 0,
        expectedAmount: dv.expected_amount || 0,
        deliveryTime: dv.delivery_time,
        deliveryDate: dv.delivery_date,
        images: Array.isArray(dv.image_urls) ? [...new Set(dv.image_urls.filter(Boolean))] : [],
      })),
    };
  }
}










