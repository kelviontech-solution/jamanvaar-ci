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
