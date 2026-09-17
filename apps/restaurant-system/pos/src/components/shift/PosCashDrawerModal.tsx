import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, ShiftRepository } from '@jamanvaar/database';
import {
  X,
  ArrowDownCircle,
  ArrowUpCircle,
  CircleDollarSign,
  CheckCircle2,
  Lock
} from 'lucide-react';

export const PosCashDrawerModal: React.FC = () => {
  const { isCashDrawerModalOpen, setIsCashDrawerModalOpen, currentUser } = usePosStore();
  const [type, setType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');

  if (!isCashDrawerModalOpen) return null;

  const currentShift = ShiftRepository.getActiveShift();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount) || 0;
    if (amt <= 0 || !reason.trim() || !currentShift) return;

    ShiftRepository.addCashMovement(
      currentShift.id,
      type,
      amt,
      reason.trim(),
      currentUser?.fullName || 'Cashier'
    );

    setFeedback(`Recorded ${type === 'CASH_IN' ? 'Cash In' : 'Cash Out'} of ₹${amt}!`);
    setTimeout(() => {
      setFeedback('');
      setIsCashDrawerModalOpen(false);
      setAmount('');
      setReason('');
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-jaman-cream border border-jaman-border rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-jaman-navy text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="w-5 h-5 text-jaman-saffron" />
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Cash In / Cash Out</h2>
              <span className="text-xs text-slate-300">Drawer Movement Audit Entry</span>
            </div>
          </div>

          <button
            onClick={() => setIsCashDrawerModalOpen(false)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold text-center border-b border-emerald-200">
            ✓ {feedback}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-2 bg-slate-200/80 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setType('CASH_IN')}
              className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                type === 'CASH_IN'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-jaman-navy'
              }`}
            >
              <ArrowDownCircle className="w-4 h-4" />
              <span>Cash In (Float)</span>
            </button>

            <button
              type="button"
              onClick={() => setType('CASH_OUT')}
              className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                type === 'CASH_OUT'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-jaman-navy'
              }`}
            >
              <ArrowUpCircle className="w-4 h-4" />
              <span>Cash Out (Expense)</span>
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Amount (₹) *
            </label>
            <input
              type="number"
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 500"
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-base font-mono font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Reason / Purpose *
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Added change coins / Paid milk vendor"
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              className={`w-full py-3.5 rounded-2xl text-white font-extrabold text-xs uppercase tracking-wider shadow-md transition-all ${
                type === 'CASH_IN'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25'
              }`}
            >
              Record {type === 'CASH_IN' ? 'Cash In (+)' : 'Cash Out (-)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
