import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, Package, Truck, ZoomIn } from 'lucide-react';
import { clsx } from 'clsx';
import type { DeliveryOrder, ImportOrder, ExportOrder } from '../../../types';
import { cloudinaryMedium, cloudinaryFull } from '../../../lib/cloudinaryUrl';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  order: DeliveryOrder | ImportOrder | ExportOrder | null;
  onClose: () => void;
}

type OrderImageRef = {
  image_url?: string | null;
  image_urls?: string[] | null;
  quantity?: number;
  products?: { name?: string };
};

type MaybeArray<T> = T | T[] | null | undefined;

type LinkedImportOrder = {
  order_code?: string;
  order_date?: string;
  order_time?: string | null;
  quantity?: number | null;
  receiver_name?: string;
  received_by?: string | null;
  created_at?: string | null;
  profiles?: { full_name?: string };
  receipt_image_url?: string | null;
  receipt_image_urls?: string[] | null;
  import_order_items?: OrderImageRef[];
  vegetable_order_items?: OrderImageRef[];
};

type DeliveryOrderLike = DeliveryOrder & {
  image_url?: string | null;
  image_urls?: string[] | null;
  import_orders?: MaybeArray<LinkedImportOrder>;
  vegetable_orders?: MaybeArray<LinkedImportOrder>;
  payment_collections?: Array<{ vehicle_id?: string | null; image_url?: string | null; image_urls?: string[] | null }>;
  delivery_vehicles?: Array<{
    vehicle_id?: string | null;
    driver_id?: string | null;
    assigned_quantity?: number | null;
    image_urls?: string[] | null;
    delivery_date?: string | null;
    delivery_time?: string | null;
    vehicles?: { license_plate?: string | null } | null;
  }>;
  source_orders?: DeliveryOrderLike[];
  driver_delivered_at?: string | null;
  created_at?: string | null;
};

type DeliveryVehicleLike = NonNullable<DeliveryOrderLike['delivery_vehicles']>[number];

type ImportOrderLike = ImportOrder & {
  delivery_orders?: DeliveryOrderLike[];
};

type ExportOrderLike = ExportOrder & {
  image_url?: string | null;
  image_urls?: string[] | null;
  product_name?: string | null;
};

const isDeliveryOrder = (value: Props['order']): value is DeliveryOrderLike => {
  return Boolean(value && 'delivery_date' in value);
};

const isImportOrder = (value: Props['order']): value is ImportOrderLike => {
  return Boolean(value && 'order_code' in value && !('delivery_date' in value));
};

const isExportOrder = (value: Props['order']): value is ExportOrderLike => {
  return Boolean(value && 'export_date' in value);
};

const pickRelation = <T,>(relation: MaybeArray<T>): T | undefined => {
  if (Array.isArray(relation)) return relation[0];
  return relation || undefined;
};

