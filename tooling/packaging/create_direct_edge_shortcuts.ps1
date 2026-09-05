$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgePath)) {
    $edgePath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
}

$localAppData = [System.Environment]::GetFolderPath('LocalApplicationData')
$programsDir = Join-Path $localAppData "Programs\JAMANVAAR"
$iconPath = Join-Path $programsDir "icons\icon.ico"

$desktop1 = "C:\Users\OM Sanjhira\OneDrive\Desktop"
$desktop2 = "C:\Users\OM Sanjhira\Desktop"

$ws = New-Object -ComObject WScript.Shell

$apps = @(
    @{
        Name = "JAMANVAAR POS.lnk"
        Title = "JAMANVAAR POS"
        Args = '--app="http://localhost:5178/pos" --window-size=1440,900 --no-first-run'
    },
    @{
        Name = "JAMANVAAR POS Admin.lnk"
        Title = "JAMANVAAR POS Admin"
        Args = '--app="http://localhost:5178/pos-admin" --window-size=1440,900 --no-first-run'
    },
    @{
        Name = "JAMANVAAR Kiosk.lnk"
        Title = "JAMANVAAR Kiosk"
        Args = '--app="http://localhost:5178/kiosk" --kiosk --edge-kiosk-type=fullscreen --no-first-run --disable-pinch'
    },
    @{
        Name = "JAMANVAAR Kiosk Admin.lnk"
        Title = "JAMANVAAR Kiosk Admin"
        Args = '--app="http://localhost:5178/kiosk-admin" --window-size=1440,900 --no-first-run'
    }
)

foreach ($app in $apps) {
    foreach ($d in @($desktop1, $desktop2)) {
        if (Test-Path $d) {
            $shortcutPath = Join-Path $d $app.Name
            $shortcut = $ws.CreateShortcut($shortcutPath)
            $shortcut.TargetPath = $edgePath
            $shortcut.Arguments = $app.Args
            $shortcut.WorkingDirectory = $programsDir
            $shortcut.Description = $app.Title
            $shortcut.IconLocation = "$iconPath,0"
            $shortcut.Save()
            Write-Host "  ✓ Created Desktop Shortcut: $shortcutPath"
        }
    }
}

# Refresh shell
& ie4uinit.exe -show
Write-Host "`nAll 4 direct Edge App Mode shortcuts created successfully!"
