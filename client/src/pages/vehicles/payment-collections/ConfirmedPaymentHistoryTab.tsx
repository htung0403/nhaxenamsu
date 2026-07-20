import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Filter, Printer, Search } from 'lucide-react';
import { DateRangePicker } from '../../../components/shared/DateRangePicker';
import MobileFilterSheet from '../../../components/shared/MobileFilterSheet';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import EmptyState from '../../../components/shared/EmptyState';
import ErrorState from '../../../components/shared/ErrorState';
import { useEmployees } from '../../../hooks/queries/useHR';
import { usePaymentCollections } from '../../../hooks/queries/usePaymentCollections';
import { useVehicles } from '../../../hooks/queries/useVehicles';
import { matchesSearch } from '../../../lib/str-utils';
import type { PaymentCollection } from '../../../types';
import { formatCurrency, formatDate, formatTime } from '../../../utils/formatters';
import { isDriverLikeRoleKey } from '../../../utils/routePermissions';

const getConfirmerName = (payment: PaymentCollection) => {
  if (payment.status === 'self_confirmed') return payment.driverName || 'Tài xế tự xác nhận';
  return payment.confirmedByName || payment.receiverName || '--';
};

const PAGE_SIZE = 50;

const formatDateInput = (date: Date) => format(date, 'yyyy-MM-dd');

const getDefaultDateRange = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 6);
  return {
    dateFrom: formatDateInput(from),
    dateTo: formatDateInput(to),
  };
};

