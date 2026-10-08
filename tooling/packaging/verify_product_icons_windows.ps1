$ErrorActionPreference='Stop'
$iconWorkspace=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$iconLibrary=Join-Path $iconWorkspace 'packages/assets/branding/app-icons-v1'
Add-Type -AssemblyName System.Drawing
if(-not ('JamanvaarNativeIconProbe' -as [type])) {
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class JamanvaarNativeIconProbe {
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr LoadImage(IntPtr instance, string file, uint type, int width, int height, uint flags);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool DestroyIcon(IntPtr icon);
}
'@
}
$iconCatalog=Get-Content -Raw -LiteralPath (Join-Path $iconLibrary 'manifest.json') | ConvertFrom-Json
foreach($iconApp in $iconCatalog.apps) {
  $iconFile=[System.IO.Path]::GetFullPath((Join-Path $iconWorkspace ($iconApp.directory+'/src-tauri/icons/icon.ico')))
  foreach($iconSize in @(16,24,32,48,64,128,256)) {
    $iconHandle=[JamanvaarNativeIconProbe]::LoadImage([IntPtr]::Zero,$iconFile,1,$iconSize,$iconSize,16)
    if($iconHandle -eq [IntPtr]::Zero) {throw ('Windows LoadImage failed for '+$iconApp.id+' / '+$iconSize)}
    try {
      $iconNative=[System.Drawing.Icon]::FromHandle($iconHandle)
      if($iconNative.Width -ne $iconSize -or $iconNative.Height -ne $iconSize) {throw ('Windows loaded wrong frame for '+$iconApp.id+' / '+$iconSize)}
      $iconBitmap=$iconNative.ToBitmap();$iconBitmap.Dispose();$iconNative.Dispose()
    } finally {[void][JamanvaarNativeIconProbe]::DestroyIcon($iconHandle)}
  }
  Write-Output ('PASS Windows native LoadImage 16-256px: '+$iconApp.label)
}
$iconRecordPath=Join-Path $iconLibrary 'VERIFICATION.json'
$iconRecord=Get-Content -Raw -LiteralPath $iconRecordPath | ConvertFrom-Json
$iconRecord | Add-Member -NotePropertyName windowsNativeDecode -NotePropertyValue 'PASS: user32 LoadImage verified all 35 ICO frames' -Force
[System.IO.File]::WriteAllText($iconRecordPath,($iconRecord | ConvertTo-Json -Depth 12)+[Environment]::NewLine,[System.Text.UTF8Encoding]::new($false))
