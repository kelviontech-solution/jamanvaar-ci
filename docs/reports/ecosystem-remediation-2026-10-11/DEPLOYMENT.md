# Remediation deployment and release acceptance

These changes have been exercised locally against an explicitly named, disposable QA database. They have not been deployed or published. Preserve the baseline assessment at commit `a6e13aaf01f19088bc3c2c89b59cf0badd763120`; this remediation assesses the changed workspace, including existing user changes.

## Database and API

1. Take and verify a restorable backup before applying the three additive migrations: `20261011100000_assessment_tenant_rls`, `20261011101000_webhook_delivery_lease`, and `20261011102000_release_artifact_hashes`.
2. Run migrations using the established migration identity. Run the application without PostgreSQL superuser/BYPASSRLS privileges. The QA tests deliberately use a non-bypass role.
3. Production requires `REQUIRE_STAFF_SESSION=true`. Owner/manager sign-in is required for staff administration; a terminal bearer alone cannot create an approving manager. Sensitive order changes need current, verified human authority. Ordinary offline sales still use the LAN core. Sensitive cancellations/refunds wait for the cloud and must not be represented as confirmed to the kitchen while pending.
4. The API container now runs as UID 1000. Check ownership of existing upload/backup volumes before rollout. Prisma migrations remain a runtime dependency; seed uses compiled JavaScript. Docker image build/startup, volume permissions and production recovery rehearsal remain acceptance gates because Docker is unavailable on this workstation.
5. Connector receivers must deduplicate the signed `deliveryId` / `X-Delivery-Id`. A lease prevents concurrent sends by workers, but HTTP delivery remains at least once: a receiver may accept a request before its response is lost.

## Native signing

Configure GitHub protected environments/secrets and repository variables; do not put credentials in source or browser build variables.

| Platform | Required configuration |
| --- | --- |
| Shared public endpoints | `VITE_CLOUD_API_BASE_URL`, `VITE_QR_ORDER_URL`: public HTTPS URLs |
| Windows | `TAURI_SIGNING_PRIVATE_KEY`, optional corresponding password, `WINDOWS_SIGNING_PFX_BASE64`, `WINDOWS_SIGNING_PASSWORD`, `WINDOWS_SIGNING_CERT_SHA256`, `WINDOWS_TIMESTAMP_URL` |
| Android | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_SIGNING_CERT_SHA256` |

The Windows certificate must be trusted for customer distribution; a self-signed test certificate does not establish public trust. The Tauri signing private key must match the updater public key embedded in each application's configuration. Keep the Android key stable and securely backed up. Debug-signed installations generally cannot upgrade under a different release key; test that transition separately and provide a controlled migration where necessary.

The installer workflow now depends on the quality/security jobs, requires release signing, checks artifact signatures and publishes a draft rather than an automatically public release. An administrator must configure actual signing material and validate the resulting release on Windows/Android. The new native compilation workflow covers POS, Restaurant Admin, Captain, KDS and Kiosk with committed lockfiles. It is not evidence that GitHub CI has already run successfully.

## Android updater

Publish an SHA-256 digest for each Android download with its release metadata. Increment the actual package version code and keep the published version consistent with the built application; changing only the platform release label does not make an APK upgradeable. Native installation requires HTTPS, a matching digest, the same package and signing certificate as the installed app, a higher version code, and a non-debuggable candidate. Verification runs off the UI thread. Android still prompts the user to install.

Before release, exercise valid update, HTTP URL, wrong hash, wrong package, older version, debug build, wrong signer, download failure, concurrent update and interrupted download on an isolated device. These device tests are pending: no JAMANVAAR APK or Android SDK is available in the inspected locations. Historical installers are not re-signed by changing the workflow.

## Client credential storage and operations

Windows branch-core sealing keys now use CurrentUser DPAPI, with migration of the existing adjacent key. Run the service under the same dedicated Windows identity and back up/recover that identity appropriately. Copying its protected key to a different Windows account should fail. A process already running as that account remains inside the trust boundary. Non-Windows key-file permissions and browser localStorage credentials still require a separate threat-model review and native credential-vault work.

Keep dev servers/S3 test fixtures private. Nine development-only npm alerts remain in the final scan. Replacing the S3 emulator and migrating Tailwind 3 require their own compatibility verification; they are not silently waived or counted as fixed. Production npm audit is clear. Rust audits report no vulnerabilities across the five lockfiles, with upstream unmaintained/unsound warnings retained in the evidence.

Before declaring production readiness, run the gated CI workflow, build/start the container, rehearse backup restore, perform real payment-provider sandbox and refund verification, sign and test every native release, and run representative multi-branch load/soak tests. Restaurant-wide sequence locking is retained for correct cursor ordering; the local 32-write test does not certify large-tenant throughput.
