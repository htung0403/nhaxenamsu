import { createDeliveryRouter } from '../delivery/delivery.routes';
import { GroceryDeliveryService } from './grocery-deliveries.service';

export default createDeliveryRouter('standard', GroceryDeliveryService);
