/**
 * Generate Perfect Multi-Resolution Windows ICO from the exact site logo
 * (Cloche + Jamanvaar + by KELVIONTECH)
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_LOGO = path.join(ROOT, 'packages', 'assets', 'branding', 'jamanvaar-logo.png');
const ICONS_DIR = path.join(ROOT, 'JAMANVAAR_DESKTOP_PACKAGE', 'icons');
const OUT_ICO = path.join(ICONS_DIR, 'icon.ico');

async function buildIco() {
  console.log('Generating multi-resolution .ico from:', SOURCE_LOGO);

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of sizes) {
    // Fit the logo into a square canvas with transparent padding, keeping aspect ratio intact
    const buf = await sharp(SOURCE_LOGO)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();

    pngBuffers.push({ size, buffer: buf });
  }

  // Create ICO header & directory structure
  // Header: 2 bytes reserved (0), 2 bytes type (1 = icon), 2 bytes count
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = 6 + count * 16;

  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.size >= 256 ? 0 : item.size, 0); // width (0 = 256)
    entry.writeUInt8(item.size >= 256 ? 0 : item.size, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(item.buffer.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data

    dirEntries.push(entry);
    offset += item.buffer.length;
  }

  const icoBuffer = Buffer.concat([
    header,
    ...dirEntries,
    ...pngBuffers.map(p => p.buffer)
  ]);

  fs.writeFileSync(OUT_ICO, icoBuffer);
  console.log('✓ Successfully created multi-resolution ICO:', OUT_ICO, `(${icoBuffer.length} bytes)`);

  // Also update icon.png (512x512)
  const p512 = await sharp(SOURCE_LOGO)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(ICONS_DIR, 'icon.png'), p512);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon_512x512.png'), p512);
}

buildIco().catch(console.error);
