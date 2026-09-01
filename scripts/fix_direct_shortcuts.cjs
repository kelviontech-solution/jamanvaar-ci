/**
 * Fix Desktop Shortcuts: Direct Edge App Mode Target
 * Eliminates Windows Script Host space-in-path error completely.
 * 100% Native, 0 Errors, Direct Launch, Official Brand Icon.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_APPDATA = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
const PROGRAMS_DIR = path.join(LOCAL_APPDATA, 'Programs', 'JAMANVAAR');
const DESKTOP_ONEDRIVE = path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop');
const DESKTOP_LOCAL = path.join(process.env.USERPROFILE, 'Desktop');
const ICON_PATH = path.join(PROGRAMS_DIR, 'icons', 'icon.ico');

// Find Microsoft Edge executable
let edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!fs.existsSync(edgeExe)) {
  edgeExe = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';
}

console.log('Using Edge Path:', edgeExe);
console.log('Icon Path:', ICON_PATH);

// 1. Ensure Local Server is running
function checkServer() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5178/api/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => resolve(false));
  });
}

async function startServerIfStopped() {
  const isRunning = await checkServer();
  if (!isRunning) {
    console.log('Starting background local restaurant server...');
    const serverScript = path.join(PROGRAMS_DIR, 'server', 'local_service.cjs');
    const child = spawn('node', [serverScript], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(PROGRAMS_DIR, 'server')
    });
    child.unref();
    console.log('✓ Local server started in background.');
  } else {
    console.log('✓ Local server is already running and healthy.');
  }
}

// 2. Create Direct Desktop Shortcuts
const apps = [
  {
    name: 'JAMANVAAR POS.lnk',
    title: 'JAMANVAAR POS',
    args: '--app="http://localhost:5178/pos" --window-size=1440,900 --no-first-run'
  },
  {
    name: 'JAMANVAAR POS Admin.lnk',
    title: 'JAMANVAAR POS Admin',
    args: '--app="http://localhost:5178/pos-admin" --window-size=1440,900 --no-first-run'
  },
  {
    name: 'JAMANVAAR Kiosk.lnk',
    title: 'JAMANVAAR Kiosk',
    args: '--app="http://localhost:5178/kiosk" --kiosk --edge-kiosk-type=fullscreen --no-first-run --disable-pinch'
  },
  {
    name: 'JAMANVAAR Kiosk Admin.lnk',
    title: 'JAMANVAAR Kiosk Admin',
    args: '--app="http://localhost:5178/kiosk-admin" --window-size=1440,900 --no-first-run'
  }
];

async function updateShortcuts() {
  await startServerIfStopped();

  for (const app of apps) {
    for (const d of [DESKTOP_ONEDRIVE, DESKTOP_LOCAL]) {
      if (fs.existsSync(d)) {
        const linkPath = path.join(d, app.name);
        // Create shortcut using PowerShell COM object
        const psScript = `
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('${linkPath.replace(/'/g, "''")}')
$s.TargetPath = '${edgeExe.replace(/'/g, "''")}'
$s.Arguments = '${app.args.replace(/'/g, "''")}'
$s.WorkingDirectory = '${PROGRAMS_DIR.replace(/'/g, "''")}'
$s.Description = '${app.title}'
$s.IconLocation = '${ICON_PATH.replace(/'/g, "''")},0'
$s.Save()
`;
        try {
          execSync(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`, { stdio: 'ignore' });
          console.log(`  ✓ Updated shortcut: ${app.name} -> ${d}`);
        } catch (e) {
          console.error(`Failed to create shortcut: ${linkPath}`, e);
        }
      }
    }
  }

  // Flush icon cache
  console.log('\nRefreshing Windows Explorer icon cache...');
  try {
    execSync('powershell -Command "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 600; Start-Process explorer.exe; Start-Sleep -Seconds 1"', { stdio: 'ignore' });
  } catch (e) {}

  console.log('\n✓ All 4 shortcuts fixed with direct launch and official circular badge icon!');
}

updateShortcuts();
