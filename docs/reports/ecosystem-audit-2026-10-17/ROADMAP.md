# Repair plan and product roadmap

For the complete staged implementation, acceptance criteria and score reassessment method, see the [repair master plan](REPAIR_MASTER_PLAN.md) and [finding coverage matrix](REPAIR_COVERAGE_MATRIX.md). The matrix also reconciles the earlier ordering-flow audit with newer source fixes.

Repair the demonstrated boundaries before adding more dashboards. No broad application refactor or production change was performed in this audit.

## First five change groups

| Order | Change | Scope / effort | Acceptance |
| --- | --- | --- | --- |
| 1 | Restore reliable engineering gates and stable contracts | Root/API test fixtures, QA import configuration, POS action return contracts; S–M | Both declared typechecks and affected behavioural tests pass; preserve meaningful assertions and existing user edits. |
| 2 | Add a local durable commit barrier for financial commands | Shared storage/repositories, POS/Kiosk/Captain action callers and outbox; L–XL | Kill/restart immediately after order/payment/KOT confirmation, disk-full and delayed-write cases preserve or explicitly reject the action; no duplicated cash/stock effects. |
| 3 | Repair snapshot/restore identity and define financial recovery scope | Backup schema/service, recovery validation and preview UI; L | Recreated QR/POS/Kiosk records retain identities/dates/branch attribution; tracking and ledger reconcile in an empty recovery environment. Unsupported financial restoration is explicitly refused or labelled. |
| 4 | Use one add/configure/quantity contract and reliable entity revisions | Captain/POS/Kiosk/QR pure validation, entity sync contract, affected API clients; M–L | Required options/min/max hold on every add/repeat/edit path; future-clock and concurrent edits return clear outcomes without losing valid offline work. |
| 5 | Reconcile financial metrics and operational health | Report read models, exports, device/printer readiness and UI labels; M | Partial/full/later-day refunds, local-day boundaries and stale/revoked devices match independent calculations and actual readiness. |

For each group: capture source baseline, explain affected apps/contracts, add regression acceptance, make the smallest coherent patch, run targeted tests and impacted builds, inspect the diff, then run the relevant integration slice. Do not rewrite the entire storage or licensing architecture at once.

## Prioritized backlog

| Priority | Work | Effort / dependencies | Business impact |
| --- | --- | --- | --- |
| P0 conditional | Any subsequently demonstrated tenant escape, forged gateway settlement or unrecoverable financial loss | Investigate immediately; none is asserted as a demonstrated exploit here | Stop affected release or financial action |
| P1 | EC-01 durable acceptance; EC-03 Captain validity; EC-04 entity conflicts; EC-05/06 recovery fidelity; EC-07 financial semantics; EC-11 gates | M–XL, shared domain/storage contracts | Prevent incomplete orders, misleading bills and unrecoverable history |
| P1 deployment | Required-encryption policy and real payment/signing/recovery acceptance | M, access to proper sandbox/signing/restore infrastructure | Protect customer records and safe release/update continuity |
| P2 | EC-02 event identity; EC-08 day grouping; EC-09/10 truthful readiness; EC-12/13 test safety | S–M | Reduce silent sync failures, wrong totals and support confusion |
| P2 | Bounded snapshot/export paths, measured pool/lock tuning, aggregated SLOs and failure drills | M–L after correctness baseline | Establish a defensible deployment envelope |
| P2 | Complete private kiosk/order journey preview and branch/channel acceptance checklist | M, deterministic fixtures and sandbox separation | Owners can verify setup without real sales or money |
| P3 | Retire obsolete local service interfaces, split large stores/components, richer reporting read models | M–L after compatibility proof | Lower maintenance cost without disrupting service |

## Capability completeness

| Capability | Classification | Next useful improvement |
| --- | --- | --- |
| Restaurant/branch/plan/device onboarding | Implemented, not fully production verified | One launch/handover summary separating purchased, enabled, configured and operational |
| Role/product enforcement | Implemented, targeted test evidence; not every endpoint certified | Route-family authorization/plan matrix and installed revocation acceptance |
| POS/Kiosk/QR/Captain ordering | Implemented with confirmed correctness/recovery gaps | Shared fixtures/contracts and preserved unfinished work |
| KOT/KDS | Implemented, full current hardware lifecycle unverified | Two KDS/station tests with delayed and duplicate events |
| Payments/refunds | Implemented backend and integration contracts; live acceptance unverified | Late success, cancellation, retry, counter fallback and refund reconciliation drills |
| CRM/loyalty | Implemented, full cross-channel earning/refund acceptance incomplete | Consistent optional redemption and one ledger-backed customer history |
| Inventory | Implemented master and movement ledger; recovery coverage incomplete | Replay/stock contention and restored-stock reconciliation |
| Analytics | Real persisted data, partially correct definitions | Shared metric dictionary and independent financial test vectors |
| Backup/recovery | Real storage/checksum/encryption mechanisms; partial recovery set | Explicit partial-versus-full scope and rehearsed isolated restore |
| Fleet health/alerts | Implemented, partially truthful/aggregated | Actual device/printer/Core acknowledgement and exact-task recovery |
| Native releases/updates | Implemented pipeline/tooling, installed acceptance blocked | Signed upgrade over current distributed installations with data retention |
| 1,000-restaurants/10,000-sessions support | Not verified | Execute the staged benchmark plan; publish measured limits only |
| Every-button authenticated UI acceptance | Not completed in this assessment | Per-role page/action matrix on one stable commit after P1 repairs |

## Easier human flows

- **Super Admin:** restaurant → products/branch limits → enrol devices → actual readiness → verified recovery/handover. Report “waiting for device acknowledgement” separately from “command completed”.
- **Owner/manager:** urgent tasks first, then Orders, Menu, Customers and Devices. Put infrequent setup behind scoped sections and explain whether a change affects restaurant, branch or terminal.
- **Cashier:** add/configure → customer/reward if wanted → one clear checkout → durable confirmation/receipt. Preserve the current cart before opening another bill.
- **Kiosk guest:** relevant language/order type only → configure → review → verified payment or clearly unpaid counter token → optional receipt. Keep technical repair actions behind staff access.
- **QR guest:** preserve table identity and checkout details; use one payment reference through interruptions; show honest preparing/ready/served and paid/outstanding states.

The most valuable next features are not another ten settings pages: secure resumable order status, clear order amendments after KOT, simultaneous-edit protection, private kiosk journey preview and support diagnostics tied to one order/payment reference. Some foundations already exist; extend them instead of creating competing implementations.
