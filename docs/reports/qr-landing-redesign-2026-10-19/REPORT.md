# QR restaurant website redesign — 19 October 2026

Latest mobile changes and prioritized suggestions: [MOBILE_REVIEW.md](./MOBILE_REVIEW.md). Mobile screenshots use the `mobile-refinement-` prefix; other screenshots below show the preceding website redesign.

## Latest revision: a website first, menu on demand

Following the clarified reference-site flow, **the complete catalogue no longer appears in the landing-page scroll**.

- **Order online** in the navbar, hero and mobile action opens the branch’s existing ordering page **in the same tab**. The `#menu` destination skips the website introduction even when that branch normally opens its business page first. The original QR token, branch context, cart and checkout implementation are preserved.
- **Menu**, **Explore the menu** and **Explore the full menu** open a separate, searchable menu dialog for standalone website visitors. It shows real published prices/allergens and provides Order online when the branch has an ordering link. Closing or pressing Escape returns to the website; keyboard focus stays inside while it is open.
- Table-QR visitors retain their existing direct transition into their table’s menu/cart. The website does not introduce a competing checkout.
- The landing page follows **photo hero → a few signature dishes → story → gallery → menu invitation → visit/locations → testimonials → reservations → footer**. Story, gallery, reviews, locations and reservations appear only when their saved content/capabilities support them. The signature showcase is a teaser, not the full catalogue.
- Heritage now has a wide photograph-led hero with a dark green overlay and readable editorial typography. Signature dishes have larger photographs; mobile visitors can swipe their short showcase. Story has a photograph alongside the text, gallery has its own visual section, and visit details have a distinct card.
- Location maps load on request rather than leaving a blank embedded frame while external Google resources load. Directions remain a direct link.
- QR Admin previews use this same flow, explain the distinction between website/menu/ordering, and keep preview order links from navigating into the live checkout.

Latest visual evidence uses the **`website-`** filename prefix. Earlier `public-after-*` and `admin-after-*` images represent the first revision.

## Scope

