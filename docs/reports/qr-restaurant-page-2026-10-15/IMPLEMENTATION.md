# QR restaurant page builder

Implemented locally on 15 October 2026. No GitHub push, production migration or deployment was performed.

**Latest:** all eight requested enhancements are implemented, with **21/21 browser scenarios passed**; see [ENHANCEMENTS.md](ENHANCEMENTS.md) for the feature matrix, current verification, deployment details and limitations. The verification section below records the earlier implementation baseline.

The follow-up [setup usability improvements](SETUP_USABILITY.md) add a dedicated Super Admin access card, guided QR Admin setup, missing-detail prefill, Save & review, clear publication status, load recovery and branch sharing without leaving a draft. The latest browser run passes **16/16** scenarios.

## What is available

QR Admin → **Restaurant Page** now contains a shared page studio, available from the existing standalone and integrated QR consoles. It creates restaurant-owned pages using the same public renderer used by the preview.

Three designs have distinct compositions:

- **Heritage:** warm ivory, serif headings, food photograph followed by an editorial welcome on phones; photograph and welcome side by side on desktop.
- **Café:** centered bold headings, rounded buttons, peach tones and an arched photograph.
- **Modern:** full-bleed food image, layered white welcome text, square actions and green accents.

Actual mobile browser captures using QA sample content:

| Heritage | Café | Modern |
| --- | --- | --- |
| [Mobile design](evidence/guest-heritage-phone.png) | [Mobile design](evidence/guest-cafe-phone.png) | [Mobile design](evidence/guest-modern-phone.png) |

[Desktop editor](evidence/studio-heritage-desktop.png), [phone editor](evidence/studio-edit-phone.png), [phone preview](evidence/studio-preview-phone.png), [original order return](evidence/guest-original-order-return.png).

Owners can edit the heading, tagline, welcome, story, accent, logo, hero photograph and focal point, gallery/captions, featured published dishes and section visibility/order. The footer supports public phone, WhatsApp, Instagram, address, directions and a branch's Google review link. Physical opening hours and notices are separate from existing online-ordering rules. Empty sections are hidden; names/text/buttons remain live UI.

The studio has 360/390/430px and desktop previews. These use the selected layout width and scale to the available editor space, rather than merely squeezing a desktop layout into a phone border. On phones, Edit / Preview controls retain access to publication actions. Unsaved edits participate in the existing navigation warning.

## Enable and publish

1. Apply the new feature-catalog migration listed below.
2. Super Admin → QR Ordering → restaurant → entitlement/capabilities: enable **Restaurant website & mobile page builder**. The capability can also be included through the existing plan feature catalog; branch restrictions can narrow it.
3. Restaurant owner → QR Admin → **Restaurant Page**. Select **Restaurant-wide defaults** or a branch. Managers may edit only their assigned branch.
4. Select a design, enter the restaurant's actual content and upload images. JPEG, PNG and WebP under 1 MB are supported by the editor. The server validates image bytes, ownership, contacts and permitted outbound links.
5. Enable the page, then choose **Open menu directly** or **Show restaurant page first**.
6. **Save draft → Review & publish → acknowledge affected scope → Publish reviewed page.** Saving alone does not change the published page. The review lists inherited branches and identifies branches without the page capability.
7. Select a branch to open/copy its shareable page link. Links use the server's configured public website address, so native admin apps do not generate links to their own local origin.

Existing restaurants stay on direct-menu behavior unless explicitly enabled and published. A branch can publish its own complete override or choose **Use restaurant defaults**. Previous publications can be restored into a draft and reviewed before republishing. Draft revisions prevent stale concurrent saves/publication and prevent an old branch draft overwriting a later inheritance change.

## Guest behavior

