import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { 
  Truck, 
  Package, 
  Camera, 
  Phone, 
  MessageCircle, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Clock, 
  Calendar, 
  User, 
  CreditCard,
  Hash
} from 'lucide-react';
import { cloudinarySmall, cloudinaryLarge } from '../../lib/cloudinaryUrl';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  hang_o_sg: { label: 'Hàng ở SG', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  can_giao: { label: 'Cần giao', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  da_giao: { label: 'Đã giao', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
};

const formatNumber = (val?: number | null) => {
  if (val == null) return '0';
  return new Intl.NumberFormat('vi-VN').format(val);
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

interface DeliveryVehicle {
  staffName: string;
  staffPhone?: string;
  licensePlate: string;
  quantity: number;
  expectedAmount: number;
  deliveryTime?: string;
  deliveryDate?: string;
  images: string[];
}

interface DeliveryData {
  id: string;
  orderCode: string;
  shopName: string;
  customerName: string;
  productName: string;
  totalQuantity: number;
  unitPrice?: number;
  deliveryDate?: string;
  deliveryTime?: string;
  status: string;
  orderCategory?: string;
  createdAt: string;
  images: string[];
  vehicles: DeliveryVehicle[];
}

const DeliveryPublicPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DeliveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    axios
      .get(`${API_URL}/public/delivery/${id}`)
      .then((res) => {
        const d = res.data?.data || res.data;
        if (d) setData(d);
        else setError('Không tìm thấy đơn giao hàng');
      })
      .catch(() => setError('Không tìm thấy đơn giao hàng'))
      .finally(() => setLoading(false));
  }, [id]);

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
          <Package size={64} color="#94a3b8" />
        </div>
        <h2 style={styles.errorTitle}>Không tìm thấy</h2>
        <p style={styles.errorText}>{error || 'Đơn giao hàng không tồn tại hoặc đã bị xóa.'}</p>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[data.status] || STATUS_MAP.can_giao;
  const totalExpected = data.vehicles.reduce((s, v) => s + v.expectedAmount, 0);

  // Combine all images for lightbox swiping
  const allImages = [...data.images];
  data.vehicles.forEach((v) => {
    v.images.forEach((img) => {
      if (!allImages.includes(img)) allImages.push(img);
    });
  });

  const openLightbox = (url: string) => {
    const idx = allImages.indexOf(url);
    if (idx !== -1) setLightboxIndex(idx);
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.shopBadge}>
            <Truck size={28} color="#fff" />
          </div>
          <div>
            <h1 style={styles.shopName}>Nhà xe {data.shopName}</h1>
            <p style={styles.headerSub}>Phiếu giao hàng</p>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        {/* Order Info Card */}
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <p style={styles.orderCodeLabel}>Mã đơn</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Hash size={16} color="#64748b" />
                <p style={styles.orderCode}>{data.orderCode}</p>
              </div>
            </div>
            <span
              style={{
                ...styles.statusBadge,
                color: statusInfo.color,
                background: statusInfo.bg,
                border: `1px solid ${statusInfo.color}22`,
              }}
            >
              {statusInfo.label}
            </span>
          </div>

          <div style={styles.divider} />

          <div style={styles.infoGrid}>
            <InfoRow label="Khách hàng" value={data.customerName} icon={<User size={16} />} highlight />
            <InfoRow label="Sản phẩm" value={data.productName} icon={<Package size={16} />} />
            <InfoRow label="Số lượng" value={`${formatNumber(data.totalQuantity)}`} icon={<Hash size={16} />} />
            {data.unitPrice ? <InfoRow label="Đơn giá" value={`${formatNumber(data.unitPrice)} đ`} icon={<CreditCard size={16} />} /> : null}
            <InfoRow label="Ngày giao" value={formatDate(data.deliveryDate)} icon={<Calendar size={16} />} />
            {data.deliveryTime && <InfoRow label="Giờ giao" value={data.deliveryTime} icon={<Clock size={16} />} />}
          </div>
        </section>

        {/* Vehicles */}
        {data.vehicles.length > 0 && (
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>
              <span style={styles.sectionIcon}><Truck size={20} /></span>
              Thông tin giao hàng
            </h2>

            <div style={styles.garageContact}>
              <span style={styles.garageLabel}>Gọi cho "Nhà xe": <strong style={{color: '#0f172a'}}>0818034568</strong></span>
              <div style={styles.contactActions}>
                <a href="tel:0818034568" style={styles.contactBtn}>
                  <Phone size={18} /> Gọi điện
                </a>
                <a 
                  href="https://zalo.me/0818034568" 
                  target="_blank" 
                  rel="noreferrer" 
                  style={{ ...styles.contactBtn, background: '#0068ff', color: '#fff' }}
                >
                  <MessageCircle size={18} /> Zalo
                </a>
              </div>
            </div>

            <div style={styles.vehicleList}>
              {data.vehicles.map((v, i) => (
                <div key={i} style={styles.vehicleCard}>
                  <div style={styles.vehicleRow}>
                    <span style={styles.vehicleLabel}>Nhân viên</span>
                    <div style={styles.staffContainer}>
                      <span style={styles.vehicleValue}>{v.staffName}</span>
                      {v.staffPhone && (
                        <div style={styles.staffActions}>
                          <a href={`tel:${v.staffPhone}`} style={styles.miniBtn} title="Gọi">
                            <Phone size={14} />
                          </a>
                          <a href={`https://zalo.me/${v.staffPhone}`} target="_blank" rel="noreferrer" style={{...styles.miniBtn, background: '#0068ff'}} title="Zalo">
                            <MessageCircle size={14} />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  {v.staffPhone && (
                    <div style={styles.vehicleRow}>
                      <span style={styles.vehicleLabel}>Số điện thoại</span>
                      <span style={styles.vehicleValue}>{v.staffPhone}</span>
                    </div>
                  )}
                  <div style={styles.vehicleRow}>
                    <span style={styles.vehicleLabel}>Biển số xe</span>
                    <span style={{ ...styles.vehicleValue, ...styles.plateText }}>{v.licensePlate}</span>
                  </div>
                  <div style={styles.vehicleRow}>
                    <span style={styles.vehicleLabel}>Số lượng</span>
                    <span style={styles.vehicleValue}>{formatNumber(v.quantity)}</span>
                  </div>
                  {v.expectedAmount > 0 && (
                    <div style={styles.vehicleRow}>
                      <span style={styles.vehicleLabel}>Thành tiền</span>
                      <span style={{ ...styles.vehicleValue, ...styles.amountText }}>
                        {formatNumber(v.expectedAmount)} đ
                      </span>
                    </div>
                  )}
                  {v.deliveryTime && (
                    <div style={styles.vehicleRow}>
                      <span style={styles.vehicleLabel}>Giờ giao</span>
                      <span style={styles.vehicleValue}>{v.deliveryTime}</span>
                    </div>
                  )}

                  {/* Images for this assignment */}
                  {v.images.length > 0 && (
                    <div style={styles.vehicleImages}>
                      <p style={styles.vehicleImagesLabel}>Hình ảnh ({v.images.length})</p>
                      <div style={styles.imageGrid}>
                        {v.images.map((url, idx) => (
                          <div
                            key={idx}
                            style={styles.imageThumb}
                            onClick={() => openLightbox(url)}
                          >
                    <img src={cloudinarySmall(url)} alt="Giao hàng" style={styles.imageImg} loading="lazy" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {totalExpected > 0 && (
              <div style={styles.totalRow}>
                <span style={styles.totalLabel}>Tổng cộng</span>
                <span style={styles.totalValue}>{formatNumber(totalExpected)} đ</span>
              </div>
            )}
          </section>
        )}

        {/* Global Images (e.g. Receipt) */}
        {data.images.length > 0 && (
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>
              <span style={styles.sectionIcon}><Camera size={20} /></span>
              Hình ảnh chung ({data.images.length})
            </h2>
            <div style={styles.imageGrid}>
              {data.images.map((url, i) => (
                <div
                  key={i}
                  style={styles.imageThumb}
                  onClick={() => openLightbox(url)}
                >
                  <img
                      src={cloudinarySmall(url)}
                    alt={`Ảnh ${i + 1}`}
                    style={styles.imageImg}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer style={styles.footer}>
          <p style={styles.footerText}>
            Nhà xe {data.shopName} &middot; Cảm ơn quý khách!
          </p>
        </footer>
      </main>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div style={styles.lightboxOverlay} onClick={() => setLightboxIndex(null)}>
          <div style={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <button style={styles.lightboxClose} onClick={() => setLightboxIndex(null)}>
              <X size={24} />
            </button>
            <img loading="lazy" decoding="async"
              src={cloudinaryLarge(allImages[lightboxIndex])}
              alt={`Ảnh ${lightboxIndex + 1}`}
              style={styles.lightboxImg}
            />
            <div style={styles.lightboxNav}>
              <button
                style={styles.lightboxNavBtn}
                disabled={lightboxIndex === 0}
                onClick={() => setLightboxIndex(Math.max(0, lightboxIndex - 1))}
              >
                <ChevronLeft size={24} />
              </button>
              <span style={styles.lightboxCounter}>
                {lightboxIndex + 1} / {allImages.length}
              </span>
              <button
                style={styles.lightboxNavBtn}
                disabled={lightboxIndex === allImages.length - 1}
                onClick={() => setLightboxIndex(Math.min(allImages.length - 1, lightboxIndex + 1))}
              >
                <ChevronRight size={24} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string; icon?: React.ReactNode; highlight?: boolean }> = ({ label, value, icon, highlight }) => (
  <div style={styles.infoRow}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon && <span style={{ color: '#94a3b8', display: 'flex' }}>{icon}</span>}
      <span style={styles.infoLabel}>{label}</span>
    </div>
    <span style={{ ...styles.infoValue, ...(highlight ? styles.infoValueHighlight : {}) }}>{value}</span>
  </div>
);

// --- Inline styles ---
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(145deg, #f0fdf4 0%, #ecfdf5 30%, #f8fafc 100%)',
    fontFamily: "'Inter', 'Noto Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  header: {
    background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
    padding: '24px 16px 32px',
    position: 'relative' as const,
    overflow: 'hidden',
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
    background: 'rgba(255,255,255,0.2)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 26,
    flexShrink: 0,
  },
  shopName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 800,
    margin: 0,
    letterSpacing: '-0.02em',
  },
  headerSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    margin: '2px 0 0',
    fontWeight: 500,
  },
  main: {
    maxWidth: 600,
    margin: '-16px auto 0',
    padding: '0 12px 32px',
    position: 'relative' as const,
    zIndex: 1,
  },
  card: {
    background: '#fff',
    borderRadius: 20,
    padding: '20px 20px',
    marginBottom: 14,
    boxShadow: '0 4px 24px -4px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
    border: '1px solid rgba(0,0,0,0.04)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderCodeLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 600,
    margin: 0,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  orderCode: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: 800,
    margin: '2px 0 0',
    letterSpacing: '-0.01em',
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: 700,
    padding: '5px 12px',
    borderRadius: 20,
    whiteSpace: 'nowrap' as const,
  },
  divider: {
    height: 1,
    background: '#f1f5f9',
    margin: '16px 0',
  },
  infoGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
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
    textAlign: 'right' as const,
    maxWidth: '60%',
    wordBreak: 'break-word' as const,
  },
  infoValueHighlight: {
    color: '#059669',
    fontWeight: 700,
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  sectionIcon: {
    fontSize: 18,
  },
  vehicleList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  vehicleCard: {
    background: '#f8fafc',
    borderRadius: 16,
    padding: '16px',
    border: '1px solid #e2e8f0',
  },
  garageContact: {
    background: '#f0f9ff',
    borderRadius: 16,
    padding: '14px 16px',
    marginBottom: 16,
    border: '1px solid #bae6fd',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  garageLabel: {
    fontSize: 14,
    color: '#0369a1',
    fontWeight: 600,
  },
  contactActions: {
    display: 'flex',
    gap: 10,
  },
  contactBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '10px',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    textDecoration: 'none',
    background: '#fff',
    color: '#0369a1',
    border: '1px solid #bae6fd',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    transition: 'all 0.2s',
  },
  btnIcon: {
    fontSize: 16,
  },
  staffContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  staffActions: {
    display: 'flex',
    gap: 6,
  },
  miniBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#10b981',
    color: '#fff',
    textDecoration: 'none',
    fontSize: 14,
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  vehicleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 0',
  },
  vehicleLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: 500,
  },
  vehicleValue: {
    color: '#1e293b',
    fontSize: 13,
    fontWeight: 600,
  },
  plateText: {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    background: '#e2e8f0',
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 12,
    letterSpacing: '0.05em',
  },
  amountText: {
    color: '#059669',
    fontWeight: 700,
    fontSize: 14,
  },
  vehicleImages: {
    marginTop: 14,
    paddingTop: 14,
    borderTop: '1px solid #e2e8f0',
  },
  vehicleImagesLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#64748b',
    marginBottom: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.02em',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTop: '2px dashed #e2e8f0',
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: 700,
    color: '#0f172a',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 800,
    color: '#059669',
  },
  imageGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
  },
  imageThumb: {
    aspectRatio: '1',
    borderRadius: 12,
    overflow: 'hidden',
    cursor: 'pointer',
    border: '1px solid #e2e8f0',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  imageImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  },
  footer: {
    textAlign: 'center' as const,
    padding: '20px 0 0',
  },
  footerText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: 500,
  },
  // Loading
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
    width: 40,
    height: 40,
    border: '3px solid #e2e8f0',
    borderTopColor: '#10b981',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: 500,
  },
  // Error
  errorContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8fafc',
    padding: 32,
    textAlign: 'center' as const,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 8px',
  },
  errorText: {
    color: '#64748b',
    fontSize: 15,
    margin: 0,
  },
  // Lightbox
  lightboxOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.9)',
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  lightboxContent: {
    position: 'relative' as const,
    maxWidth: '100%',
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 16,
  },
  lightboxClose: {
    position: 'absolute' as const,
    top: -44,
    right: 0,
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: '#fff',
    fontSize: 20,
    width: 36,
    height: 36,
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImg: {
    maxWidth: '100%',
    maxHeight: 'calc(100vh - 120px)',
    objectFit: 'contain' as const,
    borderRadius: 8,
  },
  lightboxNav: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
  },
  lightboxNavBtn: {
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: '#fff',
    fontSize: 18,
    width: 40,
    height: 40,
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxCounter: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: 600,
  },
};

// Add spinner keyframe via style tag
if (typeof document !== 'undefined' && !document.getElementById('public-delivery-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'public-delivery-styles';
  styleEl.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(styleEl);
}

export default DeliveryPublicPage;
