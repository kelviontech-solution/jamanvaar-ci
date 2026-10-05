# Kiosk Admin → Restaurant Admin Merge + Self-Service Online Payments — Design

## Problem

JAMANVAAR currently ships Kiosk Admin (`apps/kiosk-system/kiosk-admin`) as a standalone app, separate from Restaurant Admin / pos-admin (`apps/restaurant-system/pos-admin`). Both manage the same underlying local-first data (Menu, Staff, Tables) through the same shared packages (`@jamanvaar/database` repositories), but as two separate UIs with two separate "Connect this Terminal" activation flows (same restaurant Owner Password, different device-type activation key: `KIOSK_ADMIN` vs `POS_ADMIN`). A restaurant running both POS and Kiosk needs two admin logins for overlapping concerns — real duplication, not two genuinely different products.

Separately, the restaurant-facing "enable online (UPI/QR) payments" flow is incomplete end to end: the backend (`KioskPaymentConnectionController`, `PaymentConnectionsService`) and the Super Admin side (`PaymentConnectionsListPage`, `PayoutsListPage`) are fully built and already live, and the client functions to call them (`getPaymentConnection`/`submitPaymentConnection` in kiosk-admin's `cloudClient.ts`) exist — but **no UI anywhere renders a bank-details submission form**. A restaurant has no way to self-serve enabling online payments; the kiosk-user payment screen can only ever show the dead-end "Being set up" badge.

## Goals

- One admin app per restaurant, regardless of which terminals they run (POS-only, Kiosk-only, or both) — confirmed direction from prior discussion in this session.
- Which sections of that one app a restaurant sees stays entitlement-driven (already-built `Feature`/`AppCode` system), not hardcoded per app.
- A restaurant can self-serve enabling online payments from inside Restaurant Admin: submit bank details, see live status, without needing a developer or a support ticket. This ships first, ahead of the full merge.
- Zero feature loss from kiosk-admin — every capability it has today (Kiosk fleet management, receipts/e-bill, hardware diagnostics, kiosk language settings, the existing online-payments dashboard) must exist somewhere in the merged Restaurant Admin after this work.
- Easy for a restaurant owner to operate — dedup overlapping screens rather than stacking two of everything; put the new payments self-service where an owner would already look (the existing "Payments & Split" tab), not a new, separate place.
- No risk to the live production restaurant currently running kiosk-admin standalone on the Oracle server — build-then-verify-then-cutover, not a big-bang rewrite.

## Non-goals / explicitly out of scope

- Diagnosing the separately-reported "API is slow on live server" / "crashes on refresh" complaint. No production logs or access are available for that; it needs either specific reproduction detail from the user or a dedicated investigation, tracked separately from this work.
- Any change to the manual-payout mechanics themselves (EOD batch, bank-verification gate, Super Admin mark-paid/hold/release) — those were built correctly earlier this session and are reused as-is.
- Any new Super Admin screen. Both pieces below are managed with tooling that already exists and ships unchanged.

## Decisions already made (confirmed earlier in this session)

1. Merge direction: Kiosk Admin becomes a tab/section inside Restaurant Admin, not a second standalone app.
2. Target shape: **one unified, entitlement-aware admin app** — not "one app for full-stack restaurants, a separate kiosk-only app for kiosk-only restaurants." A kiosk-only restaurant still runs Restaurant Admin; its entitlements just show fewer tabs.
3. Rollout: build the merged functionality inside pos-admin first, verify it, then cut production restaurants over — not a direct in-place cutover.
4. `KIOSK_ADMIN` as a *device/activation-key type* is retired entirely once the cutover completes. (`KIOSK_ADMIN` as an *entitlement/AppCode* — the thing Super Admin toggles per restaurant to show/hide the Kiosk tab — stays; only the separate standalone-app activation key goes away.)
5. Sequencing for this round of work: ship the online-payments self-service piece first, then the kiosk-admin merge.

## How Super Admin manages both pieces (no new tooling required)

**Which tabs a restaurant sees (entitlements):** Super Admin already grants/revokes `KIOSK_ADMIN` (and every other `AppCode`) per restaurant from the Restaurant Detail page (`cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx`), reading the live Feature Catalog (`GET /api/v1/application-entitlements/catalog`). Today that toggle decides whether the *standalone* Kiosk Admin app's activation key is accepted. After this work, the exact same toggle decides whether the Kiosk tab appears inside the merged Restaurant Admin. Super Admin's workflow does not change.

**Online payments / payouts:** Super Admin already has full lifecycle control via two existing, live pages:
- `PaymentConnectionsListPage.tsx` — Approve / Suspend / Reactivate / Disconnect a restaurant's payment connection, and Verify / Reject their submitted bank details (`bankVerificationStatus`), all step-up-password-protected.
- `PayoutsListPage.tsx` — EOD payout batches, mark-paid with UTR, hold/release.

"Online payments should be default on" means the *entry point* in Restaurant Admin is visible to every restaurant out of the box (no entitlement gate on the self-service form itself — any restaurant can open the tab and submit their bank details), not that money starts moving without Super Admin's existing Verify step. The enforcement boundary (nothing pays out until Super Admin verifies bank details; nothing goes live until the connection is `ACTIVE`) is unchanged.

## Phase 1 — Self-service Online Payments in Restaurant Admin (ship first)

### What exists today (reused as-is, no backend changes)

- `GET/POST /api/v1/tenant/payment-connection` (`KioskPaymentConnectionController`) — Owner/Manager-only, already role-gated. `GET` returns the restaurant's current connection (masked bank fields); `POST` submits/updates it (`PaymentConnectionsService.submit`).
- `PaymentConnection.status`: `PENDING_VERIFICATION` → `ACTIVE` / `SUSPENDED`; `bankVerificationStatus`: `NOT_ADDED` → `PENDING` → `VERIFIED` / `REJECTED`.
- `OnlinePaymentsPanel.tsx` (currently in kiosk-admin) — the day-by-day payments/payouts/refunds dashboard (Gross Collection → Fee → Net Payable → Pending/Paid, built earlier this session). This already calls `getPayoutSummary`/`getPayoutHistory`/`getRecentPayments`/`refundPayment`/`markPaymentHandled` and has no dependency on anything kiosk-admin-specific.
- `getPaymentConnection` / `submitPaymentConnection` / `PaymentConnectionFields` / `PaymentConnectionStatus` already defined in kiosk-admin's `cloud/cloudClient.ts` (lines ~641-701) but never called from any component — dead client code today.

### What's new

**1. `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts`** — port the existing `PaymentConnectionFields`/`PaymentConnectionStatus` types and `getPaymentConnection`/`submitPaymentConnection` functions verbatim (same endpoint, same shapes — this is a straight copy, not a redesign).

**2. `apps/restaurant-system/pos-admin/src/components/payments/PaymentConnectionPanel.tsx`** (new) — the self-service form:
- On mount, calls `getPaymentConnection()`. Renders one of four states:
  - Not connected (`status` absent / `bankVerificationStatus === 'NOT_ADDED'`): a form (bank account number, IFSC, account holder name, PAN, UPI VPA — same fields `PaymentConnectionFields` already defines) with a "Submit for verification" button, Owner/Manager only (mirrors the controller's own role check — a STAFF-role session should see a read-only "ask your owner/manager" message, not the form, since the component can't rely on the backend 403 alone for good UX).
  - `PENDING_VERIFICATION` / `bankVerificationStatus === 'PENDING'`: shows masked submitted details plus "Verification in progress — Jamanvaar will review your bank details shortly," and an "Edit and resubmit" action.
  - `bankVerificationStatus === 'REJECTED'`: shows the rejection state plainly and re-opens the form pre-filled for correction.
  - `ACTIVE`: shows "Online payments are live" plus the masked settlement details, with an "Update bank details" action that re-opens the form (re-submitting moves status back to `PENDING_VERIFICATION`, matching the backend's existing behavior — confirm this in `PaymentConnectionsService.submit` while implementing, no new backend logic implied).
- No new entitlement gate — every restaurant can see and use this panel regardless of which `AppCode`s they have, per the "default on" requirement.

**3. Relocate `OnlinePaymentsPanel.tsx`** from `apps/kiosk-system/kiosk-admin/src/components/` to `apps/restaurant-system/pos-admin/src/components/payments/OnlinePaymentsPanel.tsx`, unchanged (it has no kiosk-admin-specific dependency — confirmed by reading it: imports only `@jamanvaar/ui`, `@jamanvaar/utils`, and its own `cloudClient`).

**4. `apps/restaurant-system/pos-admin/src/components/payments/PaymentsSplitModule.tsx`** (existing, rendered today under the `PAYMENTS` tab) — add `<PaymentConnectionPanel />` above the existing split-ledger content, and render `<OnlinePaymentsPanel />` below it when a connection exists in `ACTIVE` or `PENDING_VERIFICATION` state. This keeps everything payments-related — "connect my bank," "see what's been collected," "see my payout history" — in the one tab an owner already checks, rather than scattering it across tabs.

**5. kiosk-admin keeps its own copy of `OnlinePaymentsPanel.tsx` and the dead `getPaymentConnection`/`submitPaymentConnection` client code untouched during Phase 1** — Phase 2 deletes kiosk-admin's copies when kiosk-admin itself is retired. Shipping Phase 1 does not require touching kiosk-admin at all, which is why it can go out first with no coupled risk.

### Testing (Phase 1)

- No new backend code, so no new backend tests — the existing `payment-connections.e2e.spec.ts` suite (extended earlier this session with the commission-floor and partial-refund cases) already covers the endpoint this UI calls.
- Frontend: this repo's pos-admin has no component test infra (confirmed convention from prior phases — verified by running the app). Verify manually: Owner session submits bank details → status shows `PENDING_VERIFICATION` → Super Admin's existing Verify button on `PaymentConnectionsListPage` flips it to `ACTIVE` → panel reflects `ACTIVE` on next load. Also verify a STAFF-role session sees the read-only message, not the form.

## Phase 2 — Kiosk Admin → Restaurant Admin merge

### Dedupe vs. relocate vs. new, by kiosk-admin tab

kiosk-admin's top-level tabs today: `DASHBOARD, MENU, COMBOS, TABLES, ORDERS_KDS, KIOSKS, COUPONS, HARDWARE, REPORTS, FEEDBACK, STAFF, RECEIPTS, SYNC, AUDIT, LICENSE, SETTINGS`.

| kiosk-admin tab | Disposition | Notes |
|---|---|---|
| `MENU` | **Dedupe, after porting 2 missing capabilities** | pos-admin's `ItemModal.tsx` is missing `isKioskEnabled` and the translation-fields-plus-virtual-keyboard UI kiosk-admin's Add Dish modal has. Port those two capabilities into pos-admin's `ItemModal.tsx` first (reusing `KIOSK_LANGUAGE_LABELS`, `KioskDisplaySettingsRepository.getSettings().enabledLanguages`, and `VirtualKeyboard` exactly as kiosk-admin's `App.tsx` already does), verify parity, then delete kiosk-admin's Menu screen outright. |
| `TABLES` | **Delete outright** | kiosk-admin's `TableModal.tsx` was itself ported from pos-admin's `TableModal.tsx` earlier this session — pos-admin's is already the superset. Pure duplication. |
| `STAFF` | **Delete outright** | Same reasoning — kiosk-admin's `StaffModal.tsx` was ported from pos-admin's and deliberately dropped the hourly-pay/schedule field pos-admin has. pos-admin's is already the superset. |
| `ORDERS_KDS` | **Delete outright, confirm tagging** | Kiosk orders already flow into the same shared local-first `orders` data pos-admin's `ORDERS`/`LIVE_KDS` tabs read (confirmed: single `@jamanvaar/database` instance, LAN-synced). Before deleting, confirm pos-admin's Orders/KDS views visually distinguish a kiosk-sourced order from a POS/Captain one (e.g., an existing `order.source` or channel field) — if that's already shown, this is pure duplication; if not, add a one-line "via Kiosk" badge as part of this task, not a new feature. |
| `REPORTS` | **Dedupe** | pos-admin's `ReportsDashboard` already covers restaurant-wide sales reporting; confirm kiosk-specific figures kiosk-admin's Reports tab shows (e.g., kiosk-channel sales split) are either already present or trivially addable as a filter, not a parallel reports system. |
| `COUPONS` | **Reconcile** | Verify whether pos-admin already has a coupon/offer management screen reachable from its own nav (not confirmed during this design pass). If yes: dedupe. If this is kiosk-specific (customer-facing self-checkout coupons only), relocate it as a section under pos-admin's equivalent promos area rather than inventing a new top-level tab. |
| `AUDIT`, `LICENSE` | **Dedupe** | pos-admin already has its own `AUDIT` and `LICENSE` tabs covering the whole restaurant; kiosk-admin's are the same underlying data scoped differently. Delete kiosk-admin's. |
| `SYNC` | **Dedupe, relocate kiosk-specific content only** | pos-admin's `SYNC` tab already covers the shared LAN sync bridge. Anything kiosk-admin's Sync tab shows that's specific to kiosk terminals (e.g., which kiosk devices are paired) folds into the `KIOSKS` relocation below rather than staying a separate sync concept. |
| `KIOSKS` | **Relocate — new content in Restaurant Admin, gated by the `KIOSK_ADMIN` entitlement** | This is the one genuinely new capability for pos-admin: fleet management for physical Kiosk terminal devices (which kiosks are activated, their status, revoking a kiosk's activation). pos-admin has no equivalent today because it doesn't manage its own device fleet in-app. Becomes a new `KIOSKS` tab in pos-admin, visible only when the restaurant's `KIOSK_ADMIN` (or a renamed equivalent) entitlement is on. |
| `HARDWARE` | **Relocate kiosk-specific diagnostics; dedupe the rest** | pos-admin's existing `HARDWARE` tab (`PrintersDevicesModule`) covers printers. kiosk-admin's `HARDWARE` tab's kiosk-terminal-specific diagnostics (screen/scanner/payment-terminal health for the physical kiosk units) relocate as a section under the new `KIOSKS` tab, not under `HARDWARE` — they're about kiosk devices, not shared printer hardware. |
| `RECEIPTS` | **Relocate as a section under pos-admin's `SETTINGS`** | Kiosk-specific receipt/e-bill template settings; pos-admin's `SETTINGS` tab (`TerminalDisplaySettings` etc.) is the natural home, gated by the same `KIOSK_ADMIN` entitlement. |
| `FEEDBACK` | **Relocate as a new section, entitlement-gated** | Customer feedback collected through the kiosk has no pos-admin equivalent; relocate as its own small section (under `REPORTS` or `KIOSKS` — decide the exact placement during plan-writing by checking how much content it actually is) gated by `KIOSK_ADMIN`. |
| `COMBOS` | **Reconcile** | Verify whether pos-admin's Menu area already handles combo deals (likely yes, given `@jamanvaar/types`' `ComboDeal` entity is shared). If yes: dedupe. If kiosk-admin's Combos tab has kiosk-specific combo behavior, fold it into the Menu port in the `MENU` row above. |
| `SETTINGS` (kiosk language settings) | **Relocate as a section under pos-admin's `SETTINGS`** | The `KIOSK_LANGUAGE_LABELS` checkbox grid, enabled-languages list, and default-language dropdown (built earlier this session) move into pos-admin's `SETTINGS` tab, gated by `KIOSK_ADMIN`. |
| `DASHBOARD` | **Delete outright** | kiosk-admin's dashboard is a restaurant-wide summary scoped to kiosk data; pos-admin's own `DASHBOARD` tab is the superset once kiosk figures are folded in as a filter/section (same reasoning as `REPORTS`). |

The rows marked "Reconcile" (`COUPONS`, `COMBOS`) need one targeted read of pos-admin's existing Menu/Promos code during plan-writing to confirm which of "dedupe" or "relocate" applies — this is a bounded, mechanical check (does the screen already exist, yes/no), not an open design question, so it doesn't block writing the implementation plan; it's simply where the plan's first task starts.

### KIOSK_ADMIN activation key retirement

- Today, connecting the kiosk-admin app requires: restaurant Owner Password (step 1, shared) + a `KIOSK_ADMIN`-typed Activation Key (step 2, device-type-specific).
- After the cutover, a device that wants kiosk-fleet-management access authenticates into Restaurant Admin using the existing `POS_ADMIN` activation key (same as any other Restaurant Admin device) — the `KIOSK_ADMIN` tab's visibility is then controlled purely by the restaurant's `KIOSK_ADMIN` entitlement, not by which key unlocked the device.
- The `KIOSK_ADMIN` device/activation-key *type* is removed from wherever device types are enumerated (`TenantAuthService`/activation-key issuance, confirmed location to re-check during plan-writing) once no production restaurant still depends on it (see rollout below).
- The `KIOSK_ADMIN` *entitlement/AppCode* is unaffected by this — it continues to exist and continues to be what Super Admin toggles.

### Rollout (build → verify → cutover)

1. Build every "Dedupe"/"Relocate"/"New" item above inside pos-admin, entitlement-gated where noted, while kiosk-admin keeps running unmodified in production.
2. Verify in a non-production restaurant (or the existing sandbox tooling — `cloud/super-admin-web/src/pages/Sandboxes`) that a restaurant with `KIOSK_ADMIN` on can do everything in the merged Restaurant Admin that kiosk-admin standalone currently does.
3. Only once verified: migrate the one live Oracle-hosted production restaurant currently running kiosk-admin standalone — issue it a `POS_ADMIN` activation key for the device that was running kiosk-admin (or confirm it already has one, since it likely also runs POS), confirm its `KIOSK_ADMIN` entitlement is on, confirm the merged app shows everything correctly, then stop pointing that device at the kiosk-admin build.
4. Only after that restaurant is confirmed working on the merged app: delete the `apps/kiosk-system/kiosk-admin` package outright and retire the `KIOSK_ADMIN` activation-key type from the backend.

### Testing (Phase 2)

- Every ported/relocated screen keeps whatever test coverage it already has at its new location (e.g., the transliteration/i18n tests, the table-bulk/staff tests already in `tests/` are package-level and don't move).
- New: an entitlement-gating test confirming the `KIOSKS` tab (and the other newly-gated `SETTINGS`/`HARDWARE` sections) is hidden when a restaurant's `KIOSK_ADMIN` entitlement is off and visible when it's on — this is the one genuinely new behavior Phase 2 introduces (pos-admin's nav has never been entitlement-gated before).
- Full regression (`npx vitest run` at the repo root, matching this session's established workflow) must stay at the same pass count throughout, re-run after each dedupe/delete step, not just once at the end.

## Risks

- **Divergence risk in "Dedupe" rows**: if kiosk-admin's Menu/Staff/Table/Reports/Audit/License screens picked up any feature pos-admin's equivalent lacks (beyond the two already-identified Menu gaps), deleting kiosk-admin's copy loses it silently. Mitigation: before deleting each "Dedupe" row, diff the two components' feature set explicitly (not just "they look similar"), the same way the Menu gap was found by direct comparison earlier this session.
- **Entitlement-gating is new for pos-admin's nav.** Getting the gate wrong (showing `KIOSKS` to a restaurant without the entitlement, or hiding it from one that has it) is a direct regression of the one thing Super Admin controls. Needs its own explicit test, not just manual spot-checking.
- **Live production restaurant migration (step 3 of rollout)** is the one step with real operational risk — it's a live restaurant's admin access. Do it at a low-traffic time, confirm Super Admin's entitlement UI and the new activation key work before decommissioning the old path, and do not delete the kiosk-admin package (step 4) until that restaurant has run on the merged app for a reasonable burn-in period.

## Rollback

- Phase 1 is purely additive UI calling an already-live, already-tested endpoint — rollback is reverting the pos-admin commit; no data migration involved.
- Phase 2's rollout is explicitly staged so rollback before step 4 is just re-pointing the one migrated device back at the still-existing kiosk-admin build. After step 4 (package deleted), rollback would mean restoring the deleted package from git history — acceptable, since step 4 only happens after a confirmed burn-in period.
