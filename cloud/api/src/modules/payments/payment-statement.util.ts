import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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

/**
 * One restaurant's online-payment day statement. Cashfree reverses a refund from the vendor and the
 * platform in proportion to the original split, so the refund's effect on the restaurant's share is
 * derived from that payment's own snapshot (restaurantAmount / amount), never from today's rate.
 * Payments without a snapshot (created before splits existed) count fully to the restaurant.
 */
export async function buildDayStatement(tx: Prisma.TransactionClient, restaurantId: string, date: string | undefined) {
  const range = istDayRange(date);

  const [payments, refunds] = await Promise.all([
    tx.paymentTransaction.findMany({
      where: { restaurantId, status: { in: [...SUCCESS_FAMILY] }, paidAt: { gte: range.start, lt: range.end } },
      orderBy: { paidAt: 'asc' },
      include: { order: { select: { externalOrderId: true } } }
    }),
    tx.refund.findMany({
      where: { restaurantId, status: 'SUCCESS', processedAt: { gte: range.start, lt: range.end } },
      include: { payment: { select: { amount: true, restaurantAmount: true } } }
    })
  ]);

  let grossVolume = 0;
  let platformCommission = 0;
  let restaurantGross = 0;
  for (const p of payments) {
    grossVolume += p.amount;
    platformCommission += p.platformAmount ?? 0;
    restaurantGross += p.restaurantAmount ?? p.amount;
  }

  let refundedAmount = 0;
  let restaurantRefundImpact = 0;
  for (const r of refunds) {
    refundedAmount += r.amount;
    const { amount, restaurantAmount } = r.payment;
    restaurantRefundImpact += amount > 0 && restaurantAmount !== null ? Math.round((r.amount * restaurantAmount) / amount) : r.amount;
  }

  return {
    date: range.date,
    timezone: 'Asia/Kolkata',
    paymentCount: payments.length,
    refundCount: refunds.length,
    grossVolume,
    refundedAmount,
    platformCommission,
    commissionReversed: refundedAmount - restaurantRefundImpact,
    restaurantGross,
    restaurantRefundImpact,
    netPayableToRestaurant: restaurantGross - restaurantRefundImpact,
    settlementNote: 'Cashfree pays the restaurant automatically (default: next day 11:00 AM, unless another schedule is set on the vendor).',
    rows: payments.slice(0, MAX_ROWS).map((p) => ({
      id: p.id,
      externalOrderId: p.order.externalOrderId,
      amount: p.amount,
      platformAmount: p.platformAmount ?? 0,
      restaurantAmount: p.restaurantAmount ?? p.amount,
      method: p.method,
      paidAt: p.paidAt
    })),
    rowsTruncated: payments.length > MAX_ROWS
  };
}
