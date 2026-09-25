# JAMANVAAR Gap Closure — Master Plan (Phases 10+)

> **For agentic workers:** This is the phase INDEX for the second stage of the JAMANVAAR
> commercial platform redesign — closing the real gaps found when the original 9-phase project
> (see `2026-09-24-jamanvaar-commercial-platform-redesign-MASTER.md`) was audited against the
> full 60-section spec. Subagents disallowed per standing project instruction. Each phase gets
> its own detailed plan file, written just before that phase starts, exactly like Phases 1-9.

**Goal:** Replace every hardcoded feature/entitlement list in the system with one real,
database-backed, Super-Admin-editable catalog; reconcile the two entitlement systems that have
been silently diverging since Phase 5; give Kiosk Pro a real functional difference from Kiosk
Standard; and close the remaining smaller gaps from the original audit — all without breaking
any existing restaurant, plan, subscription, activation key, or offline license already issued.

**Spec:** The original 60-section prompt + counter-proposal (2026-09-24), audited against the
actual shipped code on 2026-09-25. This document is that audit's synthesis into phases.

---

## 0. What the audit found (grounding — read before writing any phase plan)

**Two parallel, never-reconciled entitlement systems exist.**

1. **`cloud/api`'s online system** (built across Phases 2/5/6): `ApplicationEntitlement` rows,
   one per `(subscriptionId, AppCode)`, aggregated across every active subscription, checked
   server-side on every device activation and app operation. This is what Phases 1-9 were built
   around and is fully correct for the new `PlanTier.QR` / `ProductFamily.KIOSK` model.
2. **The offline license system** (`packages/business/src/license_certificate.ts` +
   `license_entitlements.ts`, predates this redesign, never touched by Phases 1-9):
   `LicensingService` (`cloud/api`) signs an ECDSA certificate carrying `{ tier:
   subscription.plan.tier, entitlements: subscription.plan.entitlements }` — the **legacy 21-key
   flat bag only**, with no `AppCode`/`ApplicationEntitlement` data at all. The client-side
   `EntitlementService` (`packages/business/src/license_entitlements.ts`) that reads this
   certificate is **hardcoded to understand only `tier === 'CORE' | 'PRO'`** — it has no concept
   of `QR` tier or the `KIOSK` product family.
   **Confirmed live consumers:** `apps/restaurant-system/captain/src/App.tsx`,
   `apps/restaurant-system/pos/src/components/settings/PosSettingsView.tsx`,
   `apps/restaurant-system/pos-admin/src/components/qr/QrOrderingModule.tsx`.
   **Confirmed live bug:** `EntitlementService.checkQrOrderingAccess()` requires
   `license.tier === 'PRO'` — a restaurant on the new `QR` tier (Phase 5, ₹9,000/yr) has
   `tier === 'QR'`, so this check **incorrectly denies QR access while offline**, even though the
   same restaurant is correctly entitled online. This is real, live, and currently shipped.

**The "feature catalog" is several independent hardcoded lists, not one system.**

- `cloud/api/src/modules/plans/entitlements.ts` — `ENTITLEMENT_KEYS` (21 strings) + Zod schema.
  Stored in `Plan.entitlements: Json` — flexible storage, but the valid-key *set* is a TS array,
  not queryable/editable data.
- `packages/types/src/planFeatureCatalog.ts` — `CORE_PLAN_FEATURE_GROUPS` /
  `PRO_PLAN_FEATURE_GROUPS` (16 groups, ~300 individual marketing bullet strings — these are
  **descriptive copy, never independently toggleable**, each group tagged to 1-3 of the 21 real
  keys) + `OPERATIONAL_MODULE_CATEGORIES` (7 hardcoded categories) + `resolveTierEntitlements`
  (hardcoded CORE/PRO inheritance logic).
- `cloud/api/src/modules/application-entitlements/feature-catalog.ts` (Phase 6, this project) —
  `FEATURE_CATALOG`, a hardcoded `Record<AppCode, FeatureCatalogEntry>`, 7 entries, 3 categories,
  2 dependency edges. Real per-restaurant state (`ApplicationEntitlement.enabled`) lives in the
  DB; the catalog *describing* those 7 apps does not.
- `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts` —
  `DEFAULT_APPS_BY_FAMILY_TIER`, a hardcoded `(productFamily, tier) → AppCode[]` lookup.
