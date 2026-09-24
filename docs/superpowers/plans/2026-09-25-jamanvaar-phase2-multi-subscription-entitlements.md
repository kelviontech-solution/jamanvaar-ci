# JAMANVAAR Phase 2: Multi-Subscription Entitlement Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native,
> in-session) to implement this plan task-by-task. Subagents are disallowed on this project.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a restaurant hold two concurrent active subscriptions — one `RESTAURANT`-family
(Core/Pro/QR) and one `KIOSK`-family (Standard/Pro) — with effective app entitlements and
per-app device quotas computed as the union across every active subscription, not just the
most recent one. This is the architectural unlock Phase 5's Kiosk-as-add-on commercial model
depends on.

**Architecture:** Add `Plan.productFamily` (`RESTAURANT | KIOSK`, default `RESTAURANT`) —
family lives on the Plan, not duplicated onto Subscription, since a plan's family never
changes independent of the plan itself. `SubscriptionsService.assign()`'s "one active
subscription per restaurant" guard becomes "one active subscription per (restaurant, product
family)". `ApplicationEntitlementsService` gains an aggregate `isAppEnabled` (any active
subscription grants it) and one shared `assertDeviceQuotaAvailable` helper, replacing three
near-identical inline device-count checks in `activation-keys.service.ts` and
`tenant-auth.service.ts`. `TenantAuthService.getEntitlements`'s response stays
byte-for-byte identical for the (today universal, and still the common) single-subscription
case; multi-subscription restaurants additionally get `subscriptions[]` and
`effectiveEntitlements`.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Zod, Vitest + Supertest.

