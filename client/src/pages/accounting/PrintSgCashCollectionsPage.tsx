import React, { useLayoutEffect, useMemo, useState, useRef } from 'react';
import { Printer, ArrowLeft, CalendarDays, Store, User, Truck } from 'lucide-react';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import { MultiSearchableSelect } from '../../components/ui/MultiSearchableSelect';
import { useSgImportCashList } from '../../hooks/queries/useSgImportCash';
import { useCustomers } from '../../hooks/queries/useCustomers';
import { useVehicles } from '../../hooks/queries/useVehicles';
import { useEmployees } from '../../hooks/queries/useHR';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, subMonths } from 'date-fns';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';

const formatNumber = (value?: number | null) => {
  if (value == null) return '';
  return new Intl.NumberFormat('vi-VN').format(value);
};

const formatOnlyDate = (yyyyMmDd: string) => {
  if (!yyyyMmDd) return '';
  const [y, m, d] = yyyyMmDd.split('-');
  return `${d}/${m}/${y}`;
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

const PrintSgCashCollectionsPage: React.FC = () => {
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);

  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const isUnconfirmed = statusParam === 'unconfirmed';

  const [dateFrom, setDateFrom] = useState(format(subMonths(new Date(), 3), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCustomer, setFilterCustomer] = useState<string[]>([]);
  const [filterDriver, setFilterDriver] = useState<string[]>([]);
  const [filterVehicle, setFilterVehicle] = useState<string[]>([]);

  const { data: customers } = useCustomers(undefined, true);
  const { data: vehicles } = useVehicles(true);
  const { data: employees } = useEmployees(true);

  const { data: allRowsRaw, isLoading, isError, refetch } = useSgImportCashList({ from: dateFrom, to: dateTo });

  const rows = useMemo(() => (Array.isArray(allRowsRaw) ? (allRowsRaw as SgRow[]) : []), [allRowsRaw]);

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
    let result = rows;

    if (isUnconfirmed) {
      result = result.filter((r) => !r.sg_cash_handover_confirmed_at);
    } else if (statusParam === 'confirmed') {
      result = result.filter((r) => !!r.sg_cash_handover_confirmed_at);
    }

    return result.filter((row) => {
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
  }, [rows, isUnconfirmed, statusParam, filterCustomer, filterDriver, filterVehicle, searchQuery]);

  const [pagination, setPagination] = useState<{ rows: SgRow[]; sizes: number[] } | null>(null);

  const printPages = useMemo(() => {
    const sizes = pagination?.rows === filteredRows ? pagination.sizes : [];
    const pages: { rows: SgRow[]; startIndex: number; totalAmount: number }[] = [];
    let startIndex = 0;

    while (startIndex < filteredRows.length) {
      const pageRows = filteredRows.slice(startIndex, startIndex + (sizes[pages.length] || 15));
      pages.push({
        rows: pageRows,
        startIndex,
        totalAmount: pageRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
      });
      startIndex += pageRows.length;
    }

    return pages;
  }, [filteredRows, pagination]);

  useLayoutEffect(() => {
    const container = printRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      const sheets = container.querySelectorAll<HTMLElement>('.print-sheet');
      const firstSheet = sheets?.[0];
      if (!firstSheet) return;

      const rowHeights = Array.from(container.querySelectorAll('tbody tr'), (row) => row.getBoundingClientRect().height);
      if (rowHeights.length !== filteredRows.length || rowHeights.some((height) => height <= 0)) return;

      const header = firstSheet.querySelector<HTMLElement>('.print-sheet-header');
      const signature = firstSheet.querySelector<HTMLElement>('.print-sheet-signature');
      const tableHead = firstSheet.querySelector('thead');
      const tableFoot = firstSheet.querySelector('tfoot');
      if (!header || !signature || !tableHead || !tableFoot) return;

      const availableHeight = 277 * 96 / 25.4
        - header.getBoundingClientRect().height - 20
        - signature.getBoundingClientRect().height - 20
        - tableHead.getBoundingClientRect().height
        - tableFoot.getBoundingClientRect().height - 8;
      if (availableHeight <= 0) return;

      const sizes: number[] = [];
      let rowCount = 0;
      let usedHeight = 0;
      rowHeights.forEach((height) => {
        if (rowCount > 0 && (rowCount === 15 || usedHeight + height > availableHeight)) {
          sizes.push(rowCount);
          rowCount = 0;
          usedHeight = 0;
        }
        rowCount += 1;
        usedHeight += height;
      });
      if (rowCount > 0) sizes.push(rowCount);
      setPagination((previous) => {
        if (previous?.rows === filteredRows && previous.sizes.length === sizes.length
          && previous.sizes.every((size, index) => size === sizes[index])) return previous;
        return { rows: filteredRows, sizes };
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [filteredRows, isLoading, isError]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <style>{`
        .print-sheet {
          width: 180mm;
          box-sizing: content-box;
        }
        .print-table {
          table-layout: fixed;
          font-size: 13px;
          line-height: 1.5;
        }
        .print-table th,
        .print-table td {
          padding: 6px 8px;
          overflow-wrap: anywhere;
        }
        .print-table tr {
          break-inside: avoid;
        }
        .print-table tfoot {
          display: table-row-group;
        }
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          
          .print-sheet {
            page-break-after: always;
            page-break-inside: avoid;
          }
          .print-sheet:last-child {
            page-break-after: auto;
          }

          @page {
            size: A4 portrait;
            margin: 10mm 15mm;
          }

          .print-table {
            font-size: 13px !important;
          }
          .print-table th,
          .print-table td {
            padding: 6px 8px !important;
          }
        }

        @media screen {
          .print-sheet {
            max-width: none;
            min-height: 267mm;
            margin: 0 auto 24px auto;
            padding: 15mm 15mm;
            background: white;
            box-shadow: 0 2px 16px rgba(0,0,0,0.08);
            border: 1px solid #e5e7eb;
            border-radius: 8px;
          }
        }
      `}</style>

      <div className="no-print animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl border border-border hover:bg-muted transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-[18px] font-black text-foreground">In Thu Tiền SG</h1>
              <p className="text-[12px] text-muted-foreground">
                Bảng kê danh sách phiếu nhập tạp hóa thu tiền tại SG
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-card rounded-2xl border border-border shadow-sm px-4 py-2 w-full">
            <div className="flex-1 min-w-[200px]">
              <SearchInput
                placeholder="Tìm mã đơn, khách, xe..."
                onSearch={(raw) => setSearchQuery(raw)}
                className="h-9"
              />
            </div>

            <div className="w-[1px] h-8 bg-border hidden xl:block"></div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Ngày</label>
              <DateRangePicker
                initialDateFrom={dateFrom}
                initialDateTo={dateTo}
                onUpdate={(values) => {
                  if (values.range.from) setDateFrom(format(values.range.from, 'yyyy-MM-dd'));
                  if (values.range.to) setDateTo(format(values.range.to, 'yyyy-MM-dd'));
                  else if (values.range.from) setDateTo(format(values.range.from, 'yyyy-MM-dd'));
                }}
                icon={<CalendarDays size={14} />}
                className="w-[240px] h-9"
              />
            </div>
            
            <div className="w-[1px] h-8 bg-border hidden lg:block"></div>

            <div className="w-[180px]">
              <MultiSearchableSelect
                options={customerOptions}
                value={filterCustomer}
                onValueChange={setFilterCustomer}
                placeholder="Khách hàng"
                className="h-9"
                icon={<Store size={14} />}
              />
            </div>

            <div className="w-[160px]">
              <MultiSearchableSelect
                options={driverOptions}
                value={filterDriver}
                onValueChange={setFilterDriver}
                placeholder="Tài xế"
                className="h-9"
                icon={<User size={14} />}
              />
            </div>

            <div className="w-[140px]">
              <MultiSearchableSelect
                options={vehicleOptions}
                value={filterVehicle}
                onValueChange={setFilterVehicle}
                placeholder="Theo xe"
                className="h-9"
                icon={<Truck size={14} />}
              />
            </div>

            <button
              onClick={handlePrint}
              disabled={filteredRows.length === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer size={16} />
              In danh sách
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="no-print p-4 bg-card rounded-2xl border border-border shadow-sm">
          <LoadingSkeleton rows={10} columns={5} />
        </div>
      ) : isError ? (
        <div className="no-print">
          <ErrorState onRetry={() => refetch()} />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="no-print">
            <EmptyState
              title="Không có dữ liệu"
              description="Không có phiếu nào khớp với bộ lọc hiện tại."
            />
        </div>
      ) : (
        <div className="print-area" ref={printRef}>
          {printPages.map((page) => (
            <div className="print-sheet" key={page.startIndex}>
              <div className="print-sheet-header" style={{ textAlign: 'center', marginBottom: 20 }}>
                <p style={{ fontWeight: 'bold', fontSize: 20, fontFamily: 'serif', marginBottom: 10 }}>NHÀ XE NĂM SỰ</p>
                <h2 style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 8, fontFamily: 'serif' }}>
                  BẢNG KÊ THU TIỀN SG
                </h2>
                <p style={{ fontStyle: 'italic', fontSize: 13 }}>
                  {dateFrom === dateTo
                    ? `Ngày ${formatOnlyDate(dateFrom)}`
                    : `Từ ngày ${formatOnlyDate(dateFrom)} đến ngày ${formatOnlyDate(dateTo)}`
                  }
                </p>
              </div>

              <table
                className="print-table"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: "'Times New Roman', serif",
                  border: '1px solid #000',
                }}
              >
                <colgroup>
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '21%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '15%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #000', textAlign: 'center', width: 30 }}>STT</th>
                    <th style={{ border: '1px solid #000', textAlign: 'center', width: 100 }}>Ngày nhập</th>
                    <th style={{ border: '1px solid #000', textAlign: 'left', width: 130 }}>NV thu tiền</th>
                    <th style={{ border: '1px solid #000', textAlign: 'left', width: 150 }}>Khách hàng</th>
                    <th style={{ border: '1px solid #000', textAlign: 'left' }}>Tên hàng</th>
                    <th style={{ border: '1px solid #000', textAlign: 'center', width: 50 }}>SL</th>
                    <th style={{ border: '1px solid #000', textAlign: 'right', width: 80 }}>Đơn giá</th>
                    <th style={{ border: '1px solid #000', textAlign: 'right', width: 90 }}>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((r, idx) => (
                    <tr key={r.id}>
                      <td style={{ border: '1px solid #000', textAlign: 'center' }}>{page.startIndex + idx + 1}</td>
                      <td style={{ border: '1px solid #000', textAlign: 'center' }}>
                        {r.order_date} {r.order_time}
                      </td>
                      <td style={{ border: '1px solid #000' }}>{r.collector?.full_name || '—'}</td>
                      <td style={{ border: '1px solid #000' }}>
                        {r.customers?.name || '—'}
                        {r.customers?.phone ? ` (${r.customers.phone})` : ''}
                      </td>
                      <td style={{ border: '1px solid #000' }}>{getRowItemNames(r)}</td>
                      <td style={{ border: '1px solid #000', textAlign: 'center' }}>{getRowTotalQuantity(r) || ''}</td>
                      <td style={{ border: '1px solid #000', textAlign: 'right' }}>
                        {formatNumber(getRowUnitPrice(r))}
                      </td>
                      <td style={{ border: '1px solid #000', textAlign: 'right', fontWeight: 'bold' }}>
                        {formatNumber(Number(r.total_amount))}
                      </td>
                    </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} style={{ border: '1px solid #000', textAlign: 'right', fontWeight: 'bold', padding: '8px' }}>
                    TỔNG CỘNG:
                  </td>
                  <td style={{ border: '1px solid #000', textAlign: 'right', fontWeight: 'bold', fontSize: 13, color: '#000' }}>
                    {formatNumber(page.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="print-sheet-signature" style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', fontFamily: "'Times New Roman', serif" }}>
              <div style={{ textAlign: 'center', width: 250 }}>
                <p style={{ fontStyle: 'italic', fontSize: 13, marginBottom: 8 }}>
                  Ngày ..... tháng ..... năm 20...
                </p>
                <p style={{ fontWeight: 'bold', fontSize: 16 }}>NGƯỜI LẬP BIỂU</p>
                <p style={{ fontSize: 14 }}>(Ký, họ tên)</p>
              </div>
            </div>
          </div>
          ))}
        </div>
      )}
    </>
  );
};

export default PrintSgCashCollectionsPage;
