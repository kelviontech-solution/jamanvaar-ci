import { Prisma } from '@prisma/client';

/** One gapless counter per restaurant. Branch devices filter by branch on read but share the counter, so a cursor is always coherent. */
const SEQUENCE_SCOPE = '_';

/** Bumps and returns the restaurant's change sequence. The row lock is held until the enclosing transaction ends, so sequence order equals commit order. */
export async function nextSyncSequence(tx: Prisma.TransactionClient, restaurantId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "SyncSequence" ("restaurantId", "scope", "value")
    VALUES (${restaurantId}, ${SEQUENCE_SCOPE}, 1)
    ON CONFLICT ("restaurantId", "scope") DO UPDATE SET "value" = "SyncSequence"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}
