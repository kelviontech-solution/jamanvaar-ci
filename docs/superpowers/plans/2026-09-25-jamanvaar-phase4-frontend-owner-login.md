# JAMANVAAR Phase 4: Kiosk Admin / Restaurant Admin Frontend Login Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, in-session).
> Subagents disallowed. **This plan has NO automated test harness** — neither `kiosk-admin` nor
> `pos-admin` has any test runner configured (confirmed: no test script in either
> `package.json`, no `*.test.*` files). Per explicit user decision, verification here is:
> (1) `npx tsc --noEmit` on each app as a type-safety net, and (2) actually launching the app
> (`npm run dev`) and clicking through the new flow against the real backend. There is no
> RED/GREEN cycle to follow for the UI edits themselves — each task's "verify" step says
> exactly what to click and what to expect instead.

**Goal:** Replace "Restaurant ID (UUID) + Login Email + Password" with "Restaurant ID (JM
code) + Password" on both Kiosk Admin's connect/login screens and Restaurant Admin
(`pos-admin`)'s login screen, backed by Phase 3's `login-owner`/`forgot-password-owner`/
`reset-password-owner` endpoints. Device activation-key screens are untouched — only the
credential-entry screens change.

**Spec:** `docs/superpowers/plans/2026-09-24-jamanvaar-commercial-platform-redesign-MASTER.md`
(§ "Phase 4") and Phase 3's plan (`login-owner` etc., already shipped).

## Findings from reading the actual code (corrects the master plan's Phase 4 description)

- **Kiosk Admin has two separate screens**, not one: `handleConnectCredentials` (first-time
  "Connect this Terminal" — today asks Restaurant ID **UUID** + Login Email + Password, calling
  `connectDeviceStep1`/`connectDeviceStep2`) and `handleKioskAdminLogin` (daily login, after the
  device is already connected — today asks only Login Email + Password, since
  `getConnectedRestaurantId()` already has the restaurant's internal UUID stored locally).
  **Both** need the email field removed; the connect screen's "Restaurant ID" field changes
  from expecting a raw UUID to expecting the `JM…` code, and the daily-login screen needs no
  Restaurant ID field at all (it's already known locally) — just password.
- Kiosk Admin has **no forgot-password UI at all today** — this is wholly new.
- **`pos-admin` (Restaurant Admin) combines both into one screen**: `handleAdminLogin` calls
  `cloudLogin(usernameOrEmail, password)`, which returns either `LOGIN_SUCCESS` or
  `ACTIVATION_REQUIRED` (prompting inline for the activation key) — mirroring the backend's own
  `TenantAuthResponse` union. It already has a `ForgotPasswordPanel.tsx` (email-based, BUG-142).
  Since `pos-admin` never has a locally-stored restaurantId before login (no separate connect
  step), it always needs the **restaurantCode** (typed), never the internal UUID shortcut.
- Backend gap found: `loginOwner` (Phase 3) only accepts `restaurantCode`. Kiosk Admin's daily
  login screen has an already-known internal UUID and shouldn't have to ask the user to
  re-type/remember the restaurant code on every login — it needs `loginOwner` to also accept an
  already-resolved `restaurantId` directly, mirroring how the existing email-based `login()`
  already accepts an optional `restaurantId`. This is a small, backward-compatible backend
  addition, done first as Task 1 (with real TDD — the backend has test infra).

## Global Constraints

- Device activation-key entry (`connectDeviceStep2`, `handleActivateSubmit`) is unchanged —
  only credential-entry screens change.
- `pos-admin`'s and Kiosk Admin's *existing* email+password paths must keep working during this
  phase (an already-connected device with staff/manager logins other than the owner still needs
  email+password — this phase adds owner-only restaurant-code login *alongside*, consistent
  with Phase 3's backend design; it does not delete `cloudLogin`/`staffLogin`).
- Never send a raw UUID to the new owner-login endpoints — always the `JM…` code (typed) or the
  internal UUID via the new `restaurantId` field (already-connected device only).
- Match each app's existing visual style (JAMANVAAR design tokens, existing form classes) —
  don't introduce a different look for the new fields.

---

### Task 1: Backend — `loginOwner` accepts `restaurantId` as an alternative to `restaurantCode`

**Files:**
- Modify: `cloud/api/src/modules/tenant-auth/dto/login.dto.ts` (`loginOwnerSchema`)
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts` (`loginOwner`)
- Test: `cloud/api/test/owner-login.e2e.spec.ts` (extend)

- [ ] **Step 1: Write the failing test**

Add to `owner-login.e2e.spec.ts`:

```typescript
  it('logs the owner in with the internal restaurantId directly (no restaurantCode needed)', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantId, password: ownerPassword });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('OWNER');
  });

  it('rejects login-owner when neither restaurantCode nor restaurantId is given', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ password: ownerPassword });
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: Run to verify RED**

