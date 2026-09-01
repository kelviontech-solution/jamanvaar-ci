$desktopPath = "C:\Users\OM Sanjhira\OneDrive\Desktop"
$srcPackage = "C:\Users\OM Sanjhira\OneDrive\Desktop\k2\JAMANVAAR_DESKTOP_PACKAGE"
$srcZip = "C:\Users\OM Sanjhira\OneDrive\Desktop\k2\JAMANVAAR_KIOSK_SYSTEM.zip"
$destPackage = Join-Path $desktopPath "JAMANVAAR_DESKTOP_PACKAGE"
$destZip = Join-Path $desktopPath "JAMANVAAR_KIOSK_SYSTEM.zip"

Write-Host "==============================================================="
Write-Host "   DEPLOYING JAMANVAAR DESKTOP APPLICATIONS TO USER DESKTOP    "
Write-Host "==============================================================="

# 1. Copy full desktop package folder directly to Windows Desktop
Write-Host "`n1. Copying JAMANVAAR_DESKTOP_PACKAGE to Desktop..."
if (Test-Path $destPackage) {
    Remove-Item -Recurse -Force $destPackage
}
Copy-Item -Recurse -Force $srcPackage $destPackage
Write-Host "   ✓ Package folder copied to $destPackage"

# 2. Copy deployable ZIP to Windows Desktop
Write-Host "`n2. Copying JAMANVAAR_KIOSK_SYSTEM.zip to Desktop..."
Copy-Item -Force $srcZip $destZip
Write-Host "   ✓ ZIP package copied to $destZip"

# 3. Create Windows Desktop Shortcuts with official brand icon
Write-Host "`n3. Creating branded shortcuts on Desktop..."
$ws = New-Object -ComObject WScript.Shell
$iconPath = Join-Path $destPackage "icons\icon.ico"

# Shortcut 1: Customer Touch Kiosk
$s1 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Touch Kiosk.lnk"))
$s1.TargetPath = "wscript.exe"
$s1.Arguments = "`"" + (Join-Path $destPackage "START_CUSTOMER_KIOSK.vbs") + "`""
$s1.WorkingDirectory = $destPackage
$s1.IconLocation = $iconPath
$s1.Save()

# Shortcut 2: Admin POS & KDS
$s2 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Admin POS.lnk"))
$s2.TargetPath = "wscript.exe"
$s2.Arguments = "`"" + (Join-Path $destPackage "START_ADMIN_POS.vbs") + "`""
$s2.WorkingDirectory = $destPackage
$s2.IconLocation = $iconPath
$s2.Save()

# Shortcut 3: Start All Launcher
$s3 = $ws.CreateShortcut((Join-Path $desktopPath "START ALL JAMANVAAR.lnk"))
$s3.TargetPath = "wscript.exe"
$s3.Arguments = "`"" + (Join-Path $destPackage "START_ALL_TERMINALS.vbs") + "`""
$s3.WorkingDirectory = $destPackage
$s3.IconLocation = $iconPath
$s3.Save()

Write-Host "   Created desktop shortcuts with official JAMANVAAR logo icon!"

# 4. Launch the applications now!
Write-Host "4. Launching applications on your screen..."
Start-Process -FilePath "wscript.exe" -ArgumentList "`"$destPackage\START_ALL_TERMINALS.vbs`"" -WorkingDirectory $destPackage

Write-Host "==============================================================="
Write-Host "SUCCESS: Desktop Applications Deployed and Running!"
Write-Host "==============================================================="
