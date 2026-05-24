import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, CheckCircle2, Clock3, Eye, Image as ImageIcon, ImagePlus, Loader2, Package, Plus, ShieldCheck, Trash2, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import ErrorState from '../../components/shared/ErrorState';
import { SearchInput } from '../../components/ui/SearchInput';
import { useAuth } from '../../context/AuthContext';
import { useCustomerByUserId, useCreateMyOrder, useMyDeliveryOrders, useMyDeliveryVehicles, useMyOrderProducts, useUpdateMyOrder } from '../../hooks/queries/useCustomers';
import { useMyPermissions } from '../../hooks/queries/useRoles';
import { uploadApi } from '../../api/uploadApi';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { VehicleCellTooltip } from '../delivery/components/VehicleCellTooltip';
import OrderImagesDialog from '../delivery/dialogs/OrderImagesDialog';
import { cloudinarySmall } from '../../lib/cloudinaryUrl';
import type { Customer, DeliveryOrder, ImportOrder } from '../../types';

const CUSTOMER_ORDER_CREATE_PATH = '/tai-khoan/don-hang/tao-don';

const getToday = () => new Date().toISOString().slice(0, 10);
const getCurrentTime = () => new Date().toTimeString().slice(0, 5);
const formatCurrency = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
const formatNumber = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
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

type OrderStatusFilter = 'all' | 'processing' | 'delivered';

const statusFilterLabels: Record<OrderStatusFilter, string> = {
  all: 'Tất cả',
  processing: 'Đang giao',
  delivered: 'Đã giao',
};

