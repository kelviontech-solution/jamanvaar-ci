import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui';

type Preview = { featureCode: string; featureName: string; restaurantId: string; restaurantName: string; planName: string | null; validUntil: string | null; enabled: boolean; canGrant: boolean; blockedReason: string | null; branches: Array<{ id: string; name: string; restricted: boolean }> };

export function QrFeatureRequestAction({ ticketId, onChanged }: { ticketId: string; onChanged: () => Promise<void> }) {
  const { can } = useAuth();
  const [data, setData] = useState<Preview | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setData(null); setReviewed(false);
    api.get<{ request: Preview | null }>(`/api/v1/support-tickets/${ticketId}/qr-feature`).then(result => { if (active) setData(result.request); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not check requested feature access.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ticketId]);
  return <section className="detail-card" style={{ padding: 16, display: 'grid', gap: 12 }} aria-label="Requested QR feature access">
    <h3 style={{ margin: 0 }}>Enable the requested QR feature</h3>
    {loading ? <p role="status">Checking the request and current access…</p> : data ? <>
      <p style={{ margin: 0 }}><strong>{data.featureName}</strong> for <strong>{data.restaurantName}</strong></p>
      <p className="muted" style={{ margin: 0 }}>This grants this feature on the restaurant’s current QR subscription ({data.planName ?? 'current plan'}{data.validUntil ? `, until ${new Date(data.validUntil).toLocaleDateString('en-IN')}` : ''}). It does not change other restaurants or bill the customer. Configure the feature in QR Admin after enabling it.</p>
      {data.branches.length > 0 && <div><strong>Branch access</strong><ul style={{ margin: '6px 0', paddingLeft: 20 }}>{data.branches.map(branch => <li key={branch.id}>{branch.name} — {branch.restricted ? 'Restricted; review Branch access' : 'Included in this grant'}</li>)}</ul></div>}
      {data.enabled ? <p role="status" style={{ color: 'var(--jv-success, #137451)', fontWeight: 700 }}>✓ Access enabled. The owner can check access again or reopen this feature in QR Admin.</p> : <>
        {data.blockedReason && <p role="status">{data.blockedReason}</p>}
        {can('support', 'write') && can('subscriptions', 'write') ? <>
          {data.canGrant && <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}><input type="checkbox" checked={reviewed} disabled={saving} onChange={e => setReviewed(e.target.checked)} /><span>I reviewed this restaurant, the requested feature and branch restrictions.</span></label>}
          <div><Button disabled={!data.canGrant || !reviewed || saving} onClick={async () => {
            setSaving(true); setError('');
            try {
              const result = await api.post<Preview>(`/api/v1/support-tickets/${ticketId}/qr-feature`, { featureCode: data.featureCode });
              setData(result); setReviewed(false);
              await onChanged();
            } catch (e) { setError(e instanceof Error ? e.message : 'Could not enable the requested feature.'); }
            finally { setSaving(false); }
          }}>{saving ? 'Enabling access…' : 'Enable feature & resolve request'}</Button></div>
        </> : <p>Ask a Super Admin with support and subscription management permission to enable this feature.</p>}
      </>}
      <Link to={`/restaurants/${data.restaurantId}?tab=applications`}>Review restaurant products & branch access</Link>
      {data.blockedReason?.includes('platform rollout') && <Link to="/feature-catalog">Review platform feature availability</Link>}
    </> : !error && <p>This ticket has no verified optional QR feature code. Review the request with the owner before changing product access.</p>}
    {error && <p role="alert" style={{ color: 'var(--jv-danger, #b42345)', margin: 0 }}>{error}</p>}
  </section>;
}
