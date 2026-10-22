# QR Admin owner workflow improvements

Date: 22 October 2026

Implemented locally. This report completes the eight owner-workflow recommendations following the [QR experience changes](../qr-experience-2026-10-22/REPORT.md). It does not certify the hosted deployment or assign a new ecosystem score.

## What changed

| Area | Result for the owner |
| --- | --- |
| Branch selection | The main header controls the editing branch. Managed QR editors no longer offer competing branch selectors. Scope labels distinguish branch settings, restaurant defaults, shared menu edits and restaurant-wide QR designs. Stale setup links cannot silently change the selected branch. |
| Navigation | Seven sidebar groups: Today, Orders & service, Menu, Website & QR, Customers, Payments and Settings. All 26 pages remain directly accessible and searchable. |
| Website launch | Connected **Design → Preview → Publish → Download QR → Test scan** steps. Returning from the QR screen opens the selected editor step. Publishing still requires reviewed confirmation; merely opening the Publish step never publishes. |
| Daily work | Today puts the existing live attention feed before secondary statistics. Service requests can be acknowledged there; payment issues open the relevant order. Failed acknowledgements remain visible and can be retried. Completed setup guidance collapses. |
| Dish editing | Essential dish fields appear first; descriptions and option groups use expandable sections. Sticky save actions, live/draft/hidden indicators and quick branch availability controls make the publication boundary clearer. Reviewed, version-checked publication remains required. |
| Payments | One workspace connects Payment setup, Test checkout, Collections and Payment reports. Existing sidebar links open the corresponding section. Internal navigation respects unsaved changes. Payment processing, commission, settlement and backend permissions are unchanged. |
| Customer engagement | A guided checklist separates **Login ready**, **Points earning ready** and **Rewards available**. An enabled program without a usable reward is no longer presented as fully ready. The customer preview uses actual configured rewards and an example balance without changing customer points. |
| Mobile operation | Fixed Today, Orders, Requests and Menu shortcuts; comfortable/compact order layouts; expandable history filters; responsive cards and sticky save actions above mobile navigation. Urgent service requests remain expanded even in compact mode. |

Branch-specific actions still need a target when viewing all branches. Those controls are labelled for their purpose, such as **Preview a branch** or a branch to print; they do not create a second editing scope. Embedded editors outside the managed console retain the selectors they need.

## Important behavior

- Shared menu edits affect the restaurant draft. Branch availability is a separate override; saving a dish does not silently publish every shared change.
- Order links from the attention feed load the selected order through the scoped API. Missing or failed detail loads show an explicit error.
- Save failures retain form edits. Publication failures do not report success or erase the draft. Payment section changes support Keep editing and Discard through the existing navigation guard.
- A ready reward must be active, undeleted, unexpired and have a valid positive points cost and discount value. Existing item rewards are supported. Final eligibility and redemption remain enforced by checkout.
- A zero earning rate can stop new points while existing balances remain redeemable. A paused loyalty program stops both earning and redemption. Readiness distinguishes these cases.
- Customer preview does not credit points, spend points or create a guest session. Phone verification still depends on the configured delivery provider.
- Test scan provides concrete phone checks and a link to the live website. It does not record an automatic scan success or certify payment/provider readiness.

## Verification

| Check | Result |
| --- | --- |
| Root TypeScript gate | Passed |
| QR regression suite | **154 tests passed across 35 files** |
| Chrome browser checks | **76 scenarios passed at 390 and 1440 pixels** |
| Restaurant/QR Admin production build | Passed |
| Whitespace checks | `git diff --check` passed |

The browser checks render the actual components against isolated API responses. Twelve functional scenarios cover both viewport sizes: live service acknowledgement failure/retry, order contact details, compact order mode, branch availability, retained failed dish saves, reviewed publication failure/retry, payment navigation and save recovery, reward creation/preview, website publication and real SVG download, return-to-preview/publish navigation, and changes through the actual header branch selector. Another 64 checks render all 26 pages and the six additional engagement sections at both widths, checking runtime errors, unexpected transport calls and horizontal overflow. Functional checks also verify that scope labels clear the page heading/status.

Seven readiness unit cases cover missing, inactive, deleted, malformed and expired rewards, item rewards, expiry boundaries, paused programs, zero earning, phone/channel readiness and a fully ready configuration.

The browser transport is isolated: these checks do not exercise production authentication, a live payment provider, phone delivery or a physical phone camera. This follow-up changes frontend workflows only; API integration tests were not rerun for it. The preceding report records its separate 78-test API integration run. Existing large-bundle/printer-import build warnings and the React `fetchPriority` test warning remain non-blocking.

### Evidence

- [Browser results](browser-results.json) and [reproducible browser harness](browser-check.cjs)
- [Today on desktop](today-1440.png), [Today on mobile](today-390.png)
- [Compact mobile orders](orders-compact-390.png)
- [Published menu](menu-published-1440.png)
- [Mobile payments](payments-390.png)
- [Customer reward preview](reward-preview-390.png)
- [Website QR and scan guidance](website-test-scan-1440.png)

From the repository root:

```powershell
npm run typecheck
npx vitest run tests/qr --reporter=dot
node docs/reports/qr-owner-flow-2026-10-22/browser-check.cjs
```

Build from `apps/restaurant-system/pos-admin`:

```powershell
npx vite build
```

The browser harness uses installed Chrome and a temporary Vite server on port 5557, then closes both. It reuses the preceding report's fixtures with additional owner-workflow data and failures. Use this harness for the current admin UI; the preceding report's admin selectors and scope expectations describe its earlier UI baseline.

## Deployment and owner walkthrough

These changes have not been deployed from this session. Deploy the updated Restaurant/QR Admin bundle. If the preceding QR experience work has not shipped, deploy its API, QR Guest and Super Admin changes together as described in that report. No database migration was added by these two workflow changesets.

1. Choose a branch in the main header; confirm the scope label before editing.
2. Open Today for live issues, orders and launch actions.
3. In Menu & Availability, save dishes, review the shared draft and publish. Use branch availability to pause a live dish.
4. In Payments, configure the existing provider requirements, test checkout, then inspect collections and reports.
5. In Customers & Loyalty, resolve each readiness step, configure an active reward and inspect the example customer preview.
6. In Restaurant website, design and preview, review and publish, download its QR, then scan it on a phone. Table QRs continue to open table ordering directly.

After deployment, verify these steps with an authorized restaurant account, real delivery configuration and payment sandbox before treating those external integrations as verified.