const statusFilterClasses: Record<OrderStatusFilter, { active: string; badge: string }> = {
  all: { active: 'bg-primary/10 text-primary', badge: 'bg-primary/10 text-primary' },
  processing: { active: 'bg-amber-50 text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  delivered: { active: 'bg-emerald-50 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
};

type DeliverySourceOrder = NonNullable<DeliveryOrder['import_orders']> | NonNullable<DeliveryOrder['vegetable_orders']>;

type DeliveryImageRef = {
  image_url?: string | null;
  image_urls?: string[] | null;
  products?: { name?: string | null } | null;
};

const getOrderFilterStatus = (order: DeliveryOrder): OrderStatusFilter => {
  return order.status === 'da_giao' ? 'delivered' : 'processing';
};

const getDeliverySourceOrder = (order: DeliveryOrder): DeliverySourceOrder | undefined => {
  return order.vegetable_orders || order.import_orders;
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

const MyOrdersPage: React.FC = () => {
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
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const [viewingImageOrder, setViewingImageOrder] = useState<DeliveryOrder | null>(null);
  const [isViewingClosing, setIsViewingClosing] = useState(false);

  const orderPolicy = getCustomerOrderPolicy(customer?.customer_type);
  const isSenderCustomer = orderPolicy?.binding === 'sender';
  const orderCategory = orderPolicy?.orderCategory || 'standard';
  const isVegetableOrder = orderCategory === 'vegetable';
  const { data: deliveryOrders, isLoading, isError, refetch } = useMyDeliveryOrders(!!user?.id);
  const { data: deliveryVehicles } = useMyDeliveryVehicles(!!user?.id);
  const { data: products } = useMyOrderProducts(isCreateOpen);
  const canSelfCreate = (myPermissions?.page_paths || []).includes(CUSTOMER_ORDER_CREATE_PATH);
  const productOptions = useMemo(
    () => (products || []).map((product) => ({ value: product.id, label: product.name, searchText: product.name })),
    [products],
  );
  const productsById = useMemo(() => new Map((products || []).map((product) => [product.id, product])), [products]);
  const calculatedVegetableTotal = useMemo(() => {
    if (!isVegetableOrder) return 0;
    return formState.items.reduce((total, item) => {
      const product = productsById.get(item.product_id);
      const quantity = Number(item.quantity) || 0;
      const unitPrice = item.unit_price ? Number(item.unit_price) : Number(product?.base_price) || 0;
      return total + (Number.isFinite(unitPrice) ? unitPrice : 0) * quantity;
    }, 0);
  }, [formState.items, isVegetableOrder, productsById]);

  const sortedOrders = useMemo(() => {
    if (!deliveryOrders || !customer?.id) return [];
    return deliveryOrders.filter((order) => {
      const sourceOrder = getDeliverySourceOrder(order);
      if (!sourceOrder) return false;
      if (isSenderCustomer) return sourceOrder.sender_id === customer.id;
      return sourceOrder.customer_id === customer.id;
    }).sort(
      (a, b) => {
        return (
          new Date(b.delivery_date || b.created_at).getTime() -
            new Date(a.delivery_date || a.created_at).getTime() ||
          new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
        );
      },
    );
  }, [customer?.id, deliveryOrders, isSenderCustomer]);

  const orderSummary = useMemo(() => {
    return sortedOrders.reduce(
      (summary, order) => {
        summary.total += 1;
        const sourceOrder = getDeliverySourceOrder(order);
        summary.amount += sourceOrder?.total_amount || order.unit_price || 0;
        if (order.status === 'da_giao') summary.delivered += 1;
        else summary.processing += 1;
        return summary;
      },
      { total: 0, processing: 0, delivered: 0, amount: 0 },
    );
  }, [sortedOrders]);

  const statusCounts = useMemo(() => {
    return sortedOrders.reduce(
      (counts, order) => {
        counts.all += 1;
        const status = getOrderFilterStatus(order);
        if (status !== 'all') counts[status] += 1;
        return counts;
      },
      { all: 0, processing: 0, delivered: 0 } as Record<OrderStatusFilter, number>,
    );
  }, [sortedOrders]);

  const displayedOrders = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return sortedOrders.filter((order) => {
      const sourceOrder = getDeliverySourceOrder(order);
      if (statusFilter !== 'all' && getOrderFilterStatus(order) !== statusFilter) return false;
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
  }, [searchQuery, sortedOrders, statusFilter]);

  const latestOrder = sortedOrders[0];
  const latestSourceOrder = latestOrder ? getDeliverySourceOrder(latestOrder) : undefined;
  const currentCustomerType = customer?.customer_type ? customerTypeLabel[customer.customer_type] || customer.customer_type : 'Chưa xác định';
  const displayedVehicles = useMemo(
    () => (deliveryVehicles || []).filter((vehicle) => {
      if (isVegetableOrder) return true;
      return vehicle.license_plate?.trim().toLowerCase() !== 'chuatimthay';
    }),
    [deliveryVehicles, isVegetableOrder],
  );

  const openCreateModal = () => {
    setEditingOrder(null);
    setFormState(createInitialFormState());
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
      weight_kg: item.weight_kg ? Number(item.weight_kg) : null,
      unit_price: isVegetableOrder
        ? item.unit_price ? Number(item.unit_price) : Number(productsById.get(item.product_id)?.base_price) || 0
        : item.unit_price ? Number(item.unit_price) : null,
    }));

    if (validItems.some((item) => !item.product_id || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      toast.error('Vui lòng chọn mặt hàng và nhập số lượng lớn hơn 0');
      return;
    }

    const payload = {
      order_date: formState.order_date || undefined,
      order_time: formState.order_time || undefined,
      sender_name: formState.sender_name || undefined,
      receiver_name: formState.receiver_name || undefined,
      receiver_phone: formState.receiver_phone || undefined,
      receiver_address: formState.receiver_address || undefined,
      status: 'processing' as const,
      payment_status: formState.payment_status,
      total_amount: isVegetableOrder
        ? calculatedVegetableTotal
        : formState.total_amount ? Number(formState.total_amount) : undefined,
      notes: formState.notes || 'Đơn trả hàng lỗi về lại SG',
      is_custom_amount: true,
      order_category: orderCategory,
      items: validItems.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        package_type: !isVegetableOrder && item.package_type ? item.package_type : undefined,
        item_note: item.item_note || undefined,
        weight_kg: !isVegetableOrder ? item.weight_kg : undefined,
        unit_price: item.unit_price,
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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <PageHeader
        title="Đơn trả hàng về SG"
        description="Tạo phiếu trả hàng lỗi về SG và theo dõi trạng thái cước"
        backPath="/"
      />

      <div className="space-y-3 flex-1 min-h-0 flex flex-col">
        <div className="bg-card flex flex-row w-full gap-2 items-center rounded-2xl shadow-sm border border-border p-2.5 overflow-x-auto custom-scrollbar">
          <div className="flex-1 min-w-58 md:max-w-full">
            <SearchInput
              placeholder="Tìm mã trả hàng, người gửi, người nhận..."
              onSearch={(raw) => setSearchQuery(raw)}
              className="h-9.5"
            />
          </div>

          <div className="hidden md:flex items-center gap-2 shrink-0 rounded-xl border border-border/80 bg-muted/20 px-3 py-2 text-[12px] font-bold text-muted-foreground">
            <ShieldCheck size={15} />
            <span className="whitespace-nowrap">{currentCustomerType}</span>
          </div>

          {latestOrder && (
            <div className="hidden lg:flex items-center gap-2 shrink-0 rounded-xl border border-border/80 bg-muted/20 px-3 py-2 text-[12px] font-bold text-muted-foreground">
              <CalendarDays size={15} />
              <span className="whitespace-nowrap">Mới nhất: {latestSourceOrder?.order_code || latestOrder.delivery_date || '-'}</span>
            </div>
          )}

          <button
            type="button"
            onClick={openCreateModal}
            disabled={!canSelfCreate}
            className="flex items-center gap-2 justify-center h-9.5 px-3 shrink-0 border border-primary/20 rounded-xl transition-all bg-primary text-white hover:bg-primary/90 font-bold text-[13px] disabled:opacity-60"
            title={canSelfCreate ? 'Tạo đơn trả hàng về SG' : 'Bạn chưa có quyền tạo đơn trả hàng'}
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Tạo trả hàng</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
          <SummaryCard icon={Package} label="Tổng phiếu" value={orderSummary.total.toLocaleString('vi-VN')} tone="text-primary bg-primary/10" />
          <SummaryCard icon={Clock3} label="Đang giao" value={orderSummary.processing.toLocaleString('vi-VN')} tone="text-amber-600 bg-amber-50" />
          <SummaryCard icon={CheckCircle2} label="Đã giao" value={orderSummary.delivered.toLocaleString('vi-VN')} tone="text-emerald-600 bg-emerald-50" />
          <SummaryCard icon={Wallet} label="Tổng cước SG" value={formatCurrency(orderSummary.amount)} tone="text-blue-600 bg-blue-50" />
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col shrink-0 border-b border-border bg-muted/50">
            <div className="grid grid-cols-5 gap-1 px-3 py-2 md:flex md:items-center md:gap-1 md:overflow-x-auto custom-scrollbar">
              {(['all', 'processing', 'delivered'] as OrderStatusFilter[]).map((status) => {
                const isActive = statusFilter === status;
                const colors = statusFilterClasses[status];
                const count = statusCounts[status];
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`w-full flex items-center justify-center md:justify-start gap-1 px-1.5 md:px-3 py-1.5 rounded-lg text-[10px] md:text-[12px] font-bold transition-all whitespace-nowrap ${
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

          <div className="flex-1 overflow-auto custom-scrollbar bg-muted/30 md:bg-transparent relative">
            <div className="hidden md:block">
              <table className="w-full border-collapse bg-card text-[13px]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-card border-b border-border text-muted-foreground">
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left border-r border-border">Mã đơn</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left border-r border-border">Ngày</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-left border-r border-border">{isSenderCustomer ? 'Người nhận' : 'Người gửi'}</th>
                  {!isVegetableOrder && <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-14 border-r border-border">Ảnh</th>}
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-right border-r border-border">Cước SG</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-tight text-center border-r border-border">Trạng thái</th>
                  {displayedVehicles.map((vehicle) => (
                    <th key={vehicle.id} className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-28 border-r border-border last:border-r-0">
                      {vehicle.license_plate}
                    </th>
                  ))}
                  {displayedVehicles.length === 0 && FALLBACK_VEHICLE_COLUMNS.map((column) => (
                    <th key={column} className="px-2 py-3 text-[11px] font-bold uppercase tracking-tight text-center w-12 border-r border-border last:border-r-0">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5 + (isVegetableOrder ? 0 : 1) + (displayedVehicles.length || FALLBACK_VEHICLE_COLUMNS.length)} className="px-4 py-12 text-center">
                      <EmptyOrdersState canSelfCreate={canSelfCreate} onCreate={openCreateModal} />
                    </td>
                  </tr>
                ) : (
                  displayedOrders.map((order) => {
                    const sourceOrder = getDeliverySourceOrder(order);
                    const statusLabel = order.status === 'da_giao' ? 'delivered' : 'processing';
                    const counterpartName = isSenderCustomer
                      ? (sourceOrder?.receiver_name || sourceOrder?.customers?.name || '-')
                      : (sourceOrder?.sender_name || sourceOrder?.sender_customers?.name || '-');
                    const displayAmount = sourceOrder?.total_amount || order.unit_price || 0;
                    const previewImage = getOrderPreviewImage(order);
                    return (
                      <tr key={order.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3 font-black text-foreground border-r border-border/70">{sourceOrder?.order_code || '-'}</td>
                        <td className="px-4 py-3 text-muted-foreground border-r border-border/70">{order.delivery_date || '-'}</td>
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
                                <img src={cloudinarySmall(previewImage)} alt="Ảnh đơn" className="w-full h-full object-cover" />
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
                        <td className="px-4 py-3 text-right font-bold border-r border-border/70">{formatCurrency(displayAmount)}</td>
                        <td className="px-4 py-3 text-center border-r border-border/70">
                          <StatusBadge status={statusLabel} />
                        </td>
                        {displayedVehicles.map((vehicle) => {
                          const deliveryVehicleRows = (order.delivery_vehicles || []).filter(
                            (deliveryVehicle) => deliveryVehicle.vehicle_id === vehicle.id && (deliveryVehicle.assigned_quantity || 0) > 0,
                          );
                          const isCollectionPaid = (order.payment_collections || []).some(
                            (paymentCollection) => paymentCollection.vehicle_id === vehicle.id && isPaidCollectionStatus(paymentCollection.status),
                          );
                          return (
                            <td
                              key={vehicle.id}
                              className={`px-1 py-1 text-[13px] text-center tabular-nums border-r border-border/70 last:border-r-0 transition-all relative ${
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
                        {displayedVehicles.length === 0 && FALLBACK_VEHICLE_COLUMNS.map((column) => {
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
                              className={`px-2 py-3 text-[13px] text-center tabular-nums border-r border-border/70 last:border-r-0 ${
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

            <div className="md:hidden p-3 space-y-3">
            {displayedOrders.length === 0 ? (
              <EmptyOrdersState canSelfCreate={canSelfCreate} onCreate={openCreateModal} />
            ) : (
              displayedOrders.map((order) => {
                const sourceOrder = getDeliverySourceOrder(order);
                const statusLabel = order.status === 'da_giao' ? 'delivered' : 'processing';
                const counterpartName = isSenderCustomer
                  ? (sourceOrder?.receiver_name || sourceOrder?.customers?.name || '-')
                  : (sourceOrder?.sender_name || sourceOrder?.sender_customers?.name || '-');
                const displayAmount = sourceOrder?.total_amount || order.unit_price || 0;
                const previewImage = getOrderPreviewImage(order);
                return (
                  <div key={order.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[12px] text-muted-foreground">Mã đơn</div>
                        <div className="font-black text-foreground">{sourceOrder?.order_code || '-'}</div>
                      </div>
                      <StatusBadge status={statusLabel} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
                      <InfoBlock label="Ngày" value={order.delivery_date || '-'} />
                      <InfoBlock label={isSenderCustomer ? 'Người nhận' : 'Người gửi'} value={counterpartName} />
                      <InfoBlock label="Cước SG" value={formatCurrency(displayAmount)} strong />
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
        <div className="fixed inset-0 z-[9999] bg-black/35 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl max-h-[92vh] bg-white rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col">
            <form onSubmit={handleSubmit}>
              <div className="px-5 py-4 border-b border-border bg-muted/20">
                <h3 className="text-[15px] font-bold text-foreground">
                  {editingOrder ? 'Sửa đơn trả hàng' : 'Tạo đơn trả hàng về SG'}
                </h3>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Hàng lỗi trả về SG · {isVegetableOrder ? 'Rau củ' : 'Tạp hóa'} · {isSenderCustomer ? 'Bạn là người gửi' : 'Bạn là người nhận'}
                </p>
              </div>

              <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(92vh-140px)]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    label="Ngày đơn"
                    type="date"
                    value={formState.order_date}
                    onChange={(value) => setFormState((prev) => ({ ...prev, order_date: value }))}
                    required
                  />
                  <Input
                    label="Giờ đơn"
                    type="time"
                    value={formState.order_time}
                    onChange={(value) => setFormState((prev) => ({ ...prev, order_time: value }))}
                    required
                  />
                </div>

                {isSenderCustomer ? (
                  <>
                    <Input
                      label="Người nhận"
                      value={formState.receiver_name}
                      onChange={(value) => setFormState((prev) => ({ ...prev, receiver_name: value }))}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input
                        label="Số điện thoại người nhận"
                        value={formState.receiver_phone}
                        onChange={(value) => setFormState((prev) => ({ ...prev, receiver_phone: value }))}
                      />
                      <Input
                        label="Địa chỉ người nhận"
                        value={formState.receiver_address}
                        onChange={(value) => setFormState((prev) => ({ ...prev, receiver_address: value }))}
                      />
                    </div>
                  </>
                ) : (
                  <Input
                    label="Người gửi"
                    value={formState.sender_name}
                    onChange={(value) => setFormState((prev) => ({ ...prev, sender_name: value }))}
                  />
                )}

                {isVegetableOrder ? (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
                    <div className="text-[12px] font-semibold text-emerald-700">Cước SG tự tính theo giá rau đã cài đặt</div>
                    <div className="text-xl font-black text-emerald-800 mt-1">{formatCurrency(calculatedVegetableTotal)}</div>
                  </div>
                ) : (
                  <Input
                    label="Cước SG"
                    type="number"
                    min={0}
                    value={formState.total_amount}
                    onChange={(value) => setFormState((prev) => ({ ...prev, total_amount: value }))}
                  />
                )}

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
                      const selectedProduct = productsById.get(item.product_id);
                      const vegetableUnitPrice = item.unit_price ? Number(item.unit_price) : Number(selectedProduct?.base_price) || 0;
                      const quantity = Number(item.quantity) || 0;
                      const vegetableLineTotal = vegetableUnitPrice * quantity;

                      return (
                      <div key={index} className="rounded-2xl border border-border bg-muted/10 p-3 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_110px_140px_auto] gap-3 items-end">
                          <div className="space-y-1.5">
                            <label className="text-[12px] font-semibold text-muted-foreground">Mặt hàng</label>
                            <SearchableSelect
                              options={productOptions}
                              value={item.product_id}
                              onValueChange={(value) => {
                                const product = productsById.get(value);
                                updateItem(index, {
                                  product_id: value,
                                  unit_price: isVegetableOrder ? String(Number(product?.base_price) || 0) : item.unit_price,
                                });
                              }}
                              placeholder="Chọn mặt hàng"
                              searchPlaceholder="Tìm mặt hàng..."
                            />
                          </div>
                          <Input
                            label="Số lượng"
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(value) => updateItem(index, { quantity: value })}
                            required
                          />
                          {isVegetableOrder ? (
                            <div className="space-y-1.5">
                              <label className="text-[12px] font-semibold text-muted-foreground">Đơn giá</label>
                              <div className="h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm font-bold flex items-center">
                                {selectedProduct ? formatCurrency(vegetableUnitPrice) : '-'}
                              </div>
                            </div>
                          ) : (
                            <Input
                              label="Kg"
                              type="number"
                              min={0}
                              value={item.weight_kg}
                              onChange={(value) => updateItem(index, { weight_kg: value })}
                            />
                          )}
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

                        {isVegetableOrder ? (
                          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
                            <Input
                              label="Ghi chú nhanh"
                              value={item.item_note}
                              onChange={(value) => updateItem(index, { item_note: value })}
                            />
                            <div className="space-y-1.5">
                              <label className="text-[12px] font-semibold text-muted-foreground">Thành tiền</label>
                              <div className="h-10 px-3 rounded-xl border border-border bg-background text-sm font-black flex items-center justify-end">
                                {formatCurrency(vegetableLineTotal)}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Input
                              label="Loại kiện / ghi chú kiện"
                              value={item.package_type}
                              onChange={(value) => updateItem(index, { package_type: value })}
                            />
                            <Input
                              label="Đơn giá"
                              type="number"
                              min={0}
                              value={item.unit_price}
                              onChange={(value) => updateItem(index, { unit_price: value })}
                            />
                          </div>
                        )}

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
}> = ({ label, value, onChange, type = 'text', required = false, min }) => (
  <div className="space-y-1.5">
    <label className="text-[12px] font-semibold text-muted-foreground">{label}</label>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      type={type}
      required={required}
      min={min}
      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
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
          <img src={url} alt={label} className="w-full h-full object-cover" />
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

export default MyOrdersPage;
