import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { accountingApi } from '../../api/accountingApi';
import type { RecordVehicleDebtPaymentPayload, VehicleDebtCustomerType } from '../../api/accountingApi';

export const accountingKeys = {
  all: ['accounting'] as const,
  vehicleDebts: (customerType: VehicleDebtCustomerType) => [...accountingKeys.all, 'vehicle-debts', customerType] as const,
  vehicleDebtPayments: (customerType: VehicleDebtCustomerType) => [...accountingKeys.all, 'vehicle-debt-payments', customerType] as const,
};

export function useVehicleDebts(customerType: VehicleDebtCustomerType) {
  return useQuery({
    queryKey: accountingKeys.vehicleDebts(customerType),
    queryFn: () => accountingApi.getVehicleDebts(customerType),
  });
}

export function useVehicleDebtPayments(customerType: VehicleDebtCustomerType) {
  return useQuery({
    queryKey: accountingKeys.vehicleDebtPayments(customerType),
    queryFn: () => accountingApi.getVehicleDebtPayments(customerType),
  });
}

export function useRecordVehicleDebtPayment(customerType: VehicleDebtCustomerType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ deliveryVehicleId, payload }: { deliveryVehicleId: string; payload: RecordVehicleDebtPaymentPayload }) =>
      accountingApi.recordVehicleDebtPayment(deliveryVehicleId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountingKeys.vehicleDebts(customerType) });
      queryClient.invalidateQueries({ queryKey: accountingKeys.vehicleDebtPayments(customerType) });
      toast.success('Đã ghi nhận tiền trả');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Lỗi khi ghi nhận tiền trả'),
  });
}

export function useRecordVehicleDebtPayments(customerType: VehicleDebtCustomerType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (items: Array<RecordVehicleDebtPaymentPayload & { delivery_vehicle_id: string }>) =>
      accountingApi.recordVehicleDebtPayments(items),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: accountingKeys.vehicleDebts(customerType) });
      queryClient.invalidateQueries({ queryKey: accountingKeys.vehicleDebtPayments(customerType) });
      toast.success(`Đã ghi nhận ${data.length} khoản trả tiền`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Lỗi khi ghi nhận tiền trả'),
  });
}

export function useUpdateVehicleDebtPayment(customerType: VehicleDebtCustomerType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RecordVehicleDebtPaymentPayload }) =>
      accountingApi.updateVehicleDebtPayment(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountingKeys.vehicleDebts(customerType) });
      queryClient.invalidateQueries({ queryKey: accountingKeys.vehicleDebtPayments(customerType) });
      toast.success('Đã cập nhật lịch sử nhập tiền');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Lỗi khi cập nhật lịch sử nhập tiền'),
  });
}
