import { generateQrMatrix } from './qrcode';

/**
 * Renders `text` as an ESC/POS raster bitmap (GS v 0), not the printer's own built-in QR
 * command (GS ( k). The raster path is supported by essentially every ESC/POS-compatible
 * printer, including the cheap clones that implement GS ( k incorrectly or not at all; a raw
 * bitmap of black/white pixels has no firmware-specific QR logic for a clone to get wrong.
 */
export function escPosQrBitmapBytes(text: string, moduleSize = 6): Uint8Array {
  const modules = generateQrMatrix(text);
  const quietZone = 3; // modules of white border a scanner needs around the finder patterns
  const gridSize = modules.length + quietZone * 2;
  const pixelsPerSide = gridSize * moduleSize;
  const bytesPerRow = Math.ceil(pixelsPerSide / 8);

  const isDark = (px: number, py: number): boolean => {
    const moduleX = Math.floor(px / moduleSize) - quietZone;
    const moduleY = Math.floor(py / moduleSize) - quietZone;
    if (moduleX < 0 || moduleY < 0 || moduleX >= modules.length || moduleY >= modules.length) return false;
    return modules[moduleY][moduleX];
  };

  const imageBytes = new Uint8Array(bytesPerRow * pixelsPerSide);
  for (let y = 0; y < pixelsPerSide; y++) {
    for (let xByte = 0; xByte < bytesPerRow; xByte++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xByte * 8 + bit;
        if (x < pixelsPerSide && isDark(x, y)) byte |= 0x80 >> bit;
      }
      imageBytes[y * bytesPerRow + xByte] = byte;
    }
  }

  // GS v 0 m xL xH yL yH d1...dk -- m=0 (normal density), width/height as little-endian 16-bit byte/pixel counts.
  const header = new Uint8Array([
    0x1d, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    pixelsPerSide & 0xff, (pixelsPerSide >> 8) & 0xff
  ]);

  const out = new Uint8Array(header.length + imageBytes.length);
  out.set(header, 0);
  out.set(imageBytes, header.length);
  return out;
}
