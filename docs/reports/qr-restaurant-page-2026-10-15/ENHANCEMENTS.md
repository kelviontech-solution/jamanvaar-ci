# QR restaurant page: eight improvements

Implemented locally on 15 October 2026. No production deployment or GitHub push was performed.

## What changed

| Improvement | Available behaviour |
| --- | --- |
| Guided launch checklist | The page studio combines publication status with existing QR menu, license, branch, table mapping, ordering, payment and routing checks. Task shortcuts retain the selected branch. Owners record a test scan and kitchen-receipt attestation against a real non-cancelled branch QR order created after publication. Publishing another version makes the previous acceptance outdated. |
| Automatic photo preparation | Accept JPEG, PNG and WebP up to 20 MB. The browser respects orientation, limits dimensions to 2,400 px and compresses to an upload below 1 MB. Images over 60 megapixels are rejected after decoding. Horizontal and vertical focal controls let the owner adjust the responsive photo crop. The shared preview displays the actual result. |
| Named Super Admin feature bundles | Restaurant Welcome, Guest Experience and Complete QR capabilities are starting bundles. Platform administrators can save the current feature selection as another named bundle or remove a saved bundle. Preview additions/removals, the resulting included features and affected branch names before applying to the entitlement draft. Saving the restaurant entitlement remains separate. Additive selection preserves existing grants; replacement explicitly permits removal. |
| Translated restaurant content | Owner-entered heading, tagline, welcome, story, opening hours, notice and footer translations; supported languages: English, Hindi, Gujarati, Marathi, Tamil, Telugu, Kannada and Bengali. Empty translation fields fall back individually to the main text. Owners select a default language and preview each language. Customer language choice carries into the existing guest language preference. Dish/menu translations remain under the existing menu feature. |
| Reviewed copying to branches | Owners choose up to 20 same-restaurant branches and selected content groups. Preview each target difference, acknowledge, then copy into drafts. Contact details and scan behaviour are excluded by default. Translated branch hours are preserved when copying only story content. Changed source/target drafts invalidate the review checksum. Each branch must still preview and publish its draft. |
| Scheduled, expiring notices | Optional start and end instants for the service notice and its translations. Controls name the device timezone; storage uses ISO instants. The editor can preview a future time. The public API hides notices outside their window; open guest pages refresh and remove expired notices. Ordering hours remain separate. |
| Engagement reporting | Explicit opt-in, off by default. Reports show 30-day counts for page views, menu opens, calls, WhatsApp, Instagram, directions and Google review-link clicks. No customer name, phone, event session identifier or IP address is stored in these page-event records. Client and API respect Do Not Track / Global Privacy Control. A review click is never counted as a submitted review. |
| Compare before publication | The review lists changed persisted settings, including text, scan behaviour, translations, privacy settings, notices, section order and photos. Expand a setting for live/draft values; photo changes show actual images. Scope review and acknowledgement remain mandatory before publication. |

Essential design and welcome settings remain visible. Story, gallery, contact, translations, scheduling and privacy controls are grouped under **More options**. Checklist shortcuts open the relevant nested section automatically.

## How to use

**Super Admin:** QR Ordering Suite → select restaurant → Set up restaurant page. Enable the page builder or choose a bundle, review its changes, apply to the entitlement draft and save. Bundles do not activate online payment, change pricing, create a subscription or publish restaurant content. Feature-catalog availability, rollout and branch licenses still limit effective access.

**Restaurant Admin:** QR Ordering → Restaurant Page. **Standalone QR Admin:** Restaurant Page. Both render the same implementation.

Choose scope, design and welcome; prepare photos; optionally add translations, contact links and a notice schedule. Use Save & review, compare with the live version, acknowledge the affected scope and publish. Finish the branch launch checklist with a real test scan/order. Copying to branches prepares drafts for individual review.

## Verification

| Check | Result |
| --- | --- |
| Final Chrome end-to-end run | **21/21 passed**. See [browser-results.json](evidence/browser-results.json); includes real Super Admin login/OTP and saving, image preparation, translated previews/customer page, notice preview windows, publication comparisons, branch draft copying, launch acceptance, branch-preserving task recovery, integrated Restaurant Admin and mobile layouts |
| Backend page integration | **16 tests passed**, including tenant/manager isolation, stale writes, image ownership, publication, translated notices, stale copy checksums, protected target branches, private drafts, anonymous events/privacy headers and invalid acceptance orders |
| Existing QR API regressions | **107 tests passed** across SaaS, operations, mobile payments and menu control |
| Focused client regressions | **20 tests passed**, six files: setup, shared renderer, translation fallback, exact notice boundaries, changed-field detection, capability labels, checkout SDK and signed guest-session proof |
| Builds | API release build and Restaurant Admin, QR Guest and Super Admin Vite production bundles succeeded. Existing large-chunk / mixed-import Vite warnings remain. |
| Type checks | Restaurant Admin, QR Guest and Super Admin passed. The API production build passes; broad API test-source checking also encounters pre-existing `unknown` fixture typing errors in unrelated suites. |
| Full repository run | **2,214 passed, 1 failed**, 316 files. The failure was the existing `tests/order_creation_integrity.test.ts` token-reset expectation (`K-101`, received `K-103`). All **9 tests in that file passed on an isolated rerun**. This is not reported as a clean full-suite run. |

