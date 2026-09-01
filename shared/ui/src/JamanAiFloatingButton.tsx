import React from 'react';
import { Sparkles, Flame, AlertTriangle } from 'lucide-react';
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
    'bottom-right': 'fixed bottom-14 right-4 sm:bottom-16 sm:right-6',
    'bottom-left': 'fixed bottom-14 left-4 sm:bottom-16 sm:left-6',
    'top-right': 'fixed top-20 right-4 sm:top-24 sm:right-6',
    custom: ''
  };

  if (isOpen) return null; // hide button when panel is open

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open JAMAN AI Restaurant Intelligence"
      className={`z-40 group flex flex-col items-center justify-center gap-1 active:scale-95 transition-all select-none cursor-pointer ${
        position !== 'custom' ? positionClasses[position] : ''
      } ${className}`}
      title="JAMAN AI — Offline Restaurant Intelligence"
    >
      {/* Circular Floating Button */}
      <div
        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center relative shadow-xl border-2 transition-all ${
          hasCritical
            ? 'bg-rose-950 border-rose-500 text-white shadow-rose-900/40 animate-pulse'
            : 'bg-[#0B253A] hover:bg-[#163E5E] border-[#E66817] text-white shadow-[#0B253A]/30 hover:shadow-orange-500/20'
        }`}
        style={{
          boxShadow: '0 8px 24px rgba(11, 37, 58, 0.35), 0 2px 6px rgba(230, 104, 23, 0.2)'
        }}
      >
        {/* Glow Ring */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#E66817]/20 to-amber-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Center Sparkle / AI Icon */}
        <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-[#E66817] group-hover:scale-110 transition-transform" />

        {/* Dynamic Critical Alert Badge */}
        {hasCritical && (
          <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full border-2 border-white flex items-center gap-0.5 shadow-sm">
            <Flame className="w-3 h-3 fill-white" />
            <span>{delayedKots.length}</span>
          </span>
        )}

        {/* Dynamic Warning Alert Badge */}
        {hasWarning && (
          <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full border-2 border-white flex items-center gap-0.5 shadow-sm">
            <AlertTriangle className="w-3 h-3 fill-white" />
            <span>{lowStockCount}</span>
          </span>
        )}
      </div>

      {/* Label Pill */}
      <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#0B253A] bg-white/95 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-[#EBE6DD] shadow-xs group-hover:border-[#E66817] transition-colors">
        JAMAN AI
      </span>
    </button>
  );
};
