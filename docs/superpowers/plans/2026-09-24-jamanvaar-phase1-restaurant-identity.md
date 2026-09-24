# JAMANVAAR Phase 1: Restaurant Identity (`restaurantCode`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native,
> in-session) to implement this plan task-by-task. Subagents/subagent-driven-development are
> explicitly disallowed on this project — the user asked for no subagents. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Give every restaurant a human-friendly, customer-facing `restaurantCode`
(`JM` + registered 10-digit mobile, e.g. `JM9876543210`) alongside its existing internal UUID
`id`, generated at creation, backfilled for existing restaurants, and resolvable via a public
lookup endpoint — the foundation every later phase (owner login, forgot-password,
Kiosk-Admin UX, Super Admin identity card) builds on.

**Architecture:** Add two new columns to `Restaurant` (`mobile`, `restaurantCode`) plus a
`restaurantCodeIsFallback` flag for migration-safe codes that need Super Admin review. Code
generation is a pure, unit-tested utility function reused by both restaurant creation and the
one-off backfill script. `restaurantCode` is immutable by construction — it is simply never
included in `updateRestaurantSchema`, so Zod's default "strip unknown keys" behavior makes any
attempt to set it through `PATCH /restaurants/:id` a silent no-op. A new unguarded controller
(same pattern as `ActivationRedeemController`) resolves a code to a restaurant id/name for
later login/activation screens to build on.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Zod validation, Vitest + Supertest for e2e.

**Spec:** `docs/superpowers/plans/2026-09-24-jamanvaar-commercial-platform-redesign-MASTER.md`
(§ "Phase 1 — Restaurant Identity") and the two pasted prompts in the 2026-09-24 conversation,
sections 3–4.

## Global Constraints

- Money/IDs already established elsewhere are unaffected — this phase touches only
  `Restaurant`, no pricing, subscription, or entitlement logic.
- `restaurantCode` format is exactly `JM` + 10 digits (no separators), uppercase, e.g.
  `JM9876543210` — matches spec section 3 verbatim.
- Mobile numbers are validated/normalized with the existing Indian-phone rules
  (`PHONE_RE = /^(\+?91[\s-]?)?[6-9][0-9]{9}$/`, mirrored from
  `packages/utils/src/india_compliance.ts` into a new `cloud/api/src/common/validation/phone.ts`
  — same "mirrored, not imported" convention `common/validation/gstin.ts` already uses since
  `cloud/api` and `packages/utils` are different dependency trees).
- `restaurantCode` is **never** derived from or synced to `Branch`, `User.phone`, or any other
  table automatically after creation — spec section 3 explicitly requires it stay immutable
  even if the restaurant's phone number changes later.
- Every new Restaurant-mutating action goes through the existing `AuditService` — no new
  logging mechanism.
- All new Prisma migrations are hand-written SQL following the existing style in
  `cloud/api/prisma/migrations/20260921100000_login_lockout/migration.sql` (a short comment
  explaining *why*, then plain `ALTER TABLE`/`CREATE UNIQUE INDEX` statements) — no destructive
  statements, nothing that can fail on a non-empty `Restaurant` table.

## Review Focus

- A restaurant created with a mobile number already used by another restaurant (e.g. two
  outlets under one phone) — the generated code collides; must retry / fall back, never crash
  the whole creation request. Covered by Task 3's collision-retry test.
- A mobile number typed with spaces/dashes/`+91` prefix (`"+91 98765 43210"`,
  `"098765-43210"`) — must normalize to the same 10-digit code as the bare number. Covered by
  Task 1's utility unit tests.
- An existing restaurant with no phone number recorded anywhere (owner never gave one) — the
  backfill must not crash or silently invent a fake mobile; it must produce a clearly-flagged
  fallback code instead. Covered by Task 4.
- A caller who tries to change `restaurantCode` via `PATCH /restaurants/:id` — must be a silent
  no-op (field stripped), not a 400 or a crash, and the code must be provably unchanged after.
  Covered by Task 3's e2e test.
