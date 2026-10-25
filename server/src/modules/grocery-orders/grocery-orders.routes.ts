import { createImportOrderRouter } from '../import-orders/import-orders.routes';
import { GroceryOrderService } from './grocery-orders.service';

export default createImportOrderRouter('standard', GroceryOrderService);
