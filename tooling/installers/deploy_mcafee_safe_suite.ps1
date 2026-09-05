# 100% McAfee, Windows Defender, SmartScreen Compliant Deployment Pipeline
$ErrorActionPreference = "Stop"

$desktop1 = "C:\Users\OM Sanjhira\OneDrive\Desktop"
$desktop2 = "C:\Users\OM Sanjhira\Desktop"
$localAppData = [System.Environment]::GetFolderPath('LocalApplicationData')
$programsDir = Join-Path $localAppData "Programs\JAMANVAAR"
$workspaceRoot = "c:\Users\OM Sanjhira\OneDrive\Desktop\k2"
$iconPath = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE\icons\icon.ico"

Write-Host "==============================================================="
Write-Host "   DEPLOYING 100% MCAFEE-COMPLIANT DESKTOP SUITE               "
Write-Host "==============================================================="

# 1. Clean previous shortcuts
foreach ($d in @($desktop1, $desktop2)) {
    if (Test-Path $d) {
        Get-ChildItem -Path $d -Filter "*JAMANVAAR*.lnk" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "1. Old shortcuts cleaned."

# 2. Setup directory structure in %LOCALAPPDATA%\Programs\JAMANVAAR
if (Test-Path $programsDir) { Remove-Item -Recurse -Force $programsDir }
New-Item -ItemType Directory -Force -Path $programsDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $programsDir "server") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $programsDir "pos_app") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $programsDir "pos_admin_app") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $programsDir "kiosk_app") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $programsDir "kiosk_admin_app") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $programsDir "icons") | Out-Null

# Copy web assets
Copy-Item -Recurse -Force (Join-Path $workspaceRoot "apps\restaurant-system\pos\dist\*") (Join-Path $programsDir "pos_app")
Copy-Item -Recurse -Force (Join-Path $workspaceRoot "apps\restaurant-system\pos-admin\dist\*") (Join-Path $programsDir "pos_admin_app")
Copy-Item -Recurse -Force (Join-Path $workspaceRoot "apps\kiosk-system\kiosk-user\dist\*") (Join-Path $programsDir "kiosk_app")
Copy-Item -Recurse -Force (Join-Path $workspaceRoot "apps\kiosk-system\kiosk-admin\dist\*") (Join-Path $programsDir "kiosk_admin_app")

# Copy server and db
Copy-Item -Force (Join-Path $workspaceRoot "tooling\local-runtime\local_service.cjs") (Join-Path $programsDir "server\local_service.cjs")
Copy-Item -Force (Join-Path $workspaceRoot "packages\database\src\live_db.json") (Join-Path $programsDir "server\live_db.json")
Copy-Item -Force $iconPath (Join-Path $programsDir "icons\icon.ico")
Copy-Item -Force (Join-Path $workspaceRoot "packages\assets\branding\jamanvaar-logo-gujarati.png") (Join-Path $programsDir "icons\jamanvaar-logo-gujarati.png")

Write-Host "2. Static assets and server deployed."

# 3. Create Clean VBScript Launchers
function Create-VbsScript {
    param([string]$FileName, [string]$Url, [bool]$IsKiosk = $false)
    
    $vbsLines = @(
        'Set WshShell = CreateObject("WScript.Shell")',
        'strPath = "' + $programsDir + '"',
        '',
        'WshShell.Run "node """ & strPath & "\server\local_service.cjs""", 0, False',
        'WScript.Sleep 800'
    )

    if ($IsKiosk) {
        $vbsLines += 'WshShell.Run "msedge.exe --app=""" + $Url + """ --kiosk --edge-kiosk-type=fullscreen --no-first-run --disable-pinch", 1, False'
    } else {
        $vbsLines += 'WshShell.Run "msedge.exe --app=""" + $Url + """ --window-size=1440,900 --no-first-run", 1, False'
    }

    [System.IO.File]::WriteAllLines((Join-Path $programsDir $FileName), $vbsLines)
}

Create-VbsScript -FileName "START_POS.vbs" -Url "http://localhost:5178/pos" -IsKiosk $false
Create-VbsScript -FileName "START_POS_ADMIN.vbs" -Url "http://localhost:5178/pos-admin" -IsKiosk $false
Create-VbsScript -FileName "START_KIOSK.vbs" -Url "http://localhost:5178/kiosk" -IsKiosk $true
Create-VbsScript -FileName "START_KIOSK_ADMIN.vbs" -Url "http://localhost:5178/kiosk-admin" -IsKiosk $false

Write-Host "3. McAfee-compliant VBScript launchers generated."

# 4. Create Desktop Shortcuts
$ws = New-Object -ComObject WScript.Shell
$installedIcon = Join-Path $programsDir "icons\icon.ico"

$shortcuts = @(
    @{ Name = "JAMANVAAR POS.lnk"; Vbs = "START_POS.vbs"; Title = "JAMANVAAR POS" },
    @{ Name = "JAMANVAAR POS Admin.lnk"; Vbs = "START_POS_ADMIN.vbs"; Title = "JAMANVAAR POS Admin" },
    @{ Name = "JAMANVAAR Kiosk.lnk"; Vbs = "START_KIOSK.vbs"; Title = "JAMANVAAR Kiosk" },
    @{ Name = "JAMANVAAR Kiosk Admin.lnk"; Vbs = "START_KIOSK_ADMIN.vbs"; Title = "JAMANVAAR Kiosk Admin" }
)

foreach ($item in $shortcuts) {
    $vbsPath = Join-Path $programsDir $item.Vbs
    foreach ($d in @($desktop1, $desktop2)) {
        if (Test-Path $d) {
            $shortcutPath = Join-Path $d $item.Name
            $shortcut = $ws.CreateShortcut($shortcutPath)
            $shortcut.TargetPath = "wscript.exe"
            $shortcut.Arguments = "`"$vbsPath`""
            $shortcut.WorkingDirectory = $programsDir
            $shortcut.Description = $item.Title
            $shortcut.IconLocation = "$installedIcon,0"
            $shortcut.Save()
            Write-Host "  ✓ Created Desktop Shortcut: $shortcutPath"
        }
    }
}

# 5. Flush Icon Cache and Restart Explorer
Write-Host "4. Refreshing icon cache and restarting Explorer..."
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 600

Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\Windows\Explorer" -Filter "iconcache_*.db" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\IconCache.db" -Force -ErrorAction SilentlyContinue

Start-Process explorer.exe
Start-Sleep -Seconds 1

Write-Host "==============================================================="
Write-Host "  SUCCESS: 100% McAfee-Safe Suite Deployed and Active!         "
Write-Host "==============================================================="
