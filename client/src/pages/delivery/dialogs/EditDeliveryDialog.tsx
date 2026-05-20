import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Camera, ImagePlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { deliveryKeys } from '../../../hooks/queries/useDelivery';
import { useProducts } from '../../../hooks/queries/useProducts';
import { useCustomers } from '../../../hooks/queries/useCustomers';

import { importOrdersApi } from '../../../api/importOrdersApi';
import { deliveryApi } from '../../../api/deliveryApi';
import { uploadApi } from '../../../api/uploadApi';
import { CreatableSearchableSelect } from '../../../components/ui/CreatableSearchableSelect';

import VnUnitPriceInput from '../../../components/shared/VnUnitPriceInput';
import type { DeliveryOrder, Product } from '../../../types';
import { deliveryTimeToInputValue } from '../../../lib/deliveryDisplay';
import { collectDeliveryOrderImageUrlsForEdit } from '../../../lib/deliveryOrderImages';
import { cloudinaryThumb } from '../../../lib/cloudinaryUrl';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  isClosing?: boolean;
  order: DeliveryOrder | null;
  onClose: () => void;
}

type DeliveryOrderEditPayload = Partial<DeliveryOrder> & {
  product_id?: string;
};

type SourceOrderUpdatePayload = {
  order_category: 'standard' | 'vegetable';
  sender_id?: string | null;
  sender_name?: string;
  customer_id?: string;
  receiver_name?: string;
  payment_status?: 'paid' | 'unpaid';
  total_amount?: number;
  is_custom_amount?: boolean;
};

type EditableCustomer = {
  id: string;
  name: string;
  phone?: string | null;
  customer_type?: string;
};

