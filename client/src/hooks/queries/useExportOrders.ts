import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { exportOrdersApi } from '../../api/exportOrdersApi';
import type { GroceryDirection } from '../../types';
import toast from 'react-hot-toast';

export const exportOrderKeys = {
  all: ['export-orders'] as const,
  list: (params?: { page?: number; limit?: number; direction?: GroceryDirection; dateFrom?: string; dateTo?: string; search?: string }) => [...exportOrderKeys.all, 'list', params] as const,
};

export function useExportOrders(params?: { page?: number; limit?: number; direction?: GroceryDirection; dateFrom?: string; dateTo?: string; search?: string }) {
  return useQuery({
    queryKey: exportOrderKeys.list(params),
    queryFn: ({ signal }) => exportOrdersApi.getAll(params, signal),
  });
}

export function useCreateExportOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: exportOrdersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exportOrderKeys.all });
      toast.success('Tạo đơn xuất hàng thành công');
    },
    onError: () => toast.error('Lỗi khi tạo đơn xuất hàng'),
  });
}

export function useUpdateExportPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { paid_amount: number; payment_status: string } }) =>
      exportOrdersApi.updatePayment(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exportOrderKeys.all });
      toast.success('Cập nhật thanh toán thành công');
    },
    onError: () => toast.error('Lỗi khi cập nhật thanh toán'),
  });
}

export function useDeleteExportOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => exportOrdersApi.deleteMany(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exportOrderKeys.all });
      toast.success('Đã xóa đơn xuất hàng');
    },
    onError: () => toast.error('Lỗi khi xóa đơn xuất hàng'),
  });
}
