/**
 * JAMANVAAR Brand Asset & Desktop Icon Preparer
 * Extracts the crisp proper logo from jamanvaar2.png, generates transparent base64 data URIs,
 * copies PNG assets to all 6 apps, generates circular 3D desktop icons with orange ring,
 * and creates multi-resolution Windows ICO packages.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let LOGO_SOURCE_PATH = path.join(ROOT_DIR, 'shared', 'assets', 'artwork', 'jamanvaar-master-english.png');
if (!fs.existsSync(LOGO_SOURCE_PATH)) {
  LOGO_SOURCE_PATH = path.join(ROOT_DIR, 'jamanvaar2.png');
}

console.log('🚀 Extracting clean proper logo from master artwork...');

// 1. Run PowerShell extractor on Windows
try {
  const psScript = path.join(ROOT_DIR, 'scripts', 'extract_clean_master_logos.ps1');
  execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}"`, {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
} catch (err) {
  console.warn('⚠️ PowerShell extractor warning, falling back to direct asset sync.');
}

// 2. Generate circular SVG favicon
const extractedLogoPath = path.join(ROOT_DIR, 'shared', 'assets', 'branding', 'jamanvaar-logo.png');
const targetBuffer = fs.existsSync(extractedLogoPath) ? fs.readFileSync(extractedLogoPath) : fs.readFileSync(LOGO_SOURCE_PATH);
const base64Png = `data:image/png;base64,${targetBuffer.toString('base64')}`;

const circularSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="orangeRing" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F27E2B" />
      <stop offset="50%" stop-color="#E66817" />
      <stop offset="100%" stop-color="#C24E05" />
    </linearGradient>
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#E66817" flood-opacity="0.25" />
    </filter>
  </defs>
  <!-- Outer Circular 3D Ring -->
  <circle cx="256" cy="256" r="240" fill="url(#orangeRing)" filter="url(#softShadow)" />
  <!-- Inner White Disc -->
  <circle cx="256" cy="256" r="212" fill="#FFFFFF" />
  <!-- Inner Subtle Accent Border -->
  <circle cx="256" cy="256" r="211" fill="none" stroke="#F6E7D8" stroke-width="2" />
  <!-- Center Embedded Master Brand Logo -->
  <image href="${base64Png}" x="86" y="86" width="340" height="340" preserveAspectRatio="xMidYMid meet" />
</svg>`;

const PUBLIC_FAVICONS = [
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'pos', 'public', 'favicon.svg'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'pos-admin', 'public', 'favicon.svg'),
  path.join(ROOT_DIR, 'apps', 'kiosk-system', 'kiosk-user', 'public', 'favicon.svg'),
  path.join(ROOT_DIR, 'apps', 'kiosk-system', 'kiosk-admin', 'public', 'favicon.svg'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'captain', 'public', 'favicon.svg'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'kds', 'public', 'favicon.svg')
];

for (const fav of PUBLIC_FAVICONS) {
  const dir = path.dirname(fav);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fav, circularSvg, 'utf-8');
}

console.log('🎉 Brand assets, proper logo extraction & desktop icons preparation complete!');
