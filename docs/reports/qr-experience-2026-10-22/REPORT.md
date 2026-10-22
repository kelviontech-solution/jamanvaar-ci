# QR website, customer engagement and administration improvements

Date: 22 October 2026

Implemented in the local workspace. This report covers the QR experience requested in this session; it is not a new score for the entire ecosystem or a claim that the hosted deployment has been updated.

## Problems found and corrected

| Problem | Result |
| --- | --- |
| Publishing an inactive page required finding an additional enable control lower in the editor. | A visible publishing toolbar offers **Save draft** and **Publish website**. Publishing prepares an enabled draft and opens a review dialog; only the reviewed confirmation publishes it. Intentional switch-off remains available for a live website. |
| The website editor initially opened restaurant defaults even when a branch was selected or supplied by a setup link. | The selected branch and setup link are honoured. All-branch selection opens restaurant defaults. A single-branch owner defaults to that branch when no broader scope was selected. |
| A publish failure could be hard to discover far below the preview. | Errors appear inside the confirmation dialog. Failed publication preserves the saved draft and does not report success. |
| Website, payments, design and optional tools were hidden behind “All tools & setup.” | All 26 QR pages and the seven guest-engagement sections are available directly in the searchable sidebar. Removed the duplicate receipt navigation entry. Website editing and its printable QR are grouped together. |
| Heading, action, card and editor layouts varied between QR pages. | Shared heading/actions layout, consistent cards and form sizing, compact spacing, a responsive website editor, and clear mobile edit/preview modes. |
| Customer and menu pages put extensive explanation before routine actions. | Collapsed ready-state loyalty guidance and contact exports, shortened menu instructions, and moved Add dish/import/publish actions above publication status. Publication status stays mounted but is hidden while an individual menu task is being edited. |
| The website offered competing Menu and Order online routes. | Removed Menu from website navigation. **Order online** opens the existing QR ordering menu with `#menu`; table codes continue to preserve the table. Browse-only websites retain a View menu fallback when no ordering link exists. |
| Google review and Instagram links were too easy to miss after scanning. | Added visible guest quick links and dedicated social/review cards when the restaurant supplies those links. Links remain available without customer login. |
| Loyalty login was primarily discoverable at checkout. | Added Customer login and Rewards to the website and My rewards to the ordering menu when the branch has licensed, enabled loyalty. |
| Guests lacked a clear place to maintain their contact information. | Phone verification → points/rewards → name, optional email and explicit offer preferences. Saved details appear in the existing QR Customers & Loyalty workspace and use the existing customer record. |
| There was no lightweight reward reveal on the website. | Eligible guests can reveal their **existing earned reward**. Revealing does not spend points or create a new prize; actual redemption continues through the existing checkout rules. |
| Super Admin had to find several separate feature switches. | Added **QR Engage · website & returning guests** alongside Essential and Complete presets, an included-capabilities summary, and direct links from restaurant access and feature-request tickets to that restaurant’s QR feature controls. |

## Customer identity and persistence

The restaurant website and table menu use the existing server-signed browser proof, phone verification service, customer records and loyalty ledger. No second points ledger or login system was introduced.

- New public website loyalty routes resolve restaurant and branch from the published website slug, never from customer-supplied restaurant IDs.
- Profile updates require a verified phone identity and licensed, enabled branch loyalty. Strict input validation rejects unexpected financial or tenant fields.
- Name, email and email/WhatsApp preferences are stored in the existing customer payload with consent source and timestamp, sync version and sequence. Saving a profile preserves existing points and ledger data.
- Other browser sessions cannot read the verified customer profile. Signing out removes that browser’s identity and pending OTP for this restaurant; customer records and earned points remain.
- Reward availability, cost and value come from existing server data. Reviews and Instagram follows do not earn points.
- Existing OTP expiry, resend protection and verification limits remain enforced by the backend. If phone delivery is not configured, the account screen explains that guest ordering remains available.

No database migration is required.

## Verification

| Check | Result |
| --- | --- |
| Root TypeScript build gate | Passed |
| API TypeScript gate | Passed |
| Super Admin TypeScript gate | Passed |
| Targeted frontend/domain regression tests | **59 passed across 9 files** |
| QR module and restaurant-page API integration tests | **78 passed across 2 files** |
| Main Chrome browser scenarios | **79 passed** |
| Additional website scope scenarios | **3 passed** |
| Production builds | Restaurant/QR Admin, QR Guest, Super Admin and API passed |
| Whitespace/error checks | `git diff --check` passed |

