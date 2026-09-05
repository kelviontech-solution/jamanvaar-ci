const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_LOGO = path.join(ROOT, 'packages', 'ui', 'src', 'assets', 'branding', 'jamanvaar-logo.png');

const userHome = process.env.USERPROFILE || 'C:\\Users\\OM Sanjhira';
const targetIconDir = path.join(userHome, '.jamanvaar', 'icons');
const desktopIcoPath = path.join(targetIconDir, 'jamanvaar_desktop_full_logo.ico');

async function deployPerfectIcons() {
  console.log('1. Building Desktop Shortcut Icon (Full Brand Logo on White Squircle Tile)...');
  if (!fs.existsSync(targetIconDir)) {
    fs.mkdirSync(targetIconDir, { recursive: true });
  }

  // -------------------------------------------------------------
  // A. DESKTOP SHORTCUT ICON: FULL LOGO (CLOCHE + JAMANVAAR + BY KELVIONTECH)
  // -------------------------------------------------------------
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

  const fullLogoForeground = await sharp(SOURCE_LOGO)
    .resize(860, 860, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const masterDesktopTile = await sharp(tileBg)
    .composite([{ input: fullLogoForeground, gravity: 'center' }])
    .png()
    .toBuffer();

  // Multi-res desktop ICO
  const iconSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  for (const size of iconSizes) {
    const buf = await sharp(masterDesktopTile).resize(size, size, { fit: 'contain' }).png().toBuffer();
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

  const desktopIcoBuffer = Buffer.concat([header, ...dirEntries, ...pngBuffers.map(p => p.buffer)]);
  fs.writeFileSync(desktopIcoPath, desktopIcoBuffer);
  console.log('✓ Wrote Desktop Shortcut Full-Logo ICO to:', desktopIcoPath);

  // -------------------------------------------------------------
  // B. TASKBAR / RUNNING WINDOW ICON: CLEAN UNCUT CLOCHE & HAND EMBLEM
  // -------------------------------------------------------------
  console.log('2. Building Taskbar / Running Window Cloche Emblem with complete uncut hand...');
  const uncutClocheBuffer = await sharp(SOURCE_LOGO)
    .extract({ left: 320, top: 0, width: 565, height: 420 })
    .png()
    .toBuffer();

  const resizedTaskbarCloche = await sharp(uncutClocheBuffer)
    .resize(800, 800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const masterTaskbarTile = await sharp(tileBg)
    .composite([{ input: resizedTaskbarCloche, gravity: 'center' }])
    .png()
    .toBuffer();

  const taskbarPng512 = await sharp(masterTaskbarTile).resize(512, 512).png().toBuffer();

  const uncutBase64 = uncutClocheBuffer.toString('base64');
  const taskbarSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="goldRing" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F27E2B" />
      <stop offset="50%" stop-color="#E66817" />
      <stop offset="100%" stop-color="#D9531E" />
    </linearGradient>
    <filter id="tileShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0B253A" flood-opacity="0.2" />
    </filter>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="90" ry="90" fill="#FFFFFF" filter="url(#tileShadow)" />
  <rect x="16" y="16" width="480" height="480" rx="90" ry="90" fill="none" stroke="url(#goldRing)" stroke-width="14" />
  <rect x="26" y="26" width="460" height="460" rx="80" ry="80" fill="none" stroke="#FDBA74" stroke-width="4" opacity="0.6" />
  <!-- Full Uncut Cloche & Hand Emblem -->
  <image href="data:image/png;base64,${uncutBase64}" x="40" y="40" width="432" height="432" preserveAspectRatio="xMidYMid meet" />
</svg>`;

  // -------------------------------------------------------------
  // C. SYNC ASSETS TO WORKSPACE APPS & PACKAGE
  // -------------------------------------------------------------
  const targetDirs = [
    path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'public'),
    path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'dist'),
    path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'public'),
    path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'dist'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'public'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'dist'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'public'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'dist'),
    path.join(ROOT, 'packages', 'ui', 'src', 'assets', 'branding'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'icons'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'pos_app'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'pos_admin_app'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'kiosk_app'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'kiosk_admin_app')
  ];

  targetDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.writeFileSync(path.join(dir, 'favicon.svg'), taskbarSvg);
      fs.writeFileSync(path.join(dir, 'favicon.ico'), desktopIcoBuffer);
      fs.writeFileSync(path.join(dir, 'app-icon.png'), taskbarPng512);
      fs.writeFileSync(path.join(dir, 'icon.png'), masterDesktopTile);
      fs.writeFileSync(path.join(dir, 'icon.ico'), desktopIcoBuffer);
    }
  });

  // -------------------------------------------------------------
  // D. RE-CREATE DESKTOP SHORTCUTS WITH FULL LOGO
  // -------------------------------------------------------------
  const launcherJs = path.join(ROOT, 'tooling', 'local-runtime', 'production_launcher.cjs');
  const nodeExe = 'C:\\Program Files\\nodejs\\node.exe';
  const cmdExe = 'C:\\Windows\\System32\\cmd.exe';

  const desktops = [
    path.join(userHome, 'OneDrive', 'Desktop'),
    path.join(userHome, 'Desktop')
  ];

  const apps = [
    { name: 'JAMANVAAR POS.lnk', target: 'pos', title: 'JAMANVAAR POS' },
    { name: 'JAMANVAAR POS Admin.lnk', target: 'pos-admin', title: 'JAMANVAAR POS Admin' },
    { name: 'JAMANVAAR Kiosk.lnk', target: 'kiosk', title: 'JAMANVAAR Kiosk' },
    { name: 'JAMANVAAR Kiosk Admin.lnk', target: 'kiosk-admin', title: 'JAMANVAAR Kiosk Admin' }
  ];

  const vbsLines = [
    'Set ws = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")'
  ];

  apps.forEach(app => {
    const args = `/c start "" /b "${nodeExe}" "${launcherJs}" ${app.target}`;
    desktops.forEach(d => {
      if (fs.existsSync(d)) {
        const linkPath = path.join(d, app.name);
        vbsLines.push(`If fso.FileExists("${linkPath.replace(/"/g, '""')}") Then fso.DeleteFile "${linkPath.replace(/"/g, '""')}", True`);
        vbsLines.push(`Set s = ws.CreateShortcut("${linkPath.replace(/"/g, '""')}")`);
        vbsLines.push(`s.TargetPath = "${cmdExe.replace(/"/g, '""')}"`);
        vbsLines.push(`s.Arguments = "${args.replace(/"/g, '""')}"`);
        vbsLines.push(`s.WorkingDirectory = "${ROOT.replace(/"/g, '""')}"`);
        vbsLines.push(`s.Description = "${app.title.replace(/"/g, '""')}"`);
        vbsLines.push(`s.WindowStyle = 7`);
        vbsLines.push(`s.IconLocation = "${desktopIcoPath.replace(/"/g, '""')},0"`);
        vbsLines.push(`s.Save`);
      }
    });
  });

  const tempVbs = path.join(__dirname, '_apply_perfect_shortcuts.vbs');
  fs.writeFileSync(tempVbs, vbsLines.join('\r\n'));

  try {
    execSync(`cscript //nologo "${tempVbs}"`);
    console.log('✓ Successfully restored Desktop shortcuts to Full Brand Logo');
  } finally {
    if (fs.existsSync(tempVbs)) fs.unlinkSync(tempVbs);
  }

  // -------------------------------------------------------------
  // E. RESTART EXPLORER
  // -------------------------------------------------------------
  try {
    execSync('powershell -Command "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 400; Start-Process explorer.exe; & ie4uinit.exe -show"');
    console.log('✓ Explorer refreshed.');
  } catch (e) {}
}

deployPerfectIcons().catch(console.error);
