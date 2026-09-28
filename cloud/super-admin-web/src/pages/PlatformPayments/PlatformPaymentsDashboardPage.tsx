import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Badge, Card } from '../../components/ui';
import '../../components/shared.css';

interface PlatformSummary {
  grossVolume: number;
  platformCommission: number;
  restaurantShare: number;
  refundedAmount: number;
  successfulCount: number;
  statusCounts: Record<string, number>;
  openReconciliationExceptions: number;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function PlatformPaymentsDashboardPage() {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (restaurantId.trim()) params.set('restaurantId', restaurantId.trim());
    if (status) params.set('status', status);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString());
    setError(null);
    api
      .get<PlatformSummary>(`/api/v1/payments/platform-summary?${params.toString()}`)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load platform payments summary'));
  }, [restaurantId, status, from, to]);

  const tile = (label: string, value: string | number, tone?: 'good' | 'warn') => (
    <Card>
      <div style={{ padding: 16 }}>
        <div className="muted" style={{ fontSize: 12 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: tone === 'good' ? '#16a34a' : tone === 'warn' ? '#ea580c' : undefined }}>{value}</div>
      </div>
    </Card>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Payments</h1>
          <p className="page-subtitle">Cross-restaurant Cashfree payment volume, commission, and reconciliation health.</p>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="toolbar" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Restaurant ID (optional)" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} style={{ width: 280 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="PENDING">Pending</option>
          <option value="REFUNDED">Refunded</option>
          <option value="PARTIALLY_REFUNDED">Partially refunded</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>

      {summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {tile('Gross Volume', formatRupees(summary.grossVolume))}
            {tile('Platform Commission', formatRupees(summary.platformCommission), 'good')}
            {tile('Restaurant Share', formatRupees(summary.restaurantShare))}
            {tile('Refunded', formatRupees(summary.refundedAmount), 'warn')}
            {tile('Successful Payments', summary.successfulCount)}
            <Card>
              <div style={{ padding: 16 }}>
                <div className="muted" style={{ fontSize: 12 }}>Open Reconciliation Exceptions</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {summary.openReconciliationExceptions > 0 ? <Badge tone="warning">{summary.openReconciliationExceptions}</Badge> : 0}
                </div>
              </div>
            </Card>
          </div>
          <Card>
            <div style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Payments by status</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(summary.statusCounts).length === 0 && <span className="muted">No payments match these filters.</span>}
                {Object.entries(summary.statusCounts).map(([s, n]) => (
                  <Badge key={s} tone="neutral">{s.replace(/_/g, ' ')}: {n}</Badge>
                ))}
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
