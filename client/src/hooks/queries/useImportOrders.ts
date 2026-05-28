import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { importOrdersApi } from '../../api/importOrdersApi';
import { zaloSummaryApi } from '../../api/zaloSummaryApi';
import type { ImportOrderFilters, ImportOrderCreatePayload } from '../../types';
import toast from 'react-hot-toast';

export const importOrderKeys = {
  all: ['import-orders'] as const,
  list: (filters?: ImportOrderFilters) => [...importOrderKeys.all, 'list', filters] as const,
  detail: (id: string) => [...importOrderKeys.all, 'detail', id] as const,
};

export function useImportOrders(filters?: ImportOrderFilters) {
  return useQuery({
    queryKey: importOrderKeys.list(filters),
    queryFn: () => importOrdersApi.getAll(filters),
  });
}

export function useImportOrder(id: string) {
  return useQuery({
    queryKey: importOrderKeys.detail(id),
    queryFn: () => importOrdersApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateImportOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ImportOrderCreatePayload) => importOrdersApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: importOrderKeys.all });
      toast.success('Tạo đơn nhập hàng thành công');
    },
    onError: () => {
      toast.error('Lỗi khi tạo đơn nhập hàng');
    },
  });
}

export function useUpdateImportOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ImportOrderCreatePayload> }) =>
      importOrdersApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: importOrderKeys.all });
      toast.success('Cập nhật đơn nhập hàng thành công');
    },
    onError: () => {
      toast.error('Lỗi khi cập nhật đơn nhập hàng');
    },
  });
}

export function useDeleteImportOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => importOrdersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: importOrderKeys.all });
      queryClient.invalidateQueries({ queryKey: ['delivery'] });
      queryClient.invalidateQueries({ queryKey: ['export-orders'] });
      toast.success('Xóa đơn nhập hàng thành công');
    },
    onError: () => {
      toast.error('Lỗi khi xóa đơn nhập hàng');
    },
  });
}

export function useBulkDeleteImportOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => importOrdersApi.delete(id))),
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: importOrderKeys.all });
      queryClient.invalidateQueries({ queryKey: ['delivery'] });
      queryClient.invalidateQueries({ queryKey: ['export-orders'] });
      toast.success(`Đã xóa ${ids.length} đơn nhập hàng`);
    },
    onError: () => {
      toast.error('Lỗi khi xóa hàng loạt đơn nhập hàng');
    },
  });
}

export function useBulkUpdateImportOrdersReceivedBy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, receivedBy, orderCategory }: { ids: string[]; receivedBy: string; orderCategory?: 'standard' | 'vegetable' }) =>
      Promise.all(ids.map((id) => importOrdersApi.update(id, { received_by: receivedBy, order_category: orderCategory }))),
    onSuccess: (_, { ids }) => {
      queryClient.invalidateQueries({ queryKey: importOrderKeys.all });
      toast.success(`Đã cập nhật nhân viên nhận cho ${ids.length} đơn`);
    },
    onError: () => {
      toast.error('Lỗi khi cập nhật nhân viên nhận hàng loạt');
    },
  });
}

export function useConfirmImportOrderByAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, orderCategory }: { id: string; orderCategory?: 'standard' | 'vegetable' }) =>
      importOrdersApi.confirmByAdmin(id, { order_category: orderCategory }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: importOrderKeys.all });
      toast.success('Đã xác nhận đơn hàng');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Không thể xác nhận đơn hàng');
    },
  });
}

export function useSendVegetableArrivalNotice() {
  return useMutation({
    mutationFn: ({ date, taiRank }: { date: string; taiRank: number }) =>
      zaloSummaryApi.sendVegetableArrivalNotice({ date, taiRank }),
    onSuccess: (result) => {
      toast.success(
        `Đã gửi Zalo Tài ${result.taiRank}: ${result.sent} thành công, ${result.failed} lỗi, ${result.skipped} bỏ qua`,
      );
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Không thể gửi thông báo Zalo cho vựa rau');
    },
  });
}


