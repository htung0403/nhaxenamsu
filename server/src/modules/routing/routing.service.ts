import axios from 'axios';
import { env } from '../../config/env';

type Coordinate = {
  latitude: number;
  longitude: number;
};

export type DirectionsInput = {
  origin: Coordinate;
  destination: Coordinate;
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

type CacheEntry = {
  expiresAt: number;
  result: Omit<DirectionsResult, 'cached'>;
};

const ROUTE_CACHE_TTL_MS = 30 * 60 * 1000;
const routeCache = new Map<string, CacheEntry>();

const roundCoordinate = (value: number) => Math.round(value * 10_000) / 10_000;

const cacheKeyFor = (input: DirectionsInput) =>
  [
    roundCoordinate(input.origin.latitude),
    roundCoordinate(input.origin.longitude),
    roundCoordinate(input.destination.latitude),
    roundCoordinate(input.destination.longitude),
  ].join(',');

const assertCoordinate = (point: Coordinate, label: string) => {
  if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) {
    throw new Error(`${label} latitude không hợp lệ`);
  }
  if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
    throw new Error(`${label} longitude không hợp lệ`);
  }
};

const compactCache = () => {
  const now = Date.now();
  for (const [key, value] of routeCache.entries()) {
    if (value.expiresAt <= now) routeCache.delete(key);
  }
};

const describeManeuver = (step: any) => {
  const maneuver = step?.maneuver || {};
  const roadName = step?.name ? ` vào ${step.name}` : '';
  const modifier = maneuver.modifier ? ` ${maneuver.modifier}` : '';

  switch (maneuver.type) {
    case 'depart':
      return `Bắt đầu${roadName}`;
    case 'arrive':
      return 'Đến điểm giao';
    case 'turn':
      return `Rẽ${modifier}${roadName}`;
    case 'new name':
      return `Tiếp tục${roadName}`;
    case 'roundabout':
    case 'rotary':
      return `Đi vào vòng xoay${roadName}`;
    case 'merge':
      return `Nhập làn${roadName}`;
    case 'fork':
      return `Rẽ nhánh${modifier}${roadName}`;
    case 'end of road':
      return `Cuối đường rẽ${modifier}${roadName}`;
    case 'continue':
      return `Đi tiếp${roadName}`;
    default:
      return roadName ? `Đi theo${roadName}` : 'Đi tiếp';
  }
};

export class RoutingService {
  static async getDirections(input: DirectionsInput): Promise<DirectionsResult> {
    assertCoordinate(input.origin, 'Điểm đi');
    assertCoordinate(input.destination, 'Điểm đến');

    compactCache();
    const cacheKey = cacheKeyFor(input);
    const cached = routeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, cached: true };
    }

    const baseUrl = env.OSRM_BASE_URL.replace(/\/+$/, '');
    const coordinates = `${input.origin.longitude},${input.origin.latitude};${input.destination.longitude},${input.destination.latitude}`;
    const url = `${baseUrl}/route/v1/driving/${coordinates}`;

    const response = await axios.get(url, {
      params: {
        overview: 'full',
        geometries: 'geojson',
        steps: 'true',
      },
      timeout: 10_000,
    });

    const route = response.data?.routes?.[0];
    if (!route) throw new Error('Không tìm được đường đi phù hợp');

    const geometry = (route.geometry?.coordinates || []).map(([longitude, latitude]: [number, number]) => [
      latitude,
      longitude,
    ]) as [number, number][];

    const steps = (route.legs || [])
      .flatMap((leg: any) => leg.steps || [])
      .map((step: any) => ({
        instruction: describeManeuver(step),
        distanceMeters: Math.round(Number(step.distance || 0)),
        durationSeconds: Math.round(Number(step.duration || 0)),
        name: step.name || undefined,
      }))
      .filter((step: RouteStep) => step.distanceMeters > 0 || step.instruction === 'Đến điểm giao');

    const result: Omit<DirectionsResult, 'cached'> = {
      provider: 'osrm',
      distanceMeters: Math.round(Number(route.distance || 0)),
      durationSeconds: Math.round(Number(route.duration || 0)),
      geometry,
      steps,
    };

    routeCache.set(cacheKey, {
      expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
      result,
    });

    return { ...result, cached: false };
  }
}
