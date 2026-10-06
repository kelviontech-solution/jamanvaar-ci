# Admin has 20 dishes; customer kiosk has four

2026-10-06. Investigated the supplied screenshots and the existing shared menu publication, entity catch-up and customer visibility code.

## Finding

There is no four-dish rendering limit: customer Kiosk maps the entire filtered menu. Its filters intentionally respect availability, active categories, kiosk channel and branch assignment.

The confirmed sync defect is **partial-cache recovery**. The old sync only restarts a catalogue when its local collection is empty. If a previous reload/storage race leaves four dishes while the sequence cursor says the device already received the full menu, incremental responses contain no missing historical records. That device can remain at four indefinitely. Missing category records can also hide otherwise received dishes. A second defect is that read-only customer sync stamps changed cached records as local edits; a future or falsely fresh local timestamp can reject the actual server copy.

A regression explicitly reproduces this: with four cached dishes and a caught-up sequence cursor, the old recovery behaviour leaves four. Enabling the fix restores all 20 dishes and all eight fixture categories. The screenshots establish the count mismatch, but without the live browser's cache/cursors/channel flags they do not establish the exact original state of that production device.

## Changes

- Add a server/device-scoped catalogue checkpoint tracking record identities actually received. Existing catalogues rebuild once to establish completeness. Subsequent ticks remain incremental while all checkpointed records exist.
- If known dishes/categories disappear from a partial local cache, rebuild that catalogue from its existing authoritative entity API. Do not wipe browser storage, consume another activation key or clear orders.
- Read-only menu consumers accept the server copy and no longer stamp menu edits. Owner publishers retain newer real unpublished edits while filling missing records.
- Preserve sold-out, disabled-kiosk, branch and channel restrictions. Receiving a record and making it orderable are distinct decisions.

Files: `packages/sync/src/entity_sync.ts`, `packages/sync/src/menu_sync.ts`, `packages/database/src/collection_sync.ts`, `tests/menu_completeness_recovery.test.ts`, and the completeness mode of `tooling/qa/browser-menu-idle-sync.cjs`.

No new API, database migration, retry loop or polling interval. Recovery runs through the existing catch-up flow. Checkpoints are cache metadata, not authorization; existing backend tenant/device/branch checks still apply.

## Verification and deployment

**28 focused tests passed with zero failures**, recorded in `logs/menu-completeness-tests-final.json`. Tests cover the four-to-20 reproduction/recovery, loss after an initial complete sync, unchanged incremental ticks, stale future timestamps on customer devices, unpublished owner edits and intentional visibility restrictions, alongside existing menu edit/delete/Captain/version tests.

**Restaurant Admin and customer Kiosk builds and the final root TypeScript check passed.** The first root check encountered four old single-argument login calls in `tests/pos_terminal_lock_persistence.test.ts` after a concurrent POS change added the selected staff ID to login. Those fixtures now pass their own created staff ID and **all four lock-persistence tests pass**; the POS product changes were left intact. Final validation is recorded in `logs/menu-completeness-typecheck-final.log` and `logs/menu-completeness-pos-fixture-tests.json`.

**All five actual Playwright checks passed**, recorded in [browser-results.json](browser-results.json). The test uses the real built owner/kiosk applications and isolated API on one origin, publishes 20 dishes, corrupts the kiosk's persisted catalogue to four while retaining its cursor/checkpoint/device activation, reopens the kiosk and verifies recovery to 20. It also checks idle stability, an authenticated edit reaching both owner tabs and the customer kiosk, and retention of an unsaved admin draft. The final browser run had no JavaScript page exceptions and idle tabs issued zero unsolicited menu/category uploads.

The updated bundles still need deployment to the live server and existing tabs must load them. This change does not modify the user's live restaurant or establish that AWS is already running the fix. Do not clear browser data to recover: it may contain unsent orders.
