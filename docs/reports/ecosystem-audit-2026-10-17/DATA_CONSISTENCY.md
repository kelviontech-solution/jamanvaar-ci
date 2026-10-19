# Data consistency assessment

Actual service/database probe results: [BACKEND_PROBES.json](BACKEND_PROBES.json). Local observation probes: [probes.test.ts](probes.test.ts). These use disposable data, not customer records.

## Strong existing controls

- Canonical tenant/external-order uniqueness, processed-event uniqueness, payment-provider reference uniqueness and inventory movement identities.
- Tenant transaction wrappers; PostgreSQL forced RLS on 43 of 45 tables carrying restaurantId, with two platform-controlled exceptions documented in SECURITY.md.
- Advisory locks and transaction-scoped event claims; stale-header detection, item ownership/revision merge, persisted sync conflicts and post-commit wake-ups.
- Integer paise on cloud financial boundaries; positive ledger entry constraints and guarded collection/refund limits. Frontend rupee arithmetic still needs shared independent test vectors.
- Cursor catch-up and periodic polling recover missed SSE hints. Database triggers advance entity sequence on restoration; this was verified rather than assumed from the service's explicit fields.

## Confirmed weaknesses

1. **Local accepted write is not a local durable commit.** A setItem followed by immediate close returned a readable value and healthy state but never persisted the value. Financial action callers use synchronous repositories; an explicit awaited local transaction/flush boundary is needed before promising durable success. This is a controlled storage-close proof, not a physical power-loss test.
2. **Some distinct payloads share the sync event identity.** Modifier-only changes at the same timestamp are omitted from the content fingerprint. The payload can differ while the derived event ID remains identical. Use a persisted operation revision or complete canonical payload digest; keep retry identity stable.
3. **Clock-skewed entity updates can remain dominant.** A 2050 category edit caused the following current-time edit to return ok with unchanged syncVersion and old content. Timestamps are not reliable concurrency tokens. Return explicit conflict outcomes and use server versions/CAS with a defined offline merge policy.
4. **Backup restore loses operational identity.** Recreating a missing QR record through the real restore DB loop set source to POS, dropped publicOrderId and changed createdAt. This changes channel attribution, tracking and historical periods.
5. **The restaurant snapshot is not a financial disaster-recovery set.** It includes SyncedOrder but omits payment allocations, gateway attempts/refunds and inventory movements. Recreating the test paid/refunded order restored zero payment entries. Partial restoration must be explicit and protected; a full DR path requires coordinated database/object/key recovery.
6. **Sales read models disagree with settlement facts.** A ₹100 order with ₹20 returned has ₹80 net collection but becomes zero sales and one open bill in the Super Admin per-restaurant report. A 20:00 UTC sale appears on the UTC date despite an Asia/Kolkata restaurant date one day later.

## Invariant checklist

| Invariant | Current evidence / verdict |
| --- | --- |
| Restaurant/order membership and cross-branch references | Implemented guards, RLS and migration constraints; integration results in TEST_REPORT.md; not every route manually probed |
| Item totals versus header after concurrent edits | Integrity flags/stale-header protection exist; complete conflicting multi-terminal financial acceptance remains required |
| Payment amount/status versus allocations | Service constraints and provider verification exist; inconsistent backup recovery and report semantics confirmed |
| Duplicate requests versus business effects | Processed-event/attempt/refund identities exist; same-timestamp payload identity omission confirmed |
| Cancellation/refund history preserved | Journals/allocations exist; snapshot restoration omits financial evidence |
| Kitchen state valid and scoped | Rank/revision merge exists; full native multi-station Ready→Served acceptance not repeated |
| Inventory movement once only | Unique ledger and replay handling exist; physical stock/negative-stock contention acceptance not repeated |
| Revoked or expired entitlement refused | Server enforcement exists; effective offline/reconnection acceptance needs installed clients |
| Offline changes survive sudden termination | Awaited-flush SQLite tests exist; action-to-commit gap reproduced; physical crash acceptance outstanding |
| Reports agree with documented metrics | FAIL for partial-refund and local-day examples |

## Required repair sequence

Protect accepted financial work first; then repair backup identity/relationships, clock-skew conflict handling and reporting definitions. Do not reject valid already-collected offline orders simply because the current menu changed: preserve their historical snapshot and surface an actionable conflict. Do not use an old operational snapshot to silently roll current collections/refunds backwards.

Transaction acceptance tests should cover server commit followed by a dropped response, replay after process restart, concurrent register collection, an older KDS update after a recall, and restoration into a genuinely empty recovery environment. Ordinary successful online polling is insufficient evidence for these cases.
