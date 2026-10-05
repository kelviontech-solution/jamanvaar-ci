import React from 'react';
import { db } from '@jamanvaar/database';
import { PrinterService } from '@jamanvaar/api';
import { formatTime } from '@jamanvaar/utils';

/**
 * Relocated from kiosk-admin's Hardware tab — genuinely missing from pos-admin (grepped: no
 * print-job queue/spooler table anywhere else in this app). Jobs are restaurant-wide (any
 * terminal's print attempt), not kiosk-specific.
 */
export const PrintQueuePanel: React.FC<{ showToast: (msg: string) => void }> = ({ showToast }) => (
  <div className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-sm">
    <div className="p-4 bg-jaman-ivory border-b border-jaman-border font-bold text-sm text-jaman-navy flex items-center justify-between">
      <span>Transactional Print Queue Spooler</span>
      <div className="flex items-center gap-2">
        <span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono font-bold">
          {db.printJobs.length} Jobs Total
        </span>
        <button
          type="button"
          onClick={() => {
            PrinterService.processQueue();
            showToast('Triggered background print queue retry');
          }}
          className="text-xs font-bold text-jaman-saffron hover:underline"
        >
          Process Queue Now
        </button>
      </div>
    </div>

    {db.printJobs.length === 0 ? (
      <p className="text-xs text-[#8C9BAE] p-6 text-center">No print jobs in spooler queue. Jobs dispatched upon customer payment will appear here.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F8F6F0] border-b border-jaman-border text-[#8C9BAE] uppercase font-bold">
            <tr>
              <th className="py-3 px-4">Job ID</th>
              <th className="py-3 px-4">Order / Token</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Paper Width</th>
              <th className="py-3 px-4">Attempts</th>
              <th className="py-3 px-4">Time</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3EFE6]">
            {db.printJobs.slice(0, 8).map((job) => (
              <tr key={job.id} className="hover:bg-jaman-ivory">
                <td className="py-3 px-4 font-mono font-bold text-jaman-navy">{job.id.substring(0, 14)}...</td>
                <td className="py-3 px-4 font-bold text-jaman-navy">#{job.orderNumber} (TOKEN #{job.tokenNumber})</td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    job.status === 'PRINTED'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : job.status === 'RETRYING'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {job.status}
                  </span>
                </td>
                <td className="py-3 px-4 font-semibold text-[#4A5568]">{job.paperSize}</td>
                <td className="py-3 px-4 text-[#8C9BAE]">{job.attempts} / {job.maxAttempts}</td>
                <td className="py-3 px-4 text-[#8C9BAE]">{formatTime(job.createdAt)}</td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={async () => {
                      const res = await PrinterService.reprintReceipt(job.orderId || '', 'admin');
                      showToast(res.message);
                    }}
                    className="text-xs font-bold text-jaman-saffron hover:underline"
                  >
                    [REPRINT]
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
