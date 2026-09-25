# Phase 11: Migrate Consumers Onto the Generic Feature/FeatureCategory Model

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every existing consumer of the old hardcoded entitlement/feature lists (the 21-key `ENTITLEMENT_KEYS` static array, the 7-AppCode `FEATURE_CATALOG` static object) reads its data live from the Phase 10 `Feature`/`FeatureCategory` DB tables instead, and a Super Admin gets a real page to manage that catalog — so adding a new feature or category never again requires a code deploy.

**Architecture:** Backend: (1) loosen `entitlementsSchema`'s Zod shape to a permissive `Record<string, boolean>` and move key-validity checking into `PlansService` as an async DB-backed check; (2) replace `feature-catalog.ts`'s hardcoded `FEATURE_CATALOG` object and its `dependentsOf()` function with live reads of the `Feature` table (keyed by `appCode`), preserving the exact same response shapes so no frontend breaks; (3) expose each Plan's default AppCode bundle (`defaultApps`) as a computed field so the frontend can show AppCode-level (Kiosk/QR) rows without a schema change. Frontend: extend the already-shipped `EntitlementsPage` to also render AppCode-level rows using the new data, and add a new Feature Catalog admin page for full Feature/FeatureCategory CRUD, reachable from the nav.

**Tech Stack:** NestJS + Prisma + Zod + Vitest/Supertest (`cloud/api`); React + Vite + TypeScript, no test infra — verified by running the dev server (`cloud/super-admin-web`).

