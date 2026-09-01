$desktopPath = "C:\Users\OM Sanjhira\OneDrive\Desktop"
$destPackage = Join-Path $desktopPath "JAMANVAAR_DESKTOP_PACKAGE"
$iconDir = Join-Path $destPackage "icons"
$restbotIcon = "C:\Users\OM Sanjhira\OneDrive\Desktop\restbot\src-tauri\icons\icon.ico"
$newIcoPath = Join-Path $iconDir "jamanvaar_brand.ico"

Write-Host "==============================================================="
Write-Host "      FORCING WINDOWS EXPLORER ICON CACHE RESET & RESTART      "
Write-Host "==============================================================="

# 1. Ensure permanent brand icon file exists
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
Copy-Item -Force $restbotIcon $newIcoPath
Write-Host "1. Permanent icon saved to: $newIcoPath"

# 2. Update Desktop Shortcuts to point to jamanvaar_brand.ico
$ws = New-Object -ComObject WScript.Shell

$s1 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Kiosk.lnk"))
$s1.TargetPath = (Join-Path $destPackage "JAMANVAAR_Touch_Kiosk.exe")
$s1.WorkingDirectory = $destPackage
$s1.IconLocation = "$newIcoPath,0"
$s1.Save()

$s2 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Admin.lnk"))
$s2.TargetPath = (Join-Path $destPackage "JAMANVAAR_Admin_POS.exe")
$s2.WorkingDirectory = $destPackage
$s2.IconLocation = "$newIcoPath,0"
$s2.Save()

$s3 = $ws.CreateShortcut((Join-Path $desktopPath "START JAMANVAAR.lnk"))
$s3.TargetPath = "wscript.exe"
$s3.Arguments = "`"" + (Join-Path $destPackage "START_ALL_TERMINALS.vbs") + "`""
$s3.WorkingDirectory = $destPackage
$s3.IconLocation = "$newIcoPath,0"
$s3.Save()

Write-Host "2. Desktop shortcuts updated with direct icon path: $newIcoPath"

# 3. Kill Explorer, Purge Cache Databases, Restart Explorer
Write-Host "3. Restarting Windows Explorer to flush icon cache..."
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\Windows\Explorer" -Filter "iconcache_*.db" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\IconCache.db" -Force -ErrorAction SilentlyContinue

Start-Process explorer.exe
Start-Sleep -Seconds 1

Write-Host "==============================================================="
Write-Host "SUCCESS: Windows Explorer restarted and icons flushed!"
Write-Host "==============================================================="
