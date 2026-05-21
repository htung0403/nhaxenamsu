import React, { useEffect, useMemo } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, MapPin, Search } from 'lucide-react';

const DEFAULT_CENTER: [number, number] = [10.7769, 106.7009];

const customerPinIcon = L.divIcon({
  className: '',
  html: '<div style="width:28px;height:28px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 8px 20px rgba(15,23,42,.25);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:900">🏠</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

type Props = {
  address: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  isSearching?: boolean;
  onSearchAddress: () => void;
  onChange: (latitude: number, longitude: number) => void;
};

const toNumber = (value?: number | string | null): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const FlyToPosition: React.FC<{ position: [number, number] }> = ({ position }) => {
  const map = useMap();

  useEffect(() => {
    map.flyTo(position, Math.max(map.getZoom(), 15), { duration: 0.7 });
  }, [map, position]);

  return null;
};

const ClickToSetPin: React.FC<{ onChange: (latitude: number, longitude: number) => void }> = ({ onChange }) => {
  useMapEvents({
    click(event) {
      onChange(Number(event.latlng.lat.toFixed(8)), Number(event.latlng.lng.toFixed(8)));
    },
  });

  return null;
};

const CustomerLocationPicker: React.FC<Props> = ({
  address,
  latitude,
  longitude,
  isSearching = false,
  onSearchAddress,
  onChange,
}) => {
  const numericLatitude = toNumber(latitude);
  const numericLongitude = toNumber(longitude);
  const position = useMemo<[number, number] | null>(() => {
    if (numericLatitude === null || numericLongitude === null) return null;
    return [numericLatitude, numericLongitude];
  }, [numericLatitude, numericLongitude]);
  const center = position || DEFAULT_CENTER;

  return (
    <div className="rounded-2xl border border-border bg-muted/5 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-black text-foreground">Vị trí giao hàng trên map</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Search địa chỉ để gợi ý, hoặc click map để đặt pin chính xác.
            </p>
          </div>
          <button
            type="button"
            onClick={onSearchAddress}
            disabled={isSearching || address.trim().length < 5}
            className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-[12px] font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search size={14} />
            {isSearching ? 'Đang tìm...' : 'Tìm địa chỉ'}
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 text-[12px] text-muted-foreground">
          <MapPin size={14} className="shrink-0" />
          <span className="truncate">{address.trim() || 'Nhập địa chỉ trước khi search'}</span>
        </div>
      </div>

      <div className="h-64">
        <MapContainer center={center} zoom={position ? 15 : 11} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToSetPin onChange={onChange} />
          {position && (
            <>
              <FlyToPosition position={position} />
              <Marker position={position} icon={customerPinIcon} />
            </>
          )}
        </MapContainer>
      </div>

      <div className="flex items-start gap-2 border-t border-border bg-card p-3 text-[11px] leading-relaxed text-muted-foreground">
        <Crosshair size={14} className="mt-0.5 shrink-0" />
        <p>
          Pin này được lưu vào hồ sơ khách hàng và dùng để hiện điểm giao trên bản đồ tài xế.
          Search chỉ chạy khi bấm nút, không autocomplete để tránh spam OpenStreetMap.
        </p>
      </div>
    </div>
  );
};

export default CustomerLocationPicker;
