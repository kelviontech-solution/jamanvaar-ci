# Native update deployment and acceptance

Do not publish the unsigned local compile outputs. Preserve application IDs, original signing certificates, the existing Tauri updater key and all storage namespaces. App versions were not bumped during the audit; choose a strictly newer per-app version for the accepted release and verify it in the actual packaged binary/APK. Build tags are not application versions.

## Server rollout

Back up the API database using the normal deployment procedure. Apply `20261011110000_native_release_availability` and `20261011111000_device_update_report` through `prisma migrate deploy`, then deploy the API containing matching generated Prisma models. These migrations have only been exercised on isolated QA locally. Deploy Super Admin and client changes as a coordinated release.

Set `RELEASE_ARTIFACT_HOSTS` to exact public hostnames hosting immutable artifacts, including any CDN hosts reached by redirects. No wildcards, private/IP endpoints or credential-bearing URLs. An unset allowlist intentionally prevents new native publications. Keep public manifest availability and original signed NSIS filename metadata intact when copying artifacts to hosting.

Review existing AppRelease rows with null `artifactVerifiedAt`: test their artifacts or pause them through Super Admin. Pausing a release removes new stable offers without deleting history. It cannot reverse an installation already started. Do not use a SQL edit to mark an unverified legacy file as verified.

## Signing runner and artifacts

The read-only [CI signing configuration check](evidence/CI_SIGNING_CONFIGURATION.json) found no Android signing secrets/variables in either checked repository, and no registered runner or environment on the CI repository. Configure the restricted signer and public release URLs before dispatching. The CI repository still has older updater-key secret names; their values were not accessed and the revised workflow does not use them. Provision the preserved key outside the checkout on the signing machine, verify compatibility, then remove obsolete GitHub private-key secrets through the authorized operational process. Do not replace the original Android keystore with a newly generated one.

The Windows workflow needs a restricted self-hosted Windows/X64 runner labelled `jamanvaar-signing`, the `native-release-signing` environment, and protected main-branch dispatch/environment controls. Never run untrusted pull-request code there. Machine variables `JAMANVAAR_UPDATER_KEY_PATH` and optional `JAMANVAAR_UPDATER_KEY_PASSWORD` must reference the preserved key outside the checkout. Restrict access to the runner identity; do not put the key in GitHub Secrets, logs, OneDrive or source control. Configure the existing Authenticode PFX/password/fingerprint and timestamp URL separately. A self-issued historical certificate is not proof of consumer trust; investigate the chain and verify signatures without disabling verification or installing a root certificate just to make a test pass.

For POS, build the current Local Core through a trusted reviewed process, verify static asset paths and unchanged existing data paths, and prove that unauthenticated `GET /api/orders` returns HTTP 401 on an isolated test port/data directory. Place `${binary}.provenance.json` next to `binaries/JamanvaarLocalCore-x86_64-pc-windows-msvc.exe` with `sourceSha256` for `tooling/local-runtime/local_service.cjs`, `binarySha256`, target `x86_64-pc-windows-msvc`, and `unauthenticatedOrdersStatus: 401`. Record actual runtime/build logs; never fabricate this JSON to bypass the release gate. The record is checked before bundling; Authenticode and updater signature checks remain separate.

Android needs the original keystore, alias/passwords and `ANDROID_SIGNING_CERT_SHA256`, Java 17, SDK build tools and NDK 27.0.12077973. The pinned Tauri CLI initializes its Android project, the release script enables R8/resource shrinking and keeps bridge reflection, and packaging verifies the final signed APK. Preserve each application ID and require a version code greater than the installed predecessor. CI emits arm64 APKs; test device ABI before publishing. The authorized local bootstrap installed verified JDK/SDK downloads under `C:\Users\OM Sanjhira\.jamanvaar-build-tools` using only child-process environment settings. On this Windows account, Tauri's symlink handoff is disallowed; local Gradle validation copied the successfully compiled native library and compared its hash. CI uses Linux for Android and still needs its own full build acceptance. No global Windows developer mode/security setting was changed.

