# JAMANVAAR Phase 9: Security/Audit Hardening + E2E Journey Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, in-session).
> Subagents disallowed. Steps use checkbox (`- [ ]`) syntax for tracking. This is the final phase
> of the JAMANVAAR commercial platform redesign (Phases 1–8, all already shipped and pushed).

**Goal:** Give the restaurant-code lookup and owner-auth endpoints an explicit, tighter per-IP
throttle instead of silently relying on the platform's generic default; add one automated test
that walks the entire spec-section-58 journey end to end (Super Admin onboards a restaurant →
`restaurantCode` generated → RESTAURANT plan assigned → KIOSK add-on assigned separately → Kiosk
activates with `restaurantCode` + key → Kiosk Admin logs in with `restaurantCode` + owner
password → forgot-password round-trip → Super Admin sees it all); and confirm every
pre-existing email+password/UUID-based flow this redesign never touched still passes unchanged.

**Architecture:** No new modules. `cloud/api/src/common/throttle.ts` already establishes the
pattern this phase extends — a named requests-per-minute constant plus a `Throttle({...})`
decorator factory, applied per-route on top of the app-wide 120/min/IP default
(`app.module.ts`'s `ThrottlerModule.forRoot`). The journey test is one new e2e spec file that
chains together endpoints every earlier phase already tested individually, in the literal order
spec section 58 describes, asserting on the *combination* (e.g., that the restaurant Super Admin
sees after the whole journey really does show two active subscriptions, the correct owner, and a
redeemed device) rather than re-testing any single endpoint's own behavior a second time.

**Tech Stack:** NestJS, `@nestjs/throttler`, Prisma/PostgreSQL, Vitest + Supertest.

**Spec:** `docs/superpowers/plans/2026-09-24-jamanvaar-commercial-platform-redesign-MASTER.md`
(§ "Phase 9").

## Findings from reading the actual auth/throttle code (corrects the master plan's Phase 9 scope)

- Neither `restaurant-lookup.controller.ts` nor any route in `tenant-auth.controller.ts` has a
  `@Throttle(...)` override today — confirmed by grep across `cloud/api/src`, whose only hits are
  `app.module.ts`, `common/throttle.ts`, and device-sync/QR-guest controllers. This means these
  endpoints are not literally unthrottled: they already inherit the app-wide 120 requests/minute/
  IP default. The "review" this phase performs is not discovering a hole — it's the judgment call
  that a generic ceiling sized for ordinary authenticated app traffic is more headroom than a
  credential/enumeration-sensitive, **unauthenticated** endpoint should get, the same reasoning
  `common/throttle.ts` already documents for why QR guest ordering gets its own lower ceiling.
- Per-account protection here is already substantial and does not need hardening:
  `TenantAuthService`'s login path (shared by `login` and `login-owner` via one
  `authenticateAndRespond` core) has real lockout (`LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES`),
  and `requestPasswordReset`/`resetPassword` (shared by the legacy and `-owner` forgot-password
  endpoints) has an HMAC-keyed OTP, a resend cooldown (`RESET_RESEND_SECONDS`), a max-attempt
  counter (`RESET_MAX_ATTEMPTS`), an expiry (`RESET_CODE_MINUTES`), and timing-safe comparison.
  This phase does not touch any of that — it only adds the missing per-IP ceiling layer, which is
  independent of and complementary to per-account lockout (a credential-stuffing spray across many
  different restaurant codes from one IP resets no single account's lockout counter, which is
  exactly the gap a per-IP throttle closes).
- `login-owner`'s own request handling (both `restaurantCode` and `restaurantId` accepted) already
  has full e2e coverage in `test/owner-login.e2e.spec.ts`; this phase does not duplicate that
  file's assertions, only adds throttle-specific tests alongside it.

## Global Constraints

- The new throttle ceiling must be low enough to meaningfully narrow the brute-force/enumeration
  window from the generic 120/min default, but high enough that no legitimate user (an installer
  double-checking a restaurant ID, an owner retrying a mistyped password a few times) is ever
  throttled in ordinary use — this phase does not add a CAPTCHA or any other UX friction, only a
  numeric ceiling.
