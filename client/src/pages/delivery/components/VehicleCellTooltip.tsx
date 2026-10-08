import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { Truck } from 'lucide-react';
import type { DeliveryVehicle, Vehicle } from '../../../types';

const formatNumber = (val?: number) => {
  if (val == null) return '0';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val);
};

interface Props {
  dv: DeliveryVehicle;
  vehicle: Vehicle;
  qty: number;
  isPaid: boolean;
  exportPaid?: boolean;
  children: React.ReactNode;
}

const TooltipContent: React.FC<{ dv: DeliveryVehicle; vehicle: Vehicle; qty: number; isPaid: boolean; exportPaid?: boolean; style: React.CSSProperties }> = ({
  dv, vehicle, qty, isPaid, exportPaid, style,
}) => {
  const driverName = dv.profiles?.full_name || vehicle.profiles?.full_name || vehicle.responsible_profile?.full_name;

  return (
  <div
    className="fixed z-[9999] pointer-events-none"
    style={style}
  >
    <div className="bg-popover border border-border rounded-xl shadow-xl p-3 min-w-[190px] text-left">
      <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-border">
        <Truck size={13} className="text-blue-500 shrink-0" />
        <span className="text-[12px] font-black text-foreground">{vehicle.license_plate}</span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-muted-foreground font-medium">Số lượng</span>
          <span className="text-[12px] font-black text-blue-600 dark:text-blue-400 tabular-nums">{formatNumber(qty)}</span>
        </div>
        {dv.expected_amount != null && dv.expected_amount > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-muted-foreground font-medium">Tiền dự kiến</span>
            <span className="text-[11px] font-bold text-foreground tabular-nums">
              {new Intl.NumberFormat('vi-VN').format(dv.expected_amount)}đ
            </span>
          </div>
        )}
        {driverName && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-muted-foreground font-medium">Tài xế</span>
            <span className="text-[11px] font-bold text-foreground">{driverName}</span>
          </div>
        )}
        {dv.loader_name && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-muted-foreground font-medium">Lơ xe</span>
            <span className="text-[11px] font-bold text-foreground">{dv.loader_name}</span>
          </div>
        )}
        {dv.delivery_date && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-muted-foreground font-medium">Ngày giao</span>
            <span className="text-[11px] font-bold text-foreground tabular-nums">
              {new Date(dv.delivery_date).toLocaleDateString('vi-VN')}
              {dv.delivery_time ? ` ${dv.delivery_time.slice(0, 5)}` : ''}
            </span>
          </div>
        )}
        {exportPaid != null && (
          <div className="flex items-center justify-between gap-3 mt-0.5">
            <span className="text-[10px] text-muted-foreground font-medium">Thanh toán PX</span>
            <span className={clsx(
              "text-[10px] font-black px-1.5 py-0.5 rounded-md",
              exportPaid ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400"
            )}>
              {exportPaid ? 'Đã TT' : 'Chưa TT'}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 mt-0.5">
          <span className="text-[10px] text-muted-foreground font-medium">Thu tiền</span>
          <span className={clsx(
            "text-[10px] font-black px-1.5 py-0.5 rounded-md",
            isPaid ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-red-500/10 text-red-700 dark:text-red-400"
          )}>
            {isPaid ? 'Đã thu' : 'Chưa thu'}
          </span>
        </div>
      </div>
    </div>
      <div className="w-2.5 h-2.5 bg-popover border-b border-r border-border rotate-45 mx-auto -mt-1.5 relative z-10" />
  </div>
  );
};

export const VehicleCellTooltip: React.FC<Props> = ({ dv, vehicle, qty, isPaid, exportPaid, children }) => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const tooltipWidth = 190;
    const padding = 8;

    let left = rect.left + window.scrollX + rect.width / 2;
    const viewportWidth = window.innerWidth;

    if (left + tooltipWidth / 2 > viewportWidth - padding) {
      left = viewportWidth - tooltipWidth / 2 - padding;
    }
    if (left - tooltipWidth / 2 < padding) {
      left = tooltipWidth / 2 + padding;
    }

    setPos({
      top: rect.top + window.scrollY - 8,
      left,
    });
    setVisible(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="inline-flex flex-col items-center justify-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {visible && createPortal(
        <TooltipContent
          dv={dv}
          vehicle={vehicle}
          qty={qty}
          isPaid={isPaid}
          exportPaid={exportPaid}
          style={{
            top: pos.top,
            left: pos.left,
            transform: 'translate(-50%, -100%)',
          }}
        />,
        document.body
      )}
    </div>
  );
};
