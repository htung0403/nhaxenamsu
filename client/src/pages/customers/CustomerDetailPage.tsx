import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/shared/PageHeader';
import { useCustomer, useCustomerOrders, useCustomerExportOrders, useCustomerReceipts, useCustomerDeliveryOrders, useUpdateDeliveryOrderPrices, useCreateCustomerAccount } from '../../hooks/queries/useCustomers';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import ErrorState from '../../components/shared/ErrorState';
import EmptyState from '../../components/shared/EmptyState';
import { Phone, MapPin, Building2, PackageCheck, FileSpreadsheet, Receipt, Clock, Wallet, Printer, ShoppingBag, Save, GitMerge, UserPlus, Loader2 } from 'lucide-react';
import StatusBadge from '../../components/shared/StatusBadge';
import CollectDebtDialog from './dialogs/CollectDebtDialog';
import MergeCustomerDialog from './dialogs/MergeCustomerDialog';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { useBreadcrumbs } from '../../context/BreadcrumbContext';
import DraggableFAB from '../../components/shared/DraggableFAB';
import type { ImportOrder, ExportOrder, Receipt as ReceiptType } from '../../types';

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const formatDate = (dateString?: string) => {
  if (!dateString) return '-';
  try {
    return format(new Date(dateString), 'dd/MM/yyyy');
  } catch {
    return dateString;
  }
};