- Per-account lockout and OTP protections are unchanged — this phase adds a new, independent
  layer (per-IP), it does not modify `LOGIN_MAX_ATTEMPTS`, `RESET_MAX_ATTEMPTS`, or any of their
  sibling constants.
- The journey test must use real HTTP calls through the same app instance every other e2e test
  uses (`createTestApp()`), not a hand-rolled shortcut — it is meant to catch a real integration
  gap between phases, which a mocked/stubbed chain would not.
- No behavior change to any pre-Phase-1 endpoint. Phase 9 closes with a full-suite run whose only
  acceptable failures are the two already-known pre-existing unrelated ones.

## Review Focus

- A legitimate kiosk installer who mistypes a restaurant ID or activation key a handful of times
  while setting up a terminal must never hit the new throttle in realistic use — the ceiling must
  have real headroom above a human's plausible retry rate. Covered by Task 1's "stays under the
  ceiling in normal use" test.
- The new per-IP throttle and the existing per-account lockout must be visibly independent: an
  account that's already locked out must still count toward (and eventually trip) the per-IP
  ceiling, not be silently exempted from it because it's already blocked for a different reason.
  Covered by Task 1's test, which floods `login-owner` past the per-account lockout threshold and
  confirms 429s still appear once the per-IP ceiling is also crossed.
- The KIOSK add-on subscription in the journey must never grant any RESTAURANT-family app
  (`POS`, `CAPTAIN`, etc.) and the RESTAURANT plan must never grant `KIOSK`/`KIOSK_ADMIN` — the
  journey test's final "Super Admin sees it all in sync" assertion checks both subscriptions'
  entitlements independently, not just that two rows exist. Covered by Task 2.
- The forgot-password-owner round trip inside the journey must produce a login that works with
  the *new* password and no longer works with the *old* one — a reset that silently leaves the
  old password valid is a real, previously-seen class of bug in credential-reset flows. Covered
  by Task 2.

---

### Task 1: Dedicated per-IP throttle for restaurant-lookup and owner-auth endpoints

**Files:**
- Modify: `cloud/api/src/common/throttle.ts`
- Modify: `cloud/api/src/modules/restaurants/restaurant-lookup.controller.ts`
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.controller.ts`
- Test: `cloud/api/test/restaurant-lookup.e2e.spec.ts` (extend), `cloud/api/test/owner-login.e2e.spec.ts` (extend)

**Interfaces:**
- Consumes: `Throttle` from `@nestjs/throttler` (existing).
- Produces: `PUBLIC_AUTH_REQUESTS_PER_MINUTE`, `PublicAuthThrottle()` — consumed by both modified
  controllers; no other task depends on this.

- [ ] **Step 1: Write the failing tests**

Append to `cloud/api/test/restaurant-lookup.e2e.spec.ts` (inside the existing `describe` block,
after its last test):

```typescript
  it('throttles a flood of lookups from one address well below the generic 120/min default', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      statuses.push(
        (await request(app.getHttpServer()).post('/api/v1/restaurant-lookup/resolve').send({ restaurantCode: 'JM6000000001' })).status
      );
    }
    expect(statuses.some((s) => s === 429)).toBe(true);
  }, 30_000);

  it('a handful of legitimate lookups (an installer double-checking an ID) are never throttled', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await request(app.getHttpServer()).post('/api/v1/restaurant-lookup/resolve').send({ restaurantCode: 'JM9812345670' })).status);
    }
    expect(statuses.every((s) => s === 200)).toBe(true);
  });
