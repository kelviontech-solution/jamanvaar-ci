# JAMANVAAR Phase 5: Commercial Plan Catalog Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, in-session).
> Subagents disallowed. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder monthly-first Core/Pro catalog with the real annual
commercial model — `JAMANVAAR CORE ₹5,000/yr`, `PRO ₹7,000/yr`, `QR ₹9,000/yr` (RESTAURANT
family) and `KIOSK STANDARD ₹9,000/yr`, `KIOSK PRO ₹11,000/yr` (KIOSK family) — with the
renewal-invoice engine actually billing annual periods for these plans, `QR_ORDERING` promoted
to a first-class `AppCode`, and each plan's default app list decoupled from a single
tier→app-list table that can no longer express "the same tier name means different apps in a
different product family."

**Architecture:** Add `PlanTier.QR` (a fourth tier value, sibling to the existing unused-in-
practice `ENTERPRISE`, which stays reserved for future negotiated/custom plans per spec section
37) and `AppCode.QR_ORDERING`. Replace `DEFAULT_APPS_BY_TIER: Record<PlanTier, AppCode[]>` with
a `(productFamily, tier)`-keyed lookup, since Phase 2's `productFamily` means the same tier
name (`CORE`, `PRO`) now appears in two different product families with entirely different
default apps. Rewrite the two invoice-generation call sites to bill `plan.priceYearly` over a
365-day period when it's set, falling back to today's `plan.priceMonthly`/30-day behavior when
it isn't — every plan created by every existing test fixture omits `priceYearly`, so this is
purely additive for them. `qr-ordering.service.ts`'s entitlement check becomes the OR of the
legacy flat flag and the new `AppCode.QR_ORDERING` row, so existing PRO-tier restaurants keep
QR access without a data migration.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Zod, Vitest + Supertest.

**Spec:** `docs/superpowers/plans/2026-09-24-jamanvaar-commercial-platform-redesign-MASTER.md`
(§ "Phase 5") and the confirmed decision that ₹5K/7K/9K-per-year is the real target (this
conversation, 2026-09-24) and that the renewal-invoice cadence itself must become genuinely
annual, not just display pricing (this conversation, 2026-09-25).

## Findings from reading the actual billing code (corrects the master plan's Phase 5 scope)

- `priceMonthly` is not a display field — `invoices.service.ts`'s `createInitialSubscriptionInvoice`
  (line 338) and `checkAndGenerateRenewals` (line 669, a 7-day-lookahead renewal-invoice
  generator that creates a new `Invoice` for a fixed **30-day** period) both bill it directly as
  the real amount. `priceYearly` today drives nothing.
- `dashboard.service.ts`/`reports.service.ts`'s "MRR" sums `priceMonthly` across active
  subscriptions; `reports.service.ts` already derives `arrPaise = mrrPaise * 12`. Every existing
  test-created plan fixture (`grep` across `test/*.spec.ts` confirmed this) sets `priceMonthly`
  and never sets `priceYearly` — so keeping `priceMonthly` populated with a sensible
  amortized-monthly figure for the new annual plans (`Math.round(priceYearly / 12)`) means
  **MRR/ARR/the AI-assistant upsell price all keep working unchanged** — only the two real
  invoice-generation call sites need to branch on `priceYearly`'s presence.
- `ENTERPRISE` tier is referenced in exactly 2 backend files and 8 frontend files, all as plain
  string-literal unions / a badge-color list / one dropdown option / one form toggle — no
  business logic branches on it beyond "PRO or ENTERPRISE gets the PRO app list." Adding `QR`
  alongside it is the same shape of change, confirmed small before committing to this design
  over alternatives (a `Plan.defaultApplications` array column was considered and rejected as
  more schema-invasive than necessary here).
- `AppCode`, `DeviceType`, and `ActivationKeyDeviceType` are three separate Prisma enums with
  overlapping members today (`POS`, `POS_ADMIN`, `CAPTAIN`, `KDS`, `KIOSK`, `KIOSK_ADMIN`).
  `QR_ORDERING` has no physical device or activation key — it's a restaurant-wide web feature —
  so it's added **only** to `AppCode`, never to `DeviceType`/`ActivationKeyDeviceType` or any
  `deviceType` Zod enum in `activation-key.dto.ts`/`login.dto.ts`.

## Global Constraints

- Every plan created by an existing test fixture (no `priceYearly` set) must keep billing on
  the old 30-day/`priceMonthly` cadence, byte-for-byte — this phase adds a new cadence, it does
  not change the old one out from under anything that doesn't opt in by having `priceYearly` set.
- An existing restaurant on the old seeded CORE/PRO plan keeps every entitlement it has today —
  `ensureRowsForSubscription` only runs at `assign`/`changePlan` time, so an existing
  subscription's `ApplicationEntitlement` rows are untouched by this phase; only a *new*
  subscription or an explicit plan change picks up the new (productFamily, tier) default lists.
