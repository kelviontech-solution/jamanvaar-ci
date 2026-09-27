# Cashfree Integration Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (this project's standing instruction is direct/native execution, no subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every remaining gap identified after the commission/split work: security hardening (fix two known minors, verify RBAC boundaries, add step-up re-authentication for high-risk payment actions), a reconciliation job against Cashfree's own settlement records, a Super Admin platform-wide payments dashboard, and revenue views for Kiosk Admin and Restaurant Admin — then document the whole system.

**Architecture:** All backend work stays inside the existing `cloud/api/src/modules/payments/` module and reuses two pieces of already-existing infrastructure discovered during design: the platform-wide RBAC table (`common/rbac/access.ts`, enforced in `PlatformAuthGuard`) and the scheduled-job runner (`modules/jobs/jobs.service.ts`). Frontend work extends three already-existing pages/apps (Super Admin's Payment Connections page + a new platform-wide dashboard page, Kiosk Admin's Payment Gateway settings, `pos-admin`'s Reports dashboard) rather than building new ones from scratch.

**Tech Stack:** NestJS + Prisma + Zod (backend), Vitest + Supertest (e2e), React + TypeScript (three frontends, all manually verified — none has a test runner).

**Spec:** `docs/superpowers/specs/2026-09-28-cashfree-completion-design.md` (and the prior `docs/superpowers/specs/2026-09-27-cashfree-commission-split-design.md` for context on what already exists)

## Global Constraints

- No new RBAC roles/tables — the existing six `PlatformRoleName` values and `ROLE_ACCESS` table are sufficient; only tests are added to prove the new routes respect them.
- No new cron/scheduling infrastructure — reconciliation is one more entry in `JobsService`'s existing `jobs` getter and constructor, following the exact pattern `backups`/`invoices` already use.
- A reconciliation mismatch is recorded as a durable `ReconciliationException` row; nothing about an existing `PaymentTransaction` is ever auto-corrected.
- Step-up (password re-entry) is required for: connection `approve`/`suspend`/`disconnect`, and both commission-set endpoints (platform default, restaurant override). It is deliberately NOT required for `reactivate` or `refresh-status` (see spec's Part A3 rationale) — a task's tests must prove both the covered and the deliberately-uncovered actions behave correctly.
- `pos-admin` has no tenant-session auth layer (device-only, `DeviceAuthGuard`) — the shared Kiosk-Admin/Restaurant-Admin revenue endpoint must use `DeviceAuthGuard` with a `KIOSK_ADMIN`/`POS_ADMIN` allow-list, never `TenantAuthGuard`.
- Every new backend behavior gets a real e2e test against the actual test Postgres database (no mocked Prisma) — matching this module's existing convention throughout.
- The full regression suite (`cd cloud/api && npx vitest run`, and the root `npx vitest run`) must stay green after every task.

## Review Focus

- A `READ_ONLY` or `SUPPORT_ADMIN`/`PLATFORM_OPS` platform user must not be able to mutate anything in the payments module even though `PlatformAuthGuard` alone would let them authenticate — this is exactly what the existing RBAC table is supposed to prevent, and it must be proven for the routes added in the *prior* sub-project (commission-config, commission-override), not just assumed. Pinned in Task 2.
- Step-up password must be checked against the real bcrypt hash of the *acting* platform user, not any hardcoded/test value, and a wrong password must fail exactly like a missing one — a shortcut that special-cases "empty password = skip check" would silently disable the feature for any caller that omits the field. Pinned in Task 3.
- The reconciliation job must not create a second `OPEN` exception of the same type for a payment that already has one from a prior run — otherwise every 15-minute tick would pile up duplicate noise for a still-unresolved issue. Pinned in Task 6.
- The platform-wide payments summary must return zeroed aggregates (not throw, not `NaN`, not `null` arithmetic) for a filter combination that matches zero rows — e.g. a brand-new restaurant with no payments yet. Pinned in Task 8.
- The shared Kiosk-Admin/Restaurant-Admin revenue endpoint must reject a `KIOSK` or `POS` (non-admin) device token — only `KIOSK_ADMIN`/`POS_ADMIN` may read it, matching the principle that a customer-facing or cashier-facing terminal has no business seeing restaurant-wide revenue totals. Pinned in Task 10.

---

### Task 1: Security minors — commission override range check + frontend save-before-load guard

**Files:**
- Modify: `cloud/api/src/modules/payments/payment-connections.service.ts`
- Modify: `cloud/super-admin-web/src/pages/PaymentConnections/PaymentConnectionsListPage.tsx`
- Test: `cloud/api/test/payment-connections.e2e.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `cloud/api/test/payment-connections.e2e.spec.ts`, alongside the existing `PATCH .../commission` tests:

```typescript
  it('setCommissionOverride still rejects out-of-range values even if a future caller skips the Zod pipe (service-level defense in depth)', async () => {
    const service = app.get(PaymentConnectionsService);
    await expect(service.setCommissionOverride(restaurantId, 10001, { id: 'fake-actor' } as never)).rejects.toThrow();
    await expect(service.setCommissionOverride(restaurantId, -1, { id: 'fake-actor' } as never)).rejects.toThrow();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/payment-connections.e2e.spec.ts`
Expected: FAIL — `setCommissionOverride` currently has no range check, so calling it directly with `10001` does not throw.

- [ ] **Step 3: Implement**

In `cloud/api/src/modules/payments/payment-connections.service.ts`, add the range check as the first line of `setCommissionOverride` (reuse the `BadRequestException` import already used elsewhere in this file's sibling `PlatformPaymentsService`, but import it fresh here since this file doesn't yet import it):

```typescript
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
// ...
  async setCommissionOverride(restaurantId: string, overrideBps: number | null, actor: PlatformUser) {
    if (overrideBps !== null && (!Number.isInteger(overrideBps) || overrideBps < 0 || overrideBps > 10000)) {
      throw new BadRequestException('overrideBps must be null or an integer between 0 and 10000');
    }
    return this.prisma.runAsPlatform(async (tx) => {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/payment-connections.e2e.spec.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Fix the frontend save-before-load window**

In `cloud/super-admin-web/src/pages/PaymentConnections/PaymentConnectionsListPage.tsx`, add a `defaultLoaded` boolean alongside the existing `defaultBps`/`defaultBpsInput` state:

```typescript
  const [defaultLoaded, setDefaultLoaded] = useState(false);
```

In the existing `useEffect` that fetches `/api/v1/payments/commission-config`, set it once the fetch resolves:

```typescript
  useEffect(() => {
    api.get<{ defaultBps: number }>('/api/v1/payments/commission-config').then((d) => {
      setDefaultBps(d.defaultBps);
      setDefaultBpsInput(String(d.defaultBps / 100));
      setDefaultLoaded(true);
    }).catch(() => {});
  }, []);
```

Disable the Save button until it's true:

```tsx
          <Button size="sm" variant="ghost" disabled={savingDefault || !defaultLoaded} onClick={handleSaveDefaultCommission}>Save</Button>
```

- [ ] **Step 6: Typecheck the frontend**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add cloud/api/src/modules/payments/payment-connections.service.ts cloud/api/test/payment-connections.e2e.spec.ts cloud/super-admin-web/src/pages/PaymentConnections/PaymentConnectionsListPage.tsx
git commit -m "fix(payments): add commission-override range check; disable default-commission Save until loaded"
```

---

### Task 2: RBAC boundary tests for commission routes

**Files:**
- Test: `cloud/api/test/platform-payments.e2e.spec.ts`
- Test: `cloud/api/test/payment-connections.e2e.spec.ts`

**Interfaces:**
- Consumes: `createTestPlatformUser(prisma, { email, password, role })` (`test/helpers.ts`, already accepts any of the six `PlatformRoleName` values).

- [ ] **Step 1: Write the tests (these should pass immediately — this task proves existing behavior, not new code)**

Add to `cloud/api/test/platform-payments.e2e.spec.ts`, near the other commission-config tests:

```typescript
  it('a FINANCE_ADMIN can read and write commission config (billing: write)', async () => {
    const email = `test-platpay-finance-${Date.now()}@example.com`;
    await createTestPlatformUser(prisma, { email, password: 'correct-horse-battery-staple', role: 'FINANCE_ADMIN' });
    const loginRes = await platformLogin(app, email, 'correct-horse-battery-staple');
    const token = loginRes.body.accessToken;

    const getRes = await authed('get', '/api/v1/payments/commission-config', token);
    expect(getRes.status).toBe(200);
    const patchRes = await authed('patch', '/api/v1/payments/commission-config', token).send({ defaultBps: 100 });
    expect(patchRes.status).toBe(200);

    await prisma.platformUser.deleteMany({ where: { email } });
  });

  it('a READ_ONLY user can read but not write commission config (billing: read)', async () => {
    const email = `test-platpay-readonly-${Date.now()}@example.com`;
    await createTestPlatformUser(prisma, { email, password: 'correct-horse-battery-staple', role: 'READ_ONLY' });
    const loginRes = await platformLogin(app, email, 'correct-horse-battery-staple');
    const token = loginRes.body.accessToken;

    const getRes = await authed('get', '/api/v1/payments/commission-config', token);
    expect(getRes.status).toBe(200);
    const patchRes = await authed('patch', '/api/v1/payments/commission-config', token).send({ defaultBps: 100 });
    expect(patchRes.status).toBe(403);

    await prisma.platformUser.deleteMany({ where: { email } });
  });

  it('a SUPPORT_ADMIN has no billing area access at all, not even read', async () => {
    const email = `test-platpay-support-${Date.now()}@example.com`;
    await createTestPlatformUser(prisma, { email, password: 'correct-horse-battery-staple', role: 'SUPPORT_ADMIN' });
    const loginRes = await platformLogin(app, email, 'correct-horse-battery-staple');
    const token = loginRes.body.accessToken;

    const getRes = await authed('get', '/api/v1/payments/commission-config', token);
    expect(getRes.status).toBe(403);

    await prisma.platformUser.deleteMany({ where: { email } });
  });
```

Add the equivalent trio to `cloud/api/test/payment-connections.e2e.spec.ts` for `PATCH /api/v1/restaurants/:id/payment-connection/commission` (same three roles, same expected status codes, cleaning up each throwaway platform user).

Both files' top imports need `createTestPlatformUser` and `platformLogin` — already imported in both (confirmed: both files already import these from `./helpers` for their existing `beforeAll` setup).

- [ ] **Step 2: Run the tests**

Run: `cd cloud/api && npx vitest run test/platform-payments.e2e.spec.ts test/payment-connections.e2e.spec.ts`
Expected: PASS immediately — this task adds no production code, only proves `PlatformAuthGuard`'s existing `canAccess`/`areaForPath` machinery already does the right thing for these routes. If any of these fail, stop and treat it as a real, previously-undetected RBAC gap (systematic-debugging, not a plan-wrong ruling) before continuing to any later task.

- [ ] **Step 3: Commit**

```bash
git add cloud/api/test/platform-payments.e2e.spec.ts cloud/api/test/payment-connections.e2e.spec.ts
git commit -m "test(payments): prove existing RBAC (FINANCE_ADMIN/READ_ONLY/SUPPORT_ADMIN) covers the commission routes"
```

---

### Task 3: Step-up authentication backend

**Files:**
- Create: `cloud/api/src/common/security/step-up.util.ts`
- Test: `cloud/api/src/common/security/step-up.util.spec.ts`
- Modify: `cloud/api/src/modules/payments/dto/commission-config.dto.ts`
- Modify: `cloud/api/src/modules/payments/payment-connections.service.ts`
- Modify: `cloud/api/src/modules/payments/platform-payments.service.ts`
- Modify: `cloud/api/src/modules/payments/platform-payment-connections.controller.ts`
- Modify: `cloud/api/src/modules/payments/platform-payments.controller.ts`
- Test: `cloud/api/test/payment-connections.e2e.spec.ts`
- Test: `cloud/api/test/platform-payments.e2e.spec.ts`

**Interfaces:**
- Produces: `requireStepUpPassword(actor: PlatformUser, password: string | undefined): Promise<void>` (throws `ForbiddenException` on failure) — consumed by every method below.

- [ ] **Step 1: Write the failing unit test**

Create `cloud/api/src/common/security/step-up.util.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { requireStepUpPassword } from './step-up.util';

const actor = { id: 'u1', passwordHash: bcrypt.hashSync('correct-horse', 4) } as never;

describe('requireStepUpPassword', () => {
  it('resolves when the password matches the actor\'s real hash', async () => {
    await expect(requireStepUpPassword(actor, 'correct-horse')).resolves.toBeUndefined();
  });

  it('throws ForbiddenException when the password is wrong', async () => {
    await expect(requireStepUpPassword(actor, 'wrong-password')).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when the password is missing', async () => {
    await expect(requireStepUpPassword(actor, undefined)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when the actor has no password hash set', async () => {
    await expect(requireStepUpPassword({ id: 'u2', passwordHash: null } as never, 'anything')).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run src/common/security/step-up.util.spec.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `step-up.util.ts`**

```typescript
import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PlatformUser } from '@prisma/client';

/**
 * A handful of payment actions (approving/suspending/disconnecting a
 * restaurant's Cashfree connection, changing platform or per-restaurant
 * commission) require the acting platform user to re-enter their own
 * password, on top of the RBAC check PlatformAuthGuard already performed.
 * Reuses the same bcrypt comparison platform-auth.service.ts's login flow
 * already uses — no new credential mechanism.
 */
export async function requireStepUpPassword(actor: Pick<PlatformUser, 'id' | 'passwordHash'>, password: string | undefined): Promise<void> {
  if (!password || !actor.passwordHash || !(await bcrypt.compare(password, actor.passwordHash))) {
    throw new ForbiddenException('Re-enter your password to confirm this action');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run src/common/security/step-up.util.spec.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Add `password` to the commission DTOs**

In `cloud/api/src/modules/payments/dto/commission-config.dto.ts`:

```typescript
import { z } from 'zod';

export const setCommissionConfigSchema = z.object({
  defaultBps: z.number().int().min(0).max(10000),
  password: z.string().min(1)
});
export type SetCommissionConfigDto = z.infer<typeof setCommissionConfigSchema>;

export const setCommissionOverrideSchema = z.object({
  overrideBps: z.number().int().min(0).max(10000).nullable(),
  password: z.string().min(1)
});
export type SetCommissionOverrideDto = z.infer<typeof setCommissionOverrideSchema>;

export const stepUpPasswordSchema = z.object({
  password: z.string().min(1)
});
export type StepUpPasswordDto = z.infer<typeof stepUpPasswordSchema>;
```

- [ ] **Step 6: Write the failing e2e tests for the wired-in checks**

Add to `cloud/api/test/payment-connections.e2e.spec.ts` (needs the real platform admin's known password, already in scope as `adminPassword` from this file's `beforeAll`):

```typescript
  it('approve requires the correct step-up password', async () => {
    // Reuses the shared restaurantId's connection, already PENDING_VERIFICATION-eligible at this point in the file's state machine — if not, resubmit first.
    await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    const wrongPw = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/approve`, platformToken).send({ password: 'totally-wrong' });
    expect(wrongPw.status).toBe(403);
    const noPw = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/approve`, platformToken).send({});
    expect(noPw.status).toBe(403);
    const rightPw = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/approve`, platformToken).send({ password: adminPassword });
    expect(rightPw.status).toBe(200);
  });

  it('suspend and disconnect require the correct step-up password', async () => {
    const wrongSuspend = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken).send({ password: 'wrong' });
    expect(wrongSuspend.status).toBe(403);
    const rightSuspend = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken).send({ password: adminPassword });
    expect(rightSuspend.status).toBe(200);

    const wrongDisconnect = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/disconnect`, platformToken).send({ password: 'wrong' });
    expect(wrongDisconnect.status).toBe(403);
  });

  it('reactivate and refresh-status do NOT require a step-up password (deliberately excluded)', async () => {
    await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/disconnect`, platformToken).send({ password: adminPassword });
    await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/approve`, platformToken).send({ password: adminPassword });
    const suspendRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken).send({ password: adminPassword });
    expect(suspendRes.status).toBe(200);
    const reactivateRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/reactivate`, platformToken).send({});
    expect(reactivateRes.status).toBe(200);
    const refreshRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/refresh-status`, platformToken).send({});
    expect(refreshRes.status).toBe(200);
  });

  it('setCommissionOverride requires the correct step-up password', async () => {
    const wrong = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: 100, password: 'wrong' });
    expect(wrong.status).toBe(403);
    const right = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: 100, password: adminPassword });
    expect(right.status).toBe(200);
  });
```

Add to `cloud/api/test/platform-payments.e2e.spec.ts`:

```typescript
  it('setDefaultCommissionBps requires the correct step-up password', async () => {
    const wrong = await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: 150, password: 'wrong' });
    expect(wrong.status).toBe(403);
    const right = await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: 150, password: adminPassword });
    expect(right.status).toBe(200);
  });
