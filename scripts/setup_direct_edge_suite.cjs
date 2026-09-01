/**
 * Direct Edge Desktop Suite Setup
 * Points shortcuts directly to msedge.exe with clean arguments.
 * Fast, 1-click launch, 0 delay, official circular badge icon.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP_ONEDRIVE = path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop');
const DESKTOP_LOCAL = path.join(process.env.USERPROFILE, 'Desktop');
const ICON_PATH = path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'icons', 'icon.ico');

let edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!fs.existsSync(edgeExe)) {
  edgeExe = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';
}

console.log('===============================================================');
console.log('  CONFIGURING DIRECT 1-CLICK DESKTOP SHORTCUTS                 ');
console.log('===============================================================\n');

const apps = [
  {
    name: 'JAMANVAAR POS.lnk',
    title: 'JAMANVAAR POS',
    args: '--app=http://localhost:5178/pos --window-size=1440,900 --no-first-run'
  },
  {
    name: 'JAMANVAAR POS Admin.lnk',
    title: 'JAMANVAAR POS Admin',
    args: '--app=http://localhost:5178/pos-admin --window-size=1440,900 --no-first-run'
  },
  {
    name: 'JAMANVAAR Kiosk.lnk',
    title: 'JAMANVAAR Kiosk',
    args: '--app=http://localhost:5178/kiosk --kiosk --edge-kiosk-type=fullscreen --no-first-run --disable-pinch'
  },
  {
    name: 'JAMANVAAR Kiosk Admin.lnk',
    title: 'JAMANVAAR Kiosk Admin',
    args: '--app=http://localhost:5178/kiosk-admin --window-size=1440,900 --no-first-run'
  }
];

const vbsFile = path.join(ROOT, '_setup_direct.vbs');

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
  vbsContent += `
        Set s = ws.CreateShortcut(d & "\\${app.name}")
        s.TargetPath = "${edgeExe.replace(/\\/g, '\\\\')}"
        s.Arguments = "${app.args}"
        s.WorkingDirectory = "${ROOT.replace(/\\/g, '\\\\')}"
        s.Description = "${app.title}"
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

console.log('✓ All 4 desktop shortcuts updated to direct 1-click execution!');

// Refresh shell icon cache
try {
  execSync('powershell -Command "& ie4uinit.exe -show"', { stdio: 'ignore' });
} catch (e) {}
