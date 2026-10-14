# Recommended QR features — implementation and verification

14 October 2026. Follow-up to [the recommendations](IMPLEMENTATION.md). All six feature areas are implemented in the local workspace, using the existing menu, canonical orders, payment ledger, licensing and customer entities. This is not a production deployment report.

## What owners can use

| Feature | Where to open it | Implemented behavior |
| --- | --- | --- |
| Guided QR onboarding | **Guided Menu Setup** | Choose a cuisine from the existing template library, select the full template or individual categories, review dishes/images/prices and explicit tax settings, and save to the shared draft. Import preserves existing SKU/name matches. Variants and add-ons are carried into modifier groups. Owners can author additional option/tax groups, attach them in the shared dish editor, inspect visible/hidden dishes and added/updated/removed dishes, then publish. |
| Payment acceptance wizard | **Payment Acceptance** | Separates configuration checks from actual phone acceptance. Links to active table QR pages. Records mobile checkout, payment-app return and kitchen receipt against an online order that has a server-confirmed collection in the selected branch. Pending orders, cash orders, other branches and incomplete checklists cannot certify online acceptance. Prior evidence remains dated and clearly historical. |
| Unified timeline and daily reconciliation | **QR Orders → Timeline / payments**; **Collection Reconciliation** | Order creation, kitchen/status history, payment attempts and confirmed collections/refunds appear together. A direct ledger link opens the correct old bill. Reconciliation totals use collection/refund dates in restaurant/branch time, independently of order placement date; full summary totals group by canonical branch, collector and method. Detailed entries paginate separately; the CSV contains the complete grouped summary. |
| Service ownership and pickup calendar | **Service Requests**; **Pickup Calendar** | Assign an active branch staff member and/or branch device without changing request status. Save a reason, escalate for supervisor attention and view assignment/history in the shared QR/POS/Captain inbox. An overdue filter uses the existing configurable threshold. The calendar groups booked pickups by slot, displays capacity, order/payment state and items, and completes a ready order through the canonical completion action when the guest receives it. |
| Bulk QR print packs | **QR Print Packs** | Download selected active branded SVG cards, an A4 PDF, A4 HTML sheets, a CSV inventory and printing instructions in one ZIP. Four cards fit each sheet at 85 mm width. Inactive/revoked codes are marked for replacement and excluded from usable artwork. Active status is checked again before export. Direct Print / Save PDF remains available. |
| Consent-aware CRM and follow-up | **Customers & Loyalty** | Search all/returning/point-holding customers or contacts with recorded email/WhatsApp consent. Record channel permission plus its source, author private follow-up notes, and configure optional reward expiry. Owner-only exports are audited; contact-channel exports include only that channel's opted-in profiles. Identical consent does not acquire a new consent timestamp merely because a profile was edited. No campaigns are sent by these controls. |

These pages are available through the QR Admin sidebar. Existing optional capabilities still apply: loyalty, service requests and scheduled pickup cannot be granted by a local checkbox. Staff members can only be assigned within the request's branch. Customer profiles and loyalty remain restaurant-wide; QR order history and operations retain branch scope.

## Data integrity

- New workflows read the existing authoritative `SyncedOrder` and `OrderPaymentEntry` records. Pickup handover does not fabricate a payment, create another order or grant loyalty points by itself.
- Reconciliation scopes and groups entries through the order's branch, including older ledger rows whose own `branchId` is null. Totals are not limited by the 100-entry detail page.
- Payment acceptance requires a current owner/manager session, a matching branch and a server-confirmed online collection. The checklist records observed acceptance; it does not make an unverified payment successful.
- Assignments and customer changes check current versions. Point and follow-up retries preserve their references and cannot silently duplicate a write.
- Offline customer profile merges preserve newer consent records and immutable follow-up history alongside the existing point ledger. This prevents an older device snapshot from erasing an opt-out or service note.
- Expired rewards are hidden/rejected in QR redemption and no longer discount or deduct points in the shared POS reward path. Points themselves do not expire under this implementation.
- Slow report requests cannot overwrite a newer selected period. Invalid reports remove stale displayed/exportable data.
- New metadata uses existing entities. No new database migration is required for these feature additions.

## Practical limits

Template import is a shared-draft operation with batched writes. On a network failure, review the draft and retry; it keeps existing matches. Custom photo authoring currently uses the shared image URL editor and the existing template images. A separate media-library/file-upload workflow is not introduced here. Publication review shows dish changes, visibility warnings and a representative guest preview; the shared editor remains the place to attach newly authored options/taxes to individual dishes.

