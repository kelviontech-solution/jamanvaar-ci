# Packaging Readiness

Scope of this phase: make the applications **architecturally ready** to be packaged later. Nothing here builds, signs, installs or distributes an EXE, APK, AAB or installer, and none of that was attempted. Packaging decisions come after this architecture is proven.

Everything below states what is verified by an automated test in development mode, and what is not. Where something is not verified it is listed as NOT READY with what is missing, why it matters and what to implement. Nothing is described as "will work after packaging".

Test status when this was written: root suite 159 files / 1147 tests passing. The cloud API suite was not touched in the latest round and was not re-run.

---

## 1. Architecture in one page

```
 POS / Kiosk / Captain / KDS / Restaurant Admin  (browser-tech apps, packaged later by a shell)
        │  same operational HTTP API, one base URL switch (EndpointResolver)
        ▼
  Branch Core  (Node + SQLite, one per branch, LAN)  ──uplink/downlink──►  Cloud (durable, cross-branch truth)
```

* **Ports and adapters** (`packages/api/src/platform.ts`): Printer, Cash Drawer, Network, Device Identity, Display, Scanner, Payment Terminal. Business code calls `Platform.<port>`; a shell installs adapters with `Platform.use({...})`. Today's adapters are the browser/dev ones plus the existing native-bridge printer path. `portContract(name, make)` in `tests/platform_ports.test.ts` is the acceptance suite any new adapter (Tauri, Windows spooler, Android) must pass.
* **Storage**: repositories (`packages/database`) sit over `DbStorage`/`DurableStorage` (SQLite WASM on OPFS, leader-elected across windows) with a localStorage fallback. Small values (sync cursors, Branch Core address, device-gate state, menu version, notices) go through `KeyValueStore` (`packages/database/src/key_value_store.ts`): SQLite once attached, with one-time migration of old localStorage values (§6).
* **One sync protocol** shared by every app and by the Branch Core: eventId, entity, ids, deviceId, schema version, timestamp, payload; the core assigns a gapless sequence; exactly-once via processed events.
* **Endpoint resolution**: operational traffic goes to the Branch Core when reachable and falls back to the cloud on connectivity failure only; cloud-only paths (payments gateway, entitlements) never go to the core. Separate cursors per server.

## 2. Branch Core placement

| | A. On the primary POS | B. Dedicated mini-PC (service) | C. With Restaurant Admin | D. Dedicated executable | E. Peer-to-peer |
|---|---|---|---|---|---|
| Reliability | Poor: POS reboot/off takes the restaurant down | Best: always on, nothing else on it | Medium: admin PC is often turned off | Same as B if on its own box | Good in theory, hardest to get right |
| Cost | none | ~₹15–25k one-off | none | none | none |
| Install effort | low | medium (one extra box) | low | medium | high |
| Discovery | trivial | LAN discovery/pairing | LAN discovery/pairing | same as B | complex membership |
| Failover | none | none by itself (see below) | none | none | built in |
| Support | easy | easy | confusing (two roles) | easy | hard |
| Performance | competes with POS UI | isolated | competes | isolated | spread |
| Security | shares machine with cashier | best isolated | shared with owner PC | good | every device holds all data |
| Multi-device | fine | fine | fine | fine | fine |

**Decision: B (dedicated Windows service on a low-cost always-on mini-PC), packaged as D (a standalone executable) and optionally co-installed on the Restaurant Admin machine (C) for small single-counter restaurants that have no spare box.** A is rejected as the default because "the POS is off must not bring the restaurant down" fails. E is rejected for complexity and correctness risk.

### Single points of failure and what happens

| Failure | Effect | Fallback |
|---|---|---|
| Branch Core down/unreachable | Apps cannot reach the LAN hub | Each app keeps working from its own local SQLite, queues events, and falls back to the cloud if the internet is up; syncs to the core when it returns. Cross-device live views (KDS) degrade until the core or cloud is reachable |
| Internet down, core up (Type A) | No cloud sync, no UPI | Whole restaurant works via the core; cash/card-terminal only; queue drains when internet returns |
| Both down (Type B) | Devices cannot exchange data | Each device works alone and stores locally; **no device-to-device sync is claimed** without a path. Sync resumes automatically when any server is reachable |
| Core machine disk loss | Local branch data lost | Cloud holds the durable copy (uplink); restore from an encrypted local backup (`backup`/`restore`, scheduled by the running core) or from the cloud |
| Core process crashes or hangs | as "core down" | `serve` mode supervises it: restart with backoff, and a health watchdog kills a hung core. Starting the supervisor at boot is an OS registration step that belongs to packaging |

Failover to a second core (hot standby) is not built; documented as an option (B+B or B+C), not claimed.

## 3. Offline types

