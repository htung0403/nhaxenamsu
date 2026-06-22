import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Settings } from 'lucide-react';
import PageHeader from '../../components/shared/PageHeader';
import ZaloConfig from '../../components/shared/ZaloConfig';
import ZaloSummarySchedulerConfig from '../../components/admin/settings/ZaloSummarySchedulerConfig';
import LockTimeConfig from '../../components/admin/settings/LockTimeConfig';
import GoodsConversionConfig from '../../components/admin/settings/GoodsConversionConfig';

const SystemSettingsPage: React.FC = () => {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      {/* PageHeader - hidden on mobile, shown on md+ */}
      <div className="hidden md:block">
        <PageHeader
          title="Cài đặt hệ thống"
          description="Quản lý các thiết lập hệ thống như khung giờ truy cập, quy tắc chuyển hàng, và cấu hình Zalo."
          backPath="/app/hanh-chinh-nhan-su"
        />
      </div>

      {/* Mobile header */}
      <div className="md:hidden mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Settings size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Cài đặt hệ thống</h1>
            <p className="text-[12px] text-muted-foreground">Quản lý thiết lập hệ thống</p>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        <ZaloConfig />
        <ZaloSummarySchedulerConfig />
        <div className="rounded-2xl border border-border/60 bg-card p-4 md:p-5">
          <div className="mb-3">
            <h2 className="text-[14px] font-bold text-foreground">Quản lý gửi tổng kết Zalo</h2>
            <p className="text-[12px] text-muted-foreground mt-1">
              Theo dõi khách trong ngày đã gửi thành công/chưa, mở link public summary và gửi lại thủ công.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link
              to="/app/cai-dat-he-thong/zalo-tong-ket-tap-hoa"
              className="rounded-xl border border-border bg-background hover:bg-muted/40 transition p-3 flex items-center justify-between"
            >
              <span className="text-[13px] font-semibold text-foreground">Khách tạp hóa</span>
              <ExternalLink size={15} className="text-muted-foreground" />
            </Link>
            <Link
              to="/app/cai-dat-he-thong/zalo-tong-ket-vua-rau"
              className="rounded-xl border border-border bg-background hover:bg-muted/40 transition p-3 flex items-center justify-between"
            >
              <span className="text-[13px] font-semibold text-foreground">Vựa rau</span>
              <ExternalLink size={15} className="text-muted-foreground" />
            </Link>
            <Link
              to="/app/cai-dat-he-thong/zalo-tong-ket-nguoi-gui-rau"
              className="rounded-xl border border-border bg-background hover:bg-muted/40 transition p-3 flex items-center justify-between"
            >
              <span className="text-[13px] font-semibold text-foreground">Người gửi rau</span>
              <ExternalLink size={15} className="text-muted-foreground" />
            </Link>
          </div>
        </div>
        <LockTimeConfig />
        <GoodsConversionConfig />
      </div>
    </div>
  );
};

export default SystemSettingsPage;
