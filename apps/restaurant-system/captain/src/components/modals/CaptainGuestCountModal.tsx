import React, { useEffect, useState } from 'react';
import { useEscapeToClose } from '../useEscapeToClose';
import { guestCountOptions } from '../../store/captainStore';
import { DiningTable } from '@jamanvaar/types';
import { Users, X, ArrowRight, Plus, Minus } from 'lucide-react';

interface CaptainGuestCountModalProps {
  table: DiningTable | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tableNumber: string, guestCount: number) => void;
}

export const CaptainGuestCountModal: React.FC<CaptainGuestCountModalProps> = ({
  table,
  isOpen,
  onClose,
  onConfirm
}) => {
  useEscapeToClose(isOpen, onClose);
  const capacity = Math.max(1, table?.capacity || 4);
  const [guests, setGuests] = useState(Math.min(2, capacity));

  // Each table starts from its own size, not whatever the previous table used (BUG-109).
  useEffect(() => {
    if (isOpen && table) setGuests(Math.min(table.currentGuests || 2, capacity));
  }, [isOpen, table?.id, capacity]);

  if (!isOpen || !table) return null;
  const maxGuests = guestCountOptions(capacity).length;
  const presets = [1, 2, 4, 6, 8].filter((p) => p < maxGuests).concat(maxGuests);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-jaman-border space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-jaman-navy">Open Table {table.tableNumber}</span>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                Seating
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {(table as any).section || table.zone || 'Main Dining'} • Max {table.capacity || 4} Seats
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Guest Count Selector */}
        <div className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border text-center space-y-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Select Number of Guests
          </span>

          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setGuests((g) => Math.max(1, g - 1))}
              className="w-12 h-12 rounded-2xl bg-white border border-jaman-border text-jaman-navy font-black text-lg flex items-center justify-center shadow-xs active:scale-95 transition-all hover:bg-slate-50 cursor-pointer"
            >
              <Minus className="w-5 h-5" />
            </button>
            <div className="w-20 py-2 rounded-2xl bg-white border border-jaman-border shadow-xs">
              <span className="text-3xl font-black font-mono text-jaman-navy">{guests}</span>
            </div>
            <button
              type="button"
              onClick={() => setGuests((g) => Math.min(maxGuests, g + 1))}
              className="w-12 h-12 rounded-2xl bg-white border border-jaman-border text-jaman-navy font-black text-lg flex items-center justify-center shadow-xs active:scale-95 transition-all hover:bg-slate-50 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex items-center justify-center gap-1.5 pt-1">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setGuests(preset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  guests === preset
                    ? 'bg-jaman-saffron text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-jaman-border'
                }`}
              >
                {preset} {preset === 1 ? 'Guest' : 'Guests'}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(table.tableNumber, guests)}
            className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-600/20 transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Seat & Take Order</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
