import React from 'react';
import { usePosStore } from '../../store/posStore';
import { db, HeldOrderRepository } from '@jamanvaar/database';
import { X, Play, Trash2, Clock, CirclePause, ShoppingBag } from 'lucide-react';

export const PosHoldModal: React.FC = () => {
  const { isHoldOrdersOpen, setIsHoldOrdersOpen, recallHeldOrder } = usePosStore();

  if (!isHoldOrdersOpen) return null;

  const heldOrders = HeldOrderRepository.getAllHeld();

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-jaman-cream border border-jaman-border rounded-3xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-jaman-navy text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CirclePause className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Held Carts & Orders</h2>
              <span className="text-xs text-slate-300">
                {heldOrders.length} order{heldOrders.length === 1 ? '' : 's'} on hold
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsHoldOrdersOpen(false)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Held Orders List */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1">
          {heldOrders.length > 0 ? (
            heldOrders.map((h) => (
              <div
                key={h.id}
                className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-amber-400 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-jaman-navy">{h.label}</span>
                    <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                      {h.orderType}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Held at {new Date(h.heldAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>•</span>
                    <span>{h.itemCount} items</span>
                  </div>

                  <div className="text-xs font-mono font-extrabold text-jaman-navy">
                    Total: ₹{h.totalAmount}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => {
                      recallHeldOrder(h.id);
                      setIsHoldOrdersOpen(false);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-jaman-saffron hover:bg-jaman-orange text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Recall Cart</span>
                  </button>

                  <button
                    onClick={() => HeldOrderRepository.deleteHeldOrder(h.id)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-center text-slate-400 my-auto">
              <ShoppingBag className="w-10 h-10 text-slate-300 mb-2 stroke-1" />
              <span className="text-sm font-bold text-slate-600">No active held carts</span>
              <span className="text-xs text-slate-400 mt-0.5">Click 'Hold' in the cart to pause an active order</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
