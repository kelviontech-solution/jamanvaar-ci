const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_LOGO = path.join(ROOT, 'packages', 'ui', 'src', 'assets', 'branding', 'jamanvaar-logo.png');

const userHome = process.env.USERPROFILE || 'C:\\Users\\OM Sanjhira';
const targetIconDir = path.join(userHome, '.jamanvaar', 'icons');
const versionTag = 'v_' + Date.now();
const targetIco = path.join(targetIconDir, `jamanvaar_white_${versionTag}.ico`);
const targetPng = path.join(targetIconDir, `jamanvaar_white_${versionTag}.png`);

async function buildSolidWhiteAppIcon() {
  console.log('Generating crisp solid-white app tile icon with unique path:', targetIco);
  if (!fs.existsSync(targetIconDir)) {
    fs.mkdirSync(targetIconDir, { recursive: true });
  }

  // 1. Create 1024x1024 solid pure white background with subtle warm gold border
  const badgeSvg = Buffer.from(`
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="1024" rx="160" ry="160" fill="#FFFFFF"/>
      <rect x="12" y="12" width="1000" height="1000" rx="150" ry="150" fill="none" stroke="#E66817" stroke-width="24"/>
      <rect x="28" y="28" width="968" height="968" rx="136" ry="136" fill="none" stroke="#FDBA74" stroke-width="8"/>
    </svg>
  `);

  const bg = await sharp(badgeSvg).png().toBuffer();

  // 2. Resize the logo foreground
  const logo = await sharp(SOURCE_LOGO)
    .resize(860, 860, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  // 3. Composite logo onto the solid white background
  const master = await sharp(bg)
    .composite([
      {
        input: logo,
        gravity: 'center'
      }
    ])
    .png()
    .toBuffer();

  fs.writeFileSync(targetPng, master);

  // 4. Generate multi-resolution PNG buffers
  const iconSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of iconSizes) {
    const buf = await sharp(master)
      .resize(size, size, { fit: 'contain' })
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer: buf });
  }

  // 5. Build Windows ICO binary
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO type
  header.writeUInt16LE(count, 4); // image count

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
  console.log('✓ Successfully wrote fresh unique ICO file:', targetIco);

  // 6. Delete and Recreate Desktop Shortcuts pointing to the new unique ICO file
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
        vbsLines.push(`s.IconLocation = "${targetIco.replace(/"/g, '""')},0"`);
        vbsLines.push(`s.Save`);
      }
    });
  });

  const tempVbs = path.join(__dirname, '_force_fresh_shortcuts.vbs');
  fs.writeFileSync(tempVbs, vbsLines.join('\r\n'));

  try {
    execSync(`cscript //nologo "${tempVbs}"`);
    console.log('✓ Successfully created fresh desktop shortcuts with new icon target');
  } finally {
    if (fs.existsSync(tempVbs)) fs.unlinkSync(tempVbs);
  }

  // 7. Force Windows Explorer to restart and re-index icons
  try {
    execSync('powershell -Command "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 400; Start-Process explorer.exe; & ie4uinit.exe -show"');
    console.log('✓ Explorer refreshed!');
  } catch (e) {}
}

buildSolidWhiteAppIcon().catch(console.error);
