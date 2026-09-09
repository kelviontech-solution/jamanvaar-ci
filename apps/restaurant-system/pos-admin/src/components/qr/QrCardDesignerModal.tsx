import React, { useState, useMemo, useEffect } from 'react';
import { DiningTable } from '@jamanvaar/types';
import { db, QrOrderingRepository } from '@jamanvaar/database';
import { generateQrSvg, generateQrDataUrl } from '@jamanvaar/utils';
import {
  Printer,
  Download,
  Copy,
  Check,
  X,
  QrCode,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

interface QrCardDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTable?: DiningTable | null;
  initialBatchMode?: boolean;
  /** Table numbers pre-selected in the Tables & QR grid, carried into the batch sheet. */
  initialBatchTableNumbers?: string[];
}

export type QrTemplateType = 'SIGNATURE' | 'ELEGANT' | 'MODERN' | 'MINIMAL' | 'PREMIUM';

export const QrCardDesignerModal: React.FC<QrCardDesignerModalProps> = ({
  isOpen,
  onClose,
  selectedTable,
  initialBatchMode = false,
  initialBatchTableNumbers
}) => {
  const [activeTemplate, setActiveTemplate] = useState<QrTemplateType>('SIGNATURE');
  const [tableNumber, setTableNumber] = useState<string>(selectedTable?.tableNumber || '');
  const [isBatchMode, setIsBatchMode] = useState<boolean>(initialBatchMode);
  const [selectedBatchTables, setSelectedBatchTables] = useState<string[]>(initialBatchTableNumbers || []);
  const [copied, setCopied] = useState<boolean>(false);
  const [tick, setTick] = useState<number>(0);

  useEffect(() => {
    const unsub = db.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setIsBatchMode(initialBatchMode);
    setSelectedBatchTables(initialBatchTableNumbers || []);
    if (selectedTable?.tableNumber) {
      setTableNumber(selectedTable.tableNumber);
    }
  }, [selectedTable, isOpen, initialBatchMode, initialBatchTableNumbers]);

  const tables = db.tables;
  const currentTable: DiningTable | undefined = useMemo(() => {
    return tables.find((t) => t.tableNumber === tableNumber) || tables[0];
  }, [tables, tableNumber, tick]);

  const outlet = db.outlet || { name: 'Ahmedabad Flagship Store' };

  // Host origin for the public QR link
  const hostUrl = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost:5176';

  /**
   * Read-only during render. Issuing a token is a db mutation (db.notify()), so it must
   * never happen inside the render path - tables missing a token render a clear
   * "not issued yet" state and are fixed from the Tables & QR tab instead.
   */
  const getTableQrUrl = (tbl: DiningTable): string | null => {
    if (!tbl.qrToken) return null;
    return `${hostUrl}/?qrTable=${tbl.tableNumber}&token=${tbl.qrToken}`;
  };

  const currentQrLink = currentTable ? getTableQrUrl(currentTable) : null;

  const handleCopyLink = () => {
    if (!currentQrLink) return;
    navigator.clipboard.writeText(currentQrLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  /** Issues QR tokens for any table in the sheet that has none, via the repository. */
  const handleIssueMissingTokens = (targets: DiningTable[]) => {
    const missing = targets.filter((t) => !t.qrToken);
    if (missing.length === 0) return;
    QrOrderingRepository.bulkGenerateQr(missing.map((t) => t.tableNumber));
    setTick((t) => t + 1);
  };

  const handleDownloadSvg = (tbl?: DiningTable) => {
    if (!tbl) return;
    let url = getTableQrUrl(tbl);
    if (!url) {
      const generated = QrOrderingRepository.generateTableQr(tbl.tableNumber);
      url = `${hostUrl}/?qrTable=${tbl.tableNumber}&token=${generated.qrToken}`;
      setTick((t) => t + 1);
    }
    const svgStr = generateQrSvg(url, {
      color: '#0B253A',
      backgroundColor: '#FFFFFF',
      margin: 2,
      size: 400
    });
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `JAMANVAAR-Table-${tbl.tableNumber}-QR.svg`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  if (!isOpen) return null;

  const batchPrintList: DiningTable[] = isBatchMode
    ? selectedBatchTables.length > 0
      ? tables.filter((t) => selectedBatchTables.includes(t.tableNumber))
      : tables
    : currentTable
    ? [currentTable]
    : [];

  const tablesMissingTokens = batchPrintList.filter((t) => !t.qrToken);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 select-none animate-in fade-in duration-200">
      {/* Print Specific CSS Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-qr-standee-container, #printable-qr-standee-container * {
            visibility: visible !important;
          }
          #printable-qr-standee-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            background: white !important;
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: wrap !important;
            gap: 24px !important;
            justify-content: center !important;
          }
          .standee-card-print {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-shadow: none !important;
            border: 2px solid #0B253A !important;
            margin-bottom: 24px !important;
          }
        }
      `}</style>

      <div className="bg-[#FAF7F2] border border-[#EBE6DD] w-full max-w-5xl max-h-[94vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-[#0B253A]">
        {/* Modal Top Header */}
        <div className="bg-[#0B253A] text-white px-6 py-4 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E66817]/20 border border-[#E66817]/40 flex items-center justify-center text-[#E66817]">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-wide">
                  {isBatchMode ? 'Batch Table QR Standee Print Suite' : 'Restaurant Table QR Standee Designer'}
                </h2>
                <span className="text-[10px] font-black bg-[#E66817] text-white px-2 py-0.5 rounded-full uppercase">
                  100% CAMERA SCANNABLE
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Official JAMANVAAR table tent cards with deterministic table tokens and direct guest menu routing.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsBatchMode((b) => !b)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isBatchMode
                  ? 'bg-amber-400 text-[#0B253A] font-black'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {isBatchMode ? 'Switch to Single View' : 'Switch to Batch Print'}
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: Controls Left, Live Standee Preview Right */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Config Panel */}
          <div className="md:col-span-5 border-r border-[#EBE6DD] bg-white p-5 overflow-y-auto space-y-5">
            {/* Table Selection / Batch Selection */}
            {!isBatchMode ? (
              <div className="space-y-1.5">
                <label className="text-xs font-black text-[#0B253A] uppercase tracking-wider">
                  Select Dining Table
                </label>
                <select
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-black text-[#0B253A] focus:outline-none focus:border-[#E66817] cursor-pointer"
                >
                  {tables.length === 0 ? (
                    <option value="">No tables configured yet</option>
                  ) : (
                    tables.map((t) => (
                      <option key={t.id} value={t.tableNumber}>
                        Table {t.tableNumber} • {t.zone} ({t.capacity} Seats) {t.qrStatus === 'DISABLED' ? '• DISABLED' : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-[#0B253A] uppercase tracking-wider">
                    Select Tables for Sheet
                  </label>
                  <button
                    onClick={() => {
                      if (selectedBatchTables.length === tables.length) {
                        setSelectedBatchTables([]);
                      } else {
                        setSelectedBatchTables(tables.map((t) => t.tableNumber));
                      }
                    }}
                    className="text-[11px] font-bold text-[#E66817] hover:underline cursor-pointer"
                  >
                    {selectedBatchTables.length === tables.length && tables.length > 0
                      ? 'Deselect All'
                      : `Select All (${tables.length})`}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto p-1 bg-[#FAF7F2] rounded-xl border border-[#EBE6DD]">
                  {tables.map((t) => {
                    const isChecked = selectedBatchTables.includes(t.tableNumber);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-1.5 p-2 rounded-lg text-xs font-black cursor-pointer border ${
                          isChecked
                            ? 'bg-amber-100/70 border-amber-300 text-amber-900'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBatchTables((prev) => [...prev, t.tableNumber]);
                            } else {
                              setSelectedBatchTables((prev) => prev.filter((x) => x !== t.tableNumber));
                            }
                          }}
                          className="accent-[#E66817] rounded"
                        />
                        <span>T-{t.tableNumber}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Template Selector */}
            <div className="space-y-2">
              <label className="text-xs font-black text-[#0B253A] uppercase tracking-wider flex items-center justify-between">
                <span>Design Theme</span>
                <span className="text-[10px] font-bold text-[#E66817]">Hospitality Styling</span>
              </label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: 'SIGNATURE', name: 'JAMANVAAR Royal Signature', desc: 'Warm saffron, royal navy & ivory foil' },
                  { id: 'ELEGANT', name: 'Deep Navy Imperial', desc: 'Luxury midnight navy with gold headers' },
                  { id: 'MODERN', name: 'Modern Ivory Card', desc: 'High-contrast crisp typography' },
                  { id: 'MINIMAL', name: 'Ink-Saver Monochrome', desc: 'Optimized for thermal and standard B&W print' }
                ].map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => setActiveTemplate(tpl.id as QrTemplateType)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      activeTemplate === tpl.id
                        ? 'bg-amber-50/80 border-[#E66817] shadow-xs ring-1 ring-[#E66817]'
                        : 'border-[#EBE6DD] hover:bg-[#FAF7F2]'
                    }`}
                  >
                    <div>
                      <h4 className="text-xs font-black text-[#0B253A]">{tpl.name}</h4>
                      <p className="text-[10px] text-slate-500">{tpl.desc}</p>
                    </div>
                    {activeTemplate === tpl.id && <Check className="w-4 h-4 text-[#E66817]" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Missing-token remediation, routed through the repository */}
            {tablesMissingTokens.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-start gap-2 text-amber-900">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-[11px] font-bold leading-snug">
                    {tablesMissingTokens.length}{' '}
                    {tablesMissingTokens.length === 1 ? 'table has' : 'tables have'} no QR token issued yet, so
                    {tablesMissingTokens.length === 1 ? ' its standee' : ' their standees'} cannot be printed.
                  </p>
                </div>
                <button
                  onClick={() => handleIssueMissingTokens(batchPrintList)}
                  className="w-full py-2 rounded-xl bg-[#0B253A] hover:bg-[#123959] text-white text-xs font-black transition-colors cursor-pointer"
                >
                  Issue Secure QR {tablesMissingTokens.length === 1 ? 'Token' : 'Tokens'} Now
                </button>
              </div>
            )}

            {/* Public Link & Copy */}
            <div className="bg-[#FAF7F2] p-3.5 rounded-2xl border border-[#EBE6DD] space-y-2 text-xs">
              <span className="text-[10px] font-black uppercase text-slate-400">Scannable Destination URL</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={currentQrLink || 'No QR token issued for this table yet'}
                  className="flex-1 bg-white border border-[#EBE6DD] rounded-xl px-2.5 py-1.5 text-[11px] font-mono text-slate-600 truncate"
                />
                <button
                  onClick={handleCopyLink}
                  disabled={!currentQrLink}
                  className="p-1.5 rounded-xl bg-white border border-[#EBE6DD] hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Copy Guest Link"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                {currentTable
                  ? `Encodes table identity: Table ${currentTable.tableNumber} (${currentTable.zone}).`
                  : 'Add a table in the Tables & QR tab to design a standee.'}
              </p>
            </div>

            {/* Print & Download Actions */}
            <div className="space-y-2 pt-2">
              <button
                onClick={handlePrint}
                disabled={batchPrintList.length === 0 || tablesMissingTokens.length > 0}
                className="w-full py-3 rounded-2xl bg-[#E66817] hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-orange-500/25 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Printer className="w-4 h-4" />
                <span>
                  {isBatchMode
                    ? `Print ${batchPrintList.length} ${batchPrintList.length === 1 ? 'Standee' : 'Standees'} Sheet`
                    : currentTable
                    ? `Print Table ${currentTable.tableNumber} Standee`
                    : 'No Table Selected'}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleDownloadSvg(currentTable)}
                  disabled={!currentTable}
                  className="py-2.5 rounded-xl bg-white border border-[#EBE6DD] hover:bg-[#FAF7F2] text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5 text-[#E66817]" />
                  <span>Download SVG</span>
                </button>

                {currentQrLink ? (
                  <a
                    href={currentQrLink}
                    target="_blank"
                    rel="noreferrer"
                    className="py-2.5 rounded-xl bg-white border border-[#EBE6DD] hover:bg-[#FAF7F2] text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#E66817]" />
                    <span>Open URL</span>
                  </a>
                ) : (
                  <span className="py-2.5 rounded-xl bg-slate-50 border border-[#EBE6DD] text-xs font-bold text-slate-400 flex items-center justify-center gap-1.5 text-center">
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open URL</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Live Standee Preview Area */}
          <div className="md:col-span-7 bg-[#EFEAE1] p-6 flex flex-col items-center justify-center overflow-y-auto min-h-[460px]">
            {/* Printable Container */}
            {batchPrintList.length === 0 && (
              <div className="text-center space-y-2 max-w-xs">
                <QrCode className="w-10 h-10 text-slate-400 mx-auto stroke-1" />
                <h4 className="text-sm font-black text-[#0B253A]">No tables to print</h4>
                <p className="text-xs text-slate-500">
                  Add restaurant tables in the Tables &amp; QR tab, then return here to design and print their
                  standees.
                </p>
              </div>
            )}

            <div id="printable-qr-standee-container" className="flex flex-wrap gap-6 justify-center items-center">
              {batchPrintList.map((tbl) => {
                const qrUrl = getTableQrUrl(tbl);
                const svgMarkup = qrUrl
                  ? generateQrSvg(qrUrl, {
                      color: activeTemplate === 'MINIMAL' ? '#000000' : '#0B253A',
                      backgroundColor: '#FFFFFF',
                      margin: 2,
                      size: 180
                    })
                  : null;

                return (
                  <div
                    key={tbl.id}
                    className={`standee-card-print w-72 rounded-3xl p-6 shadow-2xl border flex flex-col items-center text-center transition-all ${
                      activeTemplate === 'SIGNATURE'
                        ? 'bg-gradient-to-b from-[#FFF8F2] to-white border-[#FED7AA]'
                        : activeTemplate === 'ELEGANT'
                        ? 'bg-[#0B253A] text-white border-amber-400/40'
                        : activeTemplate === 'MODERN'
                        ? 'bg-white text-[#0B253A] border-slate-300'
                        : 'bg-white text-slate-900 border-slate-900'
                    }`}
                  >
                    {/* Brand Top Header */}
                    <div className="space-y-1">
                      <div
                        className={`inline-flex items-center justify-center w-10 h-10 rounded-2xl font-black text-sm mb-1 ${
                          activeTemplate === 'ELEGANT'
                            ? 'bg-[#E66817] text-white'
                            : 'bg-[#0B253A] text-white'
                        }`}
                      >
                        J
                      </div>
                      <h3
                        className={`text-base font-black tracking-widest uppercase ${
                          activeTemplate === 'ELEGANT' ? 'text-white' : 'text-[#0B253A]'
                        }`}
                      >
                        JAMANVAAR
                      </h3>
                      <p
                        className={`text-[9px] font-extrabold tracking-widest uppercase ${
                          activeTemplate === 'ELEGANT' ? 'text-amber-300' : 'text-[#E66817]'
                        }`}
                      >
                        {outlet.name}
                      </p>
                    </div>

                    {/* Table Number Standee Badge */}
                    <div
                      className={`mt-3 mb-2 px-6 py-1.5 rounded-2xl border ${
                        activeTemplate === 'ELEGANT'
                          ? 'bg-amber-400/10 border-amber-400/40 text-amber-300'
                          : 'bg-[#FFF4ED] border-[#FED7AA] text-[#E66817]'
                      }`}
                    >
                      <span className="text-[10px] font-black tracking-widest uppercase block">DINING TABLE</span>
                      <span className="text-2xl font-black font-mono leading-none">{tbl.tableNumber}</span>
                      <span className="text-[9px] font-bold opacity-75 block mt-0.5">{tbl.zone} • {tbl.capacity} Seats</span>
                    </div>

                    {/* Real Scannable QR Code Frame */}
                    <div className="bg-white p-3.5 rounded-2xl border border-slate-300 shadow-md my-2">
                      {svgMarkup ? (
                        <div
                          className="w-40 h-40 flex items-center justify-center"
                          dangerouslySetInnerHTML={{ __html: svgMarkup }}
                        />
                      ) : (
                        <div className="w-40 h-40 flex flex-col items-center justify-center gap-1.5 text-center text-slate-400 border-2 border-dashed border-slate-300 rounded-xl">
                          <AlertCircle className="w-6 h-6" />
                          <span className="text-[10px] font-black leading-tight px-2">
                            QR token not issued for this table
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Instruction Callout */}
                    <div className="space-y-1 mt-1">
                      <p
                        className={`text-xs font-black tracking-tight ${
                          activeTemplate === 'ELEGANT' ? 'text-white' : 'text-[#0B253A]'
                        }`}
                      >
                        Scan to View Menu & Order
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Camera scan • Instant kitchen dispatch • No app required
                      </p>
                    </div>

                    {/* Bottom Security Verification Code */}
                    <div className="mt-3 pt-2 border-t border-slate-200/50 w-full flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>{tbl.qrShortCode || `QR-TABLE-${tbl.tableNumber}`}</span>
                      <span>Verified Table ID</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
