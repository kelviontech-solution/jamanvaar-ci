import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui';

type Approval = { restaurantId: string; restaurantName: string; commissionBps: number; collectionStatus: string; bankVerificationStatus: string; gatewayReady: boolean; approved: boolean; canApprove: boolean; blockedReason: string | null; payoutMode: string };
export function QrPaymentApprovalAction({ ticketId, onChanged }: { ticketId: string; onChanged: () => Promise<void> }) {
  const { can } = useAuth();
  const [data, setData] = useState<Approval | null>(null), [error, setError] = useState(''), [password, setPassword] = useState(''), [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true); setError('');
    try { setData((await api.get<{ request: Approval | null }>(`/api/v1/support-tickets/${ticketId}/qr-payment`)).request); }
    catch (e) { setData(null); setError(e instanceof Error ? e.message : 'Could not check payment activation.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [ticketId]);
  return <section className="detail-card" style={{ padding: 16, display: 'grid', gap: 12 }} aria-label="QR payment activation approval">
    <h3 style={{ margin: 0 }}>Activate QR online payments</h3>
    {data && <>
      <p><strong>{data.restaurantName}</strong> · Collection {data.collectionStatus.replaceAll('_', ' ').toLowerCase()}</p>
      <p>The owner accepted a <strong>{data.commissionBps / 100}% Jamanvaar commission</strong> on new QR online collections. ₹100 collected records ₹2 platform commission and ₹98 restaurant share, before refunds and payout holds. Gateway costs are separate from gross commission.</p>
      <p>Bank verification: <strong>{data.bankVerificationStatus.replaceAll('_', ' ').toLowerCase()}</strong>. Restaurant payouts use the existing verified-bank process; this approval does not send a bank transfer.</p>
      {data.approved ? <p role="status" style={{ fontWeight: 700, color: 'var(--jv-success-text)' }}>✓ QR payment activation approved. The owner can check payment status in QR Admin.</p> : <>
        {data.blockedReason && <p role="status">{data.blockedReason}</p>}
        {can('support', 'write') && can('billing', 'write') ? <>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}><input type="checkbox" checked={reviewed} disabled={busy || !data.canApprove} onChange={e => setReviewed(e.target.checked)} /><span>I reviewed QR payment access, collection setup and the 2% commission.</span></label>
          <label>Confirm your Super Admin password<input className="input" type="password" autoComplete="current-password" value={password} disabled={busy || !data.canApprove} onChange={e => setPassword(e.target.value)} /></label>
          <div><Button disabled={busy || !data.canApprove || !reviewed || !password} onClick={async () => {
            setBusy(true); setError('');
            try { setData(await api.patch<Approval>(`/api/v1/support-tickets/${ticketId}/qr-payment`, { password })); setReviewed(false); await onChanged(); }
            catch (e) { setError(e instanceof Error ? e.message : 'Activation could not be approved.'); }
            finally { setPassword(''); setBusy(false); }
          }}>{busy ? 'Approving…' : 'Approve QR payments & resolve request'}</Button></div>
        </> : <p>A Super Admin with payment and support management permissions can approve this request.</p>}
      </>}
      <Link to={`/qr-ordering?restaurantId=${encodeURIComponent(data.restaurantId)}&tab=entitlement`}>Review Online payments in QR Ordering Suite</Link>
      <Link to={`/restaurants/${data.restaurantId}?tab=applications`}>Review purchased products and branch restrictions</Link>
      <Link to="/payment-connections">Review collection and bank verification</Link>
    </>}
    {error && <p role="alert" style={{ color: 'var(--jv-error-text, #b42345)' }}>{error}</p>}
    <div><Button variant="ghost" disabled={loading || busy} onClick={() => void load()}>{loading ? 'Checking payment setup…' : 'Refresh activation checks'}</Button></div>
  </section>;
}
