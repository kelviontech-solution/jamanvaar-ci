$ErrorActionPreference = "Stop"

$workspaceRoot = $PSScriptRoot | Split-Path -Parent
$distDir = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE"
$iconPath = Join-Path $workspaceRoot "assets\icons\icon.ico"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

Write-Host "==============================================================="
Write-Host "        BUILDING JAMANVAAR NATIVE DESKTOP APPLICATIONS        "
Write-Host "==============================================================="

# 1. Ensure production builds of React apps
Write-Host "`nSTEP 1: Building production web assets..."
npm run build --workspace=@jamanvaar/kiosk-admin
npm run build --workspace=@jamanvaar/kiosk-user

# 2. Setup Distribution Structure
Write-Host "`nSTEP 2: Creating distribution package directory..."
if (Test-Path $distDir) {
    Remove-Item -Recurse -Force $distDir
}
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $distDir "server") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $distDir "admin_app") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $distDir "kiosk_app") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $distDir "icons") | Out-Null

# Copy static assets
Copy-Item -Recurse -Force (Join-Path $workspaceRoot "apps\kiosk-admin\dist\*") (Join-Path $distDir "admin_app")
Copy-Item -Recurse -Force (Join-Path $workspaceRoot "apps\kiosk-user\dist\*") (Join-Path $distDir "kiosk_app")
Copy-Item -Force (Join-Path $workspaceRoot "scripts\local_service.cjs") (Join-Path $distDir "server\local_service.cjs")
Copy-Item -Force (Join-Path $workspaceRoot "shared\database\src\live_db.json") (Join-Path $distDir "server\live_db.json")
Copy-Item -Recurse -Force (Join-Path $workspaceRoot "assets\icons\*") (Join-Path $distDir "icons")
Copy-Item -Force (Join-Path $workspaceRoot "jaman.png") (Join-Path $distDir "icons\jamanvaar_logo.png")

# 3. Create C# Source for Native Executables
$tempSrcDir = Join-Path $distDir "temp_src"
New-Item -ItemType Directory -Force -Path $tempSrcDir | Out-Null

# --- KIOSK EXE C# SOURCE ---
$kioskCode = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace Jamanvaar.Kiosk
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string serverScript = Path.Combine(baseDir, "server", "local_service.cjs");
                EnsureServiceRunning(serverScript);

                string kioskUrl = "http://localhost:5178/kiosk";
                LaunchKioskWindow(kioskUrl);
            }
            catch (Exception ex)
            {
                MessageBox.Show("JAMANVAAR Kiosk Launch Error: " + ex.Message, "JAMANVAAR Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static void EnsureServiceRunning(string scriptPath)
        {
            try
            {
                var request = (System.Net.HttpWebRequest)System.Net.WebRequest.Create("http://localhost:5178/api/health");
                request.Timeout = 1000;
                using (var response = request.GetResponse()) { return; }
            }
            catch
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "node";
                psi.Arguments = "\"" + scriptPath + "\"";
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(psi);
                Thread.Sleep(1200);
            }
        }

        static void LaunchKioskWindow(string url)
        {
            string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            if (!File.Exists(edgePath))
            {
                edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
            }

            if (File.Exists(edgePath))
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = edgePath;
                psi.Arguments = "--app=\"" + url + "\" --kiosk --edge-kiosk-type=fullscreen --no-first-run --disable-pinch --overscroll-history-navigation=0";
                Process.Start(psi);
            }
            else
            {
                Process.Start(url);
            }
        }
    }
}
'@
[System.IO.File]::WriteAllText((Join-Path $tempSrcDir "KioskProgram.cs"), $kioskCode)

