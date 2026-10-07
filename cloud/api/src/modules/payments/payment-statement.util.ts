import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RAZORPAY_FEE_BPS } from './commission.util';

const SUCCESS_FAMILY = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_PENDING'] as const;
const MAX_ROWS = 500;

/** Restaurants trade in India; a business day is the calendar day in IST (UTC+05:30). */
export function istDayRange(date: string | undefined): { start: Date; end: Date; date: string } {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestException('date must be in YYYY-MM-DD format');
  }
  const start = new Date(`${date}T00:00:00+05:30`);
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestException('date is not a real calendar date');
  }
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000), date };
}

/** Day totals retain frozen commission snapshots. Refund exposure is held for review;
 * Route is pending and no refund fee-reversal policy has been agreed. */
export async function buildDayStatement(tx: Prisma.TransactionClient, restaurantId: string, date: string | undefined, branchId?: string | null) {
  const range = istDayRange(date);
  await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

  const [payments, refunds] = await Promise.all([
    tx.paymentTransaction.findMany({
      where: { restaurantId, ...(branchId ? { order: { OR: [{branchId},{branchId:null,kiosk:{branchId}}] } } : {}), status: { in: [...SUCCESS_FAMILY] }, paidAt: { gte: range.start, lt: range.end } },
      orderBy: { paidAt: 'asc' },
      include: { order: { select: { externalOrderId: true } }, refunds: { select: { status: true } } }
    }),
    tx.refund.findMany({
      where: { restaurantId, ...(branchId ? { payment: { order: { OR: [{branchId},{branchId:null,kiosk:{branchId}}] } } } : {}), status: 'SUCCESS', processedAt: { gte: range.start, lt: range.end } },
    })
  ]);

  let grossVolume = 0;
  let platformCommission = 0;
  let razorpayFee = 0;
  let restaurantGross = 0;
  let unallocatedCollection = 0;
  for (const p of payments) {
    grossVolume += p.amount;
    platformCommission += p.platformAmount ?? 0;
    razorpayFee += Math.round((p.amount * RAZORPAY_FEE_BPS) / 10000);
    restaurantGross += p.restaurantAmount ?? 0;
    if (p.restaurantAmount === null) unallocatedCollection += p.amount;
  }

  let refundedAmount = 0;
  for (const r of refunds) refundedAmount += r.amount;
  const heldPayable = payments.filter(p => p.status !== 'SUCCESS' || p.refunds.some(r => r.status === 'SUCCESS' || r.status === 'PENDING'))
    .reduce((sum, p) => sum + (p.restaurantAmount ?? 0), 0);

  return {
    date: range.date,
    timezone: 'Asia/Kolkata',
    paymentCount: payments.length,
    refundCount: refunds.length,
    grossVolume,
    refundedAmount,
    platformCommission,
    razorpayFee,
    platformNetCommission: platformCommission - razorpayFee,
    commissionReversed: null, // No fee-reversal policy has been defined.
    restaurantGross,
    restaurantRefundImpact: null,
    heldPayable,
    unallocatedCollection,
    netPayableToRestaurant: restaurantGross - heldPayable,
    settlementNote: 'Jamanvaar collects payments; verified bank accounts receive manual payouts. Refund-related shares are held for reconciliation while the refund fee policy is pending. Route is not enabled yet.',
    rows: payments.slice(0, MAX_ROWS).map((p) => ({
      id: p.id,
      externalOrderId: p.order.externalOrderId,
      amount: p.amount,
      platformAmount: p.platformAmount ?? 0,
      restaurantAmount: p.restaurantAmount,
      method: p.method,
      paidAt: p.paidAt
    })),
    rowsTruncated: payments.length > MAX_ROWS
  };
}
