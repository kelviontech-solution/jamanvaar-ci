# JAMANVAAR — Bug List 3 (kelviontech-prod-2 deployment verification)

Found during and after standing up the full 8-app platform on `kelviontech-prod-2`
(Oracle, dedicated box — see `ORACLE_KELVIONTECH_PROD_2_SETUP.md`), 2026-10-04/05.
IDs are `B3-nnn` so they never collide with `BUG_LIST.md` (BUG-001 to 143),
`ROLE_BASED_AUDIT_BUGS.md` (BUG-144 to 163), or `BUG_LIST_2.md` (B2-nnn).

## Environment and method

- **Target:** `kelviontech-prod-2`, a fresh independent stack (own db + backend + all
  8 frontend apps), reached at `http://130.210.16.150`. Seeded via `make seed`
  (`SEED_DEMO_DATA=true`): demo restaurant `11111111-1111-4111-8111-111111111111`,
  Super Admin `kelviontech@gmail.com`, demo owner `owner@demo.jamanvaar.app`.
- **No browser/computer-use tool was available in this session.** Testing was done by
  driving the real REST API directly (the same calls each frontend's `cloudClient.ts`/
  `api.ts` makes) via `curl`, checking that each app's actual built JS/CSS assets load
  correctly under its routed subpath, and reading backend/proxy container logs for real
  errors. **This verifies backend logic, routing, and asset delivery — it does not verify
  visual rendering or click-through UX.** Treat anything marked "needs a visual pass" as
  genuinely unverified, not passing.
- **Evidence labels:** 🔵 confirmed live (ran it, saw the real response) · 🟣 confirmed by
  reading the source · ⚪ blocked, not yet testable.
- **Severity:** 🔴 breaks a real workflow · 🟡 wrong/misleading but workable · 🟢 cosmetic
  or tooling-only.

---

## Fixed during this pass

### B3-001 🔴 — `super-admin-web` broken when served under a path prefix — **FIXED**
🔵 Confirmed live: `/admin/assets/index-*.js` and `.css` 404'd. Root cause 🔵 confirmed by
reading `cloud/super-admin-web/vite.config.ts` (no `base` set, defaulted to Vite's
absolute `/`) — every other app in the repo already sets `base: './'` for exactly this
reason, super-admin-web was the one left on the default because it's always owned the
domain root in production until this deployment put it under `/admin/`.

A second, deeper issue underneath: `<BrowserRouter>` (`src/app/App.tsx`) had no
`basename`, so even with assets fixed, client-side navigation would still push absolute
paths and walk the browser's URL out of `/admin/` on the first click — 🟣 confirmed by
reading the code, not yet re-verified live since it needs real browser navigation to
observe (see "Needs a visual pass" below).

**Fix:** `base: './'` added to `vite.config.ts`; new `VITE_ROUTER_BASENAME` build arg
(empty in production, `/admin` here) wired through the Dockerfile,
`docker-compose.yml`'s new `SUPER_ADMIN_BASE_PATH` env var, and passed to
`BrowserRouter`'s `basename`. Asset loading re-verified live after the fix (`200` on
both JS and CSS, and `/admin/login` serves correctly via the SPA fallback). Commit
`3de469d`.

### B3-002 🟡 — `generate-production-env.js` silently drops its own output-path argument — **FIXED**
🔵 Confirmed live, three times in a row: ran
`node cloud/api/scripts/generate-production-env.js /secrets/jamanvaar-production.env`
and it wrote to the *default* `$HOME/jamanvaar-production.env` instead, with no error.
Root cause 🟣 confirmed by reading the code:
```js
const positional = args.filter((a, i) => !a.startsWith('--') && i !== kidIdx + 1);
```
`kidIdx` is `-1` when `--kid` isn't passed, so `kidIdx + 1` is `0` — the filter
excluded the positional argument at index 0, i.e. the output path itself, whenever
`--kid` was omitted (the common case: `node generate-production-env.js <path>` with no
other args). **Fix:** `i !== kidIdx + 1` → `(kidIdx < 0 || i !== kidIdx + 1)`. Commit
`d2aa90e`.

