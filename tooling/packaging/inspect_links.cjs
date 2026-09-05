const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const vbs = path.join(__dirname, '_inspect_links.vbs');
const code = `
Set ws = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
For Each arg In WScript.Arguments
  If fso.FileExists(arg) Then
    Set sc = ws.CreateShortcut(arg)
    WScript.Echo "LNK: " & arg
    WScript.Echo "  Target: " & sc.TargetPath
    WScript.Echo "  Icon:   " & sc.IconLocation
  End If
Next
`;
fs.writeFileSync(vbs, code.trim());

try {
  const desktops = [
    'C:\\Users\\OM Sanjhira\\OneDrive\\Desktop',
    'C:\\Users\\OM Sanjhira\\Desktop'
  ];
  const lnkFiles = [];
  desktops.forEach(d => {
    if (fs.existsSync(d)) {
      fs.readdirSync(d).forEach(f => {
        if (f.endsWith('.lnk')) lnkFiles.push(path.join(d, f));
      });
    }
  });

  const out = execSync(`cscript //nologo "${vbs}" ${lnkFiles.map(f => `"${f}"`).join(' ')}`).toString();
  console.log(out);
} finally {
  if (fs.existsSync(vbs)) fs.unlinkSync(vbs);
}