- Existing `/q/:token` codes retain their original restaurant, branch and table. Printed QR codes do not need replacement.
- A fresh scan opens the configured restaurant page or direct menu. The page keeps a visible View menu action, including a sticky phone action.
- Featured dish View opens the real menu customization flow, including existing modifiers/allergens, without silently adding an item.
- Table/cart/order/payment records continue through the existing authoritative APIs. No second ordering or payment engine was added.
- Restaurant name/logo/colours/welcome imagery carry into the menu. The expanded restaurant footer replaces duplicate footer attribution when this page is active.
- A published information page can load before a menu exists. It explains why menu ordering is unavailable and still exposes contact details. Paused ordering remains governed by the existing service rules.
- Restored carts and explicit order/payment-return URLs resume their relevant task. An explicit order return starts in status/recovery even when the order cannot be restored, rather than silently falling through to a landing page.
- `/q/site/:slug` is a shareable, browse-only branch website/menu. It carries no table identity and exposes no order-creation permission. Contact the restaurant to order from this share route; table QR ordering continues normally.
- Google review links open Google's own page. Private feedback stays separate. No ratings, reviews or successful review submissions are invented.

The share route stays under the existing `/q/` deployment prefix, avoiding a new hosting rewrite requirement for `/r/`. Jamanvaar marketing and administrator login routes remain separate.

## Additional bugs fixed during acceptance

1. Public QR API responses could be reused stale during menu/page changes. Calls now request `no-store`; explicit menu ETag refresh still uses the server's existing validation. Entering the menu rechecks availability.
2. Adding About & contact squeezed a long restaurant heading into a narrow mobile header column. The phone header now uses a deliberate grid, with separate space for identity, table and information action.
3. Status/payment retry/verification/counter-fallback calls did not consistently attach the original signed guest browser session. The server correctly refused protected orders, but return navigation appeared broken. The client now carries its stored signed proof consistently; missing proof is never fabricated. A real scoped order-return browser test and request-header regression tests cover this fix.
4. A prior QR token test rejected any random token containing the digits `12`. Random tokens can legitimately contain those digits. The test now checks absence of the explicit table label while retaining token-format and server-resolution assertions.

## Authorization and storage

- New capability: `QR_RESTAURANT_PAGE` → `qrRestaurantPage`, registered in the existing capability catalog and Super Admin labels. It requires the base QR product, an active catalog feature/rollout and an effective restaurant/branch grant.
- Private management uses current tenant-account authentication and OWNER/MANAGER scope checks. A device credential alone cannot edit the page. Restaurant-wide edits require OWNER.
- Drafts, publications, history and public-link mappings use existing RLS-protected `SyncedEntity` records: `QR_RESTAURANT_PAGE`, `QR_PAGE_PUBLIC`, `QR_PAGE_HISTORY`, `QR_PAGE_LINK`. They are not added to generic client entity-sync write/read allowlists.
- Publication and draft writes use the existing entity advisory lock, optimistic revisions and audit records. Public responses contain published page fields only; private drafts and licensing details are not served to guests.
- Images reuse the existing content-addressed image store. References must belong to the authenticated restaurant. No arbitrary HTML, CSS, JavaScript or iframe embed field is accepted.
- Branch allocations cannot grant unpurchased products or expand restaurant grants. Revoking the page add-on falls back to ordinary QR menu behavior; revoking the base QR product follows existing QR authorization.

## Verification

All browser/API fixtures run against the isolated local QA database. External mail/gateway transports remain blocked or captured. The browser created an unpaid QA cash-at-counter order to verify the original-order return; no real collection or customer message was sent.

| Check | Result |
| --- | --- |
| New backend integration suite | **11 passed**: account/branch authorization, add-on denial/grant, validated images/links, concurrent edits, draft isolation, publication, branch address/overrides, share route privacy, original table QR, canonical menu, version restore, inheritance and branch licensing |
| Existing API regression | **107 passed**, four suites: QR SaaS, operations, mobile payments and menu controls |
| Full repository regression run | **2,205 passed**, 313 files |
| Final focused client regression after guest-session correction | **25 passed**, six files: shared page rendering, order-session proof, checkout SDK, order propagation, counter/KDS ticket behavior and capability labels |
| Browser after setup usability improvements | **16/16 passed**, including real Super Admin access setup, loading recovery, prefilling, publication guidance, branch sharing with draft preservation, real image upload, mobile layouts, all three designs, missing menu, original table/cart, featured customization, browse-only share URL, original order return and branch overrides |
| Setup usability regression | **12 passed**, three files: setup defaults/status/validation, shared rendering and capability labels; page backend suite rerun: **11 passed** |
| TypeScript | Restaurant Admin, QR Guest and Super Admin passed |
| Builds | API, Restaurant Admin, QR Guest and Super Admin passed; existing Vite large-chunk warnings remain |

