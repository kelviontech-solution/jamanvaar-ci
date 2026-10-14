import React from 'react';
import { Modal } from '@jamanvaar/ui';
import { ArrowRight, Lock, QrCode, ShieldCheck, Sparkles, Users } from 'lucide-react';

/** PRO FEATURE LOCKED MODAL (₹7,000 Plan Gate). Extracted from App.tsx. */
export const ProUpgradeModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onUpgradeClick: () => void;
}> = ({ isOpen, onClose, onUpgradeClick }) => {
  if (!isOpen) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="JAMAN AI Operations Assistant" maxWidth="md">
      <div className="space-y-4 py-2">
        {/* Feature Hero Card */}
        <div className="p-4 rounded-2xl bg-jaman-navy text-white shadow-md relative overflow-hidden">
                          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-brand text-white">
              <Sparkles className="w-3 h-3" /> PRO Exclusive Feature
            </span>
            <span className="text-[11px] tabular-nums text-slate-300">₹7,000 / month</span>
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Unlock Intelligent Restaurant Operations
          </h3>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            JAMAN AI connects directly to your restaurant's local device data to deliver instant operational answers, revenue projections, delayed kitchen alerts, and cash drawer auditing.
          </p>
        </div>

        {/* Benefits Checklist */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            What you get with PRO Plan
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE3D6] flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white border border-jaman-border flex items-center justify-center shrink-0 text-brand">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-jaman-navy">JAMAN AI Engine</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Real-time revenue, delayed KOT & cash discrepancy detection.</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE3D6] flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white border border-jaman-border flex items-center justify-center shrink-0 text-emerald-600">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-jaman-navy">Captain Ordering App</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Handheld digital ordering for waitstaff & captains on any mobile.</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE3D6] flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white border border-jaman-border flex items-center justify-center shrink-0 text-indigo-600">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-jaman-navy">Table QR Ordering</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Instant guest scanning, digital menu browsing & self-ordering.</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE3D6] flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white border border-jaman-border flex items-center justify-center shrink-0 text-amber-600">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-jaman-navy">Super Admin Synced</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Centralized audit, cloud invoices & real-time telemetry control.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Current plan notice */}
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Currently on <strong>JAMANVAAR CORE (₹5,000/mo)</strong>. Upgrade to PRO to unlock.</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE3D6]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-600 transition-all cursor-pointer"
          >
            Maybe Later
          </button>
          <button
            type="button"
            onClick={onUpgradeClick}
            className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover active:bg-brand-press text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <span>Upgrade to PRO (₹7,000)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Modal>
  );
};
