# Packaging Readiness

Scope of this phase: make the applications **architecturally ready** to be packaged later. Nothing here builds, signs, installs or distributes an EXE, APK, AAB or installer, and none of that was attempted. Packaging decisions come after this architecture is proven.

Everything below states what is verified by an automated test in development mode, and what is not. Where something is not verified it is listed as NOT READY with what is missing, why it matters and what to implement. Nothing is described as "will work after packaging".

Test status when this was written: root suite 152 files / 1117 tests passing; cloud API suite previously green with the two known pre-existing failures (re-run before release).

---

## 1. Architecture in one page

```
 POS / Kiosk / Captain / KDS / Restaurant Admin  (browser-tech apps, packaged later by a shell)
        │  same operational HTTP API, one base URL switch (EndpointResolver)
        ▼
  Branch Core  (Node + SQLite, one per branch, LAN)  ──uplink/downlink──►  Cloud (durable, cross-branch truth)
```

* **Ports and adapters** (`packages/api/src/platform.ts`): Printer, Cash Drawer, Network, Device Identity, Display, Scanner, Payment Terminal. Business code calls `Platform.<port>`; a shell installs adapters with `Platform.use({...})`. Today's adapters are the browser/dev ones plus the existing native-bridge printer path. `portContract(name, make)` in `tests/platform_ports.test.ts` is the acceptance suite any new adapter (Tauri, Windows spooler, Android) must pass.
* **Storage**: repositories (`packages/database`) sit over `DbStorage`/`DurableStorage` (SQLite WASM on OPFS, leader-elected across windows) with a localStorage fallback. Business rules do not touch a storage engine directly. Remaining direct `localStorage` use is small and is UI/preference/cursor state (see §6).
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
| Core machine disk loss | Local branch data lost | Cloud holds the durable copy (uplink); restore from cloud/backup. Scheduled encrypted local backup is NOT READY (below) |
| Core machine off during service | as "core down" | Auto-start as a service is NOT READY (below) |

Failover to a second core (hot standby) is not built; documented as an option (B+B or B+C), not claimed.

## 3. Offline types

* **Type A: LAN up, internet down.** Verified in `tests/offline_routing_integration.test.ts`: orders, KDS reads, cash payment and printing continue through the core; UPI is refused; orders sync to cloud once, exactly once, on return.
* **Type B: nothing reachable.** Verified: orders saved locally, backoff, no loss, exactly-once on later delivery, survive an app restart. Devices do not pretend to sync with each other.

## 4. Status wording

ONLINE ● Connected / LOCAL OFFLINE ● Working locally / SYNCING / SYNC ERROR ⚠. The network indicator is driven by verified reachability (a real request succeeded recently), not the browser's "online" flag (`EndpointResolver` → `NetworkStatusService.reportReachability`, tested in `tests/payment_policy.test.ts`).

## 5. Payments, printing, QR

* Cash always available. UPI/UPI_QR only with verified internet (`PaymentPolicy`, enforced in the repository so no screen or sync path can bypass it). Card only with a terminal present. No order is ever PAID by default; settle is idempotent; a second different payment is refused. Tested.
* Printing is local: bills and KOTs go to the printer port with the internet down and never touch the cloud; failures retry, are not duplicated, and survive restart. Tested. Cash drawer opens through the same port (ESC p kick); failures are reported and audited honestly and never block the sale (POS previously logged "kick sent" without sending anything; fixed).
* **QR ordering offline is possible only if the QR page is hosted on the LAN** (served by the Branch Core) and the customer's phone is on the restaurant Wi-Fi. A QR that points at the internet cannot work offline. The LAN-hosted page is NOT built.

## 6. Storage abstraction

Verified in place: repositories over a storage adapter; SQLite (WASM/OPFS) with versioned migrations (`PRAGMA user_version`, database newer than the app is refused); cross-window leader election. Remaining direct `localStorage` (not business rules): sync cursors and small state in `packages/sync` (11 files), `packages/database` (8), and a few UI preferences per app. These are behind the resolver/cursor keys but not yet behind a `StoragePort`; NOT READY for a runtime with no `localStorage` (see gate).

## 7. Per-app checklists

Legend: ✅ verified by tests/code · ⚠ partial · ❌ not done

**POS**
- ✅ Local-first order/payment/KOT transactions, exactly-once sync, offline restart
- ✅ Printing + drawer via ports; retry/queue/restart recovery
- ✅ Routes via Branch Core with cloud fallback; UPI blocked offline
- ⚠ Sync Now button and status badge use existing UI; not re-verified in a browser this phase
- ❌ Windows/Tauri adapters for printer/drawer/identity (only the pre-existing native print bridge exists)
- ❌ Device health/diagnostics screen; Local/Cloud (core URL) setting screen

**Kiosk**
- ✅ Sync/routing/payment policy shared with POS
- ❌ Cached menu images offline (menu data yes, image cache no)
- ❌ UPI gating UI wired to `PaymentPolicy.availability()` on the payment screen
- ❌ Kiosk-mode lock-down (shell concern)

**Captain**
- ✅ Same operational API via the resolver
- ❌ Android storage (WASM/OPFS on a WebView) unverified; native storage adapter not written
- ❌ Discovery on Android is by configured URL/pairing only (no UDP in a WebView)

**KDS**
- ✅ Reads orders from the core with cursor recovery (tested)
- ❌ KDS *app assets* served by the Branch Core so it loads with the internet down (core serves the API only)
- ❌ TV/PWA install and wake-lock behaviour unverified on real devices

**Restaurant Admin**
- ✅ Routes via the resolver; fleet/sync tab exists
- ❌ Backup/restore UI, diagnostics screen, core URL setting screen, update channel UI

**Branch Core**
- ✅ HTTP API parity, roster-based offline device auth, 7-day offline policy, exactly-once, gapless sequence, conflict recording, uplink/downlink with backoff/dead-letter, LAN discovery, restart with pending outbox
- ❌ Runs as a Windows service with auto-start/auto-restart
- ❌ TLS, signed commands verified end to end on a real LAN
- ❌ Scheduled encrypted local backups and restore drill
- ❌ Version report covering App/DB/Menu/Config/Sync-protocol together (core reports schema version only)

## 8. Gate report

| Component | Verdict |
|---|---|
| Branch Core | **NOT READY** |
| POS | **NOT READY** |
| Kiosk | **NOT READY** |
| Captain | **NOT READY** |
| Restaurant Admin | **NOT READY** |
| KDS | **NOT READY** |

The shared architecture (ports, storage over repositories, one protocol, resolver, payment policy, Branch Core, offline behaviour) is proven in development. Each app is NOT READY only because of the gaps below; none of them is a redesign.