The full repository run preceded the final signed-session correction and setup usability follow-up; focused client, backend and browser runs cover those changes. Counts overlap and must not be summed as unique scenarios. Successful browser results are in `evidence/browser-results.json`; earlier `failure-*` captures remain as historical debugging evidence and are superseded by that JSON.

Browser checks exercised real forms and the real compiled API. They verified page overflow, actual image decoding, preview layout widths and cart/order identity. External social/review destinations were checked as links; no Google review, WhatsApp message or phone call was submitted.

Reproduce with the existing isolated QA database and local browser servers:

```powershell
node docs/reports/qr-restaurant-page-2026-10-15/verify.cjs
node docs/reports/qr-restaurant-page-2026-10-15/verify.cjs regression
node docs/reports/qr-restaurant-page-2026-10-15/verify.cjs root
node docs/reports/qr-restaurant-page-2026-10-15/browser.cjs
node node_modules/vitest/vitest.mjs run tests/qr_order_session.test.ts tests/qr_restaurant_page.test.tsx tests/qr_checkout_sdk.test.ts tests/qr_order_propagation.test.ts tests/qr_order_desk.test.ts tests/qr_admin_license_capability_labels.test.ts --maxWorkers=1
```

## Deployment

Apply `cloud/api/prisma/migrations/20261015160000_qr_restaurant_page/migration.sql` through the normal Prisma migration process, after preceding migrations. This adds an optional feature catalog entry and does not automatically grant it to existing customers. Page data reuse existing tables; no package identity or signing key changes are required.

Build/deploy the API, Restaurant Admin/standalone QR Admin bundle, QR Guest bundle and Super Admin bundle. Keep `/q/*` routed to the QR guest application, including `/q/site/*`. Configure `QR_ORDER_BASE_URL` to the public website base (the same setting existing table QR URLs use); production share links require HTTPS. Preserve the existing uploaded-image endpoint routing. Private image uploads have a scoped 2 MB authenticated JSON request limit, with 1 MB decoded-image validation.

This implementation has not been deployed to production. Real phone/browser acceptance and live gateway checkout after deployment remain necessary; the local order-return test is not evidence of an actual paid gateway transaction.

## Boundaries

- Public share pages currently browse/contact; they do not create takeaway orders or assign tables. Ordering remains on authorized QR-code routes.
- Three templates are shipped. This is a controlled content/design editor, not arbitrary HTML/CSS or a drag-and-drop website builder.
- Branch overrides are complete page versions, not per-field live inheritance. Global changes leave a branch's published override intact.
- Custom domains, an SEO-friendly slug registry, imported Google ratings, Instagram feeds, translated page-content versions and page/contact-click analytics are not included in this batch. The original proposal identified external integrations/analytics as optional extensions.
- Images and review/contact information are restaurant-entered. The system does not invent venue photos, opening hours or Google reviews. The preview screenshots contain QA sample content.

## Changed implementation areas

| Area | Files |
| --- | --- |
| Shared renderer and design contract | `packages/ui/src/restaurant-page/types.ts`, `RestaurantPage.tsx`, `restaurant-page.css` |
| Page management API | `cloud/api/src/modules/qr/qr-restaurant-page.schema.ts`, `.service.ts`, `.controller.ts`; registration in `qr.module.ts` |
| Guest published/profile/share API | `qr-public.service.ts`, `qr.controllers.ts`; scoped upload limit in `common/body-limits.ts` |
| Licensing | `application-entitlements/qr-capabilities.ts`, migration `20261015160000_qr_restaurant_page`; Super Admin `QrEntitlementEditor.tsx`, QR capability labels |
| QR Admin editor | `components/qrconsole/QrRestaurantPage.tsx`, `restaurant-page-editor.css`, `QrConsole.tsx`, `qrNavigation.ts` |
| Guest route/navigation/branding/session | `apps/qr-guest/src/App.tsx`, `api.ts`, `styles.css` |
| Verification | `cloud/api/test/qr-restaurant-page.e2e.spec.ts`, QR SaaS assertion updates, `tests/qr_restaurant_page.test.tsx`, `tests/qr_order_session.test.ts`, scripts/evidence in this directory |

The workspace also contains earlier authorized work. Unrelated changes were preserved.