- QR-ordering access for an existing PRO-tier restaurant (granted today via the flat
  `entitlements.qrTableOrdering` flag) must keep working without any backfill script — the OR
  check handles it.
- `ENTERPRISE` stays reserved for future custom/negotiated plans (spec section 37) — this phase
  does not repurpose it, it adds `QR` alongside it.
- Money is paise, everywhere, matching every existing `Int` price field.

## Review Focus

- A plan with `priceYearly` set to `0` (a genuinely free/trial plan) must not be treated as
  "no priceYearly" by a falsy check (`plan.priceYearly ? ... : ...`) — use an explicit
  `!= null` check everywhere priceYearly's presence gates behavior. Covered by Task 4's test.
- The renewal-invoice generator's `nextPeriodEnd` calculation must use 365 days for an annual
  plan, not silently keep the old `30 * 24 * 60 * 60 * 1000` constant for every plan. Covered
  by Task 4's test.
- A restaurant already on the old PRO plan (flat `qrTableOrdering: true`, no
  `ApplicationEntitlement` row for `QR_ORDERING` yet) must still pass a QR-ordering
  entitlement check after this phase ships. Covered by Task 5's test.
- Assigning a `KIOSK`-family plan must never default-enable any `RESTAURANT`-family app (`POS`,
  `CAPTAIN`, etc.) and vice versa — the old single `DEFAULT_APPS_BY_TIER[tier]` lookup had no
  way to get this wrong (there was only one family); the new family-keyed lookup must be
  checked in both directions. Covered by Task 2's test.
- Generating a `QR_ORDERING` activation key must be rejected (spec: it has no physical device)
  — confirm `allowedDeviceType`'s enum genuinely still excludes it after this phase, not just
  by omission but by an explicit test. Covered by Task 1's test.

---

### Task 1: `PlanTier.QR` and `AppCode.QR_ORDERING`

**Files:**
- Modify: `cloud/api/prisma/schema.prisma`
- Create: `cloud/api/prisma/migrations/20260925140000_qr_tier_and_appcode/migration.sql`
- Test: `cloud/api/test/plans-product-family.e2e.spec.ts` (extend)

**Interfaces:**
- Produces: `PlanTier` gains `QR`; `AppCode` gains `QR_ORDERING`. Consumed by Task 2's
  family-keyed default-apps lookup and Task 5's QR entitlement check.

- [ ] **Step 1: Write the failing tests**

Add to `plans-product-family.e2e.spec.ts`:

```typescript
  it('accepts the QR tier', async () => {
    const res = await authed('post', '/api/v1/plans').send({
      tier: 'QR', name: `TEST Family QR Tier ${Date.now()}`, priceMonthly: 100000, maxBranches: 1, maxDevices: 5, maxUsers: 5, entitlements: {}
    });
    expect(res.status).toBe(201);
    expect(res.body.tier).toBe('QR');
    createdPlanIds.push(res.body.id);
  });

  it('rejects an activation key allowedDeviceType of QR_ORDERING (it has no physical device)', async () => {
    // Reuses this file's own restaurant fixture if present; if this file has none, use a
    // minimal one created here — check the file's existing beforeAll before writing this for
    // real, so the fixture pattern matches the rest of the file exactly.
    const res = await authed('post', '/api/v1/activation-keys').send({
      restaurantId: /* this file's fixture restaurantId */ undefined, allowedDeviceType: 'QR_ORDERING', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    expect(res.status).toBe(400);
  });
```