```

(This file's `beforeAll` needs `adminPassword` in scope — check it already stores the plaintext password used to create the test admin; if it currently only stores the email, add a const alongside `adminEmail` the same way `payment-connections.e2e.spec.ts` already does, and pass it to `createTestPlatformUser`.)

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/payment-connections.e2e.spec.ts test/platform-payments.e2e.spec.ts`
Expected: FAIL — every step-up-protected route currently accepts the request regardless of password (some assertions expecting 403 will see 200).

- [ ] **Step 8: Wire `requireStepUpPassword` into the five service methods**

In `cloud/api/src/modules/payments/payment-connections.service.ts`, add the import and a `password` parameter to `approve`, `suspend`, `disconnect` (via `transitionStatus`, since suspend/disconnect both call it — reactivate also calls it but must NOT require step-up, so add the parameter to the call sites, not to `transitionStatus` itself):

```typescript
import { requireStepUpPassword } from '../../common/security/step-up.util';
// ...
  async approve(restaurantId: string, actor: PlatformUser, password: string | undefined) {
    await requireStepUpPassword(actor, password);
    // ...unchanged body below...
```

```typescript
  async suspend(restaurantId: string, actor: PlatformUser, password: string | undefined) {
    await requireStepUpPassword(actor, password);
    return this.transitionStatus(restaurantId, actor, ['ACTIVE'], 'SUSPENDED', 'PAYMENT_CONNECTION_SUSPENDED');
  }

  async reactivate(restaurantId: string, actor: PlatformUser) {
    return this.transitionStatus(restaurantId, actor, ['SUSPENDED'], 'ACTIVE', 'PAYMENT_CONNECTION_REACTIVATED');
  }

  async disconnect(restaurantId: string, actor: PlatformUser, password: string | undefined) {
    await requireStepUpPassword(actor, password);
    return this.transitionStatus(restaurantId, actor, ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'], 'DISCONNECTED', 'PAYMENT_CONNECTION_DISCONNECTED');
  }
```