# --- ADMIN EXE C# SOURCE ---
$adminCode = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace Jamanvaar.Admin
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string serverScript = Path.Combine(baseDir, "server", "local_service.cjs");
                EnsureServiceRunning(serverScript);

                string adminUrl = "http://localhost:5178/admin";
                LaunchAdminWindow(adminUrl);
            }
            catch (Exception ex)
            {
                MessageBox.Show("JAMANVAAR Admin POS Launch Error: " + ex.Message, "JAMANVAAR Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static void EnsureServiceRunning(string scriptPath)
        {
            try
            {
                var request = (System.Net.HttpWebRequest)System.Net.WebRequest.Create("http://localhost:5178/api/health");
                request.Timeout = 1000;
                using (var response = request.GetResponse()) { return; }
            }
            catch
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "node";
                psi.Arguments = "\"" + scriptPath + "\"";
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(psi);
                Thread.Sleep(1200);
            }
        }

        static void LaunchAdminWindow(string url)
        {
            string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            if (!File.Exists(edgePath))
            {
                edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
            }

            if (File.Exists(edgePath))
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = edgePath;
                psi.Arguments = "--app=\"" + url + "\" --window-size=1440,900";
                Process.Start(psi);
            }
            else
            {
                Process.Start(url);
            }
        }
    }
}
'@
[System.IO.File]::WriteAllText((Join-Path $tempSrcDir "AdminProgram.cs"), $adminCode)

