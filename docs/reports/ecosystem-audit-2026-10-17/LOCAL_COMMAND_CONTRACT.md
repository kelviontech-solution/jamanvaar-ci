# Local durable command contract

18 October 2026. The storage protocol is now used by actual POS regular and SQLite Instant Bill checkout through `JamanvaarDatabase.commitFinancialMutation`. Other callers and installed-device acceptance remain incomplete. See [the latest implementation and limits](FINANCIAL_CHECKOUT_2026-10-18.md).

## Boundary

`DurableStorage.commitCommand(command)` routes through the direct engine, browser worker or cluster leader. SQLite commits these together in one transaction:

1. Check the operation ledger for the original operation ID.
2. If already committed with the same request fingerprint, return its saved result without reapplying effects. A different fingerprint rejects ID reuse.
3. Otherwise compare every expected value under `BEGIN IMMEDIATE`. Every written key must be in this read set. A changed dependency rejects the command.
4. Apply all operations and insert their result into `local_commands`, then commit.

The caller's synchronous storage cache publishes acknowledged values after success. Replayed results return **current** stored values, preserving later legitimate edits. A new ordinary edit queued after the command remains later both in the cache and on disk.

The command envelope contains `operationId`, `requestFingerprint`, `expected`, `ops` and JSON `result`. The business layer must generate a globally unique ID scoped to the restaurant/branch/device/database and retain it through retries. The fingerprint must be a SHA-256 of the original canonical business request, excluding changing authorization credentials. It is an integrity/deduplication identifier, not an authorization signature. Changing quantities, tenders or the requested operation requires a new operation ID. The saved result should contain stable result references rather than credentials or unnecessary customer data.

## Outcomes

| Outcome | Meaning | Caller action |
| --- | --- | --- |
| `COMMITTED` | Data effects and result were acknowledged | Show success; dispatch appropriate post-commit work |
| `REPLAYED` | This operation already committed | Recover its original references; avoid automatically charging or printing again |
| Error with `outcome: REJECTED` | Invalid request, ID reuse or a read-set conflict; this attempt did not apply | Preserve the draft and show the correction/review action |
| Error with `outcome: RECOVERY_REQUIRED` | Storage/worker/leader/acknowledgement failure; outcome may be unknown | Keep the original ID/request, reopen/recover as needed, and retry that operation |

Known business rejection does not label a healthy disk as failed. Backends without this protocol fail explicitly; there is no fallback to ordinary background writes. Unsupported/closed storage must also be handled before the UI promises acceptance.

## Verified scope

Latest adoption and remaining caller register: [channel durability continuation](CHANNEL_DURABILITY_2026-10-18.md). Its verification ledger separates actual UI checks, service fixtures and external acceptance; it does not close EC-01 for every caller.

Real Node SQLite tests cover close/reopen, operation replay, ID misuse, stale read sets observed through another connection, all-or-nothing rollback, normalized row collections and current-state replay. A simulated worker transport exercises the protocol against real SQLite. The simulated browser cluster exercises a lost acknowledgement followed by leader takeover and replay, including rejection codes carried back to a follower.

Those original primitive tests use representative order/collection/stock/loyalty/outbox keys. Additional real-repository and actual POS browser/OPFS acceptance is recorded in the latest implementation stage. Installed native power-loss, all-channel financial caller adoption and physical printing/drawer acceptance remain separate.

The internal `exportRecovery(scope)` / `restoreRecovery(snapshot, expectedScope)` envelope includes both key/value collections and operation-result history, through direct, worker and cluster backends. It is an **unencrypted internal format**. The new protected recovery wrapper encrypts the complete envelope for POS download and verification; a real-SQLite empty-target drill verifies replay after decryption/restore. A supported installed restore workflow and off-site recovery drill remain incomplete. Never expose the internal plaintext envelope or its embedded customer encryption key as an unprotected download.

## Required before financial adoption

- Refactor each financial action into data preparation plus deferred effects. Include actual order, payment, stock, loyalty, receipt intent and outbox mutations and all their read dependencies.
- Persist/restore the operation ID with the cart or recovery record. Preserve the original request during unknown outcomes. Do not reuse the ID for an edited request.
- Await the command before showing a success receipt, clearing a cart, opening the drawer, printing, broadcasting acceptance or starting upload. An extra flush after those effects is insufficient.
- Protect concurrent edits while preparing a command. Handle the explicit conflict; never silently retry a newly rebased financial request.
- Define degraded browser/localStorage behaviour honestly. This guarded command API requires a supported durable backend; it must not silently downgrade to a weaker backend.
- Use the complete recovery envelope when backing up the local store. `loadAll()` intentionally retains its old key/value export contract and **does not export `local_commands`**. A key/value-only export is therefore not a complete financial recovery format. Integrate protected backup/download/restore UI and installed migration acceptance before adopting this boundary for financial actions.
- Preserve this additive table during recovery and application upgrades. There is no ledger-pruning API: deleting operation results prematurely would remove replay protection.
- Complete real POS/Kiosk/Captain failure injection and cross-window crash/reopen tests before closing EC-01 or W03.

Client-side SQLite controls do not prevent an operator with filesystem access from modifying local data, grant server-side permissions, or replace cloud payment verification.
