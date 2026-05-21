import React, { useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Camera, Loader2, MapPinned, Navigation, PackageCheck, Play, RefreshCw, Route, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/shared/PageHeader';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { useCompleteDriverDelivery, useMyDriverAssignments, useStartDriverTrip } from '../../hooks/queries/useDriverDeliveries';
import { useDriverLocationTracking } from '../../hooks/useDriverLocationTracking';
import { uploadApi } from '../../api/uploadApi';
import { routingApi, type DirectionsResult } from '../../api/routingApi';
import type { DriverDeliveryAssignment } from '../../api/driverDeliveriesApi';

const DEFAULT_CENTER: [number, number] = [10.7769, 106.7009];

const destinationIcon = L.divIcon({
  className: '',
  html: '<div style="width:28px;height:28px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 8px 20px rgba(15,23,42,.25);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:900">🏠</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const driverIcon = L.divIcon({
  className: '',
  html: '<div style="width:26px;height:26px;border-radius:9999px;background:#f97316;border:3px solid white;box-shadow:0 8px 20px rgba(15,23,42,.25);display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:900">🚚</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const FocusMap: React.FC<{
  assignment?: DriverDeliveryAssignment | null;
  routeGeometry?: [number, number][];
}> = ({ assignment, routeGeometry }) => {
  const map = useMap();
  React.useEffect(() => {
    if (routeGeometry && routeGeometry.length > 1) {
      map.fitBounds(routeGeometry, { padding: [40, 40] });
      return;
    }

    const latitude = assignment?.order.latitude;
    const longitude = assignment?.order.longitude;
    if (latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
      map.flyTo([latitude, longitude], Math.max(map.getZoom(), 15), { duration: 0.7 });
    }
  }, [assignment, map, routeGeometry]);
  return null;
};

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

const AssignmentCard: React.FC<{
  assignment: DriverDeliveryAssignment;
  selected: boolean;
  canSelect: boolean;
  completing: boolean;
  onToggle: () => void;
  onFocus: () => void;
  onUploadComplete: (assignment: DriverDeliveryAssignment, files: FileList | null) => void;
}> = ({ assignment, selected, canSelect, completing, onToggle, onFocus, onUploadComplete }) => {
  const isInTransit = assignment.status === 'in_transit';

  return (
    <div className={`rounded-3xl border bg-card p-4 shadow-sm ${isInTransit ? 'border-orange-300' : 'border-border'}`}>
      <div className="flex items-start gap-3">
        {canSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="mt-1 h-4 w-4 rounded border-border text-primary"
          />
        )}
        <button type="button" onClick={onFocus} className="min-w-0 flex-1 text-left">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-black text-foreground">{assignment.order.productName}</p>
              <p className="text-xs text-muted-foreground">#{assignment.order.orderCode} • SL {assignment.assignedQuantity}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${isInTransit ? 'bg-orange-500' : 'bg-slate-500'}`}>
              {isInTransit ? 'Đang giao' : 'Chờ giao'}
            </span>
          </div>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>Khách: {assignment.order.receiverName || '-'}</p>
            <p>Địa chỉ: {assignment.order.receiverAddress || '-'}</p>
            <p>Xe: {assignment.vehicleLicensePlate || '-'} • Tiền dự kiến: {assignment.expectedAmount.toLocaleString('vi-VN')}</p>
            {!hasCoordinates(assignment) && <p className="font-semibold text-amber-600">Chưa có tọa độ khách hàng</p>}
          </div>
        </button>
      </div>

      {isInTransit && (
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
          {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Tải ảnh & xác nhận giao xong
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={completing}
            onChange={(event) => onUploadComplete(assignment, event.target.files)}
          />
        </label>
      )}
    </div>
  );
};

const DriverDeliveriesPage: React.FC = () => {
  const { data: assignments = [], isLoading, isError, refetch } = useMyDriverAssignments();
  const startTrip = useStartDriverTrip();
  const completeDelivery = useCompleteDriverDelivery();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeResult, setRouteResult] = useState<DirectionsResult | null>(null);
  const [routeAssignmentId, setRouteAssignmentId] = useState<string | null>(null);

  const waitingAssignments = assignments.filter((assignment) => assignment.status === 'assigned');
  const inTransitAssignments = assignments.filter((assignment) => assignment.status === 'in_transit');
  const trackingState = useDriverLocationTracking(inTransitAssignments.length > 0);

  const focusedAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === focusedId) || inTransitAssignments[0] || waitingAssignments[0] || null,
    [assignments, focusedId, inTransitAssignments, waitingAssignments],
  );

  const activeRoute =
    routeResult && routeAssignmentId && focusedAssignment?.id === routeAssignmentId ? routeResult : null;

  const mapCenter = useMemo<[number, number]>(() => {
    if (focusedAssignment && hasCoordinates(focusedAssignment)) {
      return [focusedAssignment.order.latitude as number, focusedAssignment.order.longitude as number];
    }
    const firstWithCoordinates = assignments.find(hasCoordinates);
    return firstWithCoordinates
      ? [firstWithCoordinates.order.latitude as number, firstWithCoordinates.order.longitude as number]
      : DEFAULT_CENTER;
  }, [assignments, focusedAssignment]);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStartTrip = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    await startTrip.mutateAsync(ids);
    setSelectedIds(new Set());
  };

  const handleUploadComplete = async (assignment: DriverDeliveryAssignment, files: FileList | null) => {
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

  const handleCalculateRoute = async () => {
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

  if (isError) {
    return <ErrorState message="Không tải được danh sách chuyến giao" onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Chuyến giao của tôi" description="Chọn đơn chờ giao, bắt đầu chuyến và xác nhận giao thành công" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Chờ giao</p>
          <p className="mt-2 text-2xl font-black text-foreground">{waitingAssignments.length}</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Đang giao</p>
          <p className="mt-2 text-2xl font-black text-orange-500">{inTransitAssignments.length}</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">GPS</p>
          <p className="mt-2 text-sm font-bold text-foreground">
            {inTransitAssignments.length > 0 ? 'Đang bật' : 'Chưa bật'}
            {trackingState.lastSentAt ? ` • ${new Date(trackingState.lastSentAt).toLocaleTimeString('vi-VN')}` : ''}
          </p>
          {trackingState.permissionError && <p className="mt-1 text-xs text-red-500">{trackingState.permissionError}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5">
        <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <h2 className="font-black text-foreground">Đơn giao</h2>
              <p className="text-xs text-muted-foreground">Chọn nhiều đơn chờ giao để bắt đầu cùng chuyến</p>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-2xl border border-border p-2 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[700px] overflow-y-auto p-3 space-y-4">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Đang tải đơn giao...</div>
            ) : assignments.length === 0 ? (
              <EmptyState icon={<PackageCheck className="h-7 w-7 text-muted-foreground/40" />} title="Không có đơn giao" description="Các đơn đã gán cho bạn sẽ xuất hiện tại đây." />
            ) : (
              <>
                {inTransitAssignments.length > 0 && (
                  <div className="space-y-2">
                    <p className="px-1 text-xs font-black uppercase tracking-widest text-orange-500">Đang giao</p>
                    {inTransitAssignments.map((assignment) => (
                      <AssignmentCard
                        key={assignment.id}
                        assignment={assignment}
                        selected={false}
                        canSelect={false}
                        completing={uploadingId === assignment.id || completeDelivery.isPending}
                        onToggle={() => undefined}
                        onFocus={() => setFocusedId(assignment.id)}
                        onUploadComplete={handleUploadComplete}
                      />
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <p className="px-1 text-xs font-black uppercase tracking-widest text-muted-foreground">Chờ giao</p>
                  {waitingAssignments.map((assignment) => (
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      selected={selectedIds.has(assignment.id)}
                      canSelect
                      completing={false}
                      onToggle={() => toggleSelected(assignment.id)}
                      onFocus={() => setFocusedId(assignment.id)}
                      onUploadComplete={handleUploadComplete}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {waitingAssignments.length > 0 && (
            <div className="border-t border-border bg-card p-4">
              <button
                type="button"
                onClick={() => void handleStartTrip()}
                disabled={selectedIds.size === 0 || startTrip.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {startTrip.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Bắt đầu giao {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <h2 className="font-black text-foreground">Map điểm giao</h2>
              <p className="text-xs text-muted-foreground">Pin xanh là khách hàng, pin cam là vị trí tài xế</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                <Truck className="h-4 w-4" />
                {assignments.filter(hasCoordinates).length} điểm có tọa độ
              </div>
              <button
                type="button"
                onClick={() => void handleCalculateRoute()}
                disabled={routeLoading || !focusedAssignment || !hasCoordinates(focusedAssignment)}
                className="flex items-center gap-2 rounded-2xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {routeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
                Chỉ đường
              </button>
            </div>
          </div>
          {activeRoute && (
            <div className="border-b border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
              <div className="flex flex-wrap items-center gap-3 font-bold">
                <span className="flex items-center gap-1">
                  <MapPinned className="h-4 w-4" />
                  {formatDistance(activeRoute.distanceMeters)}
                </span>
                <span>{formatDuration(activeRoute.durationSeconds)}</span>
                {activeRoute.cached && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs">cache</span>}
              </div>
              {activeRoute.steps.length > 0 && (
                <ol className="mt-3 max-h-32 list-decimal space-y-1 overflow-auto pl-5 text-xs">
                  {activeRoute.steps.slice(0, 8).map((step, index) => (
                    <li key={`${step.instruction}-${index}`}>
                      {step.instruction} • {formatDistance(step.distanceMeters)}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          <div className="h-[760px]">
            <MapContainer center={mapCenter} zoom={13} className="h-full w-full" scrollWheelZoom>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FocusMap assignment={focusedAssignment} routeGeometry={activeRoute?.geometry} />
              {trackingState.currentLocation && (
                <Marker
                  position={[trackingState.currentLocation.latitude, trackingState.currentLocation.longitude]}
                  icon={driverIcon}
                >
                  <Popup>Vị trí hiện tại của tài xế</Popup>
                </Marker>
              )}
              {activeRoute?.geometry && activeRoute.geometry.length > 1 && (
                <Polyline positions={activeRoute.geometry} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85 }} />
              )}
              {assignments.filter(hasCoordinates).map((assignment) => (
                <Marker
                  key={assignment.id}
                  position={[assignment.order.latitude as number, assignment.order.longitude as number]}
                  icon={destinationIcon}
                  eventHandlers={{ click: () => setFocusedId(assignment.id) }}
                >
                  <Popup>
                    <div className="min-w-[220px]">
                      <p className="font-bold">{assignment.order.receiverName || 'Khách hàng'}</p>
                      <p>{assignment.order.receiverAddress || 'Chưa có địa chỉ'}</p>
                      <p className="mt-1 text-xs">{assignment.order.productName} • SL {assignment.assignedQuantity}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <div className="flex items-start gap-2">
          <Navigation className="mt-0.5 h-4 w-4" />
          <p>
            GPS chỉ bật khi có đơn đang giao. Sau khi xác nhận giao xong toàn bộ đơn, tracking tự dừng và trạng thái tài xế về online.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DriverDeliveriesPage;
