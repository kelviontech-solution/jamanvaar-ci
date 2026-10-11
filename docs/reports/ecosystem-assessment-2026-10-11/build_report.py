"""Build the audit deliverables from explicit findings and retained execution evidence."""
from pathlib import Path
import json, hashlib, shutil, re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = Path('C:/Users/OMSANJ~1/AppData/Local/Temp/jamanvaar-assessment-a6e13aaf01f1')
E = HERE/'evidence'
REV = 'a6e13aaf01f19088bc3c2c89b59cf0badd763120'
inventory = json.loads((E/'INVENTORY.json').read_text(encoding='utf8'))
def readlog(name):
    raw=(E/name).read_bytes()
    return raw.decode('utf-16') if raw.startswith(b'\xff\xfe') else raw.decode('utf-8-sig',errors='replace')

weights = {
 'security': [('Authentication and authorization',15),('API security and input validation',15),('Tenant isolation and data protection',15),('Secrets and cryptographic controls',10),('Dependencies and supply chain',10),('Deployment and infrastructure security',10),('Session, payment and business logic security',10),('Desktop/mobile integrity and reverse engineering',5),('Logging, monitoring, backup and recovery',5),('Security testing and remediation evidence',5)],
 'quality': [('Architecture and separation',15),('Maintainability and readability',15),('Configuration and hardcoded values',10),('Type safety and validation',10),('Domain logic and data integrity',15),('Testing quality',10),('Performance and scalability',10),('Errors and observability',5),('API and cross-app consistency',5),('Documentation and deployment reproducibility',5)],
 'saas': [('Tenant and branch isolation',25),('Tenant configuration and domain integrity',15),('Onboarding and modular entitlements',20),('Integration and synchronization reliability',15),('Operations, recovery and observability',15),('Deployment and upgrade compatibility',10)]
}
base={'security':[4,6,5,7,4,4,5,4,7,6], 'quality':[6,5,7,6,6,5,6,7,6,7], 'saas':[5,7,7,6,4,4]}
def score(kind, values): return round(sum(w*s for (_,w),s in zip(weights[kind],values))/100+1e-9,1)
apps=[
 ('Cloud API','cloud/api', 'Public HTTPS API + platform/tenant/device identities', 'PostgreSQL/Prisma, REST, SSE/PG notification, payment/backup/webhook jobs', {}, 'High for probed boundaries; medium for remaining source', 'SEC-01/02/03/04; dependency alerts; worker race'),
 ('Super Admin','cloud/super-admin-web', 'Privileged browser application', 'Platform auth, plans, activation, configuration, aggregate reports', {'security':{0:6,2:6},'quality':{1:5,8:5}}, 'Medium; API authorization tested, every screen NOT TESTED', 'Shared backend controls, oversized onboarding/detail, shared barrel import'),
 ('POS','apps/restaurant-system/pos', 'Staff browser/PWA + Tauri Windows/Android', 'Local SQLite, branch core, customer/loyalty, counter collections and sync', {'security':{0:3,6:4},'quality':{1:4}}, 'High for sync/authorization probes; medium for client source', 'Device-to-manager escalation and missing-proof fallback'),
 ('Restaurant Admin','apps/restaurant-system/pos-admin', 'Owner/manager browser + Tauri', 'Owner session + admin device, menu/staff/configuration/reporting', {'security':{0:5},'quality':{1:4}}, 'Medium; backend tests, UI routes NOT TESTED', 'Staff authority boundary, shared application complexity'),
 ('Kiosk Admin context','apps/restaurant-system/pos-admin/src/kiosk', 'Product context inside the shared admin application', 'Kiosk configurations, welcome assets, receipts, fleet controls', {'security':{0:5},'quality':{0:5,1:4}}, 'Medium; not a separate executable source application', 'Shares admin backend and release controls'),
 ('QR Admin + public product site','apps/restaurant-system/pos-admin/src/components/qrconsole', 'Separate /qr/ marketing, login and admin entrypoints', 'QR configuration, menu publishing, branch tables, customer preview', {'security':{0:5,7:5},'quality':{0:6}}, 'Medium/low; API tested, route-by-route browser review NOT TESTED', 'Shared admin/backend dependencies; unverified UI workflows'),
 ('QR Customer Ordering','apps/qr-guest', 'Public /q/ capability route, guest session', 'Server-priced menu/order, gateway checkout, status and service requests', {'security':{0:6,1:7,6:6,7:5},'quality':{0:7,1:7,3:7}}, 'High for selected API payment cases; medium for source', 'Unknown-state sync bypass downstream; mobile gateways NOT TESTED live'),
 ('Kiosk Customer','apps/kiosk-system/kiosk-user', 'Public touchscreen, device credential, Tauri/PWA', 'Server checkout + local cart, own payment lookup, receipt flow', {'security':{0:6,6:6},'quality':{1:4}}, 'Medium; API payment/ownership tested, touchscreen hardware NOT TESTED', '4,214-line app, native update and device storage risk'),
 ('Captain','apps/restaurant-system/captain', 'Staff PIN + device identity; browser/PWA/Tauri', 'Branch tables/orders/service requests and sync', {'security':{0:6},'quality':{1:6}}, 'Medium; API multi-device tests, native/device tests NOT TESTED', 'Shared order engine and offline release verification'),
 ('KDS','apps/restaurant-system/kds', 'Kitchen device + staff identity; browser/PWA/Tauri', 'Branch order pull, ready/served status, stations and tickets', {'security':{0:6,6:4},'quality':{1:7,3:7}}, 'High for status bypass; medium for UI source', 'SEC-03 permits reopening a cancelled order'),
 ('Branch Core','packages/branch-core', 'Local/LAN operational service, paired branch/device', 'Node SQLite/WAL, local backup, discovery and cloud uplink', {'security':{0:5,4:5,7:3},'quality':{0:6}}, 'Medium; selected root tests; physical LAN penetration NOT TESTED', 'Adjacent credential key, branch sync throughput and release sidecar provenance'),
 ('Legacy local runtime','tooling/local-runtime', 'Local helper/service scripts; deployment selection matters', 'CJS local service, sync server, launcher/SEA packaging', {'security':{0:4,1:5,2:4,7:3,9:4},'quality':{0:4,1:4,3:4},'saas':{0:4,1:5,2:5,5:3}}, 'Low; secondary source inspection; actual production use NOT TESTED', 'Multiple runtime implementations; avoid shipping unintended legacy path'),
]
scorecard={'revision':REV,'date':'2026-10-11','status':'PROVISIONAL','confidence':'Moderate overall; high for six targeted probes','weights':weights,'ecosystem':{k:{'dimensions':dict(zip([n for n,w in weights[k]],v)),'score':score(k,v)} for k,v in base.items()},'applications':[]}
for name,path,exposure,integrations,overrides,confidence,concern in apps:
    row={'application':name,'path':path,'exposure':exposure,'integrations':integrations,'status':'PROVISIONAL','confidence':confidence,'mainConcern':concern}
    for k in base:
        values=base[k].copy()
        for i,v in overrides.get(k,{}).items(): values[i]=v
        row[k]={'score':score(k,values),'dimensions':dict(zip([n for n,w in weights[k]],values))}
    scorecard['applications'].append(row)
(HERE/'SCORECARD.json').write_text(json.dumps(scorecard,indent=2),encoding='utf8')

findings=[]
def f(id,severity,title,status,refs,affected,conditions,evidence,impact,fix,tests,effort):
    findings.append(dict(id=id,severity=severity,title=title,status=status,references=refs,affected=affected,conditions=conditions,evidence=evidence,impact=impact,remediation=fix,regression=tests,estimatedEffort=effort))
