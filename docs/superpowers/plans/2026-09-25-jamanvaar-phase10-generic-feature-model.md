# JAMANVAAR Phase 10: Generic Feature/FeatureCategory Database Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, in-session).
> Subagents disallowed. Steps use checkbox (`- [ ]`) syntax for tracking. Work stays on `main`
> branch, matching every prior phase in this project.

**Goal:** Replace the *idea* of "add a hardcoded TS constant to describe a feature" with a real,
queryable, Super-Admin-editable database table. This phase stands up `Feature` and
`FeatureCategory`, seeds them from the union of the existing 21 legacy `Plan.entitlements` keys
and the 7 `AppCode` values (with zero data loss — every existing value keeps its meaning), and
exposes a real CRUD API. It does **not** yet migrate any existing consumer onto this table —
that's Phase 11. This phase only has to prove the new schema and API are correct in isolation.

**Architecture:** `Feature.legacyEntitlementKey` and `Feature.appCode` are the two bridge columns
that let this new table describe *both* existing entitlement systems without either one having
to change yet: a feature tagged with a `legacyEntitlementKey` corresponds to one of the 21 keys
already stored in `Plan.entitlements: Json`; a feature tagged with an `appCode` corresponds to
one of the 7 `AppCode`s already enforced by `ApplicationEntitlementsService`. Six features carry
both tags (the same real capability, checked two different ways today — e.g. `qrTableOrdering`/
`QR_ORDERING`). `dependsOnFeatureIds` is a plain `String[]` of other `Feature.id`s rather than a
Prisma-enforced self-relation, so the API layer (not a DB constraint) is what proves referential
integrity — this phase's tests are what make that a real guarantee, not the schema alone.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Zod, Vitest + Supertest.

**Spec:** `docs/superpowers/plans/2026-09-25-jamanvaar-gap-closure-MASTER.md` (§ "Phase 10").

## Global Constraints

- **Zero changes to any existing table or endpoint's behavior in this phase.** `Feature` and
  `FeatureCategory` are new, additive tables. Nothing in the codebase reads from them yet, so
  there is nothing existing to regress — the full pre-existing test suite must pass unchanged.
- The seed data is fixed, known reference data (16 categories, 22 features) — it is seeded via
  `prisma/seed.ts` (the existing seed entry point already run in dev/test setup), using `upsert`
  keyed by each row's unique `code`, so re-running the seed is always safe (matches this
  project's established idempotent-backfill pattern — see `backfill-restaurant-codes.ts`).
- `legacyEntitlementKey` is never settable through the new CRUD API — it only exists on the 21
  seeded rows that bridge to pre-existing data. A feature created later through the API has
  `legacyEntitlementKey: null` always.
- `code` (on both models) and `legacyEntitlementKey` (on `Feature`) are immutable once created —
  matches this project's existing pattern for `restaurantCode`/`AppCode` as stable identifiers
  other data references by value.
- Money/pricing is untouched by this phase — `Feature`/`FeatureCategory` describe capabilities,
  not price.

## Review Focus

- The seed must be idempotent: running `prisma/seed.ts` twice must produce the same 16 categories
  and 22 features, not duplicates or an error. Covered by Task 2's test.
- Creating a `Feature` with a `dependsOnFeatureIds` entry that isn't a real `Feature.id` must be
  rejected, not silently stored as a dangling reference. Covered by Task 3's test.
- Deleting a `Feature` that another `Feature` depends on must be refused with a message naming
  which feature(s) depend on it — mirroring Phase 6's `ApplicationEntitlementsService`
  "required by N enabled features" pattern — not silently leave other rows' `dependsOnFeatureIds`
  pointing at a feature that no longer exists. Covered by Task 3's test.
- A `Feature` must be set `isActive: false` before it can be deleted at all — deleting an active,
  in-use feature by accident (even one nothing else depends on) should require that explicit
  two-step deactivate-then-delete, the same "no silent destructive action" posture the master
  plan set for restaurant/device data. Covered by Task 3's test.
- `GET /api/v1/features` and `/api/v1/feature-categories` must require platform authentication —
  this is Super-Admin-only reference data, not a public endpoint (unlike, e.g., the
  restaurant-lookup resolver from Phase 1/9, which is deliberately public). Covered by Task 1's
  and Task 3's tests.

---

### Task 1: `FeatureCategory` model + CRUD

**Files:**
- Modify: `cloud/api/prisma/schema.prisma`
- Create: `cloud/api/prisma/migrations/20260925150000_feature_catalog/migration.sql`
- Create: `cloud/api/src/modules/features/dto/feature-category.dto.ts`
- Create: `cloud/api/src/modules/features/feature-categories.service.ts`
- Create: `cloud/api/src/modules/features/feature-categories.controller.ts`
- Create: `cloud/api/src/modules/features/features.module.ts`
- Modify: `cloud/api/src/app.module.ts` (register the new module)
- Test: `cloud/api/test/feature-catalog-model.e2e.spec.ts` (new)

