const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_LOGO = path.join(ROOT, 'shared', 'ui', 'src', 'assets', 'branding', 'jamanvaar-logo.png');

const userHome = process.env.USERPROFILE || 'C:\\Users\\OM Sanjhira';
const targetIconDir = path.join(userHome, '.jamanvaar', 'icons');
const targetIco = path.join(targetIconDir, 'jamanvaar_app.ico');

async function buildCleanWhiteBadgeIcon() {
  console.log('Generating crisp, high-visibility white-badge brand icon...');
  if (!fs.existsSync(targetIconDir)) {
    fs.mkdirSync(targetIconDir, { recursive: true });
  }

  // 1. Create a 1024x1024 white squircle badge with subtle luxury border
  const badgeSvg = Buffer.from(`
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#0B253A" flood-opacity="0.18"/>
        </filter>
        <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F27E2B"/>
          <stop offset="50%" stop-color="#EAB308"/>
          <stop offset="100%" stop-color="#D9531E"/>
        </linearGradient>
      </defs>
      <!-- Base Crisp White Rounded Squircle -->
      <rect x="32" y="32" width="960" height="960" rx="220" ry="220" fill="#FFFFFF" filter="url(#shadow)"/>
      <rect x="32" y="32" width="960" height="960" rx="220" ry="220" fill="none" stroke="url(#borderGrad)" stroke-width="12" opacity="0.85"/>
      <rect x="44" y="44" width="936" height="936" rx="208" ry="208" fill="none" stroke="#F4EFE6" stroke-width="4"/>
    </svg>
  `);

  const badgeBg = await sharp(badgeSvg).png().toBuffer();

  // 2. Resize the logo to fit perfectly inside the white badge
  const logoForeground = await sharp(SOURCE_LOGO)
    .resize(820, 820, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  // 3. Composite logo onto the clean white squircle badge
  const masterBadge = await sharp(badgeBg)
    .composite([
      {
        input: logoForeground,
        gravity: 'center'
      }
    ])
    .png()
    .toBuffer();

  const iconSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of iconSizes) {
    const buf = await sharp(masterBadge)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer: buf });
  }

  // 4. Assemble Windows .ICO structure
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(count, 4); // number of images

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

  fs.writeFileSync(targetIco, icoBuffer);
  console.log('✓ Wrote high-contrast white-badge ICO to:', targetIco);

  // Sync to all workspace icon dirs
  const projectIcos = [
    path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'src-tauri', 'icons', 'icon.ico'),
    path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'src-tauri', 'icons', 'icon.ico'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'src-tauri', 'icons', 'icon.ico'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'src-tauri', 'icons', 'icon.ico'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'icons', 'icon.ico'),
    path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'public', 'favicon.ico'),
    path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'public', 'favicon.ico'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'public', 'favicon.ico'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'public', 'favicon.ico')
  ];

  projectIcos.forEach(p => {
    if (fs.existsSync(path.dirname(p))) {
      fs.writeFileSync(p, icoBuffer);
    }
  });

  // Re-save 512x512 preview
  const p512 = await sharp(masterBadge).resize(512, 512).png().toBuffer();
  fs.writeFileSync(path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'icons', 'icon.png'), p512);
  fs.writeFileSync(path.join(targetIconDir, 'icon.png'), p512);

  // 5. Recreate shortcuts
  const launcherJs = path.join(ROOT, 'scripts', 'production_launcher.cjs');
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
        vbsLines.push(`s.IconLocation = "${targetIco.replace(/"/g, '""')},0"`);
        vbsLines.push(`s.Save`);
      }
    });
  });

  const tempVbs = path.join(__dirname, '_apply_white_badge.vbs');
  fs.writeFileSync(tempVbs, vbsLines.join('\r\n'));

  try {
    execSync(`cscript //nologo "${tempVbs}"`);
    console.log('✓ Recreated all desktop shortcuts');
  } finally {
    if (fs.existsSync(tempVbs)) fs.unlinkSync(tempVbs);
  }

  // 6. Restart explorer to force refresh
  try {
    execSync('powershell -Command "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500; Start-Process explorer.exe; & ie4uinit.exe -show"');
    console.log('✓ Explorer refreshed!');
  } catch (e) {}
}

buildCleanWhiteBadgeIcon().catch(console.error);