f('SEC-01','HIGH','A POS device can mint manager authority through staff synchronization','CONFIRMED / OPEN',
 ['cloud/api/src/modules/entity-sync/entity-authority.ts:31','cloud/api/src/modules/entity-sync/entity-sync.controller.ts:34','cloud/api/src/modules/entity-sync/entity-sync.service.ts:72','cloud/api/src/modules/entity-sync/staff-approval.service.ts:42'],
 'POS, Restaurant Admin staff/RBAC, Cloud API and manager-approved operations',
 'Valid activated POS bearer credential. No owner login, existing manager PIN or signed staff approval is needed. This is an intra-restaurant privilege escalation, not a demonstrated platform-admin or cross-tenant takeover.',
 'Probe creates a synthetic STAFF_USER with role-manager and attacker-chosen PIN hash using only POS authorization, then receives a genuine signed manager approval token. KDS creation is rejected as a negative control.',
 'Device-type permission substitutes for human administrative authority. A cashier-level terminal credential can establish its own approving manager.',
 'Require owner or authorized human administrator evidence for staff creation and role/PIN/active-state changes. Give offline staff changes an explicit bounded authorization envelope; a device identity alone must not authorize security-sensitive account administration.',
 'POS-only manager creation/role upgrade/PIN reset/deletion denied; authorized owner/manager allowed; role revocation and offline retry replay tests. Re-run the probe expecting rejection.', '2–4 days including offline compatibility')
f('SEC-02','MEDIUM','Three tenant tables lack the established database RLS boundary','CONFIRMED / OPEN',
 ['cloud/api/prisma/migrations/20260929192800_whatsapp_channel_connection/migration.sql:1','cloud/api/prisma/migrations/20260930125247_outbound_webhook_delivery/migration.sql:1','cloud/api/prisma/migrations/20261005090000_manual_payouts/migration.sql:1'],
 'WhatsApp channel connections, outbound webhook payloads, restaurant payouts',
 'An application query omits tenant scoping, or uses a foreign identifier within a tenant transaction. The probe uses a non-superuser without BYPASSRLS. A direct HTTP cross-tenant exploit was NOT demonstrated.',
 'Unscoped reads return synthetic rows in all three tables; tenant B can read tenant A payout. The same unscoped query against protected Restaurant returns null.',
 'The database cannot contain an application scoping mistake for these tenant records, despite the intended runAsTenant contract.',
 'Add additive ENABLE/FORCE RLS migrations and policies matching established transaction context. Preserve authorized platform jobs. Add a schema invariant test for every restaurant-owned table with documented platform exceptions.',
 'Unscoped and foreign-tenant reads/writes denied; owning tenant and explicit platform jobs succeed; migrations tested on existing data.', '1–2 days plus migration rehearsal')
f('SEC-03','MEDIUM','Unknown order states bypass terminal-state restrictions','CONFIRMED / OPEN',
 ['cloud/api/src/modules/order-sync/order-rules.ts:48','cloud/api/src/modules/order-sync/dto/push-order-sync.dto.ts:98','cloud/api/src/modules/order-sync/order-sync.service.ts:263'],
 'Cloud order sync, KDS and all interfaces consuming canonical order status',
 'Valid branch KDS credential and a cancelled synthetic order. Unknown status strings are accepted by the request schema.',
 'Pure rule and actual API/DB probes persist CANCELLED → AUDIT_UNKNOWN → NEW. Direct CANCELLED → NEW is rejected by the ordinary rule.',
 'A sentinel intermediate status bypasses the lifecycle guard, allowing a cancelled ticket to reopen. No gateway payment forgery or actual refund transfer was proved.',
 'Validate canonical statuses and a finite versioned legacy alias map before applying transitions. Reject unknown values with a retry-safe conflict. Apply equivalent validation to item kitchen/payment states.',
 'Unknown-state and mixed-case/legacy-alias probes; every terminal-state transition by device type; old offline client compatibility.', '1–2 days')
f('SEC-04','MEDIUM','Missing staff proof defaults to accepting sensitive sync actions','CONFIRMED DEFAULT POLICY / OPEN; deployed setting NOT TESTED',
 ['cloud/api/src/config/env.validation.ts:59','cloud/api/src/modules/order-sync/order-sync.service.ts:368','cloud/api/src/modules/order-sync/order-sync.service.ts:403'],
 'POS void/cancel/refund/correction sync and operational auditability',
 'Device bearer with no signed human evidence and REQUIRE_STAFF_SESSION unset/false. Production environment value was deliberately not read.',
 'Probe successfully cancels a synthetic order without staff proof; stored actorVerified is false and the conflict is recorded. Source documents the offline fallback intentionally.',
 'Flagging does not enforce manager approval. A request with a cashier proof is refused while omitting the proof can be accepted under this policy.',
 'Define an explicit production policy. For sensitive operations, accept verifiable bounded offline authorization or quarantine for approval; retain ordinary offline sales. Do not simply disable offline operation. Address SEC-01 before treating manager evidence as trustworthy.',
 'No-proof, cashier-proof, owner/manager-proof, expired/revoked proof, backdated offline events, reconnect and retry cases under both policy values.', '2–4 days')
f('SEC-05','HIGH','The publish workflow produces debug-signed Android APKs','CONFIRMED RELEASE CONFIGURATION / OPEN; installed production APK NOT TESTED',
 ['.github/workflows/build-installers.yml:160','.github/workflows/build-installers.yml:170','.github/workflows/build-installers.yml:183'],
 'Five native app release variants and Android upgrade compatibility',
 'Running the repository installer publishing workflow. No APK was available in the inspected artifact locations to independently verify its signing certificate.',
 'Android build is explicitly --debug and the resulting APKs are uploaded into the release pipeline. Stripping dev symbols does not make this a release-signing policy.',
 'Production release provenance, stable signing identity, upgrade compatibility and debug-hardening are not established. This is not evidence of silent remote APK installation.',
 'Use release builds and a protected stable Android signing identity, fail closed on missing signing material, and verify package/version/signer before publish. Separate test builds from customer releases.',
 'Clean CI release build, APK signer/debuggable inspection and upgrade-over-previous-release on an isolated device.', '2–3 days plus device verification')
f('SEC-06','MEDIUM','Cloud API runner defaults to root and retains development dependencies','CONFIRMED CONTAINER CONFIGURATION / OPEN; deployed runtime identity NOT TESTED',
 ['cloud/api/Dockerfile:40','cloud/api/Dockerfile:53'],
 'Cloud API container, migrations and deployment',
 'Building the supplied Dockerfile without a runtime user override.',
 'Runner has no USER directive and copies complete workspace node_modules including development tooling. Retention is explicitly intentional for Prisma/seed tooling.',
 'Any application compromise has greater container privileges and a larger installed attack surface. Container breakout or a production exploit was NOT tested.',
 'Run the application as a dedicated non-root user. Separate migration/seed tooling or maintain a justified minimal runtime allowlist. Keep required native engines and writable paths working.',
 'Container UID, health/startup/migration smoke tests, read-only filesystem compatibility and production dependency/SBOM checks.', '1–2 days')
f('SEC-07','MEDIUM','Android native update command does not validate update provenance','CONFIRMED SOURCE / OPEN',
 ['packages/tauri-plugin-apk-updater/android/src/main/java/com/jamanvaar/apkupdater/ApkUpdaterPlugin.kt:39','packages/tauri-plugin-apk-updater/android/src/main/java/com/jamanvaar/apkupdater/ApkUpdaterPlugin.kt:54','packages/tauri-plugin-apk-updater/android/src/main/java/com/jamanvaar/apkupdater/ApkUpdaterPlugin.kt:100'],
 'Native Android updater shared by applications',
 'An untrusted URL reaches the native command, for example through compromised renderer/update metadata. Actual native exploit path and installed package behavior NOT TESTED.',
 'Only blank URL is rejected; download success/file presence triggers install intent. No HTTPS/host policy, expected digest, package name or expected certificate check is performed in this native boundary.',
 'An untrusted download can be presented to the user. Android still requires consent and enforces signer matching for updates to an existing package; do not infer silent arbitrary code execution.',
 'Validate transport and an authorized download host/redirect policy, authenticated release metadata, expected hash, package/version and signer natively before presenting installation.',
 'HTTP/untrusted-host/redirect/digest/package/signer mismatch rejected; authorized update accepted on device.', '2–3 days')