And in `setCommissionOverride` (added in Task 1's edit), add the check right after the range validation:

```typescript
  async setCommissionOverride(restaurantId: string, overrideBps: number | null, actor: PlatformUser, password: string | undefined) {
    if (overrideBps !== null && (!Number.isInteger(overrideBps) || overrideBps < 0 || overrideBps > 10000)) {
      throw new BadRequestException('overrideBps must be null or an integer between 0 and 10000');
    }
    await requireStepUpPassword(actor, password);
    return this.prisma.runAsPlatform(async (tx) => {
```

In `cloud/api/src/modules/payments/platform-payments.service.ts`'s `setDefaultCommissionBps`:

```typescript
import { requireStepUpPassword } from '../../common/security/step-up.util';
// ...
  async setDefaultCommissionBps(bps: number, actor: PlatformUser, password: string | undefined) {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      throw new BadRequestException('defaultBps must be an integer between 0 and 10000');
    }
    await requireStepUpPassword(actor, password);
    return this.prisma.runAsPlatform(async (tx) => {
```

- [ ] **Step 9: Wire the new `password` field through both controllers**

In `cloud/api/src/modules/payments/platform-payment-connections.controller.ts`, use `stepUpPasswordSchema` for `approve`/`suspend`/`disconnect` (each currently takes no body at all):

```typescript
import { setCommissionOverrideSchema, SetCommissionOverrideDto, stepUpPasswordSchema, StepUpPasswordDto } from './dto/commission-config.dto';
// ...
  @Patch('api/v1/restaurants/:id/payment-connection/approve')
  @UsePipes(new ZodValidationPipe(stepUpPasswordSchema))
  approve(@Param('id') id: string, @Body() body: StepUpPasswordDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.approve(id, actor, body.password);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/suspend')
  @UsePipes(new ZodValidationPipe(stepUpPasswordSchema))
  suspend(@Param('id') id: string, @Body() body: StepUpPasswordDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.suspend(id, actor, body.password);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/reactivate')
  reactivate(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.reactivate(id, actor);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/disconnect')
  @UsePipes(new ZodValidationPipe(stepUpPasswordSchema))
  disconnect(@Param('id') id: string, @Body() body: StepUpPasswordDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.disconnect(id, actor, body.password);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/refresh-status')
  refreshStatus(@Param('id') id: string) {
    return this.connections.refreshStatus(id);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/commission')
  @UsePipes(new ZodValidationPipe(setCommissionOverrideSchema))
  setCommission(@Param('id') id: string, @Body() body: SetCommissionOverrideDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.setCommissionOverride(id, body.overrideBps, actor, body.password);
  }
```

In `cloud/api/src/modules/payments/platform-payments.controller.ts`:

```typescript
  @Patch('commission-config')
  @UsePipes(new ZodValidationPipe(setCommissionConfigSchema))
  setCommissionConfig(@Body() body: SetCommissionConfigDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.platformPayments.setDefaultCommissionBps(body.defaultBps, actor, body.password);
  }
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/payment-connections.e2e.spec.ts test/platform-payments.e2e.spec.ts`
Expected: PASS, all tests in both files.

- [ ] **Step 11: Run the full backend suite for regressions**

Run: `cd cloud/api && npx vitest run`
Expected: no regressions elsewhere (the super-admin frontend still calls these routes with no `password` field for now — that's fixed in Task 4 — so any Playwright/manual check of the old UI would now fail; there is no automated frontend test to break here, only the backend suite, which should be fully green).

- [ ] **Step 12: Commit**

```bash
git add cloud/api/src/common/security/step-up.util.ts cloud/api/src/common/security/step-up.util.spec.ts cloud/api/src/modules/payments/dto/commission-config.dto.ts cloud/api/src/modules/payments/payment-connections.service.ts cloud/api/src/modules/payments/platform-payments.service.ts cloud/api/src/modules/payments/platform-payment-connections.controller.ts cloud/api/src/modules/payments/platform-payments.controller.ts cloud/api/test/payment-connections.e2e.spec.ts cloud/api/test/platform-payments.e2e.spec.ts
git commit -m "feat(payments): require step-up password re-entry for connection approve/suspend/disconnect and commission changes"
```

---

### Task 4: Step-up authentication frontend

**Files:**
- Modify: `cloud/super-admin-web/src/pages/PaymentConnections/PaymentConnectionsListPage.tsx`

**Interfaces:**
- Consumes: the five step-up-protected routes from Task 3 (all now require `password` in the body).

- [ ] **Step 1: Add a password field to the existing confirm-action flow**

`PaymentConnectionsListPage.tsx` already has `confirmTarget`/`ConfirmModal` wired to `approve`/`suspend`/`reactivate`/`disconnect`. Add a `stepUpPassword` state and pass a password input as part of `ConfirmModal`'s `message` for the three actions that need it:

```typescript
  const [stepUpPassword, setStepUpPassword] = useState('');
  const STEP_UP_ACTIONS: PendingAction['action'][] = ['approve', 'suspend', 'disconnect'];
```

```typescript
  async function handleExecuteAction() {
    if (!confirmTarget) return;
    setActionPending(true);
    try {
      const body = STEP_UP_ACTIONS.includes(confirmTarget.action) ? { password: stepUpPassword } : undefined;
      await api.patch(`/api/v1/restaurants/${confirmTarget.connection.restaurantId}/payment-connection/${confirmTarget.action}`, body);
      showToast(`${confirmTarget.connection.restaurant.name}: ${confirmTarget.action} succeeded`);
      setConfirmTarget(null);
      setStepUpPassword('');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `${confirmTarget.action} failed`);
    } finally {
      setActionPending(false);
    }
  }
```

Update the `ConfirmModal`'s `message` prop to append a password input when the pending action needs one:

```tsx
          message={
            <>
              {confirmTarget.action === 'approve'
                ? `This creates a real Cashfree vendor for "${confirmTarget.connection.restaurant.name}" and lets their kiosk start accepting payments.`
                : `This will ${confirmTarget.action} "${confirmTarget.connection.restaurant.name}"'s payment connection.`}
              {STEP_UP_ACTIONS.includes(confirmTarget.action) && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Confirm your password</label>
                  <input
                    type="password"
                    value={stepUpPassword}
                    onChange={(e) => setStepUpPassword(e.target.value)}
                    style={{ width: '100%', marginTop: 4 }}
                    autoFocus
                  />
                </div>
              )}
            </>
          }
```

- [ ] **Step 2: Wire the password into both commission-save handlers**

```typescript
  async function handleSaveDefaultCommission() {
    const percent = Number(defaultBpsInput);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      showToast('Enter a percentage between 0 and 100');
      return;
    }
    const password = window.prompt('Confirm your password to change the platform default commission') ?? '';
    if (!password) return;
    setSavingDefault(true);
    try {
      const result = await api.patch<{ defaultBps: number }>('/api/v1/payments/commission-config', { defaultBps: Math.round(percent * 100), password });
      setDefaultBps(result.defaultBps);
      showToast(`Platform default commission set to ${percent}%`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save default commission');
    } finally {
      setSavingDefault(false);
    }
  }
```

```typescript
  async function handleSaveOverride(c: PaymentConnection) {
    const raw = overrideEdits[c.id];
    const overrideBps = raw === undefined || raw === '' ? null : Math.round(Number(raw) * 100);
    if (overrideBps !== null && (!Number.isFinite(overrideBps) || overrideBps < 0 || overrideBps > 10000)) {
      showToast('Enter a percentage between 0 and 100, or leave blank to use the platform default');
      return;
    }
    const password = window.prompt(`Confirm your password to change ${c.restaurant.name}'s commission`) ?? '';
    if (!password) return;
    setSavingOverrideId(c.id);
    try {
      await api.patch(`/api/v1/restaurants/${c.restaurantId}/payment-connection/commission`, { overrideBps, password });
      showToast(`${c.restaurant.name}: commission override saved`);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save commission override');
    } finally {
      setSavingOverrideId(null);
    }
  }
