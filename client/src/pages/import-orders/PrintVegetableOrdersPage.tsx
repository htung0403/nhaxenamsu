import React, { useMemo, useState, useRef } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { DatePicker } from '../../components/shared/DatePicker';
import { CreatableSearchableSelect } from '../../components/ui/CreatableSearchableSelect';
import { useImportOrders } from '../../hooks/queries/useImportOrders';
import { useVehicles } from '../../hooks/queries/useVehicles';
import type { DeliveryOrder, DeliveryVehicle, ImportOrder, ImportOrderFilters, Vehicle } from '../../types';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';
import { Image as ImageIcon } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────
const formatNumber = (value?: number | null) => {
  if (value == null) return '';
  return new Intl.NumberFormat('vi-VN').format(value);
};

type ImportOrderWithRelations = ImportOrder & {
  delivery_orders?: DeliveryOrder[];
  profiles?: { full_name?: string; role?: string };
};

const getSupplierName = (order: ImportOrderWithRelations) =>
  order.customers?.name || order.sender_name || '';

const getOrderDriverName = (order: ImportOrderWithRelations) => {
  const names = new Set<string>();
  if (order.delivery_orders) {
    order.delivery_orders.forEach((d: DeliveryOrder) => {
      d.delivery_vehicles?.forEach((dv: DeliveryVehicle) => {
        if (dv.profiles?.full_name) names.add(dv.profiles.full_name);
      });
    });
  }
  if (names.size > 0) return Array.from(names).join(', ');
  if (order.driver_name) return order.driver_name;
  if (order.profiles?.role === 'driver') return order.profiles.full_name || '';
  return '';
};

const getOrderVehiclePlates = (order: ImportOrderWithRelations) => {
  const plates = new Set<string>();
  if (order.license_plate?.trim()) plates.add(order.license_plate.trim());
  order.delivery_orders?.forEach((deliveryOrder) => {
    deliveryOrder.delivery_vehicles?.forEach((deliveryVehicle) => {
      const plate = deliveryVehicle.vehicles?.license_plate?.trim();
      if (plate) plates.add(plate);
    });
  });
  return Array.from(plates);
};

// ─── Constants ────────────────────────────────────────────
const ROWS_PER_A4 = 35; // ~35 data rows fit on one A4 page
const MAX_AMOUNT_PER_SHEET = 4_500_000; // 4.5 triệu

type PrintMode = 'a4' | 'amount';

const VEGETABLE_PRINT_TABLE_STYLE: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
  fontFamily: "'Times New Roman', serif",
  border: '2px solid #000',
};

// ─── Types ────────────────────────────────────────────────
interface FlatItem {
  senderName: string;
  supplierName: string;
  taiRank: number;
  quantity: number;
  productName: string;
  priceK: number;
  totalAmount: number;
  orderId: string;
  supplierNote: string;
}

