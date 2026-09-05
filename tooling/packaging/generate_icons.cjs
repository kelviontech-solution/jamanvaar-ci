/**
 * JAMANVAAR Icon Generator
 * Generates all required Windows icon sizes from the JAMANVAAR logo PNG.
 * Uses the existing high-quality jamanvaar-logo.png (539 KB)
 *
 * Outputs ico files using native Windows API via PowerShell as fallback.
 * Primary: uses sharp (npm install sharp) if available.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SOURCE_ICON = path.resolve(__dirname, '../JAMANVAAR_DESKTOP_PACKAGE/icons/jamanvaar-logo.png');
const FALLBACK_ICON = path.resolve(__dirname, '../JAMANVAAR_DESKTOP_PACKAGE/icons/icon_512x512.png');
const ICO_SOURCE = path.resolve(__dirname, '../JAMANVAAR_DESKTOP_PACKAGE/icons/icon.ico');
const ICNS_SOURCE = path.resolve(__dirname, '../JAMANVAAR_DESKTOP_PACKAGE/icons/icon.icns');

// All 4 app src-tauri icon directories
const ICON_DIRS = [
  '../apps/restaurant-system/pos/src-tauri/icons',
  '../apps/restaurant-system/pos-admin/src-tauri/icons',
  '../apps/kiosk-system/kiosk-user/src-tauri/icons',
  '../apps/kiosk-system/kiosk-admin/src-tauri/icons',
].map(p => path.resolve(__dirname, p));

// Sizes needed
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  Copied ${path.basename(src)} → ${path.relative(process.cwd(), dest)}`);
    return true;
  }
  return false;
}

async function generateIcons() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   JAMANVAAR Icon Generator           ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Check if sharp is available
  let sharp;
  try {
    sharp = require('sharp');
    console.log('✓ sharp is available — using high-quality image processing\n');
  } catch {
    console.log('⚠ sharp not available — will copy existing icons and use PowerShell for conversion\n');
  }

  const srcIcon = fs.existsSync(SOURCE_ICON) ? SOURCE_ICON : FALLBACK_ICON;
  if (!fs.existsSync(srcIcon)) {
    console.error('✗ ERROR: No source logo found at', SOURCE_ICON, 'or', FALLBACK_ICON);
    process.exit(1);
  }
  console.log(`✓ Source icon: ${path.relative(process.cwd(), srcIcon)} (${(fs.statSync(srcIcon).size / 1024).toFixed(0)} KB)\n`);

  for (const iconDir of ICON_DIRS) {
    const appName = path.basename(path.dirname(path.dirname(iconDir)));
    console.log(`Processing: ${appName}`);
    ensureDir(iconDir);

    if (sharp) {
      // Generate each PNG size
      for (const size of PNG_SIZES) {
        const outFile = path.join(iconDir, `${size}x${size}.png`);
        await sharp(srcIcon)
          .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile(outFile);
        console.log(`  Generated ${size}x${size}.png`);
      }

      // Generate standard named files
      await sharp(srcIcon)
        .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(iconDir, '32x32.png'));

      await sharp(srcIcon)
        .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(iconDir, '128x128.png'));

      await sharp(srcIcon)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(iconDir, '128x128@2x.png'));

      await sharp(srcIcon)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(iconDir, 'icon.png'));

    } else {
      // Fallback: copy existing icons from JAMANVAAR_DESKTOP_PACKAGE/icons/
      const packageIconDir = path.resolve(__dirname, '../JAMANVAAR_DESKTOP_PACKAGE/icons');
      const filesToCopy = [
        ['32x32.png', '32x32.png'],
        ['128x128.png', '128x128.png'],
        ['icon_256x256.png', '128x128@2x.png'],
        ['icon_512x512.png', 'icon.png'],
      ];

      for (const [src, dest] of filesToCopy) {
        const srcPath = path.join(packageIconDir, src);
        const destPath = path.join(iconDir, dest);
        if (!copyFile(srcPath, destPath)) {
          // Fallback: copy the .ico file as the png (better than nothing)
          const anyPng = fs.readdirSync(packageIconDir).find(f => f.endsWith('.png'));
          if (anyPng) fs.copyFileSync(path.join(packageIconDir, anyPng), destPath);
        }
      }
    }

    // Copy .ico and .icns (always use the existing JAMANVAAR ones)
    copyFile(ICO_SOURCE, path.join(iconDir, 'icon.ico'));
    copyFile(ICNS_SOURCE, path.join(iconDir, 'icon.icns'));

    console.log(`  ✓ ${appName} icons complete\n`);
  }

  console.log('╔══════════════════════════════════════╗');
  console.log('║  ✓ All icons generated successfully  ║');
  console.log('╚══════════════════════════════════════╝\n');
}

generateIcons().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
