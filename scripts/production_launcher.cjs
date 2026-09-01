/**
 * JAMANVAAR POS - Production Desktop Launcher
 * 1. Checks if local server is running; if not, starts it silently in background.
 * 2. Opens POS in standalone App Window Mode with custom window size.
 * 3. 0 popups, 0 console windows, 0 localhost connection errors.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SERVER_SCRIPT = path.join(ROOT, 'scripts', 'local_service.cjs');

let edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!fs.existsSync(edgeExe)) {
  edgeExe = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';
}
if (!fs.existsSync(edgeExe)) {
  edgeExe = 'explorer.exe';
}

function isServerAlive() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5178/api/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(300, () => resolve(false));
  });
}

async function launchApp(target, url, args = '') {
  const alive = await isServerAlive();
  if (!alive) {
    console.log('Starting JAMANVAAR local server in background...');
    const serverProcess = spawn('node', [SERVER_SCRIPT], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(SERVER_SCRIPT),
      windowsHide: true
    });
    serverProcess.unref();

    // Wait up to 3 seconds for server to be responsive
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (await isServerAlive()) break;
    }
  }

  // Profile path for clean isolated app identity and taskbar icon
  const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\OM Sanjhira';
  const profileDir = path.join(userHome, '.jamanvaar', 'profiles_v4', target);
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  // Launch standalone app window with custom app-id and dedicated user profile
  const fullArgs = [
    `--app=${url}`,
    `--user-data-dir=${profileDir}`,
    `--app-id=jamanvaar_${target}_v4`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-component-update',
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
  'kiosk-admin': { url: 'http://localhost:5178/kiosk-admin/', args: '--window-size=1440,900' }
};

const cfg = configs[target] || configs.pos;
launchApp(target, cfg.url, cfg.args).then(() => {
  process.exit(0);
});
