import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button } from '@jamanvaar/ui';
import { KioskLocalPrinterRepository, type KioskLocalPrinterConfig } from '@jamanvaar/database';
import { detectPrinters, describeDiscovered, PrinterService, type DetectionResult, type DiscoveredPrinter } from '@jamanvaar/api';
import { RefreshCw, Usb, Wifi, Cable, CheckCircle2, Trash2 } from 'lucide-react';

interface KioskPrinterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

const EMPTY_DETECTION: DetectionResult = { available: false, note: '', system: [], network: [], serial: [], errors: [] };

/**
 * This Kiosk's own receipt printer -- deliberately separate from Restaurant Admin's printer
 * list (KioskLocalPrinterRepository), since that shared, LAN-synced list has no concept of
 * which physical machine a printer is actually plugged into. Reachable only through the
 * staff PIN gate (see App.tsx's handleKioskPrinterSettingsPinVerify), the same manager
 * authentication already used for discount overrides.
 */
export const KioskPrinterSettingsModal: React.FC<KioskPrinterSettingsModalProps> = ({ isOpen, onClose, showToast }) => {
  const [current, setCurrent] = useState<KioskLocalPrinterConfig | null>(null);
  const [name, setName] = useState('');
  const [interfaceType, setInterfaceType] = useState<KioskLocalPrinterConfig['interfaceType']>('USB');
  const [port, setPort] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [systemPrinterName, setSystemPrinterName] = useState('');
  const [baudRate, setBaudRate] = useState(9600);
  const [paperSize, setPaperSize] = useState<KioskLocalPrinterConfig['paperSize']>('80mm');

  const [detection, setDetection] = useState<DetectionResult>(EMPTY_DETECTION);
  const [isScanning, setIsScanning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [formError, setFormError] = useState('');

  const runScan = useCallback(async () => {
    setIsScanning(true);
    try {
      setDetection(await detectPrinters());
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const existing = KioskLocalPrinterRepository.get();
    setCurrent(existing);
    setName(existing?.name || '');
    setInterfaceType(existing?.interfaceType || 'USB');
    setPort(existing?.port || '');
    setIpAddress(existing?.ipAddress || '');
    setSystemPrinterName(existing?.systemPrinterName || '');
    setBaudRate(existing?.baudRate || 9600);
    setPaperSize(existing?.paperSize || '80mm');
    setFormError('');
    void runScan();
  }, [isOpen, runScan]);

  const applyDetected = (found: DiscoveredPrinter) => {
    const described = describeDiscovered(found);
    setName(described.name || '');
    setInterfaceType((described.interfaceType as KioskLocalPrinterConfig['interfaceType']) || 'USB');
    setPort(described.port || '');
    setIpAddress(described.ipAddress || '');
    setSystemPrinterName(described.systemPrinterName || '');
    setBaudRate(described.baudRate || 9600);
  };

  const buildConfig = (): KioskLocalPrinterConfig | null => {
    if (!name.trim()) {
      setFormError('Give this printer a name.');
      return null;
    }
    if (interfaceType === 'NETWORK_LAN' && !ipAddress.trim()) {
      setFormError('IP address is required for a network printer.');
      return null;
    }
    if ((interfaceType === 'USB' || interfaceType === 'WINDOWS_DRIVER') && !systemPrinterName.trim()) {
      setFormError("Choose the printer's exact Windows name.");
      return null;
    }
    return {
      name: name.trim(),
      interfaceType,
      port: interfaceType === 'SERIAL' ? port : interfaceType === 'NETWORK_LAN' ? '9100' : undefined,
      ipAddress: interfaceType === 'NETWORK_LAN' ? ipAddress.trim() : undefined,
      systemPrinterName: interfaceType === 'USB' || interfaceType === 'WINDOWS_DRIVER' ? systemPrinterName.trim() : undefined,
      baudRate: interfaceType === 'SERIAL' ? baudRate : undefined,
      paperSize
    };
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const config = buildConfig();
    if (!config) return;
    KioskLocalPrinterRepository.set(config);
    setCurrent(config);
    showToast(`Saved "${config.name}" as this Kiosk's printer.`);
    onClose();
  };

  const handleTestPrint = async () => {
    setFormError('');
    const config = buildConfig();
    if (!config) return;
    setIsTesting(true);
    try {
      const res = await PrinterService.printTestSlipOnPrinter({
        id: 'kiosk-local-test',
        name: config.name,
        interfaceType: config.interfaceType,
        port: config.port,
        ipAddress: config.ipAddress,
        systemPrinterName: config.systemPrinterName,
        baudRate: config.baudRate,
        paperSize: config.paperSize,
        status: 'READY',
        isDefault: false,
        isKioskBuiltIn: true,
        modelName: 'Kiosk Local Printer'
      });
      showToast(res.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleRemove = () => {
    KioskLocalPrinterRepository.clear();
    setCurrent(null);
    showToast('Removed this Kiosk\'s printer configuration.');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Kiosk Printer Setup" maxWidth="md">
      <form onSubmit={handleSave} className="space-y-4 py-1">
        {current && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Currently: {current.name}
            </span>
            <button type="button" onClick={handleRemove} className="text-rose-600 hover:underline text-xs font-bold flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        )}

        <div className="bg-jaman-ivory rounded-xl p-3 space-y-2 border border-jaman-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">Detected Printers</span>
            <button
              type="button"
              onClick={runScan}
              disabled={isScanning}
              className="flex items-center gap-1.5 text-xs font-bold text-brand hover:underline disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Scanning…' : 'Rescan'}
            </button>
          </div>

          {!isScanning && !detection.available && (
            <p className="text-[11px] text-slate-500">
              Printer detection needs this Kiosk's installed desktop app — not available in a browser tab.
            </p>
          )}

          {!isScanning && detection.available && (
            <>
              {detection.system.length === 0 && detection.network.length === 0 && detection.serial.length === 0 && (
                <p className="text-[11px] text-slate-500">No printers found yet — turn one on and rescan.</p>
              )}
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {detection.system.map((p) => (
                  <button
                    type="button"
                    key={`sys-${p.name}-${p.port}`}
                    onClick={() => applyDetected(p)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg bg-white border border-jaman-border hover:border-brand text-left cursor-pointer"
                  >
                    <Usb className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate text-xs font-bold text-jaman-navy">{p.name}</span>
                  </button>
                ))}
                {detection.network.map((p) => (
                  <button
                    type="button"
                    key={`net-${p.ip}`}
                    onClick={() => applyDetected(p)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg bg-white border border-jaman-border hover:border-brand text-left cursor-pointer"
                  >
                    <Wifi className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate text-xs font-bold text-jaman-navy">Network printer {p.ip}</span>
                  </button>
                ))}
                {detection.serial.map((portName) => (
                  <button
                    type="button"
                    key={`ser-${portName}`}
                    onClick={() => applyDetected({ kind: 'SERIAL', port: portName })}
                    className="w-full flex items-center gap-2 p-2 rounded-lg bg-white border border-jaman-border hover:border-brand text-left cursor-pointer"
                  >
                    <Cable className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate text-xs font-bold text-jaman-navy">Serial port {portName}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Printer Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kiosk Counter Thermal 80mm"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Interface Connection</label>
            <select
              value={interfaceType}
              onChange={(e) => setInterfaceType(e.target.value as KioskLocalPrinterConfig['interfaceType'])}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            >
              <option value="USB">USB Cable</option>
              <option value="NETWORK_LAN">Ethernet / Network LAN</option>
              <option value="SERIAL">Serial / COM Port</option>
              <option value="WINDOWS_DRIVER">Windows System Spooler</option>
            </select>
          </div>

          {interfaceType === 'NETWORK_LAN' ? (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Printer IP Address *</label>
              <input
                type="text"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="192.168.1.200"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-brand"
              />
            </div>
          ) : interfaceType === 'SERIAL' ? (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">COM Port</label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="COM3"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-brand"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Windows Printer Name *</label>
              <input
                type="text"
                value={systemPrinterName}
                onChange={(e) => setSystemPrinterName(e.target.value)}
                placeholder="Exact Windows printer name"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPaperSize('80mm')}
            className={`p-3 rounded-2xl border-2 text-center transition-all ${
              paperSize === '80mm' ? 'border-brand bg-brand/[0.07] text-jaman-navy font-bold' : 'border-slate-200 bg-white text-slate-600 font-bold'
            }`}
          >
            80mm (Standard)
          </button>
          <button
            type="button"
            onClick={() => setPaperSize('58mm')}
            className={`p-3 rounded-2xl border-2 text-center transition-all ${
              paperSize === '58mm' ? 'border-brand bg-brand/[0.07] text-jaman-navy font-bold' : 'border-slate-200 bg-white text-slate-600 font-bold'
            }`}
          >
            58mm (Compact)
          </button>
        </div>

        {formError && (
          <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{formError}</p>
        )}

        <div className="flex justify-between gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={handleTestPrint} disabled={isTesting}>
            {isTesting ? 'Testing…' : 'Test Print'}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <button
              type="submit"
              className="px-4 py-2 bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
            >
              Save This Kiosk's Printer
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
