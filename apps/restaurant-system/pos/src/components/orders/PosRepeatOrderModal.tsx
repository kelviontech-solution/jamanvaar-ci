import React, { useState, useEffect} from 'react';
import { usePosStore } from '../../store/posStore';
import { db } from '@jamanvaar/database';
import { Order } from '@jamanvaar/types';
import { formatINR, formatTime } from '@jamanvaar/utils';
import { X, RotateCcw, Check, ShoppingBag, Clock, Utensils, ArrowRight } from 'lucide-react';

interface PosRepeatOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PosRepeatOrderModal: React.FC<PosRepeatOrderModalProps> = ({ isOpen, onClose }) => {
  const { repeatOrder } = usePosStore();

  const recentOrders = db.orders
    .filter((o) => o.items && o.items.length > 0)
    .slice(0, 5);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(
    recentOrders.length > 0 ? recentOrders[0] : null
  );

  // Escape closes this dialog like any other in the app, not just its own Close button.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirmRepeat = (orderToRepeat?: Order) => {
    const target = orderToRepeat || selectedOrder;
    if (target) {
      repeatOrder(target);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-jaman-cream border border-jaman-border rounded-3xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-jaman-navy text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-jaman-saffron" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Repeat Previous Order</h2>
              <span className="text-xs text-slate-300">Quickly reorder dishes from recent counter bills</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {recentOrders.length > 0 ? (
            <>
              {/* Selected Order Summary Card */}
              {selectedOrder && (
                <div className="bg-white border-2 border-jaman-saffron rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-jaman-navy">
                          {selectedOrder.orderNumber}
                        </span>
                        <span className="text-[10px] font-black bg-[#FFF4ED] text-jaman-saffron border border-[#FDBA74] px-2 py-0.5 rounded-full">
                          Token #{selectedOrder.tokenNumber}
                        </span>
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                          {selectedOrder.orderType}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(selectedOrder.createdAt)}</span>
                        {selectedOrder.customerName && (
                          <>
                            <span>•</span>
                            <span className="text-slate-600 font-medium">{selectedOrder.customerName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-semibold block">TOTAL AMOUNT</span>
                      <span className="text-lg font-black font-mono text-jaman-navy">
                        {formatINR(selectedOrder.totalAmount)}
                      </span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {selectedOrder.items.map((it, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-black text-jaman-saffron font-mono w-6 text-center">
                            {it.quantity}×
                          </span>
                          <span className="font-bold text-jaman-navy">{it.name}</span>
                          {it.specialInstructions && (
                            <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                              {it.specialInstructions}
                            </span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-jaman-navy">
                          {formatINR(it.totalPrice || it.unitPrice * it.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Other Recent Orders Selector */}
              {recentOrders.length > 1 && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider block">
                    Pick from Recent Orders:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {recentOrders.map((ord) => {
                      const isSelected = selectedOrder?.id === ord.id;
                      return (
                        <button
                          key={ord.id}
                          type="button"
                          onClick={() => setSelectedOrder(ord)}
                          className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                            isSelected
                              ? 'border-jaman-saffron bg-[#FFFDFB] shadow-xs'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-jaman-navy">{ord.orderNumber}</span>
                            <span className="font-mono font-black text-xs text-jaman-navy">
                              {formatINR(ord.totalAmount)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-1">
                            {ord.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-center text-slate-400 my-auto">
              <ShoppingBag className="w-10 h-10 text-slate-300 mb-2 stroke-1" />
              <span className="text-sm font-bold text-slate-600">No previous orders found</span>
              <span className="text-xs text-slate-400 mt-0.5">Start billing items from the menu catalog</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-jaman-border p-4 sm:p-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors"
          >
            Cancel
          </button>

          {selectedOrder && (
            <button
              type="button"
              onClick={() => handleConfirmRepeat()}
              className="flex-1 bg-jaman-saffron hover:bg-[#EA580C] text-white py-3 px-6 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-jaman-saffron/25 active:scale-[0.99] transition-transform cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Load into Cart ({formatINR(selectedOrder.totalAmount)})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
