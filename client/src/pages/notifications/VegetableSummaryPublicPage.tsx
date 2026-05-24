import React, { useMemo } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { Printer, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const formatNumber = (value?: number | null) => {
  if (value == null) return '';
  return new Intl.NumberFormat('vi-VN').format(value);
};

type VegetableSummaryType = 'supplier' | 'sender';

interface SupplierSummaryItem {
  taiRank: number;
  licensePlate: string;
  quantity: number;
  productName: string;
  senderName: string;
  note?: string;
  price?: number;
  total?: number;
  payment_status?: 'paid' | 'unpaid' | 'partial' | string;
}

interface SenderSummaryItem {
  taiRank: number;
  licensePlate: string;
  quantity: number;
  productName: string;
  supplierName: string;
}

interface SupplierSummaryData {
  supplierName: string;
  date: string;
  items: SupplierSummaryItem[];
}

interface SenderSummaryData {
  senderName: string;
  date: string;
  items: SenderSummaryItem[];
}

type VegetableSummaryData = SupplierSummaryData | SenderSummaryData;

const isSupplierSummaryData = (value: VegetableSummaryData): value is SupplierSummaryData => {
  return 'supplierName' in value;
};

const buildSupplierPriceKey = (item: SupplierSummaryItem): string => {
  const productName = (item.productName || 'Hàng hóa').trim();
  const note = typeof item.note === 'string' ? item.note.trim() : '';
  return `${productName}||${note}`;
};

const normalizeSupplierSummaryItems = (items: SupplierSummaryItem[]): SupplierSummaryItem[] => {
  const normalized = items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const isPaid = item.payment_status === 'paid';
    let price = Number(item.price || 0);
    let total = Number(item.total || 0);

    if (isPaid) {
      return {
        ...item,
        quantity,
        price: 0,
        total: 0,
      };
    }

    if (price > 0 && price < 1000) {
      price *= 1000;
    }

    if (!(price > 0) && quantity > 0 && total > 0) {
      price = total / quantity;
    }

    return {
      ...item,
      quantity,
      price: Math.round(price || 0),
      total: Math.round(total || 0),
    };
  });

  const inferredPriceByProduct = new Map<string, number>();
  const positivePriceSet = new Set<number>();

  normalized.forEach((item) => {
    const price = Number(item.price || 0);
    if (!(price > 0)) return;
    positivePriceSet.add(price);
    const key = buildSupplierPriceKey(item);
    if (!inferredPriceByProduct.has(key)) {
      inferredPriceByProduct.set(key, price);
    }
  });

  const fallbackGlobalPrice = positivePriceSet.size === 1
    ? Array.from(positivePriceSet)[0]
    : 0;

  return normalized.map((item) => {
    const quantity = Number(item.quantity || 0);
    const isPaid = item.payment_status === 'paid';
    const key = buildSupplierPriceKey(item);
    let price = Number(item.price || 0);

    if (isPaid) {
      return {
        ...item,
        quantity,
        price: 0,
        total: 0,
      };
    }

    if (!(price > 0)) {
      price = Number(inferredPriceByProduct.get(key) || 0);
    }

    if (!(price > 0) && fallbackGlobalPrice > 0) {
      price = fallbackGlobalPrice;
    }

    let total = Number(item.total || 0);
    if (!(total > 0) && quantity > 0 && price > 0) {
      total = quantity * price;
    }

    return {
      ...item,
      quantity,
      price: Math.round(price || 0),
      total: Math.round(total || 0),
    };
  });
};

type SupplierGroupedRow =
  | { kind: 'item'; key: string; item: SupplierSummaryItem }
  | { kind: 'subtotal'; key: string; productName: string; note?: string; quantity: number };

type SenderGroupedRow =
  | { kind: 'item'; key: string; item: SenderSummaryItem }
  | { kind: 'subtotal'; key: string; productName: string; quantity: number };

