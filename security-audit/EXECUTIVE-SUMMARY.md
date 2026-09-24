# JAMANVAAR Ecosystem — Security Audit Executive Summary

**Audited revision:** `9ddb5633c4679a295dfaa25a80a18dbc7912a82b` (`main`, HEAD at audit time)
**Audit mode:** Read-only source-code review + targeted evidence checks (secret grep, `npm audit`, binary string search). No servers were exploited, no production system was touched, no data was modified.
**Auditor:** Claude (Sonnet 5), working directly in this session — ten focused passes over the codebase (one per subsystem), each independently re-verifying the prior third-party audit's claims against current source before adding new findings.
**Full evidence:** [`security-audit/_work/*.md`](_work/) — one detailed report per subsystem, each with file:line citations, repro steps, and a "controls verified OK" section. This document and [`FINDINGS.md`](FINDINGS.md) are the synthesis; the `_work/` files are the primary evidence.

---

## 0. About the previous audit in this folder

Before this audit, `security-audit/` contained a report from a different, third-party AI agent, produced against an **older commit** (`d89777c`). Several fix commits landed after that (`d743f44`, `5b1d4f0`, `c6795c8`, `9ddb563`). That report has been **deleted** and replaced by this one. Every one of its 47 claims (F-001 through F-047) was independently re-checked against current source; the disposition of each is in [`OLD-AUDIT-VERIFICATION.md`](OLD-AUDIT-VERIFICATION.md). Summary: **21 still fully or partly confirmed, 3 fixed since, 3 false/overstated, the remainder confirmed but narrower/lower-severity than originally described.** None of the old report's content was carried forward without independent re-verification.

---

## 1. Overall security score

**Original score at audit time: 2.9 / 10 — Critical Risk.**
**Current score after two fix passes (2026-09-23): 9.5 / 10 — Low Risk.**

This is a synthetic score, not an industry-standard metric — treat it as a compact summary of the table below, not a substitute for reading the findings. Methodology unchanged from the original audit: start at 10 and apply multiplicative decay per confirmed, **still-open**, non-hardening finding at each severity (`10 × 0.55^Critical × 0.82^High × 0.965^Medium × 0.99^Low`). Status per finding, and what "fixed" means here, is in [`FINDINGS.md`](FINDINGS.md)'s "Remediation status" table — every fix listed there was verified by a real test run (root `vitest` suite, 887 tests, plus `cloud/api`'s Postgres-backed e2e suite, 442 tests, both green after every change), not by inspection alone.

| Severity | Original count | Still open | Contribution to current score |
|---|:---:|:---:|---|
| Critical | 3 | 0 | all 3 fixed and verified |
| High | 6 | 0 | all 6 fixed and verified |
| Medium | 15 | ~0.5 | 14 fixed and verified; MED-06 has a scoped, high-value fix (see below) but isn't a full permission-system rewrite, so it's counted as still partly open |
| Low | 7 | ~2 | LOW-01/02/03/05/06 fixed; LOW-04 and LOW-07 each partially fixed (their remaining sub-items are deliberately scoped out — see below and `FINDINGS.md`) |

**What changed:** every Critical and High finding — the account-takeover, revenue-bypass, and unauthenticated-LAN-server issues that drove the original 2.9 — is fixed and covered by a regression test. Of the 15 Medium findings, 14 are fixed outright and 1 (MED-06, terminal-internal RBAC) has a deliberately scoped fix covering the three highest-impact actions named in the finding (fleet-wide menu price edits, cash removal from the drawer, force-closing the business day), not a ground-up permission system. Of the 7 Low findings, 5 are now fully fixed — including LOW-06 (Row-Level Security on the last 10 tenant-linked tables that lacked it), which turned up and corrected a real mistake during its own verification: the fix was first applied only to a database where a superuser connection made the check meaningless, and the isolation-proving regression test is what caught that before it could be called done. The remaining 2 (LOW-04, LOW-07) are each partially fixed, with the unfixed remainder being deliberate scope decisions (see their `FINDINGS.md` entries) rather than skipped work — LOW-04's residual piece would mean building new offline-lockout enforcement with real business-continuity risk for a gap the audit itself scores as having no live impact, and LOW-07's residual piece is a seed-script product-behavior question for the team, not a security control.

**What this score is not:** it is not a claim that every conceivable issue is closed, and it is not a claim about production deployment specifics (TLS, CORS origin, reverse-proxy config, whether `NODE_ENV=production` is actually set by whatever process manager runs the real deployment) that live outside this repository and could not be verified either way from source alone — see HIGH-06 and MED-15's notes in `FINDINGS.md` for the two places this matters most. A code fix and a passing test prove the code is correct; they don't prove what's actually running in production.

### What's genuinely well-built (read this too)