```

(A plain `window.prompt` is used for these two rather than a modal, since they're single-field inline-table actions without an existing confirm-modal wrapper to extend — `approve`/`suspend`/`disconnect` already go through `ConfirmModal`, so those get the richer inline password field from Step 1 instead.)

- [ ] **Step 3: Typecheck**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Start `cloud/api` and `cloud/super-admin-web` dev servers (or reuse already-running ones). In a real visible browser: attempt to approve/suspend/disconnect a connection with a wrong password (rejected, toast shows the error), then with the correct one (succeeds). Attempt to save a commission value with a wrong password via the prompt (rejected), then correct (succeeds, value persists on reload).

- [ ] **Step 5: Commit**

```bash
git add cloud/super-admin-web/src/pages/PaymentConnections/PaymentConnectionsListPage.tsx
git commit -m "feat(super-admin): collect step-up password for connection approve/suspend/disconnect and commission changes"
```

---

### Task 5: Reconciliation schema + Cashfree split-details API

**Files:**
- Modify: `cloud/api/prisma/schema.prisma`
- Create: `cloud/api/prisma/migrations/20260928010000_reconciliation_exceptions/migration.sql`
- Modify: `cloud/api/src/modules/payments/cashfree-gateway.service.ts`
- Test: `cloud/api/src/modules/payments/cashfree-gateway.service.spec.ts`

**Interfaces:**
- Produces: `ReconciliationException` Prisma model; `CashfreeGatewayService.getOrderSplitDetails(providerOrderId): Promise<{ splits: { vendorId: string; status: string }[] }>` — consumed by Task 6.

- [ ] **Step 1: Add the schema models**

In `cloud/api/prisma/schema.prisma`, after the `WebhookEvent` model:

```prisma
enum ReconciliationExceptionType {
  MISSING_AT_CASHFREE
  AMOUNT_MISMATCH
  SPLIT_MISMATCH
  UNEXPECTED_STATUS
}

enum ReconciliationExceptionStatus {
  OPEN
  ACKNOWLEDGED
  RESOLVED
}

model ReconciliationException {
  id             String                        @id @default(uuid())
  restaurantId   String
  restaurant     Restaurant                    @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  paymentId      String
  payment        PaymentTransaction            @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  type           ReconciliationExceptionType
  details        Json
  status         ReconciliationExceptionStatus @default(OPEN)
  acknowledgedBy String?
  acknowledgedAt DateTime?
  createdAt      DateTime                      @default(now())

  @@index([restaurantId])
  @@index([status])
}
```

Add the back-relation to `PaymentTransaction` (after `refunds Refund[]`):

```prisma
  reconciliationExceptions ReconciliationException[]
```

Add the back-relation to `Restaurant` (find its existing `payments PaymentTransaction[]`-style back-relations block and add alongside them):

```prisma
  reconciliationExceptions ReconciliationException[]
```

- [ ] **Step 2: Write and apply the migration**

```sql
CREATE TYPE "ReconciliationExceptionType" AS ENUM ('MISSING_AT_CASHFREE', 'AMOUNT_MISMATCH', 'SPLIT_MISMATCH', 'UNEXPECTED_STATUS');
CREATE TYPE "ReconciliationExceptionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "ReconciliationException" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" "ReconciliationExceptionType" NOT NULL,
    "details" JSONB NOT NULL,
    "status" "ReconciliationExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReconciliationException_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReconciliationException_restaurantId_idx" ON "ReconciliationException" ("restaurantId");
CREATE INDEX "ReconciliationException_status_idx" ON "ReconciliationException" ("status");
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReconciliationException" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReconciliationException" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ReconciliationException"
  USING (current_setting('app.is_platform_context', true) = 'true' OR "restaurantId" = current_setting('app.current_restaurant_id', true));
```

Run against both databases and mark the migration applied, exactly as Task 1 of the commission plan did:

```bash
cd cloud/api
source .env
psql "${DATABASE_URL%%\?*}" -f prisma/migrations/20260928010000_reconciliation_exceptions/migration.sql
psql "${TEST_DATABASE_URL%%\?*}" -f prisma/migrations/20260928010000_reconciliation_exceptions/migration.sql
npx prisma generate
npx prisma migrate resolve --applied 20260928010000_reconciliation_exceptions
```

Expected: all four commands exit 0.

- [ ] **Step 3: Confirm no regression**

Run: `cd cloud/api && npx vitest run`
Expected: same pass count as before this task (new nullable/required-but-unused-so-far columns and a brand new table don't affect any existing query).

- [ ] **Step 4: Write the failing test for `getOrderSplitDetails`**

Add to `cloud/api/src/modules/payments/cashfree-gateway.service.spec.ts`:

```typescript
  it('getOrderSplitDetails fetches split/settlement details by order id', async () => {
    const service = await buildService(CONFIGURED_ENV);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ splits: [{ vendor_id: 'rest_abc123', status: 'SETTLED' }] }), { status: 200 })
    );

    const result = await service.getOrderSplitDetails('pay_1');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://sandbox.cashfree.com/pg/easy-split/orders/pay_1/split',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.splits).toEqual([{ vendorId: 'rest_abc123', status: 'SETTLED' }]);
  });

  it('getOrderSplitDetails throws when Cashfree responds with a non-2xx status', async () => {
    const service = await buildService(CONFIGURED_ENV);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'not found' }), { status: 404 }));
    await expect(service.getOrderSplitDetails('pay_missing')).rejects.toThrow(ServiceUnavailableException);
  });
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run src/modules/payments/cashfree-gateway.service.spec.ts`
Expected: FAIL — the method doesn't exist yet.

- [ ] **Step 6: Implement `getOrderSplitDetails`**

Add to `cloud/api/src/modules/payments/cashfree-gateway.service.ts`, after `getVendorStatus`:

```typescript
  /**
   * Get Split and Settlement Details by Order ID
   * (https://www.cashfree.com/docs/api-reference/payments/latest/split/configuration/split-after-payment)
   * — what Cashfree actually recorded for an order's vendor split, used by
   * PaymentReconciliationService to compare against this system's own
   * PaymentTransaction snapshot.
   */
  async getOrderSplitDetails(providerOrderId: string): Promise<{ splits: { vendorId: string; status: string }[] }> {
    const res = await fetch(`${this.baseUrl()}/easy-split/orders/${encodeURIComponent(providerOrderId)}/split`, {
      method: 'GET',
      headers: this.headers()
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree split-details lookup failed: ${body?.message ?? res.statusText}`);
    }
    const splits = Array.isArray(body?.splits) ? body.splits : [];
    return { splits: splits.map((s: { vendor_id: string; status: string }) => ({ vendorId: s.vendor_id, status: s.status })) };
  }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run src/modules/payments/cashfree-gateway.service.spec.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 8: Commit**

```bash
git add cloud/api/prisma/schema.prisma cloud/api/prisma/migrations/20260928010000_reconciliation_exceptions cloud/api/src/modules/payments/cashfree-gateway.service.ts cloud/api/src/modules/payments/cashfree-gateway.service.spec.ts
git commit -m "feat(payments): add ReconciliationException schema and CashfreeGatewayService.getOrderSplitDetails"
```

---

### Task 6: `PaymentReconciliationService` + job scheduler wiring

**Files:**
- Create: `cloud/api/src/modules/payments/payment-reconciliation.service.ts`
- Modify: `cloud/api/src/modules/payments/payments.module.ts`
- Modify: `cloud/api/src/modules/jobs/jobs.service.ts`
- Modify: `cloud/api/src/modules/jobs/jobs.module.ts` (if `PaymentsModule` isn't already importable there)
- Test: `cloud/api/test/payment-reconciliation.e2e.spec.ts` (new file)

**Interfaces:**
- Consumes: `CashfreeGatewayService.getOrderSplitDetails` (Task 5).
- Produces: `PaymentReconciliationService.reconcile(): Promise<{ checked: number; exceptionsCreated: number }>` — consumed by `JobsService`.

- [ ] **Step 1: Write the failing e2e test**

Create `cloud/api/test/payment-reconciliation.e2e.spec.ts`, following this module's established `createTestApp`/mocked-`CashfreeGatewayService` pattern:

```typescript
import { INestApplication } from '@nestjs/common';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashfreeGatewayService } from '../src/modules/payments/cashfree-gateway.service';
import { PaymentReconciliationService } from '../src/modules/payments/payment-reconciliation.service';
import request from 'supertest';

describe('Payment reconciliation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let restaurantId: string;
  const adminEmail = `test-reconcile-admin-${Date.now()}@example.com`;
  let getOrderSplitDetailsMock: ReturnType<typeof vi.fn>;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    getOrderSplitDetailsMock = vi.fn();
    app = await createTestApp((builder) =>
      builder.overrideProvider(CashfreeGatewayService).useValue({
        isConfigured: () => true,
        getOrderSplitDetails: getOrderSplitDetailsMock
      })
    );
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    const loginRes = await platformLogin(app, adminEmail, 'correct-horse-battery-staple');
    const platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Reconciliation Restaurant ${Date.now()}`, ownerName: 'Reconcile Owner', ownerEmail: `reconcile-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const seedPayment = async (opts: { providerOrderId: string; amount: number; commissionBps: number; platformAmount: number; restaurantAmount: number }) => {
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `reconcile-${Date.now()}-${Math.random()}`, items: [], subtotal: opts.amount, taxAmount: 0, totalAmount: opts.amount, status: 'PAID' } })
    );
    return prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: {
          orderId: order.id, restaurantId, providerOrderId: opts.providerOrderId, amount: opts.amount, currency: 'INR', status: 'SUCCESS',
          commissionBps: opts.commissionBps, platformAmount: opts.platformAmount, restaurantAmount: opts.restaurantAmount
        }
      })
    );
  };

  it('creates a MISSING_AT_CASHFREE exception when Cashfree has no record of the split', async () => {
    const payment = await seedPayment({ providerOrderId: 'pay_missing_1', amount: 10000, commissionBps: 200, platformAmount: 200, restaurantAmount: 9800 });
    getOrderSplitDetailsMock.mockResolvedValueOnce({ splits: [] });

    const reconciliation = app.get(PaymentReconciliationService);
    const result = await reconciliation.reconcile();

    expect(result.exceptionsCreated).toBeGreaterThanOrEqual(1);
    const exception = await prisma.runAsPlatform((tx) => tx.reconciliationException.findFirst({ where: { paymentId: payment.id } }));
    expect(exception).not.toBeNull();
    expect(exception!.type).toBe('MISSING_AT_CASHFREE');
    expect(exception!.status).toBe('OPEN');
  });

  it('does not create a second OPEN exception for a payment that already has one of the same type', async () => {
    const payment = await seedPayment({ providerOrderId: 'pay_missing_2', amount: 5000, commissionBps: 0, platformAmount: 0, restaurantAmount: 5000 });
    getOrderSplitDetailsMock.mockResolvedValue({ splits: [] });

    const reconciliation = app.get(PaymentReconciliationService);
    await reconciliation.reconcile();
    await reconciliation.reconcile();

    const exceptions = await prisma.runAsPlatform((tx) => tx.reconciliationException.findMany({ where: { paymentId: payment.id } }));
    expect(exceptions.length).toBe(1);
  });

  it('creates no exception when Cashfree confirms the expected vendor split', async () => {
    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.upsert({
      where: { restaurantId }, create: { restaurantId, status: 'ACTIVE', cashfreeVendorId: 'rest_matching_vendor' }, update: { cashfreeVendorId: 'rest_matching_vendor' }
    }));
    const payment = await seedPayment({ providerOrderId: 'pay_matching_1', amount: 8000, commissionBps: 0, platformAmount: 0, restaurantAmount: 8000 });
    getOrderSplitDetailsMock.mockResolvedValueOnce({ splits: [{ vendorId: 'rest_matching_vendor', status: 'SETTLED' }] });

    const reconciliation = app.get(PaymentReconciliationService);
    await reconciliation.reconcile();

    const exception = await prisma.runAsPlatform((tx) => tx.reconciliationException.findFirst({ where: { paymentId: payment.id } }));
    expect(exception).toBeNull();
  });

  it('a payment with no commissionBps snapshot (pre-migration row) is skipped, not flagged', async () => {
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `reconcile-premig-${Date.now()}`, items: [], subtotal: 3000, taxAmount: 0, totalAmount: 3000, status: 'PAID' } })
    );
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { orderId: order.id, restaurantId, providerOrderId: `pay_premig_${Date.now()}`, amount: 3000, currency: 'INR', status: 'SUCCESS' } })
    );

    const reconciliation = app.get(PaymentReconciliationService);
    await reconciliation.reconcile();

    const exception = await prisma.runAsPlatform((tx) => tx.reconciliationException.findFirst({ where: { paymentId: payment.id } }));
    expect(exception).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/payment-reconciliation.e2e.spec.ts`
Expected: FAIL — `PaymentReconciliationService` doesn't exist yet, so `app.get(PaymentReconciliationService)` throws.

- [ ] **Step 3: Implement `PaymentReconciliationService`**

Create `cloud/api/src/modules/payments/payment-reconciliation.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';