* **Type A: LAN up, internet down.** Verified in `tests/offline_routing_integration.test.ts`: orders, KDS reads, cash payment and printing continue through the core; UPI is refused; orders sync to cloud once, exactly once, on return.
* **Type B: nothing reachable.** Verified: orders saved locally, backoff, no loss, exactly-once on later delivery, survive an app restart. Devices do not pretend to sync with each other.

## 4. Status wording

ONLINE ● Connected / LOCAL OFFLINE ● Working locally / SYNCING / SYNC ERROR ⚠. The network indicator is driven by verified reachability (a real request succeeded recently), not the browser's "online" flag (`EndpointResolver` → `NetworkStatusService.reportReachability`, tested in `tests/payment_policy.test.ts`).

## 5. Payments, printing, QR

* Cash always available. UPI/UPI_QR only with verified internet (`PaymentPolicy`, enforced in the repository so no screen or sync path can bypass it). Card only with a terminal present. No order is ever PAID by default; settle is idempotent; a second different payment is refused. Tested.
* Printing is local: bills and KOTs go to the printer port with the internet down and never touch the cloud; failures retry, are not duplicated, and survive restart. Tested. Cash drawer opens through the same port (ESC p kick); failures are reported and audited honestly and never block the sale (POS previously logged "kick sent" without sending anything; fixed).
* **QR ordering offline is possible only if the QR page is hosted on the LAN** (the Branch Core can host any built web app under `/apps/<name>/`, tested) and the customer's phone is on the restaurant Wi-Fi. A QR that points at the internet cannot work offline. Building the customer QR app as a core-hosted bundle is not done.

## 6. Storage abstraction

* Repositories over `DbStorage`/`DurableStorage` (SQLite, versioned migrations via `PRAGMA user_version`, a database newer than the app is refused, cross-window leader election).
* `KeyValueStore` is the port for cursors and settings. With no `localStorage` it does not throw; with the durable store attached it writes there and migrates old values on first read (`tests/key_value_store.test.ts`).
* Still direct `localStorage`, deliberately: `lan_mesh_sync` (browser BroadcastChannel/storage-event transport between windows), the number allocator, table/service-message caches, per-app session and UI preference keys, and `Platform.deviceIdentity`'s default adapter. None is business logic; a native shell replaces the identity adapter and the window transport.

## 7. What was built to close the earlier gaps

| Gap | Now |
|---|---|
| Hardware ports | `platform.ts` ports + `portContract`; printing, KOT, cash drawer, keep-awake (KDS, kiosk) go through ports |
| POS works offline on SQLite | `tests/pos_full_offline_sqlite.test.ts`: shift, table, KOT, hold/recall, cash, refused UPI, print, drawer, loyalty, cash-out, refund, void, shift close, business-day metrics, on a real SQLite file with every network call rejected; then restart; then the Branch Core receives each order exactly once |
| Branch Core backups | AES-256-GCM encrypted snapshots, retention, atomic write, restore with integrity and version checks, scheduled while running (`backup.ts`; tested including wrong passphrase and tampering) |
| Branch Core keeps running | `supervisor.ts`: restart with backoff, hung-process watchdog, capped log (tested) |
| LAN security | Optional HTTPS with the certificate fingerprint advertised for pairing (tested with a real certificate); commands signed HMAC-SHA256 and verified by the device, forged commands refused (tested) |
| Version report | `/status` reports app, database, sync protocol, menu and config versions |
| KDS and apps offline | The core serves built apps at `/apps/<name>/` with SPA fallback and path-escape protection (tested); KDS cursor reads tested under chaos |
| Kiosk pictures offline | `ImageCache` (Cache API): sync on menu change, evict removed pictures, serve the cached copy when a picture fails to load; kiosk uses `CachedImg` (tested with an injected cache) |
| Kiosk UPI | Was already hidden/blocked offline in the kiosk and is enforced below the UI by `PaymentPolicy` |
| Diagnostics, settings, Sync now | `ConnectionPanel` (status wording, Branch Core address validated before saving, backlog, storage health, versions, Sync now) in POS Settings and the Restaurant Admin Sync tab; `ConnectionBadge` in the POS header (logic and server-side render tested) |
| Multi-device chaos | `tests/branch_core_chaos.test.ts`: 12 terminals, duplicate/dropped-ack/scrambled delivery, two core crashes: nothing lost, nothing doubled, sequence increasing, KDS sees everything; two branches isolated; a restarted core keeps unsent cloud uploads without doubling them |

## 8. Readiness score

Each component is scored out of 100 on five criteria. **Criterion E, verification on a real device or packaged shell, is worth 15 points that cannot be earned in this phase** (no EXE/APK may be produced), so every component's ceiling here is **85**. A component is READY when it reaches at least 85% of that ceiling (72 of 85) and has no open blocker.

