# Reservations access follow-up — 21 October 2026

Implemented locally; the hosted server was not changed.

The previous ticket-grant API already supports `QR_RESERVATIONS`. Reservations itself still lacked a way to recheck access after requesting it. Its catalog entry was also seed-only, so migration-only deployments could omit the feature entirely. The dedicated test database reproduced that missing entry before applying the new migration; production catalog state was not inspected.

## Changes

- Reservations now explains the request-to-approval flow and always offers **Check access again** while locked, including after a ticket has been sent.
- Super Admin opens the Reservations ticket and selects **Enable feature & resolve request**. QR Admin then rechecks the actual inbox endpoint and displays the bookings.
- Structured licensing errors distinguish a missing plan feature from platform availability or base-license problems. Only a missing optional feature offers a feature request.
- Failed loads and revoked access clear previously displayed guest details. Network failures offer a working retry. Polling skips hidden tabs, and outdated responses cannot overwrite a later result.
- Migration `20261021090000_qr_reservations_catalog_registration` registers the Reservations feature without requiring a full catalog/demo seed. It preserves existing activation, rollout, plans and subscription grants. The regular seed also repairs the feature’s entitlement-key mapping.

## Verification

- **27 API tests passed:** feature requests (8), restaurant page (19). Includes real Reservations inbox denied → ticket approval → inbox allowed, without implicitly granting the page builder.
- The migration was applied only to the dedicated test database. A transaction test also verifies missing-entry creation, repeat execution and preservation of a disabled/zero-rollout feature, then rolls back its catalog edits.
- **9 existing root regression checks passed.** Cloud API typecheck and Restaurant/QR Admin production build passed. API compiled with Nest into the isolated production-build directory documented in REPORT.md.
- Chrome at **390 px and 1440 px** passed request-code verification, access recheck, confirming a booking, filtering confirmed bookings, recovery from network failure, clearing guest data after revocation and no horizontal overflow. The browser uses real console components with isolated transport fixtures; API tests exercise real database and authorization separately.
- Browser results and `reservations-locked-*` / `reservations-enabled-*` screenshots are in this directory. Reproduce with `node docs/reports/qr-feature-requests-2026-10-21/browser-check.cjs`.

## Deployment/use

Deploy Cloud API with the new migration and the latest Restaurant/QR Admin frontend. Include the latest Super Admin frontend from the preceding ticket-flow fix.

Open **Super Admin → Support tasks → Reservations request (for example TKT-000012)**, review the scope and choose **Enable feature & resolve request**. Then select **QR Admin → Reservations → Check access again**. Publishing an accessible restaurant website is separately required for guests to submit bookings from that website. Deployment does not automatically grant every pending request.
