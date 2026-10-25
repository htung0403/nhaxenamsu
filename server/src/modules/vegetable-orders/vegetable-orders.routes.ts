import { createImportOrderRouter } from '../import-orders/import-orders.routes';
import { VegetableOrderService } from './vegetable-orders.service';

export default createImportOrderRouter('vegetable', VegetableOrderService);
