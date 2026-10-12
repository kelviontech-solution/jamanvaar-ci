# Usability implementation status

Latest remaining-gap fixes and new findings: [REMAINING_GAPS_IMPLEMENTATION.md](REMAINING_GAPS_IMPLEMENTATION.md). The earlier findings below are preserved as audit history.
Latest statuses and remaining priorities: [NEXT_GAPS_IMPLEMENTATION.md](NEXT_GAPS_IMPLEMENTATION.md).

Updated 12 October 2026. The original audit is preserved in [REPORT.md](REPORT.md). See [IMPLEMENTATION.md](IMPLEMENTATION.md) for changes, evidence and limits. “Implemented” means applied to the current working tree, not deployed or accepted on production devices.

| Area | Current status | Acceptance still needed |
|---|---|---|
| Cash / shifts | Implemented: zero-preserving balances, explicit per-register opening, no synthetic next shift, transactional close. | Real counted tills, existing SQLite data and native upgrades. |
| Table release / collections | Implemented: separate release marker, preserved kitchen/payment state, all-date outstanding inbox, source filter and original-order settlement once. | Live cross-device collection/reconnect. A new write-off workflow is not included. |
| Payment provenance | Implemented: manual UPI is cashier-confirmed with actor/time/reference; server limits accepted metadata to payment-authorized device types. | Real gateway verification. Displayed clerk name is not server-attested employee identity. |
| Device identity / status | Implemented: activated IDs or persistent role UUIDs, real fleet and connectivity; no invented flagship tenant or healthy core. | Multiple physical terminals on the actual branch core. |
| Cashier navigation | Implemented: persistent Billing, Orders, Tables, Collect, independent scroll and readable labels. | Representative cashier task timing and error rate. |
| Owner launch / navigation | Implemented: server-backed menu readiness, branch-scoped onboarding, grouped licensed tasks, sole accessible branch default. | Authenticated publication and branch-isolation browser acceptance. |
| Kiosk journey / overrides | Implemented: skip single choices, configurable modes/table binding, branch defaults and per-terminal overrides; strict server schema updated. | Physical touch kiosk and live configuration acknowledgement. |
| Captain handover | Implemented: incoming PIN, floor tasks, notes/audit, unpaid-bill preservation; actual shift/table statistics. | Cached staff validation and queued sync are used; server-attested handover is a separate improvement. |
| KDS display | Implemented: compact/comfortable/TV density, station/device timing preferences. | Physical kitchen readability. |
| Staff language | Core Gujarati/Hindi POS/Captain/KDS actions implemented with fallback. | Advanced settings and all errors are not fully translated. |
| Publication acknowledgements | Implemented: existing real acknowledgements retained and optimistic delivery wording corrected. | Actual offline/reconnect/device delivery. |
| Unused-code cleanup | 650 unused import bindings removed while preserving runtime side effects; obsolete discount handler and unused dashboard computations removed. | Remaining locals/parameters, public guard ownership, typing and domain refactors. |

Additional fixes: payment splits survive order creation; unknown prior tender stays OTHER instead of becoming cash; released-table sync no longer reoccupies the table; legacy bill-discount methods use the current manager-approval path. Regression tests cover these cases. The private, unused legacy `RestaurantDashboard` and six exclusive helper components were removed after confirming the active admin uses `BranchBusinessDashboard` and no app/test imports the old group.

Remaining code improvements: authorized server-backed discount-policy configuration (existing 25% / ₹500 approval defaults remain), large bundle/domain-file reduction, remaining `any` and unused diagnostics, and full staff-language coverage. No 10/10 score or production acceptance is inferred from builds or isolated fixtures. No changes were pushed or deployed.

## Original acceptance targets

The table below retains the original proposed outcomes for comparison; implementation status is above.

| Priority | Change | User outcome | Acceptance |
|---|---|---|---|
| P0 | Remove automatic ₹2,000/synthetic next shift; preserve zero cash | Cashier sees the money and register actually opened | Zero/nonzero float, two tills, close/reopen and recovery preserve identities/amounts |
| P0 | Separate table release, service completion, payment and write-off | Captain cannot mistake a freed table for a paid bill | Pending bill remains visible and collectible; payment/write-off requires its own event |
| P0 | Distinguish manual UPI acknowledgement from gateway verification | Cashier knows which money was verified automatically | Actor/reference captured for manual confirmation; gateway state only from backend |
| P0 | Use activated IDs in local mesh/session/shift records | Multiple same-type terminals remain distinguishable | Two POS, KDS and Captain clients have distinct IDs without changing package/activation identity |
| P1 | Persistent POS Billing/Orders/Tables/Cash navigation | Cashier changes task without a navigation detour or losing cart | Switch views on tablet and desktop, preserve unsaved cart, readable category labels |
| P1 | Verified launch checklist using existing QR health/publication checks | Owner knows when guests can actually order | Uploaded but unpublished menu remains incomplete; branch-specific readiness and actionable retry |
| P1 | Simplify Kiosk one-choice language/mode/table steps | Guest reaches food sooner | Single choices skipped; multiple choices available; invalid/inactive mode never offered |
| P1 | Promote existing counter settlement into collection inbox | Cashier sees outstanding QR/Kiosk/Captain bills | Source filters, balances, retry provenance and double-collection prevention |
| P1 | Guided captain/register handover | Staff can end work without losing unpaid bills or ready dishes | Outgoing tasks assigned, incoming acknowledgement, permission checks and audit |
| P1 | Group owner and QR Admin tasks; distinguish defaults/terminal overrides | Owner finds common tasks without learning every setting | Full licensed features retained; one-branch default; cross-branch data remains isolated |
| P2 | KDS tablet/TV density and station timing presets | Kitchen can read and act from the actual working distance | Allergy/quantity/status remain readable; long tickets fit; no accidental status action |
| P2 | Gujarati/Hindi core staff UI | Staff understand daily actions and errors | POS/Captain/KDS critical workflow labels translated consistently, with fallback |
| P2 | Device publication acknowledgements and actionable connection status | Owner knows which terminal needs attention | Status based on real acknowledgement, offline billing available, pending queue shown |
| P2 | Review compiler-unused declarations and two module candidates | Smaller code surface for safer future UX changes | Keep workers/tests/public exports; preserve touch-first test behavior and authorization |

Treat owner login, menu publishing, cashier settlement, kitchen preparation, table service and guest payment as acceptance workflows across the separate apps. Run real authenticated browser/device validation before labeling any workflow complete.