**Spec:** `docs/superpowers/plans/2026-09-25-jamanvaar-gap-closure-MASTER.md` (Phase 11 entry, Section 0's "several independent hardcoded lists" finding)

## Global Constraints

- Zero behavior change to any endpoint's response shape that an existing frontend already consumes. `GET /api/v1/application-entitlements/catalog` keeps its exact `Record<AppCode, {category, description, dependsOn}>` shape even though its data source changes from a static object to a DB read.
- `Plan.entitlements`' JSON storage format on the `Plan` table itself does not change in this phase — only which keys are considered *valid* becomes DB-driven. No migration touches existing `Plan` rows.
- `packages/types/src/planFeatureCatalog.ts`'s ~300 hardcoded marketing feature-bullet strings (`CORE_PLAN_FEATURE_GROUPS`, `PRO_PLAN_FEATURE_GROUPS`, `OPERATIONAL_MODULE_CATEGORIES`) are explicitly OUT of scope — that is presentational copy for the local-runtime apps' subscription screens, not the entitlement enforcement mechanism. "Nothing hardcoded" in the user's instruction targets the enforcement/catalog system this phase fixes, not marketing copy. `PlanFormModal.tsx`'s whole plan-creation UI (which reads those same marketing constants) is also deliberately untouched this phase — migrating it is a separate, larger risk (it drives real commercial plan creation) tracked as a later phase if ever needed.
- `PlanDetailPage.tsx`'s existing category matrix (reads only the legacy 21-key bag, same as `EntitlementsPage` did before this phase) is also deliberately left as-is — only `EntitlementsPage.tsx` is updated this phase, matching the scope the user-facing gap was actually reported against.
- `DEFAULT_APPS_BY_FAMILY_TIER` in `application-entitlements.service.ts` stays a hardcoded `Record<FamilyTierKey, AppCode[]>` — it is Plan-tier bundling logic (which AppCodes a given commercial tier includes by default), a different concern from the Feature/FeatureCategory catalog this phase DB-backs. It gets `export`ed so `PlansService` can read it, but its *values* are not migrated to the DB this phase.
- The full regression suite (`cd cloud/api && npx vitest run`) must stay at exactly the two known pre-existing failures (`test/rbac.e2e.spec.ts`'s B2-051/B2-053, `test/restaurant-identity-sync.e2e.spec.ts`) throughout every task.
- No subagents. Work stays on `main` branch directly. Commit after each task.

## Review Focus

- A Super Admin adding a brand-new `Feature` via the CRUD API with a `legacyEntitlementKey` must make `POST /api/v1/plans` immediately accept that key in its `entitlements` payload with no restart/deploy — the literal "nothing hardcoded" proof. Covered in Task 1.
- The application-entitlements dependency check (Phase 6, now DB-backed) must still correctly refuse disabling `POS` while `POS_ADMIN` is enabled. This is NOT automatically true after the data-source swap: Phase 10's seed never gave the `restaurantAdmin` Feature a `dependsOnFeatureIds` entry pointing at `posTerminal`, even though the old `FEATURE_CATALOG` hardcoded `POS_ADMIN: { dependsOn: ['POS'] }`. Covered explicitly in Task 2 (seed fix) and Task 3 (re-verify the existing e2e behavior, don't just trust the old test file still exists).
- `EntitlementsPage` must not crash or show garbage for a Plan whose `productFamily`/`tier` maps to zero Kiosk/QR AppCodes (a `RESTAURANT:CORE` plan) — those columns must render as "not included" rather than throwing on missing data. Covered in Task 5.
- The Feature Catalog admin page must refuse deleting a `FeatureCategory` that still has `Feature` rows in it (the DB `Feature.categoryId` FK is `ON DELETE RESTRICT`) with a readable error, not a raw 500. Covered in Task 6.
- Re-running `prisma/seed.ts` after Task 2's seed change must stay idempotent (no duplicate `dependsOnFeatureIds` entries, no duplicate rows) — the existing idempotency test in `feature-catalog-model.e2e.spec.ts` already guards row counts; Task 2 adds a specific assertion for the new dependency edge surviving a second seed run unchanged.

---

### Task 1: DB-backed `Plan.entitlements` key validation

**Files:**
- Modify: `cloud/api/src/modules/plans/entitlements.ts`
- Modify: `cloud/api/src/modules/plans/plans.service.ts`
- Test: `cloud/api/test/plans-dynamic-entitlements.e2e.spec.ts` (new)

**Interfaces:**
- Consumes: Phase 10's `Feature` table (`cloud/api/prisma/schema.prisma`), specifically rows where `legacyEntitlementKey IS NOT NULL`.
- Produces: `PlansService.create`/`update` now reject an unknown entitlements key with a 400 naming it; a newly-added `Feature.legacyEntitlementKey` becomes valid immediately, no deploy.

**Current state (verified by reading the files):** `entitlements.ts` defines `ENTITLEMENT_KEYS` (21 hardcoded strings) and builds `entitlementsSchema` as `z.object({...}).partial().transform(...)` at *module-import time*. Because plain `z.object()` (no `.strict()`) silently **strips** unrecognized keys rather than rejecting them, today a caller sending `{ someNewKey: true }` doesn't get an error — that key is just silently dropped and the value is lost. `plan.dto.ts` wires `entitlementsSchema` straight into `createPlanSchema`/`updatePlanSchema`, validated by the shared, synchronous `ZodValidationPipe` (`common/pipes/zod-validation.pipe.ts`) used by every DTO in the app. Making that shared pipe async to support a DB check would have app-wide blast radius. Instead: keep Zod for shape only (any string key, boolean value), and move key-*validity* checking into `PlansService` (already has `PrismaService` injected, already has a `tx` in every method).

- [ ] **Step 1: Write the failing test**

Create `cloud/api/test/plans-dynamic-entitlements.e2e.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Plan.entitlements keys are DB-driven (Phase 11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-dynamic-ent-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  const createdPlanIds: string[] = [];
  const createdFeatureIds: string[] = [];
  const createdCategoryIds: string[] = [];

  const authed = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
  });

  afterAll(async () => {
    if (createdPlanIds.length) {
      await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: createdPlanIds } } }));
    }
    if (createdFeatureIds.length) {
      await prisma.runAsPlatform((tx) => tx.feature.deleteMany({ where: { id: { in: createdFeatureIds } } }));
    }
    if (createdCategoryIds.length) {
      await prisma.runAsPlatform((tx) => tx.featureCategory.deleteMany({ where: { id: { in: createdCategoryIds } } }));
    }
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('rejects a Plan.entitlements key that matches no live Feature.legacyEntitlementKey', async () => {
    const res = await authed('post', '/api/v1/plans').send({
      tier: 'CORE', name: `TEST plan bad key ${Date.now()}`, priceMonthly: 500000,
      maxBranches: 1, maxDevices: 5, maxUsers: 10,
      entitlements: { totallyMadeUpKey: true }
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('totallyMadeUpKey');
  });

  it('a brand-new Feature.legacyEntitlementKey becomes valid immediately, no deploy needed', async () => {
    const catRes = await authed('post', '/api/v1/feature-categories').send({
      code: `test_dyn_cat_${Date.now()}`, name: 'Test Dynamic Category', description: 'For dynamic key test.', sortOrder: 999
    });
    createdCategoryIds.push(catRes.body.id);

    // legacyEntitlementKey can only be set by the seed per Phase 10's DTO rules, so this test
    // reaches in via Prisma directly (simulating what a future seed/migration would do) rather
    // than through the Feature CRUD API — the point being proven is "PlansService reads live DB
    // state", not "the Feature API can set this field" (it deliberately cannot).
    const newKey = `dynamicTestKey${Date.now()}`;
    const feature = await prisma.runAsPlatform((tx) =>
      tx.feature.create({
        data: {
          code: newKey, name: 'Dynamic Test Feature', description: 'Proves DB-driven validation.',
          categoryId: catRes.body.id, legacyEntitlementKey: newKey
        }
      })
    );
    createdFeatureIds.push(feature.id);

    const res = await authed('post', '/api/v1/plans').send({
      tier: 'CORE', name: `TEST plan new key ${Date.now()}`, priceMonthly: 500000,
      maxBranches: 1, maxDevices: 5, maxUsers: 10,
      entitlements: { [newKey]: true }
    });
    expect(res.status).toBe(201);
    createdPlanIds.push(res.body.id);
    expect(res.body.entitlements[newKey]).toBe(true);
    // Every other known key is still densely present, defaulted false — same guarantee the old
    // static .transform() gave every caller.
    expect(res.body.entitlements.posTerminal).toBe(false);
  });

  it('update() applies the same live validation', async () => {
    const createRes = await authed('post', '/api/v1/plans').send({
      tier: 'CORE', name: `TEST plan for update ${Date.now()}`, priceMonthly: 500000,
      maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: { posTerminal: true }
    });
    createdPlanIds.push(createRes.body.id);

    const badUpdate = await authed('patch', `/api/v1/plans/${createRes.body.id}`).send({
      entitlements: { notARealKeyEither: true }
    });
    expect(badUpdate.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/plans-dynamic-entitlements.e2e.spec.ts`
Expected: FAIL — the first test fails because today's `entitlementsSchema` silently strips `totallyMadeUpKey` instead of rejecting it (plan creation succeeds with 201, not the expected 400). The second test fails because `entitlementsSchema`'s static `.transform()` only ever writes the 21 known keys, so `res.body.entitlements[newKey]` is `undefined`, not `true`.

- [ ] **Step 3: Loosen `entitlementsSchema`'s shape and add the DB-backed check**

Replace the full contents of `cloud/api/src/modules/plans/entitlements.ts`:

```typescript
import { z } from 'zod';

/**
 * Mirrors packages/types/src/domain.ts's PlanEntitlements interface — the cloud Plan model reuses
 * the same feature-flag vocabulary the local runtime's license_entitlements.ts already
 * established. ENTITLEMENT_KEYS stays as the known/default set (used to densely default a
 * Plan's entitlements bag and to build EntitlementKey-typed UI), but it is no longer the sole
 * source of *valid* keys — see PlansService.assertValidEntitlementKeys, which checks against the
 * live Feature.legacyEntitlementKey column so a Super Admin can add a new legacy-style key via
 * the Feature CRUD API without a deploy.
 */
export const ENTITLEMENT_KEYS = [
  'posTerminal',
  'offlineBilling',
  'dineInTakeawayDeliveryToken',
  'menuManagement',
  'foodCustomization',
  'discountsAndGst',
  'multiPaymentTenders',
  'tableManagement',
  'customerManagement',
  'kotKdsRouting',
  'receiptPrinting',
  'shiftAndCashDrawer',
  'salesAndGstReports',
  'inventoryManagement',
  'posAssistant',
  'restaurantAdmin',
  'captainApp',
  'advancedCaptainReports',
  'advancedServiceWorkflow',
  'qrTableOrdering',
  'selfOrderKiosk'
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

/**
 * Shape-only validation: any string key mapped to a boolean. Zod can't check this against live
 * DB data (it runs synchronously inside the shared ZodValidationPipe, ahead of any service code)
 * — key *validity* is checked afterwards in PlansService.assertValidEntitlementKeys, and missing
 * known keys are filled to `false` there too, preserving the old dense-object guarantee every
 * caller of Plan.entitlements already relies on.
 */
export const entitlementsSchema = z.record(z.string(), z.boolean()).optional().default({});
```

- [ ] **Step 4: Add `assertValidEntitlementKeys` to `PlansService` and call it from `create`/`update`**

Modify `cloud/api/src/modules/plans/plans.service.ts`. Add the import and the private method, and call it inside both `create` and `update` before persisting:

```typescript
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlanStatus, PlatformUser, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { ENTITLEMENT_KEYS } from './entitlements';

type TxClient = Prisma.TransactionClient;
```

(add `BadRequestException` to the existing `@nestjs/common` import, add the `TxClient` type alias and the `ENTITLEMENT_KEYS` import — `ENTITLEMENT_KEYS` is used as the default-false fill set, not the validity check)

Add this private method inside the `PlansService` class, right before `create`:

```typescript
  /**
   * Validates every key in an incoming entitlements payload against the live set of
   * Feature.legacyEntitlementKey values, then returns a dense object with every known key
   * present (missing ones defaulted false) — replicating the old static entitlementsSchema
   * .transform()'s guarantee, but sourced from the DB instead of ENTITLEMENT_KEYS alone so a
   * newly-added Feature's legacyEntitlementKey is valid the moment it's created, no deploy.
   */
  private async assertValidEntitlementKeys(
    tx: TxClient,
    entitlements: Record<string, boolean> | undefined
  ): Promise<Record<string, boolean>> {
    const incoming = entitlements ?? {};
    const liveFeatures = await tx.feature.findMany({
      where: { legacyEntitlementKey: { not: null } },
      select: { legacyEntitlementKey: true }
    });
    const validKeys = new Set<string>(ENTITLEMENT_KEYS);
    for (const f of liveFeatures) {
      if (f.legacyEntitlementKey) validKeys.add(f.legacyEntitlementKey);
    }

    const unknown = Object.keys(incoming).filter((k) => !validKeys.has(k));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown entitlement key${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`
      );
    }

    const dense: Record<string, boolean> = {};
    for (const key of validKeys) dense[key] = incoming[key] ?? false;
    return dense;
  }
