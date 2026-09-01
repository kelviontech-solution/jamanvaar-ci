Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\OM Sanjhira\OneDrive\Desktop\k2\jamanvaar2.png"
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)
$scratchDir = "C:\Users\OM Sanjhira\.gemini\antigravity-ide\brain\bb5f9ef3-93a7-4d0a-a23a-576df56af20b\scratch"
if (-not (Test-Path $scratchDir)) { New-Item -ItemType Directory -Path $scratchDir -Force | Out-Null }

# Let's inspect the bounding box of the top main logo (Y: 100 to 480)
$minX = $bmp.Width
$maxX = 0
$minY = 480
$maxY = 100

for ($y = 100; $y -lt 480; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $p = $bmp.GetPixel($x, $y)
        # Background is cream
        $isBg = ($p.R -ge 245 -and $p.G -ge 240 -and $p.B -ge 230)
        if (-not $isBg) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Host "Top Logo Bounds: X: $minX to $maxX (Width: $($maxX - $minX)), Y: $minY to $maxY (Height: $($maxY - $minY))"

# Also let's inspect the next region (Y: 480 to 750)
$minX2 = $bmp.Width
$maxX2 = 0
$minY2 = 750
$maxY2 = 480

for ($y = 480; $y -lt 750; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $p = $bmp.GetPixel($x, $y)
        $isBg = ($p.R -ge 245 -and $p.G -ge 240 -and $p.B -ge 230)
        if (-not $isBg) {
            if ($x -lt $minX2) { $minX2 = $x }
            if ($x -gt $maxX2) { $maxX2 = $x }
            if ($y -lt $minY2) { $minY2 = $y }
            if ($y -gt $maxY2) { $maxY2 = $y }
        }
    }
}

Write-Host "Region 2 Bounds: X: $minX2 to $maxX2 (Width: $($maxX2 - $minX2)), Y: $minY2 to $maxY2 (Height: $($maxY2 - $minY2))"

# Let's save crops to scratch folder to view
function SaveCrop($x, $y, $w, $h, $name) {
    $rect = New-Object System.Drawing.Rectangle $x, $y, $w, $h
    $cropBmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($cropBmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($bmp, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    
    $outPath = Join-Path $scratchDir $name
    $cropBmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $cropBmp.Dispose()
    Write-Host "Saved crop: $outPath ($w x $h)"
}

# Add 10px margin
$pad = 12
$crop1X = [Math]::Max(0, $minX - $pad)
$crop1Y = [Math]::Max(0, $minY - $pad)
$crop1W = [Math]::Min($bmp.Width - $crop1X, ($maxX - $minX) + ($pad * 2))
$crop1H = [Math]::Min($bmp.Height - $crop1Y, ($maxY - $minY) + ($pad * 2))

SaveCrop $crop1X $crop1Y $crop1W $crop1H "logo_crop_top.png"

$crop2X = [Math]::Max(0, $minX2 - $pad)
$crop2Y = [Math]::Max(0, $minY2 - $pad)
$crop2W = [Math]::Min($bmp.Width - $crop2X, ($maxX2 - $minX2) + ($pad * 2))
$crop2H = [Math]::Min($bmp.Height - $crop2Y, ($maxY2 - $minY2) + ($pad * 2))

SaveCrop $crop2X $crop2Y $crop2W $crop2H "logo_crop_region2.png"

$bmp.Dispose()
