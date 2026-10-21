# QR feature requests and Advanced Features save flow

Implemented locally on 21 October 2026. Not deployed to the hosted server.

## What was wrong

- Optional QR requests created support tickets without an action to grant the requested capability from the ticket.
- The requesting branch and feature were not recorded as structured ticket metadata. Older requests did record the feature in the server audit.
- Advanced Features reused the same editor across sidebar sections. Confirming “Discard & continue” changed the section without clearing the editor’s unsaved preferences. A later report page could therefore warn about settings whose Save button was on another section.
- Dirty detection counted touched keys even after their values were restored. Translation loading did not refresh its baseline when settings arrived or were saved.

## Super Admin flow

1. Open **Support tasks → the restaurant’s feature-request ticket**.
2. The new **Enable the requested QR feature** panel shows the exact requested capability, restaurant, current subscription/expiry and branch restrictions.
3. Review the scope, check the acknowledgement, then select **Enable feature & resolve request**.
4. The API grants only that capability on the restaurant’s enabled, current QR subscription rows. The shared plan, price and unrelated features remain unchanged.
5. The grant, audit record, public ticket reply and resolution commit together. Concurrent clicks create one grant history entry.
6. The owner can select **Check access again** on Pickup Calendar or Advanced Features, or reopen the feature, then configure it.

The grant requires both support and subscription write permission. It cannot activate an inactive base subscription, bypass platform feature availability/rollout, override branch restrictions, or grant a capability inferred from editable ticket prose. Old QR tickets are recognized through their trusted creation audit code. Unsupported requests show a review message instead of an unsafe grant button. No database migration is required.

## QR Admin save flow

- A persistent Save/Discard bar appears on feature preferences and licensed translations, below the measured app header. It reports saved versus unsaved state and adapts to mobile width.
- Save translations and language preferences together. Failed saves preserve the edits and show the error.
- Keep editing preserves the work. Discard and continue clears it by opening a fresh section instance. Clicking the already selected section does not trigger a leave warning.
- Only values different from saved preferences count as dirty. Report filters do not need saving, with an explanation beside Feedback filters.
- Existing counted-stock and promotion editors retain their own dedicated save actions.

## Validation

- **99 API tests across six suites passed:** QR feature requests (6), QR module (55), restaurant tickets (13), admin workflow (13), support tickets (8), service-request/pickup entitlements (4). The affected request suite was rerun after the final service change.
- **29 existing root regression checks across nine files passed.**
- Type checks passed for the root workspace, Cloud API and Super Admin. Production frontend builds passed for Restaurant/QR Admin and Super Admin.
- The API production build passed initially. A subsequent normal build encountered an existing Windows `EBUSY` lock in `cloud/api/dist`; the latest source compiled successfully with Nest into an isolated `.jamanvaar/qr-feature-api-build/dist` output using the production TypeScript configuration. No running user process was stopped.
- Chrome checks at **390 px and 1440 px** exercised the real QR console/editor and ticket modal with isolated transport fixtures: save persistence, keep editing, actual discard, feedback-filter navigation, reverting values, failed-save recovery, translation saving, reviewed grant, grant error handling, role restrictions, branch restrictions and no horizontal overflow. Database/API tests exercise real authentication, entitlement resolution and transactions separately. Hosted production was not changed or browser-verified.

Reproduce browser checks with `node docs/reports/qr-feature-requests-2026-10-21/browser-check.cjs`. Results are in `browser-results.json`, with mobile/desktop screenshots in this directory.

## Deploy

Deploy **Cloud API, Super Admin web and Restaurant/QR Admin web** together. Then open the existing feature ticket in Super Admin and use the new enable action. Deployment itself does not automatically grant requests or turn on customer-facing configuration.
