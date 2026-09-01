Add-Type -AssemblyName System.Drawing

$workspaceRoot = $PSScriptRoot | Split-Path -Parent
$desktopPath = "C:\Users\OM Sanjhira\OneDrive\Desktop"
$distDir = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE"
$userDesktopDist = Join-Path $desktopPath "JAMANVAAR_DESKTOP_PACKAGE"
$iconPath = Join-Path $workspaceRoot "assets\icons\icon.ico"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

Write-Host "==============================================================="
Write-Host "  BUILDING 100% BRANDED TASKBAR & DESKTOP NATIVE WINDOWS APPS  "
Write-Host "==============================================================="

# 1. Generate multi-resolution icons from official uploaded brand logo
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build_logo_icon_from_upload.ps1")

# 2. Re-create output structure
if (Test-Path $distDir) { Remove-Item -Recurse -Force $distDir }
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $distDir "server") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $distDir "admin_app") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $distDir "kiosk_app") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $distDir "icons") | Out-Null

Copy-Item -Recurse -Force (Join-Path $workspaceRoot "apps\kiosk-admin\dist\*") (Join-Path $distDir "admin_app")
Copy-Item -Recurse -Force (Join-Path $workspaceRoot "apps\kiosk-user\dist\*") (Join-Path $distDir "kiosk_app")
Copy-Item -Force (Join-Path $workspaceRoot "scripts\local_service.cjs") (Join-Path $distDir "server\local_service.cjs")
Copy-Item -Force (Join-Path $workspaceRoot "shared\database\src\live_db.json") (Join-Path $distDir "server\live_db.json")
Copy-Item -Recurse -Force (Join-Path $workspaceRoot "assets\icons\*") (Join-Path $distDir "icons")
Copy-Item -Force (Join-Path $workspaceRoot "shared\assets\branding\jamanvaar-logo.png") (Join-Path $distDir "icons\jamanvaar-logo.png")

# 3. Create C# Source for Native Kiosk & Admin Executables that force Taskbar Icon
$tempSrcDir = Join-Path $distDir "temp_src"
New-Item -ItemType Directory -Force -Path $tempSrcDir | Out-Null

# --- KIOSK C# WINDOWS APP ---
$kioskCs = @'
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace Jamanvaar.Kiosk
{
    public class KioskForm : Form
    {
        [DllImport("shell32.dll", SetLastError = true)]
        private static extern void SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string AppID);

        private WebBrowser browser;

        public KioskForm()
        {
            SetCurrentProcessExplicitAppUserModelID("com.kelviontech.jamanvaar.kiosk");
            this.Text = "JAMANVAAR Customer Touch Kiosk";
            this.FormBorderStyle = FormBorderStyle.None;
            this.WindowState = FormWindowState.Maximized;
            this.TopMost = false;
            this.BackColor = Color.FromArgb(250, 248, 245);

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string icoPath = Path.Combine(baseDir, "icons", "icon.ico");
            if (File.Exists(icoPath))
            {
                this.Icon = new Icon(icoPath);
            }

            browser = new WebBrowser();
            browser.Dock = DockStyle.Fill;
            browser.ScriptErrorsSuppressed = true;
            browser.IsWebBrowserContextMenuEnabled = false;
            this.Controls.Add(browser);

            this.Load += (s, e) => {
                browser.Navigate("http://localhost:5178/kiosk/");
            };
        }

        [STAThread]
        public static void Main()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverScript = Path.Combine(baseDir, "server", "local_service.cjs");
            EnsureLocalService(serverScript);

            // Launch Edge App with custom App ID and user-data-dir so taskbar groups properly, or native form
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
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new KioskForm());
            }
        }

        private static void EnsureLocalService(string script)
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create("http://localhost:5178/api/health");
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

# --- ADMIN C# WINDOWS APP ---
$adminCs = @'
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace Jamanvaar.Admin
{
    public class AdminForm : Form
    {
        [DllImport("shell32.dll", SetLastError = true)]
        private static extern void SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string AppID);

        private WebBrowser browser;

        public AdminForm()
        {
            SetCurrentProcessExplicitAppUserModelID("com.kelviontech.jamanvaar.admin");
            this.Text = "JAMANVAAR Admin POS & Kitchen KDS Control Plane";
            this.Size = new Size(1440, 900);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(250, 248, 245);

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string icoPath = Path.Combine(baseDir, "icons", "icon.ico");
            if (File.Exists(icoPath))
            {
                this.Icon = new Icon(icoPath);
            }

            browser = new WebBrowser();
            browser.Dock = DockStyle.Fill;
            browser.ScriptErrorsSuppressed = true;
            this.Controls.Add(browser);

            this.Load += (s, e) => {
                browser.Navigate("http://localhost:5178/admin/");
            };
        }

        [STAThread]
        public static void Main()
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
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new AdminForm());
            }
        }

        private static void EnsureLocalService(string script)
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create("http://localhost:5178/api/health");
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

# Compile Executables with Native Embedded Icon
Write-Host "Compiling native Windows .EXE binaries with official brand icon..."
$kioskExe = Join-Path $distDir "JAMANVAAR_Touch_Kiosk.exe"
$adminExe = Join-Path $distDir "JAMANVAAR_Admin_POS.exe"

& $csc /target:winexe /out:"$kioskExe" /win32icon:"$iconPath" /reference:System.Windows.Forms.dll,System.Drawing.dll,System.dll (Join-Path $tempSrcDir "KioskProgram.cs")
& $csc /target:winexe /out:"$adminExe" /win32icon:"$iconPath" /reference:System.Windows.Forms.dll,System.Drawing.dll,System.dll (Join-Path $tempSrcDir "AdminProgram.cs")