const LOOKBACK_DAYS = 7;
const RECONCILABLE_STATUSES = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cashfree: CashfreeGatewayService
  ) {}

  async reconcile(): Promise<{ checked: number; exceptionsCreated: number }> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const payments = await this.prisma.runAsPlatform((tx) =>
      tx.paymentTransaction.findMany({
        where: { status: { in: RECONCILABLE_STATUSES as unknown as string[] }, createdAt: { gte: since }, commissionBps: { not: null } },
        include: { reconciliationExceptions: { where: { status: 'OPEN' } } }
      })
    );

    let exceptionsCreated = 0;
    for (const payment of payments) {
      try {
        const connection = await this.prisma.runAsPlatform((tx) =>
          tx.restaurantPaymentConnection.findUnique({ where: { restaurantId: payment.restaurantId } })
        );
        const { splits } = await this.cashfree.getOrderSplitDetails(payment.providerOrderId);
        const match = connection?.cashfreeVendorId ? splits.find((s) => s.vendorId === connection.cashfreeVendorId) : undefined;

        if (!match) {
          if (!payment.reconciliationExceptions.some((e) => e.type === 'MISSING_AT_CASHFREE')) {
            await this.createException(payment.id, payment.restaurantId, 'MISSING_AT_CASHFREE', { expectedVendorId: connection?.cashfreeVendorId ?? null, actualSplits: splits });
            exceptionsCreated++;
          }
          continue;
        }
        // A found split with no clearly-settled/pending status this system recognizes is worth a human look,
        // rather than silently assumed fine — the exact set of "known good" Cashfree statuses is intentionally
        // small and can grow as real sandbox/production responses are observed.
        const KNOWN_GOOD_STATUSES = ['SETTLED', 'PENDING', 'PROCESSING'];
        if (!KNOWN_GOOD_STATUSES.includes(match.status)) {
          if (!payment.reconciliationExceptions.some((e) => e.type === 'UNEXPECTED_STATUS')) {
            await this.createException(payment.id, payment.restaurantId, 'UNEXPECTED_STATUS', { cashfreeStatus: match.status });
            exceptionsCreated++;
          }
        }
      } catch (err) {
        this.logger.error(`Reconciliation failed for payment ${payment.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { checked: payments.length, exceptionsCreated };
  }

  private async createException(paymentId: string, restaurantId: string, type: 'MISSING_AT_CASHFREE' | 'UNEXPECTED_STATUS' | 'AMOUNT_MISMATCH' | 'SPLIT_MISMATCH', details: Record<string, unknown>) {
    await this.prisma.runAsPlatform((tx) =>
      tx.reconciliationException.create({ data: { paymentId, restaurantId, type, details, status: 'OPEN' } })
    );
  }
}
```

- [ ] **Step 4: Register the service in `PaymentsModule`**

In `cloud/api/src/modules/payments/payments.module.ts`, add `PaymentReconciliationService` to `providers` and `exports` (it needs to be injectable into `JobsService`, which lives in a different module):

```typescript
import { PaymentReconciliationService } from './payment-reconciliation.service';
// ...
  providers: [PaymentsService, CashfreeGatewayService, MenuSyncService, PaymentConnectionsService, PlatformPaymentsService, PaymentReconciliationService],
  exports: [PaymentsService, CashfreeGatewayService, PaymentReconciliationService]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/payment-reconciliation.e2e.spec.ts`
Expected: PASS, all four tests.

- [ ] **Step 6: Wire into `JobsService`**

In `cloud/api/src/modules/jobs/jobs.service.ts`, add the import and constructor dependency:

```typescript
import { PaymentReconciliationService } from '../payments/payment-reconciliation.service';
// ...
  constructor(
    private readonly config: ConfigService,
    private readonly invoices: InvoicesService,
    private readonly keys: ActivationKeysService,
    private readonly offline: OfflinePolicyService,
    private readonly backups: BackupsService,
    private readonly notifications: PlatformNotificationsService,
    private readonly reconciliation: PaymentReconciliationService
  ) {}
```

Add to the `jobs` getter's array, after `notifications`:

```typescript
      { name: 'payment-reconciliation', description: 'Compare recent successful payments against Cashfree\'s own split/settlement records', run: () => this.reconciliation.reconcile() },
```

Check `cloud/api/src/modules/jobs/jobs.module.ts` imports `PaymentsModule` (needed so Nest can resolve `PaymentReconciliationService` into `JobsService`) — add it if not already present, following whatever pattern the module already uses to import `BackupsModule`/`InvoicesModule`/etc.

- [ ] **Step 7: Run the full backend suite for regressions**

Run: `cd cloud/api && npx vitest run`
Expected: no regressions. If any existing `jobs`-related test asserts an exact job count/name list, update it to include `payment-reconciliation` (a plan-wrong finding to ledger if so, not a code bug).

- [ ] **Step 8: Commit**

```bash
git add cloud/api/src/modules/payments/payment-reconciliation.service.ts cloud/api/src/modules/payments/payments.module.ts cloud/api/src/modules/jobs/jobs.service.ts cloud/api/src/modules/jobs/jobs.module.ts cloud/api/test/payment-reconciliation.e2e.spec.ts
git commit -m "feat(payments): add PaymentReconciliationService, wired into the existing job scheduler"
```

---

### Task 7: Reconciliation Super Admin endpoints + UI

**Files:**
- Modify: `cloud/api/src/modules/payments/platform-payments.service.ts`
- Modify: `cloud/api/src/modules/payments/platform-payments.controller.ts`
- Modify: `cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx`
- Modify: `cloud/super-admin-web/src/api/types.ts`
- Test: `cloud/api/test/payment-reconciliation.e2e.spec.ts`

- [ ] **Step 1: Write the failing e2e tests**

Add to `cloud/api/test/payment-reconciliation.e2e.spec.ts`:

```typescript
  it('GET /api/v1/payments/reconciliation-exceptions lists exceptions filterable by restaurantId and status', async () => {
    const payment = await seedPayment({ providerOrderId: 'pay_list_1', amount: 4000, commissionBps: 0, platformAmount: 0, restaurantAmount: 4000 });
    getOrderSplitDetailsMock.mockResolvedValueOnce({ splits: [] });
    await app.get(PaymentReconciliationService).reconcile();

    const loginRes = await platformLogin(app, adminEmail, 'correct-horse-battery-staple');
    const platformToken = loginRes.body.accessToken;
    const res = await authed('get', `/api/v1/payments/reconciliation-exceptions?restaurantId=${restaurantId}&status=OPEN`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.rows.some((r: { paymentId: string }) => r.paymentId === payment.id)).toBe(true);
  });

  it('PATCH .../acknowledge marks an exception ACKNOWLEDGED', async () => {
    const payment = await seedPayment({ providerOrderId: 'pay_ack_1', amount: 2000, commissionBps: 0, platformAmount: 0, restaurantAmount: 2000 });
    getOrderSplitDetailsMock.mockResolvedValueOnce({ splits: [] });
    await app.get(PaymentReconciliationService).reconcile();
    const exception = await prisma.runAsPlatform((tx) => tx.reconciliationException.findFirstOrThrow({ where: { paymentId: payment.id } }));

    const loginRes = await platformLogin(app, adminEmail, 'correct-horse-battery-staple');
    const platformToken = loginRes.body.accessToken;
    const res = await authed('post' as never, `/api/v1/payments/reconciliation-exceptions/${exception.id}/acknowledge`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACKNOWLEDGED');
  });
```

(`authed`'s method union in this file needs `'patch'` added, matching every other test file's convention: `(method: 'get' | 'post' | 'patch', ...)`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/payment-reconciliation.e2e.spec.ts`
Expected: FAIL with 404 (routes don't exist yet).

- [ ] **Step 3: Implement the service methods**

Add to `cloud/api/src/modules/payments/platform-payments.service.ts`:

```typescript
  async listReconciliationExceptions(filters: { restaurantId?: string; status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'; page: number; limit: number }) {
    return this.prisma.runAsPlatform(async (tx) => {
      const where = {
        ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}),
        ...(filters.status ? { status: filters.status } : {})
      };
      const [rows, total] = await Promise.all([
        tx.reconciliationException.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (filters.page - 1) * filters.limit, take: filters.limit }),
        tx.reconciliationException.count({ where })
      ]);
      return { rows, total, page: filters.page, limit: filters.limit };
    });
  }

  async acknowledgeReconciliationException(id: string, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const updated = await tx.reconciliationException.update({ where: { id }, data: { status: 'ACKNOWLEDGED', acknowledgedBy: actor.id, acknowledgedAt: new Date() } });
      return updated;
    });
  }
