# Menu QR button repair — 20 October 2026

The former **Menu-only code** button creates a generic ordering-menu QR for a branch, without a fixed dining table. A guest chooses takeaway or enters their dine-in table according to that branch's ordering rules. It is separate from the restaurant website QR and from QR codes permanently assigned to tables.

## Confirmed causes

1. The click handler called `POST /restaurant/qr/menu-codes`, discarded the returned code and refreshed only the table list. Generic codes have no table relation, so they could never appear in that list. Repeated clicks created more invisible codes.
2. Menu-only scanning defaults to off. Creation did not explain or change that switch, leaving otherwise active codes unusable by guests.
3. Print data prefixed the generic code's label with “Table”, producing misleading cards.

## Changes

- Renamed the action **Create menu QR**. It opens a named-code form for the selected branch; successful creation immediately opens the actual QR preview.
- Added a separate, persistent **Menu QR codes — No fixed table** section. Previously generated generic codes are recovered from the database without regenerating their tokens.
- Added an authenticated, tenant/branch-scoped, non-cacheable listing endpoint with 50-row pagination and scoped cursor validation. Existing quotas and mutation authorization remain enforced.
- Displayed the effective menu-mode switch, with an explicit action to enable it for the selected branch. No other branch's switches are changed by that action.
- Added copy with verified success/tick feedback and manual-copy fallback guidance, open-menu link, downloadable PNG and Print / Save PDF. Printing opens its window during the user click to avoid popup blocking after an asynchronous request.
- Added turn off/on, replace and permanently revoke actions. Destructive actions explain their effect on existing printed QR cards before confirmation.
- Corrected menu print labels and instructions while preserving the shared design's other settings.
- Added visible network, quota, clipboard and printing errors. Missing public ordering configuration blocks creation with guidance, instead of displaying an empty preview. Branch changes ignore late responses from the previous branch.
- Corrected the existing table QR dialog's clipboard handler to show success only when copying succeeds, with a visible check mark.

## Verification

- Root TypeScript and API TypeScript checks passed.
- API production build passed.
- Restaurant/QR Admin production build passed; existing large-bundle and printer static/dynamic import warnings remain.
- Root QR regression checks: **22 tests across 4 files passed** (`qr_console_tables_and_catalog_flow`, `qr_two_code_types`, `qr_code_generation`, `qr_table_lifecycle`).
- Database-backed QR module integration tests: **53 tests passed**, including four new regression cases covering recovery, effective mode, guest resolution, print labels, authentication, branch isolation, cursor validation, off/on/replacement/revocation and pagination through more than 50 saved codes.
- The broader QR SaaS suite also passed: **54 tests**, including real MENU_ONLY dine-in/takeaway behavior, tenant boundaries and entitlement enforcement. Combined API run: **107/107 passed**; with the root checks above: **129 automated tests passed**.
- Chrome checks at **390 px and 1440 px** passed. These rendered the actual `QrMenuCodes` component with isolated API fixtures; actual backend authorization/persistence were checked separately by the database-backed suite.
- Clipboard success was verified by reading back the copied URL. The actual downloaded PNG was decoded using `jsQR` and matched that URL. The print document was inspected with the native print dialog stubbed; no physical printer or OS Save PDF dialog was exercised.
- Browser fault checks covered failed copying without a success claim, failed print retrieval closing its temporary window, missing public URL configuration, quota failure, connection loss retaining existing rows, and a delayed response after changing branches. No horizontal overflow or browser page errors were found.

Browser evidence: [results](browser-results.json), [mobile preview](preview-390.png), [desktop preview](preview-1440.png), [mobile saved codes](saved-codes-390.png), [desktop saved codes](saved-codes-1440.png). Downloaded PNG specimens: [mobile run](menu-qr-390.png), [desktop run](menu-qr-1440.png).

Reproduce:

```powershell
npm run test --workspace=@jamanvaar/cloud-api -- test/qr-module.e2e.spec.ts test/qr-ordering-saas.e2e.spec.ts --reporter=default
npx vitest run tests/qr_console_tables_and_catalog_flow.test.ts tests/qr_two_code_types.test.ts tests/qr_code_generation.test.ts tests/qr_table_lifecycle.test.ts
node docs/reports/qr-menu-code-2026-10-20/browser-check.cjs
npm run build --workspace=@jamanvaar/cloud-api
npm run build:pos-admin
```

## Files in this fix

- `cloud/api/src/modules/qr/qr-admin.service.ts`
- `cloud/api/src/modules/qr/qr.controllers.ts`
- `cloud/api/test/qr-module.e2e.spec.ts`
- `apps/restaurant-system/pos-admin/src/cloud/qrAdminClient.ts`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole.tsx` (contains earlier, preserved work as well)
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrMenuCodes.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/qr-menu-codes.css`
- This report directory's fixtures, browser script and evidence.

Deploy **both the API and Restaurant/QR Admin frontend**. No schema migration or signing-key change is required. No production deployment or production configuration/data changes were performed here. Public QR links still require the server's `QR_ORDER_BASE_URL` to point at the deployed customer-facing host.

After deployment: open **Tables & QR → Create menu QR**, give the code a name, create it, enable menu QR mode for the branch if prompted, and download or print it. Existing generic codes appear below the table list in the saved-code section. For a website/landing-page QR, use **Restaurant Page QR** instead.