Run: `cd cloud/api && npx vitest run test/owner-login.e2e.spec.ts`
Expected: FAIL — `restaurantId` isn't accepted by the schema yet (400 "unrecognized key" or
similar on the first new test; the second test's 400 may already pass by coincidence — confirm
by reading the actual output, don't assume).

- [ ] **Step 3: Update the schema and service**

In `login.dto.ts`:

```typescript
export const loginOwnerSchema = z.object({
  restaurantCode: z.string().trim().toUpperCase().optional(),
  restaurantId: z.string().uuid().optional(),
  password: z.string().min(1, 'Password is required'),
  deviceId: z.string().optional(),
  deviceToken: z.string().optional(),
  deviceType: z.enum(['POS', 'CAPTAIN', 'KDS', 'KIOSK', 'POS_ADMIN', 'KIOSK_ADMIN']).optional(),
  appVersion: z.string().optional(),
  returnRefreshToken: z.boolean().optional()
}).refine((v) => Boolean(v.restaurantCode || v.restaurantId), { message: 'Either restaurantCode or restaurantId is required', path: ['restaurantCode'] });
export type LoginOwnerDto = z.infer<typeof loginOwnerSchema>;
```

In `tenant-auth.service.ts`'s `loginOwner`, replace the restaurantId resolution:

```typescript
  async loginOwner(dto: LoginOwnerDto): Promise<TenantAuthResponse> {
    const restaurantId = dto.restaurantId ?? (await this.restaurants.resolveByCode(dto.restaurantCode!)).restaurantId;
    // ...unchanged from here...
```

- [ ] **Step 4: Run to verify GREEN**

Run: `cd cloud/api && npx vitest run test/owner-login.e2e.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Regression + typecheck**

Run: `cd cloud/api && npx vitest run test/tenant-auth.e2e.spec.ts test/owner-login.e2e.spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add cloud/api/src/modules/tenant-auth/dto/login.dto.ts cloud/api/src/modules/tenant-auth/tenant-auth.service.ts cloud/api/test/owner-login.e2e.spec.ts
git commit -m "feat: let login-owner accept an already-known restaurantId directly"
```

---

### Task 2: Kiosk Admin — `cloudClient.ts` owner-login functions

**Files:**
- Modify: `apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts`

Read `connectDeviceStep1`, `staffLogin`, `startSilentRefresh`'s token-handling, and
`cloudRequestPasswordReset`-equivalent (if any exists here — likely none, per the findings
above) in full before writing, to match their exact response-handling/storage conventions
(which localStorage keys get set, what shape errors are thrown as).

- [ ] **Step 1: Add `connectDeviceStep1Owner`**

Mirrors `connectDeviceStep1`'s exact behavior (same return shape: `{ status: 'CONNECTED' }` or
`{ status: 'ACTIVATION_REQUIRED', activationSessionToken, restaurantName }`), but posts to
`/api/v1/tenant-auth/login-owner` with `{ restaurantCode, password, deviceType: 'KIOSK_ADMIN', appVersion }`
instead of `/api/v1/tenant-auth/login` with `{ restaurantId, email, password, deviceType: 'KIOSK_ADMIN' }`.

- [ ] **Step 2: Add `connectDeviceStep2Owner`**

Same as `connectDeviceStep2` but takes `restaurantCode` instead of `restaurantId`/`email` (the
activation-key redemption call itself doesn't need either — check `connectDeviceStep2`'s body
first; if it only needs the code + activationSessionToken, this may just be a thin rename, not
a new function — read it before deciding).

- [ ] **Step 3: Add `staffLoginOwner`**

Mirrors `staffLogin(restaurantId, email, password)`'s exact token-storage side effects, but
signature is `staffLoginOwner(restaurantId: string, password: string)`, posting to
`/api/v1/tenant-auth/login-owner` with `{ restaurantId, password, deviceType: 'KIOSK_ADMIN' }`
(Task 1's new `restaurantId` field — no code lookup needed, the device already knows it).

- [ ] **Step 4: Add `requestPasswordResetOwner` / `resetPasswordOwner`**

New — Kiosk Admin has no forgot-password today. `requestPasswordResetOwner(restaurantCode: string): Promise<{ maskedEmail: string }>`
posting to `/api/v1/tenant-auth/forgot-password-owner`; `resetPasswordOwner(restaurantCode: string, otp: string, newPassword: string): Promise<void>`
posting to `/api/v1/tenant-auth/reset-password-owner`.

- [ ] **Step 5: Typecheck**

Run: `cd apps/kiosk-system/kiosk-admin && npx tsc --noEmit`
Expected: no errors (the new functions aren't called from `App.tsx` yet, so this only checks
the functions themselves compile).

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts
git commit -m "feat: add owner-login/forgot-password cloud functions to kiosk-admin"
```

