import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import ErrorState from '../../components/shared/ErrorState';
import { moduleData } from '../../data/moduleData';
import {
  useAppRoles,
  useCreateAppRole,
  useDeleteAppRole,
  useUpdateRolePermissions,
} from '../../hooks/queries/useRoles';

const getRoleDisplayName = (roleName: string, roleKey?: string) => {
  if (roleKey === 'customer' || roleName.trim().toLowerCase() === 'customer') {
    return 'Khách hàng';
  }
  if (roleKey === 'driver' || roleName.trim().toLowerCase() === 'driver') {
    return 'Tài xế';
  }
  if (roleKey === 'manager' || roleName.trim().toLowerCase() === 'manager') {
    return 'Quản lý';
  }
  if (roleKey === 'staff' || roleName.trim().toLowerCase() === 'staff') {
    return 'Nhân viên';
  }
  return roleName;
};

const iconColorMap: Record<string, string> = {
  red: 'bg-red-500/10 text-red-500',
  green: 'bg-emerald-500/10 text-emerald-500',
  pink: 'bg-pink-500/10 text-pink-500',
  blue: 'bg-blue-500/10 text-blue-500',
  orange: 'bg-orange-500/10 text-orange-500',
  teal: 'bg-teal-500/10 text-teal-500',
  purple: 'bg-purple-500/10 text-purple-500',
  cyan: 'bg-cyan-500/10 text-cyan-500',
  emerald: 'bg-emerald-500/10 text-emerald-500',
  amber: 'bg-amber-500/10 text-amber-500',
  slate: 'bg-slate-500/10 text-slate-500',
};

/** Build grouped sections from moduleData for the permissions grid */
const allModuleSections = Object.values(moduleData).flat();

