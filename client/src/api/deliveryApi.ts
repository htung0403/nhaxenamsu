import axiosClient from './axiosClient';
import type { DeliveryOrder, GroceryDirection } from '../types';

export type DeliveryReadOptions = { includeExportPaymentStatus?: boolean };

function createDeliveryApi(basePath: string) {
  return {
    getAllToday: async (startDate?: string, endDate?: string, orderCategory?: string, direction?: GroceryDirection, signal?: AbortSignal, options?: DeliveryReadOptions) => {
      const { data } = await axiosClient.get<DeliveryOrder[]>(basePath, {
        signal,
        params: {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          order_category: orderCategory || undefined,
          direction,
          ...(options?.includeExportPaymentStatus === false ? { include_export_payment_status: false } : {}),
        },
      });
      return data;
    },

    getInventory: async (orderCategory?: string, direction?: GroceryDirection, signal?: AbortSignal) => {
      const { data } = await axiosClient.get(`${basePath}/inventory`, {
        params: { order_category: orderCategory, direction }, signal
      });
      return data;
    },

    create: async (payload: {
      import_order_id: string;
      product_name: string;
      total_quantity: number;
      unit_price?: number;
      import_cost?: number;
      payment_method?: string;
      order_category?: 'standard' | 'vegetable';
      delivery_date?: string;
      delivery_time?: string | null;
      vehicles?: Array<{
        vehicle_id: string;
        driver_id: string;
        quantity: number;
      }>;
    }) => {
      const { data } = await axiosClient.post<DeliveryOrder>(basePath, payload);
      return data;
    },

    update: async (id: string, payload: Partial<DeliveryOrder>) => {
      const { data } = await axiosClient.put<DeliveryOrder>(`${basePath}/${id}`, payload);
      return data;
    },

    assignVehicle: async (
      id: string,
      payload: {
        assignments: { vehicle_id: string; driver_id: string; loader_name?: string | null; quantity: number; delivery_date?: string; delivery_time?: string; }[];
        image_url?: string | null;
        image_urls?: string[];
        export_payment_status?: 'unpaid' | 'paid';
        unit_price?: number;
        /** ISO: một mốc chung khi bấm Lưu (sau khi chụp ảnh), dùng cho phân xe hàng loạt / giờ giao thực tế */
        delivered_at?: string;
        delivery_date?: string;
        delivery_time?: string;
        source_order_ids?: string[];
        append_only?: boolean;
      }
    ) => {
      const { data } = await axiosClient.put(`${basePath}/${id}/assign-vehicle`, payload);
      return data;
    },

    updateQty: async (id: string, payload: { delivered_quantity: number }) => {
      const { data } = await axiosClient.put(`${basePath}/${id}/update-qty`, payload);
      return data;
    },

    confirmOrders: async (ids: string[]) => {
      const { data } = await axiosClient.put(`${basePath}/confirm`, { ids });
      return data;
    },

    confirmWarehouse: async (ids: string[]) => {
      const { data } = await axiosClient.put(`${basePath}/warehouse-confirm`, { ids });
      return data;
    },

    deleteOrders: async (ids: string[]) => {
      const { data } = await axiosClient.post(`${basePath}/delete`, { ids });
      return data;
    },

    revertVehicle: async (id: string, vehicleId?: string, deliveryDate?: string, tripIds?: string[]) => {
      const payload: { vehicle_id?: string; delivery_date?: string; trip_ids?: string[] } = {};
      if (vehicleId) payload.vehicle_id = vehicleId;
      if (deliveryDate) payload.delivery_date = deliveryDate;
      if (tripIds && tripIds.length > 0) payload.trip_ids = tripIds;
      const { data } = await axiosClient.put(`${basePath}/${id}/revert-vehicle`, payload);
      return data;
    },
  };
}

export const groceryDeliveriesApi = createDeliveryApi('/grocery-deliveries');
export const vegetableDeliveriesApi = createDeliveryApi('/vegetable-deliveries');
const legacyDeliveryApi = createDeliveryApi('/delivery');

function apiFor(category?: string) {
  if (category === 'vegetable') return vegetableDeliveriesApi;
  if (category === 'standard') return groceryDeliveriesApi;
  return legacyDeliveryApi;
}

export const deliveryApi = {
  ...legacyDeliveryApi,
  getAllToday: (startDate?: string, endDate?: string, category?: string, direction?: GroceryDirection, signal?: AbortSignal, options?: DeliveryReadOptions) =>
    apiFor(category).getAllToday(startDate, endDate, category, direction, signal, options),
  getInventory: (category?: string, direction?: GroceryDirection, signal?: AbortSignal) => apiFor(category).getInventory(category, direction, signal),
  create: (payload: Parameters<typeof legacyDeliveryApi.create>[0]) => apiFor(payload.order_category || 'standard').create(payload),
  update: (id: string, payload: Partial<DeliveryOrder>) => apiFor(payload.order_category).update(id, payload),
  deleteOrders: (ids: string[], category?: 'standard' | 'vegetable') => apiFor(category).deleteOrders(ids),
};
