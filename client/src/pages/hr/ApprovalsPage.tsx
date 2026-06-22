import React, { useState } from 'react';
import PageHeader from '../../components/shared/PageHeader';
import { useSalaryAdvances, useCompensatoryAttendances, useApproveSalaryAdvance, useReviewCompensatoryAttendance, useLeaveRequests, useReviewLeaveRequest } from '../../hooks/queries/useHR';
import { usePayrolls, useConfirmPayroll } from '../../hooks/queries/usePayroll';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import { Check, X, FileText, Banknote, Clock, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

const ApprovalsPage = () => {
  const [activeTab, setActiveTab] = useState<'payroll' | 'advance' | 'compensatory' | 'leave'>('payroll');

  const tabs = [
    { id: 'payroll', label: 'Phiếu lương', icon: <FileText size={16} /> },
    { id: 'advance', label: 'Đơn ứng lương', icon: <Banknote size={16} /> },
    { id: 'compensatory', label: 'Chấm công bù', icon: <Clock size={16} /> },
    { id: 'leave', label: 'Đơn nghỉ phép', icon: <Calendar size={16} /> },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <PageHeader
        title="Duyệt đơn"
        description="Quản lý và xét duyệt các yêu cầu từ nhân viên"
        backPath="/app/hanh-chinh-nhan-su"
      />

      <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden mt-4">
        {/* Tabs Headers */}
        <div className="flex border-b border-border bg-muted/20">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'payroll' | 'advance' | 'compensatory' | 'leave')}
              className={clsx(
                "flex items-center gap-2 px-6 py-4 text-[13px] font-bold transition-all relative",
                activeTab === tab.id 
                  ? "text-primary bg-primary/5" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full shadow-[0_-2px_8px_rgba(var(--primary),0.5)]"></div>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto custom-scrollbar p-0">
          {activeTab === 'payroll' && <PayrollApprovalTab />}
          {activeTab === 'advance' && <AdvanceApprovalTab />}
          {activeTab === 'compensatory' && <CompensatoryApprovalTab />}
          {activeTab === 'leave' && <LeaveApprovalTab />}
        </div>
      </div>
    </div>
  );
};

export default ApprovalsPage;

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

const PayrollApprovalTab = () => {
  const { data, isLoading } = usePayrolls();
  const confirmPayroll = useConfirmPayroll();

  const handleApprove = async (id: string) => {
    await confirmPayroll.mutateAsync(id);
  };

  if (isLoading) return <div className="p-6"><LoadingSkeleton columns={3} rows={4} /></div>;

  const waitings = data?.filter(item => item.status === 'draft') || [];
  const approveds = data?.filter(item => item.status === 'confirmed' || item.status === 'paid') || [];

  return (
    <div className="flex flex-col">
      <ApprovalTable 
        title="Chờ duyệt"
        items={waitings}
        emptyMessage="Không có phiếu lương chờ duyệt"
        renderRow={(item) => (
          <tr key={item.id} className="border-b border-border hover:bg-muted/30">
            <td className="p-4 font-semibold text-[13px]">{item.profiles?.full_name}</td>
            <td className="p-4 text-[13px]">Tuần {format(new Date(item.week_start), 'dd/MM')} - {format(new Date(item.week_end), 'dd/MM')}</td>
            <td className="p-4 text-[13px] font-bold text-emerald-600">{formatCurrency(item.net_salary)}</td>
            <td className="p-4 text-right">
              <button 
                onClick={() => handleApprove(item.id)}
                disabled={confirmPayroll.isPending}
                className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <Check size={14} /> Duyệt sổ
              </button>
            </td>
          </tr>
        )}
      />

      {approveds.length > 0 && (
        <div className="mt-8 border-t border-border border-dashed">
          <ApprovalTable 
            title="Đã duyệt gần đây"
            items={approveds}
            emptyMessage=""
            renderRow={(item) => (
              <tr key={item.id} className="border-b border-border hover:bg-muted/30 opacity-70">
                <td className="p-4 font-semibold text-[13px]">{item.profiles?.full_name}</td>
                <td className="p-4 text-[13px]">Tuần {format(new Date(item.week_start), 'dd/MM')} - {format(new Date(item.week_end), 'dd/MM')}</td>
                <td className="p-4 text-[13px]">Đã duyệt</td>
                <td className="p-4 text-right text-[12px] text-muted-foreground">
                  (Bởi manager lúc {item.approved_at ? format(new Date(item.approved_at), 'dd/MM HH:mm') : 'N/A'})
                </td>
              </tr>
            )}
          />
        </div>
      )}
    </div>
  );
};

const AdvanceApprovalTab = () => {
  const { data, isLoading } = useSalaryAdvances();
  const approveAdvance = useApproveSalaryAdvance();

  const handleApprove = async (id: string) => {
    await approveAdvance.mutateAsync(id);
  };

  const handleReject = async () => {
    // Current setup doesn't have a reject advance API in HR controller, but it could be added.
    toast.error('Chức năng từ chối đang được cập nhật');
  };

  if (isLoading) return <div className="p-6"><LoadingSkeleton columns={3} rows={4} /></div>;

  const waitings = data?.filter(item => item.status === 'pending') || [];
  const approveds = data?.filter(item => item.status !== 'pending') || [];

  return (
    <div className="flex flex-col">
       <ApprovalTable 
        title="Chờ duyệt"
        items={waitings}
        emptyMessage="Không có đơn ứng lương chờ duyệt"
        renderRow={(item) => (
          <tr key={item.id} className="border-b border-border hover:bg-muted/30">
            <td className="p-4">
              <div className="font-semibold text-[13px]">{item.profiles?.full_name}</div>
              <div className="text-[11px] text-muted-foreground mt-1">Lý do: {item.reason}</div>
            </td>
            <td className="p-4 text-[13px] text-gray-500">Ngày tạo: {format(new Date(item.created_at), 'dd/MM/yyyy')}</td>
            <td className="p-4 text-[13px] font-bold text-emerald-600">{formatCurrency(item.amount)}</td>
            <td className="p-4 text-right">
               <div className="flex items-center justify-end gap-2">
                  <button onClick={() => handleReject()} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 flex items-center gap-1">
                    <X size={14} /> Từ chối
                  </button>
                  <button onClick={() => handleApprove(item.id)} disabled={approveAdvance.isPending} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-100 flex items-center gap-1 disabled:opacity-50">
                    <Check size={14} /> Duyệt
                  </button>
               </div>
            </td>
          </tr>
        )}
      />

       {approveds.length > 0 && (
         <div className="mt-8 border-t border-border border-dashed">
            <ApprovalTable 
              title="Lịch sử duyệt"
              items={approveds}
              emptyMessage=""
              renderRow={(item) => (
                <tr key={item.id} className="border-b border-border hover:bg-muted/30 opacity-70">
                  <td className="p-4 font-semibold text-[13px]">{item.profiles?.full_name}</td>
                  <td className="p-4 text-[13px]">{formatCurrency(item.amount)}</td>
                  <td className="p-4 text-[13px]">
                     <span className={item.status === 'approved' ? 'text-emerald-600' : 'text-red-600'}>
                       {item.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                     </span>
                  </td>
                  <td className="p-4 text-right text-[12px] text-muted-foreground">
                    Lúc: {item.approved_at ? format(new Date(item.approved_at), 'dd/MM HH:mm') : ''}
                  </td>
                </tr>
              )}
            />
         </div>
       )}
    </div>
  );
};

const CompensatoryApprovalTab = () => {
  const { data, isLoading } = useCompensatoryAttendances();
  const reviewReq = useReviewCompensatoryAttendance();

  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    await reviewReq.mutateAsync({ id, status });
  };

  if (isLoading) return <div className="p-6"><LoadingSkeleton columns={3} rows={4} /></div>;

  const waitings = data?.filter(item => item.status === 'pending') || [];
  const approveds = data?.filter(item => item.status !== 'pending') || [];

  return (
    <div className="flex flex-col">
       <ApprovalTable 
        title="Yêu cầu chờ duyệt"
        items={waitings}
        emptyMessage="Không có phiếu chấm công bù chờ duyệt"
        renderRow={(item) => (
          <tr key={item.id} className="border-b border-border hover:bg-muted/30">
            <td className="p-4">
              <div className="font-semibold text-[13px]">{item.profiles?.full_name}</div>
              <div className="text-[11px] text-amber-600 mt-1 bg-amber-50 rounded-md px-2 py-1 inline-block">Ngày bù: {format(new Date(item.work_date), 'dd/MM/yyyy')}</div>
            </td>
            <td className="p-4 text-[12px]">
              <div>Giờ chấm công: {item.check_in_time?.substring(0,5) || '--:--'}</div>
            </td>
            <td className="p-4 text-[12px] italic opacity-80 max-w-[200px] truncate" title={item.reason}>
              "{item.reason}"
            </td>
            <td className="p-4 text-right">
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => handleReview(item.id, 'rejected')} disabled={reviewReq.isPending} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 flex items-center gap-1">
                  <X size={14} /> Từ chối
                </button>
                <button onClick={() => handleReview(item.id, 'approved')} disabled={reviewReq.isPending} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-100 flex items-center gap-1">
                  <Check size={14} /> Duyệt
                </button>
              </div>
            </td>
          </tr>
        )}
      />

       {approveds.length > 0 && (
          <div className="mt-8 border-t border-border border-dashed">
            <ApprovalTable 
              title="Lịch sử duyệt chấm công bù"
              items={approveds}
              emptyMessage=""
              renderRow={(item) => (
                <tr key={item.id} className="border-b border-border hover:bg-muted/30 opacity-70">
                  <td className="p-4 font-semibold text-[13px]">{item.profiles?.full_name}</td>
                  <td className="p-4 text-[13px]">Ngày bù: {format(new Date(item.work_date), 'dd/MM')}</td>
                  <td className="p-4 text-[13px]">
                     <span className={item.status === 'approved' ? 'text-emerald-600' : 'text-red-600'}>
                       {item.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                     </span>
                  </td>
                  <td className="p-4 text-right text-[12px] text-muted-foreground">
                    Lúc: {item.approved_at ? format(new Date(item.approved_at), 'dd/MM HH:mm') : ''}
                  </td>
                </tr>
              )}
            />
          </div>
       )}
    </div>
  );
};

const LeaveApprovalTab = () => {
  const { data, isLoading } = useLeaveRequests();
  const reviewLeave = useReviewLeaveRequest();

  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    await reviewLeave.mutateAsync({ id, payload: { status } });
  };

  if (isLoading) return <div className="p-6"><LoadingSkeleton columns={3} rows={4} /></div>;

  const waitings = data?.filter(item => item.status === 'pending') || [];
  const approveds = data?.filter(item => item.status !== 'pending') || [];

  return (
    <div className="flex flex-col">
       <ApprovalTable 
        title="Đơn nghỉ phép chờ duyệt"
        items={waitings}
        emptyMessage="Không có đơn nghỉ phép chờ duyệt"
        renderRow={(item) => (
          <tr key={item.id} className="border-b border-border hover:bg-muted/30">
            <td className="p-4">
              <div className="font-semibold text-[13px]">{item.profiles?.full_name}</div>
              <div className="text-[11px] text-blue-600 mt-1 bg-blue-50 rounded-md px-2 py-1 inline-block">Ngày tạo: {format(new Date(item.created_at || new Date()), 'dd/MM/yyyy')}</div>
            </td>
            <td className="p-4 text-[12px] text-muted-foreground whitespace-nowrap">
              {item.from_date} <br/> - {item.to_date}
            </td>
            <td className="p-4 text-[12px] italic opacity-80 max-w-[200px] truncate" title={item.reason}>
              "{item.reason}"
            </td>
            <td className="p-4 text-right">
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => handleReview(item.id, 'rejected')} disabled={reviewLeave.isPending} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 flex items-center gap-1">
                  <X size={14} /> Từ chối
                </button>
                <button onClick={() => handleReview(item.id, 'approved')} disabled={reviewLeave.isPending} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-100 flex items-center gap-1">
                  <Check size={14} /> Duyệt
                </button>
              </div>
            </td>
          </tr>
        )}
      />

       {approveds.length > 0 && (
          <div className="mt-8 border-t border-border border-dashed">
            <ApprovalTable 
              title="Lịch sử duyệt đơn nghỉ phép"
              items={approveds}
              emptyMessage=""
              renderRow={(item) => (
                <tr key={item.id} className="border-b border-border hover:bg-muted/30 opacity-70">
                  <td className="p-4 font-semibold text-[13px]">{item.profiles?.full_name}</td>
                  <td className="p-4 text-[13px] whitespace-nowrap">{item.from_date} đến {item.to_date}</td>
                  <td className="p-4 text-[13px]">
                     <span className={item.status === 'approved' ? 'text-emerald-600' : 'text-red-600'}>
                       {item.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                     </span>
                  </td>
                  <td className="p-4 text-right text-[12px] text-muted-foreground">
                    Lúc: {item.reviewed_at ? format(new Date(item.reviewed_at), 'dd/MM HH:mm') : ''}
                  </td>
                </tr>
              )}
            />
          </div>
       )}
    </div>
  );
};

// Generic Table wrapper for Approval tabs
const ApprovalTable = ({ title, items, emptyMessage, renderRow }: { title: string, items: any[], emptyMessage: string, renderRow: (item: any) => React.ReactNode }) => {
  return (
    <div className="p-6">
      <h3 className="text-[13px] font-bold text-primary mb-4 flex items-center gap-2">
        <div className="w-1.5 h-4 bg-primary rounded-full"></div>
        {title} ({items.length})
      </h3>
      
      {items.length === 0 ? (
        <EmptyState title={emptyMessage} />
      ) : (
        <div className="overflow-x-auto border border-border rounded-xl">
          <table className="w-full text-left border-collapse">
            <tbody className="divide-y divide-border/50 bg-card">
              {items.map(renderRow)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
