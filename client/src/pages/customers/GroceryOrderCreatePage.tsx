import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ImagePlus, Loader2, Package, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import ErrorState from '../../components/shared/ErrorState';
import { DatePicker } from '../../components/shared/DatePicker';
import { TimePicker24h } from '../../components/shared/TimePicker24h';
import { useAuth } from '../../context/AuthContext';
import { useCustomerByUserId, useCreateMyOrder } from '../../hooks/queries/useCustomers';
import { useMyPermissions } from '../../hooks/queries/useRoles';
import { uploadApi } from '../../api/uploadApi';
import { cloudinarySmall } from '../../lib/cloudinaryUrl';
import type { Customer } from '../../types';

const CUSTOMER_ORDER_CREATE_PATH = '/tai-khoan/don-hang/tao-don';
const LIST_PATH = '/don-hang-cua-toi';

const getToday = () => new Date().toISOString().slice(0, 10);
const getCurrentTime = () => new Date().toTimeString().slice(0, 5);

const createInitialItem = (): CustomerOrderItemForm => ({
  product_name: '',
  package_type: '',
  item_note: '',
  quantity: '1',
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

type GroceryCreateMode = 'sender' | 'receiver';

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
  product_name: string;
  package_type: string;
  item_note: string;
  quantity: string;
  image_url: string | null;
  image_urls: string[];
};

const requiredCustomerTypeByMode: Record<GroceryCreateMode, Customer['customer_type']> = {
  sender: 'grocery_sender',
  receiver: 'grocery_receiver',
};

const pageCopy = {
  sender: {
    title: 'Tạo đơn gửi tạp hóa',
    description: 'Nhập thông tin người nhận, cước SG và danh sách hàng cần gửi.',
    badge: 'Khách gửi tạp hóa',
    heroTitle: 'Tạo đơn gửi nhanh, rõ người nhận và mặt hàng',
    heroDescription: 'Form được tách thành trang riêng để dễ nhập nhiều dòng hàng, thêm ảnh và kiểm tra trước khi gửi.',
    lockedNameLabel: 'Người gửi',
    partnerLabel: 'Người nhận',
    amountLabel: 'Cước SG',
    itemsTitle: 'Danh sách hàng gửi',
    itemsDescription: 'Thêm từng mặt hàng, số lượng và ảnh minh chứng nếu cần.',
    itemImageLabel: 'Ảnh hàng',
    noteLabel: 'Ghi chú đơn hàng',
    fallbackNotes: 'Đơn hàng khách gửi tạp hóa',
    submitLabel: 'Tạo đơn hàng',
    success: 'Đã tạo đơn gửi tạp hóa',
  },
  receiver: {
    title: 'Tạo đơn đổi trả tạp hóa',
    description: 'Tạo phiếu trả hàng lỗi về lại SG cho khách nhận tạp hóa.',
    badge: 'Khách nhận tạp hóa',
    heroTitle: 'Ghi nhận đổi trả đầy đủ ảnh và lý do',
    heroDescription: 'Trang riêng giúp khách nhận nhập hàng lỗi cần trả, kèm số lượng, ảnh lỗi và ghi chú xử lý.',
    lockedNameLabel: 'Khách nhận',
    partnerLabel: 'Người gửi / điểm nhận lại',
    amountLabel: 'Cước SG',
    itemsTitle: 'Hàng lỗi cần trả',
    itemsDescription: 'Mỗi dòng là một mặt hàng đổi trả, có thể đính kèm nhiều ảnh lỗi.',
    itemImageLabel: 'Ảnh hàng lỗi',
    noteLabel: 'Lý do trả hàng / ghi chú',
    fallbackNotes: 'Đơn trả hàng lỗi về lại SG',
    submitLabel: 'Tạo đơn trả hàng',
    success: 'Đã tạo đơn đổi trả tạp hóa',
  },
} as const;

const GroceryOrderCreatePage: React.FC<{ mode: GroceryCreateMode }> = ({ mode }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: customer, isLoading: loadingCustomer, isError, refetch } = useCustomerByUserId(user?.id || '');
  const { data: myPermissions, isLoading: loadingPermissions } = useMyPermissions(!!user?.id);
  const createOrderMutation = useCreateMyOrder();
  const [formState, setFormState] = useState<FormState>(() => createInitialFormState());
  const [uploadingItemIndex, setUploadingItemIndex] = useState<number | null>(null);
  const copy = pageCopy[mode];

  const canSelfCreate = (myPermissions?.page_paths || []).includes(CUSTOMER_ORDER_CREATE_PATH);
  const expectedCustomerType = requiredCustomerTypeByMode[mode];
  const isExpectedCustomer = customer?.customer_type === expectedCustomerType;
  const isSubmitting = createOrderMutation.isPending;

  const totals = useMemo(() => {
    const quantity = formState.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const images = formState.items.reduce((sum, item) => sum + item.image_urls.length, 0);
    return { lines: formState.items.length, quantity, images };
  }, [formState.items]);

  const updateItem = (index: number, patch: Partial<CustomerOrderItemForm>) => {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const addItem = () => setFormState((prev) => ({ ...prev, items: [...prev.items, createInitialItem()] }));

  const removeItem = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, itemIndex) => itemIndex !== index) : prev.items,
    }));
  };

  const uploadFiles = async (files: File[]) => {
    const invalidFile = files.find((file) => !file.type.startsWith('image/'));
    if (invalidFile) {
      toast.error('Chỉ hỗ trợ file ảnh');
      return [];
    }

    const results = await Promise.all(files.map((file) => uploadApi.uploadFile(file, 'import-orders', 'items')));
    return results.map((result) => result.url);
  };

  const handleItemUpload = async (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    try {
      setUploadingItemIndex(index);
      const newUrls = await uploadFiles(files);
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

    if (!canSelfCreate) {
      toast.error('Bạn chưa có quyền tự tạo đơn');
      return;
    }

    if (!isExpectedCustomer) {
      toast.error('Tài khoản không đúng loại khách cho trang này');
      return;
    }

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

    await createOrderMutation.mutateAsync({
      order_date: formState.order_date || undefined,
      order_time: formState.order_time || undefined,
      sender_name: customer?.name || formState.sender_name || undefined,
      receiver_name: formState.receiver_name || undefined,
      receiver_phone: formState.receiver_phone || undefined,
      receiver_address: formState.receiver_address || undefined,
      status: 'processing' as const,
      payment_status: formState.payment_status,
      total_amount: formState.total_amount ? Number(formState.total_amount) : undefined,
      notes: formState.notes || copy.fallbackNotes,
      is_custom_amount: true,
      order_category: 'standard',
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
    });

    toast.success(copy.success);
    navigate(LIST_PATH);
  };

  if (loadingCustomer || loadingPermissions) {
    return (
      <div className="w-full flex-1">
        <PageHeader title={copy.title} description={copy.description} />
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const formDisabled = !canSelfCreate || !isExpectedCustomer || isSubmitting;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 bg-slate-50/70 -m-4 p-4 md:-m-6 md:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <PageHeader title={copy.title} description={copy.description} />

        <button
          type="button"
          onClick={() => navigate(LIST_PATH)}
          className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-bold text-slate-700 shadow-sm transition-colors duration-200 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <ArrowLeft size={16} />
          Quay lại danh sách
        </button>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form onSubmit={handleSubmit} className="overflow-hidden rounded-3xl border border-border bg-white shadow-sm">
            <div className="border-b border-border bg-gradient-to-br from-blue-50 via-white to-orange-50 px-5 py-5 md:px-7">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1 text-[12px] font-black text-blue-700 shadow-sm">
                    <ShieldCheck size={14} />
                    {copy.badge}
                  </div>
                  <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">{copy.heroTitle}</h2>
                  <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">{copy.heroDescription}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/80 bg-white/80 p-2 shadow-sm md:min-w-[280px]">
                  <Metric label="Dòng" value={totals.lines.toLocaleString('vi-VN')} />
                  <Metric label="SL" value={totals.quantity.toLocaleString('vi-VN')} />
                  <Metric label="Ảnh" value={totals.images.toLocaleString('vi-VN')} />
                </div>
              </div>
            </div>

            {(!canSelfCreate || !isExpectedCustomer) && (
              <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 md:px-7">
                {!canSelfCreate ? 'Bạn chưa có quyền tự tạo đơn.' : 'Trang này chỉ dành cho đúng loại khách tạp hóa tương ứng.'}
              </div>
            )}

            <div className="space-y-7 p-5 md:p-7">
              <Section title="Thông tin đơn" description="Ngày, giờ và thông tin đối tác nhận/gửi hàng.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <DateField label="Ngày đơn" value={formState.order_date} onChange={(value) => setFormState((prev) => ({ ...prev, order_date: value }))} />
                  <TimeField label="Giờ đơn" value={formState.order_time} onChange={(value) => setFormState((prev) => ({ ...prev, order_time: value }))} />
                </div>
                <Input label={copy.lockedNameLabel} value={customer?.name || formState.sender_name} onChange={() => undefined} disabled required />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input label={copy.partnerLabel} value={formState.receiver_name} onChange={(value) => setFormState((prev) => ({ ...prev, receiver_name: value }))} required />
                  <Input label="Số điện thoại" value={formState.receiver_phone} onChange={(value) => setFormState((prev) => ({ ...prev, receiver_phone: value }))} />
                </div>
                <Input label="Địa chỉ" value={formState.receiver_address} onChange={(value) => setFormState((prev) => ({ ...prev, receiver_address: value }))} placeholder="Nhập địa chỉ giao/nhận nếu có" />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input label={copy.amountLabel} type="number" min={0} value={formState.total_amount} onChange={(value) => setFormState((prev) => ({ ...prev, total_amount: value }))} placeholder="Nhập cước nếu biết" />
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-slate-600">Trạng thái thanh toán</label>
                    <select
                      value={formState.payment_status}
                      onChange={(event) => setFormState((prev) => ({ ...prev, payment_status: event.target.value as FormState['payment_status'] }))}
                      className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition-colors duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="unpaid">Chưa thanh toán</option>
                      <option value="paid">Đã thanh toán</option>
                    </select>
                  </div>
                </div>
              </Section>

              <Section
                title={copy.itemsTitle}
                description={copy.itemsDescription}
                action={
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] font-black text-blue-700 transition-colors duration-200 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <Plus size={14} />
                    Thêm dòng
                  </button>
                }
              >
                <div className="space-y-3">
                  {formState.items.map((item, index) => (
                    <div key={index} className="rounded-2xl border border-border bg-slate-50/70 p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white text-sm font-black text-blue-700 shadow-sm">{index + 1}</div>
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          disabled={formState.items.length === 1}
                          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-red-100 bg-white text-red-600 transition-colors duration-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Xóa dòng"
                          aria-label="Xóa dòng hàng"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(220px,1fr)_120px]">
                        <Input label="Mặt hàng" value={item.product_name} onChange={(value) => updateItem(index, { product_name: value })} placeholder="Nhập tên mặt hàng" required />
                        <Input label="Số lượng" type="number" min={1} value={item.quantity} onChange={(value) => updateItem(index, { quantity: value })} required />
                      </div>
                      <div className="mt-4">
                        <Input label="Ghi chú dòng hàng" value={item.package_type} onChange={(value) => updateItem(index, { package_type: value })} placeholder="Quy cách, lý do lỗi, lưu ý xử lý" />
                      </div>
                      <div className="mt-4">
                        <ImagePicker label={copy.itemImageLabel} urls={item.image_urls} isUploading={uploadingItemIndex === index} onUpload={(event) => handleItemUpload(index, event)} onRemove={(imageIndex) => removeItemImage(index, imageIndex)} />
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Ghi chú cuối" description="Bổ sung thông tin để nhân viên xử lý đúng yêu cầu.">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-600">{copy.noteLabel}</label>
                  <textarea
                    rows={4}
                    value={formState.notes}
                    onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition-colors duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Nhập ghi chú nếu có"
                  />
                </div>
              </Section>
            </div>

            <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-white/95 px-5 py-4 backdrop-blur md:flex-row md:items-center md:justify-end md:px-7">
              <button
                type="button"
                onClick={() => navigate(LIST_PATH)}
                className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-border px-4 py-2.5 text-[13px] font-bold text-slate-700 transition-colors duration-200 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={formDisabled}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-[13px] font-black text-white shadow-sm transition-colors duration-200 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {copy.submitLabel}
              </button>
            </div>
          </form>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Package size={22} />
              </div>
              <h3 className="mt-4 text-lg font-black text-slate-950">Kiểm tra trước khi gửi</h3>
              <ul className="mt-3 space-y-3 text-sm font-medium text-slate-600">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} />Tên hàng và số lượng đã đúng.</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} />Ảnh rõ mặt hàng hoặc lỗi cần xử lý.</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} />Thông tin người nhận có thể liên hệ được.</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5 text-sm font-semibold leading-6 text-blue-900">
              Sau khi tạo, đơn sẽ xuất hiện ở tab “Ở SG” để theo dõi trạng thái giao hàng và cước phí.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; description: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, description, action, children }) => (
  <section className="space-y-4">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h3 className="text-base font-black text-slate-950">{title}</h3>
        <p className="mt-1 text-[13px] font-medium leading-5 text-slate-600">{description}</p>
      </div>
      {action}
    </div>
    <div className="space-y-4">{children}</div>
  </section>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 px-3 py-2 text-center">
    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-0.5 text-lg font-black text-slate-950">{value}</div>
  </div>
);