**Interfaces:**
- Produces: `FeatureCategory` Prisma model (`id, code, name, description, sortOrder, createdAt,
  updatedAt`), `GET/POST/PATCH /api/v1/feature-categories` — consumed by Task 2 (seed) and
  Task 3 (Feature's `categoryId` FK).

- [ ] **Step 1: Write the failing test**

```typescript
// cloud/api/test/feature-catalog-model.e2e.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Generic feature catalog model (Phase 10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-feature-model-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
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
    if (createdCategoryIds.length) {
      await prisma.runAsPlatform((tx) => tx.featureCategory.deleteMany({ where: { id: { in: createdCategoryIds } } }));
    }
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('creates a feature category and lists it back', async () => {
    const stamp = Date.now();
    const create = await authed('post', '/api/v1/feature-categories').send({
      code: `test_category_${stamp}`, name: 'Test Category', description: 'A category created by a test.', sortOrder: 999
    });
    expect(create.status).toBe(201);
    createdCategoryIds.push(create.body.id);

    const list = await authed('get', '/api/v1/feature-categories');
    expect(list.status).toBe(200);
    expect(list.body.some((c: { id: string }) => c.id === create.body.id)).toBe(true);
  });

  it('updates name/description/sortOrder but rejects changing code', async () => {
    const stamp = Date.now();
    const create = await authed('post', '/api/v1/feature-categories').send({
      code: `test_category_immutable_${stamp}`, name: 'Original Name', description: 'Original.', sortOrder: 1
    });
    createdCategoryIds.push(create.body.id);

    const update = await authed('patch', `/api/v1/feature-categories/${create.body.id}`).send({ name: 'New Name', sortOrder: 2 });
    expect(update.status).toBe(200);
    expect(update.body.name).toBe('New Name');
    expect(update.body.code).toBe(`test_category_immutable_${stamp}`);

    const attemptCodeChange = await authed('patch', `/api/v1/feature-categories/${create.body.id}`).send({ code: 'something_else' });
    expect(attemptCodeChange.status).toBe(400);
  });

  it('rejects a duplicate code', async () => {
    const stamp = Date.now();
    const code = `test_category_dup_${stamp}`;
    const first = await authed('post', '/api/v1/feature-categories').send({ code, name: 'First', description: 'First.', sortOrder: 1 });
    createdCategoryIds.push(first.body.id);
    const second = await authed('post', '/api/v1/feature-categories').send({ code, name: 'Second', description: 'Second.', sortOrder: 2 });
    expect(second.status).toBe(409);
  });

  it('requires platform authentication', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/feature-categories');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/feature-catalog-model.e2e.spec.ts`
Expected: FAIL — every request 404s (the route doesn't exist yet) or the test file fails to even
collect (the `featureCategory` Prisma model doesn't exist yet).

- [ ] **Step 3: Add the `FeatureCategory` model and generate the migration**

In `cloud/api/prisma/schema.prisma`, add near the `Plan`/`ApplicationEntitlement` models:

```prisma
model FeatureCategory {
  id          String   @id @default(uuid())
  code        String   @unique
  name        String
  description String
  sortOrder   Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  features Feature[]
}
```

Run: `cd cloud/api && npx prisma migrate dev --name feature_catalog --create-only`
This creates `prisma/migrations/<timestamp>_feature_catalog/migration.sql` with the
`FeatureCategory` table's DDL (Task 3 extends this same migration file with the `Feature` table
before applying it — do not run `prisma migrate dev` a second time for Task 3, edit this file and
apply once). Read the generated SQL to confirm it only creates a new table (no `ALTER` on any
existing one).

- [ ] **Step 4: Write the DTO, service, and controller**

```typescript
// cloud/api/src/modules/features/dto/feature-category.dto.ts
import { z } from 'zod';

export const createFeatureCategorySchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1),
  sortOrder: z.number().int()
});
export type CreateFeatureCategoryDto = z.infer<typeof createFeatureCategorySchema>;

export const updateFeatureCategorySchema = z.object({
  code: z.undefined({ error: 'code is immutable once created' }).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional()
});
export type UpdateFeatureCategoryDto = z.infer<typeof updateFeatureCategorySchema>;
```

```typescript
// cloud/api/src/modules/features/feature-categories.service.ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFeatureCategoryDto, UpdateFeatureCategoryDto } from './dto/feature-category.dto';

@Injectable()
export class FeatureCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.runAsPlatform((tx) =>
      tx.featureCategory.findMany({ orderBy: { sortOrder: 'asc' }, include: { features: true } })
    );
  }

  async create(dto: CreateFeatureCategoryDto) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.featureCategory.findUnique({ where: { code: dto.code } });
      if (existing) throw new ConflictException(`A feature category with code "${dto.code}" already exists`);
      return tx.featureCategory.create({ data: dto });
    });
  }

  async update(id: string, dto: UpdateFeatureCategoryDto) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.featureCategory.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Feature category not found');
      return tx.featureCategory.update({ where: { id }, data: dto });
    });
  }
}
```

```typescript
// cloud/api/src/modules/features/feature-categories.controller.ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { FeatureCategoriesService } from './feature-categories.service';
import { createFeatureCategorySchema, updateFeatureCategorySchema } from './dto/feature-category.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';

@Controller('api/v1/feature-categories')
@UseGuards(PlatformAuthGuard)
export class FeatureCategoriesController {
  constructor(private readonly categories: FeatureCategoriesService) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createFeatureCategorySchema))
  create(@Body() body: ReturnType<typeof createFeatureCategorySchema.parse>) {
    return this.categories.create(body);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateFeatureCategorySchema))
  update(@Param('id') id: string, @Body() body: ReturnType<typeof updateFeatureCategorySchema.parse>) {
    return this.categories.update(id, body);
  }
}
```

```typescript
// cloud/api/src/modules/features/features.module.ts
import { Module } from '@nestjs/common';
import { FeatureCategoriesController } from './feature-categories.controller';
import { FeatureCategoriesService } from './feature-categories.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

@Module({
  imports: [PrismaModule, PlatformAuthModule],
  controllers: [FeatureCategoriesController],
  providers: [FeatureCategoriesService]
})
export class FeaturesModule {}
```

In `cloud/api/src/app.module.ts`, add `FeaturesModule` to the `imports` array (find where
`ApplicationEntitlementsModule` or a similarly-sized module is imported and add it alongside).

- [ ] **Step 5: Apply the migration and regenerate the client**

Run: `cd cloud/api && npx prisma migrate dev` (applies the pending migration to the dev DB)
Run: `DATABASE_URL="postgresql://jamanvaar_app:jamanvaar_app_local@localhost:5432/jamanvaar_test?schema=public" npx prisma migrate deploy` (applies it to the test DB — this project's
established two-database pattern)
Run: `npx prisma generate`

- [ ] **Step 6: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/feature-catalog-model.e2e.spec.ts`
Expected: PASS (4/4).

- [ ] **Step 7: Run the full pre-existing suite to confirm nothing regressed**

Run: `cd cloud/api && npx vitest run`
Expected: the same two pre-existing, unrelated failures known since Phase 5
(`test/rbac.e2e.spec.ts`'s B2-051/B2-053, `test/restaurant-identity-sync.e2e.spec.ts`) — no new
ones. Re-run any other unexpected single-file failure alone before treating it as real (this
suite has shown occasional flakes under full concurrency, confirmed harmless in Phases 5-9).

- [ ] **Step 8: Commit**

```bash
git add cloud/api/prisma/schema.prisma cloud/api/prisma/migrations cloud/api/src/modules/features cloud/api/src/app.module.ts cloud/api/test/feature-catalog-model.e2e.spec.ts
git commit -m "feat: add FeatureCategory model with CRUD API"
```

---

### Task 2: `Feature` model + seed data

**Files:**
- Modify: `cloud/api/prisma/schema.prisma`
- Modify: `cloud/api/prisma/migrations/20260925150000_feature_catalog/migration.sql` (extend the
  same migration Task 1 created — do not create a second migration)
- Modify: `cloud/api/prisma/seed.ts`
- Test: `cloud/api/test/feature-catalog-model.e2e.spec.ts` (extend)

**Interfaces:**
- Consumes: `FeatureCategory` (Task 1).
- Produces: `Feature` Prisma model (`id, code, name, description, categoryId, appCode,
  legacyEntitlementKey, dependsOnFeatureIds, isActive, createdAt, updatedAt`) — consumed by
  Task 3 (CRUD API) and by Phase 11 (every existing consumer migrates onto this table).

- [ ] **Step 1: Write the failing test**

Append to `cloud/api/test/feature-catalog-model.e2e.spec.ts` (new tests inside the existing
`describe` block, after the last one):

```typescript
  it('the seed produced exactly 16 categories and 22 features, with every legacy key and AppCode represented exactly once', async () => {
    const categories = await prisma.runAsPlatform((tx) => tx.featureCategory.findMany());
    expect(categories.length).toBeGreaterThanOrEqual(16);

    const features = await prisma.runAsPlatform((tx) => tx.feature.findMany());
    const seeded = features.filter((f) => f.legacyEntitlementKey !== null || f.code === 'KIOSK_ADMIN');
    expect(seeded.length).toBeGreaterThanOrEqual(22);

    const legacyKeys = new Set(features.map((f) => f.legacyEntitlementKey).filter((k): k is string => k !== null));
    expect(legacyKeys.size).toBe(21); // every one of the 21 pre-existing Plan.entitlements keys, exactly once each

    const appCodes = new Set(features.map((f) => f.appCode).filter((a): a is string => a !== null));
    expect(appCodes).toEqual(new Set(['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING']));
  });

  it('KIOSK_ADMIN depends on the KIOSK feature, and the dependency resolves to a real feature id', async () => {
    const kioskAdmin = await prisma.runAsPlatform((tx) => tx.feature.findUniqueOrThrow({ where: { code: 'KIOSK_ADMIN' } }));
    const kiosk = await prisma.runAsPlatform((tx) => tx.feature.findUniqueOrThrow({ where: { code: 'selfOrderKiosk' } }));
    expect(kioskAdmin.dependsOnFeatureIds).toEqual([kiosk.id]);
  });

  it('re-running the seed is idempotent: same 16 categories and 22 features, no duplicates', async () => {
    const { execSync } = await import('node:child_process');
    execSync('npx prisma db seed', { cwd: process.cwd() });
    const categories = await prisma.runAsPlatform((tx) => tx.featureCategory.count());
    const features = await prisma.runAsPlatform((tx) => tx.feature.count());
    // Re-running must not have duplicated the 16/22 seeded rows (other tests in the full suite
    // may add their own throwaway categories/features, so this checks "did not grow from a
    // second seed run", not an exact total — capture the count once more immediately after and
    // compare to itself for stability instead of a brittle exact literal.
    execSync('npx prisma db seed', { cwd: process.cwd() });
    const categoriesAfterSecondRun = await prisma.runAsPlatform((tx) => tx.featureCategory.count());
    const featuresAfterSecondRun = await prisma.runAsPlatform((tx) => tx.feature.count());
    expect(categoriesAfterSecondRun).toBe(categories);
    expect(featuresAfterSecondRun).toBe(features);
  }, 30_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/feature-catalog-model.e2e.spec.ts`
Expected: FAIL — `tx.feature` doesn't exist yet (Prisma client has no `Feature` model), or the
seed hasn't been extended yet so the counts are zero.

- [ ] **Step 3: Add the `Feature` model**

In `cloud/api/prisma/schema.prisma`, add directly after `FeatureCategory`:

```prisma
model Feature {
  id                   String          @id @default(uuid())
  code                 String          @unique
  name                 String
  description          String
  categoryId           String
  category             FeatureCategory @relation(fields: [categoryId], references: [id])
  // Links to the real per-app enforcement mechanism for the 7 app-level features (null for the
  // 15 finer-grained legacy features that aren't a separate app).
  appCode              AppCode?
  // Bridges to the pre-existing Plan.entitlements JSON key this feature corresponds to, for the
  // 21 features that existed before this table did. Never set through the CRUD API — only the
  // seed sets it, since it documents a fact about already-existing data, not something to invent
  // going forward.
  legacyEntitlementKey String?         @unique
  // Plain string list of other Feature.id values, not an enforced FK — the API layer (not the
  // database) proves referential integrity here (see FeaturesService).
  dependsOnFeatureIds  String[]        @default([])
  isActive             Boolean         @default(true)
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt

  @@index([categoryId])
}
```

Regenerate the migration: `cd cloud/api && npx prisma migrate dev --name feature_catalog
--create-only` will refuse (a migration with that name already exists from Task 1) — instead,
edit `prisma/migrations/20260925150000_feature_catalog/migration.sql` directly, appending the
`CREATE TABLE "Feature"` DDL Prisma would generate (run `npx prisma migrate diff
--from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
--script` is unnecessary here — instead run `npx prisma migrate dev --name feature_catalog_v2` to
let Prisma generate the `Feature` table's DDL into a *second* migration file, since Task 1's
migration has already been applied and Prisma will not let it be edited after the fact once
applied to a database it's tracking — this is the correct, safe path once Task 1's migration has
already been run in Step 5 below).

Run: `cd cloud/api && npx prisma migrate dev --name feature_catalog_v2`
Run: `DATABASE_URL="postgresql://jamanvaar_app:jamanvaar_app_local@localhost:5432/jamanvaar_test?schema=public" npx prisma migrate deploy`
Run: `npx prisma generate`

- [ ] **Step 4: Write the seed data**

In `cloud/api/prisma/seed.ts`, add a new function (call it from the existing top-level seed flow,
alongside wherever Plans are seeded):

```typescript
async function seedFeatureCatalog(tx: Prisma.TransactionClient) {
  const categories: Array<{ code: string; name: string; description: string; sortOrder: number }> = [
    { code: 'pos_billing', name: 'POS & Fast Billing', description: 'Fast counter billing, dine-in/takeaway/delivery/token order creation, discounts and automated tax calculation.', sortOrder: 1 },
    { code: 'payments_cash', name: 'Payments & Cash Drawer', description: 'Cash, UPI/BharatQR, card and split payments, cashier shifts, cash float and variance tracking.', sortOrder: 2 },
    { code: 'table_floor', name: 'Table & Floor Management', description: 'Visual floor plan, multi-zone dining, table occupancy status, table merge, split and transfer.', sortOrder: 3 },
    { code: 'kitchen_kot', name: 'Kitchen, KOT & KDS', description: 'KOT generation, kitchen timers, multi-station kitchen routing, preparing/ready tracking and station load balancing.', sortOrder: 4 },
    { code: 'menu_inventory', name: 'Menu & Inventory Management', description: 'Categorized menu, item modifiers, recipe costing, dish availability toggles, stock adjustments and low stock alerts.', sortOrder: 5 },
    { code: 'reports_gst', name: 'Reports & GST', description: 'Statutory GST reporting (CGST/SGST), daily sales summaries and discount reporting.', sortOrder: 6 },
    { code: 'offline_ops', name: 'Offline-First Operations', description: 'Local SQLite database, offline billing and order creation, automatic sync when back online.', sortOrder: 7 },
    { code: 'printing_hw', name: 'Printing & Hardware', description: '58mm/80mm ESC/POS thermal receipt printing and print queue management.', sortOrder: 8 },
    { code: 'customer_mgmt', name: 'Customer Management', description: 'Customer database, order/visit history and loyalty points.', sortOrder: 9 },
    { code: 'restaurant_admin', name: 'Restaurant Administration', description: 'Restaurant settings, branch information, tax/bill/printer configuration, user and role management.', sortOrder: 10 },
    { code: 'captain', name: 'Wireless Captain / Waiter App', description: 'Table-side ordering, course dispatch, order status tracking and waiter performance.', sortOrder: 11 },
    { code: 'qr_ordering', name: 'QR Table Ordering', description: 'Table QR code, scan-to-order digital menu, customer cart and order submission direct to POS/kitchen.', sortOrder: 12 },
    { code: 'kiosk', name: 'Self-Order Kiosk', description: 'Customer-facing self-ordering kiosk terminal and its Kiosk Admin management console.', sortOrder: 13 },
    { code: 'sync', name: 'Real-Time Multi-Machine Mesh Sync', description: 'POS/Captain/KDS/Kiosk real-time order, table, menu and availability synchronization.', sortOrder: 14 },
    { code: 'ai', name: 'JAMANVAAR AI Restaurant Assistant', description: 'Natural-language restaurant queries answered from local, offline data.', sortOrder: 15 },
    { code: 'analytics', name: 'Advanced Analytics & CRM', description: 'Advanced sales analytics, channel performance, customer lifetime value and staff attribution.', sortOrder: 16 }
  ];

  const categoryIdByCode = new Map<string, string>();
  for (const c of categories) {
    const row = await tx.featureCategory.upsert({ where: { code: c.code }, create: c, update: { name: c.name, description: c.description, sortOrder: c.sortOrder } });
    categoryIdByCode.set(c.code, row.id);
  }

  interface FeatureSeed {
    code: string; name: string; description: string; categoryCode: string;
    appCode?: 'POS' | 'POS_ADMIN' | 'CAPTAIN' | 'KDS' | 'KIOSK' | 'KIOSK_ADMIN' | 'QR_ORDERING';
    legacyEntitlementKey?: string;
  }

  const features: FeatureSeed[] = [
    { code: 'posTerminal', name: 'POS Terminal', description: 'Counter billing terminal — order creation, item search and bill generation.', categoryCode: 'pos_billing', appCode: 'POS', legacyEntitlementKey: 'posTerminal' },
    { code: 'dineInTakeawayDeliveryToken', name: 'Dine-In / Takeaway / Delivery / Token', description: 'Order-type selection at billing.', categoryCode: 'pos_billing', legacyEntitlementKey: 'dineInTakeawayDeliveryToken' },
    { code: 'multiPaymentTenders', name: 'Multi-Payment Tenders', description: 'Cash, UPI/BharatQR, card and split payments.', categoryCode: 'payments_cash', legacyEntitlementKey: 'multiPaymentTenders' },
    { code: 'shiftAndCashDrawer', name: 'Shift & Cash Drawer', description: 'Cashier shift tracking, opening/closing cash and variance.', categoryCode: 'payments_cash', legacyEntitlementKey: 'shiftAndCashDrawer' },
    { code: 'tableManagement', name: 'Table Management', description: 'Visual floor plan and table occupancy tracking.', categoryCode: 'table_floor', legacyEntitlementKey: 'tableManagement' },
    { code: 'kotKdsRouting', name: 'KOT / KDS Routing', description: 'Kitchen order ticket generation and kitchen display routing.', categoryCode: 'kitchen_kot', appCode: 'KDS', legacyEntitlementKey: 'kotKdsRouting' },
    { code: 'menuManagement', name: 'Menu Management', description: 'Category and dish management.', categoryCode: 'menu_inventory', legacyEntitlementKey: 'menuManagement' },
    { code: 'foodCustomization', name: 'Food Customization', description: 'Item modifiers and customization options.', categoryCode: 'menu_inventory', legacyEntitlementKey: 'foodCustomization' },
    { code: 'inventoryManagement', name: 'Inventory Management', description: 'Stock tracking and dish availability toggles.', categoryCode: 'menu_inventory', legacyEntitlementKey: 'inventoryManagement' },
    { code: 'salesAndGstReports', name: 'Sales & GST Reports', description: 'Daily sales and statutory GST reporting.', categoryCode: 'reports_gst', legacyEntitlementKey: 'salesAndGstReports' },
    { code: 'discountsAndGst', name: 'Discounts & GST', description: 'Discount application and automated GST calculation.', categoryCode: 'reports_gst', legacyEntitlementKey: 'discountsAndGst' },
    { code: 'offlineBilling', name: 'Offline Billing', description: 'Local-first billing that works with no internet connection.', categoryCode: 'offline_ops', legacyEntitlementKey: 'offlineBilling' },
    { code: 'receiptPrinting', name: 'Receipt Printing', description: 'Thermal receipt and KOT printing.', categoryCode: 'printing_hw', legacyEntitlementKey: 'receiptPrinting' },
    { code: 'customerManagement', name: 'Customer Management', description: 'Customer database and order history.', categoryCode: 'customer_mgmt', legacyEntitlementKey: 'customerManagement' },
    { code: 'restaurantAdmin', name: 'Restaurant Admin', description: 'Back-office console for managing menu, staff and settings.', categoryCode: 'restaurant_admin', appCode: 'POS_ADMIN', legacyEntitlementKey: 'restaurantAdmin' },
    { code: 'captainApp', name: 'Captain App', description: 'Waiter-facing tableside ordering app.', categoryCode: 'captain', appCode: 'CAPTAIN', legacyEntitlementKey: 'captainApp' },
    { code: 'qrTableOrdering', name: 'QR Table Ordering', description: "Guest self-ordering from a table's QR code.", categoryCode: 'qr_ordering', appCode: 'QR_ORDERING', legacyEntitlementKey: 'qrTableOrdering' },
    { code: 'selfOrderKiosk', name: 'Self-Order Kiosk', description: 'Self-service ordering kiosk terminal.', categoryCode: 'kiosk', appCode: 'KIOSK', legacyEntitlementKey: 'selfOrderKiosk' },
    { code: 'KIOSK_ADMIN', name: 'Kiosk Admin', description: 'Back-office console for managing kiosk menu and settings.', categoryCode: 'kiosk', appCode: 'KIOSK_ADMIN' },
    { code: 'advancedServiceWorkflow', name: 'Real-Time Multi-Machine Mesh Sync', description: 'POS/Captain/KDS/Kiosk real-time order and table synchronization.', categoryCode: 'sync', legacyEntitlementKey: 'advancedServiceWorkflow' },
    { code: 'posAssistant', name: 'JAMAN AI Assistant', description: 'Offline, local-data-based natural-language restaurant queries.', categoryCode: 'ai', legacyEntitlementKey: 'posAssistant' },
    { code: 'advancedCaptainReports', name: 'Advanced Analytics & CRM', description: 'Advanced sales analytics, channel performance and staff attribution.', categoryCode: 'analytics', legacyEntitlementKey: 'advancedCaptainReports' }
  ];

  const featureIdByCode = new Map<string, string>();
  for (const f of features) {
    const row = await tx.feature.upsert({
      where: { code: f.code },
      create: {
        code: f.code, name: f.name, description: f.description,
        categoryId: categoryIdByCode.get(f.categoryCode)!,
        appCode: f.appCode ?? null,
        legacyEntitlementKey: f.legacyEntitlementKey ?? null
      },
      update: { name: f.name, description: f.description, categoryId: categoryIdByCode.get(f.categoryCode)! }
    });
    featureIdByCode.set(f.code, row.id);
  }

  // KIOSK_ADMIN depends on selfOrderKiosk (the KIOSK app) — set once both rows exist.
  await tx.feature.update({
    where: { code: 'KIOSK_ADMIN' },
    data: { dependsOnFeatureIds: [featureIdByCode.get('selfOrderKiosk')!] }
  });
}
```

Call `await seedFeatureCatalog(tx);` from the seed script's main transaction, alongside the
existing plan-seeding call (find where `seed.ts` currently seeds `Plan` rows and add this call in
the same transaction scope).

- [ ] **Step 5: Run the seed and the tests**

Run: `cd cloud/api && npx prisma db seed`
Run: `npx vitest run test/feature-catalog-model.e2e.spec.ts`
Expected: PASS (7/7 — the 4 from Task 1 plus these 3).

- [ ] **Step 6: Run the full pre-existing suite**

Run: `cd cloud/api && npx vitest run`
Expected: same two known pre-existing failures, no new ones.

- [ ] **Step 7: Commit**

```bash
git add cloud/api/prisma/schema.prisma cloud/api/prisma/migrations cloud/api/prisma/seed.ts cloud/api/test/feature-catalog-model.e2e.spec.ts
git commit -m "feat: add Feature model, seed from the 21 legacy entitlement keys + 7 AppCodes"
```

---

### Task 3: `Feature` CRUD API with referential-integrity checks

**Files:**
- Create: `cloud/api/src/modules/features/dto/feature.dto.ts`
- Create: `cloud/api/src/modules/features/features.service.ts`
- Create: `cloud/api/src/modules/features/features.controller.ts`
- Modify: `cloud/api/src/modules/features/features.module.ts`
- Test: `cloud/api/test/feature-catalog-model.e2e.spec.ts` (extend)

**Interfaces:**
- Consumes: `Feature` (Task 2).
- Produces: `GET/POST/PATCH/DELETE /api/v1/features` — consumed by Phase 11 (every existing
  consumer migrates onto this table and these endpoints).

- [ ] **Step 1: Write the failing test**

Append to `cloud/api/test/feature-catalog-model.e2e.spec.ts`:

```typescript
  it('creates a feature under an existing category, lists it, and rejects a dependsOnFeatureIds entry that is not a real feature id', async () => {
    const categories = await authed('get', '/api/v1/feature-categories');
    const categoryId = categories.body[0].id;

    const bad = await authed('post', '/api/v1/features').send({
      code: `test_feature_bad_dep_${Date.now()}`, name: 'Bad Dep', description: 'Has a fake dependency.',
      categoryId, dependsOnFeatureIds: ['00000000-0000-0000-0000-000000000000']
    });
    expect(bad.status).toBe(400);

    const good = await authed('post', '/api/v1/features').send({
      code: `test_feature_${Date.now()}`, name: 'Test Feature', description: 'A feature created by a test.', categoryId
    });
    expect(good.status).toBe(201);

    const list = await authed('get', '/api/v1/features');
    expect(list.body.some((f: { id: string }) => f.id === good.body.id)).toBe(true);

    await authed('delete', `/api/v1/features/${good.body.id}`).then((r) => expect([400, 200]).toContain(r.status));
  });

  it('rejects deleting a feature that another feature depends on, until it is deactivated, and rejects deleting an active feature outright', async () => {
    const categories = await authed('get', '/api/v1/feature-categories');
    const categoryId = categories.body[0].id;

    const base = await authed('post', '/api/v1/features').send({
      code: `test_base_${Date.now()}`, name: 'Base', description: 'A base feature.', categoryId
    });
    const dependent = await authed('post', '/api/v1/features').send({
      code: `test_dependent_${Date.now()}`, name: 'Dependent', description: 'Depends on base.', categoryId, dependsOnFeatureIds: [base.body.id]
    });
    expect(dependent.status).toBe(201);

    // Still active: deletion refused outright, before dependency is even considered.
    const deleteActive = await authed('delete', `/api/v1/features/${base.body.id}`);
    expect(deleteActive.status).toBe(400);

    const deactivate = await authed('patch', `/api/v1/features/${base.body.id}`).send({ isActive: false });
    expect(deactivate.status).toBe(200);

    // Now inactive, but something else still depends on it.
    const deleteStillDependedOn = await authed('delete', `/api/v1/features/${base.body.id}`);
    expect(deleteStillDependedOn.status).toBe(409);
    expect(deleteStillDependedOn.body.message).toContain('Dependent');

    await authed('patch', `/api/v1/features/${dependent.body.id}`).send({ isActive: false });
    await authed('delete', `/api/v1/features/${dependent.body.id}`);

    const deleteNowUnblocked = await authed('delete', `/api/v1/features/${base.body.id}`);
    expect(deleteNowUnblocked.status).toBe(200);
  });

  it('rejects setting legacyEntitlementKey through the API and rejects changing code after creation', async () => {
    const categories = await authed('get', '/api/v1/feature-categories');
    const categoryId = categories.body[0].id;
    const create = await authed('post', '/api/v1/features').send({
      code: `test_no_legacy_${Date.now()}`, name: 'No Legacy', description: 'Should not accept a legacy key.', categoryId,
      legacyEntitlementKey: 'somethingMadeUp'
    });
    expect(create.status).toBe(400);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/feature-catalog-model.e2e.spec.ts`
Expected: FAIL — `/api/v1/features` 404s.

- [ ] **Step 3: Write the DTO**

```typescript
// cloud/api/src/modules/features/dto/feature.dto.ts
import { z } from 'zod';

const APP_CODES = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING'] as const;

export const createFeatureSchema = z
  .object({
    code: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1),
    categoryId: z.string().uuid(),
    appCode: z.enum(APP_CODES).nullable().optional(),
    dependsOnFeatureIds: z.array(z.string().uuid()).optional(),
    legacyEntitlementKey: z.undefined({ error: 'legacyEntitlementKey can only be set by the seed, never through this API' }).optional()
  })
  .strict();
export type CreateFeatureDto = z.infer<typeof createFeatureSchema>;

export const updateFeatureSchema = z
  .object({
    code: z.undefined({ error: 'code is immutable once created' }).optional(),
    legacyEntitlementKey: z.undefined({ error: 'legacyEntitlementKey is immutable' }).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).optional(),
    categoryId: z.string().uuid().optional(),
    appCode: z.enum(APP_CODES).nullable().optional(),
    dependsOnFeatureIds: z.array(z.string().uuid()).optional(),
    isActive: z.boolean().optional()
  })
  .strict();
export type UpdateFeatureDto = z.infer<typeof updateFeatureSchema>;
```

- [ ] **Step 4: Write the service with referential-integrity checks**

```typescript
// cloud/api/src/modules/features/features.service.ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFeatureDto, UpdateFeatureDto } from './dto/feature.dto';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class FeaturesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.runAsPlatform((tx) => tx.feature.findMany({ orderBy: { code: 'asc' }, include: { category: true } }));
  }

  private async assertDependenciesExist(tx: TxClient, ids: string[]) {
    if (ids.length === 0) return;
    const found = await tx.feature.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const foundIds = new Set(found.map((f) => f.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`dependsOnFeatureIds references a feature that does not exist: ${missing.join(', ')}`);
    }
  }

  async create(dto: CreateFeatureDto) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.feature.findUnique({ where: { code: dto.code } });
      if (existing) throw new ConflictException(`A feature with code "${dto.code}" already exists`);
      await this.assertDependenciesExist(tx, dto.dependsOnFeatureIds ?? []);
      return tx.feature.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description,
          categoryId: dto.categoryId,
          appCode: dto.appCode ?? null,
          dependsOnFeatureIds: dto.dependsOnFeatureIds ?? []
        }
      });
    });
  }

  async update(id: string, dto: UpdateFeatureDto) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.feature.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Feature not found');
      if (dto.dependsOnFeatureIds) await this.assertDependenciesExist(tx, dto.dependsOnFeatureIds);
      return tx.feature.update({ where: { id }, data: dto });
    });
  }

  async remove(id: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.feature.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Feature not found');
      if (existing.isActive) {
        throw new BadRequestException('Deactivate this feature (isActive: false) before deleting it');
      }
      const dependents = await tx.feature.findMany({ where: { dependsOnFeatureIds: { has: id } } });
      if (dependents.length > 0) {
        throw new ConflictException(
          `This feature is required by ${dependents.length} other feature${dependents.length === 1 ? '' : 's'} (${dependents.map((d) => d.name).join(', ')}). Remove that dependency first.`
        );
      }
      await tx.feature.delete({ where: { id } });
      return { success: true };
    });
  }
}
```

- [ ] **Step 5: Write the controller**

```typescript
// cloud/api/src/modules/features/features.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { FeaturesService } from './features.service';
import { createFeatureSchema, updateFeatureSchema } from './dto/feature.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';