f('SEC-08','LOW','Client credentials remain readable within their application context','CONFIRMED DESIGN / CONDITIONAL RISK',
 ['apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts:115','apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts:121','packages/branch-core/src/secret-seal.ts:13'],
 'Admin browser device registration and branch-core local credential storage',
 'Same-origin script execution or access to the logged-in device/data directory. No XSS or local physical takeover was demonstrated.',
 'Admin device bearer is stored in localStorage. Branch-core seal uses AES-GCM but its key is an adjacent file; its comment explicitly limits protection to copying the DB alone.',
 'A browser/native client is inspectable; local encrypted bytes do not establish a server authorization boundary. An XSS/device compromise amplifies SEC-01. Windows chmod semantics and disk/customer-data ACLs were NOT tested.',
 'Maintain least-privilege revocable device credentials and strong server authorization; use native OS credential storage where available. Keep offline continuity and document the supported physical-access threat model.',
 'Revocation on next request, logout/profile cleanup, native keystore recovery and synthetic disk-copy test.', '2–4 days')
f('DEP-01','HIGH','Locked dependencies contain production vulnerability alerts','SCANNER ALERT / REACHABILITY PARTLY REVIEWED; exploit NOT CONFIRMED',
 ['package-lock.json:1','cloud/api/src/modules/platform-settings/welcome-designs.service.ts:60','cloud/api/src/main.ts:1'],
 'Cloud API and client/build dependencies; exact reachability differs by package',
 'Affected locked package and the vulnerable code path must be reachable. Package counts are not independent vulnerabilities or exploit counts.',
 'npm audit all: 45 packages (5 critical/20 high/16 moderate/4 low). --omit=dev: 13 packages (1 critical/4 high/7 moderate/1 low). These two counts overlap. Raw advisory details are retained.',
 'Patch backlog exists, but proxy-addr critical subnet assumptions do not match the inspected numeric trust-proxy setting; client React Router does not use SSR here; no direct FileInterceptor usage was found. The sharp uploader intends WebP-only but inspects metadata before checking the detected format, so SVG decoder reachability remains unresolved. These observations do not eliminate every advisory.',
 'Triage each advisory by installed version/call path; update in small compatible groups and retain justification for inapplicable paths. Prune unnecessary runtime tooling and generate an SBOM. Do not blindly apply npm audit fix --force.',
 'Auth/proxy throttling, upload parsing, route redirects, API/root regressions and repeat lock-based audit.', '2–5 days initial triage')
f('ART-01','MEDIUM','Available Windows artifacts lack verified distribution signatures','CONFIRMED ARTIFACT OBSERVATION / revision association UNKNOWN',
 ['docs/reports/ecosystem-assessment-2026-10-11/evidence/ARTIFACT_SIGNATURES.json:1','.github/workflows/build-installers.yml:64'],
 'Local Windows installers/executables, including older separate Kiosk Admin binaries',
 'Local artifact files discovered in named release and Tauri bundle directories. They were not launched and cannot be attributed to the source commit.',
 '23 assets inventoried: 18 EXE/MSI and 5 ICNS. Authenticode reports 14 NotSigned and 4 UnknownError; none returned Valid. Hashes retained. UnknownError is inconclusive, not proof of missing signature.',
 'Users cannot rely on a verified Windows publisher for these observed artifacts. Tauri updater .sig verification is a different mechanism from Windows Authenticode.',
 'Produce revision-linked release manifests/SBOM and enforce Windows publisher signing plus updater signatures. Investigate UnknownError on a trusted signing-verification host.',
 'Authenticode verification, manifest hash linkage, valid/tampered updater signature and installation/rollback on isolated Windows VM.', '1–3 days plus certificate setup')
f('QUAL-01','MEDIUM','Baseline type checks fail in both projects','CONFIRMED / OPEN',
 ['cloud/api/src/modules/menu-publications/menu-publications.service.spec.ts:21','tests/crm_loyalty_checkout.test.ts:21','tests/kitchen_controls_and_captain.test.ts:86','tests/loyalty_earn_and_redeem.test.ts:98'],
 'Cloud API test compilation and root cross-app fixtures',
 'Frozen commit, installed lock-compatible dependencies, TypeScript --noEmit checks.',
 'API has one baseline diagnostic: stale constructor call expects four arguments. Root has four TS diagnostic headers across three fixture files (missing deliveryCharge, Order shape, modifiers and colorHex). An audit-harness typing error was corrected and excluded from baseline counts.',
 'Transpile-only test execution can be green while typed contracts drift. This is not proof the deployed production build currently fails; application-only build checks were not all run.',
 'Update fixtures to the current domain/constructor contracts and require separate API/root type checks in CI; do not silence with blanket any or unknown casts.',
 'Both type checks pass from a clean install, with compile-time tests for API/local money and order contracts.', '0.5–1 day')
f('QUAL-02','MEDIUM','The checked-in regression suite remains red after build preparation','CONFIRMED TEST FAILURES / product causality MIXED',
 ['tests/bill_on_order.test.ts:1','tests/pos_fast_cashier_workflow.test.ts:1','tests/pwa_alerts_and_small_screens.test.ts:1','docs/reports/ecosystem-assessment-2026-10-11/evidence/root-failure-recheck.log:1'],
 'POS/Captain bill requests and customer display; assistant, printing, PWA and UI assertions',
 'Root Vitest suite at frozen commit. A second run of all failed files includes the repository pretest asset preparation.',
 'Initial: 1,758 pass/13 fail in 238 files. After preparation, recheck: 150 pass/11 fail in 11 selected files. Missing copied photo and image-path cases clear. Some remaining failures compare exact text, regex layouts or literal filesystem paths including URL query strings; these are not demonstrated UI/payment security defects.',
 'The release regression contract is not trustworthy while behavior defects and stale assertions are mixed. Bill-request notification/customer-display failures need runtime triage; every individual failure is retained, not hidden by rerun counts.',
 'Classify each failure; repair implementation where behavior is wrong, update tests where the intended contract changed, and use semantic/browser assertions instead of source regex or filesystem checks on URL strings.',
 'Named failing files pass, then one clean complete suite using the documented preparation. Browser persistence/notification and actual offline-service-worker tests.', '2–4 days')
f('QUAL-03','MEDIUM','Multi-source integration test selects an unrelated earlier QR fixture','CONFIRMED TEST DEFECT / production sync failure NOT PROVEN',
 ['cloud/api/test/multi-branch-dashboard.e2e.spec.ts:131','cloud/api/test/multi-branch-dashboard.e2e.spec.ts:178'],
 'Multi-branch/dashboard verification and confidence in order routing',
 'Running the full file, which first inserts an older source=QR finance fixture with no replay sequence.',
 'The original selected suite fails the cross-app scenario. Diagnostic copy shows missing finance-4 while all four newly created source orders are returned. Restricting the audit-copy lookup to qr.body.publicOrderId makes all 34 scenarios pass, including ready/served to POS/Captain/Kiosk/QR.',
 'The test gives a false sync alarm and never reaches its final lifecycle assertions in the ordinary run.',
 'In a future implementation change, select the created order by its returned identity and add isolation of seeded finance fixtures. Audit changed only a separate diagnostic test copy, not the original test.',
 'Full file and corrected identity selection pass; malicious cross-branch requests remain denied.', 'Under half a day')
