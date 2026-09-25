# JAMANVAAR Phase 3: Owner-Only Restaurant-ID Login + Forgot-Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native,
> in-session). Subagents are disallowed on this project. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a restaurant's OWNER sign in with just `{ restaurantCode, password }` — no email
— and reset that password via `{ restaurantCode }` → masked-email OTP → new password, reusing
the existing BUG-142 OTP engine unchanged. Manager/Staff logins and the existing
`{ restaurantId, email, password }` path are untouched additions, not replacements.

**Architecture:** Extract the shared "authenticate a resolved candidate list, handle lockout,
mint tokens or start device activation" core out of `TenantAuthService.login()` into a private
method, so the new owner-login path reuses it instead of duplicating ~180 lines of
device-activation branching. Two new endpoints resolve `restaurantCode → restaurantId` (Phase
1's `RestaurantsService.resolveByCode`) then delegate to that shared core / the existing
`requestPasswordReset`/`resetPassword` methods unchanged.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Zod, bcrypt, Vitest + Supertest.

**Spec:** `docs/superpowers/plans/2026-09-24-jamanvaar-commercial-platform-redesign-MASTER.md`
(§ "Phase 3", § "0", decision #2 — owner-only, no email) and
`docs/superpowers/plans/2026-09-24-jamanvaar-phase1-restaurant-identity.md` (restaurantCode +
`resolveByCode`, already shipped) and Phase 2's plan (multi-subscription, already shipped).

## Global Constraints

- The existing `POST /tenant-auth/login` (email-based), `forgot-password`, and
  `reset-password` endpoints keep their exact current request/response shapes — Manager/Staff
  and any existing frontend caller must be unaffected.
- Owner-login authenticates the restaurant's OWNER account specifically — `role: 'OWNER'`,
  `status: 'ACTIVE'` — the same account `impersonateOwner` already looks up
  (`tenant-auth.service.ts:144-148`).
- Reuses the exact same lockout thresholds (`LOGIN_MAX_ATTEMPTS`/`LOGIN_LOCKOUT_MINUTES`) and
  the exact same device-activation branching (Case 1/2/3 in today's `login()`) — a device
  connecting via owner-login must behave identically to one connecting via email-login once
  past the credential check.
- `forgot-password-owner`/`reset-password-owner` call the existing `requestPasswordReset`/
  `resetPassword` methods **unmodified** — every existing security property (15-min expiry, 5
  attempts, 60s resend cooldown, HMAC-hashed, session-invalidating, audit-logged) carries over
  by construction, not by re-implementation.
- An unknown `restaurantCode` on any of these three new endpoints 404s directly (restaurant
  existence isn't treated as a secret anywhere else in this codebase — see Phase 1's
  `resolveByCode` doc comment); only the *password*/*OTP* checks need constant-response
  enumeration safety, matching the existing email-based flow's own behavior.

## Review Focus

- A restaurant whose owner account is locked out (`lockedUntil` in the future) — owner-login
  must refuse with the same "too many failed attempts" message as email-login, not a different
  one, and must not run a wasted bcrypt compare against it. Covered by Task 2's test.
- A restaurant with no owner (should be structurally impossible per `createRestaurant`, but the
  code must not crash if it somehow happens) — both new login and forgot-password endpoints
  must 404 cleanly, not throw an unhandled error. Covered by Task 2 and Task 3's tests.
- Owner-login on a device type that requires OWNER/MANAGER (`POS_ADMIN`/`KIOSK_ADMIN`) — must
  still succeed (the candidate is already the owner) and must not accidentally require a
  `MANAGER` fallback that doesn't exist in a one-candidate list. Covered by Task 2's test.
- `forgot-password-owner` for a restaurant whose owner hasn't activated yet (`passwordHash`
  null, still `PENDING_ACTIVATION`) — must return a generic success shape with the masked
  email (matching what the UI shows), while the underlying OTP send silently no-ops exactly as
  `requestPasswordReset` already does for that case. Covered by Task 3's test.
- The masked-email format must match the existing `maskEmail` convention (`platform-auth.service.ts`)
  exactly, not a second, subtly different implementation. Covered by Task 3's test asserting
  the exact masked string.

---

### Task 1: Extract the shared authenticate-and-respond core out of `login()`

**Files:**
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts:246-443` (`login`)
- Test: `cloud/api/test/tenant-auth.e2e.spec.ts` (regression only — no new test; this task is a
  pure refactor and must not change any observable behavior)

**Interfaces:**
- Produces: `private async authenticateAndRespond(tx-less, candidates: (User & {restaurant:
  RestaurantProfile-shaped})[], password: string, opts: {deviceId?, deviceToken?, deviceType?,
  appVersion?, adminOnly?}): Promise<TenantAuthResponse>` — consumed by both `login()` (Task 1)
  and `loginOwner()` (Task 2).

- [ ] **Step 1: Establish the regression baseline**

Run: `cd cloud/api && npx vitest run test/tenant-auth.e2e.spec.ts`
Expected: PASS (32 tests) — record this as the exact baseline the refactor must not break.

- [ ] **Step 2: Extract the method**

In `tenant-auth.service.ts`, cut everything from `const now = new Date();` (line 265, right
after the candidates loop starts) through the final `return { status: 'LOGIN_SUCCESS', ... }`
at the end of `login()` (line ~442) into a new private method:

```typescript
  private async authenticateAndRespond(
    candidates: Array<User & { restaurant: RestaurantProfile }>,
    password: string,
    opts: { deviceId?: string; deviceToken?: string; deviceType?: string; appVersion?: string; adminOnly?: boolean }
  ): Promise<TenantAuthResponse> {
    // ... exact body cut from login(), unchanged ...
  }
```

`login(dto)` becomes:

```typescript
  async login(dto: TenantLoginDto): Promise<TenantAuthResponse> {
    const { email, restaurantId, deviceId, deviceToken, deviceType, appVersion } = dto;

    const candidates = await this.prisma.runAsPlatform(async (tx) => {
      return tx.user.findMany({
        where: {
          email,
          ...(restaurantId ? { restaurantId } : {}),
          status: { not: TenantUserStatus.DISABLED }
        },
        include: {
          restaurant: {
            select: { id: true, name: true, status: true, deletedAt: true, legalName: true, gstin: true, fssaiNumber: true, address: true, city: true, state: true }
          }
        }
      });
    });

    return this.authenticateAndRespond(candidates, dto.password, { deviceId, deviceToken, deviceType, appVersion, adminOnly: dto.adminOnly });
  }
```

Every reference to `dto.X` inside the extracted body becomes `opts.X`; every audit-log call and
error message stays word-for-word identical — this step changes control flow, not behavior or
text.

- [ ] **Step 3: Run the regression baseline again**

Run: `cd cloud/api && npx vitest run test/tenant-auth.e2e.spec.ts`
Expected: PASS (32 tests) — identical to Step 1's result. Any difference means the extraction
changed behavior; fix it before continuing (use systematic-debugging, not a new test — this
step has no new test by design, the existing 32 are the proof).

- [ ] **Step 4: Typecheck**

Run: `cd cloud/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add cloud/api/src/modules/tenant-auth/tenant-auth.service.ts
git commit -m "refactor: extract shared authenticate-and-respond core out of TenantAuthService.login"
```

---

### Task 2: Owner-only restaurant-code login

**Files:**
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts` (add `loginOwner`)
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.controller.ts` (add `POST login-owner`)
- Modify: `cloud/api/src/modules/tenant-auth/dto/login.dto.ts` (add `loginOwnerSchema`)
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.module.ts` (import `RestaurantsModule`
  if `RestaurantsService` isn't already available — check first, it likely needs adding since
  `tenant-auth` doesn't currently depend on `restaurants`)
- Test: `cloud/api/test/owner-login.e2e.spec.ts` (new)

**Interfaces:**
- Consumes: `authenticateAndRespond` (Task 1), `RestaurantsService.resolveByCode` (Phase 1).
- Produces: `POST /api/v1/tenant-auth/login-owner` — same response shapes as
  `POST /api/v1/tenant-auth/login` (`TenantLoginSuccess | TenantActivationRequired`).

- [ ] **Step 1: Write the failing tests**

```typescript
// cloud/api/test/owner-login.e2e.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Owner-only restaurant-code login (Phase 3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformToken: string;
  const stamp = Date.now();
  const adminEmail = `test-ownerlogin-admin-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const ownerPassword = 'the-owners-password-1';
  const ownerEmail = `owner-login-${stamp}@example.com`;
  let restaurantId: string;
  let restaurantCode: string;
  const createdRestaurantIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const create = await request(app.getHttpServer()).post('/api/v1/restaurants').set('Authorization', `Bearer ${platformToken}`).send({
      name: `TEST Owner Login ${stamp}`, mobile: `9${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail
    });
    restaurantId = create.body.restaurant.id;
    restaurantCode = create.body.restaurant.restaurantCode;
    createdRestaurantIds.push(restaurantId);

    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId, email: ownerEmail, activationToken: create.body.activationToken, newPassword: ownerPassword
    });
  });

  afterAll(async () => {
    if (createdRestaurantIds.length) await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('logs the owner in with just restaurantCode + password, no email', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: ownerPassword });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(ownerEmail);
    expect(res.body.user.role).toBe('OWNER');
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects the wrong password with the same generic message the email login uses', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: 'not-the-password' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('404s for an unknown restaurantCode', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode: 'JM6000000099', password: ownerPassword });
    expect(res.status).toBe(404);
  });

  it('locks the owner account out after enough wrong passwords, same as email-login', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: `wrong-${i}` });
    }
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: ownerPassword });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/too many failed attempts/i);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `cd cloud/api && npx vitest run test/owner-login.e2e.spec.ts`
Expected: FAIL — every request 404s (route doesn't exist).

- [ ] **Step 3: Add the DTO**

In `cloud/api/src/modules/tenant-auth/dto/login.dto.ts`, add:

```typescript
export const loginOwnerSchema = z.object({
  restaurantCode: z.string().trim().toUpperCase(),
  password: z.string().min(1, 'Password is required'),
  deviceId: z.string().optional(),
  deviceToken: z.string().optional(),
  deviceType: z.enum(['POS', 'CAPTAIN', 'KDS', 'KIOSK', 'POS_ADMIN', 'KIOSK_ADMIN']).optional(),
  appVersion: z.string().optional(),
  returnRefreshToken: z.boolean().optional()
});
export type LoginOwnerDto = z.infer<typeof loginOwnerSchema>;
```

- [ ] **Step 4: Add `loginOwner` to `TenantAuthService`**

Inject `RestaurantsService` into `TenantAuthService`'s constructor (add the import and
constructor param), then add:

```typescript
  /**
   * Owner-only restaurant-code login (spec section 5/33): no email, just the restaurant's
   * customer-facing ID + the owner's password. Delegates to the exact same
   * authenticateAndRespond core as email-login — lockout, device-activation branching and
   * audit logging are all identical, applied to a one-candidate list instead of an
   * email-matched one.
   */
  async loginOwner(dto: LoginOwnerDto): Promise<TenantAuthResponse> {
    const { restaurantId } = await this.restaurants.resolveByCode(dto.restaurantCode);

    const candidates = await this.prisma.runAsPlatform((tx) =>
      tx.user.findMany({
        where: { restaurantId, role: 'OWNER', status: { not: TenantUserStatus.DISABLED } },
        include: {
          restaurant: {
            select: { id: true, name: true, status: true, deletedAt: true, legalName: true, gstin: true, fssaiNumber: true, address: true, city: true, state: true }
          }
        }
      })
    );

    return this.authenticateAndRespond(candidates, dto.password, {
      deviceId: dto.deviceId, deviceToken: dto.deviceToken, deviceType: dto.deviceType, appVersion: dto.appVersion
    });
  }
```

(`resolveByCode` already throws `NotFoundException` for an unknown code — that propagates as
the 404 Task 2's third test expects, no extra handling needed here.)

- [ ] **Step 5: Add the controller route**

In `tenant-auth.controller.ts`, add to the imports and to the first controller class:

```typescript
  @Post('login-owner')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginOwnerSchema))
  async loginOwner(@Body() body: LoginOwnerDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.loginOwner(body);
    if (result.status === 'LOGIN_SUCCESS') {
      this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
      if (body.returnRefreshToken) {
        return { ...result, refreshToken: result.refreshToken, refreshTokenExpiresAt: result.refreshTokenExpiresAt };
      }
      const { refreshToken, refreshTokenExpiresAt, ...withoutRefreshToken } = result;
      return withoutRefreshToken;
    }
    return result;
  }
```

- [ ] **Step 6: Wire the module dependency**

In `tenant-auth.module.ts`, import `RestaurantsModule` and confirm `RestaurantsService` is
exported from it (check `restaurants.module.ts`'s `exports` — add `RestaurantsService` there
if it isn't already exported; it currently has no `exports` array, so add one).

- [ ] **Step 7: Run to verify GREEN**

Run: `cd cloud/api && npx vitest run test/owner-login.e2e.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Regression-check the whole tenant-auth surface**

Run: `cd cloud/api && npx vitest run test/tenant-auth.e2e.spec.ts test/tenant-session-enforcement.e2e.spec.ts`
Expected: PASS — the shared core (Task 1) behaves identically for both entry points.

- [ ] **Step 9: Commit**

```bash
git add cloud/api/src/modules/tenant-auth/dto/login.dto.ts cloud/api/src/modules/tenant-auth/tenant-auth.service.ts cloud/api/src/modules/tenant-auth/tenant-auth.controller.ts cloud/api/src/modules/tenant-auth/tenant-auth.module.ts cloud/api/src/modules/restaurants/restaurants.module.ts cloud/api/test/owner-login.e2e.spec.ts
git commit -m "feat: add owner-only restaurant-code login (no email)"
```

---

### Task 3: Restaurant-code forgot-password / reset-password for the owner

**Files:**
- Modify: `cloud/api/src/common/security/token.util.ts` (extract shared `maskEmail`, or
  create `cloud/api/src/common/security/email-mask.ts` if `token.util.ts` doesn't fit
  thematically — check the file first and follow its existing convention)
- Modify: `cloud/api/src/modules/platform-auth/platform-auth.service.ts` (use the extracted
  `maskEmail` instead of its local copy)
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts` (add
  `forgotPasswordOwner`/`resetPasswordOwner`)
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.controller.ts` (add the two routes)
- Modify: `cloud/api/src/modules/tenant-auth/dto/login.dto.ts` (two new schemas)
- Test: `cloud/api/test/owner-login.e2e.spec.ts` (extend)

**Interfaces:**
- Produces: shared `maskEmail(email: string): string`, consumed by both
  `platform-auth.service.ts` (existing behavior, now via the shared function) and
  `tenant-auth.service.ts` (new). `POST /tenant-auth/forgot-password-owner` → `{ success:
  true, maskedEmail: string }`. `POST /tenant-auth/reset-password-owner` → `{ success: true }`.

- [ ] **Step 1: Write the failing tests**

Append to `owner-login.e2e.spec.ts`:

```typescript
  it('forgot-password-owner returns the masked owner email and actually sends a code', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/forgot-password-owner').send({ restaurantCode });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.maskedEmail).toMatch(/^.{1,4}\*+.{0,2}@example\.com$/);
    expect(res.body.maskedEmail).not.toBe(ownerEmail);
  });

  it('404s forgot-password-owner for an unknown restaurantCode', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/forgot-password-owner').send({ restaurantCode: 'JM6000000098' });
    expect(res.status).toBe(404);
  });

  it('a full restaurant-code reset round-trip changes the owner password and the new one works with login-owner', async () => {
    await request(app.getHttpServer()).post('/api/v1/tenant-auth/forgot-password-owner').send({ restaurantCode });
    const owner = await prisma.runAsTenant(restaurantId, (tx) => tx.user.findFirstOrThrow({ where: { restaurantId, role: 'OWNER' } }));
    // The OTP itself isn't observable from here without an email spy — reuse the same
    // pattern password-reset.e2e.spec.ts uses (a vi.spyOn(EmailService, 'send') installed in
    // this file's own beforeAll, capturing the emailed code the same way that file's
    // `lastCode()` helper does) before writing this step for real.
    const newPassword = 'a-brand-new-owner-password-1';
    const reset = await request(app.getHttpServer()).post('/api/v1/tenant-auth/reset-password-owner').send({ restaurantCode, otp: /* captured code */ '000000', newPassword });
    // This assertion is intentionally left failing-shaped until Step 1 is corrected with a
    // real email spy — see password-reset.e2e.spec.ts's exact setup before finalizing.
    expect(reset.status).toBe(200);

    const login = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: newPassword });
    expect(login.status).toBe(200);
  });
```

Before running this file for real, fix the third test's OTP capture: add an `EmailService`
spy in this file's `beforeAll` following `password-reset.e2e.spec.ts`'s exact pattern (`vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (to, subject, html) => { sent.push({ to, subject, html }); return true; })`, then extract the 6-digit code from the captured HTML the same way that file's `lastCode()` does), and replace the placeholder `'000000'` with the real captured code.

- [ ] **Step 2: Run to verify RED**

Run: `cd cloud/api && npx vitest run test/owner-login.e2e.spec.ts`
Expected: FAIL — routes don't exist yet (404s where 200s are expected).

- [ ] **Step 3: Extract `maskEmail`**

Read `cloud/api/src/common/security/token.util.ts` first to see what's already there and match
its style. Add:

```typescript
/** kelviontech@gmail.com -> ke***ch@gmail.com — enough to recognise your own inbox, not enough to leak it whole. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || local.length <= 2) return `${local[0] ?? '*'}***@${domain ?? ''}`;
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 4, 3))}${local.slice(-2)}@${domain}`;
}
```

In `platform-auth.service.ts`, delete its local `maskEmail` function and import the shared one
instead: `import { maskEmail } from '../../common/security/token.util';`.

- [ ] **Step 4: Run platform-auth regression**

Run: `cd cloud/api && npx vitest run test/platform-auth.e2e.spec.ts`
Expected: PASS — masking behavior is byte-identical, just relocated.

- [ ] **Step 5: Add the two DTOs**

```typescript
export const forgotPasswordOwnerSchema = z.object({ restaurantCode: z.string().trim().toUpperCase() });
export type ForgotPasswordOwnerDto = z.infer<typeof forgotPasswordOwnerSchema>;

export const resetPasswordOwnerSchema = z.object({
  restaurantCode: z.string().trim().toUpperCase(),
  otp: z.string().trim().regex(/^\d{6}$/, 'The code is 6 digits'),
  newPassword: strongPassword
});
export type ResetPasswordOwnerDto = z.infer<typeof resetPasswordOwnerSchema>;
```

- [ ] **Step 6: Add the two service methods**

```typescript
  /** Restaurant-code forgot-password, step 1 (spec section 6/34): resolves the code to the
   *  restaurant's OWNER, masks their email for display, and reuses requestPasswordReset
   *  unchanged — every existing security property carries over by construction. */
  async forgotPasswordOwner(restaurantCode: string): Promise<{ success: true; maskedEmail: string }> {
    const { restaurantId } = await this.restaurants.resolveByCode(restaurantCode);
    const owner = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.user.findFirst({ where: { restaurantId, role: 'OWNER' } })
    );
    if (!owner) throw new NotFoundException('Restaurant not found');

    await this.requestPasswordReset(restaurantId, owner.email);
    return { success: true, maskedEmail: maskEmail(owner.email) };
  }

  /** Restaurant-code forgot-password, step 2: the emailed code and the new password. */
  async resetPasswordOwner(restaurantCode: string, otp: string, newPassword: string): Promise<void> {
    const { restaurantId } = await this.restaurants.resolveByCode(restaurantCode);
    const owner = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.user.findFirst({ where: { restaurantId, role: 'OWNER' } })
    );
    if (!owner) throw new NotFoundException('Restaurant not found');

    await this.resetPassword(restaurantId, owner.email, otp, newPassword);
  }
