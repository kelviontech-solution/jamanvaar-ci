/**
 * Create EXACT Circular Badge Icon Matching Reference Image:
 * - Outer 3D Orange Ring (#F27E2B to #C24E05)
 * - Inner White Circular Disc (#FFFFFF)
 * - Subtle inner border (#F6E7D8)
 * - Centered Official Brand Logo
 * - Transparent outer background
 * - Multi-resolution ICO (16, 24, 32, 48, 64, 128, 256)
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const GUJARATI_LOGO = path.join(ROOT, 'shared', 'assets', 'branding', 'jamanvaar-logo-gujarati.png');
const ENGLISH_LOGO = path.join(ROOT, 'shared', 'assets', 'branding', 'jamanvaar-logo.png');
const ICONS_DIR = path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'icons');
const OUT_ICO = path.join(ICONS_DIR, 'icon.ico');

async function generateCircularBadgeIcon() {
  console.log('Generating exact circular badge icon matching user reference image...');

  // Use Gujarati logo as seen in user reference image, fallback to English
  const logoPath = fs.existsSync(GUJARATI_LOGO) ? GUJARATI_LOGO : ENGLISH_LOGO;
  console.log('Source logo:', logoPath);

  // 1. Create base 512x512 SVG with the Orange Ring + White Inner Disc
  const baseSvg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="orangeRing" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F27E2B" />
      <stop offset="50%" stop-color="#E66817" />
      <stop offset="100%" stop-color="#C24E05" />
    </linearGradient>
  </defs>
  <!-- Outer Orange Ring -->
  <circle cx="256" cy="256" r="248" fill="url(#orangeRing)" />
  <!-- Inner White Disc -->
  <circle cx="256" cy="256" r="216" fill="#FFFFFF" />
  <!-- Inner Accent Ring -->
  <circle cx="256" cy="256" r="215" fill="none" stroke="#F6E7D8" stroke-width="2" />
</svg>
`;

  const baseBuffer = await sharp(Buffer.from(baseSvg)).png().toBuffer();

  // 2. Resize source logo to fit perfectly inside the white circle (around 330px width, 240px height)
  const resizedLogo = await sharp(logoPath)
    .resize(330, 240, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  // 3. Composite the logo in the center of the white disc
  const master512 = await sharp(baseBuffer)
    .composite([
      {
        input: resizedLogo,
        top: Math.round((512 - 240) / 2),
        left: Math.round((512 - 330) / 2)
      }
    ])
    .png()
    .toBuffer();

  // Save 512x512 master PNGs
  fs.writeFileSync(path.join(ICONS_DIR, 'icon.png'), master512);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon_512x512.png'), master512);
  fs.writeFileSync(path.join(ICONS_DIR, 'circular_badge_512.png'), master512);

  // 4. Generate all icon resolutions for Windows ICO
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of sizes) {
    const buf = await sharp(master512)
      .resize(size, size, { fit: 'contain' })
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer: buf });
  }

  // 5. Assemble standard Windows multi-resolution ICO file
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(count, 4); // count of images

  const dirEntries = [];
  let offset = 6 + count * 16;

  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.size >= 256 ? 0 : item.size, 0); // width (0 = 256)
    entry.writeUInt8(item.size >= 256 ? 0 : item.size, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(item.buffer.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset

    dirEntries.push(entry);
    offset += item.buffer.length;
  }

  const icoBuffer = Buffer.concat([
    header,
    ...dirEntries,
    ...pngBuffers.map(p => p.buffer)
  ]);

  fs.writeFileSync(OUT_ICO, icoBuffer);
  console.log('✓ Successfully created exact circular badge ICO:', OUT_ICO, `(${icoBuffer.length} bytes)`);
}

generateCircularBadgeIcon().catch(console.error);
