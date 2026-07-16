import type { DeliveryVehicle, PaymentCollectionStatus } from '../types';

type DeliveryPaymentCollection = {
  id: string;
  status: PaymentCollectionStatus;
  vehicle_id?: string | null;
  delivery_vehicle_id?: string | null;
  expected_amount?: number | null;
  collected_amount?: number | null;
};

const PAID_COLLECTION_STATUSES = new Set<PaymentCollectionStatus>(['confirmed', 'self_confirmed']);

export const isPaidCollectionStatus = (status?: PaymentCollectionStatus | string | null) =>
  status === 'confirmed' || status === 'self_confirmed';

export const isDeliveryVehiclePaymentPaid = (
  deliveryVehicle: DeliveryVehicle,
  paymentCollections?: DeliveryPaymentCollection[],
  _siblingDeliveryVehicles?: DeliveryVehicle[],
) => {
  const paidCollections = (paymentCollections || []).filter((pc) => PAID_COLLECTION_STATUSES.has(pc.status));

  if (deliveryVehicle.id) {
    return paidCollections.some((pc) => pc.delivery_vehicle_id === deliveryVehicle.id);
  }

  return paidCollections.some((pc) => {
    if (pc.delivery_vehicle_id) return false;
    if (pc.vehicle_id !== deliveryVehicle.vehicle_id) return false;
    const collectionAmount = Number(pc.expected_amount || pc.collected_amount || 0);
    const tripAmount = Number(deliveryVehicle.expected_amount || 0);
    if (collectionAmount > 0 && tripAmount > 0) return collectionAmount === tripAmount;
    return false;
  });
};

