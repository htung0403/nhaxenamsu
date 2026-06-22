import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/shared/PageHeader';
import { useExportOrders } from '../../hooks/queries/useExportOrders';
import { useImportOrders } from '../../hooks/queries/useImportOrders';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import ErrorState from '../../components/shared/ErrorState';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import { PeriodFilter } from '../../components/shared/PeriodFilter';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import { RangeNumberFilter, type RangeValue } from '../../components/shared/RangeNumberFilter';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import {
  TrendingUp, Banknote, PackageOpen, FileText, ArrowUpRight, BarChart2, Filter, Calendar, Store, Truck
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';
import type { ExportOrder } from '../../types';

export interface SelectOption {
  value: string;
  label: string;
}

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const getSafeName = (obj: any, fallback: string = 'N/A') => {
  if (!obj) return fallback;
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj[0]?.name || fallback;
  return obj.name || fallback;
};

const statusLabels: Record<string, string> = {
  paid: 'Đã thanh toán',
  partial: 'T.Toán một phần',
  unpaid: 'Chưa thanh toán',
  pending: 'Đang xử lý',
  processing: 'Đang xử lý',
  delivered: 'Đã giao hàng',
  cancelled: 'Đã hủy',
};

const statusColors: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  partial: 'bg-amber-50 text-amber-600 border-amber-100',
  unpaid: 'bg-red-50 text-red-600 border-red-100',
  pending: 'bg-slate-50 text-slate-600 border-slate-100',
  processing: 'bg-blue-50 text-blue-600 border-blue-100',
  delivered: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const REVENUE_PRESETS = [
  { id: '1', label: 'Dưới 1 triệu', max: 1000000, shortLabel: '< 1tr' },
  { id: '2', label: 'Từ 1 - 5 triệu', min: 1000000, max: 5000000, shortLabel: '1 - 5tr' },
  { id: '3', label: 'Từ 5 - 20 triệu', min: 5000000, max: 20000000, shortLabel: '5 - 20tr' },
  { id: '4', label: 'Trên 20 triệu', min: 20000000, shortLabel: '> 20tr' },
];

const DEBT_PRESETS = [
  { id: '1', label: 'Đã hết nợ (0đ)', max: 0, shortLabel: '0đ' },
  { id: '2', label: 'Nợ dưới 1 triệu', min: 1, max: 1000000, shortLabel: '< 1tr' },
  { id: '3', label: 'Nợ 1 - 5 triệu', min: 1000000, max: 5000000, shortLabel: '1 - 5tr' },
  { id: '4', label: 'Nợ trên 5 triệu', min: 5000000, shortLabel: '> 5tr' },
];

const RevenueReportPage: React.FC = () => {
  const { data: exportOrders, isLoading: isExportLoading, isError: isExportError, refetch: refetchExport } = useExportOrders();
  const { data: importOrders, isLoading: isImportLoading, isError: isImportError, refetch: refetchImport } = useImportOrders();

  const isLoading = isExportLoading || isImportLoading;
  const isError = isExportError || isImportError;
  const refetch = () => { refetchExport(); refetchImport(); };

  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999)
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [revenueRange, setRevenueRange] = useState<RangeValue>({});
  const [debtRange, setDebtRange] = useState<RangeValue>({});

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);
  const openFilter = () => setIsFilterOpen(true);
  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 300);
  };

  const customerOptions = useMemo<SelectOption[]>(() => {
    const list = new Set<string>();
    if (exportOrders?.data) {
      exportOrders.data.forEach((o: any) => {
        const name = getSafeName(o.customers, 'Khách lẻ');
        if (name && name !== 'N/A') list.add(name);
      });
    }
    if (importOrders?.data) {
      importOrders.data.forEach((o: any) => {
        const name = getSafeName(o.customers, o.sender_name || 'N/A');
        if (name && name !== 'N/A') list.add(name);
      });
    }
    return Array.from(list).sort().map(name => ({ value: name, label: name }));
  }, [exportOrders, importOrders]);

  const vehicleOptions = useMemo<SelectOption[]>(() => {
    const list = new Set<string>();
    if (exportOrders?.data) {
      exportOrders.data.forEach((o: any) => {
        if ((o as any).license_plate) list.add((o as any).license_plate);
      });
    }
    if (importOrders?.data) {
      importOrders.data.forEach((o: any) => {
        if (o.license_plate) list.add(o.license_plate);
      });
    }
    return Array.from(list).sort().map(plate => ({ value: plate, label: plate }));
  }, [exportOrders, importOrders]);

  const filterOrder = (order: any, type: 'export' | 'import') => {
    // Search
    if (searchQuery) {
      const code = (order.order_code || order.id || '');
      const cname = getSafeName(order.customers, order.sender_name || 'Khách lẻ');
      const pname = type === 'export' ? getSafeName(order.products) : getSafeName(order.import_order_items?.[0]?.products || order.products);
      const plate = (order.license_plate || '');
      
      if (
        !matchesSearch(code, searchQuery) && 
        !matchesSearch(cname, searchQuery) && 
        !matchesSearch(pname, searchQuery) && 
        !matchesSearch(plate, searchQuery)
      ) {
        return false;
      }
    }

    // Date
    const dStr = type === 'export' ? order.export_date : order.order_date;
    if (dateRange.from || dateRange.to) {
      if (!dStr) return false;
      const d = new Date(dStr);
      if (dateRange.from) {
        const fromStart = new Date(dateRange.from);
        fromStart.setHours(0, 0, 0, 0);
        if (d < fromStart) return false;
      }
      if (dateRange.to) {
        const toEnd = new Date(dateRange.to);
        toEnd.setHours(23, 59, 59, 999);
        if (d > toEnd) return false;
      }
    }

    // Customer
    if (selectedCustomers.length > 0) {
      const cname = getSafeName(order.customers, type === 'import' ? (order.sender_name || 'N/A') : 'Khách lẻ');
      if (!selectedCustomers.includes(cname)) return false;
    }

    // Vehicle
    if (selectedVehicles.length > 0) {
      if (!order.license_plate || !selectedVehicles.includes(order.license_plate)) return false;
    }

    // Revenue
    const rev = type === 'export' ? ((order.debt_amount || 0) + (order.paid_amount || 0)) : (order.total_amount || 0);
    if (revenueRange.min !== undefined && rev < revenueRange.min) return false;
    if (revenueRange.max !== undefined && rev > revenueRange.max) return false;

    // Debt
    const devt = type === 'export' ? (order.debt_amount || 0) : 0;
    if (debtRange.min !== undefined && devt < debtRange.min) return false;
    if (debtRange.max !== undefined && devt > debtRange.max) return false;

    return true;
  };

  const filteredExport = useMemo(() => exportOrders?.data?.filter((o: any) => filterOrder(o, 'export')) || [], [exportOrders, dateRange, searchQuery, selectedCustomers, selectedVehicles, revenueRange, debtRange]);
  const filteredImport = useMemo(() => importOrders?.data?.filter((o: any) => filterOrder(o, 'import')) || [], [importOrders, dateRange, searchQuery, selectedCustomers, selectedVehicles, revenueRange, debtRange]);

  const metrics = useMemo(() => {
    return filteredExport.reduce((acc: any, order: ExportOrder) => {
      acc.totalOrders++;
      acc.totalDebt += order.debt_amount || 0;
      acc.collectedRevenue += order.paid_amount || 0;
      acc.totalRevenue += (order.debt_amount || 0) + (order.paid_amount || 0);
      return acc;
    }, { totalRevenue: 0, totalDebt: 0, totalOrders: 0, collectedRevenue: 0 });
  }, [filteredExport]);

  const chartData = useMemo(() => {
    const grouped = filteredExport.reduce((acc: any, order: ExportOrder) => {
      const dbDate = new Date(order.export_date);
      const date = dbDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      if (!acc[date]) acc[date] = { date, timestamp: dbDate.getTime(), doanhThu: 0, congNo: 0 };
      acc[date].doanhThu += (order.debt_amount || 0) + (order.paid_amount || 0);
      acc[date].congNo += order.debt_amount || 0;
      return acc;
    }, {});

    // Sort chronologically
    return Object.values(grouped).sort((a: any, b: any) => a.timestamp - b.timestamp);
  }, [filteredExport]);

  const exportActivities = useMemo(() => {
    return filteredExport.map((o: ExportOrder) => ({
      id: `export-${o.id}`,
      date: String(o.export_date || ''),
      type: 'export',
      entity: getSafeName(o.customers, 'Khách lẻ'),
      product: getSafeName(o.products),
      quantity: Number(o.quantity || 0),
      totalAmount: Number((o.debt_amount || 0) + (o.paid_amount || 0)),
      status: String(o.payment_status || 'unpaid')
    })).sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
    }).slice(0, 10);
  }, [filteredExport]);

  const importActivities = useMemo(() => {
    return filteredImport.map((o: any) => {
      const firstProduct = o.import_order_items?.[0]?.products || o.products;
      return {
        id: `import-${o.id}`,
        date: String(o.order_date || ''),
        type: 'import',
        entity: getSafeName(o.customers, o.sender_name || 'N/A'),
        product: getSafeName(firstProduct),
        quantity: Number(o.quantity || 0),
        totalAmount: Number(o.total_amount || 0),
        status: String(o.status || 'pending')
      };
    }).sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
    }).slice(0, 10);
  }, [filteredImport]);

  const clearAllFilters = () => {
    setSelectedCustomers([]);
    setSelectedVehicles([]);
    setRevenueRange({});
    setDebtRange({});
    setSearchQuery('');
    setDateRange({
      from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999)
    });
  };

  const hasActiveFilters = selectedCustomers.length > 0 || selectedVehicles.length > 0 || Object.keys(revenueRange).length > 0 || Object.keys(debtRange).length > 0 || searchQuery.length > 0;

  const ActivityTable = ({ title, icon: Icon, activities, accentColor, viewPath }: { title: string, icon: any, activities: any[], accentColor: string, viewPath: string }) => (
    <div className="bg-transparent md:bg-white md:rounded-2xl md:border md:border-border md:shadow-sm md:overflow-hidden flex-1">
      <div className="px-4 py-3 md:p-4 border-b border-border/50 md:border-border flex items-center justify-between bg-white md:bg-slate-50/50 sticky md:static top-0 z-20 md:z-auto shadow-sm md:shadow-none">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg bg-slate-50 md:bg-transparent ${accentColor}`}>
            <Icon size={18} className="md:w-4 md:h-4" />
          </div>
          <h3 className="text-[15px] md:text-[14px] font-bold text-foreground">{title}</h3>
          <span className="hidden md:inline-block text-[10px] font-bold px-2 py-0.5 bg-white border border-border rounded-full shadow-sm text-muted-foreground uppercase ml-1">
            {activities.length}
          </span>
        </div>
        <Link
          to={viewPath}
          className="text-[12px] font-bold text-primary hover:bg-primary/5 px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
          title="Xem tất cả"
        >
          Xem tất cả
          <ArrowUpRight size={14} />
        </Link>
      </div>

      {activities.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground italic text-xs bg-white md:bg-transparent">
          Chưa có ghi nhận.
        </div>
      ) : (
        <>
          {/* Mobile View */}
          <div className="md:hidden flex flex-col px-4 py-4 gap-3">
            {activities.map((act) => (
              <div key={`mob-${act.id}`} className="bg-white rounded-2xl border border-border shadow-sm p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[15px] font-bold text-foreground line-clamp-1">{act.entity}</span>
                    <span className="text-[12px] text-muted-foreground mt-0.5">{act.date ? new Date(act.date).toLocaleDateString('vi-VN') : ''}</span>
                  </div>
                  <span className={`shrink-0 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase border whitespace-nowrap ${statusColors[act.status.toLowerCase()] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                    {statusLabels[act.status.toLowerCase()] || act.status}
                  </span>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-2 border border-slate-100">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider mb-0.5">Sản phẩm</span>
                    <span className="text-[12px] font-bold text-slate-700 line-clamp-1">{act.product}</span>
                  </div>
                  <div className="flex flex-col items-end border-l border-slate-200/50 pl-2">
                    <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider mb-0.5">Số lượng</span>
                    <span className="text-[12px] font-black text-slate-700">{act.quantity}</span>
                  </div>
                </div>

                <div className="flex justify-between items-end pt-2 border-t border-border/50">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tổng trị giá</span>
                  <span className={`text-[16px] font-black tabular-nums leading-none ${act.type === 'export' ? 'text-blue-600' : 'text-orange-600'}`}>
                    {formatCurrency(act.totalAmount)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop View */}
          <div className="hidden md:block divide-y divide-border">
            <div className="grid grid-cols-6 gap-4 px-5 py-2.5 bg-slate-50/30 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hidden lg:grid">
              <div className="col-span-1">Ngày</div>
              <div className="col-span-1">Đối tác</div>
              <div className="col-span-1">Sản phẩm</div>
              <div className="col-span-1 text-center">SL</div>
              <div className="col-span-1 text-right">Giá trị</div>
              <div className="col-span-1 text-center">Trạng thái</div>
            </div>
            {activities.map((act) => (
              <div key={`desktop-${act.id}`} className="grid grid-cols-1 lg:grid-cols-6 gap-2 lg:gap-4 px-5 py-3 hover:bg-slate-50 transition-colors items-center">
                <div className="flex items-center gap-2 lg:col-span-1">
                  <span className="text-[12px] text-muted-foreground tabular-nums font-medium">{act.date ? new Date(act.date).toLocaleDateString('vi-VN') : '---'}</span>
                </div>
                <div className="flex items-center gap-2 lg:col-span-1">
                  <span className="text-[12px] font-semibold truncate text-foreground">{act.entity}</span>
                </div>
                <div className="flex items-center gap-2 lg:col-span-1 text-slate-500">
                  <span className="text-[12px] truncate">{act.product}</span>
                </div>
                <div className="flex justify-between lg:block items-center lg:col-span-1 lg:text-center text-[12px] font-bold">
                  <span className="text-foreground">{act.quantity}</span>
                </div>
                <div className="flex justify-between lg:block items-center lg:col-span-1 lg:text-right text-[12px] font-bold">
                  <span className={act.type === 'export' ? 'text-blue-600' : 'text-orange-600'}>{formatCurrency(act.totalAmount)}</span>
                </div>
                <div className="flex justify-between lg:block items-center lg:col-span-1 lg:text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border whitespace-nowrap ${statusColors[act.status.toLowerCase()] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                    {statusLabels[act.status.toLowerCase()] || act.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const FilterPanel = () => (
    <div className="flex flex-col gap-4 py-1">
      <div className="md:hidden flex flex-col gap-1.5 z-[30]">
        <label className="text-[13px] font-bold text-muted-foreground">Kỳ báo cáo</label>
        <PeriodFilter
          onUpdate={({ range }) => setDateRange(range)}
          className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
          inline
        />
      </div>

      <div className="md:hidden flex flex-col gap-1.5 z-[29]">
        <label className="text-[13px] font-bold text-muted-foreground">Thời gian tùy chỉnh</label>
        <DateRangePicker
          initialDateFrom={dateRange.from}
          initialDateTo={dateRange.to}
          onUpdate={({ range }) => setDateRange(range)}
          align="center"
          inline
          className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl cursor-pointer"
          icon={<Calendar size={15} />}
          hidePresets={true}
        />
      </div>

      <div className="flex flex-col gap-1.5 z-[28]">
        <label className="text-[13px] font-bold text-muted-foreground">Khách hàng</label>
        <MultiSearchableSelect
          options={customerOptions}
          value={selectedCustomers}
          onValueChange={setSelectedCustomers}
          placeholder="Tất cả khách hàng..."
          className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
          inline
          icon={<Store size={15} />}
        />
      </div>

      <div className="flex flex-col gap-1.5 z-[27]">
        <label className="text-[13px] font-bold text-muted-foreground">Theo xe / tài xế</label>
        <MultiSearchableSelect
          options={vehicleOptions}
          value={selectedVehicles}
          onValueChange={setSelectedVehicles}
          placeholder="Tất cả xe/tài xế..."
          className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
          inline
          icon={<Truck size={15} />}
        />
      </div>

      <div className="flex flex-col gap-1.5 z-[26]">
        <label className="text-[13px] font-bold text-muted-foreground">Doanh thu</label>
        <RangeNumberFilter
          label="Mức doanh thu"
          value={revenueRange}
          onChange={setRevenueRange}
          presets={REVENUE_PRESETS}
          icon={<Banknote size={15} className="text-emerald-600" />}
          inline
          hideLabelPrefix
        />
      </div>

      <div className="flex flex-col gap-1.5 z-[25]">
        <label className="text-[13px] font-bold text-muted-foreground">Công nợ</label>
        <RangeNumberFilter
          label="Mức công nợ"
          value={debtRange}
          onChange={setDebtRange}
          presets={DEBT_PRESETS}
          icon={<TrendingUp size={15} className="text-red-600" />}
          inline
          hideLabelPrefix
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col w-full pb-20">
      <div className="hidden md:block">
        <PageHeader
          title="Báo cáo doanh thu"
          description="Tổng quan hoạt động kinh doanh"
          backPath="/app/ke-toan"
        />
      </div>

      <div className="bg-white flex flex-row w-full gap-2 items-stretch rounded-2xl shadow-sm border border-border p-2.5 mb-4 lg:mb-6 overflow-x-auto custom-scrollbar shrink-0">
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            placeholder="Tìm mã, khách..."
            onSearch={(raw) => setSearchQuery(raw)}
            className="h-[38px]"
          />
        </div>

        {/* Date Ranges */}
        <div className="hidden md:flex bg-muted/30 rounded-xl p-1 border border-border/50 items-center justify-between shrink-0">
          <PeriodFilter
            onUpdate={({ range }) => setDateRange(range)}
            className="border-none shadow-none bg-transparent hover:bg-white flex-1"
          />
          <div className="w-[1px] h-5 bg-border/80 mx-1"></div>
          <DateRangePicker
            initialDateFrom={dateRange.from}
            initialDateTo={dateRange.to}
            onUpdate={({ range }) => setDateRange(range)}
            align="end"
          />
        </div>

        <div className="hidden md:flex items-center gap-2">
          <MultiSearchableSelect
            options={customerOptions}
            value={selectedCustomers}
            onValueChange={setSelectedCustomers}
            placeholder="Tất cả khách hàng..."
          />
          <RangeNumberFilter
            label="Doanh thu"
            value={revenueRange}
            onChange={setRevenueRange}
            presets={REVENUE_PRESETS}
          />
          <RangeNumberFilter
            label="Công nợ"
            value={debtRange}
            onChange={setDebtRange}
            presets={DEBT_PRESETS}
          />
          <MultiSearchableSelect
            options={vehicleOptions}
            value={selectedVehicles}
            onValueChange={setSelectedVehicles}
            placeholder="Tất cả tài..."
          />

          {(hasActiveFilters || dateRange.from || dateRange.to) && (
            <button
              onClick={clearAllFilters}
              className="px-3 flex items-center justify-center shrink-0 h-[38px] text-[13px] font-bold text-red-500 hover:text-white bg-red-50 hover:bg-red-500 rounded-xl transition-colors border border-red-100 uppercase tracking-wider"
              title="Xóa bộ lọc"
            >
              Xóa lọc
            </button>
          )}
        </div>

        <button
          onClick={openFilter}
          className="md:hidden flex items-center justify-center w-[38px] h-[38px] shrink-0 border border-border/80 rounded-xl transition-all bg-slate-50 text-muted-foreground hover:bg-slate-100"
        >
          <Filter size={17} />
        </button>

        <MobileFilterSheet
          isOpen={isFilterOpen}
          isClosing={isFilterClosing}
          onClose={closeFilter}
          onApply={() => { }}
          onClear={clearAllFilters}
          showClearButton={hasActiveFilters}
          initialDateFrom=""
          initialDateTo=""
          hideDateFilter={true}
        >
          <FilterPanel />
        </MobileFilterSheet>
      </div>

      {isLoading ? (
        <LoadingSkeleton type="card" rows={3} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="flex flex-col space-y-6 pt-2 sm:pt-0 -mx-4 sm:mx-0">
          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 px-4 sm:px-0">
            <div className="bg-white p-4 lg:p-5 rounded-2xl border border-border shadow-sm flex flex-col justify-between overflow-hidden relative group">
              <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 mb-2 lg:mb-3 text-primary">
                <div className="w-8 h-8 lg:w-auto lg:h-auto rounded-lg bg-primary/10 lg:bg-transparent flex items-center justify-center">
                  <TrendingUp size={16} className="lg:w-5 lg:h-5" />
                </div>
                <span className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-muted-foreground">Doanh thu</span>
              </div>
              <p
                className="text-[14px] sm:text-[16px] md:text-xl lg:text-2xl font-black tabular-nums tracking-tighter truncate"
                title={formatCurrency(metrics.totalRevenue)}
              >
                {formatCurrency(metrics.totalRevenue)}
              </p>
            </div>
            <div className="bg-white p-4 lg:p-5 rounded-2xl border border-border shadow-sm flex flex-col justify-between overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 mb-2 lg:mb-3 text-emerald-500">
                <div className="w-8 h-8 lg:w-auto lg:h-auto rounded-lg bg-emerald-500/10 lg:bg-transparent flex items-center justify-center">
                  <Banknote size={16} className="lg:w-5 lg:h-5" />
                </div>
                <span className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-muted-foreground">Đã thu</span>
              </div>
              <p
                className="text-[14px] sm:text-[16px] md:text-xl lg:text-2xl font-black text-emerald-600 tabular-nums tracking-tighter truncate"
                title={formatCurrency(metrics.collectedRevenue)}
              >
                {formatCurrency(metrics.collectedRevenue)}
              </p>
            </div>
            <div className="bg-white p-4 lg:p-5 rounded-2xl border border-border shadow-sm flex flex-col justify-between overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 mb-2 lg:mb-3 text-red-500">
                <div className="w-8 h-8 lg:w-auto lg:h-auto rounded-lg bg-red-500/10 lg:bg-transparent flex items-center justify-center">
                  <TrendingUp size={16} className="lg:w-5 lg:h-5" />
                </div>
                <span className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-muted-foreground">Công nợ</span>
              </div>
              <p
                className="text-[14px] sm:text-[16px] md:text-xl lg:text-2xl font-black text-red-600 tabular-nums tracking-tighter truncate"
                title={formatCurrency(metrics.totalDebt)}
              >
                {formatCurrency(metrics.totalDebt)}
              </p>
            </div>
            <div className="bg-white p-4 lg:p-5 rounded-2xl border border-border shadow-sm flex flex-col justify-between overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 mb-2 lg:mb-3 text-blue-500">
                <div className="w-8 h-8 lg:w-auto lg:h-auto rounded-lg bg-blue-500/10 lg:bg-transparent flex items-center justify-center">
                  <PackageOpen size={16} className="lg:w-5 lg:h-5" />
                </div>
                <span className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-muted-foreground">Đơn hàng</span>
              </div>
              <p className="text-[14px] sm:text-[16px] md:text-xl lg:text-2xl font-black tabular-nums tracking-tighter truncate">
                {metrics.totalOrders} <span className="text-[10px] font-bold text-muted-foreground lg:hidden tracking-normal">ĐƠN</span>
              </p>
            </div>
          </div>

          {/* Chart Panel */}
          <div className="bg-white sm:rounded-2xl border-y sm:border border-border shadow-sm p-4 lg:p-6">
            <div className="flex items-center gap-2 mb-4 lg:mb-6 text-foreground">
              <BarChart2 size={18} className="text-primary" />
              <h3 className="text-[14px] lg:text-[15px] font-bold">Biểu đồ doanh thu</h3>
            </div>
            <div className="h-[350px] w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickMargin={10} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(val) => `${val / 1000000}tr`} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={45} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(value: any) => formatCurrency(value)} />
                    <Bar dataKey="doanhThu" name="Doanh thu" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={50} />
                    <Bar dataKey="congNo" name="Công nợ" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground italic bg-slate-50/50 rounded-xl border border-dashed border-border">
                  <BarChart2 size={32} className="mb-2 opacity-50 text-slate-400" />
                  <p className="text-sm">Không có dữ liệu trong khoảng thời gian này</p>
                </div>
              )}
            </div>
          </div>

          {/* Tables Section */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 px-4 md:px-0">
            <ActivityTable
              title="Phiếu xuất"
              icon={FileText}
              activities={exportActivities}
              accentColor="text-blue-500"
              viewPath="/app/hang-hoa/xuat-hang"
            />
            <ActivityTable
              title="Phiếu nhập"
              icon={FileText}
              activities={importActivities}
              accentColor="text-orange-500"
              viewPath="/app/hang-hoa/nhap-hang"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default RevenueReportPage;
