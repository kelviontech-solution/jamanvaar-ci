const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_LOGO = path.join(ROOT, 'packages', 'ui', 'src', 'assets', 'branding', 'jamanvaar-logo.png');

const userHome = process.env.USERPROFILE || 'C:\\Users\\OM Sanjhira';
const targetIconDir = path.join(userHome, '.jamanvaar', 'icons');
const icoPath = path.join(targetIconDir, 'jamanvaar_cloche_v3.ico');

async function deployClocheEmblemIcon() {
  console.log('1. Extracting high-res golden cloche emblem from master logo...');
  if (!fs.existsSync(targetIconDir)) {
    fs.mkdirSync(targetIconDir, { recursive: true });
  }

  // Extract pure cloche + steam + platter + waiter hand
  const clocheBuffer = await sharp(SOURCE_LOGO)
    .extract({ left: 340, top: 0, width: 525, height: 380 })
    .trim()
    .png()
    .toBuffer();

  // Create 1024x1024 solid white tile with luxury saffron-gold frame
  const tileSvg = Buffer.from(`
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="goldRing" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F27E2B" />
          <stop offset="50%" stop-color="#E66817" />
          <stop offset="100%" stop-color="#D9531E" />
        </linearGradient>
        <filter id="tileShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#0B253A" flood-opacity="0.18" />
        </filter>
      </defs>
      <!-- Base Pure Solid White Squircle -->
      <rect x="24" y="24" width="976" height="976" rx="200" ry="200" fill="#FFFFFF" filter="url(#tileShadow)" />
      <!-- Outer Golden Accent Border -->
      <rect x="24" y="24" width="976" height="976" rx="200" ry="200" fill="none" stroke="url(#goldRing)" stroke-width="24" />
      <!-- Inner Subtle Border -->
      <rect x="44" y="44" width="936" height="936" rx="180" ry="180" fill="none" stroke="#FDBA74" stroke-width="8" opacity="0.7" />
    </svg>
  `);

  const tileBg = await sharp(tileSvg).png().toBuffer();

  // Fit cloche prominently inside the white tile
  const resizedCloche = await sharp(clocheBuffer)
    .resize(800, 800, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  const masterTile = await sharp(tileBg)
    .composite([
      {
        input: resizedCloche,
        gravity: 'center'
      }
    ])
    .png()
    .toBuffer();

  // Save preview
  fs.writeFileSync(path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'icons', 'cloche_tile_512.png'), masterTile);

  // 2. Build multi-resolution ICO
  const iconSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  for (const size of iconSizes) {
    const buf = await sharp(masterTile)
      .resize(size, size, { fit: 'contain' })
      .png()
      .toBuffer();
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

  const icoBuffer = Buffer.concat([
    header,
    ...dirEntries,
    ...pngBuffers.map(p => p.buffer)
  ]);

  fs.writeFileSync(icoPath, icoBuffer);
  console.log('2. Wrote golden cloche ICO to:', icoPath);

  // 3. Create Clean SVG Favicon with embedded cloche
  const clocheBase64 = clocheBuffer.toString('base64');
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
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
  <rect x="16" y="16" width="480" height="480" rx="96" ry="96" fill="#FFFFFF" filter="url(#tileShadow)" />
  <rect x="16" y="16" width="480" height="480" rx="96" ry="96" fill="none" stroke="url(#goldRing)" stroke-width="14" />
  <rect x="26" y="26" width="460" height="460" rx="86" ry="86" fill="none" stroke="#FDBA74" stroke-width="4" opacity="0.6" />
  <image href="data:image/png;base64,${clocheBase64}" x="48" y="48" width="416" height="416" preserveAspectRatio="xMidYMid meet" />
</svg>`;

  // 4. Sync favicon.svg, favicon.ico, app-icon.png to all projects
  const p512 = await sharp(masterTile).resize(512, 512).png().toBuffer();
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
      fs.writeFileSync(path.join(dir, 'favicon.svg'), faviconSvg);
      fs.writeFileSync(path.join(dir, 'favicon.ico'), icoBuffer);
      fs.writeFileSync(path.join(dir, 'app-icon.png'), p512);
      fs.writeFileSync(path.join(dir, 'icon.png'), p512);
      fs.writeFileSync(path.join(dir, 'icon.ico'), icoBuffer);
    }
  });

  // 5. Update Desktop Shortcuts
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
        vbsLines.push(`s.IconLocation = "${icoPath.replace(/"/g, '""')},0"`);
        vbsLines.push(`s.Save`);
      }
    });
  });

  const tempVbs = path.join(__dirname, '_apply_cloche_shortcuts.vbs');
  fs.writeFileSync(tempVbs, vbsLines.join('\r\n'));

  try {
    execSync(`cscript //nologo "${tempVbs}"`);
    console.log('3. Updated desktop shortcuts to point to golden cloche emblem icon');
  } finally {
    if (fs.existsSync(tempVbs)) fs.unlinkSync(tempVbs);
  }

  // 6. Refresh explorer
  try {
    execSync('powershell -Command "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 400; Start-Process explorer.exe; & ie4uinit.exe -show"');
    console.log('4. Explorer restarted.');
  } catch (e) {}
}

deployClocheEmblemIcon().catch(console.error);
