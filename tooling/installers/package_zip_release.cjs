const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const userHome = process.env.USERPROFILE || 'C:\\Users\\OM Sanjhira';
const PKG_DIR = path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

async function buildPackage() {
  console.log('1. Preparing clean distribution directory:', PKG_DIR);
  if (fs.existsSync(PKG_DIR)) {
    try {
      // Clean old contents
      fs.rmSync(PKG_DIR, { recursive: true, force: true });
    } catch (e) {}
  }
  fs.mkdirSync(PKG_DIR, { recursive: true });

  // 2. Copy production dist builds for all 4 apps
  console.log('2. Copying built frontends...');
  copyRecursiveSync(path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'dist'), path.join(PKG_DIR, 'pos_app'));
  copyRecursiveSync(path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'dist'), path.join(PKG_DIR, 'pos_admin_app'));
  copyRecursiveSync(path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'dist'), path.join(PKG_DIR, 'kiosk_app'));
  copyRecursiveSync(path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'dist'), path.join(PKG_DIR, 'kiosk_admin_app'));

  // 3. Copy Server Backend and Database
  console.log('3. Copying local server backend & database...');
  const serverDir = path.join(PKG_DIR, 'server');
  fs.mkdirSync(serverDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tooling', 'local-runtime', 'local_service.cjs'), path.join(serverDir, 'local_service.cjs'));
  if (fs.existsSync(path.join(ROOT, 'packages', 'database', 'src', 'live_db.json'))) {
    fs.copyFileSync(path.join(ROOT, 'packages', 'database', 'src', 'live_db.json'), path.join(serverDir, 'live_db.json'));
  }

  // 4. Copy Brand Icons
  console.log('4. Copying authentic white-badge brand icons...');
  const iconsDir = path.join(PKG_DIR, 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });
  const srcIco = path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'src-tauri', 'icons', 'icon.ico');
  const srcPng = path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'icons', 'white_icon.png');
  if (fs.existsSync(srcIco)) fs.copyFileSync(srcIco, path.join(iconsDir, 'icon.ico'));
  if (fs.existsSync(srcPng)) fs.copyFileSync(srcPng, path.join(iconsDir, 'icon.png'));

  // Also copy icon.ico to server root
  if (fs.existsSync(srcIco)) {
    fs.copyFileSync(srcIco, path.join(PKG_DIR, 'pos_app', 'favicon.ico'));
    fs.copyFileSync(srcIco, path.join(PKG_DIR, 'pos_admin_app', 'favicon.ico'));
    fs.copyFileSync(srcIco, path.join(PKG_DIR, 'kiosk_app', 'favicon.ico'));
    fs.copyFileSync(srcIco, path.join(PKG_DIR, 'kiosk_admin_app', 'favicon.ico'));
  }

  // 5. Create Standalone Launcher Node Script
  const launcherCode = `/**
 * JAMANVAAR Production Standalone App Launcher
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const SERVER_SCRIPT = path.join(ROOT, 'server', 'local_service.cjs');

let edgeExe = 'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe';
if (!fs.existsSync(edgeExe)) {
  edgeExe = 'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe';
}
if (!fs.existsSync(edgeExe)) {
  // Fallback to default browser
  edgeExe = 'explorer.exe';
}

function isServerAlive() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5178/api/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(400, () => resolve(false));
  });
}

async function launchApp(target, url, args = '') {
  const alive = await isServerAlive();
  if (!alive) {
    console.log('[JAMANVAAR] Starting background service on http://localhost:5178...');
    const serverProcess = spawn('node', [SERVER_SCRIPT], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(SERVER_SCRIPT),
      windowsHide: true
    });
    serverProcess.unref();

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (await isServerAlive()) break;
    }
  }

  const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\\\Users\\\\Default';
  const profileDir = path.join(userHome, '.jamanvaar', 'profiles', target);
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const fullArgs = [
    \`--app=\${url}\`,
    \`--user-data-dir=\${profileDir}\`,
    \`--app-id=jamanvaar_\${target}_terminal_v1\`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    ...args.split(' ').filter(Boolean)
  ];

  const edgeProcess = spawn(edgeExe, fullArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  edgeProcess.unref();
}

const target = process.argv[2] || 'pos';
const configs = {
  pos: { url: 'http://localhost:5178/pos/', args: '--window-size=1440,900' },
  'pos-admin': { url: 'http://localhost:5178/pos-admin/', args: '--window-size=1440,900' },
  kiosk: { url: 'http://localhost:5178/kiosk/', args: '--kiosk --edge-kiosk-type=fullscreen --disable-pinch' },
  'kiosk-admin': { url: 'http://localhost:5178/kiosk-admin/', args: '--window-size=1440,900' },
  hub: { url: 'http://localhost:5178/', args: '--window-size=1080,800' }
};

const cfg = configs[target] || configs.pos;
launchApp(target, cfg.url, cfg.args).then(() => {
  process.exit(0);
});
`;
  fs.writeFileSync(path.join(PKG_DIR, 'launcher.cjs'), launcherCode);

  // 6. Create Double-Click Windows Batch & VBS Launchers for all apps
  const makeBatch = (target, title) => `@echo off
cd /d "%~dp0"
start "" /b node "%~dp0launcher.cjs" ${target}
exit
`;

  const makeVbs = (target) => `Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "node launcher.cjs ${target}", 0, False
`;

  fs.writeFileSync(path.join(PKG_DIR, 'START_POS.bat'), makeBatch('pos', 'JAMANVAAR POS'));
  fs.writeFileSync(path.join(PKG_DIR, 'START_POS.vbs'), makeVbs('pos'));

  fs.writeFileSync(path.join(PKG_DIR, 'START_POS_ADMIN.bat'), makeBatch('pos-admin', 'JAMANVAAR POS Admin'));
  fs.writeFileSync(path.join(PKG_DIR, 'START_POS_ADMIN.vbs'), makeVbs('pos-admin'));

  fs.writeFileSync(path.join(PKG_DIR, 'START_KIOSK.bat'), makeBatch('kiosk', 'JAMANVAAR Kiosk'));
  fs.writeFileSync(path.join(PKG_DIR, 'START_KIOSK.vbs'), makeVbs('kiosk'));

  fs.writeFileSync(path.join(PKG_DIR, 'START_KIOSK_ADMIN.bat'), makeBatch('kiosk-admin', 'JAMANVAAR Kiosk Admin'));
  fs.writeFileSync(path.join(PKG_DIR, 'START_KIOSK_ADMIN.vbs'), makeVbs('kiosk-admin'));

  fs.writeFileSync(path.join(PKG_DIR, 'START_ALL_TERMINALS_HUB.bat'), makeBatch('hub', 'JAMANVAAR Hub'));
  fs.writeFileSync(path.join(PKG_DIR, 'START_ALL_TERMINALS_HUB.vbs'), makeVbs('hub'));

  // 7. Create Script to install Desktop Shortcuts on friend's PC
  const shortcutInstallerBat = `@echo off
echo ===================================================
echo   JAMANVAAR RESTAURANT SUITE - SHORTCUT CREATOR
echo ===================================================
echo.
echo Creating Desktop shortcuts with high-resolution icons...
node "%~dp0create_shortcuts.cjs"
echo.
echo All shortcuts created successfully on your Desktop!
echo Press any key to close...
pause > nul
`;
  fs.writeFileSync(path.join(PKG_DIR, 'CREATE_DESKTOP_SHORTCUTS.bat'), shortcutInstallerBat);

  const shortcutInstallerCjs = `const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const PKG_ROOT = __dirname;
const launcherJs = path.join(PKG_ROOT, 'launcher.cjs');
const iconPath = path.join(PKG_ROOT, 'icons', 'icon.ico');
const nodeExe = 'node';
const cmdExe = 'C:\\\\Windows\\\\System32\\\\cmd.exe';

const userHome = process.env.USERPROFILE || 'C:\\\\Users\\\\Default';
const desktops = [
  path.join(userHome, 'OneDrive', 'Desktop'),
  path.join(userHome, 'Desktop')
];

const apps = [
  { name: 'JAMANVAAR POS.lnk', target: 'pos', title: 'JAMANVAAR POS - Counter Terminal' },
  { name: 'JAMANVAAR POS Admin.lnk', target: 'pos-admin', title: 'JAMANVAAR POS Admin HQ' },
  { name: 'JAMANVAAR Kiosk.lnk', target: 'kiosk', title: 'JAMANVAAR Customer Touch Kiosk' },
  { name: 'JAMANVAAR Kiosk Admin.lnk', target: 'kiosk-admin', title: 'JAMANVAAR Kiosk Fleet Admin' }
];

const vbsLines = [
  'Set ws = CreateObject("WScript.Shell")',
  'Set fso = CreateObject("Scripting.FileSystemObject")'
];

apps.forEach(app => {
  const args = '/c start "" /b "' + nodeExe + '" "' + launcherJs + '" ' + app.target;
  desktops.forEach(d => {
    if (fs.existsSync(d)) {
      const linkPath = path.join(d, app.name);
      vbsLines.push('If fso.FileExists("' + linkPath.replace(/"/g, '""') + '") Then fso.DeleteFile "' + linkPath.replace(/"/g, '""') + '", True');
      vbsLines.push('Set s = ws.CreateShortcut("' + linkPath.replace(/"/g, '""') + '")');
      vbsLines.push('s.TargetPath = "' + cmdExe.replace(/"/g, '""') + '"');
      vbsLines.push('s.Arguments = "' + args.replace(/"/g, '""') + '"');
      vbsLines.push('s.WorkingDirectory = "' + PKG_ROOT.replace(/"/g, '""') + '"');
      vbsLines.push('s.Description = "' + app.title.replace(/"/g, '""') + '"');
      vbsLines.push('s.WindowStyle = 7');
      vbsLines.push('s.IconLocation = "' + iconPath.replace(/"/g, '""') + ',0"');
      vbsLines.push('s.Save');
    }
  });
});

const tempVbs = path.join(__dirname, '_make_links.vbs');
fs.writeFileSync(tempVbs, vbsLines.join('\\r\\n'));

try {
  execSync('cscript //nologo "' + tempVbs + '"');
  console.log('✓ Successfully created all 4 desktop shortcuts with brand icon!');
} finally {
  if (fs.existsSync(tempVbs)) fs.unlinkSync(tempVbs);
}

try {
  execSync('ie4uinit.exe -show', { stdio: 'ignore' });
} catch (e) {}
`;
  fs.writeFileSync(path.join(PKG_DIR, 'create_shortcuts.cjs'), shortcutInstallerCjs);

  // 8. Create README_HOW_TO_RUN.txt
  const readmeText = `========================================================================
       JAMANVAAR RESTAURANT OPERATING SYSTEM — COMPLETE SUITE
========================================================================
Version: 1.0.0 Commercial Release (Offline-First Local On-Premise)
Publisher: JAMANVAAR by KELVIONTECH

HOW TO RUN ON ANY WINDOWS PC:
========================================================================

STEP 1: UNZIP THIS FOLDER
------------------------------------------------------------------------
Extract this entire folder anywhere on your PC (e.g. Desktop or C:\\).

STEP 2: RUN ANY TERMINAL APPLICATION
------------------------------------------------------------------------
Simply double-click any launcher:

  • START_POS.bat             -> Launches JAMANVAAR POS (Counter Billing Terminal)
  • START_POS_ADMIN.bat       -> Launches JAMANVAAR POS Admin (Operations & KDS)
  • START_KIOSK.bat           -> Launches JAMANVAAR Kiosk (Customer Self-Ordering)
  • START_KIOSK_ADMIN.bat     -> Launches JAMANVAAR Kiosk Admin (Terminal Management)
  • START_ALL_TERMINALS_HUB.bat -> Launches the Terminal Hub Selection Screen

STEP 3: (OPTIONAL) ADD SHORTCUTS TO YOUR DESKTOP
------------------------------------------------------------------------
Double-click "CREATE_DESKTOP_SHORTCUTS.bat". It will instantly place all
4 branded application icons on your Windows Desktop!

REQUIREMENTS:
------------------------------------------------------------------------
• Windows 10 or Windows 11
• Node.js installed (LTS 18 or 20+ recommended)
• Microsoft Edge (pre-installed on Windows 10/11)

FEATURES:
------------------------------------------------------------------------
✓ 100% Offline-First (No internet required)
✓ Instant startup in dedicated standalone app windows
✓ Real-time local restaurant database and synchronization
✓ Full high-DPI crisp branding and icons
`;
  fs.writeFileSync(path.join(PKG_DIR, 'README_HOW_TO_RUN.txt'), readmeText);

  // 9. Compress into ZIP file
  console.log('5. Compressing into ZIP archive: JAMANVAAR_ALL_APPS.zip...');
  const zipDestinations = [
    path.join(ROOT, 'JAMANVAAR_ALL_APPS.zip'),
    path.join(userHome, 'OneDrive', 'Desktop', 'JAMANVAAR_ALL_APPS.zip'),
    path.join(userHome, 'Desktop', 'JAMANVAAR_ALL_APPS.zip')
  ];

  const tempZip = path.join(ROOT, 'JAMANVAAR_ALL_APPS.zip');
  if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);

  // Use PowerShell Compress-Archive for reliable Windows zip creation
  const zipCmd = `powershell -Command "Compress-Archive -Path '${PKG_DIR}\\*' -DestinationPath '${tempZip}' -Force"`;
  console.log('Running compression...');
  execSync(zipCmd);

  const zipSizeMb = (fs.statSync(tempZip).size / (1024 * 1024)).toFixed(2);
  console.log(`✓ Created ZIP (${zipSizeMb} MB): ${tempZip}`);

  // Copy to desktop for direct user sharing
  zipDestinations.forEach(dest => {
    if (path.dirname(dest) !== ROOT && fs.existsSync(path.dirname(dest))) {
      fs.copyFileSync(tempZip, dest);
      console.log(`✓ Copied ZIP to: ${dest}`);
    }
  });

  console.log('===================================================');
  console.log('PACKAGE READY FOR SHARING!');
  console.log('===================================================');
}

buildPackage().catch(console.error);
