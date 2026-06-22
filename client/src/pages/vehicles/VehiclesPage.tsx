import React, { useState } from 'react';
import PageHeader from '../../components/shared/PageHeader';
import { useVehicles, useDeleteVehicle } from '../../hooks/queries/useVehicles';
import { useAuth } from '../../context/AuthContext';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import DraggableFAB from '../../components/shared/DraggableFAB';
import { Plus, Truck, Trash2 } from 'lucide-react';
import AddEditVehicleDialog from './dialogs/AddEditVehicleDialog';
import VehicleDetailsDialog from './dialogs/VehicleDetailsDialog';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import type { Vehicle } from '../../types';

const VehiclesPage: React.FC = () => {
  const { data: vehicles, isLoading, isError, refetch } = useVehicles();
  const deleteVehicle = useDeleteVehicle();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddClosing, setIsAddClosing] = useState(false);
  const [vehicleToEdit, setVehicleToEdit] = useState<Vehicle | null>(null);

  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);

  const openAddEdit = (vehicle?: Vehicle) => {
    setVehicleToEdit(vehicle || null);
    setIsAddOpen(true);
  };

  const closeAddDialog = () => {
    setIsAddClosing(true);
    setTimeout(() => {
      setIsAddOpen(false);
      setIsAddClosing(false);
      setVehicleToEdit(null);
    }, 350);
  };

  const handleEditVehicle = (vehicle: Vehicle) => {
    closeDetail();
    setTimeout(() => {
      openAddEdit(vehicle);
    }, 350); // wait for detail dialog to close before opening edit
  };

  const openDetail = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsDetailOpen(true);
  };

  const closeDetail = () => {
    setIsDetailClosing(true);
    setTimeout(() => {
      setIsDetailOpen(false);
      setIsDetailClosing(false);
      setSelectedVehicle(null);
    }, 350);
  };

  const handleDelete = (vehicle: Vehicle) => {
    setVehicleToDelete(vehicle);
    setIsDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    if (deleteVehicle.isPending) return;
    setIsDeleteConfirmOpen(false);
    setVehicleToDelete(null);
  };

  const confirmDelete = async () => {
    if (!vehicleToDelete?.id) return;
    try {
      await deleteVehicle.mutateAsync(vehicleToDelete.id);
      setIsDeleteConfirmOpen(false);
      setVehicleToDelete(null);
    } catch {
      // Error handled by mutation
    }
  };

  const inferTonnage = (v: Vehicle): number => {
    if (v.load_capacity_ton != null && v.load_capacity_ton > 0) return v.load_capacity_ton;
    if (!v.vehicle_type) return 0;
    const normalized = v.vehicle_type.toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ');
    const tonMatch = normalized.match(/(\d+(?:\.\d+)?)\s*t[aá]n/);
    if (tonMatch?.[1]) { const p = Number(tonMatch[1]); if (Number.isFinite(p)) return p; }
    const numMatch = normalized.match(/(\d+(?:\.\d+)?)/);
    if (numMatch?.[1]) { const p = Number(numMatch[1]); if (Number.isFinite(p)) return p; }
    return 0;
  };

  const columns = [
    { id: 'heavy', label: 'Xe tải lớn', icon: 'bg-blue-500/10 text-blue-600', badge: 'bg-blue-100 text-blue-700', filter: (v: Vehicle) => inferTonnage(v) > 10 },
    { id: 'light', label: 'Xe tải nhỏ', icon: 'bg-emerald-500/10 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700', filter: (v: Vehicle) => inferTonnage(v) <= 10 },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col -mt-2 min-h-0">
      <div className="hidden md:block">
        <PageHeader
          title="Danh sách xe"
          description="Quản lý thông tin xe theo loại"
          backPath="/app/quan-ly-xe"
          actions={
            <button
              onClick={() => openAddEdit()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95"
            >
              <Plus size={16} />
              Thêm xe
            </button>
          }
        />
      </div>
      <DraggableFAB icon={<Plus size={24} />} onClick={() => openAddEdit()} />

      {isLoading ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-6 custom-scrollbar px-1">
          <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4 lg:gap-6 lg:min-h-full">
            {[1, 2].map((i) => (
              <div key={i} className="w-full flex flex-col bg-slate-100/50 border border-slate-200 rounded-[24px] p-4 min-h-[150px] lg:min-h-[500px]">
                {/* Column Header Skeleton */}
                <div className="flex items-center gap-2.5 mb-5 px-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-200 animate-pulse" />
                  <div className="h-4 bg-slate-200 rounded-lg w-24 animate-pulse" />
                </div>

                {/* Column Content Skeleton */}
                <div className="flex flex-col gap-3 flex-1">
                  {[1, 2].map((j) => (
                    <div key={j} className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-slate-50" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-slate-100 rounded-lg w-3/4" />
                          <div className="h-3 bg-slate-100 rounded-lg w-1/2" />
                        </div>
                      </div>
                      <div className="pt-3.5 border-t border-slate-50 flex items-center gap-2">
                         <div className="w-6 h-6 rounded-full bg-slate-50" />
                         <div className="h-3 bg-slate-50 rounded-lg w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !vehicles?.length ? (
        <EmptyState title="Chưa có xe nào" />
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-6 custom-scrollbar px-1">
          <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4 lg:gap-6 lg:min-h-full">
            {columns.map((column) => {
              const columnVehicles = vehicles.filter(column.filter);

              return (
                <div key={column.id} className="w-full flex flex-col bg-slate-100 border border-slate-200 rounded-[24px] p-4 min-h-[150px] lg:min-h-[500px]">
                  {/* Column Header */}
                  <div className="flex items-center justify-between mb-5 px-1">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${column.icon.split(' ')[1].replace('text-', 'bg-')}`} />
                      <h3 className="font-extrabold text-[15px] text-slate-800 tracking-tight">{column.label}</h3>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm ${column.badge}`}>
                        {columnVehicles.length}
                      </span>
                    </div>
                  </div>

                  {/* Column Content */}
                  <div className="flex flex-col gap-3 flex-1">
                    {columnVehicles.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white/50">
                        <p className="text-[12px] text-slate-400 italic font-medium">Chưa có xe</p>
                      </div>
                    ) : (
                      columnVehicles.map((v) => (
                        <div
                          key={v.id}
                          onClick={() => openDetail(v)}
                          className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_4px_rgba(0,0,0,0.02)] p-4 hover:shadow-lg hover:border-primary/20 hover:-translate-y-1 transition-all duration-300 cursor-pointer group relative"
                        >
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(v);
                              }}
                              disabled={deleteVehicle.isPending}
                              className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 opacity-100 md:opacity-0 md:group-hover:opacity-100 z-10"
                              title="Xóa xe"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          <div className="flex items-center gap-3 mb-4">
                            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${column.icon}`}>
                              <Truck size={22} />
                            </div>
                            <div>
                              <h3 className="text-[15px] font-extrabold text-slate-900 group-hover:text-primary transition-colors">
                                {v.license_plate}
                              </h3>
                              {v.vehicle_type && (
                                <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">
                                  {v.vehicle_type}
                                </p>
                              )}
                            </div>
                          </div>

                          {v.profiles ? (
                            <div className="flex items-center justify-between pt-3.5 border-t border-slate-100">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[11px] font-bold text-slate-700 shadow-sm">
                                  {v.profiles.full_name?.charAt(0)}
                                </div>
                                <span className="text-[12px] font-semibold text-slate-600">{v.profiles.full_name}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="pt-3.5 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-2 italic">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                              Chưa có tài xế
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AddEditVehicleDialog
        vehicle={vehicleToEdit}
        isOpen={isAddOpen}
        isClosing={isAddClosing}
        onClose={closeAddDialog}
      />

      <VehicleDetailsDialog
        vehicle={selectedVehicle}
        isOpen={isDetailOpen}
        isClosing={isDetailClosing}
        onClose={closeDetail}
        onEdit={handleEditVehicle}
      />

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="Xóa xe"
        message={`Bạn có chắc chắn muốn xóa xe "${vehicleToDelete?.license_plate}"?`}
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        variant="danger"
        isLoading={deleteVehicle.isPending}
        onConfirm={confirmDelete}
        onCancel={closeDeleteConfirm}
      />
    </div>
  );
};

export default VehiclesPage;
