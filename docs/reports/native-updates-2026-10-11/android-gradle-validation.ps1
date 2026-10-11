param([ValidateSet('pos','pos-admin','captain','kds','kiosk')][string]$App = 'kds')
$ErrorActionPreference = 'Stop'
$workspace = (Get-Location).Path
$tools = Get-Content (Join-Path $env:USERPROFILE '.jamanvaar-build-tools/paths.json') -Raw | ConvertFrom-Json
$env:JAVA_HOME = $tools.javaHome
$env:ANDROID_HOME = $tools.sdkRoot
$env:NDK_HOME = Join-Path $tools.sdkRoot 'ndk/27.0.12077973'
$env:GRADLE_USER_HOME = Join-Path $tools.toolRoot 'gradle-cache'
$env:DEBUG = ''
$env:PATH = (Join-Path $tools.javaHome 'bin') + ';' + $env:PATH
$appPath = if ($App -eq 'kiosk') { 'apps/kiosk-system/kiosk-user' } else { "apps/restaurant-system/$App" }
$library = if ($App -eq 'kiosk') { 'jamanvaar_kiosk_user_lib' } else { 'jamanvaar_'+$App.Replace('-','_')+'_lib' }
$project = Join-Path $workspace ($appPath+'/src-tauri/gen/android')
& node .github/scripts/harden-android-release.mjs $project
if ($LASTEXITCODE -ne 0) { throw 'Android release hardening failed' }
$compiled = Join-Path $tools.toolRoot ('cargo-android/aarch64-linux-android/release/lib'+$library+'.so')
if (!(Test-Path -LiteralPath $compiled)) { throw 'Actual Tauri arm64 Rust compile output is required' }
$destinationDir = Join-Path $project 'app/src/main/jniLibs/arm64-v8a'
New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
$destination = Join-Path $destinationDir ('lib'+$library+'.so')
Copy-Item -LiteralPath $compiled -Destination $destination -Force
if ((Get-FileHash -LiteralPath $compiled).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) { throw 'Compiled library copy mismatch' }
Write-Output 'Using the actual compiled arm64 library by verified copy because this Windows account cannot create Tauri symlinks. Local packaging validation only.'
Add-Content -LiteralPath (Join-Path $project 'gradle.properties') -Value "`norg.gradle.jvmargs=-Xmx1280m -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8`norg.gradle.workers.max=1`nkotlin.compiler.execution.strategy=in-process`norg.gradle.daemon=false"
try {
    Set-Location -LiteralPath $project
    & ./gradlew.bat :app:assembleArm64Release -x :app:rustBuildArm64Release '-PabiList=arm64-v8a' '-ParchList=arm64' '-PtargetList=aarch64' --no-daemon --max-workers=1
    if ($LASTEXITCODE -ne 0) { throw 'Kotlin/R8 APK validation failed' }
} finally { Set-Location -LiteralPath $workspace }