---

### Task 3: Kiosk Admin — wire the new screens

**Files:**
- Modify: `apps/kiosk-system/kiosk-admin/src/App.tsx`

- [ ] **Step 1: Connect screen — replace Login Email with nothing, change Restaurant ID's meaning**

Replace `handleConnectCredentials` to call `connectDeviceStep1Owner(connectRestaurantId, connectPassword)`
instead of `connectDeviceStep1(connectRestaurantId, connectEmail, connectPassword)`. Remove the
`connectEmail` state variable and its input field (the `<div>` block with the "Login Email *"
label). Update the "Restaurant ID *" field's placeholder from
`"Paste the ID, e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"` to `"e.g. JM9876543210"`, and its
helper text to say the restaurant's ID is the `JM…` code shown in Super Admin / Restaurant
Admin, not the internal UUID. Update `connectDeviceStep2`'s call site similarly if Task 2 Step
2 found it needs a different argument.

- [ ] **Step 2: Daily login screen — remove the email field**

Replace `handleKioskAdminLogin`'s body to call `staffLoginOwner(restaurantId, authPassword)`
(the local `restaurantId` variable it already computes via `getConnectedRestaurantId()`)
instead of `staffLogin(restaurantId, authEmail, authPassword)`. Remove the `authEmail` state
variable and its input field/label in the JSX (find it near `authPassword`'s own field, lines
~1300-1350 per the earlier read).

- [ ] **Step 3: Add a forgot-password panel**

Create `apps/kiosk-system/kiosk-admin/src/components/ForgotPasswordPanel.tsx`, closely modeled
on `pos-admin`'s `ForgotPasswordPanel.tsx` (same two-step EMAIL→CODE structure) but:
- Its first step asks for **Restaurant ID** (the `JM…` code) instead of email — this restaurant
  is already connected, so it can default-fill from the locally-known code if Kiosk Admin
  stores one, or just let the operator retype it.
- Calls `requestPasswordResetOwner(restaurantCode)` (Task 2) instead of
  `cloudRequestPasswordReset(email)`, and shows the returned `maskedEmail` in its info banner
  ("Code sent to o***@example.com") instead of the generic BUG-142 message pos-admin shows
  (pos-admin's own generic message is because it deliberately doesn't reveal whether the email
  exists — restaurant-code lookup doesn't have that constraint, per Phase 1/3's rulings, so
  showing the real masked email here is correct, not a regression).
- Calls `resetPasswordOwner(restaurantCode, otp, newPassword)` instead of
  `cloudResetPassword(email, otp, newPassword)`.

Wire a "Forgot Password?" link/button on the daily-login screen that shows this panel, matching
how `pos-admin`'s `authScreenState === 'FORGOT'` toggling works (read that pattern in
`pos-admin/src/App.tsx` first and mirror its shape here, even though Kiosk Admin's overall
screen-state management may differ in variable names — find the closest existing equivalent
before inventing a new pattern).

- [ ] **Step 4: Typecheck**

Run: `cd apps/kiosk-system/kiosk-admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification (no automated test harness exists for this app)**

1. Ensure `cloud/api`'s dev server is running (`npm run dev:cloud-api` from repo root, or the
   combined `npm run dev` — check `package.json` at repo root for the exact script name) against
   the local dev database.
2. From Super Admin (or directly via API), create a fresh test restaurant with a mobile number,
   note its `restaurantCode`, and set the owner's password via `set-initial-password`.
3. Run `cd apps/kiosk-system/kiosk-admin && npm run dev`, open the app.
4. On "Connect this Terminal": enter the `JM…` code and the owner's password. Expected: either
   moves to the activation-key step (first device) or connects directly if entitlements/quota
   already had a device — confirm which, and that no email field appears anywhere.
5. Complete activation with a real `KIOSK_ADMIN` activation key generated via Super Admin/API.
6. Log out (if the app lands logged-in post-activation) and log back in on the daily-login
   screen using only the password — confirm no email/Restaurant ID field appears there.
7. Click "Forgot Password?", enter the `JM…` code, confirm a masked email is shown and a real
   email arrives (check the dev SMTP setup/logs) with a 6-digit code; complete the reset; log in
   again with the new password.
8. Note any UI/UX rough edges observed for a follow-up, but do not treat visual polish as a
   blocker for this task's completion — functional correctness is the bar.

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk-system/kiosk-admin/src/App.tsx apps/kiosk-system/kiosk-admin/src/components/ForgotPasswordPanel.tsx
git commit -m "feat: switch Kiosk Admin connect/login screens to Restaurant ID + password"
```

