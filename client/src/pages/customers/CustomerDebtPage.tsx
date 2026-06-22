import React, { useState } from 'react';
import PageHeader from '../../components/shared/PageHeader';
import { useExportOrders } from '../../hooks/queries/useExportOrders';
import { useImportOrders } from '../../hooks/queries/useImportOrders';
import { useCustomers, useUpdateCustomerPayment } from '../../hooks/queries/useCustomers';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { Banknote, Calendar, Info, X, Filter, Store, Truck } from 'lucide-react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import CurrencyInput from '../../components/shared/CurrencyInput';
import { format } from 'date-fns';
import { useEmployees } from '../../hooks/queries/useHR';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import { DatePicker } from '../../components/shared/DatePicker';
import { TimePicker24h } from '../../components/shared/TimePicker24h';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const paymentSchema = z.object({
  amount: z.coerce.number().min(0, 'Số tiền không hợp lệ'),
  payment_date: z.string().nonempty('Vui lòng chọn ngày'),
  payment_time: z.string().nonempty('Vui lòng chọn giờ'),
  receiver_id: z.string().nonempty('Vui lòng chọn người thu'),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

const CustomerDebtPage: React.FC = () => {
  const { data: exportOrders, isLoading: isExportLoading, isError: isExportError, refetch: refetchExport } = useExportOrders();
  const { data: importOrders, isLoading: isImportLoading, isError: isImportError, refetch: refetchImport } = useImportOrders();
  const { data: customers } = useCustomers();
  const { data: employees } = useEmployees();
  
  const updatePayment = useUpdateCustomerPayment();

  const employeeOptions = React.useMemo(() => {
    if (!employees) return [];
    return employees
      .filter(e => e.role === 'staff' || e.role === 'manager' || e.role === 'admin')
      .map(e => ({ value: e.id, label: `${e.full_name} (${e.role === 'staff' ? 'Nhân viên' : 'Quản lý'})` }));
  }, [employees]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [isCollectOpen, setIsCollectOpen] = useState(false);
  const [isCollectClosing, setIsCollectClosing] = useState(false);
  const [currentCustomerDebt, setCurrentCustomerDebt] = useState<number>(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCustomer, setFilterCustomer] = useState<string[]>([]);
  const [filterVehicle, setFilterVehicle] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

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

  const isLoading = isExportLoading || isImportLoading;
  const isError = isExportError || isImportError;

  const refetch = () => { refetchExport(); refetchImport(); };

  // Lọc chỉ những đơn chưa thanh toán
  const unpaidExport = (exportOrders?.data || []).filter((o: any) => o.payment_status !== 'paid').map((o: any) => ({ ...o, _type: 'export' }));
  const unpaidImport = (importOrders?.data || []).filter((o: any) => o.payment_status !== 'paid').map((o: any) => ({ ...o, _type: 'import' }));

  const unpaidOrders = [...unpaidExport, ...unpaidImport];

  const { customerOptions, vehicleOptions } = React.useMemo(() => {
    const cSet = new Set<string>();
    const vSet = new Set<string>();
    
    unpaidOrders.forEach((o: any) => {
      const cName = o.customers?.name || (o._type === 'import' ? o.sender_name : null);
      if (cName) cSet.add(cName);
      
      const vName = o.license_plate;
      if (vName && vName.trim() !== '') vSet.add(vName);
    });
    
    return {
      customerOptions: Array.from(cSet).filter(Boolean).map(c => ({ label: c, value: c })),
      vehicleOptions: Array.from(vSet).filter(Boolean).map(v => ({ label: v, value: v })),
    };
  }, [unpaidOrders]);

  const filteredUnpaidOrders = React.useMemo(() => {
    return unpaidOrders.filter((o: any) => {
      const cName = o.customers?.name || (o._type === 'import' ? o.sender_name : '');
      const vName = o.license_plate || '';
      const pName = o.item_name || 'Nhập hàng / Nhà cung cấp';
      const orderCode = o._type === 'export' ? `#${o.id?.slice(0, 8).toUpperCase()}` : (o.order_code || `#${o.id?.slice(0, 8).toUpperCase()}`);

      if (searchQuery) {
        if (
          !matchesSearch(cName || '', searchQuery) && 
          !matchesSearch(vName || '', searchQuery) && 
          !matchesSearch(pName || '', searchQuery) && 
          !matchesSearch(orderCode || '', searchQuery)
        ) {
          return false;
        }
      }
      if (filterCustomer.length > 0 && cName && !filterCustomer.includes(cName)) return false;
      if (filterVehicle.length > 0 && vName && !filterVehicle.includes(vName)) return false;
      
      const dateStr = o.export_date || o.order_date;
      if (dateStr) {
        if (startDate && dateStr < startDate) return false;
        if (endDate && dateStr > endDate) return false;
      }
      
      return true;
    });
  }, [unpaidOrders, searchQuery, filterCustomer, filterVehicle, startDate, endDate]);

  // Nhóm theo ngày
  const groupedOrders = filteredUnpaidOrders.reduce((acc: Record<string, any[]>, order: any) => {
    const date = order.export_date || order.order_date || 'N/A';
    if (!acc[date]) acc[date] = [];
    acc[date].push(order);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedOrders).sort((a, b) => b.localeCompare(a));

  const totalUncollectedDebt = customers?.reduce((sum, c) => sum + (c.debt > 0 ? c.debt : 0), 0) || 0;
  const numberOfCustomersInDebt = React.useMemo(() => {
    const ids = new Set();
    unpaidOrders.forEach((o: any) => {
      const identifier = o.customers?.id || o.customers?.name || (o._type === 'import' ? o.sender_name : null) || 'Khách vãng lai';
      ids.add(identifier);
    });
    return ids.size;
  }, [unpaidOrders]);

  const handleCollect = (customer: any) => {
    if (!customer || !customer.id) {
      alert("Không tìm thấy thông tin định danh hệ thống của khách hàng này.");
      return;
    }
    
    setSelectedCustomerId(customer.id);
    setSelectedCustomerName(customer.name);
    
    // Lấy công nợ thật từ DB thay vì tự tính
    const globalCustomerInfo = customers?.find(c => c.id === customer.id);
    setCurrentCustomerDebt(globalCustomerInfo?.debt || 0);
    reset({
      amount: 0,
      notes: '',
      payment_date: format(new Date(), "yyyy-MM-dd"),
      payment_time: format(new Date(), "HH:mm"),
      receiver_id: ''
    });
    setIsCollectOpen(true);
  };

  const closeCollectDialog = () => {
    setIsCollectClosing(true);
    setTimeout(() => {
      setIsCollectOpen(false);
      setIsCollectClosing(false);
      setSelectedCustomerId(null);
    }, 350);
  };

  const { handleSubmit, control, reset, formState: { errors } } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema) as any,
    defaultValues: { 
      amount: 0, 
      notes: '', 
      payment_date: format(new Date(), "yyyy-MM-dd"), 
      payment_time: format(new Date(), "HH:mm"), 
      receiver_id: '' 
    },
  });

  const onSubmitPayment = async (data: PaymentFormData) => {
    if (!selectedCustomerId) return;
    try {
      await updatePayment.mutateAsync({
        id: selectedCustomerId,
        payload: { 
          amount: data.amount, 
          payment_date: data.payment_date,
          payment_time: data.payment_time,
          collector_id: data.receiver_id,
          notes: data.notes 
        }
      });
      reset();
      closeCollectDialog();
      refetch();
    } catch {
      // toast in hook
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="hidden md:block">
          <PageHeader
            title="Chi tiết Sổ Cái Bù Trừ Nhập Xuất"
            description="Sổ chi tiết các hóa đơn chưa hoàn tất thanh toán của Xuất/Nhập hàng"
            backPath="/app/ke-toan"
          />
        </div>

        <div className="flex w-full md:w-auto items-center gap-3 flex-shrink-0 mb-1 md:mb-0">
          <div className="flex flex-col flex-1 md:flex-none md:min-w-[120px] bg-card p-2.5 px-4 rounded-2xl border border-border shadow-sm">
             <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-70 mb-1">Số lượng khách</span>
             <span className="text-[16px] font-black text-foreground tabular-nums">
               {numberOfCustomersInDebt} <span className="text-[12px] font-semibold text-muted-foreground">người</span>
             </span>
          </div>

          <div className="flex flex-col flex-1 md:flex-none md:min-w-[140px] bg-card p-2.5 px-4 rounded-2xl border border-red-200 shadow-sm">
             <span className="text-[10px] font-bold text-red-500 uppercase opacity-80 mb-1">Dư nợ hệ thống</span>
             <span className="text-[16px] font-black text-red-600 tabular-nums">
               {formatCurrency(totalUncollectedDebt)}
             </span>
          </div>
        </div>
      </div>

      <div className="bg-card flex flex-row w-full gap-2 items-center rounded-2xl shadow-sm border border-border p-2.5 md:mb-6 mb-3 overflow-x-auto custom-scrollbar">
        {/* SEARCH BAR */}
        <div className="flex-1 min-w-[200px] md:max-w-full">
          <SearchInput
            placeholder="Tìm mã đơn, khách, xe..."
            onSearch={(raw) => setSearchQuery(raw)}
            className="h-[38px]"
          />
        </div>

        {/* DESKTOP ADVANCED FILTERS */}
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
              options={vehicleOptions}
              value={filterVehicle}
              onValueChange={setFilterVehicle}
              placeholder="Theo xe"
              className="bg-transparent"
              icon={<Truck size={15} />}
            />
          </div>
        </div>

        {/* DESKTOP DATE FILTER */}
        <div className="hidden md:block shrink-0">
          <DateRangePicker
            initialDateFrom={startDate}
            initialDateTo={endDate}
            onUpdate={(values) => {
              if (values.range.from) {
                setStartDate(format(values.range.from, 'yyyy-MM-dd'));
              } else {
                setStartDate('');
              }
              if (values.range.to) {
                setEndDate(format(values.range.to, 'yyyy-MM-dd'));
              } else {
                setEndDate('');
              }
            }}
          />
        </div>

        {/* ACTIONS */}
        <div className="flex items-center gap-2 shrink-0">
          {/* MOBILE FILTER BUTTON */}
          <button
            onClick={openFilter}
            className="md:hidden flex items-center justify-center w-[38px] h-[38px] shrink-0 border border-border/80 rounded-xl transition-all bg-muted text-muted-foreground hover:bg-slate-100"
          >
            <Filter size={17} />
          </button>
        </div>
      </div>

      <div className="md:bg-card md:rounded-2xl md:border md:border-border md:shadow-sm flex flex-col flex-1 min-h-0 md:overflow-hidden -mx-4 sm:mx-0">
        {isLoading ? (
          <div className="p-4"><LoadingSkeleton rows={10} columns={6} /></div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : filteredUnpaidOrders.length === 0 ? (
          <EmptyState title="Không tìm thấy đơn nợ" description="Tất cả các khoản dư nợ đã được cấn trừ hoặc không khớp với bộ lọc." />
        ) : (
          <div className="flex-1 md:overflow-auto custom-scrollbar">
            {/* Desktop View */}
            <div className="hidden md:block">
              <table className="w-full border-separate border-spacing-0">
              <thead className="sticky top-0 z-20">
                <tr className="bg-muted/80 backdrop-blur-md border-b border-border">
                  <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-tight text-left min-w-[80px] border-b border-border">Nguồn</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-tight text-left min-w-[120px] border-b border-border">Mã đơn</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-tight text-left border-b border-border">Khách hàng</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-tight text-left min-w-[200px] border-b border-border">Nội dung</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-tight text-right border-b border-border">Giá trị HĐ (chưa bù)</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-tight text-right border-b border-border">Tồn nợ (phải xử lý)</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-tight text-center border-b border-border w-32">Trạng thái</th>
                  <th className="px-4 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-tight text-center border-b border-border w-28">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedDates.map((date) => (
                  <React.Fragment key={date}>
                    <tr className="bg-muted/50">
                      <td colSpan={8} className="px-4 py-2 border-y border-slate-100/10">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-red-500/10 flex items-center justify-center text-red-600">
                            <Calendar size={13} />
                          </div>
                          <span className="text-[12px] font-black text-foreground uppercase tracking-wider">
                            Ngày phát sinh: {date !== 'N/A' ? format(new Date(date), 'dd/MM/yyyy') : 'Chưa định dạng'}
                          </span>
                          <div className="h-[1px] flex-1 bg-border ml-2" />
                        </div>
                      </td>
                    </tr>

                    {groupedOrders[date].map((order) => {
                      const isExport = order._type === 'export';
                      const remaining = (order.debt_amount || 0) - (order.paid_amount || 0);
                      
                      const orderCode = isExport 
                        ? `#${order.id?.slice(0, 8).toUpperCase()}` 
                        : (order.order_code || `#${order.id?.slice(0, 8).toUpperCase()}`);
                      
                      const itemName = isExport ? (order.item_name || 'Xuất hàng') : 'Nhập hàng / Nhà cung cấp';

                      return (
                        <tr key={order.id} className="hover:bg-muted/10 transition-colors group">
                          <td className="px-4 py-3 align-top">
                            {isExport ? (
                               <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-700">Xuất Hàng</span>
                            ) : (
                               <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-100 text-violet-700">Nhập Hàng</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className="text-[13px] font-bold text-primary tabular-nums">{orderCode}</span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-col">
                              <span className="text-[13px] font-bold text-foreground line-clamp-1">{order.customers?.name || 'Vãng lai'}</span>
                              {order.customers?.phone && <span className="text-[11px] text-muted-foreground">{order.customers.phone}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top max-w-[250px]">
                            <span className="text-[13px] font-medium text-slate-600 line-clamp-1">{itemName}</span>
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            <span className="text-[13px] font-medium text-slate-500 tabular-nums">{formatCurrency(order.debt_amount)}</span>
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            <span className={clsx(
                              "text-[14px] font-black tabular-nums whitespace-nowrap",
                              isExport ? "text-red-600" : "text-emerald-600"
                            )}>
                              {isExport ? '+' : '-'}{formatCurrency(remaining)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center align-top">
                            <div className={clsx(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                              order.payment_status === 'partial' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                            )}>
                              {order.payment_status === 'partial' ? 'Dở dang' : 'Chưa thu/trả'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center align-top relative">
                            {order.customers ? (
                              <button
                                onClick={() => handleCollect(order.customers)}
                                className="px-3 py-1.5 w-full bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold rounded-lg transition-all shadow-sm active:scale-95 whitespace-nowrap"
                              >
                                Thu tiền/ Khớp
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden flex flex-col gap-4 px-3 pt-0 pb-20 relative">
              {sortedDates.map((date) => (
                <div key={`mobile-${date}`} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 sticky top-0 bg-muted/95 backdrop-blur-sm p-3 -mx-3 px-5 z-20 border-b border-border/50 shadow-sm">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/10 text-red-600 shrink-0">
                      <Calendar size={14} />
                    </div>
                    <span className="text-[13px] font-black text-foreground uppercase tracking-wider">
                      Ngày phát sinh: {date !== 'N/A' ? format(new Date(date), 'dd/MM/yyyy') : 'Chưa định dạng'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-3 px-1">
                    {groupedOrders[date].map((order) => {
                      const isExport = order._type === 'export';
                      const remaining = (order.debt_amount || 0) - (order.paid_amount || 0);
                      const orderCode = isExport 
                        ? `#${order.id?.slice(0, 8).toUpperCase()}` 
                        : (order.order_code || `#${order.id?.slice(0, 8).toUpperCase()}`);
                      const itemName = isExport ? (order.item_name || 'Xuất hàng') : 'Nhập hàng / CC';

                      return (
                        <div key={`mob-order-${order.id}`} className="bg-card rounded-2xl border border-border shadow-sm p-4 flex flex-col gap-3">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex flex-col gap-1">
                              <span className="text-[15px] font-bold text-foreground leading-tight">
                                {orderCode} {isExport ? (
                                 <span className="inline-block align-middle ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-700">Xuất Hàng</span>
                                ) : (
                                 <span className="inline-block align-middle ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-100 text-violet-700">Nhập Hàng</span>
                                )}
                              </span>
                              <span className="text-[13px] font-medium text-muted-foreground line-clamp-1">{order.customers?.name || 'Khách vãng lai'}</span>
                            </div>
                            <div className={clsx(
                                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase shrink-0",
                                order.payment_status === 'partial' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                              )}
                            >
                              {order.payment_status === 'partial' ? 'Dở dang' : 'Chưa thu/trả'}
                            </div>
                          </div>

                          <div className="flex flex-col bg-muted/5 border border-border rounded-xl p-3 gap-2">
                            <div className="flex justify-between items-center text-[13px] gap-2">
                               <span className="text-muted-foreground line-clamp-1 shrink max-w-[65%]">{itemName}</span>
                               <span className="font-medium text-slate-600 tabular-nums shrink-0">{formatCurrency(order.debt_amount)}</span>
                            </div>
                            <div className="h-[1px] bg-border/50 block w-full"></div>
                            <div className="flex justify-between items-center">
                               <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground/80">Cần thu/chi</span>
                               <span className={clsx(
                                "text-[16px] font-black tabular-nums",
                                isExport ? "text-red-600" : "text-emerald-600"
                              )}>
                                {isExport ? '+' : '-'}{formatCurrency(remaining)}
                              </span>
                            </div>
                          </div>

                          {order.customers && (
                             <div className="pt-1 border-t border-border/10">
                                <button
                                  onClick={() => handleCollect(order.customers)}
                                  className="w-full py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200/50 hover:bg-emerald-500 hover:text-white text-[13px] font-bold rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2"
                                >
                                  Xử lý Nợ (Thu hoặc Khớp)
                                </button>
                             </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isCollectOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex justify-end">
          <div
            className={clsx(
              'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-350 ease-out',
              isCollectClosing ? 'opacity-0' : 'animate-in fade-in duration-300',
            )}
            onClick={closeCollectDialog}
          />
          <div
            className={clsx(
              'relative w-full max-w-[500px] bg-background shadow-2xl flex flex-col md:h-screen h-[100dvh] border-l border-border',
              isCollectClosing ? 'dialog-slide-out' : 'dialog-slide-in',
            )}
          >
            <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                  <Banknote size={20} />
                </div>
                <h2 className="text-lg font-bold text-foreground">Xử lý Nợ hệ thống</h2>
              </div>
              <button onClick={closeCollectDialog} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <form id="pay-form" onSubmit={handleSubmit(onSubmitPayment)} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-5">
                <div>
                  <label className="text-[11px] font-black text-muted-foreground uppercase opacity-60 tracking-wider">Khách hàng</label>
                  <p className="text-[16px] font-black mt-1 text-foreground">{selectedCustomerName}</p>
                </div>

                <div className={clsx(
                    "p-4 rounded-xl border flex items-start gap-3",
                    currentCustomerDebt > 0 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"
                )}>
                  <Info size={16} className={clsx("mt-0.5 shrink-0", currentCustomerDebt > 0 ? "text-red-500" : "text-emerald-500")} />
                  <div>
                    <label className={clsx("text-[11px] font-bold uppercase tracking-wider", currentCustomerDebt > 0 ? "text-red-600/70" : "text-emerald-600/70")}>
                        {currentCustomerDebt > 0 ? "Khách đang nợ (cần thu)" : currentCustomerDebt === 0 ? "Tài khoản sạch (Nợ = 0)" : "Mình đang nợ khách (phải trả / đã bù trừ)"}
                    </label>
                    <p className={clsx("text-[24px] font-black leading-tight tabular-nums", currentCustomerDebt >= 0 ? "text-red-600" : "text-emerald-600")}>
                        {formatCurrency(Math.abs(currentCustomerDebt))}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <label className="text-[13px] font-bold text-foreground flex items-center justify-between">
                    Số tiền khách nộp thêm (VND)
                    <span className="text-red-500 text-[10px] uppercase">* Nhập 0 nếu chỉ cấn trừ</span>
                  </label>
                  <Controller
                    name="amount"
                    control={control}
                    render={({ field }) => (
                      <CurrencyInput
                         value={field.value as number | undefined}
                         onChange={field.onChange}
                         className="w-full px-4 py-4 bg-muted border-2 border-border rounded-xl text-[20px] font-black focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all text-emerald-600 tabular-nums"
                      />
                    )}
                  />
                  {errors.amount && <p className="text-red-500 text-[11px] font-bold mt-1 px-1">{errors.amount.message as string}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-foreground">Ngày thu <span className="text-red-500">*</span></label>
                    <Controller
                      name="payment_date"
                      control={control}
                      render={({ field }) => (
                         <DatePicker
                           value={field.value}
                           onChange={field.onChange}
                           className="w-full h-[46px] bg-muted border-border rounded-xl focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all"
                         />
                      )}
                    />
                    {errors.payment_date && <p className="text-red-500 text-[11px] font-bold mt-1 px-1">{errors.payment_date.message as string}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-foreground">Giờ thu <span className="text-red-500">*</span></label>
                    <Controller
                      name="payment_time"
                      control={control}
                      render={({ field }) => (
                        <TimePicker24h
                          value={field.value}
                          onChange={field.onChange}
                          className="w-full h-[46px] bg-muted border-border rounded-xl focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all"
                        />
                      )}
                    />
                    {errors.payment_time && <p className="text-red-500 text-[11px] font-bold mt-1 px-1">{errors.payment_time.message as string}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-foreground">Người thu hộ <span className="text-red-500">*</span></label>
                  <Controller
                    name="receiver_id"
                    control={control}
                    render={({ field }) => (
                      <SearchableSelect
                        options={employeeOptions}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Chọn người thu..."
                        searchPlaceholder="Tìm người..."
                        emptyMessage="Không tìm thấy nhân viên."
                      />
                    )}
                  />
                  {errors.receiver_id && <p className="text-red-500 text-[11px] font-bold mt-1 px-1">{errors.receiver_id.message as string}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-foreground">Ghi chú (nếu có)</label>
                  <Controller
                    name="notes"
                    control={control}
                    render={({ field }) => (
                      <textarea
                        {...field}
                        rows={3}
                        placeholder="Nội dung khoản thu... (ví dụ: Chuyển khoản Vietcombank)"
                        className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-[14px] focus:outline-none focus:border-primary/50 transition-all resize-none"
                      />
                    )}
                  />
                </div>
              </div>
            </form>

            <div className="bg-card border-t border-border px-6 py-4 flex items-center justify-between shrink-0 gap-3">
              <button
                type="button"
                onClick={closeCollectDialog}
                className="flex-1 py-3 rounded-xl border border-border text-[13px] font-bold hover:bg-muted transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                form="pay-form"
                disabled={updatePayment.isPending}
                className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-black shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:grayscale"
              >
                {updatePayment.isPending ? 'Đang xử lý...' : 'Xử lý'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
        }}
        showClearButton={filterCustomer.length > 0 || filterVehicle.length > 0}
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
