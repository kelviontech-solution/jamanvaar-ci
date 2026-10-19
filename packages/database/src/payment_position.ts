import type { Order } from '@jamanvaar/types';
import { recordedOrderBalance } from '@jamanvaar/types';
import { getOrderTenders, type TenderBreakdown } from './tender';

const paise = (value: number) => Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;
/** Lifetime balance of an accepted bill. Unknown partial tenders stay OTHER. */
export function orderPaymentPosition(order: Order) {
  const balance = recordedOrderBalance(order);
  const { collectedPaise, refundedPaise, netCollectedPaise } = balance;
  let tenders: TenderBreakdown = { cash: 0, upi: 0, card: 0, wallet: 0, houseAccount: 0, other: 0 };
  if (collectedPaise) {
    const recorded = getOrderTenders(order);
    const sumPaise = Object.values(recorded).reduce((sum, value) => sum + paise(value), 0);
    if (sumPaise === collectedPaise) tenders = recorded;
    else tenders.other = collectedPaise / 100;
  }
  const netTenders = { ...tenders };
  if (refundedPaise) {
    const keys = (Object.keys(tenders) as (keyof TenderBreakdown)[]).filter(key => tenders[key] > 0);
    if (keys.length === 1) netTenders[keys[0]] = netCollectedPaise / 100;
    else {
      Object.keys(netTenders).forEach(key => { netTenders[key as keyof TenderBreakdown] = 0; });
      netTenders.other = netCollectedPaise / 100;
    }
  }
  return { ...balance, tenders, netTenders };
}
