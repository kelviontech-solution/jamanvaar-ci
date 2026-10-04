# JAMANVAAR Commercial Platform Redesign — Master Plan

> **For agentic workers:** This is the phase INDEX and architecture record for a multi-phase
> redesign, not a single executable plan. Each phase listed below gets its own detailed
> plan file (written just before that phase starts, per superpowers:writing-plans' scope-check
> guidance — a spec this size is multiple independent subsystems). Phase 1's detailed plan
> already exists: `2026-09-24-jamanvaar-phase1-restaurant-identity.md`. Use
> superpowers:executing-plans (native, in-session — subagents are disallowed on this project
> per explicit user instruction) to run each phase's plan task-by-task.

**Goal:** Redesign JAMANVAAR's subscription/entitlement/activation/device model and the
Restaurant Admin / Kiosk Admin / Super Admin experience around a human-friendly Restaurant ID,
simplified owner login, a true annual commercial plan catalog (Core/Pro/QR + Kiosk
Standard/Pro as an add-on), and a cleaner Super Admin UI — without breaking any existing
restaurant, subscription, activation key, or device.

**Spec:** The two pasted prompts in this conversation (2026-09-24) — a 60-section product/
architecture brief plus a counter-proposal refining three points (Restaurant ID as a
human-friendly code over a UUID primary key, Kiosk as its own commercial product family,
and "simple UX, still-real backend auth"). No separate spec file exists; this document *is*
the spec's synthesis against the actual codebase.

---

## 0. How this differs from the original spec (confirmed with the user)

Three architecture forks were not decidable from the spec or code alone. The user chose:

