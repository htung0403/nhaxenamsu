import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Package, Plus, Trash2, CheckCircle2, FileText, UserCircle, ImagePlus, Loader2, Camera } from 'lucide-react';
import { clsx } from 'clsx';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { importOrderKeys, useCreateImportOrder, useUpdateImportOrder } from '../../../hooks/queries/useImportOrders';
import { useVehicles } from '../../../hooks/queries/useVehicles';
import { useCustomers, useCreateCustomer } from '../../../hooks/queries/useCustomers';
import { useCreateProduct, useProducts, productMatchesScope } from '../../../hooks/queries/useProducts';
import { useEmployees } from '../../../hooks/queries/useHR';
import type { DeliveryOrder, ImportOrder, ImportOrderItem, Vehicle } from '../../../types';
import { uploadApi } from '../../../api/uploadApi';
import { deliveryApi } from '../../../api/deliveryApi';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { CreatableSearchableSelect } from '../../../components/ui/CreatableSearchableSelect';
import { TimePicker24h } from '../../../components/shared/TimePicker24h';
import { DatePicker } from '../../../components/shared/DatePicker';
import { useAuth } from '../../../context/AuthContext';
import toast from 'react-hot-toast';
import { cloudinaryThumb } from '../../../lib/cloudinaryUrl';

const vehicleSupportsCategory = (vehicle: Vehicle, category: 'standard' | 'vegetable') => {
  if (!vehicle.goods_categories || vehicle.goods_categories.length === 0) return true;
  const target = category === 'vegetable' ? 'vegetable' : 'grocery';
  return vehicle.goods_categories.includes(target);
};

const normalizeRoleText = (value?: string | null) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isDriverRole = (role?: string | null) => {
  const normalized = normalizeRoleText(role).replace(/\s+/g, '_');
  return normalized === 'driver' || normalized.includes('tai_xe') || normalized.includes('driver') || normalized.includes('lo_xe');
};

const isHeavyDriverRoleRecord = (roleKey?: string | null, roleName?: string | null) => {
  const normalizedKey = normalizeRoleText(roleKey).replace(/\s+/g, '_');
  const normalizedName = normalizeRoleText(roleName);

  const heavyKeyCandidates = ['tai_xe_xe_tai_lon', 'tai_xe_tai_lon'];
  const heavyNameCandidates = ['tai xe xe tai lon', 'tai xe tai lon', 'tai xe xe lon', 'xe lon'];

  const byKey = heavyKeyCandidates.some((candidate) => normalizedKey.includes(candidate));
  const byName = heavyNameCandidates.some((candidate) => normalizedName.includes(candidate));
  return byKey || byName;
};

const isHeavyDriverEmployee = (employee: any) => {
  const assignedRoles = (employee?.app_user_roles || [])
    .map((record: any) => record?.app_roles)
    .filter((role: any) => Boolean(role));

  if (assignedRoles.length > 0) {
    return assignedRoles.some((role: any) => isHeavyDriverRoleRecord(role?.role_key, role?.role_name));
  }

  return isHeavyDriverRoleRecord(employee?.role, employee?.role_name || employee?.role);
};

