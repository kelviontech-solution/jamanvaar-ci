# Separate Restaurant Page and Table Ordering QRs

Implemented locally on 19 October 2026.

| QR type | Scan destination | Where to manage it |
| --- | --- | --- |
| **Restaurant Page QR** | The published restaurant website at `/q/site/:slug`: welcome, story, photographs, browse-only menu, contact/social links and Google review link. No table is selected. | QR workspace → **Restaurant Page QR** |
| **Table Ordering QR** | The ordering menu at `/q/:token`, with the original restaurant, branch and table context. | **Tables & QR**; artwork under **Table QR Design** |

Both destinations are available through the same QR workspace in standalone QR Admin and Restaurant Admin. The website/page capability remains required for Restaurant Page QRs; base table ordering does not silently acquire that add-on.

## Owner workflow

1. Publish and enable the intended branch's Business Page.
2. Open **Restaurant Page QR**, select that branch and choose Heritage evening, Clean & minimal or Warm café.
3. Adjust the accent, message, footer and logo visibility. Choose poster/card, foldable counter tent or small label.
4. **Save QR design**, then **Print / Save PDF**, **Download PNG** or **Download SVG**.
5. Test the printed page QR before placing it at the entrance, on a visiting card or in promotional material. Use Table Ordering QRs on dining tables.

The Business Page editor links directly to the new print workspace. Its old “When customers scan → page first/menu first” selector has been replaced with an explanation of the two QR types. Existing persisted `entryMode` values remain readable for compatibility, but no longer redirect a fresh ordering-code scan into the website.

## Behavior and safeguards

- Page QR artwork is saved separately per branch in `QR_PAGE_PRINT_DESIGN`; it does not overwrite the shared table-card design or republish website content.
- Changing the artwork keeps the published website URL stable. Generating its artwork creates no table QR rows and consumes no table-code allocation.
- Print data requires a current owner/authorized manager session, branch access, page capability and an enabled published branch page. Unpublished/disabled pages cannot be exported as usable page QRs.
- Save uses a version check and the existing transactional tenant lock. Concurrent stale updates are refused. Foreign branches and manager edits outside the assigned branch are refused.
- Artwork settings cannot supply a destination URL. The server derives it from the existing published page link. Website and table print-design schemas accept different templates.
- Download/print actions recheck current print data. A changed design requires reload/review. Unsaved changes block export and are protected when switching branches or navigating away.
- The old page-poster API call used device authentication against an owner/manager endpoint. It now uses the tenant account request path, matching the page editor.
- Print opens a window synchronously from the click before fetching fresh data, reducing popup blocking. PNG and SVG use the same renderer as preview/printing. Counter tents print both sides.
- Table-code URLs and tokens were not regenerated. Fresh scans enter the menu directly; existing cart, payment-return and active-order recovery behavior remains. About & contact still opens the website deliberately from ordering.
- Four table design choices already shown by the UI were missing from the backend validator. The validator now accepts all thirteen table presets; website presets remain excluded.

## Verification

- **38 targeted root tests pass**, including all thirteen table artwork QR decodes, three website poster decodes, SVG escaping, separate schema rules, tenant-session print requests, publication guidance and existing menu/navigation regressions.
- **19 API end-to-end tests pass** against the dedicated test database. New coverage verifies authentication, branch/role restrictions, stale-save rejection, independent branch designs, stable page destinations, unchanged table artwork/code counts, and disabled-page/license refusal.
- **Four browser scenarios pass**: standalone and integrated consoles at 1440px and 390px. They save/reload a design, download SVG and PNG, decode the actual PNG to its page URL, inspect a two-sided tent print document, switch branches, and block printing an unpublished branch. No horizontal document overflow or browser runtime errors were recorded. Transport is isolated; backend persistence/authorization are verified by the API suite.
- **Two real local guest navigation checks pass**: page → Order online opens the actual 40-dish menu, and a fresh ordering link without a hash opens the menu directly. About & contact remains reachable. These checks place no order and initiate no payment. The local code used is MENU_ONLY; table identity is covered by the API regression and the ordering entry behavior is shared by both modes.
- Root/API type checks and guest/Admin production builds pass. The existing large Admin bundle warning remains.

Evidence: `two-qr-types-results.json`, `two-qr-types-<layout>-<width>.png`, `ordering-navigation-results.json`; regression sources `tests/qr_two_code_types.test.ts`, `tests/qr_website_print_auth.test.ts` and `cloud/api/test/qr-restaurant-page.e2e.spec.ts`.

No physical printer job, production deployment, real order/payment, Git commit or push was performed. Browser print tests inspect the generated document rather than send a job to a physical printer. Deploy the API, QR Guest and Restaurant Admin together; no Prisma migration is required.
