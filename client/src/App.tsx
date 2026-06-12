import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BreadcrumbProvider } from './context/BreadcrumbContext';
import { NotificationProvider } from './context/NotificationContext';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import ModulePage from './pages/ModulePage';
import CopyrightPage from './pages/CopyrightPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import LoginPage from './pages/auth/LoginPage';
import ImportOrdersPage from './pages/import-orders/ImportOrdersPage';
import ConfirmSenderImportOrdersPage from './pages/import-orders/ConfirmSenderImportOrdersPage';
import ReturnToSgOrdersPage from './pages/import-orders/ReturnToSgOrdersPage';
import ExportOrdersPage from './pages/export-orders/ExportOrdersPage';
import DeliveryPage from './pages/delivery/DeliveryPage';
import WarehousesPage from './pages/warehouse/WarehousesPage';
import ProductSettingsPage from './pages/warehouse/ProductSettingsPage';
import VegetableProductSettingsPage from './pages/warehouse/VegetableProductSettingsPage';
import VegetableWarehousePage from './pages/warehouse/VegetableWarehousePage';
import VegetableImportsPage from './pages/import-orders/VegetableImportsPage';
import StandardImportOrderHistoryPage from './pages/import-orders/StandardImportOrderHistoryPage';
import VegetableImportOrderHistoryPage from './pages/import-orders/VegetableImportOrderHistoryPage';
import VegetablesPage from './pages/import-orders/VegetablesPage';
import VegetableDeliveryPage from './pages/delivery/VegetableDeliveryPage';
import EmployeesPage from './pages/hr/EmployeesPage';
import LeaveRequestsPage from './pages/hr/LeaveRequestsPage';
import AttendancePage from './pages/hr/AttendancePage';
import AttendanceLocationsPage from './pages/hr/AttendanceLocationsPage';
import PayrollPage from './pages/payroll/PayrollPage';
import ApprovalsPage from './pages/hr/ApprovalsPage';
import SalaryAdvancesPage from './pages/hr/SalaryAdvancesPage';
import ExpensesPage from './pages/hr/ExpensesPage';
import ExpenseHistoryPage from './pages/hr/ExpenseHistoryPage';
import PrintExpensesPage from './pages/hr/PrintExpensesPage';
import VehiclesPage from './pages/vehicles/VehiclesPage';
import DriverCheckinPage from './pages/vehicles/DriverCheckinPage';
import DriverMapPage from './pages/vehicles/DriverMapPage';
import DriverDeliveriesPage from './pages/vehicles/DriverDeliveriesPage';
import DriverActiveTripPage from './pages/vehicles/DriverActiveTripPage';
import PaymentCollectionsPage from './pages/vehicles/payment-collections/PaymentCollectionsPage';
import GroceryCustomersPage from './pages/customers/GroceryCustomersPage';
import VegetableCustomersPage from './pages/customers/VegetableCustomersPage';
import WholesaleCustomersPage from './pages/customers/WholesaleCustomersPage';
import LoyalCustomersPage from './pages/customers/LoyalCustomersPage';
import SalarySettingsPage from './pages/hr/SalarySettingsPage';
import RolePermissionsPage from './pages/hr/RolePermissionsPage';
import SystemSettingsPage from './pages/admin/SystemSettingsPage';
import CustomerDetailPage from './pages/customers/CustomerDetailPage';
import MyOrdersByCustomerTypePage from './pages/customers/MyOrdersByCustomerTypePage';
import CustomerDebtPage from './pages/customers/CustomerDebtPage';
import RevenueReportPage from './pages/customers/RevenueReportPage';
import SgCashCollectionsPage from './pages/accounting/SgCashCollectionsPage';
import InvoiceGroceryPage from './pages/accounting/InvoiceGroceryPage';
import InvoiceVegetablePage from './pages/accounting/InvoiceVegetablePage';
import PrintVegetableOrdersPage from './pages/import-orders/PrintVegetableOrdersPage';
import PrintDeliveryPage from './pages/delivery/PrintDeliveryPage';
import PrintSgCashCollectionsPage from './pages/accounting/PrintSgCashCollectionsPage';
import DeliveryPublicPage from './pages/delivery/DeliveryPublicPage';
import SummaryPublicPage from './pages/notifications/SummaryPublicPage';
import VegetableSummaryPublicPage from './pages/notifications/VegetableSummaryPublicPage';
import ZaloGrocerySummaryManagePage from './pages/notifications/ZaloGrocerySummaryManagePage';
import ZaloSupplierSummaryManagePage from './pages/notifications/ZaloSupplierSummaryManagePage';
import ZaloSenderSummaryManagePage from './pages/notifications/ZaloSenderSummaryManagePage';
import ZaloVegetableArrivalManagePage from './pages/notifications/ZaloVegetableArrivalManagePage';
import React from 'react';

