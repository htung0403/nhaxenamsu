import { createDeliveryRouter } from '../delivery/delivery.routes';
import { VegetableDeliveryService } from './vegetable-deliveries.service';

export default createDeliveryRouter('vegetable', VegetableDeliveryService);
