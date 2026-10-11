param(
    [ValidateSet('init','build')][string]$Stage = 'init',
    [ValidateSet('pos','pos-admin','captain','kds','kiosk')][string]$App = 'kds'
)
$ErrorActionPreference = 'Stop'
$workspace = (Get-Location).Path
$tools = Get-Content (Join-Path $env:USERPROFILE '.jamanvaar-build-tools/paths.json') -Raw | ConvertFrom-Json
$env:JAVA_HOME = $tools.javaHome
$env:ANDROID_HOME = $tools.sdkRoot
$env:ANDROID_SDK_ROOT = $tools.sdkRoot
$env:NDK_HOME = Join-Path $tools.sdkRoot 'ndk/27.0.12077973'
$env:DEBUG = ''
$env:CARGO_BUILD_JOBS = '2'
$env:CARGO_TARGET_DIR = Join-Path $tools.toolRoot 'cargo-android'
$env:GRADLE_USER_HOME = Join-Path $tools.toolRoot 'gradle-cache'
$env:PATH = (Join-Path $tools.javaHome 'bin') + ';' + $env:PATH
$appPath = if ($App -eq 'kiosk') { 'apps/kiosk-system/kiosk-user' } else { "apps/restaurant-system/$App" }
$cli = Join-Path $workspace 'node_modules/@tauri-apps/cli/tauri.js'
try {
    Set-Location -LiteralPath (Join-Path $workspace $appPath)
    if ($Stage -eq 'init') {
        & node $cli android init --ci --skip-targets-install
    } else {
        & node (Join-Path $workspace '.github/scripts/harden-android-release.mjs') 'src-tauri/gen/android'
        if ($LASTEXITCODE -ne 0) { throw 'Android release hardening failed' }
        Add-Content -LiteralPath 'src-tauri/gen/android/gradle.properties' -Value "`norg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m`norg.gradle.workers.max=2`norg.gradle.daemon=false"
        # Validation reuses the separately verified frontend; distribution CI always rebuilds it.
        Set-Content -LiteralPath 'src-tauri/gen/android/validation-config.json' -Encoding ascii -Value '{"build":{"beforeBuildCommand":""}}'
        & node $cli android build --ci --apk --target aarch64 --config 'src-tauri/gen/android/validation-config.json'
    }
    if ($LASTEXITCODE -ne 0) { throw "Android $Stage failed" }
} finally { Set-Location -LiteralPath $workspace }
