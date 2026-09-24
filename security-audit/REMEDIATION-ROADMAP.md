# Remediation Roadmap

**Updated 2026-09-23: Phases 0–3 are done and verified, Phase 4 (Low) is 5 of 7 done** (root `vitest` suite — 887 tests — and `cloud/api`'s Postgres-backed e2e suite — 442 tests — both green after every change below). See [`FINDINGS.md`](FINDINGS.md)'s "Remediation status" table for the authoritative per-finding status; this file's checkboxes track the same information at the file/task level. Each item names the exact file(s) changed; full context is in `FINDINGS.md` and the linked `_work/*.md` report.

## Phase 0 — Do today, independent of everything else

- [x] `cloud/api/prisma/_tmp_user.ts` and `_tmp_rel.ts` deleted from the working tree; `AUDIT_BRIEF.md`'s credentials section redacted. **Still open (process, not code):** whether `live-verify@jamanvaar.local` was ever live anywhere is unconfirmed from source alone — rotate it wherever it might exist, and purge it from git history (a working-tree delete alone leaves it in history).
- [ ] Add a CI secret-scanning step (gitleaks or trufflehog) so this class of leak is caught before the next merge, not after. Not done this pass.

## Phase 1 — The one fix that closes ~⅓ of the register

- [x] **CRIT-01** — `EntitySyncController`/`EntitySyncService` now enforce `ENTITY_WRITE_ALLOWED_DEVICE_TYPES` (only `POS`/`POS_ADMIN` may write `STAFF_USER`) via `assertDeviceMayWrite()`.
- [x] e2e regression added to `cloud/api/test/entity-sync.e2e.spec.ts` (denied device type → 403; `POS_ADMIN` → succeeds).

## Phase 2 — Remaining Critical + all High (all narrow, mechanical fixes)

- [x] **CRIT-02** — `tenant-billing.controller.ts` requires `OWNER`; `invoices.service.ts` rejects non-`ISSUED/PAST_DUE` invoices, caps payment at remaining balance, and never auto-reactivates a `SUSPENDED` subscription from a tenant-initiated call. 5 e2e tests in `tenant-billing.e2e.spec.ts`.
- [x] **CRIT-03** — `standalone_local_core.cjs`, `sea-config.json`, `sea-prep.blob`, and the tracked `.exe` deleted; `build_release.cjs` and `build_production_release.ps1` repointed at `local_service.cjs`; warning comments added at every remaining binary-copy site.
- [x] **HIGH-01** — `support.service.ts` uses explicit `select` allow-lists (`SUPPORT_USER_SELECT`/`SUPPORT_DEVICE_SELECT`); reset-OTP hash now HMAC'd via `hashLowEntropySecret`.
- [x] **HIGH-02** — Activation-key codes redacted to `codeLast4` via a shared `redactActivationKeyCode` helper everywhere except the one-time generation response; the `getById` redaction gap (which previously bypassed this entirely) is closed.
- [x] **HIGH-03** — Backup download routes require `ops:write` (`assertCanDownloadBackups`); every download now calls `audit.log(...)`.
- [x] **HIGH-04** — `tenant-auth.service.ts`'s `login()` now rejects `POS_ADMIN`/`KIOSK_ADMIN` logins below MANAGER server-side regardless of client-sent `adminOnly`; `pos-admin/src/cloud/cloudClient.ts` also sends `adminOnly: true`.
- [x] **HIGH-05** — `order-sync.service.ts`'s `catchUp` now filters by `branchId`; a push regressing `paymentStatus` on a terminal-state order from a non-POS-family device is rejected into `SyncConflict`.

## Phase 3 — Medium register

- [x] MED-01 — PAN/GST/CIN/UIDAI masked in `payment-connections.service.ts`'s `toOwnView()`; resubmission merges omitted optional fields (`dto.x ?? existing?.x ?? null`) instead of nulling them.
- [x] MED-02 — Atomic `updateMany` compare-and-set claim in both `activation-keys.service.ts` and `tenant-auth.service.ts`'s redemption paths; the latter also gained a `maxDevices` check it never had.
- [x] MED-03 — `platform-users.service.ts`'s `resendInvite` now calls `assertActorIsOwner` when the target is a pending `PLATFORM_OWNER`.
- [x] MED-04 — `application.dto.ts`'s `downloadUrl` requires `https://`; `PlatformNoticeBanner.tsx` and `ApplicationsPage.tsx` both gained an `isSafeHttpsUrl()` render guard.
- [x] MED-05 — `packages/database/src/pin.ts` rewritten: 25,000-round numeric mixing stretch (`pinv2:`), with `pinv1:` still verifiable for backward compatibility.
- [x] MED-06 (scoped) — Manager approval now required in the POS terminal to: open the Menu Manager (`PosCatalog.tsx`), record a Cash Out (`PosCashDrawerModal.tsx`), and force-close the business day (`PosCloseDayModal.tsx`). **Not a full permission-system rewrite** — see `FINDINGS.md`'s note on residual scope.
- [x] MED-07 — `StaffRepository.verifyPin` (the one choke point every login surface routes through) locks out after 5 consecutive wrong PINs for 30s; UI messaging added to `ManagerOverrideModal.tsx` and Kiosk's staff-discount override.
- [x] MED-08 — Manager-approval threshold now keys off `computeDiscountImpactRupees` (actual aggregate rupee impact across every affected item), not the raw per-application parameter.
- [x] MED-09 — `local_service.cjs`'s `/devices/pair` locks out after 5 wrong PINs for 60s; verified live against a running instance.
- [x] MED-10 — Folded into HIGH-03's fix (same `ops:write` gate and audit-log requirement).
- [x] MED-11 — `verifyQrToken` requires a real, non-empty token unconditionally.
- [x] MED-12 — `deleteUser` soft-deletes (`isActive: false`) so entity-sync tombstones propagate instead of the record resurrecting.
- [x] MED-13 — Tenant login requires a matching `deviceToken` whenever `deviceId` is supplied.
- [x] MED-14 — `recordSyncLog` derives `restaurantId`/`deviceId` from the authenticated device instead of trusting the client-supplied `RecordSyncLogDto` fields.

## Phase 4 — Low register / hardening

- [x] **LOW-01** — CSV formula-injection guard (`escapeCsvField`, shared via `@jamanvaar/utils` where the consumer already depends on it, duplicated locally in `cloud/api` and `super-admin-web` which don't) applied to every export site found: cloud reports, Super Admin, POS-Admin, POS.
- [x] MED-15 (Tauri hardening, tracked here since it's the same "harden the shells" theme as this phase) — printer-target allow-list (`is_allowed_printer_target`) enforced in `packages/native/printing.rs`; real CSP added to all 4 `tauri.conf.json` files. `connect-src`/`img-src` intentionally stay broad — see `FINDINGS.md`'s note.
- [x] **LOW-02** — `payments.service.ts`'s `createRefund` is one transaction with a `FOR UPDATE` row lock on `PaymentTransaction` (closes the read-then-write race — proven with a real concurrent-request test); `requestedBy` is now mandatory on the refund DTO, persisted on `Refund.requestedBy`, and audit-logged; POS and POS-Admin clients now send the real approving manager's name instead of nothing / a hardcoded `'Manager'`.
- [x] **LOW-03** — `master-catalog.service.ts`'s `uploadImage` now sniffs the real file type from magic bytes (PNG/JPEG/GIF/WEBP only; SVG dropped entirely) instead of trusting client-declared `contentType`/`fileName`; verified with a forged-content e2e test (an HTML payload lying about being a PNG is rejected and never reaches disk).
- [x] LOW-04 (partial) — `LicenseRepository.setVerifiedLicense` now records the certificate's verified `expiresAt` into `validUntil` instead of silently dropping it. New offline-expiry *enforcement* deliberately not added — see `FINDINGS.md` for why.
- [x] **LOW-05** — POS-Admin's `cloudLogout()` now revokes the server-side refresh session (`POST /tenant-auth/logout`) before clearing local state; POS's `lockTerminal()`/`unlockTerminal()` now persist `locked` on the session record so a reload restores the lock instead of dropping it. Both verified with real round-trip tests.
- [x] **LOW-06** — RLS (`ENABLE`+`FORCE`+`tenant_isolation` policy) added to `DeviceCommand`, `RestaurantMenuSyndication`, `SyncEventLog`, `SyncConflict`, `OfflineExtension`, `BackupRestoreJob`, `SupportTicket`, and its 3 children via an EXISTS-based policy. New migration `20260923120000_low06_rls_coverage`. Verification caught and fixed a real deployment mistake — see `FINDINGS.md`'s LOW-06 entry for the full story of applying it to the wrong (superuser) database first.
- [x] LOW-07 (partial) — owner-password floor raised from 4 to 8 characters (`create-restaurant.dto.ts`); `cloud/api`'s `start:prod` script now sets `NODE_ENV=production`.
- [ ] LOW-04 (remainder) — offline-expiry enforcement. Deliberately not done — see `FINDINGS.md`.
- [ ] LOW-07 (remainder) — seed script's plan-price `upsert` still overwrites admin-edited prices on every run (a product-behavior question as much as a security one); fabricated placeholder revenue number; 11 `npm audit` advisories; installer trust-store scope; tracked build-artifact cleanup.

## What this roadmap deliberately does not include

- Regression tests were written alongside every fix in this pass (not as a separate step) — see each `.test.ts`/`.e2e.spec.ts` file touched for the exact assertions, so they can't silently drift from what was actually fixed.
- No architectural rewrite was done or is recommended anywhere in this register. Every fix above is scoped to one or a few files. The system's core scaffolding (RLS, JWT realm separation, ECDSA cert verification, idempotency keys, device-auth centralization) did not need to change — see the Executive Summary's "what's genuinely well-built" section.
- Production deployment facts this pass could not verify from source alone (whether the real deployment's process manager actually sets `NODE_ENV=production`, the real CORS origin list, TLS termination, whether `build_release.cjs` vs. the other installer scripts is what customers actually receive, whether the HIGH-06 credential was ever live, whether the LOW-06 migration has been deployed to every real environment and whether the role each one connects as is non-superuser/non-BYPASSRLS) should be confirmed by whoever owns deployment before treating those specific items as fully closed.
