/**
 * Setup Bulletproof Desktop Shortcuts via Node.js COM Wrapper
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP_ONEDRIVE = path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop');
const DESKTOP_LOCAL = path.join(process.env.USERPROFILE, 'Desktop');
const LAUNCHER_JS = path.join(ROOT, 'scripts', 'production_launcher.cjs');
const ICON_PATH = path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'icons', 'icon.ico');
const NODE_EXE = 'C:\\Program Files\\nodejs\\node.exe';
const CMD_EXE = 'C:\\Windows\\System32\\cmd.exe';

console.log('===============================================================');
console.log('  CONFIGURING BULLETPROOF 1-CLICK DESKTOP SHORTCUTS           ');
console.log('===============================================================\n');

const apps = [
  { name: 'JAMANVAAR POS.lnk', target: 'pos', title: 'JAMANVAAR POS' },
  { name: 'JAMANVAAR POS Admin.lnk', target: 'pos-admin', title: 'JAMANVAAR POS Admin' },
  { name: 'JAMANVAAR Kiosk.lnk', target: 'kiosk', title: 'JAMANVAAR Kiosk' },
  { name: 'JAMANVAAR Kiosk Admin.lnk', target: 'kiosk-admin', title: 'JAMANVAAR Kiosk Admin' }
];

const vbsFile = path.join(ROOT, '_make_bulletproof.vbs');

let vbsContent = `
Set ws = CreateObject("WScript.Shell")
Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")

Dim desktops(1)
desktops(0) = "${DESKTOP_ONEDRIVE.replace(/\\/g, '\\\\')}"
desktops(1) = "${DESKTOP_LOCAL.replace(/\\/g, '\\\\')}"

For Each d In desktops
    If fso.FolderExists(d) Then
`;

for (const app of apps) {
  const args = `/c start "" /b "${NODE_EXE}" "${LAUNCHER_JS}" ${app.target}`;
  vbsContent += `
        Set s = ws.CreateShortcut(d & "\\${app.name}")
        s.TargetPath = "${CMD_EXE.replace(/\\/g, '\\\\')}"
        s.Arguments = "${args.replace(/"/g, '""')}"
        s.WorkingDirectory = "${ROOT.replace(/\\/g, '\\\\')}"
        s.Description = "${app.title}"
        s.WindowStyle = 7
        s.IconLocation = "${ICON_PATH.replace(/\\/g, '\\\\')},0"
        s.Save
`;
}

vbsContent += `
    End If
Next
`;

fs.writeFileSync(vbsFile, vbsContent, 'utf8');
execSync(`cscript.exe //Nologo "${vbsFile}"`, { stdio: 'inherit' });
fs.unlinkSync(vbsFile);

console.log('✓ All 4 desktop shortcuts updated to bulletproof direct execution!');

try {
  execSync('powershell -Command "& ie4uinit.exe -show"', { stdio: 'ignore' });
} catch (e) {}