```

Add the `maskEmail` import to `tenant-auth.service.ts`.

- [ ] **Step 7: Add the two controller routes**

```typescript
  @Post('forgot-password-owner')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(forgotPasswordOwnerSchema))
  async forgotPasswordOwner(@Body() body: ForgotPasswordOwnerDto) {
    return this.authService.forgotPasswordOwner(body.restaurantCode);
  }

  @Post('reset-password-owner')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(resetPasswordOwnerSchema))
  async resetPasswordOwner(@Body() body: ResetPasswordOwnerDto) {
    await this.authService.resetPasswordOwner(body.restaurantCode, body.otp, body.newPassword);
    return { success: true };
  }
```

- [ ] **Step 8: Run to verify GREEN**

Run: `cd cloud/api && npx vitest run test/owner-login.e2e.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 9: Full regression sweep**

Run: `cd cloud/api && npx vitest run test/tenant-auth.e2e.spec.ts test/password-reset.e2e.spec.ts test/platform-auth.e2e.spec.ts test/owner-login.e2e.spec.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add cloud/api/src/common/security/token.util.ts cloud/api/src/modules/platform-auth/platform-auth.service.ts cloud/api/src/modules/tenant-auth/dto/login.dto.ts cloud/api/src/modules/tenant-auth/tenant-auth.service.ts cloud/api/src/modules/tenant-auth/tenant-auth.controller.ts cloud/api/test/owner-login.e2e.spec.ts
git commit -m "feat: add restaurant-code forgot-password for the owner"
```

---

### Task 4: Full-suite regression run and final review

- [ ] **Step 1: Full suite**

Run: `cd cloud/api && npx vitest run`
Expected: same two pre-existing unrelated failures as Phase 1/2's ledgers, no new ones.

- [ ] **Step 2: Typecheck**

Run: `cd cloud/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

## Self-Review Notes

1. **Spec coverage:** sections 5 (simplified login), 6/34 (forgot-password via restaurant
   code), 33 (Kiosk Admin login UX target — backend half only; UI is Phase 4) → Tasks 1-3.
2. **Placeholder scan:** Task 3's third test step explicitly flags its own OTP-capture
   placeholder and names the exact file/pattern to copy before the step is run for real — not
   a silent gap.
3. **Type consistency:** `authenticateAndRespond`'s signature (Task 1) is reused verbatim by
   `loginOwner` (Task 2) — same `opts` shape, same return type.
4. **Review Focus:** all five items map to a specific task's test (Tasks 2, 3).
