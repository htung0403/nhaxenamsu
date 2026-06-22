import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/shared/PageHeader';
import { useDriverCheckins, useCheckinDriver, useVehicles } from '../../hooks/queries/useVehicles';
import { useAuth } from '../../context/AuthContext';
import { clsx } from 'clsx';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { MapPin, Navigation, Car } from 'lucide-react';
import toast from 'react-hot-toast';

const DriverCheckinPage: React.FC = () => {
  const { user } = useAuth();

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const { data: vehicles } = useVehicles();
  const driverVehicles = vehicles?.filter(v => v.driver_id === user?.id || v.in_charge_id === user?.id) || [];

  const { data: checkins, isLoading, isError, refetch } = useDriverCheckins(selectedVehicleId);
  const checkinMutation = useCheckinDriver();

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string>('');
  const [isLocating, setIsLocating] = useState(false);

  const requestLocation = () => {
    setIsLocating(true);
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError('Trình duyệt của bạn không hỗ trợ định vị GPS.');
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsLocating(false);
      },
      (error) => {
        let errorMsg = 'Không thể lấy vị trí.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Vui lòng cấp quyền truy cập vị trí để check-in.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Thông tin vị trí không khả dụng.';
            break;
          case error.TIMEOUT:
            errorMsg = 'Yêu cầu vị trí quá thời gian.';
            break;
        }
        setLocationError(errorMsg);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    if (user?.role === 'driver' || user?.role?.includes('lo_xe') || user?.role?.includes('tai_xe')) {
      requestLocation();
    }
  }, [user]);

  const handleCheckinAction = async (type: 'in' | 'out') => {
    if (!selectedVehicleId) {
      toast.error('Vui lòng chọn xe để check-in');
      return;
    }
    if (!location) {
      toast.error('Vui lòng đợi lấy vị trí hoặc làm mới vị trí');
      return;
    }
    
    await checkinMutation.mutateAsync({
      vehicleId: selectedVehicleId,
      payload: {
        checkin_type: type, // Correct property name
        latitude: location.lat,
        longitude: location.lng,
        address_snapshot: 'Tọa độ GPS',
      }
    });
    // Request refetch on success
    refetch();
  };

  // Auto-select first vehicle if a driver has only one
  useEffect(() => {
    if (driverVehicles.length === 1 && !selectedVehicleId) {
      setSelectedVehicleId(driverVehicles[0].id);
    }
  }, [driverVehicles, selectedVehicleId]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <PageHeader title="Check-in GPS" description="Ghi nhận vị trí của tài xế" backPath="/app/quan-ly-xe" />

      {/* Checkin Action Card */}
      {user?.role === 'driver' && (
        <div className="bg-white rounded-2xl border border-border shadow-sm p-6 mb-4 shrink-0 space-y-4">
          <div className="flex flex-col md:flex-row items-center gap-4 bg-muted/20 p-4 rounded-xl border border-border">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
              <Car size={20} className="text-blue-500" />
            </div>
            <div className="flex-1 w-full">
              <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Chọn xe điều khiển</label>
              <select
                value={selectedVehicleId}
                onChange={e => setSelectedVehicleId(e.target.value)}
                className="w-full bg-transparent border-none text-[15px] font-bold focus:ring-0 p-0"
              >
                <option value="">-- Chọn xe --</option>
                {driverVehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.license_plate} {v.vehicle_type ? `(${v.vehicle_type})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                <Navigation size={24} className="text-blue-500" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-foreground">Trạng thái vị trí</h3>
                {isLocating ? (
                  <p className="text-[13px] text-muted-foreground animate-pulse">Đang lấy vị trí hiện tại...</p>
                ) : locationError ? (
                  <p className="text-[13px] text-red-500 font-medium">{locationError}</p>
                ) : location ? (
                  <p className="text-[13px] text-emerald-600 font-medium tracking-tight truncate">
                    Đã lấy vị trí: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                  </p>
                ) : (
                  <p className="text-[13px] text-muted-foreground">Chưa có thông tin vị trí.</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={requestLocation}
                disabled={isLocating}
                className="flex-1 md:flex-none px-4 py-2.5 rounded-xl border border-border text-[13px] font-bold text-foreground hover:bg-muted transition-all disabled:opacity-50"
              >
                Làm mới GPS
              </button>
              <button
                onClick={() => handleCheckinAction('in')}
                disabled={!location || checkinMutation.isPending || !selectedVehicleId}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
              >
                <MapPin size={16} />
                Bắt đầu
              </button>
              <button
                onClick={() => handleCheckinAction('out')}
                disabled={!location || checkinMutation.isPending || !selectedVehicleId}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-orange-600 text-white text-[13px] font-bold hover:bg-orange-700 shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50"
              >
                <Navigation size={16} />
                Kết thúc
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <h3 className="text-[14px] font-bold text-foreground mb-3 px-1">Lịch sử Check-in</h3>
      <div className="bg-white rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0">
        {isLoading ? (
          <div className="p-4"><LoadingSkeleton rows={5} columns={4} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !checkins?.length ? (
          <EmptyState title="Chưa có lịch sử check-in" />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar p-4">
            <div className="relative border-l-2 border-muted ml-3 space-y-6 pb-4">
              {checkins.map((c: any) => (
                <div key={c.id} className="relative pl-6">
                  <div className={clsx(
                    "absolute w-3 h-3 rounded-full -left-[7px] top-1.5 ring-4 ring-white",
                    c.checkin_type === 'in' ? 'bg-blue-500' : 'bg-orange-500'
                  )} />
                  <div className="bg-muted/10 rounded-xl p-4 border border-border group hover:border-primary/30 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[13px] font-bold text-foreground">{new Date(c.checkin_time).toLocaleString('vi-VN')}</span>
                      <span className={clsx(
                        "px-2 py-0.5 rounded text-[10px] font-bold border uppercase",
                        c.checkin_type === 'in' 
                          ? "bg-blue-50 border-blue-100 text-blue-600" 
                          : "bg-orange-50 border-orange-100 text-orange-600"
                      )}>
                        {c.checkin_type === 'in' ? 'Bắt đầu' : 'Kết thúc'}
                      </span>
                    </div>
                    {(user?.role === 'admin' || user?.role === 'manager') && c.profiles && (
                      <p className="text-[13px] font-medium text-foreground mb-1">
                        Tài xế: <span className="font-bold">{c.profiles.full_name}</span>
                      </p>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground text-[12px]">
                        <MapPin size={14} className="shrink-0" />
                        <span className="truncate">{c.address_snapshot || `Tọa độ: ${c.latitude}, ${c.longitude}`}</span>
                      </div>
                      <a 
                        href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 shrink-0"
                      >
                        Xem bản đồ
                        <Navigation size={10} />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverCheckinPage;
