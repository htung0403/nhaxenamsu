import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { useAuth } from '../../context/AuthContext';
import { useCustomer, useCustomerByUserId, useVegetableOrdersBySenderAndReceiver } from '../../hooks/queries/useCustomers';

const formatCurrency = (value?: number | null) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('vi-VN');
};

const paymentStatusLabels: Record<string, string> = {
  paid: 'Đã trả',
  partial: 'Trả một phần',
  unpaid: 'Chưa trả',
};

const VegetableSenderCustomerOrdersPage: React.FC = () => {
  const { senderId, receiverKey } = useParams<{ senderId?: string; receiverKey: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAccountModule = !senderId;
  const decodedReceiverKey = receiverKey ? decodeURIComponent(receiverKey) : '';
  const { data: currentCustomer } = useCustomerByUserId(user?.id || '');
  const effectiveSenderId = senderId || currentCustomer?.id;
  const { data: senderFromRoute } = useCustomer(senderId || '');
  const sender = senderId ? senderFromRoute : currentCustomer;
  const { data: orders, isLoading, isError, refetch } = useVegetableOrdersBySenderAndReceiver(effectiveSenderId, decodedReceiverKey);

  const receiverName = orders?.[0]?.customers?.name || orders?.[0]?.receiver_name || decodedReceiverKey;
  const totals = useMemo(() => {
    return (orders || []).reduce(
      (sum, order) => {
        const amount = Number(order.total_amount || 0);
        return {
          revenue: sum.revenue + amount,
          debt: sum.debt + (order.payment_status === 'paid' ? 0 : amount),
        };
      },
      { revenue: 0, debt: 0 }
    );
  }, [orders]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <PageHeader
        title="Đơn của khách nhận"
        description={`${receiverName || 'Khách nhận'}${sender?.name ? ` - người gửi ${sender.name}` : ''}`}
        backPath={isAccountModule ? '/app/tai-khoan/khach-hang' : `/app/ke-toan/khach-hang-rau/${senderId}/khach-hang`}
        actions={
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-[13px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <ArrowLeft size={16} />
            Quay lại
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-3 px-4 md:px-0 mb-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase">Số đơn</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{orders?.length || 0}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase">Doanh thu</p>
          <p className="text-xl font-bold text-emerald-600 tabular-nums">{formatCurrency(totals.revenue)}</p>
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
          <ErrorState message="Không thể tải danh sách đơn của khách nhận." onRetry={() => refetch()} />
        ) : !orders?.length ? (
          <EmptyState icon={<ClipboardList size={48} />} title="Chưa có đơn" description="Không tìm thấy đơn rau nào của người gửi cho khách nhận này." />
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left min-w-[860px]">
              <thead className="bg-muted/30 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight">Mã đơn</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight">Ngày</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight">Khách nhận</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight">SĐT</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-right">Thành tiền</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-tight text-center">Thanh toán</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-[13px] font-bold text-foreground">{order.order_code || '-'}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{formatDate(order.order_date)}</td>
                    <td className="px-4 py-3 text-[13px] font-semibold text-foreground">{order.customers?.name || order.receiver_name || '-'}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{order.customers?.phone || order.receiver_phone || '-'}</td>
                    <td className="px-4 py-3 text-[13px] font-bold text-emerald-600 text-right tabular-nums">{formatCurrency(order.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-[11px] font-semibold border ${order.payment_status === 'paid' ? 'bg-emerald-100/50 text-emerald-700 border-emerald-200' : 'bg-red-100/50 text-red-700 border-red-200'}`}>
                        {paymentStatusLabels[order.payment_status || 'unpaid'] || order.payment_status || 'Chưa rõ'}
                      </span>
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

export default VegetableSenderCustomerOrdersPage;