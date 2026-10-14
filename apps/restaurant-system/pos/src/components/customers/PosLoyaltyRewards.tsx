import React, { useEffect, useReducer, useState } from 'react';
import { CustomerRepository, db } from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';
import { Gift } from 'lucide-react';
import { usePosStore } from '../../store/posStore';

export const PosLoyaltyRewards: React.FC = () => {
  const { selectedCustomer, cart, selectLoyaltyReward, removeDiscount } = usePosStore();
  const [, refresh] = useReducer(n => n + 1, 0);
  const [error, setError] = useState('');
  useEffect(() => db.subscribe(refresh), []);
  const customer = CustomerRepository.getByPhone(selectedCustomer?.phone ?? '');
  if (!customer) return null;
  const rate = CustomerRepository.getProgramSettings();
  const pointsCost = cart.loyaltyRedemption?.pointsCost || 0;
  const estimatedEarn = rate.enabled !== false && rate.perRupeesSpent > 0 ? Math.max(0, Math.floor(Math.floor(cart.totalPayable / rate.perRupeesSpent) * rate.earnPoints * (CustomerRepository.getTierForAccount(customer)?.pointsMultiplier ?? 1))) : 0;
  const enabled = CustomerRepository.getProgramSettings().enabled !== false;
  const eligible = enabled ? CustomerRepository.getRewards().filter(reward => reward.isActive && customer.loyaltyPoints >= reward.pointsCost && CustomerRepository.rewardDiscount(reward, cart.items, cart.subtotal) > 0).sort((a,b) => CustomerRepository.rewardDiscount(b, cart.items, cart.subtotal) - CustomerRepository.rewardDiscount(a, cart.items, cart.subtotal))[0] : undefined;
  return (
    <div className="col-span-full w-full">
    {eligible && !cart.loyaltyRedemption && <div className="flex flex-wrap items-center justify-between gap-2 mb-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm"><span><strong>{eligible.name}</strong> · Save {formatINR(CustomerRepository.rewardDiscount(eligible,cart.items,cart.subtotal))} for {eligible.pointsCost} points</span><button type="button" onClick={() => {try {selectLoyaltyReward(eligible.id);setError('');} catch(e) {setError(e instanceof Error ? e.message : 'Unable to apply reward');}}} className="min-h-11 px-4 rounded-xl bg-emerald-700 text-white font-bold">Use reward</button><span className="text-xs text-slate-600">Keep your points by continuing without a reward.</span></div>}
    <details className="col-span-full w-full rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs" data-testid="loyalty-rewards">
      <summary className="cursor-pointer font-bold text-emerald-800 flex items-center gap-2">
        <Gift className="w-4 h-4" />
        {cart.loyaltyRedemption ? `${cart.loyaltyRedemption.name} applied` : 'Use loyalty rewards'}
        <span className="ml-auto whitespace-nowrap">{customer.loyaltyPoints} pts</span>
      </summary>
      <p className="mt-2 text-slate-600">{enabled ? 'Optional: choose a reward or keep your points. Points are deducted only after payment.' : 'The loyalty program is paused. Your points are kept.'}</p>
      <p className="mt-2 text-slate-600">Points after redemption: {Math.max(0, customer.loyaltyPoints - pointsCost)}. Estimated points earned after payment: {estimatedEarn}. Final points follow the verified bill and your tier.</p>
      {cart.loyaltyRedemption && (
        <div className="mt-3 flex items-center justify-between gap-2 font-bold text-emerald-800">
          <span>Save {formatINR(cart.discountAmount)} · {cart.loyaltyRedemption.pointsCost} points</span>
          <button type="button" onClick={() => { removeDiscount(); setError(''); }} className="rounded-lg border border-emerald-300 bg-white px-3 py-2">Keep my points</button>
        </div>
      )}
      {!cart.loyaltyRedemption && enabled && (
        <div className="mt-3 space-y-2">
          {CustomerRepository.getRewards().map(reward => {
            const discount = CustomerRepository.rewardDiscount(reward, cart.items, cart.subtotal);
            const reason = !reward.isActive ? 'Paused' : customer.loyaltyPoints < reward.pointsCost ? `Need ${reward.pointsCost - customer.loyaltyPoints} more points` : discount <= 0 ? 'No eligible item / value not configured' : '';
            return <button key={reward.id} type="button" disabled={!!reason} onClick={() => {
              try { selectLoyaltyReward(reward.id); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to apply reward'); }
            }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white p-3 text-left disabled:opacity-50 hover:enabled:border-emerald-500">
              <span><strong className="block text-jaman-navy">{reward.name}</strong><span className="block mt-1 text-slate-500">{reward.pointsCost} points · {reason || `Save ${formatINR(discount)}`}</span></span>
              {!reason && <span className="font-bold text-emerald-700">Redeem</span>}
            </button>;
          })}
          {CustomerRepository.getRewards().length === 0 && <p>No rewards have been configured in Restaurant Admin.</p>}
        </div>
      )}
    </details>
    {error && <p role="alert" className="mt-2 text-rose-700">{error}</p>}
    </div>
  );
};