1. **Pricing:** ₹5,000 / ₹7,000 / ₹9,000 **per year** is the real target commercial model.
   The current seeded `Plan` rows (`JAMANVAAR CORE` ₹5,000/**month**, ₹50,000/year;
   `JAMANVAAR PRO` ₹7,000/month, ₹70,000/year — see `cloud/api/prisma/seed.ts:116-168`) are
   placeholder/demo values to be replaced, not real pricing to protect.
2. **Owner-only Restaurant ID login:** "Restaurant ID + Password" (no email) authenticates
   the restaurant's **OWNER** account only. Manager/Staff logins keep using email + password
   exactly as today (`TenantLoginDto.email`, `tenant-auth.service.ts:246`). This is *additive*
   — a new login mode alongside the existing one, not a replacement.
3. **Kiosk is a true add-on subscription.** A restaurant can hold two concurrent active
   `Subscription` rows — one `RESTAURANT`-family (Core/Pro/QR) and one `KIOSK`-family
   (Standard/Pro) — billed and managed separately. Effective app entitlements are the
   **union** of every active subscription's enabled apps. This requires changing every
   "find the restaurant's current subscription" query from `findFirst(...orderBy: createdAt desc)`
   (today's shape) to "aggregate across all ACTIVE/TRIAL subscriptions."

---

## 1. Current architecture (as found — 2026-09-24 inspection)

This system is **far more built-out than the spec assumed**. Read this section before writing
any phase plan, so work extends what exists instead of duplicating it.

### 1.1 Database (`cloud/api/prisma/schema.prisma`)

- `Restaurant` — UUID `id` only. No human-friendly code. No dedicated "registered mobile"
  field (only `User.phone`, optional, per-login-account, not restaurant-level).
- `User` (tenant side) — login is by **email**, globally searched then filtered by optional
  `restaurantId` (`tenant-auth.service.ts:249-263`). Already has: `passwordHash`,
  `failedLoginAttempts`/`lockedUntil` (account lockout, BUG B2-030), and a **complete
  forgot-password flow** (`passwordResetHash`/`passwordResetExpiresAt`/`passwordResetSentAt`/
  `passwordResetAttempts` — BUG-142, OTP emailed, HMAC-hashed, rate-limited, single-use,
  audit-logged). This is already everything spec section 6 asks for — it just isn't wired to
  a restaurant-code entry point yet.
- `PlatformUser` (Super Admin) — already has full OTP 2FA on every login (`loginOtpHash` etc.,
  `platform-auth.service.ts`), account lockout, session cap, audit logging. **No changes
  needed here** for this project.
- `Plan` — `tier: PlanTier` (`CORE | PRO | ENTERPRISE`), `priceMonthly`/`priceYearly` (paise),
  `maxBranches`/`maxDevices`/`maxUsers`, `entitlements: Json` (flat boolean bag, see 1.2).
  Already supports annual pricing at the schema level (`priceYearly` exists) — this is a data
  problem (seed values), not a schema problem.
- `Subscription` — `restaurantId`, `planId`, `status` (`TRIAL|ACTIVE|PAST_DUE|SUSPENDED|EXPIRED`),
  `expiresAt`. **One-to-many** `Restaurant -> Subscription[]` already in the schema — nothing
  stops multiple rows today, but every service method treats "current" as
  `findFirst(...orderBy: createdAt desc)`, i.e. effectively single-subscription. This is the
  piece Phase 2 changes (per confirmed decision #3).
- `ApplicationEntitlement` — **already exactly the per-app entitlement layer the spec asks
  for**: one row per `(subscriptionId, appCode)`, `enabled: Boolean`, `deviceQuota: Int?`
  (per-app override of the plan's global device cap), `config: Json?`. `AppCode` enum today:
  `POS | POS_ADMIN | CAPTAIN | KDS | KIOSK | KIOSK_ADMIN` — **no `QR_ORDERING`** (QR is gated
  by a flat `entitlements.qrTableOrdering` flag on `Plan`, defaulting to `planTier === 'PRO'`
  — see `qr-ordering.service.ts:403`).
- `ActivationKey` — mature: `code` (opaque, `JMV-XXXX-XXXX-XXXX`), `restaurantId`,
  `subscriptionId?`, `allowedDeviceType`, `status` (`ACTIVE|REDEEMED|REVOKED|EXPIRED`),
  `expiresAt`, `redeemedAt`, `redeemedByDeviceId`, `branchId`, `label`, `batchId`. Exactly
  what spec section 8 asks for.
- `Device` — `restaurantId`, `branchId`, `type: DeviceType`, `status` (`PENDING|ACTIVE|REVOKED`),
  `deviceTokenHash`, `lastSeenAt`, `appVersion`, `isLocked`/`lockReason`, plus sync/backup
  telemetry fields. Matches spec section 10 closely.
- `AuditLog` — generic `actorType`/`actorId`/`restaurantId`/`action`/`category`/`details`,
  already used pervasively (every service above calls `this.audit.log(...)`). Spec section 41
  is already satisfied structurally; new actions just need to keep using it.
- **No `Feature`/`FeatureCategory`/`PlanFeature` model.** `Plan.entitlements` is a flat
  `Record<EntitlementKey, boolean>` of 21 keys (`plans/entitlements.ts`) — no categories, no
  dependency graph, no per-feature override tracking distinct from the per-app
  `ApplicationEntitlement.enabled`. Spec sections 18–23 (feature catalog, dependencies,
  overrides-with-source) are genuinely new work.

### 1.2 Backend modules (`cloud/api/src/modules/`)

Already built and NOT to be duplicated: `plans/` (CRUD + `entitlements.ts` flat catalog),
`subscriptions/`, `application-entitlements/` (tier-default inheritance — see below),
`activation-keys/` (+ `activation-redeem.controller.ts` for the unauthenticated device-side
redeem), `devices/` (+ heartbeat), `restaurants/`, `branches/`, `owners/`, `billing/`
(invoices), `payments/` (Razorpay), `qr-ordering/` (controller + tenant controller + service),
`licensing/`, `applications/` (release matrix), `audit-query/`, `support/` (tickets),
`backups/`, `offline-policy/`, `sandboxes/`, `master-catalog/`, `ai-assistant/`,
`sync-observability/`, `notifications/`, `order-sync/`, `entity-sync/`.

`application-entitlements.service.ts` already encodes plan-tier → app inheritance:

```
DEFAULT_APPS_BY_TIER = {
  CORE: [POS, POS_ADMIN, KDS],
  PRO:  [POS, POS_ADMIN, CAPTAIN, KDS, KIOSK, KIOSK_ADMIN],
  ENTERPRISE: same as PRO
}
```

This is the exact mechanism spec section 13 wants ("7K = 5K + KDS + Captain") — it's just
wired to the wrong app list for CORE today (CORE already includes KDS; spec wants KDS to
start at Pro) and has no `QR_ORDERING` or `KIOSK`-as-separate-family concept yet. `isAppEnabled`
(same file, line 133) is the real enforcement point — "fails closed," checked in
`activation-keys.service.ts` (`generate`/`redeem`) and `tenant-auth.service.ts`
(`activateDevice`) before any device is ever created. **Never trust the frontend** — this
already holds; extend it, don't bypass it.

### 1.3 Authentication (current, exact)

- **Tenant/Restaurant login** (`tenant-auth.service.ts:246`, `POST /tenant-auth/login`):
  `{ email, password, restaurantId?, deviceId?, deviceToken?, deviceType?, appVersion? }`.
  Loops every `User` matching that email (across tenants if `restaurantId` omitted), skips
  locked accounts, bcrypt-compares, locks after 10 wrong attempts / 15 min
  (`LOGIN_MAX_ATTEMPTS`/`LOGIN_LOCKOUT_MINUTES`). `POS_ADMIN`/`KIOSK_ADMIN` device types are
  **server-side forced** to require `OWNER`/`MANAGER` role (security-audit HIGH-04 fix — do
  not regress this).
- **Forgot password** (`POST /tenant-auth/forgot-password`, `/reset-password`): already
  requires `restaurantId: z.string().uuid()` + `email` — i.e. the frontend must already know
  the raw UUID. This is *exactly* what Phase 3 replaces with a restaurant-code lookup; the
  OTP mechanics underneath (15 min expiry, 5 attempts, 60s resend cooldown, HMAC-hashed,
  session-invalidating) are already correct and are reused as-is.
- **Device activation** (`POST /tenant-auth/activate-device`): session-token-gated, atomic
  key claim (`updateMany` compare-and-set — prevents the double-redeem race), app-entitlement
  check, **and** `Plan.maxDevices` quota check, all before creating the `Device` row. Already
  matches spec sections 40/47 (no silent bypass, no unlimited devices).
- **Platform (Super Admin) login**: email + password + mandatory OTP 2FA, already shipped
  recently (see git log `f534d7d`). No changes needed.
- **Kiosk Admin app today** (`apps/kiosk-system/kiosk-admin/src/App.tsx`): device-connect flow
  calls `connectDeviceStep1(restaurantId, email, password)` then
  `connectDeviceStep2(activationSessionToken, activationKey, restaurantId, email, restaurantName)`;
  daily login calls `staffLogin(restaurantId, authEmail, authPassword)`. This is the exact
  "Restaurant ID + Email + Password" complexity spec section 7 objects to — confirmed live in
  code, not assumed.

### 1.4 Super Admin frontend (`cloud/super-admin-web/src/pages/`)

Already exists (40+ pages) — **do not recreate these, redesign in place**:
`Restaurants/` (List, Detail, Create, Edit modals, `LicenseCertificatePanel`,
`RestaurantSalesPanel`), `Plans/` (List, Detail, FormModal), `Subscriptions/` (List, Assign,
Change, Renew modals), `Entitlements/EntitlementsPage.tsx`, `ActivationKeys/` (List,
GenerateModal), `Devices/` (List, Detail), `QrOrdering/` (Page, EntitlementEditor,
RestaurantDetailPanel), `Applications/`, `Owners/`, `Branches/`, `Billing/`, `AuditLogs/`,
`Support/Tickets`, `Backups/`, `OfflinePolicy/`, `AiAssistant/`, `Onboarding/`,
`SystemHealth/`, `Sandboxes/`, `Catalog/`, `Team/`, `Login/`, `Activate/`, `Notifications/`,
`Reports/`, `SyncMonitor/`, `PaymentConnections/`, `Profile/`, `Settings/`. `PlanDetailPage.tsx`
has no category/matrix grouping today (grep confirmed zero hits) — this is the "long vertical
scroll" spec section 24/42 is describing, verified rather than assumed.

### 1.5 What genuinely doesn't exist yet (real gaps)

1. `Restaurant.restaurantCode` / human-friendly ID — **new**.
2. `Restaurant`-level verified mobile field distinct from an owner's personal phone — **new**.
3. Owner-only Restaurant-ID+password login mode — **new** (additive to existing email login).
4. Restaurant-code-based forgot-password entry point — **new** (reuses existing OTP engine).
5. Multi-subscription-per-restaurant entitlement aggregation — **change** (today: latest-wins).
6. `QR_ORDERING` as a first-class `AppCode` with its own `ApplicationEntitlement` row — **new**
   (today: ad-hoc `Plan.entitlements.qrTableOrdering` flag).
7. `KIOSK`-family Plan rows (Standard/Pro) separate from the `RESTAURANT`-family tiers — **new**.
8. Real annual pricing on the Core/Pro/QR plans — **data change**.
9. Structured feature catalog with categories + dependency graph — **new**.
10. Super Admin UI redesign (identity card, plan matrix, entitlement source labels,
    key-generation quota preview) — **UI change**, existing pages extended not replaced.
11. Kiosk apps' login/activation screens updated to restaurant-code UX — **UI change**.

---

## 2. Non-negotiable constraints (apply to every phase)

- **Never break an existing restaurant.** Every migration is additive-then-backfilled, never
  destructive. Existing activation keys, devices, subscriptions, and email-based logins keep
  working unchanged throughout.
- **Backend is the enforcement point, always.** No entitlement/quota check is ever
  frontend-only. Extend `ApplicationEntitlementsService.isAppEnabled`/`assertAppEnabled` —
  never bypass it.
- **Never expose a raw UUID as a primary user-facing identifier post-redesign** — restaurantCode
  is what login screens, activation screens, and Super Admin's primary restaurant header show;
  the UUID moves to an "Advanced / Internal IDs" disclosure.
- **No enumeration.** A restaurant-code lookup (for login or forgot-password) must answer
  identically whether or not the code exists, mirroring the existing email-based
  forgot-password's constant-response behavior (`tenant-auth.service.ts:897-933`).
- **Every Super Admin override is audit-logged**, reusing `AuditService` — no new logging
  mechanism.
- **Money is paise, everywhere**, matching every existing `Int` price field — no floats.

---

## 3. Phase index

Each phase is independently shippable and testable. Detailed step-by-step plans are written
immediately before that phase starts (not all up front — the earlier phases' actual
implementation may surface details that change a later phase's exact shape).

| # | Phase | Depends on | Plan file |
|---|-------|-----------|-----------|
| 1 | Restaurant Identity (`restaurantCode`) | — | `2026-09-24-jamanvaar-phase1-restaurant-identity.md` (done — see below) |
| 2 | Multi-subscription entitlement aggregation | 1 | written at start of Phase 2 |
| 3 | Owner-only Restaurant-ID login + code-based forgot-password | 1 | written at start of Phase 3 |
| 4 | Kiosk Admin / Restaurant Admin frontend login redesign | 3 | written at start of Phase 4 |
| 5 | Commercial plan catalog rebuild (annual pricing, Kiosk family) | 2 | written at start of Phase 5 |
| 6 | Feature catalog, categories & dependency validation | 5 | written at start of Phase 6 |
| 7 | Super Admin UX redesign | 1, 2, 5, 6 | written at start of Phase 7 |
| 8 | Kiosk activation flow polish (kiosk-user app) | 1, 3 | written at start of Phase 8 |
| 9 | Security/audit hardening + E2E journey test | all | written at start of Phase 9 |

### Phase 1 — Restaurant Identity (`restaurantCode`)

**Delivers:** `Restaurant.mobile` (verified, normalized) + `Restaurant.restaurantCode`
(`JM` + 10-digit mobile, unique, immutable), generated at creation, backfilled for existing
restaurants (flagged for review when no valid mobile exists), exposed in restaurant
list/detail responses, plus a rate-limited, enumeration-safe `restaurantCode → restaurantId`
resolver endpoint that later phases build login/forgot-password on top of.
**Files:** `cloud/api/prisma/schema.prisma`, a new migration, `restaurant-code.util.ts` (new),
`restaurants.service.ts`, `create-restaurant.dto.ts`, `restaurants.controller.ts`, a new
`restaurant-lookup` module. See its own plan file for exact steps.

### Phase 2 — Multi-subscription entitlement aggregation

**Delivers:** `Subscription.productFamily` (`RESTAURANT | KIOSK`) enum column. Every
"restaurant's current entitlements/quota" read (`ApplicationEntitlementsService.isAppEnabled`,
`TenantAuthService.getEntitlements`, the device-quota checks in `activation-keys.service.ts`
and `tenant-auth.service.ts`'s `activateDevice`) changed from "latest subscription" to
"aggregate over every `ACTIVE`/`TRIAL` subscription for the restaurant, unioned by app, with
device quota checked **per app** via `ApplicationEntitlement.deviceQuota` falling back to the
owning subscription's `Plan.maxDevices`" — this is also where spec section 38's per-app quotas
(`maxKiosks`, `maxPOSTerminals`, etc.) get real enforcement instead of one global cap.
**Risk:** touches the exact code paths that gate every device activation — needs full
regression coverage of the existing single-subscription case before this ships (a restaurant
with one subscription must behave byte-for-byte the same as today).

### Phase 3 — Owner-only Restaurant-ID login + forgot-password

**Delivers:** `POST /tenant-auth/login-owner` (or an extended `login` accepting
`{ restaurantCode, password }` with no email) that resolves `restaurantCode → restaurantId`,
then authenticates only the `role: 'OWNER'` user at that restaurant — same lockout/audit
behavior as today's login. `forgotPasswordSchema`/`resetPasswordSchema` gain a
`restaurantCode`-based variant that resolves to the owner's email internally, reusing
`requestPasswordReset`/`resetPassword` unchanged underneath. Existing
`{ restaurantId (uuid), email, password }` login and forgot-password paths are **untouched** —
Manager/Staff keep using them.

### Phase 4 — Kiosk Admin / Restaurant Admin frontend login redesign

**Delivers:** New "Restaurant ID + Password" login screen (Kiosk Admin first, since spec
weights it heaviest; Restaurant Admin/`pos-admin` console gets the equivalent screen too),
wired to Phase 3's endpoints, with a "Forgot Password?" flow (masked email display → OTP entry
→ new password). Device activation screens (`connectDeviceStep1`/`connectDeviceStep2`) keep
using Restaurant ID + activation key as today — only the *daily login* screen changes.

### Phase 5 — Commercial plan catalog rebuild

**Delivers:** Replace `seed.ts`'s CORE/PRO rows with real annual pricing
(`JAMANVAAR CORE ₹5,000/yr`, `PRO ₹7,000/yr`, `QR ₹9,000/yr` — all `RESTAURANT` family) plus
two new `KIOSK`-family plans (`KIOSK STANDARD ₹9,000/yr`, `KIOSK PRO ₹11,000/yr`). Add
`QR_ORDERING` to the `AppCode` enum with its own `ApplicationEntitlement` row (migrating the
old `entitlements.qrTableOrdering` flag's *meaning* onto it, not deleting the flag — existing
UI/API readers of the flat flag keep working during transition). Rewrite
`DEFAULT_APPS_BY_TIER` for the new tier boundaries (`CORE: POS, POS_ADMIN, RESTAURANT_ADMIN,
billing basics` / `PRO: + KDS, CAPTAIN` / `QR: + QR_ORDERING`; `KIOSK STANDARD/PRO` map to
`KIOSK, KIOSK_ADMIN`). Write and run a **migration mapping** existing restaurants' current
plan/subscription onto the new catalog with no entitlement loss (audit-logged, with a Super
Admin review screen for anything that can't map cleanly) — spec section 45's explicit
requirement.

### Phase 6 — Feature catalog, categories & dependency validation

**Delivers:** A structured feature catalog (extends `plans/entitlements.ts`'s 21-key list with
category + human description + dependency edges, e.g. `KDS_CORE requires KOT`), a
dependency-check API (`"required by N enabled features"` style refusal) wired into
`ApplicationEntitlementsService.update`, and "source: PLAN vs MANUAL OVERRIDE" surfaced on
every entitlement read (the data already exists — `ApplicationEntitlement.enabled` vs the
plan's tier default — this phase makes the *comparison* explicit in API responses).

### Phase 7 — Super Admin UX redesign

**Delivers:** Restaurant detail page's identity block redesigned around `restaurantCode`
(UUID moved under an "Advanced / Internal IDs" disclosure), `PlanDetailPage`/comparison page
rebuilt as an expandable category matrix instead of a flat vertical list, activation-key
generation dialog gets the quota preview (`current/requested/after`), and the restaurant
overview shows both active subscriptions (base + Kiosk add-on) as separate cards with their
combined entitlement summary. Extends existing pages — no new page tree.

### Phase 8 — Kiosk activation flow polish (`kiosk-user` app)

**Delivers:** First-launch screen collects `restaurantCode` + activation key (not the raw
UUID), shows the verifying/registering/syncing progress states from spec section 55, and a
success screen naming the restaurant and device. Builds on Phase 1's resolver + the existing
`activation-redeem.controller.ts` — no backend redemption logic changes.

### Phase 9 — Security/audit hardening + E2E journey test

**Delivers:** Rate-limiting review on the new restaurant-code lookup and owner-login endpoints
(reuse the existing per-IP throttle infra), a full automated test of spec section 58's user
journey (Super Admin creates restaurant → `restaurantCode` generated → Pro plan assigned →
Kiosk add-on purchased separately → Kiosk activates with `restaurantCode` + key → Kiosk Admin
logs in with `restaurantCode` + owner password → forgot-password round-trip → Super Admin sees
it all in sync), and a regression pass confirming every pre-existing email+password/UUID-based
flow still works unchanged.

---

## 4. Explicitly out of scope for this redesign

- Anything under spec sections 48/49 (competitor pricing research, market positioning writeup)
  is a business-research deliverable, not code — not tracked as an implementation phase here.
  If wanted separately, ask for it as its own task.
- Custom/Enterprise per-restaurant negotiated plans (spec section 37) — the `productFamily` +
  per-app `ApplicationEntitlement.deviceQuota` override mechanism from Phase 2 already makes
  this possible without new schema, so no dedicated phase is needed; Super Admin can already
  hand-configure a restaurant's entitlements today via `application-entitlements.controller.ts`.
- Remote device lock/restart/diagnostics (spec section 17/30) — `DeviceCommand` +
  `DeviceCommandType` (`LOCK|UNLOCK|FORCE_LOGOUT|RESTART_APP|...`) already exist in the schema
  and have a `device-commands.service.ts` module; this redesign doesn't touch that system.
