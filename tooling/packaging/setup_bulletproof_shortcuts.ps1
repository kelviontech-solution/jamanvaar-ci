$desktop1 = "C:\Users\OM Sanjhira\OneDrive\Desktop"
$desktop2 = "C:\Users\OM Sanjhira\Desktop"
$workspaceRoot = "c:\Users\OM Sanjhira\OneDrive\Desktop\k2"
$launcherJs = Join-Path $workspaceRoot "tooling\local-runtime\production_launcher.cjs"
$iconPath = Join-Path $workspaceRoot "JAMANVAAR_DESKTOP_PACKAGE\icons\icon.ico"
$nodeExe = "C:\Program Files\nodejs\node.exe"
$cmdExe = "C:\Windows\System32\cmd.exe"

$apps = @(
    @{ Name = "JAMANVAAR POS.lnk"; Target = "pos"; Title = "JAMANVAAR POS" },
    @{ Name = "JAMANVAAR POS Admin.lnk"; Target = "pos-admin"; Title = "JAMANVAAR POS Admin" },
    @{ Name = "JAMANVAAR Kiosk.lnk"; Target = "kiosk"; Title = "JAMANVAAR Kiosk" },
    @{ Name = "JAMANVAAR Kiosk Admin.lnk"; Target = "kiosk-admin"; Title = "JAMANVAAR Kiosk Admin" }
)

$ws = New-Object -ComObject WScript.Shell

foreach ($app in $apps) {
    $args = "/c start `"`" /b `"$nodeExe`" `"$launcherJs`" $($app.Target)"
    
    foreach ($d in @($desktop1, $desktop2)) {
        if (Test-Path $d) {
            $linkPath = Join-Path $d $app.Name
            if (Test-Path $linkPath) { Remove-Item -Force $linkPath }
            
            $s = $ws.CreateShortcut($linkPath)
            $s.TargetPath = $cmdExe
            $s.Arguments = $args
            $s.WorkingDirectory = $workspaceRoot
            $s.Description = $app.Title
            $s.WindowStyle = 7 # Minimized
            $s.IconLocation = "$iconPath,0"
            $s.Save()
            Write-Host "  ✓ Created Desktop Shortcut: $linkPath"
        }
    }
}

# Flush icon cache
& ie4uinit.exe -show
Write-Host "`n✓ All 4 bulletproof shortcuts created successfully!"
