import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import { useDeliveryOrders } from '../../hooks/queries/useDelivery';
import type { DeliveryOrder } from '../../types';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { isSoftDeletedSourceOrder } from '../../utils/softDeletedOrder';
/** Cột xe trên phiếu in (cố định, không in biển số) */
const PRINT_VEHICLE_SLOTS = ['1', '2', '3', '4', '5', '6', '7', '8', 'ba'] as const;

const VEHICLE_PLATE_TO_SLOT: Record<string, string> = {
  '06850': '1',
  '07744': '2',
  '09705': '3',
  '03889': '4',
  '08713': '5',
  '12918': '6',
  '10680': '7',
  '23763': '8',
  'ba1234': 'ba',
};

const PRINT_TABLE_COL_COUNT = 4 + PRINT_VEHICLE_SLOTS.length; // check + name + qty + product + slots

const printColClassForSlot = (slot: (typeof PRINT_VEHICLE_SLOTS)[number]) => {
  if (slot === 'ba') return 'print-col-slot-ba';
  return 'print-col-slot-num';
};

const getVehicleSlot = (licensePlate: string): string | null => {
  const normalized = (licensePlate || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const [key, slot] of Object.entries(VEHICLE_PLATE_TO_SLOT)) {
    if (normalized.endsWith(key) || normalized.includes(key)) {
      return slot;
    }
  }

  if (normalized.includes('ba')) return 'ba';
  return null;
};

const qtyForPrintSlot = (order: DeliveryOrder, col: string) => {
  const matches = (order.delivery_vehicles || []).filter((dv) => {
    const slot = getVehicleSlot(dv.vehicles?.license_plate || '');
    return slot === col;
  });
  return matches.reduce((sum, dv) => sum + (dv.assigned_quantity || 0), 0);
};

const getDisplayProductName = (order: DeliveryOrder) =>
  order.product_name.includes(' - ') ? order.product_name.split(' - ').slice(1).join(' - ') : order.product_name;

const getReceiverDisplayName = (order: DeliveryOrder) => {
  const orderObj = order.import_orders || order.vegetable_orders;
  if (!orderObj) return '-';

  if ('is_return_to_sg' in orderObj && orderObj.is_return_to_sg) return orderObj.receiver_name?.trim() || '-';
  if (order.status === 'hang_o_sg' && orderObj.selected_alias) {
    return orderObj.selected_alias;
  }

  return orderObj.customers?.name || orderObj.receiver_name?.trim() || orderObj.profiles?.full_name || '-';
};

const normalizePrintMergeKeyPart = (value: string | undefined | null) =>
  (value || '').trim().normalize('NFC').toLowerCase();

const mergePrintOrders = (orders: DeliveryOrder[]): DeliveryOrder[] => {
  const mergedByKey = new Map<string, DeliveryOrder>();

  for (const order of orders) {
    const date = order.delivery_date || 'N/A';
    const receiverName = getReceiverDisplayName(order);
    const productName = getDisplayProductName(order);
    const key = [
      order.import_orders?.is_return_to_sg ? 'duc_trong_to_sg' : 'sg_to_duc_trong',
      normalizePrintMergeKeyPart(date),
      normalizePrintMergeKeyPart(receiverName),
      normalizePrintMergeKeyPart(productName),
    ].join('|');

    const existingOrder = mergedByKey.get(key);
    if (!existingOrder) {
      mergedByKey.set(key, {
        ...order,
        delivery_vehicles: [...(order.delivery_vehicles || [])],
      });
      continue;
    }

    existingOrder.id = `${existingOrder.id}-${order.id}`;
    existingOrder.total_quantity += order.total_quantity || 0;
    existingOrder.delivered_quantity += order.delivered_quantity || 0;
    existingOrder.remaining_quantity += order.remaining_quantity || 0;
    existingOrder.delivery_vehicles = [
      ...(existingOrder.delivery_vehicles || []),
      ...(order.delivery_vehicles || []),
    ];
  }

  return Array.from(mergedByKey.values());
};

const ROW_HEIGHT_PX = 32;

const estimateCharWidth = (char: string): number => {
  const code = char.charCodeAt(0);
  if ((code >= 0x00c0 && code <= 0x024f) || (code >= 0x1e00 && code <= 0x1eff)) return 13;
  if (code >= 65 && code <= 90) return 11;
  if (code >= 48 && code <= 57) return 8;
  if ('il1|:;.,!'.includes(char)) return 6;
  return 10;
};

