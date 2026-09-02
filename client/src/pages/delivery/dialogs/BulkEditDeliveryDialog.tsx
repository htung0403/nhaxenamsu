import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Trash2, ImagePlus } from 'lucide-react';
import { useUpdateDeliveryOrder } from '../../../hooks/queries/useDelivery';
import { useProducts } from '../../../hooks/queries/useProducts';
import { CreatableSearchableSelect } from '../../../components/ui/CreatableSearchableSelect';
import VnUnitPriceInput from '../../../components/shared/VnUnitPriceInput';
import { uploadApi } from '../../../api/uploadApi';
import type { Customer, DeliveryOrder, Product } from '../../../types';
import { useCustomers, useCreateCustomer } from '../../../hooks/queries/useCustomers';
import { importOrdersApi } from '../../../api/importOrdersApi';
import toast from 'react-hot-toast';
import { collectDeliveryOrderImageUrlsForEdit } from '../../../lib/deliveryOrderImages';
import { cloudinaryThumb } from '../../../lib/cloudinaryUrl';

interface Props {
  isOpen: boolean;
  isClosing?: boolean;
  orders: DeliveryOrder[];
  hideImage?: boolean;
  onClose: () => void;
}

const pickRelation = <T,>(relation: any): T | undefined => {
  if (Array.isArray(relation)) return relation[0];
  return relation || undefined;
};

type CustomerMutationResponse = Customer | { data?: Customer };

const unwrapCustomerMutationData = (response: CustomerMutationResponse): Customer | undefined => {
  if ('id' in response) return response;
  return response.data;
};

const getOrderPreviewImage = (order: any, localUrl?: string) => {
  if (localUrl) return localUrl;
  if (!order) return null;
  
  const directImage = order.image_url;
  if (directImage) return directImage;

  const paymentImage = order.payment_collections?.find((pc: any) => pc.image_url)?.image_url;
  if (paymentImage) return paymentImage;

  const vehicleImage = (order.delivery_vehicles || [])
    .find((dv: any) => dv.image_urls && dv.image_urls.length > 0)?.image_urls[0];
  if (vehicleImage) return vehicleImage;

  const linkedImport = pickRelation<any>(order.import_orders);
  const linkedVeg = pickRelation<any>(order.vegetable_orders);

  if (linkedImport?.receipt_image_url) return linkedImport.receipt_image_url;
  if (linkedVeg?.receipt_image_url) return linkedVeg.receipt_image_url;

  const collectFirstImage = (refs: any): string | null => {
    const list = Array.isArray(refs) ? refs : (refs ? [refs] : []);
    for (const ref of list) {
      if (ref.image_url) {
        if (typeof ref.image_url === 'string' && ref.image_url.includes(',')) return ref.image_url.split(',')[0].trim();
        if (typeof ref.image_url === 'string') return ref.image_url;
      }
      if (ref.image_urls && Array.isArray(ref.image_urls) && ref.image_urls.length > 0) {
        return ref.image_urls[0];
      }
    }
    return null;
  };

  const importItemImage = collectFirstImage(linkedImport?.import_order_items);
  if (importItemImage) return importItemImage;

  const vegItemImage = collectFirstImage(linkedVeg?.vegetable_order_items);
  if (vegItemImage) return vegItemImage;

  return null;
};

const formatAmount = (val?: number) => {
  if (val == null) return '0';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
};

