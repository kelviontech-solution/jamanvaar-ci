Add-Type -AssemblyName System.Drawing

$uploadDir = "C:\Users\OM Sanjhira\.gemini\antigravity-ide\brain\bb5f9ef3-93a7-4d0a-a23a-576df56af20b\.user_uploaded"
$jpgPath = Join-Path $uploadDir "media_1788156819337.jpg"

if (Test-Path $jpgPath) {
    $bmp = [System.Drawing.Bitmap]::FromFile($jpgPath)
    Write-Host "media_1788156819337.jpg: $($bmp.Width) x $($bmp.Height)"

    # Find the bounding box of the top logo in this 1024x1024 image
    # The logo consists of the Cloche at top + JAMANVAAR + by KELVIONTECH
    $minX = $bmp.Width; $maxX = 0; $minY = $bmp.Height; $maxY = 0

    for ($y = 30; $y -lt 600; $y++) {
        for ($x = 20; $x -lt ($bmp.Width - 20); $x++) {
            $p = $bmp.GetPixel($x, $y)
            # Background in jpg is around 250, 248, 245
            $isBg = ($p.R -ge 242 -and $p.G -ge 238 -and $p.B -ge 230)
            if (-not $isBg) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    Write-Host "JPG Logo Bounds: X=$minX to $maxX (W=$($maxX-$minX)), Y=$minY to $maxY (H=$($maxY-$minY))"

    # Crop the exact logo with transparent background
    $pad = 12
    $cropX = [Math]::Max(0, $minX - $pad)
    $cropY = [Math]::Max(0, $minY - $pad)
    $cropW = [Math]::Min($bmp.Width - $cropX, ($maxX - $minX) + ($pad * 2))
    $cropH = [Math]::Min($bmp.Height - $cropY, ($maxY - $minY) + ($pad * 2))

    $outBmp = New-Object System.Drawing.Bitmap $cropW, $cropH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

    $bgR = 252; $bgG = 248; $bgB = 243

    for ($y = 0; $y -lt $cropH; $y++) {
        $srcY = $cropY + $y
        if ($srcY -ge $bmp.Height) { continue }

        for ($x = 0; $x -lt $cropW; $x++) {
            $srcX = $cropX + $x
            if ($srcX -ge $bmp.Width) { continue }

            $p = $bmp.GetPixel($srcX, $srcY)
            $dist = [Math]::Sqrt([Math]::Pow([int]$p.R - $bgR, 2) + [Math]::Pow([int]$p.G - $bgG, 2) + [Math]::Pow([int]$p.B - $bgB, 2))

            if ($dist -lt 14 -and $p.R -gt 240) {
                $outBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
            } elseif ($dist -lt 30 -and $p.R -gt 230) {
                $alpha = [int]([Math]::Min(255, [Math]::Max(0, ($dist - 14) * 16)))
                $outBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $p.R, $p.G, $p.B))
            } else {
                $outBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $p.R, $p.G, $p.B))
            }
        }
    }

    $scratchDir = "C:\Users\OM Sanjhira\.gemini\antigravity-ide\brain\bb5f9ef3-93a7-4d0a-a23a-576df56af20b\scratch"
    $outPath = Join-Path $scratchDir "clean_full_logo_from_upload.png"
    $outBmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Saved clean full logo: $outPath ($cropW x $cropH)"

    $outBmp.Dispose()
    $bmp.Dispose()
}