const isRateLimitError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const response = (error as { response?: { status?: number } }).response;
  return response?.status === 429;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        if (isRateLimitError(error)) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      staleTime: 30_000, // 30s
    },
  },
});

// Protected Route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground text-[13px] font-medium">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};


function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/don-giao/:id" element={<DeliveryPublicPage />} />
      <Route path="/public/summary/:type/:id/:date/:token" element={<SummaryPublicPage />} />
      <Route path="/public/vegetable-orders/:type/:id/:date/:token" element={<VegetableSummaryPublicPage />} />

      {/* Protected Routes */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/ho-so" element={<ProfilePage />} />
        <Route path="/ho-so/:id" element={<ProfilePage />} />
        <Route path="/tai-khoan/don-hang" element={<Navigate to="/don-hang-cua-toi" replace />} />
        <Route path="/don-hang-cua-toi" element={<MyOrdersByCustomerTypePage />} />

        {/* Hang hoa module */}
        <Route path="/hang-hoa" element={<ModulePage />} />
        <Route path="/hang-hoa/nhap-hang" element={<ImportOrdersPage />} />
        <Route path="/hang-hoa/xac-nhan-hang-gui" element={<ConfirmSenderImportOrdersPage />} />
        <Route path="/hang-hoa/hang-gui-sg" element={<ReturnToSgOrdersPage />} />
        <Route path="/hang-hoa/nhap-hang/lich-su" element={<StandardImportOrderHistoryPage />} />
        <Route path="/hang-hoa/nhap-hang-rau" element={<VegetableImportsPage />} />
        <Route path="/hang-hoa/nhap-hang-rau/lich-su" element={<VegetableImportOrderHistoryPage />} />
        <Route path="/hang-hoa/hang-rau" element={<VegetablesPage />} />
        <Route path="/hang-hoa/in-phieu-rau" element={<PrintVegetableOrdersPage />} />
        <Route path="/hang-hoa/giao-hang-rau" element={<VegetableDeliveryPage />} />
        <Route path="/hang-hoa/kho-rau" element={<VegetableWarehousePage />} />
        <Route path="/hang-hoa/xuat-hang" element={<ExportOrdersPage />} />
        <Route path="/hang-hoa/giao-hang" element={<DeliveryPage />} />
        <Route path="/hang-hoa/in-phieu-giao" element={<PrintDeliveryPage />} />
        <Route path="/hang-hoa/kho" element={<WarehousesPage />} />
        <Route path="/hang-hoa/cai-dat" element={<ProductSettingsPage />} />
        <Route path="/hang-hoa/cai-dat-rau" element={<VegetableProductSettingsPage />} />
        <Route path="/hang-hoa/bao-tai-rau" element={<ZaloVegetableArrivalManagePage />} />

        <Route path="/hanh-chinh-nhan-su" element={<ModulePage />} />
        <Route path="/hanh-chinh-nhan-su/nhan-su" element={<EmployeesPage />} />
        <Route path="/hanh-chinh-nhan-su/nhan-su/:id" element={<ProfilePage />} />
        <Route path="/hanh-chinh-nhan-su/nghi-phep" element={<LeaveRequestsPage />} />
        <Route path="/hanh-chinh-nhan-su/cham-cong" element={<AttendancePage />} />
        <Route path="/hanh-chinh-nhan-su/cau-hinh-cham-cong" element={<AttendanceLocationsPage />} />
        <Route path="/hanh-chinh-nhan-su/luong" element={<PayrollPage />} />
        <Route path="/hanh-chinh-nhan-su/cai-dat-luong" element={<SalarySettingsPage />} />
        <Route path="/hanh-chinh-nhan-su/ung-luong" element={<SalaryAdvancesPage />} />
        <Route path="/hanh-chinh-nhan-su/duyet-don" element={<ApprovalsPage />} />
        <Route path="/hanh-chinh-nhan-su/phan-quyen" element={<RolePermissionsPage />} />
        <Route path="/cai-dat-he-thong" element={<SystemSettingsPage />} />
        <Route path="/cai-dat-he-thong/zalo-tong-ket-tap-hoa" element={<ZaloGrocerySummaryManagePage />} />
        <Route path="/cai-dat-he-thong/zalo-tong-ket-vua-rau" element={<ZaloSupplierSummaryManagePage />} />
        <Route path="/cai-dat-he-thong/zalo-tong-ket-nguoi-gui-rau" element={<ZaloSenderSummaryManagePage />} />
        <Route path="/hanh-chinh-nhan-su/chi-phi" element={<Navigate to="/chi-phi/phieu" replace />} />

        <Route path="/chi-phi" element={<ModulePage />} />
        <Route path="/chi-phi/phieu" element={<ExpensesPage />} />
        <Route path="/chi-phi/lich-su" element={<ExpenseHistoryPage />} />
        <Route path="/chi-phi/in-chi-phi" element={<PrintExpensesPage />} />

        <Route path="/khach-hang">
          <Route index element={<ModulePage />} />
          <Route path="nguoi-gui-rau">
            <Route index element={<VegetableCustomersPage type="vegetable_sender" />} />
            <Route path=":id" element={<CustomerDetailPage />} />
          </Route>
          <Route path="vua-rau">
            <Route index element={<WholesaleCustomersPage type="vegetable_receiver" />} />
            <Route path=":id" element={<CustomerDetailPage />} />
          </Route>
          <Route path="nguoi-gui-tap-hoa">
            <Route index element={<GroceryCustomersPage type="grocery_sender" />} />
            <Route path=":id" element={<CustomerDetailPage />} />
          </Route>
          <Route path="nguoi-nhan-tap-hoa">
            <Route index element={<GroceryCustomersPage type="grocery_receiver" />} />
            <Route path=":id" element={<CustomerDetailPage />} />
          </Route>
          <Route path="khach-hang-than-thiet">
            <Route index element={<LoyalCustomersPage />} />
            <Route path=":id" element={<CustomerDetailPage />} />
          </Route>
        </Route>

        {/* Ke toan module */}
        <Route path="/ke-toan">
          <Route index element={<ModulePage />} />
          <Route path="khach-hang-tap-hoa">
            <Route index element={<GroceryCustomersPage type="grocery_sender" />} />
            <Route path=":id" element={<CustomerDetailPage />} />
          </Route>
          <Route path="khach-hang-rau">
            <Route index element={<VegetableCustomersPage type="vegetable_sender" />} />
            <Route path=":id" element={<CustomerDetailPage />} />
          </Route>
          <Route path="vua-rau">
            <Route index element={<WholesaleCustomersPage type="vegetable_receiver" />} />
            <Route path=":id" element={<CustomerDetailPage />} />
          </Route>
          <Route path="cong-no" element={<CustomerDebtPage />} />
          <Route path="thu-tien-sg" element={<SgCashCollectionsPage />} />
          <Route path="in-thu-tien-sg" element={<PrintSgCashCollectionsPage />} />
          <Route path="doanh-thu" element={<RevenueReportPage />} />
          <Route path="hoa-don-tap-hoa" element={<InvoiceGroceryPage />} />
          <Route path="hoa-don-rau" element={<InvoiceVegetablePage />} />
        </Route>

        {/* Quan ly xe module */}
        <Route path="/quan-ly-xe">
          <Route index element={<ModulePage />} />
          <Route path="danh-sach" element={<VehiclesPage />} />
          <Route path="ban-do-tai-xe" element={<DriverMapPage />} />
          <Route path="chuyen-giao-cua-toi" element={<DriverDeliveriesPage />} />
          <Route path="dang-giao" element={<DriverActiveTripPage />} />
          <Route path="check-in" element={<DriverCheckinPage />} />
          <Route path="thu-tien" element={<PaymentCollectionsPage />} />
        </Route>

        {/* Utility */}
        <Route path="/ban-quyen" element={<CopyrightPage />} />
        <Route path="/cai-dat" element={<SettingsPage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationProvider>
          <BreadcrumbProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
            <Toaster
            position="top-right"
            containerStyle={{ zIndex: 100000 }}
            toastOptions={{
              duration: 3000,
              style: {
                background: '#0f172a',
                color: '#f8fafc',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: '600',
                padding: '12px 16px',
                border: '1px solid rgba(255,255,255,0.1)',
              },
              success: {
                iconTheme: { primary: '#22c55e', secondary: '#fff' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#fff' },
              },
            }}
          />
        </BreadcrumbProvider>
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