Acceptance is recorded per branch and should be repeated after merchant or checkout changes. It requires a real paid order in a live environment; these automated tests used simulated gateway transport. The wizard never automatically charges a production customer.

The service escalation is a persisted flag/history entry visible to staff through their shared inbox. It does not introduce SMS/push escalation or automatic staff scheduling. The pickup calendar displays booked slots; the existing guest scheduling engine continues to enforce opening hours, lead time and capacity.

Print packs contain at most 100 selected cards, with a logo-size limit to keep browser memory bounded. The inventory refuses a silently truncated export above 1,000 codes; select a smaller branch scope or review/archive old codes. The PDF embeds the exact shared branded card renderer, including Unicode text and raster logos. Real physical print/scan acceptance remains necessary.

CRM exports are bounded to 10,000 profiles and refuse silent truncation. Email/WhatsApp consent is a recorded staff assertion with source and timestamp, not proof of external message delivery. No marketing messages are dispatched. Follow-ups are private profile history, capped at 200 entries. Optional expiry applies to rewards, not to accumulated points.

## Verification

- **121/121 backend integration tests passed** across four suites covering QR ordering, mobile payments, operations, multi-branch authorization, collection-date reconciliation, online acceptance validation, named service assignment, consent export/revocation, follow-up retry safety and accurate publication comparisons.
- **30/30 shared POS/QR tests passed** covering reward selection, settlement, earning/refund reversal, expired reward rejection, metadata merge protection and QR generation.
- **13/13 new browser checks passed**: seven functional scenarios and six phone layouts. [Results](evidence/recommended-verification.json). The phone captures check overflow and unnamed controls after mobile navigation transitions settle.
- **8/8 original browser regressions passed again** on the final build, including draft preservation, accessible dialogs, partial collection, bounded menu views and shared CRM points. [Results](evidence/fix-verification.json).
- [ZIP/PDF verification](evidence/print-pack-verification.json) confirms archive checksums, A4 page dimensions, PDF page count and embedded QR card count. [Download test PDF](evidence/new-print-sheets.pdf); [rendered preview](evidence/new-print-pdf-preview.png).
- The original regression evidence remains in [IMPLEMENTATION.md](IMPLEMENTATION.md). [Final build/test summary](evidence/recommended-build-verification.json) records the actual final run counts and build results.
- API and QR Admin production builds passed. API, QR Admin, POS and Captain type checks passed. Vite reports the existing large-chunk warning; splitting the template/setup pages into lazy bundles remains a performance improvement.

Browser fixtures created temporary open service/pickup records so assignment and handover could be exercised. They are removed after the run. Template/customer/reward test edits remain audit-labelled in the isolated QA tenant. Optional entitlement configuration is restored after verification. Provider secrets and authentication tokens remain in ignored private files.

The first new service-assignment API test encountered the existing table cooldown; its fixture was corrected rather than weakening that control. An initial browser run had no open service request and lacked explicit select labels; these were corrected. A later follow-up test advanced before the save response, so it was fixed to await persistence before closing/exporting. Those earlier results are retained in the audit evidence.

## Files and reproduction

New backend: `cloud/api/src/modules/qr/qr-workflows.service.ts` and `qr-workflows.controller.ts`, registered in `qr.module.ts`. Existing QR operations/CRM, authentication guard and menu draft-status service were extended.

New frontend: `QrOnboarding.tsx`, `QrWorkflows.tsx`, `QrPrintPack.tsx`, `qrZip.ts`, `qrPdf.ts` in `apps/restaurant-system/pos-admin/src/components/qrconsole/`. Sidebar, order timeline controls, ledger deep links, CRM and shared `packages/ui/src/QrServiceInbox.tsx` were updated. Shared reward expiry/metadata merge rules live in the database/types packages and the backend loyalty/merge modules.

Backend regression runner: [backend-fixes.cjs](backend-fixes.cjs). Browser runner: [browser-recommended.cjs](browser-recommended.cjs), with the same compiled isolated API/static QA servers used in the original audit. Shared tests: `tests/crm_loyalty_checkout.test.ts` and `tests/qr_code_generation.test.ts`. Deployment still needs the API and frontend release, followed by real UPI return/settlement, communications transport and physical printer/scanner acceptance.
