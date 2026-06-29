import React from 'react';
import { format } from 'date-fns';
import { Banknote, Calendar, Filter, Store, Truck, UserRound } from 'lucide-react';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import { SearchInput } from '../../components/ui/SearchInput';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import { matchesSearch } from '../../lib/str-utils';
import { useVehicleDebts } from '../../hooks/queries/useAccounting';
import type { VehicleDebt, VehicleDebtCustomerType } from '../../api/accountingApi';

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

  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterCustomer, setFilterCustomer] = React.useState<string[]>([]);
  const [filterVehicle, setFilterVehicle] = React.useState<string[]>([]);
  const [startDate, setStartDate] = React.useState<string>('');
  const [endDate, setEndDate] = React.useState<string>('');
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
      const debtDate = getDebtDate(debt);

      if (searchQuery) {
        const matched = [customerName, vehiclePlate, driverName, orderCode]
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

      <div className="md:bg-card md:rounded-2xl md:border md:border-border md:shadow-sm flex flex-col flex-1 min-h-0 md:overflow-hidden -mx-4 sm:mx-0">
        {isLoading ? (
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
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Mã đơn</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Khách hàng</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-left border-b border-border">Xe / tài xế</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Số lượng</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Đơn giá</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-right border-b border-border">Công nợ</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase text-center border-b border-border">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedDates.map((date) => (
                    <React.Fragment key={date}>
                      <tr className="bg-muted/50">
                        <td colSpan={7} className="px-4 py-2 border-y border-slate-100/10">
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
                        <tr key={debt.id} className="hover:bg-muted/10 transition-colors group">
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
                          <td className="px-4 py-3 text-right align-top tabular-nums font-semibold">{debt.assigned_quantity.toLocaleString('vi-VN')}</td>
                          <td className="px-4 py-3 text-right align-top tabular-nums text-muted-foreground">{formatCurrency(debt.unit_price)}</td>
                          <td className="px-4 py-3 text-right align-top tabular-nums font-black text-red-600">{formatCurrency(debt.expected_amount)}</td>
                          <td className="px-4 py-3 text-center align-top">
                            <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-700">Chưa TT</span>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3 p-4">
              {filteredDebts.map((debt) => (
                <div key={debt.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-black text-primary">{debt.order_code}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">{formatDate(getDebtDate(debt))}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-700">Chưa TT</span>
                  </div>
                  <div className="mt-3 space-y-2 text-[13px]">
                    <div className="flex items-center gap-2 font-bold text-foreground"><Store size={14} /> {debt.customer?.name || 'Chưa có khách'}</div>
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
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