```

- [ ] **Step 4: Implement the controller routes**

Add to `cloud/api/src/modules/payments/platform-payments.controller.ts`, above `@Get(':paymentId')`:

```typescript
  @Get('reconciliation-exceptions')
  listReconciliationExceptions(
    @Query('restaurantId') restaurantId?: string,
    @Query('status') status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED',
    @Query('page') page = '1',
    @Query('limit') limit = '25'
  ) {
    return this.platformPayments.listReconciliationExceptions({
      restaurantId, status, page: Math.max(1, Number(page) || 1), limit: Math.min(100, Math.max(1, Number(limit) || 25))
    });
  }

  @Patch('reconciliation-exceptions/:id/acknowledge')
  acknowledgeReconciliationException(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.platformPayments.acknowledgeReconciliationException(id, actor);
  }
```

(No step-up password here — acknowledging is informational triage per the design spec, not a financial mutation.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/payment-reconciliation.e2e.spec.ts`
Expected: PASS, all six tests in the file.

- [ ] **Step 6: Run the full backend suite for regressions**

Run: `cd cloud/api && npx vitest run`
Expected: no regressions.

- [ ] **Step 7: Add the Super Admin UI**

In `cloud/super-admin-web/src/api/types.ts`, add:

```typescript
export interface ReconciliationException {
  id: string;
  restaurantId: string;
  paymentId: string;
  type: 'MISSING_AT_CASHFREE' | 'AMOUNT_MISMATCH' | 'SPLIT_MISMATCH' | 'UNEXPECTED_STATUS';
  details: Record<string, unknown>;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}
```

In `cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx`: add `const [exceptions, setExceptions] = useState<ReconciliationException[] | null>(null);` alongside `payments` state, extend the `tab === 'payments'` branch of the lazy-load effect to also fetch exceptions:

```typescript
    if (tab === 'payments') {
      const params = new URLSearchParams({ restaurantId: id, page: String(paymentsPage), limit: '25' });
      if (paymentsStatusFilter !== 'ALL') params.set('status', paymentsStatusFilter);
      api.get<PlatformPaymentPage>(`/api/v1/payments?${params.toString()}`).then(setPayments).catch(() => setPayments({ rows: [], total: 0, page: 1, limit: 25 }));
      api.get<{ rows: ReconciliationException[]; total: number }>(`/api/v1/payments/reconciliation-exceptions?restaurantId=${id}&status=OPEN`).then((r) => setExceptions(r.rows)).catch(() => setExceptions([]));
    }
```

Below the existing transactions table in the `{tab === 'payments' && (...)}` block, add a small section (only rendered when there's at least one open exception, so a healthy restaurant's tab looks exactly as it does today):

```tsx
      {exceptions && exceptions.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div className="card-header"><span>Reconciliation Exceptions ({exceptions.length})</span></div>
          <div className="data-table-container">
            <table className="data-table">
              <thead><tr><th>Type</th><th>Details</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {exceptions.map((e) => (
                  <tr key={e.id}>
                    <td><Badge tone="warning">{e.type.replace(/_/g, ' ')}</Badge></td>
                    <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{JSON.stringify(e.details)}</td>
                    <td style={{ fontSize: 12 }}>{new Date(e.createdAt).toLocaleString()}</td>
                    <td>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await api.patch(`/api/v1/payments/reconciliation-exceptions/${e.id}/acknowledge`);
                        setExceptions((prev) => prev?.filter((x) => x.id !== e.id) ?? null);
                      }}>Acknowledge</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
```

(Check `Badge`'s `tone` prop already supports a `'warning'` value in `components/ui.tsx` — use whatever tone name it actually exposes for a caution/attention state if the name differs, e.g. `'pending'`/`'amber'`.)

- [ ] **Step 8: Typecheck**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Manual verification**

Seed a throwaway restaurant + payment + mocked-missing split via a scratch script (same throwaway-seed-then-cleanup pattern used for the commission UI verification), confirm the exceptions section renders and Acknowledge removes the row, then clean up the seeded data.

- [ ] **Step 10: Commit**

```bash
git add cloud/api/src/modules/payments/platform-payments.service.ts cloud/api/src/modules/payments/platform-payments.controller.ts cloud/api/test/payment-reconciliation.e2e.spec.ts cloud/super-admin-web/src/api/types.ts cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx
git commit -m "feat(payments): Super Admin reconciliation-exceptions list/acknowledge endpoints and Payments-tab UI"
```

---

### Task 8: Platform-wide payments summary (backend)

**Files:**
- Modify: `cloud/api/src/modules/payments/platform-payments.service.ts`
- Modify: `cloud/api/src/modules/payments/platform-payments.controller.ts`
- Test: `cloud/api/test/platform-payments.e2e.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
  it('GET /platform-summary returns zeroed aggregates for a restaurant with no payments yet', async () => {
    const freshRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Empty Summary Restaurant ${Date.now()}`, ownerName: 'Empty Owner', ownerEmail: `empty-owner-${Date.now()}@test.example.com`
    });
    const res = await authed('get', `/api/v1/payments/platform-summary?restaurantId=${freshRes.body.restaurant.id}`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.grossVolume).toBe(0);
    expect(res.body.platformCommission).toBe(0);
    expect(res.body.refundedAmount).toBe(0);
    expect(res.body.successfulCount).toBe(0);
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: freshRes.body.restaurant.id } }));
  });

  it('GET /platform-summary aggregates gross volume, commission, and restaurant share across successful payments', async () => {
    await seedPayment(10000, 'SUCCESS');
    await seedPayment(20000, 'SUCCESS');
    const res = await authed('get', `/api/v1/payments/platform-summary?restaurantId=${restaurantId}`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.grossVolume).toBeGreaterThanOrEqual(30000);
    expect(typeof res.body.openReconciliationExceptions).toBe('number');
  });

  it('a non-platform caller cannot read the platform summary', async () => {
    const res = await authed('get', `/api/v1/payments/platform-summary?restaurantId=${restaurantId}`, posToken);
    expect(res.status).toBe(401);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/platform-payments.e2e.spec.ts`
Expected: FAIL with 404.

- [ ] **Step 3: Implement**

Add to `cloud/api/src/modules/payments/platform-payments.service.ts`:

```typescript
export interface PlatformSummaryFilters {
  restaurantId?: string;
  status?: PaymentTransactionStatus;
  from?: Date;
  to?: Date;
}
```

```typescript
  async platformSummary(filters: PlatformSummaryFilters) {
    return this.prisma.runAsPlatform(async (tx) => {
      const where = {
        ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {})
      };
      const [successAgg, refundAgg, statusCounts, exceptionCount] = await Promise.all([
        tx.paymentTransaction.aggregate({
          where: { ...where, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
          _sum: { amount: true, platformAmount: true, restaurantAmount: true },
          _count: true
        }),
        tx.refund.aggregate({ where: { status: 'SUCCESS', payment: where }, _sum: { amount: true } }),
        tx.paymentTransaction.groupBy({ by: ['status'], where, _count: true }),
        tx.reconciliationException.count({ where: { status: 'OPEN', ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}) } })
      ]);
      return {
        grossVolume: successAgg._sum.amount ?? 0,
        platformCommission: successAgg._sum.platformAmount ?? 0,
        restaurantShare: successAgg._sum.restaurantAmount ?? 0,
        refundedAmount: refundAgg._sum.amount ?? 0,
        successfulCount: successAgg._count,
        statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
        openReconciliationExceptions: exceptionCount
      };
    });
  }
