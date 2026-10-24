import React from 'react';
import type { EntitlementService } from '@jamanvaar/business';

/** SEC-007 Fix: Enforce SaaS Plan Entitlement (Requires JAMANVAAR PRO ₹7,000). Extracted from App.tsx. */
export const CaptainLockedScreen: React.FC<{ entitlement: ReturnType<typeof EntitlementService.checkCaptainAppAccess> }> = ({ entitlement }) => (
  <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6 text-center select-none font-sans">
    <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-amber-200 shadow-md space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto text-3xl shadow-xs">
        👑
      </div>
      <div className="space-y-2">
        <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-jaman-saffronText bg-[#FFF4ED] px-3 py-1 rounded-full border border-[#FDBA74]">
          JAMANVAAR PRO (₹7,000) Exclusive
        </span>
        <h1 className="text-2xl font-bold text-jaman-navy tracking-tight">Captain App Locked</h1>
        <p className="text-sm text-slate-600 leading-relaxed font-medium">
          {entitlement.message || 'Wireless Table Ordering and Captain Service workflows are available only on the JAMANVAAR PRO (₹7,000) subscription plan.'}
        </p>
      </div>
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 font-medium text-left space-y-2">
        <div className="font-bold text-jaman-navy">Current Plan Status:</div>
        <div className="flex justify-between">
          <span>Restaurant Plan:</span>
          <span className="font-bold text-slate-900">{entitlement.tier}</span>
        </div>
        <div className="flex justify-between">
          <span>Captain Entitlement:</span>
          <span className="text-rose-600 font-bold">LOCKED (captainApp: false)</span>
        </div>
        <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
          Upgrade your subscription to JAMANVAAR PRO via Super Admin or contact your platform administrator.
        </div>
      </div>
    </div>
  </div>
);
