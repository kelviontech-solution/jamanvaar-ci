# JAMANVAAR Phase 6: Feature Catalog & Dependency Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, in-session).
> Subagents disallowed. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the existing `ApplicationEntitlement`/`AppCode` system (POS, POS_ADMIN, CAPTAIN,
KDS, KIOSK, KIOSK_ADMIN, QR_ORDERING) a structured feature catalog — category, human
description, and dependency edges between apps — enforce those dependencies when Super Admin
disables an app, and make explicit, on every entitlement read, whether a row's current state
matches its plan's tier default (`source: 'PLAN'`) or was manually overridden
(`source: 'MANUAL_OVERRIDE'`).

**Architecture:** Add a new static catalog module (`feature-catalog.ts`) describing each of the
7 `AppCode`s' category, description, and `dependsOn` list. Wire a dependency check into
`ApplicationEntitlementsService.update`'s disable path: before flipping `enabled: true → false`,
look at every other currently-enabled row on the same subscription and refuse the change if any
of them declares a dependency on the app being disabled. Extend `listForSubscription` and
`listForRestaurant` to fetch the owning subscription's `plan.tier`/`plan.productFamily` (already
available via the existing `plan` relation) and stamp each returned row with `source`, computed
by comparing `enabled` against `defaultAppsFor(productFamily, tier)` — the same lookup Phase 5
already built for `ensureRowsForSubscription`. Expose the catalog itself via a new
`GET /api/v1/application-entitlements/catalog` endpoint for the Phase 7 Super Admin UI to
consume.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Zod, Vitest + Supertest.

**Spec:** `docs/superpowers/plans/2026-09-24-jamanvaar-commercial-platform-redesign-MASTER.md`
(§ "Phase 6").

## Findings from reading the actual entitlement code (corrects the master plan's Phase 6 scope)

