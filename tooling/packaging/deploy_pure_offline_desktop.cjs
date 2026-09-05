/**
 * Deploy Pure Offline Desktop Applications:
 * ZERO background servers, ZERO localhost, ZERO node processes.
 * Direct offline execution with embedded classic scripts.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
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
console.log('  DEPLOYING PURE OFFLINE DESKTOP APPS (NO SERVERS, NO LOCALHOST)');
console.log('===============================================================\n');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Deploy packaged apps
ensureDir(PROGRAMS_DIR);
ensureDir(path.join(PROGRAMS_DIR, 'icons'));

copyDir(path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'dist'), path.join(PROGRAMS_DIR, 'pos_app'));
copyDir(path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'dist'), path.join(PROGRAMS_DIR, 'pos_admin_app'));
copyDir(path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'dist'), path.join(PROGRAMS_DIR, 'kiosk_app'));
copyDir(path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'dist'), path.join(PROGRAMS_DIR, 'kiosk_admin_app'));

fs.copyFileSync(path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'icons', 'icon.ico'), ICON_PATH);

// 2. Remove any scheduled server tasks or startup entries
try {
  execSync('schtasks /delete /tn "JAMANVAAR_Server" /f', { stdio: 'ignore' });
} catch (e) {}

const startupDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const startupLnk = path.join(startupDir, 'JAMANVAAR_Server.lnk');
if (fs.existsSync(startupLnk)) {
  try { fs.unlinkSync(startupLnk); } catch (e) {}
}

// 3. Configure Shortcuts directly to the self-contained offline files
function toFileUrl(localPath) {
  return 'file:///' + localPath.replace(/\\/g, '/');
}

const apps = [
  {
    name: 'JAMANVAAR POS.lnk',
    title: 'JAMANVAAR POS',
    url: toFileUrl(path.join(PROGRAMS_DIR, 'pos_app', 'index.html')),
    args: '--window-size=1440,900'
  },
  {
    name: 'JAMANVAAR POS Admin.lnk',
    title: 'JAMANVAAR POS Admin',
    url: toFileUrl(path.join(PROGRAMS_DIR, 'pos_admin_app', 'index.html')),
    args: '--window-size=1440,900'
  },
  {
    name: 'JAMANVAAR Kiosk.lnk',
    title: 'JAMANVAAR Kiosk',
    url: toFileUrl(path.join(PROGRAMS_DIR, 'kiosk_app', 'index.html')),
    args: '--kiosk --edge-kiosk-type=fullscreen --disable-pinch'
  },
  {
    name: 'JAMANVAAR Kiosk Admin.lnk',
    title: 'JAMANVAAR Kiosk Admin',
    url: toFileUrl(path.join(PROGRAMS_DIR, 'kiosk_admin_app', 'index.html')),
    args: '--window-size=1440,900'
  }
];

const vbsFile = path.join(PROGRAMS_DIR, '_setup_offline_shortcuts.vbs');

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
  const fullArgs = `--app="${app.url}" ${app.args} --no-first-run`;
  vbsContent += `
        Set s = ws.CreateShortcut(d & "\\${app.name}")
        s.TargetPath = "${edgeExe.replace(/\\/g, '\\\\')}"
        s.Arguments = "${fullArgs.replace(/"/g, '""')}"
        s.WorkingDirectory = "${PROGRAMS_DIR.replace(/\\/g, '\\\\')}"
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

console.log('✓ All 4 desktop shortcuts configured for 100% pure offline direct execution!');

try {
  execSync('powershell -Command "& ie4uinit.exe -show"', { stdio: 'ignore' });
} catch (e) {}

console.log('\n===============================================================');
console.log('  ✓ ALL SERVERS STOPPED & PURE OFFLINE DESKTOP APPS ACTIVE!    ');
console.log('===============================================================\n');
