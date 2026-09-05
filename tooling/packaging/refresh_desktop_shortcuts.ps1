$ws = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$base = "C:\Users\OM Sanjhira\OneDrive\Desktop\JAMANVAAR_DESKTOP_PACKAGE"
$iconPath = Join-Path $base "icons\icon.ico"

Write-Host "Updating desktop shortcuts with official jamanvaar.png.png logo..."

# Remove old shortcuts first to clear cache
$s1Path = Join-Path $desktop "JAMANVAAR Touch Kiosk.lnk"
$s2Path = Join-Path $desktop "JAMANVAAR Admin POS.lnk"
$s3Path = Join-Path $desktop "START ALL JAMANVAAR.lnk"

if (Test-Path $s1Path) { Remove-Item -Force $s1Path }
if (Test-Path $s2Path) { Remove-Item -Force $s2Path }
if (Test-Path $s3Path) { Remove-Item -Force $s3Path }

# Recreate Shortcut 1: Touch Kiosk
$s1 = $ws.CreateShortcut($s1Path)
$s1.TargetPath = "wscript.exe"
$s1.Arguments = "`"" + (Join-Path $base "START_CUSTOMER_KIOSK.vbs") + "`""
$s1.WorkingDirectory = $base
$s1.IconLocation = "$iconPath,0"
$s1.Save()

# Recreate Shortcut 2: Admin POS
$s2 = $ws.CreateShortcut($s2Path)
$s2.TargetPath = "wscript.exe"
$s2.Arguments = "`"" + (Join-Path $base "START_ADMIN_POS.vbs") + "`""
$s2.WorkingDirectory = $base
$s2.IconLocation = "$iconPath,0"
$s2.Save()

# Recreate Shortcut 3: Start All
$s3 = $ws.CreateShortcut($s3Path)
$s3.TargetPath = "wscript.exe"
$s3.Arguments = "`"" + (Join-Path $base "START_ALL_TERMINALS.vbs") + "`""
$s3.WorkingDirectory = $base
$s3.IconLocation = "$iconPath,0"
$s3.Save()

# Force Windows Explorer to refresh its icon cache immediately
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ShellRefresh {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
[ShellRefresh]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host "Desktop shortcuts refreshed with official JAMANVAAR brand icon!"