```

Update `create`:

```typescript
  async create(dto: CreatePlanDto, actor: PlatformUser) {
    const plan = await this.prisma.runAsPlatform(async (tx) => {
      const entitlements = await this.assertValidEntitlementKeys(tx, dto.entitlements);
      return tx.plan.create({ data: { ...dto, entitlements } as Prisma.PlanCreateInput });
    });
    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'PLAN_CREATED',
      category: 'PLAN',
      details: { planId: plan.id, name: plan.name, tier: plan.tier }
    });
    return plan;
  }
```

Update `update`:

```typescript
  async update(id: string, dto: UpdatePlanDto, actor: PlatformUser) {
    const plan = await this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.plan.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Plan not found');
      const data: Prisma.PlanUpdateInput = { ...dto } as Prisma.PlanUpdateInput;
      if (dto.entitlements !== undefined) {
        data.entitlements = await this.assertValidEntitlementKeys(tx, dto.entitlements);
      }
      return tx.plan.update({ where: { id }, data });
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'PLAN_UPDATED',
      category: 'PLAN',
      details: { planId: plan.id, name: plan.name }
    });
    return plan;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/plans-dynamic-entitlements.e2e.spec.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 6: Run full regression suite**

Run: `cd cloud/api && npx vitest run`
Expected: same two known pre-existing failures only (`test/rbac.e2e.spec.ts` B2-051/B2-053, `test/restaurant-identity-sync.e2e.spec.ts`) — no new failures. In particular, check `test/plans.e2e.spec.ts` (existing plan CRUD tests) still passes: it sends full `ENTITLEMENT_KEYS`-shaped payloads, all of which remain valid keys.

- [ ] **Step 7: Run tsc to catch type errors the test run won't**

Run: `cd cloud/api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add cloud/api/src/modules/plans/entitlements.ts cloud/api/src/modules/plans/plans.service.ts cloud/api/test/plans-dynamic-entitlements.e2e.spec.ts
git commit -m "feat: validate Plan.entitlements keys against live Feature catalog, not a static list"
```

---

### Task 2: Seed fix — replicate the POS_ADMIN→POS dependency as real `Feature` data

**Files:**
- Modify: `cloud/api/prisma/seed.ts`
- Modify: `cloud/api/test/feature-catalog-model.e2e.spec.ts`

**Interfaces:**
- Consumes: the existing `seedFeatureCatalog` function's feature-upsert list (`cloud/api/prisma/seed.ts`).
- Produces: the `restaurantAdmin` Feature row (`appCode: 'POS_ADMIN'`) now has `dependsOnFeatureIds: [posTerminal's id]`, mirroring the old `FEATURE_CATALOG.POS_ADMIN.dependsOn: ['POS']` exactly, before Task 3 deletes that hardcoded source of truth.

**Why this is needed:** `cloud/api/src/modules/application-entitlements/feature-catalog.ts`'s hardcoded `FEATURE_CATALOG` currently declares `POS_ADMIN: { dependsOn: ['POS'] }` and `KIOSK_ADMIN: { dependsOn: ['KIOSK'] }`. Phase 10's seed (`seedFeatureCatalog`) already set `KIOSK_ADMIN.dependsOnFeatureIds = [selfOrderKiosk's id]` as its one deliberate new dependency edge, but never added the equivalent edge for `restaurantAdmin` → `posTerminal`. If Task 3 swaps `feature-catalog.ts`'s dependency check over to reading `Feature.dependsOnFeatureIds` without this fix, disabling `POS` while `POS_ADMIN` is enabled would silently stop being blocked — a real behavior regression.

- [ ] **Step 1: Write the failing test**

Add to `cloud/api/test/feature-catalog-model.e2e.spec.ts` (after the existing "KIOSK_ADMIN depends on the KIOSK feature" test):

```typescript
  it('restaurantAdmin (POS_ADMIN) depends on posTerminal (POS), mirroring the legacy hardcoded catalog', async () => {
    const restaurantAdmin = await prisma.runAsPlatform((tx) => tx.feature.findUniqueOrThrow({ where: { code: 'restaurantAdmin' } }));
    const posTerminal = await prisma.runAsPlatform((tx) => tx.feature.findUniqueOrThrow({ where: { code: 'posTerminal' } }));
    expect(restaurantAdmin.dependsOnFeatureIds).toEqual([posTerminal.id]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/feature-catalog-model.e2e.spec.ts -t "restaurantAdmin"`
Expected: FAIL — `restaurantAdmin.dependsOnFeatureIds` is currently `[]`.

- [ ] **Step 3: Add the dependency edge to the seed**

