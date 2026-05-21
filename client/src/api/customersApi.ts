import axiosClient from './axiosClient';
import type { Customer, DeliveryOrder, ImportOrder, Product } from '../types';

export interface CustomerSelfOrderPayload {
  order_date?: string;
  order_time?: string;
  sender_name?: string;
  sender_id?: string | null;
  receiver_name?: string;
  receiver_phone?: string;
  receiver_address?: string;
  warehouse_id?: string | null;
  customer_id?: string | null;
  order_category?: 'standard' | 'vegetable';
  total_amount?: number | null;
  is_custom_amount?: boolean;
  notes?: string | null;
  receipt_image_url?: string | null;
  receipt_image_urls?: string[] | null;
  selected_alias?: string | null;
  items?: Array<{
    product_id?: string | null;
    package_type?: string | null;
    item_note?: string | null;
    weight_kg?: number | null;
    quantity: number;
    unit_price?: number | null;
    image_url?: string | null;
    image_urls?: string[] | null;
    payment_status?: 'paid' | 'unpaid';
  }>;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
  provider: 'nominatim';
  cached: boolean;
}

export const customersApi = {
  getAll: async (type?: string) => {
    const { data } = await axiosClient.get<Customer[]>('/customers', { params: { type } });
    return data;
  },

  create: async (payload: { name: string; phone?: string | null; address?: string | null; latitude?: number | null; longitude?: number | null; customer_type?: string; aliases?: string[] }) => {
    const { data } = await axiosClient.post<Customer>('/customers', payload);
    return data;
  },

  update: async (id: string, payload: { name?: string; phone?: string | null; address?: string | null; latitude?: number | null; longitude?: number | null; customer_type?: string; aliases?: string[] }) => {
    const { data } = await axiosClient.put<Customer>(`/customers/${id}`, payload);
    return data;
  },

  geocode: async (address: string) => {
    const { data } = await axiosClient.post<GeocodeResult>('/customers/geocode', { address });
    return data;
  },

  remove: async (id: string) => {
    const { data } = await axiosClient.delete(`/customers/${id}`);
    return data;
  },

  getById: async (id: string) => {
    const { data } = await axiosClient.get<Customer>(`/customers/${id}`);
    return data;
  },
  
  getByUserId: async (userId: string) => {
    const { data } = await axiosClient.get<Customer>(`/customers/user/${userId}`);
    return data;
  },

  getOrders: async (id: string) => {
    const { data } = await axiosClient.get(`/customers/${id}/orders`);
    return data;
  },
  
  getMyOrders: async () => {
    const { data } = await axiosClient.get<ImportOrder[]>('/customers/me/orders');
    return data;
  },

  getMyOrderProducts: async () => {
    const { data } = await axiosClient.get<Product[]>('/customers/me/order-products');
    return data;
  },

  createMyOrder: async (payload: CustomerSelfOrderPayload) => {
    const { data } = await axiosClient.post<ImportOrder>('/customers/me/orders', payload);
    return data;
  },

  updateMyOrder: async (orderId: string, payload: Partial<CustomerSelfOrderPayload>) => {
    const { data } = await axiosClient.put<ImportOrder>(`/customers/me/orders/${orderId}`, payload);
    return data;
  },

  getExportOrders: async (id: string) => {
    const { data } = await axiosClient.get(`/customers/${id}/export-orders`);
    return data;
  },

  getReceipts: async (id: string) => {
    const { data } = await axiosClient.get(`/customers/${id}/receipts`);
    return data;
  },

  getDebt: async (id: string) => {
    const { data } = await axiosClient.get(`/customers/${id}/debt`);
    return data;
  },

  updatePayment: async (id: string, payload: { amount: number, payment_date?: string, payment_time?: string, collector_id?: string, notes?: string }) => {
    const { data } = await axiosClient.put(`/customers/${id}/payment`, payload);
    return data;
  },

  createAccount: async (payload: {
    customer_id: string;
    phone?: string;
    email?: string | null;
    password?: string;
    full_name?: string;
  }) => {
    const { data } = await axiosClient.post('/customers/create-account', payload);
    return data;
  },

  getLoyalCustomers: async () => {
    const { data } = await axiosClient.get<Customer[]>('/customers', { params: { is_loyal: 'true' } });
    return data;
  },

  bulkSetLoyal: async (ids: string[]) => {
    const { data } = await axiosClient.put('/customers/bulk-loyal', { customer_ids: ids, is_loyal: true });
    return data;
  },

  getDeliveryOrders: async (customerId: string) => {
    const { data } = await axiosClient.get<DeliveryOrder[]>(`/customers/${customerId}/delivery-orders`);
    return data;
  },

  updateDeliveryOrderPrices: async ({ customerId, updates }: { customerId: string; updates: any[] }) => {
    const { data } = await axiosClient.put(`/customers/${customerId}/delivery-order-prices`, { updates });
    return data;
  },

  merge: async (payload: { source_id: string; target_id: string }) => {
    const { data } = await axiosClient.post('/customers/merge', payload);
    return data;
  },

  undoMerge: async (mergeId: string) => {
    const { data } = await axiosClient.post(`/customers/merge/undo/${mergeId}`);
    return data;
  },
};
