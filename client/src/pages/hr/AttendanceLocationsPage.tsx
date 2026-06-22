import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '../../components/shared/PageHeader';
import { useGeneralSetting, useUpsertGeneralSetting } from '../../hooks/queries/usePriceSettings';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import ErrorState from '../../components/shared/ErrorState';
import {
  MapPin,
  Plus,
  Trash2,
  Crosshair,
  X,
  ChevronRight,
  Edit2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import type { AttendanceGeofencePoint } from '../../lib/attendanceGeo';
import { parseGeofenceListFromAttendanceSetting } from '../../lib/attendanceGeo';
import DraggableFAB from '../../components/shared/DraggableFAB';
import ConfirmDialog from '../../components/shared/ConfirmDialog';

const emptyDraft = (): AttendanceGeofencePoint => ({
  id: crypto.randomUUID(),
  name: '',
  lat: 0,
  lng: 0,
  radius_m: 50,
});

const AttendanceLocationsPage: React.FC = () => {
  const { data, isLoading, isError, refetch } = useGeneralSetting('attendance_locations');
  const upsert = useUpsertGeneralSetting();

  const [locations, setLocations] = useState<AttendanceGeofencePoint[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const [draft, setDraft] = useState<AttendanceGeofencePoint | null>(null);
  const [draftLatStr, setDraftLatStr] = useState('');
  const [draftLngStr, setDraftLngStr] = useState('');
  const [draftRadiusStr, setDraftRadiusStr] = useState('50');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || hydrated) return;
    const parsed = data?.setting_value != null ? parseGeofenceListFromAttendanceSetting(data.setting_value) : [];
    setLocations(parsed);
    setHydrated(true);
  }, [isLoading, data, hydrated]);

  const persistLocations = useCallback(
    (
      next: AttendanceGeofencePoint[],
      successMessage?: string,
      options?: { onSettled?: () => void }
    ) => {
      toast.loading('Đang lưu...', { id: 'att-loc-persist' });
      upsert.mutate(
        {
          key: 'attendance_locations',
          value: { locations: next },
          description: 'Danh sách điểm được phép chấm công (lat, lng, bán kính mét)',
          quiet: true,
        },
        {
          onSuccess: (row: { setting_value?: unknown }) => {
            if (row?.setting_value != null) {
              setLocations(parseGeofenceListFromAttendanceSetting(row.setting_value));
            } else {
              setLocations(next);
            }
            toast.success(successMessage ?? 'Đã lưu', { id: 'att-loc-persist' });
          },
          onError: () => {
            toast.error('Không lưu được. Đã khôi phục danh sách từ máy chủ.', { id: 'att-loc-persist' });
            void refetch().then((res) => {
              const raw = res.data?.setting_value;
              setLocations(raw != null ? parseGeofenceListFromAttendanceSetting(raw) : []);
            });
          },
          onSettled: () => {
            options?.onSettled?.();
          },
        }
      );
    },
    [upsert, refetch]
  );

  const openCreate = () => {
    const d = emptyDraft();
    setDraft(d);
    setDraftLatStr('');
    setDraftLngStr('');
    setDraftRadiusStr('50');
    setPanelOpen(true);
    setPanelClosing(false);
  };

  const openEdit = (p: AttendanceGeofencePoint) => {
    setDraft({ ...p });
    setDraftLatStr(String(p.lat));
    setDraftLngStr(String(p.lng));
    setDraftRadiusStr(String(p.radius_m));
    setPanelOpen(true);
    setPanelClosing(false);
  };

  const closePanel = () => {
    setPanelClosing(true);
    setTimeout(() => {
      setPanelOpen(false);
      setPanelClosing(false);
      setDraft(null);
    }, 280);
  };

  const handleDraftGetLocation = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Trình duyệt không hỗ trợ định vị');
      return;
    }
    toast.loading('Đang lấy vị trí...', { id: 'geo-loc' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const la = position.coords.latitude;
        const lo = position.coords.longitude;
        setDraftLatStr(String(la));
        setDraftLngStr(String(lo));
        setDraft((prev) => (prev ? { ...prev, lat: la, lng: lo } : null));
        toast.success('Đã cập nhật tọa độ', { id: 'geo-loc' });
      },
      () => {
        toast.error('Không thể lấy vị trí. Vui lòng cấp quyền trên trình duyệt.', { id: 'geo-loc' });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const commitDraftToList = () => {
    if (!draft) return;
    const name = draft.name.trim();
    const lat = parseFloat(draftLatStr.replace(',', '.'));
    const lng = parseFloat(draftLngStr.replace(',', '.'));
    const radius_m = parseInt(draftRadiusStr, 10);
    if (!name) {
      toast.error('Vui lòng nhập tên điểm chấm công');
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error('Vĩ độ / kinh độ không hợp lệ');
      return;
    }
    if (!Number.isFinite(radius_m) || radius_m <= 0) {
      toast.error('Bán kính phải là số dương (mét)');
      return;
    }
    const next: AttendanceGeofencePoint = { ...draft, name, lat, lng, radius_m };
    const isNew = !locations.some((x) => x.id === next.id);
    const idx = locations.findIndex((x) => x.id === next.id);
    const updated =
      idx === -1 ? [...locations, next] : (() => {
        const copy = [...locations];
        copy[idx] = next;
        return copy;
      })();

    setLocations(updated);
    closePanel();
    persistLocations(
      updated,
      isNew ? `Đã thêm “${name}”` : `Đã cập nhật “${name}”`
    );
  };

  const confirmDeleteLocation = () => {
    if (!deleteId) return;
    const removed = locations.find((x) => x.id === deleteId);
    const next = locations.filter((x) => x.id !== deleteId);
    setLocations(next);
    persistLocations(next, removed ? `Đã xóa “${removed.name}”` : 'Đã xóa điểm', {
      onSettled: () => setDeleteId(null),
    });
  };

  const busy = upsert.isPending || !hydrated;

  if (isError) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0 md:px-0">
      <div className="hidden md:block">
        <PageHeader
          title="Cấu hình chấm công"
          description="Thêm, sửa hoặc xóa điểm — mỗi thao tác được lưu ngay vào hệ thống. Nhân viên chỉ chấm công được trong bán kính ít nhất một điểm đã khai báo."
          backPath="/app/hanh-chinh-nhan-su"
        />
      </div>

      <div className="md:hidden mx-4 mt-2 mb-4">
        <h1 className="text-lg font-bold text-foreground">Cấu hình chấm công</h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">Thay đổi được lưu ngay khi bạn thêm, sửa hoặc xóa điểm.</p>
      </div>

      <div className="bg-muted/50 md:bg-card md:rounded-2xl md:border border-border md:shadow-sm flex flex-col flex-1 min-h-0 p-4 md:p-6 gap-4">
        {!hydrated || isLoading ? (
          <LoadingSkeleton rows={4} columns={1} />
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-[13px] font-bold text-foreground">
                Điểm đã khai báo ({locations.length})
              </p>
              <button
                type="button"
                onClick={openCreate}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-[13px] font-bold text-foreground hover:bg-muted transition-all disabled:opacity-50"
              >
                <Plus size={16} />
                Thêm vị trí
              </button>
            </div>

            {locations.length === 0 ? (
              <div className="py-16 text-center rounded-2xl border border-dashed border-border bg-muted/20">
                <MapPin className="mx-auto text-muted-foreground/40 mb-3" size={40} />
                <p className="text-[14px] font-bold text-foreground">Chưa có điểm nào</p>
                <p className="text-[12px] text-muted-foreground mt-1 px-6">
                  Thêm vị trí (văn phòng, kho, cửa hàng…) và bán kính cho phép.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {locations.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          <MapPin size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold text-foreground truncate">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          disabled={busy}
                          className="p-2 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-50"
                          title="Sửa"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(p.id)}
                          disabled={busy}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-red-600 disabled:opacity-50"
                          title="Xóa"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-muted-foreground">Bán kính cho phép</span>
                      <span className="font-bold text-foreground">{p.radius_m} m</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {(panelOpen || panelClosing) &&
        draft &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex justify-end">
            <div
              className={clsx(
                'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-300',
                panelClosing ? 'opacity-0' : 'animate-in fade-in duration-300'
              )}
              onClick={closePanel}
            />
            <div
              className={clsx(
                'relative w-full max-w-[480px] bg-background shadow-2xl flex flex-col md:h-screen h-[100dvh] border-l border-border',
                panelClosing ? 'dialog-slide-out' : 'dialog-slide-in'
              )}
            >
              <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <MapPin size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">Điểm chấm công</h3>
                </div>
                <button type="button" onClick={closePanel} className="p-2 hover:bg-muted rounded-full text-muted-foreground">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-foreground">Tên điểm</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="VD: Văn phòng chính"
                    className="w-full px-4 py-2.5 bg-white border border-border rounded-xl text-[14px] font-medium focus:ring-2 focus:ring-primary/10 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-foreground">Vĩ độ</label>
                    <input
                      type="text"
                      value={draftLatStr}
                      onChange={(e) => setDraftLatStr(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-border rounded-xl text-[14px] font-mono focus:ring-2 focus:ring-primary/10 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-foreground">Kinh độ</label>
                    <input
                      type="text"
                      value={draftLngStr}
                      onChange={(e) => setDraftLngStr(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-border rounded-xl text-[14px] font-mono focus:ring-2 focus:ring-primary/10 outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-foreground">Bán kính (mét)</label>
                  <input
                    type="number"
                    min={1}
                    value={draftRadiusStr}
                    onChange={(e) => setDraftRadiusStr(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-border rounded-xl text-[14px] font-medium focus:ring-2 focus:ring-primary/10 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleDraftGetLocation}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-muted/40 hover:bg-muted border border-border rounded-xl text-[13px] font-bold text-foreground transition-all"
                >
                  <Crosshair size={16} />
                  Lấy vị trí hiện tại
                </button>
              </div>

              <div className="p-6 bg-card border-t border-border flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={closePanel}
                  className="flex-1 py-3 border border-border rounded-2xl text-[13px] font-bold text-foreground hover:bg-muted"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={commitDraftToList}
                  disabled={upsert.isPending}
                  className="flex-[2] py-3 bg-primary text-white rounded-2xl text-[13px] font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <ChevronRight size={16} />
                  {upsert.isPending ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <ConfirmDialog
        isOpen={deleteId !== null}
        title="Xác nhận xóa"
        message="Xóa điểm chấm công này?"
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        variant="danger"
        onConfirm={confirmDeleteLocation}
        onCancel={() => setDeleteId(null)}
        isLoading={upsert.isPending && deleteId !== null}
      />

      <DraggableFAB
        icon={<Plus size={24} />}
        onClick={() => {
          if (!busy) openCreate();
        }}
        className={
          busy
            ? 'bg-primary text-white w-12 h-12 rounded-full opacity-40 pointer-events-none'
            : undefined
        }
      />
    </div>
  );
};

export default AttendanceLocationsPage;