Open `cloud/api/prisma/seed.ts` and find `seedFeatureCatalog`. Locate the line right after the `KIOSK_ADMIN` follow-up update that sets its `dependsOnFeatureIds` (the one described in Phase 10's own plan as "a follow-up `tx.feature.update` after both rows exist"). Add an equivalent follow-up for `restaurantAdmin` immediately after it, using the same pattern (look up both features' real ids first, since upsert order isn't guaranteed to have created them in dependency order):

```typescript
  const posTerminalFeature = await tx.feature.findUniqueOrThrow({ where: { code: 'posTerminal' } });
  await tx.feature.update({
    where: { code: 'restaurantAdmin' },
    data: { dependsOnFeatureIds: [posTerminalFeature.id] }
  });
```

Place this directly adjacent to the existing `KIOSK_ADMIN` dependency-setting block so both dependency edges are set together in one obvious spot, matching the file's existing convention of doing all upserts first, then wiring dependencies afterward.

- [ ] **Step 4: Re-run the seed against dev and test databases**

Run: `cd cloud/api && npx prisma db seed`
Run: `cd cloud/api && DATABASE_URL="postgresql://jamanvaar_app:jamanvaar_app_local@localhost:5432/jamanvaar_test?schema=public" npx prisma db seed`

(On Windows PowerShell, set `$env:DATABASE_URL` for the test DB seed instead of the `VAR=value cmd` bash form.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/feature-catalog-model.e2e.spec.ts`
Expected: PASS (all tests, including the new one and the existing idempotency test — re-running the seed via that test's own `execSync` calls must leave `dependsOnFeatureIds` unchanged, not append duplicates, since the `update` always sets the array to the same single-element value).

- [ ] **Step 6: Run full regression suite**

Run: `cd cloud/api && npx vitest run`
Expected: same two known pre-existing failures only.

- [ ] **Step 7: Commit**

```bash
git add cloud/api/prisma/seed.ts cloud/api/test/feature-catalog-model.e2e.spec.ts
git commit -m "fix: seed restaurantAdmin's dependency on posTerminal, matching the legacy hardcoded catalog"
```

---

### Task 3: Replace `FEATURE_CATALOG` and `dependentsOf()` with live DB reads

**Files:**
- Modify: `cloud/api/src/modules/application-entitlements/feature-catalog.ts`
- Modify: `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`
- Modify: `cloud/api/src/modules/application-entitlements/application-entitlements.controller.ts`
- Modify: `cloud/api/src/modules/application-entitlements/application-entitlements.module.ts`
- Test: `cloud/api/test/application-entitlements-db-catalog.e2e.spec.ts` (new)

**Interfaces:**
- Consumes: `Feature` rows where `appCode IS NOT NULL`, joined to `FeatureCategory` for `.name`; `Feature.dependsOnFeatureIds` resolved back to the *depended-on* feature's own `appCode` (only meaningful when that feature also carries an `appCode`, which both current dependency edges — `POS_ADMIN`→`POS`, `KIOSK_ADMIN`→`KIOSK` — do).
- Produces: `getFeatureCatalog(tx): Promise<Record<AppCode, FeatureCatalogEntry>>` (same `FeatureCatalogEntry` shape: `{category, description, dependsOn}`) and `getDependentsOf(tx, appCode, enabledAppCodes): Promise<AppCode[]>`, both exported from `feature-catalog.ts`, both now async and requiring a `tx`.

**Current state (verified by reading the files):** `feature-catalog.ts` exports a static `FEATURE_CATALOG: Record<AppCode, FeatureCatalogEntry>` object and a synchronous `dependentsOf(appCode, enabledAppCodes)` function. `application-entitlements.service.ts`'s `update()` method (line ~129) calls `dependentsOf(appCode, enabledRows.map(...))` synchronously inside its `tx`-wrapped block — since it's already inside an `async (tx) => {...}` callback, awaiting an async version requires no structural change beyond adding `await` and passing `tx` through. `application-entitlements.controller.ts`'s `ApplicationCatalogController.getCatalog()` currently has no service injected at all (`return FEATURE_CATALOG;`) — it needs a service injected to reach Prisma.

- [ ] **Step 1: Write the failing test**

Create `cloud/api/test/application-entitlements-db-catalog.e2e.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin, createTestRestaurantWithSubscription } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Application-entitlements catalog is DB-backed (Phase 11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-db-catalog-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;

  const authed = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
  });

  afterAll(async () => {
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('GET /api/v1/application-entitlements/catalog keeps the same shape, sourced from the DB', async () => {
    const res = await authed('get', '/api/v1/application-entitlements/catalog');
    expect(res.status).toBe(200);
    for (const code of ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING']) {
      expect(res.body[code]).toBeTruthy();
      expect(typeof res.body[code].category).toBe('string');
      expect(typeof res.body[code].description).toBe('string');
      expect(Array.isArray(res.body[code].dependsOn)).toBe(true);
    }
    expect(res.body.POS_ADMIN.dependsOn).toEqual(['POS']);
    expect(res.body.KIOSK_ADMIN.dependsOn).toEqual(['KIOSK']);
  });

  it('still refuses disabling POS while POS_ADMIN is enabled (re-verifying Phase 6 behavior after the DB swap)', async () => {
    const { restaurant, subscription } = await createTestRestaurantWithSubscription(prisma, { tier: 'CORE', productFamily: 'RESTAURANT' });
    const disablePos = await authed('patch', `/api/v1/subscriptions/${subscription.id}/applications/POS`).send({ enabled: false });
    expect(disablePos.status).toBe(409);
    expect(disablePos.body.message).toContain('POS_ADMIN');
  });
});
```

Before running, check `cloud/api/test/helpers.ts` for the exact existing name/signature of a restaurant+subscription test fixture helper (a function very much like `createTestRestaurantWithSubscription` almost certainly already exists, since Phase 6's own tests needed one for this exact scenario — grep `test/application-entitlements*.e2e.spec.ts` if it exists, or any other e2e spec that creates a subscription, and reuse whatever the real helper is named/shaped instead of inventing a new one).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/application-entitlements-db-catalog.e2e.spec.ts`
Expected: first test currently passes (the static catalog already has this shape) — that's fine, it's a regression pin, not a RED step by itself. The point of Step 2 here is confirming the *second* test (which re-verifies existing Phase 6 behavior) already passes against the *old* hardcoded implementation, establishing the baseline before Step 3 changes the data source. Confirm both pass before proceeding.

- [ ] **Step 3: Replace `feature-catalog.ts` with DB-backed functions**

Replace the full contents of `cloud/api/src/modules/application-entitlements/feature-catalog.ts`:

```typescript
import { AppCode, Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

export interface FeatureCatalogEntry {
  category: string;
  description: string;
  /** Other AppCodes that must be enabled for this one to make sense. Checked on disable only. */
  dependsOn: AppCode[];
}

/**
 * Builds the AppCode catalog from the live Feature table (Phase 10) instead of a hardcoded
 * object — a Super Admin editing a Feature's category/description/dependencies through the
 * Feature CRUD API is reflected here immediately, no deploy. Only Feature rows with a non-null
 * appCode participate (Phase 10 seeded exactly one per AppCode). dependsOn is resolved by
 * looking up each id in dependsOnFeatureIds and taking *that* feature's own appCode — a
 * dependency edge only shows up here if it points at another AppCode-carrying feature.
 */
export async function getFeatureCatalog(tx: TxClient): Promise<Record<AppCode, FeatureCatalogEntry>> {
  const features = await tx.feature.findMany({
    where: { appCode: { not: null } },
    include: { category: true }
  });
  const byId = new Map(features.map((f) => [f.id, f]));

  const catalog = {} as Record<AppCode, FeatureCatalogEntry>;
  for (const f of features) {
    if (!f.appCode) continue;
    const dependsOn = f.dependsOnFeatureIds
      .map((id) => byId.get(id)?.appCode)
      .filter((code): code is AppCode => code !== null && code !== undefined);
    catalog[f.appCode] = { category: f.category.name, description: f.description, dependsOn };
  }
  return catalog;
}

/** Which of the given enabled app codes declare a dependency on `appCode` — used to refuse disabling a prerequisite still in use by an active dependent. */
export async function getDependentsOf(tx: TxClient, appCode: AppCode, enabledAppCodes: AppCode[]): Promise<AppCode[]> {
  const catalog = await getFeatureCatalog(tx);
  return enabledAppCodes.filter((candidate) => catalog[candidate]?.dependsOn.includes(appCode));
}
```

