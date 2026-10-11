$ErrorActionPreference = 'Stop'
$tools = Get-Content (Join-Path $env:USERPROFILE '.jamanvaar-build-tools/paths.json') -Raw | ConvertFrom-Json
$env:JAVA_HOME = $tools.javaHome
$env:ANDROID_HOME = $tools.sdkRoot
$env:DEBUG = ''
$env:PATH = (Join-Path $tools.javaHome 'bin') + ';' + $env:PATH
$manager = Join-Path $tools.sdkRoot 'cmdline-tools/latest/bin/sdkmanager.bat'
# Same SDK license/install sequence as the existing authorized Android release workflow.
1..100 | ForEach-Object { 'y' } | & $manager "--sdk_root=$($tools.sdkRoot)" --licenses
if ($LASTEXITCODE -ne 0) { throw 'SDK license setup failed' }
& $manager "--sdk_root=$($tools.sdkRoot)" --install 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' 'ndk;27.0.12077973'
if ($LASTEXITCODE -ne 0) { throw 'Android SDK package installation failed' }
Write-Output 'Installed Android build tools outside the workspace; no signing keys or global environment changed.'
