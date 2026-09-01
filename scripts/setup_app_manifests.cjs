const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// 1. Create manifests for all 4 apps
const apps = [
  { name: 'JAMANVAAR POS', short: 'JAMANVAAR POS', target: 'pos', path: path.join(ROOT, 'apps', 'restaurant-system', 'pos') },
  { name: 'JAMANVAAR POS Admin', short: 'POS Admin', target: 'pos-admin', path: path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin') },
  { name: 'JAMANVAAR Kiosk', short: 'JAMANVAAR Kiosk', target: 'kiosk', path: path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user') },
  { name: 'JAMANVAAR Kiosk Admin', short: 'Kiosk Admin', target: 'kiosk-admin', path: path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin') }
];

apps.forEach(app => {
  const manifest = {
    name: app.name,
    short_name: app.short,
    start_url: `/${app.target}/`,
    display: "standalone",
    background_color: "#FAF8F5",
    theme_color: "#0B253A",
    icons: [
      {
        src: "/app-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/favicon.ico",
        sizes: "16x16 24x24 32x32 48x48 64x64 128x128 256x256",
        type: "image/x-icon"
      }
    ]
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  const dirs = [
    path.join(app.path, 'public'),
    path.join(app.path, 'dist'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', `${app.target.replace('-', '_')}_app`)
  ];

  dirs.forEach(d => {
    if (fs.existsSync(d)) {
      fs.writeFileSync(path.join(d, 'manifest.json'), manifestJson);
      fs.writeFileSync(path.join(d, 'manifest.webmanifest'), manifestJson);
    }
  });

  // Inject manifest and favicon links into index.html files
  const indexFiles = [
    path.join(app.path, 'index.html'),
    path.join(app.path, 'dist', 'index.html'),
    path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', `${app.target.replace('-', '_')}_app`, 'index.html')
  ];

  indexFiles.forEach(f => {
    if (fs.existsSync(f)) {
      let html = fs.readFileSync(f, 'utf8');
      if (!html.includes('rel="manifest"')) {
        html = html.replace('<head>', '<head>\n    <link rel="manifest" href="manifest.json" />\n    <link rel="icon" type="image/x-icon" href="/favicon.ico" />\n    <link rel="apple-touch-icon" href="/app-icon.png" />');
      }
      fs.writeFileSync(f, html);
    }
  });
});

console.log('✓ Created manifests and updated index.html for all 4 apps.');
