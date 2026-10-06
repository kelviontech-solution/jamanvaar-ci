import React, { useState } from 'react';
import { PrinterDevice } from '@jamanvaar/types';
import { db, PrinterRepository } from '@jamanvaar/database';
import { PrinterService } from '@jamanvaar/api';
import {
  Printer,
  Plus,
  Wifi,
  Radio,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  Cpu
} from 'lucide-react';

interface PrintersDevicesModuleProps {
  configuredPrinters: PrinterDevice[];
  onOpenPrinterModal: (prn?: PrinterDevice | null) => void;
  showToast: (msg: string) => void;
  onRequestConfirm?: (dialog: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    isDanger: boolean;
    onConfirm: () => void;
  }) => void;
}

export const PrintersDevicesModule: React.FC<PrintersDevicesModuleProps> = ({
  configuredPrinters,
  onOpenPrinterModal,
  showToast,
  onRequestConfirm
}) => {
  const [syncServerInput, setSyncServerInput] = useState<string>(() => db.getSyncServerUrl());
  const [syncPingResult, setSyncPingResult] = useState<{
    status: 'IDLE' | 'TESTING' | 'SUCCESS' | 'ERROR';
    pingMs?: number;
    error?: string;
  }>({ status: 'IDLE' });
  const [isSyncingNow, setIsSyncingNow] = useState(false);

  const handleDeletePrinter = (prn: PrinterDevice) => {
    if (onRequestConfirm) {
      onRequestConfirm({
        isOpen: true,
        title: 'Delete Thermal Printer',
        message: `Are you sure you want to remove configuration for printer "${prn.name}"?`,
        confirmText: 'Delete Printer',
        isDanger: true,
        onConfirm: () => {
          PrinterRepository.deletePrinter(prn.id);
          showToast(`Deleted printer: ${prn.name}`);
        }
      });
    } else {
      if (window.confirm(`Delete printer configuration "${prn.name}"?`)) {
        PrinterRepository.deletePrinter(prn.id);
        showToast(`Deleted printer: ${prn.name}`);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy tracking-tight">
              Printers & Peripheral Devices
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              ESC/POS HARDWARE
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">
            Configure ESC/POS thermal printers (80mm/58mm), KOT station routing, and run test prints.
          </p>
        </div>
        <button
          onClick={() => onOpenPrinterModal(null)}
          className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-xs flex items-center gap-2 shadow-sm shadow-brand/25 active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Configure Printer</span>
        </button>
      </div>

      {/* 4 Peripheral Device Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">POS Counter PC</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-base font-bold text-jaman-navy">Counter Terminal</div>
          <span className="text-[11px] text-emerald-600 font-bold block">Localhost Active</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Receipt Printers</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-base font-bold text-jaman-navy">Thermal 80mm ESC/POS</div>
          <span className="text-[11px] text-slate-500 font-bold block">{configuredPrinters.length} Configured</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Cash Drawer</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-base font-bold text-jaman-navy">RJ11 Kick Solenoid</div>
          <span className="text-[11px] text-slate-500 font-bold block">Auto-Open on Bill</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">LAN Mesh Bridge</span>
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
          </div>
          <div className="text-base font-bold text-jaman-navy">Multi-Device Sync</div>
          <span className="text-[11px] text-indigo-600 font-bold block">Port 5178 Listening</span>
        </div>
      </div>

      {/* Configured Printers List */}
      {configuredPrinters.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-jaman-border text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-brand flex items-center justify-center mx-auto">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-jaman-navy text-base">No Thermal Printers Configured</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-0.5">
              Connect your 80mm or 58mm ESC/POS receipt or kitchen KOT printer via LAN Ethernet, USB, or Bluetooth.
            </p>
          </div>
          <button
            onClick={() => onOpenPrinterModal(null)}
            className="px-4 py-2 rounded-xl bg-brand text-white font-bold text-xs shadow-xs cursor-pointer"
          >
            + Configure First Printer
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {configuredPrinters.map((prn) => (
            <div key={prn.id} className="bg-white rounded-2xl p-5 border border-jaman-border shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand/[0.07] text-brand flex items-center justify-center">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-jaman-navy">{prn.name}</h4>
                    <span className="text-xs text-slate-500">
                      {prn.interfaceType} • {prn.paperSize}
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {prn.status}
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onOpenPrinterModal(prn)}
                    className="text-brand font-bold hover:underline cursor-pointer"
                  >
                    Edit Config
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => handleDeletePrinter(prn)}
                    className="text-rose-600 font-bold hover:underline cursor-pointer"
                  >
                    Delete
                  </button>
                </div>

                <button
                  onClick={async () => {
                    // BUG-027: this used to toast "dispatched" and open the browser's print
                    // dialog for the whole web page — no slip ever went to the printer. It now
                    // uses the real print path and reports what actually happened.
                    const res = await PrinterService.printTestSlip(prn.id);
                    showToast(res.success ? res.message : `Test print failed: ${res.message}`);
                  }}
                  className="px-3 py-1.5 bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Run Test Print
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LAN SYNC BRIDGE & MULTI-MACHINE CONNECTION CONSOLE */}
      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-jaman-navy">LAN Sync Bridge & Cross-Machine Pairing</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800">
                  MULTI-DEVICE SYNC
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Synchronize POS Counter PCs, Admin Laptops, Captain APKs, and Kitchen KDS screens over the local Wi-Fi / LAN network.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setIsSyncingNow(true);
                const ok = await db.forceSyncNow();
                setIsSyncingNow(false);
                if (ok) {
                  showToast('Real-time synchronization completed with Host Server!');
                } else {
                  showToast('Could not reach Host Server. Operating in Local Offline Mode.');
                }
              }}
              disabled={isSyncingNow}
              className="px-3.5 py-2 bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs disabled:opacity-50 transition-all cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
              <span>{isSyncingNow ? 'Syncing...' : 'Force Sync Now'}</span>
            </button>
          </div>
        </div>

        {/* Host Server URL Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-8 space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Main POS Counter Server Address (LAN Host IP:Port):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={syncServerInput}
                onChange={(e) => setSyncServerInput(e.target.value)}
                placeholder="e.g. http://192.168.1.100:5178 or http://localhost:5178"
                className="flex-1 bg-jaman-cream border border-jaman-border rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-jaman-navy focus:outline-none focus:border-brand"
              />
              <button
                onClick={() => {
                  db.setSyncServerUrl(syncServerInput);
                  showToast(`Sync Host Server updated to: ${syncServerInput}`);
                }}
                className="px-4 py-2.5 bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                Save & Connect
              </button>
            </div>
            <span className="text-[11px] text-slate-500 block">
              Tip: If this is the Main Counter PC, leave as <code className="text-jaman-navy font-bold">http://localhost:5178</code>. On other laptops/tablets, enter the Main PC's LAN IP.
            </span>
          </div>

          <div className="md:col-span-4 space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">Connection Health & Latency:</label>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setSyncPingResult({ status: 'TESTING' });
                  const res = await db.testSyncServer(syncServerInput);
                  if (res.success) {
                    setSyncPingResult({ status: 'SUCCESS', pingMs: res.pingMs });
                    showToast(`Connected to Host! Ping: ${res.pingMs}ms`);
                  } else {
                    setSyncPingResult({ status: 'ERROR', error: res.error });
                    showToast(`Connection failed: ${res.error}`);
                  }
                }}
                className="w-full px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-jaman-navy font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5 text-slate-500" />
                <span>Test Ping & Latency</span>
              </button>
            </div>
          </div>
        </div>

        {/* Ping Result Status Banner */}
        {syncPingResult.status !== 'IDLE' && (
          <div
            className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between transition-all ${
              syncPingResult.status === 'SUCCESS'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : syncPingResult.status === 'TESTING'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  syncPingResult.status === 'SUCCESS' ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'
                }`}
              ></span>
              <div>
                <strong className="block font-bold">
                  {syncPingResult.status === 'SUCCESS'
                    ? `ONLINE & CONNECTED (Ping: ${syncPingResult.pingMs}ms)`
                    : syncPingResult.status === 'TESTING'
                    ? '⏳ Pinging Sync Server...'
                    : `SERVER UNREACHABLE: ${syncPingResult.error}`}
                </strong>
                <span className="text-[11px] opacity-80">
                  {syncPingResult.status === 'SUCCESS'
                    ? 'All orders, table statuses, menu changes, and KOTs are syncing in real time.'
                    : 'Ensure the local service is running on the Host machine: node tooling/local-runtime/local_service.cjs'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
