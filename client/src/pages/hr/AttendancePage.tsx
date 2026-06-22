import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '../../components/shared/PageHeader';
import { useEmployees, useMarkAttendance, useAttendance, useCreateCompensatoryAttendance } from '../../hooks/queries/useHR';
import { useRoleSalaries, useGeneralSetting } from '../../hooks/queries/usePriceSettings';
import { resolveActiveGeofencePoints, matchGeofence } from '../../lib/attendanceGeo';
import { useAuth } from '../../context/AuthContext';
import { cloudinaryThumb } from '../../lib/cloudinaryUrl';
import { getVietnamTodayStr, getVietnamNowTimeStr } from '../../hooks/useAttendanceGate';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import ErrorState from '../../components/shared/ErrorState';
import EmptyState from '../../components/shared/EmptyState';
import { Check, X, User as UserIcon, Clock, Plus, Camera, ChevronRight, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addDays, subDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import { translateRole } from '../../lib/utils';
import type { Attendance } from '../../types';
import DraggableFAB from '../../components/shared/DraggableFAB';
import { TimePicker24h } from '../../components/shared/TimePicker24h';

const AttendancePage: React.FC = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(getVietnamTodayStr());
  
  // Calculate week range (Monday to Sunday)
  const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(selectedDate), { weekStartsOn: 1 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const { data: employees, isLoading: loadingEmployees, isError: errorEmployees, refetch: refetchEmployees } = useEmployees();
  const { data: roles } = useRoleSalaries();
  const { data: attendanceData, isLoading: loadingAttendance, refetch: refetchAttendance } = useAttendance(
    selectedDate, 
    format(weekStart, 'yyyy-MM-dd'), 
    format(weekEnd, 'yyyy-MM-dd')
  );
  const markAttendance = useMarkAttendance();
  const { data: attendanceLocationsData } = useGeneralSetting('attendance_locations');
  const { data: baseLocationData } = useGeneralSetting('base_location');

  const geofencePoints = useMemo(
    () =>
      resolveActiveGeofencePoints(
        attendanceLocationsData?.setting_value,
        baseLocationData?.setting_value
      ),
    [attendanceLocationsData?.setting_value, baseLocationData?.setting_value]
  );

  // Dialog state
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [attTime, setAttTime] = useState(getVietnamNowTimeStr());
  const [attEmployee, setAttEmployee] = useState<any>(null);
  const [reason, setReason] = useState('');

  // Local state for view only - Map by employee_id AND date
  const [localAttendance, setLocalAttendance] = useState<Record<string, Record<string, Partial<Attendance>>>>({});
  const [dialogDate, setDialogDate] = useState(selectedDate);
  const createCompensatory = useCreateCompensatoryAttendance();

  const todayStr = getVietnamTodayStr();
  const isPastDate = dialogDate < todayStr;
  const isFutureDate = dialogDate > todayStr;

  useEffect(() => {
    if (attendanceData) {
      const mapping: Record<string, Record<string, Partial<Attendance>>> = {};
      attendanceData.forEach(item => {
        if (!mapping[item.employee_id]) mapping[item.employee_id] = {};
        mapping[item.employee_id][item.work_date] = item;
      });
      setLocalAttendance(mapping);
    }
  }, [attendanceData]);

  const handleOpen = (emp?: any, date?: string) => {
    const d = date || selectedDate;
    if (d > todayStr) {
      toast.error('Không được chấm công cho ngày trong tương lai');
      return;
    }
    const targetEmp = emp || user;
    setAttTime(getVietnamNowTimeStr());
    setAttEmployee(targetEmp);
    setDialogDate(d);
    setReason('');

    setIsOpen(true);
    setIsClosing(false);
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      setAttEmployee(null);
    }, 300);
  };

  const handleSaveAttendance = async () => {
    if (!attEmployee) return;

    if (isFutureDate) {
      toast.error('Không được chấm công cho ngày trong tương lai');
      return;
    }

    if (dialogDate === todayStr) {
      const currentTime = getVietnamNowTimeStr();
      if (attTime > currentTime) {
        toast.error('Giờ chấm công không được lớn hơn giờ hiện tại');
        return;
      }
    }

    if (isPastDate && !reason.trim()) {
      toast.error('Vui lòng nhập lý do chấm công bù');
      return;
    }

    const checkLocationAndSave = async () => {
      const ensureSeconds = (t: string | null | undefined) => {
        if (!t) return null;
        if (t.split(':').length === 2) return `${t}:00`;
        return t;
      };

      if (isPastDate) {
        await createCompensatory.mutateAsync({
          work_date: dialogDate,
          check_in_time: ensureSeconds(attTime),
          reason: reason.trim(),
        });
      } else {
        await markAttendance.mutateAsync({
          employee_id: attEmployee.id,
          work_date: dialogDate,
          is_present: true,
          check_in_time: ensureSeconds(attTime),
        });
      }

      handleClose();
      refetchAttendance();
    };

    if (geofencePoints.length > 0 && dialogDate === todayStr && user?.role !== 'admin') {
      toast.loading('Đang kiểm tra vị trí...', { id: 'att-loc' });
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const match = matchGeofence(pos.coords.latitude, pos.coords.longitude, geofencePoints);
            if (!match.ok) {
              toast.error(
                `Vị trí không hợp lệ — không nằm trong bán kính điểm nào đã cấu hình (gần nhất cách ${Math.round(match.minDistanceM)} m)`,
                { id: 'att-loc' }
              );
            } else {
              toast.success(`Trong phạm vi “${match.name}” (~${Math.round(match.distanceM)} m)`, { id: 'att-loc' });
              checkLocationAndSave();
            }
          },
          (err) => {
            console.error(err);
            toast.error('Không thể kiểm tra vị trí. Vui lòng cấp quyền xem vị trí.', { id: 'att-loc' });
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      } else {
        toast.error('Trình duyệt không hỗ trợ xem vị trí', { id: 'att-loc' });
      }
    } else {
      checkLocationAndSave();
    }
  };

  const isLoading = loadingEmployees || loadingAttendance;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0 md:px-0">
      <div className="hidden md:block">
        <PageHeader
          title="Chấm công"
          description="Quản lý lịch làm việc và giờ giấc nhân viên"
          backPath="/app/hanh-chinh-nhan-su"
          actions={
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-card border border-border/80 rounded-xl overflow-hidden shadow-sm">
                <button 
                  onClick={() => setSelectedDate(format(subDays(new Date(selectedDate), 7), 'yyyy-MM-dd'))}
                  className="p-2 hover:bg-muted text-muted-foreground transition-colors border-r border-border/50"
                >
                  <ChevronRight className="rotate-180" size={16} />
                </button>
                <div className="px-4 py-2 text-[13px] font-bold text-foreground">
                  Tuần {format(weekStart, 'dd/MM')} - {format(weekEnd, 'dd/MM')}
                </div>
                <button 
                  onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 7), 'yyyy-MM-dd'))}
                  className="p-2 hover:bg-muted text-muted-foreground transition-colors border-l border-border/50"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <button
                onClick={() => handleOpen()}
                className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95"
              >
                <Plus size={16} />
                Chấm công nhanh
              </button>
            </div>
          }
        />
      </div>

      <div className="md:hidden flex flex-col gap-3 mb-4 mx-4 mt-2">
        <div className="flex flex-col gap-3">
           <div className="flex items-center justify-between bg-card border border-border/80 rounded-xl overflow-hidden shadow-sm">
             <button 
               onClick={() => setSelectedDate(format(subDays(new Date(selectedDate), 7), 'yyyy-MM-dd'))}
               className="p-3 hover:bg-muted text-muted-foreground transition-colors border-r border-border/50 flex-1 flex justify-center"
             >
               <ChevronRight className="rotate-180" size={18} />
             </button>
             <div className="px-4 py-3 text-[14px] font-bold text-foreground">
               Tuần {format(weekStart, 'dd/MM')} - {format(weekEnd, 'dd/MM')}
             </div>
             <button 
               onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 7), 'yyyy-MM-dd'))}
               className="p-3 hover:bg-muted text-muted-foreground transition-colors border-l border-border/50 flex-1 flex justify-center"
             >
               <ChevronRight size={18} />
             </button>
           </div>
        </div>
      </div>

      <div className="bg-muted/50 md:bg-card md:rounded-2xl md:border border-border md:shadow-sm flex flex-col flex-1 min-h-0 md:overflow-hidden">
        {isLoading ? (
          <div className="p-4"><LoadingSkeleton rows={6} columns={5} /></div>
        ) : errorEmployees ? (
          <ErrorState onRetry={() => { refetchEmployees(); refetchAttendance(); }} />
        ) : !employees?.length ? (
          <EmptyState title="Chưa có nhân viên" />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-0">
            {/* Desktop Table View */}
            <table className="w-full border-collapse hidden md:table">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/50 border-b border-border backdrop-blur-md text-left">
                  <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider min-w-[200px]">Nhân sự</th>
                  {daysInWeek.map((day) => (
                    <th key={day.toString()} className="px-3 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center border-l border-border/10">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] opacity-70">{format(day, 'EEEE', { locale: vi })}</span>
                        <span>{format(day, 'dd/MM')}</span>
                      </div>
                    </th>
                  ))}
                  <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">Tổng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {employees
                  .filter((e) => {
                    if (e.role === 'admin') return false;
                    if (user?.role === 'admin' || user?.role === 'manager') return true;
                    return e.id === user?.id;
                  })
                  .map((e) => {
                    const empAtt = localAttendance[e.id] || {};
                    let totalPresent = 0;

                    return (
                      <tr key={e.id} className="hover:bg-muted/30 transition-all duration-200 group border-b border-border/50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            {e.avatar_url ? (
                              <img loading="lazy" decoding="async" src={cloudinaryThumb(e.avatar_url)} alt={e.full_name} className="w-8 h-8 rounded-full object-cover ring-2 ring-muted group-hover:ring-primary/20 transition-all" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                                <UserIcon size={14} />
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-[13px] font-bold text-foreground group-hover:text-primary transition-colors">{e.full_name}</span>
                              <span className="text-[10px] font-medium text-muted-foreground">{roles?.find(r => r.role_key === e.role)?.role_name || translateRole(e.role)}</span>
                            </div>
                          </div>
                        </td>
                        {daysInWeek.map((day) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const att = empAtt[dateStr];
                          const isPresent = att?.is_present ?? false;
                          if (isPresent) totalPresent++;

                          return (
                            <td 
                              key={dateStr} 
                              className="px-2 py-4 text-center border-l border-border/10 h-full"
                            >
                              <button
                                onClick={() => handleOpen(e, dateStr)}
                                className={clsx(
                                  "w-full py-2 rounded-xl flex flex-col items-center gap-0.5 transition-all group/cell",
                                  isPresent ? "bg-emerald-50 text-emerald-700 border border-emerald-100/50" : "hover:bg-muted text-muted-foreground/40 border border-transparent"
                                )}
                              >
                                  {isPresent ? (
                                    <span className="text-[11px] font-bold">{att?.check_in_time?.substring(0, 5) || '--:--'}</span>
                                  ) : (
                                  <div className="py-2 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                    <Plus size={14} className="text-primary/50" />
                                  </div>
                                )}
                              </button>
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className={clsx(
                            'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset',
                            totalPresent > 0 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-muted text-muted-foreground ring-border'
                          )}>
                            {totalPresent} buổi
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>

            {/* Mobile Card View */}
            <div className="md:hidden flex flex-col gap-3">
              {employees
                .filter((e) => {
                  if (e.role === 'admin') return false;
                  if (user?.role === 'admin' || user?.role === 'manager') return true;
                  return e.id === user?.id;
                })
                .map((e) => {
                  const empAtt = localAttendance[e.id] || {};
                  
                  // Tính trước totalPresent cho layout mobile
                  let totalPresentMobile = 0;
                  daysInWeek.forEach((day) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    if (empAtt[dateStr]?.is_present) totalPresentMobile++;
                  });

                  return (
                    <div key={`mobile_${e.id}`} className="bg-card rounded-2xl border border-border shadow-sm p-4 flex flex-col gap-4">
                      {/* header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {e.avatar_url ? (
                            <img loading="lazy" decoding="async" src={cloudinaryThumb(e.avatar_url)} alt={e.full_name} className="w-10 h-10 rounded-full object-cover ring-2 ring-muted" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-sm">
                              <UserIcon size={18} />
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className="text-[14px] font-bold text-foreground">{e.full_name}</span>
                            <span className="text-[11px] font-medium text-muted-foreground">{roles?.find(r => r.role_key === e.role)?.role_name || translateRole(e.role)}</span>
                          </div>
                        </div>
                        <span className={clsx(
                            'px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset',
                            totalPresentMobile > 0 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-muted text-muted-foreground ring-border'
                          )}>
                            {totalPresentMobile} buổi
                        </span>
                      </div>
                      
                      {/* Attendance Grid */}
                      <div className="grid grid-cols-7 gap-1.5">
                        {daysInWeek.map((day) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const att = empAtt[dateStr];
                          const isPresent = att?.is_present ?? false;

                          return (
                            <button
                                key={dateStr}
                                onClick={() => handleOpen(e, dateStr)}
                                className={clsx(
                                  "flex flex-col items-center justify-center py-2 h-[60px] rounded-xl transition-all active:scale-95",
                                  isPresent ? "bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm" : "bg-muted/50 text-muted-foreground border border-border hover:bg-muted"
                                )}
                              >
                                  {isPresent ? (
                                    <span className="text-[10px] font-bold leading-tight">{att?.check_in_time?.substring(0, 5) || '--:--'}</span>
                                  ) : (
                                  <div className="flex flex-col items-center gap-0.5 opacity-70">
                                    <span className="text-[9px] uppercase font-bold">{format(day, 'E', { locale: vi })}</span>
                                    <span className="text-[11px] font-medium">{format(day, 'dd/MM')}</span>
                                  </div>
                                )}
                              </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {(isOpen || isClosing) && createPortal(
        <div className="fixed inset-0 z-[9999] flex justify-end">
          {/* Backdrop */}
          <div
            className={clsx(
              'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-300 ease-out',
              isClosing ? 'opacity-0' : 'animate-in fade-in duration-300',
            )}
            onClick={handleClose}
          />

          {/* Panel */}
          <div
            className={clsx(
              'relative w-full max-w-[500px] bg-background shadow-2xl flex flex-col md:h-screen h-[100dvh] border-l border-border',
              isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className={clsx("w-10 h-10 rounded-full flex items-center justify-center", isPastDate ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary")}>
                  {isPastDate ? <Clock size={20} /> : <Clock size={20} />}
                </div>
                <h3 className="text-lg font-bold text-foreground tracking-tight">
                  {isPastDate ? 'Tạo phiếu chấm công bù' : 'Thêm bản ghi chấm công'}
                </h3>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
              {/* Profile Image Section */}
              <div className="bg-card rounded-3xl border border-border shadow-sm p-8 flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-24 h-24 rounded-3xl bg-muted/30 flex items-center justify-center border border-border/50 overflow-hidden ring-4 ring-muted shadow-inner">
                    {attEmployee?.avatar_url ? (
                      <img loading="lazy" decoding="async" src={cloudinaryThumb(attEmployee.avatar_url)} alt={attEmployee.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon size={40} className="text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="absolute -bottom-2 -right-2 p-2 bg-primary rounded-xl shadow-lg border-2 border-white text-white">
                    <Camera size={16} />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-[12px] font-bold text-primary uppercase tracking-widest bg-primary/5 px-4 py-1.5 rounded-full border border-primary/10">Thông tin cá nhân</p>
                </div>
              </div>

              {/* Form Fields Section */}
              <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden pb-6">
                <div className={clsx("px-5 py-3 border-b border-border flex items-center gap-2", isPastDate ? "bg-amber-500/5 text-amber-600 border-amber-500/20" : "bg-muted/5")}>
                  {isPastDate ? <AlertCircle size={14} className="text-amber-500" /> : <UserIcon size={14} className="text-primary" />}
                  <span className={clsx("text-[12px] font-bold uppercase tracking-wider", isPastDate ? "text-amber-600" : "text-primary")}>
                    {isPastDate ? 'Tạo yêu cầu do chọn ngày đã qua' : 'Thông tin chấm công'}
                  </span>
                </div>

                <div className="p-6 space-y-5">
                  {/* Nhân sự */}
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-foreground flex items-center gap-2">Nhân sự <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={attEmployee?.full_name || ''}
                      readOnly
                      className="w-full px-4 py-2.5 bg-muted/10 border border-border rounded-xl text-[13px] font-bold text-muted-foreground cursor-not-allowed focus:outline-none"
                    />
                  </div>

                  {/* Ngày */}
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-foreground flex items-center gap-2">Ngày <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type="text"
                        value={format(new Date(dialogDate), 'dd/MM/yyyy')}
                        readOnly
                        className="w-full px-4 py-2.5 bg-muted/10 border border-border rounded-xl text-[13px] font-bold text-muted-foreground cursor-not-allowed focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Giờ */}
                  <div className="grid grid-cols-1 gap-5 pt-4 border-t border-border/50">
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-bold text-foreground flex items-center gap-2">Giờ chấm công <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <TimePicker24h
                          value={attTime}
                          onChange={(val) => setAttTime(val)}
                          className="w-full !h-[48px] !px-4 bg-muted border-border/80 rounded-xl text-[14px] font-bold text-foreground focus:ring-2 focus:ring-primary/10 transition-all"
                        />
                        <button
                          onClick={() => setAttTime(getVietnamNowTimeStr())}
                          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-[11px] font-bold hover:bg-emerald-100 transition-all z-10"
                        >
                          Giờ hiện tại
                        </button>
                      </div>
                    </div>
                  </div>

                  {isPastDate && (
                    <div className="space-y-1.5 pt-4 border-t border-border/50">
                      <label className="text-[13px] font-bold text-foreground flex items-center gap-2">Lý do chấm công bù <span className="text-red-500">*</span></label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Nhập lý do gửi quản lý duyệt..."
                        className="w-full px-4 py-2.5 bg-white border border-border rounded-xl text-[13px] font-medium text-foreground focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/30 transition-all outline-none resize-none h-24"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] bg-card border-t border-border flex items-center gap-3 shrink-0">
              <button
                onClick={handleClose}
                className="flex-1 py-3 border border-border bg-card text-foreground rounded-2xl text-[13px] font-bold hover:bg-muted transition-all active:scale-95"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSaveAttendance}
                disabled={markAttendance.isPending || createCompensatory.isPending}
                className={clsx(
                  "flex-[2] py-3 text-white rounded-2xl text-[13px] font-bold transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50",
                  isPastDate ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20" : "bg-primary hover:bg-primary/90 shadow-primary/20"
                )}
              >
                {markAttendance.isPending || createCompensatory.isPending ? 'Đang lưu...' : (
                  <>
                    <Check size={18} />
                    {isPastDate ? 'GỬI YÊU CẦU' : 'LƯU CHẤM CÔNG'}
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="md:mt-4 mx-4 md:mx-0 mb-4 md:mb-0 bg-card md:bg-muted/30 border border-border rounded-2xl p-4 flex items-center justify-between md:backdrop-blur-sm shadow-sm md:shadow-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/20"></div>
            <span className="text-[12px] font-bold text-muted-foreground">Có mặt</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-muted shadow-sm"></div>
            <span className="text-[12px] font-bold text-muted-foreground">Chưa chấm/Vắng</span>
          </div>
        </div>
      </div>
      
      <DraggableFAB 
        icon={<Plus size={24} />} 
        onClick={() => handleOpen()} 
      />
    </div>
  );
};

export default AttendancePage;
