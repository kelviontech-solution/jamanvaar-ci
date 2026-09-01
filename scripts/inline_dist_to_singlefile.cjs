/**
 * Single-File Offline Packager:
 * Inlines all JS and CSS into a self-contained index.html with classic non-module <script>
 * Eliminates all CORS / file:/// protocol restrictions permanently!
 * Runs 100% offline with ZERO servers, ZERO background processes.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const apps = [
  { name: 'POS', dist: path.join(ROOT, 'apps', 'restaurant-system', 'pos', 'dist') },
  { name: 'POS Admin', dist: path.join(ROOT, 'apps', 'restaurant-system', 'pos-admin', 'dist') },
  { name: 'Kiosk', dist: path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-user', 'dist') },
  { name: 'Kiosk Admin', dist: path.join(ROOT, 'apps', 'kiosk-system', 'kiosk-admin', 'dist') }
];

function inlineApp(app) {
  const indexHtmlPath = path.join(app.dist, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    console.warn(`[${app.name}] index.html not found in ${app.dist}`);
    return;
  }

  let html = fs.readFileSync(indexHtmlPath, 'utf8');

  // 1. Inline all CSS files
  const cssMatches = [...html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)];
  for (const match of cssMatches) {
    const cssHref = match[1].replace(/^\.\//, '');
    const cssPath = path.join(app.dist, cssHref);
    if (fs.existsSync(cssPath)) {
      const cssContent = fs.readFileSync(cssPath, 'utf8');
      html = html.replace(match[0], `<style>\n${cssContent}\n</style>`);
      console.log(`  [${app.name}] Inlined CSS: ${cssHref}`);
    }
  }

  // 2. Inline all JS files (replace type="module" with classic <script>)
  const scriptMatches = [...html.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)];
  for (const match of scriptMatches) {
    const jsSrc = match[1].replace(/^\.\//, '');
    const jsPath = path.join(app.dist, jsSrc);
    if (fs.existsSync(jsPath)) {
      const jsContent = fs.readFileSync(jsPath, 'utf8');
      html = html.replace(match[0], `<script>\n${jsContent}\n</script>`);
      console.log(`  [${app.name}] Inlined JS: ${jsSrc}`);
    }
  }

  // Remove any remaining type="module" tags
  html = html.replace(/type=["']module["']/g, '');

  fs.writeFileSync(indexHtmlPath, html, 'utf8');
  console.log(`✓ [${app.name}] Created pure offline single-file package: ${indexHtmlPath}`);
}

for (const app of apps) {
  inlineApp(app);
}
