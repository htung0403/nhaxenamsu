import axiosClient from './axiosClient';
import type { ExportOrder, PaginationMeta, GroceryDirection } from '../types';

export interface ExportOrdersResponse {
  data: ExportOrder[];
  meta: PaginationMeta;
}

export const exportOrdersApi = {
  getAll: async (params?: { page?: number; limit?: number; direction?: GroceryDirection; dateFrom?: string; dateTo?: string; search?: string }, signal?: AbortSignal) => {
    const response = await axiosClient.get<ExportOrder[]>('/export-orders', { params, signal });
    return {
      data: response.data,
      meta: (response as typeof response & { meta: PaginationMeta }).meta,
    };
  },

  create: async (payload: Omit<ExportOrder, 'id' | 'created_at' | 'created_by'>) => {
    const { data } = await axiosClient.post<ExportOrder>('/export-orders', payload);
    return data;
  },

  updatePayment: async (id: string, payload: { paid_amount: number; payment_status: string }) => {
    const { data } = await axiosClient.put<ExportOrder>(`/export-orders/${id}/payment`, payload);
    return data;
  },

  deleteMany: async (ids: string[]) => {
    const { data } = await axiosClient.post('/export-orders/bulk-delete', { ids });
    return data;
  },
};
