/**
 * Phase 1 (Restaurant Identity) one-off backfill: every Restaurant created before
 * restaurantCode existed gets one now. Prefers the OWNER user's phone (the only mobile
 * number recorded anywhere pre-Phase-1); a restaurant with no usable phone gets a
 * migration-safe fallback code (JM + a random 10-digit filler, flagged
 * restaurantCodeIsFallback=true) so it's never left null, per spec section 44 — never
 * silently overwrite identity, always flag for Super Admin review instead.
 * Idempotent: only ever touches rows where restaurantCode IS NULL, so re-running is safe.
 */
import { PrismaClient } from '@prisma/client';
import { randomInt } from 'crypto';
import { generateRestaurantCode } from '../src/modules/restaurants/restaurant-code.util';
import { isValidIndianPhone, normalizeIndianPhone } from '../src/common/validation/phone';

function fallbackMobile(): string {
  // First digit 6-9 (valid Indian mobile leading digit), the rest random.
  const first = String(randomInt(6, 10));
  const rest = Array.from({ length: 9 }, () => randomInt(0, 10)).join('');
  return `${first}${rest}`;
}

export async function backfillRestaurantCodes(prisma: PrismaClient): Promise<{ updated: number; fallbacks: number }> {
  let updated = 0;
  let fallbacks = 0;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.is_platform_context = 'true'`);

    const restaurants = await tx.restaurant.findMany({
      where: { restaurantCode: null },
      include: { users: { where: { role: 'OWNER' }, take: 1, select: { phone: true } } }
    });

    for (const restaurant of restaurants) {
      const ownerPhone = restaurant.users[0]?.phone;
      const isFallback = !ownerPhone || !isValidIndianPhone(ownerPhone);
      const mobile = isFallback ? fallbackMobile() : ownerPhone!;

      // Retry on the (rare) collision the same way restaurant creation does.
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidateMobile = attempt === 0 ? mobile : fallbackMobile();
        const restaurantCode = generateRestaurantCode(candidateMobile);
        try {
          await tx.restaurant.update({
            where: { id: restaurant.id },
            data: {
              mobile: normalizeIndianPhone(candidateMobile),
              restaurantCode,
              restaurantCodeIsFallback: isFallback || attempt > 0
            }
          });
          updated++;
          if (isFallback || attempt > 0) fallbacks++;
          break;
        } catch (err) {
          if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002' && attempt < 4) continue;
          throw err;
        }
      }
    }
  });

  return { updated, fallbacks };
}

/* c8 ignore start */
if (require.main === module) {
  const prisma = new PrismaClient();
  backfillRestaurantCodes(prisma)
    .then((result) => {
      console.log(`Backfilled ${result.updated} restaurant(s), ${result.fallbacks} using a fallback code that needs Super Admin review.`);
    })
    .finally(() => prisma.$disconnect());
}
/* c8 ignore stop */
