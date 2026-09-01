/**
 * Standalone Production Desktop Shortcut Creator (100% Offline, NO LOCALHOST)
 * Uses native file:/// protocol with --allow-file-access-from-files
 * Runs 100% independently with ZERO dev servers, ZERO node, ZERO ports.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOCAL_APPDATA = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
const PROGRAMS_DIR = path.join(LOCAL_APPDATA, 'Programs', 'JAMANVAAR');
const DESKTOP_ONEDRIVE = path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop');
const DESKTOP_LOCAL = path.join(process.env.USERPROFILE, 'Desktop');
const ICON_PATH = path.join(PROGRAMS_DIR, 'icons', 'icon.ico');

let edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!fs.existsSync(edgeExe)) {
  edgeExe = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';
}

console.log('===============================================================');
console.log('  CREATING 100% STANDALONE PRODUCTION SHORTCUTS (NO LOCALHOST)  ');
console.log('===============================================================\n');

function toFileUrl(localPath) {
  return 'file:///' + localPath.replace(/\\/g, '/');
}

const apps = [
  {
    name: 'JAMANVAAR POS.lnk',
    title: 'JAMANVAAR POS',
    url: toFileUrl(path.join(PROGRAMS_DIR, 'pos_app', 'index.html')),
    extraArgs: '--window-size=1440,900'
  },
  {
    name: 'JAMANVAAR POS Admin.lnk',
    title: 'JAMANVAAR POS Admin',
    url: toFileUrl(path.join(PROGRAMS_DIR, 'pos_admin_app', 'index.html')),
    extraArgs: '--window-size=1440,900'
  },
  {
    name: 'JAMANVAAR Kiosk.lnk',
    title: 'JAMANVAAR Kiosk',
    url: toFileUrl(path.join(PROGRAMS_DIR, 'kiosk_app', 'index.html')),
    extraArgs: '--kiosk --edge-kiosk-type=fullscreen --disable-pinch'
  },
  {
    name: 'JAMANVAAR Kiosk Admin.lnk',
    title: 'JAMANVAAR Kiosk Admin',
    url: toFileUrl(path.join(PROGRAMS_DIR, 'kiosk_admin_app', 'index.html')),
    extraArgs: '--window-size=1440,900'
  }
];

const vbsFile = path.join(PROGRAMS_DIR, 'make_standalone_shortcuts.vbs');

let vbsContent = `
Set ws = CreateObject("WScript.Shell")
edgePath = "${edgeExe}"
iconPath = "${ICON_PATH}"
workingDir = "${PROGRAMS_DIR}"

Dim desktops(1)
desktops(0) = "${DESKTOP_ONEDRIVE.replace(/\\/g, '\\\\')}"
desktops(1) = "${DESKTOP_LOCAL.replace(/\\/g, '\\\\')}"

Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")

For Each d in desktops
    If fso.FolderExists(d) Then
`;

for (const app of apps) {
  const args = `--app="${app.url}" ${app.extraArgs} --no-first-run --allow-file-access-from-files`;
  vbsContent += `
        Set s = ws.CreateShortcut(d & "\\${app.name}")
        s.TargetPath = edgePath
        s.Arguments = "${args.replace(/"/g, '""')}"
        s.WorkingDirectory = workingDir
        s.Description = "${app.title}"
        s.IconLocation = iconPath & ",0"
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

console.log('✓ All 4 standalone desktop shortcuts created cleanly!');

// Refresh icon cache
try {
  execSync('powershell -Command "& ie4uinit.exe -show"', { stdio: 'ignore' });
} catch (e) {}
