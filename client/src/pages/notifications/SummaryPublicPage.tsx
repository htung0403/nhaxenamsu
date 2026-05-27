import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Navigate, useParams } from 'react-router-dom';
import { 
  FileText, 
  Package, 
  Calendar, 
  User, 
  Hash,
  Truck,
  Building2,
  SendHorizontal
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const formatNumber = (val?: number | null) => {
  if (val == null) return '0';
  return new Intl.NumberFormat('vi-VN').format(val);
};

interface SummaryItem {
  deliveryTime?: string;
  licensePlate?: string;
  staffName?: string;
  quantity: number;
  productName: string;
  price?: number;
  total?: number;
  taiRank?: number;
  senderName?: string;
  supplierName?: string;
  importOrderCreatedAt?: string;
  import_order_created_at?: string;
}

const getSummaryProductName = (item: SummaryItem) => {
  const productName = item.productName || 'Hàng hóa';
  const rawDate = item.importOrderCreatedAt || item.import_order_created_at;
  if (!rawDate || /\(\d{2}\/\d{2}\)$/.test(productName.trim())) return productName;

  const createdAt = new Date(rawDate);
  if (Number.isNaN(createdAt.getTime())) return productName;

  const shortDate = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
  }).format(createdAt);
  return `${productName} (${shortDate})`;
};

interface SummaryData {
  shopName?: string;
  customerName?: string;
  supplierName?: string;
  senderName?: string;
  date: string;
  items: SummaryItem[];
  undeliveredQuantity?: number;
}