```

Append to `cloud/api/test/owner-login.e2e.spec.ts` (inside the existing `describe` block, after
its last test — this test intentionally runs last in the file since it deliberately exhausts the
per-IP ceiling for every request this suite's `supertest` client makes):

```typescript
  it('a flood of login-owner attempts is throttled per-IP independently of the per-account lockout', async () => {
    // A fresh restaurant/owner so this test's own flood doesn't collide with the lockout test
    // above (which already locked its own restaurant's account) — the point here is the
    // per-IP ceiling, which must trip even though every one of these targets a *different*,
    // not-yet-locked account.
    const floodOwnerEmail = `owner-flood-${stamp}@example.com`;
    const create = await request(app.getHttpServer()).post('/api/v1/restaurants').set('Authorization', `Bearer ${platformToken}`).send({
      name: `TEST Owner Flood ${stamp}`, mobile: `7${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail: floodOwnerEmail
    });
    const floodRestaurantCode = create.body.restaurant.restaurantCode;
    createdRestaurantIds.push(create.body.restaurant.id);

    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      statuses.push(
        (await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode: floodRestaurantCode, password: `wrong-${i}` })).status
      );
    }
    expect(statuses.some((s) => s === 429)).toBe(true);
  }, 30_000);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/restaurant-lookup.e2e.spec.ts test/owner-login.e2e.spec.ts`
Expected: FAIL on both new tests — every response is `200`/`401` (the app-wide 120/min ceiling is
far above 25 requests), no `429` ever appears.

- [ ] **Step 3: Add the throttle constant and decorator**

In `cloud/api/src/common/throttle.ts`, append:

```typescript
/**
 * Restaurant-code lookup and owner-auth endpoints (Phase 9) are reachable with no credential at
 * all — the global 120/min/IP default is sized for ordinary authenticated app traffic, not for
 * an enumeration/brute-force-sensitive public endpoint. This is independent of, and on top of,
 * the per-account lockout TenantAuthService already enforces (see its LOGIN_MAX_ATTEMPTS/
 * RESET_MAX_ATTEMPTS) — that stops one account being brute-forced; this stops one address
 * spraying many different accounts.
 */
export const PUBLIC_AUTH_REQUESTS_PER_MINUTE = 20;

export const PublicAuthThrottle = () => Throttle({ default: { limit: PUBLIC_AUTH_REQUESTS_PER_MINUTE, ttl: 60_000 } });
```

- [ ] **Step 4: Apply the decorator**

In `cloud/api/src/modules/restaurants/restaurant-lookup.controller.ts`, add the import and
decorator:

```typescript
import { PublicAuthThrottle } from '../../common/throttle';
```

```typescript
  @Post('resolve')
  @HttpCode(200)
  @PublicAuthThrottle()
  @UsePipes(new ZodValidationPipe(resolveRestaurantCodeSchema))
  resolve(@Body() body: ResolveRestaurantCodeDto) {
    return this.restaurants.resolveByCode(body.restaurantCode);
  }
```

In `cloud/api/src/modules/tenant-auth/tenant-auth.controller.ts`, add the same import and apply
`@PublicAuthThrottle()` to three routes — `loginOwner`, `forgotPasswordOwner`, and
`resetPasswordOwner` (add the decorator line directly above each method's existing `@Post(...)`
line, e.g.:

```typescript
  @Post('login-owner')
  @HttpCode(200)
  @PublicAuthThrottle()
  @UsePipes(new ZodValidationPipe(loginOwnerSchema))
  async loginOwner(
```

— and the equivalent one-line addition for `forgot-password-owner` and `reset-password-owner`).
The legacy `login`, `forgot-password`, and `reset-password` routes are **not** touched — they stay
on the generic default, unchanged, per this phase's "no behavior change to any pre-Phase-1
endpoint" constraint.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/restaurant-lookup.e2e.spec.ts test/owner-login.e2e.spec.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 6: Run the broader auth/throttle regression suite**

Run: `cd cloud/api && npx vitest run test/tenant-auth.e2e.spec.ts test/device-sync-throttle.e2e.spec.ts test/platform-auth.e2e.spec.ts`
Expected: all pass, unchanged — the legacy login/forgot-password paths and platform-auth's own
throttle are untouched by this task.

- [ ] **Step 7: Commit**

```bash
git add cloud/api/src/common/throttle.ts cloud/api/src/modules/restaurants/restaurant-lookup.controller.ts cloud/api/src/modules/tenant-auth/tenant-auth.controller.ts cloud/api/test/restaurant-lookup.e2e.spec.ts cloud/api/test/owner-login.e2e.spec.ts
git commit -m "feat: add a dedicated per-IP throttle to restaurant-lookup and owner-auth endpoints"
```

---

### Task 2: Full spec-section-58 user journey e2e test

**Files:**
- Create: `cloud/api/test/spec-58-user-journey.e2e.spec.ts`

**Interfaces:**
- Consumes: every endpoint exercised by Phases 1–8 (restaurant creation, plan/subscription
  assignment, activation-key generation/redemption, `login-owner`, `forgot-password-owner`,
  `reset-password-owner`, restaurant detail read) — no new backend interfaces.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Write the journey test**

```typescript
// cloud/api/test/spec-58-user-journey.e2e.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email.service';

/**
 * Spec section 58's full onboarding-to-daily-use journey, chained end to end: Super Admin
 * creates a restaurant, assigns a RESTAURANT plan, separately assigns a KIOSK add-on, a Kiosk
 * terminal activates with the restaurantCode + a key, the owner logs into Kiosk Admin with just
 * restaurantCode + password, does a forgot-password round trip, and Super Admin's own read of
 * the restaurant reflects all of it. Every step here already has its own dedicated test
 * elsewhere (Phases 1-8) — this test's only job is the combination working together.
 */
describe('Spec section 58: full commercial onboarding journey (Phase 9)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-journey-admin-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const ownerEmail = `journey-owner-${stamp}@example.com`;
  const ownerPassword = 'the-owners-first-password-1';
  let platformToken: string;
  let restaurantId: string;
  let restaurantCode: string;
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const lastCode = () => /(\d{6})<\/span>/.exec(sent[sent.length - 1].html)![1];

  const platform = (method: 'get' | 'post', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
    vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (to, subject, html) => {
      sent.push({ to, subject, html });
      return true;
    });
  });

  afterAll(async () => {
    if (restaurantId) await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('walks the whole journey: onboard, dual-subscribe, activate a Kiosk, owner logs in, resets a forgotten password, and Super Admin sees it all', async () => {
    // 1. Super Admin creates the restaurant — restaurantCode is generated from the mobile number.
    const create = await platform('post', '/api/v1/restaurants').send({
      name: `TEST Journey Restaurant ${stamp}`, mobile: `9${String(stamp).slice(-9)}`, ownerName: 'Journey Owner', ownerEmail
    });
    expect(create.status).toBe(201);
    restaurantId = create.body.restaurant.id;
    restaurantCode = create.body.restaurant.restaurantCode;
    expect(restaurantCode).toMatch(/^JM[6-9][0-9]{9}$/);
    const activationToken = create.body.activationToken as string;

    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId, email: ownerEmail, activationToken, newPassword: ownerPassword
    });

    // 2. A RESTAURANT-family Pro plan, assigned first.
    const restaurantPlan = await platform('post', '/api/v1/plans').send({
      tier: 'PRO', name: `TEST Journey RESTAURANT Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {}
    });
    const restaurantSub = await platform('post', '/api/v1/subscriptions').send({
      restaurantId, planId: restaurantPlan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 365 * 86400000).toISOString()
    });
    expect(restaurantSub.status).toBe(201);

    // 3. A KIOSK-family add-on, purchased/assigned separately, concurrent with the plan above.
    const kioskPlan = await platform('post', '/api/v1/plans').send({
      tier: 'CORE', productFamily: 'KIOSK', name: `TEST Journey KIOSK Plan ${stamp}`, priceMonthly: 90000, maxBranches: 3, maxDevices: 5, maxUsers: 20, entitlements: {}
    });
    const kioskSub = await platform('post', '/api/v1/subscriptions').send({
      restaurantId, planId: kioskPlan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 365 * 86400000).toISOString()
    });
    expect(kioskSub.status).toBe(201);

    // 4. A Kiosk terminal activates: the installer resolves restaurantCode -> restaurantId first
    // (exactly what kiosk-user's Phase 8 flow does), then redeems a real activation key.
    const lookup = await request(app.getHttpServer()).post('/api/v1/restaurant-lookup/resolve').send({ restaurantCode });
    expect(lookup.status).toBe(200);
    expect(lookup.body.restaurantId).toBe(restaurantId);

    const key = await platform('post', '/api/v1/activation-keys').send({
      restaurantId, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'KIOSK' });
    expect(redeem.status).toBe(201);
    expect(redeem.body.restaurantId).toBe(restaurantId);

    // 5. Kiosk Admin: the owner logs in with just restaurantCode + password, no email.
    const login = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: ownerPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('OWNER');

    // 6. Forgot-password round trip, then the new password works and the old one doesn't.
    const forgot = await request(app.getHttpServer()).post('/api/v1/tenant-auth/forgot-password-owner').send({ restaurantCode });
    expect(forgot.status).toBe(200);
    const otp = lastCode();
    const newPassword = 'the-owners-reset-password-2';
    const reset = await request(app.getHttpServer()).post('/api/v1/tenant-auth/reset-password-owner').send({ restaurantCode, otp, newPassword });
    expect(reset.status).toBe(200);

    const loginWithNew = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: newPassword });
    expect(loginWithNew.status).toBe(200);
    const loginWithOld = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: ownerPassword });
    expect(loginWithOld.status).toBe(401);

    // 7. Super Admin's own read of the restaurant shows everything in sync: the code, both
    // active subscriptions (each granting only its own family's apps), and the redeemed device.
    const detail = await platform('get', `/api/v1/restaurants/${restaurantId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.restaurantCode).toBe(restaurantCode);
    expect(detail.body.subscriptions.filter((s: { status: string }) => s.status === 'ACTIVE')).toHaveLength(2);

    const restaurantSubApps = await platform('get', `/api/v1/subscriptions/${restaurantSub.body.id}/applications`);
    const restaurantEnabled = restaurantSubApps.body.filter((r: { enabled: boolean }) => r.enabled).map((r: { appCode: string }) => r.appCode);
    expect(restaurantEnabled).not.toContain('KIOSK');
    expect(restaurantEnabled).not.toContain('KIOSK_ADMIN');

    const kioskSubApps = await platform('get', `/api/v1/subscriptions/${kioskSub.body.id}/applications`);
    const kioskEnabled = kioskSubApps.body.filter((r: { enabled: boolean }) => r.enabled).map((r: { appCode: string }) => r.appCode);
    expect(kioskEnabled).toContain('KIOSK');
    expect(kioskEnabled).not.toContain('POS');
    expect(kioskEnabled).not.toContain('CAPTAIN');

    expect(detail.body.devices.some((d: { type: string; status: string }) => d.type === 'KIOSK' && d.status === 'ACTIVE')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd cloud/api && npx vitest run test/spec-58-user-journey.e2e.spec.ts`
Expected: PASS (1/1). If any step fails, read the failure — this test's whole point is surfacing
a real integration gap between phases; do not weaken an assertion to make it pass without first
confirming (via `systematic-debugging`) whether the gap is in the test's own expectations or in
the actual chained behavior.

- [ ] **Step 3: Commit**

```bash
git add cloud/api/test/spec-58-user-journey.e2e.spec.ts
git commit -m "test: add end-to-end spec section 58 onboarding journey (Super Admin to Kiosk Admin login)"
```

---

### Task 3: Full regression pass, typecheck, and final review

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `cd cloud/api && npx vitest run`
Expected: the same two pre-existing, unrelated failures known since Phase 5
(`test/rbac.e2e.spec.ts`'s B2-051/B2-053 test, `test/restaurant-identity-sync.e2e.spec.ts`) plus
occasional single-file flakes under full-suite concurrency (confirmed harmless in Phases 5-8 —
re-run any unexpected failure alone with `npx vitest run test/<file>.e2e.spec.ts` before treating
it as a real regression) — no new consistent failures. In particular, confirm
`test/tenant-auth.e2e.spec.ts` (the legacy email+password/UUID login and forgot-password suite)
passes unchanged — this is the concrete evidence for "every pre-existing flow still works
unchanged."

- [ ] **Step 2: Run the typecheck**

Run: `cd cloud/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Self-review the full diff**

Run: `git diff <commit before Task 1> -- cloud/api/src cloud/api/test` and read every changed
line. Confirm: `PublicAuthThrottle()` is applied only to the four routes named in Task 1 (not
accidentally to `login`/`forgot-password`/`reset-password`, which must keep the generic default);
the journey test's final assertions check both subscriptions' entitlements independently rather
than just their existence; no test in this phase weakens or removes an assertion from an earlier
phase's test file.

- [ ] **Step 4: Commit this plan document**

```bash
git add docs/superpowers/plans/2026-09-25-jamanvaar-phase9-security-hardening-e2e.md
git commit -m "docs: add Phase 9 (security hardening + E2E journey test) plan"
```

- [ ] **Step 5: Push**

```bash
git push origin main
```

This is the final phase of the JAMANVAAR commercial platform redesign (Phases 1-9). After this
push, the master plan's full phase index is complete.
