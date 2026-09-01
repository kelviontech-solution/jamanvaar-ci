import React, { useState } from 'react';
import { DiningTable } from '@jamanvaar/types';
import { db } from '@jamanvaar/database';
import {
  Printer,
  Download,
  Copy,
  Check,
  X,
  Sparkles,
  QrCode,
  Layers,
  Palette,
  Eye,
  Sliders
} from 'lucide-react';

interface QrCardDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTable?: DiningTable | null;
}

export type QrTemplateType = 'SIGNATURE' | 'ELEGANT' | 'MODERN' | 'MINIMAL' | 'PREMIUM';

export const QrCardDesignerModal: React.FC<QrCardDesignerModalProps> = ({
  isOpen,
  onClose,
  selectedTable
}) => {
  const [activeTemplate, setActiveTemplate] = useState<QrTemplateType>('SIGNATURE');
  const [tableNumber, setTableNumber] = useState<string>(selectedTable?.tableNumber || '12');
  const [includeWifiInfo, setIncludeWifiInfo] = useState<boolean>(true);
  const [customSubtitle, setCustomSubtitle] = useState<string>('Scan to view menu & order directly from your table');
  const [copied, setCopied] = useState<boolean>(false);

  const tables = db.tables;
  const currentTable = tables.find((t) => t.tableNumber === tableNumber) || {
    tableNumber,
    zone: 'AC Balcony',
    capacity: 4
  };

  const qrShortCode = `QR-TABLE-${currentTable.tableNumber.padStart(3, '0')}`;
  const qrLink = `https://jamanvaar.menu/table/${currentTable.tableNumber}?code=${qrShortCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Generate simple SVG download
    const svgEl = document.getElementById('printable-qr-card');
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JAMANVAAR-Table-${currentTable.tableNumber}-QR.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 select-none animate-in fade-in duration-200">
      <div className="bg-[#FAF7F2] border border-[#EBE6DD] w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-[#0B253A]">
        {/* Modal Top Header */}
        <div className="bg-[#0B253A] text-white px-6 py-4 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E66817]/20 border border-[#E66817]/40 flex items-center justify-center text-[#E66817]">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-wide">Restaurant Table QR Standee Designer</h2>
                <span className="text-[10px] font-black bg-[#E66817] text-white px-2 py-0.5 rounded-full">
                  PRINT READY
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Generate high-resolution printable QR tent cards and standees for tables.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Controls Left, Live Standee Preview Right */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Config Panel */}
          <div className="md:col-span-5 border-r border-[#EBE6DD] bg-white p-5 overflow-y-auto space-y-5">
            {/* Table Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-[#0B253A] uppercase tracking-wider">
                Select Table
              </label>
              <select
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-black text-[#0B253A] focus:outline-none focus:border-[#E66817] cursor-pointer"
              >
                {tables.map((t) => (
                  <option key={t.id} value={t.tableNumber}>
                    Table {t.tableNumber} • {t.zone} ({t.capacity} Seats)
                  </option>
                ))}
              </select>
            </div>

            {/* Template Selector */}
            <div className="space-y-2">
              <label className="text-xs font-black text-[#0B253A] uppercase tracking-wider flex items-center justify-between">
                <span>Design Template</span>
                <span className="text-[10px] font-bold text-[#E66817]">5 Themes</span>
              </label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: 'SIGNATURE', name: 'JAMANVAAR Signature', desc: 'Warm brand orange with heritage pattern' },
                  { id: 'ELEGANT', name: 'Royal Elegant', desc: 'Deep navy with gold foil styled accents' },
                  { id: 'MODERN', name: 'Clean Modern', desc: 'Minimalist geometry with high contrast' },
                  { id: 'PREMIUM', name: 'Midnight Dark', desc: 'Sleek luxury dark slate aesthetic' },
                  { id: 'MINIMAL', name: 'Eco Minimal', desc: 'Ink-saver monochrome standee layout' }
                ].map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => setActiveTemplate(tpl.id as QrTemplateType)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      activeTemplate === tpl.id
                        ? 'bg-amber-50/70 border-[#E66817] shadow-xs'
                        : 'border-[#EBE6DD] hover:bg-[#FAF7F2]'
                    }`}
                  >
                    <div>
                      <h4 className="text-xs font-black text-[#0B253A]">{tpl.name}</h4>
                      <p className="text-[10px] text-slate-500">{tpl.desc}</p>
                    </div>
                    {activeTemplate === tpl.id && (
                      <span className="w-5 h-5 rounded-full bg-[#E66817] text-white flex items-center justify-center text-[10px]">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Subtitle */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-[#0B253A] uppercase tracking-wider">
                Call to Action Text
              </label>
              <input
                type="text"
                value={customSubtitle}
                onChange={(e) => setCustomSubtitle(e.target.value)}
                className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs text-[#0B253A] focus:outline-none focus:border-[#E66817]"
              />
            </div>

            {/* Wi-Fi Details Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#EBE6DD]">
              <div>
                <span className="text-xs font-black text-[#0B253A] block">Include Guest Wi-Fi Note</span>
                <span className="text-[10px] text-slate-500">SSID: JAMANVAAR_GUEST (Free)</span>
              </div>
              <input
                type="checkbox"
                checked={includeWifiInfo}
                onChange={(e) => setIncludeWifiInfo(e.target.checked)}
                className="w-4 h-4 text-[#E66817] rounded cursor-pointer accent-[#E66817]"
              />
            </div>

            {/* Quick Actions */}
            <div className="pt-2 border-t border-[#EBE6DD] space-y-2">
              <button
                onClick={handleCopyLink}
                className="w-full py-2 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Link Copied to Clipboard!' : 'Copy Direct QR URL'}</span>
              </button>
            </div>
          </div>

          {/* Right Live Standee Preview */}
          <div className="md:col-span-7 bg-[#EFEAE1] p-6 flex flex-col items-center justify-center overflow-y-auto">
            {/* Standee Tent Card */}
            <div
              id="printable-qr-card"
              className={`w-72 sm:w-80 rounded-3xl p-6 shadow-2xl border flex flex-col items-center text-center transition-all ${
                activeTemplate === 'SIGNATURE'
                  ? 'bg-gradient-to-b from-[#FFF8F2] to-white border-[#FED7AA]'
                  : activeTemplate === 'ELEGANT'
                  ? 'bg-[#0B253A] text-white border-amber-400/40'
                  : activeTemplate === 'MODERN'
                  ? 'bg-white text-[#0B253A] border-slate-300'
                  : activeTemplate === 'PREMIUM'
                  ? 'bg-gradient-to-b from-[#172334] to-[#0B1522] text-white border-slate-700'
                  : 'bg-white text-slate-900 border-slate-900'
              }`}
            >
              {/* Brand Top Header */}
              <div className="space-y-1">
                <div
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-2xl font-black text-sm mb-1 ${
                    activeTemplate === 'ELEGANT' || activeTemplate === 'PREMIUM'
                      ? 'bg-[#E66817] text-white'
                      : 'bg-[#0B253A] text-white'
                  }`}
                >
                  J
                </div>
                <h3
                  className={`text-base font-black tracking-wider uppercase ${
                    activeTemplate === 'ELEGANT' || activeTemplate === 'PREMIUM' ? 'text-white' : 'text-[#0B253A]'
                  }`}
                >
                  JAMANVAAR
                </h3>
                <p
                  className={`text-[10px] font-bold tracking-widest uppercase ${
                    activeTemplate === 'ELEGANT'
                      ? 'text-amber-300'
                      : activeTemplate === 'PREMIUM'
                      ? 'text-slate-400'
                      : 'text-[#E66817]'
                  }`}
                >
                  Authentic Dining Experience
                </p>
              </div>

              {/* Table Number Standee Badge */}
              <div
                className={`mt-4 mb-3 px-5 py-1.5 rounded-2xl border ${
                  activeTemplate === 'ELEGANT'
                    ? 'bg-amber-400/10 border-amber-400/40 text-amber-300'
                    : activeTemplate === 'PREMIUM'
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-[#FFF4ED] border-[#FED7AA] text-[#E66817]'
                }`}
              >
                <span className="text-[11px] font-black tracking-widest uppercase block">TABLE</span>
                <span className="text-2xl font-black font-mono leading-none">{currentTable.tableNumber}</span>
                <span className="text-[9px] font-bold text-slate-400 block mt-0.5">{currentTable.zone}</span>
              </div>

              {/* QR Code Frame */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-md my-2">
                {/* SVG Deterministic QR Code Mockup */}
                <svg className="w-36 h-36 mx-auto" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Outer corner squares */}
                  <rect x="5" y="5" width="26" height="26" rx="4" stroke="#0B253A" strokeWidth="4" fill="none" />
                  <rect x="11" y="11" width="14" height="14" rx="2" fill="#0B253A" />
                  <rect x="69" y="5" width="26" height="26" rx="4" stroke="#0B253A" strokeWidth="4" fill="none" />
                  <rect x="75" y="11" width="14" height="14" rx="2" fill="#0B253A" />
                  <rect x="5" y="69" width="26" height="26" rx="4" stroke="#0B253A" strokeWidth="4" fill="none" />
                  <rect x="11" y="75" width="14" height="14" rx="2" fill="#0B253A" />

                  {/* QR Matrix Grid Dots */}
                  <rect x="37" y="10" width="6" height="6" fill="#E66817" />
                  <rect x="47" y="10" width="6" height="6" fill="#0B253A" />
                  <rect x="57" y="10" width="6" height="6" fill="#0B253A" />
                  <rect x="37" y="20" width="6" height="6" fill="#0B253A" />
                  <rect x="57" y="20" width="6" height="6" fill="#E66817" />
                  <rect x="10" y="37" width="6" height="6" fill="#0B253A" />
                  <rect x="20" y="37" width="6" height="6" fill="#0B253A" />
                  <rect x="37" y="37" width="10" height="10" rx="2" fill="#E66817" />
                  <rect x="53" y="37" width="10" height="10" rx="2" fill="#0B253A" />
                  <rect x="69" y="37" width="6" height="6" fill="#0B253A" />
                  <rect x="79" y="37" width="6" height="6" fill="#E66817" />
                  <rect x="89" y="37" width="6" height="6" fill="#0B253A" />
                  <rect x="37" y="53" width="6" height="6" fill="#0B253A" />
                  <rect x="47" y="53" width="6" height="6" fill="#E66817" />
                  <rect x="57" y="53" width="6" height="6" fill="#0B253A" />
                  <rect x="10" y="57" width="6" height="6" fill="#0B253A" />
                  <rect x="79" y="57" width="6" height="6" fill="#0B253A" />
                  <rect x="37" y="69" width="6" height="6" fill="#E66817" />
                  <rect x="47" y="69" width="6" height="6" fill="#0B253A" />
                  <rect x="57" y="69" width="6" height="6" fill="#0B253A" />
                  <rect x="69" y="69" width="6" height="6" fill="#0B253A" />
                  <rect x="79" y="69" width="6" height="6" fill="#E66817" />
                  <rect x="89" y="69" width="6" height="6" fill="#0B253A" />
                  <rect x="37" y="79" width="6" height="6" fill="#0B253A" />
                  <rect x="57" y="79" width="6" height="6" fill="#0B253A" />
                  <rect x="69" y="79" width="6" height="6" fill="#E66817" />
                  <rect x="89" y="79" width="6" height="6" fill="#0B253A" />
                  <rect x="37" y="89" width="6" height="6" fill="#E66817" />
                  <rect x="47" y="89" width="6" height="6" fill="#0B253A" />
                  <rect x="57" y="89" width="6" height="6" fill="#0B253A" />
                  <rect x="79" y="89" width="6" height="6" fill="#0B253A" />
                </svg>
                <span className="font-mono text-[9px] font-bold text-slate-400 tracking-wider mt-1 block">
                  {qrShortCode}
                </span>
              </div>

              {/* Instructions */}
              <div className="space-y-1 mt-2">
                <span
                  className={`text-xs font-black tracking-wide block ${
                    activeTemplate === 'ELEGANT' || activeTemplate === 'PREMIUM' ? 'text-white' : 'text-[#0B253A]'
                  }`}
                >
                  📱 Scan with Camera to Order
                </span>
                <p className="text-[10px] text-slate-400 px-2 leading-tight">{customSubtitle}</p>
              </div>

              {/* Wi-Fi Note */}
              {includeWifiInfo && (
                <div
                  className={`mt-4 pt-3 border-t w-full text-[9px] font-bold ${
                    activeTemplate === 'ELEGANT' || activeTemplate === 'PREMIUM'
                      ? 'border-white/10 text-slate-400'
                      : 'border-slate-200 text-slate-500'
                  }`}
                >
                  <span>📶 Free Guest Wi-Fi: <strong>JAMANVAAR_GUEST</strong></span>
                </div>
              )}
            </div>

            {/* Bottom Standee Actions */}
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handlePrint}
                className="bg-[#E66817] hover:bg-[#EA580C] text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-[#E66817]/30 transition-all active:scale-95 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Table {currentTable.tableNumber} Standee</span>
              </button>
              <button
                onClick={handleDownload}
                className="bg-white hover:bg-slate-50 text-[#0B253A] border border-[#EBE6DD] px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download SVG</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
