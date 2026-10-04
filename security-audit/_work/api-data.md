# api-data audit
Reviewed revision: `9ddb5633c4679a295dfaa25a80a18dbc7912a82b` (main). Read-only, static review; no server started, no DB touched, no tests run.

## Scope actually read (list of files/dirs, and what you did NOT cover)
Read in full:
- `cloud/api/prisma/schema.prisma` (1377 lines, 44 models), `prisma/seed.ts`, `prisma/setup-app-role.sql`, `prisma/_tmp_user.ts`, `prisma/_tmp_rel.ts`
- all 37 `prisma/migrations/*/migration.sql` were grepped exhaustively for RLS / GRANT / ROLE / INSERT / UPDATE / DROP; init RLS block (lines 270-350) read; the rest scanned by grep, not line-by-line
- `src/prisma/prisma.service.ts`, `src/prisma/rls-role.ts`, `src/common/sql.ts`, `src/common/rbac/access.ts`, `src/common/guards/platform-auth.guard.ts`, `src/config/env.validation.ts`, `src/config/seed-options.ts`, `src/main.ts`
- modules: `restaurants/*`, `reports/*`, `dashboard/*`, `ai-assistant/*`, `support-tickets/*`, `sandboxes/*` (controllers, services, DTOs)
- `cloud/api/scripts/generate-license-key.js`, `.env.example`, `.env` (values NOT printed; structure/length/host only), `data/backups/**` (structure of one file only), `package.json`
- `test/**`: read `setup.ts`, `helpers.ts`, `tenant-isolation.spec.ts`, `rls-platform-reads.e2e.spec.ts`; test names (`it(`/`describe(`) of `rbac`, `restaurants`, `restaurant-tickets`, `support-tickets`, `ai-assistant`, `restaurant-sales`, `restaurant-menu`; grep across all 51 test files for isolation / RLS-meta / injection / CSV assertions
Also read (outside the slice, only to close old-audit claims or complete an exploit chain): `modules/support/support.service.ts` + controller (F-004), `modules/tenant-auth/tenant-auth.service.ts` lines ~790-880 and `dto/login.dto.ts` (reset OTP), `modules/activation-keys/activation-keys.service.ts` (`present`, `redeem`), raw-SQL call sites in devices/activation-keys/invoices/backups services, `billing/invoices.service.ts:361-400`, `order-sync.service.ts` branchId grep, `packages/database/src/pin.ts`, `packages/database/src/live_db.json` (lines 7270-7312), `tooling/installers/build_windows_installers.cjs:170-190`, `git ls-files`/`git log` for tracked-secret questions.
NOT covered: platform-auth / tenant-auth / device-auth internals, backups service/storage, entity-sync, order-sync, payments, billing, offline-policy (other slices). No live Postgres, so RLS flags are derived from migrations, not from `pg_class` in a real DB (schema drift not detectable). Production deployment config is not in the repo (no Dockerfile/systemd/pm2/CI deploy manifests found), so production `NODE_ENV`, DB role and backup-encryption facts are UNVERIFIABLE.

## Inventory (endpoints / IPC commands / entry points in your slice: method+route, auth required, role/permission, tenant/branch scoping, notes)
Platform RBAC is NOT per-controller: `PlatformAuthGuard` maps `originalUrl` to an area (`common/rbac/access.ts:74-92`) and allows GET for any role holding the area, non-GET only for `write`. Unmapped path => owner-level only (fail-closed). Roles: OWNER/SUPER_ADMIN = all write (SUPER_ADMIN settings read); PLATFORM_OPS devices/ops/licensing write; SUPPORT_ADMIN support write; FINANCE_ADMIN subscriptions+billing write; READ_ONLY read on everything except settings.

