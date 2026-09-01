/**
 * JAMANVAAR — Windows Production Installer & Release Builder
 * Generates standalone, self-contained Windows Setup.exe installers for all 4 apps,
 * creates Start Menu & Desktop shortcuts, registers Windows Uninstaller,
 * and packages GitHub Release assets.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const crypto = require('crypto');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release');
const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

const APPS = [
  {
    id: 'pos',
    appId: 'com.kelviontech.jamanvaar.pos',
    name: 'JAMANVAAR POS',
    setupExe: 'JAMANVAAR-POS-Setup.exe',
    distDir: path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'dist'),
    subUrl: '/pos/',
    description: 'High-Speed Counter Billing, Table Management & Cash Drawer Terminal',
    windowArgs: '--window-size=1440,900'
  },
  {
    id: 'pos-admin',
    appId: 'com.kelviontech.jamanvaar.posadmin',
    name: 'JAMANVAAR POS Admin',
    setupExe: 'JAMANVAAR-POS-Admin-Setup.exe',
    distDir: path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'dist'),
    subUrl: '/pos-admin/',
    description: 'Restaurant Operations, Reports, Live Kitchen KDS & Inventory HQ',
    windowArgs: '--window-size=1440,900'
  },
  {
    id: 'kiosk',
    appId: 'com.kelviontech.jamanvaar.kiosk',
    name: 'JAMANVAAR Kiosk',
    setupExe: 'JAMANVAAR-Kiosk-Setup.exe',
    distDir: path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'dist'),
    subUrl: '/kiosk/',
    description: 'Customer Self-Ordering Digital Touchscreen Kiosk Terminal',
    windowArgs: '--kiosk --edge-kiosk-type=fullscreen --disable-pinch'
  },
  {
    id: 'kiosk-admin',
    appId: 'com.kelviontech.jamanvaar.kioskadmin',
    name: 'JAMANVAAR Kiosk Admin',
    setupExe: 'JAMANVAAR-Kiosk-Admin-Setup.exe',
    distDir: path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'dist'),
    subUrl: '/kiosk-admin/',
    description: 'Kiosk Terminal Fleet Control, Hardware & Catalog Manager',
    windowArgs: '--window-size=1440,900'
  }
];

function calculateSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(child => {
      copyRecursiveSync(path.join(src, child), path.join(dest, child));
    });
  } else {
    if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

async function buildAllInstallers() {
  console.log('=======================================================');
  console.log('  JAMANVAAR WINDOWS INSTALLER & RELEASE PIPELINE');
  console.log('=======================================================');

  if (!fs.existsSync(RELEASE_DIR)) {
    fs.mkdirSync(RELEASE_DIR, { recursive: true });
  }

  const iconPath = path.join(ROOT, 'shared', 'ui', 'src', 'assets', 'branding', 'jamanvaar-logo.png');
  const tempIco = path.join(RELEASE_DIR, 'installer_icon.ico');

  // 1. Generate master installer icon (.ico)
  console.log('1. Building high-res master installer icon (.ico)...');
  const tileSvg = Buffer.from(`
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="goldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F27E2B" />
          <stop offset="50%" stop-color="#E66817" />
          <stop offset="100%" stop-color="#D9531E" />
        </linearGradient>
        <filter id="tileShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#0B253A" flood-opacity="0.18" />
        </filter>
      </defs>
      <rect x="24" y="24" width="976" height="976" rx="180" ry="180" fill="#FFFFFF" filter="url(#tileShadow)" />
      <rect x="24" y="24" width="976" height="976" rx="180" ry="180" fill="none" stroke="url(#goldBorder)" stroke-width="24" />
      <rect x="44" y="44" width="936" height="936" rx="160" ry="160" fill="none" stroke="#FDBA74" stroke-width="8" opacity="0.7" />
    </svg>
  `);

  const tileBg = await sharp(tileSvg).png().toBuffer();
  const logoFg = await sharp(iconPath).resize(860, 860, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const masterTile = await sharp(tileBg).composite([{ input: logoFg, gravity: 'center' }]).png().toBuffer();

  const iconSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  for (const size of iconSizes) {
    const buf = await sharp(masterTile).resize(size, size, { fit: 'contain' }).png().toBuffer();
    pngBuffers.push({ size, buffer: buf });
  }

  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = 6 + count * 16;
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.size >= 256 ? 0 : item.size, 0);
    entry.writeUInt8(item.size >= 256 ? 0 : item.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(item.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += item.buffer.length;
  }

  const icoBuf = Buffer.concat([header, ...dirEntries, ...pngBuffers.map(p => p.buffer)]);
  fs.writeFileSync(tempIco, icoBuf);

  // 2. Build each application installer
  const generatedInstallers = [];

  for (const app of APPS) {
    console.log(`\n--- Building Installer for ${app.name} ---`);
    const stagingDir = path.join(RELEASE_DIR, `staging_${app.id}`);
    if (fs.existsSync(stagingDir)) {
      try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (e) {}
    }
    fs.mkdirSync(stagingDir, { recursive: true });

    // Copy frontend
    const appDir = path.join(stagingDir, 'app');
    copyRecursiveSync(app.distDir, appDir);

    // Copy server backend & database
    const serverDir = path.join(stagingDir, 'server');
    fs.mkdirSync(serverDir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'local_service.cjs'), path.join(serverDir, 'local_service.cjs'));
    if (fs.existsSync(path.join(ROOT, 'shared', 'database', 'src', 'live_db.json'))) {
      fs.copyFileSync(path.join(ROOT, 'shared', 'database', 'src', 'live_db.json'), path.join(serverDir, 'live_db.json'));
    }

    // Copy icon
    const iconDest = path.join(stagingDir, 'icon.ico');
    fs.copyFileSync(tempIco, iconDest);

    // Create App Launcher Node Script
    const launcherScript = `const { spawn } = require('child_process');
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

async function launch() {
  const alive = await isServerAlive();
  if (!alive) {
    const srv = spawn('node', [SERVER_SCRIPT], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(SERVER_SCRIPT),
      windowsHide: true
    });
    srv.unref();

    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (await isServerAlive()) break;
    }
  }

  const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\\\Users\\\\Default';
  const profileDir = path.join(userHome, '.jamanvaar', 'profiles', '${app.id}');
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const fullArgs = [
    '--app=http://localhost:5178${app.subUrl}',
    \`--user-data-dir=\${profileDir}\`,
    '--app-id=${app.appId}',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-component-update',
    ...'${app.windowArgs}'.split(' ').filter(Boolean)
  ];

  const edge = spawn(edgeExe, fullArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  edge.unref();
}

launch().then(() => process.exit(0));
`;
    fs.writeFileSync(path.join(stagingDir, 'launcher.cjs'), launcherScript);

    // Create Launcher batch & vbs
    fs.writeFileSync(path.join(stagingDir, 'start.vbs'), `Set WshShell = CreateObject("WScript.Shell")\r\nWshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)\r\nWshShell.Run "node launcher.cjs", 0, False\r\n`);
    fs.writeFileSync(path.join(stagingDir, 'start.bat'), `@echo off\r\ncd /d "%~dp0"\r\nstart "" /b node launcher.cjs\r\nexit\r\n`);

    // Zip staging files for resource embedding
    const appZipPath = path.join(RELEASE_DIR, `${app.id}_payload.zip`);
    if (fs.existsSync(appZipPath)) fs.unlinkSync(appZipPath);
    execSync(`powershell -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${appZipPath}' -Force"`);
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (e) {}

    // Generate C# Windows Setup Source Code
    const csSource = `
using System;
using System.IO;
using System.IO.Compression;
using System.Drawing;
using System.Reflection;
using System.Windows.Forms;
using System.Diagnostics;
using Microsoft.Win32;

namespace JamanvaarInstaller
{
    public class SetupForm : Form
    {
        private ProgressBar pBar;
        private Label lblStatus;
        private Label lblTitle;
        private Button btnInstall;
        private CheckBox chkLaunch;
        private string appName = "${app.name}";
        private string appId = "${app.appId}";
        private string installDir;

        public SetupForm()
        {
            this.Text = "${app.name} — Setup";
            this.Size = new Size(540, 370);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(250, 248, 245);
            this.Font = new Font("Segoe UI", 9.5f);

            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            installDir = Path.Combine(localAppData, "Programs", "JAMANVAAR", "${app.name}");

            lblTitle = new Label()
            {
                Text = "${app.name}",
                Font = new Font("Segoe UI", 16f, FontStyle.Bold),
                ForeColor = Color.FromArgb(11, 37, 58),
                Location = new Point(32, 24),
                AutoSize = true
            };
            this.Controls.Add(lblTitle);

            Label lblDesc = new Label()
            {
                Text = "${app.description}\\nPublisher: JAMANVAAR by KELVIONTECH\\n100% Offline-First Restaurant Operating System",
                Font = new Font("Segoe UI", 9f),
                ForeColor = Color.FromArgb(100, 116, 139),
                Location = new Point(34, 64),
                Size = new Size(460, 56)
            };
            this.Controls.Add(lblDesc);

            Label lblPath = new Label()
            {
                Text = "Install Location:\\n" + installDir,
                Font = new Font("Segoe UI", 8.5f, FontStyle.Italic),
                ForeColor = Color.FromArgb(71, 85, 105),
                Location = new Point(34, 130),
                Size = new Size(460, 40)
            };
            this.Controls.Add(lblPath);

            pBar = new ProgressBar()
            {
                Location = new Point(34, 185),
                Size = new Size(456, 22),
                Minimum = 0,
                Maximum = 100,
                Value = 0,
                Visible = false
            };
            this.Controls.Add(pBar);

            lblStatus = new Label()
            {
                Text = "Click Install to set up ${app.name} on this computer.",
                Location = new Point(34, 215),
                Size = new Size(456, 24),
                ForeColor = Color.FromArgb(15, 23, 42)
            };
            this.Controls.Add(lblStatus);

            chkLaunch = new CheckBox()
            {
                Text = "Launch ${app.name} after setup completes",
                Checked = true,
                Location = new Point(34, 246),
                AutoSize = true,
                ForeColor = Color.FromArgb(11, 37, 58)
            };
            this.Controls.Add(chkLaunch);

            btnInstall = new Button()
            {
                Text = "Install Now",
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                BackColor = Color.FromArgb(230, 104, 23),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Location = new Point(340, 276),
                Size = new Size(150, 38),
                Cursor = Cursors.Hand
            };
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Click += BtnInstall_Click;
            this.Controls.Add(btnInstall);
        }

        private void BtnInstall_Click(object sender, EventArgs e)
        {
            btnInstall.Enabled = false;
            pBar.Visible = true;
            lblStatus.Text = "Installing application files...";
            Application.DoEvents();

            try
            {
                if (Directory.Exists(installDir))
                {
                    try { Directory.Delete(installDir, true); } catch { }
                }
                Directory.CreateDirectory(installDir);

                pBar.Value = 25;
                Application.DoEvents();

                // Extract embedded payload resource
                string tempZip = Path.Combine(Path.GetTempPath(), "${app.id}_install.zip");
                Assembly assembly = Assembly.GetExecutingAssembly();
                using (Stream stream = assembly.GetManifestResourceStream("payload.zip"))
                {
                    if (stream == null) throw new Exception("Embedded installation payload not found.");
                    using (FileStream fileStream = File.Create(tempZip))
                    {
                        stream.CopyTo(fileStream);
                    }
                }

                pBar.Value = 50;
                lblStatus.Text = "Extracting bundled components...";
                Application.DoEvents();

                ZipFile.ExtractToDirectory(tempZip, installDir);
                if (File.Exists(tempZip)) File.Delete(tempZip);

                pBar.Value = 75;
                lblStatus.Text = "Creating Desktop and Start Menu shortcuts...";
                Application.DoEvents();

                string iconLocation = Path.Combine(installDir, "icon.ico");
                string launcherVbs = Path.Combine(installDir, "start.vbs");
                string wscriptExe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "wscript.exe");

                // Desktop shortcut
                string desktopFolder = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                CreateShortcut(Path.Combine(desktopFolder, "${app.name}.lnk"), wscriptExe, "\\"" + launcherVbs + "\\"", installDir, "${app.name}", iconLocation);

                // Start Menu shortcut
                string startMenuFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "JAMANVAAR");
                Directory.CreateDirectory(startMenuFolder);
                CreateShortcut(Path.Combine(startMenuFolder, "${app.name}.lnk"), wscriptExe, "\\"" + launcherVbs + "\\"", installDir, "${app.name}", iconLocation);

                // Register Windows Uninstaller in Registry
                RegisterUninstaller();

                pBar.Value = 100;
                lblStatus.Text = "✓ Installation completed successfully!";
                btnInstall.Text = "Close";
                btnInstall.Enabled = true;
                btnInstall.Click -= BtnInstall_Click;
                btnInstall.Click += (s, ev) => { this.Close(); };

                if (chkLaunch.Checked)
                {
                    Process.Start(new ProcessStartInfo()
                    {
                        FileName = wscriptExe,
                        Arguments = "\\"" + launcherVbs + "\\"",
                        WorkingDirectory = installDir,
                        WindowStyle = ProcessWindowStyle.Hidden
                    });
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Installation error: " + ex.Message, "Setup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                btnInstall.Enabled = true;
            }
        }

        private void CreateShortcut(string linkPath, string target, string args, string workDir, string description, string icon)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic shortcut = shell.CreateShortcut(linkPath);
                shortcut.TargetPath = target;
                shortcut.Arguments = args;
                shortcut.WorkingDirectory = workDir;
                shortcut.Description = description;
                shortcut.IconLocation = icon + ",0";
                shortcut.Save();
            }
            catch { }
        }

        private void RegisterUninstaller()
        {
            try
            {
                string keyPath = @"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + appId;
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(keyPath))
                {
                    if (key != null)
                    {
                        key.SetValue("DisplayName", "${app.name}");
                        key.SetValue("DisplayIcon", Path.Combine(installDir, "icon.ico"));
                        key.SetValue("DisplayVersion", "1.0.0");
                        key.SetValue("Publisher", "JAMANVAAR by KELVIONTECH");
                        key.SetValue("InstallLocation", installDir);
                        key.SetValue("UninstallString", "cmd.exe /c rmdir /s /q \\"" + installDir + "\\"");
                        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                    }
                }
            }
            catch { }
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }
    }
}
`;

    const csFile = path.join(RELEASE_DIR, `setup_${app.id}.cs`);
    const outExe = path.join(RELEASE_DIR, app.setupExe);
    fs.writeFileSync(csFile, csSource);

    // Compile with csc.exe using /resource
    console.log(`Compiling native installer: ${app.setupExe}...`);
    const cscArgs = [
      '/target:winexe',
      `/out:${outExe}`,
      `/win32icon:${tempIco}`,
      `/resource:${appZipPath},payload.zip`,
      '/r:System.Windows.Forms.dll',
      '/r:System.Drawing.dll',
      '/r:System.IO.Compression.dll',
      '/r:System.IO.Compression.FileSystem.dll',
      '/r:Microsoft.CSharp.dll',
      csFile
    ];

    const cscResult = spawnSync(CSC, cscArgs, { encoding: 'utf8' });
    if (cscResult.status !== 0) {
      console.error('CSC Error:\n', cscResult.stdout, cscResult.stderr);
      throw new Error(`Failed to compile ${app.setupExe}`);
    }

    if (fs.existsSync(csFile)) fs.unlinkSync(csFile);
    if (fs.existsSync(appZipPath)) fs.unlinkSync(appZipPath);

    const exeSizeMb = (fs.statSync(outExe).size / (1024 * 1024)).toFixed(2);
    console.log(`✓ Created: ${outExe} (${exeSizeMb} MB)`);
    generatedInstallers.push({ name: app.setupExe, path: outExe, size: exeSizeMb });
  }

  // 3. Create Combined Distribution Package (ZIP)
  console.log('\n3. Building Combined Release ZIP: JAMANVAAR-Windows-Apps-v1.0.0.zip...');
  const zipPkgDir = path.join(RELEASE_DIR, 'JAMANVAAR-Windows-Apps-v1.0.0');
  if (fs.existsSync(zipPkgDir)) {
    try { fs.rmSync(zipPkgDir, { recursive: true, force: true }); } catch (e) {}
  }
  fs.mkdirSync(zipPkgDir, { recursive: true });

  generatedInstallers.forEach(inst => {
    fs.copyFileSync(inst.path, path.join(zipPkgDir, inst.name));
  });

  const readmeContent = `========================================================================
       JAMANVAAR RESTAURANT OPERATING SYSTEM — WINDOWS INSTALLERS
========================================================================
Version: 1.0.0
Publisher: JAMANVAAR by KELVIONTECH
Repository: https://github.com/om7867/kiosk.git

INSTALLATION GUIDE:
========================================================================

Choose which application you wish to install and double-click its installer:

  1. JAMANVAAR-POS-Setup.exe
     -> Fast Counter Billing Terminal & Cash Drawer

  2. JAMANVAAR-POS-Admin-Setup.exe
     -> Restaurant Management, Live Kitchen KDS, Reports & Inventory

  3. JAMANVAAR-Kiosk-Setup.exe
     -> Customer Self-Ordering Digital Touchscreen Kiosk

  4. JAMANVAAR-Kiosk-Admin-Setup.exe
     -> Kiosk Hardware Fleet Control & Menu Catalog Manager

FEATURES:
------------------------------------------------------------------------
✓ 1-Click Installation (Zero technical setup)
✓ Automatic Desktop and Start Menu Shortcuts with official branding
✓ 100% Offline-First (No internet required to operate)
✓ Instant startup in standalone window with zero localhost errors
✓ Clean uninstallation via Windows Settings -> Installed Apps
`;
  fs.writeFileSync(path.join(zipPkgDir, 'README.txt'), readmeContent);

  const combinedZipPath = path.join(RELEASE_DIR, 'JAMANVAAR-Windows-Apps-v1.0.0.zip');
  if (fs.existsSync(combinedZipPath)) fs.unlinkSync(combinedZipPath);
  execSync(`powershell -Command "Compress-Archive -Path '${zipPkgDir}\\*' -DestinationPath '${combinedZipPath}' -Force"`);
  try { fs.rmSync(zipPkgDir, { recursive: true, force: true }); } catch (e) {}

  const combinedZipSizeMb = (fs.statSync(combinedZipPath).size / (1024 * 1024)).toFixed(2);
  console.log(`✓ Created Combined ZIP: ${combinedZipPath} (${combinedZipSizeMb} MB)`);

  // 4. Generate SHA256SUMS.txt
  console.log('\n4. Generating SHA256 checksums...');
  const sumsFile = path.join(RELEASE_DIR, 'SHA256SUMS.txt');
  const sumLines = [];

  generatedInstallers.forEach(inst => {
    const sum = calculateSha256(inst.path);
    sumLines.push(`${sum}  ${inst.name}`);
  });
  const zipSum = calculateSha256(combinedZipPath);
  sumLines.push(`${zipSum}  JAMANVAAR-Windows-Apps-v1.0.0.zip`);

  fs.writeFileSync(sumsFile, sumLines.join('\r\n'));
  console.log('✓ Wrote SHA256SUMS.txt');

  // Copy combined ZIP and installers to Desktop for easy user testing
  const userHome = process.env.USERPROFILE || 'C:\\Users\\OM Sanjhira';
  const desktopDir = path.join(userHome, 'OneDrive', 'Desktop');
  if (fs.existsSync(desktopDir)) {
    fs.copyFileSync(combinedZipPath, path.join(desktopDir, 'JAMANVAAR-Windows-Apps-v1.0.0.zip'));
  }

  console.log('\n=======================================================');
  console.log('  ALL 4 INSTALLERS AND GITHUB RELEASE ASSETS READY!');
  console.log('=======================================================');
}

buildAllInstallers().catch(console.error);
