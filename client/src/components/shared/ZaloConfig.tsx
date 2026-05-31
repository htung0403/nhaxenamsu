import React, { useState, useEffect } from 'react';
import { MessageSquare, RefreshCw, CheckCircle2, AlertCircle, Loader2, QrCode } from 'lucide-react';
import { clsx } from 'clsx';
import axiosClient from '../../api/axiosClient';

const ZaloConfig: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'generating' | 'waiting' | 'success' | 'failed'>('idle');
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchQR = async () => {
    try {
      setStatus('generating');
      setError(null);
      const res = await axiosClient.get('/notifications/zalo/qr');
      const data = res.data;
      if (data.qrBase64) {
        setQrBase64(data.qrBase64);
        setStatus('waiting');
      } else {
        throw new Error(data.error || 'Không thể tạo mã QR');
      }
    } catch (err: any) {
      console.error('Lỗi khi lấy mã QR:', err);
      setError(err.response?.data?.error || String(err));
      setStatus('failed');
    }
  };

  const checkInitialStatus = async () => {
    try {
      const res = await axiosClient.get('/notifications/zalo/status');
      const data = res.data;
      if (data.connected) {
        setStatus('success');
      } else if (data.status === 'waiting') {
        setStatus('waiting');
        setQrBase64(data.qrBase64);
      }
    } catch (err) {
      console.error('Lỗi khi kiểm tra trạng thái ban đầu:', err);
    }
  };

  useEffect(() => {
    checkInitialStatus();
  }, []);

  useEffect(() => {
    let interval: any;
    if (status === 'waiting') {
      interval = setInterval(async () => {
        try {
          const res = await axiosClient.get('/notifications/zalo/status');
          const data = res.data;
          if (data.status === 'success') {
            setStatus('success');
            clearInterval(interval);
          } else if (data.status === 'failed') {
            setStatus('failed');
            setError(data.error || 'Đăng nhập thất bại');
            clearInterval(interval);
          }
        } catch (err) {
          console.error('Lỗi khi kiểm tra trạng thái Zalo:', err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [status]);

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-[#0068FF]" />
          <h2 className="text-[14px] font-bold text-foreground">Cấu hình Zalo Notification</h2>
        </div>
        {status === 'success' && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
            <CheckCircle2 size={12} />
            Đã kết nối
          </span>
        )}
      </div>

      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex-1 space-y-4">
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Kết nối tài khoản Zalo cá nhân để tự động gửi phiếu giao hàng và thông báo cho khách hàng. 
              Hệ thống sử dụng tài khoản này để gửi tin nhắn kèm hình ảnh trực tiếp.
            </p>
            
            <div className="space-y-2">
              <h4 className="text-[12px] font-bold text-foreground uppercase tracking-wider">Hướng dẫn kết nối:</h4>
              <ul className="text-[12px] text-muted-foreground space-y-1.5 list-disc pl-4">
                <li>Nhấn vào nút <b>"Kết nối Zalo"</b> bên dưới.</li>
                <li>Dùng ứng dụng Zalo trên điện thoại quét mã QR xuất hiện.</li>
                <li>Xác nhận đăng nhập trên điện thoại của bạn.</li>
                <li>Hệ thống sẽ tự động lưu phiên đăng nhập cho các lần sau.</li>
              </ul>
            </div>

            {status !== 'waiting' && status !== 'generating' && (
              <button
                onClick={fetchQR}
                className={clsx(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-sm",
                  status === 'success' 
                    ? "bg-muted text-foreground hover:bg-muted/80 border border-border" 
                    : "bg-[#0068FF] text-white hover:bg-[#0052cc]"
                )}
              >
                {status === 'success' ? <RefreshCw size={16} /> : <QrCode size={16} />}
                {status === 'success' ? 'Kết nối lại tài khoản' : 'Kết nối Zalo ngay'}
              </button>
            )}
          </div>

          <div className="w-full md:w-[240px] flex flex-col items-center justify-center p-4 bg-muted/20 rounded-2xl border border-border min-h-[240px] relative">
            {status === 'generating' && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={32} className="text-primary animate-spin" />
                <p className="text-[11px] font-medium text-muted-foreground">Đang khởi tạo QR...</p>
              </div>
            )}

            {status === 'waiting' && qrBase64 && (
              <div className="space-y-4 flex flex-col items-center">
                <div className="p-2 bg-white rounded-xl shadow-inner border border-border">
                  <img loading="lazy" decoding="async" src={qrBase64} alt="Zalo Login QR" className="w-[180px] h-[180px]" />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-[11px] font-bold text-emerald-500 animate-pulse">Đang chờ quét mã...</p>
                  <button onClick={fetchQR} className="text-[10px] text-muted-foreground hover:text-primary underline">Lấy mã mới</button>
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="flex flex-col items-center gap-3 text-center p-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-sm border border-emerald-500/20">
                  <CheckCircle2 size={32} />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-foreground">Đã kết nối thành công!</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Tài khoản Zalo của bạn đã sẵn sàng để gửi thông báo.</p>
                </div>
              </div>
            )}

            {status === 'failed' && (
              <div className="flex flex-col items-center gap-3 text-center p-4">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 shadow-sm border border-red-500/20">
                  <AlertCircle size={32} />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-foreground">Lỗi kết nối</p>
                  <p className="text-[11px] text-red-500 mt-1 line-clamp-2">{error}</p>
                  <button onClick={fetchQR} className="mt-3 text-[12px] font-bold text-primary hover:underline">Thử lại</button>
                </div>
              </div>
            )}

            {status === 'idle' && (
              <div className="flex flex-col items-center gap-3 text-muted-foreground/40">
                <QrCode size={64} strokeWidth={1} />
                <p className="text-[11px] font-medium">Chưa bắt đầu kết nối</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZaloConfig;
