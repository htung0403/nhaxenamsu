import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { clsx } from 'clsx';
import { isDriverLikeRoleKey } from '../../../utils/routePermissions';
import { useConfirmPaymentCollection, usePaymentCollections } from '../../../hooks/queries/usePaymentCollections';
import { useEmployees } from '../../../hooks/queries/useHR';
import { useVehicles } from '../../../hooks/queries/useVehicles';
import { CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { DatePicker } from '../../../components/shared/DatePicker';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import MobileFilterSheet from '../../../components/shared/MobileFilterSheet';
import EmptyState from '../../../components/shared/EmptyState';
import ErrorState from '../../../components/shared/ErrorState';
import ConfirmReceptionDialog from './dialogs/ConfirmReceptionDialog';
import { formatCurrency, formatDate, formatTime } from '../../../utils/formatters';
import { SearchInput } from '../../../components/ui/SearchInput';
import { matchesSearch } from '../../../lib/str-utils';
import type { PaymentCollection } from '../../../types';
import { Filter } from 'lucide-react';

const getLocalDateKey = (value: string | undefined | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

const StaffConfirmationTab: React.FC = () => {
  const { user } = useAuth();
  const isDriver = isDriverLikeRoleKey(user?.role || '');
  
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterDriverId, setFilterDriverId] = useState('');
  const [filterVehicleId, setFilterVehicleId] = useState('');

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
    status: 'submitted',
    dateFrom: filterDate || undefined,
    dateTo: filterDate || undefined,
  });

  const { data: employees } = useEmployees(!isDriver);
  const { data: vehicles } = useVehicles();
  
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [selectedPC, setSelectedPC] = useState<PaymentCollection | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: confirmPayment, isPending: isBulkConfirming } = useConfirmPaymentCollection();

  // Lọc chỉ lấy những phiếu đang ở trạng thái submitted (chờ xác nhận)
  // Trong thực tế có thể lọc thêm c.receiverId === user.id
  const filtered = useMemo(() => {
    let result = collections?.filter(c => c.status === 'submitted') || [];
    if (!filterSearch) return result;

    result = result.filter(c => 
      matchesSearch(c.deliveryOrderCode, filterSearch) ||
      matchesSearch(c.driverName || '', filterSearch) ||
      matchesSearch(c.customerName || '', filterSearch)
    );
    return result;
  }, [collections, filterSearch]);

  const selectedPayments = useMemo(
    () => filtered.filter((pc) => selectedIds.has(pc.id)),
    [filtered, selectedIds]
  );

  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (!el) return;
    const all = filtered.length > 0 && filtered.every((pc) => selectedIds.has(pc.id));
    const some = filtered.some((pc) => selectedIds.has(pc.id));
    el.indeterminate = some && !all;
  }, [filtered, selectedIds]);

  const handleConfirm = (pc: PaymentCollection) => {
    setSelectedPC(pc);
    setIsConfirmOpen(true);
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const toggleHeaderCheckbox = () => {
    const all = filtered.length > 0 && filtered.every((pc) => selectedIds.has(pc.id));
    if (all) clearSelection();
    else setSelectedIds(new Set(filtered.map((pc) => pc.id)));
  };

  const toggleDatePayments = (dateKey: string) => {
    const dateIds = (groupedCollections[dateKey] || []).map((pc) => pc.id);
    if (dateIds.length === 0) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = dateIds.every((id) => next.has(id));
      dateIds.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const handleBulkConfirm = async () => {
    if (selectedPayments.length === 0 || isBulkConfirming) return;
    if (!confirm(`Xác nhận nhận tiền ${selectedPayments.length} phiếu đã chọn?`)) return;

    const confirmedAt = new Date().toISOString();
    await Promise.all(
      selectedPayments.map((pc) =>
        confirmPayment({
          id: pc.id,
          data: { confirmedAt },
        })
      )
    );
    clearSelection();
  };

  const hasActiveFilters = filterDate || filterDriverId || filterVehicleId;

  const groupedCollections = filtered.reduce((acc, pc) => {
    const dateKey = getLocalDateKey(pc.submittedAt);
    if (!dateKey) return acc;
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(pc);
    return acc;
  }, {} as Record<string, PaymentCollection[]>);

  const sortedDates = Object.keys(groupedCollections).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  sortedDates.forEach(date => {
    groupedCollections[date].sort((a, b) => {
      const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return timeB - timeA;
    });
  });

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full md:flex-1">
          <div className="flex-1">
             <SearchInput 
               placeholder="Tìm mã đơn, khách..." 
               onSearch={(raw) => setFilterSearch(raw)} 
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
          <DatePicker value={filterDate} onChange={setFilterDate} placeholder="Chọn ngày..." className="bg-white h-[38px]" />

          {!isDriver && (
            <SearchableSelect
              value={filterDriverId}
              onValueChange={setFilterDriverId}
              placeholder="Tất cả tài xế"
              options={employees?.filter(e => isDriverLikeRoleKey(e.role)).map(e => ({ value: e.id, label: e.full_name })) || []}
              className="bg-white h-[38px] border-slate-200 rounded-lg"
            />
          )}

          <SearchableSelect
            value={filterVehicleId}
            onValueChange={setFilterVehicleId}
            placeholder="Tất cả xe"
            options={vehicles?.map(v => ({ value: v.id, label: v.license_plate })) || []}
            className="bg-white h-[38px] border-slate-200 rounded-lg"
          />
        </div>
      </div>

      {selectedPayments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleBulkConfirm}
            disabled={isBulkConfirming}
            className="px-4 py-2 bg-green-600 text-white text-[13px] font-bold rounded-lg hover:bg-green-700 disabled:opacity-60 flex items-center gap-2 shadow-sm"
          >
            <CheckCircle size={16} />
            Xác nhận đã chọn ({selectedPayments.length})
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={isBulkConfirming}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-60"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={(filters) => {
          setFilterDate(filters.dateFrom);
        }}
        onClear={() => {
          setFilterDate('');
          setFilterDriverId('');
          setFilterVehicleId('');
        }}
        initialDateFrom={filterDate}
        initialDateTo={filterDate}
        dateLabel="Lọc theo ngày nộp"
      >
        {!isDriver && (
          <div className="space-y-1.5">
            <label className="text-[13px] font-bold text-muted-foreground">Tài xế</label>
            <SearchableSelect
              value={filterDriverId}
              onValueChange={setFilterDriverId}
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
            onValueChange={setFilterVehicleId}
            placeholder="Tất cả xe"
            options={vehicles?.map(v => ({ value: v.id, label: v.license_plate })) || []}
            className="bg-muted/20 border-border/40 h-[44px]"
          />
        </div>
      </MobileFilterSheet>

      {/* Lists & Tables */}
      <div className="bg-transparent md:bg-white border-0 md:border border-slate-200 md:rounded-xl md:shadow-sm md:overflow-hidden">
        <div className="min-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-40"><p>Đang tải...</p></div>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState title="Không có phiếu thu nào đang rảnh xác nhận" />
          ) : (
            <>
              {/* Mobile Card Layout */}
              <div className="md:hidden flex flex-col gap-6 pb-6">
                {sortedDates.map(dateKey => {
                  const isCollapsed = collapsedDates[dateKey];
                  const datePayments = groupedCollections[dateKey];
                  const areAllDatePaymentsSelected = datePayments.length > 0 && datePayments.every((pc) => selectedIds.has(pc.id));
                  return (
                  <div key={dateKey} className="space-y-3">
                    <div 
                      className="flex items-center justify-between px-1 cursor-pointer select-none"
                      onClick={() => toggleDate(dateKey)}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300"
                          checked={areAllDatePaymentsSelected}
                          onChange={() => toggleDatePayments(dateKey)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Chọn tất cả phiếu ngày ${formatDate(dateKey)}`}
                        />
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
                        <div key={pc.id} className="bg-white rounded-xl border border-yellow-200/50 p-4 shadow-sm relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-yellow-500" />
                           
                          <div className="flex justify-between items-start mb-3 pl-2">
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                className="mt-0.5 w-4 h-4 rounded border-slate-300"
                                checked={selectedIds.has(pc.id)}
                                onChange={() => toggleSelectOne(pc.id)}
                              />
                              <div>
                              <h3 className="font-bold text-slate-800 text-[14px]">{pc.deliveryOrderCode}</h3>
                              <p className="text-[12px] text-slate-500">{pc.customerName}</p>
                              </div>
                            </div>
                            <span className="bg-yellow-100 text-yellow-700 text-[11px] px-2 py-0.5 rounded font-bold">Chờ XN</span>
                          </div>
      
                          <div className="grid grid-cols-2 gap-2 mb-3 pl-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <div>
                              <p className="text-slate-500 text-[11px]">Tài xế</p>
                              <p className="font-bold text-slate-800 text-[13px]">{pc.driverName || '--'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-slate-500 text-[11px]">Biển số xe</p>
                              <p className="font-bold text-slate-800 text-[13px]">{pc.licensePlate || '--'}</p>
                            </div>
                            <div className="col-span-2 flex justify-between items-center pt-1 border-t border-slate-200/60 mt-1">
                              <p className="text-slate-500 text-[11px]">Tiền Thực Thu</p>
                              <p className="font-bold text-slate-800 text-[13px]">{formatCurrency(pc.collectedAmount)}</p>
                            </div>
                          </div>
      
                          <div className="flex justify-between items-center pt-3 border-t border-slate-100 pl-2">
                             <div className="text-[11px] text-slate-500">
                               {pc.submittedAt ? formatTime(pc.submittedAt) : '-'}
                             </div>
                             <button 
                               onClick={() => handleConfirm(pc)} 
                               className="text-[12px] font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm shadow-green-600/20"
                             >
                               <CheckCircle size={14} /> Xác Nhận
                             </button>
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
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      title="Chọn tất cả phiếu đang chờ xác nhận"
                      checked={filtered.length > 0 && filtered.every((pc) => selectedIds.has(pc.id))}
                      onChange={toggleHeaderCheckbox}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                  </th>
                  <th className="px-4 py-3">Phiếu / Khách Hàng</th>
                  <th className="px-4 py-3">Tài Xế</th>
                  <th className="px-4 py-3">Biển Số Xe</th>
                  <th className="px-4 py-3">Tiền Thực Thu</th>
                  <th className="px-4 py-3">Người Nhận</th>
                  <th className="px-4 py-3">Ngày Nộp</th>
                  <th className="px-4 py-3 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedDates.map(dateKey => {
                  const isCollapsed = collapsedDates[dateKey];
                  const datePayments = groupedCollections[dateKey];
                  const areAllDatePaymentsSelected = datePayments.length > 0 && datePayments.every((pc) => selectedIds.has(pc.id));
                  return (
                  <React.Fragment key={dateKey}>
                    <tr 
                      className="bg-slate-100/50 cursor-pointer select-none hover:bg-slate-200/50 transition-colors"
                      onClick={() => toggleDate(dateKey)}
                    >
                      <td colSpan={8} className="px-4 py-2 text-[13px] font-bold text-slate-700">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300"
                              checked={areAllDatePaymentsSelected}
                              onChange={() => toggleDatePayments(dateKey)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Chọn tất cả phiếu ngày ${formatDate(dateKey)}`}
                            />
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
                        <td className="px-2 py-3 text-center align-middle">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300"
                            checked={selectedIds.has(pc.id)}
                            onChange={() => toggleSelectOne(pc.id)}
                          />
                        </td>
                        <td className="px-4 py-3 text-[13px]">
                          <div className="font-bold text-slate-800">{pc.deliveryOrderCode}</div>
                          <div className="text-slate-500">{pc.customerName}</div>
                        </td>
                        <td className="px-4 py-3 text-[13px] font-medium text-slate-600">
                          {pc.driverName || '--'}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-medium text-slate-600">
                          {pc.licensePlate || '--'}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-bold text-slate-800">
                          {formatCurrency(pc.collectedAmount)}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">
                          {pc.receiverName ? (
                            <span className="font-medium">{pc.receiverName}</span>
                          ) : (
                            <span className="text-slate-400 italic">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">
                          {pc.submittedAt ? (
                            <div className="text-slate-500">{formatTime(pc.submittedAt)}</div>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button 
                            onClick={() => handleConfirm(pc)} 
                            className="text-[12px] font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-md flex items-center gap-1 inline-flex"
                          >
                            <CheckCircle size={14} /> Xác Nhận
                          </button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                )})}
              </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {isConfirmOpen && selectedPC && (
        <ConfirmReceptionDialog isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} payment={selectedPC} />
      )}
    </div>
  );
};

export default StaffConfirmationTab;
