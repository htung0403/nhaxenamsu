import { Router } from 'express';
import { CustomerController } from './customers.controller';
import { authMiddleware } from '../../middlewares/auth';
import { requirePolicy } from '../../middlewares/role';
import { requireRolesOnly } from '../../middlewares/role';

const router = Router();

router.use(authMiddleware);

router.get(
	'/me/orders',
	requireRolesOnly('customer'),
	requirePolicy('CUSTOMER_ORDERS_MANAGE'),
	CustomerController.getMyOrders
);

router.get(
	'/me/order-products',
	requireRolesOnly('customer'),
	requirePolicy('CUSTOMER_ORDERS_MANAGE'),
	CustomerController.getMyOrderProducts
);

router.get(
	'/me/delivery-orders',
	requireRolesOnly('customer'),
	requirePolicy('CUSTOMER_ORDERS_MANAGE'),
	CustomerController.getMyDeliveryOrders
);

router.get(
	'/me/delivery-vehicles',
	requireRolesOnly('customer'),
	requirePolicy('CUSTOMER_ORDERS_MANAGE'),
	CustomerController.getMyDeliveryVehicles
);

router.post(
	'/me/orders',
	requireRolesOnly('customer'),
	requirePolicy('CUSTOMER_ORDERS_SELF_CREATE'),
	CustomerController.createMyOrder
);

router.put(
	'/me/orders/:orderId',
	requireRolesOnly('customer'),
	requirePolicy('CUSTOMER_ORDERS_MANAGE'),
	CustomerController.updateMyOrder
);

router.get(
	'/',
	requirePolicy('CUSTOMERS_SHARED_LOOKUP'),
	CustomerController.getAll
);

router.post(
	'/',
	requirePolicy('CUSTOMERS_SHARED_LOOKUP'),
	CustomerController.create
);

router.post(
	'/merge',
	requireRolesOnly('admin', 'manager'),
	CustomerController.merge
);

router.post(
	'/geocode',
	requirePolicy('CUSTOMERS_SHARED_LOOKUP'),
	CustomerController.geocode
);

router.post(
	'/address-suggestions',
	requirePolicy('CUSTOMERS_SHARED_LOOKUP'),
	CustomerController.autocompleteAddress
);

router.post(
	'/address-suggestions/resolve',
	requirePolicy('CUSTOMERS_SHARED_LOOKUP'),
	CustomerController.resolveAddress
);

router.post(
	'/merge/undo/:mergeId',
	requireRolesOnly('admin', 'manager'),
	CustomerController.undoMerge
);

router.get(
	'/vegetable-senders/:senderId/receivers/:receiverKey/orders',
	requirePolicy('CUSTOMERS_DIRECTORY_READ', 'CUSTOMER_ORDERS_MANAGE'),
	CustomerController.getVegetableOrdersBySenderAndReceiver
);
router.get(
	'/vegetable-senders/:senderId/receivers',
	requirePolicy('CUSTOMERS_DIRECTORY_READ', 'CUSTOMER_ORDERS_MANAGE'),
	CustomerController.getVegetableReceiverCustomersBySender
);
router.put(
	'/bulk-loyal',
	requirePolicy('CUSTOMERS_SHARED_LOOKUP'),
	CustomerController.bulkSetLoyal
);

router.put(
	'/:id',
	requirePolicy('CUSTOMERS_SHARED_LOOKUP'),
	CustomerController.update
);

router.delete(
	'/:id',
	requirePolicy('CUSTOMERS_SHARED_LOOKUP'),
	CustomerController.delete
);

router.get(
	'/:id',
	requirePolicy('CUSTOMERS_DIRECTORY_READ'),
	CustomerController.getById
);

router.get('/user/:userId', requirePolicy('PROFILE_VIEW'), CustomerController.getByUserId);
router.get('/:id/orders', requirePolicy('CUSTOMERS_DIRECTORY_READ'), CustomerController.getOrders);
router.get('/:id/export-orders', requirePolicy('CUSTOMERS_DIRECTORY_READ'), CustomerController.getExportOrders);
router.get('/:id/delivery-orders', requirePolicy('CUSTOMERS_DIRECTORY_READ'), CustomerController.getDeliveryOrders);
router.put('/:id/delivery-order-prices', requirePolicy('CUSTOMERS_DIRECTORY_READ'), CustomerController.updateDeliveryOrderPrices);
router.get('/:id/receipts', requirePolicy('CUSTOMERS_DIRECTORY_READ'), CustomerController.getReceipts);
router.get('/:id/debt', requirePolicy('ACCOUNTING_DEBT_MANAGE'), CustomerController.getDebt);
router.put('/:id/payment', requirePolicy('ACCOUNTING_DEBT_MANAGE'), CustomerController.updatePayment);
router.post('/create-account', requirePolicy('CUSTOMERS_DIRECTORY_READ'), CustomerController.createAccount);

export default router;
