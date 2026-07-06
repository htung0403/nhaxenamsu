import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi } from '../../api/customersApi';
import type { CustomerSelfOrderPayload } from '../../api/customersApi';
import toast from 'react-hot-toast';

export const customerKeys = {
  all: ['customers'] as const,
  list: (type?: string) => [...customerKeys.all, 'list', type] as const,
  vegetableSenderReceivers: (senderId: string) => [...customerKeys.all, 'vegetable-sender-receivers', senderId] as const,
  vegetableSenderReceiverOrders: (senderId: string, receiverKey: string) => [...customerKeys.all, 'vegetable-sender-receiver-orders', senderId, receiverKey] as const,
  loyalList: () => [...customerKeys.all, 'loyalList'] as const,
  detail: (id: string) => [...customerKeys.all, 'detail', id] as const,
  orders: (id: string) => [...customerKeys.all, 'orders', id] as const,
  myOrders: () => [...customerKeys.all, 'my-orders'] as const,
  myDeliveryOrders: () => [...customerKeys.all, 'my-delivery-orders'] as const,
  myDeliveryVehicles: () => [...customerKeys.all, 'my-delivery-vehicles'] as const,
  myOrderProducts: () => [...customerKeys.all, 'my-order-products'] as const,
  deliveryOrders: (id: string) => [...customerKeys.all, 'deliveryOrders', id] as const,
  exportOrders: (id: string) => [...customerKeys.all, 'export-orders', id] as const,
  receipts: (id: string) => [...customerKeys.all, 'receipts', id] as const,
};

export function useCustomers(type?: string, enabled = true) {
  return useQuery({
    queryKey: customerKeys.list(type),
    queryFn: () => customersApi.getAll(type),
    enabled,
  });
}

export function useVegetableReceiverCustomersBySender(senderId: string | undefined) {
  return useQuery({
    queryKey: customerKeys.vegetableSenderReceivers(senderId || ''),
    queryFn: () => customersApi.getVegetableReceiverCustomersBySender(senderId || ''),
    enabled: Boolean(senderId),
  });
}
export function useVegetableOrdersBySenderAndReceiver(senderId: string | undefined, receiverKey: string | undefined) {
  return useQuery({
    queryKey: customerKeys.vegetableSenderReceiverOrders(senderId || '', receiverKey || ''),
    queryFn: () => customersApi.getVegetableOrdersBySenderAndReceiver(senderId || '', receiverKey || ''),
    enabled: Boolean(senderId && receiverKey),
  });
}
export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => customersApi.getById(id),
    enabled: !!id,
  });
}

export function useCustomerByUserId(userId: string) {
  return useQuery({
    queryKey: [...customerKeys.all, 'user', userId],
    queryFn: () => customersApi.getByUserId(userId),
    enabled: !!userId,
  });
}

export function useCustomerOrders(id: string) {
  return useQuery({
    queryKey: customerKeys.orders(id),
    queryFn: () => customersApi.getOrders(id),
    enabled: !!id,
  });
}

export function useMyOrders(enabled = true) {
  return useQuery({
    queryKey: customerKeys.myOrders(),
    queryFn: customersApi.getMyOrders,
    enabled,
  });
}

export function useMyOrderProducts(enabled = true) {
  return useQuery({
    queryKey: customerKeys.myOrderProducts(),
    queryFn: customersApi.getMyOrderProducts,
    enabled,
  });
}

export function useMyDeliveryOrders(enabled = true) {
  return useQuery({
    queryKey: customerKeys.myDeliveryOrders(),
    queryFn: customersApi.getMyDeliveryOrders,
    enabled,
  });
}

export function useMyDeliveryVehicles(enabled = true) {
  return useQuery({
    queryKey: customerKeys.myDeliveryVehicles(),
    queryFn: customersApi.getMyDeliveryVehicles,
    enabled,
  });
}

export function useCustomerExportOrders(id: string) {
  return useQuery({
    queryKey: customerKeys.exportOrders(id),
    queryFn: () => customersApi.getExportOrders(id),
    enabled: !!id,
  });
}

export function useCustomerReceipts(id: string) {
  return useQuery({
    queryKey: customerKeys.receipts(id),
    queryFn: () => customersApi.getReceipts(id),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      toast.success('Thêm khách hàng thành công');
    },
    onError: () => toast.error('Lỗi khi thêm khách hàng'),
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { name?: string; phone?: string | null; address?: string | null; latitude?: number | null; longitude?: number | null; customer_type?: string; aliases?: string[] };
    }) => customersApi.update(id, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(variables.id) });
      toast.success('Cập nhật khách hàng thành công');
    },
    onError: () => toast.error('Lỗi khi cập nhật khách hàng'),
  });
}

export function useCreateMyOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomerSelfOrderPayload) => customersApi.createMyOrder(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.myOrders() });
      toast.success('Đã tạo đơn trả hàng về SG');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Không thể tạo đơn trả hàng'),
  });
}

export function useUpdateMyOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, payload }: { orderId: string; payload: Partial<CustomerSelfOrderPayload> }) =>
      customersApi.updateMyOrder(orderId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.myOrders() });
      toast.success('Đã cập nhật đơn trả hàng');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Không thể cập nhật đơn trả hàng'),
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customersApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      toast.success('Đã xóa khách hàng');
    },
    onError: () => toast.error('Lỗi khi xóa khách hàng'),
  });
}

export function useCreateCustomerAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      customer_id: string;
      phone?: string;
      email?: string | null;
      password?: string;
      full_name?: string;
    }) => customersApi.createAccount(payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(variables.customer_id) });
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      toast.success('Đã tạo tài khoản khách hàng');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Không thể tạo tài khoản khách hàng'),
  });
}

export function useUpdateCustomerPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { amount: number, payment_date?: string, payment_time?: string, collector_id?: string, notes?: string } }) => customersApi.updatePayment(id, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: customerKeys.list() });
      queryClient.invalidateQueries({ queryKey: customerKeys.exportOrders(variables.id) });
      queryClient.invalidateQueries({ queryKey: customerKeys.receipts(variables.id) });
      queryClient.invalidateQueries({ queryKey: ['export-orders'] });
      toast.success('Thanh toán công nợ thành công');
    },
    onError: () => toast.error('Lỗi khi thanh toán công nợ'),
  });
}

export function useLoyalCustomers() {
  return useQuery({
    queryKey: customerKeys.loyalList(),
    queryFn: customersApi.getLoyalCustomers,
  });
}

export function useBulkSetLoyal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customersApi.bulkSetLoyal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      toast.success('Đã cập nhật danh sách khách hàng thân thiết');
    },
    onError: () => toast.error('Lỗi khi cập nhật danh sách khách hàng thân thiết'),
  });
}

export function useCustomerDeliveryOrders(id: string) {
  return useQuery({
    queryKey: customerKeys.deliveryOrders(id),
    queryFn: () => customersApi.getDeliveryOrders(id),
    enabled: !!id,
  });
}

export function useUpdateDeliveryOrderPrices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customersApi.updateDeliveryOrderPrices,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.deliveryOrders(variables.customerId) });
      toast.success('Cập nhật giá thành công');
    },
    onError: () => toast.error('Lỗi khi cập nhật giá'),
  });
}

export function useMergeCustomers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customersApi.merge,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useUndoMerge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customersApi.undoMerge,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