// ─── Component ────────────────────────────────────────────
const PrintVegetableOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);

  // Controls
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [soXe, setSoXe] = useState('');
  const [printMode, setPrintMode] = useState<PrintMode>('a4');
  const [hideSender, setHideSender] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch data
  const filters: ImportOrderFilters = {
    dateFrom: selectedDate,
    dateTo: selectedDate,
    order_category: 'vegetable',
    pageSize: 9999,
  };

  const { data: ordersResponse, isLoading, isError, refetch } = useImportOrders(filters);
  const orders = useMemo<ImportOrderWithRelations[]>(
    () => ordersResponse?.data ?? [],
    [ordersResponse?.data]
  );

  // Fetch vehicles for Số Xe selector
  const { data: vehicles } = useVehicles();
  const vehicleOptions = useMemo(() => {
    if (!vehicles) return [];
    return vehicles.map((v: Vehicle) => ({
      value: v.license_plate || v.id,
      label: v.license_plate || v.id,
    }));
  }, [vehicles]);

  const dailyTaiRankMap = useMemo(() => {
    const map = new Map<string, number>();
    const byDate = new Map<string, ImportOrderWithRelations[]>();
    (orders || []).forEach((order) => {
      const orderDate = order.order_date || '';
      const current = byDate.get(orderDate) || [];
      current.push(order);
      byDate.set(orderDate, current);
    });
    byDate.forEach((ordersOnDate) => {
      const byDriver = new Map<string, ImportOrderWithRelations[]>();
      ordersOnDate.forEach((order) => {
        const driverName = getOrderDriverName(order) || order.sender_name || '_';
        const current = byDriver.get(driverName) || [];
        current.push(order);
        byDriver.set(driverName, current);
      });

      const driverFirstOrders: { driverName: string; firstOrder: ImportOrderWithRelations }[] = [];
      byDriver.forEach((driverOrders, driverName) => {
        const sorted = [...driverOrders].sort((a, b) => {
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return a.id.localeCompare(b.id);
        });
        driverFirstOrders.push({ driverName, firstOrder: sorted[0] });
      });

      driverFirstOrders.sort((a, b) => {
        const timeA = new Date(a.firstOrder.created_at || 0).getTime();
        const timeB = new Date(b.firstOrder.created_at || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.firstOrder.id.localeCompare(b.firstOrder.id);
      });

      driverFirstOrders.forEach((item, idx) => {
        const driverOrders = byDriver.get(item.driverName) || [];
        driverOrders.forEach((order) => {
          map.set(order.id, idx + 1);
        });
      });
    });
    return map;
  }, [orders]);

  // ─── Flatten & sort ABC ───────────────────────────────
  const flatItems: FlatItem[] = useMemo(() => {
    if (!orders) return [];

    const items: FlatItem[] = [];
    orders.forEach((order) => {
      if (order.deleted_at) return;
      const supplierName = getSupplierName(order);
      const senderName = order.sender_name || '';
      const supplierNote = order.notes || '';
      const taiRank = order.tai_rank ?? dailyTaiRankMap.get(order.id) ?? 1;

      if (order.import_order_items && order.import_order_items.length > 0) {
        order.import_order_items.forEach((item) => {
          const priceK = item.products?.base_price
            ? item.products.base_price / 1000
            : 0;
          const totalAmount =
            typeof item.quantity === 'number' && item.products?.base_price
              ? item.quantity * item.products.base_price
              : 0;

          items.push({
            supplierName,
            senderName,
            taiRank,
            quantity: item.quantity || 0,
            productName: item.products?.name || item.package_type || '',
            priceK,
            totalAmount,
            orderId: order.id,
            supplierNote,
          });
        });
      } else {
        // Order without items — use order-level total
        items.push({
          supplierName,
          senderName,
          taiRank,
          quantity: 0,
          productName: '',
          priceK: 0,
          totalAmount: Number(order.total_amount) || 0,
          orderId: order.id,
          supplierNote,
        });
      }
    });

    // Sort by supplierName, then taiRank, then senderName
    items.sort((a, b) => {
      const cmp = a.supplierName.localeCompare(b.supplierName, 'vi');
      if (cmp !== 0) return cmp;
      if (a.taiRank !== b.taiRank) return a.taiRank - b.taiRank;
      const cmpN = a.supplierNote.localeCompare(b.supplierNote, 'vi');
      if (cmpN !== 0) return cmpN;
      const cmpS = a.senderName.localeCompare(b.senderName, 'vi');
      if (cmpS !== 0) return cmpS;
      return a.productName.localeCompare(b.productName, 'vi');
    });

    const merged: FlatItem[] = [];
    items.forEach((item) => {
      const last = merged[merged.length - 1];
      if (
        last &&
        last.senderName === item.senderName &&
        last.supplierName === item.supplierName &&
        last.taiRank === item.taiRank &&
        last.supplierNote === item.supplierNote &&
        last.productName === item.productName &&
        last.priceK === item.priceK
      ) {
        last.quantity += item.quantity;
        last.totalAmount += item.totalAmount;
      } else {
        merged.push({ ...item });
      }
    });

    return merged;
  }, [orders, dailyTaiRankMap]);

  const taiVehiclePlateMap = useMemo(() => {
    const map = new Map<number, string>();
    orders.forEach((order) => {
      if (order.deleted_at) return;
      const taiRank = order.tai_rank ?? dailyTaiRankMap.get(order.id) ?? 1;
      const plates = getOrderVehiclePlates(order);
      if (plates.length > 0 && !map.has(taiRank)) {
        map.set(taiRank, plates.join(', '));
      }
    });
    return map;
  }, [orders, dailyTaiRankMap]);

  const taiCount = useMemo(() => {
    const ranks = new Set(flatItems.map((item) => item.taiRank));
    return ranks.size;
  }, [flatItems]);

  // ─── Split into sheets ────────────────────────────────
  const sheets: FlatItem[][] = useMemo(() => {
    if (flatItems.length === 0) return [];

    if (printMode === 'a4') {
      // Mode 1: split by row count
      const result: FlatItem[][] = [];
      for (let i = 0; i < flatItems.length; i += ROWS_PER_A4) {
        result.push(flatItems.slice(i, i + ROWS_PER_A4));
      }
      return result;
    } else {
      // Mode 2: split by total amount <= 4.5 million
      const result: FlatItem[][] = [];
      let current: FlatItem[] = [];
      let currentTotal = 0;

      flatItems.forEach((item) => {
        if (current.length > 0 && currentTotal + item.totalAmount > MAX_AMOUNT_PER_SHEET) {
          result.push(current);
          current = [];
          currentTotal = 0;
        }
        current.push(item);
        currentTotal += item.totalAmount;
      });

      if (current.length > 0) {
        result.push(current);
      }

      return result;
    }
  }, [flatItems, printMode]);

  const totalAmount = useMemo(() => flatItems.reduce((s, i) => s + i.totalAmount, 0), [flatItems]);

  // ─── Parse date for display ───────────────────────────
  const dateParts = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    return {
      day: d.getDate(),
      month: d.getMonth() + 1,
      year: d.getFullYear(),
    };
  }, [selectedDate]);

  // ─── Print handler ────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  const exportAsImage = async (index?: number) => {
    if (isExporting) return;
    try {
      setIsExporting(true);
      const toastId = toast.loading(index !== undefined ? `Đang tạo ảnh tờ ${index + 1}...` : 'Đang tạo ảnh các tờ...');

      const exportSheet = async (idx: number) => {
        const element = document.getElementById(`print-sheet-${idx}`);
        if (!element) return;

        const canvas = await html2canvas(element, {
          scale: 2, // 2x quality is sufficient and cleaner
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          onclone: (clonedDoc) => {
            const el = clonedDoc.getElementById(`print-sheet-${idx}`);
            if (el) {
              el.style.boxShadow = 'none';
              el.style.border = 'none';
              el.style.borderRadius = '0';
              el.style.margin = '0';
            }
          }
        });

        const link = document.createElement('a');
        link.download = `Phieu_Rau_${selectedDate}_To_${idx + 1}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
      };

      if (index !== undefined) {
        await exportSheet(index);
      } else {
        for (let i = 0; i < sheets.length; i++) {
          await exportSheet(i);
        }
      }

      toast.success('Xuất ảnh thành công!', { id: toastId });
    } catch (error) {
      console.error('Export image error:', error);
      toast.error('Lỗi khi xuất ảnh');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      {/* ═══ Print Styles ═══ */}
      <style>{`
        @media print {
          /* Hide everything except print area */
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          
          /* Each sheet = one page */
          .print-sheet {
            page-break-after: always;
            page-break-inside: avoid;
          }
          .print-sheet:last-child {
            page-break-after: auto;
          }

          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }

          .print-table {
            font-size: 14px !important;
          }
          .print-table th,
          .print-table td {
            padding: 2px 6px !important;
          }
        }

        @media screen {
          .print-sheet {
            max-width: 210mm;
            min-height: 297mm;
            margin: 0 auto 24px auto;
            padding: 10mm 12mm;
            background: white;
            box-shadow: 0 2px 16px rgba(0,0,0,0.08);
            border: 1px solid #e5e7eb;
            border-radius: 8px;
          }
        }
      `}</style>

      {/* ═══ Control Bar (not printed) ═══ */}
      <div className="no-print animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-[18px] font-black text-foreground">In Phiếu Hàng Rau</h1>
            <p className="text-[12px] text-muted-foreground">Nhà Xe Năm Sự</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border shadow-sm p-4 mb-6 flex flex-wrap items-end gap-4">
          {/* Date picker */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Ngày</label>
            <DatePicker
              value={selectedDate}
              onChange={(val) => setSelectedDate(val)}
              placeholder="Chọn ngày..."
              className="w-[170px]"
            />
          </div>

          {/* Số Xe */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Số Xe</label>
            <CreatableSearchableSelect
              options={vehicleOptions}
              value={soXe}
              onValueChange={(val) => setSoXe(val)}
              onCreate={(val) => setSoXe(val)}
              placeholder="Chọn hoặc nhập số xe..."
              searchPlaceholder="Tìm xe hoặc nhập mới..."
              createMessage="Dùng số xe"
              className="w-[200px]"
            />
          </div>

          {/* Print Mode */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Kiểu in</label>
            <div className="flex rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setPrintMode('a4')}
                className={`px-4 py-2 text-[12px] font-bold transition-colors ${printMode === 'a4'
                    ? 'bg-primary text-white'
                    : 'bg-muted/10 text-muted-foreground hover:bg-muted/30'
                  }`}
              >
                Kiểu 1: Đủ tờ A4
              </button>
              <button
                onClick={() => setPrintMode('amount')}
                className={`px-4 py-2 text-[12px] font-bold transition-colors border-l border-border ${printMode === 'amount'
                    ? 'bg-primary text-white'
                    : 'bg-muted/10 text-muted-foreground hover:bg-muted/30'
                  }`}
              >
                Kiểu 2: Dưới 4.5 triệu/tờ
              </button>
            </div>
          </div>

          {/* Hide Sender Toggle */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Tùy chọn</label>
            <label className="flex items-center gap-2 px-4 py-2 bg-muted/10 border border-border rounded-xl cursor-pointer hover:bg-muted/30 transition-colors">
              <input
                type="checkbox"
                checked={hideSender}
                onChange={(e) => setHideSender(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-[12px] font-bold text-muted-foreground">Bỏ người gửi</span>
            </label>
          </div>

          {/* Print button */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => exportAsImage()}
              disabled={sheets.length === 0 || isExporting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-primary border border-primary text-[13px] font-bold hover:bg-primary/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ImageIcon size={16} />
              Lưu {sheets.length} Ảnh
            </button>
            <button
              onClick={handlePrint}
              disabled={sheets.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer size={16} />
              In ({sheets.length} tờ)
            </button>
          </div>
        </div>

        {/* Stats */}
        {flatItems.length > 0 && (
          <div className="flex items-center gap-4 mb-4 px-1">
            <span className="text-[12px] text-muted-foreground">
              Tổng: <strong className="text-foreground">{flatItems.length}</strong> dòng
            </span>
            <span className="text-[12px] text-muted-foreground">
              Tiền hàng: <strong className="text-foreground font-black">{formatNumber(totalAmount)}</strong>
            </span>
            <span className="text-[12px] text-muted-foreground">
              Sau thuế (8%): <strong className="text-primary font-black">{formatNumber(totalAmount * 1.08)}</strong>
            </span>
            <span className="text-[12px] text-muted-foreground">
              Số tờ: <strong className="text-foreground">{sheets.length}</strong>
            </span>
          </div>
        )}
      </div>

      {/* ═══ Content ═══ */}
      {isLoading ? (
        <div className="no-print p-4">
          <LoadingSkeleton rows={10} columns={6} />
        </div>
      ) : isError ? (
        <div className="no-print">
          <ErrorState onRetry={() => refetch()} />
        </div>
      ) : flatItems.length === 0 ? (
        <div className="no-print">
          <EmptyState
            title="Không có dữ liệu"
            description={`Không có đơn hàng rau nào vào ngày ${dateParts.day}/${dateParts.month}/${dateParts.year}`}
          />
        </div>
      ) : (
        <div className="print-area" ref={printRef}>
          {sheets.map((sheetItems, sheetIndex) => {
            const sheetTotal = sheetItems.reduce((s, i) => s + i.totalAmount, 0);
            const isLastSheet = sheetIndex === sheets.length - 1;
            const showGrandTotal = isLastSheet && sheets.length > 1;
            const sheetVehiclePlate = taiVehiclePlateMap.get(sheetIndex + 1) || soXe;

            return (
              <div key={sheetIndex} className="print-sheet relative group" id={`print-sheet-${sheetIndex}`}>
                {/* Export single image button (hover only) */}
                <button
                  onClick={() => exportAsImage(sheetIndex)}
                  className="no-print absolute top-4 right-4 p-3 bg-white border border-border text-primary rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110 z-10"
                  title="Tải ảnh tờ này"
                >
                  <ImageIcon size={20} />
                </button>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 4, fontFamily: 'serif' }}>
                    Nhà Xe Năm Sự
                  </h2>
                </div>

                {/* Meta row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>Tờ </span>
                    <span style={{ borderBottom: '1px solid #000', display: 'inline-block', minWidth: 30, textAlign: 'center', fontWeight: 700 }}>
                      {sheetIndex + 1}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontWeight: 700 }}>Số Xe: </span>
                    <span style={{ borderBottom: '1px solid #000', display: 'inline-block', minWidth: 60, textAlign: 'center' }}>
                      {sheetVehiclePlate}
                    </span>
                  </div>
                  <div style={{ fontStyle: 'italic' }}>
                    Ngày {dateParts.day} Tháng {dateParts.month} Năm {dateParts.year}
                  </div>
                </div>

                {/* Table */}
                <table
                  className="print-table"
                  style={VEGETABLE_PRINT_TABLE_STYLE}
                >
                  <thead>
                    <tr style={{ borderBottom: '2px solid #000' }}>
                      {!hideSender && (
                        <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 700, border: '1px solid #000', borderLeft: '2px solid #000', fontSize: 14 }}>Người Gửi</th>
                      )}
                      <th style={{
                        padding: '4px 6px',
                        textAlign: 'left',
                        fontWeight: 700,
                        border: '1px solid #000',
                        borderLeft: hideSender ? '2px solid #000' : '1px solid #000',
                        fontSize: 14
                      }}>
                        Tên Vựa
                      </th>
                      <th style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, width: 40, border: '1px solid #000', fontSize: 14 }}>Tài</th>
                      <th style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, width: 45, border: '1px solid #000', fontSize: 14 }}>SL</th>
                      <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 700, border: '1px solid #000', fontSize: 14 }}>Tên Hàng</th>
                      <th style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, width: 60, border: '1px solid #000', fontSize: 14 }}>Tiền(K)</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, width: 100, border: '1px solid #000', fontSize: 14 }}>Thành Tiền</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, width: 100, border: '1px solid #000', borderRight: '2px solid #000', fontSize: 14 }}>Tổng Vựa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const groups: FlatItem[][] = [];
                      let currentGroup: FlatItem[] = [];
                      let currentSupplier = '';
                      sheetItems.forEach((item) => {
                        if (item.supplierName !== currentSupplier) {
                          if (currentGroup.length > 0) groups.push(currentGroup);
                          currentGroup = [];
                          currentSupplier = item.supplierName;
                        }
                        currentGroup.push(item);
                      });
                      if (currentGroup.length > 0) groups.push(currentGroup);

                      const dataRows = sheetItems.length;
                      const tfootRows = (printMode === 'amount' ? 3 : 1) + (showGrandTotal ? 1 : 0);
                      const fillerCount = Math.max(0, ROWS_PER_A4 - dataRows - tfootRows);

                      return (
                        <>
                          {groups.map((group, groupIdx) => {
                            const groupTotal = group.reduce((s, i) => s + i.totalAmount, 0);

                            return group.map((item, idxInGroup) => {
                              const isLastInGroup = idxInGroup === group.length - 1;
                              const rowBorderBottom = isLastInGroup ? '2px solid #000' : '1px solid #ccc';

                              return (
                                <tr key={`${groupIdx}-${idxInGroup}`}>
                                  {!hideSender && (
                                    <td style={{
                                      padding: '4px 6px',
                                      fontWeight: 500,
                                      fontSize: 14,
                                      borderLeft: '2px solid #000',
                                      borderRight: '1px solid #000',
                                      borderBottom: rowBorderBottom,
                                    }}>
                                      {item.senderName}
                                    </td>
                                  )}
                                  <td style={{
                                    padding: '4px 6px',
                                    fontWeight: 500,
                                    fontSize: 14,
                                    borderLeft: hideSender ? '2px solid #000' : 'none',
                                    borderRight: '1px solid #000',
                                    borderBottom: rowBorderBottom,
                                  }}>
                                    {item.supplierName}{item.supplierNote ? ` (${item.supplierNote})` : ''}
                                  </td>
                                  <td style={{
                                    padding: '4px 6px',
                                    textAlign: 'center',
                                    fontSize: 14,
                                    borderRight: '1px solid #000',
                                    borderBottom: rowBorderBottom,
                                  }}>
                                    {item.taiRank}
                                  </td>
                                  <td style={{
                                    padding: '4px 6px',
                                    textAlign: 'center',
                                    fontWeight: 600,
                                    fontSize: 14,
                                    borderRight: '1px solid #000',
                                    borderBottom: rowBorderBottom,
                                  }}>
                                    {item.quantity || ''}
                                  </td>
                                  <td style={{
                                    padding: '4px 6px',
                                    fontSize: 14,
                                    borderRight: '1px solid #000',
                                    borderBottom: rowBorderBottom,
                                  }}>
                                    {item.productName}
                                  </td>
                                  <td style={{
                                    padding: '4px 6px',
                                    textAlign: 'center',
                                    fontSize: 14,
                                    borderRight: '1px solid #000',
                                    borderBottom: rowBorderBottom,
                                  }}>
                                    {item.priceK > 0 ? item.priceK : ''}
                                  </td>
                                  <td style={{
                                    padding: '4px 6px',
                                    textAlign: 'right',
                                    fontWeight: 600,
                                    fontSize: 14,
                                    borderRight: '1px solid #000',
                                    borderBottom: rowBorderBottom,
                                  }}>
                                    {item.totalAmount > 0 ? formatNumber(item.totalAmount) : ''}
                                  </td>
                                  <td style={{
                                    padding: '4px 6px',
                                    textAlign: 'right',
                                    fontWeight: isLastInGroup ? 900 : 400,
                                    fontSize: 14,
                                    borderRight: '2px solid #000',
                                    borderBottom: rowBorderBottom,
                                  }}>
                                    {isLastInGroup ? formatNumber(groupTotal) : ''}
                                  </td>
                                </tr>
                              );
                            });
                          })}
                          {Array.from({ length: fillerCount }).map((_, i) => (
                            <tr key={`filler-${i}`}>
                              {!hideSender && (
                                <td style={{ padding: '4px 6px', fontSize: 14, borderLeft: '2px solid #000', borderRight: '1px solid #000', borderBottom: '1px solid #ccc', height: '22px' }}>&nbsp;</td>
                              )}
                              <td style={{ padding: '4px 6px', fontSize: 14, borderLeft: hideSender ? '2px solid #000' : 'none', borderRight: '1px solid #000', borderBottom: '1px solid #ccc', height: '22px' }}>&nbsp;</td>
                              <td style={{ padding: '4px 6px', fontSize: 14, borderRight: '1px solid #000', borderBottom: '1px solid #ccc', height: '22px' }}>&nbsp;</td>
                              <td style={{ padding: '4px 6px', fontSize: 14, borderRight: '1px solid #000', borderBottom: '1px solid #ccc', height: '22px' }}>&nbsp;</td>
                              <td style={{ padding: '4px 6px', fontSize: 14, borderRight: '1px solid #000', borderBottom: '1px solid #ccc', height: '22px' }}>&nbsp;</td>
                              <td style={{ padding: '4px 6px', fontSize: 14, borderRight: '1px solid #000', borderBottom: '1px solid #ccc', height: '22px' }}>&nbsp;</td>
                              <td style={{ padding: '4px 6px', fontSize: 14, borderRight: '1px solid #000', borderBottom: '1px solid #ccc', height: '22px' }}>&nbsp;</td>
                              <td style={{ padding: '4px 6px', fontSize: 14, borderRight: '2px solid #000', borderBottom: '1px solid #ccc', height: '22px' }}>&nbsp;</td>
                            </tr>
                          ))}
                        </>
                      );
                    })()}
                  </tbody>
                  <tfoot>
                    {printMode === 'amount' && (
                      <>
                        <tr style={{ borderTop: '2px solid #000' }}>
                          <td colSpan={hideSender ? 6 : 7} style={{ padding: '5px 6px', fontWeight: 900, textAlign: 'right', fontSize: 14, borderLeft: '1px solid #000', borderRight: '1px solid #000', borderBottom: '1px solid #ccc' }}>
                            Cộng Tiền Hàng
                          </td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 900, fontSize: 14, borderRight: '1px solid #000', borderBottom: '1px solid #ccc' }}>
                            {formatNumber(sheetTotal)}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={hideSender ? 6 : 7} style={{ padding: '5px 6px', fontWeight: 900, textAlign: 'right', fontSize: 14, borderLeft: '1px solid #000', borderRight: '1px solid #000', borderBottom: '1px solid #ccc' }}>
                            Thuế VAT (8%)
                          </td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 900, fontSize: 14, borderRight: '1px solid #000', borderBottom: '1px solid #ccc' }}>
                            {formatNumber(sheetTotal * 0.08)}
                          </td>
                        </tr>
                      </>
                    )}
                    <tr style={{ borderTop: printMode === 'amount' ? '1px solid #ccc' : '2px solid #000' }}>
                      <td colSpan={hideSender ? 6 : 7} style={{ padding: '5px 6px', fontWeight: 900, textAlign: 'right', fontSize: 14, borderLeft: '1px solid #000', borderRight: '1px solid #000', borderBottom: showGrandTotal ? '1px solid #ccc' : '2px solid #000' }}>
                        Tổng Cộng
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 900, fontSize: 14, borderRight: '1px solid #000', borderBottom: showGrandTotal ? '1px solid #ccc' : '2px solid #000' }}>
                        {printMode === 'amount' ? formatNumber(sheetTotal * 1.08) : formatNumber(sheetTotal)}
                      </td>
                    </tr>
                    {showGrandTotal && (
                      <tr style={{ borderTop: '2px solid #000' }}>
                        <td colSpan={hideSender ? 6 : 7} style={{ padding: '5px 6px', fontWeight: 900, textAlign: 'right', fontSize: 16, borderLeft: '1px solid #000', borderRight: '1px solid #000', borderBottom: '2px solid #000' }}>
                          TỔNG TẤT CẢ CÁC TỜ ({sheets.length} tờ) ({taiCount} tài)
                        </td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 900, fontSize: 16, borderRight: '1px solid #000', borderBottom: '2px solid #000' }}>
                          {printMode === 'amount' ? formatNumber(totalAmount * 1.08) : formatNumber(totalAmount)}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default PrintVegetableOrdersPage;