const estimateLines = (text: string, colWidthPx: number): number => {
  if (!text) return 1;
  let lineWidth = 0;
  let lines = 1;
  for (const char of text) {
    const w = estimateCharWidth(char);
    if (lineWidth + w > colWidthPx) { lines++; lineWidth = w; }
    else lineWidth += w;
  }
  return lines;
};

const estimateRowSlots = (customerName: string, productName: string): number => {
  const cn = (customerName || '').normalize('NFC');
  const pn = (productName || '').normalize('NFC');
  return Math.max(estimateLines(cn, 190), estimateLines(pn, 103));
};

const PAGE_SLOTS = 28;

const paginateOrders = (orders: DeliveryOrder[]): DeliveryOrder[][] => {
  const pages: DeliveryOrder[][] = [];
  let currentPage: DeliveryOrder[] = [];
  let usedSlots = 0;
  for (const order of orders) {
    const slots = estimateRowSlots(getReceiverDisplayName(order), getDisplayProductName(order));
    if (usedSlots + slots > PAGE_SLOTS) {
      pages.push(currentPage);
      currentPage = [order];
      usedSlots = slots;
    } else {
      currentPage.push(order);
      usedSlots += slots;
    }
  }
  if (currentPage.length > 0) pages.push(currentPage);
  return pages;
};


const PrintDeliveryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const direction = searchParams.get('direction') === 'duc_trong_to_sg' ? 'duc_trong_to_sg' : 'sg_to_duc_trong';
  const initialDateFrom = searchParams.get('dateFrom') || format(new Date(), 'yyyy-MM-dd');
  const initialDateTo = searchParams.get('dateTo') || format(new Date(), 'yyyy-MM-dd');

  const [startDate, setStartDate] = useState<string>(initialDateFrom);
  const [endDate, setEndDate] = useState<string>(initialDateTo);

  const { data: ordersRaw, isLoading, isError, refetch } = useDeliveryOrders(startDate, endDate, 'standard', direction);

  const orders = React.useMemo(() => {
    return mergePrintOrders((ordersRaw || []).filter((o) => !isSoftDeletedSourceOrder(o)));
  }, [ordersRaw]);

  const filteredOrders = [...(orders || [])].sort((a, b) =>
    getReceiverDisplayName(a).localeCompare(getReceiverDisplayName(b), 'vi')
  );

  const groupedOrders = (filteredOrders || []).reduce<Record<string, DeliveryOrder[]>>((acc, order) => {
    const date = order.delivery_date || 'N/A';
    if (!acc[date]) acc[date] = [];
    acc[date].push(order);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedOrders).sort((a, b) => b.localeCompare(a)); // Newest first

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col w-full">
      <style>{`
        /* check 4%, Tên khách 24%, SL 5%, Hàng 13%, cột 1–8 mỗi cột 6% (48%), ba 6% */
        .print-area .print-table {
          table-layout: fixed;
          width: 100%;
          border-collapse: collapse;
          font-family: "Times New Roman", Times, serif;
        }
        .print-area .print-table col.print-col-check { width: 4%; }
        .print-area .print-table col.print-col-name { width: 24%; }
        .print-area .print-table col.print-col-qty { width: 5%; }
        .print-area .print-table col.print-col-product { width: 13%; }
        .print-area .print-table col.print-col-slot-num { width: 6%; }
        .print-area .print-table col.print-col-slot-ba { width: 6%; }
        .print-area .print-table .col-check { width: 4%; }
        .print-area .print-table .col-name { width: 24%; }
        .print-area .print-table .col-qty { width: 5%; }
        .print-area .print-table .col-product { width: 13%; }
        .print-area .print-table .col-slot-num,
        .print-area .print-table .col-slot-num-head { width: 6%; }
        .print-area .print-table .col-slot-ba,
        .print-area .print-table .col-slot-ba-head { width: 6%; }
        .print-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          width: 100%;
          padding-bottom: 5px;
        }

        @page {
          size: A4 portrait;
          margin: 12mm 8mm 10mm 8mm;
        }

        @media print {
          html, body { background-color: white !important; }
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            display: block !important;
          }
          .no-print { display: none !important; }

          .print-section { page-break-before: always; }
          .print-section:first-child { page-break-before: auto; }

          .print-section:last-child { min-height: calc(297mm - 22mm); }
          .print-section:last-child .print-table { height: 100%; }
          .print-section:last-child .print-table tbody { height: 100%; }

          .print-table tr.empty-fill-row td {
            border: 1px solid #000 !important;
            padding: 0 !important;
            height: 28px;
          }
          .print-area .print-table tbody tr {
            height: 28px;
          }

          .page-number-auto::after {
            counter-increment: page;
            content: "Tờ: " counter(page);
            position: fixed;
            top: 0;
            right: 0;
            font-size: 18px;
            font-weight: bold;
            visibility: visible !important;
          }

          .print-area .print-table {
            font-size: 18px;
            page-break-inside: auto;
          }
          .print-area .print-table thead { display: table-header-group; }
          .print-area .print-table tr { page-break-inside: avoid; page-break-after: auto; }

          .print-area .print-table th, .print-area .print-table td {
            border: 1px solid #000 !important;
            padding: 3px 4px !important;
            overflow: hidden;
            word-break: break-word;
          }
          .print-area .print-table th { font-weight: bold; text-align: center; background-color: transparent !important; }
          .print-area .print-table .col-name,
          .print-area .print-table .col-product { padding: 3px 5px !important; }
          .print-area .print-table .col-qty,
          .print-area .print-table td.col-qty-cell {
            padding: 3px 2px !important;
            text-align: center !important;
            vertical-align: middle;
          }
          .print-area .print-table .col-slot-num,
          .print-area .print-table .col-slot-ba,
          .print-area .print-table .col-slot-num-head,
          .print-area .print-table .col-slot-ba-head {
            font-size: 18px !important;
            padding: 1px 0 !important;
            line-height: 1.1;
            white-space: nowrap;
            letter-spacing: -0.02em;
          }
          .print-area .print-table .col-slot-num-head,
          .print-area .print-table .col-slot-ba-head { font-weight: bold; }
          .print-area .print-table .col-check-cell {
            text-align: center !important;
            font-size: 16px !important;
            padding: 2px 0 !important;
          }
          .print-area .print-table tr.print-header-repeat th {
            border: none !important;
            background: transparent !important;
            padding: 0 0 10px 0 !important;
            vertical-align: bottom;
            text-align: center;
          }
          .print-sheet-date {
            font-size: 18px !important;
            font-weight: bold;
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }

        @media screen {
          .print-sheet {
            max-width: 210mm;
            margin: 0 auto 24px auto;
            padding: 8mm 10mm;
            background: white;
            box-shadow: 0 2px 16px rgba(0,0,0,0.08);
            border: 1px solid #e5e7eb;
            border-radius: 8px;
          }
          .print-area .print-table {
            font-size: 18px;
          }
          .print-area .print-table .col-slot-num,
          .print-area .print-table .col-slot-ba,
          .print-area .print-table .col-slot-num-head,
          .print-area .print-table .col-slot-ba-head {
            font-size: 18px;
            padding: 3px 2px !important;
            white-space: nowrap;
          }
          .page-number-auto::after {
            content: "Số tờ sẽ tự động hiển thị khi in";
            display: block;
            text-align: right;
            font-size: 12px;
            color: #6b7280;
            margin-bottom: 8px;
          }
        }
        
        .print-table { width: 100%; border-collapse: collapse; font-family: "Times New Roman", Times, serif; font-size: 18px; }
        .print-table th, .print-table td { border: 1px solid #000 !important; padding: 2px 4px !important; }
        .print-table th { font-weight: bold; text-align: center; }
        .print-table tbody tr { height: 28px; min-height: 28px; }
        .print-table tr.empty-fill-row td { height: 28px; min-height: 28px; line-height: 28px; padding: 0 !important; border: 1px solid #000 !important; }
      `}</style>

      <div className="no-print animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex flex-col mb-6">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-[18px] font-black text-foreground">In Phiếu Giao Hàng</h1>
            <p className="text-[12px] text-muted-foreground">{direction === 'duc_trong_to_sg' ? 'Hàng tạp hóa · Đức Trọng → SG' : 'Hàng tạp hóa · SG → Đức Trọng'}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border shadow-sm p-4 mb-6 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Thời gian giao</label>
            <DateRangePicker
              initialDateFrom={startDate}
              initialDateTo={endDate}
              onUpdate={(values) => {
                if (values.range.from) setStartDate(format(values.range.from, 'yyyy-MM-dd'));
                else setStartDate('');
                if (values.range.to) setEndDate(format(values.range.to, 'yyyy-MM-dd'));
                else setEndDate('');
              }}
            />
          </div>

          <button
            onClick={handlePrint}
            disabled={filteredOrders.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
          >
            <Printer size={16} />
            In ({filteredOrders.length} dòng)
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="no-print p-4">
          <LoadingSkeleton rows={10} columns={6} />
        </div>
      ) : isError ? (
        <div className="no-print">
          <ErrorState onRetry={() => refetch()} />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="no-print">
          <EmptyState
            title="Không có dữ liệu"
            description="Không có đơn giao hàng tạp hóa trong khoảng thời gian này"
          />
        </div>
      ) : (
        <div className="print-area">
          {sortedDates.flatMap((date) => {
            const dateOrders = groupedOrders[date];
            const pages = paginateOrders(dateOrders);
            return pages.map((pageOrders, pageIdx) => {
              const usedSlots = pageOrders.reduce(
                (sum, o) => sum + estimateRowSlots(getReceiverDisplayName(o), getDisplayProductName(o)), 0
              );
              const emptyCount = PAGE_SLOTS - usedSlots;
              return (
                <div key={`${date}-p${pageIdx}`} className="print-section print-sheet">
                  <table className="print-table">
                    <colgroup>
                      <col className="print-col-check" />
                      <col className="print-col-name" />
                      <col className="print-col-qty" />
                      <col className="print-col-product" />
                      {PRINT_VEHICLE_SLOTS.map((c) => (
                        <col key={c} className={printColClassForSlot(c)} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="print-header-repeat">
                        <th colSpan={PRINT_TABLE_COL_COUNT} className="text-left !p-0">
                          <div className="print-header-bar flex justify-between items-end w-full">
                            <div className="print-header-date print-sheet-date text-[18px] font-bold text-left">
                              Ngày giao: {new Date(date).toLocaleDateString('vi-VN')}
                            </div>
                            <div className="print-sheet-date text-[18px] font-bold text-right" style={{ paddingRight: '20px' }}>
                              Tờ:
                            </div>
                          </div>
                        </th>
                      </tr>
                      <tr>
                        <th className="col-check border border-black align-middle text-center"></th>
                        <th className="col-name text-left border border-black align-middle">Tên Khách</th>
                        <th className="col-qty border border-black align-middle text-center">SL</th>
                        <th className="col-product text-left border border-black align-middle">Hàng</th>
                        {PRINT_VEHICLE_SLOTS.map((col) => {
                          const headCls = col === 'ba' ? 'col-slot-ba-head' : 'col-slot-num-head';
                          return (
                            <th key={col} className={`${headCls} text-center border border-black`}>
                              {col}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {pageOrders.map(o => {
                        const assignedTotal = (o.delivery_vehicles || []).reduce(
                          (sum, dv) => sum + (dv.assigned_quantity || 0), 0
                        );
                        const isFullyDelivered = assignedTotal > 0 && assignedTotal >= o.total_quantity;
                        return (
                          <tr key={o.id}>
                            <td className="col-check-cell text-center border border-black">
                              {isFullyDelivered ? '✓' : ''}
                            </td>
                            <td className="text-left font-medium border border-black">{getReceiverDisplayName(o)}</td>
                            <td className="col-qty-cell text-center font-bold border border-black tabular-nums">{o.total_quantity || ''}</td>
                            <td className="text-left border border-black">{getDisplayProductName(o)}</td>
                            {PRINT_VEHICLE_SLOTS.map((col) => {
                              const qty = qtyForPrintSlot(o, col);
                              const cellCls = col === 'ba' ? 'col-slot-ba' : 'col-slot-num';
                              return (
                                <td
                                  key={col}
                                  className={`${cellCls} text-center font-bold border border-black tabular-nums`}
                                  style={{ color: '#dc2626' }}
                                >
                                  {qty > 0 ? qty : ''}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {Array.from({ length: emptyCount }).map((_, i) => (
                        <tr key={`empty-${i}`} className="empty-fill-row">
                          {Array.from({ length: PRINT_TABLE_COL_COUNT }).map((_, j) => (
                            <td key={j} style={{ height: `${ROW_HEIGHT_PX}px`, lineHeight: `${ROW_HEIGHT_PX}px`, border: '1px solid #000', padding: 0 }}>&nbsp;</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            });
          })}
        </div>
      )}
    </div>
  );
};

export default PrintDeliveryPage;