const getConfirmedDateKey = (payment: PaymentCollection) => {
  const value = payment.confirmedAt || payment.collectedAt;
  const date = new Date(value);
  if (isNaN(date.getTime())) return value || 'Không rõ ngày';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const ConfirmedPaymentHistoryTab: React.FC = () => {
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [search, setSearch] = useState('');
  const [filterDriverId, setFilterDriverId] = useState('');
  const [filterVehicleId, setFilterVehicleId] = useState('');
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);

  const { data: collections, isLoading, isError, refetch } = usePaymentCollections({
    driverId: filterDriverId || undefined,
    vehicleId: filterVehicleId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const { data: employees } = useEmployees(true);
  const { data: vehicles } = useVehicles();

  const confirmedCollections = useMemo(() => {
    return (collections || [])
      .filter((payment) => payment.status === 'confirmed' || payment.status === 'self_confirmed')
      .filter((payment) => {
        if (!search.trim()) return true;
        return matchesSearch(
          [
            payment.deliveryOrderCode,
            payment.productName,
            payment.customerName,
            payment.licensePlate,
            payment.driverName,
            payment.receiverName,
            payment.confirmedByName,
          ].filter(Boolean).join(' '),
          search
        );
      })
      .sort((a, b) => new Date(b.confirmedAt || b.collectedAt).getTime() - new Date(a.confirmedAt || a.collectedAt).getTime());
  }, [collections, search]);

  const totalAmount = confirmedCollections.reduce((sum, payment) => sum + payment.collectedAmount, 0);
  const totalPages = Math.max(1, Math.ceil(confirmedCollections.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedCollections = confirmedCollections.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const groupedCollections = paginatedCollections.reduce((groups, payment) => {
    const dateKey = getConfirmedDateKey(payment);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(payment);
    return groups;
  }, {} as Record<string, PaymentCollection[]>);
  const groupedDateKeys = Object.keys(groupedCollections).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 280);
  };

  const handlePrint = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (filterDriverId) params.set('driverId', filterDriverId);
    if (filterVehicleId) params.set('vehicleId', filterVehicleId);
    if (search.trim()) params.set('search', search.trim());
    window.open(`/app/ke-toan/in-lich-su-thu-tien${params.toString() ? `?${params.toString()}` : ''}`, '_blank');
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <div className="col-span-2 md:col-span-1 bg-white p-3 md:p-4 rounded-2xl md:rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-10 md:h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 shrink-0">
            <Download size={18} />
          </div>
          <div>
            <p className="text-[12px] font-medium text-slate-500">Tổng đã xác nhận</p>
            <p className="text-[18px] md:text-[18px] font-bold text-slate-800 leading-tight">{formatCurrency(totalAmount)}</p>
          </div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-2xl md:rounded-xl border border-slate-200 shadow-sm min-w-0">
          <p className="text-[12px] font-medium text-slate-500">Số phiếu</p>
          <p className="text-[18px] font-bold text-slate-800 leading-tight">{confirmedCollections.length} phiếu</p>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-2xl md:rounded-xl border border-slate-200 shadow-sm min-w-0">
          <p className="text-[12px] font-medium text-slate-500">Khoảng ngày</p>
          <p className="text-[13px] md:text-[14px] font-bold text-slate-800 leading-tight truncate">
            {dateFrom || dateTo ? `${dateFrom || '...'} - ${dateTo || '...'}` : 'Tất cả thời gian'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_44px] md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_220px_180px_180px_auto] xl:grid-cols-[minmax(0,1fr)_260px_200px_200px_auto] gap-2.5 md:gap-3 items-center">
        <div className="relative min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm mã đơn, khách, xe, tài xế, nhân viên..."
            className="w-full h-[38px] pl-9 pr-3 rounded-2xl md:rounded-xl border border-slate-200 bg-white text-[13px] font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm md:shadow-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setIsFilterOpen(true)}
          className="md:hidden h-[38px] w-[44px] rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm flex items-center justify-center"
          aria-label="Mở bộ lọc"
        >
          <Filter size={17} />
        </button>
        <div className="hidden md:block min-w-0 [&>button]:w-full">
          <DateRangePicker
            initialDateFrom={dateFrom}
            initialDateTo={dateTo}
            onUpdate={({ range }) => {
              setDateFrom(range.from ? formatDateInput(range.from) : defaultRange.dateFrom);
              setDateTo(range.to ? formatDateInput(range.to) : defaultRange.dateTo);
              setPage(1);
            }}
          />
        </div>
        <div className="hidden md:block min-w-0">
          <SearchableSelect
            value={filterDriverId}
            onValueChange={(value) => {
              setFilterDriverId(value);
              setPage(1);
            }}
            placeholder="Tất cả tài xế"
            options={employees?.filter(e => isDriverLikeRoleKey(e.role)).map(e => ({ value: e.id, label: e.full_name })) || []}
            className="bg-white h-[38px] border-slate-200 rounded-xl"
          />
        </div>
        <div className="hidden md:block min-w-0">
          <SearchableSelect
            value={filterVehicleId}
            onValueChange={(value) => {
              setFilterVehicleId(value);
              setPage(1);
            }}
            placeholder="Tất cả xe"
            options={vehicles?.map(v => ({ value: v.id, label: v.license_plate })) || []}
            className="bg-white h-[38px] border-slate-200 rounded-xl"
          />
        </div>
        <button
          onClick={handlePrint}
          className="h-[38px] px-4 rounded-2xl md:rounded-xl bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700 flex items-center justify-center gap-2 whitespace-nowrap col-span-2 md:col-span-2 lg:col-span-1 shadow-sm md:shadow-none"
        >
          <Printer size={16} /> In A4
        </button>
      </div>

      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={(filters) => {
          setDateFrom(filters.dateFrom || defaultRange.dateFrom);
          setDateTo(filters.dateTo || defaultRange.dateTo);
          setPage(1);
        }}
        onClear={() => {
          setDateFrom(defaultRange.dateFrom);
          setDateTo(defaultRange.dateTo);
          setFilterDriverId('');
          setFilterVehicleId('');
          setPage(1);
        }}
        showClearButton={dateFrom !== defaultRange.dateFrom || dateTo !== defaultRange.dateTo || !!filterDriverId || !!filterVehicleId}
        initialDateFrom={dateFrom}
        initialDateTo={dateTo}
        dateLabel="Lọc theo ngày xác nhận"
      >
        <div className="space-y-1.5">
          <label className="text-[13px] font-bold text-muted-foreground">Tài xế</label>
          <SearchableSelect
            value={filterDriverId}
            onValueChange={(value) => {
              setFilterDriverId(value);
              setPage(1);
            }}
            placeholder="Tất cả tài xế"
            options={employees?.filter(e => isDriverLikeRoleKey(e.role)).map(e => ({ value: e.id, label: e.full_name })) || []}
            className="bg-muted/20 border-border/40 h-[44px]"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[13px] font-bold text-muted-foreground">Biển số xe</label>
          <SearchableSelect
            value={filterVehicleId}
            onValueChange={(value) => {
              setFilterVehicleId(value);
              setPage(1);
            }}
            placeholder="Tất cả xe"
            options={vehicles?.map(v => ({ value: v.id, label: v.license_plate })) || []}
            className="bg-muted/20 border-border/40 h-[44px]"
          />
        </div>
      </MobileFilterSheet>

      <div className="bg-transparent md:bg-white border-0 md:border border-slate-200 md:rounded-xl md:shadow-sm md:overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40"><p>Đang tải...</p></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : confirmedCollections.length === 0 ? (
          <EmptyState title="Không có phiếu thu đã xác nhận" />
        ) : (
          <>
          <div className="md:hidden flex flex-col gap-5 pb-2">
            {groupedDateKeys.map((dateKey) => (
              <div key={dateKey} className="space-y-3">
                <div className="px-1 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Ngày xác nhận</p>
                    <h3 className="text-[15px] font-extrabold text-slate-800">{formatDate(dateKey)}</h3>
                  </div>
                  <div className="text-right text-[12px] font-bold text-slate-500">
                    <p>{groupedCollections[dateKey].length} phiếu</p>
                    <p className="text-green-700">{formatCurrency(groupedCollections[dateKey].reduce((sum, payment) => sum + payment.collectedAmount, 0))}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  {groupedCollections[dateKey].map((payment) => (
                    <div key={payment.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-hidden relative">
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-green-500" />
                      <div className="pl-2 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-[15px] font-extrabold text-slate-800 truncate">{payment.productName || '--'}</h3>
                            <p className="text-[12px] font-medium text-slate-500 line-clamp-2">{payment.customerName || '--'}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[14px] font-extrabold text-green-700">{formatCurrency(payment.collectedAmount)}</p>
                            <p className="text-[11px] text-slate-400">{payment.confirmedAt ? formatTime(payment.confirmedAt) : '--'}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 border border-slate-100 p-3 text-[12px]">
                          <div>
                            <p className="text-slate-400 font-bold uppercase text-[10px]">Xe</p>
                            <p className="font-bold text-slate-700 truncate">{payment.licensePlate || '--'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-slate-400 font-bold uppercase text-[10px]">Tài xế</p>
                            <p className="font-bold text-slate-700 truncate">{payment.driverName || '--'}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-bold uppercase text-[10px]">Gửi cho NV</p>
                            <p className="font-medium text-slate-600 truncate">{payment.receiverName || (payment.status === 'self_confirmed' ? 'Tự xác nhận' : '--')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-slate-400 font-bold uppercase text-[10px]">Xác nhận bởi</p>
                            <p className="font-bold text-slate-800 truncate">{getConfirmerName(payment)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                          <span>Thu: {formatDate(payment.collectedAt)} {formatTime(payment.collectedAt)}</span>
                          <span>XN: {payment.confirmedAt ? `${formatDate(payment.confirmedAt)} ${formatTime(payment.confirmedAt)}` : '--'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[12px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="px-4 py-3">Tên Hàng</th>
                  <th className="px-4 py-3">Khách hàng</th>
                  <th className="px-4 py-3">Xe</th>
                  <th className="px-4 py-3">Tài xế</th>
                  <th className="px-4 py-3">Gửi cho NV</th>
                  <th className="px-4 py-3">Xác nhận bởi</th>
                  <th className="px-4 py-3 text-right">Số tiền</th>
                  <th className="px-4 py-3">Ngày thu</th>
                  <th className="px-4 py-3">Ngày XN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedDateKeys.map((dateKey) => (
                  <React.Fragment key={dateKey}>
                    <tr className="bg-slate-100/80 border-y border-slate-200">
                      <td colSpan={9} className="px-4 py-2">
                        <div className="flex items-center justify-between text-[13px] font-bold text-slate-700">
                          <span>Ngày xác nhận: {formatDate(dateKey)}</span>
                          <span className="text-slate-500 font-medium">
                            {groupedCollections[dateKey].length} phiếu • Tổng: {formatCurrency(groupedCollections[dateKey].reduce((sum, payment) => sum + payment.collectedAmount, 0))}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {groupedCollections[dateKey].map((payment) => (
                      <tr key={payment.id} className="hover:bg-slate-50/70 text-[13px]">
                        <td className="px-4 py-3 font-medium text-slate-600">{payment.productName || '--'}</td>
                        <td className="px-4 py-3 font-medium text-slate-600">{payment.customerName || '--'}</td>
                        <td className="px-4 py-3 font-bold text-slate-700">{payment.licensePlate || '--'}</td>
                        <td className="px-4 py-3 text-slate-600">{payment.driverName || '--'}</td>
                        <td className="px-4 py-3 text-slate-600">{payment.receiverName || (payment.status === 'self_confirmed' ? 'Tự xác nhận' : '--')}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">{getConfirmerName(payment)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(payment.collectedAmount)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(payment.collectedAt)} {formatTime(payment.collectedAt)}</td>
                        <td className="px-4 py-3 text-slate-600">{payment.confirmedAt ? `${formatDate(payment.confirmedAt)} ${formatTime(payment.confirmedAt)}` : '--'}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {confirmedCollections.length > PAGE_SIZE && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[13px] text-slate-600">
          <div>
            Hiển thị {(safePage - 1) * PAGE_SIZE + 1} - {Math.min(safePage * PAGE_SIZE, confirmedCollections.length)} / {confirmedCollections.length} phiếu
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage === 1}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft size={16} /> Trước
            </button>
            <span className="px-3 font-bold text-slate-800">Trang {safePage}/{totalPages}</span>
            <button
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage === totalPages}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Sau <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfirmedPaymentHistoryTab;
