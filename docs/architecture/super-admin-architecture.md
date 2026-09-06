# JAMANVAAR Super Admin — Audit & Architecture Proposal

Status: **audit + proposal only — nothing in this document has been implemented.** Per the request that produced it, no code has been written; every claim below was verified by reading the actual source, not inferred from memory or specification docs.

---

## A. Current implementation — what's already built

More of the platform side exists than the screenshot suggested. The Super Admin dashboard you saw is not the whole system — it's a real, working front end over a real, working backend that simply hasn't been made to *feel* like an onboarding-driven SaaS console yet.

**Backend (`cloud/api`, NestJS + Prisma + PostgreSQL):**
- Full CRUD modules, all platform-JWT-guarded, all audited: **Restaurants**, **Plans**, **Subscriptions**, **Activation Keys**, **Devices**, **Branches**, **Owners**, plus **Audit Log query**, **Dashboard** (counts/MRR/ARR), **System Health**, and **Sessions** (refresh-token management).
- PostgreSQL Row-Level Security genuinely enforced (`ENABLE`+`FORCE ROW LEVEL SECURITY`) on `Restaurant`, `Branch`, `User`, `Device`, `Subscription`, `ActivationKey` — proven fail-closed by `tenant-isolation.spec.ts` (a bare query with no context sees zero rows, not all rows).
- 46 backend tests across 5 spec files, all currently green, covering auth, restaurant lifecycle, every SaaS module, and tenant isolation.
- `Restaurant` creation already does the right atomic thing: one transaction creates the Restaurant + a default `MAIN` branch + a pending-activation `User` (role OWNER).
- `Branch` creation already enforces the plan's `maxBranches` limit against the restaurant's active subscription.
- `ActivationKey` generation already produces non-predictable `JMV-XXXX-XXXX-XXXX` codes via `crypto.randomBytes`, with collision retry.

**Super Admin frontend (`cloud/super-admin-web`):** every nav item leads to a real page wired to a real endpoint — nothing is a stub or fake data (confirmed page-by-page). Plans already has full entitlement-editing UI (a 19-flag checkbox grid). Restaurant detail is a genuine 7-tab console (Overview / Owner & Users / Branches / Subscription / Activation Keys / Devices / Activity), not a popup.

So the honest starting position is: **the platform's data model, tenant isolation, and CRUD surface are solid.** What's missing is connective tissue — the parts that turn "six independent CRUD screens" into "a SaaS console with an onboarding flow" — and two specific unbuilt subsystems (tenant auth, activation redemption). Those are detailed in B.

---

## B. Missing features

In priority order, each confirmed absent by reading the code (not inferred):

1. **No tenant/restaurant-user authentication exists anywhere.** Only Super Admin (`PlatformUser`) can log into anything. The `User` (restaurant owner/manager/staff) model exists in the schema, has a `passwordHash` column, and is fully RLS-isolated — but no login endpoint, JWT strategy, or guard for it exists in `cloud/api`, and `cloud/super-admin-web` has no restaurant-owner login path either. Restaurant Admin (`apps/restaurant-system/pos-admin`) currently has **no cloud login at all** — it's a fully local, offline app.
2. **No activation-code redemption endpoint.** `POST /api/v1/activation-keys` (generate) exists; nothing lets a device turn a code into a registered `Device` row. `DevicesService` has no `create`/`register` method — it's explicitly a read/revoke-only surface today, by its own code comment.
3. **No onboarding orchestration.** Creating a restaurant, assigning a plan, and generating an activation key are three separate, disconnected API calls and three separate frontend actions. Nothing chains them, tracks completion, or presents a review step.
4. **Plan entitlements are stored but never enforced or read back.** The 19 boolean `PlanEntitlements` flags live on `Plan.entitlements` (JSON) and are editable in Super Admin — but no endpoint anywhere returns "this restaurant's current entitlements," and no guard gates any route on one.
5. **Three disconnected feature/entitlement catalogs exist in the codebase, with no mapping between them** (full detail in §E). This is why the screen you screenshotted shows 183/173 features that have no relationship to what Super Admin's Plans page actually controls.
6. **Restaurant Admin's "Subscription Plans" screen is a local mock**, not connected to `cloud/api` in any way (detail in §E).
7. Minor, lower-priority gaps: the header search bar in Super Admin doesn't actually filter; the notification bell is inert; the "PLATFORM ONLINE" pill is hardcoded rather than derived from the real system-health check.

