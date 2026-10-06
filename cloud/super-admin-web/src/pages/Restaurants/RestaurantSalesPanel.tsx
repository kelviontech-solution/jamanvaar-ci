import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Button, Card } from '../../components/ui';

interface Sales {
  source: string;
  note: string;
  hasData: boolean;
  period: { from: string; to: string };
  totals: { orders: number; sales: number; averageOrder: number; openOrders: number; cancelledOrders: number };
  byDay: Array<{ date: string; orders: number; sales: number }>;
  byPaymentMethod: Array<{ method: string; orders: number; sales: number }>;
  byBranch: Array<{ branchId: string | null; branchName: string; orders: number; sales: number }>;
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const RANGES = [{ label: 'Last 7 days', days: 7 }, { label: 'Last 30 days', days: 30 }, { label: 'Last 90 days', days: 90 }];

/**
 * The restaurant's own sales (from the orders its terminals synced), kept visibly separate from the
 * platform's invoices to that restaurant (BUG-041).
 */
export function RestaurantSalesPanel({ restaurantId }: { restaurantId: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Sales | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const from = new Date(Date.now() - days * 86400_000).toISOString();
    api
      .get<Sales>(`/api/v1/platform/reports/restaurants/${restaurantId}/sales?from=${encodeURIComponent(from)}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load sales'))
      .finally(() => setLoading(false));
  }, [restaurantId, days]);

  useEffect(load, [load]);

  const tile = (label: string, value: string, sub?: string) => (
    <div style={{ padding: 16, background: 'var(--jv-surface-subtle)', borderRadius: 10, border: '1px solid var(--jv-border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--jv-text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--jv-text)', marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--jv-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <Card style={{ padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--jv-text)' }}>Restaurant sales</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--jv-text-muted)' }}>
            The restaurant&apos;s own takings, from orders its terminals synced. Not the platform&apos;s invoices (see below).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period" style={{ height: 32, borderRadius: 8, border: '1px solid var(--jv-border-hover)', padding: '0 8px', fontSize: 13 }}>
            {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
          </select>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {error && <div className="banner-error" role="alert">{error}</div>}
      {!error && data && !data.hasData && (
        <div className="banner" role="note">
          No orders have reached the cloud from this restaurant yet. Sales appear here once its POS starts syncing.
        </div>
      )}

      {data && data.hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            {tile('Sales', inr(data.totals.sales), `${data.totals.orders} paid orders`)}
            {tile('Average order', inr(data.totals.averageOrder))}
            {tile('Open orders', String(data.totals.openOrders), 'not yet paid')}
            {tile('Cancelled', String(data.totals.cancelledOrders))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <Breakdown title="By payment method" rows={data.byPaymentMethod.map((m) => [m.method, m.orders, m.sales])} />
            <Breakdown title="By branch" rows={data.byBranch.map((b) => [b.branchName, b.orders, b.sales])} />
            <Breakdown title="Top items" rows={data.topItems.map((i) => [i.name, i.quantity, i.revenue])} countLabel="Qty" />
            <Breakdown title="By day" rows={data.byDay.slice(-14).map((d) => [d.date, d.orders, d.sales])} />
          </div>
        </div>
      )}
    </Card>
  );
}

function Breakdown({ title, rows, countLabel = 'Orders' }: { title: string; rows: Array<[string, number, number]>; countLabel?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--jv-text)', marginBottom: 6 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--jv-text-light)' }}>Nothing in this period.</div>
      ) : (
        <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--jv-text-muted)', textAlign: 'left' }}><th style={{ padding: '4px 0' }} /><th style={{ textAlign: 'right' }}>{countLabel}</th><th style={{ textAlign: 'right' }}>Sales</th></tr>
          </thead>
          <tbody>
            {rows.map(([name, count, amount]) => (
              <tr key={name} style={{ borderTop: '1px solid var(--jv-border-subtle)' }}>
                <td style={{ padding: '5px 0' }}>{name}</td>
                <td style={{ textAlign: 'right' }}>{count}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