| Criterion (weight) | POS | Kiosk | Captain | KDS | Rest. Admin | Branch Core |
|---|---|---|---|---|---|---|
| A. Works offline on local data, tested (30) | 28 | 24 | 20 | 24 | 22 | 27 |
| B. Sync, routing, exactly-once, isolation (20) | 19 | 18 | 17 | 18 | 17 | 19 |
| C. Ports and storage abstraction (15) | 11 | 10 | 6 | 11 | 11 | 14 |
| D. Operations: diagnostics, backup, security, versions (20) | 14 | 12 | 8 | 10 | 15 | 17 |
| E. Real device / shell verification (15) | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total / 100** | **72** | **64** | **51** | **63** | **65** | **77** |
| **Share of the 85 achievable now** | **85%** | **75%** | **60%** | **74%** | **76%** | **91%** |
| **Gate** | **READY** (caveat) | NOT READY | NOT READY | NOT READY | NOT READY | **READY** (caveat) |

The scores are my judgement against the evidence in §7 and §9, not a computed metric. Every lost point is explained below so the numbers can be challenged.

**Caveat on the two READY verdicts.** READY means the architecture is proven in development and nothing found blocks packaging that component. It does not mean it has run on a real printer, as a Windows service, or in a packaged shell; that is criterion E and the first thing packaging must prove. The POS sits exactly on the threshold (72). Branch Core is also not ready to be *installed*: registering the supervisor to start at boot is an operating-system step left to packaging.

### Why points were lost: what is missing, why it matters, what to implement

**POS (72)**
* Native adapters absent (C -4). Why: printer, drawer and identity are proven with fakes and the browser adapters only, so real hardware behaviour is unproven. Implement: Tauri/Windows adapters that pass `portContract`, then a receipt-printer and drawer smoke test.
* New screens verified by type-check and server render only (A -2, D -6). Why: the browser tool was unavailable, so the Connection panel and header badge were not driven in a real browser. Implement: a browser pass through online, local-only and offline.
* No update mechanism (D). Why: "never force an update during service" is only a rule today. Implement with the shell's updater.

**Kiosk (64)**
* No kiosk-specific end-to-end test (A -6). Why: the kiosk order to cash-at-counter to KOT journey offline is covered through shared repositories, not by its own test. Implement: a kiosk journey test like the POS one.
* Native adapters and kiosk lock-down (C -5, D -8). Why: shell concerns. Implement with the shell.

**Captain (51)**, the lowest
* Android WebView storage unverified (C -9). Why: OPFS/WASM SQLite availability varies by Android version, and the local store is the offline guarantee. Implement: a native SQLite `DbStorage`/`KeyValueStore` adapter (or a verified fallback) passing the storage tests on a device.
* Pairing by URL only (D -12). Why: a WebView cannot do UDP discovery. Implement: a pairing-code flow against the core.
* No Captain-specific offline journey test (A -10).

**KDS (63)**
* Real TV/browser reconnect and wake-lock behaviour unverified (A -6). Why: the wake lock is wired through the display port but untested on a device. Implement: a device test, and a service-worker cache so the KDS shell survives a core restart.
* Per-app messaging for each device-error code not re-verified (D -10).

**Restaurant Admin (65)**
* Reports do not yet label local-branch versus cross-branch scope, or disable cross-branch reports offline (A -8). Why: an owner could read a partial number as the total. Implement: a scope label, and a disabled state with a reason.
* No update-channel screen (D -5).

**Branch Core (77)**
* No automated per-branch certificate authority (D -3). TLS works with a supplied certificate and advertises its fingerprint; issuing and distributing one is part of the pairing flow, not built.
* Boot registration is deferred to packaging by the rules of this phase.
* Second-core failover is documented as an option only.

## 9. Development-mode evidence

| Scenario | Evidence |
|---|---|
| Internet ON / OFF / restored | `offline_routing_integration`, `endpoint_resolver`, `payment_policy`, `connection_diagnostics` |
| Cloud unavailable / Branch Core unavailable | `offline_routing_integration` (core down goes to cloud; both down goes to the local queue) |
| App restart | `pos_full_offline_sqlite`, `offline_routing_integration`, `platform_ports` |
| Duplicate / failed / delayed sync | `branch_core`, `branch_core_chaos`, cloud `sync-chaos`, `branch-core-uplink` |
| Crash during sync / core crash | `branch_core_chaos` (two crashes), supervisor tests; the outbox never advances past an unapplied item |
| Multiple devices / branches | `branch_core_chaos` (12 terminals, 2 branches), cloud roster e2e |
| Hardware ports | `platform_ports` |
| Backup, restore, tampering | `branch_core_operations` |
| Forged LAN command | `branch_core_operations` |
| TLS | `branch_core_operations` (real certificate) |

## 10. What still needs a real device or shell (criterion E)

1. A real receipt printer and cash drawer through a native adapter.
2. Windows service start at boot for the supervisor; the Branch Core on the chosen mini-PC.
3. Android WebView storage for Captain; the KDS on a TV.
4. A browser pass over the new Connection panel and header badge.
5. The cloud API suite re-run before release.

These are what the packaging phase exists to prove, in that order: adapters against `portContract`, then service registration, then shells.