const BulkEditDeliveryDialog: React.FC<Props> = ({ isOpen, isClosing, orders, hideImage = false, onClose }) => {
  const updateMutation = useUpdateDeliveryOrder();
  const isVeg = orders.length > 0 && (orders[0].order_category === 'vegetable' || !!orders[0].vegetable_order_id);

  const { data: products } = useProducts(isOpen, isVeg ? 'vegetable' : 'standard');
  const { data: allCustomers } = useCustomers(undefined, isOpen);
  const createCustomerMutation = useCreateCustomer();

  const productOptions = useMemo(() => {
    if (!products) return [];
    return products.map((p: Product) => ({
      label: p.name,
      value: p.name,
      matchKey: p.name,
    }));
  }, [products]);

  const senderOptions = useMemo(() => {
    if (!allCustomers) return [];
    const targetType = isVeg ? 'vegetable_sender' : 'grocery_sender';
    return allCustomers
      .filter((c: any) => c.customer_type === targetType)
      .map((c: any) => ({
        label: `${c.name} ${c.phone ? `(${c.phone})` : ''}`,
        value: c.id,
        matchKey: c.name,
      }));
  }, [allCustomers, isVeg]);

  const receiverOptions = useMemo(() => {
    if (!allCustomers) return [];
    const targetType = isVeg ? 'vegetable_receiver' : 'grocery_receiver';
    return allCustomers
      .filter((c: any) => c.customer_type === targetType)
      .map((c: any) => ({
        label: `${c.name} ${c.phone ? `(${c.phone})` : ''}`,
        value: c.id,
        matchKey: c.name,
      }));
  }, [allCustomers, isVeg]);

  const [editData, setEditData] = useState<Record<string, { product_name: string; total_quantity: number; unit_price: number; image_url?: string; image_urls?: string[]; sender_id?: string | null; sender_name?: string; customer_id?: string | null; receiver_name?: string }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (orders && orders.length > 0 && products && !isInitialized.current) {
        const initial: any = {};
        orders.forEach(o => {
          const displayProductName = o.product_name.includes(' - ') 
            ? o.product_name.split(' - ').slice(1).join(' - ') 
            : o.product_name;

          let uPrice = o.unit_price;
          if (!uPrice || uPrice === 0) {
             const p = products?.find((p: Product) => p.name === displayProductName);
             if (p) {
                uPrice = p.base_price || 0;
             }
          }
          const initialImages = collectDeliveryOrderImageUrlsForEdit(o);
          const legacyImage = initialImages[0] || (o as any).image_url || '';

          initial[o.id] = {
            product_name: displayProductName,
            total_quantity: o.total_quantity || 0,
            unit_price: uPrice || 0,
            image_url: legacyImage,
            image_urls: initialImages,
            sender_id: o.import_orders?.sender_id || o.vegetable_orders?.sender_id || null,
            sender_name: o.import_orders?.sender_name || o.vegetable_orders?.sender_name || o.import_orders?.sender_customers?.name || o.vegetable_orders?.sender_customers?.name || '',
            customer_id: o.import_orders?.customer_id || o.vegetable_orders?.customer_id || null,
            receiver_name: o.import_orders?.receiver_name || o.vegetable_orders?.receiver_name || o.import_orders?.customers?.name || o.vegetable_orders?.customers?.name || ''
          };
        });
        setEditData(initial);
        isInitialized.current = true;
      }
    } else {
      isInitialized.current = false;
    }
  }, [isOpen, orders, products, allCustomers]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orders.length === 0) return;

    setIsSubmitting(true);
    try {
      const sourceOrderUpdates: Record<string, any> = {};

      await Promise.all(
        orders.map(order => {
          const current = editData[order.id];
          if (!current) return Promise.resolve();

          // Prepare source order updates
          const sourceId = order.import_order_id || order.vegetable_order_id;
          const isVeg = !!order.vegetable_order_id;
          const orderData = order.import_orders || order.vegetable_orders;
          
          if (sourceId && orderData) {
             const changedSender = current.sender_id !== orderData.sender_id || current.sender_name !== orderData.sender_name;
             const changedReceiver = current.customer_id !== orderData.customer_id || current.receiver_name !== orderData.receiver_name;
             
             if (changedSender || changedReceiver) {
                if (!sourceOrderUpdates[sourceId]) {
                   sourceOrderUpdates[sourceId] = {
                      order_category: isVeg ? 'vegetable' : 'standard',
                   };
                }
                if (changedSender) {
                   sourceOrderUpdates[sourceId].sender_id = current.sender_id || null;
                   sourceOrderUpdates[sourceId].sender_name = current.sender_name || '';
                }
                if (changedReceiver) {
                   sourceOrderUpdates[sourceId].customer_id = current.customer_id || null;
                   sourceOrderUpdates[sourceId].receiver_name = current.receiver_name || '';
                }
             }
          }

          // Only send payload if values actually changed to avoid unnecessary updates
          const payload: any = {};
          
          const oldDisplayProductName = order.product_name.includes(' - ') 
            ? order.product_name.split(' - ').slice(1).join(' - ') 
            : order.product_name;

          if (current.product_name !== oldDisplayProductName) {
             const prefix = order.product_name.includes(' - ') ? order.product_name.split(' - ')[0] + ' - ' : '';
             payload.product_name = prefix + current.product_name;
          }

          if (current.total_quantity !== order.total_quantity) payload.total_quantity = current.total_quantity;
          const rawPrice = Number(current.unit_price) || 0;
          const normalizedPrice = rawPrice > 0 && rawPrice < 10000 ? rawPrice * 1000 : rawPrice;
          if (normalizedPrice !== order.unit_price) payload.unit_price = normalizedPrice;
          
          const currentImageUrls = current.image_urls || [];
          const oldImageUrls = (order as any).image_urls || [];
          
          if (JSON.stringify(currentImageUrls) !== JSON.stringify(oldImageUrls)) {
            payload.image_urls = currentImageUrls;
            payload.image_url = currentImageUrls.length > 0 ? currentImageUrls[0] : null;
          } else if (current.image_url && current.image_url !== (order as any).image_url) {
            payload.image_url = current.image_url;
          }

          if (Object.keys(payload).length > 0) {
            return updateMutation.mutateAsync({
              id: order.id,
              payload
            });
          }
          return Promise.resolve();
        })
      );

      // Execute source order updates
      const sourceUpdatePromises = Object.entries(sourceOrderUpdates).map(([sourceId, updatePayload]) => {
         return importOrdersApi.update(sourceId, updatePayload);
      });
      if (sourceUpdatePromises.length > 0) {
         await Promise.all(sourceUpdatePromises);
      }

      toast.success(`Đã cập nhật ${orders.length} đơn hàng`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Có lỗi xảy ra khi cập nhật');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateRow = (id: string, field: string, value: any) => {
    setEditData(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleImageUpload = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      toast.error('Chỉ hỗ trợ file ảnh');
      return;
    }

    setUploadingImageId(id);
    try {
      const uploadPromises = files.map(file => 
        uploadApi.uploadFile(file, 'import-orders', 'delivery-orders')
      );
      
      const responses = await Promise.all(uploadPromises);
      const newUrls = responses.map(r => r.url);
      
      setEditData(prev => {
        const currentUrls = prev[id]?.image_urls || [];
        const updatedUrls = [...currentUrls, ...newUrls];
        return {
          ...prev,
          [id]: {
            ...prev[id],
            image_urls: updatedUrls,
            image_url: prev[id]?.image_url || newUrls[0]
          }
        };
      });
      toast.success(`Đã tải lên ${newUrls.length} ảnh thành công!`);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi khi tải ảnh lên');
    } finally {
      setUploadingImageId(null);
      e.target.value = '';
    }
  };

  const handleProductChange = (id: string, val: string) => {
     updateRow(id, 'product_name', val);
     const product = products?.find((p: Product) => p.name === val);
     if (product) {
        updateRow(id, 'unit_price', product.base_price || 0);
     }
  };

  const handleSenderChange = async (id: string, val: string, isCreate: boolean) => {
    if (isCreate) {
       const name = val.trim();
       if (!name) return;

       try {
          const customerType = isVeg ? 'vegetable_sender' : 'grocery_sender';
          const response = await createCustomerMutation.mutateAsync({ name, customer_type: customerType });
          const customer = unwrapCustomerMutationData(response);
          updateRow(id, 'sender_id', customer?.id || null);
          updateRow(id, 'sender_name', customer?.name || name);
       } catch {
          // handled by mutation
       }
    } else {
       updateRow(id, 'sender_id', val);
       const found = allCustomers?.find((c: any) => c.id === val);
       updateRow(id, 'sender_name', found?.name || '');
    }
  };

  const handleReceiverChange = async (id: string, val: string, isCreate: boolean) => {
    if (isCreate) {
       const name = val.trim();
       if (!name) return;

       try {
          const customerType = isVeg ? 'vegetable_receiver' : 'grocery_receiver';
          const response = await createCustomerMutation.mutateAsync({ name, customer_type: customerType });
          const customer = unwrapCustomerMutationData(response);
          updateRow(id, 'customer_id', customer?.id || null);
          updateRow(id, 'receiver_name', customer?.name || name);
       } catch {
          // handled by mutation
       }
    } else {
       updateRow(id, 'customer_id', val);
       const found = allCustomers?.find((c: any) => c.id === val);
       updateRow(id, 'receiver_name', found?.name || '');
    }
  };

  const content = (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-0">
      <div 
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={!isSubmitting ? onClose : undefined}
      />
      
      <div className={`relative w-full h-full max-w-none bg-background shadow-xl transition-all duration-300 overflow-hidden flex flex-col ${
        isClosing ? 'opacity-0 translate-y-4 scale-95' : 'opacity-100 translate-y-0 scale-100'
      }`}>
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-foreground">Sửa hàng loạt</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[12px] font-bold">
              {orders.length} đơn hàng
            </span>
          </div>
          <button 
            onClick={!isSubmitting ? onClose : undefined} 
            disabled={isSubmitting}
            className="p-2 hover:bg-muted rounded-full transition-colors disabled:opacity-50"
          >
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-0 overflow-y-auto custom-scrollbar flex-1 bg-muted/50">
          <form id="bulk-edit-form" onSubmit={handleSubmit} className="w-full">
            {/* Desktop View */}
            <div className="hidden md:block w-full">
              <table className="w-full border-collapse min-w-[800px]">
                <thead className="sticky top-0 bg-muted z-10 shadow-sm">
                <tr>
                  {!hideImage && (
                    <th className="px-4 py-3 text-[12px] font-bold text-muted-foreground uppercase tracking-wide text-left w-16">Ảnh</th>
                  )}
                  <th className="px-4 py-3 text-[12px] font-bold text-muted-foreground uppercase tracking-wide text-left min-w-[150px]">{isVeg ? 'Người gửi (Chủ hàng)' : 'Người gửi'}</th>
                  <th className="px-4 py-3 text-[12px] font-bold text-muted-foreground uppercase tracking-wide text-left min-w-[150px]">{isVeg ? 'Người nhận (Tên vựa)' : 'Người nhận'}</th>
                  <th className="px-4 py-3 text-[12px] font-bold text-muted-foreground uppercase tracking-wide text-left min-w-[200px]">Tên hàng hóa <span className="text-red-500">*</span></th>
                  <th className="px-4 py-3 text-[12px] font-bold text-muted-foreground uppercase tracking-wide text-left w-24">Số lượng <span className="text-red-500">*</span></th>
                  <th className="px-4 py-3 text-[12px] font-bold text-muted-foreground uppercase tracking-wide text-left w-32">Đơn giá</th>
                  <th className="px-4 py-3 text-[12px] font-bold text-muted-foreground uppercase tracking-wide text-right w-32">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {orders.map(order => {
                  const rowData = editData[order.id];
                  if (!rowData) return null;
                  
                  const amount = (rowData.total_quantity || 0) * (rowData.unit_price || 0);
                  const previewImage = getOrderPreviewImage(order, rowData.image_url);
                  const displayImages = rowData.image_urls && rowData.image_urls.length > 0 ? rowData.image_urls : (previewImage ? [previewImage] : []);

                  return (
                    <tr key={order.id} className="hover:bg-muted/50 transition-colors">
                      {!hideImage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 overflow-x-auto max-w-[120px] custom-scrollbar pb-1">
                            {displayImages.map((url, idx) => (
                              <div key={idx} className="relative shrink-0 w-10 h-10 rounded-lg border border-border overflow-hidden group bg-muted/20">
                                <img loading="lazy" decoding="async" src={cloudinaryThumb(url)} alt={`Receipt ${idx + 1}`} className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentList = rowData.image_urls && rowData.image_urls.length > 0 ? rowData.image_urls : (previewImage ? [previewImage] : []);
                                    const newUrls = currentList.filter((_, i) => i !== idx);
                                    updateRow(order.id, 'image_urls', newUrls);
                                    updateRow(order.id, 'image_url', newUrls.length > 0 ? newUrls[0] : '');
                                  }}
                                  className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                            <label className="relative shrink-0 flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-muted/20 border border-dashed border-border cursor-pointer hover:bg-muted/50 transition-colors">
                              {uploadingImageId === order.id ? (
                                <Loader2 size={16} className="text-primary animate-spin" />
                              ) : (
                                <ImagePlus size={16} className="text-muted-foreground" />
                              )}
                              <input 
                                type="file" 
                                accept="image/*" 
                                multiple
                                className="hidden" 
                                onChange={(e) => handleImageUpload(order.id, e)}
                                disabled={isSubmitting || uploadingImageId === order.id}
                              />
                            </label>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <CreatableSearchableSelect
                          options={senderOptions}
                          value={rowData.sender_id || rowData.sender_name}
                          fallbackLabel={rowData.sender_name}
                          onValueChange={(val) => handleSenderChange(order.id, val, false)}
                          onCreate={(val) => handleSenderChange(order.id, val, true)}
                          placeholder="Chọn người gửi..."
                          className="w-full bg-card border border-border rounded-xl min-w-[120px]"
                          disabled={isSubmitting || createCustomerMutation.isPending}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <CreatableSearchableSelect
                          options={receiverOptions}
                          value={rowData.customer_id || rowData.receiver_name}
                          fallbackLabel={rowData.receiver_name}
                          onValueChange={(val) => handleReceiverChange(order.id, val, false)}
                          onCreate={(val) => handleReceiverChange(order.id, val, true)}
                          placeholder="Chọn người nhận..."
                          className="w-full bg-card border border-border rounded-xl min-w-[120px]"
                          disabled={isSubmitting || createCustomerMutation.isPending}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <CreatableSearchableSelect
                          options={productOptions}
                          value={rowData.product_name}
                          onValueChange={(val) => handleProductChange(order.id, val)}
                          onCreate={(val) => handleProductChange(order.id, val)}
                          placeholder="Nhập tên hàng..."
                          className="w-full bg-card border border-border rounded-xl"
                          disabled={isSubmitting || createCustomerMutation.isPending}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          required
                          min="0.1"
                          step="0.1"
                          className="w-full h-11 px-3 border border-border rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                          value={rowData.total_quantity}
                          onChange={e => updateRow(order.id, 'total_quantity', parseFloat(e.target.value) || 0)}
                          disabled={isSubmitting || createCustomerMutation.isPending}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <VnUnitPriceInput
                          value={rowData.unit_price}
                          onChange={(vnd) => updateRow(order.id, 'unit_price', vnd)}
                          disabled={isSubmitting}
                          className="w-full h-11 px-3 border border-border rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[14px] font-bold text-foreground">
                          {formatAmount(amount)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            {/* Mobile View (Card-based) */}
            <div className="md:hidden flex flex-col gap-3 p-3 pb-6">
              {orders.map(order => {
                const rowData = editData[order.id];
                if (!rowData) return null;
                
                const amount = (rowData.total_quantity || 0) * (rowData.unit_price || 0);
                const previewImage = getOrderPreviewImage(order, rowData.image_url);
                const displayImages = rowData.image_urls && rowData.image_urls.length > 0 ? rowData.image_urls : (previewImage ? [previewImage] : []);

                return (
                  <div key={order.id} className="bg-card border border-border rounded-xl p-3 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] flex flex-col gap-3 relative overflow-hidden">
                    {/* Top Row: Image (if any) + Product, Qty, Price */}
                    <div className="flex gap-3">
                      {!hideImage && (
                        <div className="shrink-0 w-16 flex flex-col gap-1">
                          <div className="flex flex-col gap-1 overflow-y-auto max-h-[100px] custom-scrollbar pr-1">
                            {displayImages.map((url, idx) => (
                              <div key={idx} className="relative shrink-0 w-16 h-16 rounded-lg border border-border overflow-hidden group bg-muted/20">
                                <img loading="lazy" decoding="async" src={cloudinaryThumb(url)} alt={`Receipt ${idx + 1}`} className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentList = rowData.image_urls && rowData.image_urls.length > 0 ? rowData.image_urls : (previewImage ? [previewImage] : []);
                                    const newUrls = currentList.filter((_, i) => i !== idx);
                                    updateRow(order.id, 'image_urls', newUrls);
                                    updateRow(order.id, 'image_url', newUrls.length > 0 ? newUrls[0] : '');
                                  }}
                                  className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ))}
                            <label className="relative shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-lg bg-muted/20 border border-dashed border-border cursor-pointer hover:bg-muted/50 transition-colors">
                              {uploadingImageId === order.id ? (
                                <Loader2 size={16} className="text-primary animate-spin" />
                              ) : (
                                <>
                                  <ImagePlus size={16} className="text-muted-foreground mb-0.5" />
                                  <span className="text-[9px] font-medium opacity-70">TẢI LÊN</span>
                                </>
                              )}
                              <input 
                                type="file" 
                                accept="image/*" 
                                multiple
                                className="hidden" 
                                onChange={(e) => handleImageUpload(order.id, e)}
                                disabled={isSubmitting || uploadingImageId === order.id}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex-1 flex flex-col gap-2.5 min-w-0 justify-center">
                        <div className="w-full">
                          <CreatableSearchableSelect
                            options={productOptions}
                            value={rowData.product_name}
                            onValueChange={(val) => handleProductChange(order.id, val)}
                            onCreate={(val) => handleProductChange(order.id, val)}
                            placeholder="Tên hàng hóa *"
                            className="w-full bg-card border border-border rounded-lg min-h-[36px]"
                            disabled={isSubmitting}
                          />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <span className="absolute -top-1.5 left-2 bg-card px-1 text-[9px] font-bold text-muted-foreground z-10 leading-none">S.LƯỢNG *</span>
                            <input
                              type="number"
                              required
                              min="0.1"
                              step="0.1"
                              className="w-full h-9 px-2 pt-1 border border-border rounded-lg text-[14px] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                              value={rowData.total_quantity}
                              onChange={e => updateRow(order.id, 'total_quantity', parseFloat(e.target.value) || 0)}
                              disabled={isSubmitting}
                            />
                          </div>
                          <div className="flex-1 relative">
                            <span className="absolute -top-1.5 left-2 bg-card px-1 text-[9px] font-bold text-muted-foreground z-10 leading-none">ĐƠN GIÁ</span>
                            <VnUnitPriceInput
                              value={rowData.unit_price}
                              onChange={(vnd) => updateRow(order.id, 'unit_price', vnd)}
                              disabled={isSubmitting}
                              className="w-full h-9 px-2 pt-1 border border-border rounded-lg text-[14px] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sender & Receiver */}
                    <div className="flex flex-col gap-2 pt-2.5 border-t border-border">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase ml-1">{isVeg ? 'Người gửi (Chủ hàng)' : 'Người gửi'}</span>
                        <CreatableSearchableSelect
                          options={senderOptions}
                          value={rowData.sender_id || rowData.sender_name}
                          fallbackLabel={rowData.sender_name}
                          onValueChange={(val) => handleSenderChange(order.id, val, false)}
                          onCreate={(val) => handleSenderChange(order.id, val, true)}
                          placeholder="Chọn người gửi..."
                          className="w-full bg-card border border-border rounded-lg min-h-[40px]"
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase ml-1">{isVeg ? 'Người nhận (Tên vựa)' : 'Người nhận'}</span>
                        <CreatableSearchableSelect
                          options={receiverOptions}
                          value={rowData.customer_id || rowData.receiver_name}
                          fallbackLabel={rowData.receiver_name}
                          onValueChange={(val) => handleReceiverChange(order.id, val, false)}
                          onCreate={(val) => handleReceiverChange(order.id, val, true)}
                          placeholder="Chọn người nhận..."
                          className="w-full bg-card border border-border rounded-lg min-h-[40px]"
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>

                    {/* Total Amount */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-border mt-0.5">
                      <span className="text-[12px] font-bold text-muted-foreground uppercase">Thành tiền</span>
                      <span className="text-[16px] font-black text-foreground">{formatAmount(amount)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </form>
        </div>

        <div className="p-4 border-t border-border shrink-0 bg-card flex justify-end gap-2 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-20">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || createCustomerMutation.isPending}
            className="px-4 py-2.5 text-[14px] font-bold text-muted-foreground bg-card border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            form="bulk-edit-form"
            type="submit"
            disabled={isSubmitting || createCustomerMutation.isPending || orders.length === 0}
            className="px-4 py-2.5 text-[14px] font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {(isSubmitting || createCustomerMutation.isPending) && <Loader2 size={16} className="animate-spin" />}
            {createCustomerMutation.isPending ? 'Đang tạo khách...' : isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default BulkEditDeliveryDialog;
