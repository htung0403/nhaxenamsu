import axiosClient from './axiosClient';

export type VehicleDebtCustomerType = 'loyal' | 'grocery_non_loyal';

export interface VehicleDebt {
  id: string;
  delivery_vehicle_id: string;
  delivery_order_id: string;
  order_id: string;
  order_code: string;
  product_name?: string | null;
  order_date?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  assigned_at?: string | null;
  customer: {
    id: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    is_loyal?: boolean | null;
  };
  vehicle: {
    id?: string | null;
    license_plate?: string | null;
  };
  driver: {
    id?: string | null;
    full_name?: string | null;
    phone?: string | null;
  };
  assigned_quantity: number;
  unit_price: number;
  expected_amount: number;
  export_payment_status: 'unpaid';
}

export interface VehicleDebtPayment {
  id: string;
  delivery_vehicle_id?: string | null;
  delivery_order_id: string;
  order_code?: string | null;
  product_name?: string | null;
  customer?: { id?: string | null; name?: string | null } | null;
  vehicle?: { id?: string | null; license_plate?: string | null } | null;
  driver?: { id?: string | null; full_name?: string | null } | null;
  entered_by?: { id?: string | null; full_name?: string | null } | null;
  paid_at: string;
  quantity: number;
  unit_price: number;
  paid_amount: number;
  expected_amount: number;
  notes?: string | null;
}

export interface RecordVehicleDebtPaymentPayload {
  paid_at: string;
  quantity: number;
  unit_price: number;
  paid_amount: number;
  notes?: string;
}

export const accountingApi = {
  getDebts: async () => {
    const { data } = await axiosClient.get('/accounting/debts');
    return data;
  },

  getRevenueByDate: async (params?: { from?: string; to?: string }) => {
    const { data } = await axiosClient.get('/accounting/revenue/by-date', { params });
    return data;
  },

  getRevenueByVehicle: async (params?: { from?: string; to?: string }) => {
    const { data } = await axiosClient.get('/accounting/revenue/by-vehicle', { params });
    return data;
  },

  getVehicleDebts: async (customerType: VehicleDebtCustomerType) => {
    const { data } = await axiosClient.get<VehicleDebt[]>('/accounting/vehicle-debts', {
      params: { customerType },
    });
    return data;
  },

  getVehicleDebtPayments: async (customerType: VehicleDebtCustomerType) => {
    const { data } = await axiosClient.get<VehicleDebtPayment[]>('/accounting/vehicle-debt-payments', {
      params: { customerType },
    });
    return data;
  },

  recordVehicleDebtPayment: async (deliveryVehicleId: string, payload: RecordVehicleDebtPaymentPayload) => {
    const { data } = await axiosClient.post<VehicleDebtPayment>(`/accounting/vehicle-debts/${deliveryVehicleId}/payment`, payload);
    return data;
  },

  recordVehicleDebtPayments: async (items: Array<RecordVehicleDebtPaymentPayload & { delivery_vehicle_id: string }>) => {
    const { data } = await axiosClient.post<VehicleDebtPayment[]>('/accounting/vehicle-debts/payments', { items });
    return data;
  },

  updateVehicleDebtPayment: async (paymentId: string, payload: RecordVehicleDebtPaymentPayload) => {
    const { data } = await axiosClient.patch<VehicleDebtPayment>(`/accounting/vehicle-debt-payments/${paymentId}`, payload);
    return data;
  },

  getSgImportCash: async (params?: { from?: string; to?: string }) => {
    const q: Record<string, string> = {};
    if (params?.from) q.from = params.from;
    if (params?.to) q.to = params.to;
    const { data } = await axiosClient.get('/accounting/sg-import-cash', { params: q });
    return data;
  },

  getSgImportCashOrder: async (importOrderId: string) => {
    const { data } = await axiosClient.get(`/accounting/sg-import-cash/${importOrderId}`);
    return data;
  },

  confirmSgHandover: async (importOrderId: string) => {
    const { data } = await axiosClient.patch(`/accounting/sg-import-cash/${importOrderId}/confirm-handover`);
    return data;
  },

  bulkConfirmSgHandover: async (ids: string[]) => {
    const { data } = await axiosClient.patch(`/accounting/sg-import-cash/bulk-confirm-handover`, { ids });
    return data;
  },

  getInvoiceOrders: async (params?: {
    category?: string;
    dateFrom?: string;
    dateTo?: string;
    customer_id?: string;
    invoice_status?: string;
  }) => {
    const q: Record<string, string> = {};
    if (params?.category) q.category = params.category;
    if (params?.dateFrom) q.dateFrom = params.dateFrom;
    if (params?.dateTo) q.dateTo = params.dateTo;
    if (params?.customer_id) q.customer_id = params.customer_id;
    if (params?.invoice_status) q.invoice_status = params.invoice_status;
    const { data } = await axiosClient.get('/accounting/invoice-orders', { params: q });
    return data;
  },

  bulkMarkInvoiceExported: async (payload: {
    ids: string[];
    category: 'standard' | 'vegetable';
    exported?: boolean;
  }) => {
    const { data } = await axiosClient.patch('/accounting/invoice-orders/mark-exported', payload);
    return data;
  },
};
