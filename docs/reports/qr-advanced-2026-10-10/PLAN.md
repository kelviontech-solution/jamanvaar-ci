# QR advanced implementation plan

The two supplied briefs extend the existing QR module; they do not replace it. The implementation sequence below is complete locally; the accompanying report records supported behavior, verification and remaining deployment/integration work.

## Reuse and architecture findings

- `SyncedOrder` is the operational record for POS, Captain, Kiosk and QR. `Order` is gateway bookkeeping, not a second kitchen order. `OrderSyncService` owns admission, branch sequence cursors, event logs and realtime wakeups. QR administration currently has a separate inline transition list: move this into the shared order rules.
- `PaymentTransaction` represents gateway attempts. `Refund` records authorized returns. Counter collections currently live in order metadata rather than a queryable allocation ledger. Add an allocation ledger tied to canonical orders, preserving existing attempts and refund records.
- `ApplicationEntitlementsService`, `Feature`, `Plan.entitlements` and subscription application config already support plans and restaurant overrides. Extend their feature resolution, not a new subscription system. Essential accessibility and existing menu sync remain available to existing customers.
- Menu publication snapshots, branch price/availability overrides and server-side integer-paise pricing already exist. Checkout checks current menu and modifiers. Guest refresh currently uses 60-second polling; improve version polling and checkout price acknowledgement.
- CRM uses canonical CUSTOMER entities with uniquely keyed loyalty events. Coupons and loyalty configuration are existing synced entities. Public QR cannot trust an unverified phone to access CRM balances; verified customer identity requires an existing authenticated identity or a configured verification integration.
- QR rules already include operating hours, pause, pending/window limits and preparation estimates. Branch overrides, analytics, QR-only administration, secure payment retries, nine print designs and mobile receipts exist.

## Dependency sequence

1. Central transitions, queryable payment allocations, payment/refund reconciliation and optional capability resolution. Add additive migration, RLS, uniqueness constraints and concurrency tests.
2. Advanced configuration and admin capability/usage controls through existing licensing. Preserve base QR behavior when capabilities are absent.
3. Canonical multilingual text overlays, existing coupon validation, verified completed-order feedback and configured upsells. Keep item identity/prices unchanged.
4. Live workload estimates and menu/version synchronization, durable branch-scoped notifications, secure browser history/receipt recovery, low-bandwidth and accessibility controls.
5. Invite-only shared-table sessions with contribution ownership, expiry and idempotent canonical submission; reconcile supported partial collection modes through the ledger.
6. Verified-identity loyalty/reorder integration and controlled branch configuration inheritance/bulk preview.
7. API security/concurrency regression, compiled-app mobile/desktop browser flows, production builds and deployment/rollback report.

## Risks and constraints

All new money and order writes must lock the same canonical order; collection allocation keys and provider references must be unique. A retry must return its prior result. A refund must never become another collection. Paid confirmation and kitchen admission remain server-authoritative.

Shared-session access must require a separate random invitation and a signed browser membership, not possession of a table QR. Submitted contributions cannot be edited. Public order capabilities expose no private CRM or staff fields.

Advanced configuration must distinguish unlicensed from disabled. Branch managers cannot propagate restaurant defaults or read other branches. Central updates preserve intentional local overrides.

No real charges, production data resets, fabricated notifications, OTP delivery or simulated live payment verification. External identity/provider limitations must be stated precisely. Database alignment and automated tests use only the dedicated QA database; production deployment requires the migration and rebuilt applications.

## Acceptance tracking

Implemented: group ordering; advanced workload; verified QR loyalty; multilingual menu management; promotions/configured recommendations; multi-branch inheritance; verified feedback; menu/availability and optional counted-stock synchronization; partial counter allocations/refunds; recoverable notification preferences; browser-scoped history/receipts; optional licensing quotas; accessibility/text-only preferences.

All 13 combined compiled-app browser flows passed, including a real two-phone shared bill and the 200 -> 50 -> 65 loyalty balance. Final regression: 276 API tests and 82 shared/client tests passed. Evidence is recorded in REPORT.md, BROWSER_RESULTS.json and VERIFICATION.json.

Deployment and real merchant/SMS verification remain external acceptance steps. Online bill sharing uses one full-bill host payment; online partial obligations are explicitly unavailable, with individual checkout and authorized partial cash collections as alternatives.

Existing base features must continue to pass the QR-only, gateway verification/retry, cash collection, branch isolation, canonical POS/KDS propagation and menu availability regression suites.
