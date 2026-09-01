Add-Type -AssemblyName System.Drawing

$workspaceRoot = $PSScriptRoot | Split-Path -Parent
$srcPath = Join-Path $workspaceRoot "jamanvaar.png.png"
if (-not (Test-Path $srcPath)) {
    $srcPath = Join-Path $workspaceRoot "jaman.png"
}

$src = [System.Drawing.Image]::FromFile($srcPath)
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
    $g.DrawImage($src, 0, 0, $s, $s)
    
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBuffers[$s] = $ms.ToArray()
    
    # Also save standalone png
    $outPng = Join-Path $iconDir "icon_${s}x${s}.png"
    [System.IO.File]::WriteAllBytes($outPng, $pngBuffers[$s])
    
    $ms.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}
$src.Dispose()

# Build Multi-Frame ICO Binary
$icoStream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($icoStream)

# Header: reserved (0), type (1 = ICO), count (6 images)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$sizes.Length)

# Calculate image data start offset: 6 bytes header + 16 bytes per entry
$dataOffset = 6 + ($sizes.Length * 16)

# Write Directory Entries
foreach ($s in $sizes) {
    $data = $pngBuffers[$s]
    $w = if ($s -eq 256) { 0 } else { $s }
    $h = if ($s -eq 256) { 0 } else { $s }
    
    $writer.Write([Byte]$w)               # Width
    $writer.Write([Byte]$h)               # Height
    $writer.Write([Byte]0)                # Color Palette
    $writer.Write([Byte]0)                # Reserved
    $writer.Write([UInt16]1)              # Color Planes
    $writer.Write([UInt16]32)             # Bits per pixel
    $writer.Write([UInt32]$data.Length)   # Size of image data
    $writer.Write([UInt32]$dataOffset)    # Offset of image data
    
    $dataOffset += $data.Length
}

# Write Image PNG Datas
foreach ($s in $sizes) {
    $writer.Write($pngBuffers[$s])
}

$writer.Flush()
$icoBytes = $icoStream.ToArray()
$writer.Dispose()
$icoStream.Dispose()

# Save ICO in assets/icons/
$icoPath = Join-Path $iconDir "icon.ico"
[System.IO.File]::WriteAllBytes($icoPath, $icoBytes)

# Copy to Package and Desktop directories
$pkgIcons = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE\icons"
$desktopPkgIcons = "C:\Users\OM Sanjhira\OneDrive\Desktop\JAMANVAAR_DESKTOP_PACKAGE\icons"

if (Test-Path $pkgIcons) {
    Copy-Item -Force (Join-Path $iconDir "*") $pkgIcons
}
if (Test-Path $desktopPkgIcons) {
    Copy-Item -Force (Join-Path $iconDir "*") $desktopPkgIcons
}

Write-Host "Multi-resolution JAMANVAAR Brand ICO created successfully from jamanvaar.png.png!"
