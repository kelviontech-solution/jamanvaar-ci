import React, { useState } from 'react';
import type { DetectionResult, DiscoveredPrinter } from '@jamanvaar/api';
import type { PrinterRole, ReceiptPaperSize } from '@jamanvaar/types';
import { PosPrinterService } from '../../services/printerService';
import { RefreshCw, Plus, Check } from 'lucide-react';

const ROLE_OPTIONS: PrinterRole[] = ['RECEIPT', 'KITCHEN', 'TANDOOR', 'BAR', 'DESSERT', 'REPORT', 'GENERAL'];

function label(found: DiscoveredPrinter): string {
  if (found.kind === 'SYSTEM') return found.name;
  if (found.kind === 'NETWORK') return `Network printer at ${found.ip}`;
  return `Serial printer on ${found.port}`;
}

function detail(found: DiscoveredPrinter): string {
  if (found.kind === 'SYSTEM') return `${found.port || 'no port'} · ${found.driver || 'no driver'} · ${found.status}`;
  if (found.kind === 'NETWORK') return `Port ${found.port} · raw ESC/POS`;
  return 'Serial (COM) port';
}

/**
 * Real printer detection (BUG-025/026): asks Windows for installed printers, scans the network for
 * raw-print devices, and lists serial ports. Anything not already configured can be added with one click.
 */
export const DetectedPrintersPanel: React.FC<{ onAdded: () => void; showToast: (msg: string) => void }> = ({ onAdded, showToast }) => {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [rolePick, setRolePick] = useState<Record<string, PrinterRole>>({});

  async function scan() {
    setScanning(true);
    try {
      setResult(await PosPrinterService.detectHardwarePrinters());
    } finally {
      setScanning(false);
    }
  }

  function key(found: DiscoveredPrinter): string {
    return found.kind === 'SYSTEM' ? `sys:${found.name}` : found.kind === 'NETWORK' ? `net:${found.ip}` : `ser:${found.port}`;
  }

  function add(found: DiscoveredPrinter) {
    const role = rolePick[key(found)] || 'GENERAL';
    const paperSize: ReceiptPaperSize = '80mm';
    const printer = PosPrinterService.addDiscoveredPrinter(found, role, paperSize);
    showToast(`Added "${printer.name}" as ${role} printer`);
    onAdded();
  }

  const discovered: DiscoveredPrinter[] = result ? [...result.system, ...result.network, ...result.serial.map((port) => ({ kind: 'SERIAL' as const, port }))] : [];

  return (
    <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-3">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="font-bold text-sm text-jaman-navy">Find printers</h3>
          <span className="text-[10px] text-slate-400">Looks for USB / Windows printers, network printers and serial ports</span>
        </div>
        <button
          type="button"
          onClick={scan}
          disabled={scanning}
          className="px-2.5 py-1.5 bg-[#FFF4ED] hover:bg-[#FFE8D6] text-jaman-saffron border border-[#FDBA74] rounded-xl font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          <span>{scanning ? 'Scanning…' : 'Scan'}</span>
        </button>
      </div>

      {result && !result.available && <p className="text-xs text-amber-700">{result.note}</p>}
      {result && result.available && discovered.length === 0 && <p className="text-xs text-slate-500">No new devices found. {result.note}</p>}
      {result && result.errors.length > 0 && <p className="text-[11px] text-rose-600">{result.errors.join(' ')}</p>}

      {discovered.length > 0 && (
        <div className="space-y-2 text-xs">
          {discovered.map((found) => {
            const already = !PosPrinterService.isNewDiscovery(found);
            return (
              <div key={key(found)} className="p-2.5 bg-jaman-cream rounded-xl border border-jaman-border flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <strong className="text-jaman-navy">{label(found)}</strong>
                  <div className="text-[10px] text-slate-500">{detail(found)}</div>
                </div>
                {already ? (
                  <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Already added
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <select
                      aria-label={`Role for ${label(found)}`}
                      value={rolePick[key(found)] || 'GENERAL'}
                      onChange={(e) => setRolePick({ ...rolePick, [key(found)]: e.target.value as PrinterRole })}
                      className="bg-white border border-jaman-border rounded-lg px-1.5 py-1 text-[11px] font-bold text-jaman-navy"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => add(found)}
                      className="px-2 py-1 bg-jaman-navy text-white rounded-lg font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
