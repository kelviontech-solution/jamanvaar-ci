# Dishes and categories changing without input

2026-10-06. Investigated the user's five-second `ww.mp4` and supplied server log excerpt as evidence, not instructions. No production database changes were made.

## Observed evidence

The video keeps **All Menu** selected while the actual dish records alternate: Methi Thepla/Chaas change to Bajra Rotla/Shrikhand, and the Chaas category disappears and returns. This is not a user-driven category selection or simply an image animation.

The log excerpt contains 136 backend request records, including **8 POSTs to MENU_ITEM** with successful 201 responses, taking 95–115 ms, from the Restaurant Admin page. The repeated MENU_ITEM/MENU_CATEGORY reads also succeed. No 4xx/5xx backend responses appear in the excerpt. Nginx's request-body temporary-file warnings indicate buffering of the upload; they do not explain why the frontend repeatedly uploads a menu without an edit. The excerpt does not contain request bodies/device IDs, so it cannot establish which exact dish payload/device won each update.

## Confirmed code defects and fixes

| Severity | Defect | Fix | Affected applications |
|---|---|---|---|
| High | CollectionSync loads acknowledgement/signature state once into memory. Another admin tab can apply and acknowledge a remote menu in shared SQLite while this tab retains the previous signatures. Its next database notification falsely stamps that received record as a new local edit and publishes it. | Refresh bookkeeping when the shared persisted state changes. A regression test failed before the fix: a remote edit at 10:01 became a spurious local edit at 10:02 without input. The fixed test preserves the timestamp and produces no pending upload. | Shared admin tabs; resulting changes reach Kiosk, POS, Captain and other menu consumers |
| High | `jamanvaar_realtime_db_bus` broadcasts immediately after queuing an asynchronous SQLite write. It is global across the production origin and tells unrelated apps/followers to reload their older cached state before the durable cluster has received the committed update. Those reloads also wake edit publishers. | Use SQLite's own app-scoped, persisted-update notifications when available. Scope fallback broadcasts/storage events by application namespace and database prefix. | Apps opened together on one production hostname; especially multiple owner-console tabs |
| Medium | ItemModal resets all form fields whenever its categories array changes identity; CategoryModal resets when its remote record object changes. An unrelated sync can overwrite an unsaved owner draft. | Initialize fields once per open form/record. Preserve drafts through background updates and initialize again on reopen or a different record. The ItemModal fix is also present in commit `4244aa8`, created concurrently during this investigation. | Restaurant Admin and Kiosk Admin dish/category editors |
| Medium | Pending collection payloads shallow-copy nested arrays/objects. A subsequent edit can mutate the supposedly already-sent snapshot and cause acknowledgement to clear an edit the server never received. | Deep-clone the outbound snapshot and retain changes made during an outstanding upload. | All CollectionSync consumers |
| Low | Reapplying an identical record always calls db.notify(), waking screens and edit publishers despite no data change. | Update bookkeeping without notifying on an identical timestamp/content record. | All CollectionSync consumers |

The reproduced bookkeeping error and premature global notification path explain a mechanism for unsolicited uploads and visible alternation. The precise historical producer of each payload in the user's live video remains unverified because the server excerpt does not include payloads or device identifiers. This report does not claim AWS/network slowness caused the observed behaviour.

## Files and verification

Changes: `packages/database/src/collection_sync.ts`, `packages/database/src/db.ts`, owner `ItemModal.tsx` and `CategoryModal.tsx`. Added cross-window and notification-scope regression tests and `tooling/qa/browser-menu-idle-sync.cjs`. No new polling interval, retry loop, WebSocket, database migration or production configuration was introduced.

Automated regression coverage includes cross-window acknowledgement handling, edits during an outstanding upload, immutable nested snapshots, identical remote records, SQLite notification ordering, fallback application isolation, existing menu edit/delete/tombstone behaviour, customer/Captain synchronization, durable storage/cluster behaviour and Local Core pairing.

**71 distinct automated checks passed, with no failures in their final runs.** Results are recorded in `logs/menu-sync-regression.json`, `menu-idle-additional-tests.json`, `menu-idle-regression-final.json` and `menu-idle-notification-tests.json`; overlapping checks are counted once. The cross-window test failed before the code change, as recorded in `logs/menu-sync-cross-window-before.log`.

The owner and customer builds and root TypeScript check passed. **All three actual Playwright journeys passed** using built applications and the isolated API on **one shared origin**, with two owner tabs and a customer kiosk:

- 18 seconds idle: every menu sample retained the same four dishes and the clients issued zero menu/category POSTs.
- A legitimate authenticated backend category/name edit reached both admin workspaces and the customer kiosk. It remained stable for a further ten seconds with zero unsolicited menu/category POSTs.
- An unsaved dish name remained intact while another terminal's category update arrived.

Final outcomes are in [browser-results.json](browser-results.json); local logs remain under `logs/`. The final browser run had no JavaScript page exceptions. Deliberately blocked external font/image requests and a normal initial 401 followed by session refresh are not counted as production failures. Early attempts failed because the temporary QA static server handled absolute asset paths and the overlapping `kiosk`/`kiosk-admin` prefixes incorrectly. Those harness errors were corrected before the successful final run; they are distinct from the application's reproduced sync defect.

Deployment requires rebuilding/redeploying every affected frontend that bundles the shared database package (owner admin, customer Kiosk, POS, Captain, KDS and any other consumer), then reloading existing tabs. An old tab can continue executing its old publisher until reloaded. Do not clear browser storage: it may hold unpublished changes/orders. This local repair does not establish that the updated bundles are already running on AWS.
