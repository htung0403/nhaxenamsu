import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock3, Eye, Image as ImageIcon, ImagePlus, Loader2, Package, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import ErrorState from '../../components/shared/ErrorState';
import { DatePicker } from '../../components/shared/DatePicker';
import { DateRangePicker } from '../../components/shared/DateRangePicker';
import { TimePicker24h } from '../../components/shared/TimePicker24h';
import { SearchInput } from '../../components/ui/SearchInput';
import { useAuth } from '../../context/AuthContext';
import { useCustomerByUserId, useCreateMyOrder, useMyDeliveryOrders, useMyDeliveryVehicles, useUpdateMyOrder } from '../../hooks/queries/useCustomers';
import { useMyPermissions } from '../../hooks/queries/useRoles';
import { uploadApi } from '../../api/uploadApi';
import { VehicleCellTooltip } from '../delivery/components/VehicleCellTooltip';
import OrderImagesDialog from '../delivery/dialogs/OrderImagesDialog';
import { cloudinarySmall } from '../../lib/cloudinaryUrl';
import { getEffectiveDeliveryStatus } from '../../lib/deliveryAgeRule';
import type { Customer, DeliveryOrder, ImportOrder } from '../../types';

const CUSTOMER_ORDER_CREATE_PATH = '/tai-khoan/don-hang/tao-don';
const GROCERY_RECEIVER_RETURN_CREATE_PATH = '/don-hang-cua-toi/tao-don-doi-tra';

const getToday = () => new Date().toISOString().slice(0, 10);
const getCurrentTime = () => new Date().toTimeString().slice(0, 5);
const formatDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const getOneWeekAgo = () => {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return formatDateInputValue(date);
};
const getOrderDateValue = (order: DeliveryOrder) => (order.delivery_date || order.created_at || '').slice(0, 10);
const isOrderInDateRange = (order: DeliveryOrder, startDate: string, endDate: string) => {
  const orderDate = getOrderDateValue(order);
  if (!orderDate) return false;
  if (startDate && orderDate < startDate) return false;
  if (endDate && orderDate > endDate) return false;
  return true;
};
const formatNumber = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
const formatDisplayDate = (value?: string | null) => {
  if (!value) return '-';
  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
};
const FALLBACK_VEHICLE_COLUMNS = ['1', '2', '3', '4', '5', '6', '7', '8', 'ba', 'kho'];
const isPaidCollectionStatus = (status?: string) => status === 'confirmed' || status === 'self_confirmed';

type FormState = {
  order_date: string;
  order_time: string;
  sender_name: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  total_amount: string;
  payment_status: 'paid' | 'unpaid';
  notes: string;
  items: CustomerOrderItemForm[];
};

type CustomerOrderItemForm = {
  product_id: string;
  product_name: string;
  package_type: string;
  item_note: string;
  weight_kg: string;
  quantity: string;
  unit_price: string;
  image_url: string | null;
  image_urls: string[];
};

const createInitialItem = (): CustomerOrderItemForm => ({
  product_id: '',
  product_name: '',
  package_type: '',
  item_note: '',
  weight_kg: '',
  quantity: '1',
  unit_price: '',
  image_url: null,
  image_urls: [],
});

const createInitialFormState = (): FormState => ({
  order_date: getToday(),
  order_time: getCurrentTime(),
  sender_name: '',
  receiver_name: '',
  receiver_phone: '',
  receiver_address: '',
  total_amount: '',
  payment_status: 'unpaid',
  notes: '',
  items: [createInitialItem()],
});

const getCustomerOrderPolicy = (customerType?: Customer['customer_type']) => {
  if (customerType === 'grocery_sender') return { orderCategory: 'standard' as const, binding: 'sender' as const };
  if (customerType === 'grocery_receiver') return { orderCategory: 'standard' as const, binding: 'receiver' as const };
  if (customerType === 'vegetable_sender') return { orderCategory: 'vegetable' as const, binding: 'sender' as const };
  if (customerType === 'vegetable_receiver') return { orderCategory: 'vegetable' as const, binding: 'receiver' as const };
  return null;
};

const customerTypeLabel: Record<string, string> = {
  grocery_sender: 'Khách gửi tạp hóa',
  grocery_receiver: 'Khách nhận tạp hóa',
  vegetable_sender: 'Khách gửi rau củ',
  vegetable_receiver: 'Khách nhận rau củ',
};

