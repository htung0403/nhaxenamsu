import { supabaseService } from '../../config/supabase';
import { measureOrderRead } from '../../utils/orderReadMetrics';
import { groceryDirection, sourceMatchesDirections } from '../../utils/groceryDirection';
import type { UserPayload, PaginationMeta } from '../../types';
import { getPagination, getPaginationMeta } from '../../utils/pagination';
import {
  exportOrderRowMatchesGoodsScope,
  fetchDriverScopeForUser,
  goodsScopeFullAccess,
  goodsScopeIsDriverRole,
  goodsScopeIsStaffRole,
  type DriverScope,
} from '../../utils/goodsScope';

function deliverySourceSoftDeleted(d: any): boolean {
  const io = d?.import_orders;
  const vo = d?.vegetable_orders;
  const ioDel = Array.isArray(io) ? io[0]?.deleted_at : io?.deleted_at;
  const voDel = Array.isArray(vo) ? vo[0]?.deleted_at : vo?.deleted_at;
  return Boolean(ioDel || voDel);
}

export class ExportOrderService {
  static async getAll(filters: any, actor?: UserPayload) {
    const page = Math.max(1, Math.floor(Number(filters.page) || 1));
    const limit = Math.max(1, Math.min(9999, Math.floor(Number(filters.limit) || 50)));
    const { offset } = getPagination(page, limit);

    const buildQuery = (hydrate = false) => {
      let query = supabaseService.from('export_orders').select(hydrate
        ? '*, profiles(full_name), customers(id, name, debt)'
        : 'id, product_id, product_name, created_at');

      if (filters.date) query = query.eq('export_date', filters.date);
      if (filters.customer_id) query = query.eq('customer_id', filters.customer_id);
      if (filters.dateFrom) query = query.gte('export_date', filters.dateFrom);
      if (filters.dateTo) query = query.lte('export_date', filters.dateTo);
      return query;
    };

    const data: any[] = [];
    for (let from = 0; ; from += 500) {
      const { data: rows, error } = await measureOrderRead(buildQuery().order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + 499));
      if (error) throw error;
      data.push(...(rows || []));
      if (!rows || rows.length < 500) break;
    }
    if (!data || data.length === 0) return { data: [], meta: getPaginationMeta(0, page, limit) };

    const deliveryIds = [...new Set(data.map((o: any) => o.product_id).filter(Boolean))] as string[];

    let filtered = data;
    if (deliveryIds.length > 0) {
      const CHUNK_SIZE = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < deliveryIds.length; i += CHUNK_SIZE) {
        chunks.push(deliveryIds.slice(i, i + CHUNK_SIZE));
      }

      const allDeliveries: any[] = [];
      for (let from = 0; from < chunks.length; from += 4) {
        const batches = await Promise.all(chunks.slice(from, from + 4).map(async chunk => {
          const { data: chunkDeliveries, error: delErr } = await measureOrderRead(supabaseService
            .from('delivery_orders')
            .select(
              'id, import_orders(deleted_at, received_by, license_plate, driver_name, is_return_to_sg), vegetable_orders(deleted_at, received_by, license_plate, driver_name), delivery_vehicles(driver_id, vehicle_id, vehicles(license_plate))'
            )
            .in('id', chunk));

          if (delErr) {
            console.error('[ExportOrderService.getAll] delivery_orders chunk error:', JSON.stringify(delErr, null, 2));
            throw delErr;
          }
          return chunkDeliveries || [];
        }));
        batches.forEach(batch => allDeliveries.push(...batch));
      }

      const deliveryById = new Map(allDeliveries.map((d: any) => [d.id, d]));

      let driverScope: DriverScope | null = null;
      if (actor && goodsScopeIsDriverRole(actor.role) && !goodsScopeFullAccess(actor.role)) {
        driverScope = await fetchDriverScopeForUser(actor.id);
      }

      const needScope =
        actor &&
        !goodsScopeFullAccess(actor.role) &&
        (goodsScopeIsStaffRole(actor.role) || goodsScopeIsDriverRole(actor.role));

      filtered = data.filter((o: any) => {
        if (!o.product_id) return !filters.direction && (!filters.allowedDirections || filters.allowedDirections.length === 2);
        const d = deliveryById.get(o.product_id);
        if (!d) return !filters.direction && (!filters.allowedDirections || filters.allowedDirections.length === 2);
        const directions = filters.direction ? [filters.direction] : filters.allowedDirections;
        if (directions && !sourceMatchesDirections(d.import_orders, directions)) return false;
        if (deliverySourceSoftDeleted(d)) return false;
        if (needScope && actor && !exportOrderRowMatchesGoodsScope(o, d, actor, driverScope)) return false;
        return true;
      }).map((row: any) => {
        const source = deliveryById.get(row.product_id)?.import_orders;
        const resolved = Array.isArray(source) ? source[0] : source;
        return { ...row, direction: resolved ? groceryDirection(resolved) : undefined };
      });
    } else if (filters.direction || (filters.allowedDirections && filters.allowedDirections.length < 2)) {
      filtered = [];
    }

    if (filters.search) {
      const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
      const term = normalize(String(filters.search).trim());
      filtered = filtered.filter((row: any) => normalize(row.product_name || '').includes(term));
    }
    const total = filtered.length;
    const paginatedData = filtered.slice(offset, offset + limit);
    const hydrated = new Map<string, any>();
    for (let from = 0; from < paginatedData.length; from += 100) {
      const ids = paginatedData.slice(from, from + 100).map(row => row.id);
      const { data: rows, error } = await measureOrderRead(buildQuery(true).in('id', ids).range(0, 99));
      if (error) throw error;
      for (const row of (rows || []) as any[]) hydrated.set(row.id, row);
    }
    return {
      data: paginatedData.flatMap(row => {
        const detail = hydrated.get(row.id);
        return detail && detail.product_id === row.product_id ? [{ ...detail, direction: row.direction }] : [];
      }),
      meta: getPaginationMeta(total, page, limit),
    };
  }

  static async create(orderData: any, userId: string) {
    const { data, error } = await supabaseService
      .from('export_orders')
      .insert({
        ...orderData,
        created_by: userId,
      })
      .select()
      .single();
    
    if (error) throw error;


    // Business Logic: Update customer debt is now handled by DB triggers on export_orders -> ledger -> customers

    return data;
  }

  static async bulkDelete(ids: string[]) {
    const { error } = await supabaseService
      .from('export_orders')
      .delete()
      .in('id', ids);
    if (error) throw error;
    return { deleted: ids.length };
  }

  static async updatePayment(id: string, paymentData: { paid_amount: number, status: string }) {
    const { data: oldOrder, error: fetchError } = await supabaseService
      .from('export_orders')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError) throw fetchError;

    const { data, error } = await supabaseService
      .from('export_orders')
      .update({
        paid_amount: paymentData.paid_amount,
        payment_status: paymentData.status,
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;

    // Business Logic: Adjust customer debt if paid amount changed
    const diff = paymentData.paid_amount - (oldOrder.paid_amount || 0);
    if (diff !== 0 && data.customer_id) {
       // Create a receipt to track this payment/adjustment.
       // This will trigger the ledger and update the customer's total debt.
       await supabaseService.from('receipts').insert({
         customer_id: data.customer_id,
         amount: diff,
         payment_date: new Date().toISOString().split('T')[0],
         notes: `Cập nhật thanh toán đơn xuất: ${data.item_name}`,
       });
    }

    return data;
  }
}