- An unauthenticated caller probing `POST /restaurant-lookup/resolve` with a made-up code —
  must get a plain 404, not a stack trace or a response shape that differs from the "found"
  case in an exploitable way (e.g. timing). Covered by Task 5's e2e test.

---

### Task 1: Phone validation + restaurant-code generation utilities

**Files:**
- Create: `cloud/api/src/common/validation/phone.ts`
- Create: `cloud/api/src/common/validation/phone.spec.ts`
- Create: `cloud/api/src/modules/restaurants/restaurant-code.util.ts`
- Create: `cloud/api/src/modules/restaurants/restaurant-code.util.spec.ts`

**Interfaces:**
- Produces: `isValidIndianPhone(value: string): boolean`, `normalizeIndianPhone(value: string): string`
  (from `phone.ts`) and `generateRestaurantCode(mobile: string): string` (from
  `restaurant-code.util.ts`) — both reused by Task 3 (creation) and Task 4 (backfill).

- [ ] **Step 1: Write the failing tests for phone validation**

```typescript
// cloud/api/src/common/validation/phone.spec.ts
import { describe, it, expect } from 'vitest';
import { isValidIndianPhone, normalizeIndianPhone } from './phone';

describe('isValidIndianPhone', () => {
  it('accepts a bare 10-digit mobile starting 6-9', () => {
    expect(isValidIndianPhone('9876543210')).toBe(true);
  });
  it('accepts +91 and spacing/dash variants', () => {
    expect(isValidIndianPhone('+91 98765 43210')).toBe(true);
    expect(isValidIndianPhone('091-9876543210'.slice(1))).toBe(true); // '91-9876543210'
  });
  it('rejects a number starting 0-5', () => {
    expect(isValidIndianPhone('1234567890')).toBe(false);
  });
  it('rejects the wrong length', () => {
    expect(isValidIndianPhone('98765432')).toBe(false);
    expect(isValidIndianPhone('987654321099')).toBe(false);
  });
});

describe('normalizeIndianPhone', () => {
  it('strips a +91 country code', () => {
    expect(normalizeIndianPhone('+91 98765 43210')).toBe('9876543210');
  });
  it('strips a leading 0 (STD-style)', () => {
    expect(normalizeIndianPhone('09876543210')).toBe('9876543210');
  });
  it('strips spaces and dashes with no country code', () => {
    expect(normalizeIndianPhone('98765-43210')).toBe('9876543210');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run src/common/validation/phone.spec.ts`
Expected: FAIL with "Cannot find module './phone'"

- [ ] **Step 3: Write the phone validation utility**

```typescript
// cloud/api/src/common/validation/phone.ts
/**
 * Mirrors packages/utils/src/india_compliance.ts's isValidIndianPhone/normalizeIndianPhone
 * exactly, the same way common/validation/gstin.ts mirrors that package's GSTIN/FSSAI
 * checks — cloud/api and packages/utils are different dependency trees, kept in sync by
 * definition (a stable, well-known number format), not by import.
 */
const PHONE_RE = /^(\+?91[\s-]?)?[6-9][0-9]{9}$/;

export function isValidIndianPhone(value: string): boolean {
  return PHONE_RE.test(value.trim().replace(/[\s()-]/g, ''));
}

/** Strips a +91/91/0 prefix and all non-digits, leaving the bare 10-digit number. */
export function normalizeIndianPhone(value: string): string {
  const digits = value.trim().replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run src/common/validation/phone.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Write the failing tests for restaurant-code generation**

```typescript
// cloud/api/src/modules/restaurants/restaurant-code.util.spec.ts
import { describe, it, expect } from 'vitest';
import { generateRestaurantCode, RESTAURANT_CODE_RE } from './restaurant-code.util';

describe('generateRestaurantCode', () => {
  it('prefixes a normalized 10-digit mobile with JM', () => {
    expect(generateRestaurantCode('9876543210')).toBe('JM9876543210');
  });
  it('normalizes +91/spacing before prefixing', () => {
    expect(generateRestaurantCode('+91 98765 43210')).toBe('JM9876543210');
  });
  it('throws on an invalid mobile number', () => {
    expect(() => generateRestaurantCode('12345')).toThrow();
  });
});

