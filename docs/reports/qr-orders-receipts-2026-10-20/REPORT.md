# QR guest details, order recovery and editable receipts

Implemented and locally verified on 20 October 2026. These changes have **not been deployed** to the hosted server.

## What was wrong

1. Checkout already stored the guest name, phone, kitchen notes and item instructions in the canonical order. The admin order response omitted the phone and the detail dialog omitted the contact information. Staff could not see or use information that was already saved.
2. The guest app saved the last order reference in local storage but kept the signed access proof only in session storage. Closing a tab lost the proof needed to read the order. Weakening the server ownership check would expose customer information, so the fix preserves and reuses the existing signed proof.
3. New counter-order status links contained only `#status`, without an order reference. Such links depended entirely on browser storage and could get stuck on “Checking your order.”
4. Receipts were a small expandable summary with a browser print action. There was no dedicated PDF bill or QR receipt editor.

## Resulting flow

### Restaurant staff

- **QR Orders → Details** shows the guest's name, phone, available email, order notes, item customisations, scheduled pickup details and shared-table requests. Missing optional contact fields explicitly say “Not provided.”
- Guest name and phone appear on order cards. Order search also matches phone/email where saved.
- Call, WhatsApp and email actions open the chosen contact channel only when clicked. No message is sent automatically. Indian national mobile numbers are expanded to include the country code for WhatsApp.
- The detail dialog includes **Download bill PDF**.
- **All tools & setup → Guest experience → Bills & receipts** opens the new editor. This shared QR console serves standalone QR Admin and the QR section of Restaurant/Kiosk Admin.

### Receipt editor

- Editable heading, contact line, thank-you message, footer and accent colour.
- Options for separate CGST/SGST, guest details and kitchen/item notes.
- Responsive sample preview, save confirmation, discard, unsaved-navigation protection and optimistic version checks.
- The selected branch has its own design. Owner-authorised restaurant defaults apply to branches without an override. Saving defaults leaves existing branch designs intact.
- Design changes affect subsequent downloads; canonical quantities, prices, taxes and payment records remain unchanged.

### Customer

- Checkout retains the existing optional name/mobile/notes flow.
- Order status URLs now include the public order reference. Signed browser proof stays out of URLs.
- The same browser retains its signed proof across tab closure and can reopen the order to see its latest Ready/Completed state.
- **Order more** returns to the ordering menu for the same table and clears the previous order reference from that menu URL.
- An unusable or reference-free status link provides a clear error and **Order more for this table**, rather than an endless loading screen.
- **Download bill PDF** is available for paid and unpaid bills. Unpaid bills explicitly show the outstanding amount. The itemised on-screen bill also supports printing.

### PDF and access controls

- Server-generated A4 bill: restaurant/branch identity, available address and registration details, date, order reference, table, items, options, notes, subtotal, discount, taxes, total, collections, outstanding amount, available refunds and payment status.
- Uses persisted canonical amounts and the payment ledger. It does not create or record a payment.
- Bundled Noto fonts cover Latin, Gujarati and Devanagari. Separate font runs preserve English text and quantities alongside Gujarati/Hindi dish names.
- Private PDF responses use `Cache-Control: private, no-store`.
- Public order PDFs retain the existing guest ownership check. Admin downloads require authenticated console access and respect the authorised branch. Receipt settings additionally require the QR entitlement. Restaurant-wide access requires the existing owner proof.
- Existing legacy order access rules were not weakened.
- Settings use the existing synced-entity storage; no new database migration is required.

## Verification

| Check | Result |
| --- | --- |
| Root TypeScript check | Passed |
| API production build | Passed, including packaged fonts in `dist/src/assets/receipt-fonts` |
| QR guest production build | Passed |
| Restaurant/QR Admin production build | Passed; existing large-bundle/printer-import warnings remain |
| Root QR suite, `npx vitest run qr_ --reporter=default` | 34 files, 146 tests passed |
| Broad API QR suite, `npx vitest run qr- --reporter=default` from `cloud/api` | 15 files, 228 tests passed |
| Final targeted API suite, `qr-module.e2e.spec.ts` | 49 tests passed, including the additional owner-default inheritance test |
| Compiled PDF packaging smoke | Paid, unpaid, multilingual QR and backup PDFs generated successfully |
| Sample PDF text extraction and rendered-page inspection | Latin, Gujarati, Hindi, expected total and payment status verified |
| Chrome browser checks | Guest checkout/reopen/download and admin edit/contact/download flows passed |

