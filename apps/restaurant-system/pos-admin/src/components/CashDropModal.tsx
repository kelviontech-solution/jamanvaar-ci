import React, { useState } from 'react';
import { ShiftRecord } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { ShiftRepository } from '@jamanvaar/database';

interface CashDropModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift: ShiftRecord | null;
  onSaved: () => void;
}

export const CashDropModal: React.FC<CashDropModalProps> = ({
  isOpen,
  onClose,
  shift,
  onSaved
}) => {
  const [type, setType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_OUT');
  const [amount, setAmount] = useState('500');
  const [reason, setReason] = useState('Mid-shift safe drop to manager');
  const [authorizedBy, setAuthorizedBy] = useState('Manager');

  if (!shift) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;

    ShiftRepository.addCashMovement(
      shift.id,
      type,
      amt,
      reason,
      shift.cashierName || 'Cashier',
      authorizedBy
    );

    onSaved();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cash Drawer In / Out / Safe Drop" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setType('CASH_OUT');
              setReason('Mid-shift safe drop to owner / manager');
            }}
            className={`p-3 rounded-2xl border-2 text-center transition-all ${
              type === 'CASH_OUT'
                ? 'border-rose-500 bg-rose-50 text-rose-900 font-bold'
                : 'border-slate-200 bg-white text-slate-600 font-bold'
            }`}
          >
            <span className="text-xs block">Cash Out / Safe Drop (-)</span>
            <span className="text-[11px] text-slate-500 font-normal">Petty expense or bank drop</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setType('CASH_IN');
              setReason('Additional float change added to drawer');
            }}
            className={`p-3 rounded-2xl border-2 text-center transition-all ${
              type === 'CASH_IN'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold'
                : 'border-slate-200 bg-white text-slate-600 font-bold'
            }`}
          >
            <span className="text-xs block">Cash In / Float (+)</span>
            <span className="text-[11px] text-slate-500 font-normal">Extra cash float added</span>
          </button>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Amount (₹) *</label>
          <input
            type="number"
            min="1"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Reason / Purpose *</label>
          <input
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Milk purchase / change float"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Authorized By</label>
          <input
            type="text"
            required
            value={authorizedBy}
            onChange={(e) => setAuthorizedBy(e.target.value)}
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-brand"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="submit"
            className={`px-4 py-2 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 ${
              type === 'CASH_OUT' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            Record Cash Movement
          </button>
        </div>
      </form>
    </Modal>
  );
};
