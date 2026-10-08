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
  const enabled = CustomerRepository.getProgramSettings().enabled !== false;
  return (
    <details className="col-span-full w-full rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs" data-testid="loyalty-rewards">
      <summary className="cursor-pointer font-bold text-emerald-800 flex items-center gap-2">
        <Gift className="w-4 h-4" />
        {cart.loyaltyRedemption ? `${cart.loyaltyRedemption.name} applied` : 'Use loyalty rewards'}
        <span className="ml-auto whitespace-nowrap">{customer.loyaltyPoints} pts</span>
      </summary>
      <p className="mt-2 text-slate-600">{enabled ? 'Optional: choose a reward or keep your points. Points are deducted only after payment.' : 'The loyalty program is paused. Your points are kept.'}</p>
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
      {error && <p role="alert" className="mt-2 text-rose-700">{error}</p>}
    </details>
  );
};