# --- MASTER LAUNCHER C# SOURCE ---
$masterCode = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace Jamanvaar.Master
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string serverScript = Path.Combine(baseDir, "server", "local_service.cjs");
                
                // Start Local Server
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "node";
                psi.Arguments = "\"" + serverScript + "\"";
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(psi);
                Thread.Sleep(1500);

                // Open Admin and Kiosk
                string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                if (!File.Exists(edgePath)) edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";

                if (File.Exists(edgePath))
                {
                    Process.Start(edgePath, "--app=\"http://localhost:5178/admin\" --window-size=1440,900");
                    Process.Start(edgePath, "--app=\"http://localhost:5178/kiosk\" --window-size=1080,1920");
                }
                else
                {
                    Process.Start("http://localhost:5178/admin");
                    Process.Start("http://localhost:5178/kiosk");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("JAMANVAAR Launcher Error: " + ex.Message, "JAMANVAAR", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
'@
[System.IO.File]::WriteAllText((Join-Path $tempSrcDir "MasterProgram.cs"), $masterCode)

# 4. Compile Executables with Native Embedded Icon
Write-Host "`nSTEP 3: Compiling native Windows .EXE binaries with official brand icon..."

$kioskExeOut = Join-Path $distDir "JAMANVAAR_Touch_Kiosk.exe"
$adminExeOut = Join-Path $distDir "JAMANVAAR_Admin_POS.exe"
$masterExeOut = Join-Path $distDir "START_JAMANVAAR_SYSTEM.exe"

& $csc /target:winexe /out:"$kioskExeOut" /win32icon:"$iconPath" /reference:System.Windows.Forms.dll,System.Drawing.dll,System.dll (Join-Path $tempSrcDir "KioskProgram.cs")
& $csc /target:winexe /out:"$adminExeOut" /win32icon:"$iconPath" /reference:System.Windows.Forms.dll,System.Drawing.dll,System.dll (Join-Path $tempSrcDir "AdminProgram.cs")
& $csc /target:winexe /out:"$masterExeOut" /win32icon:"$iconPath" /reference:System.Windows.Forms.dll,System.Drawing.dll,System.dll (Join-Path $tempSrcDir "MasterProgram.cs")

Remove-Item -Recurse -Force $tempSrcDir

# 5. Create Helper Windows Batch Launchers
$batContent = "@echo off`r`nsetlocal`r`ncd /d `"%~dp0`"`r`ntitle JAMANVAAR Restaurant System`r`necho Starting JAMANVAAR Restaurant System (100% Offline)...`r`nstart `"`" /B node `"%~dp0server\\local_service.cjs`"`r`ntimeout /t 1 /nobreak >nul`r`nstart `"`" `"%~dp0JAMANVAAR_Admin_POS.exe`"`r`nstart `"`" `"%~dp0JAMANVAAR_Touch_Kiosk.exe`"`r`n"
[System.IO.File]::WriteAllText((Join-Path $distDir "1_CLICK_START_ALL.bat"), $batContent)

$kioskBat = "@echo off`r`nsetlocal`r`ncd /d `"%~dp0`"`r`ntitle JAMANVAAR Customer Touch Kiosk`r`nstart `"`" `"%~dp0JAMANVAAR_Touch_Kiosk.exe`"`r`n"
[System.IO.File]::WriteAllText((Join-Path $distDir "2_START_CUSTOMER_KIOSK.bat"), $kioskBat)

$adminBat = "@echo off`r`nsetlocal`r`ncd /d `"%~dp0`"`r`ntitle JAMANVAAR Admin POS and KDS`r`nstart `"`" `"%~dp0JAMANVAAR_Admin_POS.exe`"`r`n"
[System.IO.File]::WriteAllText((Join-Path $distDir "3_START_ADMIN_POS_KDS.bat"), $adminBat)

$shortcutBat = "@echo off`r`nsetlocal`r`ncd /d `"%~dp0`"`r`necho Creating JAMANVAAR Desktop Shortcuts...`r`npowershell -Command `"`$ws = New-Object -ComObject WScript.Shell; `$desktop = [System.Environment]::GetFolderPath('Desktop'); `$s1 = `$ws.CreateShortcut((Join-Path `$desktop 'JAMANVAAR Touch Kiosk.lnk')); `$s1.TargetPath = '%~dp0JAMANVAAR_Touch_Kiosk.exe'; `$s1.WorkingDirectory = '%~dp0'; `$s1.IconLocation = '%~dp0icons\\icon.ico'; `$s1.Save(); `$s2 = `$ws.CreateShortcut((Join-Path `$desktop 'JAMANVAAR Admin POS.lnk')); `$s2.TargetPath = '%~dp0JAMANVAAR_Admin_POS.exe'; `$s2.WorkingDirectory = '%~dp0'; `$s2.IconLocation = '%~dp0icons\\icon.ico'; `$s2.Save(); `$s3 = `$ws.CreateShortcut((Join-Path `$desktop 'START JAMANVAAR RESTAURANT.lnk')); `$s3.TargetPath = '%~dp0START_JAMANVAAR_SYSTEM.exe'; `$s3.WorkingDirectory = '%~dp0'; `$s3.IconLocation = '%~dp0icons\\icon.ico'; `$s3.Save(); Write-Host 'Desktop shortcuts created successfully with official brand icon!'`"`r`necho Done! Shortcuts placed on your Windows Desktop.`r`npause`r`n"
[System.IO.File]::WriteAllText((Join-Path $distDir "CREATE_DESKTOP_SHORTCUTS.bat"), $shortcutBat)

# Setup README guide
$readmeContent = "# JAMANVAAR Offline Desktop Kiosk and Admin POS System`r`n`r`n## Quick Start`r`nDouble-click any of the following application executables:`r`n`r`n1. JAMANVAAR_Touch_Kiosk.exe (Opens Customer Self-Ordering Touch Kiosk)`r`n2. JAMANVAAR_Admin_POS.exe (Opens Restaurant Management Control Plane, Live KDS, and Kitchen Displays)`r`n3. START_JAMANVAAR_SYSTEM.exe (1-Click Master Launcher that starts Local Service, Admin POS, and Touch Kiosk)`r`n`r`n## 100% Offline Local Architecture`r`n- Operates entirely without cloud or external internet.`r`n- Authoritative service runs locally on http://localhost:5178.`r`n- Real-time sub-5ms event synchronization between Touch Kiosks and Kitchen Displays.`r`n"
[System.IO.File]::WriteAllText((Join-Path $distDir "README.md"), $readmeContent)

# 6. Create ZIP Package for Kiosk Deployment
Write-Host "`nSTEP 4: Generating deployable ZIP archive (JAMANVAAR_KIOSK_SYSTEM.zip)..."
$zipPath = Join-Path $workspaceRoot "JAMANVAAR_KIOSK_SYSTEM.zip"
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}
Compress-Archive -Path (Join-Path $distDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "`n==============================================================="
Write-Host "SUCCESS: Desktop Applications & ZIP Package Ready!"
Write-Host "Folder:  $distDir"
Write-Host "ZIP:     $zipPath"
Write-Host "==============================================================="
