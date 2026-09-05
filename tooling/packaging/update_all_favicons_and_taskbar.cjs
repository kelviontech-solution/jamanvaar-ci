const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_LOGO = path.join(ROOT, 'packages', 'ui', 'src', 'assets', 'branding', 'jamanvaar-logo.png');

async function updateAllFaviconsAndTaskbar() {
  console.log('1. Reading clean master brand logo...');
  const logoBuffer = fs.readFileSync(SOURCE_LOGO);
  const logoBase64 = logoBuffer.toString('base64');

  // Create clean modern SVG favicon with crisp white badge and saffron-gold border
  const cleanFaviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="goldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F27E2B" />
      <stop offset="50%" stop-color="#E66817" />
      <stop offset="100%" stop-color="#D9531E" />
    </linearGradient>
    <filter id="tileShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0B253A" flood-opacity="0.2" />
    </filter>
  </defs>
  <!-- High Contrast Solid White Rounded Tile -->
  <rect x="16" y="16" width="480" height="480" rx="90" ry="90" fill="#FFFFFF" filter="url(#tileShadow)" />
  <rect x="16" y="16" width="480" height="480" rx="90" ry="90" fill="none" stroke="url(#goldBorder)" stroke-width="12" />
  <rect x="24" y="24" width="464" height="464" rx="82" ry="82" fill="none" stroke="#FDBA74" stroke-width="4" opacity="0.6" />
  <!-- Exact Master Brand Logo Foreground (Cloche + JAMANVAAR + by KELVIONTECH) -->
  <image href="data:image/png;base64,${logoBase64}" x="40" y="40" width="432" height="432" preserveAspectRatio="xMidYMid meet" />
</svg>`;

  // 2. Build multi-resolution ICO from this clean white badge
  const masterBadgePng = await sharp(Buffer.from(cleanFaviconSvg))
    .resize(1024, 1024)
    .png()
    .toBuffer();

  const iconSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  for (const size of iconSizes) {
    const buf = await sharp(masterBadgePng).resize(size, size).png().toBuffer();
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

  const cleanIcoBuffer = Buffer.concat([
    header,
    ...dirEntries,
    ...pngBuffers.map(p => p.buffer)
  ]);

  const p512 = await sharp(masterBadgePng).resize(512, 512).png().toBuffer();

  // 3. Write to all target locations
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
      fs.writeFileSync(path.join(dir, 'favicon.svg'), cleanFaviconSvg);
      fs.writeFileSync(path.join(dir, 'favicon.ico'), cleanIcoBuffer);
      fs.writeFileSync(path.join(dir, 'app-icon.png'), p512);
      fs.writeFileSync(path.join(dir, 'icon.png'), p512);
    }
  });

  // Write permanent user icon
  const userHome = process.env.USERPROFILE || 'C:\\Users\\OM Sanjhira';
  const permanentIcoPath = path.join(userHome, '.jamanvaar', 'icons', 'jamanvaar_app_live.ico');
  if (!fs.existsSync(path.dirname(permanentIcoPath))) {
    fs.mkdirSync(path.dirname(permanentIcoPath), { recursive: true });
  }
  fs.writeFileSync(permanentIcoPath, cleanIcoBuffer);
  console.log('✓ Wrote clean live favicon and ICO assets everywhere');

  // 4. Purge old Edge PWA profiles so Edge rebuilds taskbar icons from the new favicon
  const profilesDir = path.join(userHome, '.jamanvaar', 'profiles');
  if (fs.existsSync(profilesDir)) {
    try {
      console.log('Cleaning old cached browser app profiles in:', profilesDir);
      fs.rmSync(profilesDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Could not remove all profile files (in use):', e.message);
    }
  }

  // 5. Rebuild shortcuts to point to jamanvaar_app_live.ico
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
        vbsLines.push(`s.IconLocation = "${permanentIcoPath.replace(/"/g, '""')},0"`);
        vbsLines.push(`s.Save`);
      }
    });
  });

  const tempVbs = path.join(__dirname, '_update_live_shortcuts.vbs');
  fs.writeFileSync(tempVbs, vbsLines.join('\r\n'));

  try {
    execSync(`cscript //nologo "${tempVbs}"`);
    console.log('✓ Successfully recreated all desktop shortcuts');
  } finally {
    if (fs.existsSync(tempVbs)) fs.unlinkSync(tempVbs);
  }

  // 6. Refresh explorer icon cache
  try {
    execSync('powershell -Command "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 400; Start-Process explorer.exe; & ie4uinit.exe -show"');
    console.log('✓ Explorer refreshed!');
  } catch (e) {}
}

updateAllFaviconsAndTaskbar().catch(console.error);