f('QUAL-04','MEDIUM','Several core components and repositories concentrate too many responsibilities','CONFIRMED SOURCE / MAINTAINABILITY RISK',
 ['packages/database/src/repositories.ts:1','apps/kiosk-system/kiosk-user/src/App.tsx:1','apps/restaurant-system/pos-admin/src/App.tsx:1','apps/restaurant-system/pos/src/store/posStore.ts:1','cloud/super-admin-web/src/pages/Onboarding/OnboardRestaurantPage.tsx:1'],
 'Shared local persistence, kiosk/admin application state and onboarding',
 'Changing one workflow in large mixed-responsibility modules. Line count alone is not a functional defect.',
 'Repository file 4,854 lines; kiosk App 4,214; admin App 2,074; POS store 1,842; onboarding 1,810. Shared TS/runtime validation exists, but critical request DTOs and local/cloud representations still differ.',
 'UI/session/pricing/sync changes require broad context and increase accidental cross-workflow coupling.',
 'Extract one coherent boundary at a time: account-authorized staff administration, order transition validation, kiosk receipt state, typed sync mapping, then onboarding orchestration. Reuse existing packages rather than replace all architecture.',
 'Behavior characterization at each boundary and targeted cross-app contracts; preserve offline functionality.', '1–2 weeks incrementally')
f('QUAL-05','LOW','Super Admin violates its shared-package import boundary','CONFIRMED SOURCE AND TEST / bundle impact UNMEASURED',
 ['cloud/super-admin-web/src/pages/Settings/KioskWelcomeDesignsCard.tsx:3','tests/super_admin_css_classes.test.ts:95'],
 'Super Admin settings and shared package layering',
 'Building the platform app through shared utils barrel exports.',
 'Settings component imports optimizeWelcomeUpload/resolveMenuImage from @jamanvaar/utils; the dedicated dependency-boundary test reports this file as an offender.',
 'A platform browser app can gain unintended local-device dependencies or heavier bundles. Actual bundle size, circular graph and runtime failure were NOT measured.',
 'Use a leaf visual/upload module with a documented browser-safe dependency contract; retain the boundary check.',
 'Boundary test and production bundle import graph; confirm setting behavior in a browser.', '0.5–1 day')
f('QUAL-06','LOW','Generated Rust target artifacts are committed with source','CONFIRMED INVENTORY / REPRODUCIBILITY RISK',
 ['apps/restaurant-system/pos/src-tauri/target/debug/JamanvaarLocalCore.exe:1','apps/restaurant-system/pos-admin/src-tauri/target/debug/deps:1','docs/reports/ecosystem-assessment-2026-10-11/evidence/INVENTORY.json:1'],
 'Repository hygiene, source review and native build reproducibility',
 'A clean source checkout includes debug executables and procedural macro DLLs.',
 'git ls-files inventories 41 EXE/DLL artifact paths, many inside target/debug. They are not runtime entrypoints merely because they are tracked.',
 'Review/delivery noise and stale opaque binaries complicate reproducibility and provenance. Malware or credentials inside these artifacts were NOT demonstrated.',
 'Separate intentional signed sidecars from generated target output; ignore build output after a reviewed packaging migration. Do not delete required sidecars blindly.',
 'Clean checkout/build without tracked target dependencies; sidecar hash/signature/revision verification.', '0.5–1 day')
f('QUAL-07','MEDIUM','A webhook test can pass against an older audit row and fails on a fresh database','CONFIRMED TEST DEFECT / payment processing failure NOT PROVEN',
 ['cloud/api/test/payments-webhook.e2e.spec.ts:167','cloud/api/test/payments-webhook.e2e.spec.ts:171','cloud/api/src/modules/payments/payments.service.ts:921'],
 'Payment webhook test reliability and fresh-environment release validation',
 'A reused QA database can contain historical FAILED callback rows whose messages include the old payment reference.',
 'The reused-DB suite passes this assertion, but the fresh 83-migration database fails its contains(pay_unknown_ref) query. Direct platform-context verification finds the signed synthetic callback recorded FAILED with No matching payment transaction found, exactly as current source writes.',
 'An uncorrelated historical row can mask stale assertions. This is not evidence that the unknown callback was lost or a payment was approved incorrectly.',
 'Correlate each assertion to the exact event identity created by that test and assert the current stable failure classification. Exercise both empty and populated QA databases without deleting real audit history.',
 'Fresh DB plus seeded unrelated older failed event; only the current provider event may satisfy the assertion.', 'Under half a day')
f('SAAS-01','MEDIUM','Concurrent outbound webhook attempts can send the same pending row twice','CONFIRMED / OPEN',
 ['cloud/api/src/modules/whatsapp-outbound/whatsapp-outbound-webhook.service.ts:77','cloud/api/src/modules/whatsapp-outbound/whatsapp-outbound-webhook.service.ts:94','cloud/api/src/modules/whatsapp-outbound/whatsapp-outbound-webhook.service.ts:135'],
 'WhatsApp connector integration and multi-instance/background delivery',
 'Two attempt calls overlap before delivery status update, e.g. immediate dispatch + sweep or two replicas.',
 'Audit probe uses a real synthetic pending DB row with HTTP mocked; Promise.all of two attempt calls invokes fetch twice. Source uses read-then-send without atomic claim. No real message was sent.',
 'Duplicate callbacks may cause duplicate downstream notifications unless receiver deduplicates. Receiver behavior was NOT tested. Fetch also has no explicit deadline in the inspected path.',
 'Atomically acquire a bounded delivery lease/claim, add a stable delivery id to the signed contract, require receiver deduplication, and use bounded timeout/backoff. At-least-once semantics must be documented.',
 'Concurrent attempts, lease expiry/crash recovery, same-id retries, duplicate receiver callbacks, timeout, multi-replica processing.', '2–3 days')
f('SAAS-02','MEDIUM','Sync batches serialize on a restaurant-wide database lock','CONFIRMED SOURCE / CAPACITY RISK, not a measured overload',
 ['cloud/api/src/modules/entity-sync/entity-sync.service.ts:100','cloud/api/src/modules/order-sync/order-sync.service.ts:726'],
 'All branches/devices within one restaurant during synchronization',
 'Concurrent large sync batches from multiple branches sharing restaurant sequencing.',
 'Entity mutations hold an entity:restaurant advisory transaction lock while iterating events. Server-order ingestion takes the same restaurant-wide sequencing lock. Sequence ordering/idempotency benefit is intentional.',
 'A busy branch can add waiting time to other branches of the same tenant. The 10,000-row synthetic dashboard fixture is a correctness check, not a throughput or concurrency certification.',
 'Measure lock wait and transaction duration; shorten work under locks, bound batch work and separate unnecessary locks while retaining monotonic replay order. Adopt branch sequencing only with a compatibility/migration design if measurements justify it.',
 'Concurrent multi-branch bursts and offline catch-up with no dropped/duplicate events; record p95 lock wait and latency.', '2–4 days measurement, optimization contingent')
f('SAAS-03','MEDIUM','Release assurance is not enforced across backend and all client products','CONFIRMED WORKFLOW GAP / operations NOT FULLY VERIFIED',
 ['.github/workflows/tauri-build.yml:1','.github/workflows/build-installers.yml:1'],
 'Cloud API, native releases, shared packages and independently licensed products',
 'Using the two checked-in workflows as the repository release assurance mechanism. External branch protections/checks NOT TESTED.',
 'Tauri build checks and installer smoke process exist, but no checked-in workflow gates releases on the API/root security regression suites or both type checks. Installer workflow uses mutable action tags; the other workflow pins actions. Signing and manual update publication remain separate steps.',
 'A release can build while critical authorization regressions remain. Deployment rollback, actual cloud alerts and clean-install reproducibility are not certified by these workflows.',
 'Add required source/type/test/security gates, protected release environment and pinned actions; publish source revision, dependency/artifact manifests, rollback instructions and compatible client/server versions.',
 'Protected PR and release dry run, failing security probe blocks release, rollback/restore rehearsal, no production credentials in test jobs.', '2–4 days')
