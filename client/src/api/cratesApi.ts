import axiosClient from './axiosClient';
import type { Customer, Vehicle } from '../types';

export type CrateRole = 'sender' | 'receiver';
export type CrateReceiptType = 'intake' | 'allocation' | 'delivery';

export interface CrateAccount {
  customer_id: string;
  is_sender: boolean;
  is_receiver: boolean;
  sender_balance: number;
  receiver_pending: number;
  receiver_debt: number;
  created_at: string;
  updated_at: string;
  customer?: Customer;
}

export interface CrateIntake {
  id: string;
  sender_customer_id: string;
  quantity: number;
  sender_balance_after: number;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  sender?: Pick<Customer, 'id' | 'name' | 'phone' | 'address'>;
  creator?: { id: string; full_name: string } | null;
}

export interface CrateAllocation {
  id: string;
  sender_customer_id: string;
  receiver_customer_id: string;
  quantity: number;
  debt_applied: number;
  pending_added: number;
  sender_balance_after: number;
  receiver_pending_after: number;
  receiver_debt_after: number;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  sender?: Pick<Customer, 'id' | 'name' | 'phone' | 'address'>;
  receiver?: Pick<Customer, 'id' | 'name' | 'phone' | 'address'>;
  creator?: { id: string; full_name: string } | null;
}

export interface CrateDelivery {
  id: string;
  receiver_customer_id: string;
  quantity: number;
  pending_before: number;
  debt_created: number;
  receiver_pending_after: number;
  receiver_debt_after: number;
  notes?: string | null;
  image_urls: string[];
  driver_id?: string | null;
    vehicle_id?: string | null;
  delivered_at: string;
  created_at: string;
  receiver?: Pick<Customer, 'id' | 'name' | 'phone' | 'address'>;
  driver?: { id: string; full_name: string } | null;
  vehicle?: Pick<Vehicle, 'id' | 'license_plate'> | null;
}

export interface CrateHistory {
  intakes: CrateIntake[];
  allocations: CrateAllocation[];
  deliveries: CrateDelivery[];
}

export interface CrateReceipt {
  type: CrateReceiptType;
  record: CrateIntake | CrateAllocation | CrateDelivery;
}

export interface CrateNotificationLog {
  id?: string;
  target_name?: string | null;
  target_phone?: string | null;
  status: 'sent' | 'failed' | 'skipped';
  error_message?: string | null;
  message_id?: string | null;
  public_link?: string | null;
}

export const cratesApi = {
  getAccounts: async (role?: CrateRole) => {
    const { data } = await axiosClient.get<CrateAccount[]>('/crates/accounts', { params: { role } });
    return data;
  },

  setRoles: async (payload: { customer_ids: string[]; role: CrateRole; enabled?: boolean }) => {
    const { data } = await axiosClient.put('/crates/accounts/roles', payload);
    return data;
  },

  createIntake: async (payload: { sender_customer_id: string; quantity: number; notes?: string | null }) => {
    const { data } = await axiosClient.post('/crates/intakes', payload);
    return data;
  },

  createAllocation: async (payload: { sender_customer_id: string; receiver_customer_id: string; quantity: number; notes?: string | null }) => {
    const { data } = await axiosClient.post('/crates/allocations', payload);
    return data;
  },

  createDelivery: async (payload: { receiver_customer_id: string; quantity: number; notes?: string | null; image_urls?: string[]; vehicle_id?: string | null }) => {
    const { data } = await axiosClient.post('/crates/deliveries', payload);
    return data;
  },

  getHistory: async (customerId?: string, filters?: { start_date?: string; end_date?: string }) => {
    const { data } = await axiosClient.get<CrateHistory>('/crates/history', {
      params: {
        customer_id: customerId,
        start_date: filters?.start_date || undefined,
        end_date: filters?.end_date || undefined,
      },
    });
    return data;
  },

  getReceipt: async (type: CrateReceiptType, id: string) => {
    const { data } = await axiosClient.get<CrateReceipt>(`/crates/receipts/${type}/${id}`);
    return data;
  },

  resendZalo: async (type: CrateReceiptType, id: string, targetCustomerId?: string) => {
    const { data } = await axiosClient.post<CrateNotificationLog | CrateNotificationLog[]>(`/crates/receipts/${type}/${id}/resend-zalo`, { target_customer_id: targetCustomerId });
    return data;
  },
};


