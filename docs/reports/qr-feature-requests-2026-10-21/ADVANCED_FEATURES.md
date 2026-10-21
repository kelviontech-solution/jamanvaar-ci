# Advanced Features repair — 21 October 2026

Implemented locally. The hosted deployment was not accessed or changed.

## Problems corrected

1. **One menu failure blocked the whole workspace.** Configuration and optional menu choices loaded in one `Promise.all`. They now load independently. A failed menu preview has its own retry, while settings and reports remain usable. Configuration failures have a separate working retry.
2. **Locked switches had no next action.** Feature controls and License now explain the effective access reason and offer the existing feature-ticket request flow for missing optional access. Platform-unavailable features point staff toward release/availability review instead of claiming that a plan upgrade will unlock them.
3. **Access changes were stale.** Added Refresh access & saved settings, protecting unsaved work before refresh. The preceding visible Save/Discard and section-navigation fixes remain in place.
4. **Included did not mean enabled for guests.** Translations, Promotions, Feedback and Alerts now explain when a licensed feature is switched off and link to Feature controls. The link respects unsaved edits. Coupon and recommendation preferences are named together, matching backend behavior.
5. **Shared-table settings were missing.** Licensed owners can edit maximum guests and session duration with the backend’s existing limits.
6. **Promotion refresh failures looked like failed saves.** A confirmed save now clears the create/edit form before refreshing the list. A failed refresh gets its own retry and cannot leave the same create form ready for another submission. Menu-choice failure does not prevent promotion management. Added basic code, discount and date validation and an explicit discard action.
7. **Feedback and Alerts had misleading failure states.** Reports have separate loading/error handling; failed loads clear old report results. Feedback rejects reversed date ranges and supports its existing CSV download after successful filtering.
8. **Collections direct links did not load payments.** The selected order’s ledger now loads automatically, clears stale amounts when selection changes, ignores superseded requests and offers an independent payment refresh/retry. Order-list failures and ledger failures remain distinct. Post-collection/refund refresh preserves the current order search and pagination.
9. **Internal settings keys appeared in branch setup.** Branch preferences now use readable labels. Feature cards distinguish a saved on/off preference from an unsaved change.

The repair preserves server licensing, branch isolation, payment authorization and the existing payment idempotency references. It does not grant paid features automatically.

## Validation

- **All seven sections** exercised in Chrome at **390 px and 1440 px**: Feature controls, Translations, Promotions, Feedback, Alerts, Collections and License. Real console/editor components run with isolated transport fixtures.
- Browser cases cover failed configuration retry, a failed menu preview with successful settings saves, requesting a locked switch, translation saving, the guest-status shortcut, promotion creation/update, a committed promotion followed by a failed list refresh, feedback date validation/CSV download, alerts, capability display, direct-link ledger loading, failed ledger recovery, navigation safeguards and no horizontal overflow. Fixtures reject unexpected API paths.
- **55 real API tests** in `qr-module.e2e.spec.ts` passed, covering advanced entitlements/settings, translation, feedback, promotions, stock, group ordering, payments/refunds and branch isolation, among other ordering behavior.
- **13 existing root regression checks across four files passed.** Root typecheck and Restaurant/QR Admin production build passed. Existing bundle-size/printer chunk warnings remain.
- Repeat browser checks with `node docs/reports/qr-feature-requests-2026-10-21/browser-check.cjs`. Results and screenshots are in this directory; newer advanced cases use the `advanced-*` screenshot names.

## Deployment

Deploy the latest Restaurant/QR Admin frontend. The earlier API and Super Admin ticket-grant fixes, plus the Reservations catalog migration, are still required when deploying the accumulated changes. Optional features must be granted in Super Admin and enabled in Feature controls before guests can use them. Browser verification here was local, not a hosted production sign-in test.
