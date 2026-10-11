$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$toolRoot = Join-Path $env:USERPROFILE '.jamanvaar-build-tools'
New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-VerifiedArchive([string]$Url, [string]$Hash, [string]$Target) {
    & curl.exe --fail --location --silent --show-error --proto '=https' --proto-redir '=https' --output $Target $Url
    if ($LASTEXITCODE -ne 0) { throw 'Toolchain download failed' }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $Target).Hash.ToLowerInvariant() -ne $Hash.ToLowerInvariant()) { throw 'Toolchain checksum mismatch; archive will not be extracted' }
}

$javaRoot = Join-Path $toolRoot 'java17'
if (!(Test-Path -LiteralPath $javaRoot)) {
    $metadata = Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
    $package = $metadata[0].binary.package
    $archive = Join-Path $toolRoot 'temurin17.zip'
    Get-VerifiedArchive $package.link $package.checksum $archive
    [System.IO.Compression.ZipFile]::ExtractToDirectory($archive, $javaRoot)
}
$javaDir = Get-ChildItem -LiteralPath $javaRoot -Directory | Select-Object -First 1
if (!(Test-Path -LiteralPath (Join-Path $javaDir.FullName 'bin/java.exe'))) { throw 'Java archive layout is invalid' }

$sdkRoot = Join-Path $toolRoot 'android-sdk'
$sdkTools = Join-Path $sdkRoot 'cmdline-tools/latest'
if (!(Test-Path -LiteralPath (Join-Path $sdkTools 'bin/sdkmanager.bat'))) {
    $archive = Join-Path $toolRoot 'android-command-tools.zip'
    # Google's official command-line tools page, verified 11 October 2026.
    Get-VerifiedArchive 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a' $archive
    $unpack = Join-Path $toolRoot 'android-command-tools-unpacked'
    if (Test-Path -LiteralPath $unpack) { throw 'Prior extraction exists; inspect it before retrying' }
    [System.IO.Compression.ZipFile]::ExtractToDirectory($archive, $unpack)
    New-Item -ItemType Directory -Force -Path $sdkTools | Out-Null
    Copy-Item -Path (Join-Path $unpack 'cmdline-tools/*') -Destination $sdkTools -Recurse
}
@{ javaHome = $javaDir.FullName; sdkRoot = $sdkRoot; toolRoot = $toolRoot } | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $toolRoot 'paths.json')
Write-Output 'Verified Android command-line tools and Java downloaded outside the workspace; no global environment variables or signing identities changed.'
