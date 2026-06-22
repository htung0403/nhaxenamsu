import React from 'react';
import PageHeader from '../../components/shared/PageHeader';
import { useLeaveRequests, useReviewLeaveRequest } from '../../hooks/queries/useHR';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import StatusBadge from '../../components/shared/StatusBadge';
import DraggableFAB from '../../components/shared/DraggableFAB';
import { Plus, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import AddLeaveRequestDialog from './dialogs/AddLeaveRequestDialog';

const statusLabels: Record<string, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};

const LeaveRequestsPage: React.FC = () => {
  const { user } = useAuth();
  // Filter by user ID if not manager/admin
  const requestUserId = ['admin', 'manager'].includes(user?.role || '') ? undefined : user?.id;

  const { data: requests, isLoading, isError, refetch } = useLeaveRequests(requestUserId);
  const reviewMutation = useReviewLeaveRequest();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddClosing, setIsAddClosing] = useState(false);

  const closeAddDialog = () => {
    setIsAddClosing(true);
    setTimeout(() => {
      setIsAddOpen(false);
      setIsAddClosing(false);
    }, 350);
  };

  const handleReview = (id: string, status: 'approved' | 'rejected') => {
    reviewMutation.mutate({ id, payload: { status } });
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Nghỉ phép"
          description="Quản lý đơn nghỉ phép"
          backPath="/app/hanh-chinh-nhan-su"
          actions={
            <button
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
            >
              <Plus size={16} />
              Tạo đơn nghỉ
            </button>
          }
        />
      </div>
      <DraggableFAB icon={<Plus size={24} />} onClick={() => setIsAddOpen(true)} />
      <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0">
        {isLoading ? (
          <div className="p-4"><LoadingSkeleton rows={5} columns={5} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !requests?.length ? (
          <EmptyState title="Chưa có đơn nghỉ phép" />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar">
            {/* Desktop Table View */}
            <table className="w-full border-collapse hidden md:table">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Nhân viên</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Từ ngày</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Đến ngày</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Lý do</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center">Trạng thái</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-[13px] font-bold text-foreground">{r.profiles?.full_name || '-'}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums">{r.from_date}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums">{r.to_date}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{r.reason || '-'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={r.status} label={statusLabels[r.status]} /></td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {r.status === 'pending' && (
                          <button
                            onClick={() => handleReview(r.id, 'rejected')}
                            disabled={reviewMutation.isPending}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-1 "
                            title="Hủy đơn"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Card View */}
            <div className="flex flex-col gap-3 p-3 md:hidden bg-muted/50 min-h-full pb-20">
              {requests.map((r) => (
                <div key={r.id} className="bg-card rounded-xl border border-border/60 shadow-sm p-4 flex flex-col gap-3 relative overflow-hidden">
                  {/* Status Indicator Line */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${r.status === 'approved' ? 'bg-emerald-500' : r.status === 'rejected' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  
                  <div className="flex items-start justify-between gap-3 pl-1">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20 shadow-inner">
                        <span className="font-bold text-[14px]">
                          {r.profiles?.full_name?.trim().split(' ').pop()?.[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[14px] font-bold text-foreground line-clamp-1">{r.profiles?.full_name || 'Không xác định'}</span>
                        <div className="flex flex-col mt-0.5">
                          <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded w-fit border border-emerald-100">
                            Từ: {r.from_date}
                          </span>
                          <span className="text-[11px] font-medium text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded w-fit border border-rose-100 mt-1">
                            Đến: {r.to_date}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 pt-1">
                      <StatusBadge status={r.status} label={statusLabels[r.status]} />
                    </div>
                  </div>

                  {r.reason && (
                    <div className="pl-1 mt-1">
                      <div className="p-2.5 bg-muted/20 rounded-lg border border-border/50 text-[12px] text-muted-foreground leading-relaxed">
                        <span className="font-semibold text-foreground/70">Lý do: </span>
                        {r.reason}
                      </div>
                    </div>
                  )}

                  {r.status === 'pending' && (
                    <div className="pl-1 pt-2 mt-1 border-t border-border/40 flex justify-end">
                      <button
                        onClick={() => handleReview(r.id, 'rejected')}
                        disabled={reviewMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors text-[12px] font-bold border border-red-100 active:scale-95"
                      >
                        <XCircle size={14} />
                        Hủy bỏ
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AddLeaveRequestDialog
        isOpen={isAddOpen}
        isClosing={isAddClosing}
        onClose={closeAddDialog}
      />
    </div>
  );
};

export default LeaveRequestsPage;
