$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut('C:\Users\OM Sanjhira\OneDrive\Desktop\Jamanvaar Counter POS.lnk')
Write-Host "Target: $($sc.TargetPath)"
Write-Host "Arguments: $($sc.Arguments)"
Write-Host "IconLocation: $($sc.IconLocation)"
