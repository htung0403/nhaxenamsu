import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { clsx } from 'clsx';
import { isDriverLikeRoleKey } from '../../../utils/routePermissions';
import { usePaymentCollections, useRevertPaymentCollection } from '../../../hooks/queries/usePaymentCollections';
import { useEmployees } from '../../../hooks/queries/useHR';
import { useVehicles } from '../../../hooks/queries/useVehicles';
import { Plus, Download, CheckCircle, AlertCircle, RefreshCw, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

import EmptyState from '../../../components/shared/EmptyState';
import ErrorState from '../../../components/shared/ErrorState';
import CreateEditPaymentDialog from './dialogs/CreateEditPaymentDialog';
import SubmitPaymentDialog from './dialogs/SubmitPaymentDialog';
import BulkSubmitPaymentDialog from './dialogs/BulkSubmitPaymentDialog';
import SelfConfirmDialog from './dialogs/SelfConfirmDialog';
import DraggableFAB from '../../../components/shared/DraggableFAB';
import { DatePicker } from '../../../components/shared/DatePicker';
import { CustomSelect } from '../../../components/shared/CustomSelect';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import MobileFilterSheet from '../../../components/shared/MobileFilterSheet';
import { formatCurrency, formatDate, formatTime } from '../../../utils/formatters';
import type { PaymentCollection, PaymentCollectionStatus } from '../../../types';
import { Filter } from 'lucide-react';
import { SearchInput } from '../../../components/ui/SearchInput';
import { matchesSearch } from '../../../lib/str-utils';

interface Props {
  readonly?: boolean;
}

const PAGE_SIZE = 50;

const getLocalDateKey = (value: string) => {
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

const DriverPaymentTab: React.FC<Props> = ({ readonly }) => {
  const { user } = useAuth();
  const isDriver = isDriverLikeRoleKey(user?.role || '');
  
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<PaymentCollectionStatus | ''>('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDriverId, setFilterDriverId] = useState('');
  const [filterVehicleId, setFilterVehicleId] = useState('');
  const [page, setPage] = useState(1);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);

  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  const toggleDate = (dateKey: string) => {
    setCollapsedDates(prev => ({
      ...prev,
      [dateKey]: !prev[dateKey]
    }));
  };

  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 300);
  };

  const { data: collections, isLoading, isError, refetch } = usePaymentCollections({
    driverId: isDriver ? user?.id : (filterDriverId || undefined),
    vehicleId: filterVehicleId || undefined,
    status: filterStatus || undefined,
    dateFrom: filterDate || undefined,
    dateTo: filterDate || undefined,
  });

  const { data: employees } = useEmployees(!isDriver);
  const { data: vehicles } = useVehicles();

  // Dialogs state

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedPC, setSelectedPC] = useState<PaymentCollection | null>(null);

  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isBulkSubmitOpen, setIsBulkSubmitOpen] = useState(false);
  const [isSelfConfirmOpen, setIsSelfConfirmOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const { mutate: revert } = useRevertPaymentCollection();

  const filtered = useMemo(() => collections?.filter(c => {
    if (filterSearch) {
      return (
        matchesSearch(c.deliveryOrderCode, filterSearch) ||
        matchesSearch(c.customerName, filterSearch) ||
        matchesSearch(c.driverName || '', filterSearch) ||
        matchesSearch(c.licensePlate || '', filterSearch)
      );
    }
    return true;
  }) || [], [collections, filterSearch]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedCollections = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  const draftItems = useMemo(() => filtered.filter((c) => c.status === 'draft'), [filtered]);

  const selectedDrafts = useMemo(
    () => draftItems.filter((c) => selectedIds.has(c.id)),
    [draftItems, selectedIds]
  );

  const selectedTotal = useMemo(
    () => selectedDrafts.reduce((s, c) => s + (c.collectedAmount || 0), 0),
    [selectedDrafts]
  );

  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (!el) return;
    const all = draftItems.length > 0 && draftItems.every((d) => selectedIds.has(d.id));
    const some = draftItems.some((d) => selectedIds.has(d.id));
    el.indeterminate = some && !all;
  }, [draftItems, selectedIds]);

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllDraftsInView = () => {
    setSelectedIds(new Set(draftItems.map((d) => d.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const toggleHeaderCheckbox = () => {
    const all = draftItems.length > 0 && draftItems.every((d) => selectedIds.has(d.id));
    if (all) clearSelection();
    else selectAllDraftsInView();
  };

  const toggleDateDrafts = (dateKey: string) => {
    const dateDraftIds = (groupedCollections[dateKey] || [])
      .filter((pc) => pc.status === 'draft')
      .map((pc) => pc.id);
    if (dateDraftIds.length === 0) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = dateDraftIds.every((id) => next.has(id));
      dateDraftIds.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const handleAction = (action: string, pc: PaymentCollection) => {
    setSelectedPC(pc);
    if (action === 'submit') setIsSubmitOpen(true);
    if (action === 'self_confirm') setIsSelfConfirmOpen(true);
    if (action === 'edit') setIsCreateOpen(true);
  };

  const getStatusBadge = (status: PaymentCollectionStatus) => {
    switch (status) {
      case 'draft': return <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-600">Chưa Nộp</span>;
      case 'submitted': return <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-yellow-100 text-yellow-700">Chờ Xác Nhận</span>;
      case 'confirmed': return <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-green-100 text-green-700">Đã Xác Nhận</span>;
      case 'self_confirmed': return <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-100 text-blue-700">Tự Xác Nhận</span>;
      default: return null;
    }
  };

  // Summary logic
  const today = getLocalDateKey(new Date().toISOString());
  const todayCollections = collections?.filter(c => getLocalDateKey(c.collectedAt) === today) || [];
  const totalCollectedToday = todayCollections.reduce((sum, c) => sum + c.collectedAmount, 0);

  const pendingCount = collections?.filter(c => c.status === 'submitted').length || 0;
  const confirmedCount = collections?.filter(c => c.status === 'confirmed' || c.status === 'self_confirmed').length || 0;
  const missingAmount = collections?.filter(c => (c.difference || 0) < 0 && c.status !== 'draft' && status !== 'cancelled').reduce((sum, c) => sum + Math.abs(c.difference || 0), 0) || 0;

  const hasActiveFilters = filterDate || filterStatus || filterDriverId || filterVehicleId;

  const groupedCollections = paginatedCollections.reduce((acc, pc) => {
    const dateKey = getLocalDateKey(pc.collectedAt);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(pc);
    return acc;
  }, {} as Record<string, PaymentCollection[]>);

  const sortedDates = Object.keys(groupedCollections).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  sortedDates.forEach(date => {
    groupedCollections[date].sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
            <Download size={20} />
          </div>
          <div>
            <p className="text-[12px] font-medium text-slate-500">Tổng Thu Hôm Nay</p>
            <p className="text-[16px] font-bold text-slate-800">{formatCurrency(totalCollectedToday)}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center text-yellow-600">
            <RefreshCw size={20} />
          </div>
          <div>
            <p className="text-[12px] font-medium text-slate-500">Chờ Xác Nhận</p>
            <p className="text-[16px] font-bold text-slate-800">{pendingCount} phiếu</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600">
            <CheckCircle size={20} />
          </div>
          <div>
            <p className="text-[12px] font-medium text-slate-500">Đã Xác Nhận</p>
            <p className="text-[16px] font-bold text-slate-800">{confirmedCount} phiếu</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600">
            <AlertCircle size={20} />
          </div>
          <div>
            <p className="text-[12px] font-medium text-slate-500">Còn Thiếu</p>
            <p className="text-[16px] font-bold text-slate-800">{formatCurrency(missingAmount)}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full md:flex-1">
          <div className="flex-1">
            <SearchInput
              placeholder="Tìm mã đơn, khách..."
              onSearch={(raw) => {
                setPage(1);
                setFilterSearch(raw);
              }}
            />
          </div>
          <button 
            onClick={() => setIsFilterOpen(true)}
            className={clsx(
              "md:hidden flex items-center justify-center w-[38px] h-[38px] rounded-lg border border-slate-200 bg-white text-slate-600 shrink-0 relative",
              hasActiveFilters && "text-primary border-primary bg-primary/5"
            )}
          >
            <Filter size={18} />
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full border-2 border-white" />
            )}
          </button>
        </div>

        <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1 w-full max-w-[800px]">
          <DatePicker value={filterDate} onChange={(value) => {
            setPage(1);
            setFilterDate(value);
          }} placeholder="Chọn ngày..." className="bg-white h-[38px]" />

          <CustomSelect
            value={filterStatus}
            onChange={(val: string) => {
              setPage(1);
              setFilterStatus(val as PaymentCollectionStatus | '');
            }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'draft', label: 'Chưa Nộp' },
              { value: 'submitted', label: 'Chờ Xác Nhận' },
              { value: 'confirmed', label: 'Đã Xác Nhận' },
              { value: 'self_confirmed', label: 'Tự Xác Nhận' },
    { value: 'cancelled', label: 'Đã Huỷ' }
            ]}
            className="bg-white h-[38px]"
          />

          {!isDriver && (
            <SearchableSelect
              value={filterDriverId}
              onValueChange={(value) => {
                setPage(1);
                setFilterDriverId(value);
              }}
              placeholder="Tất cả tài xế"
              options={employees?.filter(e => isDriverLikeRoleKey(e.role)).map(e => ({ value: e.id, label: e.full_name })) || []}
              className="bg-white h-[38px] border-slate-200 rounded-lg"
            />
          )}

          <SearchableSelect
            value={filterVehicleId}
            onValueChange={(value) => {
              setPage(1);
              setFilterVehicleId(value);
            }}
            placeholder="Tất cả xe"
            options={vehicles?.map(v => ({ value: v.id, label: v.license_plate })) || []}
            className="bg-white h-[38px] border-slate-200 rounded-lg"
          />
        </div>

        <div className="hidden md:flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {!readonly && draftItems.length > 0 && (
            <>
              <button
                type="button"
                onClick={selectAllDraftsInView}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-[12px] font-bold hover:bg-slate-50 h-[38px]"
              >
                Chọn tất cả chưa nộp
              </button>
              {selectedDrafts.length > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-[12px] font-semibold hover:bg-slate-50 h-[38px]"
                >
                  Bỏ chọn
                </button>
              )}
            </>
          )}
          {!readonly && selectedDrafts.length > 0 && (
            <button
              type="button"
              onClick={() => setIsBulkSubmitOpen(true)}
              className="px-4 py-2 bg-emerald-600 text-white text-[13px] font-bold rounded-lg hover:bg-emerald-700 flex items-center gap-2 h-[38px] shadow-sm"
            >
              Nộp hàng loạt ({selectedDrafts.length})
              <span className="opacity-90 font-semibold tabular-nums">{formatCurrency(selectedTotal)}</span>
            </button>
          )}
          {!readonly && (
            <button
              onClick={() => {
                setSelectedPC(null);
                setIsCreateOpen(true);
              }}
              className="md:flex md:w-auto shrink-0 px-4 py-2 bg-primary text-white text-[13px] font-bold rounded-lg hover:bg-primary/90 items-center justify-center gap-2 h-[38px]"
            >
              <Plus size={16} />
              Tạo Phiếu Thu
            </button>
          )}
        </div>
      </div>

      {!readonly && draftItems.length > 0 && (
        <div className="md:hidden flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selectAllDraftsInView}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-[12px] font-bold"
          >
            Chọn tất cả chưa nộp
          </button>
          {selectedDrafts.length > 0 && (
            <button
              type="button"
              onClick={clearSelection}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-[12px] font-semibold"
            >
              Bỏ chọn
            </button>
          )}
          {selectedDrafts.length > 0 && (
            <button
              type="button"
              onClick={() => setIsBulkSubmitOpen(true)}
              className="px-3 py-2 bg-emerald-600 text-white text-[12px] font-bold rounded-lg"
            >
              Nộp hàng loạt ({selectedDrafts.length}) — {formatCurrency(selectedTotal)}
            </button>
          )}
        </div>
      )}

      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={(filters) => {
          setPage(1);
          setFilterDate(filters.dateFrom);
          setFilterStatus(filters.status);
        }}
        onClear={() => {
          setPage(1);
          setFilterDate('');
          setFilterStatus('');
          setFilterDriverId('');
          setFilterVehicleId('');
        }}
        initialDateFrom={filterDate}
        initialDateTo={filterDate}
        initialStatus={filterStatus}
        statusOptions={[
          { value: '', label: 'Tất cả trạng thái' },
          { value: 'draft', label: 'Chưa Nộp' },
          { value: 'submitted', label: 'Chờ Xác Nhận' },
          { value: 'confirmed', label: 'Đã Xác Nhận' },
          { value: 'self_confirmed', label: 'Tự Xác Nhận' },
    { value: 'cancelled', label: 'Đã Huỷ' }
        ]}
        dateLabel="Lọc theo ngày thu"
      >
        {!isDriver && (
          <div className="space-y-1.5">
            <label className="text-[13px] font-bold text-muted-foreground">Tài xế</label>
            <SearchableSelect
              value={filterDriverId}
              onValueChange={(value) => {
                setPage(1);
                setFilterDriverId(value);
              }}
              placeholder="Tất cả tài xế"
              options={employees?.filter(e => isDriverLikeRoleKey(e.role)).map(e => ({ value: e.id, label: e.full_name })) || []}
              className="bg-muted/20 border-border/40 h-[44px]"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-[13px] font-bold text-muted-foreground">Biển số xe</label>
          <SearchableSelect
            value={filterVehicleId}
            onValueChange={(value) => {
              setPage(1);
              setFilterVehicleId(value);
            }}
            placeholder="Tất cả xe"
            options={vehicles?.map(v => ({ value: v.id, label: v.license_plate })) || []}
            className="bg-muted/20 border-border/40 h-[44px]"
          />
        </div>
      </MobileFilterSheet>

      {!readonly && (
        <DraggableFAB icon={<Plus size={24} />} onClick={() => { setSelectedPC(null); setIsCreateOpen(true); }} />
      )}

      {/* Table */}
      <div className="bg-transparent md:bg-white border-0 md:border border-slate-200 md:rounded-xl md:shadow-sm md:overflow-hidden">
        <div className="min-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-40"><p>Đang tải...</p></div>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState title="Không có phiếu thu nào" />
          ) : (
            <>
              {/* Mobile Card Layout */}
              <div className="md:hidden flex flex-col gap-6 pb-20">
                {sortedDates.map(dateKey => {
                  const isCollapsed = collapsedDates[dateKey];
                  const dateDrafts = groupedCollections[dateKey].filter((pc) => pc.status === 'draft');
                  const areAllDateDraftsSelected = dateDrafts.length > 0 && dateDrafts.every((pc) => selectedIds.has(pc.id));
                  return (
                  <div key={dateKey} className="space-y-3">
                    <div 
                      className="flex items-center justify-between px-1 cursor-pointer select-none"
                      onClick={() => toggleDate(dateKey)}
                    >
                      <div className="flex items-center gap-2">
                        {!readonly && dateDrafts.length > 0 && (
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300"
                            checked={areAllDateDraftsSelected}
                            onChange={() => toggleDateDrafts(dateKey)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Chọn tất cả phiếu chưa nộp ngày ${formatDate(dateKey)}`}
                          />
                        )}
                        {isCollapsed ? <ChevronRight size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
                        <h3 className="font-bold text-slate-800">{formatDate(dateKey)}</h3>
                      </div>
                      <span className="text-[12px] text-slate-500 font-medium">
                        {groupedCollections[dateKey].length} phiếu • {formatCurrency(groupedCollections[dateKey].reduce((sum, pc) => sum + pc.collectedAmount, 0))}
                      </span>
                    </div>
                    {!isCollapsed && (
                    <div className="flex flex-col gap-3">
                      {groupedCollections[dateKey].map(pc => (
                        <div key={pc.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm relative overflow-hidden group">
                          <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${pc.status === 'confirmed' ? 'bg-green-500' : pc.status === 'submitted' ? 'bg-yellow-500' : pc.status === 'self_confirmed' ? 'bg-blue-500' : 'bg-slate-300'}`} />
                          <div className="flex justify-between items-start mb-3 pl-2 gap-2">
                            <div className="flex items-start gap-2 min-w-0 flex-1">
                              {!readonly && pc.status === 'draft' && (
                                <input
                                  type="checkbox"
                                  className="mt-1 w-4 h-4 rounded border-slate-300 shrink-0"
                                  checked={selectedIds.has(pc.id)}
                                  onChange={() => toggleSelectOne(pc.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                              <div className="min-w-0">
                                <h3 className="font-bold text-slate-800 text-[14px]">{pc.deliveryOrderCode}</h3>
                                <p className="text-[12px] text-slate-500">{pc.customerName}</p>
                              </div>
                            </div>
                            <div className="shrink-0">{getStatusBadge(pc.status)}</div>
                          </div>
                          
                           <div className="grid grid-cols-2 gap-y-2 mb-3 pl-2 text-[13px]">
                             <div>
                               <p className="text-slate-500 text-[11px]">Tài xế</p>
                               <p className="font-medium text-slate-600">{pc.driverName || '--'}</p>
                             </div>
                             <div className="text-right">
                               <p className="text-slate-500 text-[11px]">Biển số xe</p>
                               <p className="font-medium text-slate-600">{pc.licensePlate || '--'}</p>
                             </div>
                             <div>
                               <p className="text-slate-500 text-[11px]">Số kiện</p>
                               <p className="font-medium text-slate-600">{pc.totalPackages != null ? `${pc.totalPackages} kiện` : '--'}</p>
                             </div>
                             <div className="text-right">
                               <p className="text-slate-500 text-[11px]">Đơn giá</p>
                               <p className="font-medium text-slate-600">{pc.pricePerPackage != null && pc.pricePerPackage > 0 ? formatCurrency(pc.pricePerPackage) : '--'}</p>
                             </div>
                             <div>
                               <p className="text-slate-500 text-[11px]">Tổng Tiền Giao</p>
                               <p className="font-bold text-slate-600">{formatCurrency(pc.expectedAmount)}</p>
                             </div>
                           </div>
       
                           <div className="flex justify-between items-center pt-3 border-t border-slate-100 pl-2">
      
                             <div className="text-[11px] text-slate-500">
                               {formatTime(pc.collectedAt)}
                             </div>
                             {!readonly && (
                               <div className="flex space-x-2">
                                {pc.status === 'draft' && (
                                  <>
                                    <button onClick={() => handleAction('edit', pc)} className="text-[11px] font-medium text-slate-600 border border-slate-200 px-2.5 py-1.5 rounded-md bg-slate-50">Sửa</button>
                                    <button onClick={() => handleAction('submit', pc)} className="text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-1.5 rounded-md">Nộp</button>
                                  </>
                                )}
                                {pc.status === 'submitted' && (
                                  <button onClick={() => { if (confirm('Bạn có chắc muốn hủy nộp phiếu này?')) revert(pc.id); }} className="text-[11px] font-bold text-yellow-600 bg-yellow-50 px-2.5 py-1.5 rounded-md border border-yellow-200">Hủy</button>
                                )}
                               </div>
                             )}
                          </div>
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                )})}
              </div>

              {/* Desktop Table Layout */}
              <div className="hidden md:block overflow-x-auto pb-6">
                <table className="w-full text-left border-collapse">
                <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-[12px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="w-11 px-2 py-3 text-center">
                    {!readonly && draftItems.length > 0 ? (
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        title="Chọn tất cả phiếu chưa nộp (theo bộ lọc hiện tại)"
                        checked={draftItems.length > 0 && draftItems.every((d) => selectedIds.has(d.id))}
                        onChange={toggleHeaderCheckbox}
                        className="w-4 h-4 rounded border-slate-300"
                      />
                    ) : null}
                  </th>
                  <th className="px-4 py-3">Khách Hàng</th>
                  <th className="px-4 py-3">Số Lượng Kiện</th>
                  <th className="px-4 py-3">Đơn Giá</th>
                  <th className="px-4 py-3">Tổng Tiền Giao</th>
                  <th className="px-4 py-3">Biển Số Xe</th>
                  <th className="px-4 py-3">Người Giao</th>
                  <th className="px-4 py-3">Thu Lúc</th>
                  <th className="px-4 py-3">Trạng Thái</th>
                  {!readonly && <th className="px-4 py-3 text-right">Thao Tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedDates.map(dateKey => {
                  const isCollapsed = collapsedDates[dateKey];
                  const dateDrafts = groupedCollections[dateKey].filter((pc) => pc.status === 'draft');
                  const areAllDateDraftsSelected = dateDrafts.length > 0 && dateDrafts.every((pc) => selectedIds.has(pc.id));
                  return (
                  <React.Fragment key={dateKey}>
                    <tr 
                      className="bg-slate-100/50 cursor-pointer select-none hover:bg-slate-200/50 transition-colors"
                      onClick={() => toggleDate(dateKey)}
                    >
                      <td colSpan={readonly ? 9 : 10} className="px-4 py-2 text-[13px] font-bold text-slate-700">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {!readonly && dateDrafts.length > 0 && (
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-300"
                                checked={areAllDateDraftsSelected}
                                onChange={() => toggleDateDrafts(dateKey)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Chọn tất cả phiếu chưa nộp ngày ${formatDate(dateKey)}`}
                              />
                            )}
                            {isCollapsed ? <ChevronRight size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                            <span>{formatDate(dateKey)}</span>
                          </div>
                          <span className="text-slate-500 font-medium">
                            {groupedCollections[dateKey].length} phiếu • Tổng: {formatCurrency(groupedCollections[dateKey].reduce((sum, pc) => sum + pc.collectedAmount, 0))}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {!isCollapsed && groupedCollections[dateKey].map(pc => (
                      <tr key={pc.id} className="hover:bg-slate-50/50">
                        <td
                          className="px-2 py-3 text-center align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!readonly && pc.status === 'draft' ? (
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300"
                              checked={selectedIds.has(pc.id)}
                              onChange={() => toggleSelectOne(pc.id)}
                            />
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">
                          {pc.customerName}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">
                          {pc.totalPackages != null ? `${pc.totalPackages} kiện` : '--'}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">
                          {pc.pricePerPackage != null && pc.pricePerPackage > 0 ? formatCurrency(pc.pricePerPackage) : '--'}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-medium text-slate-600">
                          {formatCurrency(pc.expectedAmount)}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-medium text-slate-600">
                          {pc.licensePlate || '--'}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-medium text-slate-600">
                          {pc.driverName || '--'}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">
                          {formatTime(pc.collectedAt)}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(pc.status)}
                        </td>
                        {!readonly && (
                          <td className="px-4 py-3 text-right space-x-2">
                            {pc.status === 'draft' && (
                              <>
                                <button onClick={() => handleAction('submit', pc)} className="text-[12px] font-bold text-primary hover:text-primary/80 bg-primary/10 px-3 py-1.5 rounded-md">
                                  Nộp Tiền
                                </button>
                                <button onClick={() => handleAction('self_confirm', pc)} className="text-[12px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 px-3 py-1.5 rounded-md">
                                  Tự XN
                                </button>
                                <button onClick={() => handleAction('edit', pc)} className="text-[12px] font-medium text-slate-500 hover:text-slate-700">Sửa</button>
                              </>
                            )}
                            {pc.status === 'submitted' && (
                              <button onClick={() => { if (confirm('Bạn có chắc muốn hủy nộp phiếu này?')) revert(pc.id); }} className="text-[12px] font-bold text-yellow-600 hover:text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded-md border border-yellow-200">
                                Hủy Nộp
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                )})}
              </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50/60 gap-3">
                  <span className="text-[12px] text-slate-500 font-medium tabular-nums">
                    {totalItems > 0 ? `${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, totalItems)}` : '0'} / Tổng {totalItems}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-white disabled:opacity-20 transition-colors"
                      aria-label="Trang trước"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                      const startPage = totalPages <= 5 ? 1 : Math.min(Math.max(currentPage - 2, 1), totalPages - 4);
                      const pageNum = startPage + i;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setPage(pageNum)}
                          className={clsx(
                            'w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold transition-colors tabular-nums',
                            currentPage === pageNum ? 'bg-primary text-white' : 'text-slate-500 hover:bg-white'
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-white disabled:opacity-20 transition-colors"
                      aria-label="Trang sau"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {isCreateOpen && <CreateEditPaymentDialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} payment={selectedPC || undefined} />}
      {isSubmitOpen && selectedPC && <SubmitPaymentDialog isOpen={isSubmitOpen} onClose={() => setIsSubmitOpen(false)} payment={selectedPC} />}
      {isBulkSubmitOpen && selectedDrafts.length > 0 && (
        <BulkSubmitPaymentDialog
          isOpen={isBulkSubmitOpen}
          onClose={() => setIsBulkSubmitOpen(false)}
          payments={selectedDrafts}
        />
      )}
      {isSelfConfirmOpen && selectedPC && <SelfConfirmDialog isOpen={isSelfConfirmOpen} onClose={() => setIsSelfConfirmOpen(false)} payment={selectedPC} />}
    </div>
  );
};

export default DriverPaymentTab;

