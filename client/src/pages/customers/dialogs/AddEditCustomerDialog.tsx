import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Building2, Phone, MapPin, Plus, ChevronRight, Tag } from 'lucide-react';
import { clsx } from 'clsx';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateCustomer, useUpdateCustomer, useCustomers } from '../../../hooks/queries/useCustomers';
import { customersApi } from '../../../api/customersApi';
import type { Customer } from '../../../types';
import toast from 'react-hot-toast';
import CustomerLocationPicker from './CustomerLocationPicker';

const customerSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên khách hàng'),
  phone: z.string().optional(),
  address: z.string().optional(),
  latitude: z.coerce.number().min(-90, 'Vĩ độ không hợp lệ').max(90, 'Vĩ độ không hợp lệ').optional().or(z.literal('')),
  longitude: z.coerce.number().min(-180, 'Kinh độ không hợp lệ').max(180, 'Kinh độ không hợp lệ').optional().or(z.literal('')),
  customer_type: z.enum(['wholesale', 'grocery', 'retail', 'vegetable', 'grocery_sender', 'grocery_receiver', 'vegetable_sender', 'vegetable_receiver']).default('grocery'),
  aliases: z.array(z.string()).optional(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  onClose: () => void;
  defaultType?: string;
  mode?: 'create' | 'edit';
  customer?: Customer | null;
}

