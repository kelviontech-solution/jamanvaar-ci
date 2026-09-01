const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_LOGO = path.join(ROOT, 'shared', 'ui', 'src', 'assets', 'branding', 'jamanvaar-logo.png');

const userHome = process.env.USERPROFILE || 'C:\\Users\\OM Sanjhira';
const targetIconDir = path.join(userHome, '.jamanvaar', 'icons');
const targetIco = path.join(targetIconDir, 'jamanvaar_app.ico');

async function deployIcon() {
  console.log('1. Reading master logo from:', SOURCE_LOGO);
  if (!fs.existsSync(targetIconDir)) {
    fs.mkdirSync(targetIconDir, { recursive: true });
  }

  // Create a 1024x1024 high-res master square canvas with transparent padding
  const masterPng = await sharp(SOURCE_LOGO)
    .resize(960, 960, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .extend({
      top: 32,
      bottom: 32,
      left: 32,
      right: 32,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  const iconSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of iconSizes) {
    const buf = await sharp(masterPng)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer: buf });
  }

  // Assemble Windows .ICO structure
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
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(item.buffer.length, 8); // data size
    entry.writeUInt32LE(offset, 12); // data offset

    dirEntries.push(entry);
    offset += item.buffer.length;
  }

  const icoBuffer = Buffer.concat([
    header,
    ...dirEntries,
    ...pngBuffers.map(p => p.buffer)
  ]);

  fs.writeFileSync(targetIco, icoBuffer);
  console.log('2. Wrote clean brand ICO to:', targetIco, `(${icoBuffer.length} bytes)`);

  // Copy to project locations
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

  // Recreate Windows Desktop Shortcuts with correct VBS escaping
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
        // Note: in VBScript string literals, double quotes are escaped by "", backslashes are NOT escaped
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

  const tempVbs = path.join(__dirname, '_apply_shortcuts.vbs');
  fs.writeFileSync(tempVbs, vbsLines.join('\r\n'));

  try {
    execSync(`cscript //nologo "${tempVbs}"`);
    console.log('3. Successfully recreated all 4 desktop shortcuts pointing to:', targetIco);
  } finally {
    if (fs.existsSync(tempVbs)) fs.unlinkSync(tempVbs);
  }

  // Refresh icon cache
  try {
    execSync('ie4uinit.exe -show', { stdio: 'ignore' });
  } catch (e) {}

  console.log('4. Done!');
}

deployIcon().catch(console.error);
