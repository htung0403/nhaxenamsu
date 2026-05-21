import axiosClient from './axiosClient';

export type DriverDeliveryAssignmentStatus = 'assigned' | 'in_transit' | 'completed';

export type DriverDeliveryAssignment = {
  id: string;
  deliveryOrderId: string;
  vehicleId: string | null;
  vehicleLicensePlate: string | null;
  driverId: string;
  loaderName: string | null;
  assignedQuantity: number;
  expectedAmount: number;
  imageUrls: string[];
  status: DriverDeliveryAssignmentStatus;
  assignedAt: string;
  order: {
    id: string;
    orderCode: string;
    productName: string;
    totalQuantity: number;
    deliveredQuantity: number;
    status: string;
    deliveryDate?: string | null;
    deliveryTime?: string | null;
    orderCategory?: string | null;
    receiverName?: string | null;
    receiverPhone?: string | null;
    receiverAddress?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
};

export const driverDeliveriesApi = {
  getMyAssignments: async () => {
    const { data } = await axiosClient.get<DriverDeliveryAssignment[]>('/driver-deliveries/my-assignments');
    return data;
  },

  startTrip: async (deliveryVehicleIds: string[]) => {
    const { data } = await axiosClient.post<DriverDeliveryAssignment[]>('/driver-deliveries/start-trip', {
      deliveryVehicleIds,
    });
    return data;
  },

  completeAssignment: async (deliveryVehicleId: string, imageUrls: string[]) => {
    const { data } = await axiosClient.post<DriverDeliveryAssignment[]>(`/driver-deliveries/${deliveryVehicleId}/complete`, {
      image_urls: imageUrls,
    });
    return data;
  },
};