The backend tests run against the dedicated test database with real authentication, tenant boundaries and payment accounting. External payment transport is simulated by the existing test fixtures; no live payment is made.

The browser harness renders the actual guest app and receipt components with isolated API fixtures. It checks guest layout at 390 px and admin layouts at 390/1440 px, reports no horizontal overflow, and verifies:

- Name/mobile/kitchen notes submitted from checkout.
- Closing the customer tab and reopening its saved URL shows Ready, then Completed.
- Another browser cannot restore the private order, but can start ordering for the same table.
- A reference-free status link has actionable recovery.
- Guest/admin PDF download filenames.
- Live receipt preview, save response and contact links.

Evidence: [browser results](browser-results.json), [mobile guest](guest-ready-390.png), [mobile admin](admin-receipts-390.png), [desktop admin](admin-receipts-1440.png), [synthetic PDF](sample-bill.pdf), [rendered PDF](sample-bill.png). Browser download transport is simulated; actual PDF generation and authorisation are separately tested against the API.

## Changed implementation files

- `apps/qr-guest/src/guestSession.ts` — persisted signed browser proof and migration of an open tab's existing proof.
- `apps/qr-guest/src/App.tsx` — restoration, reference-bearing status URL, recovery actions, bill component.
- `apps/qr-guest/src/api.ts` — persisted proof on private requests and binary PDF download.
- `apps/qr-guest/src/OrderReceipt.tsx`, `order-receipt.css` — guest bill UI.
- `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts` — authenticated branch-scoped PDF transport.
- `apps/restaurant-system/pos-admin/src/cloud/qrAdminClient.ts` — guest contact/shared-request types.
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrAdvanced.tsx` — order card/detail guest information.
- The same directory: `QrGuestDetails.tsx`, `QrReceiptSettings.tsx`, `qr-receipts.css` — contact actions, download and receipt editor.
- The same directory: `QrConsole.tsx`, `qrNavigation.ts` — receipt editor entry in both console experiences.
- `cloud/api/src/modules/qr/qr-admin.service.ts` — order contact fields and phone/email search.
- The same directory: `qr-public.service.ts`, `qr.controllers.ts` — guest receipt design/details and ownership-checked PDF route.
- The same directory: `qr-receipt.service.ts`, `qr-receipt.controller.ts`, `qr.module.ts` — receipt storage, validation, PDF generation and console routes.
- `cloud/api/src/assets/receipt-fonts/` — three licensed Noto fonts and SIL licence.
- `cloud/api/nest-cli.json` — copy fonts into the compiled API, including Docker builds.
- `tooling/qa/receipt-pdf-smoke.cjs` — compiled multilingual receipt packaging check.
- Tests: `tests/qr_guest_session.test.ts`, `tests/qr_order_session.test.ts`, `cloud/api/test/qr-module.e2e.spec.ts`.
- `tests/onboarding_access_and_links.test.tsx` — corrected two partial-fixture type assertions found by the root type gate; no runtime product change.
- This report directory contains reproducible browser/PDF fixtures and evidence.

## Deployment and limits

Deploy the **API, admin frontend and QR guest frontend together**. Use the Nest API build so font assets are included; the packaging smoke checks for missing runtime assets. After deployment, reload open admin/customer pages so they use the new bundles.

Already-saved guest details become visible without asking the customer to re-enter them. A tab still holding its original signed proof can migrate it when the new code loads. If an older tab was already closed and its proof lost before this update, it cannot be reconstructed from the public link; authorised staff can retrieve the bill in QR Orders. Different devices, cleared site data and private browsing still require appropriate recovery rather than bypassing ownership checks.

Hosted-server deployment, real Android/iOS download behaviour and physical printer output were not exercised in this local verification.
