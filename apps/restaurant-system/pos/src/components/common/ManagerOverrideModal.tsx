import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { ManagerOverrideRepository } from '@jamanvaar/database';
import {
  ShieldAlert,
  X,
  Unlock,
  Delete,
  CheckCircle2,
  Lock
} from 'lucide-react';

export const ManagerOverrideModal: React.FC = () => {
  const { pendingOverride, closeOverrideModal, currentUser } = usePosStore();
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (!pendingOverride) return null;

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
      setErrorMessage('');
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
    setErrorMessage('');
  };

  const handleVerify = () => {
    if (pin.length !== 4) return;

    const res = ManagerOverrideRepository.verifyPin(pin);
    if (res.success && res.isManager) {
      const managerName = res.user?.fullName || 'Manager';
      ManagerOverrideRepository.requestOverride({
        action: pendingOverride.action,
        reason: pendingOverride.details || 'Manager authorized sensitive action',
        requestedBy: currentUser?.fullName || 'Cashier',
        approvedBy: managerName
      });

      pendingOverride.onApprove(managerName);
      closeOverrideModal();
    } else {
      setErrorMessage('Authorization failed. Only a Manager or Admin PIN is permitted.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#FAF7F2] border-2 border-amber-500 rounded-3xl max-w-sm w-full p-6 shadow-2xl flex flex-col items-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center mb-3">
          <ShieldAlert className="w-7 h-7 text-amber-600" />
        </div>

        <h2 className="text-base font-extrabold text-[#0B253A] text-center">
          {pendingOverride.title}
        </h2>
        <p className="text-xs text-slate-500 text-center mt-1 mb-4">
          {pendingOverride.details || 'This action requires higher manager credentials.'}
        </p>

        {/* PIN digits indicator */}
        <div className="flex gap-3 mb-4">
          {[0, 1, 2, 3].map((idx) => {
            const filled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-11 h-12 rounded-xl border-2 flex items-center justify-center font-bold text-xl transition-all ${
                  filled
                    ? 'border-amber-600 bg-amber-50 text-amber-900 shadow-xs'
                    : 'border-slate-300 bg-white text-slate-300'
                }`}
              >
                {filled ? '●' : '○'}
              </div>
            );
          })}
        </div>

        {errorMessage && (
          <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg mb-3 text-center">
            {errorMessage}
          </div>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2 w-full mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => {
            const isAction = key === 'C' || key === '⌫';
            return (
              <button
                key={key}
                onClick={() => {
                  if (key === 'C') handleClear();
                  else if (key === '⌫') handleDelete();
                  else handleKeyPress(key);
                }}
                className={`h-11 rounded-xl font-bold text-base flex items-center justify-center keypad-btn border transition-colors ${
                  isAction
                    ? 'bg-slate-100 border-slate-200 text-slate-600'
                    : 'bg-white border-slate-200 text-[#0B253A] hover:border-amber-500'
                }`}
              >
                {key === '⌫' ? <Delete className="w-4 h-4 text-slate-500" /> : key}
              </button>
            );
          })}
        </div>

        <div className="w-full flex gap-2">
          <button
            onClick={handleVerify}
            disabled={pin.length !== 4}
            className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/25 disabled:opacity-50"
          >
            <Unlock className="w-4 h-4" />
            <span>Authorize</span>
          </button>
          <button
            onClick={closeOverrideModal}
            className="px-4 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200"
          >
            Cancel
          </button>
        </div>

        <div className="text-[10px] text-slate-400 mt-3">
          Demo Manager PIN: <strong>5678</strong> • Admin: <strong>9999</strong>
        </div>
      </div>
    </div>
  );
};
