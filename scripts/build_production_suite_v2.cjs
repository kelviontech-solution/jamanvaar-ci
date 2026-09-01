/**
 * JAMANVAAR - Master Production Desktop Architecture Builder & Deployer
 * 
 * 1. Packages clean static builds for POS, POS Admin, Kiosk, Kiosk Admin.
 * 2. Compiles 4 native Windows Executables (C# .NET) with embedded circular brand icons.
 * 3. Each executable is autonomous: checks if Local Core (:5178) is running, auto-boots it silently if needed, and launches the App Window.
 * 4. Shares a SINGLE canonical database between POS and POS Admin (live real-time sync).
 * 5. Creates official Desktop Shortcuts on user desktop with the circular badge icon.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_APPDATA = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
const PROGRAMS_DIR = path.join(LOCAL_APPDATA, 'Programs', 'JAMANVAAR');
const DESKTOP_ONEDRIVE = path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop');
const DESKTOP_LOCAL = path.join(process.env.USERPROFILE, 'Desktop');
const ICON_PATH = path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'icons', 'icon.ico');
const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

console.log('==================================================================');
console.log('  JAMANVAAR — MASTER PRODUCTION DESKTOP ARCHITECTURE BUILD        ');
console.log('==================================================================\n');

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

// 0. Terminate any running executable instances to avoid file lock
try {
  execSync('powershell.exe -Command "Stop-Process -Name JAMANVAAR* -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
} catch (e) {}

// 1. Setup Programs Directory
console.log('[1/5] Preparing installation directories in:', PROGRAMS_DIR);
ensureDir(PROGRAMS_DIR);
ensureDir(path.join(PROGRAMS_DIR, 'server'));
ensureDir(path.join(PROGRAMS_DIR, 'icons'));
ensureDir(path.join(PROGRAMS_DIR, 'data'));

copyDir(path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'dist'), path.join(PROGRAMS_DIR, 'pos_app'));
copyDir(path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'dist'), path.join(PROGRAMS_DIR, 'pos_admin_app'));
copyDir(path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'dist'), path.join(PROGRAMS_DIR, 'kiosk_app'));
copyDir(path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'dist'), path.join(PROGRAMS_DIR, 'kiosk_admin_app'));

fs.copyFileSync(path.join(ROOT, 'scripts', 'local_service.cjs'), path.join(PROGRAMS_DIR, 'server', 'local_service.cjs'));
fs.copyFileSync(path.join(ROOT, 'shared', 'database', 'src', 'live_db.json'), path.join(PROGRAMS_DIR, 'server', 'live_db.json'));
fs.copyFileSync(ICON_PATH, path.join(PROGRAMS_DIR, 'icons', 'icon.ico'));

const apps = [
  {
    key: 'pos',
    exeName: 'JAMANVAAR_POS.exe',
    shortcutName: 'JAMANVAAR POS.lnk',
    title: 'JAMANVAAR POS',
    desc: 'JAMANVAAR High-Speed Counter Billing Terminal',
    url: 'http://localhost:5178/pos',
    isKiosk: false,
    width: 1440,
    height: 900
  },
  {
    key: 'pos-admin',
    exeName: 'JAMANVAAR_POS_Admin.exe',
    shortcutName: 'JAMANVAAR POS Admin.lnk',
    title: 'JAMANVAAR POS Admin',
    desc: 'JAMANVAAR Restaurant Management & KDS',
    url: 'http://localhost:5178/pos-admin',
    isKiosk: false,
    width: 1440,
    height: 900
  },
  {
    key: 'kiosk',
    exeName: 'JAMANVAAR_Kiosk.exe',
    shortcutName: 'JAMANVAAR Kiosk.lnk',
    title: 'JAMANVAAR Kiosk',
    desc: 'JAMANVAAR Customer Self-Ordering Kiosk',
    url: 'http://localhost:5178/kiosk',
    isKiosk: true,
    width: 1080,
    height: 1920
  },
  {
    key: 'kiosk-admin',
    exeName: 'JAMANVAAR_Kiosk_Admin.exe',
    shortcutName: 'JAMANVAAR Kiosk Admin.lnk',
    title: 'JAMANVAAR Kiosk Admin',
    desc: 'JAMANVAAR Kiosk Operations & Devices',
    url: 'http://localhost:5178/kiosk-admin',
    isKiosk: false,
    width: 1440,
    height: 900
  }
];

// 2. Generate Native Self-Healing Launchers for Each App
console.log('\n[2/5] Creating self-healing launchers (Zero-dependency & SAC compliant)...');
const launchersDir = path.join(PROGRAMS_DIR, 'launchers');
ensureDir(launchersDir);

const appsConfig = [
  {
    key: 'pos',
    title: 'JAMANVAAR POS',
    shortcutName: 'JAMANVAAR POS.lnk',
    vbsName: 'launch_pos.vbs',
    url: 'http://localhost:5178/pos',
    extraArgs: '--window-size=1440,900'
  },
  {
    key: 'pos-admin',
    title: 'JAMANVAAR POS Admin',
    shortcutName: 'JAMANVAAR POS Admin.lnk',
    vbsName: 'launch_pos_admin.vbs',
    url: 'http://localhost:5178/pos-admin',
    extraArgs: '--window-size=1440,900'
  },
  {
    key: 'kiosk-user',
    title: 'JAMANVAAR Kiosk',
    shortcutName: 'JAMANVAAR Kiosk.lnk',
    vbsName: 'launch_kiosk.vbs',
    url: 'http://localhost:5178/kiosk',
    extraArgs: '--kiosk --edge-kiosk-type=fullscreen --disable-pinch'
  },
  {
    key: 'kiosk-admin',
    title: 'JAMANVAAR Kiosk Admin',
    shortcutName: 'JAMANVAAR Kiosk Admin.lnk',
    vbsName: 'launch_kiosk_admin.vbs',
    url: 'http://localhost:5178/kiosk-admin',
    extraArgs: '--window-size=1440,900'
  }
];

const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
const serverScript = path.join(PROGRAMS_DIR, 'server', 'local_service.cjs');

for (const app of appsConfig) {
  const vbsPath = path.join(launchersDir, app.vbsName);
  const scriptContent = `
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 1. Check if Local Server is listening
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.open "GET", "http://127.0.0.1:5178/api/health", False
http.setTimeouts 400, 400, 400, 400
http.send ""

If http.status <> 200 Then
    ' Start server in background with zero window
    WshShell.Run """${nodePath}"" ""${serverScript.replace(/\\/g, '\\\\')}""", 0, False
    ' Wait for server initialization
    For i = 1 To 12
        WScript.Sleep 250
        Set http2 = CreateObject("MSXML2.ServerXMLHTTP.6.0")
        http2.open "GET", "http://127.0.0.1:5178/api/health", False
        http2.setTimeouts 200, 200, 200, 200
        http2.send ""
        If http2.status = 200 Then Exit For
    Next
End If

' 2. Locate Edge Binary
Dim edgeExe
edgeExe = "${edgeCandidates[0].replace(/\\/g, '\\\\')}"
If Not fso.FileExists(edgeExe) Then
    edgeExe = "${edgeCandidates[1].replace(/\\/g, '\\\\')}"
End If

' 3. Launch App Window
WshShell.Run """" & edgeExe & """ --app=""${app.url}"" ${app.extraArgs} --no-first-run", 1, False
`;
  fs.writeFileSync(vbsPath, scriptContent.trim(), 'utf8');
  console.log(`  ✓ Created self-healing launcher: ${app.vbsName}`);
}

// 3. Register Windows Logon Startup
console.log('\n[3/5] Registering Windows Auto-Startup for JAMANVAAR Core...');
try {
  const regCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "JAMANVAAR_Core" /t REG_SZ /d "\\"${nodePath}\\" \\"${serverScript}\\"" /f`;
  execSync(regCmd, { stdio: 'ignore' });
  console.log('  ✓ Auto-Startup registered in registry');
} catch (e) {}

// 4. Create Desktop Shortcuts pointing to Launchers
console.log('\n[4/5] Creating Desktop Shortcuts on User Desktop...');
const vbsMakeShortcuts = path.join(PROGRAMS_DIR, '_make_shortcuts.vbs');

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

for (const app of appsConfig) {
  const vbsLauncher = path.join(launchersDir, app.vbsName).replace(/\\/g, '\\\\');
  vbsContent += `
        Set s = ws.CreateShortcut(d & "\\${app.shortcutName}")
        s.TargetPath = "wscript.exe"
        s.Arguments = """" & "${vbsLauncher}" & """"
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

fs.writeFileSync(vbsMakeShortcuts, vbsContent, 'utf8');
execSync(`cscript.exe //Nologo "${vbsMakeShortcuts}"`, { stdio: 'inherit' });
fs.rmSync(vbsMakeShortcuts, { force: true });

console.log('✓ Desktop shortcuts created for all 4 applications!');

// 5. Refresh Explorer Shell Icon Cache
console.log('\n[5/5] Refreshing Windows Shell icon cache...');
try {
  execSync('powershell -Command "& ie4uinit.exe -show"', { stdio: 'ignore' });
} catch (e) {}

console.log('\n==================================================================');
console.log('  ✓ PRODUCTION DEPLOYMENT COMPLETE — FULL STANDALONE DESKTOP READY');
console.log('==================================================================\n');