- [ ] **Step 4: Update `application-entitlements.service.ts`'s `update()` to use the async version**

In `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`, change the import:

```typescript
import { getDependentsOf } from './feature-catalog';
```

And in `update()`, change:

```typescript
        const dependents = dependentsOf(appCode, enabledRows.map((row) => row.appCode));
```

to:

```typescript
        const dependents = await getDependentsOf(tx, appCode, enabledRows.map((row) => row.appCode));
```

(this line is already inside `return this.prisma.runAsPlatform(async (tx) => {...})`, so `tx` is already in scope and the surrounding function is already `async` — no other structural change needed)

- [ ] **Step 5: Update `application-entitlements.controller.ts`'s catalog endpoint**

`ApplicationCatalogController` currently has no constructor/service. Give it one, matching the other two controllers in the same file:

```typescript
@Controller('api/v1/application-entitlements')
@UseGuards(PlatformAuthGuard)
export class ApplicationCatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('catalog')
  getCatalog() {
    return this.prisma.runAsPlatform((tx) => getFeatureCatalog(tx));
  }
}
```

Update the file's imports: remove `import { FEATURE_CATALOG } from './feature-catalog';`, add `import { getFeatureCatalog } from './feature-catalog';` and `import { PrismaService } from '../../prisma/prisma.service';`.

- [ ] **Step 6: Confirm the module already provides `PrismaService` to this controller**