Remove-Item -Recurse -Force $tempSrcDir

# 4. Helper Launchers
$vbsMaster = @"
Set WshShell = CreateObject("WScript.Shell")
strPath = WshShell.CurrentDirectory
WshShell.Run "node """ & strPath & "\server\local_service.cjs""", 0, False
WScript.Sleep 1500
WshShell.Run """" & strPath & "\JAMANVAAR_Admin_POS.exe""", 1, False
WshShell.Run """" & strPath & "\JAMANVAAR_Touch_Kiosk.exe""", 1, False
"@
[System.IO.File]::WriteAllText((Join-Path $distDir "START_ALL_TERMINALS.vbs"), $vbsMaster)

$vbsKiosk = @"
Set WshShell = CreateObject("WScript.Shell")
strPath = WshShell.CurrentDirectory
WshShell.Run """" & strPath & "\JAMANVAAR_Touch_Kiosk.exe""", 1, False
"@
[System.IO.File]::WriteAllText((Join-Path $distDir "START_CUSTOMER_KIOSK.vbs"), $vbsKiosk)

$vbsAdmin = @"
Set WshShell = CreateObject("WScript.Shell")
strPath = WshShell.CurrentDirectory
WshShell.Run """" & strPath & "\JAMANVAAR_Admin_POS.exe""", 1, False
"@
[System.IO.File]::WriteAllText((Join-Path $distDir "START_ADMIN_POS.vbs"), $vbsAdmin)

# 5. Create Desktop Shortcuts script for deployment
$shortcutBat = @"
@echo off
setlocal
cd /d "%~dp0"
powershell -Command "`$ws = New-Object -ComObject WScript.Shell; `$desktop = [System.Environment]::GetFolderPath('Desktop'); `$s1 = `$ws.CreateShortcut((Join-Path `$desktop 'JAMANVAAR Touch Kiosk.lnk')); `$s1.TargetPath = '%~dp0JAMANVAAR_Touch_Kiosk.exe'; `$s1.WorkingDirectory = '%~dp0'; `$s1.IconLocation = '%~dp0icons\icon.ico,0'; `$s1.Save(); `$s2 = `$ws.CreateShortcut((Join-Path `$desktop 'JAMANVAAR Admin POS.lnk')); `$s2.TargetPath = '%~dp0JAMANVAAR_Admin_POS.exe'; `$s2.WorkingDirectory = '%~dp0'; `$s2.IconLocation = '%~dp0icons\icon.ico,0'; `$s2.Save(); `$s3 = `$ws.CreateShortcut((Join-Path `$desktop 'START ALL JAMANVAAR.lnk')); `$s3.TargetPath = 'wscript.exe'; `$s3.Arguments = '`"%~dp0START_ALL_TERMINALS.vbs`"'; `$s3.WorkingDirectory = '%~dp0'; `$s3.IconLocation = '%~dp0icons\icon.ico,0'; `$s3.Save(); Write-Host 'Desktop shortcuts created!'"
"@
[System.IO.File]::WriteAllText((Join-Path $distDir "CREATE_DESKTOP_SHORTCUTS.bat"), $shortcutBat)

# 6. Deploy to User's Desktop
if (Test-Path $userDesktopDist) { Remove-Item -Recurse -Force $userDesktopDist }
Copy-Item -Recurse -Force $distDir $userDesktopDist

# 7. Create Fresh Desktop Shortcuts directly pointing to the .EXEs with embedded icon
$ws = New-Object -ComObject WScript.Shell
$desktopIcon = Join-Path $userDesktopDist "icons\icon.ico"

$oldShortcuts = @("JAMANVAAR Touch Kiosk.lnk", "JAMANVAAR Admin POS.lnk", "START ALL JAMANVAAR.lnk")
foreach ($s in $oldShortcuts) {
    $p = Join-Path $desktopPath $s
    if (Test-Path $p) { Remove-Item -Force $p }
}

$s1 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Touch Kiosk.lnk"))
$s1.TargetPath = (Join-Path $userDesktopDist "JAMANVAAR_Touch_Kiosk.exe")
$s1.WorkingDirectory = $userDesktopDist
$s1.IconLocation = "$desktopIcon,0"
$s1.Save()

$s2 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Admin POS.lnk"))
$s2.TargetPath = (Join-Path $userDesktopDist "JAMANVAAR_Admin_POS.exe")
$s2.WorkingDirectory = $userDesktopDist
$s2.IconLocation = "$desktopIcon,0"
$s2.Save()

$s3 = $ws.CreateShortcut((Join-Path $desktopPath "START ALL JAMANVAAR.lnk"))
$s3.TargetPath = "wscript.exe"
$s3.Arguments = "`"" + (Join-Path $userDesktopDist "START_ALL_TERMINALS.vbs") + "`""
$s3.WorkingDirectory = $userDesktopDist
$s3.IconLocation = "$desktopIcon,0"
$s3.Save()

# 8. Create Updated Deployable ZIP
$zipPath = Join-Path $workspaceRoot "JAMANVAAR_KIOSK_SYSTEM.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $distDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Copy-Item -Force $zipPath (Join-Path $desktopPath "JAMANVAAR_KIOSK_SYSTEM.zip")

# 9. Trigger Shell Refresh
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ShellRefreshFinal {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
[ShellRefreshFinal]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host "==============================================================="
Write-Host "SUCCESS: Desktop apps compiled with brand logo and ZIP updated!"
Write-Host "==============================================================="