const VegetableSummaryPublicPage: React.FC = () => {
  const { type, id, date, token } = useParams<{ type: VegetableSummaryType; id: string; date: string; token: string }>();

  const isSupplierView = type === 'supplier';
  const isSenderView = type === 'sender';
  const isValidType = isSupplierView || isSenderView;
  const hasRequiredParams = Boolean(type && id && date && token);

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery<VegetableSummaryData>({
    queryKey: ['public-vegetable-summary', type, id, date, token],
    enabled: hasRequiredParams && isValidType,
    retry: false,
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/public/summary/${type}/${id}/${date}/${token}`);
      const responseData = response.data?.data || response.data;
      if (!responseData) {
        throw new Error('Không tìm thấy dữ liệu tổng kết');
      }
      return responseData as VegetableSummaryData;
    },
  });

  const errorMessage = useMemo(() => {
    if (!hasRequiredParams) return 'Liên kết không hợp lệ hoặc đã hết hạn.';
    if (!isValidType) return 'Loại tổng kết không hợp lệ';
    if (!queryError) return null;

    if (axios.isAxiosError(queryError)) {
      return queryError.response?.data?.message || 'Không tìm thấy dữ liệu tổng kết';
    }
    if (queryError instanceof Error) {
      return queryError.message;
    }
    return 'Không tìm thấy dữ liệu tổng kết';
  }, [hasRequiredParams, isValidType, queryError]);

  const supplierRows = useMemo<SupplierGroupedRow[]>(() => {
    if (!data || !isSupplierSummaryData(data)) return [];
    const normalizedItems = normalizeSupplierSummaryItems(data.items || []);
    const groups = new Map<string, SupplierSummaryItem[]>();
    normalizedItems.forEach((item) => {
      const productName = item.productName || 'Hàng hóa';
      const note = typeof item.note === 'string' ? item.note.trim() : '';
      const key = `${productName}||${note}`;
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    });

    const rows: SupplierGroupedRow[] = [];
    groups.forEach((items, groupKey) => {
      const [productName, note = ''] = groupKey.split('||');
      items.forEach((item, index) => {
        rows.push({
          kind: 'item',
          key: `supplier-item-${productName}-${note}-${index}-${item.senderName}-${item.taiRank}`,
          item,
        });
      });
      rows.push({
        kind: 'subtotal',
        key: `supplier-subtotal-${productName}-${note}`,
        productName,
        note: note || undefined,
        quantity: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
      });
    });
    return rows;
  }, [data]);

  const senderRows = useMemo<SenderGroupedRow[]>(() => {
    if (!data || isSupplierSummaryData(data)) return [];
    const groups = new Map<string, SenderSummaryItem[]>();
    data.items.forEach((item) => {
      const key = item.productName || 'Hàng hóa';
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    });

    const rows: SenderGroupedRow[] = [];
    groups.forEach((items, productName) => {
      items.forEach((item, index) => {
        rows.push({
          kind: 'item',
          key: `sender-item-${productName}-${index}-${item.supplierName}-${item.taiRank}`,
          item,
        });
      });
      rows.push({
        kind: 'subtotal',
        key: `sender-subtotal-${productName}`,
        productName,
        quantity: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
      });
    });
    return rows;
  }, [data]);

  const senderTotalQuantity = useMemo(() => {
    if (!data || isSupplierSummaryData(data)) return 0;
    return data.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }, [data]);

  const title = isSupplierView ? 'Phiếu Tổng Kết Hàng Đã Nhận' : 'Phiếu Tổng Kết Hàng Đã Gửi';
  const ownerName = data ? (isSupplierSummaryData(data) ? data.supplierName : data.senderName) : '';

  if (isLoading) {
    return (
      <div style={styles.centerScreen}>
        <div style={styles.spinner} />
        <p style={styles.messageText}>Đang tải dữ liệu tổng kết...</p>
      </div>
    );
  }

  if (errorMessage || !data) {
    return (
      <div style={styles.centerScreen}>
        <FileText size={64} color="#94a3b8" />
        <h2 style={{ margin: '12px 0 8px', fontSize: 20 }}>Lỗi truy cập</h2>
        <p style={styles.messageText}>{errorMessage || 'Liên kết không hợp lệ hoặc đã hết hạn.'}</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .public-print-area, .public-print-area * { visibility: visible !important; }
          .public-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 8mm 10mm; }
        }
        @media screen {
          .public-print-sheet {
            max-width: 210mm;
            min-height: 297mm;
            margin: 16px auto 24px auto;
            padding: 10mm 12mm;
            background: white;
            box-shadow: 0 2px 16px rgba(0,0,0,0.08);
            border: 1px solid #e5e7eb;
            border-radius: 8px;
          }
        }
      `}</style>

      <div className="no-print" style={styles.toolbar}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{title}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Nhà Xe Năm Sự</p>
        </div>
        <button onClick={() => window.print()} style={styles.printButton}>
          <Printer size={18} />
          <span>In phiếu</span>
        </button>
      </div>

      <div className="public-print-area">
        <div className="public-print-sheet">
          <div style={styles.legacyHeaderBox}>{data.date}</div>
          <div style={styles.legacyHeaderBox}>{ownerName || '-'}</div>

          {isSupplierView && isSupplierSummaryData(data) && (
            <table style={styles.legacyTable}>
              <thead>
                <tr>
                  <th style={styles.legacyHeaderCell}>Người Gửi</th>
                  <th style={styles.legacyHeaderCellCenter}>Tài</th>
                  <th style={styles.legacyHeaderCellCenter}>Số xe</th>
                  <th style={styles.legacyHeaderCellCenter}>SL</th>
                  <th style={styles.legacyHeaderCell}>Tên Hàng</th>
                  <th style={styles.legacyHeaderCellCenter}>Tiền(K)</th>
                  <th style={styles.legacyHeaderCellRight}>Thành Tiền</th>
                </tr>
              </thead>
              <tbody>
                {supplierRows.map((row) =>
                  row.kind === 'item' ? (
                    <tr key={row.key}>
                      <td style={styles.legacyBodyCell}>{row.item.senderName || '-'}</td>
                      <td style={styles.legacyBodyCellCenter}>{row.item.taiRank || ''}</td>
                      <td style={styles.legacyBodyCellCenter}>{row.item.licensePlate || '-'}</td>
                      <td style={styles.legacyBodyCellCenter}>{row.item.quantity || 0}</td>
                      <td style={styles.legacyBodyCell}>
                        {row.item.productName || ''}
                        {row.item.note ? ` (${row.item.note})` : ''}
                      </td>
                      <td style={styles.legacyBodyCellRight}>{formatNumber((row.item.price || 0) / 1000)}</td>
                      <td style={styles.legacyBodyCellRight}>{formatNumber(row.item.total || 0)}</td>
                    </tr>
                  ) : (
                    <tr key={row.key}>
                      <td colSpan={3} style={styles.subTotalLabelCell}>Tổng</td>
                      <td style={styles.subTotalValueCell}>{formatNumber(row.quantity)}</td>
                      <td colSpan={3} style={styles.subTotalProductCell}>
                        {row.productName}
                        {row.note ? ` (${row.note})` : ''}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}

          {isSenderView && !isSupplierSummaryData(data) && (
            <table style={styles.legacyTable}>
              <thead>
                <tr>
                  <th style={styles.legacyHeaderCellCenter}>Tài</th>
                  <th style={styles.legacyHeaderCellCenter}>Số xe</th>
                  <th style={styles.legacyHeaderCellCenter}>SL</th>
                  <th style={styles.legacyHeaderCell}>Tên Hàng</th>
                  <th style={styles.legacyHeaderCell}>Vựa</th>
                </tr>
              </thead>
              <tbody>
                {senderRows.map((row) =>
                  row.kind === 'item' ? (
                    <tr key={row.key}>
                      <td style={styles.legacyBodyCellCenter}>{row.item.taiRank || ''}</td>
                      <td style={styles.legacyBodyCellCenter}>{row.item.licensePlate || '-'}</td>
                      <td style={styles.legacyBodyCellCenter}>{row.item.quantity || 0}</td>
                      <td style={styles.legacyBodyCell}>{row.item.productName || ''}</td>
                      <td style={styles.legacyBodyCell}>{row.item.supplierName || '-'}</td>
                    </tr>
                  ) : (
                    <tr key={row.key}>
                      <td colSpan={2} style={styles.subTotalLabelCell}>Tổng</td>
                      <td style={styles.subTotalValueCell}>{formatNumber(row.quantity)}</td>
                      <td colSpan={2} style={styles.subTotalProductCell}>{row.productName}</td>
                    </tr>
                  ),
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={styles.grandTotalLabelCell}>TỔNG CỘNG</td>
                  <td style={styles.grandTotalValueCell}>{formatNumber(senderTotalQuantity)}</td>
                  <td colSpan={2} style={styles.grandTotalBlankCell} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  centerScreen: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    background: '#f8fafc',
    textAlign: 'center',
    padding: 20,
  },
  messageText: {
    color: '#64748b',
    fontSize: 14,
    margin: 0,
  },
  spinner: {
    width: 34,
    height: 34,
    border: '3px solid #e2e8f0',
    borderTopColor: '#0284c7',
    borderRadius: '50%',
    animation: 'spin-public-summary 0.8s linear infinite',
  },
  toolbar: {
    maxWidth: 900,
    margin: '14px auto 0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '0 12px',
  },
  printButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    border: '1px solid #d1d5db',
    borderRadius: 10,
    padding: '8px 12px',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  },
  legacyHeaderBox: {
    border: '1px solid #000',
    textAlign: 'center',
    fontFamily: "'Times New Roman', serif",
    fontWeight: 800,
    fontSize: 18,
    padding: '8px 10px',
    marginBottom: 0,
  },
  legacyTable: {
    width: '100%',
    borderCollapse: 'collapse',
    border: '1px solid #000',
    fontFamily: "'Times New Roman', serif",
    fontSize: 15,
  },
  legacyHeaderCell: {
    border: '1px solid #000',
    background: '#f0f0f0',
    fontWeight: 800,
    textAlign: 'left',
    padding: '6px 8px',
  },
  legacyHeaderCellCenter: {
    border: '1px solid #000',
    background: '#f0f0f0',
    fontWeight: 800,
    textAlign: 'center',
    padding: '6px 8px',
  },
  legacyHeaderCellRight: {
    border: '1px solid #000',
    background: '#f0f0f0',
    fontWeight: 800,
    textAlign: 'right',
    padding: '6px 8px',
  },
  legacyBodyCell: {
    border: '1px solid #000',
    padding: '6px 8px',
    textAlign: 'left',
  },
  legacyBodyCellCenter: {
    border: '1px solid #000',
    padding: '6px 8px',
    textAlign: 'center',
  },
  legacyBodyCellRight: {
    border: '1px solid #000',
    padding: '6px 8px',
    textAlign: 'right',
  },
  subTotalLabelCell: {
    border: '1px solid #000',
    padding: '6px 8px',
    textAlign: 'center',
    background: '#f9f9f9',
    fontWeight: 700,
  },
  subTotalValueCell: {
    border: '1px solid #000',
    padding: '6px 8px',
    textAlign: 'center',
    background: '#f9f9f9',
    fontWeight: 700,
  },
  subTotalProductCell: {
    border: '1px solid #000',
    padding: '6px 8px',
    background: '#f9f9f9',
    fontWeight: 700,
    textAlign: 'left',
  },
  grandTotalLabelCell: {
    border: '1px solid #000',
    padding: '6px 8px',
    background: '#e0e0e0',
    fontWeight: 900,
    textAlign: 'center',
  },
  grandTotalValueCell: {
    border: '1px solid #000',
    padding: '6px 8px',
    background: '#e0e0e0',
    fontWeight: 900,
    textAlign: 'center',
  },
  grandTotalValueRightCell: {
    border: '1px solid #000',
    padding: '6px 8px',
    background: '#e0e0e0',
    fontWeight: 900,
    textAlign: 'right',
  },
  grandTotalBlankCell: {
    border: '1px solid #000',
    background: '#e0e0e0',
  },
};

if (typeof document !== 'undefined' && !document.getElementById('public-veg-summary-style')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'public-veg-summary-style';
  styleEl.textContent = `@keyframes spin-public-summary { to { transform: rotate(360deg); } }`;
  document.head.appendChild(styleEl);
}

export default VegetableSummaryPublicPage;
