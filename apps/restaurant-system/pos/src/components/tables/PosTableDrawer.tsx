import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, OrderRepository, TableRepository } from '@jamanvaar/database';
import { DiningTable } from '@jamanvaar/types';
import {
  X,
  Plus,
  ArrowRightLeft,
  Merge,
  CreditCard,
  CheckCircle2,
  Trash2,
  Users,
  Clock,
  Send,
  Receipt,
  FileText
} from 'lucide-react';

interface PosTableDrawerProps {
  table: DiningTable;
  onClose: () => void;
}

export const PosTableDrawer: React.FC<PosTableDrawerProps> = ({ table, onClose }) => {
  const {
    setSelectedTable,
    loadOrderFromTable,
    setActiveTab,
    setIsPaymentOpen,
    setLastCompletedOrder,
    setIsReceiptOpen
  } = usePosStore();

  const [transferTargetId, setTransferTargetId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [showTransferMode, setShowTransferMode] = useState(false);
  const [showMergeMode, setShowMergeMode] = useState(false);

  const activeOrder = table.currentOrderId ? OrderRepository.getOrderById(table.currentOrderId) : null;
  const otherTables = db.tables.filter((t) => t.id !== table.id);

  const handleAddItems = () => {
    loadOrderFromTable(table);
    onClose();
  };

  const handleTransfer = () => {
    if (!transferTargetId || !activeOrder) return;
    const targetTable = db.tables.find((t) => t.id === transferTargetId);
    if (!targetTable) return;

    OrderRepository.transferTable(activeOrder.id, targetTable.id, targetTable.tableNumber, 'Staff requested table relocation');
    setShowTransferMode(false);
    onClose();
  };

  const handleMerge = () => {
    if (!mergeTargetId) return;
    OrderRepository.mergeTables(table.id, mergeTargetId);
    setShowMergeMode(false);
    onClose();
  };

  const handleSettle = () => {
    if (!activeOrder) return;
    loadOrderFromTable(table);
    setIsPaymentOpen(true);
    onClose();
  };

  const handleMarkAvailable = () => {
    TableRepository.updateTableStatus(table.id, 'AVAILABLE');
    if (table.currentOrderId) {
      const ord = OrderRepository.getOrderById(table.currentOrderId);
      if (ord && (ord.orderStatus === 'PREPARING' || ord.orderStatus === 'READY')) {
        OrderRepository.updateOrderStatus(ord.id, 'COMPLETED', 'Table Vacated');
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-150 select-none">
      <div className="bg-jaman-cream border-l border-jaman-border w-full max-w-md h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="bg-jaman-navy text-white p-5 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase text-jaman-saffron">{table.zone || 'Dining Area'}</span>
              <span className="text-[10px] font-extrabold bg-white/20 text-white px-2 py-0.5 rounded-full uppercase">
                {table.status}
              </span>
            </div>
            <h2 className="text-2xl font-black text-white mt-0.5">
              Table #{table.tableNumber}
            </h2>
            <div className="text-xs text-slate-300 flex items-center gap-3 mt-1">
              <span>{table.capacity} Seater</span>
              {activeOrder && <span>• Order #{activeOrder.orderNumber}</span>}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeOrder ? (
            <div className="space-y-4">
              {/* Order Items Summary Card */}
              <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                  <span className="font-bold text-xs text-jaman-navy">Active Order Items</span>
                  <span className="text-xs font-semibold text-slate-400 font-mono">
                    Token #{activeOrder.tokenNumber}
                  </span>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 divide-y divide-slate-100">
                  {activeOrder.items.map((it, idx) => (
                    <div key={idx} className="pt-2 first:pt-0 flex items-start justify-between text-xs">
                      <div>
                        <div className="font-bold text-jaman-navy">{it.name}</div>
                        <div className="text-[11px] text-slate-400">
                          ₹{it.unitPrice} × {it.quantity}
                          {it.specialInstructions ? ` (${it.specialInstructions})` : ''}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-jaman-navy">
                        ₹{it.totalPrice}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-200 mt-3 pt-2.5 flex items-baseline justify-between">
                  <span className="font-bold text-xs text-slate-600">Total Bill Amount</span>
                  <span className="font-mono font-black text-lg text-jaman-navy">
                    ₹{activeOrder.totalAmount}
                  </span>
                </div>
              </div>

              {/* Transfer Table Mode */}
              {showTransferMode && (
                <div className="bg-white border-2 border-jaman-saffron rounded-2xl p-4 space-y-3 shadow-md">
                  <div className="flex items-center gap-2 text-xs font-bold text-jaman-navy">
                    <ArrowRightLeft className="w-4 h-4 text-jaman-saffron" />
                    <span>Select Target Table to Move Order</span>
                  </div>

                  <select
                    value={transferTargetId}
                    onChange={(e) => setTransferTargetId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  >
                    <option value="">-- Choose destination table --</option>
                    {otherTables
                      .filter((t) => t.status === 'AVAILABLE')
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          Table #{t.tableNumber} ({t.zone || 'Hall'} • {t.capacity} seats)
                        </option>
                      ))}
                  </select>

                  <div className="flex gap-2">
                    <button
                      onClick={handleTransfer}
                      disabled={!transferTargetId}
                      className="flex-1 py-2 rounded-xl bg-jaman-saffron text-white font-bold text-xs disabled:opacity-50"
                    >
                      Confirm Transfer
                    </button>
                    <button
                      onClick={() => setShowTransferMode(false)}
                      className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Merge Table Mode */}
              {showMergeMode && (
                <div className="bg-white border-2 border-teal-600 rounded-2xl p-4 space-y-3 shadow-md">
                  <div className="flex items-center gap-2 text-xs font-bold text-jaman-navy">
                    <Merge className="w-4 h-4 text-teal-600" />
                    <span>Select Table to Combine with Table #{table.tableNumber}</span>
                  </div>

                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-jaman-navy focus:outline-none focus:border-teal-600"
                  >
                    <option value="">-- Choose table to merge --</option>
                    {otherTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        Table #{t.tableNumber} ({t.status} • {t.capacity} seats)
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <button
                      onClick={handleMerge}
                      disabled={!mergeTargetId}
                      className="flex-1 py-2 rounded-xl bg-teal-600 text-white font-bold text-xs disabled:opacity-50"
                    >
                      Confirm Merge
                    </button>
                    <button
                      onClick={() => setShowMergeMode(false)}
                      className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Action Operations Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={handleAddItems}
                  className="py-3 px-3 rounded-xl bg-white border border-jaman-border hover:border-jaman-saffron text-jaman-navy font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors"
                >
                  <Plus className="w-4 h-4 text-jaman-saffron" />
                  <span>Add Dishes</span>
                </button>

                <button
                  onClick={() => setShowTransferMode(!showTransferMode)}
                  className="py-3 px-3 rounded-xl bg-white border border-jaman-border hover:border-jaman-navy text-jaman-navy font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors"
                >
                  <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                  <span>Transfer Table</span>
                </button>

                <button
                  onClick={() => setShowMergeMode(!showMergeMode)}
                  className="py-3 px-3 rounded-xl bg-white border border-jaman-border hover:border-jaman-navy text-jaman-navy font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors"
                >
                  <Merge className="w-4 h-4 text-teal-600" />
                  <span>Merge Tables</span>
                </button>

                <button
                  onClick={handleMarkAvailable}
                  className="py-3 px-3 rounded-xl bg-white border border-jaman-border hover:bg-rose-50 text-rose-600 font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Vacate Table</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-jaman-border rounded-2xl p-6 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <div>
                <h3 className="font-bold text-base text-jaman-navy">Table is Available</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  No active orders on this table. Ready to seat new guests.
                </p>
              </div>

              <button
                onClick={() => {
                  setSelectedTable(table);
                  setActiveTab('MENU');
                  onClose();
                }}
                className="w-full py-3 rounded-xl bg-jaman-saffron hover:bg-jaman-orange text-white font-extrabold text-xs uppercase tracking-wider shadow-md shadow-jaman-saffron/20"
              >
                + Start Dine-In Order
              </button>
            </div>
          )}
        </div>

        {/* Drawer Footer CTA */}
        {activeOrder && (
          <div className="bg-white border-t border-jaman-border p-4 shrink-0">
            <button
              onClick={handleSettle}
              className="w-full py-3.5 rounded-2xl bg-jaman-saffron hover:bg-jaman-orange text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-jaman-saffron/25 active:scale-[0.99] transition-transform cursor-pointer"
            >
              <CreditCard className="w-4 h-4" />
              <span>Settle Bill (₹{activeOrder.totalAmount})</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
