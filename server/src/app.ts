import express from 'express';
import './types';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler } from './middlewares/errorHandler';

// Import Routes
import authRoutes from './modules/auth/auth.routes';
import warehouseRoutes from './modules/warehouse/warehouse.routes';
import settingRoutes from './modules/settings/settings.routes';
import importOrderRoutes from './modules/import-orders/import-orders.routes';
import exportOrderRoutes from './modules/export-orders/export-orders.routes';
import deliveryRoutes from './modules/delivery/delivery.routes';
import customerRoutes from './modules/customers/customers.routes';
import vehicleRoutes from './modules/vehicles/vehicles.routes';
import paymentCollectionRoutes from './modules/vehicles/payment-collections.routes';
import hrRoutes from './modules/hr/hr.routes';
import payrollRoutes from './modules/payroll/payroll.routes';
import accountingRoutes from './modules/accounting/accounting.routes';
import productRoutes from './modules/products/products.routes';
import uploadRoutes from './modules/upload/upload.routes';
import rolesRoutes from './modules/roles/roles.routes';
import zaloRoutes from './modules/notifications/zalo.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import publicDeliveryRoutes from './modules/delivery/public.routes';
import driverTrackingRoutes from './modules/driver-tracking/driver-tracking.routes';
import driverDeliveriesRoutes from './modules/driver-deliveries/driver-deliveries.routes';
import routingRoutes from './modules/routing/routing.routes';

const app = express();

// Enable trust proxy for Fly.io/Proxies to fix rate-limit warnings
app.set('trust proxy', 1);

// 1. Security Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-page-path']
}));
app.use(express.json());

// 2. Logging
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// 3. Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use('/api', limiter);

// 4. Public API Routes (no auth)
app.use('/api/public/delivery', publicDeliveryRoutes);
app.use('/api/public/summary', require('./modules/notifications/public.routes').default);

// 5. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/import-orders', importOrderRoutes);
app.use('/api/export-orders', exportOrderRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/payment-collections', paymentCollectionRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/products', productRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/notifications/zalo', zaloRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/driver-tracking', driverTrackingRoutes);
app.use('/api/driver-deliveries', driverDeliveriesRoutes);
app.use('/api/routing', routingRoutes);



// 5. Health Check
app.get('/health', (req: express.Request, res: express.Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 6. Global Error Handler
app.use(errorHandler);

// 7. Start Server
const PORT = env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Environment: ${env.NODE_ENV}`);
});

import { initZaloScheduler } from './modules/notifications/zalo.scheduler';
import { initDriverTrackingScheduler } from './modules/driver-tracking/driver-tracking.scheduler';

// Initialize schedulers
initZaloScheduler();
initDriverTrackingScheduler();

export default app;
