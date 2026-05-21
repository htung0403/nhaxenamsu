import axiosClient from './axiosClient';

export type RoutingCoordinate = {
  latitude: number;
  longitude: number;
};

export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  name?: string;
};

export type DirectionsResult = {
  provider: 'osrm';
  cached: boolean;
  distanceMeters: number;
  durationSeconds: number;
  geometry: [number, number][];
  steps: RouteStep[];
};

export const routingApi = {
  getDirections: async (origin: RoutingCoordinate, destination: RoutingCoordinate) => {
    const { data } = await axiosClient.post<DirectionsResult>('/routing/directions', {
      origin,
      destination,
    });
    return data;
  },
};