The API integration tests use the application, authentication, tenant checks, transactions and test database. The new customer test verifies phone login, persisted profile/consent, CRM visibility, website/table identity sharing, unchanged points, rejection of injected fields, stranger-session isolation, sign-out and OTP replay rejection. The notification transport is mocked.

The browser harness renders the actual components with isolated responses. It covers every top-level QR page at 390 and 1440 pixels, all seven engagement sections, reviewed publication of an inactive draft, publish failure/retry, generated website QR download, and package selection. Public guest checks use the real guest HTTP client with intercepted test responses. They cover all four website themes at 360, 390 and 1440 pixels, real menu destinations, social links, loaded photographs, phone login, saved preferences, earned reward reveal, sign-out and non-overlapping ordering-header actions. The additional scope checks cover all branches, a branch setup link overriding that selection, and explicit restaurant defaults.

Rendering checks cover the screens with representative test data; they do not constitute a test of every button or every possible restaurant configuration. No production restaurant, payment or external customer notification was changed during verification.

Existing non-blocking build messages remain for large application bundles and the printer module’s mixed imports. The targeted React test run also reports the existing `fetchPriority` DOM warning.

### Evidence and reproduction

- [Browser results](browser-results.json), [scope results](browser-scope-results.json)
- [Browser harness](browser-check.cjs), [component fixture](fixture.tsx), [isolated admin transport](mock-cloud.js)
- [Mobile website](guest-heritage-390.png), [desktop website](guest-heritage-1440.png)
- [Customer rewards](customer-rewards-390.png), [ordering menu](ordering-menu-390.png)
- [Website editor](website-editor-1440.png), [generated website QR](website-qr-390.png)
- [Menu workspace](menu-1440.png), [customers](crm-390.png), [Super Admin package](super-admin-package-390.png)

From the workspace root:

```powershell
npm run typecheck
npm run typecheck --workspace=@jamanvaar/cloud-api
npm run typecheck --workspace=@jamanvaar/super-admin-web
npx vitest run tests/qr_restaurant_page.test.tsx tests/qr_restaurant_page_setup.test.ts tests/qr_website_recommendations.test.tsx tests/qr_admin_nav_default_visibility.test.ts tests/qr_plan_package.test.tsx tests/qr_two_code_types.test.ts tests/qr_console_tables_and_catalog_flow.test.ts tests/qr_console_menu_availability_separation.test.ts tests/qr_menu_choices.test.ts
npm run test --workspace=@jamanvaar/cloud-api -- test/qr-module.e2e.spec.ts test/qr-restaurant-page.e2e.spec.ts --reporter=default
node docs/reports/qr-experience-2026-10-22/browser-check.cjs
node docs/reports/qr-experience-2026-10-22/browser-check.cjs --scope-only
```

The browser harness uses installed Chrome and a temporary local Vite server on port 5556, and closes both afterwards. API tests require the repository’s isolated test database configuration.

## Deploying and using the result

Deploy the API and all three affected frontends together: Restaurant/QR Admin, QR Guest and Super Admin. These changes have not been applied to the hosted server from this session.

1. In Super Admin, edit the intended QR plan and select Essential, Engage or Complete; save and assign the plan to the restaurant. For an individual grant, use **Restaurant → Products & access → Manage QR features**, or the direct QR features link on its request ticket. Existing restaurant/branch restrictions and platform availability still apply.
2. In QR Admin, choose the branch, open **Customers & Loyalty**, configure the earning program and an active reward, and resolve any readiness checks. Phone verification requires the existing delivery provider to be configured on the server.
3. Open **Restaurant website**, edit the sections and social links, select **Publish website**, review and confirm. Then open **Restaurant Page QR** to download or print the website QR.
4. Scan that website QR on a phone. Review, Instagram, Order online and Customer login are available in their appropriate places. Table QRs continue to open table ordering directly.

This implementation adds an earned-reward reveal, rather than a random scratch-card prize campaign. A separate prize inventory, campaign administration and random-prize rules have not been introduced.
