# Defensive security assessment

This is a repository, local-test and configuration assessment. It is not a formal penetration test, compliance certificate or production infrastructure assessment.

## Controls found

- Platform and tenant tokens use distinct issuer/audience checks; active user/session state is rechecked. Platform area RBAC denies unmapped/unauthorized actions.
- Device identity, restaurant status, branch binding, product availability and lock/revocation are checked server-side. Branch licenses and device quotas exist; frontend visibility is not their only enforcement.
- Tested database role is not superuser and does not bypass RLS. Fresh migrated database metadata shows forced RLS on 43 of 45 restaurantId-bearing tables. AuditLog and PlatformNotification are platform-controlled exceptions, so an “all tenant tables protected by RLS” blanket claim would be inaccurate.
- Branch membership constraints, request schemas, device/service signatures, signed staff/approval evidence and narrow sensitive-action checks exist.
- Razorpay signature verification, amount/currency/provider-reference checks, idempotent allocations and guarded refund balance logic exist. A client success screen alone is not accepted as gateway proof.
- Helmet, constrained CORS, body-size rules, request IDs/redaction and authentication throttles are present. Public QR has database-backed multi-key rate counters shared across API instances.
- Payment credentials and optional backup objects use AES-GCM mechanisms. Password/PIN security uses hashing and scope; local device security is not equivalent to protection from a machine administrator.
- Release pipelines reference dedicated signing controls, immutable action revisions, updater public keys and platform identity verification. This audit did not access private signing keys.

## Findings and residual exposure

| Area | Evidence / severity | Recommendation |
| --- | --- | --- |
| Backup encryption policy | EC-15: configuration-dependent high-impact risk; invalid/missing key can disable API encryption. Actual production encryption/S3 policy unknown. | Enforce explicit required-encryption policy; reject invalid production configuration; test key recovery without printing key contents. |
| Device-priced order integrity | EC-03 and the generic ingestion review policy: incomplete Captain choices can be added, and device pricing relies partly on review flags to preserve offline service. No cross-tenant bypass demonstrated. | Shared validation plus auditable acceptance/review for legacy offline orders; verify required choices, not only prices/quantity. |
| Generic entity contracts | payload records are intentionally generic; catalog validation and authority checks exist, but non-catalog domain validation needs per-entity review. Source-backed audit boundary, not a claimed exploit. | Document writer/reader roles and server validation for each entity type; negative tests for tampered values and branch scope. |
| Restore data integrity | EC-05/06: recovered public identity/history/financial evidence incomplete. Authorized operation, not unauthorized access. | Treat restore as a privileged reviewed recovery operation with explicit scope and invariant checks. |
| Local HTTP deployment | Local service/Branch Core credentials and branch authorization exist; optional TLS and local host trust need deployment acceptance. | Define supported LAN threat model; verify protected transport, device storage and operating-system account policies. Do not send cloud credentials to arbitrary discovered endpoints. |
| Native/Android acceptance | Source hardening/signature mechanisms found, original installed upgrade and artifact inspection not performed here. | Build on the trusted signing runner and upgrade existing installations; verify tampered-artifact rejection, certificate/package identity and data retention. |

## Dependency and secret checks

Executed `npm audit --omit=dev --json`: **0 reported production npm advisories**, 297 production dependencies in returned metadata. This says nothing about unidentified application vulnerabilities or Rust/platform dependencies. `cargo audit`, native artifact extraction and installed EXE/APK inspection were not performed in this audit.

A limited tracked-text scan searched private-key headers, AWS access-key patterns, GitHub token patterns and Razorpay key patterns in bounded text files. No matches and no tracked `.env` file were found. It was not an exhaustive entropy scan, Git history review, binary scan or proof that every secret is correctly stored. No secret contents are included in these reports.

Frontend JavaScript, APK contents and native binaries can be inspected/reverse engineered. Minification, R8 and symbol stripping reduce exposure and size; authorization, entitlement checks and private credentials must remain protected on the server. No “reverse engineering impossible” claim is made.

## Acceptance still required

1. Negative HTTP tests for each sensitive route family, including branch/product override and realtime subscriptions.
2. Current live/sandbox payment account setup, delayed/duplicate/out-of-order provider events and verified refunds; no real money was used here.
3. Installed client revocation/reconnect and cached offline-entitlement policy, including device replacement without data loss.
4. Encrypted off-site recovery with lost/corrupt object and key-unavailable scenarios.
5. Signed native upgrades over the currently distributed version, not only fresh builds.

Security score in SCORECARDS.md is provisional and bounded by these unverified areas. It does not supersede release blockers in data correctness or recovery.