(This file today has no restaurant fixture of its own — it only creates plans. Add a minimal
restaurant to this file's `beforeAll`, following `multi-family-subscriptions.e2e.spec.ts`'s
exact pattern for creating one with a `mobile`, before writing the second test's real body.)

- [ ] **Step 2: Run to verify RED**

Run: `cd cloud/api && npx vitest run test/plans-product-family.e2e.spec.ts`
Expected: FAIL — `tier: 'QR'` is rejected by the current Zod enum (400), and the
`QR_ORDERING` activation-key test can't run without the enum accepting it as an invalid-input
case to reject in the first place (confirm the exact current failure by reading the real
output before writing Step 3 — the two tests may fail for different current reasons).

- [ ] **Step 3: Add the two enum values**

In `schema.prisma`:

```prisma
enum PlanTier {
  CORE
  PRO
  QR
  ENTERPRISE
}
```

```prisma
enum AppCode {
  POS
  POS_ADMIN
  CAPTAIN
  KDS
  KIOSK
  KIOSK_ADMIN
  QR_ORDERING
}
```

- [ ] **Step 4: Write the migration**

```sql
-- cloud/api/prisma/migrations/20260925140000_qr_tier_and_appcode/migration.sql
-- Phase 5 (commercial catalog): QR becomes a real plan tier (JAMANVAAR QR, ₹9,000/yr) and
-- QR_ORDERING becomes a first-class AppCode with its own ApplicationEntitlement row, instead
-- of only the flat Plan.entitlements.qrTableOrdering flag. Additive only — no existing row's
-- tier or entitlements change as a result of this migration.
ALTER TYPE "PlanTier" ADD VALUE 'QR';
ALTER TYPE "AppCode" ADD VALUE 'QR_ORDERING';
```

- [ ] **Step 5: Apply to both databases and regenerate the client**

Run: `cd cloud/api && npx prisma migrate deploy && npx prisma generate`
Run: `cd cloud/api && DATABASE_URL="postgresql://jamanvaar_app:jamanvaar_app_local@localhost:5432/jamanvaar_test?schema=public" npx prisma migrate deploy`
Expected: both apply cleanly.

- [ ] **Step 6: Update the plan-creation and per-app-entitlement Zod enums**

In `cloud/api/src/modules/plans/dto/plan.dto.ts`:

```typescript
  tier: z.enum(['CORE', 'PRO', 'QR', 'ENTERPRISE']),
```

In `cloud/api/src/modules/application-entitlements/dto/application-entitlement.dto.ts`:

```typescript
export const APP_CODES = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING'] as const;
```

In `cloud/api/src/modules/subscriptions/dto/subscription.dto.ts`:

```typescript
  applications: z.array(z.enum(['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING'])).optional()
```

Leave every `deviceType`/`allowedDeviceType` enum in `activation-key.dto.ts` and
`login.dto.ts` unchanged — `QR_ORDERING` is not a device type.

- [ ] **Step 7: Run to verify GREEN**

Run: `cd cloud/api && npx vitest run test/plans-product-family.e2e.spec.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 8: Typecheck**

Run: `cd cloud/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add cloud/api/prisma/schema.prisma cloud/api/prisma/migrations/20260925140000_qr_tier_and_appcode cloud/api/src/modules/plans/dto/plan.dto.ts cloud/api/src/modules/application-entitlements/dto/application-entitlement.dto.ts cloud/api/src/modules/subscriptions/dto/subscription.dto.ts cloud/api/test/plans-product-family.e2e.spec.ts
git commit -m "feat: add PlanTier.QR and AppCode.QR_ORDERING"
```

---

### Task 2: Family-aware default app lists

**Files:**
- Modify: `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`
- Modify: `cloud/api/src/modules/subscriptions/subscriptions.service.ts` (`assign`, `changePlan` call sites)
- Test: `cloud/api/test/multi-family-subscriptions.e2e.spec.ts` (extend)

**Interfaces:**
- Produces: `ensureRowsForSubscription(tx, restaurantId, subscriptionId, productFamily: ProductFamily, tier: PlanTier, enabledApps?: AppCode[])` — signature gains `productFamily` as a new parameter before `tier`. Both call sites already have the `plan`/`newPlan` object in scope (with its `productFamily`), so this is a same-line argument addition, not new plumbing.

- [ ] **Step 1: Write the failing test**

Add to `multi-family-subscriptions.e2e.spec.ts` (a fresh restaurant + two plans, to avoid any
interaction with this file's existing fixtures):

```typescript
  it('a KIOSK-family CORE-tier plan defaults to KIOSK+KIOSK_ADMIN, never POS', async () => {
    const kioskCoreRestaurant = await auth(request(app.getHttpServer()).post('/api/v1/restaurants')).send({
      name: `TEST Family Default ${stamp}`, mobile: `7${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail: `familydefault-${stamp}@example.com`
    });
    createdRestaurantIds.push(kioskCoreRestaurant.body.restaurant.id);

    const sub = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId: kioskCoreRestaurant.body.restaurant.id, planId: kioskPlanId, status: 'ACTIVE', expiresAt: inDays(365)
      // no explicit `applications` — must fall back to KIOSK-family CORE-tier defaults
    });
    expect(sub.status).toBe(201);

    const rows = await auth(request(app.getHttpServer()).get(`/api/v1/subscriptions/${sub.body.id}/applications`));
    const enabledCodes = rows.body.filter((r: { enabled: boolean }) => r.enabled).map((r: { appCode: string }) => r.appCode).sort();
    expect(enabledCodes).toEqual(['KIOSK', 'KIOSK_ADMIN']);
  });
```

(`kioskPlanId` is this file's existing KIOSK-family CORE-tier plan from earlier tests — confirm
it's still in scope/unexpired by re-reading the file's current state before writing this step;
if a fresh plan is cleaner given intervening tests, create one explicitly instead.)

- [ ] **Step 2: Run to verify RED**

Run: `cd cloud/api && npx vitest run test/multi-family-subscriptions.e2e.spec.ts`
Expected: FAIL — today's `DEFAULT_APPS_BY_TIER.CORE = ['POS', 'POS_ADMIN', 'KDS']` applies
regardless of family, so a KIOSK-family CORE-tier plan gets POS/POS_ADMIN/KDS enabled instead
of KIOSK/KIOSK_ADMIN.

- [ ] **Step 3: Restructure the default-apps lookup**

In `application-entitlements.service.ts`, replace:

```typescript
export const ALL_APP_CODES: AppCode[] = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN'];
```

with:

```typescript
export const ALL_APP_CODES: AppCode[] = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING'];
```

Replace the `DEFAULT_APPS_BY_TIER` block and its doc comment with:

```typescript
/**
 * Which applications each (product family, plan tier) pair includes by default. Phase 2 let a
 * restaurant hold a RESTAURANT-family subscription and a KIOSK-family one concurrently, and the
 * same tier name (CORE, PRO) now means different apps in each family — a single
 * Record<PlanTier, AppCode[]> can no longer express that, so this is keyed on both.
 * ENTERPRISE (in either family) is treated as a superset default until a real custom-plan
 * mechanism exists (spec section 37) — Super Admin can already override per-subscription via
 * the `applications` param regardless.
 */
type FamilyTierKey = `${ProductFamily}:${PlanTier}`;
const DEFAULT_APPS_BY_FAMILY_TIER: Partial<Record<FamilyTierKey, AppCode[]>> = {
  'RESTAURANT:CORE': ['POS', 'POS_ADMIN'],
  'RESTAURANT:PRO': ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS'],
  'RESTAURANT:QR': ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'QR_ORDERING'],
  'RESTAURANT:ENTERPRISE': ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'QR_ORDERING'],
  'KIOSK:CORE': ['KIOSK', 'KIOSK_ADMIN'],
  'KIOSK:PRO': ['KIOSK', 'KIOSK_ADMIN'],
  'KIOSK:ENTERPRISE': ['KIOSK', 'KIOSK_ADMIN']
};

function defaultAppsFor(productFamily: ProductFamily, tier: PlanTier): AppCode[] {
  return DEFAULT_APPS_BY_FAMILY_TIER[`${productFamily}:${tier}`] ?? [];
}
```

Add `ProductFamily` to this file's `@prisma/client` import line.

Update `ensureRowsForSubscription`'s signature and body:

```typescript
  async ensureRowsForSubscription(
    tx: TxClient,
    restaurantId: string,
    subscriptionId: string,
    productFamily: ProductFamily,
    tier: PlanTier,
    enabledApps?: AppCode[]
  ): Promise<void> {
    const enabled = new Set(enabledApps ?? defaultAppsFor(productFamily, tier));
    // ...rest unchanged (the Promise.all upsert loop over ALL_APP_CODES)...
```

- [ ] **Step 4: Update both call sites**

In `subscriptions.service.ts`'s `assign()`:

```typescript
      await this.appEntitlements.ensureRowsForSubscription(
        tx,
        dto.restaurantId,
        sub.id,
        plan.productFamily,
        plan.tier,
        dto.applications
      );
```

And in `changePlan()`:

```typescript
      await this.appEntitlements.ensureRowsForSubscription(tx, existing.restaurantId, id, newPlan.productFamily, newPlan.tier);
```

- [ ] **Step 5: Run to verify GREEN**

Run: `cd cloud/api && npx vitest run test/multi-family-subscriptions.e2e.spec.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Full regression sweep**

Run: `cd cloud/api && npx vitest run test/saas-modules.e2e.spec.ts test/activation-redeem.e2e.spec.ts test/device-enforcement.e2e.spec.ts test/subscription-extend.e2e.spec.ts test/multi-family-subscriptions.e2e.spec.ts`
Expected: PASS — every existing plan in these tests is `RESTAURANT`-family by default
(Phase 1's schema default), so `DEFAULT_APPS_BY_FAMILY_TIER['RESTAURANT:PRO']` etc. must
produce results consistent with what those tests already expect (though note: `RESTAURANT:CORE`'s
app list changed from `['POS','POS_ADMIN','KDS']` to `['POS','POS_ADMIN']` per the master
plan's tier redesign — read any failure carefully to distinguish "a real regression" from "a
test that asserted the old CORE tier included KDS," which is this task's intended change, not
a bug).

- [ ] **Step 7: Commit**

```bash
git add cloud/api/src/modules/application-entitlements/application-entitlements.service.ts cloud/api/src/modules/subscriptions/subscriptions.service.ts cloud/api/test/multi-family-subscriptions.e2e.spec.ts
git commit -m "feat: key default app lists by (productFamily, tier) instead of tier alone"
```

---

### Task 3: New seed catalog — real annual pricing

**Files:**
- Modify: `cloud/api/prisma/seed.ts`
- Test: manual verification via `npm run seed` + a query (this file has no dedicated e2e spec;
  every consumer of the seeded plans is a live-database integration point, not a unit under test)

**Interfaces:**
- Produces: five `Plan` rows — `seed-plan-core`, `seed-plan-pro`, `seed-plan-qr` (all
  `RESTAURANT` family), `seed-plan-kiosk-standard`, `seed-plan-kiosk-pro` (both `KIOSK`
  family) — with real annual pricing and `priceMonthly` set to the amortized monthly-equivalent
  (`Math.round(priceYearly / 12)`) so every existing MRR/ARR/upsell-price consumer keeps
  working unchanged (see this plan's "Findings" section).

- [ ] **Step 1: Rewrite the CORE and PRO plan upserts**

In `seed.ts`, replace the `corePlan` upsert's `update`/`create` blocks:

```typescript
  const corePlan = await tx.plan.upsert({
    where: { id: 'seed-plan-core' },
    update: {
      tier: 'CORE',
      productFamily: 'RESTAURANT',
      name: 'JAMANVAAR CORE',
      description: 'Run the restaurant: POS, billing, KOT, menu, inventory, basic reports.',
      priceMonthly: 42000, // paise = ₹420/mo amortized-for-reporting; the real price is annual
      priceYearly: 500000, // paise = ₹5,000/yr
      maxBranches: 1,
      maxDevices: 5,
      maxUsers: 10,
      entitlements: coreEntitlements
    },
    create: {
      id: 'seed-plan-core',
      tier: 'CORE',
      productFamily: 'RESTAURANT',
      name: 'JAMANVAAR CORE',
      description: 'Run the restaurant: POS, billing, KOT, menu, inventory, basic reports.',
      priceMonthly: 42000,
      priceYearly: 500000,
      maxBranches: 1,
      maxDevices: 5,
      maxUsers: 10,
      entitlements: coreEntitlements
    }
  });
```

Replace the `seed-plan-pro` upsert identically in shape, with:

```typescript
      tier: 'PRO',
      productFamily: 'RESTAURANT',
      name: 'JAMANVAAR PRO',
      description: 'Everything in Core, plus KDS and the Captain wireless service workflow.',
      priceMonthly: 58000, // ₹580/mo amortized
      priceYearly: 700000, // ₹7,000/yr
```

(keep `maxBranches: 5, maxDevices: 20, maxUsers: 50, entitlements: proEntitlements` as they are).

- [ ] **Step 2: Add the QR plan**

```typescript
  await tx.plan.upsert({
    where: { id: 'seed-plan-qr' },
    update: {
      tier: 'QR',
      productFamily: 'RESTAURANT',
      name: 'JAMANVAAR QR',
      description: 'Everything in Pro, plus QR table ordering for guest self-service.',
      priceMonthly: 75000, // ₹750/mo amortized
      priceYearly: 900000, // ₹9,000/yr
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 50,
      entitlements: { ...proEntitlements, qrTableOrdering: true }
    },
    create: {
      id: 'seed-plan-qr',
      tier: 'QR',
      productFamily: 'RESTAURANT',
      name: 'JAMANVAAR QR',
      description: 'Everything in Pro, plus QR table ordering for guest self-service.',
      priceMonthly: 75000,
      priceYearly: 900000,
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 50,
      entitlements: { ...proEntitlements, qrTableOrdering: true }
    }
  });
```

- [ ] **Step 3: Add the two Kiosk plans**

```typescript
  await tx.plan.upsert({
    where: { id: 'seed-plan-kiosk-standard' },
    update: {
      tier: 'CORE',
      productFamily: 'KIOSK',
      name: 'KIOSK STANDARD',
      description: 'Self-ordering kiosk + Kiosk Admin: menu sync, cart, checkout, basic device management.',
      priceMonthly: 75000, // ₹750/mo amortized
      priceYearly: 900000, // ₹9,000/yr
      maxBranches: 5,
      maxDevices: 5,
      maxUsers: 10,
      entitlements: { selfOrderKiosk: true }
    },
    create: {
      id: 'seed-plan-kiosk-standard',
      tier: 'CORE',
      productFamily: 'KIOSK',
      name: 'KIOSK STANDARD',
      description: 'Self-ordering kiosk + Kiosk Admin: menu sync, cart, checkout, basic device management.',
      priceMonthly: 75000,
      priceYearly: 900000,
      maxBranches: 5,
      maxDevices: 5,
      maxUsers: 10,
      entitlements: { selfOrderKiosk: true }
    }
  });

  await tx.plan.upsert({
    where: { id: 'seed-plan-kiosk-pro' },
    update: {
      tier: 'PRO',
      productFamily: 'KIOSK',
      name: 'KIOSK PRO',
      description: 'Everything in Kiosk Standard, plus multi-kiosk remote management and advanced analytics.',
      priceMonthly: 92000, // ₹920/mo amortized
      priceYearly: 1100000, // ₹11,000/yr
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 10,
      entitlements: { selfOrderKiosk: true }
    },
    create: {
      id: 'seed-plan-kiosk-pro',
      tier: 'PRO',
      productFamily: 'KIOSK',
      name: 'KIOSK PRO',
      description: 'Everything in Kiosk Standard, plus multi-kiosk remote management and advanced analytics.',
      priceMonthly: 92000,
      priceYearly: 1100000,
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 10,
      entitlements: { selfOrderKiosk: true }
    }
  });
```

- [ ] **Step 4: Run the seed against the local dev database and verify**

Run: `cd cloud/api && npm run seed`
Expected: no errors.

Run a verification query:
```bash
cd cloud/api && node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$queryRawUnsafe('SELECT id, tier, \"productFamily\", name, \"priceYearly\" FROM \"Plan\" WHERE id LIKE \'seed-plan%\' ORDER BY id')
  .then((rows) => { console.log(JSON.stringify(rows, null, 2)); return prisma.\$disconnect(); });
"
```
Expected: 5 rows, `seed-plan-core`/`pro`/`qr` with `productFamily: RESTAURANT`,
`seed-plan-kiosk-standard`/`kiosk-pro` with `productFamily: KIOSK`, and `priceYearly` values
500000/700000/900000/900000/1100000 respectively.

- [ ] **Step 5: Regression-check `seedDemoTenant`**

Run: `cd cloud/api && npx vitest run test/tenant-auth.e2e.spec.ts test/saas-modules.e2e.spec.ts`
Expected: PASS. `seedDemoTenant(tx, corePlan)` (called from `main()` when `shouldSeedDemoData`
is true) receives the same `corePlan` object shape as before (just different price fields) —
confirm it doesn't destructure/assume a specific `priceMonthly` value anywhere before treating
this as passing cleanly.

- [ ] **Step 6: Commit**

```bash
git add cloud/api/prisma/seed.ts
git commit -m "feat: rebuild plan catalog with real annual pricing (Core/Pro/QR + Kiosk Standard/Pro)"
```

---

### Task 4: Annual renewal-invoice cadence

**Files:**
- Modify: `cloud/api/src/modules/billing/invoices.service.ts`
- Test: `cloud/api/test/invoice-integrity.e2e.spec.ts` (extend), a new
  `cloud/api/test/annual-billing-cadence.e2e.spec.ts` if the existing file's fixtures don't fit
  cleanly — check the existing file's structure first before deciding.

**Interfaces:**
- Produces: a shared private helper on `InvoicesService` —
  `private billingCycleFor(plan: { priceMonthly: number; priceYearly: number | null }): { amount: number; periodDays: number }`
  returning `{ amount: plan.priceYearly, periodDays: 365 }` when `plan.priceYearly != null`,
  else `{ amount: plan.priceMonthly, periodDays: 30 }` — consumed by both
  `createInitialSubscriptionInvoice` and `checkAndGenerateRenewals`.

- [ ] **Step 1: Write the failing tests**

```typescript
// cloud/api/test/annual-billing-cadence.e2e.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { InvoicesService } from '../src/modules/billing/invoices.service';

describe('Annual billing cadence (Phase 5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let invoices: InvoicesService;
  let token: string;
  const stamp = Date.now();
  const adminEmail = `test-annualbill-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const createdRestaurantIds: string[] = [];
  const createdPlanIds: string[] = [];

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    invoices = app.get(InvoicesService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    token = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
  });

  afterAll(async () => {
    if (createdRestaurantIds.length) await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } }));
    if (createdPlanIds.length) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: createdPlanIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('bills the annual price over a ~365-day period for a plan with priceYearly set', async () => {
    const restaurant = await auth(request(app.getHttpServer()).post('/api/v1/restaurants')).send({
      name: `TEST Annual Bill ${stamp}`, mobile: `6${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail: `annualbill-${stamp}@example.com`
    });
    createdRestaurantIds.push(restaurant.body.restaurant.id);

    const plan = await auth(request(app.getHttpServer()).post('/api/v1/plans')).send({
      tier: 'CORE', name: `TEST Annual Plan ${stamp}`, priceMonthly: 42000, priceYearly: 500000, maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    createdPlanIds.push(plan.body.id);

    const sub = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId: restaurant.body.restaurant.id, planId: plan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 365 * 86400000).toISOString()
    });
    expect(sub.status).toBe(201);

    const invoiceList = await auth(request(app.getHttpServer()).get(`/api/v1/invoices?restaurantId=${restaurant.body.restaurant.id}`));
    expect(invoiceList.body[0].amount).toBe(500000);
    const periodDays = (new Date(invoiceList.body[0].billingPeriodEnd).getTime() - new Date(invoiceList.body[0].billingPeriodStart).getTime()) / 86400000;
    expect(periodDays).toBeGreaterThan(360);
    expect(periodDays).toBeLessThan(370);
  });

  it('keeps the old 30-day/priceMonthly cadence for a plan with no priceYearly set', async () => {
    const restaurant = await auth(request(app.getHttpServer()).post('/api/v1/restaurants')).send({
      name: `TEST Monthly Bill ${stamp}`, mobile: `6${String(stamp + 1).slice(-9)}`, ownerName: 'Owner', ownerEmail: `monthlybill-${stamp}@example.com`
    });
    createdRestaurantIds.push(restaurant.body.restaurant.id);

    const plan = await auth(request(app.getHttpServer()).post('/api/v1/plans')).send({
      tier: 'CORE', name: `TEST Monthly Plan ${stamp}`, priceMonthly: 500000, maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    createdPlanIds.push(plan.body.id);

    const sub = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId: restaurant.body.restaurant.id, planId: plan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });
    expect(sub.status).toBe(201);

    const invoiceList = await auth(request(app.getHttpServer()).get(`/api/v1/invoices?restaurantId=${restaurant.body.restaurant.id}`));
    expect(invoiceList.body[0].amount).toBe(500000);
    const periodDays = (new Date(invoiceList.body[0].billingPeriodEnd).getTime() - new Date(invoiceList.body[0].billingPeriodStart).getTime()) / 86400000;
    expect(periodDays).toBeGreaterThan(28);
    expect(periodDays).toBeLessThan(32);
  });
});
```

Confirm the exact `GET /api/v1/invoices` query-param name and response shape by reading
`invoices.controller.ts` before finalizing this step — the plan's draft assumes
`?restaurantId=` and a plain array response; correct it here if the real controller differs.

- [ ] **Step 2: Run to verify RED**

Run: `cd cloud/api && npx vitest run test/annual-billing-cadence.e2e.spec.ts`
Expected: FAIL on the first test's period-length assertion (today's
`createInitialSubscriptionInvoice` always bills `priceMonthly` regardless of `priceYearly`,
and its billing period is whatever `expiresAt` was passed as — read the actual failure to
confirm exactly which assertion breaks before writing Step 3).

- [ ] **Step 3: Add the shared helper and use it in both call sites**

In `invoices.service.ts`, add near the top of the class:

```typescript
  /**
   * Phase 5: a plan with priceYearly set bills that amount over a real 365-day period; one
   * without it keeps the original 30-day/priceMonthly behavior every existing plan fixture
   * (none of which set priceYearly) already relies on. `!= null` (not truthy) so a genuinely
   * free plan (priceYearly: 0) is still treated as annual, not as "unset".
   */
  private billingCycleFor(plan: { priceMonthly: number; priceYearly: number | null }): { amount: number; periodDays: number } {
    if (plan.priceYearly != null) return { amount: plan.priceYearly, periodDays: 365 };
    return { amount: plan.priceMonthly, periodDays: 30 };
  }
