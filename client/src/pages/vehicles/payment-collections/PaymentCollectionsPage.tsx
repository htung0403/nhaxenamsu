import React, { useState } from 'react';
import PageHeader from '../../../components/shared/PageHeader';
import { useAuth } from '../../../context/AuthContext';
import { clsx } from 'clsx';
import DriverPaymentTab from './DriverPaymentTab';
import StaffConfirmationTab from './StaffConfirmationTab';
import ManagerSummaryTab from './ManagerSummaryTab';
import { isDriverLikeRoleKey } from '../../../utils/routePermissions';

const PaymentCollectionsPage: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role || 'driver';

  const isDriver = isDriverLikeRoleKey(role);

  // Default tab logic based on role
  const getDefaultTab = () => {
    if (isDriver) return 'thu-tien';
    return 'xac-nhan';
  };

  const [activeTab, setActiveTab] = useState<'thu-tien' | 'xac-nhan' | 'tong-hop'>(getDefaultTab());

  const tabs = [];
  if (isDriver || role === 'staff' || role === 'manager' || role === 'admin') {
    tabs.push({ id: 'thu-tien', label: 'Thu Tiền' });
  }
  if (role === 'staff' || role === 'manager' || role === 'admin') {
    tabs.push({ id: 'xac-nhan', label: 'Xác Nhận Thu Tiền' });
  }
  if (role === 'manager' || role === 'admin') {
    tabs.push({ id: 'tong-hop', label: 'Tổng Hợp Thu Tiền' });
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Quản lý thu tiền hàng"
          description="Quản lý phiếu thu tiền, nộp tiền, và xác nhận công nợ"
          backPath="/app/ke-toan"
        />
      </div>

      <div className="sticky top-[-16px] lg:top-[-24px] z-20 pt-4 lg:pt-6 -mt-4 lg:-mt-6 mb-4 md:mb-6 bg-background -mx-4 md:mx-0 border-b md:border-none border-border shadow-sm md:shadow-none">
        <div className="md:bg-card md:rounded-xl md:shadow-sm md:border border-border md:p-2 flex md:bg-muted/30">
          <div className="flex bg-muted/50 md:bg-muted md:rounded-lg p-1 w-full">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={clsx(
                "flex-1 px-2 py-2 rounded-md text-[12px] sm:text-[13px] font-bold transition-all duration-200 text-center flex items-center justify-center",
                activeTab === tab.id
                  ? "bg-card text-primary shadow-sm ring-1 ring-black/5"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">
                 {tab.id === 'thu-tien' ? 'Thu Tiền' : tab.id === 'xac-nhan' ? 'Xác Nhận' : 'Tổng Hợp'}
              </span>
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="flex-1 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="pt-2 md:pt-0">
          {activeTab === 'thu-tien' && <DriverPaymentTab readonly={!(isDriver || role === 'staff' || role === 'manager' || role === 'admin')} />}
          {activeTab === 'xac-nhan' && <StaffConfirmationTab />}
          {activeTab === 'tong-hop' && <ManagerSummaryTab />}
        </div>
      </div>
    </div>
  );
};

export default PaymentCollectionsPage;
