import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Proves tenant isolation at the database layer itself — not by asserting
 * that application code "remembered" to filter, but by showing Postgres
 * itself refuses to return another tenant's rows even when queried directly.
 * If RLS were ever misconfigured to be decorative (missing FORCE, or a role
 * with BYPASSRLS), every test below would fail loudly.
 */
describe('Tenant isolation via PostgreSQL Row-Level Security (Phase 1a)', () => {
  let prisma: PrismaService;
  let restaurantAId: string;
  let restaurantBId: string;
  let branchAId: string;
  let branchBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);

    await prisma.runAsPlatform(async (tx) => {
      const a = await tx.restaurant.create({ data: { name: `TEST RLS Restaurant A ${Date.now()}` } });
      const b = await tx.restaurant.create({ data: { name: `TEST RLS Restaurant B ${Date.now()}` } });
      restaurantAId = a.id;
      restaurantBId = b.id;

      const branchA = await tx.branch.create({
        data: { restaurantId: a.id, name: 'A Main', code: 'MAIN' }
      });
      const branchB = await tx.branch.create({
        data: { restaurantId: b.id, name: 'B Main', code: 'MAIN' }
      });
      branchAId = branchA.id;
      branchBId = branchB.id;
    });
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) =>
      tx.restaurant.deleteMany({ where: { id: { in: [restaurantAId, restaurantBId] } } })
    );
  });

  it('a tenant context for Restaurant A sees only its own branch, never Restaurant B\'s', async () => {
    const branches = await prisma.runAsTenant(restaurantAId, (tx) => tx.branch.findMany());
    expect(branches.map((b) => b.id)).toEqual([branchAId]);
    expect(branches.map((b) => b.id)).not.toContain(branchBId);
  });

  it('a tenant context for Restaurant A cannot fetch Restaurant B\'s branch by id', async () => {
    const found = await prisma.runAsTenant(restaurantAId, (tx) =>
      tx.branch.findUnique({ where: { id: branchBId } })
    );
    expect(found).toBeNull();
  });

  it('a tenant context for Restaurant A cannot fetch Restaurant B\'s row itself', async () => {
    const found = await prisma.runAsTenant(restaurantAId, (tx) =>
      tx.restaurant.findUnique({ where: { id: restaurantBId } })
    );
    expect(found).toBeNull();
  });

  it('a query run with NO context at all (missing tenant context) sees nothing, not everything', async () => {
    // Deliberately bypassing runAsPlatform/runAsTenant — this is the "missing
    // tenant context is rejected" case: fail-closed at the database, since
    // application code that forgot to scope a query is exactly the bug RLS
    // exists to catch.
    const branches = await prisma.branch.findMany({
      where: { id: { in: [branchAId, branchBId] } }
    });
    expect(branches).toHaveLength(0);

    const restaurants = await prisma.restaurant.findMany({
      where: { id: { in: [restaurantAId, restaurantBId] } }
    });
    expect(restaurants).toHaveLength(0);
  });

  it('platform context sees both restaurants\' data — explicit cross-tenant access, not a leak', async () => {
    const branches = await prisma.runAsPlatform((tx) =>
      tx.branch.findMany({ where: { id: { in: [branchAId, branchBId] } } })
    );
    expect(branches.map((b) => b.id).sort()).toEqual([branchAId, branchBId].sort());
  });
});