---

## C. Existing models

`cloud/api/prisma/schema.prisma` — 10 models. RLS column shows which are tenant-isolated:

| Model | Purpose | RLS |
|---|---|---|
| `PlatformUser` / `PlatformRefreshToken` | Super Admin identity + session tokens | No (platform-global) |
| `Restaurant` | Tenant root | **Yes** |
| `Branch` | Physical location under a restaurant | **Yes** |
| `User` | Tenant user (OWNER/MANAGER/STAFF) — *no login path yet* | **Yes** |
| `Plan` | Platform-wide catalog (CORE/PRO/ENTERPRISE), `entitlements` as JSON | No (global catalog) |
| `Subscription` | Restaurant ↔ Plan assignment, lifecycle status | **Yes** |
| `ActivationKey` | One-time code, `redeemedByDeviceId` is a bare string (**no FK to Device**) | **Yes** |
| `Device` | POS/CAPTAIN/KDS/KIOSK registration record — *no path creates one yet* | **Yes** |
| `AuditLog` | Append-only platform+tenant action ledger | No (platform-readable ledger by design) |

Also relevant, outside `cloud/api`: `packages/types/src/domain.ts` defines `PlanTier` and a 19-key `PlanEntitlements` interface that matches `cloud/api`'s entitlement schema exactly — these two are already consistent with each other. `packages/business/src/license_entitlements.ts` defines a third, much shorter (11+7 item) `PLAN_DEFINITIONS` marketing list that nothing currently imports.

---

## D. Existing APIs

All under `api/v1/`, all `PlatformAuthGuard`-protected except login/refresh:

```
platform-auth/    POST login, POST refresh, POST logout
platform/         GET me, PATCH me/password, GET dashboard, GET system-health,
                  GET sessions, DELETE sessions/:id
restaurants/      POST, GET, GET/:id, PATCH/:id, PATCH/:id/suspend, PATCH/:id/reactivate
plans/            GET, GET/:id, POST, PATCH/:id, PATCH/:id/activate, PATCH/:id/deactivate
subscriptions/    GET, GET/:id, POST, PATCH/:id/change-plan, PATCH/:id/renew,
                  PATCH/:id/suspend, PATCH/:id/reactivate
activation-keys/  GET, GET/:id, POST, PATCH/:id/revoke
devices/          GET, GET/:id, PATCH/:id/revoke              ← no POST (register)
branches/         GET, POST, PATCH/:id, PATCH/:id/activate, PATCH/:id/deactivate
owners/           GET, GET/:id, PATCH/:id, PATCH/:id/activate, PATCH/:id/suspend
audit-logs/       GET, GET/categories
```

Nothing under `tenant/` or equivalent exists — there is no authenticated surface a restaurant's own app could call.

---

## E. Existing plan system — the actual state (this is the crux of what "isn't real")

There are **three independent representations of "what a plan includes"** in the codebase today, and they don't reference each other:

1. **`PlanEntitlements`** (`packages/types/src/domain.ts`, mirrored in `cloud/api/src/modules/plans/entitlements.ts`) — 19 coarse boolean flags: `posTerminal`, `offlineBilling`, `dineInTakeawayDeliveryToken`, `menuManagement`, `foodCustomization`, `discountsAndGst`, `multiPaymentTenders`, `tableManagement`, `customerManagement`, `kotKdsRouting`, `receiptPrinting`, `shiftAndCashDrawer`, `salesAndGstReports`, `inventoryManagement`, `posAssistant`, `restaurantAdmin`, `captainApp`, `advancedCaptainReports`, `advancedServiceWorkflow`. **This is the only one connected to a real database column** (`Plan.entitlements`) and the only one editable in Super Admin.
2. **`PLAN_DEFINITIONS`** (`packages/business/src/license_entitlements.ts`) — an 11-item CORE / 7-item PRO marketing bullet list. Defined, imported by nothing.
3. **The screen you screenshotted** (`apps/restaurant-system/pos-admin/src/components/settings/SubscriptionPlansView.tsx`) — 183 CORE + 181 PRO features as **literal hardcoded string arrays inside the React component**, grouped into categories ("POS & Fast Billing", "Wireless Captain / Waiter App", etc.). Not imported from any shared package. Not fetched from any API. The on-screen "173" label doesn't even match the actual 181-item array length — it's hand-typed marketing copy, not `.length`.