### B3-003 🟢 — same script's output owned by `root`, unreadable by the deploying user — **FIXED**
🔵 Confirmed live: ran the script via a throwaway `node:24-alpine` container without
`--user`, which defaults to root; the resulting file on the host was `root`-owned 600,
and the non-root deploying user got `Permission denied` reading it back. **Fix:**
`docker run --user "$(id -u):$(id -g)" ...` in the deploy script used for this box (not
a repo change — this was a one-off invocation pattern, not a bug in the script itself).

---

## Confirmed correct (not bugs — logged so the next pass doesn't re-investigate)

- **QR ordering shows `qrEntitled: false` / `NOT_INCLUDED` for the demo restaurant.** 🔵
  Confirmed live via `GET /api/v1/tenant/qr-ordering/entitlement`. This is correct
  plan-based gating (QR ordering is a separate add-on from the seeded demo plan), not a
  bug — no `QrCode` rows exist yet because of this, also expected.
- **`/api/v1/branches` and `/api/v1/activation-keys/*` reject an owner token
  ("Invalid or expired token").** 🟣 Confirmed by reading the controllers: both are
  `@UseGuards(PlatformAuthGuard)` (Super-Admin-only) by design. The owner-scoped
  equivalent for branches is `/api/v1/tenant/branches`, 🔵 confirmed working. Activation
  keys have no owner-scoped equivalent — Super Admin (KelvionTech staff) provisions
  device activation keys for a restaurant, not the restaurant itself.
- **Every terminal app (POS, POS Admin, Captain, KDS, Kiosk Admin) requires a
  Super-Admin-issued activation key on first device connect.** 🟣 Confirmed by reading
  each app's `cloudClient.ts` and the activation-keys module — this is the intended
  "Welcome Kit" flow, not a gap in this deployment.
- **Owner login (`POST /api/v1/tenant-auth/login-owner`) requires `restaurantId` or
  `restaurantCode` in the body**, correctly rejecting a request with neither (`400`,
  clear validation message). 🔵 Confirmed live.
- **Super Admin login correctly requires OTP** (`POST /api/v1/platform-auth/login` →
  `OTP_REQUIRED`, a masked email, and a short-lived `otpToken`). 🔵 Confirmed live.
