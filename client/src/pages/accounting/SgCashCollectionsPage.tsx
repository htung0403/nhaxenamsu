import React, { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import ErrorState from '../../components/shared/ErrorState';
import EmptyState from '../../components/shared/EmptyState';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import { useAuth } from '../../context/AuthContext';
import { useConfirmSgHandover, useBulkConfirmSgHandover, useSgImportCashList, useSgImportCashOrderDetail } from '../../hooks/queries/useSgImportCash';
import { useCustomers } from '../../hooks/queries/useCustomers';
import { useVehicles } from '../../hooks/queries/useVehicles';
import { useEmployees } from '../../hooks/queries/useHR';
import { format, subMonths } from 'date-fns';
import { CheckCircle2, Clock, Store, Truck, User, Filter, Printer } from 'lucide-react';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';
import toast from 'react-hot-toast';
import SgImportOrderDetailPanel from './SgImportOrderDetailPanel';
import { useNavigate } from 'react-router-dom';

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const isDriverLikeEmployeeRole = (role?: string | null) => {
  const r = (role || '').toLowerCase();
  return r === 'driver' || r.includes('tai_xe') || r.includes('tài xế');
};

type SgRow = {
  id: string;
  order_code: string;
  order_date: string;
  order_time: string;
  receiver_name?: string | null;
  license_plate?: string | null;
  driver_name?: string | null;
  total_amount?: number | null;
  received_by?: string | null;
  customers?: { id?: string; name?: string | null; phone?: string | null } | null;
  collector?: { id?: string; full_name?: string | null } | null;
  sg_cash_handover_confirmed_at?: string | null;
  confirmer?: { full_name?: string | null } | null;
  import_order_items?: Array<{
    quantity?: number | null;
    unit_price?: number | null;
    products?: { name?: string | null } | null;
  }> | null;
  delivery_orders?: Array<{
    delivery_date?: string | null;
    delivery_time?: string | null;
    delivery_vehicles?: Array<{
      assigned_quantity?: number | null;
      vehicles?: { license_plate?: string | null } | null;
      profiles?: { full_name?: string | null } | null;
    }> | null;
  }> | null;
};

const getRowItemNames = (row: SgRow): string => {
  const items = row.import_order_items || [];
  return items.map((i) => i.products?.name).filter(Boolean).join(', ') || '—';
};

const getRowTotalQuantity = (row: SgRow): number => {
  return (row.import_order_items || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
};

const getRowUnitPrice = (row: SgRow): number | null => {
  const items = row.import_order_items || [];
  if (items.length === 0) return null;
  const first = items[0];
  return first.unit_price ?? null;
};

const SgCashCollectionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role || '';
  const r = role.toLowerCase();
  const canConfirm = r === 'admin' || r === 'manager' || r === 'ke_toan';

  const defaultFrom = format(subMonths(new Date(), 3), 'yyyy-MM-dd');
  const defaultTo = format(new Date(), 'yyyy-MM-dd');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCustomer, setFilterCustomer] = useState<string[]>([]);
  const [filterDriver, setFilterDriver] = useState<string[]>([]);
  const [filterVehicle, setFilterVehicle] = useState<string[]>([]);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);

  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);

  const {
    data: importDetail,
    isError: importDetailError,
    isPending: importDetailPending,
    isFetching: importDetailFetching,
  } = useSgImportCashOrderDetail(selectedImportId);

  useEffect(() => {
    if (importDetailError && selectedImportId) {
      toast.error('Không tải được chi tiết đơn nhập');
      setIsDetailOpen(false);
      setIsDetailClosing(false);
      setSelectedImportId(null);
    }
  }, [importDetailError, selectedImportId]);

  const closeDetailPanel = () => {
    setIsDetailClosing(true);
    setTimeout(() => {
      setIsDetailOpen(false);
      setIsDetailClosing(false);
      setSelectedImportId(null);
    }, 300);
  };

  const detailOrder =
    selectedImportId && importDetail?.id === selectedImportId ? importDetail : null;
  const detailLoading =
    !!selectedImportId && !detailOrder && (importDetailPending || importDetailFetching);

  const { data: customers } = useCustomers(undefined, true);
  const { data: vehicles } = useVehicles(true);
  const { data: employees } = useEmployees(true);

  const { data, isLoading, isError, refetch } = useSgImportCashList({ from, to });
  const confirmMut = useConfirmSgHandover();
  const bulkConfirmMut = useBulkConfirmSgHandover();

  const rows = useMemo(() => (Array.isArray(data) ? (data as SgRow[]) : []), [data]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const customerOptions = useMemo(
    () =>
      (customers || []).map((c) => ({
        value: c.id,
        label: `${c.name}${c.phone ? ` (${c.phone})` : ''}`,
      })),
    [customers]
  );

  const vehicleOptions = useMemo(
    () =>
      (vehicles || [])
        .filter((v) => v.license_plate && String(v.license_plate).trim() !== '')
        .map((v) => ({
          value: String(v.license_plate).trim(),
          label: String(v.license_plate).trim(),
        })),
    [vehicles]
  );

  const driverOptions = useMemo(
    () =>
      (employees || [])
        .filter((e) => isDriverLikeEmployeeRole(e.role))
        .map((e) => ({
          value: e.id,
          label: e.full_name || e.id,
        })),
    [employees]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const custId = row.customers?.id;
      if (filterCustomer.length > 0) {
        if (!custId || !filterCustomer.includes(custId)) return false;
      }

      const recv = row.received_by;
      if (filterDriver.length > 0) {
        if (!recv || !filterDriver.includes(recv)) return false;
      }

      const plate = (row.license_plate || '').trim();
      if (filterVehicle.length > 0) {
        if (!plate || !filterVehicle.includes(plate)) return false;
      }

      if (searchQuery.trim()) {
        const code = (row.order_code || '');
        const cname = (row.customers?.name || '');
        const cphone = (row.customers?.phone || '');
        const drvName = (row.driver_name || '');
        const collName = (row.collector?.full_name || '');
        const lp = plate;

        const isHit =
          matchesSearch(code, searchQuery) ||
          matchesSearch(cname, searchQuery) ||
          matchesSearch(cphone, searchQuery) ||
          matchesSearch(drvName, searchQuery) ||
          matchesSearch(collName, searchQuery) ||
          matchesSearch(lp, searchQuery);
          
        if (!isHit) return false;
      }

      return true;
    });
  }, [rows, filterCustomer, filterDriver, filterVehicle, searchQuery]);

  const openFilter = () => setIsFilterOpen(true);
  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 300);
  };

  const confirmableRows = useMemo(() => filteredRows.filter(r => !r.sg_cash_handover_confirmed_at), [filteredRows]);
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowIds(new Set(confirmableRows.map(r => r.id)));
    } else {
      setSelectedRowIds(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBulkConfirm = () => {
    if (selectedRowIds.size === 0) return;
    bulkConfirmMut.mutate(Array.from(selectedRowIds), {
      onSuccess: () => setSelectedRowIds(new Set()),
    });
  };

  const selectedTotalAmount = useMemo(() => {
    return Array.from(selectedRowIds).reduce((sum, id) => {
      const row = rows.find((r) => r.id === id);
      return sum + (row?.total_amount || 0);
    }, 0);
  }, [selectedRowIds, rows]);

  const hasActiveFilters =
    filterCustomer.length > 0 || filterDriver.length > 0 || filterVehicle.length > 0 || searchQuery.trim() !== '';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Thu tiền SG"
          description="Phiếu nhập tạp hóa đã trả tiền tại SG — theo dõi và xác nhận NV đã nộp tiền về."
          backPath="/app/ke-toan"
          actions={
            <button
              onClick={() => navigate('/app/ke-toan/in-thu-tien-sg')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-foreground text-[13px] font-bold hover:bg-muted transition-colors shadow-sm"
            >
              <Printer size={16} />
              In danh sách
            </button>
          }
        />
      </div>

      <div className="bg-card flex flex-row w-full gap-2 items-center rounded-2xl shadow-sm border border-border p-2.5 md:mb-6 mb-3 overflow-x-auto custom-scrollbar">
        <div className="flex-1 min-w-[200px] md:max-w-full">
          <SearchInput
            placeholder="Tìm mã đơn, khách, xe..."
            onSearch={(raw) => setSearchQuery(raw)}
            className="h-[38px]"
          />
        </div>

        <div className="hidden md:flex gap-2 items-center shrink-0">
          <div className="w-[200px]">
            <MultiSearchableSelect
              options={customerOptions}
              value={filterCustomer}
              onValueChange={setFilterCustomer}
              placeholder="Khách hàng"
              className="bg-transparent"
              icon={<Store size={15} />}
            />
          </div>
          <div className="w-[180px]">
            <MultiSearchableSelect
              options={driverOptions}
              value={filterDriver}
              onValueChange={setFilterDriver}
              placeholder="Tài xế"
              className="bg-transparent"
              icon={<User size={15} />}
            />
          </div>
          <div className="w-[180px]">
            <MultiSearchableSelect
              options={vehicleOptions}
              value={filterVehicle}
              onValueChange={setFilterVehicle}
              placeholder="Theo xe"
              className="bg-transparent"
              icon={<Truck size={15} />}
            />
          </div>
        </div>

        <div className="hidden md:flex flex-col gap-1.5 shrink-0 min-w-[280px]">
          <div className="flex items-center gap-3 px-1">
            <span className="flex-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider">Từ ngày</span>
            <span className="flex-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider">Đến ngày</span>
          </div>
          <DateRangePicker
            initialDateFrom={from}
            initialDateTo={to}
            onUpdate={(values) => {
              if (values.range.from) setFrom(format(values.range.from, 'yyyy-MM-dd'));
              else setFrom('');
              if (values.range.to) setTo(format(values.range.to, 'yyyy-MM-dd'));
              else setTo('');
            }}
            align="end"
            className="w-full min-w-[260px]"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0 md:hidden">
          <button
            type="button"
            onClick={openFilter}
            className="flex items-center justify-center w-[38px] h-[38px] shrink-0 border border-border/80 rounded-xl transition-all bg-muted text-muted-foreground hover:bg-slate-100"
          >
            <Filter size={17} />
          </button>
        </div>
      </div>

      {canConfirm && selectedRowIds.size > 0 && (
        <div className="flex justify-between items-center bg-primary/10 border border-primary/20 rounded-xl p-3 md:mb-4 mb-3 mx-4 sm:mx-0">
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-primary">Đã chọn {selectedRowIds.size} phiếu</span>
            <span className="text-[12px] font-medium text-primary/80">Tổng tiền: {formatCurrency(selectedTotalAmount)}</span>
          </div>
          <button
            type="button"
            disabled={bulkConfirmMut.isPending}
            onClick={handleBulkConfirm}
            className="px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 disabled:opacity-50"
          >
            {bulkConfirmMut.isPending ? 'Đang xử lý...' : 'Xác nhận tất cả'}
          </button>
        </div>
      )}

      {canConfirm && selectedRowIds.size === 0 && confirmableRows.length > 0 && (
        <div className="md:hidden flex items-center gap-2 mb-3 mx-4 sm:mx-0">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-border"
            checked={false}
            onChange={(e) => handleSelectAll(e.target.checked)}
            id="mobile-select-all"
          />
          <label htmlFor="mobile-select-all" className="text-[13px] font-medium text-muted-foreground">Chọn tất cả</label>
        </div>
      )}

      <div className="md:bg-card md:rounded-2xl md:border md:border-border md:shadow-sm flex flex-col flex-1 min-h-0 md:overflow-hidden -mx-4 sm:mx-0">
        {isLoading ? (
          <LoadingSkeleton className="h-64" />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="Không có phiếu" description="Không có phiếu nhập đã trả trong khoảng thời gian này." />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="Không có phiếu khớp bộ lọc"
            description="Thử xóa tìm kiếm hoặc nới lỏng bộ lọc khách hàng / tài xế / xe."
          />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {canConfirm && (
                      <th className="px-4 py-3 w-[40px] text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-border"
                          checked={confirmableRows.length > 0 && selectedRowIds.size === confirmableRows.length}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          disabled={confirmableRows.length === 0}
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-tight">Mã phiếu</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-tight">Ngày / giờ nhập</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-tight">NV thu tiền</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-tight">KH</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-tight">Tên hàng</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-tight text-center">Số lượng</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-tight text-right">Đơn giá</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-tight text-right">Thành tiền</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-tight">Trạng thái nộp tiền</th>
                    {canConfirm && (
                      <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-tight w-40 text-right">
                        Thao tác
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const confirmed = !!row.sg_cash_handover_confirmed_at;
                    return (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedImportId(row.id);
                          setIsDetailOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedImportId(row.id);
                            setIsDetailOpen(true);
                          }
                        }}
                        className="border-b border-border/80 hover:bg-muted/20 transition-colors cursor-pointer"
                      >
                        {canConfirm && (
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            {!confirmed ? (
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-border cursor-pointer"
                                checked={selectedRowIds.has(row.id)}
                                onChange={(e) => handleSelectRow(row.id, e.target.checked)}
                              />
                            ) : null}
                          </td>
                        )}
                        <td className="px-4 py-3 text-[13px] font-bold tabular-nums">{row.order_code}</td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground whitespace-nowrap">
                          {row.order_date} {row.order_time}
                        </td>
                        <td className="px-4 py-3 text-[13px] max-w-[160px] truncate" title={row.collector?.full_name || ''}>
                          {row.collector?.full_name || '—'}
                        </td>
                        <td className="px-4 py-3 text-[13px] max-w-[160px] truncate">
                          {row.customers?.name || '—'}
                          {row.customers?.phone ? (
                            <span className="block text-[11px] text-muted-foreground">{row.customers.phone}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-[13px] max-w-[200px] truncate" title={getRowItemNames(row)}>
                          {getRowItemNames(row)}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-bold text-foreground text-center tabular-nums">
                          {getRowTotalQuantity(row) || '—'}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground text-right tabular-nums">
                          {getRowUnitPrice(row) != null ? formatCurrency(getRowUnitPrice(row)) : '—'}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-bold text-primary text-right tabular-nums">
                          {formatCurrency(row.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-[13px]">
                          {confirmed ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                              <CheckCircle2 size={14} />
                              Đã xác nhận
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                              <Clock size={14} />
                              Chưa xác nhận
                            </span>
                          )}
                          {confirmed && row.confirmer?.full_name ? (
                            <span className="block text-[11px] text-muted-foreground mt-0.5">
                              {row.confirmer.full_name}
                            </span>
                          ) : null}
                        </td>
                        {canConfirm && (
                          <td className="px-4 py-3 text-right">
                            {!confirmed ? (
                              <button
                                type="button"
                                disabled={confirmMut.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  confirmMut.mutate(row.id);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] font-bold hover:bg-primary/90 disabled:opacity-50"
                              >
                                Xác nhận đã nhận tiền
                              </button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden flex flex-col gap-3 p-3">
              {filteredRows.map((row) => {
                const confirmed = !!row.sg_cash_handover_confirmed_at;
                return (
                  <div
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedImportId(row.id);
                      setIsDetailOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedImportId(row.id);
                        setIsDetailOpen(true);
                      }
                    }}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2 cursor-pointer active:opacity-90"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2">
                        {canConfirm && !confirmed && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-border cursor-pointer"
                              checked={selectedRowIds.has(row.id)}
                              onChange={(e) => handleSelectRow(row.id, e.target.checked)}
                            />
                          </div>
                        )}
                        <span className="text-[13px] font-bold">{row.order_code}</span>
                      </div>
                      <span className="text-[12px] font-bold text-primary tabular-nums">
                        {formatCurrency(row.total_amount)}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      {row.order_date} {row.order_time}
                    </p>
                    <p className="text-[12px]">
                      <span className="text-muted-foreground">Hàng: </span>
                      <span className="font-medium">{getRowItemNames(row)}</span>
                      <span className="text-muted-foreground"> • SL </span>
                      <span className="font-bold">{getRowTotalQuantity(row) || '—'}</span>
                      {getRowUnitPrice(row) != null && (
                        <span className="text-muted-foreground"> • ĐG {formatCurrency(getRowUnitPrice(row))}</span>
                      )}
                    </p>
                    <p className="text-[12px]">
                      <span className="text-muted-foreground">NV thu tiền: </span>
                      {row.collector?.full_name || '—'}
                    </p>
                    <p className="text-[12px]">
                      {confirmed ? (
                        <span className="text-emerald-700 font-semibold">Đã xác nhận nộp tiền</span>
                      ) : (
                        <span className="text-amber-700 font-medium">Chưa xác nhận nộp tiền</span>
                      )}
                    </p>
                    {canConfirm && !confirmed && (
                      <button
                        type="button"
                        disabled={confirmMut.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmMut.mutate(row.id);
                        }}
                        className="w-full mt-2 py-2 rounded-xl bg-primary text-white text-[13px] font-bold"
                      >
                        Xác nhận đã nhận tiền
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={(filters) => {
          if (filters.dateFrom) setFrom(filters.dateFrom);
          else setFrom('');
          if (filters.dateTo) setTo(filters.dateTo);
          else setTo('');
        }}
        onClear={() => {
          setFilterCustomer([]);
          setFilterDriver([]);
          setFilterVehicle([]);
          setSearchQuery('');
        }}
        showClearButton={hasActiveFilters}
        initialDateFrom={from}
        initialDateTo={to}
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
        <div className="space-y-1.5 z-[28]">
          <label className="text-[13px] font-bold text-muted-foreground">Tài xế</label>
          <MultiSearchableSelect
            options={driverOptions}
            value={filterDriver}
            onValueChange={setFilterDriver}
            placeholder="Tất cả..."
            className="w-full bg-muted/10 h-[42px] border-border/80 rounded-xl"
            inline
            icon={<User size={15} />}
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

      <SgImportOrderDetailPanel
        isOpen={isDetailOpen}
        isClosing={isDetailClosing}
        onClose={closeDetailPanel}
        order={detailOrder}
        isLoading={detailLoading}
      />
    </div>
  );
};

export default SgCashCollectionsPage;
