$ErrorActionPreference = 'Stop'
$workspace = (Get-Location).Path
$tools = Get-Content (Join-Path $env:USERPROFILE '.jamanvaar-build-tools/paths.json') -Raw | ConvertFrom-Json
$env:JAVA_HOME = $tools.javaHome
$env:PATH = (Join-Path $tools.javaHome 'bin') + ';' + $env:PATH
$aapt = Join-Path $tools.sdkRoot 'build-tools/36.0.0/aapt.exe'
$apkSignerJar = Join-Path $tools.sdkRoot 'build-tools/36.0.0/lib/apksigner.jar'
$reader = Join-Path $tools.toolRoot 'android-sdk/ndk/27.0.12077973/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-readelf.exe'
$inspectionFolder = Join-Path $tools.toolRoot 'artifact-inspection'
New-Item -ItemType Directory -Force -Path $inspectionFolder | Out-Null
$target = Join-Path $workspace 'apps/restaurant-system/kds/src-tauri/target/release'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$results = @()
foreach ($app in @('pos-admin','pos','captain','kds','kiosk')) {
    $appPath = if ($app -eq 'kiosk') { 'apps/kiosk-system/kiosk-user' } else { "apps/restaurant-system/$app" }
    $binary = if ($app -eq 'kiosk') { 'jamanvaar-kiosk-user.exe' } else { 'jamanvaar-'+$app+'.exe' }
    $config = Get-Content ($appPath+'/src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
    $checkFile = "docs/reports/native-updates-2026-10-11/evidence/native-$app-production.json"
    if (!(Test-Path -LiteralPath $checkFile) -or (Get-Content -LiteralPath $checkFile -Raw | ConvertFrom-Json).exitCode -ne 0) { throw "No completed production build for $app" }
    $exe = Get-Item -LiteralPath (Join-Path $target $binary)
    $windows = @{ file=$exe.FullName; size=$exe.Length; sha256=(Get-FileHash -LiteralPath $exe.FullName).Hash; fileVersion=$exe.VersionInfo.FileVersion; authenticode=(Get-AuthenticodeSignature -LiteralPath $exe.FullName).Status.ToString(); distributionReady=$false }
    $apkFolder = Join-Path $workspace ($appPath+'/src-tauri/gen/android/app/build/outputs/apk/arm64/release')
    $apk = Get-ChildItem -LiteralPath $apkFolder -Filter '*.apk' | Select-Object -First 1
    if (!$apk) { throw "No APK validation artifact for $app" }
    $badging = & $aapt dump badging $apk.FullName
    if ($LASTEXITCODE -ne 0) { throw 'APK metadata could not be read' }
    & node .github/scripts/verify-android-identity.mjs $apk.FullName ($appPath+'/src-tauri/gen/android') $aapt
    if ($LASTEXITCODE -ne 0 -or ($badging -match 'application-debuggable')) { throw "APK identity/debug check failed for $app" }
    $manifest = & $aapt dump xmltree $apk.FullName AndroidManifest.xml
    if ($LASTEXITCODE -ne 0 -or !($manifest -match 'allowBackup.*0x0')) { throw "APK automatic-backup policy is not disabled for $app" }
    $libraryName = if ($app -eq 'kiosk') { 'jamanvaar_kiosk_user_lib' } else { 'jamanvaar_'+$app.Replace('-','_')+'_lib' }
    $library = Join-Path $inspectionFolder ($app+'.so')
    $zip = [IO.Compression.ZipFile]::OpenRead($apk.FullName)
    try {
        $entries = @($zip.Entries.FullName)
        if (@($entries | Where-Object { $_ -match '\.map$|(^|/)(mapping|seeds|usage)\.txt$' }).Count) { throw 'Unintended source maps/R8 diagnostics inside APK' }
        if (!@($entries | Where-Object { $_ -match '^classes\d*\.dex$' }).Count) { throw 'Missing compiled Android classes' }
        $nativeEntry = $zip.GetEntry('lib/arm64-v8a/lib'+$libraryName+'.so')
        if (!$nativeEntry) { throw "Missing packaged native library for $app" }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($nativeEntry, $library, $true)
    } finally { $zip.Dispose() }
    $sections = & $reader --sections $library
    if ($LASTEXITCODE -ne 0 -or ($sections -match '\.debug_(info|line|str)')) { throw 'Unintended native debug sections in release library' }
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $signatureOutput = & (Join-Path $tools.javaHome 'bin/java.exe') -jar $apkSignerJar verify --print-certs $apk.FullName 2>&1
    $signatureExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    if ($signatureExitCode -ne 1 -or !($signatureOutput -match 'Missing META-INF/MANIFEST.MF')) { throw "Expected unsigned validation APK for $app; inspect signature output before recording it" }
    $mapping = Get-Item -LiteralPath ($appPath+'/src-tauri/gen/android/app/build/outputs/mapping/arm64Release/mapping.txt')
    $android = @{ file=$apk.FullName; size=$apk.Length; sha256=(Get-FileHash -LiteralPath $apk.FullName).Hash; package=$config.identifier; version=$config.version; debuggable=$false; allowBackup=$false; abi='arm64-v8a'; r8MappingPresent=($mapping.Length -gt 0); nativeDebugSections=$false; inspectedNativeLibrary='packaged APK library'; sourceMapsAndR8DiagnosticsPackaged=$false; signed=$false; signatureVerificationExitCode=$signatureExitCode; distributionReady=$false }
    $results += @{ app=$app; windows=$windows; android=$android }
}
@{ scope='Unsigned local production-context validation artifacts only; installer/signature/predecessor acceptance pending'; results=$results } | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 docs/reports/native-updates-2026-10-11/evidence/NATIVE_ARTIFACTS.json
Write-Output 'Recorded five Windows/Android artifact identities and hashes; release signature and installed-device acceptance are not implied.'
