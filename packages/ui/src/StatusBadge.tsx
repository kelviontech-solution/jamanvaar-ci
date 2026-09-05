import React from 'react';
import { DietaryType, KioskStatus, OrderStatus } from '@jamanvaar/types';

export interface StatusBadgeProps {
  status: string;
  type?: 'dietary' | 'order' | 'kiosk' | 'generic';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  type = 'generic',
  className = ''
}) => {
  // Dietary indicator
  if (type === 'dietary' || status === 'VEG' || status === 'NON_VEG' || status === 'JAIN') {
    if (status === 'VEG') {
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#ECFDF5] text-[#16A34A] border border-[#A7F3D0] ${className}`}>
          <span className="w-2 h-2 rounded-full bg-[#16A34A]"></span>
          Pure Veg
        </span>
      );
    }
    if (status === 'NON_VEG') {
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] ${className}`}>
          <span className="w-2 h-2 rounded-full bg-[#DC2626]"></span>
          Non-Veg
        </span>
      );
    }
    if (status === 'JAIN') {
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] ${className}`}>
          <span className="w-2 h-2 rounded-full bg-[#B45309]"></span>
          Jain
        </span>
      );
    }
  }

  // Order status badge styles
  const orderStyles: Record<string, { bg: string; text: string; dot: string }> = {
    CONFIRMED: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
    KITCHEN_ACCEPTED: { bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500' },
    PREPARING: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
    READY: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    COLLECTED: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700', dot: 'bg-slate-500' },
    COMPLETED: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    CANCELLED: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
    ONLINE: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    OFFLINE: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
    MAINTENANCE: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
    LOCKED: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', dot: 'bg-red-500' }
  };

  const style = orderStyles[status] || {
    bg: 'bg-gray-50 border-gray-200',
    text: 'text-gray-700',
    dot: 'bg-gray-400'
  };

  const formattedLabel = status.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${style.bg} ${style.text} ${className}`}>
      <span className={`w-2 h-2 rounded-full ${style.dot}`}></span>
      {formattedLabel}
    </span>
  );
};
