import React from 'react';
import { usePosStore } from '../../store/posStore';
import { AlertCircle, RotateCcw, Trash2, ShoppingBag } from 'lucide-react';

export const CrashRecoveryBanner: React.FC = () => {
  const { recoverableDraft, recoverDraftSession, discardDraftSession } = usePosStore();

  if (!recoverableDraft) return null;

  const itemCount = recoverableDraft.cart?.items?.length || 0;
  const totalAmount = recoverableDraft.cart?.totalPayable || 0;

  return (
    <div className="bg-amber-500 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md z-40 animate-in slide-in-from-top duration-200">
      <div className="flex items-center gap-2.5 text-xs font-semibold">
        <AlertCircle className="w-5 h-5 text-white shrink-0 animate-bounce" />
        <div>
          <span>
            <strong>Unfinished Order Detected:</strong> Found auto-saved session with{' '}
            <strong>{itemCount} items</strong> (₹{totalAmount}){' '}
            {recoverableDraft.selectedTableNumber ? `on Table #${recoverableDraft.selectedTableNumber}` : `(${recoverableDraft.orderType})`}.
          </span>
          <span className="text-[10px] text-amber-100 block">
            Last saved at {new Date(recoverableDraft.updatedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={recoverDraftSession}
          className="px-3 py-1.5 rounded-lg bg-[#0B253A] hover:bg-[#1E3A4C] text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restore Order</span>
        </button>

        <button
          onClick={discardDraftSession}
          className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center gap-1 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Discard</span>
        </button>
      </div>
    </div>
  );
};
