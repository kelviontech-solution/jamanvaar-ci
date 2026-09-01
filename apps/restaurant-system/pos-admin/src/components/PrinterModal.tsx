import React, { useState, useEffect } from 'react';
import { PrinterDevice } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { PrinterRepository } from '@jamanvaar/database';

interface PrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  printerToEdit: PrinterDevice | null;
  onSaved: () => void;
}

export const PrinterModal: React.FC<PrinterModalProps> = ({
  isOpen,
  onClose,
  printerToEdit,
  onSaved
}) => {
  const [name, setName] = useState('');
  const [interfaceType, setInterfaceType] = useState<PrinterDevice['interfaceType']>('USB');
  const [port, setPort] = useState('USB001');
  const [paperSize, setPaperSize] = useState<PrinterDevice['paperSize']>('80mm');
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (printerToEdit) {
      setName(printerToEdit.name);
      setInterfaceType(printerToEdit.interfaceType);
      setPort(printerToEdit.port || 'USB001');
      setPaperSize(printerToEdit.paperSize);
      setIsDefault(printerToEdit.isDefault);
    } else {
      setName('');
      setInterfaceType('USB');
      setPort('USB001');
      setPaperSize('80mm');
      setIsDefault(false);
    }
  }, [printerToEdit, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    if (printerToEdit) {
      PrinterRepository.updatePrinter(printerToEdit.id, {
        name,
        interfaceType,
        port,
        paperSize,
        isDefault
      });
    } else {
      PrinterRepository.createPrinter({
        name,
        interfaceType,
        port,
        paperSize,
        isDefault
      });
    }

    onSaved();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={printerToEdit ? `Edit Printer: ${printerToEdit.name}` : 'Configure Thermal Receipt Printer'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Printer Display Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Counter Bill Thermal 80mm"
            className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Interface Connection</label>
            <select
              value={interfaceType}
              onChange={(e) => setInterfaceType(e.target.value as any)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            >
              <option value="USB">USB Cable</option>
              <option value="NETWORK_LAN">Ethernet / Network LAN</option>
              <option value="SERIAL">Serial / COM Port</option>
              <option value="WINDOWS_DRIVER">Windows System Spooler</option>
              <option value="VIRTUAL_EMULATOR">Virtual Driver Emulator</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Port / IP Address</label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="e.g. USB001 or 192.168.1.200"
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-[#E66817]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Thermal Paper Roll Width</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaperSize('80mm')}
              className={`p-3 rounded-2xl border-2 text-center transition-all ${
                paperSize === '80mm'
                  ? 'border-[#E66817] bg-[#FFF4ED] text-[#0B253A] font-black'
                  : 'border-slate-200 bg-white text-slate-600 font-bold'
              }`}
            >
              <span className="text-sm block">80mm (Standard)</span>
              <span className="text-[10px] text-slate-400 font-normal">Full 48-char receipts</span>
            </button>
            <button
              type="button"
              onClick={() => setPaperSize('58mm')}
              className={`p-3 rounded-2xl border-2 text-center transition-all ${
                paperSize === '58mm'
                  ? 'border-[#E66817] bg-[#FFF4ED] text-[#0B253A] font-black'
                  : 'border-slate-200 bg-white text-slate-600 font-bold'
              }`}
            >
              <span className="text-sm block">58mm (Compact)</span>
              <span className="text-[10px] text-slate-400 font-normal">Narrow 32-char receipts</span>
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

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="submit"
            className="px-4 py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            {printerToEdit ? 'Save Printer' : 'Register Printer'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
