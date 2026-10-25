import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseService } from '../config/supabase';
import { userHasAnyPagePermission } from './role';
import { ImportOrderService } from '../modules/import-orders/import-orders.service';
import { deliveryOrderRowMatchesGoodsScope, fetchDriverScopeForUser, goodsScopeIsDriverRole } from '../utils/goodsScope';
import { GROCERY_DIRECTIONS, groceryDirection, parseGroceryDirection, resolveGroceryFlag, type GroceryDirection } from '../utils/groceryDirection';
import { errorResponse } from '../utils/response';
import type { OrderCategory } from '../types/order-category';

type Resource = 'import' | 'delivery' | 'export';
const prefix = '/hang-hoa/';

export function groceryPermissionPaths(resource: Resource, direction: GroceryDirection, read: boolean, operation = ''): string[] {
  const base = direction === 'duc_trong_to_sg' ? `${prefix}duc-trong-sg/` : prefix;
  if (resource === 'export') return [`${base}xuat-hang`];
  if (resource === 'import') {
    return [
      `${base}nhap-hang`,
      ...(read ? [`${base}nhap-hang/lich-su`] : []),
      ...(direction === 'duc_trong_to_sg' ? [`${prefix}hang-gui-sg`] : [`${prefix}xac-nhan-hang-gui`]),
    ];
  }
  if (operation === 'warehouse-confirm') return [`${base}kho`];
  if (!read && (operation === 'delete' || operation === 'confirm')) return [`${base}giao-hang`];
  return [`${base}giao-hang`, `${base}kho`, `${base}xuat-hang`];
}

