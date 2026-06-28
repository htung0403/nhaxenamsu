import { useQuery } from '@tanstack/react-query';
import { accountingApi } from '../../api/accountingApi';
import type { VehicleDebtCustomerType } from '../../api/accountingApi';

export const accountingKeys = {
  all: ['accounting'] as const,
  vehicleDebts: (customerType: VehicleDebtCustomerType) => [...accountingKeys.all, 'vehicle-debts', customerType] as const,
};

export function useVehicleDebts(customerType: VehicleDebtCustomerType) {
  return useQuery({
    queryKey: accountingKeys.vehicleDebts(customerType),
    queryFn: () => accountingApi.getVehicleDebts(customerType),
  });
}
