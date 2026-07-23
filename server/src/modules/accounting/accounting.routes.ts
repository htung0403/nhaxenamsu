import { Router } from 'express';
import { AccountingController } from './accounting.controller';
import { authMiddleware } from '../../middlewares/auth';
import { requirePolicy, requirePagePermission, requireRolesOnly } from '../../middlewares/role';

const router = Router();

router.use(authMiddleware);

router.get('/debts', requirePolicy('ACCOUNTING_REPORTS_VIEW'), AccountingController.getDebts);
router.get('/vehicle-debts', requirePolicy('ACCOUNTING_REPORTS_VIEW'), AccountingController.getVehicleDebts);
router.get('/vehicle-debt-payments', requirePolicy('ACCOUNTING_REPORTS_VIEW'), AccountingController.getVehicleDebtPayments);
router.post('/vehicle-debts/payments', requirePolicy('ACCOUNTING_DEBT_MANAGE'), AccountingController.recordVehicleDebtPayments);
router.post('/vehicle-debts/:id/payment', requirePolicy('ACCOUNTING_DEBT_MANAGE'), AccountingController.recordVehicleDebtPayment);
router.get('/revenue/by-date', requirePolicy('ACCOUNTING_REPORTS_VIEW'), AccountingController.getRevenueByDate);
router.get('/revenue/by-vehicle', requirePolicy('ACCOUNTING_REPORTS_VIEW'), AccountingController.getRevenueByVehicle);

router.get(
  '/sg-import-cash',
  requirePagePermission('/ke-toan/thu-tien-sg'),
  AccountingController.listSgImportCash
);
router.patch(
  '/sg-import-cash/bulk-confirm-handover',
  requirePagePermission('/ke-toan/thu-tien-sg'),
  requireRolesOnly('admin', 'manager', 'ke_toan'),
  AccountingController.bulkConfirmSgHandover
);
router.get(
  '/sg-import-cash/:id',
  requirePagePermission('/ke-toan/thu-tien-sg'),
  AccountingController.getSgImportCashDetail
);
router.patch(
  '/sg-import-cash/:id/confirm-handover',
  requirePagePermission('/ke-toan/thu-tien-sg'),
  requireRolesOnly('admin', 'manager', 'ke_toan'),
  AccountingController.confirmSgHandover
);

router.get(
  '/invoice-orders',
  requirePagePermission('/ke-toan/hoa-don-tap-hoa', '/ke-toan/hoa-don-rau'),
  AccountingController.getInvoiceOrders
);

router.patch(
  '/invoice-orders/mark-exported',
  requirePagePermission('/ke-toan/hoa-don-tap-hoa', '/ke-toan/hoa-don-rau'),
  requireRolesOnly('admin', 'manager', 'ke_toan'),
  AccountingController.bulkMarkInvoiceExported
);

export default router;
