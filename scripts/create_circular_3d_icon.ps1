Add-Type -AssemblyName System.Drawing

$workspaceRoot = $PSScriptRoot + "\.."
$cleanLogoPath = Join-Path $workspaceRoot "shared\assets\branding\jamanvaar-logo-gujarati.png"
$cleanMarkPath = Join-Path $workspaceRoot "shared\assets\branding\jamanvaar-mark.png"
$srcFallback = Join-Path $workspaceRoot "shared\assets\branding\jamanvaar-logo.png"

$srcLogoPath = if (Test-Path $cleanLogoPath) { $cleanLogoPath } else { $srcFallback }
$srcMarkPath = if (Test-Path $cleanMarkPath) { $cleanMarkPath } else { $srcLogoPath }

Write-Host "Creating circular 3D icon with orange border from exact brand logo: $srcLogoPath"

$logoImg = [System.Drawing.Image]::FromFile($srcLogoPath)
$markImg = [System.Drawing.Image]::FromFile($srcMarkPath)

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngStreams = @()

foreach ($sz in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $sz, $sz, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # 1. Outer 3D Orange Ring
    $outerRect = New-Object System.Drawing.RectangleF (0.5), (0.5), ($sz - 1), ($sz - 1)
    
    # Orange Gradient Brush (#F27E2B to #C24E05)
    $c1 = [System.Drawing.Color]::FromArgb(255, 242, 126, 43)
    $c2 = [System.Drawing.Color]::FromArgb(255, 194, 78, 5)
    $gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $outerRect, $c1, $c2, ([System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)
    $g.FillEllipse($gradBrush, $outerRect)

    # 2. Inner White Disc
    $innerPad = [Math]::Max(1.5, $sz * 0.08)
    $innerRect = New-Object System.Drawing.RectangleF ($innerPad), ($innerPad), ($sz - (2 * $innerPad)), ($sz - (2 * $innerPad))
    $whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $g.FillEllipse($whiteBrush, $innerRect)

    # 3. Inner Delicate Accent Ring
    $penColor = [System.Drawing.Color]::FromArgb(255, 246, 231, 216) # #F6E7D8
    $innerPen = New-Object System.Drawing.Pen $penColor, 1
    $g.DrawEllipse($innerPen, $innerRect)

    # 4. Center Clean Brand Logo
    $targetImg = if ($sz -le 24) { $markImg } else { $logoImg }
    
    $logoPad = [Math]::Max(2, $sz * 0.13)
    $availW = $sz - (2 * $logoPad)
    $availH = $sz - (2 * $logoPad)
    
    $logoWidth = $availW
    $logoHeight = $logoWidth * ($targetImg.Height / $targetImg.Width)
    if ($logoHeight -gt $availH) {
        $logoHeight = $availH
        $logoWidth = $logoHeight * ($targetImg.Width / $targetImg.Height)
    }

    $destX = ($sz - $logoWidth) / 2
    $destY = ($sz - $logoHeight) / 2

    $destRect = New-Object System.Drawing.RectangleF $destX, $destY, $logoWidth, $logoHeight
    $g.DrawImage($targetImg, $destRect)

    # Save to memory stream
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngStreams += @{ Size = $sz; Bytes = $ms.ToArray() }

    $g.Dispose()
    $bmp.Dispose()
}

$logoImg.Dispose()
$markImg.Dispose()

# Save ICO
$destIconPath = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE\icons\icon.ico"
$fs = [System.IO.File]::Create($destIconPath)
$bw = New-Object System.IO.BinaryWriter $fs

$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$pngStreams.Count)

$offset = 6 + (16 * $pngStreams.Count)

foreach ($entry in $pngStreams) {
    $w = if ($entry.Size -ge 256) { 0 } else { [byte]$entry.Size }
    $h = if ($entry.Size -ge 256) { 0 } else { [byte]$entry.Size }
    $bw.Write([byte]$w)
    $bw.Write([byte]$h)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$entry.Bytes.Length)
    $bw.Write([uint32]$offset)
    $offset += $entry.Bytes.Length
}

foreach ($entry in $pngStreams) {
    $bw.Write($entry.Bytes)
}

$bw.Close()
$fs.Close()

Write-Host "Multi-resolution circular 3D icon generated successfully at: $destIconPath"