**Spec:** `docs/superpowers/plans/2026-09-24-jamanvaar-commercial-platform-redesign-MASTER.md`
(§ "Phase 2 — Multi-subscription entitlement aggregation", § "0. How this differs from the
original spec", decision #3) and `docs/superpowers/plans/2026-09-24-jamanvaar-phase1-restaurant-identity.md`
(prior phase — `restaurantCode`, already shipped).

## Global Constraints

- A restaurant with exactly one active subscription (the universal case today, and still the
  common case after this phase — nothing yet lets Super Admin create a second one through the
  UI, that's Phase 5) must behave byte-for-byte identically to before this phase: same
  `isAppEnabled` results, same device-quota numbers, same `getEntitlements` top-level shape.
  This is what "never break an existing restaurant" means concretely here.
- `assign()`'s new guard is keyed on `(restaurantId, plan.productFamily)`, not on the plan
  itself — two different RESTAURANT-family plans still conflict; only different families don't.
- Device quota enforcement moves from "total devices across every type ≤ one global
  `plan.maxDevices`" to "devices of type X ≤ `ApplicationEntitlement.deviceQuota` for the
  entitlement that grants X, falling back to that entitlement's owning subscription's
  `plan.maxDevices`" (spec section 38's per-app quota model). This is a real, intentional
  policy change already described in the master plan and shown to the user before they said
  "complete all phases" — implement it, don't re-litigate it, but the ledger records it as a
  ruling with its cost.
- Every new Super Admin-facing state change still goes through `AuditService`.
- Money/pricing/plan catalog changes are Phase 5's job, not this phase's — do not touch
  `seed.ts` pricing or add new Plan rows here.

## Review Focus

- A restaurant with two active subscriptions where BOTH happen to enable the same AppCode
  (e.g. two RESTAURANT-family... no, guarded against — but two subscriptions of different
  families both enabling KIOSK, if that were ever possible) — `isAppEnabled` must not double-
  count or throw, just return true once. Covered by Task 3's test.
  test.
- A device-quota check for an app whose entitlement row has no `deviceQuota` override — must
  fall back to that row's *own* subscription's plan, not some other active subscription's
  plan. Covered by Task 4's test (two subscriptions with different `maxDevices`).
- `assign()` called for a second RESTAURANT-family plan while one is already active — must
  still be rejected (the existing single-family guard must not accidentally become "anything
  goes"). Covered by Task 2's test.
- `getEntitlements` for the single-subscription case — every existing top-level field
  (`subscriptionStatus`, `expiresAt`, `planName`, `planTier`, `entitlements`, `limits`) must
  be present and unchanged in both shape and value. Covered by Task 5's regression test.
- A subscription in `SUSPENDED`/`EXPIRED`/`PAST_DUE` status must not contribute to the
  aggregate (`isAppEnabled` and device quota both already filter on
  `status: { in: ['TRIAL', 'ACTIVE'] }` for the quota checks, but `isAppEnabled` today also
  accepts `PAST_DUE` — this phase must keep that distinction consistent, not accidentally
  tighten or loosen it). Covered by Task 3's test.

---

### Task 1: `Plan.productFamily`

**Files:**
- Modify: `cloud/api/prisma/schema.prisma` (add `ProductFamily` enum, `Plan.productFamily` field)
- Create: `cloud/api/prisma/migrations/20260925090000_plan_product_family/migration.sql`
- Test: `cloud/api/test/plans.e2e.spec.ts` (existing file — add cases)

**Interfaces:**
- Produces: `Plan.productFamily: 'RESTAURANT' | 'KIOSK'`, default `'RESTAURANT'` — consumed by
  Task 2 (`assign()`'s guard).

- [ ] **Step 1: Add the enum and field to the Prisma schema**

In `cloud/api/prisma/schema.prisma`, before `model Plan {`:

```prisma
enum ProductFamily {
  RESTAURANT
  KIOSK
}
```

Inside `model Plan { ... }`, after `tier` field:

```prisma
  /// Which commercial product line this plan belongs to. A restaurant may hold one active
  /// subscription per family at once (see SubscriptionsService.assign) — e.g. a RESTAURANT
  /// Core/Pro/QR plan plus a separate KIOSK Standard/Pro add-on, concurrently.
  productFamily ProductFamily @default(RESTAURANT)
```

- [ ] **Step 2: Write the migration**

```sql
-- cloud/api/prisma/migrations/20260925090000_plan_product_family/migration.sql
-- Phase 2 (multi-subscription entitlements): plans belong to a commercial product family.
-- Every existing plan defaults to RESTAURANT (the only family that has ever existed) — this
-- migration changes no restaurant's effective entitlements.
CREATE TYPE "ProductFamily" AS ENUM ('RESTAURANT', 'KIOSK');
ALTER TABLE "Plan" ADD COLUMN "productFamily" "ProductFamily" NOT NULL DEFAULT 'RESTAURANT';
```

- [ ] **Step 3: Apply to both databases and regenerate the client**

Run: `cd cloud/api && npx prisma migrate deploy && npx prisma generate`
Expected: "Applying migration `20260925090000_plan_product_family`", then "Generated Prisma Client".
Run: `cd cloud/api && DATABASE_URL="postgresql://jamanvaar_app:jamanvaar_app_local@localhost:5432/jamanvaar_test?schema=public" npx prisma migrate deploy`
Expected: same migration applied to `jamanvaar_test`.

- [ ] **Step 4: Write the failing test**

Add to `cloud/api/test/plans.e2e.spec.ts` (find its existing `create`-plan test for the exact
request shape and reuse its `accessToken`/cleanup pattern):

```typescript
  it('defaults a new plan to the RESTAURANT product family', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tier: 'CORE', name: `TEST Family Default ${Date.now()}`, priceMonthly: 100000, maxBranches: 1, maxDevices: 5, maxUsers: 5, entitlements: {} });
    expect(res.status).toBe(201);
    expect(res.body.productFamily).toBe('RESTAURANT');
    createdPlanIds.push(res.body.id);
  });

  it('accepts an explicit KIOSK product family', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tier: 'CORE', name: `TEST Family Kiosk ${Date.now()}`, productFamily: 'KIOSK', priceMonthly: 100000, maxBranches: 1, maxDevices: 5, maxUsers: 5, entitlements: {} });
    expect(res.status).toBe(201);
    expect(res.body.productFamily).toBe('KIOSK');
    createdPlanIds.push(res.body.id);
  });
```

If `plans.e2e.spec.ts` has no `createdPlanIds` cleanup array yet, add one following the same
pattern as `restaurants.e2e.spec.ts`'s `createdRestaurantIds` (push each created id, delete
them all in `afterAll` via `prisma.runAsPlatform`).

- [ ] **Step 5: Run to verify RED**

Run: `cd cloud/api && npx vitest run test/plans.e2e.spec.ts`
Expected: FAIL — `productFamily` is `undefined` in the response (Zod strips it; the DTO
doesn't accept it yet), so both new assertions fail.

- [ ] **Step 6: Accept `productFamily` in the plan DTO**

In `cloud/api/src/modules/plans/dto/plan.dto.ts`, add `productFamily:
z.enum(['RESTAURANT', 'KIOSK']).default('RESTAURANT')` to `createPlanSchema` (and as
`.optional()` with no default to `updatePlanSchema` if that schema exists separately — check
the file first; follow its existing pattern for `tier`).

- [ ] **Step 7: Run to verify GREEN**

Run: `cd cloud/api && npx vitest run test/plans.e2e.spec.ts`
Expected: PASS (all tests in the file, including the 2 new ones).

- [ ] **Step 8: Commit**

```bash
git add cloud/api/prisma/schema.prisma cloud/api/prisma/migrations/20260925090000_plan_product_family cloud/api/src/modules/plans/dto/plan.dto.ts cloud/api/test/plans.e2e.spec.ts
git commit -m "feat: add Plan.productFamily (RESTAURANT/KIOSK)"
```

---

### Task 2: One active subscription per (restaurant, product family)

**Files:**
- Modify: `cloud/api/src/modules/subscriptions/subscriptions.service.ts:38-52` (`assign`)
- Test: `cloud/api/test/subscription-extend.e2e.spec.ts` or a new
  `cloud/api/test/multi-family-subscriptions.e2e.spec.ts` (create if no existing file fits —
  check first: this plan's Task 6 also needs a home, put both in the new file)

**Interfaces:**
- Consumes: `Plan.productFamily` (Task 1).
- Produces: `SubscriptionsService.assign()` now allows a restaurant to hold one active
  subscription per family simultaneously — consumed by Task 6's end-to-end test.

- [ ] **Step 1: Write the failing tests**

```typescript
// cloud/api/test/multi-family-subscriptions.e2e.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Multi-family subscriptions (Phase 2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const stamp = Date.now();
  const adminEmail = `test-multifam-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const createdRestaurantIds: string[] = [];
  const createdPlanIds: string[] = [];
  let restaurantId: string;
  let restaurantPlanId: string;
  let kioskPlanId: string;
  const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    token = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const restaurant = await auth(request(app.getHttpServer()).post('/api/v1/restaurants')).send({
      name: `TEST Multifam ${stamp}`, mobile: `9${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail: `multifam-${stamp}@example.com`
    });
    restaurantId = restaurant.body.restaurant.id;
    createdRestaurantIds.push(restaurantId);

    const restaurantPlan = await auth(request(app.getHttpServer()).post('/api/v1/plans')).send({
      tier: 'PRO', name: `TEST Multifam Restaurant Plan ${stamp}`, priceMonthly: 700000, maxBranches: 5, maxDevices: 3, maxUsers: 10, entitlements: {}
    });
    restaurantPlanId = restaurantPlan.body.id;
    createdPlanIds.push(restaurantPlanId);

    const kioskPlan = await auth(request(app.getHttpServer()).post('/api/v1/plans')).send({
      tier: 'CORE', name: `TEST Multifam Kiosk Plan ${stamp}`, productFamily: 'KIOSK', priceMonthly: 900000, maxBranches: 5, maxDevices: 2, maxUsers: 10, entitlements: {}
    });
    kioskPlanId = kioskPlan.body.id;
    createdPlanIds.push(kioskPlanId);
  });

  afterAll(async () => {
    if (createdRestaurantIds.length) await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } }));
    if (createdPlanIds.length) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: createdPlanIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('assigns a RESTAURANT-family subscription', async () => {
    const res = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId, planId: restaurantPlanId, status: 'ACTIVE', expiresAt: inDays(365)
    });
    expect(res.status).toBe(201);
  });

  it('rejects a second RESTAURANT-family subscription for the same restaurant', async () => {
    const secondRestaurantPlan = await auth(request(app.getHttpServer()).post('/api/v1/plans')).send({
      tier: 'CORE', name: `TEST Multifam Second Restaurant Plan ${stamp}`, priceMonthly: 500000, maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    createdPlanIds.push(secondRestaurantPlan.body.id);

    const res = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId, planId: secondRestaurantPlan.body.id, status: 'ACTIVE', expiresAt: inDays(365)
    });
    expect(res.status).toBe(409);
  });

  it('allows a concurrent KIOSK-family subscription for the same restaurant', async () => {
    const res = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId, planId: kioskPlanId, status: 'ACTIVE', expiresAt: inDays(365)
    });
    expect(res.status).toBe(201);
  });

  it('rejects a second KIOSK-family subscription once one is already active', async () => {
    const secondKioskPlan = await auth(request(app.getHttpServer()).post('/api/v1/plans')).send({
      tier: 'PRO', name: `TEST Multifam Second Kiosk Plan ${stamp}`, productFamily: 'KIOSK', priceMonthly: 1100000, maxBranches: 5, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    createdPlanIds.push(secondKioskPlan.body.id);

    const res = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId, planId: secondKioskPlan.body.id, status: 'ACTIVE', expiresAt: inDays(365)
    });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `cd cloud/api && npx vitest run test/multi-family-subscriptions.e2e.spec.ts`
Expected: FAIL on "allows a concurrent KIOSK-family subscription" — the current guard rejects
any second active subscription regardless of family (409 where 201 is expected). The other
three tests already pass with today's code (they don't yet exercise the new behavior).

- [ ] **Step 3: Change the guard to be family-scoped**

In `cloud/api/src/modules/subscriptions/subscriptions.service.ts`, replace the `existing`
lookup inside `assign()`:

```typescript
      const existing = await tx.subscription.findFirst({
        where: {
          restaurantId: dto.restaurantId,
          status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] },
          plan: { productFamily: plan.productFamily }
        }
      });
      if (existing) {
        throw new ConflictException(
          `Restaurant already has an active ${plan.productFamily} subscription — use change-plan or renew`
        );
      }
```

(This must come after `const plan = await tx.plan.findUnique(...)` — the existing code already
fetches `plan` before this check, so only the `existing` lookup's `where` clause and the error
message change.)

- [ ] **Step 4: Run to verify GREEN**

Run: `cd cloud/api && npx vitest run test/multi-family-subscriptions.e2e.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Regression-check the subscriptions module**

Run: `cd cloud/api && npx vitest run test/subscription-extend.e2e.spec.ts test/saas-modules.e2e.spec.ts`
Expected: PASS — no existing subscription test assumed the old cross-family guard message or
behavior in a way that breaks.

- [ ] **Step 6: Commit**

```bash
git add cloud/api/src/modules/subscriptions/subscriptions.service.ts cloud/api/test/multi-family-subscriptions.e2e.spec.ts
git commit -m "feat: allow one active subscription per product family per restaurant"
```

---

### Task 3: Aggregate `isAppEnabled` across every active subscription

**Files:**
- Modify: `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts:133-144`
- Test: `cloud/api/test/multi-family-subscriptions.e2e.spec.ts` (extend)

**Interfaces:**
- Consumes: nothing new (same `tx`, `restaurantId`, `appCode` signature).
- Produces: `isAppEnabled(tx, restaurantId, appCode)` now returns `true` if ANY active/trial/
  past-due subscription's entitlement row for that app is enabled, not just the latest
  subscription's. Consumed by every existing caller unchanged (`assertAppEnabled`,
  `activation-keys.service.ts`, `tenant-auth.service.ts`) — no call site changes needed for
  this task; the behavior change is entirely inside the method.

- [ ] **Step 1: Write the failing test**

Add to `multi-family-subscriptions.e2e.spec.ts` (after the KIOSK-subscription test from Task 2,
reusing its `restaurantId`, the now-active RESTAURANT and KIOSK subscriptions, and their fixed
apps — RESTAURANT/PRO tier includes `KDS` per `DEFAULT_APPS_BY_TIER`, KIOSK/CORE tier's default
apps come from the same table's `CORE` entry, `[POS, POS_ADMIN, KDS]`, which does NOT include
`KIOSK`/`KIOSK_ADMIN` — so first redeem/enable KIOSK explicitly via the entitlements endpoint
to make the test meaningful):

```typescript
  it('POS (granted by the RESTAURANT subscription) and KIOSK (granted by the KIOSK subscription) are both enabled at once', async () => {
    const entitlementsRes = await auth(request(app.getHttpServer()).get(`/api/v1/tenant/entitlements`)); // placeholder — see next paragraph
  });
```

Actually use the real endpoint: `tenant-auth.service.ts`'s `getEntitlements` is exposed via
`GET /api/v1/tenant-auth/me/entitlements`, but that requires a tenant session, not a platform
one. For this task, test `isAppEnabled` through its existing platform-facing consumer instead —
`activation-keys.service.ts`'s `generate()` already calls `assertAppEnabled` and 403s when an
app isn't enabled. Use that as the observable behavior:

```typescript
  it('an activation key can be generated for POS (from the RESTAURANT sub) and for KIOSK (from the KIOSK sub) on the same restaurant', async () => {
    const posKey = await auth(request(app.getHttpServer()).post('/api/v1/activation-keys')).send({
      restaurantId, allowedDeviceType: 'POS', expiresAt: inDays(1)
    });
    expect(posKey.status).toBe(201);

    // KIOSK/KIOSK_ADMIN aren't in CORE tier's default app list, so enable KIOSK explicitly on
    // the kiosk subscription first (Super Admin's per-app override path, already shipped).
    const kioskSub = await auth(request(app.getHttpServer()).get(`/api/v1/subscriptions`));
    const kioskSubscriptionId = kioskSub.body.find((s: { planId: string }) => s.planId === kioskPlanId).id;
    const enableKiosk = await auth(request(app.getHttpServer()).patch(`/api/v1/application-entitlements/${kioskSubscriptionId}/KIOSK`)).send({ enabled: true });
    expect(enableKiosk.status).toBe(200);

    const kioskKey = await auth(request(app.getHttpServer()).post('/api/v1/activation-keys')).send({
      restaurantId, allowedDeviceType: 'KIOSK', expiresAt: inDays(1)
    });
    expect(kioskKey.status).toBe(201);
  });
```

(Confirm the exact route path/method for enabling a per-app entitlement by reading
`application-entitlements.controller.ts` before writing this step for real — the plan's
placeholder above must be corrected to match the actual route if it differs.)

- [ ] **Step 2: Run to verify RED**

Run: `cd cloud/api && npx vitest run test/multi-family-subscriptions.e2e.spec.ts`
Expected: FAIL on the `kioskKey` assertion — `isAppEnabled` today only checks the *latest*
subscription (`orderBy: { createdAt: 'desc' }`), which is the KIOSK one if it was created after
the RESTAURANT one, or vice versa; whichever subscription is NOT "latest" has its apps
invisible to `isAppEnabled`, so either the `posKey` or the `kioskKey` assertion fails
depending on creation order. Read the actual failure before writing Step 3 — it confirms which
half of the aggregate is currently missing.

- [ ] **Step 3: Change `isAppEnabled` to aggregate**

In `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`,
replace the body of `isAppEnabled`:

```typescript
  async isAppEnabled(tx: TxClient, restaurantId: string, appCode: AppCode): Promise<boolean> {
    const subs = await tx.subscription.findMany({
      where: { restaurantId, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
      select: { id: true }
    });
    if (subs.length === 0) return false;

    const row = await tx.applicationEntitlement.findFirst({
      where: { subscriptionId: { in: subs.map((s) => s.id) }, appCode, enabled: true }
    });
    return row !== null;
  }
```

- [ ] **Step 4: Run to verify GREEN**

Run: `cd cloud/api && npx vitest run test/multi-family-subscriptions.e2e.spec.ts`
Expected: PASS (all tests in the file so far).

- [ ] **Step 5: Regression-check every existing caller**

Run: `cd cloud/api && npx vitest run test/activation-redeem.e2e.spec.ts test/device-enforcement.e2e.spec.ts test/device-limit.e2e.spec.ts test/fleet-and-keys.e2e.spec.ts test/tenant-auth.e2e.spec.ts test/saas-modules.e2e.spec.ts`
Expected: PASS — every one of these restaurants has exactly one active subscription, so the
aggregate over one subscription must produce the identical answer to before.

- [ ] **Step 6: Commit**

```bash
git add cloud/api/src/modules/application-entitlements/application-entitlements.service.ts cloud/api/test/multi-family-subscriptions.e2e.spec.ts
git commit -m "feat: aggregate isAppEnabled across every active subscription"
```

---

### Task 4: Shared per-app device-quota check, replacing three duplicated inline checks

**Files:**
- Modify: `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts` (add `assertDeviceQuotaAvailable`)
- Modify: `cloud/api/src/modules/activation-keys/activation-keys.service.ts` (`redeem`, `reactivate`)
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts` (`activateDevice`)
- Modify: `cloud/api/src/modules/activation-keys/activation-keys.module.ts`,
  `cloud/api/src/modules/tenant-auth/tenant-auth.module.ts` (import `ApplicationEntitlementsModule`
  if not already — both already inject `ApplicationEntitlementsService`, so this is likely a
  no-op; verify, don't assume).
- Test: `cloud/api/test/multi-family-subscriptions.e2e.spec.ts` (extend),
  `cloud/api/test/device-limit.e2e.spec.ts` (regression)

**Interfaces:**
- Produces: `ApplicationEntitlementsService.assertDeviceQuotaAvailable(tx, restaurantId,
  appCode): Promise<void>` — throws `ConflictException` with the same message shape the three
  call sites used before (`"This restaurant's plan allows N device(s)..."`), consumed by
  `activation-keys.service.ts`'s `redeem`/`reactivate` and `tenant-auth.service.ts`'s
  `activateDevice`, replacing their inline logic.

- [ ] **Step 1: Write the failing test**

Add to `multi-family-subscriptions.e2e.spec.ts`. The RESTAURANT plan from Task 2's setup has
`maxDevices: 3`, the KIOSK plan has `maxDevices: 2` — prove they're enforced independently:

```typescript
  it('device quota is enforced per app, independently — POS uses the RESTAURANT plan cap, KIOSK uses the KIOSK plan cap', async () => {
    const redeem = (code: string, deviceType: string) =>
      request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code, deviceType, appVersion: '1.0.0' });
    const genKey = async (deviceType: string) => {
      const res = await auth(request(app.getHttpServer()).post('/api/v1/activation-keys')).send({ restaurantId, allowedDeviceType: deviceType, expiresAt: inDays(1) });
      return res.body.code as string;
    };

    // Fill the KIOSK plan's 2-device cap (one already redeemed by the previous test's kioskKey
    // doesn't count here since that key was generated, not redeemed — redeem it now).
    for (let i = 0; i < 2; i++) {
      const key = await genKey('KIOSK');
      const res = await redeem(key, 'KIOSK');
      expect(res.status).toBe(201);
    }
    // A 3rd KIOSK device must be rejected — KIOSK's cap (2) is reached...
    const thirdKioskKey = await genKey('KIOSK');
    const thirdKiosk = await redeem(thirdKioskKey, 'KIOSK');
    expect(thirdKiosk.status).toBe(409);

    // ...but POS (governed by the separate RESTAURANT plan's cap of 3) is unaffected.
    const posKey = await genKey('POS');
    const posRes = await redeem(posKey, 'POS');
    expect(posRes.status).toBe(201);
  });
```

- [ ] **Step 2: Run to verify RED**

Run: `cd cloud/api && npx vitest run test/multi-family-subscriptions.e2e.spec.ts`
Expected: FAIL — today's quota check counts ALL of the restaurant's devices (any type) against
whichever subscription is "latest," so either the KIOSK cap check or the POS check behaves
wrong (read the actual failure — it depends on subscription creation order which one breaks).

- [ ] **Step 3: Add the shared quota-check method**

In `application-entitlements.service.ts`, add:

```typescript
  /**
   * The real per-app device cap: how many `appCode` devices this restaurant may have active,
   * right now. Resolves to whichever active subscription's entitlement row grants `appCode`
   * (there should be exactly one; see isAppEnabled's aggregation), using that row's own
   * deviceQuota override if set, falling back to *that row's own subscription's*
   * plan.maxDevices — never some other active subscription's plan, even if the restaurant
   * holds several (spec section 38: quotas are per-app, not one global pool).
   */
  async assertDeviceQuotaAvailable(tx: TxClient, restaurantId: string, appCode: AppCode): Promise<void> {
    const subs = await tx.subscription.findMany({
      where: { restaurantId, status: { in: ['TRIAL', 'ACTIVE'] } },
      select: { id: true, plan: { select: { maxDevices: true } } }
    });
    if (subs.length === 0) return; // no active subscription: isAppEnabled already refused this earlier in the same call chain

    const row = await tx.applicationEntitlement.findFirst({
      where: { subscriptionId: { in: subs.map((s) => s.id) }, appCode, enabled: true }
    });
    if (!row) return; // isAppEnabled already refused this — nothing to cap

    const owningSub = subs.find((s) => s.id === row.subscriptionId)!;
    const quota = row.deviceQuota ?? owningSub.plan.maxDevices;

    const deviceType = appCode as unknown as Prisma.EnumDeviceTypeFilter['equals'];
    const activeDeviceCount = await tx.device.count({
      where: { restaurantId, type: deviceType, status: { not: 'REVOKED' } }
    });
    if (activeDeviceCount >= quota) {
      throw new ConflictException(
        `This restaurant's ${appCode} entitlement allows ${quota} device${quota === 1 ? '' : 's'}, and that limit has been reached. Revoke an unused device or upgrade the plan to activate another.`
      );
    }
  }
```

Add `ConflictException` and `Prisma` to this file's imports if not already present (check the
top of the file first — `Prisma` is likely already imported for `TxClient`'s type).

- [ ] **Step 4: Replace the three inline checks with calls to the shared method**

In `cloud/api/src/modules/activation-keys/activation-keys.service.ts`'s `redeem()`, replace the
block that reads `activeSubscription = await tx.subscription.findFirst(...)` through its
`ConflictException` throw (the "BUG-061" comment block) with:

```typescript
      await this.appEntitlements.assertDeviceQuotaAvailable(tx, key.restaurantId, dto.deviceType as AppCode);
```

Do the same in `reactivate()`'s device-restore branch (the block computing `seats` against
`subscription.plan.maxDevices`) — replace with:

```typescript
          await this.appEntitlements.assertDeviceQuotaAvailable(tx, existing.restaurantId, device.type as AppCode);
```

And in `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts`'s `activateDevice()`, replace
the equivalent block (the "security-audit MED-02 (F-013)" comment block) with:

```typescript
      await this.appEntitlements.assertDeviceQuotaAvailable(tx, key.restaurantId, dto.deviceType as AppCode);
```

In each case, remove the now-unused local `activeSubscription`/`activeDeviceCount` variables
and their surrounding `if (activeSubscription) { ... }` wrapper — `assertDeviceQuotaAvailable`
already no-ops safely when there's no active subscription or no granting entitlement row.

- [ ] **Step 5: Run to verify GREEN**

Run: `cd cloud/api && npx vitest run test/multi-family-subscriptions.e2e.spec.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Regression-check every device-quota-dependent test**

Run: `cd cloud/api && npx vitest run test/device-limit.e2e.spec.ts test/device-enforcement.e2e.spec.ts test/activation-redeem.e2e.spec.ts test/fleet-and-keys.e2e.spec.ts test/tenant-auth.e2e.spec.ts`
Expected: PASS. These tests all use restaurants with exactly one active subscription and one
device type at a time — the per-app quota must produce the same numeric limit as the old
global one did for them (same `plan.maxDevices`, now scoped to the one app type they test with).
If any fails, read its assertion carefully: a test that provisions two *different* device
types and expected the *combined* count to hit the old global cap will now behave differently
on purpose (Global Constraints, "Device quota enforcement moves...") — that is not a bug, but
confirm via the file's own comments which case you're looking at before treating it as either.

- [ ] **Step 7: Commit**

```bash
git add cloud/api/src/modules/application-entitlements/application-entitlements.service.ts cloud/api/src/modules/activation-keys/activation-keys.service.ts cloud/api/src/modules/tenant-auth/tenant-auth.service.ts cloud/api/test/multi-family-subscriptions.e2e.spec.ts
git commit -m "feat: enforce device quotas per app instead of one global cap"
```

---

### Task 5: `getEntitlements` — backward-compatible multi-subscription response

**Files:**
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts:676-712` (`getEntitlements`)
- Test: `cloud/api/test/multi-family-subscriptions.e2e.spec.ts` (extend), `cloud/api/test/tenant-auth.e2e.spec.ts` (regression)

**Interfaces:**
- Produces: `getEntitlements(restaurantId)`'s return type gains two new fields —
  `subscriptions: Array<{ subscriptionId, productFamily, planName, planTier, status,
  expiresAt, entitlements, limits }>` and `effectiveEntitlements: Record<string, boolean>`
  (OR of every active subscription's flat entitlement bag) — every existing field
  (`subscriptionStatus`, `expiresAt`, `planName`, `planTier`, `entitlements`, `limits`) is
  unchanged for a single-subscription restaurant.

- [ ] **Step 1: Write the failing tests**

First, a pure regression test — add to `test/tenant-auth.e2e.spec.ts` if it doesn't already
assert the full shape of `GET /me/entitlements` for a single-subscription restaurant (read the
file first to check; if an equivalent assertion already exists, skip re-adding it and note
that in the ledger instead of duplicating).

Then add the multi-subscription case to `multi-family-subscriptions.e2e.spec.ts` — this needs
a real tenant session, not a platform one, so activate a device first:

```typescript
  it('getEntitlements lists both active subscriptions and their combined effective entitlements', async () => {
    // Owner login requires a password; set one via the activation-token flow already exercised
    // elsewhere (see password-reset.e2e.spec.ts for the exact two-call pattern: read
    // activationToken off the restaurant-creation response, then POST set-initial-password).
    const ownerPassword = 'correct-horse-battery-staple-1';
    // (restaurant + activation token were captured in this file's beforeAll — extend it to
    // keep them, or re-fetch via a fresh platform-scoped read; follow whichever the rest of
    // this file already does for owner credentials.)
    const tenantLogin = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login').send({
      restaurantId, email: `multifam-${stamp}@example.com`, password: ownerPassword
    });
    const tenantToken = tenantLogin.body.accessToken;

    const res = await request(app.getHttpServer()).get('/api/v1/tenant-auth/me/entitlements').set('Authorization', `Bearer ${tenantToken}`);
    expect(res.status).toBe(200);
    expect(res.body.subscriptions).toHaveLength(2);
    expect(res.body.subscriptions.map((s: { productFamily: string }) => s.productFamily).sort()).toEqual(['KIOSK', 'RESTAURANT']);
    expect(res.body.effectiveEntitlements).toBeDefined();
    // The top-level (backward-compatible) fields still describe the RESTAURANT-family
    // subscription specifically — the one every pre-Phase-2 caller cared about.
    expect(res.body.planTier).toBe('PRO');
  });
