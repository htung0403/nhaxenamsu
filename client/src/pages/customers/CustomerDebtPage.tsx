import React from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { Banknote, Calendar, CheckCircle2, Filter, History, Package, Store, Truck, UserRound } from 'lucide-react';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import { SearchInput } from '../../components/ui/SearchInput';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import { matchesSearch } from '../../lib/str-utils';
import { useRecordVehicleDebtPayments, useVehicleDebtPayments, useVehicleDebts } from '../../hooks/queries/useAccounting';
import type { VehicleDebt, VehicleDebtCustomerType, VehicleDebtPayment } from '../../api/accountingApi';

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Chưa có ngày';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'dd/MM/yyyy');
};

const getDebtDate = (debt: VehicleDebt) => debt.delivery_date || debt.order_date || debt.assigned_at?.slice(0, 10) || '';

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Chưa có ngày giờ';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'dd/MM/yyyy HH:mm');
};

const toDateTimeLocalValue = (value = new Date()) => {
  const offsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
};

const numberFromInput = (value: string) => Number(value || 0);

const normalizeMoneyValue = (value: number) => {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return 0;
  if (numericValue > 0 && numericValue < 10_000) return numericValue * 1_000;
  return numericValue;
};

type PaymentFormState = {
  paid_at: string;
  quantity: number;
  unit_price: number;
  paid_amount: number;
  notes: string;
};

type PaymentItemFormState = Pick<PaymentFormState, 'quantity' | 'unit_price' | 'paid_amount'>;

type CustomerDebtTab = 'debts' | 'history';
type HistoryViewMode = 'order' | 'vehicle';

type CustomerDebtPageMode = 'loyal' | 'vehicle';

interface CustomerDebtPageProps {
  mode?: CustomerDebtPageMode;
}

const pageConfig: Record<CustomerDebtPageMode, {
  title: string;
  description: string;
  customerType: VehicleDebtCustomerType;
  emptyTitle: string;
  emptyDescription: string;
}> = {
  loyal: {
    title: 'Công nợ KH thân thiết',
    description: 'Danh sách phân xe chưa thanh toán của khách hàng thân thiết.',
    customerType: 'loyal',
    emptyTitle: 'Không có công nợ KH thân thiết',
    emptyDescription: 'Không có phân xe chưa thanh toán nào của khách hàng thân thiết khớp bộ lọc.',
  },
  vehicle: {
    title: 'Công nợ theo xe',
    description: 'Danh sách phân xe chưa thanh toán của khách tạp hóa không thuộc nhóm thân thiết.',
    customerType: 'grocery_non_loyal',
    emptyTitle: 'Không có công nợ theo xe',
    emptyDescription: 'Không có phân xe chưa thanh toán nào của khách tạp hóa khớp bộ lọc.',
  },
};