- The master plan's Phase 6 section describes extending `plans/entitlements.ts`'s 21-key
  `ENTITLEMENT_KEYS` list (`posTerminal`, `kotKdsRouting`, `qrTableOrdering`, ...) with
  categories/dependencies, but also says the dependency check is "wired into
  `ApplicationEntitlementsService.update`". Reading both files shows these are two unrelated
  systems: `Plan.entitlements` (the 21-key list) is flat, per-plan-template metadata set only at
  plan creation/update, with **no independent per-subscription mutation endpoint anywhere in the
  codebase** — there is nothing for a dependency check to gate. `ApplicationEntitlementsService`
  operates on the 7-value `AppCode` enum, is genuinely per-subscription and independently
  mutable via `PATCH /api/v1/subscriptions/:id/applications/:appCode` (→ `.update()`), and is
  the system every device-activation and app-access check (`isAppEnabled`,
  `assertDeviceQuotaAvailable`) actually gates against today. This phase builds the catalog and
  dependency validation over `AppCode`/`ApplicationEntitlement`, matching the literal
  `ApplicationEntitlementsService.update` instruction and the "source: PLAN vs MANUAL OVERRIDE"
  requirement (which only makes sense where a plan-tier default already exists to compare
  against — exactly `defaultAppsFor(productFamily, tier)`, Phase 5's per-family-per-tier lookup).
  `plans/entitlements.ts`'s 21-key list is untouched by this phase.
- Every existing tier default (`DEFAULT_APPS_BY_FAMILY_TIER` in
  `application-entitlements.service.ts`) always enables `POS_ADMIN` together with `POS`, and
  `KIOSK_ADMIN` together with `KIOSK` — never one without the other. That makes
  `POS_ADMIN requires POS` / `KIOSK_ADMIN requires KIOSK` the only dependency edges that can
  never be violated by any *default* app list; they're also the only pairing that is genuinely
  a prerequisite relationship (an admin console for an app family that isn't running is
  meaningless). `CAPTAIN`, `KDS`, and `QR_ORDERING` are modelled as independent add-ons with no
  dependencies — this preserves `test/device-enforcement.e2e.spec.ts`'s existing, deliberate
  assertion that disabling `POS` does not affect `KDS`.
- One existing test conflicts with even this narrow dependency graph:
  `test/device-enforcement.e2e.spec.ts`'s PRO-tier fixture (no explicit `applications` override)
  gets `POS_ADMIN` enabled by default alongside `POS`, then the test directly disables `POS`
  while never touching `POS_ADMIN` — which the new `POS_ADMIN requires POS` rule must now
  refuse. Task 3 gives that one fixture an explicit `applications: ['POS', 'KDS']` override
  (excluding `POS_ADMIN`/`CAPTAIN`, which the test never exercises) so its actual assertion —
  disabling `POS` doesn't affect `KDS` — keeps working unchanged.
- No Prisma schema or migration changes are needed this phase — all 7 `AppCode` values this
  catalog covers already exist (added across Phases 2 and 5).

## Global Constraints

- The dependency check governs only `ApplicationEntitlementsService.update`'s **disable** path
  (`dto.enabled === false`). Enabling an app is never blocked by the dependency graph, even if
  its own prerequisite is currently disabled — the master plan only specifies a disable-time
  refusal ("required by N enabled features"); inventing a stricter enable-time mutual-consistency
  rule is out of scope for this phase.
- `ensureRowsForSubscription`'s bulk resync (used at subscription creation and plan change) is
  **not** gated by this check — it atomically replaces the entire enabled set in one transaction
  (not a single add/remove), and the master plan's instruction names `.update()` specifically.
- Every plan-tier default combination already in `DEFAULT_APPS_BY_FAMILY_TIER` must remain
  disable-able in the same order a Super Admin would naturally use (dependents before
  prerequisites) — this phase must never make an existing default combination impossible to
  fully turn off.
- `source` is computed fresh on every read from the subscription's own live `plan` relation —
  never cached, never stored as a column — so a plan change is reflected immediately without a
  migration or backfill.

## Review Focus

- Disabling a prerequisite app while a currently-enabled dependent still needs it must be
  refused with a message naming which enabled app(s) are blocking it, not just a bare 403/409
  with no explanation. Covered by Task 2's test.
- Disabling the *dependent* app itself (not the prerequisite) must always succeed, regardless of
  the prerequisite's own current enabled/disabled state — only the prerequisite side is
  protected. Covered by Task 2's test.
- Re-enabling a previously disabled prerequisite must succeed unconditionally — the dependency
  graph must never block an enable, only a disable. Covered by Task 2's test.
- An app whose current `enabled` value matches its plan-tier default must report
  `source: 'PLAN'`; one manually toggled away from that default must report
  `source: 'MANUAL_OVERRIDE'` — and this must flip correctly in both directions (a manually
  *enabled* app not in the tier default, and a manually *disabled* app that the tier default
  turns on). Covered by Task 4's test.
- Every `dependsOn` entry in the catalog must reference a real, currently-valid `AppCode` — a
  typo'd string here would silently defeat the dependency check at runtime with the compiler
  never noticing if the catalog were ever refactored to a looser type. Covered by Task 1's test.

---

### Task 1: Feature catalog module + read endpoint

**Files:**
- Create: `cloud/api/src/modules/application-entitlements/feature-catalog.ts`
- Modify: `cloud/api/src/modules/application-entitlements/application-entitlements.controller.ts`
- Test: `cloud/api/test/feature-catalog.e2e.spec.ts` (new)

**Interfaces:**
- Consumes: `AppCode` (from `@prisma/client`), `ALL_APP_CODES` (from
  `application-entitlements.service.ts`).
- Produces: `FEATURE_CATALOG: Record<AppCode, FeatureCatalogEntry>`,
  `dependentsOf(appCode: AppCode, enabledAppCodes: AppCode[]): AppCode[]` — both consumed by
  Task 2. `GET /api/v1/application-entitlements/catalog` — consumed by the Phase 7 Super Admin
  UI (not built in this phase).

- [ ] **Step 1: Write the failing test**

```typescript
// cloud/api/test/feature-catalog.e2e.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_APP_CODES } from '../src/modules/application-entitlements/application-entitlements.service';

describe('Feature catalog (Phase 6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-feature-catalog-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;

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

  it('returns a catalog entry for every AppCode, each with a real category, a description and a valid dependsOn list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/application-entitlements/catalog')
      .set('Authorization', `Bearer ${platformToken}`);
    expect(res.status).toBe(200);

    const returnedCodes = Object.keys(res.body).sort();
    expect(returnedCodes).toEqual([...ALL_APP_CODES].sort());

    for (const appCode of ALL_APP_CODES) {
      const entry = res.body[appCode];
      expect(typeof entry.category).toBe('string');
      expect(entry.category.length).toBeGreaterThan(0);
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.dependsOn)).toBe(true);
      // Every dependency must reference a real AppCode — a typo'd string here would
      // silently defeat the dependency check with no compiler error to catch it.
      for (const dep of entry.dependsOn) {
        expect(ALL_APP_CODES).toContain(dep);
      }
    }
  });

  it('POS_ADMIN depends on POS and KIOSK_ADMIN depends on KIOSK; the base terminal apps have no dependencies', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/application-entitlements/catalog')
      .set('Authorization', `Bearer ${platformToken}`);
    expect(res.body.POS_ADMIN.dependsOn).toEqual(['POS']);
    expect(res.body.KIOSK_ADMIN.dependsOn).toEqual(['KIOSK']);
    expect(res.body.POS.dependsOn).toEqual([]);
    expect(res.body.KIOSK.dependsOn).toEqual([]);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/application-entitlements/catalog');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/feature-catalog.e2e.spec.ts`
Expected: FAIL — `404` (route doesn't exist yet) or a connection/import error.

- [ ] **Step 3: Write the catalog module**

```typescript
// cloud/api/src/modules/application-entitlements/feature-catalog.ts
import { AppCode } from '@prisma/client';

export interface FeatureCatalogEntry {
  category: string;
  description: string;
  /** Other AppCodes that must be enabled for this one to make sense. Checked on disable only. */
  dependsOn: AppCode[];
}

export const FEATURE_CATALOG: Record<AppCode, FeatureCatalogEntry> = {
  POS: {
    category: 'RESTAURANT_CORE',
    description: 'Point-of-sale terminal — takes orders and processes bills.',
    dependsOn: []
  },
  POS_ADMIN: {
    category: 'RESTAURANT_CORE',
    description: 'Back-office console for managing menu, staff and settings.',
    dependsOn: ['POS']
  },
  CAPTAIN: {
    category: 'RESTAURANT_ADDON',
    description: 'Waiter-facing tableside ordering app.',
    dependsOn: []
  },
  KDS: {
    category: 'RESTAURANT_ADDON',
    description: 'Kitchen display screen showing incoming orders.',
    dependsOn: []
  },
  QR_ORDERING: {
    category: 'RESTAURANT_ADDON',
    description: "Guest self-ordering from a table's QR code.",
    dependsOn: []
  },
  KIOSK: {
    category: 'KIOSK_CORE',
    description: 'Self-service ordering kiosk terminal.',
    dependsOn: []
  },
  KIOSK_ADMIN: {
    category: 'KIOSK_CORE',
    description: 'Back-office console for managing kiosk menu and settings.',
    dependsOn: ['KIOSK']
  }
};

/** Which of the given enabled app codes declare a dependency on `appCode` — used to refuse disabling a prerequisite still in use by an active dependent. */
export function dependentsOf(appCode: AppCode, enabledAppCodes: AppCode[]): AppCode[] {
  return enabledAppCodes.filter((candidate) => FEATURE_CATALOG[candidate].dependsOn.includes(appCode));
}
```

- [ ] **Step 4: Add the read endpoint**

In `cloud/api/src/modules/application-entitlements/application-entitlements.controller.ts`, add
the import and a new controller alongside the existing two:

```typescript
import { FEATURE_CATALOG } from './feature-catalog';
```

```typescript
@Controller('api/v1/application-entitlements')
@UseGuards(PlatformAuthGuard)
export class ApplicationCatalogController {
  @Get('catalog')
  getCatalog() {
    return FEATURE_CATALOG;
  }
}
```

Register `ApplicationCatalogController` in `cloud/api/src/modules/application-entitlements/application-entitlements.module.ts`'s `controllers` array, alongside `SubscriptionApplicationsController` and `RestaurantApplicationsController`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/feature-catalog.e2e.spec.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add cloud/api/src/modules/application-entitlements/feature-catalog.ts cloud/api/src/modules/application-entitlements/application-entitlements.controller.ts cloud/api/src/modules/application-entitlements/application-entitlements.module.ts cloud/api/test/feature-catalog.e2e.spec.ts
git commit -m "feat: add application feature catalog with category, description and dependency edges"
```

---

### Task 2: Dependency validation on disable

**Files:**
- Modify: `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`
- Test: `cloud/api/test/feature-catalog.e2e.spec.ts` (extend)

**Interfaces:**
- Consumes: `dependentsOf` (Task 1).
- Produces: `update()`'s existing signature is unchanged; it now throws `ConflictException` (409)
  in one new case. No interface consumed by a later task changes shape.

- [ ] **Step 1: Write the failing test**

Append to `cloud/api/test/feature-catalog.e2e.spec.ts` (inside the same `describe` block — add a
restaurant/plan/subscription fixture to `beforeAll` first):

```typescript
// Add to the existing imports at the top of the file:
// import { PrismaService } from '../src/prisma/prisma.service'; // already imported above

// Add these to the existing `let` declarations:
  let restaurantId: string;
  let subscriptionId: string;

// Add to the end of the existing beforeAll, after platformToken is set:
    const restaurantRes = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: `TEST Feature Catalog ${Date.now()}`, ownerName: 'Catalog Owner', ownerEmail: `catalog-owner-${Date.now()}@test.example.com` });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ tier: 'PRO', name: `TEST Feature Catalog Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {} });

    const subRes = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ restaurantId, planId: planRes.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
    subscriptionId = subRes.body.id;

// Add to the existing afterAll, before app.close():
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));

// New test cases:
  it('refuses to disable POS while POS_ADMIN (a dependent) is still enabled, naming it in the error', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${subscriptionId}/applications/POS`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ enabled: false });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('POS_ADMIN');
  });

  it('allows disabling POS_ADMIN itself at any time, regardless of POS', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${subscriptionId}/applications/POS_ADMIN`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ enabled: false });
    expect(res.status).toBe(200);
  });

  it('once its dependent (POS_ADMIN) is disabled, POS itself can now be disabled', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${subscriptionId}/applications/POS`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ enabled: false });
    expect(res.status).toBe(200);
  });

  it('re-enabling POS_ADMIN succeeds unconditionally even while its prerequisite POS is disabled — the graph only blocks disable, never enable', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${subscriptionId}/applications/POS_ADMIN`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ enabled: true });
    expect(res.status).toBe(200);
  });

  it('disabling an app with no dependents (KDS) never requires anything else to change first', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${subscriptionId}/applications/KDS`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ enabled: false });
    expect(res.status).toBe(200);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/feature-catalog.e2e.spec.ts`
Expected: FAIL on "refuses to disable POS..." — actual status is `200`, not `409` (no dependency check exists yet).

- [ ] **Step 3: Wire the check into `update()`**

In `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`, add the import:

```typescript
import { dependentsOf } from './feature-catalog';
```

Replace the existing `update()` method's body (the part before `const updated = ...`) with:

```typescript
  async update(subscriptionId: string, appCode: AppCode, dto: UpdateApplicationEntitlementDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.applicationEntitlement.findUnique({
        where: { subscriptionId_appCode: { subscriptionId, appCode } }
      });
      if (!existing) throw new NotFoundException(`No ${appCode} entitlement row for this subscription`);

      if (dto.enabled === false && existing.enabled) {
        const enabledRows = await tx.applicationEntitlement.findMany({
          where: { subscriptionId, enabled: true }
        });
        const dependents = dependentsOf(appCode, enabledRows.map((row) => row.appCode));
        if (dependents.length > 0) {
          throw new ConflictException(
            `${appCode} is required by ${dependents.length} enabled feature${dependents.length === 1 ? '' : 's'} (${dependents.join(', ')}). Disable ${dependents.length === 1 ? 'it' : 'them'} first.`
          );
        }
      }

      const updated = await tx.applicationEntitlement.update({
        where: { subscriptionId_appCode: { subscriptionId, appCode } },
        data: {
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.deviceQuota !== undefined ? { deviceQuota: dto.deviceQuota } : {}),
          ...(dto.config !== undefined
            ? { config: dto.config === null ? Prisma.JsonNull : (dto.config as Prisma.InputJsonValue) }
            : {})
        }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'APPLICATION_ENTITLEMENT_UPDATED',
          category: 'APPLICATIONS',
          details: { subscriptionId, appCode, changes: dto }
        },
        tx
      );

      return updated;
    });
  }
