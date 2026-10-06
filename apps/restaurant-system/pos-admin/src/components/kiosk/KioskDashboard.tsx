import React, { useEffect, useState } from 'react';
import { db, MenuRepository } from '@jamanvaar/database';
import { getPayoutSummary, type PayoutSummary, type CloudKiosk } from '../../cloud/cloudClient';
import type { PosAdminTab } from '../../App';

const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
export function KioskDashboard({ kiosks, onNavigate }: { kiosks: CloudKiosk[]; onNavigate: (page: PosAdminTab) => void }) {
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    getPayoutSummary().then(value => { if (!cancelled) setSummary(value); })
      .catch(() => { if (!cancelled) setError('Collection details could not be loaded. Open Payments & Payouts to retry.'); });
    return () => { cancelled = true; };
  }, []);
  const steps: Array<[PosAdminTab, string, string]> = [
    ['TEMPLATES', '1. Set up your menu', 'Choose a restaurant template or add your own dishes.'],
    ['KIOSK_DESIGN', '2. Design the customer screen', 'Set your logo, welcome screen and wording.'],
    ['KIOSK_PAYMENTS', '3. Check payments', 'Review collection, fees and settlement details.'],
    ['KIOSKS', '4. Connect your kiosks', 'Activate the customer terminal with its own kiosk key.']
  ];
  return <div className="space-y-6" data-testid="kiosk-dashboard">
    <div><h1 className="text-3xl font-bold">Kiosk Dashboard</h1><p className="text-slate-600 mt-2">Manage your customer kiosks for {db.restaurant.name}.</p></div>
    <div className="grid gap-4 sm:grid-cols-3">{[
      ['Activated kiosks', kiosks.length, 'KIOSKS'], ['Online kiosks', kiosks.filter(k => k.health === 'online').length, 'KIOSKS'],
      ['Available menu items', MenuRepository.getAllMenuItems().filter(i => i.isAvailable).length, 'MENU']
    ].map(([label, value, page]) => <button key={label} onClick={() => onNavigate(page as PosAdminTab)} className="text-left rounded-2xl border border-jaman-border bg-white p-5"><span className="text-sm text-slate-600">{label}</span><div className="text-3xl font-bold mt-2">{value}</div></button>)}</div>
    <section className="rounded-2xl border border-jaman-border bg-white p-5 space-y-3"><h2 className="font-bold text-lg">Get your kiosks ready</h2><div className="grid sm:grid-cols-2 gap-3">{steps.map(([page, title, detail]) => <button key={page} onClick={() => onNavigate(page)} className="text-left rounded-xl p-4 border hover:border-orange-500"><span className="font-semibold">{title}</span><p className="text-sm text-slate-600 mt-1">{detail}</p></button>)}</div></section>
    <section className="rounded-2xl border border-jaman-border bg-white p-5 space-y-3"><h2 className="font-bold text-lg">Collection and restaurant payouts</h2><p className="text-sm text-slate-600">Customer collection is separate from money paid to your restaurant.</p>
      {error && <p role="alert" className="text-amber-800">{error}</p>}
      {!summary && !error && <p role="status">Loading payout summary…</p>}
      {summary && <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{[
        ['Gross Collection', summary.grossCollection], ['Jamanvaar Fee', summary.platformFee],
        ['Net Payable', summary.netPayable], ['Pending Payout', summary.pendingPayout]
      ].map(([label, value]) => <div key={label} className="rounded-xl bg-orange-50 p-4"><p className="text-sm">{label}</p><strong>{money(Number(value))}</strong></div>)}</div>}
      <button className="text-orange-700 font-semibold underline" onClick={() => onNavigate('KIOSK_PAYMENTS')}>Open Payments & Payouts</button>
    </section>
  </div>;
}