const DateField: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <div className="space-y-1.5">
    <label className="text-[12px] font-bold text-slate-600">{label}</label>
    <DatePicker value={value} onChange={onChange} className="bg-white" />
  </div>
);

const TimeField: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <div className="space-y-1.5">
    <label className="text-[12px] font-bold text-slate-600">{label}</label>
    <TimePicker24h value={value} onChange={onChange} className="bg-white" />
  </div>
);

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
    <label className="text-[12px] font-bold text-slate-600">{label}</label>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      type={type}
      required={required}
      min={min}
      disabled={disabled}
      placeholder={placeholder}
      className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition-colors duration-200 placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
    />
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
    <label className="text-[12px] font-bold text-slate-600">{label}</label>
    <div className="flex flex-wrap gap-2">
      {urls.map((url, index) => (
        <div key={`${url}-${index}`} className="relative h-20 w-20 overflow-hidden rounded-2xl border border-border bg-slate-100">
          <img loading="lazy" decoding="async" src={cloudinarySmall(url)} alt={label} className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="absolute right-1 top-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-red-600 text-white shadow-sm transition-colors duration-200 hover:bg-red-700"
            aria-label="Xóa ảnh"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <label className="inline-flex h-20 w-20 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-blue-300 bg-white text-blue-700 transition-colors duration-200 hover:border-blue-500 hover:bg-blue-50">
        <input type="file" accept="image/*" multiple className="hidden" onChange={onUpload} />
        {isUploading ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
      </label>
    </div>
  </div>
);

export default GroceryOrderCreatePage;
