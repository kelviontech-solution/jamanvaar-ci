import { PrismaService } from '../../prisma/prisma.service';

export const PAYMENT_DEFAULT_COMMISSION_BPS_KEY = 'PAYMENT_DEFAULT_COMMISSION_BPS';

/** Razorpay's fee on every online payment (2%). It is paid out of the platform's commission, not on top of it, so the platform keeps the rest. */
export const RAZORPAY_FEE_BPS = 200;

/** Below this, Razorpay's fee would be bigger than the platform's share and the restaurant would pay part of it. */
export const MIN_COMMISSION_BPS = RAZORPAY_FEE_BPS;

/** The platform's share of each online payment when Super Admin has not chosen one: 3%. A saved value (including 0%) overrides it. */
export const DEFAULT_COMMISSION_BPS = 300;

export async function getDefaultCommissionBps(prisma: PrismaService): Promise<number> {
  const row = await prisma.runAsPlatform((tx) => tx.platformSetting.findUnique({ where: { key: PAYMENT_DEFAULT_COMMISSION_BPS_KEY } }));
  const value = row?.value as { bps?: number } | undefined;
  return typeof value?.bps === 'number' ? value.bps : DEFAULT_COMMISSION_BPS;
}

/**
 * The one rounding rule for splitting a gross amount between the platform and the restaurant, in integer paise —
 * used identically by order creation (commissionSplitFor in payments.service.ts), the restaurant ledger (every
 * PaymentTransaction's own platformAmount/restaurantAmount), and the manual payout batch (which only ever sums
 * these already-frozen values, never recomputes them). `platformAmount + restaurantAmount` always equals
 * `grossAmountPaise` exactly, by construction — the restaurant's share is gross minus whatever the platform fee
 * rounded to, not an independently rounded value, so the two can never silently drift apart.
 */
export function splitCommission(grossAmountPaise: number, commissionBps: number): { platformAmount: number; restaurantAmount: number } {
  const platformAmount = Math.round((grossAmountPaise * commissionBps) / 10000);
  return { platformAmount, restaurantAmount: grossAmountPaise - platformAmount };
}
