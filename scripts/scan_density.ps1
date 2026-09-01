Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\OM Sanjhira\OneDrive\Desktop\k2\jamanvaar2.png"
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)

# Let's save a few debug crops in scratch folder:
$scratchDir = "C:\Users\OM Sanjhira\.gemini\antigravity-ide\brain\bb5f9ef3-93a7-4d0a-a23a-576df56af20b\scratch"
if (-not (Test-Path $scratchDir)) { New-Item -ItemType Directory -Path $scratchDir -Force | Out-Null }

# Let's scan all rows to see where content clusters are
$rowDensity = @{}
for ($y = 0; $y -lt $bmp.Height; $y += 10) {
    $nonBgCount = 0
    for ($x = 0; $x -lt $bmp.Width; $x += 5) {
        $p = $bmp.GetPixel($x, $y)
        $isBg = ($p.R -ge 240 -and $p.G -ge 235 -and $p.B -ge 220)
        if (-not $isBg) { $nonBgCount++ }
    }
    if ($nonBgCount -gt 5) {
        Write-Host "Row Y=$y has $nonBgCount non-bg points"
    }
}

$bmp.Dispose()