const statusConfig: Record<string, { label: string; className: string }> = {
  in_sg: {
    label: 'Hàng ở SG',
    className: 'bg-primary/10 text-primary border-primary/20',
  },
  processing: {
    label: 'Đang giao',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  delivered: {
    label: 'Đã giao',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  returned: {
    label: 'Đang giao',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
};

type OrderStatusFilter = 'in_sg' | 'processing' | 'delivered';

const statusFilterLabels: Record<OrderStatusFilter, string> = {
  in_sg: 'Hàng ở SG',
  processing: 'Đang giao',
  delivered: 'Đã giao',
};

const statusFilterClasses: Record<OrderStatusFilter, { active: string; badge: string }> = {
  in_sg: { active: 'bg-primary/10 text-primary', badge: 'bg-primary/10 text-primary' },
  processing: { active: 'bg-amber-50 text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  delivered: { active: 'bg-emerald-50 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
};

type PaymentStatusKey = 'unpaid' | 'partial' | 'paid_sg' | 'paid_driver';

const paymentStatusConfig: Record<PaymentStatusKey, { label: string; className: string }> = {
  unpaid: { label: 'Chưa trả cước', className: 'bg-red-500/10 text-red-700 dark:text-red-500 border-red-200/20' },
  partial: { label: 'Trả một phần', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200/20' },
  paid_sg: { label: 'Đã trả cước', className: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-500 border-indigo-200/20' },
  paid_driver: { label: 'Đã trả cước', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-200/20' },
};

type DeliverySourceOrder = NonNullable<DeliveryOrder['import_orders']> | NonNullable<DeliveryOrder['vegetable_orders']>;

type DeliveryImageRef = {
  image_url?: string | null;
  image_urls?: string[] | null;
  products?: { name?: string | null } | null;
};

const getOrderFilterStatus = (order: DeliveryOrder): OrderStatusFilter => {
  const effectiveStatus = getEffectiveDeliveryStatus(order);
  if (effectiveStatus === 'hang_o_sg') return 'in_sg';
  if (effectiveStatus === 'can_giao') return 'processing';
  return 'delivered';
};

const getDeliverySourceOrder = (order: DeliveryOrder): DeliverySourceOrder | undefined => {
  return order.vegetable_orders || order.import_orders;
};

const getCustomerDeliveryReceiverName = (order: DeliveryOrder) => {
  const sourceOrder = getDeliverySourceOrder(order);
  if (!sourceOrder) return '-';
  if (order.status === 'hang_o_sg' && sourceOrder.selected_alias) return sourceOrder.selected_alias;
  return sourceOrder.customers?.name || sourceOrder.receiver_name?.trim() || sourceOrder.profiles?.full_name || '-';
};

const getCustomerSourcePaymentStatus = (order: DeliveryOrder) => {
  return getDeliverySourceOrder(order)?.payment_status || 'unpaid';
};

const getDisplayProductName = (order: DeliveryOrder) => {
  const productName = order.product_name || '-';
  return productName.includes(' - ')
    ? productName.split(' - ').slice(1).join(' - ').trim() || productName
    : productName;
};

const getCustomerDeliveryGroupKey = (order: DeliveryOrder) => {
  if (order.status === 'hang_o_sg') return `single:${order.id}`;
  const deliveryDate = order.delivery_date || 'N/A';
  const category = order.order_category || 'standard';
  const receiver = getCustomerDeliveryReceiverName(order);
  const product = (order.product_name || '').trim();
  const paymentStatus = getCustomerSourcePaymentStatus(order);
  return `${deliveryDate}|${category}|${receiver}|${product}|${paymentStatus}`;
};

const groupCustomerDeliveryOrders = (orders: DeliveryOrder[]) => {
  const map = new Map<string, DeliveryOrder[]>();
  orders.forEach((order) => {
    const key = getCustomerDeliveryGroupKey(order);
    const list = map.get(key) || [];
    list.push(order);
    map.set(key, list);
  });

  return Array.from(map.values()).map((group) => {
    const ordered = [...group].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const first = ordered[0];
    const totalQuantity = ordered.reduce((sum, order) => sum + Number(order.total_quantity || 0), 0);
    const mergedDeliveryVehicles = ordered.flatMap((order) => order.delivery_vehicles || []);
    const mergedPaymentCollections = ordered.flatMap((order) => order.payment_collections || []);
    const sourceIds = ordered.map((order) => order.id);
    const allInSg = ordered.every((order) => order.status === 'hang_o_sg');
    const hasDelivered = ordered.some((order) => order.status === 'da_giao');

    return {
      ...first,
      total_quantity: totalQuantity,
      delivery_vehicles: mergedDeliveryVehicles,
      payment_collections: mergedPaymentCollections,
      source_order_ids: sourceIds,
      source_orders: ordered,
      status: allInSg ? 'hang_o_sg' : (hasDelivered ? 'da_giao' : 'can_giao'),
    } as DeliveryOrder;
  });
};

const getOrderPaymentStatus = (order: DeliveryOrder): PaymentStatusKey => {
  const sourceOrder = getDeliverySourceOrder(order);

  if (sourceOrder?.payment_status === 'paid') return 'paid_sg';
  if (order.export_order_payment_status) return order.export_order_payment_status === 'paid' ? 'paid_driver' : order.export_order_payment_status;

  const assignedVehicleIds = (order.delivery_vehicles || [])
    .filter((deliveryVehicle) => (deliveryVehicle.assigned_quantity || 0) > 0)
    .map((deliveryVehicle) => deliveryVehicle.vehicle_id)
    .filter((vehicleId): vehicleId is string => Boolean(vehicleId));

  if (assignedVehicleIds.length === 0) return 'unpaid';

  const paidVehicleIds = new Set(
    (order.payment_collections || [])
      .filter((paymentCollection) => isPaidCollectionStatus(paymentCollection.status))
      .map((paymentCollection) => paymentCollection.vehicle_id)
      .filter((vehicleId): vehicleId is string => Boolean(vehicleId)),
  );

  const paidCount = assignedVehicleIds.filter((vehicleId) => paidVehicleIds.has(vehicleId)).length;
  if (paidCount === 0) return 'unpaid';
  if (paidCount === assignedVehicleIds.length) return 'paid_driver';
  return 'partial';
};

const collectFirstImage = (refs: DeliveryImageRef[] | DeliveryImageRef | null | undefined, targetProductName?: string | null): string | null => {
  const list: DeliveryImageRef[] = Array.isArray(refs) ? refs : refs ? [refs] : [];
  const normalizedTarget = targetProductName?.trim().toLowerCase();

  const pickImage = (ref: DeliveryImageRef) => {
    if (ref.image_url) return ref.image_url.includes(',') ? ref.image_url.split(',')[0].trim() : ref.image_url;
    if (ref.image_urls?.length) return ref.image_urls[0];
    return null;
  };

  if (normalizedTarget) {
    for (const ref of list) {
      if (ref.products?.name?.trim().toLowerCase() === normalizedTarget) {
        const image = pickImage(ref);
        if (image) return image;
      }
    }
  }

  for (const ref of list) {
    const image = pickImage(ref);
    if (image) return image;
  }

  return null;
};

const getOrderPreviewImage = (order: DeliveryOrder | null | undefined) => {
  if (!order) return null;
  if (order.image_url) return order.image_url;
  if (order.image_urls?.length) return order.image_urls[0];

  const paymentImage = order.payment_collections?.find((paymentCollection) => paymentCollection.image_url)?.image_url;
  if (paymentImage) return paymentImage;

  const vehicleImage = (order.delivery_vehicles || []).find((deliveryVehicle) => (deliveryVehicle.image_urls?.length || 0) > 0)?.image_urls?.[0];
  if (vehicleImage) return vehicleImage;

  const sourceOrder = getDeliverySourceOrder(order);
  if (sourceOrder?.receipt_image_url) return sourceOrder.receipt_image_url;
  if (sourceOrder?.receipt_image_urls?.length) return sourceOrder.receipt_image_urls[0];

  const targetProductName = order.product_name?.includes(' - ')
    ? order.product_name.split(' - ').slice(1).join(' - ').trim()
    : order.product_name?.trim();

  return collectFirstImage(sourceOrder?.import_order_items || sourceOrder?.vegetable_order_items, targetProductName);
};

export type CustomerOrdersPageType = Extract<
  Customer['customer_type'],
  'grocery_receiver' | 'grocery_sender' | 'vegetable_receiver' | 'vegetable_sender'
>;

const GroceryReceiverOrdersPage = () => {
  const navigate = useNavigate();
  const customerType = 'grocery_receiver' as CustomerOrdersPageType;
  const { user } = useAuth();
  const { data: customer, isLoading: loadingCustomer } = useCustomerByUserId(user?.id || '');
  const { data: myPermissions } = useMyPermissions(!!user?.id);
  const createOrderMutation = useCreateMyOrder();
  const updateOrderMutation = useUpdateMyOrder();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ImportOrder | null>(null);
  const [formState, setFormState] = useState<FormState>(createInitialFormState());
  const [uploadingItemIndex, setUploadingItemIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('in_sg');
  const today = getToday();
  const oneWeekAgo = getOneWeekAgo();
  const [startDate, setStartDate] = useState(oneWeekAgo);
  const [endDate, setEndDate] = useState(today);
  const [viewingImageOrder, setViewingImageOrder] = useState<DeliveryOrder | null>(null);
  const [isViewingClosing, setIsViewingClosing] = useState(false);

  const effectiveCustomerType = customerType || customer?.customer_type;
  const orderPolicy = useMemo(() => getCustomerOrderPolicy(effectiveCustomerType), [effectiveCustomerType]);
  const isSenderCustomer = orderPolicy?.binding === 'sender';
  const orderCategory = orderPolicy?.orderCategory || 'standard';
  const isVegetableOrder = orderCategory === 'vegetable';
  const isGrocerySenderPage = effectiveCustomerType === 'grocery_sender';
  const { data: deliveryOrders, isLoading, isError, refetch } = useMyDeliveryOrders(!!user?.id);
  const { data: deliveryVehicles } = useMyDeliveryVehicles(!!user?.id);
  const canSelfCreate = (myPermissions?.page_paths || []).includes(CUSTOMER_ORDER_CREATE_PATH);
  const customerId = customer?.id;

  const sortedOrders = useMemo(() => {
    if (!deliveryOrders || !customerId || !orderPolicy) return [];
    const customerOrders = deliveryOrders.filter((order) => {
      const sourceOrder = getDeliverySourceOrder(order);
      if (!sourceOrder) return false;
      if (isSenderCustomer) return sourceOrder.sender_id === customerId;
      return sourceOrder.customer_id === customerId;
    });

    return groupCustomerDeliveryOrders(customerOrders).sort(
      (a, b) => {
        return (
          new Date(b.delivery_date || b.created_at).getTime() -
            new Date(a.delivery_date || a.created_at).getTime() ||
          new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
        );
      },
    );
  }, [customerId, deliveryOrders, isSenderCustomer, orderPolicy]);

  const dateFilteredOrders = useMemo(() => {
    return sortedOrders.filter((order) => isOrderInDateRange(order, startDate, endDate));
  }, [endDate, sortedOrders, startDate]);

  const orderSummary = useMemo(() => {
    return dateFilteredOrders.reduce(
      (summary, order) => {
        summary.total += 1;
        const status = getOrderFilterStatus(order);
        if (status === 'delivered') summary.delivered += 1;
        else if (status === 'processing') summary.processing += 1;
        return summary;
      },
      { total: 0, processing: 0, delivered: 0 },
    );
  }, [dateFilteredOrders]);

  const statusCounts = useMemo(() => {
    return dateFilteredOrders.reduce(
      (counts, order) => {
        const status = getOrderFilterStatus(order);
        counts[status] += 1;
        return counts;
      },
      { in_sg: 0, processing: 0, delivered: 0 } as Record<OrderStatusFilter, number>,
    );
  }, [dateFilteredOrders]);

  const displayedOrders = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return dateFilteredOrders.filter((order) => {
      const sourceOrder = getDeliverySourceOrder(order);
      if (getOrderFilterStatus(order) !== statusFilter) return false;
      if (!normalizedSearch) return true;
      return [
        sourceOrder?.order_code,
        order.delivery_date,
        sourceOrder?.sender_name,
        sourceOrder?.receiver_name,
        sourceOrder?.receiver_phone,
        sourceOrder?.customers?.name,
        sourceOrder?.sender_customers?.name,
        order.product_name,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });
  }, [dateFilteredOrders, searchQuery, statusFilter]);

  const currentCustomerType = effectiveCustomerType ? customerTypeLabel[effectiveCustomerType] || effectiveCustomerType : 'Chưa xác định';
  const displayedVehicles = useMemo(
    () => (deliveryVehicles || []).filter((vehicle) => {
      if (isVegetableOrder) return true;
      return vehicle.license_plate?.trim().toLowerCase() !== 'chuatimthay';
    }),
    [deliveryVehicles, isVegetableOrder],
  );

  const openCreateModal = () => {
    navigate(GROCERY_RECEIVER_RETURN_CREATE_PATH);
    return;
    setEditingOrder(null);
    setFormState((() => {
      const initialState = createInitialFormState();
      initialState.sender_name = customer?.name || '';
      return initialState;
    })());
    setIsCreateOpen(true);
  };

  const closeModal = () => {
    if (createOrderMutation.isPending || updateOrderMutation.isPending) return;
    setIsCreateOpen(false);
    setEditingOrder(null);
  };

  const updateItem = (index: number, patch: Partial<CustomerOrderItemForm>) => {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const addItem = () => {
    setFormState((prev) => ({ ...prev, items: [...prev.items, createInitialItem()] }));
  };

  const removeItem = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, itemIndex) => itemIndex !== index) : prev.items,
    }));
  };

  const uploadFiles = async (files: File[], folder: 'orders' | 'items') => {
    const invalidFile = files.find((file) => !file.type.startsWith('image/'));
    if (invalidFile) {
      toast.error('Chỉ hỗ trợ file ảnh');
      return [];
    }

    const results = await Promise.all(files.map((file) => uploadApi.uploadFile(file, 'import-orders', folder)));
    return results.map((result) => result.url);
  };

  const handleItemUpload = async (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    try {
      setUploadingItemIndex(index);
      const newUrls = await uploadFiles(files, 'items');
      if (newUrls.length > 0) {
        setFormState((prev) => ({
          ...prev,
          items: prev.items.map((item, itemIndex) => {
            if (itemIndex !== index) return item;
            const imageUrls = [...item.image_urls, ...newUrls];
            return { ...item, image_urls: imageUrls, image_url: imageUrls[0] || null };
          }),
        }));
        toast.success('Tải ảnh hàng thành công');
      }
    } catch {
      toast.error('Lỗi khi tải ảnh hàng');
    } finally {
      setUploadingItemIndex(null);
      event.target.value = '';
    }
  };

  const removeItemImage = (itemIndex: number, imageIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.map((item, currentIndex) => {
        if (currentIndex !== itemIndex) return item;
        const imageUrls = item.image_urls.filter((_, currentImageIndex) => currentImageIndex !== imageIndex);
        return { ...item, image_urls: imageUrls, image_url: imageUrls[0] || null };
      }),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const validItems = formState.items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      weight_kg: null,
      unit_price: null,
    }));

    if (validItems.some((item) => !item.product_name?.trim() || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      toast.error('Vui lòng nhập mặt hàng và số lượng lớn hơn 0');
      return;
    }

    const payload = {
      order_date: formState.order_date || undefined,
      order_time: formState.order_time || undefined,
      sender_name: customer?.name || formState.sender_name || undefined,
      receiver_name: formState.receiver_name || undefined,
      receiver_phone: formState.receiver_phone || undefined,
      receiver_address: formState.receiver_address || undefined,
      status: 'processing' as const,
      payment_status: formState.payment_status,
      total_amount: formState.total_amount ? Number(formState.total_amount) : undefined,
      notes: formState.notes || 'Đơn trả hàng lỗi về lại SG',
      is_custom_amount: true,
      order_category: orderCategory,
      items: validItems.map((item) => ({
        product_id: undefined,
        product_name: item.product_name.trim(),
        quantity: item.quantity,
        package_type: item.product_name.trim(),
        item_note: item.package_type || item.item_note || undefined,
        weight_kg: undefined,
        unit_price: undefined,
        image_url: item.image_url,
        image_urls: item.image_urls,
        payment_status: formState.payment_status,
      })),
    };

    if (editingOrder) {
      await updateOrderMutation.mutateAsync({
        orderId: editingOrder.id,
        payload,
      });
      closeModal();
      return;
    }

    await createOrderMutation.mutateAsync(payload);
    closeModal();
  };

  const isSubmitting = createOrderMutation.isPending || updateOrderMutation.isPending;
  const isInSgTab = statusFilter === 'in_sg';
  const showExcessColumn = effectiveCustomerType === 'grocery_receiver' && statusFilter === 'delivered';

  if (loadingCustomer || isLoading) {
    return (
      <div className="w-full flex-1">
        <PageHeader title="Đơn trả hàng về SG" description="Theo dõi hàng lỗi khách trả về lại SG" />
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  return (
    <div className={`animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col min-h-0 ${isGrocerySenderPage ? 'bg-slate-50/60 -m-4 p-4 md:-m-6 md:p-6' : '-mt-2'}`}>
      <PageHeader
        title="Đơn trả hàng về SG"
        description="Tạo phiếu trả hàng lỗi về SG và theo dõi trạng thái cước"
        backPath="/"
      />

      <div className="space-y-3 flex-1 min-h-0 flex flex-col">
        <div className={`bg-card flex flex-row w-full gap-2 items-center border border-border overflow-x-auto custom-scrollbar ${isGrocerySenderPage ? 'rounded-3xl shadow-sm p-3' : 'rounded-2xl shadow-sm p-2.5'}`}>
          <button
            type="button"
            onClick={openCreateModal}
            disabled={!canSelfCreate}
            className={`flex items-center gap-2 justify-center shrink-0 border border-primary/20 rounded-xl transition-all bg-primary text-white hover:bg-primary/90 font-bold text-[13px] disabled:opacity-60 ${isGrocerySenderPage ? 'h-10 px-4 shadow-sm' : 'h-9.5 px-3'}`}
            title={canSelfCreate ? 'Tạo đơn đổi trả' : 'Bạn chưa có quyền tạo đơn đổi trả'}
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Tạo đơn đổi trả</span>
          </button>

          <div className="flex-1 min-w-58 md:max-w-full">
            <SearchInput
              placeholder="Tìm mã trả hàng, người gửi, người nhận..."
              onSearch={(raw) => setSearchQuery(raw)}
              className={isGrocerySenderPage ? 'h-10 rounded-xl bg-muted/10' : 'h-9.5'}
            />
          </div>

          <div className="hidden md:flex items-center gap-2 shrink-0 rounded-xl border border-border/80 bg-muted/20 px-3 py-2 text-[12px] font-bold text-muted-foreground">
            <ShieldCheck size={15} />
            <span className="whitespace-nowrap">{currentCustomerType}</span>
          </div>

          <div className="hidden md:flex shrink-0">
            <DateRangePicker
              initialDateFrom={startDate}
              initialDateTo={endDate}
              onUpdate={(values) => {
                setStartDate(values.range.from ? formatDateInputValue(values.range.from) : '');
                setEndDate(values.range.to ? formatDateInputValue(values.range.to) : '');
              }}
            />
          </div>


        </div>

        <div className={`grid grid-cols-2 lg:grid-cols-3 shrink-0 ${isGrocerySenderPage ? 'gap-4' : 'gap-3'}`}>
          <SummaryCard icon={Package} label="Tổng phiếu" value={orderSummary.total.toLocaleString('vi-VN')} tone="text-primary bg-primary/10" />
          <SummaryCard icon={Clock3} label="Đang giao" value={orderSummary.processing.toLocaleString('vi-VN')} tone="text-amber-600 bg-amber-50" />
          <SummaryCard icon={CheckCircle2} label="Đã giao" value={orderSummary.delivered.toLocaleString('vi-VN')} tone="text-emerald-600 bg-emerald-50" />
        </div>

        <div className={`bg-card border border-border shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden ${isGrocerySenderPage ? 'rounded-3xl' : 'rounded-2xl'}`}>
          <div className={`flex flex-col shrink-0 border-b border-border ${isGrocerySenderPage ? 'bg-white' : 'bg-muted/50'}`}>
            <div className={`grid grid-cols-5 gap-1 md:flex md:items-center md:gap-1 md:overflow-x-auto custom-scrollbar ${isGrocerySenderPage ? 'px-4 py-3' : 'px-3 py-2'}`}>
              {(['in_sg', 'processing', 'delivered'] as OrderStatusFilter[]).map((status) => {
                const isActive = statusFilter === status;
                const colors = statusFilterClasses[status];
                const count = statusCounts[status];
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`w-full flex items-center justify-center md:justify-start gap-1 rounded-lg text-[10px] md:text-[12px] font-bold transition-all whitespace-nowrap ${isGrocerySenderPage ? 'px-2 md:px-4 py-2' : 'px-1.5 md:px-3 py-1.5'} ${
                      isActive ? `${colors.active} shadow-sm ring-1 ring-black/5` : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {statusFilterLabels[status]}
                    {count > 0 && (
                      <span className={`text-[9px] md:text-[10px] font-black px-1 md:px-1.5 py-0.5 rounded-full min-w-4 md:min-w-5 text-center ${isActive ? colors.badge : 'bg-muted/60 text-muted-foreground'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`flex-1 overflow-auto custom-scrollbar relative ${isGrocerySenderPage ? 'bg-white' : 'bg-muted/30 md:bg-transparent'}`}>
            <div className={isInSgTab ? 'block min-w-[760px]' : 'hidden md:block'}>
              <table className="w-full border-collapse bg-card text-[13px]">
                <thead className="sticky top-0 z-20">
                  <tr className={`${isGrocerySenderPage ? 'bg-slate-50' : 'bg-card'} border-b border-border text-muted-foreground`}>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left border-r border-border">Ngày</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left border-r border-border">{isSenderCustomer ? 'Người nhận' : 'Người gửi'}</th>
                  {!isVegetableOrder && <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-14 border-r border-border">Ảnh</th>}
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left border-r border-border">Tên hàng</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-right border-r border-border">{isInSgTab ? 'Số lượng' : 'Cước SG'}</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center border-r border-border">Trạng thái</th>
                  {!isInSgTab && <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">SL Tổng</th>}
                  {!isInSgTab && <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">Còn lại</th>}
                  {showExcessColumn && <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-20 border-r border-border">Dư</th>}
                  {!isInSgTab && displayedVehicles.map((vehicle) => (
                    <th key={vehicle.id} className="px-1 py-3 text-[10px] font-bold uppercase tracking-tight text-center w-20 border-r border-border last:border-r-0">
                      {vehicle.license_plate}
                    </th>
                  ))}
                  {!isInSgTab && displayedVehicles.length === 0 && FALLBACK_VEHICLE_COLUMNS.map((column) => (
                    <th key={column} className="px-1 py-3 text-[10px] font-bold uppercase tracking-tight text-center w-10 border-r border-border last:border-r-0">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5 + (isVegetableOrder ? 0 : 1) + (isInSgTab ? 0 : 2 + (showExcessColumn ? 1 : 0) + (displayedVehicles.length || FALLBACK_VEHICLE_COLUMNS.length))} className="px-4 py-12 text-center">
                      <EmptyOrdersState canSelfCreate={canSelfCreate} onCreate={openCreateModal} />
                    </td>
                  </tr>
                ) : (
                  displayedOrders.map((order) => {
                    const sourceOrder = getDeliverySourceOrder(order);
                    const statusLabel = getOrderFilterStatus(order);
                    const counterpartName = isSenderCustomer
                      ? (sourceOrder?.receiver_name || sourceOrder?.customers?.name || '-')
                      : (sourceOrder?.sender_name || sourceOrder?.sender_customers?.name || '-');
                    const previewImage = getOrderPreviewImage(order);
                    const paymentStatus = getOrderPaymentStatus(order);
                    const totalAssigned = (order.delivery_vehicles || []).reduce((sum, deliveryVehicle) => sum + Number(deliveryVehicle.assigned_quantity || 0), 0);
                    const totalQuantity = Number(order.total_quantity || 0);
                    const remainingQuantity = totalQuantity - totalAssigned;
                    const excessQuantity = Math.max(totalAssigned - totalQuantity, 0);
                    const isPartiallyDelivered = totalAssigned > 0 && totalAssigned < totalQuantity && statusLabel === 'delivered';
                    return (
                      <tr key={order.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground border-r border-border/70">{formatDisplayDate(order.delivery_date || order.created_at)}</td>
                        <td className="px-4 py-3 border-r border-border/70">{counterpartName}</td>
                        {!isVegetableOrder && (
                          <td
                            className={`px-2 py-3 text-center border-r border-border/70 ${previewImage ? 'cursor-pointer' : ''}`}
                            onClick={(event) => {
                              if (!previewImage) return;
                              event.stopPropagation();
                              setViewingImageOrder(order);
                            }}
                          >
                            {previewImage ? (
                              <div className="w-8 h-8 rounded-md bg-muted/30 overflow-hidden mx-auto border border-border group relative flex items-center justify-center">
                                <div className="w-full h-full flex items-center justify-center text-primary bg-primary/10" title="Xem ảnh"><Eye size={16} /></div>
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Eye size={12} className="text-white" />
                                </div>
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-md bg-muted/20 flex items-center justify-center text-muted-foreground mx-auto">
                                <ImageIcon size={14} className="opacity-30" />
                              </div>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 font-semibold text-foreground border-r border-border/70 min-w-40">
                          {getDisplayProductName(order)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold border-r border-border/70">
                          {isInSgTab ? formatNumber(Number(order.total_quantity || 0)) : <PaymentStatusBadge status={paymentStatus} />}
                        </td>
                        <td className="px-4 py-3 text-center border-r border-border/70">
                          <StatusBadge status={statusLabel} />
                        </td>
                        {!isInSgTab && (
                          <td className="px-2 py-3 text-[13px] font-bold text-muted-foreground text-center tabular-nums border-r border-border/70">
                            {formatNumber(Number(order.total_quantity || 0))}
                            {isPartiallyDelivered && (
                              <div className="text-[10px] text-green-600 dark:text-green-500 mt-0.5 font-bold">
                                Đã giao: {formatNumber(totalAssigned)}
                              </div>
                            )}
                          </td>
                        )}
                        {!isInSgTab && (
                          <td className="px-2 py-3 text-[13px] font-black text-orange-600 dark:text-orange-500 text-center tabular-nums border-r border-border/70">
                            {formatNumber(remainingQuantity > 0 ? remainingQuantity : 0)}
                          </td>
                        )}
                        {showExcessColumn && (
                          <td className="px-2 py-3 text-[13px] font-black text-red-600 dark:text-red-500 text-center tabular-nums border-r border-border/70">
                            {excessQuantity > 0 ? formatNumber(excessQuantity) : '-'}
                          </td>
                        )}
                        {!isInSgTab && displayedVehicles.map((vehicle) => {
                          const deliveryVehicleRows = (order.delivery_vehicles || []).filter(
                            (deliveryVehicle) => deliveryVehicle.vehicle_id === vehicle.id && (deliveryVehicle.assigned_quantity || 0) > 0,
                          );
                          const isCollectionPaid = (order.payment_collections || []).some(
                            (paymentCollection) => paymentCollection.vehicle_id === vehicle.id && isPaidCollectionStatus(paymentCollection.status),
                          );
                          return (
                            <td
                              key={vehicle.id}
                              className={`px-0.5 py-1 text-[12px] text-center tabular-nums border-r border-border/70 last:border-r-0 transition-all relative ${
                                deliveryVehicleRows.length > 0 ? 'font-bold bg-blue-500/10' : 'text-muted-foreground/30'
                              }`}
                            >
                              {deliveryVehicleRows.length > 0 ? (
                                <div className="flex flex-col items-center justify-center">
                                  <div>
                                    {deliveryVehicleRows.map((deliveryVehicle, index) => {
                                      const exportPaid = deliveryVehicle.export_payment_status === 'paid';
                                      return (
                                        <React.Fragment key={deliveryVehicle.id || `${vehicle.id}-${index}`}>
                                          {index > 0 && <span className="text-[10px] text-muted-foreground/50 mx-0.5">+</span>}
                                          <VehicleCellTooltip
                                            dv={deliveryVehicle}
                                            vehicle={vehicle}
                                            qty={Number(deliveryVehicle.assigned_quantity || 0)}
                                            isPaid={isCollectionPaid}
                                            exportPaid={exportPaid}
                                          >
                                            <span className={`cursor-help underline decoration-dotted underline-offset-2 ${
                                              exportPaid
                                                ? 'text-emerald-600 decoration-emerald-500/30'
                                                : 'text-red-600 decoration-red-500/30'
                                            }`}>
                                              {formatNumber(Number(deliveryVehicle.assigned_quantity || 0))}
                                            </span>
                                          </VehicleCellTooltip>
                                        </React.Fragment>
                                      );
                                    })}
                                  </div>
                                  {isCollectionPaid && (
                                    <div className="mt-0.5 flex items-center justify-center gap-0.5 text-green-600 bg-green-500/10 rounded-sm px-1" title="Đã xác nhận thu tiền">
                                      <span className="text-[9px] font-black leading-none pb-px">Thu</span>
                                    </div>
                                  )}
                                </div>
                              ) : '-'}
                            </td>
                          );
                        })}
                        {!isInSgTab && displayedVehicles.length === 0 && FALLBACK_VEHICLE_COLUMNS.map((column) => {
                          const quantity = (order.delivery_vehicles || [])
                            .filter((deliveryVehicle) => {
                              const plate = (deliveryVehicle.vehicles?.license_plate || '').toLowerCase();
                              if (column === 'ba') return plate.includes('ba');
                              if (column === 'kho') return plate.includes('kho');
                              return plate.includes(column);
                            })
                            .reduce((total, deliveryVehicle) => total + Number(deliveryVehicle.assigned_quantity || 0), 0);
                          return (
                            <td
                              key={column}
                              className={`px-1 py-2 text-[12px] text-center tabular-nums border-r border-border/70 last:border-r-0 ${
                                quantity > 0 ? 'font-bold text-orange-600 bg-orange-500/10' : 'text-muted-foreground/30'
                              }`}
                            >
                              {quantity > 0 ? formatNumber(quantity) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>

            <div className={`${isInSgTab ? 'hidden' : 'md:hidden'} p-3 space-y-3`}>
            {displayedOrders.length === 0 ? (
              <EmptyOrdersState canSelfCreate={canSelfCreate} onCreate={openCreateModal} />
            ) : (
              displayedOrders.map((order) => {
                const sourceOrder = getDeliverySourceOrder(order);
                const statusLabel = getOrderFilterStatus(order);
                const counterpartName = isSenderCustomer
                  ? (sourceOrder?.receiver_name || sourceOrder?.customers?.name || '-')
                  : (sourceOrder?.sender_name || sourceOrder?.sender_customers?.name || '-');
                const previewImage = getOrderPreviewImage(order);
                const paymentStatus = getOrderPaymentStatus(order);
                const totalAssigned = (order.delivery_vehicles || []).reduce((sum, deliveryVehicle) => sum + Number(deliveryVehicle.assigned_quantity || 0), 0);
                const totalQuantity = Number(order.total_quantity || 0);
                const remainingQuantity = totalQuantity - totalAssigned;
                const excessQuantity = Math.max(totalAssigned - totalQuantity, 0);
                return (
                  <div key={order.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[12px] text-muted-foreground">Ngày</div>
                        <div className="font-black text-foreground">{formatDisplayDate(order.delivery_date || order.created_at)}</div>
                      </div>
                      <StatusBadge status={statusLabel} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
                      <InfoBlock label={isSenderCustomer ? 'Người nhận' : 'Người gửi'} value={counterpartName} />
                      <InfoBlock label="Tên hàng" value={getDisplayProductName(order)} />
                      <InfoBlock label="Cước SG" value={paymentStatusConfig[paymentStatus].label} strong />
                      <InfoBlock label="SL Tổng" value={formatNumber(Number(order.total_quantity || 0))} strong />
                      <InfoBlock label="Còn lại" value={formatNumber(remainingQuantity > 0 ? remainingQuantity : 0)} strong />
                      {showExcessColumn && <InfoBlock label="Dư" value={excessQuantity > 0 ? formatNumber(excessQuantity) : '-'} strong />}
                    </div>
                    {!isVegetableOrder && (
                      <button
                        type="button"
                        disabled={!previewImage}
                        onClick={() => previewImage && setViewingImageOrder(order)}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-[12px] font-bold text-foreground disabled:opacity-50"
                      >
                        {previewImage ? <Eye size={14} /> : <ImageIcon size={14} />}
                        {previewImage ? 'Xem ảnh' : 'Chưa có ảnh'}
                      </button>
                    )}
                    {(order.delivery_vehicles || []).some((deliveryVehicle) => (deliveryVehicle.assigned_quantity || 0) > 0) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(order.delivery_vehicles || [])
                          .filter((deliveryVehicle) => (deliveryVehicle.assigned_quantity || 0) > 0)
                          .map((deliveryVehicle) => (
                            <span
                              key={deliveryVehicle.id}
                              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold ${
                                deliveryVehicle.export_payment_status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-red-50 text-red-700'
                              }`}
                            >
                              {deliveryVehicle.vehicles?.license_plate || 'Xe'}: {formatNumber(Number(deliveryVehicle.assigned_quantity || 0))}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            </div>
          </div>
        </div>
      </div>

      {isCreateOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/35 flex items-stretch justify-end">
          <div className="h-full w-full max-w-3xl bg-white border-l border-border shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">
            <form onSubmit={handleSubmit} className="h-full flex flex-col">
              <div className="px-5 py-4 border-b border-border bg-muted/20">
                <h3 className="text-[15px] font-bold text-foreground">
                  {editingOrder ? 'Sửa đơn trả hàng' : 'Tạo đơn trả hàng về SG'}
                </h3>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Hàng lỗi trả về SG · {isVegetableOrder ? 'Rau củ' : 'Tạp hóa'} · {isSenderCustomer ? 'Bạn là người gửi' : 'Bạn là người nhận'}
                </p>
              </div>

              <div className="p-5 space-y-5 overflow-y-auto flex-1 min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-semibold text-muted-foreground">Ngày đơn</label>
                    <DatePicker
                      value={formState.order_date}
                      onChange={(value) => setFormState((prev) => ({ ...prev, order_date: value }))}
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-semibold text-muted-foreground">Giờ đơn</label>
                    <TimePicker24h
                      value={formState.order_time}
                      onChange={(value) => setFormState((prev) => ({ ...prev, order_time: value }))}
                      className="bg-background"
                    />
                  </div>
                </div>

                <Input
                  label="Người gửi"
                  value={customer?.name || formState.sender_name}
                  onChange={() => undefined}
                  disabled
                  required
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    label="Người nhận"
                    value={formState.receiver_name}
                    onChange={(value) => setFormState((prev) => ({ ...prev, receiver_name: value }))}
                    required
                  />
                  <Input
                    label="Số điện thoại"
                    value={formState.receiver_phone}
                    onChange={(value) => setFormState((prev) => ({ ...prev, receiver_phone: value }))}
                  />
                </div>

                <Input
                  label="Cước SG"
                  type="number"
                  min={0}
                  value={formState.total_amount}
                  onChange={(value) => setFormState((prev) => ({ ...prev, total_amount: value }))}
                />

                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-muted-foreground">Trạng thái cước SG</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(['unpaid', 'paid'] as const).map((paymentStatus) => {
                      const isActive = formState.payment_status === paymentStatus;
                      return (
                        <button
                          key={paymentStatus}
                          type="button"
                          onClick={() => setFormState((prev) => ({ ...prev, payment_status: paymentStatus }))}
                          className={`rounded-xl border px-3 py-2 text-[13px] font-bold transition-all ${
                            isActive
                              ? paymentStatus === 'paid'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                          }`}
                        >
                          {paymentStatus === 'paid' ? 'Đã trả cước SG' : 'Chưa trả cước SG'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-bold text-foreground">Danh sách hàng lỗi trả về</h4>
                      <p className="text-[12px] text-muted-foreground">Bắt buộc chọn mặt hàng lỗi và số lượng cần trả về SG.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addItem}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-[12px] font-bold hover:bg-muted"
                    >
                      <Plus size={14} />
                      Thêm dòng
                    </button>
                  </div>

                  <div className="space-y-3">
                    {formState.items.map((item, index) => {
                      return (
                      <div key={index} className="rounded-2xl border border-border bg-muted/10 p-3 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_110px_auto] gap-3 items-end">
                          <Input
                            label="Mặt hàng"
                            value={item.product_name}
                            onChange={(value) => updateItem(index, { product_name: value })}
                            placeholder="Nhập tên mặt hàng"
                            required
                          />
                          <Input
                            label="Số lượng"
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(value) => updateItem(index, { quantity: value })}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            disabled={formState.items.length === 1}
                            className="h-10 px-3 rounded-xl border border-border text-red-500 hover:bg-red-50 disabled:opacity-40"
                            title="Xóa dòng"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        <Input
                          label="Ghi chú"
                          value={item.package_type}
                          onChange={(value) => updateItem(index, { package_type: value })}
                        />

                        <ImagePicker
                          label="Ảnh hàng lỗi"
                          urls={item.image_urls}
                          isUploading={uploadingItemIndex === index}
                          onUpload={(event) => handleItemUpload(index, event)}
                          onRemove={(imageIndex) => removeItemImage(index, imageIndex)}
                        />
                      </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-muted-foreground">Lý do trả hàng / ghi chú</label>
                  <textarea
                    rows={3}
                    value={formState.notes}
                    onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
                  />
                </div>
              </div>

              <div className="px-5 py-4 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl border border-border text-[13px] font-semibold hover:bg-muted"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
                  {editingOrder ? 'Lưu cập nhật' : 'Tạo đơn trả hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      <OrderImagesDialog
        isOpen={!!viewingImageOrder}
        isClosing={isViewingClosing}
        order={viewingImageOrder}
        onClose={() => {
          setIsViewingClosing(true);
          setTimeout(() => {
            setViewingImageOrder(null);
            setIsViewingClosing(false);
          }, 300);
        }}
      />
    </div>
  );
};

const Input: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: number;
  disabled?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, type = 'text', required = false, min, disabled = false, placeholder }) => (
  <div className="space-y-1.5">
    <label className="text-[12px] font-semibold text-muted-foreground">{label}</label>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      type={type}
      required={required}
      min={min}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm disabled:bg-muted/40 disabled:text-muted-foreground disabled:cursor-not-allowed"
    />
  </div>
);

const SummaryCard: React.FC<{
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  tone: string;
}> = ({ icon: Icon, label, value, tone }) => (
  <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
    <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl ${tone}`}>
      <Icon size={18} />
    </div>
    <div className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 text-lg font-black text-foreground">{value}</div>
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = statusConfig[status] || {
    label: status || 'Chưa xác định',
    className: 'bg-muted text-foreground border-border',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black ${config.className}`}>
      {config.label}
    </span>
  );
};

const PaymentStatusBadge: React.FC<{ status: PaymentStatusKey }> = ({ status }) => {
  const config = paymentStatusConfig[status];

  return (
    <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-black ${config.className}`}>
      {config.label}
    </span>
  );
};

const InfoBlock: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong = false }) => (
  <div>
    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={strong ? 'mt-0.5 font-black text-foreground' : 'mt-0.5 font-semibold text-foreground'}>{value}</div>
  </div>
);

const EmptyOrdersState: React.FC<{ canSelfCreate: boolean; onCreate: () => void }> = ({ canSelfCreate, onCreate }) => (
  <div className="mx-auto flex max-w-sm flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-5 py-8 text-center">
    <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
      <Package size={22} />
    </div>
    <div className="font-black text-foreground">Chưa có đơn trả hàng nào</div>
    <p className="mt-1 text-[13px] text-muted-foreground">Tạo phiếu đầu tiên khi hàng của khách bị lỗi cần trả về SG.</p>
    <button
      type="button"
      onClick={onCreate}
      disabled={!canSelfCreate}
      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-white hover:bg-primary/90 disabled:opacity-50"
    >
      <Plus size={14} />
      Tạo trả hàng
    </button>
  </div>
);

const ImagePicker: React.FC<{
  label: string;
  urls: string[];
  isUploading: boolean;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
}> = ({ label, urls, isUploading, onUpload, onRemove }) => (
  <div className="space-y-2">
    <label className="text-[12px] font-semibold text-muted-foreground">{label}</label>
    <div className="flex flex-wrap gap-2">
      {urls.map((url, index) => (
        <div key={`${url}-${index}`} className="relative w-16 h-16 rounded-xl border border-border overflow-hidden bg-muted">
          <img loading="lazy" decoding="async" src={cloudinarySmall(url)} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white inline-flex items-center justify-center"
            aria-label="Xóa ảnh"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <label className="w-16 h-16 rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground hover:text-primary hover:border-primary/60 cursor-pointer inline-flex items-center justify-center">
        <input type="file" accept="image/*" multiple className="hidden" onChange={onUpload} />
        {isUploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
      </label>
    </div>
  </div>
);

export default GroceryReceiverOrdersPage;