const AddEditCustomerDialog: React.FC<Props> = ({ isOpen, isClosing, onClose, defaultType, mode = 'create', customer = null }) => {
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const isEditMode = mode === 'edit' && !!customer?.id;

  // Fetch customers to check for duplicates
  const { data: allCustomers } = useCustomers(undefined, isOpen);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting: isHookSubmitting },
    setError,
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema) as any,
    defaultValues: {
      name: '',
      phone: '',
      address: '',
      latitude: '',
      longitude: '',
      aliases: [],
    },
  });

  const selectedType = watch('customer_type');
  const aliases = watch('aliases') || [];
  const address = watch('address') || '';
  const latitude = watch('latitude');
  const longitude = watch('longitude');

  const addAlias = () => {
    const currentAliases = watch('aliases') || [];
    setValue('aliases', [...currentAliases, ''], { shouldValidate: true });
  };

  const removeAlias = (index: number) => {
    const currentAliases = watch('aliases') || [];
    setValue(
      'aliases',
      currentAliases.filter((_, i) => i !== index),
      { shouldValidate: true }
    );
  };

  const updateAlias = (index: number, value: string) => {
    const currentAliases = watch('aliases') || [];
    const newAliases = [...currentAliases];
    newAliases[index] = value;
    setValue('aliases', newAliases, { shouldValidate: true });
  };

  useEffect(() => {
    if (isOpen) {
      reset({
        name: isEditMode ? (customer?.name || '') : '',
        phone: isEditMode ? (customer?.phone || '') : '',
        address: isEditMode ? (customer?.address || '') : '',
        latitude: isEditMode ? (customer?.latitude ?? '') : '',
        longitude: isEditMode ? (customer?.longitude ?? '') : '',
        customer_type: (isEditMode ? customer?.customer_type : defaultType) as any || 'grocery',
        aliases: isEditMode ? (customer?.aliases || []) : [],
      });
    }
  }, [isOpen, reset, defaultType, isEditMode, customer]);

  const onSubmit = async (data: CustomerFormData) => {
    // Duplicate check
    const isDuplicate = allCustomers?.some(c => 
      c.name.trim().toLowerCase() === data.name.trim().toLowerCase() && 
      c.customer_type === data.customer_type &&
      c.id !== customer?.id
    );

    if (isDuplicate) {
      setError('name', { message: 'Tên khách hàng này đã tồn tại trong hệ thống' });
      toast.error('Tên khách hàng này đã tồn tại');
      return;
    }

    try {
      const payload = {
        name: data.name,
        phone: data.phone || null,
        address: data.address || null,
        latitude: data.latitude === '' || data.latitude === undefined ? null : Number(data.latitude),
        longitude: data.longitude === '' || data.longitude === undefined ? null : Number(data.longitude),
        customer_type: data.customer_type,
        aliases: data.aliases?.filter(a => a.trim() !== '') || [],
      };
      if (isEditMode && customer?.id) {
        await updateMutation.mutateAsync({ id: customer.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  const handleGeocodeAddress = async () => {
    const trimmedAddress = address.trim();
    if (trimmedAddress.length < 5) {
      toast.error('Vui lòng nhập địa chỉ trước khi tìm tọa độ');
      return;
    }

    try {
      const result = await toast.promise(
        customersApi.geocode(trimmedAddress),
        {
          loading: 'Đang tìm tọa độ từ OpenStreetMap...',
          success: 'Đã tìm thấy tọa độ',
          error: 'Không tìm được tọa độ phù hợp',
        },
      );
      setValue('latitude', result.latitude, { shouldValidate: true, shouldDirty: true });
      setValue('longitude', result.longitude, { shouldValidate: true, shouldDirty: true });
    } catch {
      // toast.promise already shows the error state
    }
  };

  const handleMapPinChange = (nextLatitude: number, nextLongitude: number) => {
    setValue('latitude', nextLatitude, { shouldValidate: true, shouldDirty: true });
    setValue('longitude', nextLongitude, { shouldValidate: true, shouldDirty: true });
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending || isHookSubmitting;

  if (!isOpen && !isClosing) return null;

  return createPortal(
    <div className="fixed inset-0 z-9999 flex justify-end">
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
          'relative w-full max-w-125 bg-background shadow-2xl flex flex-col md:h-screen h-[100dvh] border-l border-border',
          isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Building2 size={20} />
            </div>
            <h2 className="text-lg font-bold text-foreground">{isEditMode ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng'}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form id="customer-form" onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
              <Building2 size={16} className="text-primary" />
              <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Thông tin liên hệ</span>
            </div>
            <div className="p-5 grid grid-cols-1 gap-4">
              {/* customer_type is now managed automatically through props, no manual selection */}

              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">
                  {selectedType === 'vegetable_receiver' || selectedType === 'wholesale' ? 'Tên vựa' : 'Tên khách hàng'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                  <input
                    type="text"
                    {...register('name')}
                    placeholder="Nhập tên khách hàng..."
                    className="w-full pl-10 pr-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-medium"
                  />
                  {errors.name && <p className="text-red-500 text-[11px] font-medium mt-1">{errors.name.message}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">Số điện thoại</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                  <input
                    type="text"
                    {...register('phone')}
                    placeholder="VD: 0901234567"
                    className="w-full pl-10 pr-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">Địa chỉ</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                  <input
                    type="text"
                    {...register('address')}
                    placeholder="VD: 12 Đường Cổ Loa..."
                    className="w-full pl-10 pr-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-foreground">Vĩ độ</label>
                  <input
                    type="number"
                    step="any"
                    {...register('latitude')}
                    placeholder="10.7769"
                    className="w-full px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-medium"
                  />
                  {errors.latitude && <p className="text-red-500 text-[11px] font-medium mt-1">{errors.latitude.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-foreground">Kinh độ</label>
                  <input
                    type="number"
                    step="any"
                    {...register('longitude')}
                    placeholder="106.7009"
                    className="w-full px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-medium"
                  />
                  {errors.longitude && <p className="text-red-500 text-[11px] font-medium mt-1">{errors.longitude.message}</p>}
                </div>
              </div>
              <CustomerLocationPicker
                address={address}
                latitude={latitude}
                longitude={longitude}
                onSearchAddress={handleGeocodeAddress}
                onChange={handleMapPinChange}
              />
            </div>
          </div>

          {/* Aliases Section */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
              <Tag size={16} className="text-primary" />
              <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Biệt danh</span>
            </div>
            <div className="p-5 space-y-3">
              {aliases.map((alias, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={alias}
                    onChange={(e) => updateAlias(index, e.target.value)}
                    placeholder="Nhập biệt danh"
                    className="flex-1 px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => removeAlias(index)}
                    aria-label={`Xóa biệt danh ${index + 1}`}
                    className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addAlias()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-border hover:bg-muted text-muted-foreground text-[13px] font-medium transition-all"
              >
                <Plus size={16} />
                Thêm biệt danh
              </button>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="bg-card border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl border border-border hover:bg-muted text-foreground text-[13px] font-bold transition-all"
          >
            Hủy
          </button>
          <button 
            type="submit"
            form="customer-form"
            disabled={isSubmitting}
            className={clsx(
              "flex items-center gap-2 px-8 py-2 rounded-xl text-[13px] font-bold shadow-lg transition-all group",
              isSubmitting 
                ? "bg-primary/50 text-white/60 cursor-wait" 
                : "bg-primary text-white hover:bg-primary/90 shadow-primary/20"
            )}
          >
            {isSubmitting ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Plus size={18} />
            )}
            {isEditMode ? 'Lưu thay đổi' : 'Thêm mới'}
            <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddEditCustomerDialog;
