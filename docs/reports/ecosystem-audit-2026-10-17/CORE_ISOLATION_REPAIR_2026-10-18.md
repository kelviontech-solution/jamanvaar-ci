# Branch Core isolation and acknowledgement repairs

18 October 2026. Uncommitted local source repair; not deployed or accepted on an installed restaurant device.

## New findings and changes

| Finding | Risk | Source repair |
| --- | --- | --- |
| Core imports using a restaurant-wide console credential | The order downloader accepted every returned branch. Inventory mapping discarded branch ownership. Other-branch operational entities could stop a page or remain visible. | Reject a roster for the wrong restaurant. Filter orders, movements and entities to the configured branch. Unscoped operational records are compatible only when the roster proves one matching branch. Shared catalog/staff records remain shared unless explicitly assigned elsewhere. Advance global page cursors past intentionally excluded records. |
| Core upload uses an unbound or wrong-branch credential | The cloud derives new order/movement ownership from the registered credential; a local branch setting cannot assign that ownership. | Before uploading orders, movements or branch-owned entities, verify the active POS_ADMIN credential's hash and registered branch against the roster. Otherwise return `BRANCH_BOUND_CORE_CREDENTIAL_REQUIRED`, keep local records/outbox and send no mutation request. This does not change a credential or move a device automatically. |
| Anonymous kiosk can pull the branch order queue from Core | Customer/contact/order data for other guests was available through the local endpoint, despite narrower cloud behaviour. | Scope both timestamp and sequence HTTP pulls to server-recorded creator identity. Local creation stamps that identity; later POS edits cannot replace it. A kiosk cannot edit an existing order owned by another device or claim a historical record with an unknown creator. Staff retain the branch queue. |
| Core trusts response position or unrelated acknowledgements | Reordered responses could mark the wrong order/movement sent. An unsolicited catalog acknowledgement could clear work not in the upload. A payload changed away and back could match an old acknowledgement. | Match unique original references. Keep omitted, duplicate or rejected results pending. Require submitted catalog payload **and local revision** before clearing its dirty flag; remove the unguarded clear operation. |
| Old cloud mirror rows have no reliable branch provenance | Preventing new imports alone leaves previously imported data visible. Stock totals could retain another branch's movement. | Preserve rows but quarantine unprovable historical cloud orders and movements in a multi-branch Core. Hide explicit other-branch entities. Keep local unsent work. Record branch provenance on newly accepted orders/movements. Authoritative stock replay can establish ownership only when immutable movement evidence matches. Report remaining unknown row counts in admin-only Core status. |
| A scoped roster looks like a single-branch restaurant | A branch-bound credential receives a one-branch list even when the restaurant has five branches. That list cannot prove ownership of old unscoped data. | The API returns `restaurantBranchCount` for the authenticated restaurant. Core uses this explicit total before accepting legacy unscoped operational data. Missing metadata from an older server fails closed; it does not mean one branch. |
| Cloud credential transport can be configured as plain remote HTTP | A long-lived bearer token would travel without TLS. | Accept HTTPS cloud endpoints and loopback HTTP development endpoints only; refuse embedded URL credentials, query parameters and fragments. Normalize the trailing slash. Local HTTPS Core serving configuration is separate. |
| A freshly deactivated branch remains usable on Core | Cached subscription and device entitlement checks did not inspect the branch's refreshed status. | Require the configured branch to be present and ACTIVE for operational authentication. Keep heartbeat/recovery polling available, and resume after a valid active roster arrives. |

## SQLite compatibility

BranchStore schema advances from **2 to 3** by adding nullable `movements.branch_id` and its index. Existing movement/order/outbox data is retained. No branch is guessed for old cloud movements. A real file migration regression reconstructs v2, retains its movement and pending upload, then opens it with the new schema.

The existing newer-schema guard prevents an older Core from opening the upgraded database. Do not downgrade the binary over that database. The change does not rotate credentials, signing keys, package identity or customer data-encryption keys.

## Verified scenarios

The current machine-readable run summaries are in [REPAIR_VERIFICATION_2026-10-18.json](REPAIR_VERIFICATION_2026-10-18.json). Relevant tests:

- `tests/branch_core_uplink_isolation.test.ts`: mixed five-branch responses observed independently by branch A and B; single-branch legacy compatibility; wrong-restaurant refusal; unbound/wrong-branch write refusal; quarantine and safe authoritative stock attribution.
- `tests/branch_core_uplink_acknowledgements.test.ts`: reordered order/stock results, missing/unrequested IDs, duplicate catalog replies and edit-away/edit-back acknowledgements.
- `tests/branch_core.test.ts`: real HTTP kiosk privacy, forged creator refusal, retained creator after POS updates and v2-to-v3 file migration; existing multi-device rules.
- Existing Core authorization, outage, chaos, product access and kiosk configuration suites provide compatibility coverage.
- `cloud/api/test/branch-roster.e2e.spec.ts` checks the total against real persisted branch data and distinguishes scoped roster length from restaurant branch count. `branch-core-uplink.e2e.spec.ts` drives the real Core against a real isolated cloud API, including reconnect and lost acknowledgement.

These use real local Core SQLite and HTTP where stated, with fixture cloud responses. They do not demonstrate installed Core-to-production-cloud acceptance.

Real cloud/API follow-up: **21 tests passed across three files**, including scoped roster count, actual reconnect after offline orders, partial connection failure/replay, branch isolation and product permissions. These ran on a newly migrated run-owned local PostgreSQL database with a non-bypass-RLS role; that database was removed afterwards. Final local Core/offline follow-up results are recorded separately in the verification ledger.

Final Core/offline follow-up: **75 tests passed across nine files**, including actual offline POS SQLite, routing, QR order desk, encrypted backup operations, branch-status recovery, HTTP kiosk privacy, upgrade and chaos cases. This is a different, overlapping selection from earlier Core subsets.

## Rollout and recovery requirements

1. Preserve a complete backup of the existing Core database before upgrading. Stop the owning service for a raw SQLite file backup; do not copy only the main file while an active WAL may contain unsaved pages.
2. Keep the existing restaurant, branch, device identity and pending work. The uplink credential must be an active Restaurant Admin device registered to that branch. A restaurant-wide owner credential can still be used for scoped reads, but it cannot safely assign branch-owned financial writes through this relay.
3. Read `branchScopeReview` from authenticated `/api/v1/branch-core/status`. `required: true` means historical cloud records remain stored but are excluded until ownership is established. Do not resolve this by assigning every unknown row to the current branch.
4. Compare an isolated mirror against authoritative branch data before a controlled refetch. Original IDs, totals and stock evidence must reconcile. This change provides filtering, provenance, refusal and diagnostic counts; **an automated guided reconciliation UI is not implemented**. Do not reset cursors, wipe rows or replay financial side effects blindly.
5. Verify orders from the actual POS, Captain and Kiosk devices reach the correct cloud branch, preserve original channel/creator information on relay and direct-cloud failover, and remain invisible in other branches. Full relay-origin attribution and concurrent Core/cloud conflict recovery are still W04/W05 acceptance work.
6. Deploy the additive roster metadata before, or alongside, this Core build. An older API remains usable for explicitly scoped records, but cannot establish single-branch ownership for legacy unscoped rows. Keep TLS enabled for remote cloud connections.

No live restaurant data was deleted or repaired by these tests. These changes do not fix the separate EC-01 durable-checkout boundary, full refund/analytics reconciliation or complete off-site recovery.
