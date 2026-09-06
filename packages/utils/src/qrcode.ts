/**
 * JAMANVAAR Pure TypeScript QR Code Generator
 * 100% Offline, zero-dependency, standard ISO/IEC 18004 QR matrix generator.
 * Produces crisp, high-contrast, camera-scannable SVGs and Data URLs.
 */

// GF(256) tables for Reed-Solomon error correction
const GF_EXP: number[] = new Array(512);
const GF_LOG: number[] = new Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 256) {
      x ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMultiply(poly[j], GF_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], numEcBytes: number): number[] {
  const gen = rsGeneratorPoly(numEcBytes);
  const remainder = new Array(numEcBytes).fill(0);

  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let j = 0; j < numEcBytes; j++) {
        remainder[j] ^= gfMultiply(gen[j + 1], factor);
      }
    }
  }
  return remainder;
}

// Version table for Byte mode with Medium (M) error correction
interface QrVersionSpec {
  version: number;
  dataCodewords: number;
  ecCodewords: number;
  size: number;
  alignments: number[];
}

const QR_SPECS: QrVersionSpec[] = [
  { version: 1, dataCodewords: 16, ecCodewords: 10, size: 21, alignments: [] },
  { version: 2, dataCodewords: 28, ecCodewords: 16, size: 25, alignments: [6, 18] },
  { version: 3, dataCodewords: 44, ecCodewords: 26, size: 29, alignments: [6, 22] },
  { version: 4, dataCodewords: 64, ecCodewords: 36, size: 33, alignments: [6, 26] },
  { version: 5, dataCodewords: 86, ecCodewords: 48, size: 37, alignments: [6, 30] },
  { version: 6, dataCodewords: 108, ecCodewords: 64, size: 41, alignments: [6, 34] },
  { version: 7, dataCodewords: 124, ecCodewords: 72, size: 45, alignments: [6, 22, 38] },
  { version: 8, dataCodewords: 154, ecCodewords: 88, size: 49, alignments: [6, 24, 42] },
  { version: 9, dataCodewords: 182, ecCodewords: 110, size: 53, alignments: [6, 26, 46] },
  { version: 10, dataCodewords: 216, ecCodewords: 130, size: 57, alignments: [6, 28, 50] }
];

export interface QrCodeOptions {
  color?: string; // QR code foreground color (default: '#0B253A')
  backgroundColor?: string; // Background color (default: '#FFFFFF')
  margin?: number; // Quiet zone module count (default: 3)
  size?: number; // Output SVG width/height in px (default: 240)
  title?: string; // Accessible title
}

export class QrMatrix {
  public size: number;
  public modules: boolean[][];
  private isFunctionModule: boolean[][];

  constructor(size: number) {
    this.size = size;
    this.modules = Array.from({ length: size }, () => new Array(size).fill(false));
    this.isFunctionModule = Array.from({ length: size }, () => new Array(size).fill(false));
  }

  public set(r: number, c: number, value: boolean, isFunction: boolean = false) {
    if (r >= 0 && r < this.size && c >= 0 && c < this.size) {
      this.modules[r][c] = value;
      if (isFunction) this.isFunctionModule[r][c] = true;
    }
  }

  public isFunction(r: number, c: number): boolean {
    return this.isFunctionModule[r]?.[c] ?? false;
  }
}

/**
 * Encodes text into a standard QR matrix using ISO Byte mode.
 */
