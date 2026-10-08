# QR menu, payment flow and staff removal — 8 October 2026

Implemented and verified locally with compiled Restaurant Admin, mobile QR Guest and KDS applications against the isolated QA API/database. No production configuration, credentials or customer records were changed.

## Confirmed causes and fixes

| Problem | Evidence / cause | Fix | Impact |
| --- | --- | --- | --- |
| Imported dishes missing from QR | CSV/template import sent draft entities but described this as publication. QR reads a numbered published snapshot. | Both import paths now deliver the catalog and call the existing guest publication API. Menu & Catalog also has **Publish to QR / Kiosk** for previously saved imports. Failures are reported as pending publication. | A complete 100-dish Admin import appears on the same table QR. |
| An empty menu remained published | A scan during the first upload could automatically freeze category/tax records before any dish arrived. | Do not create an automatic first snapshot without valid dishes. Recover an older empty snapshot only when it was an **Automatic first publication**; explicit owner publications remain stable. | First-upload timing no longer permanently strands guests on an empty version. |
| A category blocked publication | Browser QA reproduced `MENU_CATEGORY rejected: sortOrder Expected number, received null`. CSV/template category creation used `Math.max` on legacy categories without valid sort orders, producing `NaN`, serialized as `null`. | Ignore nonfinite existing sort orders when assigning new category order. Regression coverage includes legacy missing and invalid values. | Imported categories can synchronize and publication can finish. |
| Order screen appeared before Razorpay | Checkout navigated to Status before redirecting. Backend also requested provider payment status immediately after creating checkout. | Render **Opening secure payment** before redirecting; keep pending payments at the Checkout progress step. Reuse the freshly created checkout view to avoid the extra provider status fetch. Refresh authoritative status immediately on return. | Customers proceed to secure payment before confirmation. Confirmation and kitchen dispatch still require verified payment. |
| Staff Delete appeared ineffective | The repository correctly deactivated staff, but Staff & Roles displayed inactive accounts as active. | Filter inactive accounts from the active roster/counts and immediately synchronize deactivation. Report offline/pending revocation truthfully. | Removed staff disappear, remain removed after reload, and cannot sign in with their old PIN once synchronized. Historical order attribution is preserved. |
| KDS waited for a nonexistent Captain | The full QR flow reproduced **Waiting for captain** although no Captain was activated in that branch. KDS used the default local PRO license to determine handoff. | Existing KDS heartbeat now supplies handoff policy from active Captain entitlement plus an active Captain device in the same branch. Persist the policy through ordinary requests; clear it when restaurant/branch binding changes. | Branches without Captain can finish table orders from KDS; branches with Captain retain the delivery handoff. Other branches cannot change the decision. |

QR payment actions also have separate, wrapping touch targets so **Pay at counter instead** and **Check payment status** do not run together on mobile.

## Verification

- **52 backend tests passed:** first publication/recovery (5), QR payment/idempotency/recovery (22), QR menu controls (18), branch/device configuration and handoff (7).
- **89 client/component tests passed:** menu CSV/templates, staff synchronization, guest cart, QR propagation (58); device gate, heartbeat health and KDS service controls (31).
- **5 complete Playwright browser scenarios passed**, using actual compiled applications, authentication, signatures, RLS and database records. No page JavaScript errors were recorded.
- Builds passed for Cloud API, Restaurant Admin, QR Guest and KDS. Admin/KDS retain their existing large-bundle advisory.

Browser scenarios:

1. Scan while only the first category has uploaded: show a retryable menu state and create no empty snapshot.
2. Import **100 CSV dishes in Restaurant Admin**: automatically publish them; the same table QR returns and renders all 100.
3. Choose online payment: open checkout before confirmation; create no unpaid KDS ticket.
4. Deliver a signed, verified payment event: confirm the same order, create one kitchen ticket, mark Ready/Served from KDS, and show **Order completed** on mobile QR.
5. Remove the kitchen staff account: remove it from the active roster, synchronize `isActive: false`, reject its old PIN, and preserve removal after Admin reload.

Evidence: [browser results](BROWSER_RESULTS.json), [100-dish menu](evidence/qr-hundred-dishes.png), [paid and completed QR order](evidence/qr-paid-completed.png), [staff removed](evidence/staff-removed.png).

## Files

- `apps/restaurant-system/pos-admin/src/components/menu/{MenuImportModals,MenuCategoriesModule}.tsx`
- `apps/restaurant-system/pos-admin/src/components/{PrebuiltMenuModal,staff/StaffRolesModule}.tsx`
- `packages/business/src/{menu_csv,menu_template_import}.ts`
- `cloud/api/src/modules/menu-publications/menu-publications.service.ts`
- `cloud/api/src/modules/qr/qr-public.service.ts`
- `apps/qr-guest/src/{App.tsx,styles.css}`
- `cloud/api/src/modules/devices/devices.service.ts`
- `packages/sync/src/device_gate.ts`
- `apps/restaurant-system/kds/src/App.tsx`
- `tooling/qa/browser-qr-menu-staff.cjs` and the isolated browser audit server.

## Production verification still required

These are local implementation and QA results. The changes require deployment to affect `system.kelviontech.in`.

Razorpay transport and its hosted page were simulated; no money was moved and no real email/WhatsApp delivery was sent. Signed payment verification, duplicate protection, retry/counter recovery and order-to-KDS integration exercised the actual backend. A physical-phone UPI payment on the deployed merchant account remains to be checked. This audit does not measure AWS or live Razorpay latency; it confirms removal of an unnecessary provider round trip.

Offline staff removal takes effect on other devices after synchronization. The Admin now makes pending synchronization visible instead of claiming access was revoked everywhere.