Every app's `build.rs` now rejects release mode if Tauri's production `custom-protocol` feature is absent. Use the official Tauri build commands for packaging. The local Windows validation runner explicitly uses `--features tauri/custom-protocol`; earlier plain optimized Cargo outputs are development-context compile checks and must not be distributed.

Builds use `VITE_CLOUD_API_BASE_URL` and `VITE_QR_ORDER_URL` public HTTPS values at job level so Tauri's second frontend build receives the same configuration. CI requires NSIS `.exe` plus Tauri `.exe.sig`, validates Authenticode, and emits per-app `RELEASE_INVENTORY.json`. A draft GitHub build is not automatically an AppRelease publication.

## Installed-device acceptance

Use the actually distributed predecessor for **each of the five apps**, not a fresh installation. Record predecessor/successor package ID, native version/version code, updater public-key ID, signing fingerprints, architecture, installation location and app-data directory. Do not uninstall or clear data between versions.

1. On a test restaurant/branch, save an offline bill, queue sync, retain device activation/staff/settings, print a receipt and record SQLite/relay backup plus database counts. Record unsent outbox IDs so duplicate replay can be checked.
2. With an unfinished POS, Captain or kiosk order, confirm updating is blocked. Hold/finish that order, finish any printing, then run the update explicitly. Fail the local flush once and confirm the previous app remains usable.
3. Check progress and errors for interrupted download, invalid checksum, wrong updater key, modified trusted comment, wrong application/version/ABI and expired/unreachable hosted URL. No failed case may execute an unverified installer. Retry without creating another installed copy.
4. Windows: verify the original installation location is upgraded, the app restarts, and native `getVersion()` equals the offered version. Check the installed signer separately. Do not treat a downloaded EXE or process start as success.
5. Android: first deny installation permission, then grant it via system settings and retry. Cancel the system installer once, retry, then confirm the update. Close/reopen the app during download and verify recovery stays in READY_TO_INSTALL until a foreground action. Confirm matching certificate/package, increasing versionCode and compatible ABI.
6. Before reconnect, verify offline billing, old orders, activation and local data remain available. Reconnect, verify server entitlements and tenant/branch restrictions, and confirm each saved outbox item synchronizes once. Check receipt printing, inventory and loyalty/payment correctness without changing customer data.
7. In Super Admin, verify the device-reported actual installed version and VERIFIED/NOT_INSTALLED/FAILED state. Try a paused release and a newer Android-only release: neither may be incorrectly offered to Windows. Test optional and mandatory update gates.
8. Stop the app safely and rehearse restore using the existing encrypted Branch Core backup process on a separate test copy. Never install an older binary against a newer SQLite schema: the existing schema check refuses it. Reverting a release manifest is not a data rollback.

Record evidence per case. Do not enable mandatory enforcement or broad publication until predecessor upgrades and persistence/printing/reconnect checks pass. Do not rotate keys or package IDs as an update workaround.

## Existing wrapper installations

This machine has older wrapper registrations under `com.kelviontech.jamanvaar.kiosk`, `.kioskadmin`, `.pos` and `.posadmin`, beside current Tauri product registrations. They are different installer/distribution systems. Do not silently delete these registrations, rename the current package IDs or point a wrapper at a Tauri updater manifest to pretend it is a compatible in-place upgrade.

Prepare a separate migration release: identify each old wrapper's actual browser profile/data directory and relay database, stop billing safely, back up and record its unsent order IDs, install the unchanged-identity Tauri app, perform an ownership-checked data import, verify activation and offline/reconnect behavior, then update shortcuts/default launch paths. Keep the original app/data and uninstall registration until recovery and duplicate-sync tests pass. Only then can an authorized cleanup remove the old launcher/registration. This migration is not implemented or executed by the current updater changes.
