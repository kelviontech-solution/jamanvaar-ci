Add-Type -AssemblyName System.Drawing

$uploadDir = "C:\Users\OM Sanjhira\.gemini\antigravity-ide\brain\bb5f9ef3-93a7-4d0a-a23a-576df56af20b\.user_uploaded"
$files = Get-ChildItem $uploadDir | Sort-Object LastWriteTime -Descending | Select-Object -First 5

foreach ($f in $files) {
    try {
        $img = [System.Drawing.Image]::FromFile($f.FullName)
        Write-Host "$($f.Name): $($img.Width) x $($img.Height) (Size: $($f.Length) bytes)"
        $img.Dispose()
    } catch {
        Write-Host "$($f.Name): Error loading"
    }
}
