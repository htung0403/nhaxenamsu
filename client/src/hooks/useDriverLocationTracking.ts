import { useEffect, useRef, useState } from 'react';
import axiosClient from '../api/axiosClient';

type TrackingState = {
  isSupported: boolean;
  permissionError: string | null;
  lastSentAt: string | null;
  currentLocation: { latitude: number; longitude: number } | null;
};

const MIN_SEND_INTERVAL_MS = 10_000;
const MIN_DISTANCE_METERS = 20;

const distanceMeters = (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export function useDriverLocationTracking(enabled: boolean) {
  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ latitude: number; longitude: number; sentAt: number } | null>(null);
  const [state, setState] = useState<TrackingState>({
    isSupported: typeof navigator !== 'undefined' && 'geolocation' in navigator,
    permissionError: null,
    lastSentAt: null,
    currentLocation: null,
  });

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      setState((prev) => ({ ...prev, isSupported: false, permissionError: 'Trình duyệt không hỗ trợ GPS' }));
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const lastPoint = lastPointRef.current;

        if (lastPoint) {
          if (now - lastPoint.sentAt < MIN_SEND_INTERVAL_MS) return;

          const movedMeters = distanceMeters(lastPoint.latitude, lastPoint.longitude, latitude, longitude);
          if (movedMeters < MIN_DISTANCE_METERS) return;
        }

        try {
          await axiosClient.post('/driver-tracking/location', {
            latitude,
            longitude,
            accuracy_m: position.coords.accuracy,
            speed_mps: position.coords.speed ?? undefined,
            heading: position.coords.heading ?? undefined,
            recorded_at: new Date(position.timestamp || now).toISOString(),
            status: 'dang_giao',
          });

          lastPointRef.current = { latitude, longitude, sentAt: now };
          setState((prev) => ({
            ...prev,
            permissionError: null,
            lastSentAt: new Date(now).toISOString(),
            currentLocation: { latitude, longitude },
          }));
        } catch {
          // Keep tracking; backend may skip/rate-limit occasional points.
        }
      },
      (error) => {
        setState((prev) => ({ ...prev, permissionError: error.message || 'Không lấy được vị trí GPS' }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 15_000,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled]);

  return state;
}
