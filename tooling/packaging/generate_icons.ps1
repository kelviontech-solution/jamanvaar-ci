Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\..\jamanvaar.png.png"
if (-not (Test-Path $srcPath)) {
    $srcPath = Join-Path $PSScriptRoot "..\..\jaman.png"
}

$src = [System.Drawing.Image]::FromFile($srcPath)
$iconDir = Join-Path $PSScriptRoot "..\..\assets\icons"
if (-not (Test-Path $iconDir)) {
    New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
}

$sizes = @(16, 32, 48, 64, 128, 256, 512)
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $s, $s)
    
    $outPng = Join-Path $iconDir "icon_${s}x${s}.png"
    $bmp.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

# Create .ico file using 256x256 bitmap
$bmp256 = New-Object System.Drawing.Bitmap(256, 256)
$g256 = [System.Drawing.Graphics]::FromImage($bmp256)
$g256.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g256.DrawImage($src, 0, 0, 256, 256)
$hIcon = $bmp256.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$icoPath = Join-Path $iconDir "icon.ico"
$stream = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()
$icon.Dispose()
$g256.Dispose()
$bmp256.Dispose()
$src.Dispose()

# Copy to tauri icon folders
$userTauriIcons = Join-Path $PSScriptRoot "..\..\apps\kiosk-user\src-tauri\icons"
$adminTauriIcons = Join-Path $PSScriptRoot "..\..\apps\kiosk-admin\src-tauri\icons"

New-Item -ItemType Directory -Force -Path $userTauriIcons | Out-Null
New-Item -ItemType Directory -Force -Path $adminTauriIcons | Out-Null

Copy-Item (Join-Path $iconDir "icon_32x32.png") (Join-Path $userTauriIcons "32x32.png") -Force
Copy-Item (Join-Path $iconDir "icon_128x128.png") (Join-Path $userTauriIcons "128x128.png") -Force
Copy-Item (Join-Path $iconDir "icon_256x256.png") (Join-Path $userTauriIcons "128x128@2x.png") -Force
Copy-Item (Join-Path $iconDir "icon.ico") (Join-Path $userTauriIcons "icon.ico") -Force
Copy-Item (Join-Path $iconDir "icon_512x512.png") (Join-Path $userTauriIcons "icon.png") -Force

Copy-Item (Join-Path $iconDir "icon_32x32.png") (Join-Path $adminTauriIcons "32x32.png") -Force
Copy-Item (Join-Path $iconDir "icon_128x128.png") (Join-Path $adminTauriIcons "128x128.png") -Force
Copy-Item (Join-Path $iconDir "icon_256x256.png") (Join-Path $adminTauriIcons "128x128@2x.png") -Force
Copy-Item (Join-Path $iconDir "icon.ico") (Join-Path $adminTauriIcons "icon.ico") -Force
Copy-Item (Join-Path $iconDir "icon_512x512.png") (Join-Path $adminTauriIcons "icon.png") -Force

Write-Host "JAMANVAAR Brand Icons Generated Successfully!"