export const requireGroceryAccess = (resource: Resource, category?: OrderCategory) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json(errorResponse('Authentication required'));
    const user = req.user;
    const read = req.method === 'GET';
    const parts = req.path.split('/').filter(Boolean);
    const operation = parts.at(-1) || '';
    if (category) {
      if ((req.query.order_category !== undefined && req.query.order_category !== category)
        || (req.body?.order_category !== undefined && req.body.order_category !== category)) {
        return res.status(400).json(errorResponse('Order category does not match this API'));
      }
      if (category === 'vegetable' && (req.query.direction !== undefined || req.body?.direction !== undefined || req.body?.is_return_to_sg)) {
        return res.status(400).json(errorResponse('Grocery direction is not valid for vegetables'));
      }
      if (req.method === 'POST' && req.path === '/' && (resource === 'import' || resource === 'delivery')) {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
          return res.status(400).json(errorResponse('Expected an order object'));
        }
        req.body = { ...req.body, order_category: category };
      }
    }
    const requested = parseGroceryDirection(req.query.direction ?? req.body?.direction);
    const directions: GroceryDirection[] = [];
    for (const direction of GROCERY_DIRECTIONS) {
      if (category !== 'vegetable' && await userHasAnyPagePermission(user, groceryPermissionPaths(resource, direction, read, operation))) directions.push(direction);
    }
    const vegetablePaths = resource === 'import'
      ? [`${prefix}nhap-hang-rau`, ...(read ? [`${prefix}nhap-hang-rau/lich-su`] : [])]
      : resource === 'delivery' ? [`${prefix}giao-hang-rau`, `${prefix}kho-rau`, `${prefix}giao-ket`, `${prefix}quan-ly-ket`, `${prefix}chia-ket`, `${prefix}in-phieu-ket`] : [];
    const vegetablesAllowed = category !== 'standard' && await userHasAnyPagePermission(user, vegetablePaths);
    if (requested && !directions.includes(requested)) return res.status(403).json(errorResponse('Bạn chưa có quyền cho chiều hàng này'));
    if (!directions.length && !vegetablesAllowed) return res.status(403).json(errorResponse('Bạn chưa có quyền thao tác'));
    if (requested && req.query.order_category === 'vegetable') throw new Error('Grocery direction is not valid for vegetables');
    if (req.query.order_category === 'vegetable' && !vegetablesAllowed) return res.status(403).json(errorResponse('Bạn chưa có quyền hàng rau'));
    res.locals.groceryDirections = requested ? [requested] : directions;
    res.locals.groceryCategory = requested || !vegetablesAllowed ? 'standard' : undefined;
    if (!directions.length) res.locals.groceryCategory = 'vegetable';
    if (category) res.locals.groceryCategory = category;

    const assertSource = (source: any) => {
      if (category && source.order_category !== category) throw new Error('Order category does not match this API');
      if (source.order_category === 'vegetable') {
        if (requested || !vegetablesAllowed) throw new Error('Order is outside permitted direction');
        return;
      }
      const direction = groceryDirection(source);
      if (!directions.includes(direction) || (requested && direction !== requested)) throw new Error('Order is outside permitted direction');
    };
    const sourceDirections = new Set<string>();
    const importSource = async (id: string) => {
      const source = await ImportOrderService.getById(z.string().uuid().parse(id), user, category);
      assertSource(source);
      sourceDirections.add(source.order_category === 'vegetable' ? 'vegetable' : groceryDirection(source));
      return source;
    };
    let driverScopePromise: ReturnType<typeof fetchDriverScopeForUser> | undefined;
    const deliverySource = async (id: string) => {
      const { data, error } = await supabaseService.from('delivery_orders')
        .select('*, import_orders(*), vegetable_orders(*), delivery_vehicles(*, vehicles(license_plate))')
        .eq('id', z.string().uuid().parse(id)).single();
      if (error || !data) throw new Error('Delivery order not found');
      const relation = category === 'vegetable' ? data.vegetable_orders : category === 'standard' ? data.import_orders : data.import_orders || data.vegetable_orders;
      const source = Array.isArray(relation) ? relation[0] : relation;
      if (goodsScopeIsDriverRole(user.role)) driverScopePromise ??= fetchDriverScopeForUser(user.id);
      const driverScope = driverScopePromise ? await driverScopePromise : null;
      if (!source || source.deleted_at || !deliveryOrderRowMatchesGoodsScope(data, user, driverScope)) throw new Error('Order not found');
      const resolved = { ...source, order_category: data.vegetable_orders ? 'vegetable' : 'standard' };
      assertSource(resolved);
      sourceDirections.add(resolved.order_category === 'vegetable' ? 'vegetable' : groceryDirection(resolved));
      return resolved;
    };
    const exportSource = async (id: string) => {
      const { data, error } = await supabaseService.from('export_orders').select('product_id').eq('id', z.string().uuid().parse(id)).single();
      if (error || !data) throw new Error('Export order not found');
      if (!data.product_id && user.role === 'admin' && !requested) return;
      await deliverySource(data.product_id);
    };

    const recordId = parts[0] && z.string().uuid().safeParse(parts[0]).success ? parts[0] : undefined;
    if (recordId) {
      if (resource === 'import') {
        const existing = await importSource(recordId);
        if (!read) {
          if (req.body?.order_category && req.body.order_category !== existing.order_category) throw new Error('Order category cannot be changed');
          resolveGroceryFlag({ ...req.body, order_category: existing.order_category }, existing);
        }
      } else if (resource === 'delivery') await deliverySource(recordId);
      else await exportSource(recordId);
    }
    if (!read) {
      if (Array.isArray(req.body?.ids)) {
        const ids = z.array(z.string().uuid()).min(1).parse(req.body.ids);
        for (const id of ids) {
          if (resource === 'export') await exportSource(id);
          else if (resource === 'delivery') await deliverySource(id);
          else await importSource(id);
        }
      }
      if (Array.isArray(req.body?.source_order_ids)) {
        for (const id of z.array(z.string().uuid()).parse(req.body.source_order_ids)) await deliverySource(id);
      }
      if (resource === 'delivery' && req.method === 'POST' && req.path === '/') await importSource(req.body?.import_order_id);
      if (resource === 'export' && req.method === 'POST' && req.path === '/') await deliverySource(req.body?.product_id);
      if (resource === 'import' && req.method === 'POST' && req.path === '/') {
        const flag = resolveGroceryFlag(req.body || {});
        assertSource({ is_return_to_sg: flag, order_category: req.body?.order_category });
      }
      if (sourceDirections.size > 1) throw new Error('Cannot combine different order directions');
    }
    return next();
  } catch (error: any) {
    return res.status(400).json(errorResponse(error.message));
  }
};
