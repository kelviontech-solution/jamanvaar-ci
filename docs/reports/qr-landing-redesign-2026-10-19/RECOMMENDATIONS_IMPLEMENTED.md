# Restaurant page recommendations and shared QR Admin

Implemented locally on 19 October 2026. This extends the restaurant landing-page redesign; it does not deploy or publish changes to production restaurants.

## What changed

| Request | Result |
| --- | --- |
| Three varied signature dishes | Automatic selection prioritizes different published menu categories, then fills any remaining places without duplicate dishes. Explicit owner selections keep their order. The editor includes **Choose 3 varied dishes for me**. |
| Categories in the browse-only menu | Published categories appear as touch-friendly filter chips inside the on-demand menu. Category and name/description search combine. Translated category and dish names are used when supplied by the restaurant. The full catalogue stays outside the landing-page scroll. |
| Accurate Open now / Closed | Optional structured physical hours: restaurant timezone, seven weekdays, split shifts, overnight closing and dated exceptions. A closed holiday overrides a previous night's carry-over. The badge updates while the page is open and shows the next opening when known. Old prose hours remain supported; no opening status is guessed from them. |
| Restaurant-specific Google/social previews | Published title, description, canonical URL, Open Graph, Twitter card and Restaurant JSON-LD. Sharing images are restaurant-owned uploads or existing public cover/menu images. Structured weekly and holiday hours are included. No fabricated review ratings. Metadata is in the initial HTML, not only added after JavaScript loads. |
| Translate navigation and forms | Customer navigation, menu controls, reservation labels and feedback, hours/status labels, section text and contact actions have labels for English, Hindi, Gujarati, Marathi, Tamil, Telugu, Kannada and Bengali. Restaurant prose and menu translations retain their existing editing workflow and fall back when absent. |

Physical hours describe whether the restaurant is open. Online ordering availability remains governed by Ordering Rules and the existing payment/service controls; changing website hours does not silently pause orders.

## Making QR Admin easier

- Everyday navigation is shorter: Overview, QR Orders, Service Requests, Menu, Customers & Loyalty, Business Page, Tables & QR, Advanced Features and Analytics. Paid daily tools remain visible.
- **Find a tool** searches tool names, descriptions and groups. **All tools & setup** exposes every existing QR workspace destination. A deep link to another tool remains reachable even in the daily view.
- The business-page setup guide opens for an unpublished page and collapses for an already published page. Owners can reopen it at any time.
- Design choices form a balanced two-column grid, use the restaurant's available cover/dish photo and show distinct miniature layouts. Contact and first-impression editors start collapsed to reduce initial clutter.
- Setup cards have consistent spacing and alignment. Shared QR button styles now also load inside Restaurant Admin rather than relying on the separate product website's stylesheet.
- Weekly hours offer copy-Monday-to-all-days and holiday exceptions. No opening times are fabricated: newly enabled days require entered times.
- Search-preview and structured-hours changes appear with readable labels in publication review. Draft saving, affected-branch review, stale-version protection and explicit publication acknowledgement remain in place.
- Gallery navigation scrolls its own photo track rather than asking the browser to scroll all containing elements.

## Restaurant Admin and standalone QR Admin: access parity

Restaurant Admin renders `QrConsole` with `layout="integrated"`. Standalone QR Admin renders the same console with `layout="workspace"`. Both select the same page components and use the same API and entitlement checks. No separate reduced editor was introduced.

The browser checks enumerate all 24 QR workspace destinations and verify they are reachable in both layouts at desktop and phone widths. They also verify tool search and mobile drawer dismissal.

**What a purchased plan means:** a valid QR Ordering grant permits the QR workspace. Optional capabilities, including the restaurant website/page builder, continue to depend on the applicable plan/restaurant/branch grant. Buying the base QR product does not grant every optional add-on. Owner/manager role and branch restrictions still apply. This preserves the same licensing behavior in both entry points.

Owner route: **Restaurant Admin → QR Ordering → Business Page**, or the same **Business Page** destination in standalone QR Admin. Search for “Business Page” if using the shorter navigation.

## Owner setup

1. Select business defaults or the intended branch. Branches with their own published override keep that override.
2. Choose a design, welcome text, cover photo and signature dishes.
3. Open **Contact details → Opening status & holiday hours** to set the timezone, weekly shifts and exceptions. Leave structured hours disabled if they are not ready.
4. Open **More options → Search & social sharing preview** for the search title, description and optional sharing photograph. Empty fields use restaurant identity, welcome and existing photos.
5. Check the mobile preview, save the draft, review differences and affected branches, acknowledge the review, then publish.

## Verification