f('CFG-01','LOW','Release environment hosts are fixed in CI while tenant configuration is dynamic','CONFIRMED CONFIGURATION / portability limitation',
 ['.github/workflows/build-installers.yml:36','packages/config/src/constants.ts:9','cloud/api/src/config/env.validation.ts:1'],
 'Installer staging/alternate environment builds; shared regional defaults',
 'Building a staging/alternate-host release through the installer workflow.',
 'VITE cloud and QR URLs are assigned a fixed production host at job scope. Tenant IDs in APP_CONSTANTS are definitions with no discovered consumer; they are not proven hardcoded production ownership. INR/GST defaults fit the current Indian market.',
 'Environment portability depends on editing workflow configuration, while onboarding another restaurant on the same host is database/entitlement driven. Do not mislabel every stable brand/tax default as a SaaS defect.',
 'Use validated GitHub environment configuration for URLs; keep secrets out of client builds. Preserve intentional brand/domain constants and per-restaurant overrides.',
 'Separate staging and production builds, scan bundles for unintended localhost and configure a new synthetic tenant without source edits.', '0.5–1 day')
(HERE/'FINDINGS.json').write_text(json.dumps(findings,indent=2),encoding='utf8')

# Copy synthetic reproduction code into the report; never copy the private credential state.
for name in ['assessment-probes.e2e.spec.ts','assessment-flow-diagnostic.e2e.spec.ts']:
    shutil.copy2(SOURCE/'cloud/api/test'/name,E/name)

security_scope={
 'Cloud API':['SEC-01','SEC-02','SEC-03','SEC-04','SEC-06'],
 'Super Admin':[],
 'POS':['SEC-01','SEC-03','SEC-04','SEC-05','SEC-07'],
 'Restaurant Admin':['SEC-01','SEC-03','SEC-04','SEC-05','SEC-07','SEC-08'],
 'Kiosk Admin context':['SEC-05','SEC-07','SEC-08'],
 'QR Admin + public product site':['SEC-03','SEC-08'],
 'QR Customer Ordering':['SEC-03'],
 'Kiosk Customer':['SEC-03','SEC-05','SEC-07'],
 'Captain':['SEC-03','SEC-05','SEC-07'],
 'KDS':['SEC-03','SEC-05','SEC-07'],
 'Branch Core':['SEC-08'],
 'Legacy local runtime':[]
}

lines=[f'''# JAMANVAAR ecosystem assessment — 11 October 2026

## Executive decision

| Independent assessment | Score /10 | Disposition |
| --- | ---: | --- |
| Security | {score('security',base['security']):.1f} | PROVISIONAL; confirmed POS-to-manager escalation blocks release approval |
| Code quality | {score('quality',base['quality']):.1f} | PROVISIONAL; significant test, type-contract and maintainability gaps |
| SaaS readiness | {score('saas',base['saas']):.1f} | PROVISIONAL; real multi-branch foundation, incomplete assurance and integration reliability |

**Release recommendation: BLOCKED pending SEC-01 remediation and verification of the remaining release gates.** This is an internal source-and-test assessment, not a certification of the deployed ecosystem. There is no confirmed unauthenticated critical exploit in this assessment; the dependency scanner's critical ratings are a separate category. The independent maintainability dimension is 5/10, included in code quality, not a fourth blended ecosystem score.

The platform contains meaningful controls: separate platform/tenant authentication realms, hashed device credentials, device/branch entitlement enforcement, established database RLS, integer-paise cloud contracts, server-priced QR checkout, verified gateway webhooks, transaction/idempotency mechanisms, replay cursors and encrypted production backup enforcement. These do not close the confirmed authority and data-layer gaps.

Six independent probes reproduce: POS-only manager creation; missing RLS on three tables; pure unknown-state bypass; API persistence of that bypass; default no-proof cancellation; and duplicate webhook dispatch. All six tests pass by **asserting unsafe behavior**. They are reproductions, not successful protection tests.

## Baseline, coverage and limits

- Both audit briefs assessed against commit `{REV}` in a detached worktree. Shared live workspace changes were excluded and preserved. No application source fix, production deployment, migration, credential rotation, real payment or external message was performed.
- Frozen lock SHA-256 `{inventory['lockSha256']}` matches the live workspace lock. Dependencies were reused through a node_modules junction; a fresh `npm ci`, full SBOM comparison of installed contents, and clean native rebuild were NOT performed. This limits reproducibility confidence.
- Initial API runs used the existing isolated QA database. Its migration ledger did not fully match the frozen source (75 recorded migrations versus 83 expected), so a new localhost-only database was created without modifying existing databases. All 83 frozen migrations and the reference seed applied successfully; checksum/name comparison has no missing, extra or mismatched migrations, and the role is non-superuser/non-BYPASSRLS. See FRESH_QA_SCHEMA_BASELINE.json and the fresh repetition log. Older QA results are retained separately.
- Fresh API repetition: **321 passing / 2 failing tests in 22 files**. Both failures are diagnosed test defects: the QR selector (QUAL-03) and the historical webhook error substring (QUAL-07). The corrected QR audit copy passes all 34 scenarios; direct DB verification proves the synthetic unknown-payment callback was correctly persisted as FAILED. All six unsafe-behavior probes still reproduce. These results do not make the original test suite green.
- Inventory: {inventory['trackedFiles']:,} tracked files; 21 package manifests; {inventory['sourceFileCount']:,} scanned source/test/tooling files and {inventory['sourceLines']:,} lines; 72 controller files; 62 Prisma models; 386 test-file paths. These are discovery counts, not endpoint/security coverage percentages.
- The frozen-source code was unchanged. An audit probe and diagnostic test copy were added only to the detached checkout. An additional diagnostic recheck changed only its QR fixture selector. Running the existing asset pretest regenerated public icons/manifests/photos within that checkout; it did not change production code. Tests also regenerate that checkout's historical PERFORMANCE.json. These generated changes are recorded in the baseline evidence.
- Deep review focused on authentication/authority, tenant/branch isolation, synchronization and order/payment state, database migrations, native update/release boundaries, configuration and worker delivery. All applications/packages were inventoried; every route/screen/native binary was **not** exhaustively exercised.
- Overall confidence: moderate. High confidence for the six reproduced paths and executed checks; medium for inspected source; low for live AWS, device hardware, complete UI, binaries and operational recovery.
- Missing tools: cargo-audit, Semgrep, Gitleaks, Trivy and Docker were unavailable. No result from them is claimed. Rust advisories, image CVEs, full history secret scanning and production container verification are NOT TESTED.
- Browser-by-browser CRUD/responsiveness/accessibility, live mobile UPI/app choice, real gateway settlement/refund, production TLS/IAM/security groups/storage ACLs, physical kiosk/LAN attacks, restore of a real backup and native APK installation are NOT TESTED. Prior reports were context, not evidence of execution on this commit.

## Discovered platform and attack surface

```mermaid
flowchart LR
  guest[QR guest / customer kiosk] --> api[Shared Cloud API]
  staff[POS / Captain / KDS] --> api
  admin[Restaurant / Kiosk / QR Admin] --> api
  platform[Super Admin] --> api
  staff <--> core[Branch Core / local SQLite]
  core <--> api
  api --> pg[PostgreSQL: tenant context + RLS]
  api <--> gateway[Payment provider / signed callbacks]
  api --> jobs[Backup / jobs / webhook outbox]
  jobs --> integrations[Configured storage / WhatsApp connector]
```

The primary trust boundaries are public guest capability/session → server-priced order; human role → device identity; restaurant → branch → device ownership; local offline data → canonical synced orders; payment attempt → verified collection → ledger/report; and authorized release metadata → native executable update. SEC-01 crosses the human/device boundary, SEC-02 weakens tenant query containment, and SEC-03 crosses the lifecycle boundary.

Kiosk Admin is a context in the shared admin source, not an independently located current source application. Older separate Kiosk Admin executables exist locally and were separately inventoried. QR marketing/login/admin and customer ordering are distinct experiences with shared platform services. `packages/branch-core` and `packages/native` have operational/native code even without separate package manifests. No independent Python application, Pydantic/SQLAlchemy backend, Redis service or separate microservice was located; Python discovered here is tooling. Do not infer that every integration in production was present or tested.

## Application scorecards

Scores include inherited shared-backend and release risks. They are not an average of screen quality and are not certifications. Per-application dimension vectors, weights and confidence are in [SCORECARD.json](SCORECARD.json).

| Application | Security /10 | Code quality /10 | SaaS /10 | Coverage / main concern |
| --- | ---: | ---: | ---: | --- |
''']
for a in scorecard['applications']:
    lines.append(f"| {a['application']} | {a['security']['score']:.1f} | {a['quality']['score']:.1f} | {a['saas']['score']:.1f} | {a['confidence']}; {a['mainConcern']} |\n")
