import React, { useState } from 'react';
import { PosReportDocument } from './PosReportDocument';
import { ReportFullData, ReportDesign, PdfReportBuilder } from '../../services/pdfReportBuilder';
import { PosPrinterService } from '../../services/printerService';
import { db, PrintQueueRepository } from '@jamanvaar/database';
import { slipHeader } from '@jamanvaar/utils';
import {
  X,
  Download,
  Printer,
  ZoomIn,
  ZoomOut,
  Sparkles,
  CheckCircle2,
  FileText,
  RefreshCw
} from 'lucide-react';

interface PosReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: ReportFullData;
  initialDesign?: ReportDesign;
}

export const PosReportPreviewModal: React.FC<PosReportPreviewModalProps> = ({
  isOpen,
  onClose,
  reportData,
  initialDesign = 'CLASSIC'
}) => {
  const [selectedDesign, setSelectedDesign] = useState<ReportDesign>(initialDesign);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [feedback, setFeedback] = useState('');

  if (!isOpen) return null;

  const handleDownloadPdf = () => {
    setIsGeneratingPdf(true);
    setFeedback('Generating PDF document...');
    setTimeout(() => {
      try {
        const cleanPeriod = reportData.periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `JAMANVAAR_${reportData.title.replace(/\s+/g, '_')}_${cleanPeriod}.pdf`;
        PdfReportBuilder.downloadPdfFile(reportData, filename, selectedDesign);
        setFeedback('✓ PDF Downloaded successfully!');
      } catch (err: any) {
        setFeedback('⚠ Could not generate PDF. Please retry.');
      } finally {
        setIsGeneratingPdf(false);
        setTimeout(() => setFeedback(''), 3500);
      }
    }, 250);
  };

  const handlePrintReport = () => {
    const printer = PosPrinterService.getPrinterForRole('REPORT');
    const rawPayload = `
========================================
${slipHeader(db.restaurant.name)}
----------------------------------------
REPORT: ${reportData.title.toUpperCase()}
PERIOD: ${reportData.periodLabel}
GENERATED: ${reportData.generatedAt}
BY: ${reportData.generatedBy}
----------------------------------------
TOTAL NET SALES: Rs. ${reportData.summary.netSales}
TOTAL ORDERS: ${reportData.summary.ordersCount}
CASH: Rs. ${reportData.summary.paymentBreakdown.cash}
UPI: Rs. ${reportData.summary.paymentBreakdown.upi}
CARD: Rs. ${reportData.summary.paymentBreakdown.card}
TAX (GST): Rs. ${reportData.summary.totalTax}
----------------------------------------
Dispatched to ${printer.name}
========================================
    `.trim();

    PrintQueueRepository.addJob({
      type: 'SHIFT_REPORT',
      printerId: printer.id,
      printerName: printer.name,
      rawPayload,
      paperSize: printer.paperSize || '80mm'
    });

    setFeedback(`✓ Report dispatched to ${printer.name}`);
    setTimeout(() => setFeedback(''), 3500);
  };

  const designs: Array<{ id: ReportDesign; label: string; desc: string }> = [
    { id: 'CLASSIC', label: 'Classic', desc: 'Accounting standard' },
    { id: 'MODERN', label: 'Modern', desc: 'Executive dashboard' },
    { id: 'COMPACT', label: 'Compact', desc: 'High-density A4' },
    { id: 'STATEMENT', label: 'Statement', desc: 'Formal financial' },
    { id: 'BRANDED', label: 'Branded', desc: 'Heritage brand theme' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in select-none">
      <div className="bg-jaman-cream border border-jaman-border w-full max-w-4xl max-h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        
        {/* Top Modal Action Bar */}
        <div className="p-4 bg-white border-b border-jaman-border flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-jaman-saffron" />
            <div>
              <h2 className="font-extrabold text-sm text-jaman-navy">
                Report Preview & Export Studio
              </h2>
              <span className="text-[10px] text-slate-400">
                {reportData.title} • {reportData.periodLabel}
              </span>
            </div>
          </div>

          {/* Feedback Pill */}
          {feedback && (
            <div className="px-3 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl animate-in fade-in">
              {feedback}
            </div>
          )}

          {/* Controls: Zoom, Download, Print, Close */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Zoom */}
            <div className="hidden sm:flex items-center bg-jaman-cream border border-jaman-border rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(75, z - 15))}
                className="p-1 text-slate-500 hover:text-jaman-navy rounded-lg"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-mono font-bold px-2 text-slate-700">{zoomLevel}%</span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(130, z + 15))}
                className="p-1 text-slate-500 hover:text-jaman-navy rounded-lg"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrintReport}
              className="px-3 py-1.5 bg-jaman-cream hover:bg-[#F0EBE1] border border-jaman-border text-jaman-navy rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-95"
            >
              <Printer className="w-3.5 h-3.5 text-jaman-saffron" />
              <span className="hidden sm:inline">Print Report</span>
            </button>

            {/* Download PDF Button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="px-4 py-1.5 bg-jaman-saffron hover:bg-[#EA580C] text-white rounded-xl font-black text-xs flex items-center gap-1.5 shadow-sm shadow-jaman-saffron/25 transition-all active:scale-95 cursor-pointer"
            >
              {isGeneratingPdf ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Download PDF</span>
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-jaman-navy rounded-xl hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Design Template Selector Ribbon */}
        <div className="px-4 py-2 bg-jaman-cream border-b border-jaman-border flex items-center justify-between gap-2 overflow-x-auto shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase text-slate-400 mr-1 hidden sm:inline">
              Design Template:
            </span>
            {designs.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDesign(d.id)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  selectedDesign === d.id
                    ? 'bg-jaman-navy text-white shadow-xs'
                    : 'bg-white border border-jaman-border text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{d.label}</span>
              </button>
            ))}
          </div>

          <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
            A4 Standard Vector Document
          </span>
        </div>

        {/* Scrollable Document Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-200/50">
          <div
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
            className="w-full max-w-[780px] bg-white rounded-2xl shadow-xl transition-transform"
          >
            <PosReportDocument data={reportData} design={selectedDesign} />
          </div>
        </div>
      </div>
    </div>
  );
};
