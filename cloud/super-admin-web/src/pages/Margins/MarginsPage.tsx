import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { MarginsReport } from '../../api/types';
import { Badge, Button, Card, EmptyState } from '../../components/ui';
import { TrendingUp } from 'lucide-react';
import '../../components/shared.css';

function formatRupees(rupees: number): string {
  return `₹${rupees.toLocaleString('en-IN')}`;
}

export function MarginsPage() {
  const [report, setReport] = useState<MarginsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [costDraft, setCostDraft] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    api
      .get<MarginsReport>('/api/v1/platform/reports/margins')
      .then((r) => {
        setReport(r);
        setCostDraft(String(r.assumedCostPerRestaurant));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load margins'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  async function saveCostAssumption() {
    const rupees = Number(costDraft);
    if (!Number.isFinite(rupees) || rupees < 0) {
      showToast('Enter a non-negative number');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.patch<MarginsReport>('/api/v1/platform/reports/margins/cost-assumption', { rupees });
      setReport(updated);
      showToast('Cost assumption updated');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Margin &amp; Cost (Estimated)</h1>
          <p className="page-subtitle">
            Revenue per plan against what it costs to serve a restaurant — an <strong>estimate</strong> built from
            the assumption below, not real infra billing data (JAMANVAAR doesn't track per-restaurant cost yet).
          </p>
        </div>
      </div>

      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}
      {error && <div className="page-error">{error}</div>}

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label className="label">Assumed cost per restaurant, per month</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>₹</span>
              <input
                type="number"
                min={0}
                className="input"
                style={{ width: 120 }}
                value={costDraft}
                onChange={(e) => setCostDraft(e.target.value)}
              />
              <Button size="sm" variant="primary" disabled={saving} onClick={saveCostAssumption}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, maxWidth: 420 }}>
            Change this if you have a better estimate of support load + infra cost per restaurant. Every number below
            recomputes from this one assumption, applied flat across every plan.
          </p>
        </div>
      </Card>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--jv-text-light)' }}>Loading…</div>
      ) : !report || report.plans.length === 0 ? (
        <EmptyState icon={<TrendingUp className="w-8 h-8" />} title="No active subscriptions yet" description="Margins will show up once restaurants are onboarded onto a plan." />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 20 }}>
            <Card>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-muted)', textTransform: 'uppercase' }}>Total MRR</span>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{formatRupees(report.totals.mrr)}</div>
            </Card>
            <Card>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-muted)', textTransform: 'uppercase' }}>Assumed Cost</span>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4, color: '#b45309' }}>{formatRupees(report.totals.assumedCost)}</div>
            </Card>
            <Card>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-muted)', textTransform: 'uppercase' }}>Estimated Margin</span>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4, color: report.totals.estimatedMargin >= 0 ? 'var(--jv-success-text)' : 'var(--jv-error-text)' }}>
                {formatRupees(report.totals.estimatedMargin)}
              </div>
            </Card>
          </div>

          <Card>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--jv-border-subtle)', textAlign: 'left', color: 'var(--jv-text-muted)' }}>
                    <th style={{ padding: '12px 14px' }}>Plan</th>
                    <th style={{ padding: '12px 14px' }}>Restaurants</th>
                    <th style={{ padding: '12px 14px' }}>MRR</th>
                    <th style={{ padding: '12px 14px' }}>Assumed Cost</th>
                    <th style={{ padding: '12px 14px' }}>Est. Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {report.plans.map((p) => (
                    <tr key={p.planId} style={{ borderBottom: '1px solid var(--jv-border-subtle)' }}>
                      <td style={{ padding: '14px' }}>
                        <strong>{p.name}</strong> <Badge tone="neutral">{p.tier}</Badge>
                      </td>
                      <td style={{ padding: '14px' }}>{p.restaurantCount}</td>
                      <td style={{ padding: '14px' }}>{formatRupees(p.mrr)}</td>
                      <td style={{ padding: '14px', color: '#b45309' }}>{formatRupees(p.assumedCost)}</td>
                      <td style={{ padding: '14px', fontWeight: 700, color: p.estimatedMargin >= 0 ? 'var(--jv-success-text)' : 'var(--jv-error-text)' }}>
                        {formatRupees(p.estimatedMargin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
