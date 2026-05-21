import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, RefreshCw, Route, Satellite, Wifi, WifiOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/shared/PageHeader';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { driverTrackingApi, type DriverLocation, type DriverLocationHistoryPoint, type DriverMapStatus } from '../../api/driverTrackingApi';
import { getDriverMapSupabase } from '../../lib/driverMapSupabase';

const DEFAULT_CENTER: [number, number] = [10.7769, 106.7009];
const STATUS_LABELS: Record<DriverMapStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  dang_giao: 'Đang giao',
};

const STATUS_COLORS: Record<DriverMapStatus, string> = {
  online: '#10b981',
  offline: '#94a3b8',
  dang_giao: '#f97316',
};

type LatestRealtimeRow = {
  driver_id: string;
  vehicle_id: string | null;
  current_delivery_vehicle_id: string | null;
  latitude: number | string;
  longitude: number | string;
  accuracy_m: number | string | null;
  speed_mps: number | string | null;
  heading: number | string | null;
  battery_level: number | null;
  status: DriverMapStatus;
  recorded_at: string;
  updated_at: string;
};

const toNumberOrNull = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatLastSeen = (value: string) => {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s trước`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  return `${Math.round(minutes / 60)} giờ trước`;
};

const createDriverIcon = (status: DriverMapStatus) =>
  L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:${STATUS_COLORS[status]};border:3px solid white;box-shadow:0 8px 20px rgba(15,23,42,.25)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

const customerIcon = L.divIcon({
  className: '',
  html: '<div style="width:26px;height:26px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 8px 20px rgba(15,23,42,.25);display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:900">🏠</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const FocusDriver: React.FC<{ location?: DriverLocation }> = ({ location }) => {
  const map = useMap();

  useEffect(() => {
    if (location) {
      map.flyTo([location.latitude, location.longitude], Math.max(map.getZoom(), 14), { duration: 0.8 });
    }
  }, [location, map]);

  return null;
};

const normalizeRealtimeLocation = (row: LatestRealtimeRow, existing?: DriverLocation): DriverLocation => ({
  driverId: row.driver_id,
  driverName: existing?.driverName || 'Tài xế',
  vehicleId: row.vehicle_id,
  licensePlate: existing?.licensePlate || null,
  currentDeliveryVehicleId: row.current_delivery_vehicle_id,
  currentDeliveryOrderId: existing?.currentDeliveryOrderId || null,
  currentDeliveryProduct: existing?.currentDeliveryProduct || null,
  destinationName: existing?.destinationName || null,
  destinationAddress: existing?.destinationAddress || null,
  destinationLatitude: existing?.destinationLatitude || null,
  destinationLongitude: existing?.destinationLongitude || null,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  accuracyM: toNumberOrNull(row.accuracy_m),
  speedMps: toNumberOrNull(row.speed_mps),
  heading: toNumberOrNull(row.heading),
  batteryLevel: row.battery_level,
  status: row.status,
  isDelivering: row.status === 'dang_giao',
  recordedAt: row.recorded_at,
  updatedAt: row.updated_at,
});

const DriverMapPage: React.FC = () => {
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [history, setHistory] = useState<DriverLocationHistoryPoint[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(() => !document.hidden);

  const configQuery = useQuery({
    queryKey: ['driver-tracking-config'],
    queryFn: driverTrackingApi.getConfig,
    staleTime: 5 * 60_000,
  });

  const latestQuery = useQuery({
    queryKey: ['driver-locations-latest'],
    queryFn: driverTrackingApi.getLatest,
    refetchInterval: configQuery.data?.realtimeEnabled ? false : configQuery.data?.pollingIntervalMs || 20_000,
  });

  useEffect(() => {
    if (latestQuery.data) {
      setLocations(latestQuery.data);
    }
  }, [latestQuery.data]);

  useEffect(() => {
    const handleVisibility = () => {
      const visible = !document.hidden;
      setIsPageVisible(visible);
      if (visible) {
        void latestQuery.refetch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [latestQuery]);

  useEffect(() => {
    if (!isPageVisible) {
      setRealtimeActive(false);
      return;
    }

    const config = configQuery.data;
    if (!config?.realtimeEnabled) {
      setRealtimeActive(false);
      return;
    }

    const supabase = getDriverMapSupabase(config.supabaseUrl, config.supabaseAnonKey);
    if (!supabase) {
      setRealtimeActive(false);
      return;
    }

    const channel = supabase
      .channel('driver-map-latest')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations_latest' },
        (payload) => {
          const row = payload.new as LatestRealtimeRow;
          if (!row?.driver_id) return;

          setLocations((current) => {
            const existing = current.find((item) => item.driverId === row.driver_id);
            const nextLocation = normalizeRealtimeLocation(row, existing);
            const others = current.filter((item) => item.driverId !== row.driver_id);
            return [nextLocation, ...others].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          });
        },
      )
      .subscribe((status) => {
        setRealtimeActive(status === 'SUBSCRIBED');
      });

    return () => {
      void supabase.removeChannel(channel);
      setRealtimeActive(false);
    };
  }, [configQuery.data, isPageVisible]);

  const selectedLocation = useMemo(
    () => locations.find((location) => location.driverId === selectedDriverId),
    [locations, selectedDriverId],
  );

  const center = useMemo<[number, number]>(() => {
    const first = selectedLocation || locations[0];
    return first ? [first.latitude, first.longitude] : DEFAULT_CENTER;
  }, [locations, selectedLocation]);

  const onlineCount = locations.filter((location) => location.status !== 'offline').length;
  const deliveringCount = locations.filter((location) => location.status === 'dang_giao').length;
  const destinationPins = locations.filter(
    (location) =>
      location.status === 'dang_giao' &&
      location.destinationLatitude !== null &&
      location.destinationLongitude !== null,
  );

  const loadHistory = async (driverId: string) => {
    setSelectedDriverId(driverId);
    setIsHistoryLoading(true);
    try {
      const from = new Date(Date.now() - 60 * 60_000).toISOString();
      const points = await driverTrackingApi.getHistory(driverId, { from, limit: 500 });
      setHistory(points);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  if (latestQuery.isError || configQuery.isError) {
    return <ErrorState message="Không tải được dữ liệu bản đồ tài xế" onRetry={() => void latestQuery.refetch()} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Bản đồ tài xế" description="Theo dõi vị trí tài xế giao hàng theo thời gian thực" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tài xế online</p>
          <p className="mt-2 text-2xl font-black text-foreground">{onlineCount}/{locations.length}</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Đang giao</p>
          <p className="mt-2 text-2xl font-black text-orange-500">{deliveringCount}</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Realtime</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-bold text-foreground">
            {realtimeActive ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-slate-400" />}
            {configQuery.data?.realtimeEnabled ? (realtimeActive ? 'Đang bật' : 'Đang kết nối') : 'Polling 20s'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
        <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <h2 className="font-black text-foreground">Danh sách tài xế</h2>
              <p className="text-xs text-muted-foreground">Chọn tài xế để focus và xem lộ trình 1 giờ gần nhất</p>
            </div>
            <button
              type="button"
              onClick={() => void latestQuery.refetch()}
              className="rounded-2xl border border-border p-2 text-muted-foreground hover:text-foreground"
              title="Tải lại"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-[620px] overflow-y-auto p-3 space-y-2">
            {latestQuery.isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Đang tải vị trí...</div>
            ) : locations.length === 0 ? (
              <EmptyState icon={<MapPin className="w-7 h-7 text-muted-foreground/40" />} title="Chưa có vị trí" description="Tài xế sẽ xuất hiện khi app gửi location đầu tiên." />
            ) : (
              locations.map((location) => (
                <button
                  key={location.driverId}
                  type="button"
                  onClick={() => void loadHistory(location.driverId)}
                  className={`w-full rounded-3xl border p-4 text-left transition-all ${
                    selectedDriverId === location.driverId
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-foreground">{location.driverName}</p>
                      <p className="text-xs text-muted-foreground">{location.licensePlate || 'Chưa gán xe'}</p>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                      style={{ backgroundColor: STATUS_COLORS[location.status] }}
                    >
                      {STATUS_LABELS[location.status]}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <p>Last seen: {formatLastSeen(location.updatedAt)}</p>
                    <p>Đơn: {location.currentDeliveryProduct || 'Không có đơn active'}</p>
                    {location.destinationAddress && <p>Địa chỉ: {location.destinationAddress}</p>}
                    <p>Pin: {location.batteryLevel ?? '-'}% • Sai số: {location.accuracyM ?? '-'}m</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <h2 className="font-black text-foreground">Map realtime</h2>
              <p className="text-xs text-muted-foreground">OSM tiles • latest realtime • history fetch theo nhu cầu</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <Route className="w-4 h-4" />
              {isHistoryLoading ? 'Đang tải lộ trình...' : `${history.length} điểm lịch sử`}
            </div>
          </div>

          <div className="h-[680px]">
            <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FocusDriver location={selectedLocation} />
              {locations.map((location) => (
                <Marker
                  key={location.driverId}
                  position={[location.latitude, location.longitude]}
                  icon={createDriverIcon(location.status)}
                  eventHandlers={{
                    click: () => void loadHistory(location.driverId),
                  }}
                >
                  <Popup>
                    <div className="min-w-[180px]">
                      <p className="font-bold">{location.driverName}</p>
                      <p>{location.licensePlate || 'Chưa gán xe'}</p>
                      <p>{STATUS_LABELS[location.status]} • {formatLastSeen(location.updatedAt)}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {destinationPins.map((location) => (
                <Marker
                  key={`destination-${location.driverId}`}
                  position={[location.destinationLatitude as number, location.destinationLongitude as number]}
                  icon={customerIcon}
                >
                  <Popup>
                    <div className="min-w-[220px]">
                      <p className="font-bold">{location.destinationName || 'Khách hàng'}</p>
                      <p>{location.destinationAddress || 'Chưa có địa chỉ'}</p>
                      <p className="mt-1 text-xs">Tài xế: {location.driverName}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {history.length > 1 && (
                <Polyline
                  pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.75 }}
                  positions={history.map((point) => [point.latitude, point.longitude])}
                />
              )}
            </MapContainer>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <Satellite className="mt-0.5 w-4 h-4" />
          <p>
            Fallback đã định nghĩa: nếu egress vượt 80% quota tháng trước ngày 20, tắt realtime bằng
            {' '}<code>DRIVER_MAP_REALTIME_ENABLED=false</code>; trang này tự chuyển sang polling 20s.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DriverMapPage;