const getCustomerTypeBadge = (type?: string) => {
  switch (type) {
    case 'wholesale': return { label: 'Vựa rau', color: 'bg-emerald-100/50 text-emerald-700 border-emerald-200' };
    case 'grocery': return { label: 'Tạp hóa', color: 'bg-blue-100/50 text-blue-700 border-blue-200' };
    case 'vegetable': return { label: 'KH Rau', color: 'bg-purple-100/50 text-purple-700 border-purple-200' };
    default: return { label: 'Chưa phân loại', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
};

type TabId = 'overview' | 'imports' | 'exports' | 'receipts' | 'orders';

const CustomerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isCollectDebtOpen, setIsCollectDebtOpen] = useState(false);
  const [isCollectDebtClosing, setIsCollectDebtClosing] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isMergeClosing, setIsMergeClosing] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [accountForm, setAccountForm] = useState({ phone: '', email: '', password: 'ResetPassword123' });

  const { data: customer, isLoading: isLoadingCustomer, isError: isErrorCustomer } = useCustomer(id!);
  const { data: importOrders, isLoading: isLoadingImports } = useCustomerOrders(id!);
  const { data: exportOrders, isLoading: isLoadingExports } = useCustomerExportOrders(id!);
  const { data: receipts, isLoading: isLoadingReceipts } = useCustomerReceipts(id!);
  const { data: deliveryOrders, isLoading: isLoadingDeliveryOrders } = useCustomerDeliveryOrders(customer?.is_loyal ? id! : '');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [editingPrices, setEditingPrices] = useState<Record<string, number>>({});
  const updatePrices = useUpdateDeliveryOrderPrices();
  const createAccountMutation = useCreateCustomerAccount();

  const TABS = React.useMemo(() => {
    const baseTabs: { id: TabId; label: string; mobileLabel: string; icon: any }[] = [
      { id: 'overview', label: 'Tổng quan', mobileLabel: 'Tổng quan', icon: Building2 },
      { id: 'imports', label: 'Phiếu nhập', mobileLabel: 'Nhập', icon: PackageCheck },
      { id: 'exports', label: 'Phiếu xuất', mobileLabel: 'Xuất', icon: FileSpreadsheet },
      { id: 'receipts', label: 'Lịch sử thu nợ', mobileLabel: 'Thu nợ', icon: Receipt },
    ];
    if (customer?.is_loyal) {
      baseTabs.push({ id: 'orders', label: 'Đơn hàng', mobileLabel: 'Đơn hàng', icon: ShoppingBag });
    }
    return baseTabs;
  }, [customer?.is_loyal]);
  const { setDynamicLabel } = useBreadcrumbs();
  const location = useLocation();

  // Tính toán nợ thực tế từ danh sách đơn hàng xuất
  const calculatedDebt = React.useMemo(() => {
    if (!exportOrders) return 0;
    return exportOrders.reduce((sum: number, o: ExportOrder) => sum + ((o.debt_amount || 0) - (o.paid_amount || 0)), 0);
  }, [exportOrders]);

  // Update breadcrumb label when customer data is available
  React.useEffect(() => {
    if (customer?.name) {
      setDynamicLabel(location.pathname, customer.name);
    }
  }, [customer?.name, location.pathname, setDynamicLabel]);

  React.useEffect(() => {
    if (isAccountOpen && customer) {
      setAccountForm({
        phone: customer.phone || '',
        email: '',
        password: 'ResetPassword123',
      });
    }
  }, [isAccountOpen, customer]);

  const closeCollectDebtDialog = () => {
    setIsCollectDebtClosing(true);
    setTimeout(() => {
      setIsCollectDebtOpen(false);
      setIsCollectDebtClosing(false);
    }, 350);
  };

  const closeMergeDialog = () => {
    setIsMergeClosing(true);
    setTimeout(() => {
      setIsMergeOpen(false);
      setIsMergeClosing(false);
    }, 350);
  };

  const handleMergeSuccess = () => {
    closeMergeDialog();
    // Refresh page after successful merge
    window.location.reload();
  };

  const handleCreateAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!customer?.id) return;

    await createAccountMutation.mutateAsync({
      customer_id: customer.id,
      phone: accountForm.phone.trim(),
      email: accountForm.email.trim() || null,
      password: accountForm.password,
      full_name: customer.name,
    });
    setIsAccountOpen(false);
  };

  const handleSavePrices = async () => {
    if (selectedOrderIds.size === 0 || !id) return;
    const updates = Array.from(selectedOrderIds)
      .map(orderId => {
        const order = deliveryOrders?.find((o: any) => o.id === orderId);
        if (!order) return null;
        const price = editingPrices[orderId] ?? order.unit_price ?? 0;
        const finalPrice = price > 0 && price < 10000 ? price * 1000 : price;
        return {
          deliveryOrderId: orderId,
          unitPrice: finalPrice,
          priceConfirmed: true,
        };
      })
      .filter(Boolean) as Array<{ deliveryOrderId: string; unitPrice: number; priceConfirmed: boolean }>;

    if (updates.length === 0) return;

    try {
      await updatePrices.mutateAsync({ customerId: id, updates });
      setSelectedOrderIds(new Set());
      setEditingPrices({});
    } catch {
      // Error handled by mutation
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoadingCustomer) return <div className="p-6"><LoadingSkeleton rows={5} /></div>;
  if (isErrorCustomer || !customer) return <ErrorState onRetry={() => navigate('/app/khach-hang')} />;

  const getBackPath = () => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length > 1) {
      return `/${segments.slice(0, segments.length - 1).join('/')}`;
    }
    return '/app/khach-hang';
  };
  const backPath = getBackPath();

  return (
    <div className="animate-in fade-in flex-1 flex flex-col min-h-0 relative z-0 print:static">

      <div className="hidden md:block">
        <PageHeader
          title={`Chi tiết: ${customer.name}`}
          description="Theo dõi lịch sử giao dịch và công nợ"
          backPath={backPath}
          actions={
            <div className="flex items-center gap-2">
              {!customer.user_id && !customer.deleted_at && (
                <button
                  onClick={() => setIsAccountOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all font-inter"
                >
                  <UserPlus size={16} />
                  Tạo tài khoản
                </button>
              )}
              {!customer.deleted_at && (
                <button
                  onClick={() => setIsMergeOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-[13px] font-bold hover:bg-amber-700 shadow-lg shadow-amber-600/20 transition-all font-inter"
                >
                  <GitMerge size={16} />
                  Gộp KH
                </button>
              )}
              <button
                onClick={() => setIsCollectDebtOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all font-inter"
              >
                <Wallet size={16} />
                Thu Nợ
              </button>
            </div>
          }
        />
      </div>

      {/* Tabs Menu */}
      <div className={clsx(
        "grid gap-1 md:flex md:gap-2 mb-0 md:mb-4 p-2 md:p-1 bg-white md:bg-transparent -mx-4 sm:mx-0 border-b md:border-0 border-border/50 shrink-0",
        TABS.length === 5 ? "grid-cols-5" : "grid-cols-4"
      )}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-2 p-2 md:px-4 md:py-2 rounded-xl transition-all",
                isActive
                  ? "bg-primary/10 md:bg-primary text-primary md:text-white shadow-sm md:shadow-md shadow-primary/5 md:shadow-primary/20"
                  : "bg-transparent md:bg-white text-muted-foreground hover:bg-muted/50 md:border md:border-border"
              )}
            >
              <Icon size={18} className="md:w-4 md:h-4" />
              <span className="text-[11px] md:text-[13px] font-bold whitespace-nowrap leading-tight">
                <span className="md:hidden">{tab.mobileLabel}</span>
                <span className="hidden md:inline">{tab.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 md:bg-white md:rounded-2xl md:border md:border-border md:shadow-sm flex flex-col min-h-0 md:overflow-hidden -mx-4 sm:mx-0 pt-2 md:pt-0">

        {/* TAB: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="p-4 md:p-6 overflow-y-auto w-full max-w-4xl flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-6 pb-24 md:pb-6">
            <div className="space-y-6">
              <div className="bg-muted/5 border border-border rounded-2xl p-5">
                <h3 className="text-[13px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-4 flex items-center gap-2">
                  Thông tin liên hệ
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-[14px] font-medium text-foreground">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <Building2 size={16} />
                    </div>
                    <span className="flex items-center gap-2">
                      {customer.name}
                      {(() => {
                        const badge = getCustomerTypeBadge(customer.customer_type);
                        return (
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badge.color}`}>
                            {badge.label}
                          </span>
                        );
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[14px] font-medium text-foreground">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <Phone size={16} />
                    </div>
                    <span>{customer.phone || 'Chưa cập nhật'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[14px] font-medium text-foreground">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                      <MapPin size={16} />
                    </div>
                    <span>{customer.address || 'Chưa cập nhật'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[14px] font-medium text-foreground">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                      <Clock size={16} />
                    </div>
                    <span>Tham gia: {formatDate(customer.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-emerald-600 flex items-center justify-center shrink-0">
                  <Receipt size={24} />
                </div>
                <div>
                  <p className="text-[12px] font-bold text-emerald-800/60 uppercase tracking-widest mb-1">Dư nợ hiện tại</p>
                  <p className="text-2xl font-black text-emerald-700 tabular-nums">{formatCurrency(calculatedDebt)}</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-blue-600 flex items-center justify-center shrink-0">
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <p className="text-[12px] font-bold text-blue-800/60 uppercase tracking-widest mb-1">Tổng doanh thu mua hàng</p>
                  <p className="text-2xl font-black text-blue-700 tabular-nums">{formatCurrency(customer.total_revenue)}</p>
                </div>
              </div>

              <div className="bg-muted/10 border border-border rounded-2xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-border text-foreground flex items-center justify-center shrink-0">
                  <PackageCheck size={24} />
                </div>
                <div>
                  <p className="text-[12px] font-bold text-muted-foreground/70 uppercase tracking-widest mb-1">Tổng số đơn nhập gửi</p>
                  <p className="text-2xl font-black text-foreground tabular-nums">{customer.total_orders}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: IMPORTS */}
        {activeTab === 'imports' && (
          <div className="flex-1 overflow-auto custom-scrollbar">
            {isLoadingImports ? <div className="p-4"><LoadingSkeleton rows={5} columns={6} /></div> : !importOrders?.length ? <EmptyState title="Không có phiếu nhập" /> : (
              <div className="h-full flex flex-col w-full min-h-0">
                {/* Desktop View */}
                <div className="hidden md:block">
                  <table className="w-full border-collapse min-w-[800px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Mã đơn</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Ngày</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Người nhận</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">SL</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Thành tiền</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {importOrders.map((o: ImportOrder) => (
                        <tr key={o.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 text-[13px] font-bold text-foreground">{o.order_code}</td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums">{formatDate(o.order_date)}</td>
                          <td className="px-4 py-3 text-[13px] text-foreground">{o.receiver_name}</td>
                          <td className="px-4 py-3 text-[13px] font-bold text-right tabular-nums">{o.quantity} {o.import_order_items?.[0]?.package_type || ''}</td>
                          <td className="px-4 py-3 text-[13px] font-bold text-emerald-600 text-right tabular-nums">{formatCurrency(o.total_order_amount)}</td>
                          <td className="px-4 py-3 text-center"><StatusBadge status={o.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden flex flex-col gap-3 px-4 pb-24">
                  {importOrders.map((o: ImportOrder) => (
                    <div key={o.id} className="bg-white p-4 rounded-2xl shadow-sm border border-border flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[14px] font-bold text-foreground block">{o.order_code}</span>
                          <span className="text-[12px] text-muted-foreground">{formatDate(o.order_date)}</span>
                        </div>
                        <StatusBadge status={o.status} />
                      </div>
                      <div className="flex justify-between items-end border-t border-border/50 pt-3 mt-1">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-muted-foreground">Người nhận</span>
                          <span className="text-[13px] text-foreground font-medium">{o.receiver_name}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[11px] text-muted-foreground">Thành tiền ({o.quantity} {o.import_order_items?.[0]?.package_type || ''})</span>
                          <span className="text-[14px] font-bold text-emerald-600 tabular-nums">{formatCurrency(o.total_order_amount)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: EXPORTS */}
        {activeTab === 'exports' && (
          <div className="flex-1 overflow-auto custom-scrollbar">
            {isLoadingExports ? <div className="p-4"><LoadingSkeleton rows={5} columns={6} /></div> : !exportOrders?.length ? <EmptyState title="Không có phiếu xuất" /> : (
              <div className="h-full flex flex-col w-full min-h-0">
                {/* Desktop View */}
                <div className="hidden md:block">
                  <table className="w-full border-collapse min-w-[800px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Ngày xuất</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Mặt hàng</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">SL</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Giá trị (Nợ)</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Đã thanh toán</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {exportOrders.map((o: ExportOrder) => (
                        <tr key={o.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums">{formatDate(o.export_date)}</td>
                          <td className="px-4 py-3 text-[13px] font-bold text-foreground">
                            {o.products?.name || (o as any).item_name || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-[13px] font-bold text-right tabular-nums">{o.quantity}</td>
                          <td className="px-4 py-3 text-[13px] font-bold text-red-600 text-right tabular-nums">{formatCurrency(o.debt_amount)}</td>
                          <td className="px-4 py-3 text-[13px] font-bold text-emerald-600 text-right tabular-nums">{formatCurrency(o.paid_amount)}</td>
                          <td className="px-4 py-3 text-center"><StatusBadge status={o.payment_status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden flex flex-col gap-3 px-4 pb-24">
                  {exportOrders.map((o: ExportOrder) => (
                    <div key={o.id} className="bg-white p-4 rounded-2xl shadow-sm border border-border flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-1 min-w-0">
                          <span className="text-[14px] font-bold text-foreground block truncate">{o.products?.name || (o as any).item_name || 'N/A'}</span>
                          <span className="text-[12px] text-muted-foreground">Ngày: {formatDate(o.export_date)}</span>
                        </div>
                        <StatusBadge status={o.payment_status} />
                      </div>
                      <div className="flex justify-between items-center bg-muted/5 p-2 px-3 rounded-lg border border-border">
                        <span className="text-[12px] text-muted-foreground font-medium">Số lượng nhập: <span className="font-bold text-foreground">{o.quantity}</span></span>
                      </div>
                      <div className="flex flex-row justify-between pt-1">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-muted-foreground">Giá trị (Nợ)</span>
                          <span className="text-[13px] font-bold text-red-600 tabular-nums">{formatCurrency(o.debt_amount)}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[11px] text-muted-foreground">Đã thanh toán</span>
                          <span className="text-[13px] font-bold text-emerald-600 tabular-nums">{formatCurrency(o.paid_amount)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: RECEIPTS */}
        {activeTab === 'receipts' && (
          <div className="flex-1 overflow-auto custom-scrollbar">
            {isLoadingReceipts ? <div className="p-4"><LoadingSkeleton rows={5} columns={5} /></div> : !receipts?.length ? <EmptyState title="Không có lịch sử thu tiền" /> : (
              <div className="h-full flex flex-col w-full min-h-0">
                {/* Desktop View */}
                <div className="hidden md:block">
                  <table className="w-full border-collapse min-w-[700px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left w-32">Ngày thu</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right w-40">Số tiền thu</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left">Ghi chú</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center w-48">Người thu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {receipts.map((r: ReceiptType) => (
                        <tr key={r.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 text-[13px] font-bold text-foreground tabular-nums">{formatDate(r.payment_date)}</td>
                          <td className="px-4 py-3 text-[14px] font-black text-emerald-600 text-right tabular-nums">+{formatCurrency(r.amount)}</td>
                          <td className="px-4 py-3 text-[13px] text-muted-foreground">{r.notes || '-'}</td>
                          <td className="px-4 py-3 text-[12px] text-center text-muted-foreground">
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-muted/30 border border-border">
                              {r.profiles?.full_name || '-'}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden flex flex-col gap-3 px-4 pb-24">
                  {receipts.map((r: ReceiptType) => (
                    <div key={r.id} className="bg-white p-4 rounded-2xl shadow-sm border border-border flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-1">
                          <span className="text-[12px] font-bold text-muted-foreground">{formatDate(r.payment_date)}</span>
                          <span className="text-[12px] text-muted-foreground">Thu bởi: <span className="font-medium text-foreground">{r.profiles?.full_name || '-'}</span></span>
                        </div>
                        <span className="text-[16px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">+{formatCurrency(r.amount)}</span>
                      </div>
                      {r.notes && (
                        <div className="border-t border-border/50 pt-3 mt-1 text-[13px] text-muted-foreground opacity-90">
                          <span className="font-medium text-slate-500">Ghi chú:</span> {r.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: ORDERS (Loyal customers only) */}
        {activeTab === 'orders' && customer?.is_loyal && (
          <div className="flex-1 overflow-auto custom-scrollbar flex flex-col">
            {/* Action bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/10 shrink-0" data-print-hide>
              <span className="text-[13px] font-bold text-muted-foreground">
                {selectedOrderIds.size > 0 ? `Đã chọn ${selectedOrderIds.size} đơn hàng` : 'Đơn hàng giao cho khách'}
              </span>
              <div className="flex items-center gap-2">
                {selectedOrderIds.size > 0 && (
                  <>
                    <button
                      onClick={handleSavePrices}
                      disabled={updatePrices.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <Save size={14} />
                      Lưu đơn giá
                    </button>
                    <button
                      onClick={handlePrint}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[12px] font-bold hover:bg-emerald-700 transition-colors"
                    >
                      <Printer size={14} />
                      In phiếu
                    </button>
                  </>
                )}
              </div>
            </div>

            {isLoadingDeliveryOrders ? (
              <div className="p-4"><LoadingSkeleton rows={5} columns={7} /></div>
            ) : !deliveryOrders?.length ? (
              <EmptyState title="Không có đơn hàng" />
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block print:block flex-1 overflow-auto" data-print-area="loyal-orders">
                  <div className="print-header hidden">
                    <p style={{ fontWeight: 'bold', fontSize: '20px' }}>Nhà xe Năm Sự</p>
                    <h2>PHIẾU GIAO HÀNG</h2>
                    <p>Khách hàng: {customer.name}</p>
                    <p>Điện thoại: {customer.phone || '-'} | Địa chỉ: {customer.address || '-'}</p>
                  </div>
                  <table className="w-full border-collapse min-w-[900px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="px-4 py-3 w-10" data-print-hide>
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.size > 0 && selectedOrderIds.size === deliveryOrders.length}
                            onChange={() => {
                              if (selectedOrderIds.size === deliveryOrders.length) {
                                setSelectedOrderIds(new Set());
                              } else {
                                setSelectedOrderIds(new Set(deliveryOrders.map((o: any) => o.id)));
                              }
                            }}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                          />
                        </th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left whitespace-nowrap">Ngày giờ giao</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right whitespace-nowrap">Số lượng</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left w-full min-w-[200px]">Tên hàng</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right whitespace-nowrap">Đơn giá</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-left whitespace-nowrap">Nhân viên giao</th>
                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right whitespace-nowrap">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {deliveryOrders.map((o: any) => {
                        const currentPrice = editingPrices[o.id] ?? o.unit_price ?? 0;
                        const effectivePrice = currentPrice > 0 && currentPrice < 10000 ? currentPrice * 1000 : currentPrice;
                        const thanhTien = o.total_quantity * effectivePrice;
                        const driverNames = (o.delivery_vehicles || [])
                          .map((dv: any) => dv.profiles?.full_name)
                          .filter(Boolean)
                          .join(', ') || '-';
                        const deliveryDateTime = [
                          o.delivery_date ? formatDate(o.delivery_date) : '-',
                          o.delivery_time ? o.delivery_time.slice(0, 5) : '',
                        ].filter(Boolean).join(' ');

                        const displayPrice = editingPrices[o.id] !== undefined
                          ? (editingPrices[o.id] || '')
                          : (o.unit_price ? o.unit_price / 1000 : '');

                        return (
                          <tr
                            key={o.id}
                            className={clsx(
                              "hover:bg-muted/20 transition-colors",
                              o.price_confirmed && "bg-emerald-50/30",
                              selectedOrderIds.has(o.id) && "bg-primary/5"
                            )}
                            data-print-row={selectedOrderIds.has(o.id) ? "true" : "false"}
                          >
                            <td className="px-4 py-3" data-print-hide>
                              <input
                                type="checkbox"
                                checked={selectedOrderIds.has(o.id)}
                                onChange={() => {
                                  setSelectedOrderIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(o.id)) next.delete(o.id);
                                    else next.add(o.id);
                                    return next;
                                  });
                                }}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">{deliveryDateTime}</td>
                            <td className="px-4 py-3 text-[13px] font-bold text-right tabular-nums">{o.total_quantity}</td>
                            <td className="px-4 py-3 text-[13px] font-bold text-foreground">{o.product_name}</td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                value={displayPrice}
                                onChange={(e) => {
                                  setEditingPrices(prev => ({
                                    ...prev,
                                    [o.id]: Number(e.target.value) || 0,
                                  }));
                                }}
                                placeholder="Nhập giá"
                                className="w-28 ml-auto px-2 py-1 text-[13px] font-bold text-right tabular-nums border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none bg-white"
                              />
                            </td>
                            <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{driverNames}</td>
                            <td className="px-4 py-3 text-[13px] font-bold text-emerald-600 text-right tabular-nums whitespace-nowrap">
                              {formatCurrency(thanhTien)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden flex flex-col gap-3 px-4 pb-24 pt-2">
                  {deliveryOrders.map((o: any) => {
                    const currentPrice = editingPrices[o.id] ?? o.unit_price ?? 0;
                    const effectivePrice = currentPrice > 0 && currentPrice < 10000 ? currentPrice * 1000 : currentPrice;
                    const thanhTien = o.total_quantity * effectivePrice;
                    const driverNames = (o.delivery_vehicles || [])
                      .map((dv: any) => dv.profiles?.full_name)
                      .filter(Boolean)
                      .join(', ') || '-';

                    const displayPrice = editingPrices[o.id] !== undefined
                      ? (editingPrices[o.id] || '')
                      : (o.unit_price ? o.unit_price / 1000 : '');

                    return (
                      <div key={o.id} className="bg-white p-4 rounded-2xl shadow-sm border border-border flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[14px] font-bold text-foreground">{o.product_name}</span>
                            <span className="text-[12px] text-muted-foreground block">
                              {o.delivery_date ? formatDate(o.delivery_date) : '-'}
                              {o.delivery_time ? ` ${o.delivery_time.slice(0, 5)}` : ''}
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.has(o.id)}
                            onChange={() => {
                              setSelectedOrderIds(prev => {
                                const next = new Set(prev);
                                if (next.has(o.id)) next.delete(o.id);
                                else next.add(o.id);
                                return next;
                              });
                            }}
                            className="w-4 h-4 mt-1"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-3">
                          <div>
                            <span className="text-[11px] text-muted-foreground">SL</span>
                            <span className="text-[13px] font-bold block">{o.total_quantity}</span>
                          </div>
                          <div>
                            <span className="text-[11px] text-muted-foreground">Đơn giá</span>
                            <input
                              type="number"
                              value={displayPrice}
                              onChange={(e) => setEditingPrices(prev => ({ ...prev, [o.id]: Number(e.target.value) || 0 }))}
                              placeholder="Nhập giá"
                              className="w-full px-2 py-1 text-[13px] font-bold border border-border rounded-lg outline-none"
                            />
                          </div>
                          <div>
                            <span className="text-[11px] text-muted-foreground">NV giao</span>
                            <span className="text-[12px] block">{driverNames}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] text-muted-foreground">Thành tiền</span>
                            <span className="text-[13px] font-bold text-emerald-600 block">{formatCurrency(thanhTien)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <DraggableFAB
        icon={<Wallet size={24} />}
        onClick={() => setIsCollectDebtOpen(true)}
        className="bg-emerald-600 text-white w-14 h-14 rounded-full"
      />

      <CollectDebtDialog
        isOpen={isCollectDebtOpen}
        isClosing={isCollectDebtClosing}
        onClose={closeCollectDebtDialog}
        customer={customer}
        debtAmount={calculatedDebt}
      />

      <MergeCustomerDialog
        isOpen={isMergeOpen}
        isClosing={isMergeClosing}
        onClose={handleMergeSuccess}
        sourceCustomer={customer}
      />

      {isAccountOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateAccount}
            className="w-full max-w-md bg-white rounded-2xl border border-border shadow-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border bg-muted/20">
              <h3 className="text-[15px] font-bold text-foreground">Tạo tài khoản khách hàng</h3>
              <p className="text-[12px] text-muted-foreground mt-1">{customer.name}</p>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-muted-foreground">Số điện thoại đăng nhập</label>
                <input
                  value={accountForm.phone}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, phone: event.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-muted-foreground">Email (tuỳ chọn)</label>
                <input
                  type="email"
                  value={accountForm.email}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-muted-foreground">Mật khẩu tạm</label>
                <input
                  type="text"
                  value={accountForm.password}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, password: event.target.value }))}
                  minLength={6}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAccountOpen(false)}
                disabled={createAccountMutation.isPending}
                className="px-4 py-2 rounded-xl border border-border text-[13px] font-semibold hover:bg-muted disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={createAccountMutation.isPending}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {createAccountMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Tạo tài khoản
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default CustomerDetailPage;
