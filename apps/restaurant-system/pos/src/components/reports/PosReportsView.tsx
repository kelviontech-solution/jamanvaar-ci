import React, { useState, useMemo } from 'react';
import { db, ReceiptRepository, PrintQueueRepository } from '@jamanvaar/database';
import { ReportGeneratorService, DailyReportSummary, TopItemStat } from '@jamanvaar/business';
import { PdfReportBuilder, ReportFullData, ReportDesign } from '../../services/pdfReportBuilder';
import { CsvExportService } from '../../services/csvExportService';
import { PosPrinterService } from '../../services/printerService';
import { PosReportDocument } from './PosReportDocument';
import { PosReportPreviewModal } from './PosReportPreviewModal';
import { usePosStore } from '../../store/posStore';
import { formatINR } from '@jamanvaar/utils';
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  FileSpreadsheet,
  Eye,
  RefreshCw,
  Sparkles,
  Layers,
  ChevronDown
} from 'lucide-react';

type DatePreset = 'TODAY' | 'YESTERDAY' | '7_DAYS' | '30_DAYS' | 'THIS_MONTH' | 'THIS_YEAR' | 'CUSTOM';

export const PosReportsView: React.FC = () => {
  const { currentUser } = usePosStore();
  const [selectedPeriod, setSelectedPeriod] = useState<DatePreset>('TODAY');
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedDesign, setSelectedDesign] = useState<ReportDesign>('CLASSIC');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [csvMenuOpen, setCsvMenuOpen] = useState(false);

  // Compute full report data using ReportGeneratorService
  const reportData = useMemo<ReportFullData>(() => {
    let sDate = new Date();
    let eDate = new Date();

    if (selectedPeriod === 'CUSTOM') {
      sDate = new Date(customStartDate + 'T00:00:00');
      eDate = new Date(customEndDate + 'T23:59:59');
    }

    const { summary, orders } = ReportGeneratorService.getReportForPeriod(
      selectedPeriod,
      selectedPeriod === 'CUSTOM' ? sDate : undefined,
      selectedPeriod === 'CUSTOM' ? eDate : undefined
    );

    const topItems = ReportGeneratorService.getTopSellingItems(
      selectedPeriod === 'CUSTOM' ? sDate : undefined,
      selectedPeriod === 'CUSTOM' ? eDate : undefined
    );

    // Cashier performance
    const cashierMap: Record<string, { name: string; count: number; sales: number; cash: number; upi: number; card: number }> = {};
    orders.forEach((o) => {
      const cName = o.kioskId || 'Cashier Desk';
      if (!cashierMap[cName]) {
        cashierMap[cName] = { name: cName, count: 0, sales: 0, cash: 0, upi: 0, card: 0 };
      }
      cashierMap[cName].count++;
      cashierMap[cName].sales += o.totalAmount;
      if (o.paymentMethod === 'CASH') cashierMap[cName].cash += o.totalAmount;
      else if (o.paymentMethod === 'UPI' || o.paymentMethod === 'UPI_QR') cashierMap[cName].upi += o.totalAmount;
      else if (o.paymentMethod === 'CARD') cashierMap[cName].card += o.totalAmount;
    });

    const cashiers = Object.values(cashierMap).map((c) => ({
      name: c.name,
      ordersCount: c.count,
      netSales: c.sales,
      cash: c.cash,
      upi: c.upi,
      card: c.card
    }));

    let title = 'POS Daily Sales Report';
    if (selectedPeriod === '7_DAYS') title = '7-Day Sales & Tax Summary';
    else if (selectedPeriod === '30_DAYS') title = '30-Day Operational Report';
    else if (selectedPeriod === 'THIS_MONTH') title = 'Monthly Revenue Statement';
    else if (selectedPeriod === 'THIS_YEAR') title = 'Annual Financial Statement';
    else if (selectedPeriod === 'CUSTOM') title = 'Custom Period Operational Report';

    return {
      title,
      periodLabel: summary.dateStr,
      startDate: sDate.toISOString(),
      endDate: eDate.toISOString(),
      generatedAt: new Date().toLocaleString('en-IN'),
      generatedBy: currentUser?.fullName || 'Cashier',
      summary,
      topItems,
      cashiers
    };
  }, [selectedPeriod, customStartDate, customEndDate, currentUser]);

  const handleDownloadPdf = () => {
    setIsDownloadingPdf(true);
    setFeedback('Generating PDF document...');
    setTimeout(() => {
      try {
        const cleanPeriod = reportData.periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `JAMANVAAR_${reportData.title.replace(/\s+/g, '_')}_${cleanPeriod}.pdf`;
        PdfReportBuilder.downloadPdfFile(reportData, filename, selectedDesign);
        setFeedback('✓ PDF Downloaded successfully!');
      } catch (err: any) {
        setFeedback('⚠ Could not generate PDF');
      } finally {
        setIsDownloadingPdf(false);
        setTimeout(() => setFeedback(''), 3500);
      }
    }, 200);
  };

  const handlePrintReport = () => {
    const printer = PosPrinterService.getPrinterForRole('REPORT');
    const rawPayload = `
========================================
             JAMANVAAR POS
     BY KELVIONTECH • REPORT SPOOLER
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

  const periodOptions: Array<{ id: DatePreset; label: string }> = [
    { id: 'TODAY', label: 'Today' },
    { id: 'YESTERDAY', label: 'Yesterday' },
    { id: '7_DAYS', label: '7 Days' },
    { id: '30_DAYS', label: '30 Days' },
    { id: 'THIS_MONTH', label: 'This Month' },
    { id: 'THIS_YEAR', label: 'This Year' },
    { id: 'CUSTOM', label: 'Custom Date' }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-jaman-cream p-4 sm:p-6 overflow-hidden select-none space-y-4">
      {/* Top Header Bar & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-jaman-navy flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-jaman-saffron" />
            <span>POS Operational Reports</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Sales, payments, taxes, orders and dish performance.
          </p>
        </div>

        {/* Action Buttons: Preview, PDF, Print, CSV */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Feedback message */}
          {feedback && (
            <div className="px-3 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl animate-in fade-in">
              {feedback}
            </div>
          )}

          {/* Preview Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="px-3 py-2 rounded-xl bg-white border border-jaman-border hover:border-slate-400 text-xs font-bold text-jaman-navy flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="Preview full report document"
          >
            <Eye className="w-4 h-4 text-jaman-saffron" />
            <span>Preview Report</span>
          </button>

          {/* Direct Print to POS Report Printer */}
          <button
            type="button"
            onClick={handlePrintReport}
            className="px-3 py-2 rounded-xl bg-white border border-jaman-border hover:border-slate-400 text-xs font-bold text-jaman-navy flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="Send report directly to configured POS report printer"
          >
            <Printer className="w-4 h-4 text-jaman-navy" />
            <span>Print Report</span>
          </button>

          {/* Direct PDF Download */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="px-3.5 py-2 rounded-xl bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-black flex items-center gap-1.5 shadow-sm shadow-jaman-saffron/25 transition-all active:scale-95 cursor-pointer"
            title="Download direct PDF file without browser print dialogs"
          >
            {isDownloadingPdf ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>Download PDF</span>
          </button>

          {/* CSV Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setCsvMenuOpen((o) => !o)}
              className="px-3 py-2 rounded-xl bg-white border border-jaman-border hover:border-slate-400 text-xs font-bold text-jaman-navy flex items-center gap-1.5 shadow-2xs"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Export CSV</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {csvMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-48 bg-white border border-jaman-border rounded-2xl shadow-xl p-1.5 text-xs text-jaman-navy z-40 animate-in fade-in"
                onMouseLeave={() => setCsvMenuOpen(false)}
              >
                <button
                  onClick={() => {
                    setCsvMenuOpen(false);
                    const { orders } = ReportGeneratorService.getReportForPeriod(selectedPeriod);
                    CsvExportService.exportOrders(orders, reportData.periodLabel);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-jaman-cream rounded-xl font-bold"
                >
                  Export Orders CSV
                </button>
                <button
                  onClick={() => {
                    setCsvMenuOpen(false);
                    CsvExportService.exportFinancialSummary(reportData.summary, reportData.periodLabel);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-jaman-cream rounded-xl font-bold"
                >
                  Export Sales & Tax CSV
                </button>
                <button
                  onClick={() => {
                    setCsvMenuOpen(false);
                    CsvExportService.exportTopItems(reportData.topItems, reportData.periodLabel);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-jaman-cream rounded-xl font-bold"
                >
                  Export Top Dishes CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Date Filter & Design Selector Bar */}
      <div className="bg-white border border-jaman-border rounded-2xl p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Preset Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {periodOptions.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPeriod(p.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedPeriod === p.id
                  ? 'bg-jaman-navy text-white shadow-2xs'
                  : 'bg-jaman-cream text-slate-700 hover:bg-slate-100 border border-jaman-border'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom Date Pickers */}
        {selectedPeriod === 'CUSTOM' && (
          <div className="flex items-center gap-2 text-xs font-bold animate-in fade-in">
            <span className="text-slate-400">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-jaman-cream border border-jaman-border rounded-xl px-2.5 py-1 text-xs font-bold text-jaman-navy focus:outline-none"
            />
            <span className="text-slate-400">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-jaman-cream border border-jaman-border rounded-xl px-2.5 py-1 text-xs font-bold text-jaman-navy focus:outline-none"
            />
          </div>
        )}

        {/* Template Style Selector */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400">Report Design:</span>
          <select
            value={selectedDesign}
            onChange={(e) => setSelectedDesign(e.target.value as ReportDesign)}
            className="bg-jaman-cream border border-jaman-border rounded-xl px-2.5 py-1 text-xs font-bold text-jaman-navy focus:outline-none"
          >
            <option value="CLASSIC">Classic Accounting</option>
            <option value="MODERN">Modern Dashboard</option>
            <option value="COMPACT">Compact A4</option>
            <option value="STATEMENT">Financial Statement</option>
            <option value="BRANDED">Restaurant Branded</option>
          </select>
        </div>
      </div>

      {/* Main Scrollable Report Document Area */}
      <div className="flex-1 bg-white border border-jaman-border rounded-3xl overflow-y-auto shadow-2xs">
        <PosReportDocument data={reportData} design={selectedDesign} />
      </div>

      {/* Interactive Report Preview Modal */}
      <PosReportPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        reportData={reportData}
        initialDesign={selectedDesign}
      />
    </div>
  );
};
