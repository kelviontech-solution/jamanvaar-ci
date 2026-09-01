import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, PrintQueueRepository } from '@jamanvaar/database';
import { PrintJob, PrintJobStatus } from '@jamanvaar/types';
import { sound } from '@jamanvaar/ui';
import { PosPrinterService } from '../../services/printerService';
import {
  Printer,
  X,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  Layers,
  ChevronRight,
  Sparkles
} from 'lucide-react';

export const PosPrintQueueModal: React.FC = () => {
  const { isPrintQueueOpen, setIsPrintQueueOpen } = usePosStore();
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);
  const [retryFeedback, setRetryFeedback] = useState('');

  if (!isPrintQueueOpen) return null;

  const jobs = PrintQueueRepository.getAllJobs();

  const handleRetry = (jobId: string) => {
    sound.play('click');
    PrintQueueRepository.retryJob(jobId);
    setRetryFeedback(`Dispatched print retry command!`);
    setTimeout(() => setRetryFeedback(''), 2500);
  };

  const handleClearCompleted = () => {
    sound.play('click');
    PrintQueueRepository.clearCompleted();
  };

  const handleTestPrint = () => {
    sound.play('order');
    const defaultPrinter = db.configuredPrinters[0]?.id || 'printer-receipt-01';
    PosPrinterService.printTestSlip(defaultPrinter, '80mm');
    setRetryFeedback(`Dispatched diagnostic test slip to ${db.configuredPrinters[0]?.name || 'Receipt Printer'}!`);
    setTimeout(() => setRetryFeedback(''), 3000);
  };

  const getStatusBadge = (status: PrintJobStatus) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>PRINTED</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            <span>FAILED</span>
          </span>
        );
      case 'PRINTING':
        return (
          <span className="text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Clock className="w-3 h-3 animate-spin" />
            <span>PRINTING</span>
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
            QUEUED
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#0B253A] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Printer className="w-5 h-5 text-[#E66817]" />
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Hardware Print Queue</h2>
              <span className="text-xs text-slate-300">
                {jobs.length} jobs in queue • ESC/POS Thermal Output
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestPrint}
              className="px-2.5 py-1 rounded-lg bg-[#E66817] hover:bg-[#EA580C] text-xs font-bold text-white flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer"
              title="Send diagnostic test slip to default receipt printer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Test Print</span>
            </button>

            {jobs.some((j) => j.status === 'SUCCESS') && (
              <button
                onClick={handleClearCompleted}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-200"
              >
                Clear Completed
              </button>
            )}

            <button
              onClick={() => setIsPrintQueueOpen(false)}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {retryFeedback && (
          <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs font-bold text-center border-b border-emerald-200">
            ✓ {retryFeedback}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {jobs.length > 0 ? (
            jobs.map((job) => (
              <div
                key={job.id}
                className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-400 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-[#0B253A]">{job.id}</span>
                    <span className="text-[10px] font-extrabold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      {job.type}
                    </span>
                    {job.targetStation && (
                      <span className="text-[10px] font-bold bg-[#E66817]/10 text-[#E66817] px-2 py-0.5 rounded">
                        Station: {job.targetStation}
                      </span>
                    )}
                    {getStatusBadge(job.status)}
                  </div>

                  <div className="text-xs text-slate-500 flex items-center gap-3">
                    <span>Printer: <strong>{job.printerName}</strong></span>
                    <span>•</span>
                    <span>{new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {job.orderNumber && (
                      <>
                        <span>•</span>
                        <span>Order #{job.orderNumber}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => setSelectedJob(job)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1"
                    title="View Raw ESC/POS Payload"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Raw</span>
                  </button>

                  <button
                    onClick={() => handleRetry(job.id)}
                    className="px-3 py-2 rounded-xl bg-[#E66817] hover:bg-[#F97316] text-white text-xs font-bold flex items-center gap-1 shadow-2xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reprint</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-center text-slate-400 my-auto">
              <Printer className="w-10 h-10 text-slate-300 mb-2 stroke-1" />
              <h4 className="font-bold text-sm text-[#0B253A]">Print Queue Empty</h4>
              <p className="text-xs text-slate-400 mt-0.5">Dispatched receipt and KOT tickets will appear here.</p>
            </div>
          )}
        </div>

        {/* Raw ESC/POS Payload Viewer Modal */}
        {selectedJob && (
          <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-sm font-bold text-[#0B253A]">Raw ESC/POS Thermal Payload</h3>
                <button onClick={() => setSelectedJob(null)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>

              <pre className="bg-slate-900 text-emerald-400 font-mono text-[11px] p-4 rounded-xl max-h-72 overflow-y-auto whitespace-pre-wrap leading-tight">
                {selectedJob.rawPayload}
              </pre>

              <div className="flex justify-end">
                <button
                  onClick={() => setSelectedJob(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
