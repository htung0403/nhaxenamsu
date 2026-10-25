import axiosClient from './axiosClient';
import type { ImportOrder, ImportOrderCreatePayload, ImportOrderFilters } from '../types';

export interface PaginatedImportOrders {
  vegetableFilterOptions?: { suppliers: string[]; vehicles: string[]; receivers: string[] };
  filterOptions?: { senders: string[]; receivers: string[]; vehicles: string[] };
  data: ImportOrder[];
  total: number;
  page: number;
  pageSize: number;
}

function createImportOrdersApi(basePath: string) {
  return {
    getAll: async (filters?: ImportOrderFilters & { page?: number; pageSize?: number }, signal?: AbortSignal) => {
      const { data } = await axiosClient.get<PaginatedImportOrders>(basePath, { params: filters, signal });
      return data;
    },

    getById: async (id: string) => {
      const { data } = await axiosClient.get<ImportOrder>(`${basePath}/${id}`);
      return data;
    },

    getNextSequence: async (date: string) => {
      const { data } = await axiosClient.get<{ sequence: number; code: string }>(`${basePath}/daily-sequence`, { params: { date } });
      return data;
    },

    create: async (payload: ImportOrderCreatePayload) => {
      const { data } = await axiosClient.post<ImportOrder>(basePath, payload);
      return data;
    },

    update: async (id: string, payload: Partial<ImportOrderCreatePayload>) => {
      const { data } = await axiosClient.put<ImportOrder>(`${basePath}/${id}`, payload);
      return data;
    },

    confirmByAdmin: async (id: string, payload?: { order_category?: 'standard' | 'vegetable' }) => {
      const { data } = await axiosClient.patch<ImportOrder>(`${basePath}/${id}/admin-confirm`, payload || {});
      return data;
    },

    delete: async (id: string) => {
      const { data } = await axiosClient.delete(`${basePath}/${id}`);
      return data;
    },
  };
}

export const groceryOrdersApi = createImportOrdersApi('/grocery-orders');
export const vegetableOrdersApi = createImportOrdersApi('/vegetable-orders');
const legacyImportOrdersApi = createImportOrdersApi('/import-orders');
type OrderCategory = 'standard' | 'vegetable';

function apiFor(category?: OrderCategory) {
  if (category === 'vegetable') return vegetableOrdersApi;
  if (category === 'standard') return groceryOrdersApi;
  return legacyImportOrdersApi;
}

export const importOrdersApi = {
  getAllForPrint: async (filters?: ImportOrderFilters, signal?: AbortSignal): Promise<PaginatedImportOrders> => {
    const api = apiFor(filters?.order_category);
    const batchSize = 500;
    const first = await api.getAll({ ...filters, page: 1, pageSize: batchSize }, signal);
    const orders = [...first.data];
    const pageCount = Math.ceil(first.total / batchSize);
    for (let page = 2; page <= pageCount; page += 1) {
      const batch = await api.getAll({ ...filters, page, pageSize: batchSize }, signal);
      orders.push(...batch.data);
    }
    return { ...first, data: orders, total: orders.length, page: 1, pageSize: orders.length };
  },
  getAll: (filters?: ImportOrderFilters & { page?: number; pageSize?: number }, signal?: AbortSignal) =>
    apiFor(filters?.order_category).getAll(filters, signal),
  getById: (id: string, category?: OrderCategory) => apiFor(category).getById(id),
  getNextSequence: (date: string, category?: OrderCategory) => apiFor(category).getNextSequence(date),
  create: (payload: ImportOrderCreatePayload) => apiFor(payload.order_category || 'standard').create(payload),
  update: (id: string, payload: Partial<ImportOrderCreatePayload>) => apiFor(payload.order_category).update(id, payload),
  confirmByAdmin: (id: string, payload?: { order_category?: OrderCategory }) => apiFor(payload?.order_category).confirmByAdmin(id, payload),
  delete: (id: string, category?: OrderCategory) => apiFor(category).delete(id),
};