### Branch Core: NOT READY
1. **No service wrapper / auto-start.** Why: a core that is not running after a reboot silently degrades the branch to Type B. Implement: a service entry (Windows service via a supervisor such as node-windows/WinSW, or the packaged executable's service mode), restart on failure, start on boot, log rotation.
2. **No encrypted scheduled backup.** Why: the core disk is a single point of failure between uplinks. Implement: periodic SQLite online backup, AES-GCM with a key held in the OS store, retention, a tested restore path.
3. **No TLS / unverified command signing on a real LAN.** Why: device tokens travel in the clear on the branch network. Implement: per-branch self-signed CA issued at pairing, pinned by devices; verify signed commands in an integration test.
4. **Unified version report.** Why: support and safe updates need to see app/DB/menu/config/protocol versions. Implement: `/status` fields plus fleet display; block updates during service (no forced updates mid-service).
5. **Serving app assets (KDS/QR) from the core**, see KDS.

### POS: NOT READY
1. **Native adapters missing** (Tauri/Windows printer, drawer, identity). Why: ports are proven with fakes and the browser adapter only; real hardware is unproven. Implement: adapters passing `portContract`, then a hardware smoke test on a real receipt printer and drawer.
2. **Diagnostics and core-URL settings screens.** Why: staff cannot see or fix routing/health without a developer. Implement: screen bound to `EndpointResolver.mode()`, core `/status`, outbox depth, last sync, versions.
3. **UI not re-verified in a real browser this phase** (only logic tests). Implement: a browser pass on the three connectivity states.

### Kiosk: NOT READY
1. **Image cache for offline menu.** Why: an offline kiosk shows a menu without pictures. Implement: cache images with the menu version (Cache API/OPFS) and evict on menu change.
2. **UPI screen not driven by `PaymentPolicy`.** Why: the rule is enforced at settle time, but the customer would only see a failure after choosing UPI. Implement: hide/disable UPI with the policy's reason.
3. Native adapters as POS.

### Captain: NOT READY
1. **Storage on Android WebView unverified.** Why: OPFS/WASM SQLite availability differs by Android version; the local store is the offline guarantee. Implement: a native SQLite storage adapter or a verified fallback, and run the storage contract tests against it.
2. **Discovery/pairing by URL only.** Implement: pairing code flow against the core (mDNS if the shell provides it).

### KDS: NOT READY
1. **Core does not serve the KDS bundle.** Why: a KDS that must download itself cannot start when the internet is down. Implement: Branch Core static hosting of the built KDS with a service worker cache and cursor recovery on load.
2. **Real TV/browser wake-lock and reconnect behaviour unverified.** Implement: device test.

### Restaurant Admin: NOT READY
1. **Backup/restore, diagnostics, core URL, update-channel screens** missing (see Branch Core 2 and 4).
2. **Local vs cross-branch reporting split not surfaced:** branch reports come from the core; cross-branch only from the cloud. Implement: label the scope on report screens and disable cross-branch reports when offline.

### Cross-cutting NOT READY
* **`StoragePort` for cursors/preferences** (§6). Why: a runtime without `localStorage` would lose sync cursors. Implement: route `packages/sync` and `packages/database` cursor/preference access through one port with a SQLite-backed adapter.
* **Chaos-style multi-device tests against the Branch Core** (several POS/kiosks/branches at once, crash mid-sync). Covered today by the cloud chaos harness and single-core integration tests; a core-level multi-client harness is not written. Why: concurrency bugs appear only under contention. Implement: a harness mirroring `cloud/api/test/sync-chaos.e2e.spec.ts` with N devices on one core and M cores on one cloud.
* **Device activation and entitlement caching per app offline** are enforced by the core roster/7-day policy (tested); per-app UI messaging for each error code is not re-verified.
* **Update strategy** (never force during service) is a design rule only; no update mechanism exists yet, deliberately.

## 9. Development-mode evidence

| Scenario | Evidence |
|---|---|
| Internet ON / OFF / restored | `offline_routing_integration`, `endpoint_resolver`, `payment_policy` |
| Cloud/server unavailable, Branch Core unavailable | `offline_routing_integration` (core down → cloud; both down → local queue) |
| App restart | `offline_routing_integration`, `platform_ports` (print queue) |
| Duplicate / failed / delayed sync | `branch_core`, cloud `sync-chaos`, `branch-core-uplink` |
| Crash during sync | cloud chaos harness; outbox never advances cursor past an unapplied item |
| Multiple devices/branches | cloud chaos harness, branch roster e2e (branch isolation); **core-level multi-client harness not yet written** |
| Hardware ports | `platform_ports` (fakes + contract for default adapters) |

## 10. Next steps, in order

1. Core service wrapper, encrypted backup, TLS/pairing.
2. Serve KDS/QR from the core.
3. `StoragePort` for cursors/preferences.
4. Core-level multi-client chaos harness.
5. Diagnostics/settings screens.
6. Only then choose shells (Tauri/Android) and write native adapters against `portContract`.