That screen's "Active Plan: JAMANVAAR PRO" and its Activate buttons read/write a **local, in-memory/localStorage `LicenseRepository`** (`packages/database/src/repositories.ts`), seeded by default to PRO in `packages/database/src/db.ts`. Its "dealer key" activation does a client-side `key.includes('PRO')` string check — zero validation, zero connection to `cloud/api`. This screen is currently a fully offline, unauthenticated feature-comparison-and-mock-switcher — not a subscription management surface.

**This is not a bug to patch — it's the core design gap the rest of this proposal exists to close.** See §I.4.

---

## F. Existing activation system

What exists: Super Admin can generate a code (`JMV-XXXX-XXXX-XXXX`, cryptographically random, retried on collision) scoped to a restaurant, optionally a subscription, and an allowed device type. That's the entire built half.

What doesn't exist: any endpoint for a device to present that code and become a registered `Device`. `ActivationKeyStatus` has a `REDEEMED` value and the schema has `redeemedAt`/`redeemedByDeviceId` columns — the data model anticipated this, but no code path writes to them. `Device.publicKey` likewise anticipates a future keypair-based device identity, unpopulated by anything today. The one existing test that produces a `Device` row does so by inserting directly via Prisma, with an explicit comment that it's "simulating a future activation."

---

## G. Existing authentication

One system, not two: **Super Admin (`PlatformUser`) only.** JWTs are scoped with `issuer`/`audience: 'jamanvaar-platform'`, checked by `PlatformAuthGuard` on every protected route. Refresh tokens are opaque, sha256-hashed, rotating, revocable. A test explicitly forges a token with issuer `jamanvaar-tenant` to prove the guard rejects it even with the correct secret — the codebase itself documents, in its own tests, that tenant auth is intentionally not yet built (not an oversight).

The `User` model's `passwordHash` is nullable, set to `null` at creation, and never read or written by anything else — the column exists for a login system that doesn't exist yet.

---

## H. Existing tenant isolation

This is the strongest-built part of the system and needs no changes. `PrismaService.runAsPlatform(fn)` and `runAsTenant(restaurantId, fn)` both open a transaction and set a Postgres session-local (`app.is_platform_context` / `app.current_restaurant_id`) that every RLS policy reads. Every current service uses `runAsPlatform` (correct, since Super Admin is the only authenticated actor today); `runAsTenant` is fully implemented and proven correct by `tenant-isolation.spec.ts` but has zero production callers yet, because there's no tenant-authenticated request that would need it. Building tenant auth (§I.1) is what will finally give `runAsTenant` a real caller.

---

## I. Proposed architecture

Four independent workstreams. Each connects to what already exists rather than replacing it — no proposal here duplicates a working system.

### I.1 — Tenant authentication (`TenantAuthModule`)

Mirror `PlatformAuthModule`'s structure exactly, scoped to `User` instead of `PlatformUser`:
- JWT `issuer`/`audience: 'jamanvaar-tenant'` (already proven distinct from platform tokens by the existing test).
- Claim carries `restaurantId` so `TenantAuthGuard` can call `runAsTenant(restaurantId, ...)` directly — this is what finally gives the already-built RLS tenant path a real caller.
- Login sets the (currently null) `User.passwordHash` on first activation — this is also the natural place to turn a `PENDING_ACTIVATION` user `ACTIVE` once they set a password via an invitation link.
- This unblocks: Restaurant Admin getting a real cloud login, and a real `GET /api/v1/tenant/me/entitlements` endpoint (see I.4) that any client app can call once authenticated.

### I.2 — Activation redemption + device registration

