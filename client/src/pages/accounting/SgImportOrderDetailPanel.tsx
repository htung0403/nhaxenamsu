import React from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { X, Package } from 'lucide-react';
import type { ImportOrder, ImportOrderItem } from '../../types';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import { cloudinaryThumb } from '../../lib/cloudinaryUrl';

const formatCurrency = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value));
};

const paymentLabel = (s?: string | null) => {
  if (s === 'paid') return 'Đã trả';
  if (s === 'unpaid') return 'Chưa trả';
  if (s === 'partial') return 'Một phần';
  return s || '—';
};

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sm:grid sm:grid-cols-[minmax(0,140px)_1fr] sm:gap-x-3 gap-y-0.5 text-[13px] py-2.5 border-b border-border/60 last:border-0">
      <span className="text-muted-foreground font-semibold shrink-0">{label}</span>
      <div className="text-foreground min-w-0 break-words">{children}</div>
    </div>
  );
}

function lineAmount(item: ImportOrderItem): number | null {
  if (item.total_amount != null && !Number.isNaN(Number(item.total_amount))) return Number(item.total_amount);
  const q = Number(item.quantity) || 0;
  const p = Number(item.unit_price);
  if (!q || p == null || Number.isNaN(p)) return null;
  return q * p;
}

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  onClose: () => void;
  order: ImportOrder | null;
  isLoading: boolean;
}

const SgImportOrderDetailPanel: React.FC<Props> = ({ isOpen, isClosing, onClose, order, isLoading }) => {
  if (!isOpen && !isClosing) return null;

  const items = order?.import_order_items ?? [];
  const receiptUrls = [
    ...(order?.receipt_image_urls || []),
    ...(order?.receipt_image_url ? [order.receipt_image_url] : []),
  ].filter(Boolean) as string[];
  const uniqueReceipts = [...new Set(receiptUrls)];

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4">
      <button
        type="button"
        aria-label="Đóng"
        className={clsx(
          'absolute inset-0 bg-black/45 transition-opacity duration-300',
          isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'
        )}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sg-import-detail-title"
        className={clsx(
          'relative bg-card border border-border shadow-2xl flex flex-col w-full sm:max-w-2xl sm:rounded-2xl max-h-[92vh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-b-2xl transition-all duration-300',
          isClosing ? 'translate-y-full sm:translate-y-0 sm:scale-95 opacity-0' : 'translate-y-0 opacity-100 animate-in slide-in-from-bottom-4 sm:zoom-in-95'
        )}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 id="sg-import-detail-title" className="text-[16px] font-bold text-foreground leading-tight">
              Chi tiết phiếu nhập
            </h2>
            {order ? (
              <p className="text-[13px] text-muted-foreground mt-0.5 font-mono tabular-nums">{order.order_code}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-muted/60 text-muted-foreground hover:bg-muted transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar px-4 py-3 flex-1 min-h-0">
          {isLoading ? (
            <LoadingSkeleton className="h-48" />
          ) : !order ? (
            <p className="text-[13px] text-muted-foreground">Không có dữ liệu.</p>
          ) : (
            <>
              <section className="mb-4">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Thông tin phiếu</h3>
                <div className="rounded-xl border border-border/80 bg-muted/20 px-3">
                  <DetailBlock label="Ngày / giờ">
                    {order.order_date} {order.order_time}
                  </DetailBlock>
                  <DetailBlock label="Người gửi">
                    {order.sender_customers?.name || order.sender_name || '—'}
                    {order.sender_customers?.phone ? (
                      <span className="block text-[12px] text-muted-foreground">{order.sender_customers.phone}</span>
                    ) : null}
                  </DetailBlock>
                  <DetailBlock label="Người nhận (ghi trên phiếu)">
                    {order.receiver_name || '—'}
                    {order.receiver_phone ? (
                      <span className="block text-[12px] text-muted-foreground">{order.receiver_phone}</span>
                    ) : null}
                  </DetailBlock>
                  <DetailBlock label="Khách / chủ hàng">
                    {order.customers?.name || '—'}
                    {order.customers?.phone ? (
                      <span className="block text-[12px] text-muted-foreground">{order.customers.phone}</span>
                    ) : null}
                    {order.customers?.address ? (
                      <span className="block text-[12px] text-muted-foreground">{order.customers.address}</span>
                    ) : null}
                  </DetailBlock>
                  <DetailBlock label="Kho">{order.warehouses?.name || '—'}</DetailBlock>
                  <DetailBlock label="Xe / tài xế">
                    {[order.license_plate, order.driver_name].filter(Boolean).join(' · ') || '—'}
                  </DetailBlock>
                  <DetailBlock label="NV thu tiền">{order.profiles?.full_name || '—'}</DetailBlock>
                  <DetailBlock label="Thanh toán">{paymentLabel(order.payment_status)}</DetailBlock>
                  <DetailBlock label="Tổng tiền">
                    <span className="font-bold text-primary tabular-nums">{formatCurrency(order.total_amount)}</span>
                  </DetailBlock>
                  {order.notes ? (
                    <DetailBlock label="Ghi chú">{order.notes}</DetailBlock>
                  ) : null}
                </div>
              </section>

              {uniqueReceipts.length > 0 ? (
                <section className="mb-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Ảnh biên lai</h3>
                  <div className="flex flex-wrap gap-2">
                    {uniqueReceipts.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg border border-border overflow-hidden w-24 h-24 bg-muted shrink-0 hover:opacity-90"
                      >
                        <img loading="lazy" decoding="async" src={cloudinaryThumb(url)} alt="" className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Package size={14} />
                  Hàng nhập
                </h3>
                {items.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Không có dòng hàng.</p>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="hidden sm:grid grid-cols-[1fr_72px_88px_100px_100px] gap-2 px-3 py-2 bg-muted/50 text-[10px] font-bold uppercase text-muted-foreground">
                      <span>Tên hàng</span>
                      <span className="text-center">SL</span>
                      <span className="text-right">Đơn giá</span>
                      <span className="text-right">Thành tiền</span>
                      <span>Đóng gói</span>
                    </div>
                    <ul className="divide-y divide-border/80">
                      {items.map((item) => {
                        const name = item.products?.name || '—';
                        const pkg = item.package_type || '—';
                        const line = lineAmount(item);
                        return (
                          <li key={item.id} className="px-3 py-3 sm:py-2">
                            <div className="sm:grid sm:grid-cols-[1fr_72px_88px_100px_100px] sm:gap-2 sm:items-center text-[13px]">
                              <span className="font-medium">{name}</span>
                              <span className="sm:text-center tabular-nums text-muted-foreground sm:text-foreground mt-1 sm:mt-0">
                                <span className="sm:hidden text-[11px] mr-1">SL:</span>
                                {item.quantity}
                                {item.weight_kg != null ? (
                                  <span className="block text-[11px] text-muted-foreground">{item.weight_kg} kg</span>
                                ) : null}
                              </span>
                              <span className="tabular-nums text-right mt-1 sm:mt-0">
                                <span className="sm:hidden text-[11px] text-muted-foreground mr-1">Đơn giá:</span>
                                {formatCurrency(item.unit_price)}
                              </span>
                              <span className="tabular-nums text-right font-semibold text-primary mt-1 sm:mt-0">
                                <span className="sm:hidden text-[11px] text-muted-foreground mr-1">Thành tiền:</span>
                                {formatCurrency(line)}
                              </span>
                              <span className="text-[12px] text-muted-foreground mt-1 sm:mt-0">{pkg}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SgImportOrderDetailPanel;
