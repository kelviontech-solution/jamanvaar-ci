import React from 'react';
import { usePosStore } from '../../store/posStore';
import { db } from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';
import { Zap, X, Check, Banknote, QrCode, CreditCard, Wallet, Building2 } from 'lucide-react';
import { PaymentMethod } from '@jamanvaar/types';

export const PosInstantBillConfirmationModal: React.FC = () => {
  const {
    isInstantBillConfirmationOpen,
    setIsInstantBillConfirmationOpen,
    executeInstantBill,
    isInstantBillProcessing,
    cart,
    selectedTable
  } = usePosStore();

  if (!isInstantBillConfirmationOpen) return null;

  const cfg = db.restaurant?.instantBillConfig || {
    enabled: true,
    paymentMethod: 'CASH',
    autoPrint: true,
    defaultOrderType: 'TAKEAWAY'
  };

  const paymentLabel =
    cfg.paymentMethod === 'CASH'
      ? 'Cash at Counter'
      : cfg.paymentMethod === 'UPI_QR'
      ? 'UPI / Bharat QR'
      : cfg.paymentMethod === 'CARD'
      ? 'Credit / Debit Card'
      : cfg.paymentMethod === 'WALLET'
      ? 'Digital Wallet'
      : 'House Account';

  const handleConfirm = (method?: PaymentMethod) => {
    executeInstantBill(method || cfg.paymentMethod || 'CASH');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in">
      <div className="bg-white border-2 border-jaman-border rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-100 text-amber-900 rounded-xl flex items-center justify-center">
              <Zap className="w-4 h-4 text-jaman-saffron fill-jaman-saffron" />
            </div>
            <div>
              <h3 className="text-sm font-black text-jaman-navy uppercase tracking-wide">Instant Bill</h3>
              <span className="text-[10px] text-slate-500 font-bold">Fast-Track Counter Checkout</span>
            </div>
          </div>

          <button
            onClick={() => setIsInstantBillConfirmationOpen(false)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary Details */}
        <div className="bg-jaman-cream p-4 rounded-2xl border border-jaman-border space-y-2 text-center">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            TOTAL PAYABLE
          </span>
          <div className="text-3xl font-black font-mono text-jaman-navy">
            {formatINR(cart.totalPayable)}
          </div>
          <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-600 pt-1 border-t border-slate-200/80">
            <span>Payment: <strong className="text-emerald-700 font-black">{paymentLabel}</strong></span>
            {cfg.autoPrint && <span className="text-slate-400">• Auto Print: ON</span>}
          </div>
        </div>

        {/* Quick Tender Options */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isInstantBillProcessing}
            onClick={() => handleConfirm('CASH')}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95"
          >
            <Banknote className="w-3.5 h-3.5" />
            <span>Bill CASH</span>
          </button>

          <button
            type="button"
            disabled={isInstantBillProcessing}
            onClick={() => handleConfirm('UPI_QR')}
            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-900 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Bill UPI</span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setIsInstantBillConfirmationOpen(false)}
            className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isInstantBillProcessing}
            onClick={() => handleConfirm()}
            className="flex-2 px-4 py-2.5 bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-jaman-saffron/20 active:scale-95 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>{isInstantBillProcessing ? 'Printing...' : 'BILL & PRINT'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
