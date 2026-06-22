import React, { useState } from 'react';
import PageHeader from '../../components/shared/PageHeader';
import { useRoleSalaries, useUpsertRoleSalary, useDeleteRoleSalary } from '../../hooks/queries/usePriceSettings';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import ErrorState from '../../components/shared/ErrorState';
import { toast } from 'react-hot-toast';
import { Plus, Save, Trash2, Edit2, Loader2, UserCog, X, ShieldCheck, ChevronRight, Coins, Info } from 'lucide-react';
import type { RoleSalary } from '../../types';
import { createPortal } from 'react-dom';
import DraggableFAB from '../../components/shared/DraggableFAB';

const SalarySettingsPage: React.FC = () => {
  const { data: roles, isLoading, isError, refetch } = useRoleSalaries();
  const upsertMutation = useUpsertRoleSalary();
  const deleteMutation = useDeleteRoleSalary();

  const [isEditing, setIsEditing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [editingRole, setEditingRole] = useState<Partial<RoleSalary> | null>(null);

  const handleOpenDialog = (role?: RoleSalary) => {
    if (role) {
      setEditingRole(role);
    } else {
      setEditingRole({ role_key: '', role_name: '', daily_wage: 0, description: '' });
    }
    setIsEditing(true);
    setIsClosing(false);
  };

  const handleCloseDialog = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsEditing(false);
      setIsClosing(false);
      setEditingRole(null);
    }, 300);
  };

  const handleSave = () => {
    if (!editingRole?.role_name) return;
    
    // Check duplicate name (if creating new or changing name)
    const normalizedNewName = editingRole.role_name.trim().toLowerCase();
    const isDuplicate = roles?.some(r => 
      r.id !== editingRole.id && 
      r.role_name.trim().toLowerCase() === normalizedNewName
    );

    if (isDuplicate) {
      toast.error('Tên cấp bậc này đã tồn tại, vui lòng chọn tên khác');
      return;
    }

    // Auto-generate key from name if not present (only for new roles)
    const key = editingRole.role_key || editingRole.role_name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove tone marks
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, '_');

    upsertMutation.mutate({
      role_key: key,
      role_name: editingRole.role_name.trim(),
      daily_wage: editingRole.daily_wage || 0,
      description: editingRole.description
    } as any, {
      onSuccess: () => handleCloseDialog()
    });
  };

  const handleDelete = (key: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa cấp bậc này?')) {
      deleteMutation.mutate(key);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Quản lý cấp bậc & Lương"
          description="Cấu hình các vai trò trong hệ thống và mức lương tương ứng"
          backPath="/app/hanh-chinh-nhan-su"
          actions={
            <button
              onClick={() => handleOpenDialog()}
              className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95"
            >
              <Plus size={16} />
              Thêm cấp bậc
            </button>
          }
        />
      </div>

      <div className="md:bg-card md:rounded-2xl md:border md:border-border md:shadow-sm flex flex-col flex-1 min-h-0 md:overflow-hidden -mx-4 sm:mx-0">
        {isLoading ? (
          <div className="p-6"><LoadingSkeleton rows={5} columns={5} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar">
            {/* Desktop View */}
            <div className="hidden md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-left w-1/4">Tên Cấp Bậc</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right w-1/5">Lương/Ngày</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-left">Mô tả</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center w-32">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {roles?.map((role) => (
                    <tr key={role.id} className="hover:bg-muted/10 transition-colors group">
                      <td className="px-6 py-4">
                        <span className="text-[14px] font-bold text-foreground">{role.role_name}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-[14px] font-bold text-emerald-600 tabular-nums">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(role.daily_wage)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[13px] text-muted-foreground block" title={role.description}>
                          {role.description || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2 transition-opacity">
                          <button
                            onClick={() => handleOpenDialog(role)}
                            className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors bg-blue-50/50"
                            title="Chỉnh sửa"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(role.role_key)}
                            disabled={deleteMutation.isPending}
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors bg-red-50/50"
                            title="Xóa"
                          >
                            {deleteMutation.isPending && deleteMutation.variables === role.role_key ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden flex flex-col gap-3 px-4 pb-24 pt-2">
              {roles?.map((role) => (
                <div key={role.id} className="p-4 flex flex-col gap-3 bg-card rounded-2xl border border-border shadow-sm active:scale-[0.98] transition-transform">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <span className="text-[15px] font-bold text-foreground block">{role.role_name}</span>
                      {role.description && (
                        <span className="text-[13px] text-muted-foreground block line-clamp-2">
                          {role.description}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleOpenDialog(role)}
                        className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors bg-blue-50/50"
                        title="Chỉnh sửa"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(role.role_key)}
                        disabled={deleteMutation.isPending}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors bg-red-50/50"
                        title="Xóa"
                      >
                        {deleteMutation.isPending && deleteMutation.variables === role.role_key ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="px-2.5 py-1.5 rounded-md bg-emerald-50 border border-emerald-100/50 flex items-center gap-1.5">
                      <Coins size={14} className="text-emerald-600" />
                      <span className="text-[13px] font-bold text-emerald-600">
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(role.daily_wage)} / Ngày
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DraggableFAB
        icon={<Plus size={24} />}
        onClick={() => handleOpenDialog()}
        className="bg-primary text-white w-14 h-14 rounded-full"
      />

      {/* Right Side Panel Dialog */}
      {(isEditing || isClosing) && createPortal(
        <div className="fixed inset-0 z-[9999] flex justify-end overflow-hidden">
          {/* Backdrop */}
          <div 
            className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`} 
            onClick={handleCloseDialog} 
          />
          
          {/* Panel */}
          <div className={`relative w-full max-w-[500px] bg-background shadow-2xl flex flex-col md:h-screen h-[100dvh] border-l border-border transition-transform duration-300 ${isClosing ? 'translate-x-full' : 'translate-x-0 animate-in slide-in-from-right'}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <UserCog size={20} />
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  {editingRole?.id ? 'Chỉnh sửa cấp bậc' : 'Thêm cấp bậc mới'}
                </h2>
              </div>
              <button 
                onClick={handleCloseDialog} 
                className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Basic Info Section */}
              <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-primary" />
                  <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Thông tin định danh</span>
                </div>
                <div className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-foreground">Tên Cấp Bậc hiển thị <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={editingRole?.role_name}
                      onChange={(e) => setEditingRole({...editingRole, role_name: e.target.value})}
                      placeholder="ví dụ: Nhân viên giao hàng"
                      className="w-full px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Salary Section */}
              <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
                  <Coins size={16} className="text-primary" />
                  <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Cấu hình lương</span>
                </div>
                <div className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-foreground">Lương/Ngày (VNĐ)</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={new Intl.NumberFormat('vi-VN').format(editingRole?.daily_wage || 0)}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setEditingRole({...editingRole, daily_wage: Number(val)});
                        }}
                        className="w-full px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] font-bold focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all tabular-nums text-emerald-600"
                      />
                      <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                        <span className="text-[11px] font-bold text-muted-foreground/40 text-primary uppercase">VNĐ</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description Section */}
              <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
                  <Info size={16} className="text-primary" />
                  <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Ghi chú bổ sung</span>
                </div>
                <div className="p-5">
                  <textarea
                    rows={4}
                    value={editingRole?.description || ''}
                    onChange={(e) => setEditingRole({...editingRole, description: e.target.value})}
                    placeholder="Nhập mô tả chi tiết về quyền lợi hoặc trách nhiệm..."
                    className="w-full px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all resize-none font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-card border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
              <button
                onClick={handleCloseDialog}
                className="px-6 py-2 rounded-xl border border-border hover:bg-muted text-foreground text-[13px] font-bold transition-all"
              >
                Hủy
              </button>
              <button
                onClick={handleSave}
                disabled={upsertMutation.isPending || !editingRole?.role_name}
                className={`flex items-center gap-2 px-8 py-2 rounded-xl text-[13px] font-bold shadow-lg transition-all active:scale-95 group ${
                  upsertMutation.isPending || !editingRole?.role_name
                    ? "bg-primary/50 text-white/60 cursor-not-allowed"
                    : "bg-primary text-white hover:bg-primary/90 shadow-primary/20"
                }`}
              >
                {upsertMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={18} />}
                Lưu cấp bậc
                <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SalarySettingsPage;