export function generateQrMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const bytes = Array.from(encoder.encode(text));

  // Find minimum version that fits data
  const spec = QR_SPECS.find((s) => s.dataCodewords >= bytes.length + 3) || QR_SPECS[QR_SPECS.length - 1];
  const countBits = spec.version >= 10 ? 16 : 8;

  // Build bitstream
  const bitstream: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitstream.push((val >> i) & 1);
    }
  }

  // 1. Mode indicator: 0100 for Byte mode
  pushBits(0b0100, 4);
  // 2. Character count indicator
  pushBits(bytes.length, countBits);
  // 3. Data bytes
  for (const b of bytes) {
    pushBits(b, 8);
  }
  // 4. Terminator (up to 4 zeroes)
  const maxDataBits = spec.dataCodewords * 8;
  const termLen = Math.min(4, maxDataBits - bitstream.length);
  pushBits(0, termLen);
  // 5. Pad to byte boundary
  while (bitstream.length % 8 !== 0) {
    bitstream.push(0);
  }
  // 6. Pad bytes 0xEC, 0x11
  const padPatterns = [0xec, 0x11];
  let padIdx = 0;
  while (bitstream.length < maxDataBits) {
    pushBits(padPatterns[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bitstream to data codewords
  const dataCodewords: number[] = [];
  for (let i = 0; i < bitstream.length; i += 8) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitstream[i + b];
    }
    dataCodewords.push(byteVal);
  }

  // Generate Reed-Solomon EC codewords
  const ecCodewords = rsEncode(dataCodewords, spec.ecCodewords);
  const totalCodewords = [...dataCodewords, ...ecCodewords];

  // Initialize Matrix
  const matrix = new QrMatrix(spec.size);

  // Helper to draw Finder Pattern 7x7 + separator
  function drawFinder(startR: number, startC: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = startR + r;
        const nc = startC + c;
        if (nr >= 0 && nr < spec.size && nc >= 0 && nc < spec.size) {
          const isOuterBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isInnerSquare = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          const isBlack = (r >= 0 && r <= 6 && c >= 0 && c <= 6) && (isOuterBorder || isInnerSquare);
          matrix.set(nr, nc, isBlack, true);
        }
      }
    }
  }

  // Draw 3 Finder Patterns
  drawFinder(0, 0);
  drawFinder(0, spec.size - 7);
  drawFinder(spec.size - 7, 0);

  // Draw Timing Patterns
  for (let i = 8; i < spec.size - 8; i++) {
    const isDark = i % 2 === 0;
    matrix.set(6, i, isDark, true);
    matrix.set(i, 6, isDark, true);
  }

  // Draw Alignment Patterns if version >= 2
  if (spec.alignments.length > 0) {
    const coords = spec.alignments;
    for (const r of coords) {
      for (const c of coords) {
        // Skip if overlaps with finders
        if ((r < 9 && c < 9) || (r < 9 && c >= spec.size - 8) || (r >= spec.size - 8 && c < 9)) {
          continue;
        }
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            matrix.set(r + dr, c + dc, isBorder || isCenter, true);
          }
        }
      }
    }
  }

  // Reserve Format Information areas
  for (let i = 0; i < 9; i++) {
    matrix.set(8, i, false, true);
    matrix.set(i, 8, false, true);
    if (i < 8) {
      matrix.set(8, spec.size - 1 - i, false, true);
      matrix.set(spec.size - 1 - i, 8, false, true);
    }
  }
  matrix.set(spec.size - 8, 8, true, true); // Dark module

  // Convert codewords to bits for placement
  const allBits: number[] = [];
  for (const cw of totalCodewords) {
    for (let b = 7; b >= 0; b--) {
      allBits.push((cw >> b) & 1);
    }
  }

  // Place data bits with standard 2-column zigzag and Mask 0 ((r + c) % 2 === 0)
  let bitIdx = 0;
  let upward = true;

  for (let c = spec.size - 1; c > 0; c -= 2) {
    if (c === 6) c = 5; // Skip timing column

    const rows = upward
      ? Array.from({ length: spec.size }, (_, i) => spec.size - 1 - i)
      : Array.from({ length: spec.size }, (_, i) => i);

    for (const r of rows) {
      for (const colOffset of [0, -1]) {
        const col = c + colOffset;
        if (!matrix.isFunction(r, col)) {
          let bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          // Apply Mask 0: flip if (r + col) % 2 === 0
          if ((r + col) % 2 === 0) {
            bit ^= 1;
          }
          matrix.set(r, col, bit === 1, false);
        }
      }
    }
    upward = !upward;
  }

  // Format info: EC Level M (00) + Mask 0 (000) = 00000 -> BCH masked = 101010000010010
  const formatInfoBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

  // Draw format information
  for (let i = 0; i < 15; i++) {
    const bit = formatInfoBits[i] === 1;
    // Top-left
    if (i < 6) {
      matrix.set(8, i, bit, true);
    } else if (i < 8) {
      matrix.set(8, i + 1, bit, true);
    } else if (i === 8) {
      matrix.set(7, 8, bit, true);
    } else {
      matrix.set(14 - i, 8, bit, true);
    }

    // Split across right and bottom
    if (i < 8) {
      matrix.set(spec.size - 1 - i, 8, bit, true);
    } else {
      matrix.set(8, spec.size - 15 + i, bit, true);
    }
  }

  return matrix.modules;
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
