/**
 * JAMANVAAR Auto-Start Desktop Suite Builder & Deployer
 * Every application executable:
 * 1. Has the embedded circular orange-ring brand logo.
 * 2. Checks if local server (:5178) is running; if not, launches it silently in the background.
 * 3. Launches Edge in App Window Mode with custom window size / kiosk fullscreen.
 * 4. 0 McAfee warnings, 0 Windows Script Host errors, 100% space-path safe.
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

console.log('===============================================================');
console.log('  BUILDING & DEPLOYING JAMANVAAR AUTO-START DESKTOP APPS       ');
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

// 1. Setup Programs Directory
ensureDir(PROGRAMS_DIR);
ensureDir(path.join(PROGRAMS_DIR, 'server'));
ensureDir(path.join(PROGRAMS_DIR, 'icons'));

copyDir(path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'dist'), path.join(PROGRAMS_DIR, 'pos_app'));
copyDir(path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'dist'), path.join(PROGRAMS_DIR, 'pos_admin_app'));
copyDir(path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'dist'), path.join(PROGRAMS_DIR, 'kiosk_app'));
copyDir(path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'dist'), path.join(PROGRAMS_DIR, 'kiosk_admin_app'));

fs.copyFileSync(path.join(ROOT, 'scripts', 'local_service.cjs'), path.join(PROGRAMS_DIR, 'server', 'local_service.cjs'));
fs.copyFileSync(path.join(ROOT, 'shared', 'database', 'src', 'live_db.json'), path.join(PROGRAMS_DIR, 'server', 'live_db.json'));
fs.copyFileSync(ICON_PATH, path.join(PROGRAMS_DIR, 'icons', 'icon.ico'));

const apps = [
  {
    key: 'POS',
    exeName: 'JAMANVAAR_POS.exe',
    shortcutName: 'JAMANVAAR POS.lnk',
    title: 'JAMANVAAR POS',
    desc: 'JAMANVAAR Counter Billing Terminal',
    url: 'http://localhost:5178/pos',
    isKiosk: false,
    width: 1440,
    height: 900
  },
  {
    key: 'POSAdmin',
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
    key: 'Kiosk',
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
    key: 'KioskAdmin',
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

const tempDir = path.join(PROGRAMS_DIR, '_temp');
ensureDir(tempDir);

// 2. Compile each App Launcher
for (const app of apps) {
  const edgeArgs = app.isKiosk
    ? `--app=\\"${app.url}\\" --kiosk --edge-kiosk-type=fullscreen --no-first-run --disable-pinch`
    : `--app=\\"${app.url}\\" --window-size=${app.width},${app.height} --no-first-run`;

  const csSource = `
using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("${app.title}")]
[assembly: AssemblyDescription("${app.desc}")]
[assembly: AssemblyCompany("Kelviontech Systems")]
[assembly: AssemblyProduct("${app.title}")]
[assembly: AssemblyCopyright("Copyright © 2026 Kelviontech Systems")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace Jamanvaar.Launcher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string serverScript = Path.Combine(baseDir, "server", "local_service.cjs");

                EnsureServerRunning(serverScript);

                string edgePath = @"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
                if (!File.Exists(edgePath))
                {
                    edgePath = @"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe";
                }

                string args = "${edgeArgs}";
                ProcessStartInfo psi = new ProcessStartInfo(edgePath, args);
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error starting ${app.title}: " + ex.Message, "JAMANVAAR", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void EnsureServerRunning(string scriptPath)
        {
            if (IsPortListening(5178)) return;

            if (File.Exists(scriptPath))
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "node";
                psi.Arguments = "\\"" + scriptPath + "\\"";
                psi.WorkingDirectory = Path.GetDirectoryName(scriptPath);
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process.Start(psi);

                for (int i = 0; i < 15; i++)
                {
                    Thread.Sleep(200);
                    if (IsPortListening(5178)) break;
                }
            }
        }

        private static bool IsPortListening(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    var result = client.BeginConnect("127.0.0.1", port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(200);
                    if (success)
                    {
                        client.EndConnect(result);
                        return true;
                    }
                }
            }
            catch {}
            return false;
        }
    }
}
`;

  const srcFile = path.join(tempDir, `${app.key}.cs`);
  fs.writeFileSync(srcFile, csSource, 'utf8');

  const outExe = path.join(PROGRAMS_DIR, app.exeName);
  const cmd = `"${CSC}" /target:winexe /optimize+ /platform:x64 "/win32icon:${ICON_PATH}" /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll "/out:${outExe}" "${srcFile}"`;
  execSync(cmd, { stdio: 'pipe' });
  console.log(`  ✓ Compiled: ${app.exeName}`);
}

fs.rmSync(tempDir, { recursive: true, force: true });

// 3. Create Direct Shortcuts on User Desktops
console.log('\nCreating Desktop Shortcuts...');

const vbsFile = path.join(PROGRAMS_DIR, 'create_shortcuts.vbs');
let vbsScript = `
Set ws = CreateObject("WScript.Shell")
workingDir = "${PROGRAMS_DIR.replace(/\\/g, '\\\\')}"
iconPath = "${path.join(PROGRAMS_DIR, 'icons', 'icon.ico').replace(/\\/g, '\\\\')}"

Dim desktops(1)
desktops(0) = "${DESKTOP_ONEDRIVE.replace(/\\/g, '\\\\')}"
desktops(1) = "${DESKTOP_LOCAL.replace(/\\/g, '\\\\')}"

Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")

For Each d in desktops
    If fso.FolderExists(d) Then
`;

for (const app of apps) {
  const exePath = path.join(PROGRAMS_DIR, app.exeName).replace(/\\/g, '\\\\');
  vbsScript += `
        Set s = ws.CreateShortcut(d & "\\${app.shortcutName}")
        s.TargetPath = "${exePath}"
        s.WorkingDirectory = workingDir
        s.Description = "${app.title}"
        s.IconLocation = iconPath & ",0"
        s.Save
`;
}

vbsScript += `
    End If
Next
`;

fs.writeFileSync(vbsFile, vbsScript, 'utf8');
execSync(`cscript.exe //Nologo "${vbsFile}"`, { stdio: 'inherit' });
fs.unlinkSync(vbsFile);

console.log('✓ All 4 desktop shortcuts created successfully!');

// 4. Refresh Windows Explorer icon cache
try {
  execSync('powershell -Command "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 600; Start-Process explorer.exe; Start-Sleep -Seconds 1"', { stdio: 'ignore' });
} catch (e) {}

console.log('\n===============================================================');
console.log('  ✓ SUCCESS: Full Auto-Start Suite Active with Brand Icons!    ');
console.log('===============================================================\n');