- Root targeted regression suite: **46 passing tests across 8 files**. Covers opening boundaries, restaurant timezone, split shifts, overnight carry-over, closed holidays, special dates, daylight saving changes, varied dishes, complete label tables, translated category filtering and initial-HTML metadata injection. Existing QR navigation/menu/editor regressions also pass.
- API suite: **47 passing tests across 4 files**: `qr-restaurant-page.e2e.spec.ts`, `qr-page-metadata.spec.ts`, `owner-console-plans.e2e.spec.ts`, `merged-admin-access.e2e.spec.ts`. These exercise real dedicated test-database persistence, publication/draft separation, unlicensed/foreign access refusal, uploaded-image ownership, structured-hours validation, HTML/script escaping and subscription/merged-console access.
- **9 focused browser scenarios pass**, using real components with isolated admin transport. All 24 destinations are reachable in both console layouts at 1440/390px. Customer checks cover category/search composition, variety and Gujarati controls at 320/390/1440px. Save/review/publish checks at 1440/390px verify hours, holidays, SEO and featured-item values in the fixture store; the API suite separately validates real persistence and authorization. See `recommendations-results.json`.
- **14 mobile browser scenarios pass**, covering the real local public page at 320, 360, 390 and 430px and 667px landscape, all four template fixtures at 320/390px, and the actual editor at 390px. See `mobile-results.json`. The public menu exposes all 40 published dishes without horizontal page overflow.
- Real Order online navigation still opens the actual menu in the same tab, with no order or payment created: `ordering-navigation-results.json`.
- A raw HTTP request to the real local public page contains the restaurant-specific metadata before JavaScript runs: `metadata-verification.json` and `published-initial-html.html`.
- Root/API type checks and guest, API and Restaurant Admin builds passed. The existing Restaurant Admin bundle-size warning remains; this task does not claim to fix overall admin bundle size.

Machine-readable evidence is combined in `recommendations-verification.json`. Browser-only fixtures do not contact a production tenant, send receipts or charge a payment.

## Implementation map

| Layer | Main files |
| --- | --- |
| Shared customer rendering | `packages/ui/src/restaurant-page/RestaurantPage.tsx`, `types.ts`, `restaurant-hours.ts`, `restaurant-labels.ts`, `restaurant-website.css` |
| Shared administration | `QrConsole.tsx`, `QrRestaurantPage.tsx`, `RestaurantPageDetails.tsx`, `QrPageEnhancements.tsx`, `restaurantPageSetup.ts`, `restaurant-page-editor.css`, `src/qr/workspace.css` in Restaurant Admin |
| Publication and public API | `cloud/api/src/modules/qr/qr-restaurant-page.schema.ts`, `qr-restaurant-page.service.ts`, `qr.controllers.ts`, `qr-page-metadata.ts` |
| Initial HTML and production serving | `apps/qr-guest/restaurantMetadata.ts`, `vite.config.ts`, `index.html`, `nginx.conf`; guest `src/App.tsx` passes published categories into the renderer |
| Regression evidence | `tests/qr_website_recommendations.test.tsx`, `tests/qr_website_metadata_shell.test.ts`, API `qr-page-metadata.spec.ts` and `qr-restaurant-page.e2e.spec.ts`, report-local `browser-check.cjs` and fixtures |

## Deployment requirements and limits

Deploy **the API, QR Guest and Restaurant Admin together**. No Prisma migration is required: the optional content fields are stored in the existing versioned page JSON, with defaults for old publications.

QR Guest's production build now emits `site.html` in addition to `index.html`. Its nginx configuration serves `/site/:slug` through SSI and requests the published metadata from the internal `backend:4000` upstream. The existing outer `/q/` proxy strips that prefix; assets and table-order routes keep their existing handling. If the deployment uses another backend hostname, adapt that upstream to the actual internal service name.

This workstation has no nginx/Docker runtime available, so the production SSI runtime is **not** claimed as verified. The built document emission, metadata service, Vite initial HTML and public API were verified locally. During deployment, run nginx configuration validation and fetch a real `/q/site/:slug` without JavaScript to confirm its title, canonical and sharing tags. Recheck an unpublished/disabled page and ensure it does not expose its prior metadata. The failure shell uses `noindex`.

Search indexing and social-platform cache refresh depend on those external services; metadata alone does not guarantee immediate indexing or a particular search appearance. No production deployment, real customer order/payment, tenant publication, commit or push was performed.

Implementation references: [nginx SSI](https://nginx.org/en/docs/http/ngx_http_ssi_module.html), [Google local-business structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business), [OpeningHoursSpecification](https://schema.org/OpeningHoursSpecification).
