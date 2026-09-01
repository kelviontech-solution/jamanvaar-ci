Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\OM Sanjhira\OneDrive\Desktop\k2\jaman.png"
if (Test-Path $srcPath) {
    $bmp = [System.Drawing.Bitmap]::FromFile($srcPath)
    Write-Host "jaman.png: $($bmp.Width) x $($bmp.Height)"
    
    # Check bounds of non-white pixels
    $minX = $bmp.Width; $maxX = 0; $minY = $bmp.Height; $maxY = 0
    for ($y = 0; $y -lt $bmp.Height; $y += 5) {
        for ($x = 0; $x -lt $bmp.Width; $x += 5) {
            $p = $bmp.GetPixel($x, $y)
            if ($p.A -gt 30 -and ($p.R -lt 240 -or $p.G -lt 240 -or $p.B -lt 240)) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    Write-Host "jaman.png Content Bounds: X: $minX to $maxX, Y: $minY to $maxY"
    $bmp.Dispose()
}
