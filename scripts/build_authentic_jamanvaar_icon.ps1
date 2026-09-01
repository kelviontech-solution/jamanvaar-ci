Add-Type -AssemblyName System.Drawing

$workspaceRoot = $PSScriptRoot | Split-Path -Parent
$desktopPath = "C:\Users\OM Sanjhira\OneDrive\Desktop"
$srcPath = Join-Path $workspaceRoot "shared\ui\src\assets\branding\jamanvaar-logo.png"
if (-not (Test-Path $srcPath)) {
    $srcPath = Join-Path $workspaceRoot "apps\kiosk-user\public\assets\branding\jamanvaar-logo.png"
}

$src = [System.Drawing.Image]::FromFile($srcPath)
Write-Host "Loaded official logo: Width=$($src.Width), Height=$($src.Height)"

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

    # Off-white warm round background (#FAF8F5) with subtle border
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 250, 248, 245))
    $g.FillEllipse($bgBrush, 0, 0, $s, $s)
    $bgBrush.Dispose()

    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 230, 104, 23), [Math]::Max(1, [int]($s * 0.04)))
    $g.DrawEllipse($borderPen, 1, 1, $s - 2, $s - 2)
    $borderPen.Dispose()

    # Scale and center the full Jamanvaar logo inside the circle
    $pad = [Math]::Max(1, [int]($s * 0.12))
    $availW = $s - ($pad * 2)
    $availH = $s - ($pad * 2)

    $aspect = $src.Width / $src.Height
    $targetW = $availW
    $targetH = [int]($targetW / $aspect)

    if ($targetH -gt $availH) {
        $targetH = $availH
        $targetW = [int]($targetH * $aspect)
    }

    $destX = [int](($s - $targetW) / 2)
    $destY = [int](($s - $targetH) / 2)

    $g.DrawImage($src, $destX, $destY, $targetW, $targetH)

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

# Create Multi-layer ICO
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
Write-Host "Generated authentic JAMANVAAR Gujarati brand icon.ico!"

# Deploy to Package and Desktop
$pkgDir = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE"
$userDesktopDist = Join-Path $desktopPath "JAMANVAAR_DESKTOP_PACKAGE"
$targetIco = Join-Path $userDesktopDist "icons\jamanvaar_gujarati.ico"

New-Item -ItemType Directory -Force -Path (Join-Path $userDesktopDist "icons") | Out-Null
Copy-Item -Force (Join-Path $iconDir "*") (Join-Path $pkgDir "icons")
Copy-Item -Force (Join-Path $iconDir "*") (Join-Path $userDesktopDist "icons")
Copy-Item -Force $icoPath $targetIco

# Update ZIP package
$zipPath = Join-Path $workspaceRoot "JAMANVAAR_KIOSK_SYSTEM.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $pkgDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Copy-Item -Force $zipPath (Join-Path $desktopPath "JAMANVAAR_KIOSK_SYSTEM.zip")

# Recreate Desktop Shortcuts with the new distinct icon filename
$ws = New-Object -ComObject WScript.Shell

$s1 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Kiosk.lnk"))
$s1.TargetPath = (Join-Path $userDesktopDist "JAMANVAAR_Touch_Kiosk.exe")
$s1.WorkingDirectory = $userDesktopDist
$s1.IconLocation = "$targetIco,0"
$s1.Save()

$s2 = $ws.CreateShortcut((Join-Path $desktopPath "JAMANVAAR Admin.lnk"))
$s2.TargetPath = (Join-Path $userDesktopDist "JAMANVAAR_Admin_POS.exe")
$s2.WorkingDirectory = $userDesktopDist
$s2.IconLocation = "$targetIco,0"
$s2.Save()

$s3 = $ws.CreateShortcut((Join-Path $desktopPath "START JAMANVAAR.lnk"))
$s3.TargetPath = "wscript.exe"
$s3.Arguments = "`"" + (Join-Path $userDesktopDist "START_ALL_TERMINALS.vbs") + "`""
$s3.WorkingDirectory = $userDesktopDist
$s3.IconLocation = "$targetIco,0"
$s3.Save()

# Force Explorer icon cache purge and restart
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\Windows\Explorer" -Filter "iconcache_*.db" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\IconCache.db" -Force -ErrorAction SilentlyContinue

Start-Process explorer.exe

Write-Host "==============================================================="
Write-Host "SUCCESS: Authentic Gujarati JAMANVAAR Brand Icon Applied!"
Write-Host "==============================================================="
