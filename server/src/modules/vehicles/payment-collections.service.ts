import { supabaseService } from '../../config/supabase';
import { CreatePaymentCollectionDto, SubmitPaymentDto, ConfirmPaymentDto, PaymentCollectionStatus, UserPayload } from '../../types';

export class PaymentCollectionsService {
  static async getPaymentCollections(filters: { driverId?: string, status?: string, vehicleId?: string, dateFrom?: string, dateTo?: string }) {
    let query = supabaseService
      .from('payment_collections')
      .select(`
        *,
        delivery_orders (
          id,
          unit_price,
          total_quantity,
          import_orders ( order_code, deleted_at, customers!import_orders_customer_id_fkey ( name ) ),
          vegetable_orders ( order_code, deleted_at, customers!vegetable_orders_customer_id_fkey ( name ) ),
          delivery_vehicles ( id, vehicle_id, driver_id, delivery_date, delivery_time, assigned_quantity, expected_amount )
        ),
        drivers:profiles!payment_collections_driver_id_fkey(full_name),
        receivers:profiles!payment_collections_receiver_id_fkey(full_name),
        vehicles ( license_plate )
      `)
      .order('collected_at', { ascending: false });

    if (filters.driverId) query = query.eq('driver_id', filters.driverId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.vehicleId) query = query.eq('vehicle_id', filters.vehicleId);
    if (filters.dateFrom) query = query.gte('collected_at', filters.dateFrom.includes('T') ? filters.dateFrom : `${filters.dateFrom}T00:00:00+07:00`);
    if (filters.dateTo) query = query.lte('collected_at', filters.dateTo.includes('T') ? filters.dateTo : `${filters.dateTo}T23:59:59.999+07:00`);

    const { data, error } = await query;
    if (error) throw error;

    // Map to normalized PaymentCollection shape matching frontend
    return data.filter((pc: any) => !this.isPaymentCollectionSourceDeleted(pc)).map((pc: any) => this.mapToDto(pc));
  }