lines.append('''
All rows are PROVISIONAL. Shared security findings affect multiple consumers and must not be summed as separate vulnerabilities. The scorecard inventories exposure, integrations and source paths for each application. The shared package set is `api`, `business`, `config`, `database`, `i18n`, `sync`, `types`, `ui`, `utils`, `validation`, `tauri-plugin-apk-updater` and kiosk shared code. Their findings are attributed to the consuming products; they are libraries rather than independently deployed applications.

Counts below cover applicable confirmed source/probe findings SEC-01..08 only, including conditional release/configuration findings. They exclude scanner alerts, unversioned artifacts, unproven exploit paths and quality findings. A zero means no directly attributed confirmed finding in this sample, **not a clean bill of health**. All statuses remain PROVISIONAL.

| Application | Critical | High | Medium | Low | Applicable security IDs |
| --- | ---: | ---: | ---: | ---: | --- |
''')
by_id={f['id']:f for f in findings}
for name,ids in security_scope.items():
    counts=[sum(by_id[id]['severity']==sev for id in ids) for sev in ['CRITICAL','HIGH','MEDIUM','LOW']]
    lines.append('| '+name+' | '+' | '.join(map(str,counts))+' | '+(', '.join(ids) or 'None directly confirmed; limited coverage')+' |\n')
lines.append('''

## Scoring method

The security and quality weights match the supplied briefs. SaaS weights are defined separately to emphasize tenant isolation and whether new customers can be onboarded through configuration. All dimensions score 0–10; weighted sum /100, rounded to one decimal. Scores are judgment grounded in the evidence, not statistical measurements. Unknown operational controls constrain scores and are explicitly disclosed; they do not become confirmed vulnerabilities. Overall scores use the platform's critical boundaries directly, not a simple average of app scores.

| Dimension | Weight | Score /10 |
| --- | ---: | ---: |
''')
for k in weights:
    for (name,w),s in zip(weights[k],base[k]): lines.append(f'| {k}: {name} | {w}% | {s} |\n')
lines.append('''
Security authorization is reduced by SEC-01/04; isolation by SEC-02; input/business integrity by SEC-03; supply chain/deployment by DEP-01/SEC-05/06/07 and unverified artifacts. Backup/crypto earn credit for implemented controls and executed synthetic S3/local tests, while production operation remains unknown. Quality receives credit for strict TypeScript, Zod, domain packages, transactions and many meaningful tests, with deductions for QUAL-01..06. SaaS onboarding/licensing earn credit for dynamic multi-family plans, concurrent activation controls and the corrected five-branch scenario; isolation, worker races, release controls and unmeasured concurrency constrain readiness.

## Findings

Severity is qualitative with explicit preconditions; CVSS numbers are not invented. Source references are to the frozen commit. The local files in the user's workspace may subsequently differ. Dependencies and unversioned artifacts are marked separately from confirmed application exploits.
''')
for item in findings:
    lines.append(f"\n### {item['id']} — {item['title']}\n\n**{item['severity']} · {item['status']}**\n\nAffected: {item['affected']}.\n\nEvidence: "+'; '.join(f'`{x}`' for x in item['references'])+f". {item['evidence']}\n\nConditions and limits: {item['conditions']}\n\nImpact/root cause: {item['impact']}\n\nRemediation: {item['remediation']}\n\nVerification: {item['regression']}\n\nEffort estimate: {item['estimatedEffort']}. Estimates are engineering planning ranges, not delivery commitments.\n")
