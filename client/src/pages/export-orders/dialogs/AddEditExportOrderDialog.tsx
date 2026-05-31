import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Package, Plus, ChevronRight, Truck, User, Clock, Calendar, DollarSign, ShoppingBag, ImagePlus, Loader2, Camera, CreditCard } from 'lucide-react';
import { clsx } from 'clsx';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useCreateExportOrder } from '../../../hooks/queries/useExportOrders';
import { uploadApi } from '../../../api/uploadApi';
import toast from 'react-hot-toast';
import { useCustomers } from '../../../hooks/queries/useCustomers';
import { useVehicles } from '../../../hooks/queries/useVehicles';
import { useEmployees } from '../../../hooks/queries/useHR';
import { useDeliveryOrders, useAssignVehicle } from '../../../hooks/queries/useDelivery';
import { useAuth } from '../../../context/AuthContext';
import { cloudinarySmall } from '../../../lib/cloudinaryUrl';
import { deliveryOrderBypassesGoodsScope } from '../../../utils/goodsModuleScope';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import CurrencyInput from '../../../components/shared/CurrencyInput';
import { DatePicker } from '../../../components/shared/DatePicker';
import { TimePicker24h } from '../../../components/shared/TimePicker24h';

const exportOrderSchema = z.object({
  export_date: z.string().min(1, 'Ngày xuất không được để trống'),
  export_time: z.string().min(1, 'Vui lòng nhập giờ'),
  vehicle_id: z.string().optional(),
  delivery_staff: z.string().optional(),
  customer_id: z.string().min(1, 'Vui lòng chọn khách hàng'),
  product_id: z.string().min(1, 'Vui lòng chọn hàng hóa'),
  quantity: z.coerce.number().min(1, 'Số lượng phải lớn hơn 0'),
  debt_amount: z.coerce.number().min(0, 'Thành tiền không được âm'),
  payment_status: z.enum(['unpaid', 'paid']),
  image_url: z.string().optional().nullable().catch(null),
});

type ExportOrderFormData = z.infer<typeof exportOrderSchema>;

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  onClose: () => void;
}

const formatCurrency = (val?: number) => {
  if (val == null || val === 0) return '0';
  return new Intl.NumberFormat('vi-VN').format(val);
};