```

(This test needs `set-initial-password` called in `beforeAll` for the owner to have a real
password — add that call there, following `password-reset.e2e.spec.ts`'s exact pattern, before
writing this step for real.)

- [ ] **Step 2: Run to verify RED**

Run: `cd cloud/api && npx vitest run test/multi-family-subscriptions.e2e.spec.ts`
Expected: FAIL — `res.body.subscriptions` is `undefined` (the field doesn't exist yet).

- [ ] **Step 3: Rewrite `getEntitlements`**

Replace the method body in `tenant-auth.service.ts`:

```typescript
  async getEntitlements(restaurantId: string) {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const subscriptions = await tx.subscription.findMany({
        where: { restaurantId, status: { in: ['ACTIVE', 'TRIAL'] }, expiresAt: { gt: new Date() } },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
      });

      if (subscriptions.length === 0) {
        return { subscriptionStatus: null, expiresAt: null, planName: null, planTier: null, entitlements: null, limits: null, subscriptions: [], effectiveEntitlements: {} };
      }

      // The RESTAURANT-family subscription (or, absent one, whichever is most recent) is what
      // every pre-Phase-2 caller means by "the" subscription — top-level fields describe it
      // unchanged, so a restaurant with only ever one subscription sees byte-identical output.
      const primary = subscriptions.find((s) => s.plan.productFamily === 'RESTAURANT') ?? subscriptions[0];

      const effectiveEntitlements: Record<string, boolean> = {};
      for (const sub of subscriptions) {
        const flags = (sub.plan.entitlements as Record<string, boolean>) ?? {};
        for (const [key, value] of Object.entries(flags)) {
          effectiveEntitlements[key] = effectiveEntitlements[key] || value;
        }
      }

      return {
        subscriptionStatus: primary.status,
        expiresAt: primary.expiresAt,
        planName: primary.plan.name,
        planTier: primary.plan.tier,
        entitlements: primary.plan.entitlements,
        limits: {
          maxBranches: primary.plan.maxBranches,
          maxDevices: primary.plan.maxDevices,
          maxUsers: primary.plan.maxUsers
        },
        subscriptions: subscriptions.map((s) => ({
          subscriptionId: s.id,
          productFamily: s.plan.productFamily,
          planName: s.plan.name,
          planTier: s.plan.tier,
          status: s.status,
          expiresAt: s.expiresAt,
          entitlements: s.plan.entitlements,
          limits: { maxBranches: s.plan.maxBranches, maxDevices: s.plan.maxDevices, maxUsers: s.plan.maxUsers }
        })),
        effectiveEntitlements
      };
    });
  }
