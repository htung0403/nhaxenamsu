import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { driverDeliveriesApi } from '../../api/driverDeliveriesApi';

export const driverDeliveryKeys = {
  all: ['driver-deliveries'] as const,
  mine: () => [...driverDeliveryKeys.all, 'mine'] as const,
};

export function useMyDriverAssignments(enabled = true) {
  return useQuery({
    queryKey: driverDeliveryKeys.mine(),
    queryFn: driverDeliveriesApi.getMyAssignments,
    enabled,
    refetchInterval: 30_000,
  });
}

export function useStartDriverTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: driverDeliveriesApi.startTrip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: driverDeliveryKeys.all });
      queryClient.invalidateQueries({ queryKey: ['driver-locations-latest'] });
      toast.success('Đã bắt đầu chuyến giao');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Không thể bắt đầu chuyến giao'),
  });
}

export function useCompleteDriverDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deliveryVehicleId, imageUrls }: { deliveryVehicleId: string; imageUrls: string[] }) =>
      driverDeliveriesApi.completeAssignment(deliveryVehicleId, imageUrls),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: driverDeliveryKeys.all });
      queryClient.invalidateQueries({ queryKey: ['driver-locations-latest'] });
      toast.success('Đã xác nhận giao thành công');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Không thể xác nhận giao hàng'),
  });
}