```

In `createInitialSubscriptionInvoice`, replace:

```typescript
    const baseAmount = plan.priceMonthly; // in paise
```

with:

```typescript
    const { amount: baseAmount } = this.billingCycleFor(plan);
```

(The method already receives `billingPeriodEnd` as a parameter from its caller — `subscriptions.service.ts`'s `assign()` passes `sub.expiresAt`, which for a real annual subscription is already ~365 days out. This task does not need to change that call site; it only needs the *amount* billed to correctly reflect `priceYearly` when set. Confirm this by re-reading `assign()`'s call before assuming no change is needed there.)

In `checkAndGenerateRenewals`, replace:

```typescript
        const nextPeriodStart = new Date(sub.expiresAt);
        const nextPeriodEnd = new Date(nextPeriodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
```

and

```typescript
        if (!hasUpcomingInvoice) {
          const baseAmount = sub.plan.priceMonthly;
```

with:

```typescript
        const { amount: baseAmount, periodDays } = this.billingCycleFor(sub.plan);
        const nextPeriodStart = new Date(sub.expiresAt);
        const nextPeriodEnd = new Date(nextPeriodStart.getTime() + periodDays * 24 * 60 * 60 * 1000);

        if (!hasUpcomingInvoice) {
```

(Move the `billingCycleFor` call and `nextPeriodEnd` calculation up before the
`hasUpcomingInvoice` check, since `nextPeriodEnd` is computed from `nextPeriodStart` either
way and doesn't depend on that check's outcome — verify this reordering doesn't change any
other logic between those two points by re-reading the method's full current body first.)

Ensure both `tx.subscription.findMany`/`tx.plan.findUnique` selects used by these two methods
already include `priceYearly` — `plan: { select: { id: true, name: true, tier: true,
priceMonthly: true, entitlements: true } }` (line 254 area) and the bare `plan.priceMonthly`
reads elsewhere need `priceYearly: true` added to whichever `select`/`include` feeds them.

- [ ] **Step 4: Run to verify GREEN**

Run: `cd cloud/api && npx vitest run test/annual-billing-cadence.e2e.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Full billing regression sweep**

Run: `cd cloud/api && npx vitest run test/invoice-integrity.e2e.spec.ts test/tenant-billing.e2e.spec.ts test/billing-applications-support.e2e.spec.ts test/platform-payments.e2e.spec.ts`
Expected: PASS — none of these plans set `priceYearly`, so every one must produce byte-identical
invoice amounts/periods to before this task.

- [ ] **Step 6: Commit**

```bash
git add cloud/api/src/modules/billing/invoices.service.ts cloud/api/test/annual-billing-cadence.e2e.spec.ts
git commit -m "feat: bill annual plans over a real 365-day period instead of 30"
```

---

### Task 5: QR-ordering backward-compatible entitlement check

**Files:**
- Modify: `cloud/api/src/modules/qr-ordering/qr-ordering.service.ts`
- Test: `cloud/api/test/qr-ordering.e2e.spec.ts` (extend), `cloud/api/test/qr-guest-ordering.e2e.spec.ts` (regression)

Read `qr-ordering.service.ts` around line 403 (`planQrEntitled`) in full — including what
`tx`/`restaurantId` are actually in scope as at that point in the method — before writing this
task's code, since the plan's earlier research only confirmed the single line, not its
surrounding transaction context.

**Interfaces:**
- Produces: the QR-ordering entitlement check becomes `planQrEntitled OR isAppEnabled(tx,
  restaurantId, 'QR_ORDERING')` — consumed only internally by this service; no external
  interface changes.

- [ ] **Step 1: Write the failing test**

Add to `qr-ordering.e2e.spec.ts`: a restaurant on the new `JAMANVAAR QR` seeded plan (or an
equivalent test-created `QR`-tier plan with an explicit `applications: [..., 'QR_ORDERING']`)
must have QR ordering entitled via the **new** `AppCode.QR_ORDERING` mechanism even when its
plan's flat `entitlements.qrTableOrdering` flag is `false` — proving the check doesn't only
still work via the legacy path. Write the exact request/assertion after reading this test
file's existing helpers (`platform`/`auth` patterns) so it matches the file's conventions
exactly, rather than guessing its shape here.

- [ ] **Step 2: Run to verify RED**

Run: `cd cloud/api && npx vitest run test/qr-ordering.e2e.spec.ts`
Expected: FAIL — today's check only reads the flat flag / tier default, never the new AppCode.

- [ ] **Step 3: Update the entitlement check**

Inject `ApplicationEntitlementsService` into `QrOrderingService` if it isn't already a
dependency (check the constructor first), then change:

```typescript
    const planQrEntitled = readBoolean(planEntitlements, 'qrTableOrdering') ?? planTier === 'PRO';
```

to:

```typescript
    const legacyQrEntitled = readBoolean(planEntitlements, 'qrTableOrdering') ?? planTier === 'PRO';
    const planQrEntitled = legacyQrEntitled || (await this.appEntitlements.isAppEnabled(tx, restaurantId, 'QR_ORDERING'));
```

(Confirm `tx` and `restaurantId` are both genuinely in scope at this exact line — if the
surrounding method runs outside a transaction or under a different variable name, adapt
accordingly; this is exactly why Step 0 of this task says to read the real file first.)

- [ ] **Step 4: Run to verify GREEN**

Run: `cd cloud/api && npx vitest run test/qr-ordering.e2e.spec.ts`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Regression sweep**

Run: `cd cloud/api && npx vitest run test/qr-guest-ordering.e2e.spec.ts test/qr-ordering.e2e.spec.ts`
Expected: PASS — an existing PRO-tier restaurant (flag-based entitlement, no `QR_ORDERING`
`ApplicationEntitlement` row) must still show entitled, proving the OR-fallback works both ways.

- [ ] **Step 6: Commit**

```bash
git add cloud/api/src/modules/qr-ordering/qr-ordering.service.ts cloud/api/test/qr-ordering.e2e.spec.ts
git commit -m "feat: recognize AppCode.QR_ORDERING alongside the legacy qrTableOrdering flag"
```

---

### Task 6: Full-suite regression run and final review

- [ ] **Step 1: Full suite**

Run: `cd cloud/api && npx vitest run`
Expected: same two pre-existing unrelated failures as every prior phase's ledger
(`restaurant-identity-sync.e2e.spec.ts`, `rbac.e2e.spec.ts`'s B2-051/B2-053 test), no new ones.

- [ ] **Step 2: Typecheck**

Run: `cd cloud/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit if Step 1/2 required fixes; otherwise nothing to commit here**

## Self-Review Notes

1. **Spec coverage:** master plan Phase 5 (annual pricing, Kiosk family, QR_ORDERING,
   migration-safe for existing restaurants) → Tasks 1-5. The confirmed billing-cadence rewrite
   decision (this conversation, 2026-09-25) → Task 4 specifically.
2. **Placeholder scan:** Tasks 1, 4, and 5 each include an explicit "read the real file first"
   step before finalizing exact code — flagged as verification gates (matching every prior
   phase's convention for code not yet re-read at plan-drafting time), not silent gaps.
3. **Type consistency:** `billingCycleFor`'s return shape (`{ amount, periodDays }`, Task 4) is
   used identically at both call sites. `ensureRowsForSubscription`'s new `productFamily`
   parameter (Task 2) matches `Plan.productFamily`'s type from Phase 2 exactly.
4. **Review Focus:** all five items map to a specific task's test (Tasks 1, 2, 4, 5).