Read `cloud/api/src/modules/application-entitlements/application-entitlements.module.ts`. If `PrismaModule` is already imported there (it almost certainly is, since `ApplicationEntitlementsService` already depends on it), no change is needed — Nest resolves `PrismaService` for the newly-added controller constructor the same way. If it is not imported, add `PrismaModule` to the module's `imports` array.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/application-entitlements-db-catalog.e2e.spec.ts test/feature-catalog-model.e2e.spec.ts`
Expected: PASS (all tests, including the re-verified disable-POS-while-POS_ADMIN-enabled behavior — this now depends on Task 2's seed fix having already run).

- [ ] **Step 8: Run full regression suite, including any pre-existing application-entitlements tests**

Run: `cd cloud/api && npx vitest run`
Expected: same two known pre-existing failures only. Pay particular attention to any existing `test/application-entitlements*.e2e.spec.ts` file (Phase 6's own tests) — it must still pass unchanged, proving the data-source swap is truly behavior-preserving.

- [ ] **Step 9: Run tsc**

Run: `cd cloud/api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 10: Commit**

```bash
git add cloud/api/src/modules/application-entitlements cloud/api/test/application-entitlements-db-catalog.e2e.spec.ts
git commit -m "feat: source the application-entitlements catalog and dependency graph from the DB Feature table"
```

---

### Task 4: Expose each Plan's default AppCode bundle

**Files:**
- Modify: `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`
- Modify: `cloud/api/src/modules/plans/plans.service.ts`
- Modify: `cloud/api/src/modules/plans/plans.module.ts`
- Modify: `cloud/super-admin-web/src/api/types.ts`
- Test: `cloud/api/test/plans.e2e.spec.ts` (extend existing, or new spec if that file is large — check first)

**Interfaces:**
- Consumes: `DEFAULT_APPS_BY_FAMILY_TIER` and `defaultAppsFor` (currently un-exported module-level consts in `application-entitlements.service.ts`).
- Produces: every `Plan` returned by `GET /api/v1/plans` and `GET /api/v1/plans/:id` now carries a computed `defaultApps: AppCode[]` field (not stored in the DB — computed at read time from `productFamily`+`tier`).

**Why this task exists:** `EntitlementsPage.tsx` (Task 5) needs to know which AppCodes (`KIOSK`, `KIOSK_ADMIN`, `QR_ORDERING`, etc.) a given Plan turns on by default, to render those as matrix rows/columns. That information lives in `DEFAULT_APPS_BY_FAMILY_TIER`, a private map inside the `application-entitlements` module — Task 4 exports it and surfaces it on the Plan API response rather than duplicating the tier-bundling logic in `plans.service.ts` or in the frontend.

- [ ] **Step 1: Write the failing test**

Find the existing `describe('Plans', ...)` block or equivalent in `cloud/api/test/plans.e2e.spec.ts` (read the file first to match its existing fixture/auth setup pattern exactly) and add:

```typescript
  it('every Plan response carries a computed defaultApps field matching its productFamily/tier', async () => {
    const coreRestaurant = await authed('post', '/api/v1/plans').send({
      tier: 'CORE', productFamily: 'RESTAURANT', name: `TEST core restaurant ${Date.now()}`,
      priceMonthly: 500000, maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    expect(coreRestaurant.body.defaultApps.sort()).toEqual(['POS', 'POS_ADMIN'].sort());

    const kioskPro = await authed('post', '/api/v1/plans').send({
      tier: 'PRO', productFamily: 'KIOSK', name: `TEST kiosk pro ${Date.now()}`,
      priceMonthly: 900000, maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    expect(kioskPro.body.defaultApps.sort()).toEqual(['KIOSK', 'KIOSK_ADMIN'].sort());

    const list = await authed('get', '/api/v1/plans');
    expect(list.body.every((p: any) => Array.isArray(p.defaultApps))).toBe(true);
  });
```

(match this to whatever `authed` helper / auth setup the existing file already uses — read it first rather than assuming the `authed(...)` shape used elsewhere in this plan)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/plans.e2e.spec.ts -t "defaultApps"`
Expected: FAIL — `defaultApps` is `undefined` on every response today.

- [ ] **Step 3: Export the default-apps lookup**

In `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`, add `export` to both:

```typescript
export type FamilyTierKey = `${ProductFamily}:${PlanTier}`;
export const DEFAULT_APPS_BY_FAMILY_TIER: Partial<Record<FamilyTierKey, AppCode[]>> = {
```

and

```typescript
export function defaultAppsFor(productFamily: ProductFamily, tier: PlanTier): AppCode[] {
  return DEFAULT_APPS_BY_FAMILY_TIER[`${productFamily}:${tier}`] ?? [];
}
```

- [ ] **Step 4: Decorate Plan responses in `PlansService`**

In `cloud/api/src/modules/plans/plans.service.ts`, add the import:

```typescript
import { defaultAppsFor } from '../application-entitlements/application-entitlements.service';
```

Add a small private helper and use it in `list` and `getById` (the two read paths — `create`/`update`/`setStatus` return a bare `tx.plan.*` result today; decorate those too for consistency, since every Plan the frontend can receive should carry the field):

```typescript
  private withDefaultApps<T extends { productFamily: Prisma.PlanGetPayload<{}>['productFamily']; tier: Prisma.PlanGetPayload<{}>['tier'] }>(plan: T) {
    return { ...plan, defaultApps: defaultAppsFor(plan.productFamily, plan.tier) };
  }
```

Wrap each return value: `list()` maps over the array (`.then((plans) => plans.map((p) => this.withDefaultApps(p)))` or equivalent inside the existing `runAsPlatform` callback), `getById`/`create`/`update`/`setStatus` wrap their single returned `plan` before returning it. Keep each method's existing structure — only wrap the final return value, don't restructure the query logic.

- [ ] **Step 5: Confirm `PlansModule` can resolve `application-entitlements`'s service export**

`defaultAppsFor` is a plain exported function, not a Nest-injected service — importing it directly from `application-entitlements.service.ts` requires no module wiring (no `imports: [ApplicationEntitlementsModule]` needed in `plans.module.ts`). Confirm this by running the app/tests; if TypeScript or Nest's DI complains, the fallback is moving `defaultAppsFor`/`DEFAULT_APPS_BY_FAMILY_TIER` to a small new shared file (e.g. `cloud/api/src/modules/application-entitlements/default-apps.ts`) that both modules import from — only do this if Step 7's `tsc` run actually shows a problem, don't add the extra file speculatively.

- [ ] **Step 6: Add `defaultApps` to the frontend `Plan` type**

In `cloud/super-admin-web/src/api/types.ts`, add to the `Plan` interface (after `entitlements: Entitlements;`):

```typescript
  /** Computed server-side from productFamily+tier — which AppCodes this plan turns on by default. */
  defaultApps: AppCode[];
```

(this requires moving the `AppCode`/`APP_CODES` declaration, currently at line ~74, above the `Plan` interface at line ~51 — or simply forward-reference is fine in TypeScript for type positions, so no reordering is actually required; confirm `tsc` is happy either way)

- [ ] **Step 7: Run test to verify it passes, then full regression + tsc**

Run: `cd cloud/api && npx vitest run test/plans.e2e.spec.ts`
Expected: PASS.

Run: `cd cloud/api && npx vitest run`
Expected: same two known pre-existing failures only.

Run: `cd cloud/api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add cloud/api/src/modules/application-entitlements/application-entitlements.service.ts cloud/api/src/modules/plans/plans.service.ts cloud/super-admin-web/src/api/types.ts cloud/api/test/plans.e2e.spec.ts
git commit -m "feat: expose each Plan's default AppCode bundle as a computed defaultApps field"
```

---

### Task 5: `EntitlementsPage` shows AppCode-level features (Kiosk, Kiosk Admin, QR Ordering)

**Files:**
- Modify: `cloud/super-admin-web/src/pages/Entitlements/EntitlementsPage.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/application-entitlements/catalog` (now DB-backed, same shape — `FeatureCatalog` type already defined in `types.ts`), `Plan.defaultApps` (Task 4).
- Produces: no new exports — this is a self-contained page update.

**Current state (verified by reading the file):** `EntitlementsPage.tsx` renders one section per `OPERATIONAL_MODULE_CATEGORIES` entry (from `@jamanvaar/types`, the marketing-copy package — explicitly out of scope to change), each with rows for that category's `entitlementKeys`, and one column per fetched `Plan`, checking `p.entitlements[key]`. It never touches AppCode-level data at all. This task adds one more section — "Connected Applications" — below the existing category sections, sourced entirely from the new data, using the exact same table/row visual pattern already established (`✓ Included` / `—`) so the addition looks native, not bolted on.

- [ ] **Step 1: Add the catalog fetch**

In `EntitlementsPage.tsx`, add a new import and state:

```typescript
import { api, ApiError } from '../../api/client';
import { ENTITLEMENT_LABELS, APP_CODE_LABELS, type EntitlementKey, type Plan, type FeatureCatalog, type AppCode } from '../../api/types';
```

Add state right after the existing `plans` state:

```typescript
  const [catalog, setCatalog] = useState<FeatureCatalog | null>(null);
```

Extend the existing `useEffect` that fetches plans to also fetch the catalog (fire both requests together, not sequentially):

```typescript
  useEffect(() => {
    setLoading(true);
    Promise.all([api.get<Plan[]>('/api/v1/plans'), api.get<FeatureCatalog>('/api/v1/application-entitlements/catalog')])
      .then(([plansData, catalogData]) => {
        setPlans(plansData);
        setCatalog(catalogData);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load plans'))
      .finally(() => setLoading(false));
  }, []);
```

- [ ] **Step 2: Add the "Connected Applications" section**

Add this JSX block immediately after the closing `)}` of the existing `filteredCategories.map(...)` block, still inside the same outer `<table>`/`<Card>`, before the table's closing tags. It follows the identical `<tbody>` row-group pattern the existing categories use (header row, then one row per item), so no new CSS is needed:

```tsx
                {catalog && (
                  <tbody style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <tr style={{ background: '#f8fafc' }}>
                      <td
                        colSpan={filteredPlans.length + 1}
                        style={{ padding: '12px 20px', fontWeight: 900, fontSize: 13, color: '#0B253A', borderTop: '1px solid var(--jv-border)', borderBottom: '1px solid var(--jv-border)' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>🔌</span>
                          <span>Connected Applications</span>
                        </div>
                      </td>
                    </tr>
                    {(Object.keys(catalog) as AppCode[]).map((appCode) => (
                      <tr key={appCode} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 20px', fontWeight: 600, color: '#1e293b' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#64748b', fontSize: 12 }}>•</span>
                            <span>{APP_CODE_LABELS[appCode]}</span>
                          </div>
                        </td>
                        {filteredPlans.map((p) => {
                          const isIncluded = (p.defaultApps ?? []).includes(appCode);
                          return (
                            <td key={p.id} style={{ padding: '10px 20px', textAlign: 'center', borderLeft: '1px solid var(--jv-border)' }}>
                              {isIncluded ? (
                                <span style={{ color: '#16a34a', fontWeight: 900, fontSize: 15 }}>
                                  ✓ <span style={{ fontSize: 11, fontWeight: 700 }}>Included</span>
                                </span>
                              ) : (
                                <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: 14 }}>—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                )}
```

This deliberately reads `p.defaultApps ?? []` (never assumes the field exists) — safe even for a Plan somehow returned before Task 4 shipped, and correctly renders every column as "—" for a `RESTAURANT:CORE` plan (`defaultApps: ['POS', 'POS_ADMIN']`) since none of the 7 AppCode rows other than those two would show as included, without any crash or special-casing.

- [ ] **Step 3: Manually verify in the browser**

Start the stack per the project's existing dev workflow (check `package.json` scripts / `CLAUDE.md` for the exact commands — this project has run dev servers before in this session, reuse the same known-working invocation). Log into Super Admin, navigate to `/entitlements`, confirm:
- The new "Connected Applications" section renders below the existing category sections.
- A `RESTAURANT:CORE` plan shows `POS`/`POS_ADMIN` as Included, everything else as `—`.
- A `RESTAURANT:PRO` plan additionally shows `CAPTAIN`/`KDS` as Included.
- A `KIOSK` plan shows `KIOSK`/`KIOSK_ADMIN` as Included.
- No console errors.

- [ ] **Step 4: Run tsc on the frontend**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add cloud/super-admin-web/src/pages/Entitlements/EntitlementsPage.tsx
git commit -m "feat: show Kiosk/QR Ordering AppCode entitlements in the SaaS Entitlements matrix"
```

---

### Task 6: New Feature Catalog Super Admin page

**Files:**
- Create: `cloud/super-admin-web/src/pages/FeatureCatalog/FeatureCatalogPage.tsx`
- Create: `cloud/super-admin-web/src/pages/FeatureCatalog/FeatureFormModal.tsx`
- Create: `cloud/super-admin-web/src/pages/FeatureCatalog/CategoryFormModal.tsx`
- Modify: `cloud/super-admin-web/src/api/types.ts`
- Modify: `cloud/super-admin-web/src/app/App.tsx`
- Modify: `cloud/super-admin-web/src/layout/ProtectedLayout.tsx`
- Modify: `cloud/super-admin-web/src/auth/access.ts`

**Interfaces:**
- Consumes: `GET/POST/PATCH /api/v1/feature-categories`, `GET/POST/PATCH/DELETE /api/v1/features` (Phase 10, already shipped and stable).
- Produces: a new route `/feature-catalog`, reachable from the nav under "SaaS Management".

**Step 1: Add the frontend types**

In `cloud/super-admin-web/src/api/types.ts`, add (near the existing `FeatureCatalogEntry`/`FeatureCatalog` types):

```typescript
export interface FeatureCategoryRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  categoryId: string;
  appCode: AppCode | null;
  legacyEntitlementKey: string | null;
  dependsOnFeatureIds: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Build `CategoryFormModal.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal, Button, Input } from '../../components/ui';
import type { FeatureCategoryRecord } from '../../api/types';

export function CategoryFormModal({
  category,
  onClose,
  onSaved
}: {
  category?: FeatureCategoryRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(category?.code ?? '');
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (category) {
        await api.patch(`/api/v1/feature-categories/${category.id}`, { name, description, sortOrder: Number(sortOrder) });
      } else {
        await api.post('/api/v1/feature-categories', { code, name, description, sortOrder: Number(sortOrder) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save category');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={category ? `Edit Category: ${category.name}` : 'New Feature Category'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : category ? 'Save Changes' : 'Create Category'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field">
          <label>Code {category && <span className="form-note">(immutable once created)</span>}</label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!category} required placeholder="e.g. pos_billing" />
        </div>
        <div className="field">
          <label>Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div className="field">
          <label>Sort Order</label>
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} required />
        </div>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Modal>
  );
}
```

- [ ] **Step 3: Build `FeatureFormModal.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal, Button, Input } from '../../components/ui';
import { APP_CODES, type FeatureRecord, type FeatureCategoryRecord } from '../../api/types';

export function FeatureFormModal({
  feature,
  categories,
  allFeatures,
  onClose,
  onSaved
}: {
  feature?: FeatureRecord;
  categories: FeatureCategoryRecord[];
  allFeatures: FeatureRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(feature?.code ?? '');
  const [name, setName] = useState(feature?.name ?? '');
  const [description, setDescription] = useState(feature?.description ?? '');
  const [categoryId, setCategoryId] = useState(feature?.categoryId ?? categories[0]?.id ?? '');
  const [appCode, setAppCode] = useState<string>(feature?.appCode ?? '');
  const [dependsOn, setDependsOn] = useState<string[]>(feature?.dependsOnFeatureIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleDependency(id: string) {
    setDependsOn((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        name, description, categoryId,
        appCode: appCode || null,
        dependsOnFeatureIds: dependsOn
      };
      if (feature) {
        await api.patch(`/api/v1/features/${feature.id}`, payload);
      } else {
        await api.post('/api/v1/features', { ...payload, code });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save feature');
    } finally {
      setSubmitting(false);
    }
  }

  const dependencyCandidates = allFeatures.filter((f) => f.id !== feature?.id);

  return (
    <Modal
      title={feature ? `Edit Feature: ${feature.name}` : 'New Feature'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : feature ? 'Save Changes' : 'Create Feature'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
        <div className="field">
          <label>Code {feature && <span className="form-note">(immutable once created)</span>}</label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!feature} required placeholder="e.g. advancedTableAnalytics" />
        </div>
        <div className="field">
          <label>Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div className="field">
          <label>Category</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>App Code (optional — links this feature to a physical application)</label>
          <select value={appCode} onChange={(e) => setAppCode(e.target.value)}>
            <option value="">— None —</option>
            {APP_CODES.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Depends On (other features required for this one to work)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--jv-border)', borderRadius: 8, padding: 8 }}>
            {dependencyCandidates.map((f) => (
              <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={dependsOn.includes(f.id)} onChange={() => toggleDependency(f.id)} />
                {f.name}
              </label>
            ))}
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Modal>
  );
}
```

- [ ] **Step 4: Build `FeatureCatalogPage.tsx`**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '../../api/client';
import type { FeatureCategoryRecord, FeatureRecord } from '../../api/types';
import { Card, Button, PageHeader, EmptyState, SkeletonTable, ConfirmModal, Badge } from '../../components/ui';
import { CategoryFormModal } from './CategoryFormModal';
import { FeatureFormModal } from './FeatureFormModal';
import '../../components/shared.css';

export function FeatureCatalogPage() {
  const [categories, setCategories] = useState<FeatureCategoryRecord[] | null>(null);
  const [features, setFeatures] = useState<FeatureRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryModal, setCategoryModal] = useState<{ mode: 'create' | 'edit'; category?: FeatureCategoryRecord } | null>(null);
  const [featureModal, setFeatureModal] = useState<{ mode: 'create' | 'edit'; feature?: FeatureRecord } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeatureRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<FeatureCategoryRecord[]>('/api/v1/feature-categories'),
      api.get<FeatureRecord[]>('/api/v1/features')
    ])
      .then(([cats, feats]) => {
        setCategories([...cats].sort((a, b) => a.sortOrder - b.sortOrder));
        setFeatures(feats);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load feature catalog'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(feature: FeatureRecord) {
    try {
      await api.patch(`/api/v1/features/${feature.id}`, { isActive: !feature.isActive });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update feature');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/features/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete feature');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Feature Catalog"
        subtitle="The real, database-backed catalog of every feature and category the platform recognizes — editing here is reflected immediately across Plans, Entitlements and Application controls, with no deploy required."
        actions={
          <>
            <Button variant="ghost" onClick={() => setCategoryModal({ mode: 'create' })}>+ New Category</Button>
            <Button variant="primary" onClick={() => setFeatureModal({ mode: 'create' })}>+ New Feature</Button>
          </>
        }
      />

      {error && <div className="page-error">{error}</div>}

      {loading && !features && <SkeletonTable rows={8} cols={5} />}

      {categories && features && (
        categories.length === 0 ? (
          <EmptyState title="No categories yet" description="Create a category before adding features." />
        ) : (
          categories.map((cat) => {
            const catFeatures = features.filter((f) => f.categoryId === cat.id);
            return (
              <Card key={cat.id} style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderBottom: '1px solid var(--jv-border)' }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 14, color: '#0B253A' }}>{cat.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{cat.description}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setCategoryModal({ mode: 'edit', category: cat })}>Edit Category</Button>
                </div>
                {catFeatures.length === 0 ? (
                  <div style={{ padding: 20 }}><span className="muted">No features in this category yet.</span></div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {catFeatures.map((f) => (
                        <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 20px' }}>
                            <div style={{ fontWeight: 700, color: '#1e293b' }}>{f.name}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{f.description}</div>
                          </td>
                          <td style={{ padding: '10px 20px' }}>
                            {f.appCode && <Badge tone="accent">{f.appCode}</Badge>}
                          </td>
                          <td style={{ padding: '10px 20px' }}>
                            <Badge tone={f.isActive ? 'success' : 'neutral'}>{f.isActive ? 'Active' : 'Inactive'}</Badge>
                          </td>
                          <td style={{ padding: '10px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <Button variant="ghost" size="sm" onClick={() => setFeatureModal({ mode: 'edit', feature: f })}>Edit</Button>
                            <Button variant="ghost" size="sm" onClick={() => toggleActive(f)}>{f.isActive ? 'Deactivate' : 'Activate'}</Button>
                            <Button variant="danger" size="sm" onClick={() => setDeleteTarget(f)}>Delete</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            );
          })
        )
      )}

      {categoryModal && (
        <CategoryFormModal
          category={categoryModal.category}
          onClose={() => setCategoryModal(null)}
          onSaved={() => { setCategoryModal(null); load(); }}
        />
      )}
      {featureModal && categories && features && (
        <FeatureFormModal
          feature={featureModal.feature}
          categories={categories}
          allFeatures={features}
          onClose={() => setFeatureModal(null)}
          onSaved={() => { setFeatureModal(null); load(); }}
        />
      )}
      <ConfirmModal
        title="Delete Feature"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? This cannot be undone. If this feature is still active or another feature still depends on it, the deletion will be refused.`
            : ''
        }
        confirmLabel="Delete"
        tone="danger"
        isOpen={!!deleteTarget}
        isPending={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
```

Note: `Button`'s exact prop names (`variant`, `size`) are assumed to match `PlanFormModal.tsx`'s existing usage (`variant="ghost" size="sm"`, `variant="primary"`) — confirmed already correct by that file's own working code, reused verbatim here.

- [ ] **Step 5: Wire the route**

In `cloud/super-admin-web/src/app/App.tsx`, add the import (alongside the other page imports):

```typescript
import { FeatureCatalogPage } from '../pages/FeatureCatalog/FeatureCatalogPage';
```

Add the route (near `/entitlements`):

```tsx
              <Route path="/feature-catalog" element={page('FeatureCatalog', <FeatureCatalogPage />)} />
```

- [ ] **Step 6: Add the nav item**

In `cloud/super-admin-web/src/layout/ProtectedLayout.tsx`, add `ListChecks` to the `lucide-react` import list (alongside `Package`, `QrCode`, etc.), and add a new item to the `'SaaS Management'` group in `NAV_GROUPS`, right after `{ to: '/plans', label: 'Plans & Entitlements', icon: Package }`:

```typescript
      { to: '/feature-catalog', label: 'Feature Catalog', icon: ListChecks },
```

- [ ] **Step 7: Register the route's access area**

In `cloud/super-admin-web/src/auth/access.ts`, add to `ROUTE_AREAS` (near the existing `/plans`/`/entitlements` entries):

```typescript
  { prefix: '/feature-catalog', area: 'subscriptions' },
```

- [ ] **Step 8: Manually verify in the browser**

Start the dev stack (same known-working invocation as Task 5). Navigate to `/feature-catalog` from the sidebar:
- Confirm all 16 seeded categories render with their features grouped correctly.
- Create a new category, confirm it appears.
- Create a new feature under it, confirm it appears with the right category.
- Try deleting a feature that's still active — confirm the UI shows the resulting error (not a silent failure or crash), matching the API's `BadRequestException` message.
- Deactivate that feature, then delete it — confirm it disappears.
- Try deleting `posTerminal` (still depended on by `restaurantAdmin` per Task 2) after deactivating it — confirm the 409 "Dependent" message surfaces legibly in the UI.
- Edit an existing feature's dependencies via the checkbox list, save, confirm it persists on reload.

- [ ] **Step 9: Run tsc**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 10: Commit**

```bash
git add cloud/super-admin-web/src/pages/FeatureCatalog cloud/super-admin-web/src/api/types.ts cloud/super-admin-web/src/app/App.tsx cloud/super-admin-web/src/layout/ProtectedLayout.tsx cloud/super-admin-web/src/auth/access.ts
git commit -m "feat: add Feature Catalog admin page for real, DB-backed Feature/FeatureCategory CRUD"
```

---

### Task 7: Full-branch verification and phase close-out

**Files:** none (verification only)

- [ ] **Step 1: Full backend regression suite**

Run: `cd cloud/api && npx vitest run`
Expected: same two known pre-existing failures only (`test/rbac.e2e.spec.ts` B2-051/B2-053, `test/restaurant-identity-sync.e2e.spec.ts`), nothing new.

- [ ] **Step 2: Full backend typecheck**

Run: `cd cloud/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Full frontend typecheck**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke test of the full Phase 11 user journey**

With the dev stack running: create a new `FeatureCategory` and `Feature` via `/feature-catalog`, give the feature a `legacyEntitlementKey`-shaped code is NOT possible via the API (by design — Task 1's proof used Prisma directly) — instead confirm the more common real path: edit an existing Plan via `/plans/:id`, verify its known 21 entitlement keys still save correctly (Task 1 didn't change the 21 known keys' behavior, only what happens with an *unknown* one). Then check `/entitlements` shows the new Connected Applications section correctly for at least one CORE and one PRO plan.

- [ ] **Step 5: Update the gap-closure master plan's status**

Open `docs/superpowers/plans/2026-09-25-jamanvaar-gap-closure-MASTER.md` and mark Phase 11 as complete in its Phase index table (Section 2), matching whatever marker convention Phases the file already uses for completed phases (read the file first — do not invent a new marker style).

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-09-25-jamanvaar-gap-closure-MASTER.md
git commit -m "docs: mark Phase 11 (migrate consumers onto the generic Feature model) complete"
```

- [ ] **Step 7: Push**

```bash
git push origin main
```
