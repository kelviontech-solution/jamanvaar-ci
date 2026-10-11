const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const files = [
  '.gitignore',
  '.github/workflows/build-installers.yml',
  'tooling/installers/build_release.cjs', 'tooling/installers/build_production_release.ps1',
  ...['build_windows_installers.cjs', 'build_production_suite_v2.cjs', 'build_and_deploy_autostart_suite.cjs', 'deploy_mcafee_safe_suite.cjs', 'package_zip_release.cjs', 'build_full_native_app_suite.ps1', 'build_desktop_executables.ps1', 'build_clean_antivirus_safe_package.ps1', 'deploy_mcafee_safe_suite.ps1'].map(x => `tooling/installers/${x}`),
  ...['validate-release-config.mjs', 'harden-android-release.mjs', 'sign-android.sh', 'sign-windows.ps1', 'release-inventory.mjs', 'verify-android-identity.mjs', 'validate-sidecar-provenance.mjs'].map(x => `.github/scripts/${x}`),
  'cloud/api/src/common/version.ts', 'cloud/api/src/modules/applications/dto/application.dto.ts', 'cloud/api/src/modules/applications/release-verification.ts', 'cloud/api/src/modules/applications/applications.service.ts', 'cloud/api/src/modules/applications/applications.controller.ts', 'cloud/api/src/modules/applications/updater-manifest.controller.ts', 'cloud/api/src/modules/devices/devices.service.ts', 'cloud/api/src/modules/devices/dto/heartbeat.dto.ts', 'cloud/api/prisma/schema.prisma',
  'cloud/api/prisma/migrations/20261011110000_native_release_availability/migration.sql', 'cloud/api/prisma/migrations/20261011111000_device_update_report/migration.sql',
  'cloud/super-admin-web/src/api/types.ts', 'cloud/super-admin-web/src/pages/Applications/ApplicationsPage.tsx',
  ...['native_update.ts', 'NativeUpdateButton.tsx', 'PlatformNoticeBanner.tsx', 'DeviceGateOverlay.tsx', 'index.ts'].map(x => `packages/ui/src/${x}`),
  ...['update_report.ts', 'heartbeat.ts', 'index.ts'].map(x => `packages/sync/src/${x}`),
  ...['build.rs', 'src/lib.rs', 'permissions/default.toml', 'guest-js/index.ts', 'android/src/main/java/com/jamanvaar/apkupdater/ApkUpdaterPlugin.kt'].map(x => `packages/tauri-plugin-apk-updater/${x}`),
  'apps/kiosk-system/kiosk-user/src/desktopUpdater.ts',
  ...['apps/restaurant-system/pos', 'apps/restaurant-system/pos-admin', 'apps/restaurant-system/captain', 'apps/restaurant-system/kds', 'apps/kiosk-system/kiosk-user'].flatMap(app => [`${app}/src/main.tsx`, `${app}/src-tauri/build.rs`, `${app}/src-tauri/Cargo.toml`, `${app}/src-tauri/Cargo.lock`]),
  ...['apps/restaurant-system/pos', 'apps/restaurant-system/captain', 'apps/kiosk-system/kiosk-user'].map(app => `${app}/src/App.tsx`),
  'tests/native_update_lifecycle.test.ts', 'tests/android_release_configuration.test.ts',
  ...['native-release-verification.unit.spec.ts', 'device-updates.e2e.spec.ts', 'release-provenance.unit.spec.ts', 'billing-applications-support.e2e.spec.ts'].map(x => `cloud/api/test/${x}`)
];
const sourceFiles = files.map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
fs.writeFileSync(`${__dirname}/evidence/SOURCE_FILES.json`, JSON.stringify({ capturedAt: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), scope: 'Relevant implementation paths and verification files; includes preceding-stage changes already in HEAD and prior audit build profiles. Not a claim that every file first changed in this continuation.', sourceFiles }, null, 2));
console.log(`Recorded ${sourceFiles.length} source file hashes; no environment or signing credentials included.`);
