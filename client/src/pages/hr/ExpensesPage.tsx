import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import PageHeader from '../../components/shared/PageHeader';
import { useExpenses, useCreateExpense, useUpdateExpense, useConfirmExpense, useConfirmExpensesBulk, useEmployees, hrKeys } from '../../hooks/queries/useHR';
import { hrApi } from '../../api/hrApi';
import { useVehicles } from '../../hooks/queries/useVehicles';
import { useAuth } from '../../context/AuthContext';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import StatusBadge from '../../components/shared/StatusBadge';
import DraggableFAB from '../../components/shared/DraggableFAB';
import { DatePicker } from '../../components/shared/DatePicker';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import CurrencyInput from '../../components/shared/CurrencyInput';
import { CustomSelect } from '../../components/shared/CustomSelect';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { SearchInput } from '../../components/ui/SearchInput';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import { uploadApi } from '../../api/uploadApi';
import { matchesSearch } from '../../lib/str-utils';
import { cloudinaryLarge, cloudinaryThumb } from '../../lib/cloudinaryUrl';
import { format } from 'date-fns';
import { Plus, Receipt, X, ChevronRight, Upload, Trash2, Edit2, CheckCircle2, Image as ImageIcon, ChevronLeft, ChevronRight as ChevronRightIcon, Camera, Filter, CalendarDays, Printer } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import type { Expense } from '../../types';

const VN_TZ = 'Asia/Ho_Chi_Minh';

function getVnNowForm(): { date: string; time: string } {
  const d = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const tp = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hh = (tp.find((x) => x.type === 'hour')?.value ?? '00').padStart(2, '0');
  const mm = (tp.find((x) => x.type === 'minute')?.value ?? '00').padStart(2, '0');
  return { date: dateStr, time: `${hh}:${mm}` };
}

function formatExpenseDateDisplay(raw: string): string {
  if (!raw) return '—';
  const ms = Date.parse(raw.length === 10 ? `${raw}T00:00:00+07:00` : raw);
  if (Number.isNaN(ms)) return raw;
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: VN_TZ, day: '2-digit' }).format(d);
  const month = new Intl.DateTimeFormat('en-GB', { timeZone: VN_TZ, month: '2-digit' }).format(d);
  const year = new Intl.DateTimeFormat('en-GB', { timeZone: VN_TZ, year: 'numeric' }).format(d);
  const tp = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hh = (tp.find((x) => x.type === 'hour')?.value ?? '00').padStart(2, '0');
  const min = (tp.find((x) => x.type === 'minute')?.value ?? '00').padStart(2, '0');
  return `${day}/${month}/${year} ${hh}:${min}`;
}

function parseExpenseToFormDateTime(raw: string): { date: string; time: string } {
  const ms = Date.parse(raw.length === 10 ? `${raw}T00:00:00+07:00` : raw);
  if (Number.isNaN(ms)) return getVnNowForm();
  const d = new Date(ms);
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const tp = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hh = (tp.find((x) => x.type === 'hour')?.value ?? '00').padStart(2, '0');
  const mm = (tp.find((x) => x.type === 'minute')?.value ?? '00').padStart(2, '0');
  return { date: dateStr, time: `${hh}:${mm}` };
}

function toVietnamExpenseIso(dateStr: string, timeStr: string): string | null {
  const [Y, M, D] = dateStr.split('-').map(Number);
  const [h, m] = timeStr.split(':').map(Number);
  if (!Y || !M || !D || Number.isNaN(h) || Number.isNaN(m)) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Y}-${pad(M)}-${pad(D)}T${pad(h)}:${pad(m)}:00+07:00`;
}

function expenseInstantMs(raw: string): number | null {
  const ms = Date.parse(raw.length === 10 ? `${raw}T00:00:00+07:00` : raw);
  return Number.isNaN(ms) ? null : ms;
}

function vnDayBoundsMs(yyyyMmDd: string): { start: number; end: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
  const start = Date.parse(`${yyyyMmDd}T00:00:00+07:00`);
  const end = Date.parse(`${yyyyMmDd}T23:59:59.999+07:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return { start, end };
}

const ExpensesPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: expenses, isLoading, isError, refetch } = useExpenses();
  const { data: employees } = useEmployees(user?.role === 'admin');
  const { data: vehicles } = useVehicles();

  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense();
  const confirmMutation = useConfirmExpense();
  const confirmBulkMutation = useConfirmExpensesBulk();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isFilterSheetClosing, setIsFilterSheetClosing] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const confirmingExpense = expenses?.find(e => e.id === confirmId);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const canMutateExpense = (e: Expense) =>
    user?.role === 'admin' || user?.role === 'manager' || user?.id === e.employee_id;

  /** Khóa đổi trạng thái thanh toán khi phiếu đã xác nhận (tránh hạ cấp nhầm; chỉnh sửa khác vẫn được). */
  const paymentFieldsLocked = editingExpense?.payment_status === 'confirmed';

  const [previewImages, setPreviewImages] = useState<string[] | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadType, setUploadType] = useState<'camera' | 'file' | null>(null);

  const [formData, setFormData] = useState(() => {
    const n = getVnNowForm();
    return {
      employee_id: user?.id || '',
      vehicle_id: '' as string | null,
      expense_name: '',
      amount: undefined as number | undefined,
      expense_date: n.date,
      expense_time: n.time,
      image_urls: [] as string[],
      payment_status: 'unpaid' as 'unpaid' | 'paid',
    };
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const filteredExpenses = React.useMemo(() => {
    if (!expenses) return [];
    let fromD = filterDateFrom;
    let toD = filterDateTo;
    if (fromD && toD && fromD > toD) {
      const t = fromD;
      fromD = toD;
      toD = t;
    }

    return expenses.filter((e) => {
      // Don't show confirmed expenses on this page (they move to History)
      if (e.payment_status === 'confirmed') return false;

      if (searchQuery) {
        const matchName = matchesSearch(e.expense_name, searchQuery);
        const matchEmployee = e.employee?.full_name ? matchesSearch(e.employee.full_name, searchQuery) : false;
        const matchVehicle = e.vehicle?.license_plate ? matchesSearch(e.vehicle.license_plate, searchQuery) : false;
        if (!matchName && !matchEmployee && !matchVehicle) {
          return false;
        }
      }
      if (filterEmployee && e.employee_id !== filterEmployee) {
        return false;
      }
      if (filterVehicle && e.vehicle_id !== filterVehicle) {
        return false;
      }
      if (filterStatus && e.payment_status !== filterStatus) {
        return false;
      }
      if (fromD || toD) {
        const expenseMs = expenseInstantMs(e.expense_date);
        if (expenseMs == null) return false;
        if (fromD) {
          const b = vnDayBoundsMs(fromD);
          if (b && expenseMs < b.start) return false;
        }
        if (toD) {
          const b = vnDayBoundsMs(toD);
          if (b && expenseMs > b.end) return false;
        }
      }
      return true;
    });
  }, [expenses, searchQuery, filterEmployee, filterVehicle, filterStatus, filterDateFrom, filterDateTo]);

  const filteredTotalAmount = React.useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [filteredExpenses]
  );

  const deletableInView = React.useMemo(
    () => filteredExpenses.filter(canMutateExpense),
    [filteredExpenses, user?.role, user?.id]
  );

  const allDeletableSelected =
    deletableInView.length > 0 && deletableInView.every((e) => selectedIds.has(e.id));
  const someDeletableSelected = deletableInView.some((e) => selectedIds.has(e.id));

  const selectedTotalAmount = React.useMemo(() => {
    return Array.from(selectedIds).reduce((sum, id) => {
      const expense = expenses?.find((e) => e.id === id);
      return sum + (Number(expense?.amount) || 0);
    }, 0);
  }, [selectedIds, expenses]);

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (el) el.indeterminate = someDeletableSelected && !allDeletableSelected;
  }, [someDeletableSelected, allDeletableSelected]);

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllDeletable = () => {
    if (allDeletableSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(deletableInView.map((e) => e.id)));
  };

  const closeDialog = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsDialogOpen(false);
      setIsClosing(false);
      setEditingExpense(null);
      const n = getVnNowForm();
      setFormData({
        employee_id: user?.id || '',
        vehicle_id: '',
        expense_name: '',
        amount: undefined,
        expense_date: n.date,
        expense_time: n.time,
        image_urls: [],
        payment_status: 'unpaid',
      });
    }, 300);
  };

  const openDialog = (expense?: Expense) => {
    if (expense) {
      setEditingExpense(expense);

      const { date: ed, time: et } = parseExpenseToFormDateTime(expense.expense_date);
      setFormData({
        employee_id: expense.employee_id,
        vehicle_id: expense.vehicle_id || '',
        expense_name: expense.expense_name,
        amount: expense.amount,
        expense_date: ed,
        expense_time: et,
        image_urls: expense.image_urls || [],
        payment_status:
          expense.payment_status === 'confirmed'
            ? 'paid'
            : expense.payment_status === 'unpaid' || expense.payment_status === 'paid'
              ? expense.payment_status
              : 'unpaid',
      });
    } else {
      setEditingExpense(null);
      const n = getVnNowForm();
      setFormData({
        employee_id: user?.id || '',
        vehicle_id: '',
        expense_name: '',
        amount: undefined,
        expense_date: n.date,
        expense_time: n.time,
        image_urls: [],
        payment_status: 'unpaid',
      });
    }
    setIsDialogOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (formData.image_urls.length + files.length > 10) {
      toast.error('Tối đa 10 hình ảnh');
      return;
    }

    setIsUploading(true);
    const newUrls: string[] = [];

    try {
      setUploadType(e.target.capture ? 'camera' : 'file');
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await uploadApi.uploadFile(file, 'expenses', 'receipts');
        newUrls.push(res.url);
      }
      setFormData(prev => ({
        ...prev,
        image_urls: [...prev.image_urls, ...newUrls]
      }));
    } catch (error) {
      toast.error('Lỗi khi tải ảnh lên');
    } finally {
      setIsUploading(false);
      setUploadType(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      image_urls: prev.image_urls.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount) {
      toast.error('Vui lòng nhập số tiền');
      return;
    }

    const finalAmount = formData.amount;

    const expenseDateIso = toVietnamExpenseIso(formData.expense_date, formData.expense_time);
    if (!expenseDateIso || Number.isNaN(Date.parse(expenseDateIso))) {
      toast.error('Ngày giờ chi không hợp lệ');
      return;
    }

    if (editingExpense) {
      const payload: {
        employee_id: string;
        vehicle_id: string | null;
        expense_name: string;
        amount: number;
        expense_date: string;
        image_urls: string[];
        payment_status?: 'unpaid' | 'paid';
      } = {
        employee_id: formData.employee_id,
        vehicle_id: formData.vehicle_id || null,
        expense_name: formData.expense_name,
        amount: finalAmount,
        expense_date: expenseDateIso,
        image_urls: formData.image_urls,
      };
      if (editingExpense.payment_status !== 'confirmed') {
        payload.payment_status = formData.payment_status;
      }
      updateMutation.mutate({ id: editingExpense.id, payload }, {
        onSuccess: () => closeDialog()
      });
    } else {
      const payload = {
        employee_id: formData.employee_id,
        vehicle_id: formData.vehicle_id || null,
        expense_name: formData.expense_name,
        amount: finalAmount,
        expense_date: expenseDateIso,
        image_urls: formData.image_urls,
        payment_status: formData.payment_status,
      };
      createMutation.mutate(payload, {
        onSuccess: () => closeDialog()
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const employeeOptions = employees?.map(emp => ({
    value: emp.id,
    label: emp.full_name
  })) || [];

  const vehicleOptions = [
    { value: '', label: 'Không chọn xe' },
    ...(vehicles?.map(v => ({
      value: v.id,
      label: v.license_plate
    })) || [])
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Chi phí"
          description="Quản lý các khoản chi phí phát sinh"
          backPath="/chi-phi"
          actions={
            <div className="flex items-center gap-3">
              <Link
                to="/chi-phi/in-chi-phi?status=unconfirmed"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-[13px] font-bold transition-all border border-border"
              >
                <Printer size={16} />
                In chi phí
              </Link>
              <button
                onClick={() => openDialog()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
              >
                <Plus size={16} />
                Thêm chi phí
              </button>
            </div>
          }
        />
      </div>
      <DraggableFAB icon={<Plus size={24} />} onClick={() => openDialog()} />

      <div className="bg-card justify-between rounded-2xl md:border md:border-border sm:shadow-sm flex flex-col flex-1 min-h-0 mt-0 md:mt-4">
        {isLoading ? (
          <div className="p-4"><LoadingSkeleton columns={7} rows={6} /></div>
        ) : isError ? (
          <ErrorState onRetry={refetch} />
        ) : !expenses || expenses.length === 0 ? (
          <EmptyState title="Chưa có chi phí nào" />
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Filter Bar (Desktop) */}
            <div className="p-3 border-b border-border/50 hidden sm:flex flex-row gap-3 shrink-0 bg-muted/5">
              <div className="flex-1 min-w-[200px]">
                <SearchInput
                  placeholder="Tìm tên chi phí, nhân viên, biển số xe..."
                  onSearch={(val) => setSearchQuery(val)}
                  className="bg-background"
                />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
                {user?.role === 'admin' && (
                  <div className="w-[150px] shrink-0">
                    <SearchableSelect
                      value={filterEmployee}
                      onValueChange={setFilterEmployee}
                      options={[{ value: '', label: 'Tất cả nhân viên' }, ...employeeOptions]}
                      placeholder="Nhân viên"
                      className="h-10 w-full bg-background"
                    />
                  </div>
                )}
                <div className="w-[140px] shrink-0">
                  <SearchableSelect
                    value={filterVehicle}
                    onValueChange={setFilterVehicle}
                    options={[{ value: '', label: 'Tất cả xe' }, ...vehicleOptions.filter(v => v.value !== '')]}
                    placeholder="Xe"
                    className="h-10 w-full bg-background"
                  />
                </div>
                <div className="w-[150px] shrink-0">
                  <CustomSelect
                    value={filterStatus}
                    onChange={setFilterStatus}
                    options={[
                      { value: '', label: 'Tất cả' },
                      { value: 'unpaid', label: 'Chưa thanh toán' },
                      { value: 'paid', label: 'Đã thanh toán (chưa xác nhận)' },
                    ]}
                    placeholder="Lọc theo trạng thái"
                    className="h-10 w-full bg-background"
                  />
                </div>
                <div className="shrink-0 border-l border-border/60 pl-2 ml-1">
                  <DateRangePicker
                    initialDateFrom={filterDateFrom || undefined}
                    initialDateTo={filterDateTo || undefined}
                    onUpdate={(values) => {
                      if (values.range.from) {
                        setFilterDateFrom(format(values.range.from, 'yyyy-MM-dd'));
                      } else {
                        setFilterDateFrom('');
                      }
                      if (values.range.to) {
                        setFilterDateTo(format(values.range.to, 'yyyy-MM-dd'));
                      } else {
                        setFilterDateTo('');
                      }
                    }}
                    icon={<CalendarDays size={15} />}
                  />
                </div>
              </div>
            </div>

            {/* Filter Bar (Mobile) */}
            <div className="p-3 border-b border-border/50 flex sm:hidden flex-row gap-2 shrink-0 bg-muted/5">
              <div className="flex-1">
                <SearchInput
                  placeholder="Tìm kiếm nhanh..."
                  onSearch={(val) => setSearchQuery(val)}
                  className="bg-background"
                />
              </div>
              <button
                onClick={() => setIsFilterSheetOpen(true)}
                className="flex items-center justify-center w-10 h-10 rounded-xl border border-border bg-background text-muted-foreground hover:bg-muted transition-all relative"
              >
                <Filter size={18} />
                {(filterEmployee || filterVehicle || filterStatus || filterDateFrom || filterDateTo) && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border border-background" />
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-border/50 bg-background shrink-0">
              <span className="text-[12px] text-muted-foreground font-medium">
                {filteredExpenses.length} phiếu
                {(searchQuery ||
                  filterEmployee ||
                  filterVehicle ||
                  filterStatus ||
                  filterDateFrom ||
                  filterDateTo) && (
                    <span className="text-muted-foreground/80"> · theo bộ lọc</span>
                  )}
              </span>
              <div className="flex items-baseline gap-2 flex-wrap justify-end">
                <span className="text-[12px] font-bold text-emerald-700/80 dark:text-emerald-400/90 uppercase tracking-wide">
                  Tổng tiền
                </span>
                <span className="text-[16px] sm:text-[17px] font-black text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight">
                  {formatCurrency(filteredTotalAmount)}
                </span>
              </div>
            </div>


            <div className="flex-1 overflow-auto custom-scrollbar">
              {filteredExpenses.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Không tìm thấy kết quả phù hợp</div>
              ) : (
                <>
                  {/* Bảng danh sách (tablet/desktop); màn hẹp cuộn ngang */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1020px]">
                      <thead className="bg-muted/30 sticky top-0 z-10 backdrop-blur-xl">
                        <tr>
                          <th className="w-12 pl-4 pr-2 py-4 border-b border-border/50">
                            <input
                              ref={selectAllCheckboxRef}
                              type="checkbox"
                              checked={allDeletableSelected}
                              onChange={toggleSelectAllDeletable}
                              disabled={deletableInView.length === 0}
                              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                              title="Chọn tất cả (theo bộ lọc hiện tại)"
                            />
                          </th>
                          <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider whitespace-nowrap min-w-[200px] border-b border-border/50">Tên chi phí</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider text-center whitespace-nowrap border-b border-l border-border/50 bg-muted/5">Ảnh</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider whitespace-nowrap min-w-[150px] border-b border-l border-border/50">Người tạo</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-emerald-600 uppercase tracking-wider text-right whitespace-nowrap min-w-[150px] border-b border-l border-border/50 bg-emerald-50/30">Số tiền</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider whitespace-nowrap border-b border-l border-border/50">Ngày giờ chi</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider text-center whitespace-nowrap border-b border-l border-border/50 bg-muted/10">Trạng thái thanh toán</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider text-center whitespace-nowrap border-b border-l border-border/50 bg-muted/5">Xác nhận</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider whitespace-nowrap border-b border-l border-border/50 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {filteredExpenses.map(e => (
                          <tr key={e.id} className="group hover:bg-muted/10 transition-colors">
                            <td className="w-12 pl-4 pr-2 py-4 align-middle border-b border-border/30">
                              {canMutateExpense(e) ? (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(e.id)}
                                  onChange={() => toggleSelectOne(e.id)}
                                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                                />
                              ) : null}
                            </td>
                            <td className="px-6 py-4 border-r border-border/10">
                              <div className="flex items-center gap-2">
                                <div className="text-[14px] font-medium text-foreground">{e.expense_name}</div>
                              </div>
                              {e.vehicle && (
                                <div className="text-[11px] text-muted-foreground mt-0.5">Xe: {e.vehicle.license_plate}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 border-r border-border/10 text-center bg-muted/5">
                              {e.image_urls && e.image_urls.length > 0 ? (
                                <button
                                  onClick={() => {
                                    setPreviewImages(e.image_urls);
                                    setCurrentImageIndex(0);
                                  }}
                                  className="relative w-10 h-10 rounded-lg border border-border overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all group"
                                >
                                  <img loading="lazy" decoding="async" src={cloudinaryThumb(e.image_urls[0])} alt="Receipt" className="w-full h-full object-cover" />
                                  {e.image_urls.length > 1 && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-[10px] text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                      +{e.image_urls.length - 1}
                                    </div>
                                  )}
                                </button>
                              ) : (
                                <div className="w-10 h-10 rounded-lg border border-border border-dashed flex items-center justify-center text-muted-foreground/30 mx-auto">
                                  <ImageIcon size={16} />
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 border-r border-border/10 text-[13px] text-muted-foreground">
                              {e.employee?.full_name || 'Không xác định'}
                            </td>
                            <td className="px-6 py-4 text-right border-border/10 font-bold text-[14px] text-emerald-600 tabular-nums bg-emerald-50/20">
                              {formatCurrency(e.amount)}
                            </td>
                            <td className="px-6 py-4 border-l border-border/10 text-[13px] text-muted-foreground whitespace-nowrap">
                              {formatExpenseDateDisplay(e.expense_date)}
                            </td>
                            <td className="px-6 py-4 text-center border-l border-border/10 bg-muted/5">
                              <StatusBadge
                                status={e.payment_status === 'unpaid' ? 'unpaid' : 'paid'}
                                label={e.payment_status === 'unpaid' ? 'Chưa thanh toán' : 'Đã thanh toán'}
                              />
                            </td>
                            <td className="px-6 py-4 text-center border-l border-border/10 bg-muted/5">
                              <div className="flex flex-col items-center gap-0.5">
                                <StatusBadge
                                  status={e.payment_status === 'confirmed' ? 'approved' : 'pending'}
                                  label={e.payment_status === 'confirmed' ? 'Đã xác nhận' : 'Chưa xác nhận'}
                                />
                                {e.payment_status === 'confirmed' && e.confirmer?.full_name && (
                                  <span className="text-[10px] text-muted-foreground max-w-[140px] truncate" title={e.confirmer.full_name}>
                                    {e.confirmer.full_name}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right border-l border-border/10">
                              <div className="flex items-center justify-end gap-2">
                                {(e.payment_status === 'paid' || e.payment_status === 'unpaid') && user?.role === 'admin' && (
                                  <button
                                    onClick={() => setConfirmId(e.id)}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                    title="Xác nhận đã thanh toán"
                                  >
                                    <CheckCircle2 size={16} />
                                  </button>
                                )}
                                {canMutateExpense(e) && (
                                  <>
                                    <button
                                      onClick={() => openDialog(e)}
                                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="Sửa"
                                    >
                                      <Edit2 size={16} />
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirmIds([e.id])}
                                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Xóa"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: thẻ (dưới sm); có dòng trạng thái thanh toán dạng bảng nhỏ */}
                  <div className="flex flex-col gap-3 p-3 sm:hidden bg-muted/50 min-h-full pb-20">
                    {filteredExpenses.map(e => (
                      <div key={e.id} className="bg-card rounded-xl border border-border/60 shadow-sm p-4 flex flex-col gap-3 relative overflow-hidden">
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${e.payment_status === 'confirmed' ? 'bg-emerald-500' : e.payment_status === 'unpaid' ? 'bg-red-500' : 'bg-amber-500'}`} />

                        <div className="flex justify-between items-start pl-1 mb-1 gap-2">
                          {canMutateExpense(e) ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(e.id)}
                              onChange={() => toggleSelectOne(e.id)}
                              className="w-4 h-4 mt-1 rounded border-border text-primary focus:ring-primary shrink-0"
                            />
                          ) : (
                            <span className="w-4 shrink-0" />
                          )}
                          <div className="flex flex-col flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-bold text-foreground">{e.expense_name}</span>
                              {e.image_urls && e.image_urls.length > 0 && (
                                <button
                                  onClick={() => {
                                    setPreviewImages(e.image_urls);
                                    setCurrentImageIndex(0);
                                  }}
                                  className="p-1 bg-muted rounded-md text-primary"
                                >
                                  <ImageIcon size={14} />
                                </button>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground mt-0.5">
                              {e.employee?.full_name} {e.vehicle && `• Xe: ${e.vehicle.license_plate}`}
                            </span>
                          </div>
                        </div>

                        <div className="ml-1 rounded-lg border border-border/60 overflow-hidden text-[12px] bg-background">
                          <div className="grid grid-cols-[1fr_auto] gap-x-3 items-center border-b border-border/50 bg-muted/15 px-3 py-2">
                            <span className="text-muted-foreground font-semibold">Trạng thái thanh toán</span>
                            <StatusBadge
                              status={e.payment_status === 'unpaid' ? 'unpaid' : 'paid'}
                              label={e.payment_status === 'unpaid' ? 'Chưa thanh toán' : 'Đã thanh toán'}
                            />
                          </div>
                          <div className="grid grid-cols-[1fr_auto] gap-x-3 items-center border-b border-border/50 bg-muted/10 px-3 py-2">
                            <span className="text-muted-foreground font-semibold">Xác nhận</span>
                            <div className="flex flex-col items-end gap-0.5 min-w-0">
                              <StatusBadge
                                status={e.payment_status === 'confirmed' ? 'approved' : 'pending'}
                                label={e.payment_status === 'confirmed' ? 'Đã xác nhận' : 'Chưa xác nhận'}
                              />
                              {e.payment_status === 'confirmed' && e.confirmer?.full_name && (
                                <span className="text-[10px] text-muted-foreground text-right truncate max-w-[160px]">
                                  {e.confirmer.full_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 px-3 py-2.5 bg-muted/10">
                            <div className="flex flex-col min-w-0">
                              <span className="text-[11px] text-muted-foreground font-medium">Ngày giờ chi</span>
                              <span className="text-[13px] font-bold text-foreground tabular-nums">{formatExpenseDateDisplay(e.expense_date)}</span>
                            </div>
                            <div className="flex flex-col items-end min-w-0">
                              <span className="text-[11px] text-emerald-600/80 font-medium">Số tiền</span>
                              <span className="text-[14px] font-bold text-emerald-600 tabular-nums">{formatCurrency(e.amount)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 mt-1">
                          {(e.payment_status === 'paid' || e.payment_status === 'unpaid') && user?.role === 'admin' && (
                            <button
                              onClick={() => setConfirmId(e.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[12px] font-bold"
                            >
                              <CheckCircle2 size={14} />
                              Xác nhận
                            </button>
                          )}
                          {canMutateExpense(e) && (
                            <>
                              <button
                                onClick={() => openDialog(e)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[12px] font-bold"
                              >
                                <Edit2 size={14} />
                                Sửa
                              </button>
                              <button
                                onClick={() => setDeleteConfirmIds([e.id])}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[12px] font-bold"
                              >
                                <Trash2 size={14} />
                                Xóa
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
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
                  <Receipt size={20} />
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  {editingExpense ? 'Sửa chi phí' : 'Thêm chi phí'}
                </h2>
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
            <form id="expense-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
                  <Receipt size={16} className="text-emerald-500" />
                  <span className="text-[12px] font-bold text-emerald-500 uppercase tracking-wider">Thông tin chi phí</span>
                </div>
                <div className="p-5 grid grid-cols-1 gap-4">
                  {user?.role === 'admin' && (
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-bold text-foreground">Nhân viên <span className="text-red-500">*</span></label>
                      <SearchableSelect
                        value={formData.employee_id}
                        onValueChange={(val) => setFormData({ ...formData, employee_id: val })}
                        options={employeeOptions}
                        placeholder="Chọn nhân viên"
                        className="w-full h-11"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-foreground">Tên chi phí <span className="text-red-500">*</span></label>
                    <SearchableSelect
                      value={formData.expense_name}
                      onValueChange={(val) => setFormData({ ...formData, expense_name: val })}
                      options={[
                        { value: 'Dầu Phúc Sơn', label: 'Dầu Phúc Sơn' },
                        { value: 'Dầu Quang Trung', label: 'Dầu Quang Trung' },
                        { value: 'Dầu Petro', label: 'Dầu Petro' },
                        { value: 'Dầu Ngoài', label: 'Dầu Ngoài' },
                        { value: 'Phí Cầu Đường', label: 'Phí Cầu Đường' },
                        { value: 'Sửa xe', label: 'Sửa xe' }
                      ]}
                      placeholder="Chọn hoặc nhập tên chi phí..."
                      searchPlaceholder="Tìm hoặc nhập tên chi phí..."
                      className="w-full h-11 bg-background"
                      allowCustom
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-foreground">Xe (Tùy chọn)</label>
                    <SearchableSelect
                      value={formData.vehicle_id || ''}
                      onValueChange={(val) => setFormData({ ...formData, vehicle_id: val })}
                      options={vehicleOptions}
                      placeholder="Chọn xe"
                      className="w-full h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-foreground">Số tiền <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₫</span>
                      <CurrencyInput
                        required
                        value={formData.amount}
                        onChange={(val) => setFormData({ ...formData, amount: val })}
                        className="flex h-11 w-full rounded-xl border border-border/80 bg-background pl-8 pr-3 py-2 text-[14px] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all font-medium text-emerald-600"
                        placeholder="Ví dụ: 30.000"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-foreground">Ngày giờ chi <span className="text-red-500">*</span></label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <DatePicker
                        value={formData.expense_date}
                        onChange={(val) => setFormData({ ...formData, expense_date: val })}
                        className="w-full h-11 flex-1 min-w-0"
                      />
                      <input
                        type="time"
                        step={60}
                        value={formData.expense_time}
                        onChange={(ev) => setFormData({ ...formData, expense_time: ev.target.value })}
                        className="flex h-11 w-full sm:w-[132px] shrink-0 rounded-xl border border-border/80 bg-background px-3 text-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-foreground">Trạng thái thanh toán</label>
                    {paymentFieldsLocked ? (
                      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1">
                        <StatusBadge status="approved" label="Đã xác nhận" />
                        <p className="text-[12px] text-muted-foreground">
                          Đây là bước duyệt của quản trị, khác với «đã thanh toán» ở trên. Có thể sửa thông tin khác; trạng thái xác nhận giữ nguyên khi lưu.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, payment_status: 'unpaid' })}
                          className={clsx(
                            "flex items-center justify-center gap-2 h-11 rounded-xl border text-[13px] font-bold transition-all",
                            formData.payment_status === 'unpaid'
                              ? "bg-red-50 border-red-200 text-red-600 ring-2 ring-red-500/10"
                              : "bg-background border-border text-muted-foreground hover:bg-muted"
                          )}
                        >
                          Chưa thanh toán
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, payment_status: 'paid' })}
                          className={clsx(
                            "flex items-center justify-center gap-2 h-11 rounded-xl border text-[13px] font-bold transition-all",
                            formData.payment_status === 'paid'
                              ? "bg-emerald-50 border-emerald-200 text-emerald-600 ring-2 ring-emerald-500/10"
                              : "bg-background border-border text-muted-foreground hover:bg-muted"
                          )}
                        >
                          Đã thanh toán
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-foreground">Hình ảnh / Hóa đơn</label>
                    <div className="grid grid-cols-3 gap-2">
                      {formData.image_urls.map((url, idx) => (
                        <div key={idx} className="relative aspect-square rounded-xl border border-border overflow-hidden group">
                          <img loading="lazy" decoding="async" src={cloudinaryThumb(url)} alt="Receipt" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (fileInputRef.current) {
                              fileInputRef.current.removeAttribute('capture');
                              fileInputRef.current.click();
                            }
                          }}
                          disabled={isUploading}
                          className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-emerald-500/50 hover:bg-emerald-50/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isUploading && uploadType === 'file' ? (
                            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Upload size={20} />
                              <span className="text-[11px] font-medium text-center px-1 leading-tight">Tải ảnh lên</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (fileInputRef.current) {
                              fileInputRef.current.setAttribute('capture', 'environment');
                              fileInputRef.current.click();
                            }
                          }}
                          disabled={isUploading}
                          className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-blue-500/50 hover:bg-blue-50/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed md:hidden"
                        >
                          {isUploading && uploadType === 'camera' ? (
                            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Camera size={20} />
                              <span className="text-[11px] font-medium text-center px-1 leading-tight">Chụp ảnh</span>
                            </>
                          )}
                        </button>
                      </>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        multiple
                        accept="image/*"
                        className="hidden"
                      />
                    </div>
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
                form="expense-form"
                disabled={createMutation.isPending || updateMutation.isPending || isUploading}
                className={clsx(
                  "flex items-center gap-2 px-8 py-2 rounded-xl text-[13px] font-bold shadow-lg transition-all group",
                  (createMutation.isPending || updateMutation.isPending || isUploading)
                    ? "bg-emerald-500/50 text-white/60 cursor-wait"
                    : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20"
                )}
              >
                {createMutation.isPending || updateMutation.isPending ? 'Đang lưu...' : 'Lưu chi phí'}
                {!(createMutation.isPending || updateMutation.isPending) && <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <MobileFilterSheet
        isOpen={isFilterSheetOpen}
        isClosing={isFilterSheetClosing}
        onClose={() => {
          setIsFilterSheetClosing(true);
          setTimeout(() => {
            setIsFilterSheetOpen(false);
            setIsFilterSheetClosing(false);
          }, 300);
        }}
        onApply={(filters) => {
          setFilterDateFrom(filters.dateFrom);
          setFilterDateTo(filters.dateTo);
          setFilterStatus(filters.status);
        }}
        initialDateFrom={filterDateFrom}
        initialDateTo={filterDateTo}
        initialStatus={filterStatus}
        dateLabel="Khoảng ngày chi (VN)"
        statusOptions={[
          { value: '', label: 'Tất cả' },
          { value: 'unpaid', label: 'Chưa thanh toán' },
          { value: 'paid', label: 'Đã thanh toán (chưa xác nhận)' },
        ]}
        onClear={() => {
          setFilterEmployee('');
          setFilterVehicle('');
          setFilterDateFrom('');
          setFilterDateTo('');
          setFilterStatus('');
        }}
        showClearButton={
          !!(filterEmployee || filterVehicle || filterDateFrom || filterDateTo || filterStatus)
        }
      >
        {user?.role === 'admin' && (
          <div className="space-y-1.5">
            <label className="text-[13px] font-bold text-muted-foreground">Nhân viên</label>
            <SearchableSelect
              value={filterEmployee}
              onValueChange={setFilterEmployee}
              options={[{ value: '', label: 'Tất cả nhân viên' }, ...employeeOptions]}
              placeholder="Chọn nhân viên"
              className="w-full bg-muted/10 h-11"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-[13px] font-bold text-muted-foreground">Xe</label>
          <SearchableSelect
            value={filterVehicle}
            onValueChange={setFilterVehicle}
            options={[{ value: '', label: 'Tất cả xe' }, ...vehicleOptions.filter(v => v.value !== '')]}
            placeholder="Chọn xe"
            className="w-full bg-muted/10 h-11"
          />
        </div>
      </MobileFilterSheet>

      <ConfirmDialog
        isOpen={!!deleteConfirmIds?.length}
        onCancel={() => setDeleteConfirmIds(null)}
        onConfirm={async () => {
          if (!deleteConfirmIds?.length) return;
          setIsDeleting(true);
          try {
            await Promise.all(deleteConfirmIds.map((id) => hrApi.deleteExpense(id)));
            await queryClient.invalidateQueries({ queryKey: hrKeys.expenses() });
            toast.success(
              deleteConfirmIds.length === 1
                ? 'Xóa chi phí thành công'
                : `Đã xóa ${deleteConfirmIds.length} chi phí`
            );
            setDeleteConfirmIds(null);
            setSelectedIds(new Set());
          } catch (err: unknown) {
            const msg =
              err && typeof err === 'object' && 'response' in err
                ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
                : undefined;
            toast.error(msg || 'Lỗi khi xóa chi phí');
          } finally {
            setIsDeleting(false);
          }
        }}
        title={deleteConfirmIds && deleteConfirmIds.length > 1 ? 'Xóa nhiều chi phí' : 'Xóa chi phí'}
        message={
          deleteConfirmIds && deleteConfirmIds.length > 1
            ? `Bạn có chắc muốn xóa ${deleteConfirmIds.length} chi phí đã chọn? Hành động này không thể hoàn tác.`
            : 'Bạn có chắc chắn muốn xóa chi phí này? Hành động này không thể hoàn tác.'
        }
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        variant="danger"
        isLoading={isDeleting}
      />

      <ConfirmDialog
        isOpen={!!confirmId}
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) {
            confirmMutation.mutate(confirmId, {
              onSuccess: () => setConfirmId(null)
            });
          }
        }}
        title="Xác nhận chi phí"
        message={
          confirmingExpense ? (
            <div className="space-y-1">
              <p>Xác nhận chi phí này đã được thanh toán và hợp lệ?</p>
              <div className="text-[13px] bg-muted/50 p-3 rounded-lg border border-border space-y-1 mt-2 text-foreground/80">
                <div>• Chi phí: <span className="font-bold text-foreground">{confirmingExpense.expense_name}</span></div>
                <div>• Nhân viên: <span className="font-bold text-foreground">{confirmingExpense.employee?.full_name}</span></div>
                {confirmingExpense.vehicle && (
                  <div>• Xe: <span className="font-bold text-foreground">{confirmingExpense.vehicle.license_plate}</span></div>
                )}
                <div>• Số tiền: <span className="font-bold text-emerald-600">{formatCurrency(confirmingExpense.amount)}</span></div>
                <div>• Ngày giờ chi: <span className="font-bold text-foreground">{formatExpenseDateDisplay(confirmingExpense.expense_date)}</span></div>
              </div>
            </div>
          ) : "Xác nhận chi phí này đã được thanh toán và hợp lệ?"
        }
        confirmLabel="Xác nhận"
        cancelLabel="Hủy"
        variant="primary"
        isLoading={confirmMutation.isPending}
      />

      <ConfirmDialog
        isOpen={isBulkConfirmOpen}
        onCancel={() => setIsBulkConfirmOpen(false)}
        onConfirm={() => {
          const ids = Array.from(selectedIds).filter(id => {
            const exp = expenses?.find(e => e.id === id);
            return exp && exp.payment_status !== 'confirmed';
          });
          confirmBulkMutation.mutate(ids, {
            onSuccess: () => {
              setIsBulkConfirmOpen(false);
              setSelectedIds(new Set());
            }
          });
        }}
        title="Xác nhận hàng loạt"
        message={`Bạn có chắc chắn muốn xác nhận ${selectedIds.size} phiếu chi phí đã chọn? Hành động này sẽ chuyển trạng thái các phiếu sang "Đã xác nhận".`}
        confirmLabel="Xác nhận"
        cancelLabel="Hủy"
        variant="primary"
        isLoading={confirmBulkMutation.isPending}
      />

      {previewImages && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 animate-in fade-in duration-300">
          <button
            onClick={() => setPreviewImages(null)}
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-[10001]"
          >
            <X size={24} />
          </button>

          {previewImages.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : previewImages.length - 1));
                }}
                className="absolute left-6 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-[10001]"
              >
                <ChevronLeft size={32} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentImageIndex((prev) => (prev < previewImages.length - 1 ? prev + 1 : 0));
                }}
                className="absolute right-6 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-[10001]"
              >
                <ChevronRightIcon size={32} />
              </button>
            </>
          )}

          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">
            <img loading="lazy" decoding="async"
              src={cloudinaryLarge(previewImages[currentImageIndex])}
              alt="Preview"
              className="max-w-full max-h-[80vh] object-contain shadow-2xl rounded-lg animate-in zoom-in-95 duration-300"
            />
            {previewImages.length > 1 && (
              <div className="mt-4 px-4 py-2 bg-white/10 rounded-full text-white text-[13px] font-medium">
                {currentImageIndex + 1} / {previewImages.length}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {selectedIds.size > 0 && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[calc(100%-2rem)] max-w-4xl animate-in slide-in-from-bottom-8 duration-300">
          <div className="bg-neutral-900/90 dark:bg-neutral-800/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl px-4 py-3 sm:px-6 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="flex flex-col">
                <span className="text-[11px] text-white/50 uppercase font-bold tracking-wider">Đã chọn</span>
                <span className="text-[16px] font-black text-white">{selectedIds.size} phiếu</span>
              </div>
              <div className="h-8 w-px bg-white/10 hidden sm:block" />
              <div className="flex flex-col">
                <span className="text-[11px] text-emerald-400/60 uppercase font-bold tracking-wider">Tổng cộng</span>
                <span className="text-[16px] font-black text-emerald-400 tabular-nums">{formatCurrency(selectedTotalAmount)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="flex-1 sm:flex-none px-4 py-2 text-[13px] font-bold text-white/70 hover:text-white transition-colors"
              >
                Bỏ chọn
              </button>
              <button
                onClick={() => setDeleteConfirmIds(Array.from(selectedIds))}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-[13px] font-bold rounded-xl shadow-lg shadow-red-500/20 transition-all"
              >
                <Trash2 size={16} />
                <span className="hidden sm:inline">Xóa đã chọn</span>
                <span className="sm:hidden">Xóa</span>
              </button>
              {user?.role === 'admin' && (
                <button
                  onClick={() => setIsBulkConfirmOpen(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
                >
                  <CheckCircle2 size={16} />
                  <span className="hidden sm:inline">Xác nhận hàng loạt</span>
                  <span className="sm:hidden">Xác nhận</span>
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ExpensesPage;
