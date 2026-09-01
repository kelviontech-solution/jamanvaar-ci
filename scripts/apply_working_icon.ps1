$workspaceRoot = $PSScriptRoot | Split-Path -Parent
$desktopPath = "C:\Users\OM Sanjhira\OneDrive\Desktop"
$restbotIcons = "C:\Users\OM Sanjhira\OneDrive\Desktop\restbot\src-tauri\icons"
$targetIcons = Join-Path $workspaceRoot "assets\icons"
$pkgIcons = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE\icons"
$desktopPkg = Join-Path $desktopPath "JAMANVAAR_DESKTOP_PACKAGE"
$desktopPkgIcons = Join-Path $desktopPkg "icons"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

Write-Host "==============================================================="
Write-Host "     APPLYING PROVEN CRISP ICON TO JAMANVAAR DESKTOP & ZIP     "
Write-Host "==============================================================="

# 1. Copy proven icons
if (Test-Path $restbotIcons) {
    Copy-Item -Recurse -Force (Join-Path $restbotIcons "*") $targetIcons
    Copy-Item -Recurse -Force (Join-Path $restbotIcons "*") $pkgIcons
}

# 2. Recompile Native EXEs with the clean icon.ico
$icoPath = Join-Path $targetIcons "icon.ico"
$tempSrcDir = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE\temp_src"
if (-not (Test-Path $tempSrcDir)) { New-Item -ItemType Directory -Force -Path $tempSrcDir | Out-Null }

$kioskCs = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace Jamanvaar.Kiosk
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverScript = Path.Combine(baseDir, "server", "local_service.cjs");
            EnsureLocalService(serverScript);

            string edge = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            if (!File.Exists(edge)) edge = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";

            if (File.Exists(edge))
            {
                string uData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JAMANVAAR_Kiosk_Profile");
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = edge;
                psi.Arguments = "--user-data-dir=\"" + uData + "\" --app=\"http://localhost:5178/kiosk/\" --kiosk --edge-kiosk-type=fullscreen --no-first-run --disable-pinch";
                Process.Start(psi);
            }
            else
            {
                Process.Start("http://localhost:5178/kiosk/");
            }
        }

        private static void EnsureLocalService(string script)
        {
            try
            {
                var req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create("http://localhost:5178/api/health");
                req.Timeout = 800;
                using (var res = req.GetResponse()) { return; }
            }
            catch
            {
                ProcessStartInfo psi = new ProcessStartInfo("node", "\"" + script + "\"");
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(psi);
                Thread.Sleep(1200);
            }
        }
    }
}
'@
[System.IO.File]::WriteAllText((Join-Path $tempSrcDir "KioskProgram.cs"), $kioskCs)

$adminCs = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace Jamanvaar.Admin
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverScript = Path.Combine(baseDir, "server", "local_service.cjs");
            EnsureLocalService(serverScript);

            string edge = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            if (!File.Exists(edge)) edge = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";

            if (File.Exists(edge))
            {
                string uData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JAMANVAAR_Admin_Profile");
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = edge;
                psi.Arguments = "--user-data-dir=\"" + uData + "\" --app=\"http://localhost:5178/admin/\" --window-size=1440,900";
                Process.Start(psi);
            }
            else
            {
                Process.Start("http://localhost:5178/admin/");
            }
        }

        private static void EnsureLocalService(string script)
        {
            try
            {
                var req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create("http://localhost:5178/api/health");
                req.Timeout = 800;
                using (var res = req.GetResponse()) { return; }
            }
            catch
            {
                ProcessStartInfo psi = new ProcessStartInfo("node", "\"" + script + "\"");
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(psi);
                Thread.Sleep(1200);
            }
        }
    }
}
'@
[System.IO.File]::WriteAllText((Join-Path $tempSrcDir "AdminProgram.cs"), $adminCs)

$kioskExe = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE\JAMANVAAR_Touch_Kiosk.exe"
$adminExe = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE\JAMANVAAR_Admin_POS.exe"

& $csc /target:winexe /out:"$kioskExe" /win32icon:"$icoPath" /reference:System.dll (Join-Path $tempSrcDir "KioskProgram.cs")
& $csc /target:winexe /out:"$adminExe" /win32icon:"$icoPath" /reference:System.dll (Join-Path $tempSrcDir "AdminProgram.cs")

Remove-Item -Recurse -Force $tempSrcDir

# 3. Update Desktop Package and ZIP
if (Test-Path $desktopPkg) { Remove-Item -Recurse -Force $desktopPkg }
Copy-Item -Recurse -Force (Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE") $desktopPkg

$zipPath = Join-Path $workspaceRoot "JAMANVAAR_KIOSK_SYSTEM.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE\*") -DestinationPath $zipPath -CompressionLevel Optimal
Copy-Item -Force $zipPath (Join-Path $desktopPath "JAMANVAAR_KIOSK_SYSTEM.zip")

# 4. Remove and recreate shortcuts with the exact icon path
$ws = New-Object -ComObject WScript.Shell
$desktopIcoFile = Join-Path $desktopPkgIcons "icon.ico"

$oldShortcuts = @("JAMANVAAR Touch Kiosk.lnk", "JAMANVAAR Admin POS.lnk", "START ALL JAMANVAAR.lnk")
foreach ($s in $oldShortcuts) {
    $p = Join-Path $desktopPath $s
    if (Test-Path $p) { Remove-Item -Force $p }
}

$s1 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Touch Kiosk.lnk"))
$s1.TargetPath = (Join-Path $desktopPkg "JAMANVAAR_Touch_Kiosk.exe")
$s1.WorkingDirectory = $desktopPkg
$s1.IconLocation = "$desktopIcoFile,0"
$s1.Save()

$s2 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Admin POS.lnk"))
$s2.TargetPath = (Join-Path $desktopPkg "JAMANVAAR_Admin_POS.exe")
$s2.WorkingDirectory = $desktopPkg
$s2.IconLocation = "$desktopIcoFile,0"
$s2.Save()

$s3 = $ws.CreateShortcut((Join-Path $desktopPath "START ALL JAMANVAAR.lnk"))
$s3.TargetPath = "wscript.exe"
$s3.Arguments = "`"" + (Join-Path $desktopPkg "START_ALL_TERMINALS.vbs") + "`""
$s3.WorkingDirectory = $desktopPkg
$s3.IconLocation = "$desktopIcoFile,0"
$s3.Save()

# 5. Trigger Shell Icon Refresh
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class FinalShellRefresh {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
[FinalShellRefresh]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host "==============================================================="
Write-Host "SUCCESS: Clean Crisp Brand Icon Applied to Desktop & ZIP!"
Write-Host "==============================================================="