lines.append('''
## Hardcoded-value inventory

| Classification | Evidence | Assessment / source of truth | Priority |
| --- | --- | --- | --- |
| A: potential secret exposure, unverified | Eight credential-shaped source/doc/test matches in INVENTORY.json, values redacted | No live credential validity confirmed. Several are interpolation or synthetic fixtures. Review development connection examples and history with a real secret scanner; do not claim a clean history or rotate unrelated secrets automatically. | P2 classification |
| B: environment hardcoding | build-installers.yml:36 and Android job environment | Fixed deployment host limits staging portability; use GitHub environment configuration (CFG-01). | P2 |
| C: authorization business rule | entity-authority.ts:31; order-rules.ts:48 | Device/role constants are legitimate domain code, but STAFF_USER human authorization and open-ended statuses violate the intended boundary (SEC-01/03). | P0/P1 |
| D: overlapping representations/contracts | packages/types/src/domain.ts:1, cloud/api/src/modules/order-sync/dto/push-order-sync.dto.ts:1, packages/business/src/pricing.ts:230 | Local money uses decimal rupees in places; cloud contracts use integer paise. Preserve explicit conversion and typed wire adapters. Multiple models do not alone prove duplicate collections. | P1 contract tests |
| E: intentional domain constants | config/constants.ts:8, entity-authority.ts:13, config/license_keys.ts:1 | Brand identity, device types, finite roles and public verification keys may remain code constants. Public keys are not signing secrets. | No blanket rewrite |
| F: isolated test fixtures | assessment probes and existing test users/menu prices | Synthetic passwords/PINs/IDs are only QA fixtures. Do not treat them as production credentials. | Keep isolated |
| G: defaults | config/constants.ts:9–33; env.validation.ts:1 | INR, GST, timeout values and port 4000 are defaults. Confirm per-tenant overrides where supported. Three default tenant/device IDs have no discovered consumers and are not proof production ownership is hardcoded. | P2 regional/config review |

The lightweight secret scan covers four value-shape families in tracked text; it is not Gitleaks or a complete assignment/entropy/history scan. No raw secrets or production personal data are included.

## Database, canonical orders, payments and offline synchronization

PostgreSQL has established tenant/platform transaction helpers and 44 declared RLS-enabled table names after following table renames. `QrCode` inherits RLS from `QrTableLink`; it is **not** a missing-policy finding. `AuditLog` and `PlatformNotification` are platform-wide exceptions and require platform authority rather than an indiscriminate tenant-policy migration. Three newly added tables were dynamically shown to be unprotected under the same non-bypass QA role.

`SyncedOrder`, gateway-facing `Order`/payment attempts, payment entries and local orders are separate representations. Transactions, idempotency keys, gateway verification and post-commit replay notifications mitigate divergence. The executed gateway/QR security suites and fixed-identity multi-source diagnostic show useful protection; none certify real merchant settlement. Preserve one authoritative financial ledger with reconciled collections/refunds/outstanding balances and one operational lifecycle. Do not merge all models destructively simply because they overlap.

Offline sync has persistent outboxes, event deduplication, sequence catch-up and conflict recording, with substantial root test coverage. Device-priced mismatches are intentionally accepted with review flags for stale-menu operation; this is a trust-policy concern, not a proved free-payment exploit. Sensitive account/lifecycle operations need stronger evidence (SEC-01/03/04). Client timestamps used to evaluate staff proofs and role changes require dedicated backdate/revocation tests; that risk was source-observed but a separate replay exploit was NOT demonstrated.

Use integer-paise arithmetic at authoritative wire/payment boundaries, explicit conversion from existing rupee models, finite versioned statuses, and a typed mapping between local snapshots and cloud records. Preserve valid offline sales, old menu price snapshots, device identities and replay cursors.

## Frontend and backend functionality

Source review and root tests found test/contract drift, an unintended shared barrel import and large components. The regression log records assistant empty-state, customer-display, bill-request propagation, Unicode printing, source-regex PWA and permission-message assertions. Literal filesystem existence tests for paths containing cache query parameters can fail despite valid deployed URLs. These results must not be relabelled as confirmed broken production screens without browser reproduction.

All screens/routes, actual persisted CRUD, mobile touch keyboards, QR Admin layouts, accessibility and responsive breakpoints are **NOT TESTED end-to-end in this assessment**. Historical browser reports are not substituted for same-commit execution. The briefs' exhaustive every-screen requirement remains an explicit coverage gap. There is no support here for claiming all UI buttons work, every feature is implemented or every dashboard is live.

API runtime validation, role guards, startup configuration checks and negative tests are meaningful strengths. The confirmed endpoint issues are documented above. No SQL injection, unauthorized file upload, server-side template injection, secret exposure, open internet RCE or XSS was demonstrated. Absence of demonstration is not proof these are impossible.

## Native clients and reverse-engineering assessment

Web assets and Tauri renderer logic are inspectable. Offline prices/entitlement caches/UI permissions cannot be treated as tamper-proof authority. Server checks remain mandatory. Inspected Tauri capability grants shell open rather than arbitrary shell execution; native printing has sanitization/LAN restrictions, with one Unicode-output test mismatch still requiring triage. CSP restricts scripts to self and disallows objects but permits broad HTTP/HTTPS image/connect targets for LAN/cloud use; a CSP-only observation is not proof of XSS.

Source uses public offline-license verification keys. No private licensing key was established in shipped client source. Full signature-bypass, patch-and-repackage, instrumented mobile runtime, embedded-binary secret extraction and physical file tampering are NOT TESTED. Branch-core secret sealing protects a DB copy alone; the adjacent key is not OS-keystore protection.

Local artifacts: 23 assets, including 18 EXE/MSI files and five ICNS icons; no APK/AAB found in inspected roots. SHA-256 and Authenticode outcomes are retained. Four UnknownError outcomes are inconclusive. These artifacts' source/build revision is unknown, and none was installed/launched. Tracked debug EXE/DLL outputs and the intentional POS core sidecar are inventoried separately. Their binaries were not fully decompiled and have no current release certification.

Prioritize server authority, stable signed Android releases, Windows publisher and updater signing, verified metadata/native update validation, revocable least-privilege device identities, and reproducible signed sidecars. Obfuscation would not repair SEC-01 or financial authority.

## Infrastructure and operational assessment

Repository configuration includes container/compose services, database role hardening, proxy-hop validation, nginx TLS configuration, limits/health/log settings and startup migration handling. Actual cloud security groups, public database reachability, IAM/S3 policy, cert validity, host patch level, ingress headers, AWS backups and required branch protection are NOT TESTED. Source configuration is not proof of deployed state.

Production backup storage refuses unencrypted backup writes when its key is missing. Synthetic S3-compatible and local backup suites pass 23 tests, covering encryption/failure/retention and test restore paths. This does not verify AWS IAM, off-site retention, successful recent production backups or restoration of a real tenant under disaster conditions. Keep a separately authorized restore rehearsal and key-recovery runbook as a release gate.

The API container root/dev-tooling finding, debug APK release and mutable installer actions remain actionable source findings. No containers were launched here; no production services restarted or scanners run against the live host.

## Performance and scalability

The corrected audit-copy multi-branch suite exercises five branch setups, concurrent activation/checkout controls and exact aggregate results with 10,000 synthetic sales plus a larger-than-response-cap device fleet. It does not establish concurrent user/RPS capacity. CPU/memory/latency under sustained restaurant load, gateway wait times and frontend bundle performance are NOT measured.

First proportionate investigations: restaurant-wide advisory lock wait (SAAS-02), webhook lease/timeout behavior (SAAS-01), outbox/replay limits, monolithic UI state updates, large local repositories and Super Admin's dependency graph. Existing bounded catch-up, indexes, sequence/idempotency machinery and partitioning by tenant are preferable to prematurely adding infrastructure. No N+1 or memory-leak exploit is asserted without measurement.

## Prioritized remediation and safe implementation sequence

| Priority | Task / affected products | Benefit and dependency | Effort | Verification |
| --- | --- | --- | --- | --- |
| P0 | SEC-01 human-authorized staff administration | Close manager escalation before relying on approvals | 2–4 days | Negative POS role/PIN creation probes, owner/manager + offline compatibility |
| P1 | SEC-02 additive RLS policies | Restore tenant data-layer containment; coordinate jobs/platform context | 1–2 days | Fresh and upgraded DB isolation matrix |
| P1 | SEC-03/04 lifecycle and bounded offline actor policy | Prevent unknown-state bypass and no-proof sensitive mutations | 3–5 days | Transition matrix, replay/backdate/revocation; preserve offline sales |
| P1 | SEC-05/07, ART-01 release signing/provenance | Reliable trusted native upgrades | 3–6 days | Signed APK/EXE, native mismatch rejection, isolated device update |
| P1 | DEP-01/SEC-06 dependency triage and runtime hardening | Reduce reachable vulnerable code and container privileges | 2–5 days | Lock audit, upload/proxy/auth regressions and container smoke |
| P1 | SAAS-01 durable delivery claim/idempotent callback contract | Prevent duplicate worker sends and bound retries | 2–3 days | Parallel, crash/lease, retry, timeout and receiver dedupe tests |
| P1 | QUAL-01/02/03 + SAAS-03 green typed release gates | Separate product defects from stale tests and enforce regressions | 3–5 days | Clean full source/type/security/API pipeline |
| P2 | CFG-01 and typed local/cloud contracts | Configurable staging and explicit money/status boundaries | 1–3 days | New tenant, alternate environment and cross-app contract tests |
| P2 | QUAL-04/05/06 focused module boundaries and artifact hygiene | Improve change safety and reproducibility | 1–2 weeks incremental | Characterization tests, bundle graph, clean native build |
| P2 | Same-commit browser UI/CRUD, hardware/mobile payments and restore rehearsal | Close the largest NOT TESTED release areas | 3–7 days plus external setup | Role/branch/device browser matrix, merchant sandbox and device traces |
| P3 | SAAS-02 measured multi-branch performance tuning | Shorten contention without breaking replay consistency | 2–4 days measurement | p95 lock/commit/replay metrics under synthetic concurrent bursts |

Implement only after separate authorization, as required by the supplied audit briefs. Start with the smallest coherent boundary changes. Use additive migrations with rollback/recovery plans, preserve records and client compatibility, and rerun affected tests before broad testing. These effort ranges overlap and should not be summed as a delivery promise.

## Evidence and execution

See [TESTING.md](TESTING.md), [FINDINGS.json](FINDINGS.json), [SCORECARD.json](SCORECARD.json), [inventory](evidence/INVENTORY.json), raw test logs, lock-based dependency audits, synthetic reproduction code, and [artifact signature observations](evidence/ARTIFACT_SIGNATURES.json). Findings remain open unless explicitly a test-harness correction or conditional/scanner observation. No production fixes were made during this audit.
''')
(HERE/'REPORT.md').write_text(''.join(lines),encoding='utf8')