- **All 8 frontend apps' real built JS/CSS load correctly** under their routed
  subpaths (`/`, `/kiosk-admin/`, `/kiosk/`, `/pos/`, `/pos-admin/`, `/captain/`,
  `/kds/`, and `/admin/` after B3-001's fix) — 🔵 confirmed live for every one, not just
  the HTML shell.
- **Backend boots clean**: all migrations applied via `entrypoint.sh`'s
  `prisma migrate deploy`, every route mapped, no exceptions in ~40 minutes of logs
  across normal operation plus this testing pass. 🔵 Confirmed live.

---

## Cross-app flow testing (deep pass, after Super Admin access was obtained)

Super Admin login completed (OTP verified), which unblocked activation keys for all 6
device-authenticated apps. Every flow below was driven through the real REST API with
a real activated device token per app (POS, POS Admin, KDS, Captain, Kiosk, Kiosk
Admin) — 🔵 confirmed live end-to-end, not inferred from one side only. **Payments were
deliberately kept inert throughout**: `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` were
cleared from `.env` and the backend restarted before any of this, per explicit
instruction not to risk real money.

- **Order lifecycle, full round trip**: POS creates a DINE_IN order (cash, ₹300) →
  visible to both **KDS** and **POS Admin** immediately (`source: "POS"`, correct
  items/totals) → **KDS** marks it `PREPARING` → POS sees the update → **POS Admin**
  cancels it → both POS and KDS see `CANCELLED`. Every hop confirmed by pulling from
  the *other* app's own device token, not just re-reading the same one that wrote it.
- **Kiosk order**: a self-order Kiosk device placed an order independently of POS;
  KDS correctly received it tagged `source: "KIOSK"` alongside the POS one — confirms
  order-sync is genuinely shared across every terminal type, not POS-specific.
- **Online payment safety**: a Kiosk device's `POST /api/v1/payments/orders` call
  correctly refused with `403 PAYMENTS_NOT_ACTIVE` — online payments were never
  reachable during this pass regardless of the cleared keys, confirming no real-money
  path was exercised.
- **Dining tables**: Captain created a table (`DINING_TABLE` entity sync) → visible to
  POS → Captain updated its status to `OCCUPIED` → POS saw the update. A malformed
  first attempt (missing `tableNumber`) was correctly rejected with a clear per-entity
  validation error rather than silently accepted or crashing.
- **Customers**: POS created a customer record → visible to POS Admin.
- **Staff**: POS Admin created a staff user (name/role/PIN hash) → visible to POS —
  confirms the cross-device staff-PIN sync this entity type exists specifically to fix
  (see the code's own BUG-019/034/035 comment: a PIN used to only work on the device
  that created it).
- **Cash drawer shift**: POS opened a shift with an opening cash float → visible to
  POS Admin (feeds its Shift & Cash Drawer Ledger).
- **Order numbering**: `POST /api/v1/sync/number-leases` issued a real sequential
  order number (`MAIN-20261005-1` shape) — the shared counter POS/KDS rely on to avoid
  two devices racing to the same order number.
- **Staff manager-PIN gate**: an intentionally wrong PIN was correctly refused
  (`403 PIN_INVALID`), not silently accepted.
- **Device fleet view**: POS Admin's kiosk fleet endpoint correctly listed the
  activated Kiosk device as online, with its real last-seen time and branch.
- **Realtime stream**: `GET /api/v1/realtime/stream` (SSE) connects and immediately
  sends a `ready` event carrying the correct device id — the live-update transport
  every app's UI would subscribe to is confirmed reachable and functioning.
- **Activation key full lifecycle** (Super Admin): generate → list → revoke
  (`ACTIVE`→`REVOKED`) → reactivate (`REVOKED`→`ACTIVE`) → delete → re-fetch
  confirms `404`. All six steps correct.

**No bugs found in any of the above** — every cross-app flow tested propagated
correctly, every validation rejection was clear and correct, and the payment safety
boundary held.

## Test footprint left on the demo restaurant

Everything below is test data created during this pass, on restaurant
`11111111-1111-4111-8111-111111111111` ("JAMANVAAR — Demo Restaurant") — nothing
outside it was touched:

- 6 activated devices: POS, POS Admin, KDS, Kiosk Admin, Kiosk, Captain (all labelled
  "Test ...")
- 2 orders (`b3-test-order-*`, ended `CANCELLED`; `b3-kiosk-order-*`, left `NEW`)
- 1 customer (`cust-b3-1`), 1 dining table (`table-b3-1`, left `OCCUPIED`), 1 staff
  user (`staff-b3-1`), 1 open shift (`shift-b3-1`, never closed)
- Safe to delete/reset before any real use of this restaurant, or leave as a known
  "QA fixture" the way `BUG_LIST_2.md`'s "QA Bot Diner" was kept — your call.

## Blocked — not yet testable even with Super Admin access

- **QR Guest ordering end-to-end** — the demo restaurant's current plan doesn't
  include QR ordering (`NOT_INCLUDED`); would need a plan change or an explicit
  entitlement override, then creating a real `QrCode` row for a table.
- **Super Admin console pages beyond login+activation-keys+devices** — restaurant
  onboarding, plans/subscriptions, billing, reports, etc. weren't individually
  exercised; the login/OTP/RBAC layer they all sit behind is confirmed solid, but
  that doesn't guarantee every page's own logic is bug-free.
- **WhatsApp ordering connector** — by design not deployed on this isolated Oracle
  stack (the connector lives separately on the AWS box at `whatsapp.kelviontech.in`);
  `WHATSAPP_CONNECTOR_BASE_URL`/`JAMANVAAR_SERVICE_SECRET` are deliberately left unset
  here, so this platform's own `whatsapp-channel` module is live and tested (per
  existing e2e suites) but has nothing to actually connect to from this box.

## Needs a visual pass (can't verify without a real browser)

- `super-admin-web`'s `BrowserRouter basename` fix (B3-001) — confirmed server-side
  (assets load, deep links return 200 via SPA fallback), but whether in-app navigation
  actually stays within `/admin/` after a click needs an actual browser, not curl.
- Every app's actual rendering, layout, and interactive behavior — this pass verified
  that the right bytes are served and the right API calls succeed, not that the UI
  looks or behaves correctly on screen.