const AddEditExportOrderDialog: React.FC<Props> = ({ isOpen, isClosing, onClose }) => {
  const { user } = useAuth();
  const createMutation = useCreateExportOrder();
  const assignVehicleMutation = useAssignVehicle();
  const { data: customers } = useCustomers('grocery_receiver', isOpen);
  const { data: vehicles } = useVehicles(isOpen);
  const { data: employees } = useEmployees(isOpen);
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: deliveryOrders } = useDeliveryOrders(today, today, 'standard');

  const normalizedRole = (user?.role || '').toLowerCase();
  const isLoader = normalizedRole.includes('lo_xe');
  const isDriver = normalizedRole === 'driver' || normalizedRole.includes('tai_xe') || normalizedRole.includes('driver') || isLoader;
  const myVehicle = vehicles?.find(v => v.driver_id === user?.id || v.in_charge_id === user?.id);

  const smallVehicleOptions = useMemo(() => {
    const normalize = (value?: string) =>
      (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const normalizeKey = (value?: string) => normalize(value).replace(/\s+/g, '_');

    const isSmallDriverRole = (roleValue?: string) => {
      const value = normalize(roleValue);
      const key = normalizeKey(roleValue);

      if (!value && !key) return false;

      return (
        key.includes('tai_xe_xe_tai_nho') ||
        key.includes('tai_xe_tai_nho') ||
        key.includes('small_driver') ||
        key.includes('driver_small') ||
        (value.includes('tai xe') && value.includes('nho')) ||
        value.includes('small driver')
      );
    };

    const isDriverRole = (roleValue?: string) => {
      const value = normalize(roleValue);
      const key = normalizeKey(roleValue);
      if (!value && !key) return false;

      return (
        key.includes('tai_xe') ||
        key.includes('driver') ||
        value.includes('tai xe') ||
        value.includes('driver')
      );
    };

    const vehiclesByDriverId = new Map<string, any>();
    (vehicles || []).forEach((v: any) => {
      if (v.driver_id && !vehiclesByDriverId.has(v.driver_id)) {
        vehiclesByDriverId.set(v.driver_id, v);
      }
      if (v.in_charge_id && !vehiclesByDriverId.has(v.in_charge_id)) {
        vehiclesByDriverId.set(v.in_charge_id, v);
      }
    });

    const fromEmployees = (employees || [])
      .filter((e: any) => {
        const roleMatchesProfile = isSmallDriverRole(e.role);
        const roleMatchesAssigned = (e.app_user_roles || []).some((ur: any) => {
          const roleKey = ur?.app_roles?.role_key;
          const roleName = ur?.app_roles?.role_name;
          return isSmallDriverRole(roleKey) || isSmallDriverRole(roleName);
        });

        return roleMatchesProfile || roleMatchesAssigned;
      })
      .map((e: any) => {
        const matchedVehicle = vehiclesByDriverId.get(e.id);
        return {
          value: e.id,
          label: `${e.full_name}${matchedVehicle?.license_plate ? ` (${matchedVehicle.license_plate})` : ''}`,
          vehicleId: matchedVehicle?.id || '',
          vehiclePlate: matchedVehicle?.license_plate || '',
        };
      });

    if (fromEmployees.length > 0) return fromEmployees;

    const fromDriverEmployees = (employees || [])
      .filter((e: any) => {
        const roleMatchesProfile = isDriverRole(e.role);
        const roleMatchesAssigned = (e.app_user_roles || []).some((ur: any) => {
          const roleKey = ur?.app_roles?.role_key;
          const roleName = ur?.app_roles?.role_name;
          return isDriverRole(roleKey) || isDriverRole(roleName);
        });

        return roleMatchesProfile || roleMatchesAssigned;
      })
      .map((e: any) => {
        const matchedVehicle = vehiclesByDriverId.get(e.id);
        return {
          value: e.id,
          label: `${e.full_name}${matchedVehicle?.license_plate ? ` (${matchedVehicle.license_plate})` : ''}`,
          vehicleId: matchedVehicle?.id || '',
          vehiclePlate: matchedVehicle?.license_plate || '',
        };
      });

    if (fromDriverEmployees.length > 0) return fromDriverEmployees;

    // Fallback 1: if role metadata is missing, still allow picking from drivers already mapped on vehicles.
    const seenDriver = new Set<string>();
    const fromVehicles = (vehicles || [])
      .filter((v: any) => Boolean(v.driver_id))
      .filter((v: any) => {
        if (!v.driver_id || seenDriver.has(v.driver_id)) return false;
        seenDriver.add(v.driver_id);
        return true;
      })
      .map((v: any) => ({
        value: v.driver_id,
        label: `${v.profiles?.full_name || 'Tài xế'}${v.license_plate ? ` (${v.license_plate})` : ''}`,
        vehicleId: v.id || '',
        vehiclePlate: v.license_plate || '',
      }));

    if (fromVehicles.length > 0) return fromVehicles;

    // Fallback 2: last resort when no role/vehicle mapping data is available.
    return (employees || []).map((e: any) => ({
      value: e.id,
      label: e.full_name || e.email || 'Nhân sự',
      vehicleId: vehiclesByDriverId.get(e.id)?.id || '',
      vehiclePlate: vehiclesByDriverId.get(e.id)?.license_plate || '',
    }));
  }, [vehicles, employees]);

  const groceryCustomers = useMemo(() => {
    return (customers || []).filter((c: any) => c.customer_type === 'grocery_receiver');
  }, [customers]);

  // Ref chống vòng lặp khi auto-set customer/product
  const isAutoSettingRef = useRef(false);

  // Lấy danh sách hàng cần giao hôm nay (kèm thông tin khách)
  const todayDeliveryItems = useMemo(() => {
    if (!deliveryOrders) return [];
    return deliveryOrders
      .filter((o: any) => deliveryOrderBypassesGoodsScope(o))
      .map((o: any) => {
      const pName = o.product_name?.includes(' - ')
        ? o.product_name.split(' - ').slice(1).join(' - ')
        : o.product_name;
      const customerName =
        o.import_orders?.customers?.name
        || o.import_orders?.receiver_name?.trim()
        || o.import_orders?.profiles?.full_name
        || '';
      return {
        id: o.id,
        name: pName || 'N/A',
        quantity: o.total_quantity || 0,
        unitPrice: o.unit_price || 0,
        customerName,
      };
      });
  }, [deliveryOrders]);

  // Chỉ lấy khách tạp hóa có đơn giao trong ngày hôm nay
  const todayGroceryCustomers = useMemo(() => {
    const customerNames = new Set(
      todayDeliveryItems
        .map((item) => item.customerName?.trim())
        .filter((name): name is string => Boolean(name)),
    );
    return groceryCustomers.filter((c: any) => customerNames.has(c.name));
  }, [todayDeliveryItems, groceryCustomers]);

  const {
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ExportOrderFormData>({
    resolver: zodResolver(exportOrderSchema) as any,
    defaultValues: {
      export_date: today,
      export_time: new Date().toTimeString().slice(0, 5),
      vehicle_id: '',
      delivery_staff: '',
      customer_id: '',
      product_id: '',
      quantity: 1,
      debt_amount: 0,
      payment_status: 'unpaid' as const,
      image_url: null,
    },
  });

  const customerId = watch('customer_id');
  const productId = watch('product_id');
  const quantity = watch('quantity');
  const debtAmount = watch('debt_amount');
  const selectedVehicleId = watch('vehicle_id');
  const selectedDeliveryStaff = watch('delivery_staff');
  const watchImageUrl = watch('image_url');
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Chỉ hỗ trợ file ảnh');
      return;
    }
    try {
      setIsUploading(true);
      const resp = await uploadApi.uploadFile(file, 'import-orders', 'export-orders');
      setValue('image_url', resp.url, { shouldValidate: true });
      toast.success('Tải ảnh lên thành công!');
    } catch (error) {
      console.error('File upload error:', error);
      toast.error('Lỗi khi tải ảnh lên');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  // Tìm tên khách đang chọn (để lọc sản phẩm)
  const selectedCustomerName = useMemo(() => {
    if (!customerId) return '';
    return todayGroceryCustomers.find((c: any) => c.id === customerId)?.name || '';
  }, [customerId, todayGroceryCustomers]);

  // Danh sách sản phẩm đã lọc theo khách (nếu đã chọn khách trước)
  const filteredProducts = useMemo(() => {
    if (!selectedCustomerName) return todayDeliveryItems;
    return todayDeliveryItems.filter(item => item.customerName === selectedCustomerName);
  }, [todayDeliveryItems, selectedCustomerName]);

  // Khi chọn hàng → tự động chọn khách tương ứng
  useEffect(() => {
    if (!productId || isAutoSettingRef.current) return;
    const item = todayDeliveryItems.find(p => p.id === productId);
    if (!item?.customerName) return;
    // Tìm khách tạp hóa khớp tên
    const matchedCustomer = todayGroceryCustomers.find(
      (c: any) => c.name === item.customerName
    );
    if (matchedCustomer && matchedCustomer.id !== customerId) {
      isAutoSettingRef.current = true;
      setValue('customer_id', matchedCustomer.id, { shouldValidate: true });
      setTimeout(() => { isAutoSettingRef.current = false; }, 50);
    }
  }, [productId, todayDeliveryItems, todayGroceryCustomers, customerId, setValue]);

  // Khi đổi khách → reset hàng nếu hàng cũ không thuộc khách mới
  useEffect(() => {
    if (!customerId || isAutoSettingRef.current || !productId) return;
    const selectedItem = todayDeliveryItems.find(p => p.id === productId);
    const newCustomerName = todayGroceryCustomers.find((c: any) => c.id === customerId)?.name || '';
    if (selectedItem && selectedItem.customerName !== newCustomerName) {
      setValue('product_id', '', { shouldValidate: false });
    }
  }, [customerId, productId, todayDeliveryItems, todayGroceryCustomers, setValue]);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      reset({
        export_date: today,
        export_time: new Date().toTimeString().slice(0, 5),
        vehicle_id: isDriver ? (myVehicle?.id || '') : '',
        delivery_staff: isDriver ? (user?.id || '') : '',
        customer_id: '',
        product_id: '',
        quantity: 1,
        debt_amount: 0,
        payment_status: 'unpaid' as const,
        image_url: null,
      });
    }
  }, [isOpen, reset, myVehicle?.id, user?.id, today]);

  // Auto set vehicle and staff when driver logs in
  useEffect(() => {
    if (isOpen && myVehicle?.id) {
      setValue('vehicle_id', myVehicle.id);
    }
    if (isOpen && user?.id) {
      setValue('delivery_staff', user.id);
    }
  }, [isOpen, myVehicle?.id, user?.id, setValue]);

  const onSubmit = async (data: ExportOrderFormData) => {
    try {
      if (!isDriver && (!data.delivery_staff || !data.vehicle_id)) {
        toast.error('Vui lòng chọn tài xế xe nhỏ trước khi tạo phiếu xuất.');
        return;
      }

      const selectedItem = todayDeliveryItems.find(p => p.id === data.product_id);
      const payload: any = {
        export_date: data.export_date,
        export_time: data.export_time,
        product_id: data.product_id,
        product_name: selectedItem?.name || '',
        quantity: Number(data.quantity),
        customer_id: data.customer_id,
        debt_amount: Number(data.debt_amount),
        payment_status: data.payment_status,
        paid_amount: data.payment_status === 'paid' ? Number(data.debt_amount) : 0,
      };
      if (data.image_url) payload.image_url = data.image_url;
      await createMutation.mutateAsync(payload);

      // Tự động gán xe giao cho đơn delivery tương ứng
      const deliveryOrderId = data.product_id; // product_id = delivery order ID
      const deliveryOrder = deliveryOrders?.find((o: any) => o.id === deliveryOrderId);

      const selectedVehicle = (vehicles || []).find((v: any) => v.id === data.vehicle_id);
      const assignedVehicleId = data.vehicle_id || myVehicle?.id;
      const assignedDriverId = data.delivery_staff || selectedVehicle?.driver_id || selectedVehicle?.in_charge_id || user?.id;

      if (deliveryOrder && assignedVehicleId && assignedDriverId) {
        const existingDvs = deliveryOrder.delivery_vehicles || [];
        const assignPayload: any[] = [];
        const qty = Number(data.quantity) || 0;
        const formDebtAmount = Number(data.debt_amount) || 0;

        // Giữ nguyên các xe đã gán trước đó
        existingDvs.forEach((dv: any) => {
          assignPayload.push({
            vehicle_id: dv.vehicle_id,
            driver_id: dv.driver_id || '',
            quantity: dv.assigned_quantity,
            expected_amount: Number(dv.expected_amount || 0),
          });
        });

        // Cộng dồn hoặc thêm mới cho xe của tài xế hiện tại
        const myExistingIndex = assignPayload.findIndex((p: any) => p.vehicle_id === assignedVehicleId);
        if (myExistingIndex >= 0) {
          assignPayload[myExistingIndex].quantity += qty;
          assignPayload[myExistingIndex].expected_amount =
            Number(assignPayload[myExistingIndex].expected_amount || 0) + formDebtAmount;
        } else {
          assignPayload.push({
            vehicle_id: assignedVehicleId,
            driver_id: assignedDriverId,
            quantity: qty,
            expected_amount: formDebtAmount,
          });
        }

        try {
          await assignVehicleMutation.mutateAsync({
            id: deliveryOrderId,
            payload: {
              assignments: assignPayload as any,
              export_payment_status: data.payment_status,
            },
          });
        } catch {
          // Phiếu xuất đã tạo thành công, lỗi gán xe không chặn luồng
        }
      }

      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  // Tính thông tin hàng đã chọn
  const selectedProduct = todayDeliveryItems.find(p => p.id === productId);

  if (!isOpen && !isClosing) return null;

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
          'relative w-full max-w-[600px] bg-background shadow-2xl flex flex-col md:h-screen h-[100dvh] border-l border-border',
          isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-card border-b border-border z-10 shadow-sm relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 shadow-inner">
              <Package size={20} />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-foreground">Tạo Phiếu Xuất Hàng</h2>
              <p className="text-[12px] font-medium text-muted-foreground">Giao hàng cho khách tạp hóa</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form id="export-order-form" onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6 space-y-4">
          
          {/* NGÀY GIỜ & THÔNG TIN XE */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/50 flex items-center gap-2">
              <Clock size={16} className="text-emerald-600" />
              <span className="text-[12px] font-bold text-emerald-700 uppercase tracking-wider">Thông tin giao hàng</span>
            </div>
            <div className="p-4 md:p-5 space-y-4">
              {/* Ngày & Giờ */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Calendar size={12} />
                    Ngày
                  </label>
                  <Controller
                    name="export_date"
                    control={control}
                    render={({ field }) => (
                      <DatePicker value={field.value} onChange={field.onChange} />
                    )}
                  />
                  {errors.export_date && <p className="text-red-500 text-[11px] font-medium">{errors.export_date.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Clock size={12} />
                    Giờ
                  </label>
                  <Controller
                    name="export_time"
                    control={control}
                    render={({ field }) => (
                      <TimePicker24h value={field.value} onChange={field.onChange} />
                    )}
                  />
                  {errors.export_time && <p className="text-red-500 text-[11px] font-medium">{errors.export_time.message}</p>}
                </div>
              </div>

              {/* Số xe (tự động) */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Truck size={12} />
                  Số xe
                  {isDriver && <span className="text-[9px] text-emerald-600 normal-case ml-1">(tự động)</span>}
                </label>
                <div className={clsx(
                  "w-full px-3 py-2.5 rounded-xl text-[13px] font-semibold border",
                  (isDriver ? myVehicle?.id : selectedVehicleId)
                    ? "bg-blue-50 border-blue-200 text-blue-800" 
                    : "bg-muted/50 border-border text-muted-foreground/40"
                )}>
                  <div className="flex items-center gap-2">
                    <Truck size={15} className={(isDriver ? myVehicle?.id : selectedVehicleId) ? "text-blue-500" : "text-muted-foreground/40"} />
                    {isDriver
                      ? (myVehicle ? myVehicle.license_plate : 'Chưa gắn xe')
                      : ((vehicles || []).find((v: any) => v.id === selectedVehicleId)?.license_plate || 'Chưa chọn xe')}
                  </div>
                </div>
              </div>

              {isDriver ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <User size={12} />
                    Nhân viên giao hàng
                    <span className="text-[9px] text-emerald-600 normal-case ml-1">(tự động)</span>
                  </label>
                  <div className="w-full px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[13px] font-semibold text-amber-800">
                    <div className="flex items-center gap-2">
                      <User size={15} className="text-amber-500" />
                      {user?.full_name || 'Đang đăng nhập...'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <User size={12} />
                    Tài xế xe nhỏ <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    options={smallVehicleOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
                    value={selectedDeliveryStaff || ''}
                    onValueChange={(val) => {
                      setValue('delivery_staff', val, { shouldValidate: true });
                      const matched = smallVehicleOptions.find((opt) => opt.value === val);
                      setValue('vehicle_id', matched?.vehicleId || '', { shouldValidate: true });
                      if (!matched?.vehicleId) {
                        toast.error('Tài xế này chưa được gắn xe. Vui lòng gắn xe trước.');
                      }
                    }}
                    placeholder="Chọn tài xế xe nhỏ..."
                  />
                </div>
              )}
            </div>
          </div>

          {/* KHÁCH HÀNG & HÀNG HÓA */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/50 flex items-center gap-2">
              <ShoppingBag size={16} className="text-emerald-600" />
              <span className="text-[12px] font-bold text-emerald-700 uppercase tracking-wider">Khách hàng & Hàng hóa</span>
            </div>
            <div className="p-4 md:p-5 space-y-4">
              {/* Tên khách */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Tên khách <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  options={todayGroceryCustomers.map((c: any) => ({
                    value: c.id,
                    label: `${c.name}${c.phone ? ` (${c.phone})` : ''}`,
                  }))}
                  value={customerId}
                  onValueChange={(val) => setValue('customer_id', val, { shouldValidate: true })}
                  placeholder="Chọn khách tạp hóa..."
                />
                {errors.customer_id && <p className="text-red-500 text-[11px] font-medium">{errors.customer_id.message}</p>}
              </div>

              {/* Tên hàng */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Tên hàng <span className="text-red-500">*</span>
                  <span className="text-[9px] text-muted-foreground/40 normal-case ml-1">(hàng cần giao hôm nay)</span>
                </label>
                <SearchableSelect
                  options={filteredProducts.map(p => ({
                    value: p.id,
                    label: `${p.name} (SL: ${p.quantity.toLocaleString('vi-VN')})`,
                  }))}
                  value={productId}
                  onValueChange={(val) => setValue('product_id', val, { shouldValidate: true })}
                  placeholder={selectedCustomerName ? `Hàng của ${selectedCustomerName}...` : 'Chọn hàng cần giao...'}
                />
                {errors.product_id && <p className="text-red-500 text-[11px] font-medium">{errors.product_id.message}</p>}
                {todayDeliveryItems.length === 0 && (
                  <p className="text-amber-600 text-[11px] font-medium bg-amber-50 px-2 py-1 rounded-lg">
                    ⚠ Chưa có hàng cần giao hôm nay
                  </p>
                )}
                {selectedCustomerName && filteredProducts.length === 0 && todayDeliveryItems.length > 0 && (
                  <p className="text-amber-600 text-[11px] font-medium bg-amber-50 px-2 py-1 rounded-lg">
                    ⚠ Khách <span className="font-bold">{selectedCustomerName}</span> chưa có hàng cần giao hôm nay
                  </p>
                )}
              </div>

              {/* Số lượng */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Số lượng <span className="text-red-500">*</span>
                </label>
                <Controller
                  name="quantity"
                  control={control}
                  render={({ field }) => (
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={field.value}
                      onChange={field.onChange}
                      className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold tabular-nums"
                      placeholder="Nhập số lượng..."
                    />
                  )}
                />
                {errors.quantity && <p className="text-red-500 text-[11px] font-medium">{errors.quantity.message}</p>}
                {selectedProduct && (
                  <p className="text-[11px] text-muted-foreground">
                    SL tổng cần giao: <span className="font-bold text-foreground">{selectedProduct.quantity.toLocaleString('vi-VN')}</span>
                  </p>
                )}
              </div>

              {/* Thành tiền */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <DollarSign size={12} />
                  Thành tiền (VNĐ)
                </label>
                <Controller
                  name="debt_amount"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      {...field}
                      value={field.value as number | undefined}
                      onChange={field.onChange}
                      placeholder="0"
                      className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold tabular-nums text-emerald-700"
                    />
                  )}
                />
                {errors.debt_amount && <p className="text-red-500 text-[11px] font-medium">{errors.debt_amount.message}</p>}
                {/* <p className="text-[11px] text-muted-foreground">Sẽ tự động cộng dồn vào tổng công nợ của khách hàng</p> */}
              </div>

              {/* Trạng thái thanh toán */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <CreditCard size={12} />
                  Thanh toán
                </label>
                <Controller
                  name="payment_status"
                  control={control}
                  render={({ field }) => (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => field.onChange('unpaid')}
                        className={clsx(
                          'flex-1 py-2.5 rounded-xl text-[13px] font-bold border-2 transition-all',
                          field.value === 'unpaid'
                            ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-sm shadow-amber-200/50'
                            : 'border-border bg-muted/50 text-muted-foreground/40 hover:bg-muted'
                        )}
                      >
                        Chưa thanh toán
                      </button>
                      <button
                        type="button"
                        onClick={() => field.onChange('paid')}
                        className={clsx(
                          'flex-1 py-2.5 rounded-xl text-[13px] font-bold border-2 transition-all',
                          field.value === 'paid'
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-200/50'
                            : 'border-border bg-muted/50 text-muted-foreground/40 hover:bg-muted'
                        )}
                      >
                        Đã thanh toán
                      </button>
                    </div>
                  )}
                />
              </div>

              {/* Ảnh phiếu xuất / Ảnh sản phẩm */}
              <div className="space-y-1.5 pt-2 border-t border-border">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Camera size={12} />
                  Ảnh Upload
                </label>
                <div className="flex flex-col gap-2">
                  {watchImageUrl ? (
                    <div className="relative inline-block w-24 h-24 rounded-xl border border-border overflow-hidden">
                      <img loading="lazy" decoding="async" src={cloudinarySmall(watchImageUrl)} alt="Receipt" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setValue('image_url', null, { shouldValidate: true })}
                        className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-sm hover:bg-red-700 active:scale-95 transition-all"
                        aria-label="Xóa ảnh"
                        title="Xóa ảnh"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-row gap-3 w-full">
                      <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        ref={cameraInputRef}
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex-1 min-w-0 min-h-[6.25rem] border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1.5 text-muted-foreground/40 hover:text-emerald-600 hover:border-emerald-500/50 hover:bg-emerald-50/50 transition-all bg-muted/50 disabled:opacity-50 px-2 py-3 touch-manipulation active:scale-[0.99]"
                      >
                        {isUploading ? (
                          <Loader2 size={22} className="animate-spin text-emerald-600" />
                        ) : (
                          <>
                            <ImagePlus size={24} className="text-emerald-600" />
                            <span className="text-[12px] font-medium text-muted-foreground text-center leading-snug">Chọn ảnh</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex-1 min-w-0 min-h-[6.25rem] border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1.5 text-muted-foreground/40 hover:text-emerald-600 hover:border-emerald-500/50 hover:bg-emerald-50/50 transition-all bg-muted/50 disabled:opacity-50 px-2 py-3 touch-manipulation active:scale-[0.99]"
                      >
                        {isUploading ? (
                          <Loader2 size={22} className="animate-spin text-emerald-600" />
                        ) : (
                          <>
                            <Camera size={24} className="text-emerald-600" />
                            <span className="text-[12px] font-medium text-muted-foreground text-center leading-snug">Chụp ảnh</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* SUMMARY CARD */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
            <div className="p-4 md:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Package size={13} className="text-emerald-600" />
                </div>
                <span className="text-[12px] font-bold text-emerald-700 uppercase tracking-wider">Tóm tắt</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground">Khách hàng</span>
                  <span className="text-[13px] font-bold text-foreground">
                    {groceryCustomers.find((c: any) => c.id === customerId)?.name || '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground">Hàng hóa</span>
                  <span className="text-[13px] font-bold text-foreground">
                    {selectedProduct?.name || '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground">Số lượng</span>
                  <span className="text-[13px] font-bold text-foreground tabular-nums">
                    {Number(quantity) > 0 ? Number(quantity).toLocaleString('vi-VN') : '—'}
                  </span>
                </div>
                <div className="h-px bg-emerald-200/60 my-1" />
                <div className="flex justify-between items-center">
                  <span className="text-[13px] font-bold text-emerald-700">Thành tiền</span>
                  <span className="text-[15px] font-black text-emerald-700 tabular-nums">
                    {Number(debtAmount) > 0 ? `${formatCurrency(Number(debtAmount))} ₫` : '0 ₫'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="bg-card border-t border-border px-4 md:px-6 py-3 md:py-4 flex items-center justify-between shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl border border-border hover:bg-muted text-foreground text-[13px] font-bold transition-all"
          >
            Hủy
          </button>
          <button
            type="submit"
            form="export-order-form"
            disabled={createMutation.isPending || assignVehicleMutation.isPending}
            className={clsx(
              "flex items-center gap-2 px-8 py-2.5 rounded-xl text-[13px] font-bold shadow-lg transition-all group",
              (createMutation.isPending || assignVehicleMutation.isPending)
                ? "bg-emerald-400/50 text-white/60 cursor-wait"
                : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20 active:scale-[0.98]"
            )}
          >
            {(createMutation.isPending || assignVehicleMutation.isPending) ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Plus size={18} />
            )}
            Thêm Phiếu Xuất
            <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddEditExportOrderDialog;
