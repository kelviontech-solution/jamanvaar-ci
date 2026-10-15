import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { orderingAvailability, DEFAULT_QR_RULES } from '../qr/qr-rules';
import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const servicePolicySchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    pausedUntil: z.string().datetime().nullable(),
    message: z.string().trim().max(200),
    channels: z
      .array(z.enum(['QR', 'KIOSK']))
      .max(2)
      .refine((v) => new Set(v).size === v.length, 'Select each channel once'),
    maxPendingOrders: z.number().int().min(0).max(10000),
    preparationMinutes: z.number().int().min(1).max(240),
    hours: z
      .array(z.object({ day: z.number().int().min(0).max(6), open: time, close: time }).strict())
      .max(21),
  })
  .strict();
export type ServicePolicy = z.infer<typeof servicePolicySchema>;
export const DEFAULT_SERVICE_POLICY: Omit<ServicePolicy, 'expectedVersion'> = {
  pausedUntil: null,
  message: 'Ordering is temporarily paused. Please ask the team.',
  channels: ['QR', 'KIOSK'],
  maxPendingOrders: 0,
  preparationMinutes: 20,
  hours: [],
};

/** Shared online admission control. Existing orders and payment retries remain valid. */
export async function branchServiceState(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  branchId: string,
  channel: 'QR' | 'KIOSK',
  now = new Date(),
) {
  const [row, branch] = await Promise.all([
    tx.syncedEntity.findUnique({
      where: {
        restaurantId_entityType_externalId: { restaurantId, entityType: 'OPS_SERVICE', externalId: branchId },
      },
    }),
    tx.branch.findFirst({ where: { id: branchId, restaurantId }, select: { timezone: true } }),
  ]);
  const p = { ...DEFAULT_SERVICE_POLICY, ...((row?.payload as object) ?? {}) };
  if (!p.channels.includes(channel))
    return { available: true, message: '', preparationMinutes: p.preparationMinutes, configured: !!row };
  const hours = orderingAvailability(
    { ...DEFAULT_QR_RULES, hours: p.hours, pausedUntil: p.pausedUntil },
    branch?.timezone ?? 'Asia/Kolkata',
    now,
  );
  if (!hours.available)
    return {
      ...hours,
      message: p.pausedUntil && new Date(p.pausedUntil) > now ? p.message : hours.message,
      preparationMinutes: p.preparationMinutes,
      configured: !!row,
    };
  if (p.maxPendingOrders) {
    const recent = new Date(now.getTime() - 30 * 60000);
    const count = await tx.syncedOrder.count({
      where: {
        restaurantId,
        branchId,
        OR: [
          { status: { in: ['NEW', 'PENDING', 'CONFIRMED', 'PREPARING', 'COOKING'] } },
          { status: 'DRAFT', createdAt: { gte: recent } },
        ],
      },
    });
    // Reserve online kiosk checkouts too, without counting a cash-converted order twice.
    const reservations = await tx.order.findMany({
      where: {
        restaurantId,
        branchId,
        source: 'KIOSK',
        status: 'PENDING_PAYMENT',
        createdAt: { gte: recent },
      },
      select: { externalOrderId: true },
      take: p.maxPendingOrders,
    });
    const admitted = reservations.length
      ? await tx.syncedOrder.count({
          where: {
            restaurantId,
            branchId,
            externalOrderId: { in: reservations.map((r) => r.externalOrderId) },
          },
        })
      : 0;
    if (count + reservations.length - admitted >= p.maxPendingOrders)
      return {
        available: false,
        message: 'The kitchen is at capacity. Your existing orders are still being prepared.',
        preparationMinutes: p.preparationMinutes,
        configured: !!row,
      };
  }
  return { available: true, message: '', preparationMinutes: p.preparationMinutes, configured: !!row };
}
export async function assertBranchAccepting(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  branchId: string,
  channel: 'QR' | 'KIOSK',
) {
  const state = await branchServiceState(tx, restaurantId, branchId, channel);
  if (!state.available)
    throw new ConflictException({ code: 'BRANCH_ORDERING_PAUSED', message: state.message });
}
