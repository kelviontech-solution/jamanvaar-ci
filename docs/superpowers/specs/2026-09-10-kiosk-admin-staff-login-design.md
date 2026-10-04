# Kiosk Admin Real Staff Login

Status: Approved for planning
Date: 2026-09-10
Scope: Prerequisite sub-project for Razorpay Payment Gateway Phase 2 (payment-connection onboarding UI). This spec covers only the login replacement; the payment-connection UI is a separate spec/plan that depends on this one.

## Context

Phase 1 of the Razorpay integration (already shipped) added `DeviceAuthGuard`-protected
endpoints that Kiosk Admin calls using its one-time device bearer token (the same
credential used for Task 6's menu-sync). Phase 2 was going to reuse that same device
token to gate submission of the restaurant's payment settlement/KYC details — but
Kiosk Admin's device token identifies *the physical device*, not *which staff member*
is using it right now. For a financial settlement action, that's not enough
accountability on its own.

Investigation of the existing app found:

- Kiosk Admin (`apps/kiosk-system/kiosk-admin`) has no real per-staff cloud session.
  Its only real cloud credential, acquired once during initial setup, is the device
  bearer token (`cloudClient.ts`'s `connectDeviceStep1`/`connectDeviceStep2`).
- Day-to-day "login" (`App.tsx`, `isKioskAdminLoggedIn`) is a **local-only, hardcoded
  demo-credential check** (`admin`/`kiosk-admin`/`manager` + `admin123`/`admin`/`demo`)
  with no cloud call at all, persisted via the shared `SessionPersistence` utility
  (`packages/business/src/session_persistence.ts`) — which explicitly generates a
  non-cryptographic local token and is used identically across POS/Captain/KDS, so it
  cannot be strengthened for Kiosk Admin alone without touching those other apps.
- The backend's `tenant-auth/login` endpoint already exists and already supports a
  **"direct" login path** (Case 3 in `tenant-auth.service.ts`'s `login()` — no
  `deviceType`/`deviceId` in the request — hit only when no device-flow field is
  passed) that returns real session tokens (`accessToken` + `refreshToken`) without
  touching the device-activation state machine at all. This is a clean seam: Kiosk
  Admin's new staff login can use this path without interacting with its already-
  separate device-activation flow.
- The refresh-token mechanism as it exists today (`tenant-auth.controller.ts`) sets an
  `httpOnly`, `sameSite: 'lax'` cookie and `/tenant-auth/refresh` reads the token
  *only* from that cookie. `sameSite: 'lax'` cookies are not sent on cross-origin
  `fetch()` calls (only top-level navigations) — and Kiosk Admin's Tauri webview
  calling the cloud API is exactly that: a cross-origin `fetch()`. The existing
  refresh mechanism will not work for Kiosk Admin as-is.

## Decisions (confirmed with the user)

- Real tenant-user login **replaces** the local demo-credential gate entirely — every
  Kiosk Admin session requires it, not just entry into sensitive settings sections.
- Only `OWNER` and `MANAGER` tenant-user roles may log into Kiosk Admin (`STAFF` is
  rejected) — enforced server-side, not just hidden in the UI.
- Sessions stay logged in indefinitely via silent background token refresh — no forced
  periodic re-login. A device that is lost/stolen while logged in is out of scope here
  (matches the risk profile of the physical device bearer token, which already has no
  expiry either).

## Goals

- Kiosk Admin's login screen authenticates a real `OWNER`/`MANAGER` tenant user
  against `cloud/api`, replacing the hardcoded demo check.
- The session survives indefinitely across normal use via silent refresh, with no
  reliance on cross-origin cookies (which don't work in this app's Tauri context).
- The existing one-time device-activation flow (`cloudClient.ts`'s
  `connectDeviceStep1`/`connectDeviceStep2`, producing the `KIOSK_ADMIN` `Device` row
  used by menu-sync and future payment endpoints) is untouched — it remains a
  separate, already-complete lifecycle. This spec adds a second, independent
  authentication layer (human session) alongside it, not a replacement.
- A logout action exists and actually invalidates the session server-side (not just a
  local state clear).

## Non-goals

- No changes to POS/Captain/KDS or their shared `SessionPersistence` usage.
- No change to the existing device-activation flow's own behavior.
- No password reset / "forgot password" flow (existing `set-initial-password` and
  Restaurant Admin-side password management are out of scope — this spec only adds a
  login screen that calls existing, already-correct backend auth).
- No UI for creating new OWNER/MANAGER accounts from within Kiosk Admin (that's
  `POST /api/v1/tenant/me/users`, already restricted to `OWNER` server-side, and
  already exists — out of scope to surface a UI for it here).

## Backend changes (`cloud/api`)

All changes are additive to the existing `tenant-auth` module — no new module, no new
guard, no new Prisma model.

### `dto/login.dto.ts`

Add two optional fields to `tenantLoginSchema`:

```ts
returnRefreshToken: z.boolean().optional(),
adminOnly: z.boolean().optional()
```

- `returnRefreshToken: true` — the response body includes `refreshToken` and
  `refreshTokenExpiresAt` directly (in addition to still setting the cookie, which
  browser-based callers continue to rely on unchanged). This is how a cross-origin
  client without usable cookies persists its own refresh token.
- `adminOnly: true` — the service rejects the login with `ForbiddenException` unless
  `matchedUser.role` is `OWNER` or `MANAGER`, checked immediately after password
  validation succeeds and before any device-flow branching (so it applies uniformly
  regardless of which of the three existing login cases — device-active,
  activation-required, or direct — would otherwise fire). Existing callers that don't
  pass this flag see no behavior change.

Both fields are opt-in and additive; no existing caller (device activation flows for
POS/Captain/KDS/KIOSK_ADMIN, or any other consumer of this endpoint) is affected
unless it explicitly sets them.

### `tenant-auth.service.ts`

In `login()`, immediately after the existing password/status/restaurant-status checks
and before the device-flow branching (`if (deviceId) { ... }`), add:

```ts
if (dto.adminOnly && matchedUser.role !== 'OWNER' && matchedUser.role !== 'MANAGER') {
  throw new ForbiddenException('This login is restricted to restaurant owners and managers.');
}
```

`refresh()` needs no change — it already returns `accessToken`/`user`; the controller
decides whether to also expose the rotated refresh token in the body (see below).
`logout()` also needs no service change — it already accepts a `refreshToken` string
and revokes it; only the controller needs to also read from the body (see below).

### `tenant-auth.controller.ts`

- `login()`: when `result.status === 'LOGIN_SUCCESS' && body.returnRefreshToken`,
  include `refreshToken`/`refreshTokenExpiresAt` in the returned object (the cookie is
  still set exactly as today, unconditionally, so this is purely additive).
- `refresh()`: read the refresh token from `req.cookies?.[REFRESH_COOKIE] ??
  req.body?.refreshToken` (cookie takes precedence when both are present — unchanged
  behavior for browser callers). Since this endpoint currently has no body validation,
  add a minimal Zod schema (`z.object({ refreshToken: z.string().optional() })`) via
  `ZodValidationPipe` for the new optional field. When the rotated token comes back,
  include `refreshToken`/`refreshTokenExpiresAt` in the response body whenever the
  incoming request supplied a body `refreshToken` (i.e., the caller is clearly a
  non-cookie client) — mirroring the same opt-in-by-usage pattern as login.
- `logout()`: currently only revokes a refresh token found in the cookie
  (`req.cookies?.[REFRESH_COOKIE]`) — a Kiosk Admin client has no cookie, so this
  would silently no-op the actual server-side revocation while still returning
  success. Change the token lookup to `req.cookies?.[REFRESH_COOKIE] ??
  req.body?.refreshToken`, same precedence as `refresh()`. No schema validation
  needed (a missing/wrong refresh token here just means nothing to revoke, not a
  security issue — the access token's own guard already confirmed the caller's
  identity).

### Security note

Returning the refresh token in a JSON body (rather than only `httpOnly`) is a real
trade-off — it becomes readable by JS in whatever process holds it, unlike a cookie.
This is acceptable here specifically because: (a) it's opt-in per-request, so browser
clients that never ask for it are unaffected and keep the stronger cookie-only
guarantee, and (b) Kiosk Admin is a Tauri desktop app storing the token in its own
local device storage, not a page an XSS payload could run inside — the threat model
is "physical device compromise," which already applies identically to the existing,
non-expiring device bearer token this same app already holds.

## Frontend changes (`apps/kiosk-system/kiosk-admin`)

### `src/cloud/cloudClient.ts`

Add a new, independent set of functions and storage keys — separate from the existing
device-activation storage (`RESTAURANT_ID_KEY`/`DEVICE_LABEL_KEY`/`DEVICE_TOKEN_KEY`),
and **not** using the shared `SessionPersistence` utility (its hard-coded 24-hour TTL
and non-cryptographic placeholder token are wrong for holding a real refresh token,
and it's shared code used identically by POS/Captain/KDS that this change must not
touch):

- `TENANT_ACCESS_TOKEN` — held in memory only (a module-level variable), never
  persisted — short-lived (15 min), refreshed silently, safe to lose on app restart
  since the refresh token recovers it.
- `TENANT_REFRESH_TOKEN_KEY = 'jamanvaar_kiosk_admin_tenant_refresh'` — persisted in
  `localStorage`, the credential that makes "stay logged in indefinitely" work.
- `TENANT_USER_KEY = 'jamanvaar_kiosk_admin_tenant_user'` — persisted display info
  (`{ id, fullName, role, restaurantId }`) so the UI can show who's logged in and
  restore that display without waiting on a network round-trip at startup.

New functions:

- `staffLogin(restaurantId, email, password): Promise<void>` — calls
  `POST /tenant-auth/login` with `{ restaurantId, email, password, returnRefreshToken:
  true, adminOnly: true }` (no `deviceType`/`deviceId`, landing on the backend's
  direct/Case-3 path). On success, stores the refresh token and user info, sets the
  in-memory access token, and starts the silent-refresh timer (below). On a 403
  (role-rejected) or 401 (bad credentials), throws `CloudApiError` with the server's
  message so the login screen can show it directly.
- `staffLogout(): Promise<void>` — calls `POST /tenant-auth/logout` (bearer-authed
  with the current access token, `{ refreshToken: <stored> }` in the body so the
  server can actually find and revoke it — this endpoint has no cookie to read from
  here, same reasoning as `refresh()`) to invalidate the refresh token server-side,
  then clears all three pieces of local state and stops the refresh timer. Server
  call failure (e.g. offline) still clears local state — logout must always succeed
  locally even if the server round-trip fails.
- `getTenantAccessToken(): string | null` — for use by other cloud calls this app
  will make as this user (e.g. the payment-connection submission in the next
  sub-project).
- `isStaffLoggedIn(): boolean` — checks for a persisted refresh token.
- `getStaffUser(): { fullName: string; role: string } | null` — reads the persisted
  display info.
- `startSilentRefresh()` / `stopSilentRefresh()` — an internal `setInterval` (fires
  well inside the 15-minute access-token TTL, e.g. every 10 minutes) that calls
  `POST /tenant-auth/refresh` with `{ refreshToken: <stored> }` in the body, updates
  the in-memory access token and the persisted (rotated) refresh token from the
  response. On failure (refresh token itself expired/revoked — e.g. after a very long
  period offline, or a server-side logout-elsewhere), clears all local state and stops
  the timer, so the app falls back to the login screen next time `isStaffLoggedIn()`
  is checked. `startSilentRefresh()` is called once at app init if `isStaffLoggedIn()`
  is true, and again right after a successful `staffLogin()`.

### `src/App.tsx`

- Replace the `isKioskAdminLoggedIn` state's initializer
  (`SessionPersistence.isValid('kiosk-admin')`) with `isStaffLoggedIn()` from
  `cloudClient.ts`.
- Replace the hardcoded `validUsername`/`validPassword` check (~line 226-236) with a
  call to `staffLogin(restaurantId, email, password)` (restaurantId comes from the
  already-connected device's persisted `RESTAURANT_ID_KEY`, read via the existing
  `isDeviceConnected()`/localStorage — a Kiosk Admin terminal only ever serves one
  restaurant, so there's no restaurant picker needed here, unlike the device-connect
  screen which establishes that binding in the first place). On success, set
  `isKioskAdminLoggedIn(true)`. On failure, show the server's error message in the
  existing error-display UI (replacing whatever generic "invalid credentials" message
  is there today).
- Replace the existing logout call site (~line 269, currently
  `SessionPersistence.clear('kiosk-admin')`) with `staffLogout()`.
- The login form's fields change from a single "username" field to "email" (matching
  what the backend actually expects), keeping the same visual layout/component
  structure otherwise.
- On app init (before rendering the main UI), call `startSilentRefresh()` if
  `isStaffLoggedIn()` — this can sit in the same effect that currently reads
  `SessionPersistence.isValid('kiosk-admin')` for the initial state.

## Testing

**Backend** (`cloud/api/test/tenant-auth.e2e.spec.ts` — extend the existing suite,
matching its established setup pattern):

- `returnRefreshToken: true` login includes `refreshToken`/`refreshTokenExpiresAt` in
  the JSON body (in addition to the cookie still being set).
- Login without `returnRefreshToken` behaves exactly as today (no new fields in the
  body) — a regression guard proving the change is truly additive.
- `adminOnly: true` login succeeds for an `OWNER`, succeeds for a `MANAGER`, and is
  rejected with 403 for a `STAFF` user (using the existing self-service staff-login
  creation endpoint to set up a STAFF fixture).
- `POST /tenant-auth/refresh` with `{ refreshToken }` in the body (no cookie) succeeds
  and rotates the token, returning the new one in the body.
- `POST /tenant-auth/refresh` with cookie present takes precedence over a body value
  (or simply: cookie-only refresh continues to work unchanged — existing behavior,
  regression guard).
- `POST /tenant-auth/logout` with `{ refreshToken }` in the body (no cookie) actually
  revokes that refresh token — verified by confirming a subsequent
  `POST /tenant-auth/refresh` with the same token is rejected. Cookie-based logout
  continues to work unchanged (regression guard).

**Frontend**: manual verification in the Tauri dev environment — login with a real
OWNER/MANAGER account, confirm a STAFF account is rejected with the server's message,
confirm the session survives an app reload (refresh token round-trip), confirm logout
actually clears the session (reload lands back on the login screen), and confirm the
existing device-activation flow (`connectDeviceStep1`/`connectDeviceStep2`) still
works unchanged and independently of this new login.

## Open items carried to the next sub-project (explicitly out of scope here)

- The actual payment-connection settlement/KYC submission screen and the
  `getTenantAccessToken()`-authenticated endpoint it calls — this spec only builds the
  login/session layer that screen will sit behind.
