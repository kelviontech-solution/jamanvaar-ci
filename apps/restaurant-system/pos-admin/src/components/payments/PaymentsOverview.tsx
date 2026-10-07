import type { PayoutSummary } from '../../cloud/cloudClient';

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Card({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-jaman-border bg-white p-4">
      <div className="text-[11px] font-bold uppercase text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold font-mono ${tone}`}>{value}</div>
    </div>
  );
}

/** Where each rupee of kiosk collection went: to the restaurant, to Jamanvaar's fee, or back to customers. */
function Donut({ parts }: { parts: Array<{ label: string; value: number; color: string }> }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const r = 46;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0" role="img" aria-label="Collection split">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#EEF2F6" strokeWidth="16" />
        {total > 0 && parts.map((p) => {
          const len = (p.value / total) * c;
          const el = <circle key={p.label} cx="60" cy="60" r={r} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />;
          offset += len;
          return el;
        })}
      </svg>
      <ul className="text-xs space-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: p.color }} />
            <span className="text-slate-600">{p.label}</span>
            <strong className="ml-auto pl-4 font-mono text-jaman-navy">{rupees(p.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Refunds recorded by hand, by how they were paid back. */
function RefundBars({ cash, upi }: { cash: number; upi: number }) {
  const max = Math.max(cash, upi, 1);
  const bars = [{ label: 'Cash', value: cash, color: '#0F766E' }, { label: 'UPI from owner', value: upi, color: '#B45309' }];
  return (
    <div className="space-y-2 text-xs w-full max-w-xs">
      {bars.map((b) => (
        <div key={b.label}>
          <div className="flex justify-between text-slate-600"><span>{b.label}</span><strong className="font-mono">{rupees(b.value)}</strong></div>
          <div className="h-2.5 rounded-full bg-[#EEF2F6] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(b.value / max) * 100}%`, background: b.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PaymentsOverview({ summary }: { summary: PayoutSummary }) {
  const feeRetained = summary.platformFeeRetained ?? 0;
  const cash = summary.refundedCash ?? 0;
  const upi = summary.refundedUpi ?? 0;
  const restaurantShareRefunded = summary.refundedRestaurantShare ?? 0;
  const toBank = Math.max(0, summary.grossCollection - summary.platformFee - summary.refundedAmount);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Gross collected" value={rupees(summary.grossCollection)} tone="text-jaman-navy" />
        <Card label="Jamanvaar fee (3% kiosk QR)" value={rupees(summary.platformFee)} tone="text-jaman-navy" />
        <Card label="Refunded to customers" value={rupees(summary.refundedAmount)} tone="text-rose-700" />
        <Card label="Net payable to you" value={rupees(summary.netPayable)} tone="text-emerald-700" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-jaman-border bg-white p-4">
          <div className="text-xs font-bold text-jaman-navy mb-3">Where the collection went</div>
          <Donut parts={[
            { label: 'To you (net of refunds)', value: toBank, color: '#0F766E' },
            { label: 'Jamanvaar fee (kept on refunds)', value: feeRetained || summary.platformFee, color: '#EA580C' },
            { label: 'Refunded to customers', value: summary.refundedAmount, color: '#E11D48' }
          ]} />
          <p className="mt-2 text-[11px] text-slate-500">Fee is kept on refunds. Your share of a refunded payment is taken back: {rupees(restaurantShareRefunded)}.</p>
        </div>
        <div className="rounded-2xl border border-jaman-border bg-white p-4">
          <div className="text-xs font-bold text-jaman-navy mb-3">Refunds by how they were paid back</div>
          <RefundBars cash={cash} upi={upi} />
        </div>
      </div>
    </div>
  );
}
