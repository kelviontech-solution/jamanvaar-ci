import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, ShiftRepository } from '@jamanvaar/database';
import { ShiftRecord } from '@jamanvaar/types';
import {
  Clock,
  X,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Lock,
  Calendar,
  Layers
} from 'lucide-react';

export const PosShiftModal: React.FC = () => {
  const { isShiftModalOpen, setIsShiftModalOpen, currentUser } = usePosStore();
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'CLOSE' | 'NEW'>('SUMMARY');
  const [actualCashInput, setActualCashInput] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [newOpeningFloat, setNewOpeningFloat] = useState('2000');
  const [newShiftNotes, setNewShiftNotes] = useState('');
  const [feedback, setFeedback] = useState('');

  if (!isShiftModalOpen) return null;

  const currentShift = ShiftRepository.getActiveShift();
  const movements = ShiftRepository.getCashMovements(currentShift?.id);

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShift) return;

    const actualVal = parseFloat(actualCashInput) || 0;
    const closed = ShiftRepository.closeShift(currentShift.id, actualVal, closingNotes);

    if (closed) {
      setFeedback(`Shift closed successfully! Cash Variance: ₹${closed.cashVariance}`);
      setTimeout(() => {
        setFeedback('');
        setActiveTab('NEW');
      }, 1500);
    }
  };

  const handleOpenNewShift = (e: React.FormEvent) => {
    e.preventDefault();
    const floatVal = parseFloat(newOpeningFloat) || 0;
    ShiftRepository.openShift(
      currentUser?.id || 'usr-cashier-1',
      currentUser?.fullName || 'Cashier',
      floatVal,
      'POS-01',
      newShiftNotes
    );

    setFeedback('New shift opened successfully!');
    setTimeout(() => {
      setFeedback('');
      setActiveTab('SUMMARY');
      setIsShiftModalOpen(false);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#0B253A] text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-[#E66817]" />
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Shift & Cash Drawer Management</h2>
              <span className="text-xs text-slate-300">Terminal POS-01 • Cashier: {currentUser?.fullName}</span>
            </div>
          </div>

          <button
            onClick={() => setIsShiftModalOpen(false)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="p-3 bg-white border-b border-[#EBE6DD] flex gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('SUMMARY')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'SUMMARY'
                ? 'bg-[#0B253A] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Shift Summary
          </button>

          {currentShift ? (
            <button
              onClick={() => setActiveTab('CLOSE')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'CLOSE'
                  ? 'bg-[#E66817] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Close Shift
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('NEW')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'NEW'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Open New Shift
            </button>
          )}
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold text-center border-b border-emerald-200">
            ✓ {feedback}
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* SUMMARY TAB */}
          {activeTab === 'SUMMARY' && currentShift && (
            <div className="space-y-4">
              <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">Active Shift Info</span>
                  <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    OPEN
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Opened At</span>
                    <strong className="text-[#0B253A]">{new Date(currentShift.openedAt).toLocaleTimeString()}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Opening Float</span>
                    <strong className="text-[#0B253A] font-mono">₹{currentShift.openingCash}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Total Sales</span>
                    <strong className="text-emerald-700 font-mono font-bold text-sm">₹{currentShift.totalSales}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Orders Count</span>
                    <strong className="text-[#0B253A]">{currentShift.totalOrders} bills</strong>
                  </div>
                </div>

                {/* Expected Cash in Drawer */}
                <div className="bg-[#0B253A] text-white p-3.5 rounded-xl flex items-center justify-between mt-2">
                  <div>
                    <span className="text-[10px] text-slate-300 uppercase font-bold block">Expected Cash in Drawer</span>
                    <span className="text-xs text-slate-400">(Opening Float + Cash Sales ± Cash Move)</span>
                  </div>
                  <span className="text-xl font-black font-mono text-emerald-400">
                    ₹{currentShift.expectedCash}
                  </span>
                </div>
              </div>

              {/* Payment Mix Breakdown */}
              <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-2">
                <span className="text-xs font-bold text-slate-700 block">Payment Mix Collection</span>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Cash Collections:</span>
                    <span className="font-mono font-bold text-[#0B253A]">₹{currentShift.totalCashSales}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">UPI / QR Collections:</span>
                    <span className="font-mono font-bold text-[#0B253A]">₹{currentShift.totalUpiSales}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Card Collections:</span>
                    <span className="font-mono font-bold text-[#0B253A]">₹{currentShift.totalCardSales}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CLOSE SHIFT TAB */}
          {activeTab === 'CLOSE' && currentShift && (
            <form onSubmit={handleCloseShift} className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>End-of-Shift Cash Reconciliation</span>
                </div>
                <div>Please count physical cash notes in the drawer and enter the total below.</div>
              </div>

              <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Actual Cash Counted (₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={actualCashInput}
                    onChange={(e) => setActualCashInput(e.target.value)}
                    placeholder={`Expected: ₹${currentShift.expectedCash}`}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                  />
                </div>

                {actualCashInput && (
                  <div className={`p-3 rounded-xl border text-xs flex justify-between items-center font-bold ${
                    parseFloat(actualCashInput) - currentShift.expectedCash === 0
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}>
                    <span>Calculated Cash Variance:</span>
                    <span className="font-mono text-sm">
                      {parseFloat(actualCashInput) - currentShift.expectedCash >= 0 ? '+' : ''}
                      ₹{(parseFloat(actualCashInput) - currentShift.expectedCash).toFixed(2)}
                    </span>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Shift Closing Remarks / Handover Notes
                  </label>
                  <textarea
                    rows={2}
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    placeholder="e.g. Handed over to Evening Cashier Suresh"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-[#E66817] hover:bg-[#F97316] text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-[#E66817]/25 cursor-pointer"
              >
                Confirm & Close Shift
              </button>
            </form>
          )}

          {/* OPEN NEW SHIFT TAB */}
          {activeTab === 'NEW' && (
            <form onSubmit={handleOpenNewShift} className="space-y-4">
              <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-[#0B253A]">Start New Cashier Shift</h3>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Opening Cash Float (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    value={newOpeningFloat}
                    onChange={(e) => setNewOpeningFloat(e.target.value)}
                    placeholder="e.g. 2000"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Shift Notes
                  </label>
                  <input
                    type="text"
                    value={newShiftNotes}
                    onChange={(e) => setNewShiftNotes(e.target.value)}
                    placeholder="e.g. Evening shift opening float verified"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider shadow-md shadow-emerald-600/25 cursor-pointer"
              >
                Open Terminal Shift
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