```

(Only the block before `const updated = ...` is new; the rest of the method is unchanged from
today — reproduced above so the whole method's shape is unambiguous.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/feature-catalog.e2e.spec.ts`
Expected: PASS (8/8 — the 3 from Task 1 plus these 5).

- [ ] **Step 5: Run the existing application-entitlement regression suite**

Run: `cd cloud/api && npx vitest run test/device-enforcement.e2e.spec.ts test/multi-family-subscriptions.e2e.spec.ts`
Expected: `device-enforcement.e2e.spec.ts` FAILS here (this is expected — Task 3 fixes it next);
`multi-family-subscriptions.e2e.spec.ts` passes unchanged (it only ever enables, never disables,
an app via this endpoint).

- [ ] **Step 6: Commit**

```bash
git add cloud/api/src/modules/application-entitlements/application-entitlements.service.ts cloud/api/test/feature-catalog.e2e.spec.ts
git commit -m "feat: refuse disabling an app while an enabled dependent still requires it"
```

---

### Task 3: Fix `device-enforcement.e2e.spec.ts`'s now-incompatible fixture

**Files:**
- Modify: `cloud/api/test/device-enforcement.e2e.spec.ts:54-56`

**Interfaces:**
- Consumes: `applications` field on `POST /api/v1/subscriptions` (existing, from Phase 2/5).
- Produces: nothing consumed elsewhere — this is a test-only fix.

