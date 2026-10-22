import { useState } from 'react';
import { Modal } from '@jamanvaar/ui';
import { formatINR } from '@jamanvaar/utils';
import { qrLoyaltyReadiness, type LoyaltySetupConfig } from './qrLoyaltyReadiness';

export function QrLoyaltySetup({ config, canManage, onProgram, onReward, onChannel }: { config: LoyaltySetupConfig; canManage: boolean; onProgram: () => void; onReward: () => void; onChannel: () => void }) {
  const readiness = qrLoyaltyReadiness(config);
  const [preview, setPreview] = useState(false), [points, setPoints] = useState('150');
  const statuses = [['Customer login', readiness.loginReady], ['Points earning', readiness.earningReady], ['Rewards available', readiness.rewardsReady]] as const;
  return <section className="qr-loyalty-setup" aria-label="Customer login and rewards setup">
    <header><div><h2>Customer login & rewards</h2><p>{readiness.rewardsReady && readiness.earningReady ? 'Your guest program is ready.' : readiness.rewardsReady ? 'Existing points can be redeemed. Set an earning rule to award new points.' : 'Complete the steps below before inviting guests to earn rewards.'}</p></div><button type="button" onClick={() => setPreview(true)}>Preview customer experience</button></header>
    <div className="qr-readiness-statuses">{statuses.map(([label, ready]) => <span key={label} className={ready ? 'is-ready' : 'needs-setup'}>{ready ? '✓' : '○'} {label}: {ready ? 'Ready' : 'Needs setup'}</span>)}</div>
    <ol className="qr-setup-steps">
      <li><span>{readiness.earningRuleReady ? '✓' : '1'}</span><div><strong>Set earning rules</strong><small>{readiness.earningRuleReady ? `${config.program.earnPoints} points per ${formatINR(config.program.perRupeesSpent)} paid` : 'Choose how guests earn points on confirmed payments.'}</small></div><button type="button" disabled={!canManage} onClick={onProgram}>{canManage ? 'Edit program' : 'Owner manages this'}</button></li>
      <li><span>{readiness.activeRewards.length ? '✓' : '2'}</span><div><strong>Create an active reward</strong><small>{readiness.activeRewards.length ? `${readiness.activeRewards.length} active reward${readiness.activeRewards.length === 1 ? '' : 's'}` : 'Paused, expired or invalid rewards are excluded.'}</small></div><button type="button" disabled={!canManage} onClick={onReward}>Add reward</button></li>
      <li><span>{readiness.loginReady ? '✓' : '3'}</span><div><strong>Connect customer login</strong><small>{!config.qrChannelEnabled ? 'Enable loyalty for the selected branch.' : !config.phoneVerificationReady ? 'Phone-code delivery needs platform setup.' : 'Branch loyalty and phone verification are ready.'}</small></div><button type="button" onClick={onChannel}>{!config.phoneVerificationReady ? 'Get setup help' : 'Branch settings'}</button></li>
      <li><span>4</span><div><strong>Check the guest experience</strong><small>Preview points and rewards before sharing your QR.</small></div><button type="button" onClick={() => setPreview(true)}>Preview</button></li>
    </ol>
    <Modal isOpen={preview} onClose={() => setPreview(false)} title="Customer rewards preview" maxWidth="lg"><div className="qr-reward-preview">
      <p className="qr-example-note">Example only · no points are awarded or spent.</p>
      <label>Example customer points<input type="number" min="0" max="1000000" value={points} onChange={event => setPoints(event.target.value)} /></label>
      <div className="qr-example-balance"><small>Your restaurant balance</small><strong>{Math.max(0, Number(points) || 0)} points</strong></div>
      {!readiness.loginReady && <p role="status">Guests can order without login. Phone login needs setup before this account experience is available.</p>}
      {!readiness.earningReady && <p role="status">New points are not ready to earn. Complete the earning rule and login steps above.</p>}
      {readiness.activeRewards.length ? readiness.activeRewards.map(reward => <article key={reward.id || reward.name}><strong>{reward.name}</strong><p>{reward.pointsCost} points · {reward.discountKind === 'ITEM' ? `up to ${formatINR(reward.discountAmount)} off an eligible item` : `${formatINR(reward.discountAmount)} off your bill`}</p><span>{Number(points) >= reward.pointsCost ? 'Enough example points to redeem at checkout' : `${Math.max(0, reward.pointsCost - (Number(points) || 0))} more points to unlock`}</span></article>) : <p>No active rewards. Create one before advertising rewards to guests.</p>}
      <p className="qr-example-note">Actual checkout verifies the guest, available points, reward, eligible items and branch access.</p>
    </div></Modal>
  </section>;
}
