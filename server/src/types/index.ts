export type Role = 'admin' | 'manager' | 'staff' | 'driver' | 'customer' | (string & {});

export interface UserPayload {
  id: string;
  email: string;
  role: Role;
  full_name: string;
  avatar_url?: string;
}



export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: PaginationMeta;
  error?: string;
  code?: string;
}

// --- Payment Collections ---
export type PaymentCollectionStatus = 'draft' | 'submitted' | 'confirmed' | 'self_confirmed' | 'cancelled';
export type PaymentReceiverType = 'staff' | 'manager';

export interface PaymentCollection {
  id: string;
  deliveryOrderId: string;
  deliveryOrderCode: string;
  customerId: string;
  customerName: string;
  driverId: string;
  driverName: string;
  vehicleId: string;
  licensePlate: string;
  expectedAmount: number;
  collectedAmount: number;
  difference: number;                  // collectedAmount - expectedAmount
  collectedAt: string;
  status: PaymentCollectionStatus;
  submittedAt?: string;
  receiverId?: string;
  receiverName?: string;
  receiverType?: PaymentReceiverType;
  confirmedAt?: string;
  selfConfirmReason?: string;
  notes?: string;
  imageUrl?: string;
  totalPackages?: number;
  pricePerPackage?: number;
}

export interface CreatePaymentCollectionDto {
  deliveryOrderId: string;
  collectedAmount: number;
  collectedAt: string;
  notes?: string;
  imageUrl?: string;
}

export interface SubmitPaymentDto {
  receiverId: string;
  receiverType: PaymentReceiverType;
  submittedAt: string;
  notes?: string;
}

export interface ConfirmPaymentDto {
  confirmedAt: string;
  notes?: string;
}

