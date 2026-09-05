Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\OM Sanjhira\OneDrive\Desktop\k2\jamanvaar2.png"
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)

$w = $bmp.Width
$h = $bmp.Height

# Let's check vertical slices across the center column (X = 627)
Write-Host "Vertical scan down center (X=627):"
for ($y = 0; $y -lt $h; $y += 50) {
    $p = $bmp.GetPixel(627, $y)
    Write-Host "Y=$y : R=$($p.R), G=$($p.G), B=$($p.B)"
}

# Let's save a few test crops to see what they contain
# For example:
# 1. Upper emblem + Jamanvaar text
# 2. Main central emblem
# 3. Transparent background version

$bmp.Dispose()
