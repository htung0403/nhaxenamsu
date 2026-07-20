// ============================================================
// Types matching server/database/schema.sql
// ============================================================

// --- Auth & Users ---
export type Role = 'admin' | 'manager' | 'staff' | 'driver' | 'customer' | (string & {});

export interface User {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other';
  citizen_id?: string;
  job_title?: string;
  department?: string;
  personal_email?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  city?: string;
  district?: string;
  ward?: string;
  address_line?: string;
  temporary_address?: string;
  role: Role;
  is_active: boolean;
  avatar_url?: string;
  app_user_roles?: Array<{
    role_id: string;
    app_roles?: {
      id: string;
      role_key: string;
      role_name: string;
    } | null;
  }>;
  created_at: string;
  updated_at: string;
}

export interface LoginPayload {
  phone: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: Role;
    full_name: string;
    avatar_url?: string;
  };
  session: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
  };
}

// --- Warehouses ---
export interface Warehouse {
  id: string;
  name: string;
  address?: string;
  capacity?: number;
  current_stock: number;
  manager_id?: string;
  created_at: string;
  // Nested
  profiles?: { full_name: string; role?: string };
}

// --- Price Settings ---
export interface PriceSetting {
  id: string;
  setting_key: string;
  value: number;
  description?: string;
  updated_by?: string;
  profiles?: { full_name: string; role?: string };
}

