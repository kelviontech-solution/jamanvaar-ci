import { Prisma } from '@prisma/client';

/** Serialize bank changes, payout claims, and refund reservations per restaurant. */
export async function lockSettlement(tx: Prisma.TransactionClient, restaurantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'payment-connection:' + restaurantId}))`;
}
