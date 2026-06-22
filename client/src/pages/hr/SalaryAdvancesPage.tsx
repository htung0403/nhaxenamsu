import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '../../components/shared/PageHeader';
import { useSalaryAdvances, useCreateSalaryAdvance } from '../../hooks/queries/useHR';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import StatusBadge from '../../components/shared/StatusBadge';
import DraggableFAB from '../../components/shared/DraggableFAB';
import { format } from 'date-fns';
import { Plus, Banknote, X, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

const SalaryAdvancesPage = () => {
  const { data: advances, isLoading, isError, refetch } = useSalaryAdvances();
  const createMutation = useCreateSalaryAdvance();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const closeDialog = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsDialogOpen(false);
      setIsClosing(false);
    }, 300);
  };
  const [formData, setFormData] = useState({
    amount: '',
    reason: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      amount: Number(formData.amount.toString().replace(/\D/g, '')),
      reason: formData.reason
    }, {
      onSuccess: () => {
        closeDialog();
        setTimeout(() => {
          setFormData({
            amount: '',
            reason: '',
          });
        }, 300);
      }
    });
  };

  const statusLabels: Record<string, string> = {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Đã từ chối'
  };

  const statusColors: Record<string, 'pending' | 'success' | 'error' | 'default'> = {
    pending: 'pending',
    approved: 'success',
    rejected: 'error'
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Ứng lương"
          description="Đơn ứng lương sẽ được trừ vào phiếu lương ở tuần tương ứng"
          backPath="/app/hanh-chinh-nhan-su"
          actions={
            <button
              onClick={() => setIsDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
            >
              <Plus size={16} />
              Tạo đơn ứng lương
            </button>
          }
        />
      </div>
      <DraggableFAB icon={<Plus size={24} />} onClick={() => setIsDialogOpen(true)} />

      <div className="bg-card justify-between rounded-2xl md:border md:border-border sm:shadow-sm flex flex-col flex-1 min-h-0 mt-0 md:mt-4">
        {isLoading ? (
          <div className="p-4"><LoadingSkeleton columns={4} rows={6} /></div>
        ) : isError ? (
          <ErrorState onRetry={refetch} />
        ) : !advances || advances.length === 0 ? (
          <EmptyState title="Chưa có đơn ứng lương nào" />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar">
            {/* Desktop Table View */}
            <table className="w-full text-left border-collapse hidden md:table">
              <thead className="bg-muted/30 sticky top-0 z-10 backdrop-blur-xl">
                <tr>
                  <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider whitespace-nowrap min-w-[250px] border-b border-border/50">Lý do</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider whitespace-nowrap min-w-[150px] border-b border-l border-border/50">Tuần nhận lương</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-emerald-600 uppercase tracking-wider text-right whitespace-nowrap min-w-[150px] border-b border-l border-border/50 bg-emerald-50/30">Số tiền ứng</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider text-center whitespace-nowrap border-b border-l border-border/50 bg-muted/10">Trạng thái</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider whitespace-nowrap border-b border-l border-border/50 text-right">Ngày gửi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {advances.map(a => (
                  <tr key={a.id} className="group hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4 border-r border-border/10">
                      <div className="text-[14px] font-medium text-foreground">{a.reason}</div>
                    </td>
                    <td className="px-6 py-4 border-r border-border/10 text-[13px] text-muted-foreground">
                       {a.week_start ? `Tuần ${format(new Date(a.week_start), 'dd/MM/yyyy')}` : 'Không xác định'}
                    </td>
                    <td className="px-6 py-4 text-right border-border/10 font-bold text-[14px] text-emerald-600 tabular-nums bg-emerald-50/20">
                      {formatCurrency(a.amount)}
                    </td>
                    <td className="px-6 py-4 text-center border-l border-border/10 bg-muted/5">
                      <StatusBadge status={statusColors[a.status] || 'default'} label={statusLabels[a.status] || a.status} />
                    </td>
                    <td className="px-6 py-4 text-right border-l border-border/10 text-[13px] text-muted-foreground">
                       {format(new Date(a.created_at || new Date()), 'HH:mm dd/MM/yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Card View */}
            <div className="flex flex-col gap-3 p-3 md:hidden bg-muted/50 min-h-full pb-20">
              {advances.map(a => (
                <div key={a.id} className="bg-card rounded-xl border border-border/60 shadow-sm p-4 flex flex-col gap-3 relative overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${a.status === 'approved' ? 'bg-emerald-500' : a.status === 'rejected' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  
                  <div className="flex justify-between items-start pl-1 mb-1">
                     <div className="flex flex-col">
                       <span className="text-[14px] font-bold text-foreground">{a.reason}</span>
                       <span className="text-[11px] text-muted-foreground mt-0.5">{format(new Date(a.created_at || new Date()), 'HH:mm dd/MM/yyyy')}</span>
                     </div>
                     <StatusBadge status={statusColors[a.status] || 'default'} label={statusLabels[a.status] || a.status} />
                  </div>

                  <div className="flex items-center justify-between bg-muted/20 rounded-lg p-2.5 ml-1 border border-border/50">
                     <div className="flex flex-col">
                        <span className="text-[11px] text-muted-foreground font-medium">Tuần nhận lương</span>
                        <span className="text-[13px] font-bold text-foreground">{a.week_start ? `Tuần ${format(new Date(a.week_start), 'dd/MM/yyyy')}` : 'Không xác định'}</span>
                     </div>
                     <div className="flex flex-col items-end">
                        <span className="text-[11px] text-emerald-600/80 font-medium">Số tiền ứng</span>
                        <span className="text-[14px] font-bold text-emerald-600 tabular-nums">{formatCurrency(a.amount)}</span>
                     </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {(isDialogOpen || isClosing) && createPortal(
        <div className="fixed inset-0 z-[9999] flex justify-end">
          {/* Backdrop */}
          <div
            className={clsx(
              'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-350 ease-out',
              isClosing ? 'opacity-0' : 'animate-in fade-in duration-300',
            )}
            onClick={closeDialog}
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
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <Banknote size={20} />
                </div>
                <h2 className="text-lg font-bold text-foreground">Tạo đơn ứng lương</h2>
              </div>
              <button
                onClick={closeDialog}
                className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
                title="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Body */}
            <form id="advance-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                 Khoản ứng sẽ được trừ trực tiếp vào lương của tuần bạn chọn bên dưới.
              </p>
              
              <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
                  <Banknote size={16} className="text-emerald-500" />
                  <span className="text-[12px] font-bold text-emerald-500 uppercase tracking-wider">Thông tin ứng lương</span>
                </div>
                <div className="p-5 grid grid-cols-1 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-foreground">Số tiền ứng <span className="text-red-500">*</span></label>
                    <div className="relative">
                       <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₫</span>
                       <input
                         type="text"
                         required
                         value={formData.amount}
                         onChange={e => {
                           const rawValue = e.target.value.replace(/\D/g, '');
                           const formattedValue = rawValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                           setFormData({ ...formData, amount: formattedValue });
                         }}
                         className="flex h-11 w-full rounded-xl border border-border/80 bg-background pl-8 pr-3 py-2 text-[14px] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all font-medium text-emerald-600"
                         placeholder="Ví dụ: 500,000"
                       />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-foreground">Lý do ứng <span className="text-red-500">*</span></label>
                    <input
                      className="flex h-11 w-full rounded-xl border border-border/80 bg-background px-3 py-2 text-[14px] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all font-medium"
                      required
                      value={formData.reason}
                      onChange={(e: any) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Nhập lý do"
                    />
                  </div>
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="bg-card border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={closeDialog}
                className="px-6 py-2 rounded-xl border border-border hover:bg-muted text-foreground text-[13px] font-bold transition-all"
              >
                Hủy
              </button>
              <button 
                type="submit"
                form="advance-form"
                disabled={createMutation.isPending}
                className={clsx(
                  "flex items-center gap-2 px-8 py-2 rounded-xl text-[13px] font-bold shadow-lg transition-all group",
                  createMutation.isPending 
                    ? "bg-emerald-500/50 text-white/60 cursor-wait" 
                    : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20"
                )}
              >
                {createMutation.isPending ? 'Đang gửi...' : 'Gửi đơn'}
                {!createMutation.isPending && <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default SalaryAdvancesPage;
