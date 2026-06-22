import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '../../components/shared/PageHeader';
import { useProducts, useCreateProduct, useDeleteProduct, useUpdateProduct } from '../../hooks/queries/useProducts';
import { Database, Box, Plus, X, Trash2, Edit2, ArrowUpDown, Filter, Check } from 'lucide-react';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import ErrorState from '../../components/shared/ErrorState';
import { CustomSelect } from '../../components/shared/CustomSelect';
import { SearchInput } from '../../components/ui/SearchInput';
import { matchesSearch } from '../../lib/str-utils';
import MobileFilterSheet from '../../components/shared/MobileFilterSheet';
import DraggableFAB from '../../components/shared/DraggableFAB';
import toast from 'react-hot-toast';

const InputDialog: React.FC<{
  isOpen: boolean;
  title: string;
  placeholder: string;
  initialName?: string;
  onClose: () => void;
  onSubmit: (data: { name: string, category: string, base_price: number, price_per_weight: number }) => void;
  isSubmitting?: boolean;
}> = ({ isOpen, title, placeholder, initialName = '', onClose, onSubmit, isSubmitting }) => {
  const [val, setVal] = useState(initialName);

  React.useEffect(() => {
    if (isOpen) {
      setVal(initialName);
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted">
          <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:bg-muted p-1.5 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Tên hàng hóa</label>
          <input
            type="text"
            autoFocus
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2.5 mb-3 bg-background border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-foreground"
          />
        </div>
        <div className="px-5 py-4 border-t border-border bg-muted flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-bold text-muted-foreground hover:bg-muted transition-colors">
            Hủy
          </button>
          <button
            disabled={!val.trim() || isSubmitting}
            onClick={() => {
              if (val.trim()) {
                onSubmit({ name: val.trim(), category: 'standard', base_price: 0, price_per_weight: 1 });
                setVal('');
              }
            }}
            className="px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 shadow-sm bg-primary text-white hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:cursor-not-allowed"
          >
            {isSubmitting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Xác nhận
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const ConfirmDialog: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ isOpen, title, message, isLoading, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={isLoading ? undefined : onCancel} />
      <div className="relative bg-card rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted">
          <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
          <button onClick={isLoading ? undefined : onCancel} className="text-muted-foreground hover:bg-muted p-1.5 rounded-full transition-colors disabled:opacity-50">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          <p className="text-[13px] text-foreground">{message}</p>
        </div>
        <div className="px-5 py-4 border-t border-border bg-muted flex items-center justify-end gap-3">
          <button
            disabled={isLoading}
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-[13px] font-bold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            disabled={isLoading}
            onClick={onConfirm}
            className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
          >
            {isLoading && <span className="w-4 h-4 border-2 border-red-500/30 border-t-red-600 rounded-full animate-spin" />}
            Xác nhận
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const ProductSettingsPage: React.FC = () => {
  const { data: products, isLoading: isProductsLoading, isError: isProductsError, refetch: refetchProducts } = useProducts(true, 'standard');

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [productDialog, setProductDialog] = useState<{
    isOpen: boolean,
    initialName?: string,
    mode: 'add' | 'edit',
    editingId?: string
  }>({ isOpen: false, mode: 'add' });

  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'nameAsc' | 'nameDesc'>('nameAsc');

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isFilterClosing, setIsFilterClosing] = useState(false);
  const [draftSortBy, setDraftSortBy] = useState(sortBy);

  React.useEffect(() => {
    if (isFilterOpen) setDraftSortBy(sortBy);
  }, [isFilterOpen, sortBy]);

  const closeFilter = () => {
    setIsFilterClosing(true);
    setTimeout(() => {
      setIsFilterOpen(false);
      setIsFilterClosing(false);
    }, 300);
  };

  const standardProducts = React.useMemo(() => {
    if (!products) return [];
    let p = products;
    if (searchTerm.trim()) {
      p = p.filter((item: any) => matchesSearch(item.name, searchTerm));
    }
    p.sort((a: any, b: any) => {
      if (sortBy === 'nameAsc') return a.name.localeCompare(b.name);
      if (sortBy === 'nameDesc') return b.name.localeCompare(a.name);
      return 0;
    });
    return p;
  }, [products, searchTerm, sortBy]);

  const handleDialogSubmit = async (data: { name: string, category: string, base_price: number, price_per_weight: number }) => {
    if (productDialog.mode === 'edit' && productDialog.editingId) {
      await updateProduct.mutateAsync({ id: productDialog.editingId, data });
      setSelectedProducts([]);
    } else {
      const existingProducts = products || [];
      const duplicate = existingProducts.find(
        p => p.name.toLowerCase().trim() === data.name.toLowerCase().trim()
      );
      if (duplicate) {
        toast.error(`Hàng hóa "${data.name}" đã tồn tại`);
        return;
      }
      await createProduct.mutateAsync({ name: data.name, category: 'standard', base_price: 0, price_per_weight: 1 });
    }
    setProductDialog(prev => ({ ...prev, isOpen: false }));
  };

  const handleToggleProduct = (id: string) => {
    setSelectedProducts(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleDeleteProducts = () => {
    setDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await Promise.all(selectedProducts.map(id => deleteProduct.mutateAsync(id)));
      setSelectedProducts([]);
      setDeleteConfirm(false);
    } catch {
      // Error is handled in the mutation
    } finally {
      setIsDeleting(false);
    }
  };

  const renderProductRow = (p: any) => {
    const isSelected = selectedProducts.includes(p.id);
    return (
      <div
        key={p.id}
        className={`group flex items-center justify-between p-3 rounded-xl border transition-all ${isSelected ? 'bg-blue-50/50 border-blue-200' : 'bg-card border-transparent hover:border-border hover:bg-muted shadow-sm hover:shadow-md'}`}
      >
        <div className="flex items-center gap-3">
          <label className="hidden md:flex items-center justify-center p-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleToggleProduct(p.id)}
              className="w-4 h-4 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </label>
          <div
            className="flex flex-col cursor-pointer"
            onClick={() => setProductDialog({
              isOpen: true,
              initialName: p.name,
              mode: 'edit',
              editingId: p.id
            })}
          >
            <span className="text-[14px] font-bold text-foreground group-hover:text-primary transition-colors">{p.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setProductDialog({
              isOpen: true,
              initialName: p.name,
              mode: 'edit',
              editingId: p.id
            })}
            className="p-1.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Sửa"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => {
              setSelectedProducts([p.id]);
              setDeleteConfirm(true);
            }}
            className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Xóa"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  const isLoading = isProductsLoading;
  const isError = isProductsError;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0 pb-6 relative">
      <PageHeader
        title="Cài đặt hàng tạp hóa"
        description="Quản lý danh sách từ điển hàng tạp hóa trong hệ thống"
        backPath="/app/hang-hoa"
        actions={<div />}
      />

      {/* Floating Action Bar */}
      {selectedProducts.length > 0 && (
        <div className="hidden md:block fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3 bg-slate-800 text-white px-4 py-3 rounded-2xl shadow-2xl border border-white/10">
            <div className="flex items-center gap-2 pr-4 border-r border-border">
              <span className="flex items-center justify-center w-5 h-5 bg-blue-500 rounded-full text-[10px] font-bold text-white">
                {selectedProducts.length}
              </span>
              <span className="text-[13px] font-medium whitespace-nowrap hidden sm:inline">đã chọn</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteProducts}
                className="p-2 bg-red-500/20 hover:bg-red-500/40 text-red-200 rounded-xl transition-colors flex items-center gap-2 px-3"
              >
                <Trash2 size={16} />
                <span className="text-[13px] font-bold">Xóa đã chọn</span>
              </button>
              <button
                onClick={() => setSelectedProducts([])}
                className="ml-2 p-1.5 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                title="Bỏ chọn tất cả"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <LoadingSkeleton type="table" rows={3} />
      ) : isError ? (
        <ErrorState onRetry={refetchProducts} />
      ) : (
        <div className="bg-card rounded-2xl border border-border flex-1 overflow-hidden flex flex-col shadow-sm relative">
          <div className="px-6 py-4 border-b border-border bg-card flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <Database size={18} className="text-primary hidden md:block" />
              <div className="relative w-full md:w-64 flex gap-2">
                <div className="flex-1">
                  <SearchInput
                    placeholder="Tìm hàng hoá..."
                    onSearch={(raw) => setSearchTerm(raw)}
                  />
                </div>
                <button 
                  onClick={() => setIsFilterOpen(true)}
                  className="md:hidden flex items-center justify-center p-2.5 bg-muted border border-border rounded-xl text-foreground hover:bg-muted transition-colors"
                >
                   <Filter size={18} />
                </button>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex items-center gap-2 w-full md:w-auto">
                <ArrowUpDown size={14} className="text-muted-foreground hidden sm:block" />
                <CustomSelect
                  value={sortBy}
                  onChange={val => setSortBy(val as any)}
                  options={[
                    { value: 'nameAsc', label: 'Tên (A-Z)' },
                    { value: 'nameDesc', label: 'Tên (Z-A)' },
                  ]}
                  className="w-full md:w-auto min-w-[160px] bg-muted border-border hover:bg-muted font-medium"
                  align="end"
                />
              </div>
            </div>
          </div>

          <div className="p-6 overflow-y-auto custom-scrollbar bg-muted/50 flex-1">
            <div className="flex flex-col">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
                <h3 className="text-[15px] font-bold text-foreground flex items-center gap-2">
                  <Box size={18} className="text-blue-500" />
                  Hàng tạp hóa
                </h3>
                <span className="text-[12px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full tabular-nums">
                  {standardProducts.length}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 mb-4 flex-1">
                {standardProducts.map((p: any) => renderProductRow(p))}
                {standardProducts.length === 0 && (
                  <div className="py-8 text-center bg-card border border-dashed border-border rounded-xl">
                    <span className="text-[13px] text-muted-foreground italic">Không có kết quả nào.</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setProductDialog({ isOpen: true, mode: 'add' })}
                className="hidden md:flex w-full items-center justify-center gap-2 py-3 mt-auto rounded-xl border-2 border-dashed border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-400 transition-colors text-[13px] font-bold group"
              >
                <Plus size={16} className="group-hover:scale-110 transition-transform" />
                Thêm hàng tạp hóa mới
              </button>
            </div>
          </div>
        </div>
      )}

      <InputDialog
        isOpen={productDialog.isOpen}
        initialName={productDialog.initialName}
        title={productDialog.mode === 'edit' ? "Sửa Hàng Tạp Hóa" : "Thêm Hàng Tạp Hóa Mới"}
        placeholder="VD: Nước mắm, Dầu ăn..."
        onClose={() => setProductDialog(prev => ({ ...prev, isOpen: false }))}
        onSubmit={handleDialogSubmit}
        isSubmitting={createProduct.isPending || updateProduct.isPending}
      />

      <ConfirmDialog
        isOpen={deleteConfirm}
        title="Xóa Hàng Hóa"
        message={`Bạn có chắc chắn muốn xóa ${selectedProducts.length} hàng hóa đã chọn?`}
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm(false)}
      />

      <MobileFilterSheet
        isOpen={isFilterOpen}
        isClosing={isFilterClosing}
        onClose={closeFilter}
        onApply={() => setSortBy(draftSortBy)}
        initialDateFrom=""
        initialDateTo=""
        hideDateFilter={true}
      >
        <div className="space-y-1.5 z-10 w-full mt-2">
          <label className="text-[12px] uppercase tracking-wider font-bold text-muted-foreground">Sắp xếp theo</label>
          <div className="flex flex-col gap-1.5">
            {[
              { value: 'nameAsc', label: 'Tên (A-Z)' },
              { value: 'nameDesc', label: 'Tên (Z-A)' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setDraftSortBy(opt.value as any)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-[13px] font-bold transition-all ${
                  draftSortBy === opt.value
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-card border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <span>{opt.label}</span>
                {draftSortBy === opt.value && <Check size={16} className="text-white" />}
              </button>
            ))}
          </div>
        </div>
      </MobileFilterSheet>

      <DraggableFAB
        icon={<Plus size={22} />}
        onClick={() => setProductDialog({ isOpen: true, mode: 'add' })}
      />
    </div>
  );
};

export default ProductSettingsPage;