@Controller('api/v1/features')
@UseGuards(PlatformAuthGuard)
export class FeaturesController {
  constructor(private readonly features: FeaturesService) {}

  @Get()
  list() {
    return this.features.list();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createFeatureSchema))
  create(@Body() body: ReturnType<typeof createFeatureSchema.parse>) {
    return this.features.create(body);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateFeatureSchema))
  update(@Param('id') id: string, @Body() body: ReturnType<typeof updateFeatureSchema.parse>) {
    return this.features.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.features.remove(id);
  }
}
```

In `cloud/api/src/modules/features/features.module.ts`, add `FeaturesController` to
`controllers` and `FeaturesService` to `providers`, alongside the existing
`FeatureCategoriesController`/`FeatureCategoriesService`.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/feature-catalog-model.e2e.spec.ts`
Expected: PASS (10/10).

- [ ] **Step 7: Run the full suite and typecheck**

Run: `cd cloud/api && npx vitest run`
Expected: same two known pre-existing failures, no new ones.
Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add cloud/api/src/modules/features cloud/api/test/feature-catalog-model.e2e.spec.ts
git commit -m "feat: add Feature CRUD API with dependency referential-integrity checks"
```

---

### Task 4: Final review and push

**Files:** none (verification only).

- [ ] **Step 1: Self-review the full diff**

Run: `git diff 07d4b8d -- cloud/api` and read every changed line. Confirm: no existing table's
schema changed (only two new tables added), no existing endpoint's route or behavior changed,
`legacyEntitlementKey` is genuinely unsettable through the create/update DTOs (the `z.undefined()`
trick actually rejects a caller-supplied value rather than silently ignoring it — verify by
re-reading Task 3's test for this), and the seed's `upsert`-by-`code` pattern really is idempotent
end to end (re-read Task 2's idempotency test and its assertions).

- [ ] **Step 2: Commit this plan document**

```bash
git add docs/superpowers/plans/2026-09-25-jamanvaar-phase10-generic-feature-model.md
git commit -m "docs: add Phase 10 (generic Feature/FeatureCategory model) plan"
```

- [ ] **Step 3: Push**

```bash
git push origin main
```