- **11 files across 4 packages/apps** consume one or more of the above (confirmed by grep):
  `pos-admin`'s `cloudClient.ts` and `SubscriptionPlansView.tsx`; `cloud/api`'s
  `plans/entitlements.ts`; `super-admin-web`'s `api/types.ts`, `EntitlementsPage.tsx`,
  `PlanDetailPage.tsx`, `PlanFormModal.tsx`, `PlansListPage.tsx`; `packages/business`'s
  `license_certificate.ts` and `license_entitlements.ts`; `packages/database`'s
  `repositories.ts`; `packages/types/src/index.ts`.

**Two Super Admin pages already exist but were never updated for this redesign.**

`EntitlementsPage.tsx` ("SaaS Feature Entitlements & Matrix" — already a plan comparison page,
predates this project) and `PlanDetailPage.tsx`'s existing category matrix both read only
`Plan.entitlements` (the legacy 21-key bag). Neither shows `KIOSK`, `KIOSK_ADMIN`, or
`QR_ORDERING` — those live in `ApplicationEntitlement`, a table these pages never query. They are
not missing features; they are **stale** relative to Phases 2/5/6.

**Kiosk Standard and Kiosk Pro are functionally identical.** Confirmed:
`DEFAULT_APPS_BY_FAMILY_TIER['KIOSK:CORE']` and `['KIOSK:PRO']` are both exactly `['KIOSK',
'KIOSK_ADMIN']`. The ₹9K/₹11K price difference has no corresponding functional difference today.

**Other confirmed-real, smaller gaps** (from the original 60-section audit, restated here for
phase planning): no Super Admin restaurant-creation wizard with an entitlement preview at plan
selection (§35-36); no "this feature is used by N devices" warning before a disable, only the
app-dependency refusal Phase 6 built (§40); no named per-app-type default quotas
(`maxKDSDevices`, etc. — only a single `Plan.maxDevices` plus a manual per-app override, §38); no
dedicated security audit pass against the full threat checklist beyond Phase 9's rate-limiting
(§47); no frontend automated tests in any of the 4 touched frontends (§57); no single
consolidated before/after deliverables document (§59).

**Explicitly still out of scope**, unchanged from the original master plan: market/competitor
research and a commercial pricing recommendation (§48-49) — business research, not code.

---

## 1. Non-negotiable constraints (apply to every phase, same as the original 9)

- **Zero data loss, zero downtime for any existing restaurant.** Every existing `Plan.entitlements`
  value, every existing `ApplicationEntitlement` row, and every already-issued offline license
  certificate must keep working exactly as it does today throughout this migration.
- **The database is the source of truth for the feature/category catalog going forward** — not a
  TS constant. Super Admin adding a new feature or category must never require a code deploy.
- **Backend is the enforcement point, always** — a frontend catalog page is a view onto real data,
  never a second source of truth. The existing rule from the original master plan applies
  unchanged.