```

Add to `cloud/api/src/modules/payments/platform-payments.controller.ts`, alongside `commission-config`:

```typescript
  @Get('platform-summary')
  platformSummary(
    @Query('restaurantId') restaurantId?: string,
    @Query('status') status?: PaymentTransactionStatus,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.platformPayments.platformSummary({ restaurantId, status, from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/platform-payments.e2e.spec.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Run the full backend suite for regressions**

Run: `cd cloud/api && npx vitest run`
Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add cloud/api/src/modules/payments/platform-payments.service.ts cloud/api/src/modules/payments/platform-payments.controller.ts cloud/api/test/platform-payments.e2e.spec.ts
git commit -m "feat(payments): add platform-wide payments summary endpoint"
```

---

### Task 9: Super Admin platform-wide payments dashboard (frontend)

**Files:**
- Create: `cloud/super-admin-web/src/pages/PlatformPayments/PlatformPaymentsDashboardPage.tsx`
- Modify: `cloud/super-admin-web/src/app/App.tsx` (route registration — check the exact file/pattern other routes use, e.g. `PaymentConnectionsListPage`'s own registration, and mirror it)
- Modify: whatever file registers the left-nav "SaaS Management" section (the same file that lists "Payment Gateways" today — locate via the nav snapshot already captured during Task 7's manual verification, or grep for the literal string `"Payment Gateways"`)

- [ ] **Step 1: Create the page**

```tsx
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Card, Badge, statusTone } from '../../components/ui';
import '../../components/shared.css';

interface PlatformSummary {
  grossVolume: number;
  platformCommission: number;
  restaurantShare: number;
  refundedAmount: number;
  successfulCount: number;
  statusCounts: Record<string, number>;
  openReconciliationExceptions: number;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function PlatformPaymentsDashboardPage() {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (restaurantId) params.set('restaurantId', restaurantId);
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    api.get<PlatformSummary>(`/api/v1/payments/platform-summary?${params.toString()}`)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load platform payments summary'));
  }, [restaurantId, status, from, to]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Payments</h1>
          <p className="page-subtitle">Cross-restaurant Cashfree payment volume, commission, and reconciliation health.</p>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <input placeholder="Restaurant ID (optional)" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} style={{ width: 260 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
          <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <Card><div className="muted" style={{ fontSize: 12 }}>Gross Volume</div><div style={{ fontSize: 24, fontWeight: 700 }}>{formatRupees(summary.grossVolume)}</div></Card>
          <Card><div className="muted" style={{ fontSize: 12 }}>Platform Commission</div><div style={{ fontSize: 24, fontWeight: 700 }}>{formatRupees(summary.platformCommission)}</div></Card>
          <Card><div className="muted" style={{ fontSize: 12 }}>Restaurant Share</div><div style={{ fontSize: 24, fontWeight: 700 }}>{formatRupees(summary.restaurantShare)}</div></Card>
          <Card><div className="muted" style={{ fontSize: 12 }}>Refunded</div><div style={{ fontSize: 24, fontWeight: 700 }}>{formatRupees(summary.refundedAmount)}</div></Card>
          <Card>
            <div className="muted" style={{ fontSize: 12 }}>Open Reconciliation Exceptions</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {summary.openReconciliationExceptions > 0 ? <Badge tone={statusTone('WARNING' as never)}>{summary.openReconciliationExceptions}</Badge> : summary.openReconciliationExceptions}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
```

(Check `statusTone`'s accepted input type before using `'WARNING' as never` — replace with whatever real status string it maps to a warning color, or just render the count without `Badge`/`statusTone` if there's no clean fit; this is a cosmetic detail, not a behavioral one.)

- [ ] **Step 2: Register the route and nav entry**

Find where `PaymentConnectionsListPage` is registered as a route (grep `PaymentConnectionsListPage` in `App.tsx` or wherever routes live) and add a sibling route for `PlatformPaymentsDashboardPage` at e.g. `/platform-payments`. Find the nav list that renders "Payment Gateways" under "SaaS Management" (grep the literal string) and add a sibling link "Platform Payments" → `/platform-payments`.

- [ ] **Step 3: Typecheck**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Navigate to the new page in a real browser, confirm the tiles load real (zeroed, if nothing seeded) data, apply each filter and confirm the summary changes (seed a throwaway payment via script if needed to see nonzero numbers, then clean up).

- [ ] **Step 5: Commit**

```bash
git add cloud/super-admin-web/src/pages/PlatformPayments cloud/super-admin-web/src/app/App.tsx
git commit -m "feat(super-admin): add platform-wide payments dashboard page"
```

---

### Task 10: Shared tenant payments summary endpoint (backend, for Kiosk Admin + Restaurant Admin)

**Files:**
- Modify: `cloud/api/src/modules/payments/payments.service.ts`
- Modify: `cloud/api/src/modules/payments/payment-orders.controller.ts`
- Test: `cloud/api/test/payments-orders.e2e.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
  it('GET /tenant-summary returns aggregate figures for a KIOSK_ADMIN device', async () => {
    const kioskAdminKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KIOSK_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const kioskAdminRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: kioskAdminKeyRes.body.code, deviceType: 'KIOSK_ADMIN' });
    const kioskAdminToken = kioskAdminRedeemRes.body.deviceToken;

    const res = await authed('get', '/api/v1/payments/tenant-summary', kioskAdminToken);
    expect(res.status).toBe(200);
    expect(typeof res.body.grossVolume).toBe('number');
    expect(typeof res.body.successfulCount).toBe('number');
  });

  it('GET /tenant-summary rejects a plain KIOSK (non-admin) device token', async () => {
    const res = await authed('get', '/api/v1/payments/tenant-summary', kioskToken);
    expect(res.status).toBe(403);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/payments-orders.e2e.spec.ts`
Expected: FAIL with 404.

- [ ] **Step 3: Implement**

Add to `cloud/api/src/modules/payments/payments.service.ts`:

```typescript
  async tenantSummary(restaurantId: string, filters: { from?: Date; to?: Date }) {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const where = { restaurantId, ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}) };
      const [successAgg, failedCount, refunded] = await Promise.all([
        tx.paymentTransaction.aggregate({ where: { ...where, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, _sum: { amount: true }, _count: true }),
        tx.paymentTransaction.count({ where: { ...where, status: 'FAILED' } }),
        tx.refund.aggregate({ where: { status: 'SUCCESS', payment: { restaurantId } }, _sum: { amount: true } })
      ]);
      return {
        grossVolume: successAgg._sum.amount ?? 0,
        successfulCount: successAgg._count,
        failedCount,
        refundedAmount: refunded._sum.amount ?? 0
      };
    });
  }
```

Add to `cloud/api/src/modules/payments/payment-orders.controller.ts`, above `@Get(':paymentId/status')`:

```typescript
  @Get('tenant-summary')
  async tenantSummary(@CurrentDevice() device: Device, @Query('from') from?: string, @Query('to') to?: string) {
    if (device.type !== 'KIOSK_ADMIN' && device.type !== 'POS_ADMIN') {
      throw new ForbiddenException('Only Kiosk Admin or POS Admin can read the payments summary');
    }
    return this.payments.tenantSummary(device.restaurantId, { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined });
  }
```

(Add `Query` to this controller's existing `@nestjs/common` import list.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/payments-orders.e2e.spec.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Run the full backend suite for regressions**

Run: `cd cloud/api && npx vitest run`
Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add cloud/api/src/modules/payments/payments.service.ts cloud/api/src/modules/payments/payment-orders.controller.ts cloud/api/test/payments-orders.e2e.spec.ts
git commit -m "feat(payments): add shared tenant-summary endpoint for Kiosk Admin and Restaurant Admin"
```

---

### Task 11: Kiosk Admin revenue view (frontend)

**Files:**
- Modify: `apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts`
- Modify: `apps/kiosk-system/kiosk-admin/src/App.tsx`

- [ ] **Step 1: Add `getPaymentsSummary()` to `cloudClient.ts`**

Following the same `deviceFetch`-style pattern this file already uses for its device token (not `tenantFetch`, since `tenant-summary` is `DeviceAuthGuard`-protected):

```typescript
export async function getPaymentsSummary(): Promise<{ grossVolume: number; successfulCount: number; failedCount: number; refundedAmount: number }> {
  const res = await deviceFetch('/api/v1/payments/tenant-summary');
  if (!res.ok) throw new Error('Failed to load payments summary');
  return res.json();
}
```

(If this file's `deviceFetch` helper isn't already exported/reachable at module scope for reuse outside the entity-sync functions, check its existing visibility — it's declared `function deviceFetch(...)` per the earlier grep, non-exported but usable within the same file, which is where this new function also lives.)

- [ ] **Step 2: Add the revenue section to the Payment Gateway settings card**

In `App.tsx`'s Payment Gateway settings section (the `'SETTINGS'` tab area added by the Phase 2 onboarding sub-project), add a small summary fetched on that section's mount:

```typescript
  const [paymentsSummary, setPaymentsSummary] = useState<{ grossVolume: number; successfulCount: number; refundedAmount: number } | null>(null);

  useEffect(() => {
    if (activeTab !== 'SETTINGS') return;
    getPaymentsSummary().then(setPaymentsSummary).catch(() => {});
  }, [activeTab]);
```

Render three figures (Gross Volume, Successful Count, Refunded) near the existing Payment Gateway card, formatted the same way this app already formats currency elsewhere (reuse whatever `formatINR`/currency helper this app already imports from `@jamanvaar/utils`, matching `PaymentsSplitModule.tsx`'s own `formatINR` import in `pos-admin` as the cross-app convention).

- [ ] **Step 3: Typecheck**

Run: `cd apps/kiosk-system/kiosk-admin && npx tsc --noEmit` (or this monorepo's equivalent typecheck command for this app — confirm the exact script name in its `package.json` first).
Expected: no errors.

- [ ] **Step 4: Manual verification**

Real browser, real running dev server: navigate to the Payment Gateway settings section, confirm the three figures render (zeros if nothing seeded).

- [ ] **Step 5: Commit**

```bash
git add apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts apps/kiosk-system/kiosk-admin/src/App.tsx
git commit -m "feat(kiosk-admin): show payments revenue summary in Payment Gateway settings"
```

---

### Task 12: Restaurant Admin (pos-admin) revenue view (frontend)

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts`
- Modify: `apps/restaurant-system/pos-admin/src/components/reports/ReportsDashboard.tsx`

- [ ] **Step 1: Add `getPaymentsSummary()` to `pos-admin`'s `cloudClient.ts`**

Mirroring `createRefund`'s existing device-fetch pattern in this same file:

```typescript
export async function getPaymentsSummary(): Promise<{ grossVolume: number; successfulCount: number; failedCount: number; refundedAmount: number }> {
  const res = await deviceFetch('/api/v1/payments/tenant-summary');
  if (!res.ok) throw new Error('Failed to load payments summary');
  return res.json();
}
```

- [ ] **Step 2: Add a section to `ReportsDashboard.tsx`**

Read the file first to find its existing local-sales-figures section and add an "Online (Cashfree)" card alongside it, fetched via `getPaymentsSummary()` on mount, clearly labeled as a separate figure from the local cash/card totals already shown (e.g. a subheading "Online Payments (Cashfree)" above the new card, distinct from whatever heading the existing local totals use).

- [ ] **Step 3: Typecheck**

Run this app's typecheck command (confirm exact script name in its `package.json`).
Expected: no errors.

- [ ] **Step 4: Manual verification**

Real browser, real running dev server: navigate to Reports, confirm the new Online Payments card renders alongside the existing local sales figures.

- [ ] **Step 5: Commit**

```bash
git add apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts apps/restaurant-system/pos-admin/src/components/reports/ReportsDashboard.tsx
git commit -m "feat(pos-admin): show online (Cashfree) revenue summary alongside local sales in Reports"
```

---

### Task 13: Consolidated documentation

**Files:**
- Create: `docs/CASHFREE_CURRENT_API_RESEARCH.md`
- Create: `docs/CASHFREE_PAYMENT_ARCHITECTURE.md`
- Create: `docs/CASHFREE_SECURITY_MODEL.md`
- Create: `docs/CASHFREE_ONBOARDING_FLOW.md`
- Create: `docs/CASHFREE_WEBHOOK_FLOW.md`
- Create: `docs/CASHFREE_SETTLEMENT_FLOW.md`
- Create: `docs/CASHFREE_RECONCILIATION.md`

- [ ] **Step 1: Write each file**

Each document draws from the actual, by-then-shipped code (this module's files, this plan's own tasks, and the two design specs) rather than being reconstructed from memory — the implementer reads the real current source for each doc's subject immediately before writing it. No test to run (documentation); the check is that every code reference in each doc (file paths, function names, endpoint routes) is verified against the real, current file at write time — a stale reference here silently misleads the next reader in a way no test catches. Content outline for each (not exhaustive prose — a plan step names the shape, the writer fills it from real code):

- `CASHFREE_CURRENT_API_RESEARCH.md`: table of every Cashfree endpoint this codebase actually calls (Create Order + `order_splits`, Get Order Status, Create/Update/Get Vendor, Create Refund, Get Split and Settlement Details), each with its exact path, method, the field names this codebase sends/reads, and a link to the Cashfree doc page it was verified against.
- `CASHFREE_PAYMENT_ARCHITECTURE.md`: the end-to-end flow (kiosk → `POST /payments/orders` → Cashfree order+split → customer pays → webhook → ledger updated → POS/KDS informed via existing order-sync → settlement → reconciliation job → Super Admin dashboards), one paragraph per hop, each naming the real file/function that hop runs through.
- `CASHFREE_SECURITY_MODEL.md`: the RBAC area/role table (reproduced from `common/rbac/access.ts`), which routes require step-up password and why, webhook signature/replay verification, credential encryption, tenant isolation (RLS) — a security reviewer's map, explicit about what's covered and what (true per-restaurant merchant accounts) is explicitly out of scope and why.
- `CASHFREE_ONBOARDING_FLOW.md`: `RestaurantPaymentConnection`'s state machine (`NOT_CONNECTED → PENDING_VERIFICATION → ACTIVE ⇄ SUSPENDED → DISCONNECTED`), the exact Cashfree API call at each transition, who can trigger which transition (RBAC + step-up).
- `CASHFREE_WEBHOOK_FLOW.md`: signature verification (HMAC-SHA256 over timestamp+body, 5-minute replay window), idempotency (`providerEventKey` unique constraint), the event types actually handled (`PAYMENT_SUCCESS_WEBHOOK`, `REFUND_STATUS_WEBHOOK`, etc. — confirm the real list in `cashfree-webhook.controller.ts`/`processCashfreeWebhook` at write time).
- `CASHFREE_SETTLEMENT_FLOW.md`: how `order_splits` routes money, how commission is resolved (override → platform default → 0) and snapshotted, how refunds interact with an already-split payment (Cashfree's own proportional-reversal behavior, no code needed on this system's side).
- `CASHFREE_RECONCILIATION.md`: what the job checks, the four exception types and what each means for a human to investigate, how a Super Admin acknowledges one, the 7-day lookback window and why (payments older than that are assumed already resolved one way or another by the time anyone would routinely look).

- [ ] **Step 2: Commit**

```bash
git add docs/CASHFREE_CURRENT_API_RESEARCH.md docs/CASHFREE_PAYMENT_ARCHITECTURE.md docs/CASHFREE_SECURITY_MODEL.md docs/CASHFREE_ONBOARDING_FLOW.md docs/CASHFREE_WEBHOOK_FLOW.md docs/CASHFREE_SETTLEMENT_FLOW.md docs/CASHFREE_RECONCILIATION.md
git commit -m "docs: add consolidated Cashfree architecture, security, onboarding, webhook, settlement, and reconciliation docs"
```

---

### Task 14: Final full-suite regression pass and self-review

**Files:** none (verification only).

- [ ] **Step 1: Run the entire backend suite**

Run: `cd cloud/api && npx vitest run`
Expected: all tests pass, including every test added in Tasks 1-10.

- [ ] **Step 2: Run the root workspace suite**

Run: `npx vitest run` (from the repo root)
Expected: same pass count as the last known baseline (no root-level tests are added by this plan).

- [ ] **Step 3: Typecheck all three touched frontends**

Run each app's typecheck command; expected clean for all three.

- [ ] **Step 4: Self-review the full diff** (no subagent tool used for this project, per standing instruction)

Check especially: every step-up-protected route actually requires the password (not just the two tested in Task 3 — re-verify after Tasks 5-10 didn't accidentally add a new unprotected high-risk mutation); the reconciliation job's per-payment try/catch actually isolates failures (one broken payment doesn't stop the batch); no secret or password ever appears in a log statement or `details` JSON field anywhere added by this plan; the platform-wide summary endpoint's RBAC (`billing` area) is not accidentally more permissive than the per-restaurant one.

- [ ] **Step 5: Report to the user**

Summarize what was built, any rulings made along the way, and any deferred minor findings from the self-review.
