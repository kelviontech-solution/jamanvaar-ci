$workspaceRoot = $PSScriptRoot | Split-Path -Parent
$desktopPath = "C:\Users\OM Sanjhira\OneDrive\Desktop"
$destPackage = Join-Path $desktopPath "JAMANVAAR_DESKTOP_PACKAGE"
$destZip = Join-Path $desktopPath "JAMANVAAR_KIOSK_SYSTEM.zip"
$icoSource = "C:\Users\OM Sanjhira\OneDrive\Desktop\restbot\src-tauri\icons\icon.ico"

Write-Host "==============================================================="
Write-Host "   COMPLETE UNINSTALL & FRESH REINSTALL OF JAMANVAAR APPS      "
Write-Host "==============================================================="

# STEP 1: Delete all old shortcut files completely
Write-Host "`n1. Deleting all old shortcuts from Desktop..."
$shortcutsToDelete = Get-ChildItem $desktopPath -Filter "*JAMANVAAR*.lnk"
foreach ($s in $shortcutsToDelete) {
    Remove-Item -Force $s.FullName
    Write-Host "   Deleted: $($s.Name)"
}

if (Test-Path $destPackage) {
    Remove-Item -Recurse -Force $destPackage
    Write-Host "   Deleted old JAMANVAAR_DESKTOP_PACKAGE"
}

# STEP 2: Copy clean icons into source
Write-Host "`n2. Setting up icon assets..."
$pkgDir = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE"
$iconDir = Join-Path $pkgDir "icons"
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
Copy-Item -Force $icoSource (Join-Path $iconDir "icon.ico")
Copy-Item -Force $icoSource (Join-Path $workspaceRoot "assets\icons\icon.ico")

# STEP 3: Re-copy clean JAMANVAAR_DESKTOP_PACKAGE to Desktop
Write-Host "`n3. Copying fresh package to Desktop..."
Copy-Item -Recurse -Force $pkgDir $destPackage
Write-Host "   Copied to $destPackage"

# STEP 4: Update ZIP file
Write-Host "`n4. Updating ZIP package..."
$zipPath = Join-Path $workspaceRoot "JAMANVAAR_KIOSK_SYSTEM.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $pkgDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Copy-Item -Force $zipPath $destZip
Write-Host "   ZIP updated at $destZip"

# STEP 5: Create brand new fresh shortcuts
Write-Host "`n5. Creating fresh Desktop Shortcuts..."
$ws = New-Object -ComObject WScript.Shell
$desktopIco = Join-Path $destPackage "icons\icon.ico"

# 1. Customer Kiosk
$s1 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Kiosk.lnk"))
$s1.TargetPath = (Join-Path $destPackage "JAMANVAAR_Touch_Kiosk.exe")
$s1.WorkingDirectory = $destPackage
$s1.IconLocation = "$desktopIco,0"
$s1.Save()

# 2. Admin POS
$s2 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Admin.lnk"))
$s2.TargetPath = (Join-Path $destPackage "JAMANVAAR_Admin_POS.exe")
$s2.WorkingDirectory = $destPackage
$s2.IconLocation = "$desktopIco,0"
$s2.Save()

# 3. Master Launcher
$s3 = $ws.CreateShortcut((Join-Path $desktopPath "START JAMANVAAR.lnk"))
$s3.TargetPath = "wscript.exe"
$s3.Arguments = "`"" + (Join-Path $destPackage "START_ALL_TERMINALS.vbs") + "`""
$s3.WorkingDirectory = $destPackage
$s3.IconLocation = "$desktopIco,0"
$s3.Save()

Write-Host "   Created fresh desktop shortcuts!"

# STEP 6: Refresh Windows Explorer Shell
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class CleanIconRefresher {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
[CleanIconRefresher]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host "`n==============================================================="
Write-Host "SUCCESS: Fresh Installation Complete with Clean Icons!"
Write-Host "==============================================================="