  static async getPaymentCollectionById(id: string) {
    const { data, error } = await supabaseService
      .from('payment_collections')
      .select(`
        *,
        delivery_orders (
          id,
          unit_price,
          total_quantity,
          import_orders ( order_code, deleted_at, customers!import_orders_customer_id_fkey ( name ) ),
          vegetable_orders ( order_code, deleted_at, customers!vegetable_orders_customer_id_fkey ( name ) ),
          delivery_vehicles ( id, vehicle_id, driver_id, delivery_date, delivery_time, assigned_quantity, expected_amount )
        ),
        drivers:profiles!payment_collections_driver_id_fkey(full_name),
        receivers:profiles!payment_collections_receiver_id_fkey(full_name),
        vehicles ( license_plate )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return this.mapToDto(data);
  }

  static async createPaymentCollection(data: CreatePaymentCollectionDto, driverId: string) {
    const sourceOrderIds = Array.from(new Set([data.deliveryOrderId, ...(data.sourceOrderIds || [])].filter(Boolean)));
    if (sourceOrderIds.length === 0) throw new Error('Vui lòng chọn đơn hàng');

    const { data: deliveryOrders, error: doError } = await supabaseService
      .from('delivery_orders')
      .select('id, import_orders(customer_id, total_amount, deleted_at), vegetable_orders(customer_id, total_amount, deleted_at)')
      .in('id', sourceOrderIds);

    if (doError) throw doError;
    if (!deliveryOrders || deliveryOrders.length !== sourceOrderIds.length) throw new Error('Không tìm thấy đầy đủ đơn giao hàng trong nhóm');
    if (deliveryOrders.some((order: any) => this.isDeliveryOrderSourceDeleted(order))) throw new Error('Không thể tạo phiếu thu cho đơn hàng đã xóa');



    const { data: dvDataList, error: dvError } = await supabaseService
      .from('delivery_vehicles')
      .select('id, delivery_order_id, vehicle_id, expected_amount, assigned_quantity, driver_id, delivery_date, delivery_time, vehicles(in_charge_id)')
      .in('delivery_order_id', sourceOrderIds);

    if (dvError) throw dvError;

    const assignedRows = (dvDataList || []).filter((dv: any) => dv.driver_id === driverId || dv.vehicles?.in_charge_id === driverId);
    if (assignedRows.length === 0) throw new Error('Bạn không được giao đơn hàng này');

    const activeCollectionIds = await this.getActiveDeliveryVehicleIds(sourceOrderIds);
    const payableRows = assignedRows.filter((dv: any) => !activeCollectionIds.has(dv.id));
    const targetRows = payableRows.length > 0 ? payableRows : assignedRows;
    const vehicleId = targetRows[0].vehicle_id;
    const sameVehicleRows = targetRows.filter((dv: any) => dv.vehicle_id === vehicleId);
    const expectedAmount = sameVehicleRows.reduce((sum: number, dv: any) => sum + (Number(dv.expected_amount) || 0), 0);
    const deliveryVehicleId = sameVehicleRows.length === 1 ? sameVehicleRows[0].id : null;

    const firstOrder: any = deliveryOrders.find((order: any) => order.id === data.deliveryOrderId) || deliveryOrders[0];
    const ioOrVeg: any = firstOrder.vegetable_orders || firstOrder.import_orders;
    const importOrder: any = Array.isArray(ioOrVeg) ? ioOrVeg[0] : ioOrVeg;
    const fallbackAmount = deliveryOrders.reduce((sum: number, order: any) => {
      const source: any = Array.isArray(order.vegetable_orders) ? order.vegetable_orders[0] : order.vegetable_orders
        || (Array.isArray(order.import_orders) ? order.import_orders[0] : order.import_orders);
      return sum + (Number(source?.total_amount) || 0);
    }, 0);
    const finalExpectedAmount = expectedAmount || fallbackAmount;

    if (data.collectedAmount < finalExpectedAmount && (!data.notes || data.notes.trim() === '')) {
      throw new Error('Vui lòng ghi chú lý do thu thiếu tiền');
    }

    const { data: pcData, error: pcError } = await supabaseService
      .from('payment_collections')
      .insert({
        delivery_order_id: data.deliveryOrderId,
        source_order_ids: sourceOrderIds,
        customer_id: importOrder?.customer_id,
        driver_id: driverId,
        vehicle_id: vehicleId,
        delivery_vehicle_id: deliveryVehicleId,
        expected_amount: finalExpectedAmount,
        collected_amount: data.collectedAmount,
        collected_at: data.collectedAt,
        notes: data.notes,
        image_url: data.imageUrl,
        status: 'draft'
      })
      .select()
      .single();

    if (pcError) {
      if (pcError.code === '23505') {
        throw new Error('Chuyến phân xe này đã có phiếu thu hoạt động');
      }
      throw pcError;
    }

    return this.getPaymentCollectionById(pcData.id);
  }

  static async updatePaymentCollection(id: string, data: any, actor: UserPayload) {
    // Validate state
    const pc = await this.getRawById(id);
    const canEditForDriver = pc.driver_id === actor.id || ['admin', 'manager', 'staff'].includes(actor.role);
    if (!canEditForDriver) throw new Error('Không có quyền sửa phiếu này');
    if (pc.status !== 'draft') throw new Error('Chỉ được sửa phiếu ở trạng thái draft');

    const expectedAmount = data.expectedAmount !== undefined ? Number(data.expectedAmount) : Number(pc.expected_amount);

    if (data.collectedAmount !== undefined) {
      if (data.collectedAmount < expectedAmount && (!data.notes || data.notes.trim() === '') && (!pc.notes || pc.notes.trim() === '')) {
        throw new Error('Vui lòng ghi chú lý do thu thiếu tiền');
      }
    }

    const updatePayload: any = {};
    if (data.collectedAmount !== undefined) updatePayload.collected_amount = data.collectedAmount;
    if (data.collectedAt !== undefined) updatePayload.collected_at = data.collectedAt;
    if (data.expectedAmount !== undefined) updatePayload.expected_amount = data.expectedAmount;
    if (data.notes !== undefined) updatePayload.notes = data.notes;
    if (data.imageUrl !== undefined) updatePayload.image_url = data.imageUrl;

    if (data.totalPackages !== undefined || data.expectedAmount !== undefined) {
      const deliveryVehiclePayload: any = {};
      if (data.totalPackages !== undefined) deliveryVehiclePayload.assigned_quantity = data.totalPackages;
      if (data.expectedAmount !== undefined) deliveryVehiclePayload.expected_amount = data.expectedAmount;

      let deliveryVehicleQuery = supabaseService
        .from('delivery_vehicles')
        .update(deliveryVehiclePayload);

      if (pc.delivery_vehicle_id) {
        deliveryVehicleQuery = deliveryVehicleQuery.eq('id', pc.delivery_vehicle_id);
      } else {
        deliveryVehicleQuery = deliveryVehicleQuery
          .eq('delivery_order_id', pc.delivery_order_id)
          .eq('vehicle_id', pc.vehicle_id);
      }

      const { error: deliveryVehicleError } = await deliveryVehicleQuery;

      if (deliveryVehicleError) throw deliveryVehicleError;
    }

    if (data.pricePerPackage !== undefined) {
      const { error: deliveryOrderError } = await supabaseService
        .from('delivery_orders')
        .update({ unit_price: data.pricePerPackage })
        .eq('id', pc.delivery_order_id);

      if (deliveryOrderError) throw deliveryOrderError;
    }

    const { error } = await supabaseService
      .from('payment_collections')
      .update(updatePayload)
      .eq('id', id);

    if (error) throw error;
    return this.getPaymentCollectionById(id);
  }

  static async submitPaymentCollection(id: string, data: SubmitPaymentDto, actor: UserPayload) {
    const pc = await this.getRawById(id);
    const canSubmitForDriver = pc.driver_id === actor.id || ['admin', 'manager', 'staff'].includes(actor.role);
    if (!canSubmitForDriver) throw new Error('Không có quyền nộp phiếu này');
    if (pc.status !== 'draft') throw new Error('Phiếu phải ở trạng thái draft để nộp');

    const updatePayload = {
      status: 'submitted',
      receiver_id: data.receiverId,
      receiver_type: data.receiverType,
      submitted_at: data.submittedAt,
      notes: data.notes ? data.notes : pc.notes
    };

    const { error } = await supabaseService
      .from('payment_collections')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      if ((error as any).code === '23505') {
        throw new Error('Đơn hàng này đã có phiếu thu đang nộp hoặc đã xác nhận');
      }
      throw error;
    }
    return this.getPaymentCollectionById(id);
  }

  static async selfConfirmPaymentCollection(id: string, reason: string, driverId: string) {
    const pc = await this.getRawById(id);
    if (pc.driver_id !== driverId) throw new Error('Không có quyền tự xác nhận phiếu này');
    if (pc.status !== 'draft' && pc.status !== 'submitted') throw new Error('Trạng thái không hợp lệ');
    if (!reason || reason.trim() === '') throw new Error('Lý do tự xác nhận là bắt buộc');

    const { error } = await supabaseService
      .from('payment_collections')
      .update({
        status: 'self_confirmed',
        self_confirm_reason: reason,
        confirmed_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    await this.applyConfirmedPayment(pc);

    return this.getPaymentCollectionById(id);
  }

  static async confirmPaymentCollection(id: string, data: ConfirmPaymentDto, receiverId: string) {
    const pc = await this.getRawById(id);
    if (pc.status !== 'submitted') throw new Error('Phiếu chưa được gửi');
    // We optionally validate if the current user is the target receiver, or if any manager can confirm
    // For now we allow if they are staff/manager by role (via route middleware)

    const updatePayload = {
      status: 'confirmed',
      confirmed_at: data.confirmedAt,
      notes: data.notes ? data.notes : pc.notes
    };

    const { error } = await supabaseService
      .from('payment_collections')
      .update(updatePayload)
      .eq('id', id);

    if (error) throw error;

    await this.applyConfirmedPayment(pc);

    return this.getPaymentCollectionById(id);
  }

  static async revertToDraft(id: string, actorId: string) {
    const pc = await this.getRawById(id);
    if (pc.status !== 'submitted') throw new Error('Chỉ có thể lấy lại khi đang chờ xác nhận');
    // Optionally check if actor is driver or staff

    const { error } = await supabaseService
      .from('payment_collections')
      .update({
        status: 'draft',
        receiver_id: null,
        receiver_type: null,
        submitted_at: null
      })
      .eq('id', id);

    if (error) throw error;
    return this.getPaymentCollectionById(id);
  }

  static async getCollectionSummaryByVehicle(filters: { dateFrom?: string, dateTo?: string }) {
    // Actually we fetch confirmed or all and group in frontend, or do simple aggregate locally
    let query = supabaseService
      .from('payment_collections')
      .select(`
        *,
        delivery_orders (
          id,
          unit_price,
          total_quantity,
          import_orders ( order_code, deleted_at, customers!import_orders_customer_id_fkey ( name ) ),
          vegetable_orders ( order_code, deleted_at, customers!vegetable_orders_customer_id_fkey ( name ) ),
          delivery_vehicles ( id, vehicle_id, driver_id, delivery_date, delivery_time, assigned_quantity, expected_amount )
        ),
        drivers:profiles!payment_collections_driver_id_fkey(full_name),
        receivers:profiles!payment_collections_receiver_id_fkey(full_name),
        vehicles ( license_plate )
      `);

    if (filters.dateFrom) query = query.gte('collected_at', filters.dateFrom.includes('T') ? filters.dateFrom : `${filters.dateFrom}T00:00:00+07:00`);
    if (filters.dateTo) query = query.lte('collected_at', filters.dateTo.includes('T') ? filters.dateTo : `${filters.dateTo}T23:59:59.999+07:00`);

    const { data, error } = await query;
    if (error) throw error;

    return data.filter((pc: any) => !this.isPaymentCollectionSourceDeleted(pc)).map((pc: any) => this.mapToDto(pc));
  }

  private static async getRawById(id: string) {
    const { data, error } = await supabaseService
      .from('payment_collections')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new Error('Phiếu thu không tồn tại');
    return data;
  }

  private static async updateCustomerDebt(customerId: string, collectedAmount: number, pcId: string, vehiclePlate?: string) {
    if (!customerId) return;
    // We insert into receipts. The DB trigger `trg_receipt_to_ledger`
    // will log this into `customer_debt_ledger` and subtract from `customers.debt` automatically.
    const { error: insertError } = await supabaseService
      .from('receipts')
      .insert({
        customer_id: customerId,
        amount: collectedAmount,
        payment_date: new Date().toISOString().split('T')[0],
        notes: `Thu tiền từ tài xế - CX${vehiclePlate || 'N/A'} - Phiếu thu #${pcId.split('-')[0]}`,
        // created_by should ideally be passed, omitting if trigger handles it or allows null
      });

