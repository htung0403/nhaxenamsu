import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/shared/PageHeader';
import { useLoyalCustomers, useDeleteCustomer } from '../../hooks/queries/useCustomers';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { Plus, Pencil, Trash2, GitMerge, UserPlus } from 'lucide-react';
import AddEditCustomerDialog from './dialogs/AddEditCustomerDialog';
import MergeCustomerDialog from './dialogs/MergeCustomerDialog';
import CreateCustomerAccountDialog from './dialogs/CreateCustomerAccountDialog';
import DraggableFAB from '../../components/shared/DraggableFAB';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';
import type { Customer } from '../../types';

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const getCustomerTypeBadge = (type?: string) => {
  switch (type) {
    case 'vegetable_receiver':
    case 'wholesale': return { label: 'Vựa rau', color: 'bg-emerald-100/50 text-emerald-700 border-emerald-200' };
    case 'grocery':
    case 'grocery_sender':
    case 'grocery_receiver': return { label: 'Tạp hóa', color: 'bg-blue-100/50 text-blue-700 border-blue-200' };
    case 'vegetable':
    case 'vegetable_sender': return { label: 'KH Rau', color: 'bg-purple-100/50 text-purple-700 border-purple-200' };
    default: return { label: 'Chưa phân loại', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
};

const LoyalCustomersPage: React.FC = () => {
  const { data: customers, isLoading, isError, refetch } = useLoyalCustomers();
  const deleteCustomer = useDeleteCustomer();
  const navigate = useNavigate();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddClosing, setIsAddClosing] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [customerForAccount, setCustomerForAccount] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isMergeClosing, setIsMergeClosing] = useState(false);
  const [sourceCustomerForMerge, setSourceCustomerForMerge] = useState<Customer | null>(null);

  const closeAddDialog = () => {
    setIsAddClosing(true);
    setTimeout(() => {
      setIsAddOpen(false);
      setIsAddClosing(false);
      setSelectedCustomer(null);
    }, 350);
  };

  const openCreateDialog = () => {
    setSelectedCustomer(null);
    setIsAddOpen(true);
  };

  const openEditDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsAddOpen(true);
  };

  const handleSoftDelete = (customer: Customer) => {
    setCustomerToDelete(customer);
    setIsDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    if (deleteCustomer.isPending) return;
    setIsDeleteConfirmOpen(false);
    setCustomerToDelete(null);
  };

  const confirmSoftDelete = async () => {
    if (!customerToDelete?.id) return;
    try {
      await deleteCustomer.mutateAsync(customerToDelete.id);
      setIsDeleteConfirmOpen(false);
      setCustomerToDelete(null);
    } catch {
      // Error handled by mutation
    }
  };

  const filteredAndSortedCustomers = (customers || [])
    .filter(c => {
      return (
        matchesSearch(c.name, searchTerm) ||
        (c.phone && c.phone.includes(searchTerm)) ||
        matchesSearch(c.address || '', searchTerm)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedCustomers.length && filteredAndSortedCustomers.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedCustomers.map(c => c.id)));
    }
  };

  const openMergeDialog = () => {
    const selectedArray = Array.from(selectedIds);
    if (selectedArray.length !== 2) return;
    const customer = customers?.find(c => c.id === selectedArray[0]);
    if (customer) {
      setSourceCustomerForMerge(customer);
      setIsMergeOpen(true);
    }
  };

  const closeMergeDialog = () => {
    setIsMergeClosing(true);
    setTimeout(() => {
      setIsMergeOpen(false);
      setIsMergeClosing(false);
      setSourceCustomerForMerge(null);
    }, 350);
  };

  const handleMergeSuccess = () => {
    setSelectedIds(new Set());
    closeMergeDialog();
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Khách hàng thân thiết"
          description="Quản lý khách hàng thân thiết"
          backPath="/app/khach-hang"
          actions={
            <div className="flex items-center gap-3">
              <SearchInput
                placeholder="Tìm kiếm khách hàng..."
                onSearch={(raw) => setSearchTerm(raw)}
                className="w-64"
              />
              <button
                onClick={openCreateDialog}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
              >
                <Plus size={16} />
                Thêm KH
              </button>
            </div>
          }
        />
      </div>

      {/* Mobile Search */}
      <div className="md:hidden px-4 mb-3">
        <SearchInput
          placeholder="Tìm kiếm khách hàng..."
          onSearch={(raw) => {
            setSearchTerm(raw);
            setSelectedIds(new Set());
          }}
        />
      </div>

      {selectedIds.size > 0 && (
        <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl mb-2 mx-0 sm:mx-0">
          <span className="text-[13px] font-bold text-amber-800">
            Đã chọn {selectedIds.size} khách hàng
          </span>
          {selectedIds.size === 2 && (
            <button
              onClick={openMergeDialog}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white text-[13px] font-bold hover:bg-orange-600 shadow-sm transition-all"
            >
              <GitMerge size={14} />
              Gộp KH
            </button>
          )}
        </div>
      )}

      <div className="md:bg-white md:rounded-2xl md:border md:border-border md:shadow-sm flex flex-col flex-1 min-h-0 md:overflow-hidden -mx-4 sm:mx-0">
        {isLoading ? (
          <div className="p-4"><LoadingSkeleton rows={6} columns={5} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !filteredAndSortedCustomers.length ? (
          <EmptyState title={searchTerm ? "Không tìm thấy khách hàng" : "Chưa có khách hàng"} />
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar">
            {/* Desktop View */}
            <div className="hidden md:block">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size > 0 && selectedIds.size === filteredAndSortedCustomers.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Tên KH</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center w-42">Loại KH</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">SDT</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Địa chỉ</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Số đơn</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Doanh thu</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Công nợ</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center">Tài khoản</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center w-28">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredAndSortedCustomers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => {
                        if (c.id) navigate(c.id);
                      }}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <span className="text-[13px] font-bold text-foreground hover:underline decoration-primary/30">
                            {c.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const badge = getCustomerTypeBadge(c.customer_type);
                          return (
                            <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-[11px] font-semibold border ${badge.color}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground">{c.phone || '-'}</td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground truncate max-w-37.5" title={c.address || ''}>
                        {c.address || '-'}
                      </td>
                      <td className="px-4 py-3 text-[13px] font-bold text-foreground text-right tabular-nums">{c.total_orders}</td>
                      <td className="px-4 py-3 text-[13px] font-bold text-emerald-600 text-right tabular-nums">{formatCurrency(c.total_revenue)}</td>
                      <td className="px-4 py-3 text-[13px] font-bold text-red-600 text-right tabular-nums">{formatCurrency(c.debt)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-[11px] font-semibold border ${c.user_id ? 'bg-emerald-100/50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {c.user_id ? 'Đã có' : 'Chưa có'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {!c.user_id && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomerForAccount(c);
                              }}
                              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors"
                              title="Tạo tài khoản"
                            >
                              <UserPlus size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(c);
                            }}
                            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                            title="Chỉnh sửa"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSoftDelete(c);
                            }}
                            disabled={deleteCustomer.isPending}
                            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                            title="Xóa"
                          >
                            <Trash2 size={14} />
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
              {filteredAndSortedCustomers.map((c) => (
                <div
                  key={c.id}
                  className="p-4 flex flex-col gap-3 bg-white rounded-2xl border border-border shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => {
                    if (c.id) navigate(c.id);
                  }}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-1 min-w-0">
                      <span className="text-[15px] font-bold text-foreground truncate flex items-center gap-2">
                        {c.name}
                        {(() => {
                          const badge = getCustomerTypeBadge(c.customer_type);
                          return (
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badge.color}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </span>
                      {c.address && <p className="text-[13px] text-muted-foreground truncate">{c.address}</p>}
                    </div>
                    {c.phone && (
                      <span className="text-[12px] px-2.5 py-1 bg-muted/10 rounded-md text-muted-foreground whitespace-nowrap shrink-0">{c.phone}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-1 pt-3 border-t border-border/50">
                    <div className="flex flex-col">
                      <span className="text-[11px] text-muted-foreground">Số đơn</span>
                      <span className="text-[13px] font-bold text-foreground tabular-nums">{c.total_orders}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[11px] text-muted-foreground">Doanh thu</span>
                      <span className="text-[13px] font-bold text-emerald-600 tabular-nums">{formatCurrency(c.total_revenue)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[11px] text-muted-foreground">Công nợ</span>
                      <span className="text-[13px] font-bold text-red-600 tabular-nums">{formatCurrency(c.debt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-semibold ${c.user_id ? 'bg-emerald-100/50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {c.user_id ? 'Đã có tài khoản' : 'Chưa có tài khoản'}
                    </span>
                    {!c.user_id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCustomerForAccount(c);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-[12px] font-semibold text-muted-foreground hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors"
                      >
                        <UserPlus size={13} />
                        Tạo TK
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDialog(c);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-[12px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                    >
                      <Pencil size={13} />
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSoftDelete(c);
                      }}
                      disabled={deleteCustomer.isPending}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-[12px] font-semibold text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                      Xóa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DraggableFAB
        icon={<Plus size={24} />}
        onClick={openCreateDialog}
        className="bg-primary text-white w-14 h-14 rounded-full"
      />

      <AddEditCustomerDialog
        isOpen={isAddOpen}
        isClosing={isAddClosing}
        onClose={closeAddDialog}
        mode={selectedCustomer ? 'edit' : 'create'}
        customer={selectedCustomer}
      />

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="Xóa khách hàng"
        message={`Xác nhận xóa thông tin khách hàng "${customerToDelete?.name || ''}"?`}
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        variant="danger"
        isLoading={deleteCustomer.isPending}
        onConfirm={confirmSoftDelete}
        onCancel={closeDeleteConfirm}
      />

      {sourceCustomerForMerge && (
        <MergeCustomerDialog
          isOpen={isMergeOpen}
          isClosing={isMergeClosing}
          onClose={closeMergeDialog}
          onSuccess={handleMergeSuccess}
          sourceCustomer={sourceCustomerForMerge}
        />
      )}

      <CreateCustomerAccountDialog
        customer={customerForAccount}
        onClose={() => setCustomerForAccount(null)}
      />
    </div>
  );
};

export default LoyalCustomersPage;
