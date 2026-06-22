import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/shared/PageHeader';
import { usePayrolls, useGeneratePayroll, useConfirmPayroll, useUpdatePayrollStatuses } from '../../hooks/queries/usePayroll';
import { useEmployees, useAttendance } from '../../hooks/queries/useHR';
import { useRoleSalaries } from '../../hooks/queries/usePriceSettings';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import StatusBadge from '../../components/shared/StatusBadge';
import { Lock, ChevronRight, User as UserIcon, Check, FileText, BarChart2 } from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addDays, subDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import { clsx } from 'clsx';
import PayrollStats from './PayrollStats';

import type { Attendance } from '../../types';
import { cloudinaryThumb } from '../../lib/cloudinaryUrl';

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const statusLabels: Record<string, string> = {
  draft: 'Nháp',
  confirmed: 'Đã chốt',
  paid: 'Đã trả lương',
};

const translateRole = (role: string) => {
  const map: Record<string, string> = { admin: 'Quản trị viên', manager: 'Quản lý', staff: 'Nhân viên', driver: 'Tài xế' };
  return map[role] || role;
};

const PayrollPage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activeTab, setActiveTab] = useState<'payroll' | 'stats'>('payroll');

  const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(selectedDate), { weekStartsOn: 1 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const { data: employees, isLoading: loadingEmployees, isError: errEmp, refetch: refetchEmployees } = useEmployees();
  const { data: roles } = useRoleSalaries();

  const { data: attendanceData, isLoading: loadingAtt, isError: errAtt, refetch: refetchAtt } = useAttendance(
    selectedDate,
    format(weekStart, 'yyyy-MM-dd'),
    format(weekEnd, 'yyyy-MM-dd')
  );

  const { data: allPayrolls, isLoading: loadingPay, isError: errPay, refetch: refetchPay } = usePayrolls();
  const generateMutation = useGeneratePayroll();
  const confirmMutation = useConfirmPayroll();
  const updateStatusesMutation = useUpdatePayrollStatuses();

  const [localAttendance, setLocalAttendance] = useState<Record<string, Record<string, Partial<Attendance>>>>({});
  const [pendingPaidChanges, setPendingPaidChanges] = useState<Record<string, boolean>>({});

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

  const handleGenerate = () => {
    generateMutation.mutate(weekStartStr);
  };

  const handleTogglePaid = (id: string, currentlyPaid: boolean) => {
    setPendingPaidChanges(prev => {
      const next = { ...prev };
      const newValue = !currentlyPaid;

      // If we are reverting to original DB state, we can delete the key
      const dbRecord = currentWeekPayrolls.find(p => p.id === id);
      if (dbRecord && (dbRecord.status === 'paid') === newValue) {
        delete next[id];
      } else {
        next[id] = newValue;
      }
      return next;
    });
  };

  const handleSaveChanges = () => {
    const updates = Object.entries(pendingPaidChanges).map(([id, isPaid]) => ({
      id,
      status: isPaid ? 'paid' : 'confirmed',
    }));
    updateStatusesMutation.mutate(updates, {
      onSuccess: () => setPendingPaidChanges({})
    });
  };

  const hasPendingChanges = Object.keys(pendingPaidChanges).length > 0;
  const isLoading = loadingEmployees || loadingAtt || loadingPay;
  const isError = errEmp || errAtt || errPay;

  const currentWeekPayrolls = allPayrolls?.filter(p => p.week_start === weekStartStr) || [];

  // All employees
  const targetEmployees = employees || [];

  const payrollActions = (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
      <div className="flex items-center justify-between bg-white border border-border/80 rounded-xl overflow-hidden shadow-sm shrink-0">
        <button
          onClick={() => { setSelectedDate(format(subDays(new Date(selectedDate), 7), 'yyyy-MM-dd')); setPendingPaidChanges({}); }}
          className="p-2 sm:px-3 hover:bg-muted text-muted-foreground transition-colors border-r border-border/50 flex-1 sm:flex-none flex justify-center"
        >
          <ChevronRight className="rotate-180" size={16} />
        </button>
        <div className="px-2 sm:px-4 py-2 text-[13px] font-bold text-foreground whitespace-nowrap text-center shrink-0">
          Tuần {format(weekStart, 'dd/MM')} - {format(weekEnd, 'dd/MM')}
        </div>
        <button
          onClick={() => { setSelectedDate(format(addDays(new Date(selectedDate), 7), 'yyyy-MM-dd')); setPendingPaidChanges({}); }}
          className="p-2 sm:px-3 hover:bg-muted text-muted-foreground transition-colors border-l border-border/50 flex-1 sm:flex-none flex justify-center"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {hasPendingChanges ? (
        <button
          onClick={handleSaveChanges}
          disabled={updateStatusesMutation.isPending}
          className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-orange-500 text-white text-[13px] font-bold hover:bg-orange-600 shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50 mt-1 sm:mt-0 shrink-0"
        >
          <Check size={16} />
          {updateStatusesMutation.isPending ? 'Đang lưu...' : 'Lưu trạng thái'}
        </button>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={generateMutation.isPending}
          className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50 mt-1 sm:mt-0 shrink-0"
        >
          <Lock size={16} />
          {generateMutation.isPending ? 'Đang xử lý...' : 'Khoá sổ / Chốt lương'}
        </button>
      )}
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Bảng lương"
          description="Tính lương và chốt lương nhân viên theo tuần"
          backPath="/app/hanh-chinh-nhan-su"
          actions={payrollActions}
        />
      </div>
      <div className="md:hidden pb-3 mt-1">
        {payrollActions}
      </div>


      <div className="bg-white md:rounded-2xl md:border md:border-border sm:shadow-sm flex flex-col flex-1 min-h-0 md:overflow-hidden mt-0 md:mt-2 -mx-4 md:mx-0">
        <div className="flex border-b border-border bg-muted/20 w-full">
          <button
            onClick={() => setActiveTab('payroll')}
            className={clsx(
              "flex items-center justify-center gap-2 px-6 py-4 text-[13px] font-bold transition-all relative flex-1 md:flex-none",
              activeTab === 'payroll' 
                ? "text-primary bg-primary/5" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <FileText size={16} />
            Bảng lương
            {activeTab === 'payroll' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full shadow-[0_-2px_8px_rgba(var(--primary),0.5)]"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={clsx(
              "flex items-center justify-center gap-2 px-6 py-4 text-[13px] font-bold transition-all relative flex-1 md:flex-none",
              activeTab === 'stats' 
                ? "text-primary bg-primary/5" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <BarChart2 size={16} />
            Thống kê
            {activeTab === 'stats' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full shadow-[0_-2px_8px_rgba(var(--primary),0.5)]"></div>
            )}
          </button>
        </div>

        {activeTab === 'stats' ? (
          <div className="flex-1 overflow-auto custom-scrollbar">
            <PayrollStats />
          </div>
        ) : isLoading ? (
          <div className="p-4"><LoadingSkeleton rows={6} columns={8} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => { refetchEmployees(); refetchAtt(); refetchPay(); }} />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar">
            {/* Desktop Table View */}
            <table className="w-full text-left border-collapse min-w-[1200px] hidden md:table">
              <thead className="bg-[#f8fafc] sticky top-0 z-20 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                <tr>
                  <th className="sticky text-center left-0 z-30 bg-[#f8fafc] px-3 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider whitespace-nowrap min-w-[200px] border-b border-r border-border/50">
                    Nhân sự
                  </th>
                  {daysInWeek.map((day) => (
                    <th key={day.toISOString()} className="px-2 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider text-center border-b border-border/50 min-w-[60px]">
                      {format(day, 'EEEE', { locale: vi }).replace('thứ', 'T')}
                      <div className="text-[10px] text-muted-foreground/50 mt-0.5">{format(day, 'dd/MM')}</div>
                    </th>
                  ))}
                  <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider text-center border-b border-l border-border/50 bg-muted/10">Ngày công</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider text-right border-b border-l border-border/50">Lương/ngày</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-emerald-600 uppercase tracking-wider text-right border-b border-border/50 bg-emerald-50/30">Tổng lương</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-red-500 uppercase tracking-wider text-right border-b border-border/50 bg-red-50/30">Tạm ứng</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-emerald-700 uppercase tracking-wider text-right border-b border-border/50 bg-emerald-50/50">Thực nhận</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider text-center border-b border-l border-border/50">Trạng thái</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider text-center border-b border-l border-border/50">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {targetEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="p-8">
                      <EmptyState title="Chưa có nhân sự nào được cấu hình" />
                    </td>
                  </tr>
                ) : (
                  targetEmployees.map(e => {
                    const empAtt = localAttendance[e.id] || {};
                    let totalPresent = 0;

                    // Calculate real-time presence
                    daysInWeek.forEach(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      if (empAtt[dateStr]?.is_present) totalPresent++;
                    });

                    const employeePayroll = currentWeekPayrolls.find(p => p.employee_id === e.id);

                    // Display dynamic info if payroll not generated, else show saved data
                    const dailyWage = employeePayroll?.daily_wage || roles?.find(r => r.role_key === e.role)?.daily_wage || 0;
                    const daysWorked = employeePayroll?.days_worked ?? totalPresent;
                    const grossSalary = employeePayroll?.gross_salary ?? (daysWorked * dailyWage);
                    const totalAdvances = employeePayroll?.total_advances ?? 0;
                    const netSalary = employeePayroll?.net_salary ?? (grossSalary - totalAdvances);
                    const status = employeePayroll?.status || 'Chưa tạo';

                    const isPaidState = employeePayroll ? (pendingPaidChanges[employeePayroll.id] !== undefined ? pendingPaidChanges[employeePayroll.id] : status === 'paid') : false;

                    return (
                      <tr key={e.id} className="group hover:bg-muted/10 transition-colors">
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-muted/10 px-4 py-3 border-r border-border/10 transition-colors">
                          <div className="flex items-center gap-3">
                            {e.avatar_url ? (
                              <img loading="lazy" decoding="async" src={cloudinaryThumb(e.avatar_url)} alt="" className="w-8 h-8 rounded-lg object-cover bg-muted/30 border border-border/50 shadow-sm" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-sm">
                                <UserIcon size={14} />
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-[13px] font-bold text-foreground">{e.full_name}</span>
                              <span className="text-[10px] font-medium text-muted-foreground">{roles?.find(r => r.role_key === e.role)?.role_name || translateRole(e.role)}</span>
                            </div>
                          </div>
                        </td>

                        {daysInWeek.map((day) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const isPresent = empAtt[dateStr]?.is_present;
                          return (
                            <td key={dateStr} className="px-2 py-4 text-center border-l border-border/10 h-full">
                              <div className="flex items-center justify-center h-full">
                                {isPresent ? (
                                  <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-200">
                                    <Check size={12} className="text-emerald-600" strokeWidth={3} />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-muted/30 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-border/80"></div>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        <td className="px-4 py-3 text-center border-l border-border/10 bg-muted/5 font-bold text-[13px] text-primary tabular-nums">
                          {daysWorked}
                        </td>
                        <td className="px-4 py-3 text-right border-l border-border/10 text-[12px] text-muted-foreground tabular-nums">
                          {formatCurrency(dailyWage)}
                        </td>
                        <td className="px-4 py-3 text-right border-border/10 font-bold text-[13px] text-emerald-600 tabular-nums bg-emerald-50/20">
                          {formatCurrency(grossSalary)}
                        </td>
                        <td className="px-4 py-3 text-right border-border/10 font-bold text-[13px] text-red-500 tabular-nums bg-red-50/20">
                          {totalAdvances > 0 ? `-${formatCurrency(totalAdvances)}` : '0 đ'}
                        </td>
                        <td className="px-4 py-3 text-right border-border/10 font-bold text-[14px] text-emerald-700 tabular-nums bg-emerald-50/40">
                          {formatCurrency(netSalary)}
                        </td>
                        <td className="px-4 py-3 text-center border-l border-border/10">
                          {employeePayroll ? (
                            <StatusBadge status={isPaidState ? 'paid' : status} label={statusLabels[isPaidState ? 'paid' : status]} />
                          ) : (
                            <span className="px-2 py-1 rounded-md bg-muted text-muted-foreground text-[10px] font-bold">Chưa tạo</span>
                          )}
                        </td>
                        <td className="px-4 py-3 border-l border-border/10">
                          <div className="flex items-center justify-center gap-2">
                            {employeePayroll && (status === 'confirmed' || status === 'paid') && (
                              <label className="flex items-center gap-1.5 cursor-pointer title-tooltip" title="Xác nhận đã trả lương">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 text-emerald-500 rounded border-border/50 focus:ring-emerald-500/20"
                                  checked={isPaidState}
                                  onChange={() => handleTogglePaid(employeePayroll.id, isPaidState)}
                                />
                                <span className="text-[11px] font-medium text-muted-foreground">Đã trả</span>
                              </label>
                            )}
                            {status === 'draft' && employeePayroll && (
                              <button
                                onClick={() => confirmMutation.mutate(employeePayroll.id)}
                                disabled={confirmMutation.isPending}
                                className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors bg-blue-50/50"
                                title="Chốt lương"
                              >
                                <Lock size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Mobile Card View */}
            <div className="flex flex-col gap-3 p-3 md:hidden bg-slate-50/50 min-h-full pb-20">
              {targetEmployees.length === 0 ? (
                <EmptyState title="Chưa có nhân sự nào được cấu hình" />
              ) : (
                targetEmployees.map(e => {
                  const empAtt = localAttendance[e.id] || {};
                  let totalPresent = 0;

                  daysInWeek.forEach(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    if (empAtt[dateStr]?.is_present) totalPresent++;
                  });

                  const employeePayroll = currentWeekPayrolls.find(p => p.employee_id === e.id);

                  const dailyWage = employeePayroll?.daily_wage || roles?.find(r => r.role_key === e.role)?.daily_wage || 0;
                  const daysWorked = employeePayroll?.days_worked ?? totalPresent;
                  const grossSalary = employeePayroll?.gross_salary ?? (daysWorked * dailyWage);
                  const totalAdvances = employeePayroll?.total_advances ?? 0;
                  const netSalary = employeePayroll?.net_salary ?? (grossSalary - totalAdvances);
                  const status = employeePayroll?.status || 'Chưa tạo';

                  const isPaidState = employeePayroll ? (pendingPaidChanges[employeePayroll.id] !== undefined ? pendingPaidChanges[employeePayroll.id] : status === 'paid') : false;

                  return (
                    <div key={e.id} className="bg-white rounded-xl border border-border/60 shadow-sm p-4 flex flex-col gap-3 relative overflow-hidden">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${isPaidState ? 'bg-emerald-500' : status === 'confirmed' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                      
                      <div className="flex justify-between items-start pl-1">
                        <div className="flex items-center gap-3 min-w-0">
                          {e.avatar_url ? (
                            <img loading="lazy" decoding="async" src={cloudinaryThumb(e.avatar_url)} alt="" className="w-10 h-10 rounded-full object-cover bg-muted/30 border border-border/50 shadow-sm shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-sm shrink-0">
                              <span className="font-bold text-[14px]">
                                {e.full_name?.trim().split(' ').pop()?.[0]?.toUpperCase() || 'U'}
                              </span>
                            </div>
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="text-[14px] font-bold text-foreground line-clamp-1">{e.full_name}</span>
                            <span className="text-[11px] font-medium text-muted-foreground">{roles?.find(r => r.role_key === e.role)?.role_name || translateRole(e.role)}</span>
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {employeePayroll ? (
                            <StatusBadge status={isPaidState ? 'paid' : status} label={statusLabels[isPaidState ? 'paid' : status]} />
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted font-bold text-muted-foreground">Chưa tạo</span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-1 pl-1">
                        <div className="bg-red-50/30 border border-red-100 rounded-lg p-2.5 flex flex-col items-center justify-center text-center overflow-hidden">
                          <span className="text-[11px] text-red-600/80 font-medium whitespace-nowrap">Tạm ứng</span>
                          <span className="text-[13px] sm:text-[14px] font-bold text-red-600 tabular-nums truncate w-full">{totalAdvances > 0 ? `-${formatCurrency(totalAdvances)}` : '0 đ'}</span>
                        </div>
                        <div className="bg-emerald-50/30 border border-emerald-100 rounded-lg p-2.5 flex flex-col items-center justify-center text-center overflow-hidden">
                          <span className="text-[11px] text-emerald-600/80 font-medium whitespace-nowrap">Thực nhận</span>
                          <span className="text-[13px] sm:text-[14px] font-bold text-emerald-700 tabular-nums truncate w-full">{formatCurrency(netSalary)}</span>
                        </div>
                      </div>

                      <div className="border-t border-border/40 pt-2 mt-2 pl-1 flex items-center justify-between min-h-[36px]">
                        <span className="text-[12px] font-medium text-muted-foreground">
                          Ngày công: <span className="font-bold text-primary text-[13px]">{daysWorked}</span>
                        </span>
                        
                        {employeePayroll && (status === 'confirmed' || status === 'paid') ? (
                          <label className="flex items-center gap-1.5 cursor-pointer title-tooltip p-1.5 bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-100 rounded-lg transition-colors" title="Xác nhận đã trả lương">
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-emerald-500 rounded border-border/50 focus:ring-emerald-500/20"
                              checked={isPaidState}
                              onChange={() => handleTogglePaid(employeePayroll.id, isPaidState)}
                            />
                            <span className="text-[12px] font-bold text-emerald-700">Đã thanh toán</span>
                          </label>
                        ) : status === 'draft' && employeePayroll ? (
                          <button
                            onClick={() => confirmMutation.mutate(employeePayroll.id)}
                            disabled={confirmMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors text-[12px] font-bold border border-blue-100"
                          >
                            <Lock size={14} />
                            Chốt lương
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {activeTab === 'payroll' && (
        <div className="mt-4 bg-muted/30 border border-border rounded-2xl p-4 hidden md:flex items-center gap-6 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-200">
              <Check size={10} className="text-emerald-600" strokeWidth={3} />
            </div>
            <span className="text-[12px] font-bold text-muted-foreground">Đi làm</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-muted/30 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-border/80"></div>
            </div>
            <span className="text-[12px] font-bold text-muted-foreground">Không làm</span>
          </div>
          <div className="flex-1 text-right text-[12px] font-medium text-muted-foreground">
            Bấm <span className="font-bold">Khoá sổ / Chốt lương tuần</span> để lưu và chốt dữ liệu từ bảng chấm công vào cơ sở dữ liệu.
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollPage;