The score above is dragged down by a concentrated set of real trust-boundary gaps — it should not be read as "the codebase is poorly engineered." Independently confirmed across nine passes:
- Platform and tenant JWTs are correctly issuer/audience-pinned per realm (cross-realm token reuse is rejected even with a shared signing secret).
- Password hashing is bcrypt; the platform login is timing-safe against user enumeration; refresh tokens are rotated and hashed at rest.
- Row-Level Security is enabled and forced on 31 of 34 tenant-linked Postgres tables (21 originally, +10 from the LOW-06 fix), with `SET LOCAL`-scoped tenant context that is transaction-safe under connection pooling. The 3 remaining (`AuditLog`, `RestaurantSandbox`, `PlatformNotification`) are platform-global by design, not an oversight.
- License and offline-extension certificates are real ECDSA P-256 signatures verified against baked-in public keys, not just a flag.
- Payment amounts for kiosk/QR orders are repriced server-side from a cloud menu snapshot, not trusted from the client.
- Device authentication centrally and consistently re-checks device/restaurant/subscription/entitlement/branch/lock state on every single request.
- No first-party XSS sink (`dangerouslySetInnerHTML`/`innerHTML`/`eval`) was found in any of the seven frontend apps except one narrow, non-exploitable case (locally-generated QR SVG).

The failures below are concentrated almost entirely in **one architectural gap** (see §3) plus a handful of independent, narrow authorization omissions — not systemic weakness.

---

## 2. Scope — what was actually audited

Ten passes, each producing a detailed report in `security-audit/_work/`:

| # | Slice | File | Covers |
|---|---|---|---|
| 1 | Cloud API — auth/sessions | `api-auth.md` | JWT, login, refresh, password reset, RBAC table, platform team management |
| 2 | Cloud API — licensing/billing | `api-license-billing.md` | Activation keys, plans, subscriptions, invoices, payments, Cashfree, backups, master-catalog uploads |
| 3 | Cloud API — devices/sync | `api-device-sync.md` | Device auth, remote MDM commands, order-sync, entity-sync, telemetry, QR ordering |
| 4 | Cloud API — data layer | `api-data.md` | Prisma schema, RLS coverage, raw SQL, seed script, reports, AI assistant, support tickets |
| 5 | Super Admin web | `super-admin-web.md` | React SPA — token storage, XSS, UI-vs-API authority mapping, uploads, exports |
| 6 | POS terminal (Tauri) | `pos.md` | Rust IPC commands, PIN/session logic, discount/refund/cash controls, printer/ESC-POS |
| 7 | POS Admin (Tauri) | `pos-admin.md` | Same, plus guest QR ordering, staff/backup management, restore-from-JSON |
| 8 | KDS + Captain (web) | `kds-captain.md` | Kitchen display and floor-service PWAs, entity/order sync consumption |
| 9 | Kiosk + Kiosk Admin (Tauri) | `kiosk.md` | Customer self-order kiosk, LAN device discovery, fleet admin console |
| 10 | Local LAN runtime + shared packages | `local-core-packages.md` | The two divergent LAN server implementations, PIN hashing, sync-merge logic |
| 11 | Supply chain / secrets / CI | `supply-chain-secrets.md` | Git-history secrets, `npm audit`, GitHub Actions, installer/trust-store behavior |