describe('RESTAURANT_CODE_RE', () => {
  it('matches the generated format', () => {
    expect(RESTAURANT_CODE_RE.test('JM9876543210')).toBe(true);
  });
  it('rejects a lowercase or malformed code', () => {
    expect(RESTAURANT_CODE_RE.test('jm9876543210')).toBe(false);
    expect(RESTAURANT_CODE_RE.test('JM987654321')).toBe(false); // 9 digits
    expect(RESTAURANT_CODE_RE.test('JM98765432100')).toBe(false); // 11 digits
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run src/modules/restaurants/restaurant-code.util.spec.ts`
Expected: FAIL with "Cannot find module './restaurant-code.util'"

- [ ] **Step 7: Write the restaurant-code generation utility**

```typescript
// cloud/api/src/modules/restaurants/restaurant-code.util.ts
import { BadRequestException } from '@nestjs/common';
import { isValidIndianPhone, normalizeIndianPhone } from '../../common/validation/phone';

export const RESTAURANT_CODE_PREFIX = 'JM';
export const RESTAURANT_CODE_RE = /^JM[6-9][0-9]{9}$/;

/**
 * `JM` + the registered mobile, normalized to a bare 10-digit number — the customer-facing
 * Restaurant ID (spec section 3). Deliberately derived only at the call site (creation or
 * backfill), never recomputed later: a restaurant's mobile changing must NOT change its code,
 * so nothing here is wired to run automatically on a phone-number update.
 */
export function generateRestaurantCode(mobile: string): string {
  if (!isValidIndianPhone(mobile)) {
    throw new BadRequestException('A valid 10-digit Indian mobile number is required to generate a Restaurant ID');
  }
  return `${RESTAURANT_CODE_PREFIX}${normalizeIndianPhone(mobile)}`;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run src/modules/restaurants/restaurant-code.util.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Commit**

```bash
git add cloud/api/src/common/validation/phone.ts cloud/api/src/common/validation/phone.spec.ts cloud/api/src/modules/restaurants/restaurant-code.util.ts cloud/api/src/modules/restaurants/restaurant-code.util.spec.ts
git commit -m "feat: add restaurant-code generation utility"
```

---

### Task 2: Schema migration — `Restaurant.mobile` / `restaurantCode` / `restaurantCodeIsFallback`

**Files:**
- Modify: `cloud/api/prisma/schema.prisma` (the `Restaurant` model, around line 114-165)
- Create: `cloud/api/prisma/migrations/20260924100000_restaurant_code/migration.sql`

**Interfaces:**
- Produces: `Restaurant.mobile: String?`, `Restaurant.restaurantCode: String? @unique`,
  `Restaurant.restaurantCodeIsFallback: Boolean @default(false)` — consumed by Task 3
  (creation), Task 4 (backfill), and Task 5 (lookup).

- [ ] **Step 1: Add the columns to the Prisma schema**

In `cloud/api/prisma/schema.prisma`, inside `model Restaurant { ... }` (after the existing
`country`/`timezone`/`currency`/`defaultLanguage` block, before `status`):

```prisma
  /// Registered/verified mobile number this restaurant's customer-facing Restaurant ID is
  /// derived from. Editable (a restaurant's phone can change) — restaurantCode is NOT
  /// recomputed when this changes; it stays immutable once generated (spec section 3).
  mobile          String?
  /// Customer-facing Restaurant ID ("JM" + 10-digit mobile, e.g. JM9876543210). Immutable
  /// after creation. Null only for legacy rows not yet backfilled (see the Phase 1 backfill
  /// script) — every restaurant created after this migration always has one.
  restaurantCode  String?          @unique
  /// True when this code came from the migration-safe fallback path (no valid mobile found
  /// during backfill) rather than a real registered number — Super Admin should review and
  /// correct these (spec section 44).
  restaurantCodeIsFallback Boolean @default(false)
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- cloud/api/prisma/migrations/20260924100000_restaurant_code/migration.sql
-- Phase 1 (Restaurant Identity): adds the customer-facing Restaurant ID ("JM" + registered
-- mobile) alongside the existing internal UUID `id`, which stays the database primary key
-- and every foreign-key reference untouched. Nullable so this migration never fails on
-- existing rows; a follow-up backfill script (backfill-restaurant-codes.ts) fills every
-- existing restaurant's code in, flagging any that had no usable phone number on file.
ALTER TABLE "Restaurant" ADD COLUMN "mobile" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "restaurantCode" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "restaurantCodeIsFallback" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Restaurant_restaurantCode_key" ON "Restaurant"("restaurantCode");
```

- [ ] **Step 3: Apply the migration and regenerate the Prisma client**

Run: `cd cloud/api && npx prisma migrate deploy && npx prisma generate`
Expected: "Applying migration `20260924100000_restaurant_code`" then
"Generated Prisma Client" with no errors.

- [ ] **Step 4: Verify the columns exist**

Run: `cd cloud/api && npx prisma db execute --stdin <<< "SELECT column_name FROM information_schema.columns WHERE table_name = 'Restaurant' AND column_name IN ('mobile', 'restaurantCode', 'restaurantCodeIsFallback');"`
Expected: all three column names listed.

- [ ] **Step 5: Commit**

```bash
git add cloud/api/prisma/schema.prisma cloud/api/prisma/migrations/20260924100000_restaurant_code
git commit -m "feat: add Restaurant.mobile/restaurantCode columns"
```

---

### Task 3: Wire `restaurantCode` generation into restaurant creation

**Files:**
- Modify: `cloud/api/src/modules/restaurants/dto/create-restaurant.dto.ts`
- Modify: `cloud/api/src/modules/restaurants/restaurants.service.ts:34-145` (`createRestaurant`)
- Test: `cloud/api/test/restaurants.e2e.spec.ts`

**Interfaces:**
- Consumes: `generateRestaurantCode(mobile: string): string` from Task 1.
- Produces: `CreateRestaurantDto.mobile: string` (new required field); `createRestaurant()`'s
  returned `restaurant` now always has `restaurantCode` set. Consumed by Task 5 (lookup) and
  every later phase's login/UI work.

- [ ] **Step 1: Write the failing e2e tests**

Add to `cloud/api/test/restaurants.e2e.spec.ts` (after the existing "creates a restaurant..."
test, reusing the same `beforeAll`/`afterAll`/`accessToken`/`createdRestaurantIds` from that
file):

```typescript
  it('rejects restaurant creation with no mobile number', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${restaurantName} No Mobile`,
        ownerName: 'Test Owner',
        ownerEmail: `owner-nomobile-${Date.now()}@test.example.com`
      });
    expect(res.status).toBe(400);
  });

  it('generates a JM-prefixed restaurantCode from the mobile number', async () => {
    const mobile = '9876543210';
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${restaurantName} With Mobile`,
        mobile,
        ownerName: 'Test Owner',
        ownerEmail: `owner-code-${Date.now()}@test.example.com`
      });

    expect(res.status).toBe(201);
    expect(res.body.restaurant.restaurantCode).toBe('JM9876543210');
    expect(res.body.restaurant.mobile).toBe(mobile);
    expect(res.body.restaurant.restaurantCodeIsFallback).toBe(false);
    createdRestaurantIds.push(res.body.restaurant.id);
  });

  it('assigns a different code to a second restaurant with a different mobile', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${restaurantName} Second`,
        mobile: '9123456780',
        ownerName: 'Test Owner',
        ownerEmail: `owner-second-${Date.now()}@test.example.com`
      });
    expect(res.status).toBe(201);
    expect(res.body.restaurant.restaurantCode).toBe('JM9123456780');
    createdRestaurantIds.push(res.body.restaurant.id);
  });

  it('rejects two restaurants sharing the same mobile number (same code would collide)', async () => {
    const mobile = '9111122223';
    const first = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `${restaurantName} Dup A`, mobile, ownerName: 'Owner A', ownerEmail: `owner-dupa-${Date.now()}@test.example.com` });
    expect(first.status).toBe(201);
    createdRestaurantIds.push(first.body.restaurant.id);

    const second = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `${restaurantName} Dup B`, mobile, ownerName: 'Owner B', ownerEmail: `owner-dupb-${Date.now()}@test.example.com` });
    expect(second.status).toBe(409);
  });

  it('restaurantCode cannot be changed via the update endpoint', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `${restaurantName} Immutable`, mobile: '9988776655', ownerName: 'Owner', ownerEmail: `owner-immut-${Date.now()}@test.example.com` });
    createdRestaurantIds.push(create.body.restaurant.id);
    const originalCode = create.body.restaurant.restaurantCode;

    const update = await request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${create.body.restaurant.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ restaurantCode: 'JM0000000000', name: `${restaurantName} Renamed` });
    expect(update.status).toBe(200);
    expect(update.body.restaurantCode).toBe(originalCode);
    expect(update.body.name).toBe(`${restaurantName} Renamed`);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/restaurants.e2e.spec.ts`
Expected: FAIL — `mobile` isn't accepted by the DTO yet, so no restaurant gets a `restaurantCode`
(the "generates a JM-prefixed..." and later tests fail on the `toBe(...)` assertions).

- [ ] **Step 3: Add `mobile` to the create-restaurant DTO**

In `cloud/api/src/modules/restaurants/dto/create-restaurant.dto.ts`, add the import and field:

```typescript
import { isValidIndianPhone } from '../../../common/validation/phone';
```

Add inside the `.object({ ... })` block, after `country`:

```typescript
    mobile: z.string().trim().refine(isValidIndianPhone, 'A valid 10-digit Indian mobile number is required'),