testdoc='''# Execution evidence and reproduction

Audit date: 2026-10-11. Both assessments use detached commit `a6e13aaf01f19088bc3c2c89b59cf0badd763120`.
Node 24.19.0; npm 11.17.0; Cargo 1.98.0; Python 3.13. Initial tests used an existing isolated QA database with migration-history drift. The fresh repetition uses a new localhost-only QA database with all 83 frozen migrations, exact checksums and a non-superuser/non-BYPASSRLS role. Use a new dedicated QA database when reproducing; never use production.

## Executed checks

| Check | Actual outcome | Evidence |
| --- | --- | --- |
| Tracked-file/manifests/controllers/migration inventory | 10,959 tracked files, 21 manifests, 72 controllers, 62 models | INVENTORY.json; inspect_repository.py |
| npm audit --package-lock-only --json | 45 vulnerable packages, exit 1 | npm-audit.json |
| npm audit --package-lock-only --omit=dev --json | 13 vulnerable packages, exit 1; overlaps full audit | npm-audit-production.json |
| Root Vitest all, --maxWorkers=2 | 227 files pass/11 fail; 1,758 tests pass/13 fail, exit 1 | root-tests.log |
| Existing pretest asset preparation + rerun of 11 failed files | 2 files pass/9 fail; 150 tests pass/11 fail, exit 1 | asset-preparation.log; root-failure-recheck.log |
| Selected critical API suites | 11 files pass/1 fail; 188 tests pass/1 fail, exit 1 | api-critical-tests.log |
| Additional API control suites | 8 files pass; 94 tests pass, exit 0 | api-controls-tests.log |
| Independent audit probes | 1 file/6 tests pass, exit 0; intentionally reproduce unsafe behavior | assessment-probes.log; assessment-probes.e2e.spec.ts |
| Multi-branch diagnostic copy | Original selector: 33 pass/1 fail; explains stale fixture | api-flow-diagnostic.log |
| Multi-branch audit copy restricted to returned QR order identity | All 34 scenarios pass, exit 0; original checked-in test unchanged | api-flow-selector-recheck.log; assessment-flow-diagnostic.e2e.spec.ts |
| API tsc -p cloud/api/tsconfig.json --noEmit --incremental false | One baseline constructor diagnostic, exit 1 | api-types.log |
| Root tsc --noEmit | Four diagnostic headers in three test fixture files, exit 1 | root-types.log |
| Local artifact inventory/hash/Authenticode | 18 EXE/MSI: 14 NotSigned, 4 UnknownError; five ICNS not applicable | AVAILABLE_ARTIFACTS.json; ARTIFACT_SIGNATURES.json |
| Fresh frozen-commit migration + seed | All 83 migrations applied; matching names/checksums; non-bypass role | fresh-qa-preparation.log; FRESH_QA_SCHEMA_BASELINE.json |
| Fresh repetition of 22 API files | 321 passing / 2 failing tests (323); six unsafe probes reproduce; both failures diagnosed test defects | fresh-api-tests.log; WEBHOOK_FAILURE_VERIFICATION.json |

Do not add pass counts across reruns or call them coverage percentages. Initial root execution bypassed npm pretest; the controlled failed-file recheck performs the normal asset preparation. The two cleared asset cases are not reported as production defects. Eleven remaining failures include stale text/regex/path expectations and require individual product triage. Full prepared root suite was not rerun because only the changed preparation conditions justified the failed-file recheck.

The original critical API failure is a confirmed test-selector defect: earlier finance-4 QR fixture has no replay seq; the newly created QR order is returned correctly. Selecting by `qr.body.publicOrderId` in an audit-only copy permits the lifecycle assertions to run and pass. Neither the original test nor production code was fixed in this assessment.

The fresh repeat additionally exposes the unknown-reference webhook assertion: it searches for a historical raw-reference substring, while current source writes No matching payment transaction found. Exact synthetic payload lookup with platform RLS context confirms the current callback exists, has a valid signature and FAILED processing status. Initial reused-DB passing results were not sufficient here. See QUAL-07 and WEBHOOK_FAILURE_VERIFICATION.json. This is a test-identity/message defect, not an approved-payment or missing-webhook finding.

API control files: activation-redeem, rls-platform-reads, backups, backups-local, master-catalog-upload, entity-sync, order-rules.unit, audit-probes. Critical file names/counts are retained verbatim in the log. Two initially supplied selector names matched no file; the actual critical run was 12 files, not 14.

## Reproduce safely

1. Create a detached checkout at the recorded revision. Compare lock SHA-256 to INVENTORY.json. Install/build dependencies independently for a clean CI reproduction; this audit reused a lock-compatible installed node_modules junction.
2. Prepare a dedicated test database with migrations and a non-bypass application role. Do not migrate production. A database name containing test is an additional harness guard, not proof by itself of isolation.
   The retained prepare_fresh_qa.cjs reads local connection configuration without printing secrets, explicitly rejects remote hosts and creates its own uniquely named database. It never overwrites the pre-existing browser QA state. Its private state is ignored under .jamanvaar; never publish it.
3. `node node_modules/vitest/vitest.mjs run --maxWorkers=2` runs the root offline/source tests. Run the recorded `node tooling/dev/sync_description_photos.mjs` pretest when checking prepared assets; it regenerates public files only in the checkout.
4. Use run_api_tests.cjs with checkout path, private QA-state path and selected `test/*.spec.ts` paths. It reads the QA URL silently, clears live gateway/service secrets and disables SMTP. Existing API tests mock gateway/email; backup S3 tests run a local S3rver, not AWS. Never publish the private state. Some tests mutate only fresh owned fixture rows; older tests can sweep jobs in the dedicated QA DB, which is why shared production DB use is prohibited.
5. Copy the retained audit probe into cloud/api/test of the audit checkout only. It creates fresh synthetic restaurants/devices/staff, verifies the real non-bypass DB role and deletes its owned fixtures. Webhook HTTP is mocked; no real message is sent. Probe PASS proves the unsafe behavior remains. Fixes should make the reproductions fail and new protection tests pass.
6. Type checks: `node node_modules/typescript/bin/tsc --noEmit`; `node node_modules/typescript/bin/tsc -p cloud/api/tsconfig.json --noEmit --incremental false`.
7. Dependency commands above scan the recorded lock and consult the npm advisory registry; exit 1 indicates advisory results. Advisory severity is not an exploitation result. Raw logs may use PowerShell UTF-16; report JSON/Markdown are UTF-8.
8. Signature checks used Get-AuthenticodeSignature and SHA-256 only; no installer was launched. Treat UnknownError as inconclusive and verify on the target signing platform.

## Explicit NOT TESTED

Every-screen browser CRUD/layout/accessibility; full production app builds; fresh npm install; Rust advisory scanning; Docker/OS image scanning; full git-history secret scanning; native binary decompilation; current deployed source/artifact linkage; actual APK signatures/upgrade; physical touchscreen/printing/LAN intrusion; live mobile UPI/gateway funds; actual AWS/IAM/network/TLS/S3 state; production backup restoration; sustained concurrent load and RPS capacity.

Historical reports and other concurrently running workspace tasks are not counted as same-commit current audit verification.
'''
(HERE/'TESTING.md').write_text(testdoc,encoding='utf8')
print(json.dumps({'report':str(HERE/'REPORT.md'),'findings':len(findings),'scores':{k:score(k,v) for k,v in base.items()}},indent=2))