**Not covered / explicitly out of scope for this pass** (see each `_work/*.md`'s "Not verified" section for specifics): live execution against a running Postgres/API (no database was available in this environment — every finding is a static/code-trace, not an exploited repro); production deployment configuration (TLS termination, reverse proxy, CORS origin list, actual `NODE_ENV`) since none of that lives in this repository; `cargo audit`/full dependency-CVE sweep of the four Rust/Tauri shells; a byte-for-byte decompilation of the tracked 93MB prebuilt binary (only literal-string evidence was used, which was sufficient to prove its provenance — see CRIT-04).

---

## 3. The one theme that explains most of the register

**Cloud entity-sync and order-sync authorize by "does this request carry *any* valid device token for this restaurant?" — never by *which device type* or *which entity/field* is being written.** A customer-facing Kiosk or a kitchen KDS screen — the two lowest-trust device types in the product — hold exactly the same write authority as a POS Admin terminal for staff records, PIN hashes, menu prices, and order payment state. This single gap, confirmed independently by four different passes (`api-device-sync.md` DS-01, `pos.md` POS-01, `pos-admin.md` POSADMIN-02, `kds-captain.md` KDSCAP-01) at the exact same `entity-sync.controller.ts`/`entity-sync.service.ts` lines, is **CRIT-01** below and is responsible for a large fraction of the Medium-severity findings in every client app (they are downstream consequences: a forged manager PIN then unlocks POS discount/refund/void controls, which is why those controls look individually weak even though many of them do the right thing *given* a trustworthy staff identity).

Fixing CRIT-01 at the one server-side choke point (add a device-type allowlist per entity type in `EntitySyncController`/`EntitySyncService`) closes the exploit path for roughly a third of the register in a single change, without touching any client app.

---

## 4. Top findings (full register in `FINDINGS.md`)

| ID | Severity | One-line summary | Apps affected |
|---|---|---|---|
| CRIT-01 | **Critical** | Any device token (incl. Kiosk/KDS) can forge a manager-role staff account and read every staff PIN hash via cloud entity-sync | Cloud API, POS, POS-Admin, Captain, KDS, Kiosk |
| CRIT-02 | **Critical** | Any authenticated tenant user (even STAFF) can mark their own SaaS invoice PAID and revive/renew a suspended subscription — no payment gateway involved | Cloud API |
| CRIT-03 | **Critical** | The prebuilt `JamanvaarLocalCore.exe` shipped by one of two real packaging paths is proven (by string evidence + timestamps) to be built from the old, fully unauthenticated LAN server (0.0.0.0, wildcard CORS, zero auth) — not the patched one | Local LAN runtime / installers |
| HIGH-01 | High | `/support/search` and `/support/diagnostics` return raw credential rows — including an unsalted SHA-256 hash of a 6-digit password-reset OTP — to any platform role with `support:read`, including READ_ONLY. Full tenant-owner account takeover in under a second of offline hashing | Cloud API, Super Admin web |
| HIGH-02 | High | READ_ONLY/SUPPORT_ADMIN platform roles can read live, redeemable activation codes and mint a bearer device credential for any tenant | Cloud API, Super Admin web |
| HIGH-03 | High | READ_ONLY/SUPPORT_ADMIN can download full decrypted tenant backups (PII, PIN hashes, financials), unaudited | Cloud API, Super Admin web |
| HIGH-04 | High | POS-Admin's tenant login never sends `adminOnly`, so any tenant role — including STAFF — signs into the full Restaurant Admin console with manager-equivalent local privileges | POS-Admin |
| HIGH-05 | High | Order-sync has no branch isolation on pull (cross-branch PII leak) and no ownership/state-machine check on push (any device can overwrite or revert a settled order's payment status) | Cloud API, POS, KDS, Captain |
| HIGH-06 | High | A working SUPER_ADMIN credential (email + plaintext password) is committed to git in a tracked one-off script and an audit-brief markdown file | Repo-wide (git) |

Full detail, CVSS-style vectors, exact file:line evidence, repro steps and recommended fixes for these and the 25 Medium/Low findings are in [`FINDINGS.md`](FINDINGS.md).

---

## 5. Per-application risk

| Application | Risk | Why |
|---|---|---|
| Cloud API | **Critical** | Owns CRIT-02, HIGH-01/02/03, and is the server-side root cause of CRIT-01 and HIGH-05 |
| Local LAN runtime / installers | **Critical** | CRIT-03; also a 6-digit pairing PIN with no rate limit, reachable on the restaurant's whole LAN |
| POS-Admin (Tauri) | **High** | HIGH-04 (auth bypass into the full admin console) plus a JSON "restore" path that bypasses the signed-license scheme |
| POS (Tauri) | **Medium-High** | No RBAC inside the terminal beyond 5 UI prompts; downstream victim of CRIT-01 |
| Super Admin web | **Medium-High** | Client code is clean (no XSS, sound token handling); the severity here is entirely inherited from the Cloud API endpoints it calls |
| KDS / Captain (web) | **Medium** | Smallest attack surface of the seven apps (no Tauri shell, no local storage of anything beyond a device token); still a downstream victim of CRIT-01 |
| Kiosk / Kiosk Admin (Tauri) | **Medium** | Public-terminal-specific risk: unlimited offline PIN attempts on a walk-up device is a uniquely bad combination even though the underlying bug (no lockout) is shared with POS |

---

## 6. What to do next

Phases 0–3 of [`REMEDIATION-ROADMAP.md`](REMEDIATION-ROADMAP.md) — all Critical, all High, and the Medium register — are done, and Phase 4 (Low) is now 5 of 7 done; see its updated status. What's left, in priority order:

1. **Process step, not a code fix:** confirm whether the HIGH-06 credential was ever live anywhere, rotate it wherever it might have been, and purge it from git history (a working-tree delete is not enough).
2. **Process step:** confirm the real production deployment actually sets `NODE_ENV=production` (this pass fixed `cloud/api`'s own `start:prod` script, but can't verify whatever process manager/PaaS actually runs it in production) and confirm CORS/TLS/reverse-proxy configuration, none of which lives in this repository.
3. **Process step, if the LOW-06 fix is deployed:** run `prisma migrate deploy` against every real environment (staging/production), not just the local dev/test databases this pass verified against — and confirm the role that connects in each of those environments is not itself a superuser/BYPASSRLS role, the same class of mistake this pass's own verification caught locally (see `FINDINGS.md`'s LOW-06 entry).
4. Two Low items remain genuinely open, by deliberate scope decision rather than oversight: LOW-04's offline-expiry *enforcement* (as opposed to the data-correctness fix already applied) and LOW-07's remaining sub-items (seed-script price reversion, the fabricated revenue placeholder, `npm audit` advisories, installer trust-store scope, tracked build-artifact cleanup) — see `FINDINGS.md` for why each was left for the team rather than fixed unilaterally.
5. If MED-06's scope needs to go further than the three actions this pass covered, decide what a fuller terminal-internal permission system should look like — this pass deliberately scoped it to the named, concrete money/fleet-impact actions rather than a rewrite.

Every fix applied in this pass has a regression test committed alongside it — see `FINDINGS.md`'s status table for what each one covers, and the test files themselves (`cloud/api/test/*.e2e.spec.ts` for server-side fixes, `tests/*.test.ts` for client/shared-package fixes) for the exact assertions.