```

- [ ] **Step 4: Generate the code in `RestaurantsService.createRestaurant`**

In `cloud/api/src/modules/restaurants/restaurants.service.ts`, add the import:

```typescript
import { generateRestaurantCode } from './restaurant-code.util';
import { normalizeIndianPhone } from '../../common/validation/phone';
import { ConflictException } from '@nestjs/common'; // already imported alongside the others on line 1 — merge into the existing import
```

Replace the `restaurant.create` call inside `createRestaurant` (currently
`restaurants.service.ts:36-50`) with a collision-retry loop, mirroring
`activation-keys.service.ts`'s `generate()` pattern:

```typescript
      const restaurantCode = generateRestaurantCode(dto.mobile);
      let restaurant;
      try {
        restaurant = await tx.restaurant.create({
          data: {
            name: dto.name,
            legalName: dto.legalName,
            gstin: dto.gstin,
            fssaiNumber: dto.fssaiNumber,
            address: dto.address,
            city: dto.city,
            state: dto.state,
            country: dto.country,
            timezone: dto.timezone,
            currency: dto.currency,
            defaultLanguage: dto.defaultLanguage,
            mobile: normalizeIndianPhone(dto.mobile),
            restaurantCode
          }
        });
      } catch (err) {
        if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002') {
          throw new ConflictException(`A restaurant is already registered with mobile number ${normalizeIndianPhone(dto.mobile)}`);
        }
        throw err;
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/restaurants.e2e.spec.ts`
Expected: PASS (all tests in the file, including the 5 new ones).

- [ ] **Step 6: Commit**

```bash
git add cloud/api/src/modules/restaurants/dto/create-restaurant.dto.ts cloud/api/src/modules/restaurants/restaurants.service.ts cloud/api/test/restaurants.e2e.spec.ts
git commit -m "feat: generate restaurantCode on restaurant creation"
```

---

### Task 4: Backfill script for existing restaurants

**Files:**
- Create: `cloud/api/prisma/backfill-restaurant-codes.ts`
- Create: `cloud/api/prisma/backfill-restaurant-codes.spec.ts`
- Modify: `cloud/api/package.json` (add a `db:backfill-restaurant-codes` script)

**Interfaces:**
- Consumes: `generateRestaurantCode` (Task 1), `PrismaClient` directly (this runs outside
  Nest's DI, like `prisma/seed.ts` does).
- Produces: every pre-existing `Restaurant` row (created before Task 3 shipped) gets a non-null
  `restaurantCode`; rows with no usable phone number get a flagged fallback code instead of
  being left null.

- [ ] **Step 1: Write the failing test**

```typescript
// cloud/api/prisma/backfill-restaurant-codes.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { backfillRestaurantCodes } from './backfill-restaurant-codes';