const RolePermissionsPage: React.FC = () => {
  const { data: roles, isLoading: rolesLoading, isError: rolesError, refetch: refetchRoles } = useAppRoles();
  const createRoleMutation = useCreateAppRole();
  const deleteRoleMutation = useDeleteAppRole();
  const updateRolePermissionsMutation = useUpdateRolePermissions();

  const [newRoleName, setNewRoleName] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedPagePaths, setSelectedPagePaths] = useState<string[]>([]);

  const effectiveRoleId = selectedRoleId || roles?.[0]?.id || '';
  const currentRole = useMemo(() => (roles || []).find((role) => role.id === effectiveRoleId), [roles, effectiveRoleId]);

  useEffect(() => {
    if (!effectiveRoleId) {
      setSelectedPagePaths([]);
      return;
    }
    const role = (roles || []).find((item) => item.id === effectiveRoleId);
    setSelectedPagePaths(role?.page_paths || []);
  }, [roles, effectiveRoleId]);

  const handleSelectRole = (roleId: string) => {
    setSelectedRoleId(roleId);
    const role = (roles || []).find((item) => item.id === roleId);
    setSelectedPagePaths(role?.page_paths || []);
  };

  const handleTogglePath = (path: string) => {
    setSelectedPagePaths((prev) =>
      prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [...prev, path]
    );
  };

  const handleToggleSection = (sectionPaths: string[]) => {
    const allChecked = sectionPaths.every((p) => selectedPagePaths.includes(p));
    if (allChecked) {
      setSelectedPagePaths((prev) => prev.filter((p) => !sectionPaths.includes(p)));
    } else {
      setSelectedPagePaths((prev) => Array.from(new Set([...prev, ...sectionPaths])));
    }
  };

  const handleCreateRole = () => {
    if (!newRoleName.trim()) return;

    createRoleMutation.mutate(
      { role_name: newRoleName.trim() },
      {
        onSuccess: (created) => {
          setNewRoleName('');
          setSelectedRoleId(created.id);
          setSelectedPagePaths([]);
        },
      }
    );
  };

  const handleSavePermissions = () => {
    if (!effectiveRoleId) return;
    updateRolePermissionsMutation.mutate({
      roleId: effectiveRoleId,
      pagePaths: selectedPagePaths,
    });
  };

  const handleDeleteRole = (roleId: string) => {
    const role = (roles || []).find((item) => item.id === roleId);
    if (!role) return;

    const shouldDelete = window.confirm(`Bạn có chắc muốn xóa quyền \"${getRoleDisplayName(role.role_name, role.role_key)}\"?`);
    if (!shouldDelete) return;

    deleteRoleMutation.mutate(roleId, {
      onSuccess: () => {
        if (effectiveRoleId === roleId) {
          setSelectedRoleId('');
          setSelectedPagePaths([]);
        }
      },
    });
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <PageHeader title="Phân quyền" description="Tạo quyền và cấp quyền truy cập + thao tác theo từng trang trong hệ thống" backPath="/app/hanh-chinh-nhan-su" />

      {rolesLoading ? (
        <div className="bg-white rounded-2xl border border-border shadow-sm p-4 flex-1">
          <LoadingSkeleton rows={8} columns={3} />
        </div>
      ) : rolesError ? (
        <div className="bg-white rounded-2xl border border-border shadow-sm flex-1">
          <ErrorState onRetry={() => { refetchRoles(); }} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto custom-scrollbar pb-6 px-1">
          <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
            <div className="bg-white rounded-2xl border border-border shadow-sm p-4 space-y-4 h-fit">
              <h2 className="text-[14px] font-bold text-foreground">Danh sách quyền</h2>

              <div className="space-y-2">
                <label className="text-[12px] font-bold text-muted-foreground uppercase">Tạo tên quyền mới</label>
                <div className="flex items-center gap-2">
                  <input
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="VD: Kế toán trưởng"
                    className="flex-1 px-3 py-2 rounded-xl border border-border bg-muted/10 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10"
                  />
                  <button
                    onClick={handleCreateRole}
                    disabled={createRoleMutation.isPending || !newRoleName.trim()}
                    className="px-3 py-2 rounded-xl bg-primary text-white text-[12px] font-bold hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-1.5"
                  >
                    {createRoleMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Tạo
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {(roles || []).map((role) => (
                  <div
                    key={role.id}
                    className={`w-full p-3 rounded-xl border transition-all ${
                      effectiveRoleId === role.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => handleSelectRole(role.id)} className="min-w-0 text-left flex-1">
                        <div className="text-[13px] font-bold text-foreground">{getRoleDisplayName(role.role_name, role.role_key)}</div>
                        <div className="text-[11px] text-muted-foreground mt-1">{role.page_paths?.length || 0} trang đã cấp</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(role.id)}
                        disabled={deleteRoleMutation.isPending}
                        className="shrink-0 p-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60"
                        title="Xóa quyền"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-border shadow-sm p-4 md:p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-bold text-foreground">Cấp quyền sử dụng trang</h2>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Vai trò đang chọn: <span className="font-bold text-foreground">{currentRole ? getRoleDisplayName(currentRole.role_name, currentRole.role_key) : 'Chưa chọn'}</span>
                  </p>
                </div>
                <button
                  onClick={handleSavePermissions}
                  disabled={!effectiveRoleId || updateRolePermissionsMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {updateRolePermissionsMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Lưu phân quyền
                </button>
              </div>

              <div className="space-y-4">
                {allModuleSections.map((section) => {
                  const sectionPaths = section.items.filter((i) => i.path).map((i) => i.path!);
                  const allChecked = sectionPaths.length > 0 && sectionPaths.every((p) => selectedPagePaths.includes(p));
                  const someChecked = sectionPaths.some((p) => selectedPagePaths.includes(p));

                  return (
                    <div key={section.section} className="rounded-xl border border-border/80 overflow-hidden">
                      <div className="px-4 py-2.5 bg-muted/10 border-b border-border flex items-center justify-between">
                        <span className="text-[12px] font-bold uppercase tracking-wide text-primary">{section.section}</span>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <span className="text-[11px] text-muted-foreground">{allChecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</span>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                            onChange={() => handleToggleSection(sectionPaths)}
                            className="w-4 h-4 accent-primary"
                          />
                        </label>
                      </div>
                      <div className="divide-y divide-border/60">
                        {section.items.map((item) => {
                          if (!item.path) return null;
                          const checked = selectedPagePaths.includes(item.path);
                          const Icon = item.icon || FileText;
                          const colorClass = iconColorMap[item.colorScheme || 'slate'] || iconColorMap.slate;
                          return (
                            <label key={item.path} className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/5">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                                  <Icon size={16} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[13px] font-semibold text-foreground truncate">{item.title}</div>
                                  <div className="text-[11px] text-muted-foreground truncate">{item.description}</div>
                                </div>
                              </div>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleTogglePath(item.path!)}
                                className="w-4 h-4 accent-primary shrink-0"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolePermissionsPage;
