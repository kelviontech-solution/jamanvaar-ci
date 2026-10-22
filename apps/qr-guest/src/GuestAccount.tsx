import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../../../packages/ui/src/useDialogFocus';
import { QrApi } from './api';
import type { LoyaltyAccount } from './LoyaltyPanel';
import './guest-account.css';

type Profile = NonNullable<LoyaltyAccount['profile']>;
const emptyProfile: Profile = { name: '', email: '', emailOffers: false, whatsappOffers: false };

export function GuestAccount({ source, session, onClose }: { source: { kind: 'site' | 'table'; id: string }; session: string; onClose: () => void }) {
  const { cardRef, dialogId } = useDialogFocus<HTMLDivElement>(true, onClose);
  const [account, setAccount] = useState<LoyaltyAccount | null>(null), [profile, setProfile] = useState<Profile>(emptyProfile), [phone, setPhone] = useState(''), [code, setCode] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [retryAt, setRetryAt] = useState(0), [clock, setClock] = useState(Date.now()), [revealed, setRevealed] = useState<string[]>([]);
  const alive = useRef(true);
  const call = <T,>(path = '', method = 'GET', body?: unknown) => source.kind === 'site' ? QrApi.siteLoyalty<T>(source.id, path, session, method, body) : QrApi.loyalty<T>(source.id, path, session, method, body);
  const accept = (value: LoyaltyAccount) => { setAccount(value); setProfile(value.profile ?? emptyProfile); };
  const load = async () => {
    setLoading(true); setError('');
    try { const value = await call<LoyaltyAccount>(); if (alive.current) accept(value); }
    catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setLoading(false); }
  };
  useEffect(() => { alive.current = true; void load(); const timer = setInterval(() => setClock(Date.now()), 1000); return () => { alive.current = false; clearInterval(timer); }; }, [source.kind, source.id, session]);
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await action(); } catch (e) { if (alive.current) setError((e as Error).message); } finally { if (alive.current) setBusy(false); } };
  const cooldown = Math.max(0, Math.ceil((retryAt - clock) / 1000));
  return <div className="ga-backdrop"><div aria-hidden="true" className="ga-scrim" onClick={() => { if (!busy) onClose(); }} /><div ref={cardRef} tabIndex={-1} className="ga-dialog" role="dialog" aria-modal="true" aria-labelledby={dialogId + '-title'}>
    <header className="ga-header"><div><span>YOUR RESTAURANT ACCOUNT</span><h2 id={dialogId + '-title'}>{account?.verified ? 'Your points & rewards' : 'Customer login'}</h2></div><button type="button" disabled={busy} aria-label="Close customer account" onClick={onClose}>×</button></header>
    <div className="ga-body">
      {loading && <p role="status">Loading your account…</p>}
      {error && <div role="alert" className="ga-error">{error}{!account && <button type="button" onClick={() => void load()}>Try again</button>}</div>}
      {notice && <p role="status" className="ga-notice">{notice}</p>}
      {account && !account.verified && <>
        <p className="ga-intro">Sign in with your mobile number to keep your details and use your restaurant points. Ordering as a guest is always available.</p>
        {account.verificationAvailable ? <form onSubmit={e => { e.preventDefault(); void run(async () => { if (sent) { const value = await call<LoyaltyAccount>('/verify', 'POST', { code }); if (alive.current) { accept(value); setCode(''); setNotice('You are signed in. Add your name below to complete your profile.'); } } else { await call('/send-code', 'POST', { phone }); if (alive.current) { setSent(true); setRetryAt(Date.now() + 60000); } } }); }}>
          {!sent ? <label>Mobile number<input type="tel" autoComplete="tel" inputMode="tel" maxLength={20} required value={phone} disabled={busy} onChange={e => setPhone(e.target.value)} placeholder="Your 10-digit mobile number" /></label> : <><p className="ga-hint">Enter the 6-digit code sent to the number ending {phone.replace(/\D/g, '').slice(-4)}. The code expires in 10 minutes.</p><label>Verification code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} disabled={busy} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label></>}
          <button className="ga-primary" type="submit" disabled={busy || (!sent ? !phone.trim() : code.length !== 6)}>{busy ? 'Please wait…' : sent ? 'Verify & sign in' : 'Send login code'}</button>
          {sent && <div className="ga-inline-actions"><button type="button" disabled={busy || cooldown > 0} onClick={() => void run(async () => { await call('/send-code', 'POST', { phone }); if (alive.current) { setCode(''); setRetryAt(Date.now() + 60000); setNotice('A new code was sent. Use the latest code.'); } })}>{cooldown ? `Resend in ${cooldown}s` : 'Resend code'}</button><button type="button" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(''); }}>Change number</button></div>}
        </form> : <p className="ga-hint" role="status">Customer phone login is not available for this restaurant yet. You can still browse and order as a guest.</p>}
      </>}
      {account?.verified && <>
        <div className="ga-balance"><span>{profile.name ? `Welcome, ${profile.name}` : 'Your restaurant balance'}</span><strong>{account.points}<small> points</small></strong><span>{account.phoneMasked}</span></div>
        {account.program.enabled && <p className="ga-hint">Earn {account.program.earnPoints} points per ₹{account.program.perRupeesSpent} on eligible paid orders. Refunds adjust your points.</p>}
        <section className="ga-rewards"><h3>Your rewards</h3>{account.rewards.length ? account.rewards.map(reward => <article key={reward.id} className={reward.eligible ? 'ga-reward is-earned' : 'ga-reward'}>
          <div><span>{reward.pointsCost} points</span><h4>{reward.name}</h4><p>{reward.description}</p></div>
          {reward.eligible ? revealed.includes(reward.id) ? <p role="status"><strong>₹{reward.discountAmount} off</strong> · Select this reward at checkout. Revealing it does not spend your points.</p> : <button type="button" onClick={() => setRevealed(ids => [...ids, reward.id])}>Reveal earned reward</button> : <p>{Math.max(0, reward.pointsCost - account.points)} more points to unlock</p>}
        </article>) : <p className="ga-hint">No rewards are available yet. Your points stay on your account.</p>}</section>
        <details className="ga-profile" open={!account.profile?.name}><summary>Your details & offer preferences</summary><form onSubmit={e => { e.preventDefault(); void run(async () => { const value = await call<LoyaltyAccount>('/profile', 'POST', profile); if (alive.current) { accept(value); setNotice('Your details and preferences are saved with the restaurant.'); } }); }}>
          <label>Your name<input required maxLength={120} autoComplete="name" value={profile.name} disabled={busy} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} /></label>
          <label>Email (optional)<input type="email" maxLength={254} autoComplete="email" value={profile.email} disabled={busy} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} /></label>
          <label className="ga-checkbox"><input type="checkbox" checked={profile.emailOffers} disabled={busy} onChange={e => setProfile(p => ({ ...p, emailOffers: e.target.checked }))} />Email me restaurant offers</label>
          <label className="ga-checkbox"><input type="checkbox" checked={profile.whatsappOffers} disabled={busy} onChange={e => setProfile(p => ({ ...p, whatsappOffers: e.target.checked }))} />Send me restaurant offers on WhatsApp</label>
          <p className="ga-hint">Offers are optional. Your name and email are saved only when you select Save details.</p><button className="ga-primary" type="submit" disabled={busy || !profile.name.trim() || (profile.emailOffers && !profile.email.trim())}>Save details</button>
        </form></details>
        <button className="ga-signout" type="button" disabled={busy} onClick={() => void run(async () => { await call('/sign-out', 'POST'); if (alive.current) { setAccount(null); setProfile(emptyProfile); setPhone(''); setCode(''); setSent(false); setRevealed([]); await load(); setNotice('You are signed out on this browser.'); } })}>Sign out of customer account</button>
      </>}
    </div><footer className="ga-footer"><button type="button" disabled={busy} onClick={onClose}>Continue browsing</button><small>Rewards are based on your existing points. Google reviews and social follows do not earn points.</small></footer>
  </div></div>;
}
