import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { stableJson } from './operations-records';
export async function rememberAppearance(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  target: 'QR' | 'KIOSK',
  key: string,
  branchId: string | null,
  presentation: Record<string, unknown>
) {
  const digest = createHash('sha256')
      .update(stableJson(presentation) ?? '{}')
      .digest('hex'),
    externalId = `${target}:${key}:${digest}`;
  await tx.syncedEntity.upsert({
    where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'OPS_APPEARANCE_VERSION', externalId } },
    create: {
      restaurantId,
      entityType: 'OPS_APPEARANCE_VERSION',
      externalId,
      payload: { target, key, branchId: branchId ?? 'restaurant', presentation, at: new Date().toISOString() } as Prisma.InputJsonValue
    },
    update: {}
  });
}
