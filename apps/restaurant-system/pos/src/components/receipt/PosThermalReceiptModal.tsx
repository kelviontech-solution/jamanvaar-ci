import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, ReceiptRepository, PrintQueueRepository } from '@jamanvaar/database';
import { PosPrinterService } from '../../services/printerService';
import { EBillService } from '@jamanvaar/api';
import { sendReceipt } from '../../cloud/cloudClient';
import { ThermalReceiptView } from '@jamanvaar/ui';
import {
  X,
  Printer,
  Phone,
  Mail,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Download,
  RotateCcw,
  Sliders,
  Share2
} from 'lucide-react';

export const PosThermalReceiptModal: React.FC = () => {
  const {
    isReceiptOpen,
    setIsReceiptOpen,
    lastCompletedOrder,
    setIsPrintQueueOpen
  } = usePosStore();

  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [printStatus, setPrintStatus] = useState<'IDLE' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState('');
  const [sendError, setSendError] = useState('');
  const [phonePromptOpen, setPhonePromptOpen] = useState(false);
  const [inputPhone, setInputPhone] = useState('');
  const [pendingChannel, setPendingChannel] = useState<'WHATSAPP' | 'SMS'>('WHATSAPP');

  if (!isReceiptOpen || !lastCompletedOrder) return null;

  const config = ReceiptRepository.getConfig();
  const order = lastCompletedOrder;

  const handlePrint = async () => {
    try {
      const job = await PosPrinterService.printOrderReceipt(order, paperWidth);
      setActiveJobId(job.id);

      // Check if printer is simulated as offline/warning, or a real
      // NETWORK_LAN dispatch genuinely failed.
      if (job.status === 'FAILED') {
        setPrintStatus('FAILED');
        setErrorMessage(job.errorMessage || 'Hardware printer offline or paper out');
      } else {
        setPrintStatus('SUCCESS');
        setTimeout(() => setPrintStatus('IDLE'), 3000);
      }
    } catch (err: any) {
      setPrintStatus('FAILED');
      setErrorMessage(err?.message || 'Failed to dispatch ESC/POS command');
    }
  };

  const handleRetryPrint = () => {
    if (activeJobId) {
      const retried = PrintQueueRepository.retryJob(activeJobId);
      if (retried && retried.status === 'SUCCESS') {
        setPrintStatus('SUCCESS');
        setTimeout(() => setPrintStatus('IDLE'), 3000);
      } else {
        setPrintStatus('FAILED');
      }
    } else {
      handlePrint();
    }
  };

  const handleWhatsAppClick = () => {
    if (!order.customerPhone) {
      setPendingChannel('WHATSAPP');
      setPhonePromptOpen(true);
    } else {
      dispatchDigitalReceipt('WHATSAPP', order.customerPhone);
    }
  };

  const dispatchDigitalReceipt = async (channel: 'WHATSAPP' | 'SMS', targetPhone: string) => {
    if (!EBillService.validateIndianPhone(targetPhone)) {
      setSendError('Enter a valid 10-digit Indian mobile number');
      setTimeout(() => setSendError(''), 4000);
      return;
    }
    setPhonePromptOpen(false);
    const res =
      channel === 'WHATSAPP'
        ? await EBillService.sendWhatsAppEBill(order, targetPhone, config, sendReceipt)
        : await EBillService.sendSmsEBill(order, targetPhone, sendReceipt);
    ReceiptRepository.addRecord(res.record);
    if (res.success) {
      setShareToast(res.message);
      setTimeout(() => setShareToast(''), 3000);
    } else {
      setSendError(res.message);
      setTimeout(() => setSendError(''), 4000);
    }
  };

  const handleDownloadTxt = () => {
    const rawText = PosPrinterService.generateReceiptText(order, paperWidth);
    const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jamanvaar_receipt_${order.orderNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setShareToast('Receipt plain text downloaded!');
    setTimeout(() => setShareToast(''), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="bg-white border-b border-[#EBE6DD] text-[#0B253A] p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Printer className="w-5 h-5 text-[#E66817]" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#0B253A] leading-tight">PRINT RECEIPT</h2>
                <span className="bg-[#FFF4ED] text-[#E66817] text-[10px] font-black px-2 py-0.5 rounded border border-[#FDBA74]">
                  {order.paymentMethod}
                </span>
              </div>
              <span className="text-xs text-slate-500">
                Order #{order.orderNumber} • Token #{order.tokenNumber}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Paper Size Switcher */}
            <div className="bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl p-0.5 flex text-xs">
              <button
                onClick={() => setPaperWidth('80mm')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  paperWidth === '80mm'
                    ? 'bg-[#E66817] text-white shadow-xs'
                    : 'text-slate-500 hover:text-[#0B253A]'
                }`}
              >
                80mm
              </button>
              <button
                onClick={() => setPaperWidth('58mm')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  paperWidth === '58mm'
                    ? 'bg-[#E66817] text-white shadow-xs'
                    : 'text-slate-500 hover:text-[#0B253A]'
                }`}
              >
                58mm
              </button>
            </div>

            <button
              onClick={() => setIsReceiptOpen(false)}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-[#0B253A] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Body (Simulating Real ESC/POS Thermal Output) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-200/70 flex flex-col items-center justify-start">
          <ThermalReceiptView
            order={order}
            config={config}
            paperSize={paperWidth}
            showQrCode={true}
          />
        </div>

        {/* Status Banners */}
        {shareToast && (
          <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs font-bold text-center border-t border-emerald-200">
            ✓ {shareToast}
          </div>
        )}

        {sendError && (
          <div className="p-2.5 bg-rose-50 text-rose-900 text-xs font-bold text-center border-t border-rose-200">
            ⚠ {sendError}
          </div>
        )}

        {printStatus === 'SUCCESS' && (
          <div className="p-2.5 bg-emerald-500 text-white text-xs font-bold text-center flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>Thermal print command dispatched to ESC/POS hardware printer ({paperWidth})!</span>
          </div>
        )}

        {printStatus === 'FAILED' && (
          <div className="p-3 bg-rose-50 border-t border-rose-200 text-rose-900 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>⚠ Printer unavailable ({errorMessage || 'Check USB/LAN connection'})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleRetryPrint}
                className="px-2.5 py-1 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry Print</span>
              </button>
              <button
                onClick={() => setIsPrintQueueOpen(true)}
                className="px-2.5 py-1 bg-white border border-rose-300 text-rose-800 font-bold rounded-lg hover:bg-rose-100"
              >
                Choose Printer
              </button>
              <button
                onClick={() => setIsReceiptOpen(false)}
                className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-100"
              >
                Print Later
              </button>
            </div>
          </div>
        )}

        {/* Customer Phone Prompt for WhatsApp/SMS Share */}
        {phonePromptOpen && (
          <div className="p-3 bg-[#0B253A] text-white border-t border-[#1E3A4C] flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Enter Customer {pendingChannel === 'WHATSAPP' ? 'WhatsApp' : 'Mobile'} #:</span>
            <div className="flex items-center gap-1.5">
              <input
                type="tel"
                placeholder="10-digit mobile"
                value={inputPhone}
                onChange={(e) => setInputPhone(e.target.value)}
                className="bg-[#0B2B39] border border-[#1E3A4C] rounded-lg px-2 py-1 text-xs text-white w-36 font-mono focus:outline-hidden focus:border-[#E66817]"
              />
              <button
                onClick={() => dispatchDigitalReceipt(pendingChannel, inputPhone)}
                className="px-3 py-1 bg-[#E66817] text-white rounded-lg font-bold text-xs"
              >
                Send
              </button>
              <button
                onClick={() => setPhonePromptOpen(false)}
                className="px-2 py-1 bg-white/10 text-slate-300 rounded-lg text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Bottom Actions Bar */}
        <div className="bg-white border-t border-[#EBE6DD] p-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Digital Receipt Options */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleWhatsAppClick}
              className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="Share E-Bill via WhatsApp"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={() => {
                if (order.customerPhone) {
                  dispatchDigitalReceipt('SMS', order.customerPhone);
                } else {
                  setPendingChannel('SMS');
                  setPhonePromptOpen(true);
                }
              }}
              className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>SMS</span>
            </button>

            <button
              onClick={handleDownloadTxt}
              className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="Download Plain ESC/POS TXT"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save TXT</span>
            </button>
          </div>

          {/* Primary & Done Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsReceiptOpen(false)}
              className="px-5 py-2.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Done</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-6 py-2.5 rounded-xl bg-[#E66817] hover:bg-[#F97316] text-white font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-[#E66817]/25 transition-transform active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Print Receipt</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