describe('backfillRestaurantCodes', () => {
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const withPhoneId = `bf-with-phone-${stamp}`;
  const noPhoneId = `bf-no-phone-${stamp}`;

  beforeAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = ''`);
      await tx.$executeRawUnsafe(`SET LOCAL app.is_platform = 'true'`);
      const r1 = await tx.restaurant.create({ data: { name: `TEST Backfill With Phone ${stamp}` } });
      const r2 = await tx.restaurant.create({ data: { name: `TEST Backfill No Phone ${stamp}` } });
      await tx.branch.create({ data: { restaurantId: r1.id, name: 'Main', code: 'MAIN' } });
      await tx.branch.create({ data: { restaurantId: r2.id, name: 'Main', code: 'MAIN' } });
      await tx.user.create({ data: { restaurantId: r1.id, email: `bf1-${stamp}@example.com`, fullName: 'Owner', role: 'OWNER', phone: '9998887770' } });
      await tx.user.create({ data: { restaurantId: r2.id, email: `bf2-${stamp}@example.com`, fullName: 'Owner', role: 'OWNER' } }); // no phone
      (globalThis as any).__bfIds = { r1: r1.id, r2: r2.id };
    });
  });

  afterAll(async () => {
    const ids = (globalThis as any).__bfIds;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = ''`);
      await tx.$executeRawUnsafe(`SET LOCAL app.is_platform = 'true'`);
      await tx.restaurant.deleteMany({ where: { id: { in: [ids.r1, ids.r2] } } });
    });
    await prisma.$disconnect();
  });

  it('assigns a real code from the owner phone when one exists, and a flagged fallback when it does not', async () => {
    const result = await backfillRestaurantCodes(prisma);
    expect(result.updated).toBeGreaterThanOrEqual(2);

    const ids = (globalThis as any).__bfIds;
    const [withPhone, noPhone] = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = ''`);
      await tx.$executeRawUnsafe(`SET LOCAL app.is_platform = 'true'`);
      return Promise.all([
        tx.restaurant.findUniqueOrThrow({ where: { id: ids.r1 } }),
        tx.restaurant.findUniqueOrThrow({ where: { id: ids.r2 } })
      ]);
    });

    expect(withPhone.restaurantCode).toBe('JM9998887770');
    expect(withPhone.restaurantCodeIsFallback).toBe(false);

    expect(noPhone.restaurantCode).toMatch(/^JM/);
    expect(noPhone.restaurantCodeIsFallback).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run prisma/backfill-restaurant-codes.spec.ts`
Expected: FAIL with "Cannot find module './backfill-restaurant-codes'"

- [ ] **Step 3: Write the backfill script**

```typescript
// cloud/api/prisma/backfill-restaurant-codes.ts
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
    await tx.$executeRawUnsafe(`SET LOCAL app.is_platform = 'true'`);

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run prisma/backfill-restaurant-codes.spec.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Add the npm script**

In `cloud/api/package.json`, inside `"scripts"`, add (near the existing `"db:seed"` entry):

```json
    "db:backfill-restaurant-codes": "ts-node prisma/backfill-restaurant-codes.ts",
```

- [ ] **Step 6: Run the backfill against the local dev database**

Run: `cd cloud/api && npm run db:backfill-restaurant-codes`
Expected: "Backfilled N restaurant(s), M using a fallback code..." with no errors. (On a fresh
dev DB with zero restaurants this prints "Backfilled 0 restaurant(s), 0 using a fallback code" —
that is a pass, not a failure.)

- [ ] **Step 7: Commit**

```bash
git add cloud/api/prisma/backfill-restaurant-codes.ts cloud/api/prisma/backfill-restaurant-codes.spec.ts cloud/api/package.json
git commit -m "feat: add restaurantCode backfill script for pre-existing restaurants"
```

---

### Task 5: Public restaurant-code lookup endpoint

**Files:**
- Create: `cloud/api/src/modules/restaurants/restaurant-lookup.controller.ts`
- Create: `cloud/api/src/modules/restaurants/dto/restaurant-lookup.dto.ts`
- Modify: `cloud/api/src/modules/restaurants/restaurants.service.ts` (add `resolveByCode`)
- Modify: `cloud/api/src/modules/restaurants/restaurants.module.ts` (register the new controller)
- Test: `cloud/api/test/restaurant-lookup.e2e.spec.ts` (new file)

**Interfaces:**
- Consumes: `RESTAURANT_CODE_RE` from Task 1's `restaurant-code.util.ts`.
- Produces: `POST /api/v1/restaurant-lookup/resolve` → `{ restaurantId: string, name: string }`
  on success, 404 on an unknown/malformed code. Consumed by Phase 3 (owner login) and Phase 4
  (Kiosk Admin / Restaurant Admin login screens), and Phase 8 (Kiosk activation screen).

- [ ] **Step 1: Write the failing e2e tests**

```typescript
// cloud/api/test/restaurant-lookup.e2e.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Restaurant-code lookup (Phase 1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const adminEmail = `test-lookup-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const createdRestaurantIds: string[] = [];
  let restaurantId: string;
  const restaurantName = `TEST — Lookup Cafe ${Date.now()}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    accessToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const create = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: restaurantName, mobile: '9812345670', ownerName: 'Owner', ownerEmail: `owner-lookup-${Date.now()}@test.example.com` });
    restaurantId = create.body.restaurant.id;
    createdRestaurantIds.push(restaurantId);
  });

  afterAll(async () => {
    if (createdRestaurantIds.length) {
      await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } }));
    }
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('resolves a valid restaurantCode with no authentication required', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurant-lookup/resolve')
      .send({ restaurantCode: 'JM9812345670' });
    expect(res.status).toBe(200);
    expect(res.body.restaurantId).toBe(restaurantId);
    expect(res.body.name).toBe(restaurantName);
  });

  it('is case-insensitive on the code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurant-lookup/resolve')
      .send({ restaurantCode: 'jm9812345670' });
    expect(res.status).toBe(200);
    expect(res.body.restaurantId).toBe(restaurantId);
  });

  it('returns 404 for an unknown code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurant-lookup/resolve')
      .send({ restaurantCode: 'JM0000000000' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed code, not a 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurant-lookup/resolve')
      .send({ restaurantCode: 'not-a-code' });
    expect(res.status).toBe(400);
  });

  it('never returns internal fields like ownerEmail, gstin, or the raw database id list', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurant-lookup/resolve')
      .send({ restaurantCode: 'JM9812345670' });
    expect(Object.keys(res.body).sort()).toEqual(['name', 'restaurantId']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/restaurant-lookup.e2e.spec.ts`
Expected: FAIL with 404 on every request (route doesn't exist yet).

- [ ] **Step 3: Write the lookup DTO**

```typescript
// cloud/api/src/modules/restaurants/dto/restaurant-lookup.dto.ts
import { z } from 'zod';
import { RESTAURANT_CODE_RE } from '../restaurant-code.util';

export const resolveRestaurantCodeSchema = z.object({
  restaurantCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(RESTAURANT_CODE_RE, 'Restaurant ID must look like JM9876543210')
});
export type ResolveRestaurantCodeDto = z.infer<typeof resolveRestaurantCodeSchema>;
```

- [ ] **Step 4: Add `resolveByCode` to `RestaurantsService`**

In `cloud/api/src/modules/restaurants/restaurants.service.ts`, add this method (alongside the
other public methods, e.g. after `getRestaurantById`):

```typescript
  /**
   * Resolves a customer-facing Restaurant ID to its internal id/name — used by login,
   * forgot-password and Kiosk activation screens (Phases 3/4/8) before any credential is
   * checked. A Restaurant ID is not itself a secret (same footing as the raw UUID already
   * was — see tenant-auth.service.ts's login() comment on restaurantId being "effectively
   * public"), so a plain 404 for an unknown code is fine; only the account's *password* needs
   * a generic/constant-time response.
   */
  async resolveByCode(restaurantCode: string): Promise<{ restaurantId: string; name: string }> {
    const restaurant = await this.prisma.runAsPlatform((tx) =>
      tx.restaurant.findFirst({ where: { restaurantCode, deletedAt: null }, select: { id: true, name: true } })
    );
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return { restaurantId: restaurant.id, name: restaurant.name };
  }
```

- [ ] **Step 5: Write the unguarded lookup controller**

```typescript
// cloud/api/src/modules/restaurants/restaurant-lookup.controller.ts
import { Body, Controller, HttpCode, Post, UsePipes } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { resolveRestaurantCodeSchema, ResolveRestaurantCodeDto } from './dto/restaurant-lookup.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/**
 * Deliberately unguarded — same reasoning as ActivationRedeemController: a login or
 * activation screen calling this has no session yet. Read-only, no PII beyond the
 * restaurant's own display name (see RestaurantsService.resolveByCode's doc comment).
 */
@Controller('api/v1/restaurant-lookup')
export class RestaurantLookupController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Post('resolve')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(resolveRestaurantCodeSchema))
  resolve(@Body() body: ResolveRestaurantCodeDto) {
    return this.restaurants.resolveByCode(body.restaurantCode);
  }
}
```

- [ ] **Step 6: Register the controller**

In `cloud/api/src/modules/restaurants/restaurants.module.ts`:

```typescript
import { RestaurantLookupController } from './restaurant-lookup.controller';
// ...
  controllers: [RestaurantsController, RestaurantLookupController],
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/restaurant-lookup.e2e.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 8: Run the full existing restaurants/activation/tenant-auth test suites for regressions**

Run: `cd cloud/api && npx vitest run test/restaurants.e2e.spec.ts test/restaurant-gstin-fssai.e2e.spec.ts test/activation-redeem.e2e.spec.ts test/password-reset.e2e.spec.ts`
Expected: PASS — no pre-existing test broken by the new `mobile` field or module registration.

- [ ] **Step 9: Commit**

```bash
git add cloud/api/src/modules/restaurants/restaurant-lookup.controller.ts cloud/api/src/modules/restaurants/dto/restaurant-lookup.dto.ts cloud/api/src/modules/restaurants/restaurants.service.ts cloud/api/src/modules/restaurants/restaurants.module.ts cloud/api/test/restaurant-lookup.e2e.spec.ts
git commit -m "feat: add public restaurantCode lookup endpoint"
```

---

## Self-Review Notes (completed during planning)

1. **Spec coverage:** Section 3 (restaurantCode format, immutability, UUID-preserved) → Tasks
   1-3. Section 44 (migration plan, collision handling, missing-mobile flagging) → Task 4.
   Section 3's "used for customer-facing login/device activation" → Task 5 (the resolver every
   later phase calls). Section 27's "Restaurant Identity card" display is UI (Phase 7) —
   correctly out of scope here; this phase only makes the data available.
2. **Placeholder scan:** none — every step has concrete code, not a description of code.
3. **Type consistency:** `generateRestaurantCode(mobile: string): string` (Task 1) is the same
   signature used in Task 3 (creation) and Task 4 (backfill). `RESTAURANT_CODE_RE` (Task 1) is
   the same regex reused in Task 5's DTO. `restaurantCodeIsFallback` field name is identical
   across the schema (Task 2), backfill (Task 4), and the create-response assertion (Task 3).
4. **Review Focus:** all five items above map to a specific test in Tasks 1, 3, 4, or 5.
