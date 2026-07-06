import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Users } from 'lucide-react';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { SearchInput } from '../../components/ui/SearchInput';
import { useCustomer, useCustomerByUserId, useVegetableReceiverCustomersBySender } from '../../hooks/queries/useCustomers';
import { useAuth } from '../../context/AuthContext';
import { matchesSearch } from '../../lib/str-utils';

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const VegetableSenderCustomersPage: React.FC = () => {
  const { senderId } = useParams<{ senderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAccountModule = !senderId;
  const { data: currentCustomer } = useCustomerByUserId(user?.id || '');
  const effectiveSenderId = senderId || currentCustomer?.id;
  const { data: senderFromRoute } = useCustomer(senderId || '');
  const sender = senderId ? senderFromRoute : currentCustomer;
  const { data: customers, isLoading, isError, refetch } = useVegetableReceiverCustomersBySender(effectiveSenderId);
  const [searchTerm, setSearchTerm] = useState('');

  const openReceiverOrders = (receiverKey: string) => {
    navigate(`${encodeURIComponent(receiverKey)}/don-hang`);
  };

  const filteredCustomers = useMemo(() => {
    return (customers || []).filter((customer) => matchesSearch([customer.name, customer.phone, customer.address].filter(Boolean).join(' '), searchTerm));
  }, [customers, searchTerm]);

  const totals = useMemo(() => {
    return filteredCustomers.reduce(
      (sum, customer) => ({
        orders: sum.orders + (customer.total_orders || 0),
        revenue: sum.revenue + (customer.total_revenue || 0),
        debt: sum.debt + (customer.debt || 0),
      }),
      { orders: 0, revenue: 0, debt: 0 }
    );
  }, [filteredCustomers]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <PageHeader
        title="Khách hàng của người gửi rau"
        description={sender?.name ? `Danh sách vựa/khách nhận phát sinh từ đơn rau của ${sender.name}.` : 'Danh sách vựa/khách nhận phát sinh từ đơn rau của người gửi này.'}
        backPath={isAccountModule ? "/app/tai-khoan" : "/app/ke-toan/khach-hang-rau"}
        actions={
          <div className="flex items-center gap-3">
            <SearchInput placeholder="Tìm tên, SĐT, địa chỉ..." onSearch={setSearchTerm} className="w-72" />
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-[13px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <ArrowLeft size={16} />
              Quay lại
            </button>
          </div>
        }
      />

      <div className="md:hidden px-4 mb-3">
        <SearchInput placeholder="Tìm tên, SĐT, địa chỉ..." onSearch={setSearchTerm} />
      </div>

      <div className="grid grid-cols-3 gap-3 px-4 md:px-0 mb-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase">Khách nhận</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{filteredCustomers.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase">Số đơn</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{totals.orders}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase">Công nợ</p>
          <p className="text-xl font-bold text-red-600 tabular-nums">{formatCurrency(totals.debt)}</p>
        </div>
      </div>

      <div className="bg-card rounded-3xl shadow-sm border border-border/50 overflow-hidden flex-1 min-h-0 flex flex-col">
        {isLoading ? (
          <div className="p-8"><LoadingSkeleton /></div>
        ) : isError ? (
          <ErrorState message="Không thể tải danh sách khách hàng của người gửi rau." onRetry={() => refetch()} />
        ) : filteredCustomers.length === 0 ? (
          <EmptyState icon={<Users size={48} />} title="Chưa có khách hàng" description="Người gửi rau này chưa có vựa/khách nhận nào trong đơn rau." />
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left min-w-[760px]">
              <thead className="bg-muted/30 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight">Tên khách nhận</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight">SĐT</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight">Địa chỉ</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Số đơn</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Doanh thu</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Công nợ</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center">Đơn hàng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => openReceiverOrders(customer.id)}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-[13px] font-bold text-foreground">{customer.name}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{customer.phone || '-'}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground truncate max-w-72" title={customer.address || ''}>{customer.address || '-'}</td>
                    <td className="px-4 py-3 text-[13px] font-bold text-foreground text-right tabular-nums">{customer.total_orders}</td>
                    <td className="px-4 py-3 text-[13px] font-bold text-emerald-600 text-right tabular-nums">{formatCurrency(customer.total_revenue)}</td>
                    <td className="px-4 py-3 text-[13px] font-bold text-red-600 text-right tabular-nums">{formatCurrency(customer.debt)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openReceiverOrders(customer.id);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-[12px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                      >
                        <ClipboardList size={13} />
                        Xem đơn
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default VegetableSenderCustomersPage;