- [ ] **Step 1: Confirm the current failure**

Run: `cd cloud/api && npx vitest run test/device-enforcement.e2e.spec.ts`
Expected: FAIL on "disabling the POS application stops POS terminals only" — the PRO-tier
default now also enables `POS_ADMIN`, which Task 2's dependency check refuses to leave dangling
when `POS` is disabled, so the `PATCH .../applications/POS { enabled: false }` call now returns
409 instead of the 200 the test expects.

- [ ] **Step 2: Give the fixture an explicit `applications` override**

In `cloud/api/test/device-enforcement.e2e.spec.ts`, find:

```typescript
    const sub = await platform('post', '/api/v1/subscriptions').send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });
```

Replace with:

```typescript
    const sub = await platform('post', '/api/v1/subscriptions').send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      // Phase 6 added a POS_ADMIN-requires-POS dependency check — this suite disables POS
      // directly and asserts KDS is unaffected, so it excludes POS_ADMIN (which it never
      // exercises) to keep that assertion valid without touching the dependency graph.
      applications: ['POS', 'KDS']
    });
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/device-enforcement.e2e.spec.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 4: Commit**

```bash
git add cloud/api/test/device-enforcement.e2e.spec.ts
git commit -m "fix: exclude POS_ADMIN from device-enforcement's fixture to match the new POS dependency"
```

---

### Task 4: Surface `source: 'PLAN' | 'MANUAL_OVERRIDE'` on entitlement reads

**Files:**
- Modify: `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`
- Test: `cloud/api/test/feature-catalog.e2e.spec.ts` (extend)

**Interfaces:**
- Consumes: `defaultAppsFor(productFamily, tier)` (existing, Phase 5).
- Produces: `listForSubscription`/`listForRestaurant` now resolve to
  `(ApplicationEntitlement & { source: 'PLAN' | 'MANUAL_OVERRIDE' })[]` instead of bare
  `ApplicationEntitlement[]`. Every existing caller only reads `enabled`/`appCode`/`deviceQuota`
  off these rows (confirmed by reading `test/multi-family-subscriptions.e2e.spec.ts:182-184`),
  so this is additive and does not break any existing assertion.

- [ ] **Step 1: Write the failing test**

Append to `cloud/api/test/feature-catalog.e2e.spec.ts`:

```typescript
  it('a row matching its plan tier default reports source PLAN; one manually disabled away from the default reports MANUAL_OVERRIDE', async () => {
    const before = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions/${subscriptionId}/applications`)
      .set('Authorization', `Bearer ${platformToken}`);
    // POS was re-disabled by Task 2's tests and never re-enabled since; PRO tier defaults it to true.
    const posRow = before.body.find((r: { appCode: string }) => r.appCode === 'POS');
    expect(posRow.enabled).toBe(false);
    expect(posRow.source).toBe('MANUAL_OVERRIDE');

    // QR_ORDERING was never touched — PRO tier's default for it is false, and it's still false.
    const qrRow = before.body.find((r: { appCode: string }) => r.appCode === 'QR_ORDERING');
    expect(qrRow.enabled).toBe(false);
    expect(qrRow.source).toBe('PLAN');

    // Manually enable QR_ORDERING, which the PRO tier default does not include.
    const enable = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${subscriptionId}/applications/QR_ORDERING`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ enabled: true });
    expect(enable.status).toBe(200);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/subscriptions/${subscriptionId}/applications`)
      .set('Authorization', `Bearer ${platformToken}`);
    const qrRowAfter = after.body.find((r: { appCode: string }) => r.appCode === 'QR_ORDERING');
    expect(qrRowAfter.enabled).toBe(true);
    expect(qrRowAfter.source).toBe('MANUAL_OVERRIDE');
  });

  it('the restaurant-level applications read also carries source', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/restaurants/${restaurantId}/applications`)
      .set('Authorization', `Bearer ${platformToken}`);
    expect(res.status).toBe(200);
    for (const row of res.body) {
      expect(['PLAN', 'MANUAL_OVERRIDE']).toContain(row.source);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/feature-catalog.e2e.spec.ts`
Expected: FAIL — `posRow.source`/`qrRow.source` are `undefined` (field doesn't exist yet).

- [ ] **Step 3: Add `source` to both read methods**

In `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`, add a
private helper (place it above `listForSubscription`):

```typescript
  private withSource<T extends { appCode: AppCode; enabled: boolean }>(
    rows: T[],
    plan: { tier: PlanTier; productFamily: ProductFamily }
  ): (T & { source: 'PLAN' | 'MANUAL_OVERRIDE' })[] {
    const defaults = new Set(defaultAppsFor(plan.productFamily, plan.tier));
    return rows.map((row) => ({
      ...row,
      source: row.enabled === defaults.has(row.appCode) ? ('PLAN' as const) : ('MANUAL_OVERRIDE' as const)
    }));
  }
```

Replace `listForSubscription`:

```typescript
  async listForSubscription(subscriptionId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const sub = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        include: { plan: { select: { tier: true, productFamily: true } } }
      });
      if (!sub) throw new NotFoundException('Subscription not found');
      const rows = await tx.applicationEntitlement.findMany({
        where: { subscriptionId },
        orderBy: { appCode: 'asc' }
      });
      return this.withSource(rows, sub.plan);
    });
  }
