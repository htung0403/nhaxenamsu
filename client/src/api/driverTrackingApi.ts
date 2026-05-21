import axiosClient from './axiosClient';

export type DriverMapStatus = 'online' | 'offline' | 'dang_giao';

export type DriverLocation = {
  driverId: string;
  driverName: string;
  vehicleId: string | null;
  licensePlate: string | null;
  currentDeliveryVehicleId: string | null;
  currentDeliveryOrderId: string | null;
  currentDeliveryProduct: string | null;
  destinationName: string | null;
  destinationAddress: string | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speedMps: number | null;
  heading: number | null;
  batteryLevel: number | null;
  status: DriverMapStatus;
  isDelivering: boolean;
  recordedAt: string;
  updatedAt: string;
};

export type DriverLocationHistoryPoint = {
  id: string;
  driverId: string;
  vehicleId: string | null;
  deliveryVehicleId: string | null;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speedMps: number | null;
  heading: number | null;
  recordedAt: string;
};

export type DriverTrackingConfig = {
  realtimeEnabled: boolean;
  pollingIntervalMs: number;
  offlineAfterSeconds: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export type DriverTrackingHealth = {
  updatesLastMinute: number;
  onlineDrivers: number;
  historyRowsToday: number;
  realtimeEnabled: boolean;
  egressPercent: number;
  fallbackRecommended: boolean;
  fallbackRule: string;
  counters: {
    acceptedUpdates: number;
    skippedUpdates: number;
    rateLimitRejected: number;
    endpointErrors: number;
    startedAt: string;
  };
};

export const driverTrackingApi = {
  getLatest: async () => {
    const { data } = await axiosClient.get<DriverLocation[]>('/driver-tracking/latest');
    return data;
  },

  getConfig: async () => {
    const { data } = await axiosClient.get<DriverTrackingConfig>('/driver-tracking/config');
    return data;
  },

  getHealth: async () => {
    const { data } = await axiosClient.get<DriverTrackingHealth>('/driver-tracking/health');
    return data;
  },

  getHistory: async (
    driverId: string,
    params?: { from?: string; to?: string; deliveryVehicleId?: string; limit?: number },
  ) => {
    const { data } = await axiosClient.get<DriverLocationHistoryPoint[]>(
      `/driver-tracking/${driverId}/history`,
      { params },
    );
    return data;
  },
};
