import { INestApplication } from '@nestjs/common';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * EC-13: a test fixture's afterAll commonly does `tx.restaurant.deleteMany({ where: { id:
 * restaurantId } })`, where `restaurantId` is assigned only partway through beforeAll. If beforeAll
 * throws first, afterAll still runs (vitest always calls it) with `restaurantId` still undefined,
 * and Prisma's own documented behavior is to treat an explicitly-undefined filter value as "no
 * filter on this field" — turning a scoped cleanup into an unbounded deleteMany across every row.
 *
 * PrismaService now installs a guard (test-database-only — see installTestCleanupGuard) that
 * refuses a deleteMany/delete whose where clause has an `id`-shaped key set to undefined. This
 * proves the guard is actually active against the real connected test database, not just reviewed
 * as source, and that it still allows every normal, fully-specified cleanup to work.
 */
describe('Prisma test-cleanup guard (EC-13)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses deleteMany when an id-shaped filter is undefined, instead of silently matching every row', async () => {
    const undefinedId: string | undefined = undefined;
    await expect(prisma.restaurant.deleteMany({ where: { id: undefinedId } })).rejects.toThrow(/Refusing deleteMany/);
  });

  it('refuses delete when an id-shaped filter is undefined', async () => {
    const undefinedId: string | undefined = undefined;
    await expect(prisma.plan.delete({ where: { id: undefinedId as unknown as string } })).rejects.toThrow(/Refusing delete/);
  });

  it('still allows a normal, fully-specified deleteMany to run (the guard does not block real cleanup)', async () => {
    // A real, defined (if nonexistent) id — deleteMany matching zero rows is a legitimate, common
    // outcome and must not be confused with the undefined-filter hazard this guard exists for.
    await expect(prisma.restaurant.deleteMany({ where: { id: 'does-not-exist-00000000' } })).resolves.toMatchObject({ count: 0 });
  });

  it('does not block deleteMany filtering only on non-id fields, even when that value happens to be undefined', async () => {
    // A deliberately-optional, non-identity filter (e.g. an undefined `name` meaning "any name") is
    // a different, legitimate pattern from a missing owner id — the guard must not conflate them.
    const optionalNameFilter: string | undefined = undefined;
    await expect(prisma.restaurant.deleteMany({ where: { gstin: 'does-not-exist-by-gstin-00000000', name: optionalNameFilter } })).resolves.toMatchObject({ count: 0 });
  });
});