| Method + route | Auth | Area / who may call | Tenant scoping |
|---|---|---|---|
| POST /api/v1/restaurants | Platform | restaurants:write (OWNER, SUPER_ADMIN) | creates tenant, runAsPlatform |
| GET /api/v1/restaurants, GET /:id | Platform | restaurants:read (ALL roles) | platform ctx; `:id` returns raw `devices` + raw `activationKeys` rows (restaurants.service.ts:190-192) |
| PATCH /:id, /:id/suspend, /:id/reactivate, POST /:id/menu/import, PATCH /:id/menu/permission | Platform | restaurants:write | platform ctx; Zod DTOs (strips unknown keys) |
| GET /:id/menu | Platform | restaurants:read | via EntitySyncService.catchUpForRestaurant |
| GET /api/v1/platform/reports/{summary,revenue,restaurants,devices,subscriptions,restaurants/:id,restaurants/:id/sales,export?type=} | Platform | reports:read (ALL roles incl. READ_ONLY, SUPPORT_ADMIN, PLATFORM_OPS) | platform ctx; raw SQL only in `restaurants/:id/sales`, fully parameterised |
| GET /api/v1/platform/dashboard | Platform | reports:read (ALL roles) | platform ctx; returns 15 raw AuditLog rows |
| /api/v1/ai-assistant/* (GET config, GET/PATCH restaurants/:id/access, PATCH settings, POST/PATCH/DELETE questions) | Platform | catalog (read all; write owner-level) | platform |
| GET /api/v1/devices/me/ai-config, POST /api/v1/devices/me/ai-telemetry | DeviceAuthGuard | any device credential | `device.restaurantId` from guard, not from input |
| GET /api/v1/tenant/ai-assistant/config, POST /telemetry/log | TenantAuthGuard | any tenant role (OWNER/MANAGER/STAFF) | `user.restaurantId` |
| /api/v1/support-tickets (GET list/summary/:id, POST, PATCH :id, POST :id/comments, POST :id/attachments, GET :id/attachments/:aid) | Platform | support (read all roles; write SUPPORT_ADMIN + owner-level) | platform; every role can read internal notes + attachments |
| /api/v1/tenant/support-tickets (GET, POST, GET :id, POST :id/comments, POST :id/attachments, GET :id/attachments/:aid) | TenantAuthGuard | any tenant role | every query filters `restaurantId = session`; uses `runAsPlatform` because ticket tables have no RLS |
| /api/v1/platform/sandboxes (GET, GET :id, POST, DELETE :id) | Platform | ops (read all; write PLATFORM_OPS + owner-level) | metadata only; POST body is an unvalidated TS interface |
| `prisma/seed.ts` (npm run seed / prisma db seed) | none (CLI, DATABASE_URL) | operator | runs in platform ctx |
| `scripts/generate-license-key.js` | none (local CLI) | operator | prints new P-256 pair to stdout only |

Missing-RLS tables (derived from migrations): see table in AD-04.

## Old-audit claim verification
| Old ID | Verdict (CONFIRMED/FIXED/FALSE/UNVERIFIABLE) | Evidence file:line | Note |
|---|---|---|---|
| F-043 (schema part) | CONFIRMED (severity overstated, count wrong) | Migrations enable+FORCE RLS on 21 of 44 models (`grep ALTER TABLE .. FORCE ROW LEVEL SECURITY`). 13 tenant-linked models have no RLS: `AuditLog`, `SupportTicket`, `TicketComment`, `TicketEvent`, `TicketAttachment`, `DeviceCommand`, `RestaurantMenuSyndication`, `SyncEventLog`, `SyncConflict`, `OfflineExtension`, `RestaurantSandbox`, `BackupRestoreJob`, `PlatformNotification` (schema.prisma:467, 503-591, 791, 852, 875, 894, 919, 946, 965, 1344). All policies are `restaurantId = app.current_restaurant_id` only (init migration:298-343) - no branch predicate anywhere; `SyncedEntity` has no `branchId` column (schema.prisma:1270-1286); `order-sync.service.ts` mentions `branchId` only at :85 (stamp on create). | Old text said "19 operational tables"; the real number is 13 tenant-linked (23 non-RLS tables total incl. 10 platform-global by design). Restaurant boundary is intact; the gap is branch-level (intra-tenant) plus defence-in-depth. No cross-tenant read path found in the no-RLS tables (see AD-04). Read-path branch filtering belongs to the sync slice. |
| F-046 | CONFIRMED (dev-only, low) | `cloud/api/.env` `DATABASE_URL` user = `postgres` (superuser); `TEST_DATABASE_URL` user = `jamanvaar_app`. `rls-role.ts:22` only warns unless `NODE_ENV==='production'` | `.env` is untracked (`git ls-files cloud/api/.env` empty; `.gitignore:2`). Local-machine config, not a repo defect. Real-world risk is that dev runs mask missing-filter bugs and that prod depends on F-025. |
| F-025 | CONFIRMED | `package.json:10` `"start:prod": "node dist/src/main.js"` (no NODE_ENV); `env.validation.ts:8` `NODE_ENV ... .default('development')` (applies to ConfigService only); `prisma.service.ts:38` passes raw `process.env.NODE_ENV`; cookie `secure` flag from config at `platform-auth.controller.ts:38`, `tenant-auth.controller.ts:54`; `.env.example` has no `NODE_ENV` line | Unset NODE_ENV => RLS-role check downgrades to a warning, cookies are non-Secure, demo seed data is created (AD-09). No deploy manifest in repo, so production value UNVERIFIABLE. Old fix ("fail bootstrap if NODE_ENV undefined") not applied. |
| F-004 | CONFIRMED (and worse than described) | `support/support.service.ts:47-59` `tx.user.findMany({ include: { restaurant } })` (no `select`), `:60-71` devices, `:73-80` activationKeys, `:94-95,136` diagnostics `users`/`devices`/`owners: restaurant.users`. Route `GET /api/v1/support/search` and `/support/diagnostics/:id` map to area `support`, readable by READ_ONLY (`access.ts:82`, READ_ONLY grant `support:'read'`) | Returned columns now also include `passwordResetHash` (added by migration 20260920180000, schema.prisma:216-219), which is sha256 of a 6-digit OTP. See AD-01 for the exploit chain. |
| F-038 | CONFIRMED (hardening, not exploitable by a lower-trust actor) | `reports.service.ts:273-274,292-293,310` (values only quote-wrapped; no `=,+,-,@` neutralisation; `plan.name` at :274 not quote-escaped; `city`/`state` at :293-294 not quoted); `reports.controller.ts:50` `filename=jamanvaar_${type}_report_...` uses raw query param | Only platform staff can write restaurant name / city / plan name (`restaurants.service.ts:208`; tenants can only change `displayScalePercent`, `tenant-auth.controller.ts:204`), so no lower-trust attacker reaches the CSV. Header injection: Node's `setHeader` rejects CR/LF and non-Latin1 chars (throws => 500), so response splitting is not possible; `type` can only distort the filename. Also no allow-list: unknown `type` silently returns the subscriptions CSV. |
| F-006 | CONFIRMED (file); runtime impact UNVERIFIABLE in this slice | `git ls-files packages/database/src/live_db.json` = tracked (only commit 526390c); lines 7279/7293/7307 `"pinCode": "9999"/"5678"/"1234"` (Owner/Manager/Cashier, no `pinv1:` prefix); copied into installer staging by `tooling/installers/build_windows_installers.cjs:180-181`; used as the local DB by `tooling/local-runtime/local_service.cjs:8` | Whether shipped terminals accept these plaintext PINs depends on the app login code / local_service (other slices). `packages/database/src/pin.ts` has `isPlaintextPin` migration helper, not verified here. |

## New/independent findings
### AD-01 Credential hashes returned to READ_ONLY staff: tenant OWNER takeover via 6-digit reset OTP hash
- Severity: high (CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N, ~8.7) ; Class: CONFIRMED (code trace; not executed)
- CWE/OWASP: CWE-200 / CWE-916 / CWE-330; OWASP API3:2023 Broken Object Property Level Authorization
- Component + file:line(s): `cloud/api/src/modules/support/support.service.ts:47-59` (search users, no `select`), `:94-95,136` (diagnostics returns all `users` columns as `owners`); `prisma/schema.prisma:211-219` (`activationTokenHash`, `passwordResetHash`, `passwordResetExpiresAt`); `tenant-auth.service.ts:816` (`String(randomInt(0, 1_000_000)).padStart(6,'0')`) and `:820` (`passwordResetHash: hashOpaqueToken(otp)` = unsalted sha256, `token.util.ts:9-11`); `tenant-auth.controller.ts:72-85` (public `forgot-password` / `reset-password`); `common/rbac/access.ts:82,60` (READ_ONLY has `support:'read'`).
- Attacker / precondition: any platform account with `support:read` (READ_ONLY, PLATFORM_OPS, FINANCE... every role except none) or anyone who can read a DB dump/replica/backup of the `User` table.
- Repro (safe, local, dummy data; or code-trace): 1) unauthenticated `POST /api/v1/tenant-auth/forgot-password {restaurantId,email}` for the victim owner (stores sha256(OTP), valid 15 min, max 5 online attempts, `tenant-auth.service.ts:800-823`). 2) As READ_ONLY: `GET /api/v1/support/search?q=<owner email>` -> `owners[0].passwordResetHash`. 3) Offline: hash all 10^6 six-digit strings (sub-second) to recover the OTP. 4) `POST /api/v1/tenant-auth/reset-password {restaurantId,email,otp,newPassword}` inside the 15-minute window (the 5-attempt limit is bypassed because only one online guess is needed). Same response also leaks bcrypt `passwordHash` of every user, `activationTokenHash`, `Device.deviceTokenHash`, and plaintext `ActivationKey.code`.
- Expected vs actual: a READ_ONLY support view should return only non-secret identity fields (explicit `select`); actual returns full rows.
- Impact: least-privileged internal staff (or a leaked DB row) -> full takeover of any restaurant's OWNER account -> tenant data, staff management, device logins; bcrypt hashes also allow offline guessing of weak owner passwords (platform API accepts 4-char owner passwords, AD-10).
- Root cause: `include` without `select` on credential-bearing models; low-entropy secret stored as a fast unsalted hash and stored on the readable `User` row.
- Recommended fix (smallest change at last trusted decision point): in `support.service.ts` replace `include:` with an explicit `select` allow-list for `User`, `Device`, `ActivationKey` (mirror `restaurants.service.ts:173-186` and `backups.service.ts:44,48`, which already do this); additionally store the reset OTP with an HMAC keyed by a server secret + user id (or move it to a separate table not readable via support queries) and raise entropy/length.
- Suggested regression test: e2e as READ_ONLY: create user, trigger forgot-password, call `/support/search` and `/support/diagnostics/:id`, assert JSON contains none of the keys `passwordHash|activationTokenHash|passwordResetHash|deviceTokenHash|passwordResetExpiresAt` and that ActivationKey `code` is null/redacted.
- Note: the file lives in `modules/support` (adjacent slice); listed here because F-004 was assigned to me "if in your files" and the exposed columns are defined in my schema. Cross-reference with the api-auth slice owner.

### AD-02 Hard-coded SUPER_ADMIN credential in tracked one-off script and tracked audit brief
- Severity: medium (high if the account exists on any shared/staging/production database) ; Class: CONFIRMED (repo exposure) / SUSPECTED (production presence, UNVERIFIABLE)
- CWE/OWASP: CWE-798, CWE-540
- Component + file:line(s): `cloud/api/prisma/_tmp_user.ts:7-17` (tracked since commit 9ddb563: `bcrypt.hash('LiveV…[redacted]', 10)`, upserts `live-verify@jamanvaar.local` as `SUPER_ADMIN`, `status ACTIVE`; the `update` branch resets an existing account's password and re-activates it); `AUDIT_BRIEF.md:20-22` (tracked) repeats that login plus an owner login (`audit-owner@example.com` / `Audit…[redacted]`), five unredeemed activation-key codes (`JMV-…`) and staff PINs for test restaurant `60f278d3-…`. `prisma/_tmp_rel.ts` (tracked) sets `minSupportedVersion='0.0.1'` on every AppRelease (disables forced-update floor) if run.
- Attacker / precondition: anyone with read access to the repository (contributors, CI logs, a leaked clone).
- Repro (code-trace): read the files; log into any environment where the script was executed with `POST /api/v1/platform-auth/login`.
- Expected vs actual: no credentials or one-off admin-creation scripts in source control; actual: a working platform admin login is in two tracked files. The script's name/`AUDIT_BRIEF.md` ("Super Admin login ... role SUPER_ADMIN") show it was applied to the developer's local DB; nothing prevents running it against another `DATABASE_URL`.
- Impact: if this account exists anywhere shared, it is a full platform takeover (SUPER_ADMIN write on every area except settings).
- Root cause: dev helper committed by "add remaining local files" (9ddb563); no guard against non-local DATABASE_URL.
- Recommended fix: delete both `_tmp_*.ts` and the credentials section of `AUDIT_BRIEF.md`; treat the password as burned; verify/delete `live-verify@jamanvaar.local` and `audit-owner@example.com` in every non-local DB; rotate; consider history rewrite or at least secret-scanning in CI.
- Suggested regression test: CI secret scan (gitleaks/trufflehog) plus a repo test asserting no tracked file under `cloud/api/prisma` other than `seed.ts` / `schema.prisma` / `setup-app-role.sql` / `migrations/**`.

### AD-03 READ_ONLY staff can obtain redeemable activation codes and mint a device credential for any restaurant
- Severity: medium (CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:L/VA:N/SC:N/SI:N/SA:N) ; Class: CONFIRMED (code trace for read; redeem is unauthenticated by design)
- CWE/OWASP: CWE-269 / CWE-200; OWASP API5 Broken Function Level Authorization
- Component + file:line(s): `restaurants/restaurants.service.ts:192` (`activationKeys: { orderBy }` raw rows incl. `code`, no `present()` redaction, no lifecycle filter) and `:190` (`devices: true` incl. `deviceTokenHash`); `activation-keys.service.ts:44-50` (`code` returned in clear while AVAILABLE, for area `devices:read` = every role); `support.service.ts:73-80`; audit trail also stores the code (`activation-keys.service.ts:434`, `:444` comment); redeem endpoint is unauthenticated: `activation-keys.service.ts:243-262`.
- Attacker / precondition: READ_ONLY (or any role with `restaurants:read` / `devices:read` / `support:read`).
- Repro (code-trace): `GET /api/v1/restaurants/:id` -> `activationKeys[].code` for an ACTIVE key -> `POST` the public activation-redeem endpoint with that code + a matching `deviceType` -> receives a device bearer credential bound to that restaurant (`DeviceAuthGuard`), which then pulls menu / staff entities / orders through sync endpoints.
- Expected vs actual: a read-only observer must not obtain a credential that grants write access to a tenant's sync surface; actual: plaintext single-use bootstrap secrets are readable by all 6 roles and the same secret is the only auth on the redeem route.
- Impact: privilege escalation (read-only -> device-level tenant access), and it races the legitimate installer (first redeemer wins, key is then REDEEMED).
- Root cause: bootstrap secret stored and served in plaintext; RBAC treats "read" as safe for secrets.
- Recommended fix: return `code` only to roles with `devices:write` (PLATFORM_OPS + owner-level) and only at creation time (store `sha256(code)`, show once); in `restaurants.service.ts` use `select` and never include `code`/`deviceTokenHash`; stop writing `code` into `AuditLog.details`.
- Suggested regression test: READ_ONLY token calls `/restaurants/:id`, `/activation-keys`, `/support/search`; assert no full `code` and no `deviceTokenHash` anywhere in any response.

### AD-04 Thirteen tenant-linked tables have no RLS; tenant ticket code runs entirely in platform context
- Severity: medium (defence-in-depth; no cross-tenant read path found) ; Class: HARDENING
- CWE/OWASP: CWE-284 / CWE-653; OWASP API1 (defence in depth)
- Component + file:line(s): tables listed in F-043 row above; init migration comment `20260905092359_init/migration.sql:286-296,352-354` ("AuditLog intentionally NOT RLS-scoped"); `support-tickets/tenant-support-tickets.service.ts:83-95,97-110` run `runAsPlatform` for every tenant ticket read/write, so isolation there is 100% the hand-written `restaurantId: user.restaurantId` filters (they are present on `list`, `own`, `get`, and every mutating path calls `own()` first; attachments are matched on `{ id, ticketId }` after `own()`).
- Attacker / precondition: a future or missed application-level filter on `SupportTicket`, `TicketAttachment`, `DeviceCommand`, `SyncEventLog`, `SyncConflict`, `OfflineExtension`, `BackupRestoreJob`, `RestaurantMenuSyndication`.
- Repro / trace performed: device-facing readers of no-RLS tables filter by `deviceId` and `restaurantId` (`device-commands.service.ts:133-175`, `devices.service.ts:199-209`, `order-sync.service.ts:39,87,101`), all inside `runAsTenant`; no tenant/device path reads them without a filter. Nothing exploitable at HEAD.
- Expected vs actual: architecture doc/comments promise "RLS on every tenant-owned table"; 13 of 34 tenant-or-child tables are not covered (`SupportTicket` and children use nullable `restaurantId`, so a policy `restaurantId = ctx OR platform` works unchanged).
- Impact: any future IDOR in those modules leaks across tenants with no second layer.
- Recommended fix: add ENABLE+FORCE+`tenant_isolation` to `DeviceCommand`, `RestaurantMenuSyndication`, `SyncEventLog`, `SyncConflict`, `OfflineExtension`, `BackupRestoreJob`; for ticket tables add a policy on `SupportTicket` (and EXISTS-based on the children) and switch the tenant ticket service to `runAsTenant`; add a startup/CI assertion that every model with a `restaurantId` column has `relrowsecurity AND relforcerowsecurity`.
- Suggested regression test: SQL meta-test `SELECT relname FROM pg_class c JOIN pg_attribute a ... WHERE attname='restaurantId' AND NOT (relrowsecurity AND relforcerowsecurity)` must return only an explicit allow-list.

### AD-05 App DB role owns the schema (can disable RLS); prod safety depends on unset-by-default NODE_ENV
- Severity: medium ; Class: HARDENING
- CWE/OWASP: CWE-250, CWE-276
- Component + file:line(s): `prisma/setup-app-role.sql:1-15` (the role that runs `prisma migrate deploy` is the same role the API connects as and must own every table; also creates `jamanvaar_test` in the same cluster; literal `CHANGE_ME` password); `prisma.service.ts:35-45`, `rls-role.ts:22` (fatal only in production); `env.validation.ts:8`, `package.json:10` (F-025).
- Attacker / precondition: any SQL-level primitive in the API (none found; all raw SQL is parameterised, see Controls) or a leaked `DATABASE_URL`.
- Expected vs actual: runtime role should have only DML (SELECT/INSERT/UPDATE/DELETE) on tables and be unable to `ALTER TABLE .. DISABLE ROW LEVEL SECURITY`, `DROP POLICY`, or `SET` its own policies away. Actual: owner role can. Also any session that can run SQL can set the GUCs itself: `SET app.is_platform_context='true'` grants full cross-tenant visibility (custom GUCs are settable by any role).
- Impact: RLS is a guard against application bugs, not against a compromised connection; a single injection would defeat it completely.
- Recommended fix: two roles: `jamanvaar_migrator` (owner, runs `migrate deploy`) and `jamanvaar_app` (DML only, `NOSUPERUSER NOBYPASSRLS`); make `assessRlsRole` also fail when the role owns the tables and when `NODE_ENV` is undefined; set `NODE_ENV=production` in `start:prod`; do not create `_test` DB in the production cluster.
- Suggested regression test: startup test that connects as owner role with NODE_ENV unset and expects boot failure.

### AD-06 Ticket attachments/tickets have no per-tenant quota (DB storage exhaustion) and a count-then-insert race
- Severity: medium (authenticated availability/cost) ; Class: CONFIRMED (code trace)
- CWE/OWASP: CWE-770 / CWE-367; OWASP API4 Unrestricted Resource Consumption
- Component + file:line(s): `support-tickets/support-tickets.service.ts:262-279` (`saveAttachment`: `count` then `create`, not atomic; bytes stored in Postgres `Bytea`, `schema.prisma:578-591`); `dto/ticket.dto.ts:52-57` (`dataBase64` has no `.max()`, so up to the 20 MB JSON body limit `main.ts:20` is base64-decoded before the 2 MB check); `tenant-support-tickets.service.ts:33-77` (ticket creation has no per-restaurant cap; any role incl. STAFF).
- Attacker / precondition: any tenant login (even STAFF).
- Repro (code-trace): loop { create ticket; upload 5 x 2 MB } = 6 requests / 10 MB; global throttle is 120 req/min per address (`app.module.ts:48-52`) => ~200 MB/min of Postgres growth (backups, replicas and vacuum all inherit it); parallel uploads can exceed the 5-file cap because of the race.
- Impact: shared-DB bloat / cost / degraded service for all tenants; no attribution beyond the audit row.
- Recommended fix: cap open tickets and total attachment bytes per restaurant (e.g. 25 MB), enforce the per-ticket cap with a locked count inside one transaction, add `.max()` on `dataBase64`, move blobs to object storage.
- Suggested regression test: concurrent 8 uploads to one ticket => at most 5 rows; per-restaurant byte quota returns 4xx.

### AD-07 Reports/dashboard expose billing data to roles denied `billing`; exports unbounded and dates unvalidated
- Severity: low ; Class: CONFIRMED (authz inconsistency); design intent UNVERIFIABLE
- CWE/OWASP: CWE-285 / CWE-770
- Component + file:line(s): `access.ts:60-70` (SUPPORT_ADMIN, PLATFORM_OPS have no `billing` area; `rbac.e2e.spec.ts:78` asserts "Support Admin cannot see billing") but all roles have `reports:read`; `reports.service.ts:126-170` (`getRevenue`: invoice numbers, per-restaurant totals), `:261-283` (`/export?type=revenue` full invoice CSV: subtotal/tax/total/status), `getSummary` MRR/collected/outstanding, dashboard `pendingInvoiceAmount`. `reports.service.ts:15-17` `new Date(range.from)` unchecked (Invalid Date -> Prisma error 500); no upper bound on range so `jsonb_array_elements` runs over the restaurant's full order history; `generateCsv` and `getRevenue` do `findMany` without limit (`:129,266`).
- Impact: internal least-privilege bypass (support/ops read finance data); large exports and long-range sales queries can tie up a pooled connection.
- Recommended fix: map `/platform/reports/revenue`, `/export?type=revenue` and the invoice fields of summary/dashboard to `billing` (or require both areas); validate `from/to` with Zod and cap range (e.g. <= 366 days); allow-list `type`; stream/paginate exports.
- Suggested regression test: SUPPORT_ADMIN token gets 403 on `/platform/reports/export?type=revenue`.

### AD-08 Sandbox create has no validation; sandbox is metadata only
- Severity: low ; Class: CONFIRMED (missing validation) / HARDENING
- CWE/OWASP: CWE-20
- Component + file:line(s): `sandboxes.controller.ts:19-22` (`@Body() dto: CreateSandboxDto` is a TS interface, no pipe; app has no global ValidationPipe, `grep useGlobalPipes` empty); `sandboxes.service.ts:53-56,76-89` (`durationDays` unbounded -> Invalid Date/negative expiry, `name` any type -> Prisma 500); `environmentKey` and `expiresAt` are never used or enforced anywhere (`grep environmentKey` only in this service and the web page); `getById` returns the whole source `Restaurant` row.
- Impact: 500s and nonsensical expiry; no data isolation risk today because no sandbox tenant is created (config JSON only, no credentials or customer rows are cloned).
- Recommended fix: Zod schema (`name` 2-100, `sourceRestaurantId` uuid, `durationDays` 1-90) and an expiry job if sandboxes ever become real environments.
- Suggested regression test: POST with `durationDays: 1e12` -> 400.

### AD-09 Seed script: unsafe re-run in production, demo tenant when NODE_ENV unset, plan prices overwritten
- Severity: low ; Class: HARDENING
- CWE/OWASP: CWE-1188, CWE-489
- Component + file:line(s): `prisma/seed.ts:118-122,145-149` (Plan `upsert ... update:` rewrites price/limits/entitlements of `seed-plan-core` / `seed-plan-pro` on every run); `:204` (`AppRelease upsert update: rel` resets `minSupportedVersion` to 1.0.0 and `downloadUrl` to null for 1.0.0 releases); `src/config/seed-options.ts:10` (demo tenant `11111111-1111-4111-8111-111111111111` + `owner@demo.jamanvaar.app` created whenever `NODE_ENV !== 'production'`, and `npm run seed` does not set it); `seed.ts:35-45,73-76` (default super-admin email `superadmin@jamanvaar.app` is predictable; `SEED_SUPER_ADMIN_PASSWORD` accepted with no length check; passwords/tokens are printed to stdout); `seed.ts:~262-272` placeholder seller bank account/GSTIN/UPI printed on invoices until an admin edits `platform.billing`.
- Positive: without an override the super admin gets a 9-byte random password shown once; reset needs a second explicit flag; existing PlatformSetting values are not overwritten; demo owner is invite-only unless `SEED_DEMO_OWNER_PASSWORD` set.
- Impact: a deploy pipeline that re-runs seed silently reverts admin-edited plan prices (invoicing errors) and creates a known demo tenant in production if NODE_ENV is not exported.
- Recommended fix: make plan/release seeding create-only (`update: {}`), refuse to run when `NODE_ENV` is unset, enforce >= 12 chars on the override.
- Suggested regression test: run seed twice against a test DB after changing a plan price; price must persist.

### AD-10 Platform staff can create a restaurant owner with a 4-character password
- Severity: low ; Class: CONFIRMED
- CWE/OWASP: CWE-521
- Component + file:line(s): `restaurants/dto/create-restaurant.dto.ts:24` `ownerPassword: z.string().min(4).optional()` vs tenant policy `tenant-auth/dto/login.dto.ts:43,49,63,83` min 8; bcrypt cost 10 (`restaurants.service.ts:58`). Account becomes ACTIVE immediately (`:59-60`).
- Impact: policy bypass by an owner-level staff member or a compromised console; weak passwords are trivially crackable using AD-01's hash exposure.
- Recommended fix: share one password schema (>= 8, ideally 12) between both DTOs.
- Suggested regression test: POST /restaurants with `ownerPassword: 'abcd'` -> 400.

### AD-11 JAMAN AI is rule-based (no LLM); quota is advisory and telemetry can flood rows
- Severity: low ; Class: HARDENING
- CWE/OWASP: CWE-770
- Component + file:line(s): `ai-assistant.service.ts:353-369` `logTelemetry` checks only `state === 'ON'`, never `limitReached` (the e2e test at `ai-assistant.e2e.spec.ts:198-208` only asserts the flag flips); `dto/ai-assistant.dto.ts:44-49` `intent` is any string <= 60 chars => unbounded distinct `AiUsageDaily` rows per restaurant per day (`schema.prisma:1327-1338`), pollutes `topIntents`; read-then-upsert is not atomic. `addQuestion` id `q_custom_${Date.now()}` collides within one millisecond (`:257`).
- Note on the requested focus: there is no prompt, model call, or tenant-data-to-model path in this module (`grep` for fetch/axios/openai/anthropic in `modules/ai-assistant` is empty); tenant scoping of config/telemetry uses `device.restaurantId` / `user.restaurantId` from the auth guard, never from the request. `queryText` accepted by the DTO is dropped, not stored. No prompt-injection or exfiltration surface exists at HEAD.
- Recommended fix: reject when `limitReached`, validate `intent` against the enabled `AiQuestion.intent` set, use an atomic conditional update.
- Suggested regression test: after the limit, `POST ai-telemetry` returns 429; unknown intent -> 400.

### AD-12 Dashboard: fabricated revenue trend and nested connection use
- Severity: low/info ; Class: CONFIRMED
- Component + file:line(s): `dashboard/dashboard.service.ts:134-136` when a month has no paid invoices it returns `Math.round(mrr * (0.65 + 0.07 * (5 - i)))` (synthesised numbers presented as revenue); `:21-25` calls `this.prisma.$queryRaw` (a second pool connection) while already inside `runAsPlatform` (one connection held), so N concurrent dashboard requests >= pool size can deadlock the pool until the 5 s interactive-transaction timeout (`prisma.service.ts:69-74`). Any of the 6 roles can trigger it (throttle 120/min).
- Recommended fix: return `null`/0 for empty months; run the probe on the same `tx`.
- Suggested regression test: empty DB -> `trends.revenue[*].revenue` equals 0.

### AD-13 Live secrets and PII sit unencrypted on a developer machine in a (likely) OneDrive-synced path
- Severity: medium ; Class: SUSPECTED (environmental; sync state and prod use of the key UNVERIFIABLE)
- CWE/OWASP: CWE-312, CWE-522
- Component + file:line(s): `cloud/api/.env` (untracked, `.gitignore:2`; never in git history: `git log --all -- cloud/api/.env` empty). Contains a real-format SMTP app password (16 chars, host `smt…`), `LICENSE_SIGNING_PRIVATE_KEY_B64` (324 chars) and `LICENSE_SIGNING_KEY_ID=k2`, a seed super-admin password (11 chars, company-derived prefix `Kel…`), `JWT_ACCESS_SECRET` (41 chars, human-readable prefix `jam…`; env schema only requires >= 32 chars, no entropy check, `env.validation.ts:11`), superuser `postgres` DB URL. I derived the public key from the private key locally and it matches the `k2` public key in the tracked `packages/config/src/license_keys.ts` (no secret printed): the machine holds the signing key whose public half ships inside the apps. `cloud/api/data/backups/restaurants/**` (untracked, `.gitignore:21`) holds 5 gzip JSON restaurant backups, unencrypted because `BACKUP_ENCRYPTION_KEY_B64` is not set; contents include owner emails/phones and `STAFF_USER` sync entities with `pinHash`.
- Attacker / precondition: compromise of the workstation, its OneDrive account, or an accidental zip/share of the folder (a `JAMANVAAR_ALL_APPS.zip` exists in the repo root; `.gitignore` ignores `*.zip`).
- Impact: if `k2` is the production signing key, the holder can forge offline license certificates and emergency-extension certificates accepted by every shipped app; SMTP credential allows spoofed mail from the sender domain.
- Recommended fix: keep signing keys only in a secrets manager / HSM, use a dev-only key locally (rotate `k2` -> `k3` if this one is production), rotate the SMTP password, exclude the repo from OneDrive sync or move secrets out of the tree, set `BACKUP_ENCRYPTION_KEY_B64` everywhere.
- Suggested regression test: CI check that `LICENSE_SIGNING_PRIVATE_KEY_B64` is not present in `.env` files that are not `.env.production`-only-in-vault (process control, not code).

### AD-14 Weak staff PIN hash propagates into cloud storage and backups (cross-slice hint)
- Severity: low/medium ; Class: SUSPECTED (belongs to sync/local-core slices)
- Component + file:line(s): `packages/database/src/pin.ts:6-33` (`hashPin` = two FNV-1a rounds, 32-bit each, salt = restaurantId: 10,000 PINs enumerable instantly); sample cloud backup `data/backups/restaurants/0427…/*.json.gz` shows `syncedEntities[entityType=STAFF_USER].payload.pinHash = "pinv1:…"` (22 chars); entity-sync delivers all `SyncedEntity` rows of a restaurant to every device type of that restaurant.
- Impact: a Kiosk/KDS device credential (or a backup reader) can recover every staff PIN including Owner/Manager PINs.
- Recommended fix: do not sync `pinHash` to devices that do not authenticate that user, use a slow keyed KDF (scrypt/argon2) and per-user salt, exclude from backups.

### AD-15 Schema-level integrity gaps (composite FKs, payment idempotency)
- Severity: low ; Class: HARDENING (payment race SUSPECTED)
- Component + file:line(s): `schema.prisma` - FKs such as `Device.branchId`, `User.branchId`, `ActivationKey.branchId/subscriptionId`, `Order.kioskId`, `SyncedOrder.deviceId` reference a parent by id only, not `(id, restaurantId)`, so nothing at the DB stops a row of restaurant A pointing at restaurant B's branch/device (FK checks bypass RLS); `SyncedOrder.branchId`, `SyncEventLog.branchId`, `SupportTicket.branchId/deviceId`, `TenantRefreshToken.restaurantId/deviceId` have no FK. `Payment` (`:658-675`) has no unique/idempotency key on `(invoiceId, referenceNumber)`; `invoices.service.ts:361-392` reads `invoice.status`, then inserts a payment and later updates the status without a row lock, so two concurrent `POST` of the same payment both pass the `PAID` guard. All `Restaurant` relations are `ON DELETE CASCADE` including `Invoice`/`Payment` (`schema.prisma:626,663`) and `SupportTicket.createdById` cascades from `PlatformUser` (`:517`), so a future hard delete destroys financial/ticket records (no code path hard-deletes a restaurant or platform user today: `grep restaurant.delete|platformUser.delete` empty outside tests).
- Recommended fix: composite unique + composite FKs on tenant children; `SELECT ... FOR UPDATE` on the invoice in `recordPayment`; `onDelete: Restrict` for financial rows.

### AD-16 Test suite does not pin the security invariants that matter
- Severity: info ; Class: HARDENING
- Evidence: `test/tenant-isolation.spec.ts` asserts RLS only on `Branch` and `Restaurant` (2 of 21 RLS tables; no-context = 0 rows, cross-tenant read = null, platform ctx sees both). No test asserts (a) every `restaurantId` table has ENABLE+FORCE RLS, (b) support search/diagnostics/restaurant detail redact `passwordHash|*TokenHash|passwordResetHash|code`, (c) CSV neutralisation, (d) branch-level isolation, (e) attachment quotas, (f) seed idempotency. Cross-tenant 404 tests exist for ticket attachments (`restaurant-tickets.e2e.spec.ts:201`), AI config (`ai-assistant.e2e.spec.ts:171`), plus RBAC role matrix (`rbac.e2e.spec.ts:61-95`). `test/setup.ts:6` only redirects to `TEST_DATABASE_URL` if set; otherwise the suite writes `TEST ...` rows (and platform users) into whatever `DATABASE_URL` points at, including a real database.
- Recommended fix: add the meta-test from AD-04; make `setup.ts` abort unless the DB name ends in `_test`.

## Controls verified OK (things you checked that are sound; one line each with file:line)
- Tenant GUC is transaction-scoped: `SET LOCAL` inside `$transaction` for both platform and tenant contexts (`prisma.service.ts:72,86`), so it cannot leak across pooled connections (also PgBouncer transaction-mode safe).
- `runAsTenant` injection-safe: value is regex-validated as a strict UUID (`^...$`, no `m` flag) before string interpolation (`prisma.service.ts:5,82-86`); `runAsPlatform` interpolates only a constant.
- Bare-client queries fail closed: no GUC => policy evaluates false => 0 rows, and this is tested (`tenant-isolation.spec.ts` "NO context" case).
- Every one of 21 RLS tables has both ENABLE and FORCE with a `tenant_isolation` policy (script over all migrations: 21 enabled = 21 forced); USING-only policy is also applied as WITH CHECK for writes, so a tenant context cannot insert/update rows for another restaurant.
- No superuser/BYPASSRLS at runtime in production: startup check `pg_roles.rolsuper/rolbypassrls` and hard fail when `NODE_ENV=production` (`prisma.service.ts:35-45`, `rls-role.ts`), unit-tested (`prisma/rls-role.spec.ts`). Weakness is only the NODE_ENV dependence (F-025).
- Raw SQL: 13 `$queryRaw` sites use tagged `Prisma.sql` with bound params; only `$executeRawUnsafe` are the two SET LOCAL statements; no `Prisma.raw`, no string-built SQL (`grep` over `src`). `ts()` helper avoids timezone skew (`common/sql.ts:7`). `LIKE` patterns are bound but not wildcard-escaped (no security impact).
- Restaurant sales report scopes on `o."restaurantId" = $1` and validates the restaurant exists (`reports.service.ts:18,28`); item JSON values are Zod-validated numerics at ingest (`order-sync/dto:14,21`), so `::numeric` casts cannot be poisoned by devices.
- Tenant ticket access: all six tenant routes derive restaurant from the session, filter by `restaurantId`, `own()` precedes every child-object access, internal notes and internal events are excluded by `select`/`where` (`tenant-support-tickets.service.ts:83-110`); tenant-supplied `branchId`/`deviceId` are verified to belong to the tenant (`:29-36`); cross-tenant attachment download returns 404 (tested).
- Attachment serving is safe: fixed MIME allow-list enum (png/jpeg/webp/gif/pdf/text), `Content-Disposition: attachment`, sanitised filename `[\w.\- ]`, `nosniff`, `CSP: default-src 'none'; sandbox` (`send-attachment.ts:8-14`; `ticket.dto.ts:48-49`); size checked on decoded bytes and per-ticket count capped (subject to AD-06).
- Ticket/AI DTOs strip unknown keys (Zod objects) so no mass-assignment of `status`/`restaurantId`/`source` from tenants (`ticket.dto.ts:17-25`); AI threshold overrides are `.strict()` and bounded (`ai-assistant.dto.ts:52-62`).
- Platform RBAC is deny-by-default and fail-closed for unmapped or differently-cased paths (`access.ts:94-99,105-110`); all my controllers sit under mapped areas; only the URL-to-area mapping (not per-controller decorators) is used, which is consistent for these modules.
- `restaurants.service.ts:173-186` and `backups.service.ts:44,48` use explicit `select` allow-lists, so `getRestaurantById().users` never returns credential hashes (the problems are `devices: true` and `activationKeys` on the same call, AD-03).
- Owner activation token: 256-bit random, only sha256 stored, single return in the create response and excluded from the audit row (`restaurants.service.ts:47-101`).
- `.env` is not tracked and was never committed (`git ls-files`, `git log --all -- cloud/api/.env`); `.env.example` contains placeholders only; no private keys / cloud tokens in tracked files (`git grep` for PEM, `AKIA`, `ghp_`, `sk_live_`, `xox*` empty). `data/backups/` and `.env` are gitignored (`.gitignore:2,21`).
- Migrations contain no seeded users/passwords and no data-destroying DDL beyond the intentional session backfill (`20260919183000_platform_sessions`).
- Seed: no hardcoded default password; random 9-byte password when unset; existing super-admin never reset without both flags; demo tenant off when `NODE_ENV=production` or `SEED_DEMO_DATA=false` (`seed-options.spec.ts`).
- Idempotency keys exist where they matter for sync: `@@unique([restaurantId, externalOrderId])` on `Order` and `SyncedOrder`, `@@unique([restaurantId, entityType, externalId])` on `SyncedEntity`, `@@unique([provider, providerOrderId])`, `@@unique([provider, providerEventKey])` on `WebhookEvent`, unique `Payment.receiptNumber`, `InvoiceCounter` atomic counter.
- Body limit is 20 MB globally with the Razorpay webhook on a raw 1 MB parser (`main.ts:19-20`); helmet enabled; CORS is an explicit origin list.

## Not verified / limits
- No live database: RLS/FORCE/ownership state, role attributes and schema drift vs migrations are inferred from files; production DB user, `NODE_ENV`, `BACKUP_ENCRYPTION_KEY_B64`, SMTP/signing key provenance are UNVERIFIABLE (no deployment manifests in the repo).
- AD-01/AD-03 chains were traced in code, not executed against a running API (brief forbids servers unless needed); the public `redeem` and `reset-password` endpoints were read only for the segments cited.
- Whether `live-verify@jamanvaar.local` / `audit-owner@example.com` exist outside the developer's laptop is unknown.
- Branch-level isolation in sync pull paths (`order-sync`, `entity-sync`) only sampled (grep for `branchId`); full verdict belongs to the sync slice.
- `AuditLog.details` contents across the whole API were not reviewed (only the activation-key `code` case seen).
- Trusted-proxy/IP-throttle behaviour (`app.set('trust proxy')` absent in `main.ts`) affects AD-06's rate estimate; not analysed.