const normalizePersonName = (value?: string | null) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const importOrderItemSchema = z.object({
  product_id: z.string().min(1, 'Chọn hàng hóa'),
  package_type: z.string().optional().nullable().catch(null),
  weight_kg: z.coerce.number().optional().nullable().catch(null),
  quantity: z.coerce.number().min(1, 'SL > 0').catch(1),
  image_url: z.string().optional().nullable().catch(null),
  image_urls: z.array(z.string()).optional().catch([]),
  item_note: z.string().optional().nullable().catch(''),
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
  items: z.array(importOrderItemSchema).min(1, 'Vui lòng thêm ít nhất 1 mặt hàng'),
  total_amount: z.coerce.number().min(0, 'Tổng tiền không hợp lệ').catch(0),
  notes: z.string().optional().nullable().catch(''),
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

const AddEditVegetableImportOrderDialog: React.FC<Props> = ({ isOpen, isClosing, editingOrder, onClose, defaultCategory = 'vegetable' }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEditMode = !!editingOrder;
  const createMutation = useCreateImportOrder();
  const updateMutation = useUpdateImportOrder();
  const createProductMutation = useCreateProduct();
  const createCustomerMutation = useCreateCustomer();
  const { data: vehicles, isError: isVehiclesError } = useVehicles(isOpen);
  const { data: products } = useProducts(isOpen, 'vegetable');
  const { data: customers } = useCustomers(undefined, isOpen);
  const { data: employees } = useEmployees(isOpen);

  // Inline add-new-customer state
  const [showNewCustomerForm, setShowNewCustomerForm] = React.useState(false);
  const [newCustomerName, setNewCustomerName] = React.useState('');
  const [newCustomerPhone, setNewCustomerPhone] = React.useState('');

  const [showNewSenderForm, setShowNewSenderForm] = React.useState(false);
  const [newSenderName, setNewSenderName] = React.useState('');
  const [newSenderPhone, setNewSenderPhone] = React.useState('');
  const [selectedDriverVehicleId, setSelectedDriverVehicleId] = React.useState('');

  const isDriverUser = isDriverRole(user?.role);
  const canAutoAssignDriverVehicle = !isEditMode && defaultCategory === 'vegetable' && isDriverUser;
  const currentDriverProfileIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (user?.id) ids.add(user.id);

    const normalizedCurrentName = normalizePersonName(user?.full_name);
    const currentEmail = (user?.email || '').trim().toLowerCase();

    (employees || []).forEach((employee: any) => {
      if (!employee?.id) return;
      const emailMatch = currentEmail && (employee.email || '').trim().toLowerCase() === currentEmail;
      const nameMatch = normalizedCurrentName && normalizePersonName(employee.full_name) === normalizedCurrentName;
      if (emailMatch || nameMatch) ids.add(employee.id);
    });

    return ids;
  }, [employees, user?.id, user?.email, user?.full_name]);
  const driverOwnedVehiclesById = React.useMemo(
    () => (vehicles || []).filter((v) => v.driver_id && currentDriverProfileIds.has(v.driver_id)),
    [vehicles, currentDriverProfileIds]
  );
  const driverOwnedVehiclesByName = React.useMemo(() => {
    const normalizedCurrentUserName = normalizePersonName(user?.full_name);
    if (!normalizedCurrentUserName) return [] as Vehicle[];
    return (vehicles || []).filter((v) => normalizePersonName(v.profiles?.full_name) === normalizedCurrentUserName);
  }, [vehicles, user?.full_name]);
  const driverOwnedVehicles = React.useMemo(() => {
    const merged = new Map<string, Vehicle>();
    driverOwnedVehiclesById.forEach((v) => merged.set(v.id, v));
    driverOwnedVehiclesByName.forEach((v) => merged.set(v.id, v));
    return Array.from(merged.values());
  }, [driverOwnedVehiclesById, driverOwnedVehiclesByName]);
  const categoryMatchedDriverVehicles = React.useMemo(
    () => driverOwnedVehicles.filter((v) => vehicleSupportsCategory(v, defaultCategory)),
    [driverOwnedVehicles, defaultCategory]
  );
  const driverVehicles = React.useMemo(
    () => (categoryMatchedDriverVehicles.length > 0 ? categoryMatchedDriverVehicles : driverOwnedVehicles),
    [categoryMatchedDriverVehicles, driverOwnedVehicles]
  );
  const isDriverVehiclesNameFallback = driverOwnedVehiclesById.length === 0 && driverOwnedVehiclesByName.length > 0;
  const isDriverVehiclesCategoryFallback = driverOwnedVehicles.length > 0 && categoryMatchedDriverVehicles.length === 0;
  const selectedDriverVehicle = React.useMemo(
    () => driverVehicles.find((v) => v.id === selectedDriverVehicleId) || null,
    [driverVehicles, selectedDriverVehicleId]
  );
  const dialogVehiclePlateText = React.useMemo(() => {
    if (editingOrder?.license_plate) return editingOrder.license_plate;

    if (canAutoAssignDriverVehicle) {
      if (selectedDriverVehicle?.license_plate) return selectedDriverVehicle.license_plate;
      if (driverVehicles.length === 1) return driverVehicles[0].license_plate;
    }

    return '';
  }, [editingOrder?.license_plate, canAutoAssignDriverVehicle, selectedDriverVehicle, driverVehicles]);

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
      const row = resp as any;
      const newId = row?.id || row?.data?.id;
      if (newId) {
        setValue('customer_id', newId, { shouldValidate: true });
        if (row?.name) setValue('receiver_name', row.name, { shouldValidate: true });
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
      const row = resp as any;
      const newId = row?.id || row?.data?.id;
      if (newId) {
        setValue('sender_id', newId, { shouldValidate: true });
        setValue('sender_name', row?.name || newSenderName.trim(), { shouldValidate: true });
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
    const list = products?.filter((p: any) => productMatchesScope(p, cat)) || [];
    if (editingOrder?.import_order_items) {
      const addedIds = new Set(list.map((p: any) => p.id));
      editingOrder.import_order_items.forEach((item: any) => {
        const prod = item.products;
        if (!prod || addedIds.has(item.product_id)) return;
        if (!productMatchesScope(prod, cat)) return;
        list.push(prod);
        addedIds.add(item.product_id);
      });
    }
    return list;
  }, [products, defaultCategory, editingOrder]);

  const filteredCustomers = React.useMemo(() => {
    const list: any[] = customers?.filter((c: any) =>
      defaultCategory === 'vegetable'
        ? c.customer_type === 'vegetable_receiver'
        : c.customer_type === 'grocery_receiver'
    ) || [];

    if (editingOrder?.customers && !list.find((c: any) => c.id === editingOrder.customer_id)) {
      list.push(editingOrder.customers);
    }
    return list;
  }, [customers, defaultCategory, editingOrder]);

  const filteredSenders = React.useMemo(() => {
    const list: any[] = customers?.filter((c: any) =>
      defaultCategory === 'vegetable' ? c.customer_type === 'vegetable_sender' : c.customer_type === 'grocery_sender'
    ) || [];
    if (editingOrder?.sender_customers && !list.find((c: any) => c.id === editingOrder.sender_id)) {
      list.push(editingOrder.sender_customers);
    }
    return list;
  }, [customers, defaultCategory, editingOrder]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(importOrderSchema),
    defaultValues: {
      order_date: format(new Date(), 'yyyy-MM-dd'),
      order_time: new Date().toTimeString().slice(0, 5),
      items: [{ quantity: 1, weight_kg: '', product_id: '', image_url: null, image_urls: [], item_note: '' }],
      customer_id: '',
      sender_name: '',
      sender_id: '',
      receiver_name: '',
      selected_alias: '',
      received_by: '',
      total_amount: 0,
      notes: '',
      receipt_image_url: null,
      receipt_image_urls: [],
    } as any,
  });

  const watchItems = watch('items');

  const previousItemsRef = React.useRef<string>('');
  const submitLockRef = React.useRef(false);
  const previousProductsRef = React.useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      submitLockRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (defaultCategory === 'standard') return;
    if (!watchItems || !filteredProducts.length) return;

    const currentItemsString = JSON.stringify(watchItems);
    if (currentItemsString === previousItemsRef.current && previousProductsRef.current === filteredProducts?.length) {
      return;
    }
    previousItemsRef.current = currentItemsString;
    previousProductsRef.current = filteredProducts?.length;

    let sum = 0;
    watchItems.forEach((item: any) => {
      const product = filteredProducts.find((p: any) => p.id === item.product_id);
      if (product && product.base_price) {
        const qty = Number(item.quantity) || 0;
        const amount = Math.round(qty * product.base_price);
        sum += amount;
      }
    });

    if (sum > 0) {
      setValue('total_amount', sum, { shouldValidate: true });
    }
  }, [JSON.stringify(watchItems), filteredProducts, defaultCategory, setValue]);

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const watchCustomerId = watch('customer_id');
  const watchSenderId = watch('sender_id');
  const watchReceivedBy = watch('received_by');
  const canAdminEditReceivedByInEditMode = isEditMode && user?.role === 'admin';
  const employeeOptions = React.useMemo(
    () =>
      (employees || [])
        .filter((employee: any) => isHeavyDriverEmployee(employee))
        .map((employee: any) => ({ value: employee.id, label: employee.full_name })),
    [employees]
  );
  const selectedCustomer = filteredCustomers.find((c: any) => c.id === watchCustomerId);
  const hasAliases = selectedCustomer?.aliases && selectedCustomer.aliases.length > 0;

  React.useEffect(() => {
    if (!isOpen) return;
    if (!canAutoAssignDriverVehicle) {
      setSelectedDriverVehicleId('');
      return;
    }

    setSelectedDriverVehicleId((prev) => {
      if (driverVehicles.length === 0) return '';
      if (prev && driverVehicles.some((v) => v.id === prev)) return prev;
      return driverVehicles[0].id;
    });
  }, [isOpen, canAutoAssignDriverVehicle, driverVehicles]);

  const autoAssignVehicleForDriver = async (createdOrder: ImportOrder, vehicleId: string) => {
    const attempts = 3;
    let relatedDeliveryRows: DeliveryOrder[] = [];

    for (let i = 0; i < attempts; i += 1) {
      const rows = await deliveryApi.getAllToday(createdOrder.order_date, createdOrder.order_date, 'vegetable');
      relatedDeliveryRows = rows.filter(
        (row) => row.import_order_id === createdOrder.id || row.vegetable_order_id === createdOrder.id
      );
      if (relatedDeliveryRows.length > 0) break;
      await waitFor(350);
    }

    if (relatedDeliveryRows.length === 0) {
      toast.error('Đã tạo phiếu nhưng chưa tìm thấy đơn giao để tự gán xe.');
      return;
    }

    const results = await Promise.allSettled(
      relatedDeliveryRows.map((row) =>
        deliveryApi.assignVehicle(row.id, {
          assignments: [
            {
              vehicle_id: vehicleId,
              driver_id: user?.id || '',
              loader_name: '',
              quantity: row.total_quantity,
            },
          ],
        })
      )
    );

    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    if (successCount > 0) {
      toast.success('Đã tự động gán xe giao hàng rau cho phiếu mới.');
      await queryClient.invalidateQueries({ queryKey: importOrderKeys.all });
    }
    if (successCount < relatedDeliveryRows.length) {
      toast.error('Một số dòng giao hàng chưa gán xe thành công, vui lòng kiểm tra lại trang giao hàng rau.');
    }
  };

  useEffect(() => {
    if (editingOrder) {
      reset({
        order_date: editingOrder.order_date,
        order_time: editingOrder.order_time,
        received_by: editingOrder.received_by || '',
        customer_id: editingOrder.customer_id || '',
        sender_name: editingOrder.sender_name || '',
        sender_id: editingOrder.sender_id || '',
        receiver_name: editingOrder.receiver_name || '',
        selected_alias: editingOrder.selected_alias || '',
        items: editingOrder.import_order_items?.map((item: ImportOrderItem) => ({
          product_id: item.product_id,
          package_type: item.package_type,
          weight_kg: item.weight_kg,
          quantity: item.quantity,
          image_url: item.image_url || null,
          image_urls: item.image_urls || (item.image_url ? [item.image_url] : []),
          item_note: item.item_note || item.package_type || '',
        })) || [],
        total_amount: editingOrder.total_amount || 0,
        notes: editingOrder.notes || '',
        receipt_image_url: editingOrder.receipt_image_url || null,
        receipt_image_urls: editingOrder.receipt_image_urls || (editingOrder.receipt_image_url ? [editingOrder.receipt_image_url] : []),
      });
    } else {
      reset({
        order_date: format(new Date(), 'yyyy-MM-dd'),
        order_time: new Date().toTimeString().slice(0, 5),
        items: [{ quantity: 1, weight_kg: '', product_id: '', image_url: null, image_urls: [], item_note: '' }],
        customer_id: '',
        sender_name: '',
        sender_id: '',
        receiver_name: '',
        selected_alias: '',
        received_by: user?.id || employees?.[0]?.id || '',
        total_amount: 0,
        notes: '',
        receipt_image_url: null,
        receipt_image_urls: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOrder, reset, isOpen, user?.id]);

  const watchTotalAmountInput = watch('total_amount');
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadingItemIndex, setUploadingItemIndex] = React.useState<number | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const receiptCameraInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const invalidFiles = files.filter(f => !f.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      toast.error('Chỉ hỗ trợ file ảnh');
      return;
    }

    try {
      setIsUploading(true);
      const uploadPromises = files.map(file => uploadApi.uploadFile(file, 'import-orders', 'orders'));
      const results = await Promise.all(uploadPromises);
      const newUrls = results.map(r => r.url);

      const currentUrls = getValues('receipt_image_urls') || [];
      const updatedUrls = [...currentUrls, ...newUrls];

      setValue('receipt_image_urls', updatedUrls, { shouldValidate: true });
      if (!getValues('receipt_image_url') && updatedUrls.length > 0) {
        setValue('receipt_image_url', updatedUrls[0], { shouldValidate: true });
      }

      toast.success(`Tải lên ${newUrls.length} ảnh thành công!`);
    } catch (error) {
      console.error('File upload error:', error);
      toast.error('Lỗi khi tải ảnh lên');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (receiptCameraInputRef.current) {
        receiptCameraInputRef.current.value = '';
      }
    }
  };

  const handleItemImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const invalidFiles = files.filter(f => !f.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      toast.error('Chỉ hỗ trợ file ảnh');
      return;
    }

    try {
      setUploadingItemIndex(index);
      const uploadPromises = files.map(file => uploadApi.uploadFile(file, 'import-orders', 'items'));
      const results = await Promise.all(uploadPromises);
      const newUrls = results.map(r => r.url);

      const currentUrls = getValues(`items.${index}.image_urls`) || [];
      const updatedUrls = [...currentUrls, ...newUrls];

      setValue(`items.${index}.image_urls`, updatedUrls, { shouldValidate: true });
      if (!getValues(`items.${index}.image_url`) && updatedUrls.length > 0) {
        setValue(`items.${index}.image_url`, updatedUrls[0], { shouldValidate: true });
      }

      // Tự động gán ảnh lên phần phiếu báo cáo chung nếu đang trống
      if (!getValues('receipt_image_url') && updatedUrls.length > 0) {
        setValue('receipt_image_url', updatedUrls[0], { shouldValidate: true });
        const currentReceiptUrls = getValues('receipt_image_urls') || [];
        setValue('receipt_image_urls', [...currentReceiptUrls, updatedUrls[0]], { shouldValidate: true });
      }

      toast.success(`Tải lên ${newUrls.length} ảnh thành công!`);
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
      const newId = resp.data?.id || (resp as any).id;
      if (newId) {
        setValue(`items.${index}.product_id`, newId, { shouldValidate: true });
        toast.success(`Đã tạo nhanh mặt hàng: ${name}`);
      }
    } catch {
      setValue(`items.${index}.product_id`, '', { shouldValidate: true });
      toast.error(`Lỗi khi tạo: ${name}`);
    }
  };

  const onSubmit = async (data: Record<string, any>) => {
    if (submitLockRef.current) return;

    submitLockRef.current = true;

    try {
      console.log('--- FORM SUBMIT DATA BEGIN ---', data);
      const payload = { ...data };
      if (payload.items) {
        payload.items = payload.items.map((item: any, index: number) => {
          const trimmedNote = item.item_note?.trim() || null;
          return {
            ...item,
            item_note: trimmedNote,
            image_urls: getValues(`items.${index}.image_urls`) || [],
            image_url: getValues(`items.${index}.image_url`) || null,
          };
        });
      }
      payload.order_category = defaultCategory;

      // Always treat as explicit amount
      payload.is_custom_amount = true;

      // Vô hiệu hóa tính năng tự động nhân total_amount với 1000 vì total_amount đã được tính đúng hoặc nhập đúng,
      // làm như vậy sẽ gây sai lệch nếu khách hàng nhập giá trị thực tế như 70000.

      payload.receipt_image_urls = getValues('receipt_image_urls') || [];

      payload.selected_alias = payload.selected_alias || null;

      Object.keys(payload).forEach(key => {
        if (payload[key] === '') delete payload[key];
      });

      if (isEditMode && editingOrder) {
        console.log('--- DISPATCH UPDATE_MUTATION ---', payload);
        await updateMutation.mutateAsync({ id: editingOrder.id, payload: payload as any });
      } else {
        const autoVehicle = canAutoAssignDriverVehicle
          ? driverVehicles.find((v) => v.id === (selectedDriverVehicleId || (driverVehicles.length === 1 ? driverVehicles[0].id : '')))
          : null;

        if (autoVehicle) {
          payload.license_plate = autoVehicle.license_plate;
          payload.driver_name = user?.full_name || payload.driver_name;
        }

        console.log('--- DISPATCH CREATE_MUTATION ---', payload);
        const createdOrder = await createMutation.mutateAsync(payload as any);

        if (canAutoAssignDriverVehicle) {
          const autoVehicleId = selectedDriverVehicleId || (driverVehicles.length === 1 ? driverVehicles[0].id : '');
          if (autoVehicleId) {
            await autoAssignVehicleForDriver(createdOrder as ImportOrder, autoVehicleId);
          } else {
            toast.error('Không tìm thấy xe của tài xế để tự động gán cho giao hàng rau.');
          }
        }
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
          'relative w-full max-w-[1200px] bg-background shadow-2xl flex flex-col md:h-screen h-[100dvh] border-l border-border',
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
                          options={filteredSenders.map((c: any) => ({ value: c.id, label: `${c.name}${c.phone ? ` (${c.phone})` : ''}`, matchKey: c.name, searchText: [c.name, c.phone, ...(c.aliases || [])].filter(Boolean).join(' ') }))}
                          value={watchSenderId || ''}
                          onValueChange={(val) => {
                            setValue('sender_id', val, { shouldValidate: true });
                            const found = filteredSenders.find((c: any) => c.id === val);
                            setValue('sender_name', found?.name || '', { shouldValidate: true });
                          }}
                          onCreate={async (name) => {
                            try {
                              const customerType = (defaultCategory as string) === 'vegetable' ? 'vegetable_sender' : 'grocery_sender';
                              const resp = await createCustomerMutation.mutateAsync({ name, customer_type: customerType });
                              const row = resp as any;
                              const newId = row?.id || row?.data?.id;
                              if (newId) {
                                setValue('sender_id', newId, { shouldValidate: true });
                                setValue('sender_name', row?.name || name, { shouldValidate: true });
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
                          options={filteredCustomers.map((c: any) => ({ value: c.id, label: `${c.name} ${c.phone ? `(${c.phone})` : ''}`, searchText: [c.name, c.phone, ...(c.aliases || [])].filter(Boolean).join(' ') }))}
                          value={watchCustomerId}
                          onValueChange={(val) => { setValue('customer_id', val, { shouldValidate: true }); setValue('selected_alias', '', { shouldValidate: true }); }}
                          placeholder="Nhập tên người nhận hàng"
                          disabled={showNewCustomerForm}
                        />
                        {errors.customer_id && <p className="text-red-500 text-[11px] font-medium">{errors.customer_id.message as string}</p>}

                        {hasAliases && (
                          <div className="mt-2">
                            <label className="text-[12px] font-bold text-muted-foreground">Tên khác (tùy chọn)</label>
                            <SearchableSelect
                              options={[
                                { value: '', label: selectedCustomer.name },
                                ...selectedCustomer.aliases.map((alias: string) => ({ value: alias, label: alias }))
                              ]}
                              value={watch('selected_alias') || ''}
                              onValueChange={(val) => setValue('selected_alias', val, { shouldValidate: true })}
                              placeholder="Chọn biệt danh hoặc để trống"
                            />
                          </div>
                        )}

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
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Nhân viên nhận</label>
                        {canAdminEditReceivedByInEditMode && employeeOptions.length > 0 ? (
                          <SearchableSelect
                            options={employeeOptions}
                            value={watchReceivedBy}
                            onValueChange={(val) => setValue('received_by', val, { shouldValidate: true })}
                            placeholder="Chọn nhân viên"
                          />
                        ) : (
                          <div className="w-full px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[13px] font-semibold text-amber-800">
                            {employees?.find((e: any) => e.id === watchReceivedBy)?.full_name || user?.full_name || 'Tự động'}
                          </div>
                        )}
                      </div>

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
                          options={filteredSenders.map((c: any) => ({ value: c.id, label: `${c.name}${c.phone ? ` (${c.phone})` : ''}`, matchKey: c.name, searchText: [c.name, c.phone, ...(c.aliases || [])].filter(Boolean).join(' ') }))}
                          value={watchSenderId || ''}
                          onValueChange={(val) => {
                            setValue('sender_id', val, { shouldValidate: true });
                            const found = filteredSenders.find((c: any) => c.id === val);
                            setValue('sender_name', found?.name || '', { shouldValidate: true });
                          }}
                          onCreate={async (name) => {
                            try {
                              const customerType = (defaultCategory as string) === 'vegetable' ? 'vegetable_sender' : 'grocery_sender';
                              const resp = await createCustomerMutation.mutateAsync({ name, customer_type: customerType });
                              const row = resp as any;
                              const newId = row?.id || row?.data?.id;
                              if (newId) {
                                setValue('sender_id', newId, { shouldValidate: true });
                                setValue('sender_name', row?.name || name, { shouldValidate: true });
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
                          options={filteredCustomers.map((c: any) => ({ value: c.id, label: `${c.name} ${c.phone ? `(${c.phone})` : ''}`, searchText: [c.name, c.phone, ...(c.aliases || [])].filter(Boolean).join(' ') }))}
                          value={watchCustomerId}
                          onValueChange={(val) => { setValue('customer_id', val, { shouldValidate: true }); setValue('selected_alias', '', { shouldValidate: true }); }}
                          placeholder="Tìm vựa rau hoặc KH Rau..."
                          disabled={showNewCustomerForm}
                        />
                        {errors.customer_id && <p className="text-red-500 text-[11px] font-medium">{errors.customer_id.message as string}</p>}

                        <div className="mt-2 space-y-1">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Chú thích</label>
                          <input
                            type="text"
                            {...register('notes')}
                            placeholder="Nhập chú thích (hiển thị trên bản in)..."
                            className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                          />
                        </div>

                        {hasAliases && (
                          <div className="mt-2">
                            <label className="text-[12px] font-bold text-muted-foreground">Tên khác (tùy chọn)</label>
                            <SearchableSelect
                              options={[
                                { value: '', label: selectedCustomer.name },
                                ...selectedCustomer.aliases.map((alias: string) => ({ value: alias, label: alias }))
                              ]}
                              value={watch('selected_alias') || ''}
                              onValueChange={(val) => setValue('selected_alias', val, { shouldValidate: true })}
                              placeholder="Chọn biệt danh hoặc để trống"
                            />
                          </div>
                        )}

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
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Nhân viên nhận</label>
                        {canAdminEditReceivedByInEditMode && employeeOptions.length > 0 ? (
                          <SearchableSelect
                            options={employeeOptions}
                            value={watchReceivedBy}
                            onValueChange={(val) => setValue('received_by', val, { shouldValidate: true })}
                            placeholder="Chọn nhân viên"
                          />
                        ) : (
                          <div className="w-full px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[13px] font-semibold text-amber-800">
                            {employees?.find((e: any) => e.id === watchReceivedBy)?.full_name || user?.full_name || 'Tự động'}
                          </div>
                        )}
                      </div>

                      {canAutoAssignDriverVehicle && (
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Biển số xe</label>
                          {isVehiclesError ? (
                            <div className="w-full px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-[12px] font-semibold text-red-700">
                              Không tải được danh sách xe (thiếu quyền hoặc lỗi API). Vui lòng cấp quyền xe cho tài khoản này.
                            </div>
                          ) : driverVehicles.length === 0 ? (
                            <div className="w-full px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-[12px] font-semibold text-red-700">
                              Tài khoản chưa có xe được gán. Phiếu vẫn tạo được nhưng sẽ không tự gán xe.
                            </div>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={dialogVehiclePlateText || '-'}
                                disabled
                                readOnly
                                className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-[13px] text-foreground font-medium cursor-not-allowed"
                              />
                              {isDriverVehiclesNameFallback && (
                                <p className="text-[11px] font-medium text-amber-700">
                                  Đang nhận xe theo tên tài xế. Nên gán lại đúng tài khoản để đồng bộ tuyệt đối theo ID.
                                </p>
                              )}
                              {isDriverVehiclesCategoryFallback && (
                                <p className="text-[11px] font-medium text-amber-700">
                                  Xe của bạn chưa gắn nhóm hàng rau, hệ thống đang hiển thị tất cả xe đã gán cho tài khoản để bạn chọn.
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {defaultCategory !== 'vegetable' && (
                    <div className="space-y-1.5 pt-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Ảnh biên nhận/Sản phẩm</label>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {(watch('receipt_image_urls') || []).map((url: string, idx: number) => (
                          <div key={idx} className="relative aspect-square rounded-xl border border-border overflow-hidden">
                            <img src={cloudinaryThumb(url)} alt="Receipt" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => {
                                const newUrls = (watch('receipt_image_urls') || []).filter((_: any, i: number) => i !== idx);
                                setValue('receipt_image_urls', newUrls, { shouldValidate: true });
                                setValue('receipt_image_url', newUrls.length > 0 ? newUrls[0] : null, { shouldValidate: true });
                              }}
                              className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-sm hover:bg-red-700 active:scale-95 transition-all"
                              aria-label="Xóa ảnh"
                              title="Xóa ảnh"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <div className="aspect-square rounded-xl border-2 border-dashed border-border bg-muted/50 overflow-hidden flex flex-col">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleImageUpload}
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-50 px-1 py-2 touch-manipulation active:scale-[0.99]"
                          >
                            {isUploading ? (
                              <Loader2 size={20} className="animate-spin text-primary" />
                            ) : (
                              <>
                                <ImagePlus size={22} className="text-primary" />
                                <span className="text-[10px] font-bold text-center px-0.5 leading-tight">Chọn ảnh</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="aspect-square rounded-xl border-2 border-dashed border-border bg-muted/50 overflow-hidden flex flex-col">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            ref={receiptCameraInputRef}
                            className="hidden"
                            onChange={handleImageUpload}
                          />
                          <button
                            type="button"
                            onClick={() => receiptCameraInputRef.current?.click()}
                            disabled={isUploading}
                            className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-50 px-1 py-2 touch-manipulation active:scale-[0.99]"
                          >
                            <Camera size={22} className="text-primary" />
                            <span className="text-[10px] font-bold text-center px-0.5 leading-tight">Chụp ảnh</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
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
                    onClick={() => append({ quantity: 1, weight_kg: '', product_id: '', image_url: null, item_note: '' })}
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
                      <div className="hidden md:grid grid-cols-[1fr_80px_80px_36px] gap-3 px-4 py-3 bg-card border-b border-border sticky top-0 z-10 md:items-center">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tên Mặt Hàng</div>
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center">SL</div>
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center">Hình Ảnh</div>
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
                              ? "grid-cols-1 md:grid-cols-[1fr_80px_80px_36px]"
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

                                {/* Col 2: Tên hàng + Ghi chú (cùng 1 hàng desktop) */}
                                <div className="hidden md:grid grid-cols-[minmax(150px,1fr)_minmax(180px,1fr)] gap-2 items-start">
                                  <div className="flex flex-col">
                                    <CreatableSearchableSelect
                                      options={filteredProducts.map((p: any) => ({
                                        value: p.id,
                                        label: p.name,
                                        matchKey: p.name,
                                      }))}
                                      value={watch(`items.${index}.product_id` as const)}
                                      onValueChange={(val) => setValue(`items.${index}.product_id`, val, { shouldValidate: true })}
                                      onCreate={(name) => handleCreateProduct(index, name)}
                                      placeholder="Gõ tên hàng..."
                                      className="h-9 border-border bg-card"
                                    />
                                    {(errors.items as any)?.[index]?.product_id && (
                                      <span className="mt-1 ml-1 text-[10px] text-red-500">Thiếu</span>
                                    )}
                                    {(() => {
                                      const prod = filteredProducts.find((p: any) => p.id === watch(`items.${index}.product_id`));
                                      const price = prod?.base_price || 0;
                                      if (price > 0) return <span className="text-[9px] text-muted-foreground mt-0.5 ml-1">{new Intl.NumberFormat('vi-VN').format(price)}đ</span>;
                                      return null;
                                    })()}
                                  </div>

                                  <Controller
                                    name={`items.${index}.item_note` as const}
                                    control={control}
                                    render={({ field }) => (
                                      <input
                                        type="text"
                                        value={field.value ?? ''}
                                        onChange={field.onChange}
                                        onBlur={field.onBlur}
                                        className="h-9 px-2.5 bg-card border border-border rounded-lg text-[12px] text-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 focus:outline-none"
                                        placeholder="Ghi chú cho sản phẩm này..."
                                      />
                                    )}
                                  />
                                </div>

                                {/* Col 3: Tổng tiền */}
                                <div className="hidden md:flex flex-col justify-center text-right">
                                  {(() => {
                                    const productId = watch(`items.${index}.product_id`);
                                    const qty = Number(watch(`items.${index}.quantity`) || 0);
                                    const prod = filteredProducts.find((p: any) => p.id === productId);
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
                                      options={filteredProducts.map((p: any) => ({
                                        value: p.id,
                                        label: p.name,
                                        matchKey: p.name,
                                      }))}
                                      value={watch(`items.${index}.product_id` as const)}
                                      onValueChange={(val) => setValue(`items.${index}.product_id`, val, { shouldValidate: true })}
                                      onCreate={(name) => handleCreateProduct(index, name)}
                                      placeholder="Gõ tên hàng..."
                                      className="h-9 border-border bg-card"
                                    />
                                    {(errors.items as any)?.[index]?.product_id && (
                                      <span className="text-[10px] text-red-500">Thiếu</span>
                                    )}
                                    {(() => {
                                      const prod = filteredProducts.find((p: any) => p.id === watch(`items.${index}.product_id`));
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
                                      const prod = filteredProducts.find((p: any) => p.id === productId);
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
                                  <div className="flex flex-col space-y-1 col-span-2">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase">Ghi chú</label>
                                    <Controller
                                      name={`items.${index}.item_note` as const}
                                      control={control}
                                      render={({ field }) => (
                                        <input
                                          type="text"
                                          value={field.value ?? ''}
                                          onChange={field.onChange}
                                          onBlur={field.onBlur}
                                          className="w-full h-9 px-2.5 bg-card border border-border rounded-lg text-[12px] text-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 focus:outline-none"
                                          placeholder="Ghi chú cho sản phẩm này..."
                                        />
                                      )}
                                    />
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
                                      options={filteredProducts.map((p: any) => ({
                                        value: p.id,
                                        label: p.name,
                                        matchKey: p.name,
                                      }))}
                                      value={watch(`items.${index}.product_id` as const)}
                                      onValueChange={(val) => setValue(`items.${index}.product_id`, val, { shouldValidate: true })}
                                      onCreate={(name) => handleCreateProduct(index, name)}
                                      placeholder="Gõ tên hàng..."
                                      className="h-9 border-border bg-card"
                                    />
                                    {(errors.items as any)?.[index]?.product_id && (
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

                                {/* Mobile Image Grid */}
                                <div className="md:hidden mt-2 col-span-full border-t border-dashed border-border pt-2 pb-1 w-full">
                                  <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1.5 block">Ảnh hàng hóa</label>
                                  <div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar w-full">
                                    {(watch(`items.${index}.image_urls`) || []).map((url: string, imgIdx: number) => (
                                      <div key={imgIdx} className="relative w-12 h-12 rounded-lg border border-border overflow-hidden shrink-0">
                                        <img src={cloudinaryThumb(url)} alt="item" className="w-full h-full object-cover" />
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const newUrls = watch(`items.${index}.image_urls`).filter((_: any, i: number) => i !== imgIdx);
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

                                <div className="grid md:contents gap-2 md:gap-3 border-t border-dashed border-border md:border-none pt-2 md:pt-0 mt-2 md:mt-0 grid-cols-1">
                                  {/* Số lượng */}
                                  <div className="flex flex-col justify-center space-y-1 md:space-y-0 col-span-1">
                                    <label className="text-[11px] font-bold text-muted-foreground md:hidden uppercase">SL</label>
                                    <input
                                      type="number"
                                      {...register(`items.${index}.quantity` as const)}
                                      className="w-full h-9 px-2 bg-card border border-border rounded-lg text-[13px] font-black text-center text-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 focus:outline-none tabular-nums transition-all"
                                    />
                                  </div>
                                </div>
                              </>
                            )}

                            {/* Desktop Image Button - only for standard */}
                            {defaultCategory === 'standard' && (
                              <div className="hidden md:flex items-center justify-center w-full">
                                <div className={clsx("relative", "w-12 h-12")}>
                                  {watch(`items.${index}.image_urls`)?.length > 0 ? (
                                    <div className="relative w-full h-full rounded-lg border border-border overflow-hidden group/imgDesk">
                                      <img src={cloudinaryThumb(watch(`items.${index}.image_urls`)[0])} alt="item" className="w-full h-full object-cover" />
                                      {watch(`items.${index}.image_urls`).length > 1 && (
                                        <div className="absolute top-0 right-0 bg-primary text-white text-[9px] font-bold px-1 rounded-bl-lg">
                                          +{watch(`items.${index}.image_urls`).length - 1}
                                        </div>
                                      )}
                                      <div className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/imgDesk:opacity-100 transition-opacity gap-1">
                                        <label className="cursor-pointer p-1 hover:text-primary transition-colors" title="Thêm ảnh">
                                          <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => handleItemImageUpload(index, e)}
                                          />
                                          <Plus size={14} />
                                        </label>
                                        <label className="cursor-pointer p-1 hover:text-primary transition-colors" title="Chụp ảnh">
                                          <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            className="hidden"
                                            onChange={(e) => handleItemImageUpload(index, e)}
                                          />
                                          <Camera size={14} />
                                        </label>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setValue(`items.${index}.image_urls`, [], { shouldValidate: true });
                                            setValue(`items.${index}.image_url`, null, { shouldValidate: true });
                                          }}
                                          className="p-1 hover:text-red-400 transition-colors"
                                          title="Xoá tất cả ảnh"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-full h-full flex flex-col gap-1 overflow-hidden rounded-lg border border-border bg-muted/50 p-1">
                                      <label className="flex-1 min-h-[1.75rem] flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 cursor-pointer transition-all rounded-md touch-manipulation active:scale-[0.98]" title="Chọn ảnh">
                                        <input
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          className="hidden"
                                          onChange={(e) => handleItemImageUpload(index, e)}
                                        />
                                        {uploadingItemIndex === index ? <Loader2 size={15} className="animate-spin text-primary" /> : <ImagePlus size={15} />}
                                      </label>
                                      <label className="flex-1 min-h-[1.75rem] flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 cursor-pointer transition-all rounded-md touch-manipulation active:scale-[0.98]" title="Chụp ảnh">
                                        <input
                                          type="file"
                                          accept="image/*"
                                          capture="environment"
                                          className="hidden"
                                          onChange={(e) => handleItemImageUpload(index, e)}
                                        />
                                        {uploadingItemIndex === index ? <Loader2 size={15} className="animate-spin text-primary" /> : <Camera size={15} />}
                                      </label>
                                    </div>
                                  )}
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
                {defaultCategory === 'vegetable' && (
                  <div className="p-4 md:p-5 bg-primary/5 flex flex-col md:flex-row items-center justify-between border-t border-primary/10 shrink-0 gap-1 md:gap-0">
                    <div className="flex flex-col items-center md:items-start text-center md:text-left">
                      <span className="text-[12px] font-bold text-primary uppercase tracking-widest">Tổng tiền phiếu nhập</span>
                      <span className="text-[12px] text-primary/70 font-medium">Được cộng vào Công Nợ của Khách</span>
                    </div>
                    <div className="text-3xl font-black text-primary tabular-nums drop-shadow-sm">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(watchTotalAmountInput || 0)}
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

export default AddEditVegetableImportOrderDialog;