    if (insertError) {
      console.error('Failed to log receipt for payment collection', insertError);
    }
  }

  private static getPaymentSourceOrderIds(pc: any) {
    const ids = Array.isArray(pc.source_order_ids) && pc.source_order_ids.length > 0
      ? pc.source_order_ids
      : [pc.delivery_order_id];
    return Array.from(new Set(ids.filter(Boolean))) as string[];
  }

  private static async assertNoPaymentCollectionConflict(
    sourceOrderIds: string[],
    vehicleId: string,
    currentPaymentCollectionId?: string,
    includeDraft = false
  ) {
    if (sourceOrderIds.length === 0 || !vehicleId) return;

    const statuses = includeDraft
      ? ['draft', 'submitted', 'confirmed', 'self_confirmed']
      : ['submitted', 'confirmed', 'self_confirmed'];
    const sourceIdSet = new Set(sourceOrderIds);

    const { data: collections, error } = await supabaseService
      .from('payment_collections')
      .select('id, delivery_order_id, source_order_ids, status, vehicle_id')
      .in('status', statuses)
      .eq('vehicle_id', vehicleId);

    if (error) throw error;

    const hasConflict = (collections || []).some((pc: any) => {
      if (currentPaymentCollectionId && pc.id === currentPaymentCollectionId) return false;
      if (pc.delivery_order_id && sourceIdSet.has(pc.delivery_order_id)) return true;
      const pcSourceIds = Array.isArray(pc.source_order_ids) ? pc.source_order_ids : [];
      return pcSourceIds.some((id: string) => sourceIdSet.has(id));
    });

    if (hasConflict) {
      throw new Error(includeDraft
        ? 'Một hoặc nhiều đơn trong nhóm đã có phiếu thu'
        : 'Đơn hàng này đã có phiếu thu đang nộp hoặc đã xác nhận');
    }
  }

  private static async getActiveDeliveryVehicleIds(sourceOrderIds: string[]) {
    if (sourceOrderIds.length === 0) return new Set<string>();

    const { data, error } = await supabaseService
      .from('payment_collections')
      .select('delivery_vehicle_id')
      .in('delivery_order_id', sourceOrderIds)
      .in('status', ['draft', 'submitted', 'confirmed', 'self_confirmed'])
      .not('delivery_vehicle_id', 'is', null);

    if (error) throw error;

    return new Set((data || []).map((pc: any) => pc.delivery_vehicle_id).filter(Boolean));
  }

  private static async getPaymentAllocations(pc: any) {
    const sourceOrderIds = this.getPaymentSourceOrderIds(pc);
    if (sourceOrderIds.length === 0) return [];

    const { data: dvRows, error } = await supabaseService
      .from('delivery_vehicles')
      .select('delivery_order_id, expected_amount')
      .in('delivery_order_id', sourceOrderIds)
      .eq('vehicle_id', pc.vehicle_id);

    if (error) throw error;

    const expectedByOrderId = new Map<string, number>();
    (dvRows || []).forEach((row: any) => {
      expectedByOrderId.set(row.delivery_order_id, (expectedByOrderId.get(row.delivery_order_id) || 0) + (Number(row.expected_amount) || 0));
    });

    const totalExpected = sourceOrderIds.reduce((sum, id) => sum + (expectedByOrderId.get(id) || 0), 0);
    const collectedAmount = Number(pc.collected_amount || 0);

    if (totalExpected <= 0) {
      const evenAmount = sourceOrderIds.length > 0 ? collectedAmount / sourceOrderIds.length : 0;
      return sourceOrderIds.map((deliveryOrderId) => ({ deliveryOrderId, amount: evenAmount }));
    }

    let allocated = 0;
    return sourceOrderIds.map((deliveryOrderId, index) => {
      const expectedAmount = expectedByOrderId.get(deliveryOrderId) || 0;
      const amount = index === sourceOrderIds.length - 1
        ? collectedAmount - allocated
        : (collectedAmount * expectedAmount / totalExpected);
      allocated += amount;
      return { deliveryOrderId, amount };
    });
  }

  private static async applyConfirmedPayment(pc: any) {
    await this.updateCustomerDebt(pc.customer_id, pc.collected_amount, pc.id);

    const allocations = await this.getPaymentAllocations(pc);
    for (const allocation of allocations) {
      await this.updateImportOrderPaidAmount(allocation.deliveryOrderId, allocation.amount);
      await this.updateExportOrderPaymentStatus(allocation.deliveryOrderId, allocation.amount);
    }
  }

  private static async updateImportOrderPaidAmount(deliveryOrderId: string, collectedAmount: number) {
    if (!deliveryOrderId || !collectedAmount) return;
    
    // 1. Get import_order_id & vegetable_order_id
    const { data: doData } = await supabaseService.from('delivery_orders')
      .select('import_order_id, vegetable_order_id')
      .eq('id', deliveryOrderId)
      .single();
      
    if (!doData || (!doData.import_order_id && !doData.vegetable_order_id)) return;

    const tName = doData.vegetable_order_id ? 'vegetable_orders' : 'import_orders';
    const orderId = doData.vegetable_order_id || doData.import_order_id;

    // 2. Get current paid_amount
    const { data: ioData } = await supabaseService.from(tName)
      .select('paid_amount')
      .eq('id', orderId)
      .single();
      
    if (ioData) {
      // 3. Increment paid_amount
      await supabaseService.from(tName)
        .update({ paid_amount: Number(ioData.paid_amount || 0) + collectedAmount })
        .eq('id', orderId);
    }
  }

  private static async updateExportOrderPaymentStatus(deliveryOrderId: string, collectedAmount: number) {
    if (!deliveryOrderId) return;

    // Tìm phiếu xuất có product_id = delivery_order_id
    const { data: exportOrders } = await supabaseService
      .from('export_orders')
      .select('id, debt_amount, paid_amount')
      .eq('product_id', deliveryOrderId);

    if (!exportOrders || exportOrders.length === 0) return;

    for (const eo of exportOrders) {
      const newPaidAmount = Number(eo.paid_amount || 0) + collectedAmount;
      const debtAmount = Number(eo.debt_amount || 0);
      let paymentStatus = 'unpaid';
      if (newPaidAmount >= debtAmount && debtAmount > 0) {
        paymentStatus = 'paid';
      } else if (newPaidAmount > 0) {
        paymentStatus = 'partial';
      }

      await supabaseService
        .from('export_orders')
        .update({
          paid_amount: newPaidAmount,
          payment_status: paymentStatus,
        })
        .eq('id', eo.id);
    }
  }

  // Helper mapping 
  private static pickRelation(relation: any): any {
    if (Array.isArray(relation)) return relation[0];
    return relation || undefined;
  }

  private static isDeliveryOrderSourceDeleted(deliveryOrder: any): boolean {
    const importOrder = this.pickRelation(deliveryOrder?.import_orders);
    const vegetableOrder = this.pickRelation(deliveryOrder?.vegetable_orders);
    return Boolean(importOrder?.deleted_at || vegetableOrder?.deleted_at);
  }

  private static isPaymentCollectionSourceDeleted(paymentCollection: any): boolean {
    if (this.isDeliveryOrderSourceDeleted(paymentCollection?.delivery_orders)) return true;
    return paymentCollection?.status === 'cancelled'
      && paymentCollection?.delivery_order_id == null
      && paymentCollection?.cancellation_reason === 'Delivery order deleted';
  }

  private static mapToDto(pc: any) {
    const doRow = pc.delivery_orders;
    const dvsRaw = doRow?.delivery_vehicles;
    const dvList: any[] = Array.isArray(dvsRaw) ? dvsRaw : dvsRaw ? [dvsRaw] : [];
    const match = pc.delivery_vehicle_id
      ? dvList.find((dv: any) => dv.id === pc.delivery_vehicle_id)
      : dvList.find((dv: any) =>
        dv.vehicle_id === pc.vehicle_id &&
        (!pc.driver_id || dv.driver_id === pc.driver_id) &&
        Number(dv.assigned_quantity || 0) > 0 &&
        Number(dv.expected_amount || 0) === Number(pc.expected_amount || 0)
      ) || dvList.find((dv: any) => dv.vehicle_id === pc.vehicle_id);

    let totalPackages: number | undefined;
    if (match?.assigned_quantity != null && match.assigned_quantity !== '') {
      const q = Number(match.assigned_quantity);
      if (Number.isFinite(q)) totalPackages = q;
    }
    if (totalPackages == null && doRow?.total_quantity != null) {
      const q = Number(doRow.total_quantity);
      if (Number.isFinite(q)) totalPackages = q;
    }

    let pricePerPackage: number | undefined;
    const unitFromOrder = Number(doRow?.unit_price);
    if (Number.isFinite(unitFromOrder) && unitFromOrder > 0) {
      pricePerPackage = unitFromOrder;
    } else if (match && totalPackages != null && totalPackages > 0) {
      const exp = Number(match.expected_amount);
      if (Number.isFinite(exp) && exp > 0) {
        pricePerPackage = exp / totalPackages;
      }
    }

    return {
      id: pc.id,
      deliveryOrderId: pc.delivery_order_id,
      deliveryVehicleId: pc.delivery_vehicle_id,
      sourceOrderIds: Array.isArray(pc.source_order_ids) && pc.source_order_ids.length > 0 ? pc.source_order_ids : (pc.delivery_order_id ? [pc.delivery_order_id] : []),
      deliveryOrderCode: pc.delivery_orders?.vegetable_orders ? (Array.isArray(pc.delivery_orders.vegetable_orders) ? pc.delivery_orders.vegetable_orders[0].order_code : pc.delivery_orders.vegetable_orders.order_code) : (pc.delivery_orders?.import_orders ? (Array.isArray(pc.delivery_orders.import_orders) ? pc.delivery_orders.import_orders[0].order_code : pc.delivery_orders.import_orders.order_code) : undefined),
      customerId: pc.customer_id,
      customerName: pc.delivery_orders?.vegetable_orders ? (Array.isArray(pc.delivery_orders.vegetable_orders) ? pc.delivery_orders.vegetable_orders[0].customers?.name : pc.delivery_orders.vegetable_orders.customers?.name) : (pc.delivery_orders?.import_orders ? (Array.isArray(pc.delivery_orders.import_orders) ? pc.delivery_orders.import_orders[0].customers?.name : pc.delivery_orders.import_orders.customers?.name) : undefined),
      driverId: pc.driver_id,
      driverName: pc.drivers?.full_name,
      vehicleId: pc.vehicle_id,
      licensePlate: pc.vehicles?.license_plate,
      expectedAmount: Number(pc.expected_amount),
      collectedAmount: Number(pc.collected_amount),
      difference: Number(pc.difference),
      collectedAt: pc.collected_at,
      status: pc.status,
      submittedAt: pc.submitted_at,
      receiverId: pc.receiver_id,
      receiverName: pc.receivers?.full_name,
      receiverType: pc.receiver_type,
      confirmedAt: pc.confirmed_at,
      selfConfirmReason: pc.self_confirm_reason,
      notes: pc.notes,
      imageUrl: pc.image_url,
      totalPackages,
      pricePerPackage,
    };
  }
}