```

- [ ] **Step 4: Run to verify GREEN**

Run: `cd cloud/api && npx vitest run test/multi-family-subscriptions.e2e.spec.ts test/tenant-auth.e2e.spec.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 5: Commit**

```bash
git add cloud/api/src/modules/tenant-auth/tenant-auth.service.ts cloud/api/test/multi-family-subscriptions.e2e.spec.ts
git commit -m "feat: getEntitlements aggregates every active subscription, backward-compatible"
```

---

### Task 6: Full-suite regression run and final review

**Files:** none new — verification only.

- [ ] **Step 1: Run the complete cloud/api suite**

Run: `cd cloud/api && npx vitest run`
Expected: same pass count as Phase 1's final run (572 passing) plus this phase's new tests, with
only the two already-known pre-existing failures (`restaurant-identity-sync.e2e.spec.ts`,
`rbac.e2e.spec.ts`'s B2-051/B2-053 test) — both unrelated to this plan, already ledgered in
Phase 1. Any *new* failure is this plan's to fix before calling the task done.

- [ ] **Step 2: Typecheck**

Run: `cd cloud/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit if Step 1/2 required any fixes; otherwise this task has nothing to commit**

## Self-Review Notes

1. **Spec coverage:** Master plan's Phase 2 description → all six tasks. Decision #3
   (multi-subscription, union entitlements) → Tasks 2, 3, 5. Spec section 38 (per-app quotas)
   → Task 4.
2. **Placeholder scan:** Task 3 and Task 5's test steps note "confirm the exact route" and
   "add that call there" rather than a fully-typed-out call — these are flagged explicitly as
   verification-before-writing steps (the exact controller route for per-app entitlement
   updates, and the exact set-initial-password call shape, both live in files not re-read
   while drafting this plan) rather than silent placeholders; the executor confirms and fills
   them from the real files before running the step, same as any other "read the file first"
   instruction elsewhere in this plan.
3. **Type consistency:** `assertDeviceQuotaAvailable(tx, restaurantId, appCode)` signature
   (Task 4) matches all three call sites. `getEntitlements`'s new `subscriptions[]`/
   `effectiveEntitlements` field names (Task 5) are only produced, not consumed elsewhere in
   this plan — safe to name freely, but keep them for Phase 7 (Super Admin UX) to consume.
4. **Review Focus:** all five items map to a specific task's test (Tasks 2, 3, 4, 5).