- **Never break the offline certificate format's backward compatibility** — `entitlements:
  Record<string, unknown>` is already schemaless at the wire level (confirmed by reading
  `license_certificate.ts`); this migration changes what the *signer* puts in that bag and what
  the *client* reads out of it, not the cryptographic envelope itself.
- **No fake entitlements.** Every feature added to the new catalog must correspond to something
  the backend actually enforces today, or be explicitly and visibly marked "Roadmap / Future" —
  matching the original spec's §50 rule, which this phase series takes as seriously as Phase 1-9
  did.

---

## 2. Phase index

| # | Phase | Depends on | Plan file |
|---|-------|-----------|-----------|
| 10 | Generic `Feature`/`FeatureCategory` database model + CRUD API | — | **done** (docs: phase10 plan) |
| 11 | Migrate every consumer (Super Admin pages, `ApplicationEntitlementsService`, `plans/entitlements.ts`) onto the generic model; new Feature Catalog admin page | 10 | **done** (docs: phase11 plan) |
| 12 | Reconcile the offline license/entitlement system with QR tier + Kiosk family | 10, 11 | written at start of Phase 12 |
| 13 | Real functional differentiation for Kiosk Pro vs Kiosk Standard | 10, 11 | written at start of Phase 13 |
| 14 | Restaurant-creation wizard + entitlement preview; feature-disable usage-impact warning; named per-app-type default quotas | 11 | written at start of Phase 14 |
| 15 | Security audit pass (IDOR, mass assignment, session/device threats) across every endpoint this whole redesign added | all prior | written at start of Phase 15 |
| 16 | Frontend regression test scaffolding (all 4 touched frontends) + consolidated before/after deliverables document | all prior | written at start of Phase 16 |

### Phase 10 — Generic Feature/FeatureCategory database model

**Delivers:** New Prisma models `FeatureCategory` (id, code, name, description, sortOrder) and
`Feature` (id, code, name, description, categoryId, appCode `AppCode?` — nullable link for the 7
app-level features, `dependsOnFeatureIds String[]` or a proper self-referencing join table,
isActive). A migration that seeds this table from the **union** of the current 21
`ENTITLEMENT_KEYS` and the 7 `AppCode` values (deduplicating conceptually-overlapping pairs like
`selfOrderKiosk` / `KIOSK`+`KIOSK_ADMIN`, `qrTableOrdering` / `QR_ORDERING` — mapped, not
deleted, so no existing `Plan.entitlements` value or `ApplicationEntitlement` row loses its
meaning). A real CRUD API (`GET/POST/PATCH/DELETE /api/v1/features`,
`/api/v1/feature-categories`) — this is the piece that makes the catalog genuinely
Super-Admin-editable without a deploy, which is the core of what's being fixed here.

### Phase 11 — Migrate every consumer onto the generic model + Feature Catalog admin page

**Delivers:** `ApplicationEntitlementsService`'s hardcoded `FEATURE_CATALOG` and
`DEFAULT_APPS_BY_FAMILY_TIER` read from the Phase 10 tables instead of TS constants (tier
defaults become real data associated with each `Plan`, not a code lookup). `PlanFormModal.tsx`,
`PlanDetailPage.tsx`, `EntitlementsPage.tsx`, `PlansListPage.tsx` (`cloud/super-admin-web`) read
live from the new `/api/v1/features` endpoints — this is also where `EntitlementsPage`'s stale
matrix gets `KIOSK`/`KIOSK_ADMIN`/`QR_ORDERING` visibility back. A new dedicated **Feature
Catalog** page in Super Admin (real CRUD UI: add/edit a feature or category, set dependencies, no
code deploy needed) — this directly answers the original spec's §21-22.

### Phase 12 — Reconcile the offline license/entitlement system

**Delivers:** `LicensingService` (`cloud/api`) issues certificates carrying the restaurant's real
`AppCode`-level entitlements (from `ApplicationEntitlement`, aggregated the same way
`isAppEnabled` already does) alongside the legacy bag, not instead of it. `EntitlementService`
(`packages/business`) stops hardcoding `tier === 'PRO'` and instead checks the actual
app-code-level entitlement the certificate now carries — fixing the confirmed live bug where a
`QR`-tier restaurant is incorrectly denied QR access offline. Every confirmed consumer (`captain`,
`pos`, `pos-admin`'s `QrOrderingModule`) is re-verified against the corrected logic.

### Phase 13 — Real Kiosk Pro differentiation

**Delivers:** At least one genuinely real, backend-enforced feature exclusive to `KIOSK:PRO`
(candidate: remote device lock/restart — `DeviceCommand`/`DeviceCommandType` already exist in the
schema per the original master plan's own findings, currently wired for POS/Captain/KDS devices
but not gated by Kiosk tier; wiring it as a Kiosk-Pro-exclusive capability for Kiosk devices uses
infrastructure that already exists rather than inventing new UI for nothing). No fake toggles —
whatever ships here is chosen because the backend can actually enforce it today.

### Phase 14 — Onboarding wizard, disable-safety warning, named quotas

**Delivers:** Super Admin's existing restaurant-creation flow (`/restaurants/onboard`, never
reviewed in Phases 1-9) gets an entitlement preview step when a plan is selected, sourced from
Phase 10/11's real catalog. `ApplicationEntitlementsService.update`'s disable path (Phase 6) gains
a usage-impact check — "this app is currently used by N active devices" — alongside the existing
app-dependency refusal. Named per-app-type default quotas become real `Feature`-level data
(Phase 10's model) rather than a single `Plan.maxDevices` number.

### Phase 15 — Security audit pass

**Delivers:** A focused review of every endpoint added or changed across Phases 1-14 against the
original spec's §47 checklist (IDOR, IP enumeration, mass assignment, device spoofing, session
hijacking, entitlement/quota bypass) — not a re-litigation of Phase 9's rate-limiting work, a scan
for what it didn't cover.

### Phase 16 — Frontend tests + consolidated deliverables document

**Delivers:** A baseline automated test setup for at least the highest-risk frontend flows (owner
login, activation, entitlement toggling) in the frontends this whole project touched, plus one
consolidated document listing every changed file, migration, API change, UI change, and any
manual setup required across Phases 1-16 — answering the original spec's §59 directly.

---

## 3. Explicitly still out of scope

Unchanged from the original master plan: competitor/market pricing research (§48-49) — business
research, not code. If wanted, it's a separate task.
