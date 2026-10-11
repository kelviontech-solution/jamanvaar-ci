# Native update and hardening baseline — 11 October 2026

Audit recorded before implementation for this task. Base commit: a6e13aaf01f19088bc3c2c89b59cf0badd763120, with extensive existing remediation and user changes in the working tree. This is a source audit, not proof that production has upgraded.

## Architecture and identities

Five Tauri v2/Rust + React/TypeScript/Vite applications use Windows NSIS current-user installers and direct Android APK distribution. No Play-managed distribution is configured in the inspected workflow. Native versions come from tauri.conf.json and are already injected into Vite heartbeat clients; Cargo package versions remain 1.0.0.

| App | Identifier (preserve) | Native version |
| --- | --- | --- |
| POS | com.jamanvaar.pos | 1.0.4 |
| Restaurant Admin | com.jamanvaar.posadmin | 1.0.7 |
| Captain | com.jamanvaar.captain | 1.0.4 |
| KDS | com.jamanvaar.kds | 1.0.4 |
| Kiosk | com.jamanvaar.kiosk | 1.0.7 |

Windows registers tauri-plugin-updater and process under cfg(windows); Android registers the shared packages/tauri-plugin-apk-updater. Desktop capabilities allow updater/process; default capabilities allow shell-open but not arbitrary shell execution. Rust release profiles already strip symbols, disable debug info, and use thin LTO. Vite production bundles are minified with source maps disabled by default. These measures reduce exposure, not prevent reverse engineering.

All apps preserve the same existing updater public key, key ID 9C7A14F226BFB760. An ignored local private-key file and public companion exist; their private contents have not been printed or used, and compatibility with distributed binaries has not been established. Existing build-installers workflow sources the updater private key from GitHub Secrets, contrary to the new requirement to keep it outside GitHub. Do not rotate it. Windows Authenticode and Android signing identities require separate verification.

Client persistence is app-scoped OPFS SQLite (jamanvaar-pos, jamanvaar-pos-admin, jamanvaar-captain, jamanvaar-kds, jamanvaar-kiosk-user) with namespaced localStorage fallback. Branch Core has SQLite WAL/FULL durability, transactional schema migrations, and rejects schemas newer than it understands. No database name/path/schema changes are proposed. Existing backups and durable outboxes must remain intact.

Release chain: Super Admin → authenticated ApplicationsController → AppRelease → stable-release selection → heartbeat offer/public updater manifest → frontend or native installer. Metadata presently has URLs, signatures and hashes but no publication state, architecture/channel filtering in client offers, artifact validation record, or installed-version confirmation.

## Findings and proposed stages

| ID | Severity / confidence | Evidence | Impact / proposed change | Regression and verification |
| --- | --- | --- | --- | --- |
| U01 | High, confirmed | packages/ui/src/PlatformNoticeBanner.tsx; DeviceGateOverlay.tsx | Windows action opens a download link; mandatory action is a raw anchor. Route installed Windows through the official updater, including mandatory UI. | Keep web downloads, Android system installer. Mock failures and restart; real upgrade remains required. |
| U02 | High, confirmed | All five src/main.tsx; kiosk desktopUpdater.ts | Startup installs before durable storage boot and without operator consent; catches hide errors; manual kiosk reports installed before restart verification. Remove automatic installation, share guarded install lifecycle and progress, persist attempt and verify running native version on next startup. | Do not change offline billing. Flush SQLite and prevent update during operational interaction; test rejection and retry. |
| U03 | High, confirmed | applications.service.ts:222–279; dto/application.dto.ts | Publishing only creates a row; missing/inaccessible artifacts can become live. Latest release for one platform hides an older valid release for another. Version validation allows arbitrary strings. Validate native artifact and signature/checksum, add controlled availability and platform-specific selection. | Preserve existing legacy records. Test malformed metadata, platform mismatch and paused releases. |
| U04 | High, confirmed | APK plugin DownloadManager flow | No canRequestPackageInstalls/unknown-sources settings path. Download invocation resolves before installation; errors only Toast and no post-install verification. Add supported permission/resume/retry/status handling. | Never bypass Android consent. Actual SDK/device test required. |
| U05 | Medium, confirmed | common/version.ts; heartbeat.ts | Numeric-only comparator mishandles prereleases; Android WebView platform may report Linux and receive Windows URL. Use SemVer and Android user-agent detection. | Test prerelease ordering, invalid versions and exact platform targeting. |
| U06 | High, confirmed configuration gap | .github/workflows/build-installers.yml | Updater private key in GitHub Secrets; release tag derived only from Admin even when POS differs. Move Windows signing to a controlled self-hosted signing environment, validate each native identity/version and signed artifact. | No new keys. Never expose signer to untrusted PRs. Missing external signer is a release blocker. |
| U07 | Medium, unverified build gap | Android project generated in CI; plugin build.gradle.kts | No generated Android release project available locally. R8 behavior and keep rules cannot be assumed; Java shrinking does not protect Rust/JS. Configure generated release hardening with reflection-safe keep rules and fail if configuration differs. | Real release compile/installation and reflection smoke test needed. |
| U08 | High, historical artifact gap | prior evidence/ARTIFACT_SIGNATURES.json | 18 historical EXE/MSI files had no Valid Authenticode result. Their revision and updater signatures are unverified. No JAMANVAAR APK was found in previous inspection. | Do not execute or sign historical binaries to pretend they are current. Require real signed predecessor/successor acceptance test. |

## Baseline evidence and limits

Previous assessment: root 239 files / 1,774 tests passed; API 147 passed files / 1,335 passed tests / 2 skipped; final authority follow-ups passed; all seven frontend builds and API/type checks passed. Windows KDS cargo check passed; five Rust audits found zero vulnerabilities but upstream maintenance/unsoundness warnings remain. These are prior results, not new artifact acceptance.

Prior backend work enforces tenant RLS, server device/plan/role authorization, device-bound owner proof and signed offline extensions. This task will recheck relevant regressions rather than infer that client obfuscation grants authorization. Offline cached entitlements remain subject to existing check-in/grace policy. Local browser storage is not a trustworthy authorization boundary; server checks remain authoritative on reconnect.

Android SDK/JDK and actual signed test installations were not available in prior verification. Production release state, certificate fingerprints, compatibility of historical installers, hardware printing and upgraded installation data preservation cannot be proven from source alone. No keys, package IDs or user data will be reset. No production releases will be made to test updates.

## Implementation order

1. Add metadata validation, compatible release selection and controlled publication/withdrawal.
2. Unify Windows installed-app actions, guard installation, show errors/progress and verify native version after restart.
3. Repair Android permission/download/installer status and configure supported release hardening.
4. Enforce external signing and consistent per-app release evidence.
5. Run focused source/backend/native/build checks and document actual results and upgrade blockers.

Official references: https://v2.tauri.app/plugin/updater/ and https://v2.tauri.app/distribute/sign/android/ . Current Tauri v2 NSIS updater artifacts can be the signed .exe with matching .sig when createUpdaterArtifacts=true; do not assume a v1 ZIP or substitute arbitrary installers.
