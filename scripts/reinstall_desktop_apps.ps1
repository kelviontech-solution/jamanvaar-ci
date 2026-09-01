Add-Type -AssemblyName System.Drawing

$workspaceRoot = $PSScriptRoot | Split-Path -Parent
$desktopPath = "C:\Users\OM Sanjhira\OneDrive\Desktop"
$destPackage = Join-Path $desktopPath "JAMANVAAR_DESKTOP_PACKAGE"
$destZip = Join-Path $desktopPath "JAMANVAAR_KIOSK_SYSTEM.zip"

Write-Host "==============================================================="
Write-Host "       CLEAN RE-INSTALLING JAMANVAAR TO WINDOWS DESKTOP        "
Write-Host "==============================================================="

# STEP 1: Delete all existing shortcuts and old folder from Desktop
Write-Host "`n1. Cleaning previous shortcuts and folder from Desktop..."
$oldShortcuts = @(
    (Join-Path $desktopPath "JAMANVAAR Touch Kiosk.lnk"),
    (Join-Path $desktopPath "JAMANVAAR Admin POS.lnk"),
    (Join-Path $desktopPath "START ALL JAMANVAAR.lnk")
)
foreach ($s in $oldShortcuts) {
    if (Test-Path $s) {
        Remove-Item -Force $s
        Write-Host "   Removed: $s"
    }
}
if (Test-Path $destPackage) {
    Remove-Item -Recurse -Force $destPackage
    Write-Host "   Removed old JAMANVAAR_DESKTOP_PACKAGE"
}

# STEP 2: Generate Crisp Brand Icon from jamanvaar-logo-mark.png & jamanvaar-logo-full.png
Write-Host "`n2. Generating high-resolution JAMANVAAR brand icon..."
$markSrc = Join-Path $workspaceRoot "shared\ui\src\assets\branding\jamanvaar-mark.png"
if (-not (Test-Path $markSrc)) {
    $markSrc = Join-Path $workspaceRoot "apps\kiosk-user\public\assets\branding\jamanvaar-mark.png"
}
$fullSrc = Join-Path $workspaceRoot "shared\ui\src\assets\branding\jamanvaar-logo.png"

$iconDir = Join-Path $workspaceRoot "assets\icons"
if (-not (Test-Path $iconDir)) {
    New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
}

$markImg = [System.Drawing.Image]::FromFile($markSrc)
$sizes = @(16, 32, 48, 64, 128, 256)
$pngBuffers = @{}

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    # Elegant warm gradient background disc
    $pad = [Math]::Max(1, [int]($s * 0.08))
    $rect = New-Object System.Drawing.Rectangle(0, 0, $s, $s)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 250, 248, 245))
    $g.FillEllipse($brush, $rect)
    $brush.Dispose()

    # Border
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 230, 104, 23), [Math]::Max(1, [int]($s * 0.05)))
    $g.DrawEllipse($pen, 1, 1, $s - 2, $s - 2)
    $pen.Dispose()

    # Center Logo Mark
    $destW = $s - ($pad * 2)
    $destH = [int]($destW * ($markImg.Height / $markImg.Width))
    if ($destH -gt ($s - ($pad * 2))) {
        $destH = $s - ($pad * 2)
        $destW = [int]($destH * ($markImg.Width / $markImg.Height))
    }
    $destX = [int](($s - $destW) / 2)
    $destY = [int](($s - $destH) / 2)

    $g.DrawImage($markImg, $destX, $destY, $destW, $destH)

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBuffers[$s] = $ms.ToArray()
    
    $outPng = Join-Path $iconDir "icon_${s}x${s}.png"
    [System.IO.File]::WriteAllBytes($outPng, $pngBuffers[$s])
    
    $ms.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}
$markImg.Dispose()

# Package into ICO file
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
Write-Host "   Created multi-layer icon.ico with authentic JAMANVAAR logo emblem!"

# STEP 3: Re-bundle JAMANVAAR_DESKTOP_PACKAGE
Write-Host "`n3. Updating JAMANVAAR_DESKTOP_PACKAGE..."
$pkgDir = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE"
Copy-Item -Force (Join-Path $iconDir "*") (Join-Path $pkgDir "icons")

# Copy to Windows Desktop
Copy-Item -Recurse -Force $pkgDir $destPackage
Copy-Item -Force (Join-Path $workspaceRoot "JAMANVAAR_KIOSK_SYSTEM.zip") $destZip
Write-Host "   Copied fresh package to $destPackage"

# STEP 4: Create Branded Desktop Shortcuts
Write-Host "`n4. Creating fresh Desktop Shortcuts..."
$ws = New-Object -ComObject WScript.Shell
$desktopIconPath = Join-Path $destPackage "icons\icon.ico"

# 1. Customer Touch Kiosk
$s1 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Touch Kiosk.lnk"))
$s1.TargetPath = "wscript.exe"
$s1.Arguments = "`"" + (Join-Path $destPackage "START_CUSTOMER_KIOSK.vbs") + "`""
$s1.WorkingDirectory = $destPackage
$s1.IconLocation = "$desktopIconPath,0"
$s1.Save()

# 2. Admin POS & KDS
$s2 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Admin POS.lnk"))
$s2.TargetPath = "wscript.exe"
$s2.Arguments = "`"" + (Join-Path $destPackage "START_ADMIN_POS.vbs") + "`""
$s2.WorkingDirectory = $destPackage
$s2.IconLocation = "$desktopIconPath,0"
$s2.Save()

# 3. Start All Launcher
$s3 = $ws.CreateShortcut((Join-Path $desktopPath "START ALL JAMANVAAR.lnk"))
$s3.TargetPath = "wscript.exe"
$s3.Arguments = "`"" + (Join-Path $destPackage "START_ALL_TERMINALS.vbs") + "`""
$s3.WorkingDirectory = $destPackage
$s3.IconLocation = "$desktopIconPath,0"
$s3.Save()

Write-Host "   Created 3 brand new shortcuts on Windows Desktop!"

# STEP 5: Notify Windows Shell to refresh icons
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ShellIconRefresher {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
[ShellIconRefresher]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host "`n==============================================================="
Write-Host "SUCCESS: Clean Re-Installation Complete with Authentic Brand Logo!"
Write-Host "==============================================================="