---

### Task 4: Restaurant Admin (`pos-admin`) — owner-login + restaurant-code forgot-password

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts`
- Modify: `apps/restaurant-system/pos-admin/src/App.tsx`
- Modify: `apps/restaurant-system/pos-admin/src/components/auth/ForgotPasswordPanel.tsx`

Read `cloudLogin`, `cloudRequestPasswordReset`, `cloudResetPassword`, `getStoredRestaurantId`
in `pos-admin/src/cloud/cloudClient.ts` in full before writing, to match their exact
conventions (this app's cloudClient.ts is a separate file from kiosk-admin's, likely with
different internal structure despite similar exported function names).

- [ ] **Step 1: Add `cloudLoginOwner(restaurantCode, password)` to `pos-admin`'s cloudClient.ts**

Mirrors `cloudLogin`'s exact return-shape handling (`LOGIN_SUCCESS`/`ACTIVATION_REQUIRED`), but
posts to `/api/v1/tenant-auth/login-owner` with `{ restaurantCode, password, deviceType: 'POS_ADMIN' }`.

- [ ] **Step 2: Add `cloudRequestPasswordResetOwner` / `cloudResetPasswordOwner`**

Same shape as Task 2 Step 4's kiosk-admin versions, targeting the same two backend endpoints.

- [ ] **Step 3: Wire `handleAdminLogin` to the new field**

Replace the "username/email" input (`authUsername` state — check its exact declaration; the
label already says "username/email" loosely, so this may already be flexible, but the backend
call must change) with a "Restaurant ID" field, and call `cloudLoginOwner(restaurantId, authPassword)`
instead of `cloudLogin(trimmedUser, authPassword)`.

- [ ] **Step 4: Update `ForgotPasswordPanel.tsx`**

Change its first step from "Email" to "Restaurant ID", call `cloudRequestPasswordResetOwner`/
`cloudResetPasswordOwner` instead of the email-based pair, and show the returned `maskedEmail`
in the info banner (same reasoning as Task 3 Step 3 — showing the real masked email here is
correct, not a regression, since restaurant-code lookup was never enumeration-protected).

- [ ] **Step 5: Typecheck**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Same procedure as Task 3 Step 5, but against `pos-admin` (`npm run dev` in that app's
directory) — confirm the combined login/activation screen and the forgot-password panel both
work end to end with just Restaurant ID + password.

- [ ] **Step 7: Commit**

```bash
git add apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts apps/restaurant-system/pos-admin/src/App.tsx apps/restaurant-system/pos-admin/src/components/auth/ForgotPasswordPanel.tsx
git commit -m "feat: switch Restaurant Admin login to Restaurant ID + password"
```

## Self-Review Notes

1. **Spec coverage:** sections 7 (Kiosk Admin login complexity), 33/54 (Kiosk Admin login
   target UI), 34 (Kiosk password recovery) → Tasks 2-3. The equivalent Restaurant Admin
   experience (implied throughout, explicit in the master plan's Phase 4) → Task 4.
2. **Placeholder scan:** several steps say "read X first, then decide" rather than prescribing
   exact code — this is intentional given neither app's cloudClient.ts internals were read in
   full while drafting this plan (unlike every backend file in Phases 1-3, which were read
   before their steps were written). Each such step names exactly what to read and what
   decision hinges on it, so it's a verification gate, not a silent gap.
3. **Type consistency:** `staffLoginOwner(restaurantId, password)` vs `connectDeviceStep1Owner(restaurantCode, password)`
   deliberately take different first arguments (id vs code) — matching Task 1's backend schema
   accepting either, and each frontend call site using whichever one it actually has on hand.
4. **Review Focus:**
   - The connect screen's Restaurant ID field must reject a pasted raw UUID gracefully (the
     backend's `resolveByCode` 404s on anything not matching `JM` + 10 digits) — the error
     message shown must not be a raw technical one; check `connectError`'s handling covers this.
   - A device that's already connected but whose owner password was reset from Super Admin
     mid-session must not silently keep a stale session — out of scope for this phase (existing
     session-invalidation-on-reset behavior from BUG-142 already handles this via
     `resetPassword`'s refresh-token revocation), verify during Task 3/4's manual pass that
     logging in again after a reset actually requires the new password (proves the old session
     was really killed, not just that the UI moved on).