Verification uses an isolated local QA database, actual compiled API and Chrome. The browser uploads a generated large PNG over 1 MB and verifies stored WebP bytes below 1 MB. It checks real image decoding, document overflow, uncaught page errors, draft/live separation, retained cart/table/order context and 360/390/430/960 px preview layouts. External delivery/payment transports are blocked or captured. Test orders are unpaid QA cash-at-counter orders. Social links are inspected and clicks captured without sending a message or submitting a Google review.

The launch test verifies a real order record plus administrator attestations. It is not evidence of an actual physical scan or staff receiving food on production hardware. Real-device/payment acceptance after deployment remains separate.

## Evidence

- [Feature-bundle review](evidence/super-feature-bundle-review.png)
- [Translated Gujarati customer page](evidence/guest-translated-gujarati-phone.png)
- [Publication differences and photograph comparison](evidence/publication-differences-desktop.png)
- [Reviewed branch copying](evidence/branch-copy-review-desktop.png)
- [Branch launch checklist](evidence/branch-launch-checklist-desktop.png)
- [Engagement reporting](evidence/page-engagement-report-desktop.png)
- [Same studio inside Restaurant Admin](evidence/integrated-restaurant-admin-page-studio.png)
- [Mobile editor](evidence/studio-edit-phone.png)

Earlier failed screenshots are debugging history and are superseded by the final passing JSON. One browser run had an ambiguous test locator for a branch name appearing in several places; the locator was scoped to the feature-bundle region before successful verification.

Reproduce using the existing isolated QA database and local compiled-app servers:

```powershell
node docs/reports/qr-restaurant-page-2026-10-15/browser.cjs
node docs/reports/qr-restaurant-page-2026-10-15/verify.cjs
node docs/reports/qr-restaurant-page-2026-10-15/verify.cjs regression
node docs/reports/qr-restaurant-page-2026-10-15/verify.cjs root
node node_modules/vitest/vitest.mjs run tests/qr_page_enhancements.test.ts tests/qr_restaurant_page_setup.test.ts tests/qr_restaurant_page.test.tsx tests/qr_admin_license_capability_labels.test.ts tests/qr_order_session.test.ts tests/qr_checkout_sdk.test.ts --maxWorkers=1
```

## Deployment and boundaries

Deploy the API, Restaurant Admin/QR Admin, QR Guest and Super Admin together. Existing page JSON is upgraded with schema defaults when read. These eight additions require no new database tables or migration beyond the original restaurant-page feature migration. Keep existing `/q/*` and public image routes, HTTPS and `QR_ORDER_BASE_URL` configuration.

New authenticated page routes: `launch`, `engagement`, `copy-preview` and `copy` under `/api/v1/tenant/qr-page`. Named bundles use `/api/v1/qr-ordering/feature-bundles` with platform authorization, optimistic revision checks and audit records. Bundles are stored in a dedicated `PlatformSetting` key and excluded from generic settings listing. Page launch records use server-owned `QR_PAGE_LAUNCH` entities, not generic client sync. Public action events derive restaurant and branch from an opaque published branch-page slug; callers cannot supply tenant/branch identifiers or arbitrary metadata.

Anonymous events are protected by the existing QR IP and token/slug rate limits. Counts are approximate interaction counts, not unique guests or a financial ledger; browser suppression, bots and retries can affect counts. Old page-event records are removed after 90 days when new events arrive for that restaurant; this is not a scheduled cleanup guarantee for inactive restaurants. Open pages refresh every 15–20 seconds, so notice activation can lag by that interval while the page remains open. Server responses always apply the current window.

Image optimization happens in the browser; the server retains its existing independent format, ownership and 1 MB upload validation. EXIF bytes are not uploaded by this preparation path. Focal controls change how a photograph is cropped in the layout; this is not an independent image-retouching application.

Translations are entered by the restaurant. UI navigation/section labels retain the existing interface language; this feature translates the restaurant-authored content, not every interface string. Schedules cover one service-notice window, not recurring promotions. Named bundles are reusable entitlement selections, not dynamically linked plans: editing a bundle does not silently change restaurants that previously used it.

## Implementation files

- Shared page model / behaviour: `packages/ui/src/restaurant-page/{types.ts,page-content.ts,RestaurantPage.tsx,restaurant-page.css}`.
- QR Admin studio / guidance: `QrRestaurantPage.tsx`, `QrPageEnhancements.tsx`, `optimizePageImage.ts`, `restaurantPageSetup.ts`, `restaurant-page-editor.css`, `QrConsole.tsx`, `QrAdvanced.tsx`.
- Tenant/public API: `qr-restaurant-page.{schema,service,controller}.ts`, `qr.controllers.ts`, scoped health helper in `qr-operations.service.ts`, slug rate limiting in `qr-rate-limit.ts`.
- Platform bundles: `qr-feature-bundles.ts`, `qr-ordering.{service,controller}.ts`, `QrFeatureBundles.tsx`, entitlement/detail editors and API types; exclusion in `platform-settings.service.ts`.
- Customer integration: `apps/qr-guest/src/{App.tsx,api.ts}`.
- Tests: `cloud/api/test/qr-restaurant-page.e2e.spec.ts`, `tests/qr_page_enhancements.test.ts`; browser runner/evidence in this report directory.

Existing unrelated workspace changes were preserved.
