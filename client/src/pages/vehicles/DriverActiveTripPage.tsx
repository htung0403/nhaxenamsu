import React, { useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Clock3,
  Info,
  Loader2,
  LocateFixed,
  MapPinned,
  Navigation2,
  PackageCheck,
  RefreshCw,
  Route,
} from 'lucide-react';
import toast from 'react-hot-toast';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { uploadApi } from '../../api/uploadApi';
import { routingApi, type DirectionsResult, type RouteStep } from '../../api/routingApi';
import type { DriverDeliveryAssignment } from '../../api/driverDeliveriesApi';
import { useCompleteDriverDelivery, useMyDriverAssignments } from '../../hooks/queries/useDriverDeliveries';
import { useDriverLocationTracking } from '../../hooks/useDriverLocationTracking';

const DEFAULT_CENTER: [number, number] = [10.7769, 106.7009];

const destinationIcon = L.divIcon({
  className: '',
  html: '<div style="width:34px;height:34px;border-radius:9999px;background:#2563eb;border:4px solid white;box-shadow:0 10px 24px rgba(15,23,42,.28);display:flex;align-items:center;justify-content:center;color:white;font-size:17px;font-weight:900">🏠</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const driverIcon = L.divIcon({
  className: '',
  html: '<div style="width:32px;height:32px;border-radius:9999px;background:#f97316;border:4px solid white;box-shadow:0 10px 24px rgba(15,23,42,.28);display:flex;align-items:center;justify-content:center;color:white;font-size:16px;font-weight:900">🚚</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const hasCoordinates = (assignment: DriverDeliveryAssignment) =>
  assignment.order.latitude !== null &&
  assignment.order.latitude !== undefined &&
  assignment.order.longitude !== null &&
  assignment.order.longitude !== undefined;

const formatDistance = (meters: number) => {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
};

const formatDuration = (seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} giờ${remainingMinutes ? ` ${remainingMinutes} phút` : ''}`;
};

const FocusMap: React.FC<{
  assignment: DriverDeliveryAssignment | null;
  routeGeometry?: [number, number][];
  driverLocation?: { latitude: number; longitude: number } | null;
}> = ({ assignment, routeGeometry, driverLocation }) => {
  const map = useMap();

  React.useEffect(() => {
    if (routeGeometry && routeGeometry.length > 1) {
      map.fitBounds(routeGeometry, { padding: [46, 46] });
      return;
    }

    if (driverLocation && assignment && hasCoordinates(assignment)) {
      map.fitBounds(
        [
          [driverLocation.latitude, driverLocation.longitude],
          [assignment.order.latitude as number, assignment.order.longitude as number],
        ],
        { padding: [46, 46] },
      );
      return;
    }

    if (assignment && hasCoordinates(assignment)) {
      map.flyTo([assignment.order.latitude as number, assignment.order.longitude as number], Math.max(map.getZoom(), 15), {
        duration: 0.6,
      });
    }
  }, [assignment, driverLocation, map, routeGeometry]);

  return null;
};

const getPrimaryStep = (route: DirectionsResult | null): RouteStep | null => {
  if (!route?.steps.length) return null;
  return route.steps.find((step) => step.distanceMeters > 0) || route.steps[0];
};

const DriverActiveTripPage: React.FC = () => {
  const { data: assignments = [], isLoading, isError, refetch } = useMyDriverAssignments();
  const completeDelivery = useCompleteDriverDelivery();
  const inTransitAssignments = assignments.filter((assignment) => assignment.status === 'in_transit');
  const trackingState = useDriverLocationTracking(inTransitAssignments.length > 0);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [showOrders, setShowOrders] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeResult, setRouteResult] = useState<DirectionsResult | null>(null);
  const [routeAssignmentId, setRouteAssignmentId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [showRouteDetails, setShowRouteDetails] = useState(false);

  const focusedAssignment = useMemo(
    () => inTransitAssignments.find((assignment) => assignment.id === focusedId) || inTransitAssignments.find(hasCoordinates) || inTransitAssignments[0] || null,
    [focusedId, inTransitAssignments],
  );

  const activeRoute =
    routeResult && routeAssignmentId && focusedAssignment?.id === routeAssignmentId ? routeResult : null;
  const primaryStep = getPrimaryStep(activeRoute);

  const mapCenter = useMemo<[number, number]>(() => {
    if (trackingState.currentLocation) {
      return [trackingState.currentLocation.latitude, trackingState.currentLocation.longitude];
    }
    if (focusedAssignment && hasCoordinates(focusedAssignment)) {
      return [focusedAssignment.order.latitude as number, focusedAssignment.order.longitude as number];
    }
    return DEFAULT_CENTER;
  }, [focusedAssignment, trackingState.currentLocation]);

  const calculateRoute = async () => {
    if (!focusedAssignment || !hasCoordinates(focusedAssignment)) {
      toast.error('Đơn này chưa có tọa độ khách hàng');
      return;
    }

    if (!trackingState.currentLocation) {
      toast.error('Chưa có vị trí GPS hiện tại. Hãy bật quyền vị trí và chờ GPS cập nhật.');
      return;
    }

    setRouteLoading(true);
    try {
      const route = await routingApi.getDirections(trackingState.currentLocation, {
        latitude: focusedAssignment.order.latitude as number,
        longitude: focusedAssignment.order.longitude as number,
      });
      setRouteResult(route);
      setRouteAssignmentId(focusedAssignment.id);
      toast.success(route.cached ? 'Đã lấy đường đi từ cache' : 'Đã tính đường đi');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Không tính được đường đi');
    } finally {
      setRouteLoading(false);
    }
  };

  const uploadAndComplete = async (assignment: DriverDeliveryAssignment, files: FileList | null) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    setUploadingId(assignment.id);
    try {
      const uploads = await Promise.all(
        selectedFiles.map((file) => uploadApi.uploadFile(file, 'delivery-confirmations', 'delivery-confirmations')),
      );
      await completeDelivery.mutateAsync({
        deliveryVehicleId: assignment.id,
        imageUrls: uploads.map((upload) => upload.url),
      });
      void refetch();
    } finally {
      setUploadingId(null);
    }
  };

  if (isError) {
    return <ErrorState message="Không tải được chuyến đang giao" onRetry={() => void refetch()} />;
  }

  if (!isLoading && inTransitAssignments.length === 0) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <EmptyState
          icon={<PackageCheck className="h-7 w-7 text-muted-foreground/40" />}
          title="Chưa có chuyến đang giao"
          description="Sau khi bấm Bắt đầu giao, màn hình chỉ dẫn sẽ hiển thị tại đây."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950">
      <div className="relative z-[1200] border-b border-white/10 bg-slate-950 px-4 py-3 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300">Đang giao</p>
            <h1 className="truncate text-xl font-black">{focusedAssignment?.order.receiverName || 'Điểm giao'}</h1>
            <p className="truncate text-xs text-slate-300">{focusedAssignment?.order.receiverAddress || 'Chưa có địa chỉ'}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowOrders((value) => !value)}
            className="flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-xs font-black text-white"
          >
            <Info className="h-4 w-4" />
            Hàng
            {showOrders ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Số điểm</p>
            <p className="text-lg font-black">{inTransitAssignments.length}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">GPS</p>
            <p className="truncate text-sm font-black">{trackingState.lastSentAt ? 'Đang bật' : 'Đang chờ'}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Tuyến</p>
            <p className="truncate text-sm font-black">{activeRoute ? formatDistance(activeRoute.distanceMeters) : 'Chưa tính'}</p>
          </div>
        </div>
      </div>

      <div className="relative z-0 min-h-0 flex-1 overflow-hidden">
        {showOrders && (
          <div className="absolute inset-x-3 top-3 z-[2000] max-h-[34dvh] overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-3 shadow-2xl">
            <div className="space-y-2">
              {inTransitAssignments.map((assignment) => (
                <button
                  key={assignment.id}
                  type="button"
                  onClick={() => {
                    setFocusedId(assignment.id);
                    setShowOrders(false);
                  }}
                  className={`w-full rounded-2xl border p-3 text-left ${
                    focusedAssignment?.id === assignment.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-950">{assignment.order.productName}</p>
                      <p className="text-xs font-semibold text-slate-500">#{assignment.order.orderCode} • SL {assignment.assignedQuantity}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">{assignment.order.receiverAddress || 'Chưa có địa chỉ'}</p>
                    </div>
                    <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-black text-orange-700">Đang giao</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <MapContainer center={mapCenter} zoom={14} className="relative z-0 h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FocusMap assignment={focusedAssignment} routeGeometry={activeRoute?.geometry} driverLocation={trackingState.currentLocation} />
          {trackingState.currentLocation && (
            <Marker position={[trackingState.currentLocation.latitude, trackingState.currentLocation.longitude]} icon={driverIcon}>
              <Popup>Vị trí hiện tại</Popup>
            </Marker>
          )}
          {focusedAssignment && hasCoordinates(focusedAssignment) && (
            <Marker
              position={[focusedAssignment.order.latitude as number, focusedAssignment.order.longitude as number]}
              icon={destinationIcon}
            >
              <Popup>{focusedAssignment.order.receiverName || 'Khách hàng'}</Popup>
            </Marker>
          )}
          {activeRoute?.geometry && activeRoute.geometry.length > 1 && (
            <Polyline positions={activeRoute.geometry} pathOptions={{ color: '#2563eb', weight: 6, opacity: 0.9 }} />
          )}
        </MapContainer>

        <div className="pointer-events-none absolute inset-x-3 bottom-[76px] z-[1100] space-y-2 lg:bottom-3">
          <div className="pointer-events-auto max-h-[34dvh] overflow-y-auto rounded-[20px] border border-slate-200 bg-white/95 p-2.5 shadow-2xl backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Navigation2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bước tiếp theo</p>
                <p className="line-clamp-1 text-sm font-black leading-snug text-slate-950">
                  {primaryStep ? primaryStep.instruction : 'Bấm chỉ đường để bắt đầu dẫn tuyến'}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-600">
                  {primaryStep && (
                    <span className="flex items-center gap-1">
                      <MapPinned className="h-4 w-4" />
                      {formatDistance(primaryStep.distanceMeters)}
                    </span>
                  )}
                  {activeRoute && (
                    <span className="flex items-center gap-1">
                      <Clock3 className="h-4 w-4" />
                      {formatDuration(activeRoute.durationSeconds)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {activeRoute?.steps.length ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowRouteDetails((value) => !value)}
                  className="mt-2 flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-800"
                >
                  <span>{showRouteDetails ? 'Ẩn các bước chỉ dẫn' : `Xem ${activeRoute.steps.length} bước chỉ dẫn`}</span>
                  {showRouteDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {showRouteDetails && (
                  <div className="mt-2 max-h-24 overflow-y-auto rounded-xl bg-slate-50 p-2">
                    <ol className="space-y-1.5 text-xs text-slate-700">
                      {activeRoute.steps.slice(0, 8).map((step, index) => (
                        <li key={`${step.instruction}-${index}`} className="flex gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-black">
                            {index + 1}
                          </span>
                          <span>
                            <span className="font-bold text-slate-900">{step.instruction}</span>
                            <span className="text-slate-500"> • {formatDistance(step.distanceMeters)}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            ) : null}

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void calculateRoute()}
                disabled={routeLoading || !focusedAssignment || !hasCoordinates(focusedAssignment)}
                className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {routeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
                Chỉ đường
              </button>
              <button
                type="button"
                onClick={() => void refetch()}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
                Làm mới
              </button>
            </div>

            {focusedAssignment && (
              <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
                {uploadingId === focusedAssignment.id || completeDelivery.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                Tải ảnh & xác nhận giao xong
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploadingId === focusedAssignment.id || completeDelivery.isPending}
                  onChange={(event) => void uploadAndComplete(focusedAssignment, event.target.files)}
                />
              </label>
            )}
          </div>

          {trackingState.permissionError && (
            <div className="pointer-events-auto rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-xl">
              {trackingState.permissionError}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            if (trackingState.currentLocation) {
              setRouteResult(null);
              setRouteAssignmentId(null);
            }
          }}
          className="absolute right-3 top-3 z-[1000] flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-xl"
        >
          <LocateFixed className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default DriverActiveTripPage;