const formatDateTime = (date?: string | null, time?: string | null, createdAt?: string | null): string => {
  if (date) {
    const datePart = (() => {
      const chunks = date.split('-');
      if (chunks.length === 3) {
        const [y, m, d] = chunks;
        return `${d}-${m}-${y}`;
      }
      return date;
    })();
    if (time) return `${time.slice(0, 5)} ${datePart}`;
    return datePart;
  }

  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${min} ${dd}-${mm}-${yyyy}`;
    }
  }

  return '--';
};

const isUuidLike = (value?: string | null): boolean => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
};

const sumItemQuantity = (items?: OrderImageRef[] | null): number | null => {
  if (!items || items.length === 0) return null;
  const total = items.reduce((acc, item) => acc + (item.quantity ?? 0), 0);
  return total > 0 ? total : null;
};

const OrderImagesDialog: React.FC<Props> = ({ isOpen, isClosing, order, onClose }) => {
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  if (!isOpen && !isClosing) return null;

  const isDelivery = isDeliveryOrder(order);
  const isImport = isImportOrder(order);
  const isExport = isExportOrder(order);

  let receiptImages: string[] = [];
  let importImages: string[] = [];
  let deliveryImages: string[] = [];
  let deliveryImageMeta: Array<{ 
    url: string; 
    vehicleLabel?: string; 
    source: 'vehicle' | 'payment' | 'delivery';
    deliveryDate?: string;
    deliveryTime?: string | null;
    productName?: string;
    driverDeliveredAt?: string | null;
    createdAt?: string | null;
  }> = [];
  const nhapHangImageMeta: Array<{ url: string; displayDateTime: string; quantity: string; receiverName: string }> = [];
  let orderCode = 'N/A';
  let orderLabel = '';
  let iOrder: ImportOrderLike | undefined;
  let linkedNhapOrder: LinkedImportOrder | undefined;
  let dOrderForNhapMeta: DeliveryOrderLike | undefined;

  const collectImages = (refs: MaybeArray<OrderImageRef> | OrderImageRef[]): string[] => {
    const list = Array.isArray(refs) ? refs : (refs ? [refs] : []);
    const urls: string[] = [];
    list.forEach(ref => {
      if (ref.image_url) {
        if (ref.image_url.includes(',')) urls.push(...ref.image_url.split(',').map((s: string) => s.trim()));
        else urls.push(ref.image_url);
      }
      if (ref.image_urls) urls.push(...ref.image_urls);
    });
    return [...new Set(urls)].filter(u => typeof u === 'string' && u.trim().length > 0);
  };

  if (isDelivery) {
    const dOrder = order;
    const sourceOrders: DeliveryOrderLike[] = ((dOrder.source_orders && dOrder.source_orders.length > 0 ? dOrder.source_orders : [dOrder]) as DeliveryOrderLike[]).filter(Boolean) as DeliveryOrderLike[];
    dOrderForNhapMeta = sourceOrders[0] || dOrder;

    deliveryImages = [];
    deliveryImageMeta = [];
    receiptImages = [];
    importImages = [];

    const pushDeliveryMeta = (
      url: string | null | undefined,
      source: 'vehicle' | 'payment' | 'delivery',
      vehicleLabel?: string,
      deliveryDate?: string,
      deliveryTime?: string | null,
      productName?: string,
      driverDeliveredAt?: string | null,
      createdAt?: string | null
    ) => {
      if (!url || typeof url !== 'string' || !url.trim()) return;
      if (url.includes(',')) {
        url.split(',').forEach((u: string) => {
          const t = u.trim();
          if (t) {
            deliveryImages.push(t);
            deliveryImageMeta.push({
              url: t,
              source,
              vehicleLabel,
              deliveryDate,
              deliveryTime,
              productName,
              driverDeliveredAt,
              createdAt
            });
          }
        });
      } else {
        deliveryImages.push(url);
        deliveryImageMeta.push({
          url,
          source,
          vehicleLabel,
          deliveryDate,
          deliveryTime,
          productName,
          driverDeliveredAt,
          createdAt
        });
      }
    };

    const globalNhapSeen = new Set<string>();
    sourceOrders.forEach((currentOrder, sourceIndex) => {
      const linkedImportOrder = pickRelation(currentOrder?.import_orders);
      const linkedVegetableOrder = pickRelation(currentOrder?.vegetable_orders);

      if (sourceIndex === 0) {
        linkedNhapOrder = linkedImportOrder || linkedVegetableOrder;
      }

      const sourceRawReceiver = linkedImportOrder?.receiver_name
        || linkedImportOrder?.profiles?.full_name
        || linkedImportOrder?.received_by
        || linkedVegetableOrder?.receiver_name
        || linkedVegetableOrder?.profiles?.full_name
        || linkedVegetableOrder?.received_by
        || null;
      const sourceReceiverName = sourceRawReceiver && !isUuidLike(sourceRawReceiver) ? sourceRawReceiver : '--';

      const sourceQuantity = linkedImportOrder?.quantity
        ?? sumItemQuantity(linkedImportOrder?.import_order_items)
        ?? linkedVegetableOrder?.quantity
        ?? sumItemQuantity(linkedVegetableOrder?.vegetable_order_items)
        ?? currentOrder.total_quantity
        ?? null;

      const sourceDisplayDateTime = formatDateTime(
        linkedImportOrder?.order_date || linkedVegetableOrder?.order_date || currentOrder.delivery_date,
        linkedImportOrder?.order_time || linkedVegetableOrder?.order_time || currentOrder.delivery_time,
        linkedImportOrder?.created_at || linkedVegetableOrder?.created_at || currentOrder.created_at
      );

      const sourceReceiptImages: string[] = [];
      if (linkedImportOrder?.receipt_image_url) {
        const urls = linkedImportOrder.receipt_image_url.includes(',')
          ? linkedImportOrder.receipt_image_url.split(',').map((s: string) => s.trim())
          : [linkedImportOrder.receipt_image_url];
        sourceReceiptImages.push(...urls);
        receiptImages.push(...urls);
      }
      if (linkedImportOrder?.receipt_image_urls) {
        sourceReceiptImages.push(...linkedImportOrder.receipt_image_urls);
        receiptImages.push(...linkedImportOrder.receipt_image_urls);
      }
      if (linkedVegetableOrder?.receipt_image_url) {
        const urls = linkedVegetableOrder.receipt_image_url.includes(',')
          ? linkedVegetableOrder.receipt_image_url.split(',').map((s: string) => s.trim())
          : [linkedVegetableOrder.receipt_image_url];
        sourceReceiptImages.push(...urls);
        receiptImages.push(...urls);
      }
      if (linkedVegetableOrder?.receipt_image_urls) {
        sourceReceiptImages.push(...linkedVegetableOrder.receipt_image_urls);
        receiptImages.push(...linkedVegetableOrder.receipt_image_urls);
      }

      const targetProductName = currentOrder?.product_name ? (
        currentOrder.product_name.includes(' - ')
          ? currentOrder.product_name.split(' - ').slice(1).join(' - ').trim().toLowerCase()
          : currentOrder.product_name.trim().toLowerCase()
      ) : null;

      const filterItemImages = (items: MaybeArray<OrderImageRef> | OrderImageRef[]) => {
        const list = Array.isArray(items) ? items : (items ? [items] : []);
        const filtered = targetProductName
          ? list.filter(item => {
              const itemName = item.products?.name?.trim().toLowerCase();
              return !itemName || itemName === targetProductName;
            })
          : list;
        return collectImages(filtered);
      };

      const sourceImportImages = [
        ...filterItemImages(linkedImportOrder?.import_order_items),
        ...filterItemImages(linkedVegetableOrder?.vegetable_order_items)
      ];
      importImages.push(...sourceImportImages);

      [...sourceReceiptImages, ...sourceImportImages].forEach((url) => {
        const normalizedUrl = typeof url === 'string' ? url.trim() : '';
        if (!normalizedUrl || globalNhapSeen.has(normalizedUrl)) return;
        globalNhapSeen.add(normalizedUrl);
        nhapHangImageMeta.push({
          url: normalizedUrl,
          displayDateTime: sourceDisplayDateTime,
          quantity: sourceQuantity != null ? String(sourceQuantity) : '--',
          receiverName: sourceReceiverName,
        });
      });

      const vehiclePlateMap = new Map<string, string>();
      const vehicleBatchTotals = new Map<string, number>();
      (currentOrder?.delivery_vehicles || []).forEach(dv => {
        if (dv.vehicle_id && dv.vehicles?.license_plate) {
          vehiclePlateMap.set(dv.vehicle_id, dv.vehicles.license_plate);
        }

        const batchKey = `${dv.vehicle_id || ''}|${dv.driver_id || ''}|${dv.delivery_date || ''}|${(dv.delivery_time || '').slice(0, 5)}`;
        vehicleBatchTotals.set(batchKey, (vehicleBatchTotals.get(batchKey) || 0) + (Number(dv.assigned_quantity) || 0));
      });

      (currentOrder?.delivery_vehicles || []).forEach((dv) => {
        const plate = dv?.vehicles?.license_plate?.trim();
        const batchKey = `${dv.vehicle_id || ''}|${dv.driver_id || ''}|${dv.delivery_date || ''}|${(dv.delivery_time || '').slice(0, 5)}`;
        const qty = vehicleBatchTotals.get(batchKey) ?? (Number(dv?.assigned_quantity) || 0);
        const pName = currentOrder.product_name.includes(' - ') ? currentOrder.product_name.split(' - ').slice(1).join(' - ') : currentOrder.product_name;
        const vehicleLabel = plate
          ? (qty ? `Xe: ${plate} (${pName}: SL ${qty})` : `Xe: ${plate}`)
          : undefined;

        (dv?.image_urls || []).forEach((u) => pushDeliveryMeta(
          u,
          'vehicle',
          vehicleLabel,
          dv.delivery_date || currentOrder.delivery_date,
          dv.delivery_time || currentOrder.delivery_time,
          currentOrder.product_name,
          null,
          currentOrder.created_at
        ));
      });

      currentOrder?.payment_collections?.forEach(pc => {
        const plate = pc.vehicle_id ? vehiclePlateMap.get(pc.vehicle_id) : undefined;
        const vehicleLabel = plate ? `Thu tiền - Xe: ${plate}` : 'Thu tiền';

        if (pc.image_url) pushDeliveryMeta(
          pc.image_url,
          'payment',
          vehicleLabel,
          currentOrder.delivery_date,
          currentOrder.delivery_time,
          currentOrder.product_name,
          currentOrder.driver_delivered_at,
          currentOrder.created_at
        );
        if (pc.image_urls && Array.isArray(pc.image_urls)) {
          pc.image_urls.forEach((u) => pushDeliveryMeta(
            u,
            'payment',
            vehicleLabel,
            currentOrder.delivery_date,
            currentOrder.delivery_time,
            currentOrder.product_name,
            currentOrder.driver_delivered_at,
            currentOrder.created_at
          ));
        }
      });

      if (currentOrder?.image_url) pushDeliveryMeta(
        currentOrder.image_url,
        'delivery',
        undefined,
        currentOrder.delivery_date,
        currentOrder.delivery_time,
        currentOrder.product_name,
        currentOrder.driver_delivered_at,
        currentOrder.created_at
      );
      if (currentOrder?.image_urls && Array.isArray(currentOrder.image_urls)) {
        currentOrder.image_urls.forEach((u) => pushDeliveryMeta(
          u,
          'delivery',
          undefined,
          currentOrder.delivery_date,
          currentOrder.delivery_time,
          currentOrder.product_name,
          currentOrder.driver_delivered_at,
          currentOrder.created_at
        ));
      }
    });

    receiptImages = [...new Set(receiptImages)];
    importImages = [...new Set(importImages)];
    deliveryImageMeta = deliveryImageMeta.filter(
      (item, idx, arr) => arr.findIndex((x) => x.url === item.url) === idx
    );

    deliveryImages = deliveryImageMeta.map((item) => item.url);

    const firstImport = pickRelation(sourceOrders[0]?.import_orders);
    const firstVeg = pickRelation(sourceOrders[0]?.vegetable_orders);
    orderCode = firstImport?.order_code || firstVeg?.order_code || 'N/A';
    orderLabel = dOrder?.product_name || orderCode;
  } else if (isImport) {
    iOrder = order;
    receiptImages = [];
    if (iOrder.receipt_image_url) {
      if (iOrder.receipt_image_url.includes(',')) {
        receiptImages.push(...iOrder.receipt_image_url.split(',').map((s: string) => s.trim()));
      } else {
        receiptImages.push(iOrder.receipt_image_url);
      }
    }
    if (iOrder.receipt_image_urls) receiptImages.push(...iOrder.receipt_image_urls);
    receiptImages = [...new Set(receiptImages)];

    importImages = [];
    importImages.push(...collectImages(iOrder.import_order_items));
    importImages = [...new Set(importImages)];

    deliveryImages = [];
    deliveryImageMeta = [];
    const pushImportDeliveryMeta = (
      url: string | null | undefined,
      source: 'vehicle' | 'payment' | 'delivery',
      delivery: DeliveryOrderLike,
      vehicleDelivery?: DeliveryVehicleLike
    ) => {
      if (!url || typeof url !== 'string' || !url.trim()) return;
      const plate = vehicleDelivery?.vehicles?.license_plate || delivery.delivery_vehicles?.[0]?.vehicles?.license_plate;
      const vehicleLabel = plate ? `Xe: ${plate}` : undefined;
      const deliveryDate = vehicleDelivery?.delivery_date || delivery.delivery_date;
      const deliveryTime = vehicleDelivery?.delivery_time || delivery.delivery_time;
      const driverDeliveredAt = source === 'vehicle' ? null : delivery.driver_delivered_at;
      
      if (url.includes(',')) {
        url.split(',').forEach((u: string) => {
          const t = u.trim();
          if (t) {
            deliveryImages.push(t);
            deliveryImageMeta.push({ 
              url: t, 
              source, 
              vehicleLabel,
              deliveryDate,
              deliveryTime,
              productName: delivery.product_name,
              driverDeliveredAt,
              createdAt: delivery.created_at
            });
          }
        });
      } else {
        deliveryImages.push(url);
        deliveryImageMeta.push({ 
          url, 
          source, 
          vehicleLabel,
          deliveryDate,
          deliveryTime,
          productName: delivery.product_name,
          driverDeliveredAt,
          createdAt: delivery.created_at
        });
      }
    };

    (iOrder.delivery_orders || []).forEach((doItem) => {
      if (doItem.image_url) pushImportDeliveryMeta(doItem.image_url, 'delivery', doItem);
      if (doItem.image_urls && Array.isArray(doItem.image_urls)) {
        doItem.image_urls.forEach((u: string) => pushImportDeliveryMeta(u, 'delivery', doItem));
      }
      // Also collect from vehicles and payments if they are joined
      (doItem.delivery_vehicles || []).forEach((dv) => {
        (dv.image_urls || []).forEach((u: string) => pushImportDeliveryMeta(u, 'vehicle', doItem, dv));
      });
      (doItem.payment_collections || []).forEach((pc) => {
        if (pc.image_url) pushImportDeliveryMeta(pc.image_url, 'payment', doItem);
        if (pc.image_urls && Array.isArray(pc.image_urls)) {
          pc.image_urls.forEach((u: string) => pushImportDeliveryMeta(u, 'payment', doItem));
        }
      });
    });

    deliveryImages = [...new Set(deliveryImages)];
    deliveryImageMeta = deliveryImageMeta.filter(
      (item, idx, arr) => arr.findIndex((x) => x.url === item.url) === idx
    );
    
    orderCode = iOrder?.order_code || 'N/A';
    orderLabel = iOrder?.supplier_name || iOrder?.sender_name || orderCode;
  } else if (isExport) {
    const eOrder = order;
    deliveryImages = [];
    if (eOrder?.image_url) {
      if (eOrder.image_url.includes(',')) deliveryImages.push(...eOrder.image_url.split(',').map((s: string) => s.trim()));
      else deliveryImages.push(eOrder.image_url);
    }
    if (eOrder?.image_urls && Array.isArray(eOrder.image_urls)) deliveryImages.push(...eOrder.image_urls);
    deliveryImages = [...new Set(deliveryImages)];
    orderCode = eOrder?.id?.slice(0, 8).toUpperCase() || 'N/A';
    orderLabel = eOrder?.product_name || eOrder?.products?.name || 'Xuất hàng';
  }

  /** Ảnh từ phiếu nhập: biên nhận trước, sau đó ảnh từng dòng hàng (trùng URL chỉ giữ lần đầu). */
  const nhapHangImages = isDelivery
    ? nhapHangImageMeta.map((item) => item.url)
    : [...new Set([...receiptImages, ...importImages])];
  const nhanHangImages = deliveryImages;
  const nhanHangImageMeta = deliveryImageMeta;

  if (isImport && iOrder) {
    const rawReceiver = iOrder.receiver_name || iOrder.profiles?.full_name || iOrder.received_by || null;
    const receiverName = rawReceiver && !isUuidLike(rawReceiver) ? rawReceiver : '--';
    const quantity = iOrder.quantity ?? sumItemQuantity(iOrder.import_order_items) ?? null;
    const displayDateTime = formatDateTime(iOrder.order_date, iOrder.order_time, iOrder.created_at);

    nhapHangImages.forEach((url) => {
      nhapHangImageMeta.push({
        url,
        displayDateTime,
        quantity: quantity != null ? String(quantity) : '--',
        receiverName
      });
    });
  }

  if (isDelivery && dOrderForNhapMeta && nhapHangImageMeta.length === 0) {
    const importOrderMeta = pickRelation(dOrderForNhapMeta.import_orders);
    const vegetableOrderMeta = pickRelation(dOrderForNhapMeta.vegetable_orders);

    const rawReceiver = linkedNhapOrder?.receiver_name
      || linkedNhapOrder?.profiles?.full_name
      || linkedNhapOrder?.received_by
      || importOrderMeta?.receiver_name
      || importOrderMeta?.profiles?.full_name
      || vegetableOrderMeta?.receiver_name
      || vegetableOrderMeta?.profiles?.full_name
      || null;
    const receiverName = rawReceiver && !isUuidLike(rawReceiver) ? rawReceiver : '--';

    const quantityValue = linkedNhapOrder?.quantity
      ?? sumItemQuantity(linkedNhapOrder?.import_order_items)
      ?? sumItemQuantity(linkedNhapOrder?.vegetable_order_items)
      ?? dOrderForNhapMeta.total_quantity
      ?? null;

    const displayDateTime = formatDateTime(
      linkedNhapOrder?.order_date || dOrderForNhapMeta.delivery_date,
      linkedNhapOrder?.order_time || dOrderForNhapMeta.delivery_time,
      linkedNhapOrder?.created_at || dOrderForNhapMeta.created_at
    );

    nhapHangImages.forEach((url) => {
      nhapHangImageMeta.push({
        url,
        displayDateTime,
        quantity: quantityValue != null ? String(quantityValue) : '--',
        receiverName
      });
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4">
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/40 backdrop-blur-sm transition-all duration-350 ease-out',
          isClosing ? 'opacity-0' : 'animate-in fade-in duration-300'
        )}
        onClick={onClose}
      />

      {/* Dialog Container */}
      <div
        className={clsx(
          'relative w-full bg-background flex flex-col transition-all duration-350',
          'h-dvh sm:h-auto sm:max-h-[90vh] min-h-0',
          'sm:max-w-[1000px] lg:max-w-[1100px]',
          'rounded-none sm:rounded-3xl shadow-2xl',
          isClosing
            ? 'translate-y-full sm:translate-y-0 sm:scale-95 opacity-0'
            : 'animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300'
        )}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-card border-b border-border flex items-center justify-between shrink-0 sm:rounded-t-3xl shadow-sm z-10 pb-safe-top">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <ImageIcon size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Ảnh đơn hàng
              </h2>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider line-clamp-1 max-w-[250px] sm:max-w-[350px]">
                {orderCode} - {orderLabel}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content: trái = nhập hàng (biên nhận + ảnh dòng), phải = nhận hàng (giao / thu) */}
        <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0 flex flex-col sm:flex-row gap-6 sm:gap-0">
          <div className="flex-1 space-y-3 sm:pr-6 sm:border-r border-border min-w-0">
            <div className="flex items-center gap-2 text-primary font-bold">
              <Package size={18} />
              <span>Nhập hàng ({nhapHangImages.length})</span>
            </div>
            {nhapHangImages.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {nhapHangImages.map((img, idx) => (
                  <div
                    key={`${img}-${idx}`}
                    className="relative bg-muted/50 border border-border rounded-xl overflow-hidden flex flex-col group cursor-pointer aspect-video sm:aspect-square"
                    onClick={() => setFullscreenImage(img)}
                    >
                      <img loading="lazy" decoding="async" src={cloudinaryMedium(img)} alt={`Nhập hàng ${idx + 1}`} className="w-full h-full object-cover" />
                      {(() => {
                        const meta = nhapHangImageMeta[idx] || nhapHangImageMeta.find((m) => m.url === img);
                        const displayDateTime = meta?.displayDateTime || '--';
                        const quantity = meta?.quantity || '--';
                        const receiverName = meta?.receiverName || '--';

                        return (
                          <div className="absolute inset-x-0 bottom-0 p-2 bg-black/60 backdrop-blur-[2px] text-white flex flex-col gap-0.5">
                            <div className="text-[11px] font-bold leading-tight">{displayDateTime}</div>
                            <div className="text-[11px] font-bold leading-tight">SL: {quantity}</div>
                            <div className="text-[11px] font-bold leading-tight">NV Nhận: {receiverName}</div>
                          </div>
                        );
                      })()}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <ZoomIn size={24} className="text-white drop-shadow-lg" />
                      </div>
                    </div>
                ))}
              </div>
            ) : (
              <div className="min-h-[180px] sm:min-h-[200px] bg-muted/50 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-muted-foreground/40 gap-2 px-4">
                <ImageIcon size={40} className="opacity-20" />
                <p className="text-sm font-medium text-center">Chưa có ảnh từ nhập hàng</p>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3 sm:pl-6 min-w-0">
            <div className="flex items-center gap-2 text-orange-500 font-bold">
              <Truck size={18} />
              <span>Nhận hàng ({nhanHangImages.length})</span>
            </div>
            {nhanHangImages.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {nhanHangImages.map((img, idx) => (
                  <div
                    key={`${img}-${idx}`}
                    className="relative bg-muted/50 border border-border rounded-xl overflow-hidden flex flex-col group cursor-pointer aspect-video sm:aspect-square"
                    onClick={() => setFullscreenImage(img)}
                  >
                    <img loading="lazy" decoding="async" src={cloudinaryMedium(img)} alt={`Nhận hàng ${idx + 1}`} className="w-full h-full object-cover" />
                    {(() => {
                      const meta = nhanHangImageMeta[idx];
                      if (!meta) return null;
                      
                      const showMeta = meta.vehicleLabel || meta.deliveryDate || meta.productName;
                      if (!showMeta) return null;

                      return (
                        <div className="absolute inset-x-0 bottom-0 p-2 bg-black/60 backdrop-blur-[2px] text-white flex flex-col gap-0.5">
                          {meta.vehicleLabel && (
                            <div className="text-[11px] font-bold leading-tight">
                              {meta.vehicleLabel}
                            </div>
                          )}
                          {(meta.deliveryDate || meta.deliveryTime) && (
                            <div className="text-[10px] font-medium opacity-90 leading-tight">
                              {(() => {
                                // Priority: driver_delivered_at > delivery_time > created_at fallback
                                if (meta.driverDeliveredAt) {
                                  const d = new Date(meta.driverDeliveredAt);
                                  if (!Number.isNaN(d.getTime())) {
                                    const dd = String(d.getDate()).padStart(2, '0');
                                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                                    const yyyy = d.getFullYear();
                                    const hh = String(d.getHours()).padStart(2, '0');
                                    const min = String(d.getMinutes()).padStart(2, '0');
                                    return `${hh}:${min} ${dd}-${mm}-${yyyy}`;
                                  }
                                }

                                const datePart = meta.deliveryDate ? (() => {
                                  const [y, m, d] = meta.deliveryDate.split('-');
                                  return `${d}-${m}-${y}`;
                                })() : '';

                                if (meta.deliveryTime) {
                                  const timePart = meta.deliveryTime.slice(0, 5);
                                  return `${timePart} ${datePart}`;
                                }

                                if (meta.createdAt) {
                                  const d = new Date(meta.createdAt);
                                  if (!Number.isNaN(d.getTime())) {
                                    const hh = String(d.getHours()).padStart(2, '0');
                                    const min = String(d.getMinutes()).padStart(2, '0');
                                    return `${hh}:${min} ${datePart}`;
                                  }
                                }

                                return datePart;
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ZoomIn size={24} className="text-white drop-shadow-lg" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="min-h-[180px] sm:min-h-[200px] bg-muted/50 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-muted-foreground/40 gap-2 px-4">
                <ImageIcon size={40} className="opacity-20" />
                <p className="text-sm font-medium text-center">Chưa có ảnh nhận hàng</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 sm:p-6 bg-muted/50 border-t border-border shrink-0 sm:rounded-b-3xl pb-safe-bottom">
          <button 
            type="button" 
            onClick={onClose} 
            className="w-full py-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[14px] font-bold transition-all shadow-sm"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* Fullscreen Overlay */}
      {fullscreenImage && (
        <div 
           className="fixed inset-0 z-[10000] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-200"
           onClick={() => setFullscreenImage(null)}
        >
          <button
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-card/10 text-white hover:bg-card/20 transition-colors z-10"
          >
            <X size={20} />
          </button>
          <img loading="lazy" decoding="async"
            src={cloudinaryFull(fullscreenImage)}
            alt="View full"
            className="max-w-[95vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>,
    document.body
  );
};

export default OrderImagesDialog;