const EditDeliveryDialog: React.FC<Props> = ({ isOpen, isClosing, order, onClose }) => {
  const queryClient = useQueryClient();
  const isVeg = order?.order_category === 'vegetable' || !!order?.vegetable_order_id;

  const { data: products } = useProducts(isOpen, isVeg ? 'vegetable' : 'standard');
  const { data: allCustomers } = useCustomers(undefined, isOpen);
  const customers = useMemo<EditableCustomer[]>(() => (allCustomers || []) as EditableCustomer[], [allCustomers]);

  const productOptions = useMemo(() => {
    if (!products) return [];
    return products.map((p: Product) => ({
      label: p.name,
      value: p.name,
      matchKey: p.name,
    }));
  }, [products]);

  const senderOptions = useMemo(() => {
    if (customers.length === 0) return [];
    const targetType = isVeg ? 'vegetable_sender' : 'grocery_sender';
    const list = customers
      .filter((customer) => customer.customer_type === targetType)
      .map((customer) => ({
        label: `${customer.name} ${customer.phone ? `(${customer.phone})` : ''}`,
        value: customer.id,
        matchKey: customer.name,
      }));
    return list;
  }, [customers, isVeg]);

  const receiverOptions = useMemo(() => {
    if (customers.length === 0) return [];
    const targetType = isVeg ? 'vegetable_receiver' : 'grocery_receiver';
    const list = customers
      .filter((customer) => customer.customer_type === targetType)
      .map((customer) => ({
        label: `${customer.name} ${customer.phone ? `(${customer.phone})` : ''}`,
        value: customer.id,
        matchKey: customer.name,
      }));
    return list;
  }, [customers, isVeg]);

  const [formData, setFormData] = useState({
    product_name: '',
    total_quantity: 0,
    unit_price: 0,
    delivery_date: '',
    delivery_time: '',
    sender_id: null as string | null,
    sender_name: '',
    customer_id: null as string | null,
    receiver_name: '',
    payment_status: 'unpaid' as 'paid' | 'unpaid',
    total_amount: 0,
    image_url: '',
    image_urls: [] as string[]
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (order && isOpen) {
      const displayProductName = order.product_name.includes(' - ') 
        ? order.product_name.split(' - ').slice(1).join(' - ') 
        : order.product_name;

      let uPrice = order.unit_price;
      if (!uPrice || uPrice === 0) {
         const p = products?.find((p: Product) => p.name === displayProductName);
         if (p) {
            uPrice = p.base_price || 0;
         }
      }

      const initialImages = collectDeliveryOrderImageUrlsForEdit(order);
      const legacyImage = initialImages[0] || order.image_url || '';

      setFormData({
        product_name: displayProductName,
        total_quantity: Math.max(1, Math.round(Number(order.total_quantity) || 0)),
        unit_price: uPrice || 0,
        delivery_date: order.delivery_date || '',
        delivery_time: deliveryTimeToInputValue(order.delivery_time),
        sender_id: order.import_orders?.sender_id || order.vegetable_orders?.sender_id || null,
        sender_name: order.import_orders?.sender_name || order.vegetable_orders?.sender_name || order.import_orders?.sender_customers?.name || order.vegetable_orders?.sender_customers?.name || '',
        customer_id: order.import_orders?.customer_id || order.vegetable_orders?.customer_id || null,
        receiver_name: order.import_orders?.receiver_name || order.vegetable_orders?.receiver_name || order.import_orders?.customers?.name || order.vegetable_orders?.customers?.name || '',
        payment_status: order.import_orders?.payment_status === 'paid' || order.vegetable_orders?.payment_status === 'paid' ? 'paid' : 'unpaid',
        total_amount: order.import_orders?.total_amount || order.vegetable_orders?.total_amount || 0,
        image_url: legacyImage,
        image_urls: initialImages
      });
    }
  }, [order, isOpen, products]);

  if (!isOpen) return null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      toast.error('Chỉ hỗ trợ file ảnh');
      return;
    }

    setIsUploading(true);
    try {
      const uploadPromises = files.map(file => 
        uploadApi.uploadFile(file, 'import-orders', 'delivery-orders')
      );
      
      const responses = await Promise.all(uploadPromises);
      const newUrls = responses.map(r => r.url);
      
      setFormData(prev => ({ 
        ...prev, 
        image_urls: [...prev.image_urls, ...newUrls],
        image_url: prev.image_url || newUrls[0]
      }));
      toast.success(`Đã tải lên ${newUrls.length} ảnh thành công!`);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi khi tải ảnh lên');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    
    setIsSubmitting(true);
    try {
      const targetOrders = order.source_orders && order.source_orders.length > 0 ? order.source_orders : [order];
      const isMergedEdit = targetOrders.length > 1;
      const requestedTotalQuantity = Math.max(1, Math.round(Number(formData.total_quantity) || 0));
      const groupedOriginalTotalQuantity = Math.max(0, Math.round(Number(order.total_quantity) || 0));
      const shouldUpdateMergedQuantity = isMergedEdit && requestedTotalQuantity !== groupedOriginalTotalQuantity;
      const quantityByOrderId = new Map<string, number>();

      if (shouldUpdateMergedQuantity) {
        if (requestedTotalQuantity < targetOrders.length) {
          toast.error(`Tổng số lượng phải tối thiểu ${targetOrders.length} để mỗi đơn có ít nhất 1`);
          return;
        }

        const originalTotals = targetOrders.map((targetOrder) => Number(targetOrder.total_quantity) || 0);
        const sumOriginalTotals = originalTotals.reduce((sum, value) => sum + value, 0);
        const exactShares = sumOriginalTotals > 0
          ? originalTotals.map((currentQty) => (requestedTotalQuantity * currentQty) / sumOriginalTotals)
          : targetOrders.map(() => requestedTotalQuantity / targetOrders.length);

        const integerShares = exactShares.map((value) => Math.floor(value));
        let remainder = requestedTotalQuantity - integerShares.reduce((sum, value) => sum + value, 0);
        const fractionalRank = exactShares
          .map((value, index) => ({ index, fraction: value - integerShares[index] }))
          .sort((a, b) => b.fraction - a.fraction);

        let pickIndex = 0;
        while (remainder > 0 && fractionalRank.length > 0) {
          const targetIndex = fractionalRank[pickIndex % fractionalRank.length].index;
          integerShares[targetIndex] += 1;
          remainder -= 1;
          pickIndex += 1;
        }
        
        for (let index = 0; index < integerShares.length; index += 1) {
          if (integerShares[index] > 0) continue;
          const donorIndex = integerShares.findIndex((share) => share > 1);
          if (donorIndex === -1) {
            toast.error('Không thể chia số lượng hợp lệ cho tất cả đơn gộp');
            return;
          }

          integerShares[donorIndex] -= 1;
          integerShares[index] += 1;
        }

        targetOrders.forEach((targetOrder, index) => {
          quantityByOrderId.set(targetOrder.id, integerShares[index] || 0);
        });
      }

      const sourceOrderUpdates: Record<string, SourceOrderUpdatePayload> = {};
      let hasDeliveryUpdates = false;

      await Promise.all(
        targetOrders.map(async (targetOrder) => {
          const payload: DeliveryOrderEditPayload = {};

          const oldDisplayProductName = targetOrder.product_name.includes(' - ')
            ? targetOrder.product_name.split(' - ').slice(1).join(' - ')
            : targetOrder.product_name;

          if (formData.product_name !== oldDisplayProductName) {
            const prefix = targetOrder.product_name.includes(' - ') ? targetOrder.product_name.split(' - ')[0] + ' - ' : '';
            payload.product_name = prefix + formData.product_name;

            const isTargetVeg = targetOrder.order_category === 'vegetable' || !!targetOrder.vegetable_order_id;
            if (!isTargetVeg) {
              const newProduct = products?.find((p: Product) => p.name === formData.product_name);
              if (newProduct) {
                payload.product_id = newProduct.id;
              }
            }
          }

          if (isMergedEdit) {
            if (shouldUpdateMergedQuantity) {
              const distributedQuantity = quantityByOrderId.get(targetOrder.id);
              const previousQuantity = Number(targetOrder.total_quantity) || 0;
              if (distributedQuantity != null && distributedQuantity !== previousQuantity) {
                payload.total_quantity = distributedQuantity;
              }
            }
          } else if (requestedTotalQuantity !== (Number(targetOrder.total_quantity) || 0)) {
            payload.total_quantity = requestedTotalQuantity;
          }

          const rawPrice = Number(formData.unit_price) || 0;
          const normalizedPrice = rawPrice;
          if (normalizedPrice !== targetOrder.unit_price) payload.unit_price = normalizedPrice;
          if (formData.delivery_date && formData.delivery_date !== targetOrder.delivery_date) payload.delivery_date = formData.delivery_date;
          const prevTime = deliveryTimeToInputValue(targetOrder.delivery_time);
          const nextTime = (formData.delivery_time || '').trim();
          if (nextTime !== prevTime) {
            payload.delivery_time = nextTime || null;
          }

          const currentImageUrls = formData.image_urls || [];
          const oldImageUrls = targetOrder.image_urls || [];
          if (JSON.stringify(currentImageUrls) !== JSON.stringify(oldImageUrls)) {
            payload.image_urls = currentImageUrls;
            payload.image_url = currentImageUrls.length > 0 ? currentImageUrls[0] : null;
          } else if (formData.image_url && formData.image_url !== targetOrder.image_url) {
            payload.image_url = formData.image_url;
          }

          if (Object.keys(payload).length > 0) {
            hasDeliveryUpdates = true;
            await deliveryApi.update(targetOrder.id, payload);
          }

          const sourceId = targetOrder.import_order_id || targetOrder.vegetable_order_id;
          const orderData = targetOrder.import_orders || targetOrder.vegetable_orders;
          if (!sourceId || !orderData) return;

          const changedSender = formData.sender_id !== orderData.sender_id || formData.sender_name !== orderData.sender_name;
          const changedReceiver = formData.customer_id !== orderData.customer_id || formData.receiver_name !== orderData.receiver_name;
          const changedPaymentStatus = formData.payment_status !== (orderData.payment_status === 'paid' ? 'paid' : 'unpaid');
          const normalizedTotalAmount = Number(formData.total_amount) || 0;
          const changedTotalAmount = normalizedTotalAmount !== (Number(orderData.total_amount) || 0);
          if (!changedSender && !changedReceiver && !changedPaymentStatus && !changedTotalAmount) return;

          if (!sourceOrderUpdates[sourceId]) {
            sourceOrderUpdates[sourceId] = {
              order_category: targetOrder.vegetable_order_id ? 'vegetable' : 'standard',
            };
          }
          if (changedSender) {
            sourceOrderUpdates[sourceId].sender_id = formData.sender_id || null;
            sourceOrderUpdates[sourceId].sender_name = formData.sender_name || '';
          }
          if (changedReceiver) {
            sourceOrderUpdates[sourceId].customer_id = formData.customer_id || undefined;
            sourceOrderUpdates[sourceId].receiver_name = formData.receiver_name || '';
          }
          if (changedPaymentStatus || changedTotalAmount) {
            sourceOrderUpdates[sourceId].payment_status = formData.payment_status;
            sourceOrderUpdates[sourceId].total_amount = normalizedTotalAmount;
            sourceOrderUpdates[sourceId].is_custom_amount = true;
          }
        })
      );

      const sourceUpdatePromises = Object.entries(sourceOrderUpdates).map(([sourceId, sourcePayload]) =>
        importOrdersApi.update(sourceId, sourcePayload)
      );
      if (sourceUpdatePromises.length > 0) {
        await Promise.all(sourceUpdatePromises);
      }

      if (hasDeliveryUpdates || sourceUpdatePromises.length > 0) {
        await queryClient.invalidateQueries({ queryKey: deliveryKeys.all });
      }

      toast.success('Đã cập nhật đơn hàng');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Có lỗi xảy ra khi cập nhật');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProductChange = (val: string) => {
     let newPrice = formData.unit_price;
     const product = products?.find((p: Product) => p.name === val);
     if (product) {
        newPrice = product.base_price || 0;
     }
     setFormData(prev => ({ ...prev, product_name: val, unit_price: newPrice }));
  };

  const handleSenderChange = (val: string, isCreate: boolean) => {
    if (isCreate) {
       setFormData(prev => ({ ...prev, sender_id: null, sender_name: val }));
    } else {
       const found = customers.find((customer) => customer.id === val);
       setFormData(prev => ({ ...prev, sender_id: val, sender_name: found?.name || '' }));
    }
  };

  const handleReceiverChange = (val: string, isCreate: boolean) => {
    if (isCreate) {
       setFormData(prev => ({ ...prev, customer_id: null, receiver_name: val }));
    } else {
       const found = customers.find((customer) => customer.id === val);
       setFormData(prev => ({ ...prev, customer_id: val, receiver_name: found?.name || '' }));
    }
  };

  const content = (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-0 md:p-4">
      <div 
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={!isSubmitting ? onClose : undefined}
      />
      
      <div className={`relative w-full h-full md:h-auto md:max-w-md bg-background md:rounded-2xl shadow-xl transition-all duration-300 overflow-hidden flex flex-col md:max-h-[90vh] ${
        isClosing ? 'opacity-0 translate-y-4 scale-95' : 'opacity-100 translate-y-0 scale-100'
      }`}>
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="text-lg font-bold text-foreground">Chỉnh sửa đơn hàng</h2>
          <button 
            onClick={!isSubmitting ? onClose : undefined} 
            disabled={isSubmitting}
            className="p-2 hover:bg-muted rounded-full transition-colors disabled:opacity-50"
          >
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto custom-scrollbar">
          <form id="edit-delivery-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Ảnh đơn hàng */}
            <div className="space-y-1.5 pt-2">
              <label className="text-[13px] font-bold text-foreground flex items-center gap-1">
                <Camera size={14} className="text-primary" />
                Ảnh đơn hàng ({formData.image_urls.length})
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {formData.image_urls.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl border border-border overflow-hidden group bg-muted/20">
                    <img src={cloudinaryThumb(url)} alt={`Receipt ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        const newUrls = formData.image_urls.filter((_, i) => i !== idx);
                        setFormData(prev => ({ ...prev, image_urls: newUrls, image_url: newUrls.length > 0 ? newUrls[0] : '' }));
                      }}
                      className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-sm hover:bg-red-700 active:scale-95 transition-all"
                      aria-label="Xóa ảnh"
                      title="Xóa ảnh"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={isSubmitting || isUploading}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting || isUploading}
                    className="w-full aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all bg-muted/5 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <Loader2 size={18} className="animate-spin text-primary" />
                    ) : (
                      <>
                        <ImagePlus size={20} className="mb-1 text-primary" />
                        <span className="text-[10px] font-bold text-center px-1">Thêm ảnh</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-bold text-foreground">Tên hàng hóa <span className="text-red-500">*</span></label>
              <CreatableSearchableSelect
                options={productOptions}
                value={formData.product_name}
                onValueChange={handleProductChange}
                onCreate={handleProductChange}
                placeholder="Chọn hoặc nhập tên hàng..."
                className="w-full bg-card border border-border rounded-xl"
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">Số lượng <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  className="w-full h-11 px-3 border border-border rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                  value={formData.total_quantity}
                  onChange={e => setFormData({ ...formData, total_quantity: Math.max(1, Number.parseInt(e.target.value, 10) || 0) })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">Đơn giá</label>
                <VnUnitPriceInput
                  value={formData.unit_price}
                  onChange={(vnd) => setFormData({ ...formData, unit_price: vnd })}
                  disabled={isSubmitting}
                  className="w-full h-11 px-3 border border-border rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
              <label className="text-[13px] font-bold text-foreground">Thanh toán đơn hàng</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, payment_status: 'unpaid' })}
                  disabled={isSubmitting}
                  className={`h-10 rounded-xl text-[13px] font-bold border transition-all ${
                    formData.payment_status === 'unpaid'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted'
                  } disabled:opacity-50`}
                >
                  Chưa trả cước SG
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, payment_status: 'paid' })}
                  disabled={isSubmitting}
                  className={`h-10 rounded-xl text-[13px] font-bold border transition-all ${
                    formData.payment_status === 'paid'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted'
                  } disabled:opacity-50`}
                >
                  Đã trả cước SG
                </button>
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-muted-foreground">Tổng tiền</label>
                <VnUnitPriceInput
                  value={formData.total_amount}
                  onChange={(vnd) => setFormData({ ...formData, total_amount: vnd })}
                  disabled={isSubmitting}
                  className="w-full h-11 px-3 border border-border rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-bold text-foreground">{isVeg ? 'Người gửi (Chủ hàng)' : 'Người gửi'}</label>
              <CreatableSearchableSelect
                options={senderOptions}
                value={formData.sender_id || formData.sender_name}
                fallbackLabel={formData.sender_name}
                onValueChange={(val) => handleSenderChange(val, false)}
                onCreate={(val) => handleSenderChange(val, true)}
                placeholder="Chọn hoặc tạo người gửi..."
                className="w-full bg-card border border-border rounded-xl"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-bold text-foreground">{isVeg ? 'Người nhận (Tên vựa)' : 'Người nhận'}</label>
              <CreatableSearchableSelect
                options={receiverOptions}
                value={formData.customer_id || formData.receiver_name}
                fallbackLabel={formData.receiver_name}
                onValueChange={(val) => handleReceiverChange(val, false)}
                onCreate={(val) => handleReceiverChange(val, true)}
                placeholder="Chọn hoặc tạo người nhận..."
                className="w-full bg-card border border-border rounded-xl"
                disabled={isSubmitting}
              />
            </div>
          </form>
        </div>

        <div className="p-4 border-t border-border shrink-0 bg-muted/50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 text-[14px] font-bold text-muted-foreground bg-card border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            form="edit-delivery-form"
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2.5 text-[14px] font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default EditDeliveryDialog;