Compared the public [reference restaurant website](https://restaurant.kelviontech.in/) with the existing [local demo page](http://localhost:5190/q/site/jamanvaar-demo-restaurant-Ny2fFTbr). Improved the shared customer-page renderer and QR Admin’s **Branding → Business Page** editor. The same renderer serves both the customer page and the editor preview.

The reference is useful for photography, hierarchy, clear calls to action and a complete footer. Its restaurant-specific claims, reviews, statistics and content were not copied. Existing tenant content and published records were preserved.

## Problems addressed

| Before | Change |
| --- | --- |
| Missing cover leaves a large blank hero | Use the published menu’s first available dish image, then an existing gallery photo. An owner-uploaded cover wins; a failed cover can fall back to the dish image. The hero image loads eagerly. |
| Large title and unbalanced desktop layout | Heritage now uses a wide food/restaurant photograph with an editorial text overlay, restrained spacing and responsive type. All four existing designs remain available. |
| Action links inherit ordinary link colours/underlines | Primary actions retain readable button text, styling and focus indicators. |
| “Order online” appears alongside instructions saying to contact the restaurant | Public-page copy follows the configured ordering link; browse-only actions use menu wording. No online-order link is advertised for an empty menu. |
| The website turns into a full catalogue while scrolling | Keep the landing page editorial. Open the menu separately from navigation/Explore actions and route Order online to the existing ordering screen. |
| All dishes appear as a long card wall | The on-demand menu starts with eight compact entries, allows name/description search and expands by twelve. Every dish remains accessible; prices and allergen declarations are preserved. |
| No showcase unless the owner finds and configures it | When Featured is enabled and no dishes are explicitly selected, display the first three menu dishes. Owners can choose up to eight or hide the showcase. |
| Crowded mobile header | Provide expandable section navigation with accessible state, keyboard dismissal and focus when opening sections. |
| Desktop bottom action duplicates the header and hero | Show the persistent bottom action on smaller screens. |
| Sparse footer | Show restaurant identity, branch, address, opening hours and configured contact/social/review links. Empty fields stay hidden. |
| Gallery indicator can disagree with the active slide | Calculate the nearest slide from its actual offset, accounting for gaps. Use pressed-state buttons for photo navigation. |
| Main website content controls are buried in advanced options | Move story, photo-based featured-dish selection and gallery into the main editor steps. Keep testimonials, press, languages and scheduling under More options. |
| Editor and guest page resolve missing dish images differently | Apply the same dish-image resolution to editor previews. Explain the automatic cover fallback beside the upload control. |
| Preview presents a fake table context | Remove the invented table number; show the real configured ordering label, while preview clicks cannot open the live ordering route. Explain that branch settings govern live ordering/reservations. |
| Narrow-screen preview controls can overflow their container | Give editor controls consistent border-box sizing. Verify the document width after draft save and reviewed publication. |
| Indian design’s mobile image can collapse after stacking | Give its stacked image and copy explicit responsive widths. |

## Verification

Reproducible browser script: `node docs/reports/qr-landing-redesign-2026-10-19/browser-check.cjs`.

- The real local public page is checked at 1440, 960, 430, 390 and 360 pixels. Checks cover the loaded hero image, search/empty results, access to all 40 published dishes, mobile navigation and horizontal overflow.
- Four designs are exercised at desktop and mobile widths using the real shared renderer and isolated sample content. Gallery navigation and loaded cover images are checked.
- The real editor component is exercised with **isolated in-memory API/auth transport and printing stubs**. Checks cover editing, draft save without publication, review acknowledgement and publication at desktop/mobile widths. These checks do not authenticate to or write to a restaurant account.
- `browser-results.json` records successfully completed browser scenarios. The test script stops on a failed assertion; partial results are not a claim of a full pass.
- Targeted Vitest checks cover renderer behaviour, safe links, image fallback, full-menu access, search, section order, navigation, safe preview actions and the existing setup/publication rules.
- Guest and Restaurant Admin production bundles and the root TypeScript gate are checked separately. Final outcomes are recorded below after completion.

### Completed verification results

- **21/21 targeted tests pass** across the renderer and setup-rule test files, including separate landing/menu behaviour, scroll restoration, same-tab ordering, explicit menu destination and load-on-request maps.
- **Root TypeScript check passes:** `tsc -b --pretty false`, exit code 0, no diagnostics.
- **15 page/editor browser scenarios pass:** five real public-page viewport checks, eight template checks and two editor checks. They verify that the full menu is initially absent, can be opened on demand, and closes correctly. Template checks include native-dialog keyboard focus containment. No horizontal document overflow in those scenarios; no browser runtime errors were recorded.
- **One additional real navigation scenario passes:** the navbar’s Order online opens the actual 40-dish ordering menu in the same tab, bypasses the introduction, and initiates no order/payment requests. See `ordering-navigation-results.json` and `ordering-navigation.cjs`.
- The editor checks verify that saving a draft does not publish it, publication remains disabled until the review acknowledgement is checked, and the reviewed title is actually published to the fixture store.
- Guest and Restaurant Admin production builds passed again for the website/menu separation, including their standard public assets and admin app-shell generation. Restaurant Admin retains the existing large-bundle warning; reducing the overall admin bundle is a separate performance task. An earlier isolated bundle experiment omitted public assets and consequently could not generate the admin service worker; the standard builds above resolve that verification-only setup issue.
- Machine-readable browser/test counts: `verification-summary.json`; detailed browser scenarios: `browser-results.json`. The final root typecheck exit status is recorded in `typecheck-result.json`.

Latest visual evidence: `website-public-1440.png`, `website-public-390.png`, `website-menu-mobile.png`, `website-order-destination-mobile.png`, `website-admin-1440.png`, `website-admin-390.png`, and `website-<design>-<width>.png`. Failed intermediate screenshots are retained with `overflow` or `before` labels as debugging evidence, not final acceptance images.

Local browser verification forwards `localhost:4000` to `127.0.0.1:4000` because the existing guest server listens on IPv6 localhost while this API instance listens on IPv4. Responses still come from the real API; authorization and response data are not replaced in the public-page check.

## How the owner makes it look like their restaurant

Open **QR Admin → Branding → Business Page** (also available through the shared QR workspace in Restaurant Admin), select the branch/default scope, and:

1. Choose a design. Heritage now provides the wide photograph-led restaurant introduction; Modern, Café and Indian remain distinct alternatives.
2. Upload a real restaurant/food cover and logo, then set the heading, short cuisine tagline and welcome text.
3. Add opening hours, address, directions, phone, WhatsApp, Instagram and the direct Google review link.
4. Select signature dishes, add a short story and upload genuine dining-room/food gallery photographs.
5. Check the mobile and desktop previews, save the draft, review the affected scope and publish.

The demo’s existing restaurant name, press entry and testimonial remain its saved content. A layout change does not replace those records or invent missing opening hours, photographs, reviews or claims.

## Follow-up recommendations implemented

**Latest:** Restaurant Page QRs now have their own design/print workspace, and fresh Table Ordering QR scans open ordering directly. See [TWO_QR_TYPES.md](./TWO_QR_TYPES.md) for setup, verification and deployment notes.

The five requested follow-ups—varied signature dishes, category filters, structured opening status, server-rendered search/social metadata and translated customer controls—are now implemented. QR Admin navigation and editor cards were also simplified, and the shared Restaurant Admin/standalone QR console was checked for feature-access parity. See [RECOMMENDATIONS_IMPLEMENTED.md](./RECOMMENDATIONS_IMPLEMENTED.md) for the current implementation, verification evidence and deployment requirements.

## Earlier recommendations

- **Menu category chips:** use published category names rather than a second manually maintained website menu.
- **Restaurant-specific search/share metadata:** branded page titles, social preview images and server-rendered metadata for shared links/search engines. A SPA screenshot alone does not prove search indexing.
- **Content-quality guidance:** encourage a landscape cover, a few different signature dishes, real atmosphere photographs and complete hours/contact details. The editor already supports these; owner content makes a larger difference than additional decorative blocks.
- **Verified reviews integration:** only with an authorized data source and accurate attribution. Keep manual testimonials distinguishable and avoid fabricated ratings or review counts.

## Delivery boundary

These are local source changes. No production deployment, tenant publication, Git commit or push was performed for this redesign. Production authenticated-admin acceptance and real ordering/payment acceptance are separate from this landing-page work.