// --- Role Salaries ---
export interface RoleSalary {
  id: string;
  role_key: string;
  role_name: string;
  daily_wage: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface AppPermission {
  id: string;
  permission_key: string;
  page_path: string;
  page_name: string;
  module_key: string;
  module_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppRole {
  id: string;
  role_key: string;
  role_name: string;
  description?: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  page_paths?: string[];
}

// --- Products ---
export interface Product {
  id: string;
  name: string;
  category?: string;
  base_price: number;
  price_per_weight: number; // kg unit for the price (e.g. 10 = "per 10kg")
  description?: string;
  image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// --- Expenses ---
export type ExpensePaymentStatus = 'unpaid' | 'paid' | 'confirmed';

export interface Expense {
  id: string;
  employee_id: string;
  vehicle_id?: string | null;
  expense_name: string;
  amount: number;
  /** ISO 8601 (timestamptz từ API), ví dụ 2026-04-24T09:30:00.000+07:00 */
  expense_date: string;
  image_urls: string[];
  payment_status: ExpensePaymentStatus;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Nested relations from API
  employee?: { id: string; full_name: string };
  vehicle?: { id: string; license_plate: string } | null;
  confirmer?: { id: string; full_name: string } | null;
}

// --- Customers ---
export interface Customer {
  id: string;
  user_id?: string;
  name: string;
  phone?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  customer_type?:
    | 'retail'
    | 'wholesale'
    | 'grocery'
    | 'vegetable'
    | 'grocery_sender'
    | 'grocery_receiver'
    | 'vegetable_sender'
    | 'vegetable_receiver';
  total_orders: number;
  total_revenue: number;
  debt: number;
  is_loyal?: boolean;
  aliases?: string[];
  created_at: string;
  deleted_at?: string | null;
}

// --- Import Orders ---
export type PackageType = 'thùng' | 'bao' | 'kiện' | 'pallet' | 'khác';
export type OrderStatus = 'pending' | 'processing' | 'delivered' | 'returned';

export interface ImportOrder {
  id: string;
  order_code: string;
  order_date: string;
  order_time: string;
  sender_name: string;
  sender_id?: string;
  receiver_name: string;
  receiver_phone?: string;
  receiver_address?: string;
  license_plate?: string;
  driver_name?: string;
  supplier_name?: string;
  sheet_number?: string;
  quantity?: number;
  unit_price?: number;
  total_order_amount?: number; 
  total_amount?: number;
  is_custom_amount?: boolean;
  payment_status?: 'paid' | 'unpaid' | 'partial';
  received_by?: string;
  warehouse_id?: string;
  product_id?: string;
  order_category?: 'standard' | 'vegetable';
  status: OrderStatus;
  admin_confirmed_at?: string | null;
  admin_confirmed_by?: string | null;
  customer_id?: string;
  notes?: string;
  receipt_image_url?: string;
  receipt_image_urls?: string[];
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  tai_rank?: number;
  selected_alias?: string;
  // Invoice export tracking
  invoice_exported?: boolean;
  invoice_exported_at?: string | null;
  invoice_exported_by?: string | null;
  // Nested relations from API
  import_order_items?: ImportOrderItem[];
  profiles?: { full_name: string; role?: string };
  warehouses?: { name: string };
  customers?: { id: string; name: string; phone?: string; address?: string; aliases?: string[] };
  sender_customers?: { id: string; name: string; phone?: string };
  products?: Product;
}

export interface ImportOrderItem {
  id: string;
  import_order_id: string;
  product_id?: string;
  package_type?: string;
  item_note?: string;
  package_quantity?: number;
  weight_kg?: number;
  quantity: number;
  unit_price?: number;
  total_amount?: number;
  image_url?: string;
  image_urls?: string[];
  payment_status: 'paid' | 'unpaid';
  created_at: string;
  // Nested
  products?: Product;
}

export interface ImportOrderCreatePayload {
  order_date: string;
  order_time: string;
  received_by?: string;
  receiver_phone?: string;
  receiver_address?: string;
  warehouse_id?: string;
  order_category?: 'standard' | 'vegetable';
  status?: OrderStatus;
  customer_id?: string;
  notes?: string;
  items: Omit<ImportOrderItem, 'id' | 'import_order_id' | 'created_at' | 'total_amount'>[];
}

// --- Export Orders ---
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface ExportOrder {
  id: string;
  export_date: string;
  product_id?: string;
  warehouse_id?: string;
  quantity: number;
  customer_id?: string;
  debt_amount: number;
  payment_status: PaymentStatus;
  paid_amount: number;
  image_url?: string;
  created_by?: string;
  created_at: string;
  // Nested
  customers?: { id: string; name: string; debt: number; phone?: string; address?: string };
  products?: Product;
  warehouses?: { name: string };
}

// --- Delivery Orders ---
export type DeliveryStatus = 'hang_o_sg' | 'can_giao' | 'da_giao';

export interface DeliveryOrder {
  id: string;
  import_order_id?: string;
  vegetable_order_id?: string;
  product_name: string;
  total_quantity: number;
  delivered_quantity: number;
  remaining_quantity: number; // GENERATED
  unit_price?: number;
  import_cost?: number;
  payment_method?: string;
  order_category?: 'standard' | 'vegetable';
  status: DeliveryStatus;
  delivery_date?: string;
  /** Giờ giao (TIME → API thường trả "HH:mm:ss") */
  delivery_time?: string | null;
  /** Thời điểm (ISO UTC) lần đầu đơn đủ SL / tài xế giao xong (da_giao) */
  driver_delivered_at?: string | null;
  /** Thời điểm xác nhận chuyển từ hang_o_sg → can_giao */
  confirmed_at?: string | null;
  /** Thời điểm admin xác nhận đã giao hàng tồn kho — khi set thì ẩn khỏi trang Tồn kho */
  warehouse_confirmed_at?: string | null;
  export_order_payment_status?: PaymentStatus;
  price_confirmed?: boolean;
  image_url?: string | null;
  image_urls?: string[];
  created_at: string;
  updated_at: string;
  // Nested
  delivery_vehicles?: DeliveryVehicle[];
    import_orders?: {
      order_code: string;
      created_at?: string;
      sender_name: string;
      sender_id?: string | null;
      receiver_name: string;
      receiver_phone?: string;
      customer_id?: string | null;
      license_plate?: string;
      driver_name?: string | null;
      received_by?: string | null;
      admin_confirmed_at?: string | null;
      customers?: { name: string; phone?: string };
      sender_customers?: { name: string; phone?: string };
      total_amount?: number;
      payment_status?: 'paid' | 'unpaid' | 'partial';
      profiles?: { full_name: string; role?: string };
      selected_alias?: string | null;
      receipt_image_url?: string | null;
      receipt_image_urls?: string[];
      import_order_items?: Array<{
        id?: string;
        image_url?: string | null;
        image_urls?: string[];
        products?: { name?: string };
      }>;
      vegetable_order_items?: Array<{
        id?: string;
        image_url?: string | null;
        image_urls?: string[];
        products?: { name?: string };
      }>;
      deleted_at?: string | null;
    };
    vegetable_orders?: {
      order_code: string;
      sender_name: string;
      sender_id?: string | null;
      receiver_name: string;
      receiver_phone?: string;
      customer_id?: string | null;
      license_plate?: string;
      driver_name?: string | null;
      received_by?: string | null;
      customers?: { name: string; phone?: string };
      sender_customers?: { name: string; phone?: string };
      total_amount?: number;
      payment_status?: 'paid' | 'unpaid' | 'partial';
      profiles?: { full_name: string };
      selected_alias?: string | null;
      receipt_image_url?: string | null;
      receipt_image_urls?: string[];
      import_order_items?: Array<{
        id?: string;
        image_url?: string | null;
        image_urls?: string[];
        products?: { name?: string };
      }>;
      vegetable_order_items?: Array<{
        id?: string;
        image_url?: string | null;
        image_urls?: string[];
        products?: { name?: string };
      }>;
      deleted_at?: string | null;
    };
  payment_collections?: {
    id: string;
    status: PaymentCollectionStatus;
    vehicle_id: string;
    delivery_vehicle_id?: string | null;
    expected_amount?: number | null;
    collected_amount?: number | null;
    image_url?: string;
    image_urls?: string[];
  }[];
  source_order_ids?: string[];
  source_orders?: DeliveryOrder[];
}

// --- Vehicles ---
export type VehicleStatus = 'available' | 'in_transit' | 'maintenance';
export type VehicleGoodsCategory = 'grocery' | 'vegetable';

export interface Vehicle {
  id: string;
  license_plate: string;
  vehicle_type?: string;
  load_capacity_ton?: number;
  goods_categories?: VehicleGoodsCategory[];
  driver_id?: string | null;
  in_charge_id?: string | null;
  status: VehicleStatus;
  created_at: string;
  // Nested
  profiles?: { full_name: string; phone?: string | null };
  responsible_profile?: { full_name: string; phone?: string | null };
}

// --- Delivery Vehicles ---
export type DeliveryVehicleStatus = 'assigned' | 'in_transit' | 'completed';

export interface DeliveryVehicle {
  id: string;
  delivery_order_id: string;
  vehicle_id?: string;
  driver_id?: string;
  loader_name?: string;
  assigned_quantity?: number;
  expected_amount?: number;
  image_urls?: string[];
  delivery_date?: string;
  delivery_time?: string;
  export_payment_status?: 'paid' | 'unpaid';
  status: DeliveryVehicleStatus;
  assigned_at: string;
  vehicles?: Vehicle;
  profiles?: { full_name: string; phone?: string | null };
  delivery_orders?: DeliveryOrder & {
    import_orders?: {
      order_code: string;
      receiver_name: string;
      customers?: { name: string };
      total_amount?: number;
    };
  };
}

// --- Vehicle Checkins ---
export type CheckinType = 'in' | 'out';

export interface VehicleCheckin {
  id: string;
  vehicle_id?: string;
  driver_id?: string;
  checkin_type: CheckinType;
  latitude?: number;
  longitude?: number;
  address_snapshot?: string;
  checkin_time: string;
}

// --- Payment Collections ---
export type PaymentCollectionStatus = 'draft' | 'submitted' | 'confirmed' | 'self_confirmed' | 'cancelled';
export type PaymentReceiverType = 'staff' | 'manager';

export interface PaymentCollection {
  id: string;
  deliveryOrderId: string;
  deliveryVehicleId?: string | null;
  sourceOrderIds?: string[];
  deliveryOrderCode: string;
  productName?: string;
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
  confirmedById?: string;
  confirmedByName?: string;
  selfConfirmReason?: string;
  notes?: string;
  imageUrl?: string;
  imageUrls?: string[];
  totalPackages?: number;
  pricePerPackage?: number;
}

export interface CreatePaymentCollectionDto {
  deliveryOrderId: string;
  sourceOrderIds?: string[];
  collectedAmount: number;
  collectedAt: string;
  notes?: string;
  imageUrl?: string;
}

export interface UpdatePaymentCollectionDto {
  collectedAmount?: number;
  collectedAt?: string;
  expectedAmount?: number;
  pricePerPackage?: number;
  totalPackages?: number;
  notes?: string;
  imageUrl?: string | null;
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

// --- Receipts ---
export interface Receipt {
  id: string;
  customer_id: string;
  amount: number;
  payment_date: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Nested relations
  profiles?: { full_name: string };
}

// --- Leave Requests ---
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  employee_id: string;
  from_date: string;
  to_date: string;
  reason?: string;
  status: LeaveStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  review_note?: string;
  created_at: string;
  // Nested
  profiles?: { full_name: string };
}

// --- Salary Advances ---
export type AdvanceStatus = 'pending' | 'approved' | 'rejected';

export interface SalaryAdvance {
  id: string;
  employee_id: string;
  amount: number;
  reason: string;
  status: AdvanceStatus;
  approved_by?: string;
  approved_at?: string;
  week_start?: string;
  created_at: string;
  // Nested
  profiles?: { full_name: string };
}

// --- Attendance ---
export interface Attendance {
  id: string;
  employee_id: string;
  work_date: string;
  is_present: boolean;
  check_in_time?: string | null;
  note?: string;
}

// --- Compensatory Attendances ---
export type CompensatoryStatus = 'pending' | 'approved' | 'rejected';

export interface CompensatoryAttendance {
  id: string;
  employee_id: string;
  work_date: string;
  check_in_time?: string | null;
  reason: string;
  status: CompensatoryStatus;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  profiles?: { full_name: string };
}

// --- Payroll ---
export type PayrollStatus = 'draft' | 'confirmed' | 'paid';

export interface Payroll {
  id: string;
  employee_id: string;
  week_start: string;
  week_end: string;
  days_worked: number;
  daily_wage: number;
  gross_salary: number; // GENERATED
  total_advances: number;
  net_salary: number;   // GENERATED
  status: PayrollStatus;
  created_by?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  // Nested
  profiles?: { full_name: string };
}

// --- API Response (matching server types) ---
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: PaginationMeta;
  error?: string;
  code?: string;
}

// --- Filter helpers ---
export interface ImportOrderFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  order_category?: 'standard' | 'vegetable';
  sender?: string;
  receiver?: string;
  customer_id?: string;
  license_plate?: string;
  received_by?: string;
  admin_confirmation_status?: 'pending_customer' | 'official' | 'return_to_sg';
  search?: string;
  page?: number;
  pageSize?: number;
}


