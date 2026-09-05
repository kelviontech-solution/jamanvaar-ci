import React from 'react';
import { Sparkles } from 'lucide-react';
import { db } from '@jamanvaar/database';

export interface JamanAiFloatingButtonProps {
  onClick: () => void;
  isOpen?: boolean;
  className?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'custom';
}

export const JamanAiFloatingButton: React.FC<JamanAiFloatingButtonProps> = ({
  onClick,
  isOpen = false,
  className = '',
  position = 'bottom-right'
}) => {
  // Check for critical operational issues for dynamic badge
  const kots = db.kots || [];
  const pendingKots = kots.filter((k) => k.status === 'PENDING' || k.status === 'PREPARING');
  const delayedKots = pendingKots.filter((k) => {
    const elapsedMinutes = (Date.now() - new Date(k.createdAt).getTime()) / 60000;
    return elapsedMinutes > 15;
  });

  const inventory = db.inventoryItems || [];
  const lowStockCount = inventory.filter((i) => i.currentStock <= i.reorderLevel).length;

  const hasCritical = delayedKots.length > 0;
  const hasWarning = !hasCritical && lowStockCount > 0;

  const positionClasses = {
    'bottom-right': 'fixed bottom-6 right-6',
    'bottom-left': 'fixed bottom-6 left-6',
    'top-right': 'fixed top-20 right-6',
    custom: ''
  };

  if (isOpen) return null; // hide button when assistant modal is open

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open JAMAN AI Restaurant Intelligence"
      className={`z-40 group flex items-center gap-2 active:scale-95 transition-all select-none cursor-pointer ${
        position !== 'custom' ? positionClasses[position] : ''
      } ${className}`}
      title="JAMAN AI — Offline Restaurant Intelligence"
    >
      {/* Sleek 44-48px Luxury Disc */}
      <div
        className={`h-11 sm:h-12 px-3.5 rounded-full flex items-center gap-2 relative shadow-lg border transition-all duration-200 ${
          hasCritical
            ? 'bg-[#1A0A0A] border-rose-500/80 text-white shadow-rose-900/30'
            : 'bg-[#0B253A] hover:bg-[#123652] border-[#C5A059]/40 hover:border-[#E66817] text-white shadow-[#0B253A]/25 hover:shadow-orange-500/15'
        }`}
        style={{
          boxShadow: '0 4px 16px rgba(11, 37, 58, 0.25), 0 1px 3px rgba(230, 104, 23, 0.15)'
        }}
      >
        {/* Subtle Icon & Ambient Glow */}
        <div className="relative flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-[#E66817] transition-transform duration-300 group-hover:rotate-12" />
          {/* Status Indicator Dot */}
          <span
            className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-[#0B253A] ${
              hasCritical
                ? 'bg-rose-500 animate-pulse'
                : hasWarning
                ? 'bg-amber-400'
                : 'bg-emerald-400'
            }`}
          />
        </div>

        {/* Brand Text Badge */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-black tracking-wider uppercase text-white/95 font-sans">
            JAMAN AI
          </span>
          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-[#E66817]/25 text-[#FFB27A] border border-[#E66817]/40 hidden sm:inline-block">
            ACTIVE
          </span>
        </div>
      </div>
    </button>
  );
};

export default JamanAiFloatingButton;
