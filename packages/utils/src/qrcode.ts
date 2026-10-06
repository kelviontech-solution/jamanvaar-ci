/**
 * JAMANVAAR QR Code Generator.
 *
 * Previously a hand-rolled ISO/IEC 18004 encoder (Reed-Solomon, masking and module
 * placement implemented from scratch, no decode test ever existed for it). Verified against
 * a trusted reference encoder (see tests/qr_code_generation.test.ts) and found to place the
 * wrong bit in 10-30% of modules for every input tried, including the format-information
 * strip next to the finder pattern -- the printed/downloaded/on-screen codes looked like a
 * QR code but did not reliably decode on a phone camera. Replaced with the `qrcode` package
 * (pure JS, no native/network dependency, so the "works fully offline" requirement this file
 * exists for still holds) as the one piece doing the actual ISO 18004 encoding; this module
 * keeps the same exported shape every caller already uses.
 */
import QRCode from 'qrcode';

export interface QrCodeOptions {
  color?: string; // QR code foreground color (default: '#0B253A')
  backgroundColor?: string; // Background color (default: '#FFFFFF')
  margin?: number; // Quiet zone module count (default: 3)
  size?: number; // Output SVG width/height in px (default: 240)
  title?: string; // Accessible title
}

/** The scannable module grid for `text` (true = dark module), at the lowest QR version that fits it. */
export function generateQrMatrix(text: string): boolean[][] {
  const code = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const { size, data } = code.modules;
  const grid: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(data[r * size + c] === 1);
    grid.push(row);
  }
  return grid;
}

/**
 * Generates an SVG string representation of a scannable QR Code.
 */
export function generateQrSvg(text: string, options: QrCodeOptions = {}): string {
  const modules = generateQrMatrix(text);
  const matrixSize = modules.length;
  const margin = options.margin ?? 3;
  const totalGrid = matrixSize + margin * 2;
  const svgSize = options.size ?? 240;
  const fgColor = options.color ?? '#0B253A';
  const bgColor = options.backgroundColor ?? '#FFFFFF';

  let pathData = '';
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (modules[r][c]) {
        pathData += `M${c + margin},${r + margin}h1v1h-1z `;
      }
    }
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalGrid} ${totalGrid}" width="${svgSize}" height="${svgSize}" shape-rendering="crispEdges">
  <rect width="${totalGrid}" height="${totalGrid}" fill="${bgColor}" />
  <path d="${pathData.trim()}" fill="${fgColor}" />
</svg>`.trim();
}

/**
 * Generates a data URL (image/svg+xml) for direct <img src="..." /> usage.
 */
export function generateQrDataUrl(text: string, options: QrCodeOptions = {}): string {
  const svg = generateQrSvg(text, options);
  const encoded = encodeURIComponent(svg);
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}