One new endpoint, deliberately *not* behind `PlatformAuthGuard` or `TenantAuthGuard` (a device doesn't have either kind of session yet at this point) — instead validated purely by the activation code itself:

```
POST /api/v1/activation/redeem
  body: { code, deviceType, appVersion, deviceInfo? }
  → validates ActivationKey is ACTIVE, not expired, deviceType matches (or ANY)
  → creates Device (status ACTIVE) scoped to the key's restaurantId/branchId
  → marks ActivationKey REDEEMED, sets redeemedAt + redeemedByDeviceId
  → all in one transaction (runAsPlatform, since no tenant session exists yet at this call)
```
This is a small, additive change to `ActivationKeysService` + `DevicesService` — no new models, no schema change beyond what already anticipates it (`redeemedAt`/`redeemedByDeviceId`/`Device.status` all already exist).

### I.3 — Onboarding as a frontend-orchestrated wizard, not a new backend mega-endpoint

Recommendation: build the multi-step wizard in `cloud/super-admin-web` calling the **three existing endpoints** in sequence (create restaurant → assign subscription → generate activation key), with a review step before the final call and a results screen showing the generated code. This is deliberately *not* a new `POST /restaurants/onboard` backend endpoint, because:
- Each of the three operations is already independently correct, tested, and audited — a new orchestration endpoint would either duplicate that logic or need to call the three services internally anyway, for no real gain.
- A frontend wizard can show progress and let the operator recover from a partial failure (e.g., restaurant created but plan assignment failed) without needing new backend rollback logic.
- If a fully atomic single-transaction version is wanted later, it's a small refactor of the wizard's last step into one new service method — not a rewrite.

### I.4 — Unifying the plan/entitlement system (this is the important one)

Do not try to make the backend track all ~360 individual named features — that's the wrong level of granularity for an enforcement mechanism and would be a large, brittle undertaking for no functional gain. Instead:

- Keep the **19-key `PlanEntitlements`** as the single real enforcement mechanism (already correctly modeled, already the only one wired to the database).
- Introduce **one shared catalog** (new file, e.g. `packages/types/src/planFeatureCatalog.ts`) that maps each of the 19 entitlement keys to its descriptive feature list — this is where the ~360 granular feature names from `SubscriptionPlansView.tsx` belong, reorganized as "features unlocked by entitlement X" rather than a flat hardcoded array.
- `SubscriptionPlansView.tsx` imports this catalog instead of hardcoding it — same visual result, but now the feature-count labels are computed (`.length`) instead of hand-typed (fixing the 173-vs-181 discrepancy as a side effect), and Super Admin's Plan editor can show "this plan will unlock these N features" using the same source.
- Once I.1 (tenant auth) exists, add `GET /api/v1/tenant/me/entitlements` returning the restaurant's active-subscription plan's entitlements + limits. `SubscriptionPlansView.tsx` then reads *that* instead of the local `LicenseRepository` mock, and its "Activate" action becomes a real `POST /api/v1/subscriptions` (assign/change-plan) call through the new tenant auth — replacing the string-matching "dealer key" activation with a real one.
- `packages/business/src/license_entitlements.ts`'s unused 11+7 list should be deleted once the shared catalog exists, rather than left as a fourth representation.

### Explicitly not proposed here

Per your instruction not to duplicate systems: no second Plan model, no second activation system, no second auth system, no rewrite of POS/Captain/KDS/Kiosk. Restaurant Admin keeps its existing local-first offline architecture — I.1's tenant login is additive (an *optional* cloud session on top of the existing local app), not a replacement of local operation.

---

## J. Implementation plan

Suggested order, each independently verifiable (typecheck + existing test suite + new tests for the new surface), matching the phasing you specified in your original message:

1. **I.4 first (shared feature catalog)** — lowest risk, no backend/schema change, immediately fixes the 173/181 discrepancy and gives Super Admin's Plan editor better UX. Good proof that "connect, don't duplicate" works before touching auth.
2. **I.1 (tenant auth)** — the real unlock: `TenantAuthModule`, `User.passwordHash` activation, `GET /api/v1/tenant/me/entitlements`. Verify against the existing RLS tests (`runAsTenant` finally gets real callers).
3. **I.2 (activation redemption)** — small, additive, uses the schema fields that already anticipated it.
4. **I.3 (onboarding wizard)** — frontend-only, built once I.1 and I.2 exist so the wizard's final step (activation) is actually meaningful, and can optionally show "device registered" once I.2 lands.
5. Wire Restaurant Admin's `SubscriptionPlansView.tsx` to the new tenant endpoint, retiring the local mock — this is the step that finally makes the screen you screenshotted real.

Each step should close with the same bar already established in this project: real typecheck, real test run, real build — not just "the code compiles."
