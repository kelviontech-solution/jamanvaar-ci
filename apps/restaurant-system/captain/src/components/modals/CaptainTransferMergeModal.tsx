import React, { useState } from 'react';
import { useCaptainStore } from '../../store/captainStore';
import { DiningTable } from '@jamanvaar/types';
import { X, ArrowRight, GitMerge, RotateCcw, Check } from 'lucide-react';

interface CaptainTransferMergeModalProps {
  currentTable: DiningTable | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CaptainTransferMergeModal: React.FC<CaptainTransferMergeModalProps> = ({
  currentTable,
  isOpen,
  onClose
}) => {
  if (!isOpen || !currentTable) return null;

  const { tables, transferTable, mergeTables } = useCaptainStore();

  const [mode, setMode] = useState<'TRANSFER' | 'MERGE'>('TRANSFER');
  const [targetTableNumber, setTargetTableNumber] = useState<string>('');

  const otherTables = tables.filter((t) => t.tableNumber !== currentTable.tableNumber);

  const handleAction = () => {
    if (!targetTableNumber) return;
    if (mode === 'TRANSFER') {
      transferTable(currentTable.tableNumber, targetTableNumber);
    } else {
      mergeTables(currentTable.tableNumber, targetTableNumber);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-[#EBE6DD] space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-[#E66817]" />
            <h3 className="text-lg font-black text-[#0B253A]">
              {mode === 'TRANSFER' ? 'Transfer Table' : 'Merge Tables'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#FAF7F2] border border-[#EBE6DD]">
          <button
            type="button"
            onClick={() => {
              setMode('TRANSFER');
              setTargetTableNumber('');
            }}
            className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              mode === 'TRANSFER' ? 'bg-[#0B253A] text-white shadow-xs' : 'text-slate-600 hover:text-[#0B253A]'
            }`}
          >
            Transfer Order
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('MERGE');
              setTargetTableNumber('');
            }}
            className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              mode === 'MERGE' ? 'bg-[#0B253A] text-white shadow-xs' : 'text-slate-600 hover:text-[#0B253A]'
            }`}
          >
            Merge 2 Tables
          </button>
        </div>

        <p className="text-xs text-slate-500 font-medium">
          {mode === 'TRANSFER'
            ? `Move Table ${currentTable.tableNumber}'s active order to an available destination table.`
            : `Combine Table ${currentTable.tableNumber}'s bill and seated guests with another dining table.`}
        </p>

        {/* Target Table Selector */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            Select Destination Table:
          </label>
          <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
            {otherTables.map((t) => {
              const isSelected = targetTableNumber === t.tableNumber;
              const isAvail = t.status === 'AVAILABLE';

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTargetTableNumber(t.tableNumber)}
                  className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#E66817] text-white border-[#E66817] shadow-sm'
                      : isAvail
                      ? 'bg-white hover:bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="text-xs font-black block">T-{t.tableNumber}</span>
                  <span className={`text-[9px] font-bold block ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                    {t.status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAction}
            disabled={!targetTableNumber}
            className="py-3 rounded-xl bg-[#E66817] hover:bg-[#EA580C] disabled:opacity-50 text-white font-black text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
          >
            <span>Confirm {mode === 'TRANSFER' ? 'Transfer' : 'Merge'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