```

Replace `listForRestaurant`:

```typescript
  async listForRestaurant(restaurantId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { restaurantId, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
        orderBy: { createdAt: 'desc' },
        include: { plan: { select: { tier: true, productFamily: true } } }
      });
      if (!sub) return [];
      const rows = await tx.applicationEntitlement.findMany({
        where: { subscriptionId: sub.id },
        orderBy: { appCode: 'asc' }
      });
      return this.withSource(rows, sub.plan);
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/feature-catalog.e2e.spec.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Run the broader entitlement/subscription regression suite**

Run: `cd cloud/api && npx vitest run test/multi-family-subscriptions.e2e.spec.ts test/device-enforcement.e2e.spec.ts test/device-updates.e2e.spec.ts test/qr-ordering.e2e.spec.ts`
Expected: all pass, unchanged.

- [ ] **Step 6: Commit**

```bash
git add cloud/api/src/modules/application-entitlements/application-entitlements.service.ts cloud/api/test/feature-catalog.e2e.spec.ts
git commit -m "feat: surface source (PLAN vs MANUAL_OVERRIDE) on every application entitlement read"
```

---

### Task 5: Full regression, typecheck, and final review

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `cd cloud/api && npx vitest run`
Expected: the same two pre-existing, unrelated failures already known before this phase
(`test/rbac.e2e.spec.ts`'s B2-051/B2-053 test — a raw `prisma.restaurant.create()` bypassing
tenant RLS context, pre-existing; `test/restaurant-identity-sync.e2e.spec.ts` — a pre-existing
`beforeAll` flake under full-suite concurrency) — no new failures. Because this suite shows
occasional single-file flakes under full concurrent load (confirmed during Phase 5's
verification), re-run any unexpected failing file alone before treating it as a real regression:
`npx vitest run test/<file>.e2e.spec.ts`.

- [ ] **Step 2: Run the typecheck**

Run: `cd cloud/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Self-review the full diff**

Run: `git diff main -- cloud/api/src cloud/api/test` (or `git log` across this phase's commits)
and read every changed line. Confirm: the dependency check only ever fires on
`dto.enabled === false`; `source` is computed per-request from the live `plan` relation, never
persisted; the catalog's `dependsOn` values all typecheck against `AppCode` (a stray string
literal not in the enum would already be a compile error here, since `FEATURE_CATALOG` is typed
`Record<AppCode, FeatureCatalogEntry>` and `dependsOn: AppCode[]`).

- [ ] **Step 4: Commit this plan document**

```bash
git add docs/superpowers/plans/2026-09-25-jamanvaar-phase6-feature-catalog.md
git commit -m "docs: add Phase 6 (feature catalog & dependency validation) plan"
```

- [ ] **Step 5: Push**

```bash
git push origin main
```
