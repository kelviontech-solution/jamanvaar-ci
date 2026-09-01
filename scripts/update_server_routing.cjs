/**
 * Update local_service.cjs to serve all 4 frontend applications cleanly:
 * - /pos -> POS Billing App
 * - /pos-admin -> POS Admin App
 * - /kiosk -> Customer Kiosk App
 * - /kiosk-admin -> Kiosk Admin App
 */

const fs = require('fs');
const path = require('path');

const SERVER_FILE = path.join(__dirname, 'local_service.cjs');
const PKG_SERVER_FILE = path.join(__dirname, '..', 'JAMANVAAR_DESKTOP_PACKAGE', 'server', 'local_service.cjs');

function updateServer(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Ensure routing for /pos, /pos-admin, /kiosk, /kiosk-admin
  const routerCode = `
  // --- STATIC WEB APP FILE SERVER (POS, POS Admin, Kiosk, Kiosk Admin) ---
  const serveStatic = (baseDir, subPath) => {
    let filePath = path.join(baseDir, subPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(baseDir, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Static build not found.');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  };

  const getDir = (folderName, altDist) => {
    const p1 = path.join(__dirname, '..', folderName);
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(__dirname, '..', 'apps', altDist, 'dist');
    if (fs.existsSync(p2)) return p2;
    return p1;
  };

  const posDir = getDir('pos_app', 'restaurant-system/pos');
  const posAdminDir = getDir('pos_admin_app', 'restaurant-system/pos-admin');
  const kioskDir = getDir('kiosk_app', 'kiosk-system/kiosk-user');
  const kioskAdminDir = getDir('kiosk_admin_app', 'kiosk-system/kiosk-admin');

  if (pathname === '/pos') { res.writeHead(302, { Location: '/pos/' }); res.end(); return; }
  if (pathname === '/admin' || pathname === '/pos-admin') { res.writeHead(302, { Location: '/pos-admin/' }); res.end(); return; }
  if (pathname === '/kiosk') { res.writeHead(302, { Location: '/kiosk/' }); res.end(); return; }
  if (pathname === '/kiosk-admin') { res.writeHead(302, { Location: '/kiosk-admin/' }); res.end(); return; }

  if (pathname.startsWith('/pos/')) {
    return serveStatic(posDir, pathname.replace(/^\\/pos\\//, '') || 'index.html');
  }
  if (pathname.startsWith('/pos-admin/')) {
    return serveStatic(posAdminDir, pathname.replace(/^\\/pos-admin\\//, '') || 'index.html');
  }
  if (pathname.startsWith('/kiosk/')) {
    return serveStatic(kioskDir, pathname.replace(/^\\/kiosk\\//, '') || 'index.html');
  }
  if (pathname.startsWith('/kiosk-admin/')) {
    return serveStatic(kioskAdminDir, pathname.replace(/^\\/kiosk-admin\\//, '') || 'index.html');
  }

  if (pathname.startsWith('/assets/')) {
    const sub = pathname.replace(/^\\//, '');
    for (const d of [posDir, posAdminDir, kioskDir, kioskAdminDir]) {
      if (fs.existsSync(path.join(d, sub))) return serveStatic(d, sub);
    }
    return serveStatic(posDir, sub);
  }
`;

  // Replace old serveStatic block if present
  if (content.includes('// --- STATIC WEB APP FILE SERVER')) {
    const parts = content.split('// --- STATIC WEB APP FILE SERVER');
    const rest = parts[1].substring(parts[1].indexOf('// Root Landing Page'));
    content = parts[0] + routerCode + '\n  ' + rest;
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓ Updated static router in:', filePath);
}

if (fs.existsSync(SERVER_FILE)) updateServer(SERVER_FILE);
if (fs.existsSync(PKG_SERVER_FILE)) updateServer(PKG_SERVER_FILE);