const CustomerDebtPage: React.FC<CustomerDebtPageProps> = ({ mode = 'loyal' }) => {
  const config = pageConfig[mode];
  const { data: debts = [], isLoading, isError, refetch } = useVehicleDebts(config.customerType);
  const { data: paymentHistory = [], isLoading: isHistoryLoading, isError: isHistoryError, refetch: refetchHistory } = useVehicleDebtPayments(config.customerType);
  const paymentMutation = useRecordVehicleDebtPayments(config.customerType);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterCustomer, setFilterCustomer] = React.useState<string[]>([]);
  const [filterVehicle, setFilterVehicle] = React.useState<string[]>([]);
  const [startDate, setStartDate] = React.useState<string>('');
  const [endDate, setEndDate] = React.useState<string>('');
  const [activeTab, setActiveTab] = React.useState<CustomerDebtTab>('debts');
  const [historyViewMode, setHistoryViewMode] = React.useState<HistoryViewMode>('order');
  const [activePaymentDebts, setActivePaymentDebts] = React.useState<VehicleDebt[]>([]);
  const [selectedDebtIds, setSelectedDebtIds] = React.useState<string[]>([]);
  const [paymentItems, setPaymentItems] = React.useState<Record<string, PaymentItemFormState>>({});
  const [paymentForm, setPaymentForm] = React.useState<PaymentFormState>({
    paid_at: toDateTimeLocalValue(),
    quantity: 0,
    unit_price: 0,
    paid_amount: 0,
    notes: '',
  });
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [isFilterClosing, setIsFilterClosing] = React.useState(false);

  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 300);
  };

  const { customerOptions, vehicleOptions } = React.useMemo(() => {
    const customers = new Set<string>();
    const vehicles = new Set<string>();

    debts.forEach((debt) => {
      if (debt.customer?.name) customers.add(debt.customer.name);
      if (debt.vehicle?.license_plate) vehicles.add(debt.vehicle.license_plate);
    });

    return {
      customerOptions: Array.from(customers).sort().map((name) => ({ label: name, value: name })),
      vehicleOptions: Array.from(vehicles).sort().map((plate) => ({ label: plate, value: plate })),
    };
  }, [debts]);

  const filteredDebts = React.useMemo(() => {
    return debts.filter((debt) => {
      const customerName = debt.customer?.name || '';
      const vehiclePlate = debt.vehicle?.license_plate || '';
      const driverName = debt.driver?.full_name || '';
      const orderCode = debt.order_code || '';
      const productName = debt.product_name || '';
      const debtDate = getDebtDate(debt);

      if (searchQuery) {
        const matched = [customerName, vehiclePlate, driverName, orderCode, productName]
          .some((value) => matchesSearch(value, searchQuery));
        if (!matched) return false;
      }

      if (filterCustomer.length > 0 && !filterCustomer.includes(customerName)) return false;
      if (filterVehicle.length > 0 && !filterVehicle.includes(vehiclePlate)) return false;
      if (debtDate) {
        if (startDate && debtDate < startDate) return false;
        if (endDate && debtDate > endDate) return false;
      }

      return true;
    });
  }, [debts, searchQuery, filterCustomer, filterVehicle, startDate, endDate]);

  const groupedDebts = React.useMemo(() => {
    return filteredDebts.reduce<Record<string, VehicleDebt[]>>((acc, debt) => {
      const date = getDebtDate(debt) || 'N/A';
      if (!acc[date]) acc[date] = [];
      acc[date].push(debt);
      return acc;
    }, {});
  }, [filteredDebts]);

  const sortedDates = React.useMemo(() => Object.keys(groupedDebts).sort((a, b) => b.localeCompare(a)), [groupedDebts]);
  const totalDebt = filteredDebts.reduce((sum, debt) => sum + Number(debt.expected_amount || 0), 0);
  const totalCustomers = new Set(filteredDebts.map((debt) => debt.customer?.id || debt.customer?.name).filter(Boolean)).size;

  const hasActiveFilters = filterCustomer.length > 0 || filterVehicle.length > 0 || !!startDate || !!endDate;

  const filteredPaymentHistory = React.useMemo(() => {
    return paymentHistory.filter((payment) => {
      const customerName = payment.customer?.name || '';
      const vehiclePlate = payment.vehicle?.license_plate || '';
      const driverName = payment.driver?.full_name || '';
      const orderCode = payment.order_code || '';
      const productName = payment.product_name || '';
      const paidDate = payment.paid_at?.slice(0, 10) || '';

      if (searchQuery) {
        const matched = [customerName, vehiclePlate, driverName, orderCode, productName]
          .some((value) => matchesSearch(value, searchQuery));
        if (!matched) return false;
      }

      if (filterCustomer.length > 0 && !filterCustomer.includes(customerName)) return false;
      if (filterVehicle.length > 0 && !filterVehicle.includes(vehiclePlate)) return false;
      if (paidDate) {
        if (startDate && paidDate < startDate) return false;
        if (endDate && paidDate > endDate) return false;
      }

      return true;
    });
  }, [paymentHistory, searchQuery, filterCustomer, filterVehicle, startDate, endDate]);

  const groupedPaymentHistory = React.useMemo(() => {
    return filteredPaymentHistory.reduce<Record<string, VehicleDebtPayment[]>>((acc, payment) => {
      const key = historyViewMode === 'vehicle'
        ? payment.vehicle?.license_plate || 'Chưa có xe'
        : payment.order_code || 'Chưa có mã đơn';
      if (!acc[key]) acc[key] = [];
      acc[key].push(payment);
      return acc;
    }, {});
  }, [filteredPaymentHistory, historyViewMode]);

  const historyGroupKeys = React.useMemo(() => Object.keys(groupedPaymentHistory).sort((a, b) => a.localeCompare(b, 'vi')), [groupedPaymentHistory]);

  const selectedDebts = React.useMemo(
    () => filteredDebts.filter((debt) => selectedDebtIds.includes(debt.id)),
    [filteredDebts, selectedDebtIds],
  );

  const isAllFilteredDebtsSelected = filteredDebts.length > 0 && filteredDebts.every((debt) => selectedDebtIds.includes(debt.id));

  const openPaymentForm = React.useCallback((debtOrDebts: VehicleDebt | VehicleDebt[]) => {
    const nextDebts = Array.isArray(debtOrDebts) ? debtOrDebts : [debtOrDebts];
    if (nextDebts.length === 0) return;

    setPaymentForm({
      paid_at: toDateTimeLocalValue(),
      quantity: 0,
      unit_price: 0,
      paid_amount: 0,
      notes: '',
    });
    setPaymentItems(nextDebts.reduce<Record<string, PaymentItemFormState>>((acc, debt) => {
      acc[debt.id] = {
        quantity: Number(debt.assigned_quantity || 0),
        unit_price: Number(debt.unit_price || 0),
        paid_amount: Number(debt.expected_amount || 0),
      };
      return acc;
    }, {}));
    setActivePaymentDebts(nextDebts);
  }, []);

  const toggleDebtSelection = React.useCallback((debtId: string) => {
    setSelectedDebtIds((current) => current.includes(debtId)
      ? current.filter((id) => id !== debtId)
      : [...current, debtId]);
  }, []);

  const toggleAllFilteredDebts = React.useCallback(() => {
    const filteredIds = filteredDebts.map((debt) => debt.id);
    setSelectedDebtIds((current) => filteredIds.every((id) => current.includes(id))
      ? current.filter((id) => !filteredIds.includes(id))
      : Array.from(new Set([...current, ...filteredIds])));
  }, [filteredDebts]);

  const updatePaymentAmount = (debtId: string, field: 'quantity' | 'unit_price' | 'paid_amount', value: number) => {
    setPaymentItems((current) => {
      const currentItem = current[debtId] || { quantity: 0, unit_price: 0, paid_amount: 0 };
      const nextItem = { ...currentItem, [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        nextItem.paid_amount = Math.round(Number(nextItem.quantity || 0) * normalizeMoneyValue(Number(nextItem.unit_price || 0)));
      }
      return { ...current, [debtId]: nextItem };
    });
  };

  const submitPaymentForm = async () => {
    await paymentMutation.mutateAsync(activePaymentDebts.map((debt) => {
      const item = paymentItems[debt.id] || { quantity: 0, unit_price: 0, paid_amount: 0 };
      return {
        delivery_vehicle_id: debt.id,
        paid_at: new Date(paymentForm.paid_at).toISOString(),
        quantity: Number(item.quantity || 0),
        unit_price: normalizeMoneyValue(Number(item.unit_price || 0)),
        paid_amount: normalizeMoneyValue(Number(item.paid_amount || 0)),
        notes: paymentForm.notes.trim() || undefined,
      };
    }));
    setActivePaymentDebts([]);
    setSelectedDebtIds([]);
  };

  const renderPaymentModal = () => {
    if (activePaymentDebts.length === 0) return null;

    const closePaymentModal = () => setActivePaymentDebts([]);
    const totalExpected = activePaymentDebts.reduce((sum, debt) => sum + Number(debt.expected_amount || 0), 0);
    const totalPaid = activePaymentDebts.reduce((sum, debt) => sum + normalizeMoneyValue(Number(paymentItems[debt.id]?.paid_amount || 0)), 0);

    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <button
          type="button"
          aria-label="Đóng form nhập tiền"
          className="absolute inset-0 bg-black/50 animate-in fade-in duration-150"
          onClick={closePaymentModal}
        />

        <div className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                <Banknote size={22} />
              </div>
              <div>
                <h2 className="text-lg font-black text-foreground">Nhập tiền trả nhiều đơn</h2>
                <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
                  {activePaymentDebts.length} đơn đã chọn • Tổng công nợ {formatCurrency(totalExpected)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closePaymentModal}
              className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold text-muted-foreground hover:bg-muted"
            >
              ×
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
            <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr_180px]">
              <div className="space-y-1.5">
                <label className="text-[12px] font-black uppercase text-emerald-700">Ngày giờ chung</label>
                <input
                  type="datetime-local"
                  value={paymentForm.paid_at}
                  onChange={(event) => setPaymentForm((current) => ({ ...current, paid_at: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] font-semibold outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-black uppercase text-emerald-700">Ghi chú chung</label>
                <input
                  value={paymentForm.notes}
                  onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Ghi chú nếu có..."
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] outline-none focus:border-emerald-500"
                />
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                <p className="text-[10px] font-black uppercase text-emerald-700/70">Tổng thành tiền</p>
                <p className="mt-1 text-lg font-black tabular-nums text-emerald-700">{formatCurrency(totalPaid)}</p>
              </div>
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
              <table className="w-full border-separate border-spacing-0">
                <thead className="bg-muted/70">
                  <tr>
                    <th className="px-3 py-3 text-left text-[11px] font-black uppercase text-muted-foreground">Khách / xe</th>
                    <th className="px-3 py-3 text-left text-[11px] font-black uppercase text-muted-foreground">Tên hàng</th>
                    <th className="px-3 py-3 text-right text-[11px] font-black uppercase text-muted-foreground">Số lượng</th>
                    <th className="px-3 py-3 text-right text-[11px] font-black uppercase text-muted-foreground">Đơn giá</th>
                    <th className="px-3 py-3 text-right text-[11px] font-black uppercase text-muted-foreground">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activePaymentDebts.map((debt) => {
                    const item = paymentItems[debt.id] || { quantity: 0, unit_price: 0, paid_amount: 0 };
                    return (
                      <tr key={debt.id}>
                        <td className="px-3 py-3 align-top">
                          <p className="text-[13px] font-bold text-foreground">{debt.customer?.name || 'Chưa có khách'}</p>
                          <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{debt.vehicle?.license_plate || 'Chưa có xe'} • {debt.driver?.full_name || 'Chưa có tài xế'}</p>
                        </td>
                        <td className="px-3 py-3 align-top text-[13px] font-bold text-foreground">{debt.product_name || 'Chưa có tên hàng'}</td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(event) => updatePaymentAmount(debt.id, 'quantity', numberFromInput(event.target.value))}
                            className="h-10 w-full rounded-xl border border-border bg-card px-3 text-right text-[13px] font-semibold tabular-nums outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="number"
                            min="0"
                            value={item.unit_price}
                            onChange={(event) => updatePaymentAmount(debt.id, 'unit_price', numberFromInput(event.target.value))}
                            className="h-10 w-full rounded-xl border border-border bg-card px-3 text-right text-[13px] font-semibold tabular-nums outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="number"
                            min="0"
                            value={item.paid_amount}
                            onChange={(event) => updatePaymentAmount(debt.id, 'paid_amount', numberFromInput(event.target.value))}
                            className="h-10 w-full rounded-xl border border-border bg-card px-3 text-right text-[13px] font-black text-emerald-700 tabular-nums outline-none focus:border-emerald-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {activePaymentDebts.map((debt) => {
                const item = paymentItems[debt.id] || { quantity: 0, unit_price: 0, paid_amount: 0 };
                return (
                  <div key={debt.id} className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-[13px] font-bold text-foreground">{debt.customer?.name || 'Chưa có khách'}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">{debt.vehicle?.license_plate || 'Chưa có xe'} • {debt.product_name || 'Chưa có tên hàng'}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <input type="number" min="0" value={item.quantity} onChange={(event) => updatePaymentAmount(debt.id, 'quantity', numberFromInput(event.target.value))} className="h-10 rounded-xl border border-border bg-background px-2 text-center text-[13px] font-semibold tabular-nums outline-none" />
                      <input type="number" min="0" value={item.unit_price} onChange={(event) => updatePaymentAmount(debt.id, 'unit_price', numberFromInput(event.target.value))} className="h-10 rounded-xl border border-border bg-background px-2 text-center text-[13px] font-semibold tabular-nums outline-none" />
                      <input type="number" min="0" value={item.paid_amount} onChange={(event) => updatePaymentAmount(debt.id, 'paid_amount', numberFromInput(event.target.value))} className="h-10 rounded-xl border border-border bg-background px-2 text-center text-[13px] font-black text-emerald-700 tabular-nums outline-none" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/20 px-5 py-4 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={closePaymentModal}
              className="h-11 rounded-xl border border-border bg-card px-5 text-[13px] font-bold text-muted-foreground hover:bg-muted"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={submitPaymentForm}
              disabled={paymentMutation.isPending}
              className="h-11 rounded-xl bg-emerald-600 px-6 text-[13px] font-black uppercase text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {paymentMutation.isPending ? 'Đang lưu...' : `Lưu ${activePaymentDebts.length} đơn`}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  };
  const debtDesktopRows = React.useMemo(() => sortedDates.map((date) => (
    <React.Fragment key={date}>
      <tr className="bg-muted/50">
        <td colSpan={mode === 'vehicle' ? 10 : 8} className="px-4 py-2 border-y border-slate-100/10">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-red-500/10 flex items-center justify-center text-red-600">
              <Calendar size={13} />
            </div>
            <span className="text-[12px] font-black text-foreground uppercase tracking-wider">
              Ngày giao/phân: {date !== 'N/A' ? formatDate(date) : 'Chưa có ngày'}
            </span>
            <div className="h-[1px] flex-1 bg-border ml-2" />
          </div>
        </td>
      </tr>
      {groupedDebts[date].map((debt) => (
        <React.Fragment key={debt.id}>
          <tr className="hover:bg-muted/10 transition-colors group">
            {mode === 'vehicle' && (
              <td className="px-4 py-3 align-top">
                <input
                  type="checkbox"
                  checked={selectedDebtIds.includes(debt.id)}
                  onChange={() => toggleDebtSelection(debt.id)}
                  className="h-4 w-4 rounded border-border text-emerald-600 accent-emerald-600"
                />
              </td>
            )}
            <td className="px-4 py-3 align-top">
              <span className="text-[13px] font-bold text-primary tabular-nums">{debt.order_code}</span>
              <span className="block text-[11px] text-muted-foreground mt-1">{formatDate(debt.order_date)}</span>
            </td>
            <td className="px-4 py-3 align-top">
              <span className="text-[13px] font-bold text-foreground line-clamp-1">{debt.customer?.name || 'Chưa có khách'}</span>
              {debt.customer?.phone && <span className="block text-[11px] text-muted-foreground">{debt.customer.phone}</span>}
            </td>
            <td className="px-4 py-3 align-top">
              <span className="inline-flex items-center gap-1 text-[13px] font-bold text-foreground">
                <Truck size={13} /> {debt.vehicle?.license_plate || 'Chưa có xe'}
              </span>
              <span className="block text-[11px] text-muted-foreground mt-1">{debt.driver?.full_name || 'Chưa có tài xế'}</span>
            </td>
            <td className="px-4 py-3 align-top">
              <span className="text-[13px] font-bold text-foreground line-clamp-1">{debt.product_name || 'Chưa có tên hàng'}</span>
            </td>
            <td className="px-4 py-3 text-right align-top tabular-nums font-semibold">{debt.assigned_quantity.toLocaleString('vi-VN')}</td>
            <td className="px-4 py-3 text-right align-top tabular-nums text-muted-foreground">{formatCurrency(debt.unit_price)}</td>
            <td className="px-4 py-3 text-right align-top tabular-nums font-black text-red-600">{formatCurrency(debt.expected_amount)}</td>
            <td className="px-4 py-3 text-center align-top">
              <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-700">Chưa TT</span>
            </td>
            {mode === 'vehicle' && (
              <td className="px-4 py-3 text-right align-top">
                <button
                  type="button"
                  onClick={() => openPaymentForm(debt)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase text-white shadow-sm hover:bg-emerald-700"
                >
                  <CheckCircle2 size={13} /> Nhập tiền trả
                </button>
              </td>
            )}
          </tr>
        </React.Fragment>
      ))}
    </React.Fragment>
  )), [groupedDebts, mode, openPaymentForm, selectedDebtIds, sortedDates, toggleDebtSelection]);

  const debtMobileCards = React.useMemo(() => filteredDebts.map((debt) => (
    <div key={debt.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {mode === 'vehicle' && (
            <input
              type="checkbox"
              checked={selectedDebtIds.includes(debt.id)}
              onChange={() => toggleDebtSelection(debt.id)}
              className="mt-0.5 h-4 w-4 rounded border-border text-emerald-600 accent-emerald-600"
            />
          )}
          <div>
          <p className="text-[13px] font-black text-primary">{debt.order_code}</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">{formatDate(getDebtDate(debt))}</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-700">Chưa TT</span>
      </div>
      <div className="mt-3 space-y-2 text-[13px]">
        <div className="flex items-center gap-2 font-bold text-foreground"><Store size={14} /> {debt.customer?.name || 'Chưa có khách'}</div>
        <div className="flex items-center gap-2 text-muted-foreground"><Package size={14} /> {debt.product_name || 'Chưa có tên hàng'}</div>
        <div className="flex items-center gap-2 text-muted-foreground"><Truck size={14} /> {debt.vehicle?.license_plate || 'Chưa có xe'}</div>
        <div className="flex items-center gap-2 text-muted-foreground"><UserRound size={14} /> {debt.driver?.full_name || 'Chưa có tài xế'}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-border text-center">
        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">SL</p>
          <p className="text-[13px] font-black tabular-nums">{debt.assigned_quantity.toLocaleString('vi-VN')}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">Đơn giá</p>
          <p className="text-[13px] font-black tabular-nums">{formatCurrency(debt.unit_price)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">Công nợ</p>
          <p className="text-[13px] font-black text-red-600 tabular-nums">{formatCurrency(debt.expected_amount)}</p>
        </div>
      </div>
      {mode === 'vehicle' && (
        <button
          type="button"
          onClick={() => openPaymentForm(debt)}
          className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[12px] font-black uppercase text-white shadow-sm hover:bg-emerald-700"
        >
          <CheckCircle2 size={14} /> Nhập tiền trả
        </button>
      )}
    </div>
  )), [filteredDebts, mode, openPaymentForm, selectedDebtIds, toggleDebtSelection]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0 overflow-hidden">
      <PageHeader title={config.title} description={config.description} backPath="/app/ke-toan" />

      <div className="md:hidden mb-4">
        <h1 className="text-xl font-bold text-foreground">{config.title}</h1>
        <p className="text-[13px] text-muted-foreground mt-1">{config.description}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-[12px] font-bold uppercase">
            <Banknote size={15} /> Tổng công nợ
          </div>
          <p className="text-xl font-black text-red-600 mt-2 tabular-nums">{formatCurrency(totalDebt)}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-[12px] font-bold uppercase">
            <Truck size={15} /> Số phân xe
          </div>
          <p className="text-xl font-black text-foreground mt-2 tabular-nums">{filteredDebts.length}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-[12px] font-bold uppercase">
            <Store size={15} /> Khách hàng
          </div>
          <p className="text-xl font-black text-foreground mt-2 tabular-nums">{totalCustomers}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-4 items-stretch md:items-center">
        <SearchInput
          placeholder="Tìm mã đơn, khách hàng, xe, tài xế..."
          onSearch={setSearchQuery}
          containerClassName="flex-1"
          className="h-[42px] bg-card"
        />

        <div className="hidden md:flex items-center gap-2">
          <MultiSearchableSelect
            options={customerOptions}
            value={filterCustomer}
            onValueChange={setFilterCustomer}
            placeholder="Khách hàng"
            className="w-[210px] bg-card h-[42px]"
            icon={<Store size={15} />}
          />
          <MultiSearchableSelect
            options={vehicleOptions}
            value={filterVehicle}
            onValueChange={setFilterVehicle}
            placeholder="Theo xe"
            className="w-[180px] bg-card h-[42px]"
            icon={<Truck size={15} />}
          />
          <DateRangePicker
            initialDateFrom={startDate}
            initialDateTo={endDate}
            onUpdate={(values) => {
              setStartDate(values.range.from ? format(values.range.from, 'yyyy-MM-dd') : '');
              setEndDate(values.range.to ? format(values.range.to, 'yyyy-MM-dd') : '');
            }}
          />
        </div>

        <button
          onClick={() => setIsFilterOpen(true)}
          className="md:hidden flex items-center justify-center h-[42px] border border-border rounded-xl bg-card text-muted-foreground"
        >
          <Filter size={17} />
        </button>
      </div>

      {mode === 'vehicle' && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="inline-flex rounded-2xl border border-border bg-card p-1 shadow-sm w-full md:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab('debts')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-[12px] font-black uppercase transition-colors ${activeTab === 'debts' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
            >
              Công nợ hiện tại
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-[12px] font-black uppercase transition-colors ${activeTab === 'history' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
            >
              Lịch sử nhập tiền
            </button>
          </div>

          {activeTab === 'history' && (
            <div className="inline-flex rounded-2xl border border-border bg-card p-1 shadow-sm w-full md:w-auto">
              <button
                type="button"
                onClick={() => setHistoryViewMode('order')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-[12px] font-black uppercase transition-colors ${historyViewMode === 'order' ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
              >
                Theo đơn hàng
              </button>
              <button
                type="button"
                onClick={() => setHistoryViewMode('vehicle')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-[12px] font-black uppercase transition-colors ${historyViewMode === 'vehicle' ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
              >
                Theo xe
              </button>
            </div>
          )}

          {activeTab === 'debts' && selectedDebts.length > 0 && (
            <button
              type="button"
              onClick={() => openPaymentForm(selectedDebts)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-[12px] font-black uppercase text-white shadow-sm hover:bg-emerald-700"
            >
              <CheckCircle2 size={15} /> Nhập tiền {selectedDebts.length} đơn
            </button>
          )}
        </div>
      )}

      <div className="md:bg-card md:rounded-2xl md:border md:border-border md:shadow-sm flex flex-col flex-1 min-h-0 md:overflow-hidden -mx-4 sm:mx-0">
        {activeTab === 'history' && mode === 'vehicle' ? (
          isHistoryLoading ? (
            <div className="p-4"><LoadingSkeleton rows={8} columns={7} /></div>
          ) : isHistoryError ? (
            <ErrorState onRetry={() => refetchHistory()} />
          ) : filteredPaymentHistory.length === 0 ? (
            <EmptyState title="Chưa có lịch sử nhập tiền" description="Các lần nhập tiền trả theo xe sẽ hiển thị tại đây." />
          ) : (
            <div className="flex-1 md:overflow-auto custom-scrollbar">
              <div className="hidden md:block">
                <table className="w-full border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-muted/80 backdrop-blur-md border-b border-border">
                      <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Ngày giờ</th>
                      <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Mã đơn</th>
                      <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Khách hàng</th>
                      <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Xe / tài xế</th>
                      <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Tên hàng</th>
                      <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Số lượng</th>
                      <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Đơn giá</th>
                      <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyGroupKeys.map((key) => (
                      <React.Fragment key={key}>
                        <tr className="bg-muted/50">
                          <td colSpan={8} className="px-4 py-2 border-y border-slate-100/10">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                                <History size={13} />
                              </div>
                              <span className="text-[12px] font-black text-foreground uppercase tracking-wider">
                                {historyViewMode === 'vehicle' ? 'Xe' : 'Đơn hàng'}: {key}
                              </span>
                              <div className="h-[1px] flex-1 bg-border ml-2" />
                            </div>
                          </td>
                        </tr>
                        {groupedPaymentHistory[key].map((payment) => (
                          <tr key={payment.id} className="hover:bg-muted/10 transition-colors">
                            <td className="px-4 py-3 align-top text-[13px] font-bold tabular-nums">{formatDateTime(payment.paid_at)}</td>
                            <td className="px-4 py-3 align-top text-[13px] font-bold text-primary tabular-nums">{payment.order_code || '-'}</td>
                            <td className="px-4 py-3 align-top text-[13px] font-bold text-foreground">{payment.customer?.name || 'Chưa có khách'}</td>
                            <td className="px-4 py-3 align-top">
                              <span className="inline-flex items-center gap-1 text-[13px] font-bold text-foreground">
                                <Truck size={13} /> {payment.vehicle?.license_plate || 'Chưa có xe'}
                              </span>
                              <span className="block text-[11px] text-muted-foreground mt-1">{payment.driver?.full_name || 'Chưa có tài xế'}</span>
                            </td>
                            <td className="px-4 py-3 align-top text-[13px] font-bold text-foreground">{payment.product_name || 'Chưa có tên hàng'}</td>
                            <td className="px-4 py-3 text-right align-top tabular-nums font-semibold">{Number(payment.quantity || 0).toLocaleString('vi-VN')}</td>
                            <td className="px-4 py-3 text-right align-top tabular-nums text-muted-foreground">{formatCurrency(payment.unit_price)}</td>
                            <td className="px-4 py-3 text-right align-top tabular-nums font-black text-emerald-600">{formatCurrency(payment.paid_amount)}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-3 p-4">
                {filteredPaymentHistory.map((payment) => (
                  <div key={payment.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-black text-primary">{payment.order_code || '-'}</p>
                        <p className="text-[12px] text-muted-foreground mt-0.5">{formatDateTime(payment.paid_at)}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-700">Đã nhập</span>
                    </div>
                    <div className="mt-3 space-y-2 text-[13px]">
                      <div className="flex items-center gap-2 font-bold text-foreground"><Store size={14} /> {payment.customer?.name || 'Chưa có khách'}</div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Package size={14} /> {payment.product_name || 'Chưa có tên hàng'}</div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Truck size={14} /> {payment.vehicle?.license_plate || 'Chưa có xe'}</div>
                      <div className="flex items-center gap-2 text-muted-foreground"><UserRound size={14} /> {payment.driver?.full_name || 'Chưa có tài xế'}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-border text-center">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">SL</p>
                        <p className="text-[13px] font-black tabular-nums">{Number(payment.quantity || 0).toLocaleString('vi-VN')}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Đơn giá</p>
                        <p className="text-[13px] font-black tabular-nums">{formatCurrency(payment.unit_price)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Thành tiền</p>
                        <p className="text-[13px] font-black text-emerald-600 tabular-nums">{formatCurrency(payment.paid_amount)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : isLoading ? (
          <div className="p-4"><LoadingSkeleton rows={10} columns={7} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : filteredDebts.length === 0 ? (
          <EmptyState title={config.emptyTitle} description={config.emptyDescription} />
        ) : (
          <div className="flex-1 md:overflow-auto custom-scrollbar">
            <div className="hidden md:block">
              <table className="w-full border-separate border-spacing-0">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-muted/80 backdrop-blur-md border-b border-border">
                    {mode === 'vehicle' && (
                      <th className="px-4 py-4 text-left border-b border-border">
                        <input
                          type="checkbox"
                          checked={isAllFilteredDebtsSelected}
                          onChange={toggleAllFilteredDebts}
                          className="h-4 w-4 rounded border-border text-emerald-600 accent-emerald-600"
                        />
                      </th>
                    )}
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Mã đơn</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Khách hàng</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Xe / tài xế</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Tên hàng</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Số lượng</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Đơn giá</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Công nợ</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-center border-b border-border">Trạng thái</th>
                    {mode === 'vehicle' && <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {debtDesktopRows}

                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3 p-4">
              {debtMobileCards}

            </div>
          </div>
        )}
      </div>

      {renderPaymentModal()}

      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={(filters) => {
          setStartDate(filters.dateFrom || '');
          setEndDate(filters.dateTo || '');
        }}
        onClear={() => {
          setFilterCustomer([]);
          setFilterVehicle([]);
          setStartDate('');
          setEndDate('');
        }}
        showClearButton={hasActiveFilters}
        initialDateFrom={startDate}
        initialDateTo={endDate}
        dateLabel="Khoảng thời gian"
      >
        <div className="space-y-1.5 z-30">
          <label className="text-[13px] font-bold text-muted-foreground">Khách hàng</label>
          <MultiSearchableSelect
            options={customerOptions}
            value={filterCustomer}
            onValueChange={setFilterCustomer}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
            inline
            icon={<Store size={15} />}
          />
        </div>
        <div className="space-y-1.5 z-[25]">
          <label className="text-[13px] font-bold text-muted-foreground">Theo xe</label>
          <MultiSearchableSelect
            options={vehicleOptions}
            value={filterVehicle}
            onValueChange={setFilterVehicle}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
            inline
            icon={<Truck size={15} />}
          />
        </div>
      </MobileFilterSheet>
    </div>
  );
};

export default CustomerDebtPage;