const SummaryPublicPage: React.FC = () => {
  const { type, id, date, token } = useParams<{ type: string; id: string; date: string; token: string }>();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if ((type === 'supplier' || type === 'sender') && type && id && date && token) {
    return <Navigate to={`/public/vegetable-orders/${type}/${id}/${date}/${token}`} replace />;
  }

  useEffect(() => {
    if (!type || !id || !date || !token) return;
    setLoading(true);
    axios
      .get(`${API_URL}/public/summary/${type}/${id}/${date}/${token}`)
      .then((res) => {
        const d = res.data?.data || res.data;
        if (d) setData(d);
        else setError('Không tìm thấy dữ liệu tổng kết');
      })
      .catch((err) => {
        const msg = err.response?.data?.message || 'Không tìm thấy dữ liệu tổng kết';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [type, id, date, token]);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Đang tải thông tin...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorIcon}>
          <FileText size={64} color="#94a3b8" />
        </div>
        <h2 style={styles.errorTitle}>Lỗi truy cập</h2>
        <p style={styles.errorText}>{error || 'Liên kết không hợp lệ hoặc đã hết hạn.'}</p>
      </div>
    );
  }

  const title = type === 'grocery' ? 'Tổng kết giao hàng' : (type === 'supplier' ? 'Tổng kết hàng đã nhận' : 'Tổng kết hàng đã gửi');
  const targetName = data.customerName || data.supplierName || data.senderName || 'Quý khách';
  const icon = type === 'grocery' ? <User size={28} color="#fff" /> : (type === 'supplier' ? <Building2 size={28} color="#fff" /> : <SendHorizontal size={28} color="#fff" />);

  // Group items by product for Supplier/Sender
  const groupedItems: Record<string, SummaryItem[]> = {};
  if (type !== 'grocery') {
    data.items.forEach(item => {
      const productName = getSummaryProductName(item);
      if (!groupedItems[productName]) groupedItems[productName] = [];
      groupedItems[productName].push(item);
    });
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.shopBadge}>
            {icon}
          </div>
          <div>
            <h1 style={styles.shopName}>{data.shopName || 'Bán Rau'}</h1>
            <p style={styles.headerSub}>{title}</p>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        {/* Info Card */}
        <section style={styles.card}>
          <div style={styles.infoGrid}>
            <InfoRow label={type === 'supplier' ? 'Vựa' : 'Đối tượng'} value={targetName} icon={<User size={16} />} highlight />
            <InfoRow label="Ngày tổng kết" value={data.date} icon={<Calendar size={16} />} />
            {type === 'grocery' && data.undeliveredQuantity ? (
              <InfoRow label="Số kiện chưa giao" value={formatNumber(data.undeliveredQuantity)} icon={<Package size={16} />} isError />
            ) : null}
          </div>
        </section>

        {/* Items List */}
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>
            <span style={styles.sectionIcon}><Package size={20} /></span>
            Chi tiết hàng hóa
          </h2>

          <div style={styles.itemsList}>
            {type === 'grocery' ? (
              // Grocery view (Standard items)
              data.items.map((item, i) => (
                <div key={i} style={styles.itemCard}>
                  <div style={styles.itemHeader}>
                    <span style={styles.productName}>{getSummaryProductName(item)}</span>
                    <span style={styles.itemQty}>{formatNumber(item.quantity)} kiện</span>
                  </div>
                  <div style={styles.itemDetails}>
                    <div style={styles.detailRow}>
                      <Truck size={14} style={styles.detailIcon} />
                      <span>Xe: {item.licensePlate} - {item.staffName}</span>
                    </div>
                    <div style={styles.detailRow}>
                      <Hash size={14} style={styles.detailIcon} />
                      <span>{formatNumber(item.price)} đ x {formatNumber(item.quantity)} = {formatNumber(item.total)} đ</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              // Supplier/Sender view (Grouped items)
              Object.keys(groupedItems).map((productName, i) => {
                const items = groupedItems[productName];
                const totalQty = items.reduce((s, it) => s + it.quantity, 0);
                return (
                  <div key={i} style={styles.groupCard}>
                    <div style={styles.groupHeader}>
                      <span style={styles.productName}>{productName}</span>
                      <span style={styles.groupTotalQty}>Tổng: {formatNumber(totalQty)}</span>
                    </div>
                    <div style={styles.groupItems}>
                      {items.map((it, idx) => (
                        <div key={idx} style={styles.subItemRow}>
                          <span style={styles.taiRank}>Tải {it.taiRank}</span>
                          <span style={styles.subItemName}>{type === 'supplier' ? it.senderName : it.supplierName}</span>
                          <span style={styles.subItemQty}>{formatNumber(it.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {type === 'grocery' && (
            <div style={styles.totalRow}>
              <span style={styles.totalLabel}>Tổng cộng</span>
              <span style={styles.totalValue}>
                {formatNumber(data.items.reduce((s, it) => s + (it.total || 0), 0))} đ
              </span>
            </div>
          )}
        </section>

        {/* Note if undelivered */}
        {type === 'grocery' && data.undeliveredQuantity && data.undeliveredQuantity > 0 && (
          <div style={styles.alertCard}>
            <p style={styles.alertText}>
              <b>Thông báo:</b> Hiện còn <b>{data.undeliveredQuantity} kiện</b> chưa kịp giao trong hôm nay. 
              Chúng tôi sẽ ưu tiên giao vào sáng sớm mai. Mong quý khách thông cảm!
            </p>
          </div>
        )}

        {/* Footer */}
        <footer style={styles.footer}>
          <p style={styles.footerText}>
            Hệ thống quản lý {data.shopName || 'Bán Rau'} &middot; Cảm ơn bạn!
          </p>
        </footer>
      </main>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string; icon?: React.ReactNode; highlight?: boolean; isError?: boolean }> = ({ label, value, icon, highlight, isError }) => (
  <div style={styles.infoRow}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon && <span style={{ color: '#94a3b8', display: 'flex' }}>{icon}</span>}
      <span style={styles.infoLabel}>{label}</span>
    </div>
    <span style={{ 
      ...styles.infoValue, 
      ...(highlight ? styles.infoValueHighlight : {}),
      ...(isError ? { color: '#ef4444' } : {})
    }}>{value}</span>
  </div>
);

// --- Inline styles ---
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%)',
    fontFamily: "'Inter', sans-serif",
  },
  header: {
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    padding: '24px 16px 32px',
  },
  headerInner: {
    maxWidth: 600,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  shopBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    background: 'rgba(255,255,255,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  shopName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 800,
    margin: 0,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    margin: '2px 0 0',
  },
  main: {
    maxWidth: 600,
    margin: '-16px auto 0',
    padding: '0 12px 32px',
  },
  card: {
    background: '#fff',
    borderRadius: 20,
    padding: '20px',
    marginBottom: 16,
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
  },
  infoGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: 500,
  },
  infoValue: {
    color: '#1e293b',
    fontSize: 14,
    fontWeight: 600,
  },
  infoValueHighlight: {
    color: '#0ea5e9',
    fontWeight: 700,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  sectionIcon: {
    color: '#64748b',
  },
  itemsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  itemCard: {
    padding: '16px',
    borderRadius: 16,
    background: '#f8fafc',
    border: '1px solid #f1f5f9',
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  productName: {
    fontSize: 15,
    fontWeight: 700,
    color: '#0f172a',
  },
  itemQty: {
    fontSize: 14,
    fontWeight: 800,
    color: '#0ea5e9',
    background: '#e0f2fe',
    padding: '4px 10px',
    borderRadius: 8,
  },
  itemDetails: {
    fontSize: 13,
    color: '#64748b',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  detailRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  detailIcon: {
    flexShrink: 0,
  },
  groupCard: {
    borderRadius: 16,
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  groupHeader: {
    background: '#f8fafc',
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupTotalQty: {
    fontSize: 13,
    fontWeight: 700,
    color: '#64748b',
  },
  groupItems: {
    padding: '8px 0',
  },
  subItemRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    fontSize: 13,
    borderBottom: '1px solid #f1f5f9',
  },
  taiRank: {
    width: 60,
    fontWeight: 700,
    color: '#64748b',
  },
  subItemName: {
    flex: 1,
    color: '#1e293b',
  },
  subItemQty: {
    fontWeight: 700,
    color: '#0f172a',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTop: '2px dashed #f1f5f9',
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: 700,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 800,
    color: '#0f172a',
  },
  alertCard: {
    background: '#fff7ed',
    border: '1px solid #ffedd5',
    padding: '16px',
    borderRadius: 16,
    marginBottom: 16,
  },
  alertText: {
    margin: 0,
    fontSize: 13,
    color: '#9a3412',
    lineHeight: 1.6,
  },
  footer: {
    textAlign: 'center' as const,
    marginTop: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8fafc',
    gap: 16,
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #e2e8f0',
    borderTopColor: '#0ea5e9',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: '#64748b',
    fontSize: 14,
  },
  errorContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    textAlign: 'center' as const,
  },
  errorIcon: {
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 700,
    margin: '0 0 8px',
  },
  errorText: {
    color: '#64748b',
    fontSize: 15,
  },
};

// Add spinner keyframe
if (typeof document !== 'undefined' && !document.getElementById('summary-public-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'summary-public-styles';
  styleEl.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(styleEl);
}

export default SummaryPublicPage;
