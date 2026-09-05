Add-Type -AssemblyName System.Drawing

$workspaceRoot = $PSScriptRoot | Split-Path -Parent | Split-Path -Parent
$desktopPath = "C:\Users\OM Sanjhira\OneDrive\Desktop"
$srcPath = Join-Path $workspaceRoot "jamanvaar.png.png"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

Write-Host "==============================================================="
Write-Host "     GENERATING EXACT ICON FROM jamanvaar.png.png (1254x1254)  "
Write-Host "==============================================================="

$src = [System.Drawing.Image]::FromFile($srcPath)
Write-Host "Loaded jamanvaar.png.png: Width=$($src.Width), Height=$($src.Height)"

$iconDir = Join-Path $workspaceRoot "assets\icons"
if (-not (Test-Path $iconDir)) {
    New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
}

$sizes = @(16, 32, 48, 64, 128, 256)
$pngBuffers = @{}

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Draw entire jamanvaar.png.png to fill the icon
    $g.DrawImage($src, 0, 0, $s, $s)

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBuffers[$s] = $ms.ToArray()

    $outPng = Join-Path $iconDir "icon_${s}x${s}.png"
    [System.IO.File]::WriteAllBytes($outPng, $pngBuffers[$s])

    $ms.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}
$src.Dispose()

# Create Multi-layer Windows ICO
$icoStream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($icoStream)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$sizes.Length)

$dataOffset = 6 + ($sizes.Length * 16)
foreach ($s in $sizes) {
    $data = $pngBuffers[$s]
    $w = if ($s -eq 256) { 0 } else { $s }
    $h = if ($s -eq 256) { 0 } else { $s }
    
    $writer.Write([Byte]$w)
    $writer.Write([Byte]$h)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$data.Length)
    $writer.Write([UInt32]$dataOffset)
    
    $dataOffset += $data.Length
}

foreach ($s in $sizes) {
    $writer.Write($pngBuffers[$s])
}
$writer.Flush()
$icoBytes = $icoStream.ToArray()
$writer.Dispose()
$icoStream.Dispose()

$icoPath = Join-Path $iconDir "icon.ico"
[System.IO.File]::WriteAllBytes($icoPath, $icoBytes)
Write-Host "Generated multi-resolution icon.ico directly from jamanvaar.png.png!"

# Copy to Package and Desktop directories
$pkgDir = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE"
$userDesktopDist = Join-Path $desktopPath "JAMANVAAR_DESKTOP_PACKAGE"

Copy-Item -Force (Join-Path $iconDir "*") (Join-Path $pkgDir "icons")

# Recompile Native EXEs with the new icon
$tempSrcDir = Join-Path $pkgDir "temp_src"
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

$kioskExe = Join-Path $pkgDir "JAMANVAAR_Touch_Kiosk.exe"
$adminExe = Join-Path $pkgDir "JAMANVAAR_Admin_POS.exe"

& $csc /target:winexe /out:"$kioskExe" /win32icon:"$icoPath" /reference:System.dll (Join-Path $tempSrcDir "KioskProgram.cs")
& $csc /target:winexe /out:"$adminExe" /win32icon:"$icoPath" /reference:System.dll (Join-Path $tempSrcDir "AdminProgram.cs")

Remove-Item -Recurse -Force $tempSrcDir

# Copy fresh package to Desktop
if (Test-Path $userDesktopDist) { Remove-Item -Recurse -Force $userDesktopDist }
Copy-Item -Recurse -Force $pkgDir $userDesktopDist

# Update ZIP
$zipPath = Join-Path $workspaceRoot "JAMANVAAR_KIOSK_SYSTEM.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $pkgDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Copy-Item -Force $zipPath (Join-Path $desktopPath "JAMANVAAR_KIOSK_SYSTEM.zip")

# Remove and recreate desktop shortcuts
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

# Clear and restart Windows Explorer icon cache
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ShellRefreshDirect {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
[ShellRefreshDirect]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host "==============================================================="
Write-Host "SUCCESS: Exact jamanvaar.png.png Logo Applied to Desktop & ZIP!"
Write-Host "==============================================================="
