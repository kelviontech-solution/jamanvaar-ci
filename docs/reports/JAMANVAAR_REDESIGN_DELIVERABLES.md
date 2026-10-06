# JAMANVAAR Subscription / Entitlement / Device Redesign — Deliverables

Covers Phases 1–16. Plans live in `docs/superpowers/plans/`; this file is the consolidated before/after.

## Before

- Entitlements were a hardcoded 21-key JSON bag on `Plan`, duplicated in four places (API, shared types, marketing copy, web app), plus a separate hardcoded 7-app catalog.
- Kiosk Standard and Kiosk Pro were functionally identical.
- The offline license gates tested `tier === 'PRO'` literally, so QR-tier restaurants were denied Captain, KDS routing, analytics and QR.
- Onboarding carried its own drifted copy of the tier→apps map.
- Disabling an app silently cut off live devices; per-app device caps could only be the plan-wide number.

## After (by phase)

| Phase | Outcome |
|---|---|
| 1–9 | Restaurant ID identity, login/forgot-password redesign, activation keys, device model, QR tier, ApplicationEntitlement per subscription, Super Admin restaurant/plan UX, rate limiting (see the master plan and earlier phase plans). |
| 10 | Real `FeatureCategory` / `Feature` tables with CRUD and dependency integrity; seeded from the legacy keys and 7 app codes. |
| 11 | `Plan.entitlements` keys validated against the live Feature table (unknown keys now rejected, not silently dropped); the application catalog and disable-safety dependency check read from the DB; `Plan.defaultApps` computed at read time; Entitlements page shows Kiosk/QR apps; new Feature Catalog admin page. |
| 12 | Offline license gates treat QR/ENTERPRISE as at least PRO. QR ordering reports `requiresInternet` (guests order through the cloud, so it cannot work offline) and the QR module shows an offline banner. |
| 13 | Kiosk Pro's real differentiator: remote restart / clear-cache / diagnostics / sync / health / update commands, enforced server-side by the restaurant's KIOSK-family plan tier. Standard keeps lock/unlock/force-logout/disable/wipe. Listed in the catalog as `kioskRemoteManagement`. |
| 14 | Disabling an app with active devices requires `acknowledgeDeviceImpact` (console shows a confirm dialog with the device count); `Feature.defaultDeviceQuota` gives per-app default device caps; onboarding uses the API's `defaultApps` instead of its own copy. |
| 15 | Feature catalog and application-entitlement endpoints put under the `subscriptions` RBAC area (previously unmapped, so only owner roles could reach them and the console pages broke for other roles); e2e spec covers 401/403/200 per role. All controllers without guards audited: only the payment webhook (signature) and guest QR (token + throttling) are public, by design. |
| 16 | `super-admin-web` gets a test runner; web/API route-area parity is tested. This document. |

## Known limits (deliberate)

- `packages/types/src/planFeatureCatalog.ts` marketing bullet text and `PlanFormModal`'s creation UI still read static constants (presentation copy, not enforcement).
- `DEFAULT_APPS_BY_FAMILY_TIER` (which apps a commercial tier bundles) remains a code constant; it is now exposed via the API rather than duplicated.
- A new Feature-level `legacyEntitlementKey` can only be set by the seed or a migration, by design.
- Market/competitor research (spec §48–49) was out of scope.
- Frontend coverage is baseline only (access rules); page-level UI tests are not yet written.

## Verification state

- `cloud/api`: full suite passes except two known pre-existing failures (`rbac` B2-051/B2-053, `restaurant-identity-sync`); a few unrelated specs are timing-flaky under full-suite load and pass in isolation.
- Root offline-runtime suite: passes (one token-number test is flaky under load).
- `tsc` clean for `cloud/api` and `cloud/super-admin-web`.
- New UI pages were type-checked but not exercised in a browser in this session.
