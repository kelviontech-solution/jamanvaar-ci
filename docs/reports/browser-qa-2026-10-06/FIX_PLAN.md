# Proposed fix and regression plan — no fixes applied

Release remains NOT READY. Estimates are implementation-order recommendations, not guarantees that production will have no issues. Repair the demonstrated contracts before adding polling/retries or rewriting architecture.

| Priority | Findings | Concrete fix | Expected impact / release gate |
| --- | --- | --- | --- |
| P0 | B001 | Stable entitlement function/effect; one in-flight fleet request; existing 30-second interval. | Remove idle request amplification; production idle test bounded; verify entitlement changes still update modules. |
| P0 | B002 | One item-aware quote/snapshot across clients/payment/receipt; preserve zero and reconcile every component. | No customer payable mismatch or invalid tax receipt; full mixed/inclusive tax/report regression. |
| P0 | B003 + admission contract B006 | Separate payment from kitchen state, verified admission and durable KOT acknowledgement. | Paid order always reaches kitchen once, pending QR does not cook; cloud-only/crash/replay tests. |
| P0 | B004 | Instant Bill resolves current running order rather than unconditional create. | One sale/KOT/shift entry per basket; repeated/offline operations keep identity. |
| P0 | B005 | Server-verified staff refund permission/manager approval with bound scope and audit actor. | Cashier cannot bypass UI approval; authorized managers retain correct idempotent refund workflow. |
| P1 | B007 | Master inventory transport and deterministic bootstrap before movement replay. | Two-device stock truth and replacement-device recovery; no double-applied movements. |
| P2 | B008/B009/B010/B012 | Inventory reactive update; ledger-backed cash state; explicit auth/entitlement error recovery. | Immediate visible saves, honest cash reconciliation and clear sign-in recovery. |
| P3 | B011 + likely UX risks | Guard printer absence; distinguish queued/printed; verify KOT success label and render-side warnings. | No avoidable print TypeError; reduce repeat-click confusion after targeted evidence. |
| Verification gate | Not yet certified | All remaining control mutations, permission/complex ordering matrices, multi-instance/peak/soak, AWS and hardware/provider tests. | Do not approve release on route-rendering or local averages alone. |

Each confirmed bug includes files, reproduction, evidence, recommended fix and regression risk in JAMANVAAR_COMPLETE_QA_AUDIT.md. Retain Route-pending semantics: default Jamanvaar collection; direct-bank toggle is a request; MANUAL settlement stays effective until linked account/Route activation and bank verification. Commission applies to intended kiosk QR collections, not arbitrary cash sales. Positive commission-edit/new-payment/historical-snapshot test remains required.
