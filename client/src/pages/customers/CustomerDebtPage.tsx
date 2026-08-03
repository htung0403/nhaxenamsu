import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Banknote, Calendar, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Filter, History, Package, Pencil, Printer, Store, Truck, UserRound } from 'lucide-react';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import { SearchInput } from '../../components/ui/SearchInput';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import { matchesSearch } from '../../lib/str-utils';
import { useRecordVehicleDebtPayments, useUpdateVehicleDebtPayment, useVehicleDebtPayments, useVehicleDebts } from '../../hooks/queries/useAccounting';
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

const moneyFromInput = (value: string) => Number(value.replace(/[^0-9]/g, '') || 0);

const formatCurrencyInput = (value: number) => {
  const normalizedValue = normalizeMoneyValue(value);
  if (!normalizedValue) return '';
  return new Intl.NumberFormat('vi-VN').format(normalizedValue);
};

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

const PAGE_SIZE = 50;
const CUSTOMER_DEBT_PRINT_STORAGE_KEY = 'customer-debt-a4-print-orders';

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
  const navigate = useNavigate();
  const { data: debts = [], isLoading, isError, refetch } = useVehicleDebts(config.customerType);
  const { data: paymentHistory = [], isLoading: isHistoryLoading, isError: isHistoryError, refetch: refetchHistory } = useVehicleDebtPayments(config.customerType);
  const paymentMutation = useRecordVehicleDebtPayments(config.customerType);
  const updatePaymentMutation = useUpdateVehicleDebtPayment(config.customerType);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterCustomer, setFilterCustomer] = React.useState<string[]>([]);
  const [filterVehicle, setFilterVehicle] = React.useState<string[]>([]);
  const [startDate, setStartDate] = React.useState<string>('');
  const [endDate, setEndDate] = React.useState<string>('');
  const [activeTab, setActiveTab] = React.useState<CustomerDebtTab>('debts');
  const [debtPage, setDebtPage] = React.useState(1);
  const [historyPage, setHistoryPage] = React.useState(1);
  const [historyViewMode, setHistoryViewMode] = React.useState<HistoryViewMode>('order');
  const [activePaymentDebts, setActivePaymentDebts] = React.useState<VehicleDebt[]>([]);
  const [editingPayment, setEditingPayment] = React.useState<VehicleDebtPayment | null>(null);
  const [selectedDebtIds, setSelectedDebtIds] = React.useState<string[]>([]);
  const [collapsedDebtDates, setCollapsedDebtDates] = React.useState<Record<string, boolean>>({});
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

  const totalDebt = filteredDebts.reduce((sum, debt) => sum + Number(debt.expected_amount || 0), 0);
  const totalCustomers = new Set(filteredDebts.map((debt) => debt.customer?.id || debt.customer?.name).filter(Boolean)).size;
  const debtTotalItems = filteredDebts.length;
  const debtTotalPages = Math.max(1, Math.ceil(debtTotalItems / PAGE_SIZE));
  const paginatedDebts = React.useMemo(() => {
    const start = (debtPage - 1) * PAGE_SIZE;
    return filteredDebts.slice(start, start + PAGE_SIZE);
  }, [filteredDebts, debtPage]);

  const groupedDebts = React.useMemo(() => {
    return paginatedDebts.reduce<Record<string, VehicleDebt[]>>((acc, debt) => {
      const date = getDebtDate(debt) || 'N/A';
      if (!acc[date]) acc[date] = [];
      acc[date].push(debt);
      return acc;
    }, {});
  }, [paginatedDebts]);

  const sortedDates = React.useMemo(() => Object.keys(groupedDebts).sort((a, b) => b.localeCompare(a)), [groupedDebts]);

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

  const historyTotalItems = filteredPaymentHistory.length;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotalItems / PAGE_SIZE));
  const paginatedPaymentHistory = React.useMemo(() => {
    const start = (historyPage - 1) * PAGE_SIZE;
    return filteredPaymentHistory.slice(start, start + PAGE_SIZE);
  }, [filteredPaymentHistory, historyPage]);

  const groupedPaymentHistory = React.useMemo(() => {
    return paginatedPaymentHistory.reduce<Record<string, VehicleDebtPayment[]>>((acc, payment) => {
      const key = historyViewMode === 'vehicle'
        ? payment.vehicle?.license_plate || 'Chưa có xe'
        : payment.order_code || 'Chưa có mã đơn';
      if (!acc[key]) acc[key] = [];
      acc[key].push(payment);
      return acc;
    }, {});
  }, [paginatedPaymentHistory, historyViewMode]);

  const historyGroupKeys = React.useMemo(() => Object.keys(groupedPaymentHistory).sort((a, b) => a.localeCompare(b, 'vi')), [groupedPaymentHistory]);

  const selectedDebts = React.useMemo(
    () => filteredDebts.filter((debt) => selectedDebtIds.includes(debt.id)),
    [filteredDebts, selectedDebtIds],
  );

  const isAllFilteredDebtsSelected = paginatedDebts.length > 0 && paginatedDebts.every((debt) => selectedDebtIds.includes(debt.id));

  React.useEffect(() => {
    setDebtPage(1);
    setHistoryPage(1);
  }, [searchQuery, filterCustomer, filterVehicle, startDate, endDate, historyViewMode]);

  React.useEffect(() => {
    setDebtPage((page) => Math.min(page, debtTotalPages));
  }, [debtTotalPages]);

  React.useEffect(() => {
    setHistoryPage((page) => Math.min(page, historyTotalPages));
  }, [historyTotalPages]);

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

  const openEditPaymentForm = React.useCallback((payment: VehicleDebtPayment) => {
    setPaymentForm({
      paid_at: toDateTimeLocalValue(new Date(payment.paid_at)),
      quantity: 0,
      unit_price: 0,
      paid_amount: 0,
      notes: payment.notes || '',
    });
    setPaymentItems({
      [payment.id]: {
        quantity: Number(payment.quantity || 0),
        unit_price: Number(payment.unit_price || 0) >= 10_000 ? Number(payment.unit_price || 0) / 1_000 : Number(payment.unit_price || 0),
        paid_amount: Number(payment.paid_amount || 0),
      },
    });
    setEditingPayment(payment);
  }, []);

  const toggleDebtSelection = React.useCallback((debtId: string) => {
    setSelectedDebtIds((current) => current.includes(debtId)
      ? current.filter((id) => id !== debtId)
      : [...current, debtId]);
  }, []);

  const toggleAllFilteredDebts = React.useCallback(() => {
    const visibleIds = paginatedDebts.map((debt) => debt.id);
    setSelectedDebtIds((current) => visibleIds.every((id) => current.includes(id))
      ? current.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds])));
  }, [paginatedDebts]);

  const toggleDebtDateCollapse = React.useCallback((date: string) => {
    setCollapsedDebtDates((current) => ({ ...current, [date]: !current[date] }));
  }, []);

  const toggleDebtDateSelection = React.useCallback((date: string) => {
    const dateIds = (groupedDebts[date] || []).map((debt) => debt.id);
    if (dateIds.length === 0) return;
    setSelectedDebtIds((current) => dateIds.every((id) => current.includes(id))
      ? current.filter((id) => !dateIds.includes(id))
      : Array.from(new Set([...current, ...dateIds])));
  }, [groupedDebts]);

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

  const openA4PrintPage = React.useCallback(() => {
    const sortedPrintDebts = [...activePaymentDebts].sort((a, b) =>
      (a.customer?.name || '').localeCompare(b.customer?.name || '', 'vi'),
    );

    const printPayload = {
      title: config.title,
      mode,
      printed_at: new Date().toISOString(),
      orders: sortedPrintDebts.map((debt) => {
        const item = paymentItems[debt.id] || { quantity: debt.assigned_quantity, unit_price: debt.unit_price, paid_amount: debt.expected_amount };
        return {
          id: debt.id,
          order_code: debt.order_code,
          order_date: debt.order_date,
          delivery_date: getDebtDate(debt),
          customer_name: debt.customer?.name || 'Chưa có khách',
          customer_phone: debt.customer?.phone || '',
          vehicle_plate: debt.vehicle?.license_plate || '',
          driver_name: debt.driver?.full_name || '',
          product_name: debt.product_name || '',
          quantity: Number(item.quantity || 0),
          unit_price: normalizeMoneyValue(Number(item.unit_price || 0)),
          expected_amount: Number(debt.expected_amount || 0),
          paid_amount: normalizeMoneyValue(Number(item.paid_amount || 0)),
        };
      }),
    };

    sessionStorage.setItem(CUSTOMER_DEBT_PRINT_STORAGE_KEY, JSON.stringify(printPayload));
    navigate('/app/ke-toan/in-cong-no-a4');
  }, [activePaymentDebts, config.title, mode, navigate, paymentItems]);

  const submitEditPaymentForm = async () => {
    if (!editingPayment) return;
    const item = paymentItems[editingPayment.id] || { quantity: 0, unit_price: 0, paid_amount: 0 };
    await updatePaymentMutation.mutateAsync({
      id: editingPayment.id,
      payload: {
        paid_at: new Date(paymentForm.paid_at).toISOString(),
        quantity: Number(item.quantity || 0),
        unit_price: normalizeMoneyValue(Number(item.unit_price || 0)),
        paid_amount: normalizeMoneyValue(Number(item.paid_amount || 0)),
        notes: paymentForm.notes.trim() || undefined,
      },
    });
    setEditingPayment(null);
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
                            value={item.unit_price || ''}
                            onChange={(event) => updatePaymentAmount(debt.id, 'unit_price', numberFromInput(event.target.value))}
                            className="h-10 w-full rounded-xl border border-border bg-card px-3 text-right text-[13px] font-semibold tabular-nums outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="text"
                            inputMode="numeric"
                            min="0"
                            value={formatCurrencyInput(item.paid_amount)}
                            onChange={(event) => updatePaymentAmount(debt.id, 'paid_amount', moneyFromInput(event.target.value))}
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
                      <input type="number" min="0" value={item.unit_price || ''} onChange={(event) => updatePaymentAmount(debt.id, 'unit_price', numberFromInput(event.target.value))} className="h-10 rounded-xl border border-border bg-background px-2 text-center text-[13px] font-semibold tabular-nums outline-none" />
                      <input type="text" inputMode="numeric" value={formatCurrencyInput(item.paid_amount)} onChange={(event) => updatePaymentAmount(debt.id, 'paid_amount', moneyFromInput(event.target.value))} className="h-10 rounded-xl border border-border bg-background px-2 text-center text-[13px] font-black text-emerald-700 tabular-nums outline-none" />
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
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={openA4PrintPage}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 text-[13px] font-black uppercase text-muted-foreground hover:bg-muted"
              >
                <Printer size={15} /> In A4
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
        </div>
      </div>,
      document.body,
    );
  };

  const renderEditPaymentModal = () => {
    if (!editingPayment) return null;
    const item = paymentItems[editingPayment.id] || { quantity: 0, unit_price: 0, paid_amount: 0 };

    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <button
          type="button"
          aria-label="Đóng form chỉnh sửa"
          className="absolute inset-0 bg-black/50 animate-in fade-in duration-150"
          onClick={() => setEditingPayment(null)}
        />
        <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                <Pencil size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black text-foreground">Chỉnh sửa lịch sử nhập tiền</h2>
                <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
                  {editingPayment.customer?.name || 'Chưa có khách'} • {editingPayment.vehicle?.license_plate || 'Chưa có xe'} • {editingPayment.product_name || 'Chưa có tên hàng'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditingPayment(null)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold text-muted-foreground hover:bg-muted"
            >
              ×
            </button>
          </div>

          <div className="p-5 md:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[12px] font-black uppercase text-emerald-700">Ngày giờ</label>
                <input
                  type="datetime-local"
                  value={paymentForm.paid_at}
                  onChange={(event) => setPaymentForm((current) => ({ ...current, paid_at: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] font-semibold outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-black uppercase text-emerald-700">Số lượng/số tiền</label>
                <input
                  type="number"
                  min="0"
                  value={item.quantity}
                  onChange={(event) => updatePaymentAmount(editingPayment.id, 'quantity', numberFromInput(event.target.value))}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] font-semibold tabular-nums outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-black uppercase text-emerald-700">Đơn giá</label>
                <input
                  type="number"
                  min="0"
                  value={item.unit_price || ''}
                  onChange={(event) => updatePaymentAmount(editingPayment.id, 'unit_price', numberFromInput(event.target.value))}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] font-semibold tabular-nums outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-black uppercase text-emerald-700">Thành tiền</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatCurrencyInput(item.paid_amount)}
                  onChange={(event) => updatePaymentAmount(editingPayment.id, 'paid_amount', moneyFromInput(event.target.value))}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] font-black text-emerald-700 tabular-nums outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <input
              value={paymentForm.notes}
              onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Ghi chú nếu có..."
              className="mt-4 h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setEditingPayment(null)}
              className="h-11 rounded-xl border border-border bg-card px-5 text-[13px] font-bold text-muted-foreground hover:bg-muted"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={submitEditPaymentForm}
              disabled={updatePaymentMutation.isPending}
              className="h-11 rounded-xl bg-emerald-600 px-6 text-[13px] font-black uppercase text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {updatePaymentMutation.isPending ? 'Đang lưu...' : 'Lưu chỉnh sửa'}
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
        <td colSpan={10} className="px-4 py-2 border-y border-slate-100/10">
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
            <td className="px-4 py-3 align-top">
              <input
                type="checkbox"
                checked={selectedDebtIds.includes(debt.id)}
                onChange={() => toggleDebtSelection(debt.id)}
                className="h-4 w-4 rounded border-border text-emerald-600 accent-emerald-600"
              />
            </td>
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
            <td className="px-4 py-3 text-right align-top">
              <button
                type="button"
                onClick={() => openPaymentForm(debt)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase text-white shadow-sm hover:bg-emerald-700"
              >
                <CheckCircle2 size={13} /> Nhập tiền trả
              </button>
            </td>
          </tr>
        </React.Fragment>
      ))}
    </React.Fragment>
  )), [groupedDebts, mode, openPaymentForm, selectedDebtIds, sortedDates, toggleDebtSelection]);

  const renderDebtMobileCard = React.useCallback((debt: VehicleDebt) => {
    const isSelected = selectedDebtIds.includes(debt.id);
    return (
      <div key={debt.id} className={`bg-card border rounded-2xl p-3 transition-all ${isSelected ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-border'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleDebtSelection(debt.id)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-emerald-600 accent-emerald-600"
          />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-black text-primary">{debt.order_code}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{formatDate(getDebtDate(debt))}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase text-red-600">Chưa TT</span>
      </div>
      <div className="mt-3 space-y-2 text-[12px]">
        <div className="flex items-center gap-2 font-black text-foreground"><Store size={13} className="shrink-0 text-slate-500" /> <span className="truncate">{debt.customer?.name || 'Chưa có khách'}</span></div>
        <div className="flex items-center gap-2 text-muted-foreground"><Package size={13} className="shrink-0" /> <span className="truncate">{debt.product_name || 'Chưa có tên hàng'}</span></div>
        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5 rounded-xl bg-muted/40 px-2.5 py-2"><Truck size={13} className="shrink-0" /> <span className="truncate font-semibold">{debt.vehicle?.license_plate || 'Chưa có xe'}</span></div>
          <div className="flex min-w-0 items-center gap-1.5 rounded-xl bg-muted/40 px-2.5 py-2"><UserRound size={13} className="shrink-0" /> <span className="truncate font-semibold">{debt.driver?.full_name || 'Chưa có tài xế'}</span></div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
        <div className="rounded-xl bg-muted/30 px-2 py-2">
          <p className="text-[10px] uppercase font-bold text-muted-foreground">SL</p>
          <p className="text-[13px] font-black tabular-nums">{debt.assigned_quantity.toLocaleString('vi-VN')}</p>
        </div>
        <div className="rounded-xl bg-muted/30 px-2 py-2">
          <p className="text-[10px] uppercase font-bold text-muted-foreground">Đơn giá</p>
          <p className="text-[13px] font-black tabular-nums">{formatCurrency(debt.unit_price)}</p>
        </div>
        <div className="rounded-xl bg-red-50 px-2 py-2">
          <p className="text-[10px] uppercase font-bold text-muted-foreground">Công nợ</p>
          <p className="text-[13px] font-black text-red-600 tabular-nums">{formatCurrency(debt.expected_amount)}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => openPaymentForm(debt)}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[12px] font-black uppercase text-white shadow-sm hover:bg-emerald-700"
      >
        <CheckCircle2 size={14} /> Nhập tiền trả
      </button>
    </div>
    );
  }, [mode, openPaymentForm, selectedDebtIds, toggleDebtSelection]);

  const debtMobileGroups = React.useMemo(() => sortedDates.map((date) => {
    const dateDebts = groupedDebts[date] || [];
    const isCollapsed = collapsedDebtDates[date] === true;
    const dateIds = dateDebts.map((debt) => debt.id);
    const selectedCount = dateIds.filter((id) => selectedDebtIds.includes(id)).length;
    const isAllDateSelected = dateIds.length > 0 && selectedCount === dateIds.length;
    const dateDebtTotal = dateDebts.reduce((sum, debt) => sum + Number(debt.expected_amount || 0), 0);

    return (
      <div key={date} className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-3.5 py-3 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={isAllDateSelected}
              onChange={() => toggleDebtDateSelection(date)}
              className="h-4 w-4 shrink-0 rounded border-border text-emerald-600 accent-emerald-600"
              aria-label={`Chọn toàn bộ đơn ngày ${date !== 'N/A' ? formatDate(date) : 'chưa có ngày'}`}
            />
            <button
              type="button"
              onClick={() => toggleDebtDateCollapse(date)}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600">
                  <Calendar size={14} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-black uppercase tracking-wide text-foreground">{date !== 'N/A' ? formatDate(date) : 'Chưa có ngày'}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                    {dateDebts.length} đơn{selectedCount > 0 ? ` • đã chọn ${selectedCount}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[12px] font-black tabular-nums text-red-600">{formatCurrency(dateDebtTotal)}</span>
                <ChevronDown size={16} className={`text-muted-foreground transition-transform duration-300 ease-out ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
              </div>
            </button>
          </div>
        </div>
        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
          <div className="min-h-0 overflow-hidden">
            <div className={`space-y-2.5 bg-muted/20 px-2.5 py-2 transition-transform duration-300 ease-out ${isCollapsed ? '-translate-y-1' : 'translate-y-0'}`}>
              {dateDebts.map(renderDebtMobileCard)}
            </div>
          </div>
        </div>
      </div>
    );
  }), [collapsedDebtDates, groupedDebts, mode, renderDebtMobileCard, selectedDebtIds, sortedDates, toggleDebtDateCollapse, toggleDebtDateSelection]);

  const renderPaginationControls = (
    page: number,
    totalPages: number,
    totalItems: number,
    setPage: React.Dispatch<React.SetStateAction<number>>,
  ) => {
    if (totalItems <= PAGE_SIZE) return null;

    const startPage = totalPages <= 5 ? 1 : Math.min(Math.max(page - 2, 1), totalPages - 4);
    const visiblePages = Array.from({ length: Math.min(totalPages, 5) }, (_, index) => startPage + index);

    return (
      <div className="mt-2 shrink-0 bg-background md:sticky md:bottom-0 md:z-30 md:mt-0">
        <div className="flex items-center justify-between rounded-b-2xl border-x border-b border-border bg-card/95 px-3 py-3 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] backdrop-blur md:px-4">
          <span className="text-[12px] font-bold text-muted-foreground">
            {`${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, totalItems)}`} / Tổng {totalItems}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-20"
              aria-label="Trang trước"
            >
              <ChevronLeft size={15} />
            </button>
            {visiblePages.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-black transition-colors ${page === pageNumber ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-20"
              aria-label="Trang sau"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0 overflow-y-auto">
      <PageHeader title={config.title} description={config.description} backPath="/app/ke-toan" />

      <div className="md:hidden mb-3 px-0.5">
        <h1 className="text-[20px] font-black leading-tight text-foreground">{config.title}</h1>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{config.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-3 sm:grid-cols-3 md:gap-3 md:mb-4">
        <div className="col-span-2 bg-card border border-border rounded-2xl p-3.5 shadow-sm sm:col-span-1 md:p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-black uppercase md:text-[12px]">
            <Banknote size={15} /> Tổng công nợ
          </div>
          <p className="mt-1.5 text-[20px] font-black text-red-600 tabular-nums md:mt-2 md:text-xl">{formatCurrency(totalDebt)}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-3.5 shadow-sm md:p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-black uppercase md:text-[12px]">
            <Truck size={15} /> Số phân xe
          </div>
          <p className="mt-1.5 text-[20px] font-black text-foreground tabular-nums md:mt-2 md:text-xl">{filteredDebts.length}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-3.5 shadow-sm md:p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-black uppercase md:text-[12px]">
            <Store size={15} /> Khách hàng
          </div>
          <p className="mt-1.5 text-[20px] font-black text-foreground tabular-nums md:mt-2 md:text-xl">{totalCustomers}</p>
        </div>
      </div>

      <div className="flex flex-row md:flex-row gap-2.5 md:gap-3 mb-3 md:mb-4 items-stretch md:items-center">
        <SearchInput
          placeholder="Tìm mã đơn, khách hàng, xe, tài xế..."
          onSearch={setSearchQuery}
          containerClassName="flex-1"
          className="h-11 bg-card text-[13px] md:h-[42px]"
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
          className="md:hidden flex h-11 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm"
        >
          <Filter size={17} />
        </button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="inline-flex rounded-2xl border border-border bg-card p-1 shadow-sm w-full md:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab('debts')}
              className={`flex-1 md:flex-none px-3 py-2.5 rounded-xl text-[11px] md:text-[12px] font-black uppercase transition-colors ${activeTab === 'debts' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
            >
              Công nợ hiện tại
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex-1 md:flex-none px-3 py-2.5 rounded-xl text-[11px] md:text-[12px] font-black uppercase transition-colors ${activeTab === 'history' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
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
              className="inline-flex h-11 w-full md:w-auto items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-[12px] font-black uppercase text-white shadow-sm hover:bg-emerald-700"
            >
              <CheckCircle2 size={15} /> Nhập tiền {selectedDebts.length} đơn
            </button>
          )}
        </div>

      <div className="flex flex-col -mx-4 sm:mx-0">
        {activeTab === 'history' ? (
          isHistoryLoading ? (
            <div className="p-4"><LoadingSkeleton rows={8} columns={7} /></div>
          ) : isHistoryError ? (
            <ErrorState onRetry={() => refetchHistory()} />
          ) : filteredPaymentHistory.length === 0 ? (
            <EmptyState title="Chưa có lịch sử nhập tiền" description="Các lần nhập tiền trả theo xe sẽ hiển thị tại đây." />
          ) : (
            <div className="md:rounded-2xl md:bg-card md:shadow-sm">
              <div className="relative hidden md:block rounded-t-2xl border-x border-t border-border bg-card before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[57px] before:rounded-t-2xl before:bg-muted before:content-['']">
                <table className="relative z-[1] w-full border-separate border-spacing-0 rounded-t-2xl">
                  <thead className="sticky top-0 z-20 rounded-t-2xl bg-muted [clip-path:inset(0_round_1rem_1rem_0_0)]">
                    <tr className="border-b border-border">
                      <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border md:rounded-tl-2xl">Ngày giờ</th>
                      <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Mã đơn</th>
                      <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Khách hàng</th>
                      <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Xe / tài xế</th>
                      <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Tên hàng</th>
                      <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Nhập bởi</th>
                      <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Số lượng</th>
                      <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Đơn giá</th>
                      <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Thành tiền</th>
                      <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border md:rounded-tr-2xl">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-card">
                    {historyGroupKeys.map((key) => (
                      <React.Fragment key={key}>
                        <tr className="bg-muted/50">
                          <td colSpan={10} className="px-4 py-2 border-y border-slate-100/10">
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
                            <td className="px-4 py-3 align-top text-[13px] font-bold text-foreground">{payment.entered_by?.full_name || 'Chưa rõ'}</td>
                            <td className="px-4 py-3 text-right align-top tabular-nums font-semibold">{Number(payment.quantity || 0).toLocaleString('vi-VN')}</td>
                            <td className="px-4 py-3 text-right align-top tabular-nums text-muted-foreground">{formatCurrency(payment.unit_price)}</td>
                            <td className="px-4 py-3 text-right align-top tabular-nums font-black text-emerald-600">{formatCurrency(payment.paid_amount)}</td>
                            <td className="px-4 py-3 text-right align-top">
                              <button
                                type="button"
                                onClick={() => openEditPaymentForm(payment)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[11px] font-black uppercase text-muted-foreground hover:bg-muted"
                              >
                                <Pencil size={13} /> Chỉnh sửa
                              </button>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2.5 p-3 pb-24">
                {paginatedPaymentHistory.map((payment) => (
                  <div key={payment.id} className="bg-card border border-border rounded-2xl p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-black text-primary">{payment.order_code || '-'}</p>
                        <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{formatDateTime(payment.paid_at)}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">Đã nhập</span>
                    </div>
                    <div className="mt-3 space-y-2 text-[12px]">
                      <div className="flex items-center gap-2 font-black text-foreground"><Store size={13} className="shrink-0 text-slate-500" /> <span className="truncate">{payment.customer?.name || 'Chưa có khách'}</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Package size={13} className="shrink-0" /> <span className="truncate">{payment.product_name || 'Chưa có tên hàng'}</span></div>
                      <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                        <div className="flex min-w-0 items-center gap-1.5 rounded-xl bg-muted/40 px-2.5 py-2"><Truck size={13} className="shrink-0" /> <span className="truncate font-semibold">{payment.vehicle?.license_plate || 'Chưa có xe'}</span></div>
                        <div className="flex min-w-0 items-center gap-1.5 rounded-xl bg-muted/40 px-2.5 py-2"><UserRound size={13} className="shrink-0" /> <span className="truncate font-semibold">{payment.driver?.full_name || 'Chưa có tài xế'}</span></div>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-2.5 py-2 text-emerald-700"><UserRound size={13} className="shrink-0" /> <span className="truncate font-bold">Nhập bởi: {payment.entered_by?.full_name || 'Chưa rõ'}</span></div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                      <div className="rounded-xl bg-muted/30 px-2 py-2">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">SL</p>
                        <p className="text-[13px] font-black tabular-nums">{Number(payment.quantity || 0).toLocaleString('vi-VN')}</p>
                      </div>
                      <div className="rounded-xl bg-muted/30 px-2 py-2">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Đơn giá</p>
                        <p className="text-[13px] font-black tabular-nums">{formatCurrency(payment.unit_price)}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50 px-2 py-2">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Thành tiền</p>
                        <p className="text-[13px] font-black text-emerald-600 tabular-nums">{formatCurrency(payment.paid_amount)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditPaymentForm(payment)}
                      className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-[12px] font-black uppercase text-muted-foreground hover:bg-muted"
                    >
                      <Pencil size={14} /> Chỉnh sửa
                    </button>
                  </div>
                ))}
              </div>
              {renderPaginationControls(historyPage, historyTotalPages, historyTotalItems, setHistoryPage)}
            </div>
          )
        ) : isLoading ? (
          <div className="p-4"><LoadingSkeleton rows={10} columns={7} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : filteredDebts.length === 0 ? (
          <EmptyState title={config.emptyTitle} description={config.emptyDescription} />
        ) : (
          <div className="md:rounded-2xl md:bg-card md:shadow-sm">
            <div className="relative hidden md:block rounded-t-2xl border-x border-t border-border bg-card before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[57px] before:rounded-t-2xl before:bg-muted before:content-['']">
              <table className="relative z-[1] w-full border-separate border-spacing-0 rounded-t-2xl">
                <thead className="sticky top-0 z-20 rounded-t-2xl bg-muted [clip-path:inset(0_round_1rem_1rem_0_0)]">
                  <tr className="border-b border-border">
                    <th className="bg-muted px-4 py-4 text-left border-b border-border md:rounded-tl-2xl">
                      <input
                        type="checkbox"
                        checked={isAllFilteredDebtsSelected}
                        onChange={toggleAllFilteredDebts}
                        className="h-4 w-4 rounded border-border text-emerald-600 accent-emerald-600"
                      />
                    </th>
                    <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Mã đơn</th>
                    <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Khách hàng</th>
                    <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Xe / tài xế</th>
                    <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Tên hàng</th>
                    <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Số lượng</th>
                    <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Đơn giá</th>
                    <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Công nợ</th>
                    <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-center border-b border-border">Trạng thái</th>
                    <th className="bg-muted px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border md:rounded-tr-2xl">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-card">
                  {debtDesktopRows}

                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3 px-5 py-3 pb-24">
              {debtMobileGroups}

            </div>
            {renderPaginationControls(debtPage, debtTotalPages, debtTotalItems, setDebtPage)}
          </div>
        )}
      </div>

      {renderPaymentModal()}
      {renderEditPaymentModal()}

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


