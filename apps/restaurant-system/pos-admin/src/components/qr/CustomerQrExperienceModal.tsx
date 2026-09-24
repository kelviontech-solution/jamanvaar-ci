import React, { useState, useEffect, useMemo } from 'react';
import { db, getGuestOrderBaseUrl } from '@jamanvaar/database';
import { DiningTable } from '@jamanvaar/types';
import {
  Smartphone,
  X,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { GuestQrOrderingPage } from './GuestQrOrderingPage';

interface CustomerQrExperienceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTableNumber?: string;
  initialOrderId?: string;
}

export const CustomerQrExperienceModal: React.FC<CustomerQrExperienceModalProps> = ({
  isOpen,
  onClose,
  initialTableNumber = '1',
  initialOrderId
}) => {
  const [deviceWidth, setDeviceWidth] = useState<'375' | '390' | '412'>('390');
  const [selectedTableNumber, setSelectedTableNumber] = useState<string>(initialTableNumber);

  useEffect(() => {
    if (initialTableNumber) {
      setSelectedTableNumber(initialTableNumber);
    }
  }, [initialTableNumber, isOpen]);

  const tables = db.tables;
  const currentTable: DiningTable | undefined = useMemo(() => {
    return tables.find((t) => t.tableNumber === selectedTableNumber) || tables[0];
  }, [tables, selectedTableNumber]);

  // BUG-119: the app's configured public address, never window.location.origin (a preview built while the
  // owner is on a LAN-only/localhost address must not show a link no guest's phone could ever reach).
  const hostUrl = getGuestOrderBaseUrl();

  const tableGuestUrl = useMemo(() => {
    const tbl = currentTable || { tableNumber: selectedTableNumber, qrToken: '' };
    const tok = tbl.qrToken || '';
    return `${hostUrl}/?qrTable=${tbl.tableNumber}&token=${tok}`;
  }, [currentTable, selectedTableNumber, hostUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#121B28] border border-slate-700 w-full max-w-5xl h-[94vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Top Control Bar */}
        <div className="bg-[#0B1522] border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-jaman-saffron/20 border border-jaman-saffron/40 flex items-center justify-center text-jaman-saffron">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black tracking-wide text-white">
                  Live Table QR Customer Experience
                </h2>
                <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {db.menuItems.length} DISHES / {tables.length} TABLES LIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Connected to real restaurant menu catalog, live orders queue, and kitchen KOT engine.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Table Selector */}
            <div className="flex items-center gap-1.5 bg-[#172334] border border-slate-700 px-2.5 py-1.5 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Select Table:</span>
              <select
                value={selectedTableNumber}
                onChange={(e) => setSelectedTableNumber(e.target.value)}
                className="bg-transparent text-xs font-black text-jaman-saffron focus:outline-none cursor-pointer"
              >
                {tables.length === 0 ? (
                  <option value="" className="bg-[#121B28] text-white">
                    No tables configured
                  </option>
                ) : (
                  tables.map((t) => (
                    <option key={t.id} value={t.tableNumber} className="bg-[#121B28] text-white">
                      Table {t.tableNumber} ({t.zone})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Viewport Width Selector */}
            <div className="flex items-center bg-[#172334] border border-slate-700 p-1 rounded-xl gap-1">
              {(['375', '390', '412'] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setDeviceWidth(w)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    deviceWidth === w ? 'bg-jaman-saffron text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>

            {/* Open in external tab */}
            <a
              href={tableGuestUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-black px-3 py-1.5 rounded-xl transition-all shadow-xs cursor-pointer"
              title="Open full guest web application in a new browser tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open in Tab</span>
            </a>

            {/* Close */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Stage: Phone Mockup Container */}
        <div className="flex-1 overflow-y-auto bg-[#070D14] flex items-center justify-center p-3 sm:p-6">
          <div
            style={{ width: `${deviceWidth}px` }}
            className="h-[760px] max-h-[82vh] bg-jaman-cream text-jaman-navy rounded-[42px] border-[10px] border-slate-900 shadow-2xl flex flex-col overflow-hidden relative"
          >
            {/* Phone Notch / Dynamic Island */}
            <div className="h-6 bg-slate-900 flex items-center justify-center shrink-0">
              <div className="w-20 h-3.5 bg-black rounded-full" />
            </div>

            {/* Real Production Guest QR Ordering Component */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
              <GuestQrOrderingPage
                key={`preview-${selectedTableNumber}-${currentTable?.qrToken || ''}-${initialOrderId || ''}`}
                tableNumber={selectedTableNumber}
                qrToken={currentTable?.qrToken}
                initialOrderId={initialOrderId}
                onExit={onClose}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
