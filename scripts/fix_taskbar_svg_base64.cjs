const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_LOGO = path.join(ROOT, 'shared', 'ui', 'src', 'assets', 'branding', 'jamanvaar-logo.png');

async function fixAllTaskbarSvgAndProfiles() {
  console.log('1. Extracting clean, uncut golden cloche + waiter hand...');
  
  // Clean extraction: full cloche dome, steam, platter, and full hand with pointed sleeve
  const clocheBuffer = await sharp(SOURCE_LOGO)
    .extract({ left: 310, top: 0, width: 580, height: 424 })
    .png()
    .toBuffer();

  const clocheBase64 = clocheBuffer.toString('base64');
  console.log('Cloche Base64 generated, length:', clocheBase64.length);

  // SVG Favicon with high contrast white tile, luxury saffron border and centered cloche
  const cleanSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
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
  <rect x="16" y="16" width="480" height="480" rx="90" ry="90" fill="none" stroke="url(#goldRing)" stroke-width="16" />
  <rect x="28" y="28" width="456" height="456" rx="78" ry="78" fill="none" stroke="#FDBA74" stroke-width="4" opacity="0.6" />
  <!-- Pure Uncut Cloche Dome & Hand Emblem -->
  <image href="data:image/png;base64,${clocheBase64}" x="48" y="48" width="416" height="416" preserveAspectRatio="xMidYMid meet" />
</svg>`;

  // 2. Render 512x512 and 1024x1024 PNG from this SVG
  const p512 = await sharp(Buffer.from(cleanSvg)).resize(512, 512).png().toBuffer();

  // Multi-resolution ICO
  const iconSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  for (const size of iconSizes) {
    const buf = await sharp(p512).resize(size, size).png().toBuffer();
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

  const clocheIcoBuffer = Buffer.concat([header, ...dirEntries, ...pngBuffers.map(p => p.buffer)]);

  // 3. Write to every single public/dist/package directory
  const targetDirs = [
    path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'public'),
    path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'dist'),
    path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'public'),
    path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'dist'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'public'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'dist'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'public'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'dist'),
    path.join(ROOT, 'shared', 'ui', 'src', 'assets', 'branding'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'icons'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'pos_app'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'pos_admin_app'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'kiosk_app'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'kiosk_admin_app')
  ];

  targetDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.writeFileSync(path.join(dir, 'favicon.svg'), cleanSvg);
      fs.writeFileSync(path.join(dir, 'app-icon.png'), p512);
      fs.writeFileSync(path.join(dir, 'icon.png'), p512);
      fs.writeFileSync(path.join(dir, 'favicon.ico'), clocheIcoBuffer);
    }
  });

  console.log('✓ Overwrote favicon.svg and app-icon.png in all dist & public folders');

  // 4. Update index.html files to point explicitly to /favicon.svg with timestamp version
  const indexFiles = [
    path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'index.html'),
    path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'dist', 'index.html'),
    path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'index.html'),
    path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'dist', 'index.html'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'index.html'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'dist', 'index.html'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'index.html'),
    path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'dist', 'index.html'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'pos_app', 'index.html'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'pos_admin_app', 'index.html'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'kiosk_app', 'index.html'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'kiosk_admin_app', 'index.html')
  ];

  const vTag = Date.now();
  indexFiles.forEach(f => {
    if (fs.existsSync(f)) {
      let html = fs.readFileSync(f, 'utf8');
      // replace all favicon links
      html = html.replace(/<link rel="icon"[^>]*>/g, '');
      html = html.replace(/<link rel="apple-touch-icon"[^>]*>/g, '');
      html = html.replace(/<link rel="manifest"[^>]*>/g, '');
      html = html.replace('<head>', `<head>\n    <link rel="manifest" href="/manifest.json?v=${vTag}" />\n    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=${vTag}" />\n    <link rel="apple-touch-icon" href="/app-icon.png?v=${vTag}" />`);
      fs.writeFileSync(f, html);
    }
  });

  // 5. Update production launcher to use fresh app-id and profile folder
  const launcherPath = path.join(ROOT, 'scripts', 'production_launcher.cjs');
  let launcherContent = fs.readFileSync(launcherPath, 'utf8');
  launcherContent = launcherContent.replace(/--app-id=[^\s']+/g, `--app-id=jamanvaar_\${target}_v4`);
  launcherContent = launcherContent.replace(/profiles', target\)/g, `profiles_v4', target)`);
  fs.writeFileSync(launcherPath, launcherContent);

  // 6. Delete old browser profile caches
  const userHome = process.env.USERPROFILE || 'C:\\Users\\OM Sanjhira';
  const oldProfiles = path.join(userHome, '.jamanvaar', 'profiles');
  if (fs.existsSync(oldProfiles)) {
    try { fs.rmSync(oldProfiles, { recursive: true, force: true }); } catch (e) {}
  }

  // 7. Restart explorer
  try {
    execSync('powershell -Command "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 400; Start-Process explorer.exe; & ie4uinit.exe -show"');
  } catch (e) {}

  console.log('✓ All taskbar icons and profiles refreshed successfully!');
}

fixAllTaskbarSvgAndProfiles().catch(console.error);
