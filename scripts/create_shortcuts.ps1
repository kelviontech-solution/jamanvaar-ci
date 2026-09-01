$ws = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$base = "c:\Users\OM Sanjhira\OneDrive\Desktop\k2\JAMANVAAR_DESKTOP_PACKAGE"

# Kiosk Shortcut
$s1 = $ws.CreateShortcut((Join-Path $desktop "JAMANVAAR Touch Kiosk.lnk"))
$s1.TargetPath = "wscript.exe"
$s1.Arguments = "`"" + (Join-Path $base "START_CUSTOMER_KIOSK.vbs") + "`""
$s1.WorkingDirectory = $base
$s1.IconLocation = (Join-Path $base "icons\icon.ico")
$s1.Save()

# Admin POS Shortcut
$s2 = $ws.CreateShortcut((Join-Path $desktop "JAMANVAAR Admin POS.lnk"))
$s2.TargetPath = "wscript.exe"
$s2.Arguments = "`"" + (Join-Path $base "START_ADMIN_POS.vbs") + "`""
$s2.WorkingDirectory = $base
$s2.IconLocation = (Join-Path $base "icons\icon.ico")
$s2.Save()

# Master Launcher Shortcut
$s3 = $ws.CreateShortcut((Join-Path $desktop "START ALL JAMANVAAR.lnk"))
$s3.TargetPath = "wscript.exe"
$s3.Arguments = "`"" + (Join-Path $base "START_ALL_TERMINALS.vbs") + "`""
$s3.WorkingDirectory = $base
$s3.IconLocation = (Join-Path $base "icons\icon.ico")
$s3.Save()

Write-Host "Branded Desktop Shortcuts created successfully on your Windows Desktop!"
