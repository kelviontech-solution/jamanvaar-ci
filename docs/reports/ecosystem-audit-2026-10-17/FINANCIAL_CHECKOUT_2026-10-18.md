# Financial checkout and recovery implementation — 18 October 2026

This is an implementation stage of the ten remaining work packages, **not completion of the repair programme**. Changes are local and uncommitted. No deployment, push, payment collection, signing-key change or installed-app update was performed.

## Changes

### W03: actual POS regular and Instant Bill checkout

- `JamanvaarDatabase.commitFinancialMutation` stages synchronous repository mutations in isolated collections. It checks persisted dependencies, saves the original operation envelope, commits the effects and replay result through the existing SQLite command protocol, and then publishes acknowledged state.
- The saved envelope survives a lost response and restart. A retry with the original business request uses the original order IDs and collection reference. A different request cannot silently replace an unresolved checkout. A SQLite-proven version conflict releases only that rejected intent for explicit review; unknown outcomes remain recoverable.
- Mutations and storage changes are blocked while a command is pending. Preparation failure restores the original data and discards deferred relay effects. A sibling window's acknowledged data is reloaded before preparation, and SQLite checks the read set again while holding its write lock.
- The actual payment modal awaits `completePaymentDurably`. It keeps the cart and payment screen until acknowledgement, locks payment edits while saving, and explains unknown outcomes without inviting another collection.
- Order changes, loyalty redemption/earning, inventory mutations and receipt intent go through repository preparation. Cashier-confirmed payment references are included before commit. Hardware, live notifications and cart clearing follow acknowledgement. Replay opens the saved receipt without automatically printing or pulsing the drawer again.
- Instant Bill uses this boundary when SQLite is attached and preserves its automatic-print and KOT options. The old synchronous settlement entry refuses use on an attached command-capable store.
- Deferred relay creation/settlement requests use the final acknowledged order, avoiding delivery of an older pending snapshot after the paid snapshot.
- Independent `paymentTransactions` and `receipts` collections, previously present only in memory, are now serialized and reloaded.

This does **not** close EC-01/W03: Kiosk, Captain, refunds/voids, other settlement entry points, legacy storage policy, and native power-loss acceptance still need a complete adoption pass. The older Instant Bill fallback remains a legacy path on browsers without SQLite; it is not certified by these checks. The normal payment modal requires supported SQLite and preserves its cart when unavailable.

### W07: protected local recovery and safer business exports

- POS owner/manager Settings → Local DB & Sync now exposes encrypted device recovery download and file decryption/scope verification.
- The complete SQLite recovery envelope includes key/value data, local keys and the operation-result ledger. Its downloaded representation uses AES-256-GCM and PBKDF2-SHA256 with random salt/IV, authenticated scope metadata, fixed bounded parameters, and file-size limits. Passphrases are not saved.
- A real local SQLite test restores that encrypted envelope into a new empty target and replays the original operation without duplicating effects. Wrong passphrase, altered ciphertext, wrong scope and nonempty targets are refused.
- File verification in the UI does not install a restore or claim an off-device copy exists. Full file/object/cloud recovery, original device identity handling, old-version migrations, interrupted restore, key loss and measured RPO/RTO remain separate acceptance work.
- Admin JSON export/upload and the pre-restore snapshot now use an explicit business-data projection. They no longer serialize the database backend, private encryption key or pending command internals. The local JSON export is labelled as an unencrypted business snapshot, not complete device recovery.
- The JSON importer rejects another restaurant/branch, replacing live financial history, and financial imports into a command-capable SQLite store. It retains existing staff roles and licensing. SQLite financial recovery must use the engine's atomic empty-target operation, preserving replay history with data.

### W08: local storage health

POS settings now derives its storage engine and state from the attached backend instead of always showing `HEALTHY` and `Browser LocalStorage`. It distinguishes SQLite, legacy storage, memory-only mode, pending saves and failures. Physical device health remains unverified.

## Verification

Final checks are recorded in [FINANCIAL_CHECKOUT_VERIFICATION.json](FINANCIAL_CHECKOUT_VERIFICATION.json). Earlier intermediate runs overlap the full run and must not be added as independent test totals.

| Check | Result |
| --- | --- |
| Full root regression, four workers | **2,351 passed, 0 failed, 0 skipped; 331 files** |
| Root all-project TypeScript gate | Exit 0 |
| Cloud API TypeScript gate | Exit 0; this is not a new full API database-suite run |
| POS and Restaurant Admin Vite production builds | Both exit 0; existing large-chunk warnings remain |
| Real Chrome/SQLite OPFS fixture | Four scenarios passed, zero page errors; mobile layouts checked at 390px, payment also checked at 1366px |

The full root run used the final runtime implementation; a subsequent TypeScript-only return annotation corrected typed-array/BufferSource compatibility. Production build and browser verification then passed with the corrected annotation. Vite bundles are frontend artifacts, not signed Windows installers or APK upgrade acceptance.

- Real repository/SQLite tests cover atomic acceptance, preparation rollback, delayed acknowledgement, lost response, restart replay, changed-request refusal, sibling-terminal conflicts, independent collection/receipt persistence, POS regular and Instant Bill, configured loyalty and refund replay, encrypted recovery, and restore/export safety.
- `financial-checkout-browser.cjs` builds the real payment component/store and real SQLite OPFS worker on an isolated loopback origin. Identities and hardware are fixtures; this is not authentication, Razorpay, native installation or physical-printer acceptance.
- Browser scenarios cover mobile/desktop acknowledgement delay, reload after a committed-but-lost response, and encrypted recovery download/wrong-passphrase/verification. Browser screenshots and raw results stay under ignored `.jamanvaar/`.

## Remaining package status

| Package | Current boundary and remaining work |
| --- | --- |
| W03 — durability | POS regular/SQLite Instant Bill implemented locally. Finish Kiosk/Captain/refund/void/other callers and migration/fallback policy, then installed crash/close/device acceptance. |
| W04 — concurrency | Local preparation and sibling-change rejection improved. Core/cloud revision bridging, original-channel attribution, quarantined-history reconciliation and full multi-terminal amendment/deletion matrices remain. |
| W05 — lifecycle/payments | Original collection reference retained through local replay; manual confirmation is persisted before success. Provider cancellation/late-success/refund/fallback and all-channel state matrices remain. |
| W06 — reconciliation | No new assertion that all reports reconcile. Cross-report metric definitions, cutoff history and persisted financial fixture acceptance remain. |
| W07 — recovery | Protected local export/verification and one empty-target SQLite replay drill added. Full supported restore workflow, offsite/key-loss/object/migration drills and measured RPO/RTO remain. |
| W08 — operations | Local storage status corrected. Fleet incidents and physical printer/drawer/sidecar acceptance remain. |
| W09 — UX | Actual payment UI and recovery component browser checks added. All-role/all-page/F01–F25 revalidation and all ordering journeys remain. |
| W10 — security | Snapshot internals excluded and unsafe JSON ownership/history changes blocked. Full endpoint/role/tenant/branch/product and signed-artifact acceptance remain. |
| W11 — capacity | No new sustained production-like capacity evidence. |
| W12 — rollout | No native signed upgrade, provider/hardware acceptance or restaurant pilot performed. |

The provisional scores remain **Security 7/10, Code quality 7/10, SaaS readiness 6.5/10** until broader acceptance supports a reassessment. More source repairs and focused tests do not establish a 10/10 rating.
