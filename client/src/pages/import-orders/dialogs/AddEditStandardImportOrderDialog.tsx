import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Package, Plus, Trash2, CheckCircle2, FileText, UserCircle, Loader2, Camera } from 'lucide-react';
import { clsx } from 'clsx';
import { useForm, Controller, useFieldArray, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useCreateImportOrder, useUpdateImportOrder } from '../../../hooks/queries/useImportOrders';
import { useCustomers, useCreateCustomer } from '../../../hooks/queries/useCustomers';
import { useCreateProduct, useProducts, productMatchesScope } from '../../../hooks/queries/useProducts';
import { useEmployees } from '../../../hooks/queries/useHR';
import type { Customer, ImportOrder, ImportOrderCreatePayload, ImportOrderItem, Product, User } from '../../../types';
import { uploadApi } from '../../../api/uploadApi';
import CurrencyInput from '../../../components/shared/CurrencyInput';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { CreatableSearchableSelect } from '../../../components/ui/CreatableSearchableSelect';
import { TimePicker24h } from '../../../components/shared/TimePicker24h';
import { DatePicker } from '../../../components/shared/DatePicker';
import { useAuth } from '../../../context/AuthContext';
import toast from 'react-hot-toast';
import { cloudinaryThumb } from '../../../lib/cloudinaryUrl';

const importOrderItemSchema = z.object({
  product_id: z.string().min(1, 'Chọn hàng hóa'),
  package_type: z.string().optional().nullable().catch(null),
  weight_kg: z.coerce.number().optional().nullable().catch(null),
  quantity: z.coerce.number().min(1, 'SL > 0').catch(1),
  unit_price: z.coerce.number().optional().nullable().catch(null),
  image_url: z.string().optional().nullable().catch(null),
  image_urls: z.array(z.string()).optional().catch([]),
});

const importOrderSchema = z.object({
  order_date: z.string().min(1, 'Vui lòng chọn ngày'),
  order_time: z.string().min(1, 'Vui lòng nhập giờ'),
  received_by: z.string().min(1, 'Vui lòng chọn nhân viên'),
  customer_id: z.string().min(1, 'Vui lòng chọn Khách hàng / Chủ hàng'),
  sender_name: z.string().optional(),
  sender_id: z.string().optional(),
  receiver_name: z.string().optional(),
  selected_alias: z.string().optional(),
  notes: z.string().optional(),
  payment_status: z.enum(['paid', 'unpaid']).default('unpaid'),
  items: z.array(importOrderItemSchema).min(1, 'Vui lòng thêm ít nhất 1 mặt hàng'),
  total_amount: z.coerce.number().min(0, 'Tổng tiền không hợp lệ').catch(0),
  receipt_image_url: z.string().optional().nullable().catch(null),
  receipt_image_urls: z.array(z.string()).optional().catch([]),
});

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  editingOrder: ImportOrder | null;
  onClose: () => void;
  defaultCategory?: 'standard' | 'vegetable';
}

type CustomerLike = Pick<Customer, 'id' | 'name' | 'phone' | 'aliases' | 'customer_type'>;
type SelectOption = {
  value: string;
  label: string;
  selectedLabel?: string;
  matchKey?: string;
  searchText?: string;
};
type ImportOrderItemFormValue = {
  product_id: string;
  package_type?: string | null;
  weight_kg?: number | string | null;
  quantity: number | string;
  unit_price?: number | null;
  image_url?: string | null;
  image_urls?: string[];
};
type ImportOrderFormValues = Omit<
  z.infer<typeof importOrderSchema>,
  'items' | 'total_amount'
> & {
  items: ImportOrderItemFormValue[];
  total_amount: number | string;
};
type ImportOrderSubmitPayload = Omit<Partial<ImportOrderCreatePayload>, 'items'> & {
  sender_name?: string | null;
  sender_id?: string | null;
  receiver_name?: string | null;
  selected_alias?: string | null;
  payment_status?: 'paid' | 'unpaid';
  total_amount?: number | string;
  receipt_image_url?: string | null;
  receipt_image_urls?: string[];
  is_custom_amount?: boolean;
  items?: Array<Omit<ImportOrderItemFormValue, 'unit_price'> & {
    unit_price?: number | null;
    payment_status: 'paid' | 'unpaid';
  }>;
};
type MutationResponseWithData<T> = T | { data?: T };

const unwrapMutationData = <T extends { id: string }>(response: MutationResponseWithData<T>): T | undefined => {
  if ('id' in response) return response;
  return response.data;
};

