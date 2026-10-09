import React, { useState, useEffect, useCallback } from 'react';
import { PrinterDevice } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { PrinterRepository } from '@jamanvaar/database';
import { detectPrinters, describeDiscovered, isAlreadyConfigured, DiscoveredPrinter, DetectionResult } from '@jamanvaar/api';
import { RefreshCw, Usb, Wifi, Cable, CheckCircle2 } from 'lucide-react';

interface PrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  printerToEdit: PrinterDevice | null;
  onSaved: () => void;
  configuredPrinters: PrinterDevice[];
}

const EMPTY_DETECTION: DetectionResult = { available: false, note: '', system: [], network: [], serial: [], errors: [] };

export const PrinterModal: React.FC<PrinterModalProps> = ({
  isOpen,
  onClose,
  printerToEdit,
  onSaved,
  configuredPrinters
}) => {
  const [name, setName] = useState('');
  const [interfaceType, setInterfaceType] = useState<PrinterDevice['interfaceType']>('USB');
  const [port, setPort] = useState('USB001');
  const [ipAddress, setIpAddress] = useState('');
  const [systemPrinterName, setSystemPrinterName] = useState('');
  const [baudRate, setBaudRate] = useState(9600);
  const [paperSize, setPaperSize] = useState<PrinterDevice['paperSize']>('80mm');
  const [isDefault, setIsDefault] = useState(false);
  const [formError, setFormError] = useState('');

  const [detection, setDetection] = useState<DetectionResult>(EMPTY_DETECTION);
  const [isScanning, setIsScanning] = useState(false);

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
    if (printerToEdit) {
      setName(printerToEdit.name);
      setInterfaceType(printerToEdit.interfaceType);
      setPort(printerToEdit.port || 'USB001');
      setIpAddress(printerToEdit.ipAddress || '');
      setSystemPrinterName(printerToEdit.systemPrinterName || '');
      setBaudRate(printerToEdit.baudRate || 9600);
      setPaperSize(printerToEdit.paperSize);
      setIsDefault(printerToEdit.isDefault);
    } else {
      setName('');
      setInterfaceType('USB');
      setPort('USB001');
      setIpAddress('');
      setSystemPrinterName('');
      setBaudRate(9600);
      setPaperSize('80mm');
      setIsDefault(false);
    }
    setFormError('');
    setDetection(EMPTY_DETECTION);
    void runScan();
  }, [printerToEdit, isOpen, runScan]);

  const applyDetected = (found: DiscoveredPrinter) => {
    const described = describeDiscovered(found);
    setName(described.name || '');
    setInterfaceType(described.interfaceType || 'USB');
    setPort(described.port || '');
    setIpAddress(described.ipAddress || '');
    setSystemPrinterName(described.systemPrinterName || '');
    setBaudRate(described.baudRate || 9600);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name) {
      setFormError('Printer name is required.');
      return;
    }
    if (interfaceType === 'NETWORK_LAN' && !ipAddress.trim()) {
      setFormError('IP address is required for a network printer — scan for it or enter it manually.');
      return;
    }
    if ((interfaceType === 'USB' || interfaceType === 'WINDOWS_DRIVER') && !systemPrinterName.trim()) {
      setFormError('Choose the printer\'s exact Windows name — scan for it, or type it exactly as it appears in Windows under Printers & scanners.');
      return;
    }

    const payload = {
      name,
      interfaceType,
      port: interfaceType === 'SERIAL' ? port : interfaceType === 'NETWORK_LAN' ? '9100' : port,
      ipAddress: interfaceType === 'NETWORK_LAN' ? ipAddress.trim() : undefined,
      systemPrinterName: interfaceType === 'USB' || interfaceType === 'WINDOWS_DRIVER' ? systemPrinterName.trim() : undefined,
      baudRate: interfaceType === 'SERIAL' ? baudRate : undefined,
      paperSize,
      isDefault
    };

    if (printerToEdit) {
      PrinterRepository.updatePrinter(printerToEdit.id, payload);
    } else {
      PrinterRepository.createPrinter(payload);
    }

    onSaved();
    onClose();
  };

  const alreadyConfiguredElsewhere = (found: DiscoveredPrinter) =>
    isAlreadyConfigured(
      printerToEdit ? configuredPrinters.filter((p) => p.id !== printerToEdit.id) : configuredPrinters,
      found
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={printerToEdit ? `Edit Printer: ${printerToEdit.name}` : 'Configure Thermal Receipt Printer'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {/* Real hardware detection -- replaces guessing a port/IP by hand */}
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
              Printer detection needs the JAMANVAAR desktop app — it isn't available in a browser tab. You can still enter a printer's details manually below.
            </p>
          )}

          {!isScanning && detection.available && (
            <>
              {detection.system.length === 0 && detection.network.length === 0 && detection.serial.length === 0 && (
                <p className="text-[11px] text-slate-500">
                  {detection.note} No printers found yet — turn one on and rescan.
                </p>
              )}
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {detection.system.map((p) => {
                  const taken = alreadyConfiguredElsewhere(p);
                  return (
                    <button
                      type="button"
                      key={`sys-${p.name}-${p.port}`}
                      disabled={taken}
                      onClick={() => applyDetected(p)}
                      className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-jaman-border hover:border-brand text-left disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Usb className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate text-xs font-bold text-jaman-navy">{p.name}</span>
                      </span>
                      {taken ? (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3 h-3" /> Configured
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 shrink-0">{p.port}</span>
                      )}
                    </button>
                  );
                })}
                {detection.network.map((p) => {
                  const taken = alreadyConfiguredElsewhere(p);
                  return (
                    <button
                      type="button"
                      key={`net-${p.ip}`}
                      disabled={taken}
                      onClick={() => applyDetected(p)}
                      className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-jaman-border hover:border-brand text-left disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Wifi className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate text-xs font-bold text-jaman-navy">Network printer {p.ip}</span>
                      </span>
                      {taken && (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3 h-3" /> Configured
                        </span>
                      )}
                    </button>
                  );
                })}
                {detection.serial.map((portName) => {
                  const found: DiscoveredPrinter = { kind: 'SERIAL', port: portName };
                  const taken = alreadyConfiguredElsewhere(found);
                  return (
                    <button
                      type="button"
                      key={`ser-${portName}`}
                      disabled={taken}
                      onClick={() => applyDetected(found)}
                      className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-jaman-border hover:border-brand text-left disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Cable className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate text-xs font-bold text-jaman-navy">Serial port {portName}</span>
                      </span>
                      {taken && (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3 h-3" /> Configured
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {detection.errors.length > 0 && (
                <p className="text-[10px] text-amber-700">{detection.errors.join(' • ')}</p>
              )}
            </>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Printer Display Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Counter Bill Thermal 80mm"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Interface Connection</label>
            <select
              value={interfaceType}
              onChange={(e) => setInterfaceType(e.target.value as any)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            >
              <option value="USB">USB Cable</option>
              <option value="NETWORK_LAN">Ethernet / Network LAN</option>
              <option value="SERIAL">Serial / COM Port</option>
              <option value="WINDOWS_DRIVER">Windows System Spooler</option>
              <option value="VIRTUAL_EMULATOR">Virtual Driver Emulator</option>
            </select>
          </div>

          {interfaceType === 'NETWORK_LAN' ? (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Printer IP Address *</label>
              <input
                type="text"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="e.g. 192.168.1.200"
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
                placeholder="e.g. COM3"
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
                placeholder="Exact name under Printers & scanners"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Thermal Paper Roll Width</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaperSize('80mm')}
              className={`p-3 rounded-2xl border-2 text-center transition-all ${
                paperSize === '80mm'
                  ? 'border-brand bg-brand/[0.07] text-jaman-navy font-bold'
                  : 'border-slate-200 bg-white text-slate-600 font-bold'
              }`}
            >
              <span className="text-sm block">80mm (Standard)</span>
              <span className="text-[11px] text-slate-500 font-normal">Full 48-char receipts</span>
            </button>
            <button
              type="button"
              onClick={() => setPaperSize('58mm')}
              className={`p-3 rounded-2xl border-2 text-center transition-all ${
                paperSize === '58mm'
                  ? 'border-brand bg-brand/[0.07] text-jaman-navy font-bold'
                  : 'border-slate-200 bg-white text-slate-600 font-bold'
              }`}
            >
              <span className="text-sm block">58mm (Compact)</span>
              <span className="text-[11px] text-slate-500 font-normal">Narrow 32-char receipts</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded"
            />
            <span>Set as Default Terminal Receipt Printer</span>
          </label>
        </div>

        {formError && (
          <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="submit"
            className="px-4 py-2 bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            {printerToEdit ? 'Save Printer' : 'Register Printer'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