const AddEditStandardImportOrderDialog: React.FC<Props> = ({ isOpen, isClosing, editingOrder, onClose, defaultCategory = 'standard' }) => {
  const { user } = useAuth();
  const isEditMode = !!editingOrder;
  const createMutation = useCreateImportOrder();
  const updateMutation = useUpdateImportOrder();
  const createProductMutation = useCreateProduct();
  const createCustomerMutation = useCreateCustomer();
  const { data: products } = useProducts(isOpen, 'standard');
  const { data: customers } = useCustomers(undefined, isOpen);
  const { data: employees } = useEmployees(isOpen);

  // Inline add-new-customer state
  const [showNewCustomerForm, setShowNewCustomerForm] = React.useState(false);
  const [newCustomerName, setNewCustomerName] = React.useState('');
  const [newCustomerPhone, setNewCustomerPhone] = React.useState('');

  const [showNewSenderForm, setShowNewSenderForm] = React.useState(false);
  const [newSenderName, setNewSenderName] = React.useState('');
  const [newSenderPhone, setNewSenderPhone] = React.useState('');

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) {
      toast.error('Vui lòng nhập tên khách hàng');
      return;
    }
    try {
      const customerType = defaultCategory === 'vegetable' ? 'vegetable_receiver' : 'grocery_receiver';
      const resp = await createCustomerMutation.mutateAsync({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || undefined,
        customer_type: customerType,
      });
      const row = unwrapMutationData(resp);
      if (row?.id) {
        setValue('customer_id', row.id, { shouldValidate: true });
        setValue('receiver_name', row.name, { shouldValidate: true });
      }
      setNewCustomerName('');
      setNewCustomerPhone('');
      setShowNewCustomerForm(false);
    } catch {
      // error handled by mutation
    }
  };

  const handleCreateSender = async () => {
    if (!newSenderName.trim()) {
      toast.error('Vui lòng nhập tên người gửi');
      return;
    }
    try {
      const customerType = defaultCategory === 'vegetable' ? 'vegetable_sender' : 'grocery_sender';
      const resp = await createCustomerMutation.mutateAsync({
        name: newSenderName.trim(),
        phone: newSenderPhone.trim() || undefined,
        customer_type: customerType,
      });
      const row = unwrapMutationData(resp);
      if (row?.id) {
        setValue('sender_id', row.id, { shouldValidate: true });
        setValue('sender_name', row.name || newSenderName.trim(), { shouldValidate: true });
      }
      setNewSenderName('');
      setNewSenderPhone('');
      setShowNewSenderForm(false);
    } catch {
      // error handled by mutation
    }
  };

  const filteredProducts = React.useMemo(() => {
    const cat = defaultCategory as 'standard' | 'vegetable';
    const list = products?.filter((product) => productMatchesScope(product, cat)) || [];
    if (editingOrder?.import_order_items) {
      const addedIds = new Set(list.map((product) => product.id));
      editingOrder.import_order_items.forEach((item) => {
        const prod = item.products;
        if (!prod || !item.product_id || addedIds.has(item.product_id)) return;
        if (!productMatchesScope(prod, cat)) return;
        list.push(prod);
        addedIds.add(item.product_id);
      });
    }
    return list;
  }, [products, defaultCategory, editingOrder]);

  const filteredCustomers = React.useMemo(() => {
    const list: CustomerLike[] = customers?.filter((customer) =>
      defaultCategory === 'vegetable'
        ? customer.customer_type === 'vegetable_receiver'
        : customer.customer_type === 'grocery_receiver'
    ) || [];

    if (editingOrder?.customers && !list.find((customer) => customer.id === editingOrder.customer_id)) {
      list.push(editingOrder.customers);
    }
    return list;
  }, [customers, defaultCategory, editingOrder]);

  const customerOptions = React.useMemo(() => {
    const options: SelectOption[] = [];
    filteredCustomers.forEach((c) => {
      // Main option
      options.push({
        value: c.id,
        label: c.name,
        selectedLabel: c.phone ? `${c.name} (${c.phone})` : c.name,
        searchText: [c.name, c.phone, ...(c.aliases || [])].filter(Boolean).join(' ')
      });
      // Alias options
      if (c.aliases && c.aliases.length > 0) {
        c.aliases.forEach((alias: string) => {
          options.push({
            value: `${c.id}:${alias}`,
            label: alias,
            selectedLabel: alias,
            searchText: [alias, c.name, c.phone].filter(Boolean).join(' ')
          });
        });
      }
    });
    return options;
  }, [filteredCustomers]);

  const filteredSenders = React.useMemo(() => {
    const list: CustomerLike[] = customers?.filter((customer) =>
      defaultCategory === 'vegetable' ? customer.customer_type === 'vegetable_sender' : customer.customer_type === 'grocery_sender'
    ) || [];
    if (editingOrder?.sender_customers && !list.find((customer) => customer.id === editingOrder.sender_id)) {
      list.push(editingOrder.sender_customers);
    }
    return list;
  }, [customers, defaultCategory, editingOrder]);

  const senderOptions = React.useMemo<SelectOption[]>(
    () => filteredSenders.map((customer) => ({
      value: customer.id,
      label: `${customer.name}${customer.phone ? ` (${customer.phone})` : ''}`,
      matchKey: customer.name,
      searchText: [customer.name, customer.phone, ...(customer.aliases || [])].filter(Boolean).join(' '),
    })),
    [filteredSenders],
  );

  const employeeOptions = React.useMemo<SelectOption[]>(
    () => (employees || []).map((employee: User) => ({
      value: employee.id,
      label: employee.full_name || employee.phone || employee.id,
    })),
    [employees],
  );

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<ImportOrderFormValues>({
    resolver: zodResolver(importOrderSchema) as Resolver<ImportOrderFormValues>,
    defaultValues: {
      order_date: format(new Date(), 'yyyy-MM-dd'),
      order_time: new Date().toTimeString().slice(0, 5),
      items: [{ quantity: 1, weight_kg: '', product_id: '', unit_price: null, image_url: null, image_urls: [] }],
      payment_status: 'unpaid',
      customer_id: '',
      sender_name: '',
      sender_id: '',
      receiver_name: '',
      selected_alias: '',
      received_by: '',
      notes: '',
      total_amount: 0,
      receipt_image_url: null,
      receipt_image_urls: [],
    },
  });

  const watchItems = watch('items');
  const submitLockRef = React.useRef(false);

  useEffect(() => {
    if (isOpen) {
      submitLockRef.current = false;
    }
  }, [isOpen]);

  const previousItemsRef = React.useRef<string>('');
  const previousProductsRef = React.useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!watchItems) return;

    const currentItemsString = JSON.stringify(watchItems);

    // Only recalculate if items literally changed or products array size changed (prevent background fetch overwrites)
    if (currentItemsString === previousItemsRef.current && previousProductsRef.current === filteredProducts?.length) {
      return;
    }

    previousItemsRef.current = currentItemsString;
    previousProductsRef.current = filteredProducts?.length;

    if (defaultCategory === 'standard') {
      // For standard: sum unit_price * quantity across items
      let sum = 0;
      watchItems.forEach((item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        // unit_price is entered in shorthand (e.g. 50 = 50,000)
        const realPrice = price > 0 && price < 100000 ? price * 1000 : price;
        sum += Math.round(qty * realPrice);
      });
      if (sum > 0) {
        setValue('total_amount', sum, { shouldValidate: true });
      }
    } else {
      // For vegetable: use product base_price
      if (!filteredProducts.length) return;
      let sum = 0;
      watchItems.forEach((item) => {
        const product = filteredProducts.find((p) => p.id === item.product_id);
        if (product && product.base_price) {
          const qty = Number(item.quantity) || 0;
          const amount = Math.round(qty * product.base_price);
          sum += amount;
        }
      });
      if (sum > 0) {
        setValue('total_amount', sum, { shouldValidate: true });
      }
    }
  }, [JSON.stringify(watchItems), filteredProducts, defaultCategory, setValue]);

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const watchCustomerId = watch('customer_id');
  const watchSenderId = watch('sender_id');
  const watchReceivedBy = watch('received_by');
  const watchPaymentStatus = watch('payment_status');
  const watchSelectedAlias = watch('selected_alias');
  useEffect(() => {
    if (editingOrder) {
      let receiptUrls = [...(editingOrder.receipt_image_urls || [])];
      if (receiptUrls.length === 0 && typeof editingOrder.receipt_image_url === 'string' && editingOrder.receipt_image_url.trim().length > 0) {
        receiptUrls = editingOrder.receipt_image_url.includes(',') ? editingOrder.receipt_image_url.split(',').map((u: string) => u.trim()) : [editingOrder.receipt_image_url];
      }

      reset({
        order_date: editingOrder.order_date,
        order_time: editingOrder.order_time,
        received_by: editingOrder.received_by || '',
        customer_id: editingOrder.customer_id || '',
        sender_name: editingOrder.sender_name || '',
        sender_id: editingOrder.sender_id || '',
        receiver_name: editingOrder.receiver_name || '',
        selected_alias: editingOrder.selected_alias || '',
        notes: editingOrder.notes || '',
        items: editingOrder.import_order_items?.map((item: ImportOrderItem) => {
          let urls = [...(item.image_urls || [])];
          if (urls.length === 0 && typeof item.image_url === 'string' && item.image_url.trim().length > 0) {
            urls = item.image_url.includes(',') ? item.image_url.split(',').map((u: string) => u.trim()) : [item.image_url];
          }
          return {
            product_id: item.product_id,
            package_type: item.package_type,
            weight_kg: item.weight_kg,
            quantity: item.quantity,
            unit_price: item.unit_price ? item.unit_price / 1000 : null,
            image_url: item.image_url || null,
            image_urls: urls,
          };
        }) || [],
        payment_status: editingOrder.import_order_items?.[0]?.payment_status || 'unpaid',
        total_amount: editingOrder.total_amount || 0,
        receipt_image_url: editingOrder.receipt_image_url || null,
        receipt_image_urls: receiptUrls,
      });
    } else {
      reset({
        order_date: format(new Date(), 'yyyy-MM-dd'),
        order_time: new Date().toTimeString().slice(0, 5),
        items: [{ quantity: 1, weight_kg: '', product_id: '', unit_price: null, image_url: null, image_urls: [] }],
        payment_status: 'unpaid',
        customer_id: '',
        sender_name: '',
        sender_id: '',
        receiver_name: '',
        selected_alias: '',
        received_by: user?.id || employees?.[0]?.id || '',
        notes: '',
        total_amount: 0,
        receipt_image_url: null,
        receipt_image_urls: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOrder, reset, isOpen, user?.id]);

  const watchTotalAmountInput = watch('total_amount');
  const [uploadingItemIndex, setUploadingItemIndex] = React.useState<number | null>(null);

  const handleItemImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter((file) => file.type.startsWith('image/'));
    if (validFiles.length !== files.length) {
      toast.error('Chỉ hỗ trợ file ảnh');
      if (validFiles.length === 0) return;
    }

    try {
      setUploadingItemIndex(index);
      const uploadPromises = validFiles.map((file) => uploadApi.uploadFile(file, 'import-orders', 'items'));
      const results = await Promise.all(uploadPromises);
      const newUrls = results.map((result) => result.url);

      const currentUrls = getValues(`items.${index}.image_urls`) || [];
      const updatedUrls = [...currentUrls, ...newUrls];

      setValue(`items.${index}.image_urls`, updatedUrls, { shouldValidate: true });
      if (updatedUrls.length > 0) {
        setValue(`items.${index}.image_url`, updatedUrls[0], { shouldValidate: true });
      }

      toast.success('Tải ảnh thành công!');
    } catch (error) {
      console.error('File upload error:', error);
      toast.error('Lỗi tải ảnh');
    } finally {
      setUploadingItemIndex(null);
      e.target.value = '';
    }
  };

  const handleCreateProduct = async (index: number, name: string) => {
    setValue(`items.${index}.product_id`, name);
    try {
      const resp = await createProductMutation.mutateAsync({
        name,
        category: defaultCategory,
      });
      const product = unwrapMutationData<Product>(resp);
      if (product?.id) {
        setValue(`items.${index}.product_id`, product.id, { shouldValidate: true });
        toast.success(`Đã tạo nhanh mặt hàng: ${name}`);
      }
    } catch {
      setValue(`items.${index}.product_id`, '', { shouldValidate: true });
      toast.error(`Lỗi khi tạo: ${name}`);
    }
  };

  const onSubmit = async (data: ImportOrderFormValues) => {
    if (submitLockRef.current) return;

    submitLockRef.current = true;

    try {
      console.log('--- FORM SUBMIT DATA BEGIN ---', data);
      const { items, ...formPayload } = data;
      const payload: ImportOrderSubmitPayload = { ...formPayload };
      if (items) {
        payload.items = items.map((item, index) => {
          const price = Number(item.unit_price) || 0;
          const realPrice = price > 0 && price < 100000 ? price * 1000 : price;
          return {
            ...item,
            unit_price: realPrice > 0 ? realPrice : null,
            payment_status: payload.payment_status || 'unpaid',
            image_urls: getValues(`items.${index}.image_urls`) || [],
            image_url: getValues(`items.${index}.image_url`) || null,
          };
        });
      }
      payload.order_category = defaultCategory;

      // Always treat as explicit amount
      payload.is_custom_amount = true;

      // Nếu khách tự gõ số thu gọn (nhỏ hơn 1000, vd: 90) thì tự động nhân 1000 thành 90000
      // Hành động x1000 chỉ diễn ra lúc xác nhận (submit). Các khoản đã tính đủ 0 (>= 1000) sẽ giữ nguyên.
      const totalAmount = Number(payload.total_amount) || 0;
      if (totalAmount > 0 && totalAmount < 1000) {
        payload.total_amount = totalAmount * 1000;
      } else {
        payload.total_amount = totalAmount;
      }

      payload.receipt_image_urls = getValues('receipt_image_urls') || [];

      payload.selected_alias = payload.selected_alias || null;

      Object.keys(payload).forEach((key) => {
        const payloadKey = key as keyof typeof payload;
        if (payload[payloadKey] === '') delete payload[payloadKey];
      });

      if (isEditMode && editingOrder) {
        console.log('--- DISPATCH UPDATE_MUTATION ---', payload);
        await updateMutation.mutateAsync({ id: editingOrder.id, payload: payload as Partial<ImportOrderCreatePayload> });
      } else {
        console.log('--- DISPATCH CREATE_MUTATION ---', payload);
        await createMutation.mutateAsync(payload as ImportOrderCreatePayload);
      }
      submitLockRef.current = false;
      onClose();
    } catch {
      submitLockRef.current = false;
      // Error handled by mutation
    }
  };

  if (!isOpen && !isClosing) return null;

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-350 ease-out',
          isClosing ? 'opacity-0' : 'animate-in fade-in duration-300',
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={clsx(
          'relative w-full max-w-[1200px] bg-background shadow-2xl flex flex-col h-[100dvh] border-l border-border',
          isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-card border-b border-border z-10 shadow-sm relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-inner">
              <Package size={20} />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-foreground text-balance pr-6">
                {isEditMode ? 'Chỉnh sửa Phiếu Nhập' : 'Lập Phiếu Nhập Hàng'}
              </h2>
              <p className="text-[12px] font-medium text-muted-foreground">
                {defaultCategory === 'standard' ? 'Tạo phiếu nhập kho mới cho cửa hàng' : 'Lưu trữ hàng hóa về vựa và cộng công nợ chủ hàng'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6 space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">

            {/* THONG TIN CHUYEN XE & KHACH HANG */}
            <div className="lg:col-span-5 xl:col-span-5 space-y-4 md:space-y-6">
              <div className="bg-card rounded-2xl border border-border shadow-sm p-4 md:p-5 space-y-3 md:space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-border/50">
                  <UserCircle size={18} className="text-primary" />
                  <span className="text-[13px] font-bold text-foreground uppercase tracking-wider">Thông tin Khách</span>
                </div>

                <div className="space-y-3 md:space-y-4">
                  {defaultCategory === 'standard' ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 md:gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Ngày</label>
                          <Controller name="order_date" control={control} render={({ field }) => <DatePicker value={field.value as string} onChange={field.onChange} />} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Giờ</label>
                          <Controller name="order_time" control={control} render={({ field }) => <TimePicker24h value={field.value as string} onChange={field.onChange} />} />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Người gửi</label>
                          <button
                            type="button"
                            onClick={() => setShowNewSenderForm(!showNewSenderForm)}
                            className={clsx(
                              'flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all active:scale-95',
                              showNewSenderForm
                                ? 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-200'
                                : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20'
                            )}
                          >
                            {showNewSenderForm ? <X size={12} /> : <Plus size={12} />}
                            {showNewSenderForm ? 'Đóng' : 'Thêm mới'}
                          </button>
                        </div>
                        <CreatableSearchableSelect
                          options={senderOptions}
                          value={watchSenderId || ''}
                          onValueChange={(val) => {
                            setValue('sender_id', val, { shouldValidate: true });
                            const found = filteredSenders.find((customer) => customer.id === val);
                            setValue('sender_name', found?.name || '', { shouldValidate: true });
                          }}
                          onCreate={async (name) => {
                            try {
                              const customerType = 'grocery_sender';
                              const resp = await createCustomerMutation.mutateAsync({ name, customer_type: customerType });
                              const row = unwrapMutationData(resp);
                              if (row?.id) {
                                setValue('sender_id', row.id, { shouldValidate: true });
                                setValue('sender_name', row.name || name, { shouldValidate: true });
                              }
                            } catch { /* handled */ }
                          }}
                          placeholder="Chọn hoặc tạo người gửi"
                          createMessage="Tạo mới"
                          disabled={showNewSenderForm}
                        />

                        {/* Inline Add Sender Form */}
                        {showNewSenderForm && (
                          <div className="mt-2 p-3 bg-primary/5 border border-primary/15 rounded-xl space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                            <p className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                              <UserCircle size={14} />
                              Thêm người gửi mới
                            </p>
                            <input
                              type="text"
                              value={newSenderName}
                              onChange={(e) => setNewSenderName(e.target.value)}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                              placeholder="Tên người gửi *"
                            />
                            <input
                              type="tel"
                              value={newSenderPhone}
                              onChange={(e) => setNewSenderPhone(e.target.value)}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                              placeholder="Số điện thoại (không bắt buộc)"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => { setShowNewSenderForm(false); setNewSenderName(''); setNewSenderPhone(''); }}
                                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-border bg-card text-muted-foreground text-[12px] font-bold hover:bg-muted/50 transition-all active:scale-[0.98]"
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                onClick={handleCreateSender}
                                disabled={createCustomerMutation.isPending || !newSenderName.trim()}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-[12px] font-bold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {createCustomerMutation.isPending ? (
                                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 size={14} />
                                    Lưu & Chọn
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Người nhận <span className="text-red-500">*</span></label>
                          <button
                            type="button"
                            onClick={() => setShowNewCustomerForm(!showNewCustomerForm)}
                            className={clsx(
                              'flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all active:scale-95',
                              showNewCustomerForm
                                ? 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-200'
                                : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20'
                            )}
                          >
                            {showNewCustomerForm ? <X size={12} /> : <Plus size={12} />}
                            {showNewCustomerForm ? 'Đóng' : 'Thêm mới'}
                          </button>
                        </div>
                        <SearchableSelect
                          options={customerOptions}
                          value={watchSelectedAlias ? `${watchCustomerId}:${watchSelectedAlias}` : watchCustomerId}
                          onValueChange={(val) => {
                            if (val.includes(':')) {
                              const [id, alias] = val.split(':');
                              setValue('customer_id', id, { shouldValidate: true });
                              setValue('selected_alias', alias, { shouldValidate: true });
                            } else {
                              setValue('customer_id', val, { shouldValidate: true });
                              setValue('selected_alias', '', { shouldValidate: true });
                            }
                          }}
                          placeholder="Nhập tên người nhận hàng"
                          disabled={showNewCustomerForm}
                        />
                        {errors.customer_id && <p className="text-red-500 text-[11px] font-medium">{errors.customer_id.message as string}</p>}

                        {/* Inline Add Customer Form */}
                        {showNewCustomerForm && (
                          <div className="mt-2 p-3 bg-primary/5 border border-primary/15 rounded-xl space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                            <p className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                              <UserCircle size={14} />
                              Thêm khách hàng mới
                            </p>
                            <input
                              type="text"
                              value={newCustomerName}
                              onChange={(e) => setNewCustomerName(e.target.value)}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                              placeholder="Tên khách hàng *"
                            />
                            <input
                              type="tel"
                              value={newCustomerPhone}
                              onChange={(e) => setNewCustomerPhone(e.target.value)}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                              placeholder="Số điện thoại (không bắt buộc)"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => { setShowNewCustomerForm(false); setNewCustomerName(''); setNewCustomerPhone(''); }}
                                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-border bg-card text-muted-foreground text-[12px] font-bold hover:bg-muted transition-all active:scale-[0.98]"
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                onClick={handleCreateCustomer}
                                disabled={createCustomerMutation.isPending || !newCustomerName.trim()}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-[12px] font-bold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {createCustomerMutation.isPending ? (
                                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 size={14} />
                                    Lưu & Chọn
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          {watchPaymentStatus === 'paid' ? 'NV thu tiền (SG)' : 'Nhân viên nhận'}
                        </label>
                        {employees?.length ? (
                          <SearchableSelect
                            options={employeeOptions}
                            value={watchReceivedBy}
                            onValueChange={(val) => setValue('received_by', val, { shouldValidate: true })}
                            placeholder="Chọn nhân viên"
                          />
                        ) : (
                          <div className="w-full px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[13px] font-semibold text-amber-800">
                            {employees?.find((employee) => employee.id === watchReceivedBy)?.full_name || user?.full_name || 'Tự động'}
                          </div>
                        )}
                        {errors.received_by && (
                          <p className="text-red-500 text-[11px] font-medium">{errors.received_by.message as string}</p>
                        )}
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-border">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Trạng thái Tiền</label>
                        <div className="flex bg-muted p-1 rounded-xl h-[38px] border border-border">
                          <button
                            type="button"
                            onClick={() => {
                              setValue('payment_status', 'unpaid', { shouldValidate: true });
                              setValue('total_amount', 0, { shouldValidate: true });
                            }}
                            className={clsx(
                              'flex-1 flex items-center justify-center rounded-lg text-[11px] font-bold transition-all',
                              watchPaymentStatus === 'unpaid' ? 'bg-card shadow-sm text-red-500' : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Chưa trả
                          </button>
                          <button
                            type="button"
                            onClick={() => setValue('payment_status', 'paid', { shouldValidate: true })}
                            className={clsx(
                              'flex-1 flex items-center justify-center rounded-lg text-[11px] font-bold transition-all',
                              watchPaymentStatus === 'paid' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Đã trả
                          </button>
                        </div>
                      </div>

                      {watchPaymentStatus === 'paid' && (
                        <div className="space-y-1.5 pt-2 border-t border-border animate-in fade-in slide-in-from-top-1">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tổng số tiền</label>
                          <Controller
                            name="total_amount"
                            control={control}
                            render={({ field }) => (
                              <CurrencyInput
                                {...field}
                                value={field.value as number}
                                onChange={field.onChange}
                                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-bold text-primary tabular-nums"
                                placeholder="Nhập tổng tiền..."
                              />
                            )}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 md:gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Ngày</label>
                          <Controller name="order_date" control={control} render={({ field }) => <DatePicker value={field.value as string} onChange={field.onChange} />} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Giờ</label>
                          <Controller name="order_time" control={control} render={({ field }) => <TimePicker24h value={field.value as string} onChange={field.onChange} />} />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Chủ hàng (Người gửi)</label>
                          <button
                            type="button"
                            onClick={() => setShowNewSenderForm(!showNewSenderForm)}
                            className={clsx(
                              'flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all active:scale-95',
                              showNewSenderForm
                                ? 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-200'
                                : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20'
                            )}
                          >
                            {showNewSenderForm ? <X size={12} /> : <Plus size={12} />}
                            {showNewSenderForm ? 'Đóng' : 'Thêm mới'}
                          </button>
                        </div>
                        <CreatableSearchableSelect
                          options={senderOptions}
                          value={watchSenderId || ''}
                          onValueChange={(val) => {
                            setValue('sender_id', val, { shouldValidate: true });
                            const found = filteredSenders.find((customer) => customer.id === val);
                            setValue('sender_name', found?.name || '', { shouldValidate: true });
                          }}
                          onCreate={async (name) => {
                            try {
                              const customerType = defaultCategory === 'vegetable' ? 'vegetable_sender' : 'grocery_sender';
                              const resp = await createCustomerMutation.mutateAsync({ name, customer_type: customerType });
                              const row = unwrapMutationData(resp);
                              if (row?.id) {
                                setValue('sender_id', row.id, { shouldValidate: true });
                                setValue('sender_name', row.name || name, { shouldValidate: true });
                              }
                            } catch { /* handled */ }
                          }}
                          placeholder="Chọn hoặc tạo chủ hàng"
                          createMessage="Tạo mới"
                          disabled={showNewSenderForm}
                        />

                        {/* Inline Add Sender Form */}
                        {showNewSenderForm && (
                          <div className="mt-2 p-3 bg-primary/5 border border-primary/15 rounded-xl space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                            <p className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                              <UserCircle size={14} />
                              Thêm chủ hàng mới
                            </p>
                            <input
                              type="text"
                              value={newSenderName}
                              onChange={(e) => setNewSenderName(e.target.value)}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                              placeholder="Tên chủ hàng *"
                            />
                            <input
                              type="tel"
                              value={newSenderPhone}
                              onChange={(e) => setNewSenderPhone(e.target.value)}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                              placeholder="Số điện thoại (không bắt buộc)"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => { setShowNewSenderForm(false); setNewSenderName(''); setNewSenderPhone(''); }}
                                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-border bg-card text-muted-foreground text-[12px] font-bold hover:bg-muted/50 transition-all active:scale-[0.98]"
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                onClick={handleCreateSender}
                                disabled={createCustomerMutation.isPending || !newSenderName.trim()}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-[12px] font-bold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {createCustomerMutation.isPending ? (
                                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 size={14} />
                                    Lưu & Chọn
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tên vựa (Người nhận) <span className="text-red-500">*</span></label>
                          <button
                            type="button"
                            onClick={() => setShowNewCustomerForm(!showNewCustomerForm)}
                            className={clsx(
                              'flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all active:scale-95',
                              showNewCustomerForm
                                ? 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-200'
                                : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20'
                            )}
                          >
                            {showNewCustomerForm ? <X size={12} /> : <Plus size={12} />}
                            {showNewCustomerForm ? 'Đóng' : 'Thêm mới'}
                          </button>
                        </div>
                        <SearchableSelect
                          options={customerOptions}
                          value={watchSelectedAlias ? `${watchCustomerId}:${watchSelectedAlias}` : watchCustomerId}
                          onValueChange={(val) => {
                            if (val.includes(':')) {
                              const [id, alias] = val.split(':');
                              setValue('customer_id', id, { shouldValidate: true });
                              setValue('selected_alias', alias, { shouldValidate: true });
                            } else {
                              setValue('customer_id', val, { shouldValidate: true });
                              setValue('selected_alias', '', { shouldValidate: true });
                            }
                          }}
                          placeholder="Tìm vựa rau hoặc KH Rau..."
                          disabled={showNewCustomerForm}
                        />
                        {errors.customer_id && <p className="text-red-500 text-[11px] font-medium">{errors.customer_id.message as string}</p>}


                        {/* Inline Add Customer Form */}
                        {showNewCustomerForm && (
                          <div className="mt-2 p-3 bg-primary/5 border border-primary/15 rounded-xl space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                            <p className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                              <UserCircle size={14} />
                              Thêm khách hàng mới
                            </p>
                            <input
                              type="text"
                              value={newCustomerName}
                              onChange={(e) => setNewCustomerName(e.target.value)}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                              placeholder="Tên khách hàng / vựa *"
                            />
                            <input
                              type="tel"
                              value={newCustomerPhone}
                              onChange={(e) => setNewCustomerPhone(e.target.value)}
                              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                              placeholder="Số điện thoại (không bắt buộc)"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => { setShowNewCustomerForm(false); setNewCustomerName(''); setNewCustomerPhone(''); }}
                                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-border bg-card text-muted-foreground text-[12px] font-bold hover:bg-muted/50 transition-all active:scale-[0.98]"
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                onClick={handleCreateCustomer}
                                disabled={createCustomerMutation.isPending || !newCustomerName.trim()}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-[12px] font-bold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {createCustomerMutation.isPending ? (
                                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 size={14} />
                                    Lưu & Chọn
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          {watchPaymentStatus === 'paid' ? 'NV thu tiền (SG)' : 'Nhân viên nhận'}
                        </label>
                        {employees?.length ? (
                          <SearchableSelect
                            options={employeeOptions}
                            value={watchReceivedBy}
                            onValueChange={(val) => setValue('received_by', val, { shouldValidate: true })}
                            placeholder="Chọn nhân viên"
                          />
                        ) : (
                          <div className="w-full px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[13px] font-semibold text-amber-800">
                            {employees?.find((employee) => employee.id === watchReceivedBy)?.full_name || user?.full_name || 'Tự động'}
                          </div>
                        )}
                        {errors.received_by && (
                          <p className="text-red-500 text-[11px] font-medium">{errors.received_by.message as string}</p>
                        )}
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-border">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Trạng thái Tiền</label>
                        <div className="flex bg-muted p-1 rounded-xl h-[38px] border border-border">
                          <button
                            type="button"
                            onClick={() => {
                              setValue('payment_status', 'unpaid', { shouldValidate: true });
                              setValue('total_amount', 0, { shouldValidate: true });
                            }}
                            className={clsx(
                              'flex-1 flex items-center justify-center rounded-lg text-[11px] font-bold transition-all',
                              watchPaymentStatus === 'unpaid' ? 'bg-card shadow-sm text-red-500' : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Chưa trả
                          </button>
                          <button
                            type="button"
                            onClick={() => setValue('payment_status', 'paid', { shouldValidate: true })}
                            className={clsx(
                              'flex-1 flex items-center justify-center rounded-lg text-[11px] font-bold transition-all',
                              watchPaymentStatus === 'paid' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Đã trả
                          </button>
                        </div>
                      </div>

                      {watchPaymentStatus === 'paid' && (
                        <div className="space-y-1.5 pt-2 border-t border-border animate-in fade-in slide-in-from-top-1">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tổng số tiền</label>
                          <Controller
                            name="total_amount"
                            control={control}
                            render={({ field }) => (
                              <CurrencyInput
                                {...field}
                                value={field.value}
                                onChange={(val) => field.onChange(val === undefined ? '' : val)}
                                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-bold text-primary tabular-nums"
                                placeholder="Nhập tổng tiền..."
                              />
                            )}
                          />
                        </div>
                      )}
                    </>
                  )}

                  <div className="space-y-1.5 pt-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Ghi chú thêm</label>
                    <textarea rows={3} {...register('notes')} className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none" placeholder="Thông tin chi tiết thêm về kiện hàng này..." />
                  </div>
                </div>
              </div>
            </div>

            {/* BANG HANG HOA */}
            <div className={clsx('flex flex-col min-h-[500px]', defaultCategory === 'standard' ? 'lg:col-span-7 xl:col-span-7' : 'lg:col-span-7 xl:col-span-7')}>
              <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col h-full overflow-hidden">
                <div className="px-4 md:px-5 py-3 border-b border-border bg-muted/50 flex items-center justify-between z-10">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-primary" />
                    <span className="text-[13px] font-bold text-foreground uppercase tracking-wider">Danh sách Nhập</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => append({ quantity: 1, weight_kg: '', product_id: '', unit_price: null, image_url: null, image_urls: [] })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] font-bold hover:bg-primary/90 transition-all shadow-sm shadow-primary/30 active:scale-95"
                  >
                    <Plus size={14} />
                    Thêm Dòng
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-0 bg-muted/50/30 md:bg-transparent custom-scrollbar">
                  <div className="w-full">
                    {/* Desktop Header */}
                    {/* Desktop Header */}
                    {defaultCategory === 'standard' ? (
                      <div className="hidden md:grid grid-cols-[1fr_60px_90px_100px_120px_36px] gap-3 px-4 py-3 bg-card border-b border-border sticky top-0 z-10 md:items-center">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tên Mặt Hàng</div>
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center">SL</div>
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center">Đơn giá (k)</div>
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">Thành tiền</div>
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center">Ảnh</div>
                        <div></div>
                      </div>
                    ) : (
                      <div className="hidden md:grid grid-cols-[60px_minmax(150px,3fr)_100px_36px] gap-3 px-4 py-3 bg-card border-b border-border sticky top-0 z-10 md:items-center">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center">SL</div>
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tên Hàng</div>
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">Tổng Tiền</div>
                        <div></div>
                      </div>
                    )}

                    {/* Items List */}
                    <div className="flex flex-col md:block md:divide-y md:divide-slate-100 p-2 md:p-0 gap-3 md:gap-0">
                      {fields.map((field, index) => {
                        return (
                          <div key={field.id} className={clsx(
                            "grid gap-2 md:gap-3 p-3 md:px-4 md:py-2 md:items-center bg-card rounded-xl md:rounded-none border border-border md:border-none shadow-sm md:shadow-none hover:bg-muted/50/50 transition-all group relative",
                            defaultCategory === 'standard'
                              ? "grid-cols-1 md:grid-cols-[1fr_60px_90px_100px_120px_36px]"
                              : "grid-cols-1 md:grid-cols-[60px_minmax(150px,3fr)_100px_36px]"
                          )}>

                            {/* Vegetable order: SL first, then Tên hàng */}
                            {defaultCategory === 'vegetable' ? (
                              <>
                                {/* Desktop layout: flat grid children */}
                                {/* Col 1: SL */}
                                <div className="hidden md:flex flex-col justify-center">
                                  <Controller
                                    name={`items.${index}.quantity` as const}
                                    control={control}
                                    render={({ field }) => (
                                      <input
                                        type="number"
                                        value={field.value ?? ''}
                                        onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                                        onBlur={field.onBlur}
                                        className="w-full h-9 px-2 bg-card border border-border rounded-lg text-[13px] font-black text-center text-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 focus:outline-none tabular-nums transition-all"
                                      />
                                    )}
                                  />
                                </div>

                                {/* Col 2: Tên hàng */}
                                <div className="hidden md:flex flex-col justify-center relative">
                                  <CreatableSearchableSelect
                                    options={filteredProducts.map((product) => ({
                                      value: product.id,
                                      label: product.name,
                                      matchKey: product.name,
                                    }))}
                                    value={watch(`items.${index}.product_id` as const)}
                                    onValueChange={(val) => setValue(`items.${index}.product_id`, val, { shouldValidate: true })}
                                    onCreate={(name) => handleCreateProduct(index, name)}
                                    placeholder="Gõ tên hàng..."
                                    className="h-9 border-border bg-card"
                                  />
                                  {(() => {
                                    const prod = filteredProducts.find((product) => product.id === watch(`items.${index}.product_id`));
                                    const price = prod?.base_price || 0;
                                    if (price > 0) return <span className="text-[9px] text-muted-foreground mt-0.5 ml-1">{new Intl.NumberFormat('vi-VN').format(price)}đ</span>;
                                    return null;
                                  })()}
                                  {errors.items?.[index]?.product_id && (
                                    <span className="absolute bottom-[-16px] left-2 text-[10px] text-red-500">Thiếu</span>
                                  )}
                                </div>

                                {/* Col 3: Tổng tiền */}
                                <div className="hidden md:flex flex-col justify-center text-right">
                                  {(() => {
                                    const productId = watch(`items.${index}.product_id`);
                                    const qty = Number(watch(`items.${index}.quantity`) || 0);
                                    const prod = filteredProducts.find((product) => product.id === productId);
                                    const price = prod?.base_price || 0;
                                    const total = Math.round(qty * price);
                                    return (
                                      <span className="text-[13px] font-bold text-primary tabular-nums flex items-center justify-end">
                                        {total > 0 ? new Intl.NumberFormat('vi-VN').format(total) : '-'}
                                      </span>
                                    );
                                  })()}
                                </div>

                                {/* Col 5: Delete */}
                                <div className="hidden md:flex items-center justify-center">
                                  <button
                                    type="button"
                                    onClick={() => remove(index)}
                                    className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-md transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    title="Xóa dòng"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>

                                {/* Mobile layout */}
                                <div className="md:hidden flex items-start gap-2">
                                  <div className="flex-1 flex flex-col space-y-1 relative">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase">Tên hàng</label>
                                    <CreatableSearchableSelect
                                      options={filteredProducts.map((product) => ({
                                        value: product.id,
                                        label: product.name,
                                        matchKey: product.name,
                                      }))}
                                      value={watch(`items.${index}.product_id` as const)}
                                      onValueChange={(val) => setValue(`items.${index}.product_id`, val, { shouldValidate: true })}
                                      onCreate={(name) => handleCreateProduct(index, name)}
                                      placeholder="Gõ tên hàng..."
                                      className="h-9 border-border bg-card"
                                    />
                                    {errors.items?.[index]?.product_id && (
                                      <span className="text-[10px] text-red-500">Thiếu</span>
                                    )}
                                    {(() => {
                                      const prod = filteredProducts.find((product) => product.id === watch(`items.${index}.product_id`));
                                      const price = prod?.base_price || 0;
                                      if (price > 0) return <span className="text-[9px] text-muted-foreground mt-0.5">{new Intl.NumberFormat('vi-VN').format(price)}đ</span>;
                                      return null;
                                    })()}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => remove(index)}
                                    className="shrink-0 h-9 w-9 mt-[18px] flex items-center justify-center text-red-500 hover:bg-red-100 hover:text-red-600 rounded-xl transition-all bg-red-50/50 border border-red-100 hover:border-red-200"
                                    title="Xóa dòng"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>

                                <div className="md:hidden grid gap-2 border-t border-dashed border-border pt-2 mt-2 grid-cols-2">
                                  <div className="flex flex-col space-y-1 col-span-1">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase">Số lượng</label>
                                    <Controller
                                      name={`items.${index}.quantity` as const}
                                      control={control}
                                      render={({ field }) => (
                                        <input
                                          type="number"
                                          value={field.value ?? ''}
                                          onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                                          onBlur={field.onBlur}
                                          className="w-full h-9 px-2 bg-card border border-border rounded-lg text-[13px] font-black text-center text-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 focus:outline-none tabular-nums transition-all"
                                        />
                                      )}
                                    />
                                  </div>
                                  <div className="flex flex-col space-y-1 col-span-1">
                                    {(() => {
                                      const productId = watch(`items.${index}.product_id`);
                                      const qty = Number(watch(`items.${index}.quantity`) || 0);
                                      const prod = filteredProducts.find((product) => product.id === productId);
                                      const price = prod?.base_price || 0;
                                      const total = Math.round(qty * price);
                                      return (
                                        <>
                                          <label className="text-[11px] font-bold text-muted-foreground uppercase">
                                            Tổng tiền
                                          </label>
                                          <span className="text-[13px] font-bold text-primary tabular-nums h-9 flex items-center bg-muted/50 px-3 rounded-lg border border-border">
                                            {total > 0 ? new Intl.NumberFormat('vi-VN').format(total) : '-'}
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                {/* Standard order: original layout */}
                                <div className="flex items-end gap-2 md:contents">
                                  <div className="flex-1 flex flex-col justify-center space-y-1 md:space-y-0 relative">
                                    <label className="text-[11px] font-bold text-muted-foreground md:hidden uppercase">Mặt hàng</label>
                                    <CreatableSearchableSelect
                                      options={filteredProducts.map((product) => ({
                                        value: product.id,
                                        label: product.name,
                                        matchKey: product.name,
                                      }))}
                                      value={watch(`items.${index}.product_id` as const)}
                                      onValueChange={(val) => setValue(`items.${index}.product_id`, val, { shouldValidate: true })}
                                      onCreate={(name) => handleCreateProduct(index, name)}
                                      placeholder="Gõ tên hàng..."
                                      className="h-9 border-border bg-card"
                                    />
                                    {errors.items?.[index]?.product_id && (
                                      <span className="md:absolute md:bottom-[-16px] md:left-2 text-[10px] text-red-500">Thiếu</span>
                                    )}
                                  </div>

                                  {/* Mobile Delete Button */}
                                  <button
                                    type="button"
                                    onClick={() => remove(index)}
                                    className="md:hidden shrink-0 h-9 w-9 mt-auto flex items-center justify-center text-red-500 hover:bg-red-100 hover:text-red-600 rounded-xl transition-all bg-red-50/50 border border-red-100 hover:border-red-200"
                                    title="Xóa dòng"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>

                                <div className="grid md:contents gap-2 md:gap-3 border-t border-dashed border-border md:border-none pt-2 md:pt-0 mt-2 md:mt-0 grid-cols-3">
                                  {/* Số lượng */}
                                  <div className="flex flex-col justify-center space-y-1 md:space-y-0 col-span-1">
                                    <label className="text-[11px] font-bold text-muted-foreground md:hidden uppercase">SL</label>
                                    <input
                                      type="number"
                                      {...register(`items.${index}.quantity` as const)}
                                      className="w-full h-9 px-2 bg-card border border-border rounded-lg text-[13px] font-black text-center text-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 focus:outline-none tabular-nums transition-all"
                                    />
                                  </div>
                                  {/* Đơn giá */}
                                  <div className="flex flex-col justify-center space-y-1 md:space-y-0 col-span-1">
                                    <label className="text-[11px] font-bold text-muted-foreground md:hidden uppercase">Đơn giá (k)</label>
                                    <Controller
                                      name={`items.${index}.unit_price` as const}
                                      control={control}
                                      render={({ field }) => (
                                        <input
                                          type="number"
                                          value={field.value ?? ''}
                                          onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                                          onBlur={field.onBlur}
                                          placeholder="VD: 50"
                                          className="w-full h-9 px-2 bg-card border border-border rounded-lg text-[13px] font-bold text-center text-amber-700 focus:border-primary focus:ring-1 focus:ring-primary/50 focus:outline-none tabular-nums transition-all"
                                        />
                                      )}
                                    />
                                    {(() => {
                                      const p = Number(watch(`items.${index}.unit_price`) || 0);
                                      if (p > 0) {
                                        const real = p < 100000 ? p * 1000 : p;
                                        return <span className="text-[9px] text-muted-foreground text-center md:hidden">{new Intl.NumberFormat('vi-VN').format(real)}đ</span>;
                                      }
                                      return null;
                                    })()}
                                  </div>
                                  {/* Thành tiền */}
                                  <div className="flex flex-col justify-center space-y-1 md:space-y-0 col-span-1">
                                    <label className="text-[11px] font-bold text-muted-foreground md:hidden uppercase">Thành tiền</label>
                                    {(() => {
                                      const qty = Number(watch(`items.${index}.quantity`) || 0);
                                      const price = Number(watch(`items.${index}.unit_price`) || 0);
                                      const realPrice = price > 0 && price < 100000 ? price * 1000 : price;
                                      const total = Math.round(qty * realPrice);
                                      return (
                                        <span className="text-[13px] font-bold text-primary tabular-nums h-9 flex items-center justify-end md:justify-end px-2 bg-muted/50 md:bg-transparent rounded-lg md:rounded-none border border-border md:border-none">
                                          {total > 0 ? new Intl.NumberFormat('vi-VN').format(total) + 'đ' : '-'}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </div>

                                <div className="md:hidden mt-2 col-span-full border-t border-dashed border-border pt-2 pb-1 w-full">
                                  <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1.5 block">Ảnh hàng hóa</label>
                                  <div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar w-full">
                                    {(watch(`items.${index}.image_urls`) || []).map((url, imgIdx) => (
                                      <div key={imgIdx} className="relative w-12 h-12 rounded-lg border border-border overflow-hidden shrink-0">
                                        <img src={cloudinaryThumb(url)} alt="item" className="w-full h-full object-cover" />
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const newUrls = (watch(`items.${index}.image_urls`) || []).filter((_, i) => i !== imgIdx);
                                            setValue(`items.${index}.image_urls`, newUrls, { shouldValidate: true });
                                            setValue(`items.${index}.image_url`, newUrls.length > 0 ? newUrls[0] : null, { shouldValidate: true });
                                          }}
                                          className="absolute top-0.5 right-0.5 z-10 w-[18px] h-[18px] rounded-full bg-red-600 text-white flex items-center justify-center shadow-sm hover:bg-red-700 active:scale-95 transition-all"
                                          aria-label="Xóa ảnh"
                                          title="Xóa ảnh"
                                        >
                                          <X size={10} />
                                        </button>
                                      </div>
                                    ))}
                                    <label className="border border-dashed border-border bg-muted/50 rounded-xl flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 cursor-pointer transition-all w-[3.25rem] h-[3.25rem] min-w-[3.25rem] shrink-0 touch-manipulation active:scale-[0.98]" title="Chọn ảnh">
                                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleItemImageUpload(index, e)} />
                                      {uploadingItemIndex === index ? <Loader2 size={18} className="animate-spin text-primary" /> : <Plus size={18} />}
                                    </label>
                                    <label className="border border-dashed border-border bg-muted/50 rounded-xl flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 cursor-pointer transition-all w-[3.25rem] h-[3.25rem] min-w-[3.25rem] shrink-0 touch-manipulation active:scale-[0.98]" title="Chụp ảnh">
                                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleItemImageUpload(index, e)} />
                                      {uploadingItemIndex === index ? <Loader2 size={18} className="animate-spin text-primary" /> : <Camera size={18} />}
                                    </label>
                                  </div>
                                </div>
                              </>
                            )}

                            {defaultCategory === 'standard' && (
                              <div className="hidden md:flex items-start justify-start w-full">
                                <div className="flex justify-start w-full">
                                  <div className="flex items-center gap-1 flex-wrap w-[110px]">
                                    {(watch(`items.${index}.image_urls`) || []).map((url, imgIdx) => (
                                      <div key={imgIdx} className="relative w-8 h-8 rounded-md border border-border overflow-hidden shrink-0">
                                        <img src={cloudinaryThumb(url)} alt="item" className="w-full h-full object-cover" />
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const newUrls = (watch(`items.${index}.image_urls`) || []).filter((_, i) => i !== imgIdx);
                                            setValue(`items.${index}.image_urls`, newUrls, { shouldValidate: true });
                                            setValue(`items.${index}.image_url`, newUrls.length > 0 ? newUrls[0] : null, { shouldValidate: true });
                                          }}
                                          className="absolute -top-1 -right-1 z-10 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center shadow-sm hover:bg-red-700 active:scale-95 transition-all"
                                          aria-label="Xóa ảnh"
                                          title="Xóa ảnh"
                                        >
                                          <X size={10} />
                                        </button>
                                      </div>
                                    ))}
                                    <label className="w-8 h-8 border border-dashed border-border bg-muted/50 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 cursor-pointer transition-all shrink-0" title="Thêm ảnh">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => handleItemImageUpload(index, e)}
                                      />
                                      {uploadingItemIndex === index ? <Loader2 size={12} className="animate-spin text-primary" /> : <Plus size={12} />}
                                    </label>
                                    <label className="w-8 h-8 border border-dashed border-border bg-muted/50 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 cursor-pointer transition-all shrink-0" title="Chụp ảnh">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        onChange={(e) => handleItemImageUpload(index, e)}
                                      />
                                      {uploadingItemIndex === index ? <Loader2 size={12} className="animate-spin text-primary" /> : <Camera size={12} />}
                                    </label>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Desktop Delete Button - only for standard */}
                            {defaultCategory === 'standard' && (
                              <div className="hidden md:flex items-center justify-center">
                                <button
                                  type="button"
                                  onClick={() => remove(index)}
                                  className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-md transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                  title="Xóa dòng"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>



                {/* Live Check Total */}
                {(defaultCategory === 'vegetable' || (() => {
                  // Show total for standard when an item has a price
                  const items = watchItems || [];
                  return defaultCategory === 'standard' && items.some((item) => Number(item.unit_price) > 0);
                })()) && (
                    <div className="p-4 md:p-5 bg-primary/5 flex flex-col md:flex-row items-center justify-between border-t border-primary/10 shrink-0 gap-1 md:gap-0">
                      <div className="flex flex-col items-center md:items-start text-center md:text-left">
                        <span className="text-[12px] font-bold text-primary uppercase tracking-widest">Tổng tiền phiếu nhập</span>
                        <span className="text-[12px] text-primary/70 font-medium">
                          {defaultCategory === 'vegetable' ? 'Được cộng vào Công Nợ của Khách' : 'SL × Đơn giá'}
                        </span>
                      </div>
                      <div className="text-3xl font-black text-primary tabular-nums drop-shadow-sm">
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format((Number(watchTotalAmountInput) || 0) * (defaultCategory === 'standard' ? 1 : 1000))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="bg-card border-t border-border px-4 md:px-6 py-3 md:py-4 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl border border-border hover:bg-muted/50 text-muted-foreground text-[13px] font-bold transition-all active:scale-95"
          >
            Đóng
          </button>
          <button
            onClick={handleSubmit(onSubmit, (err) => {
              console.error('Validation Error', err);
              toast.error('Thiếu thông tin bắt buộc (chữ đỏ) hoặc chưa điền Hàng hóa.');
            })}
            disabled={isSubmitting}
            className={clsx(
              'flex items-center gap-2 px-8 py-2.5 rounded-xl text-[13px] font-bold shadow-lg transition-all active:scale-95',
              isSubmitting
                ? 'bg-primary/50 text-white/80 cursor-wait'
                : 'bg-primary text-white hover:bg-primary/90 hover:shadow-primary/25',
            )}
          >
            {isSubmitting ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 size={18} />
                {isEditMode ? 'Cập nhật Phiếu' : 'Chốt Phiếu Nhập'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AddEditStandardImportOrderDialog;



