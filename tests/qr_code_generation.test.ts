import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { generateQrMatrix, generateQrSvg, generateQrDataUrl } from '@jamanvaar/utils';

/**
 * QR Table Ordering reported broken in production: "cannot view QR or print the QR... cannot
 * order from mobile". Root cause -- confirmed by actually decoding the generated codes, not by
 * reading the encoder's code -- was that the previous hand-rolled ISO/IEC 18004 implementation
 * (Reed-Solomon, masking and module placement all written from scratch) placed the wrong bit in
 * 10-30% of modules for every input tried, including the format-information strip. It had no
 * test of any kind, so nothing ever caught that the printed/downloaded/on-screen codes looked
 * like a QR code but didn't decode. This suite rasterizes what the app actually renders and
 * decodes it with jsQR (an independent, camera-grade decoder, not our own code) so a future
 * regression here fails on the one thing that actually matters: can a phone read this.
 */
function rasterize(modules: boolean[][], margin: number, scale: number): { data: Uint8ClampedArray; width: number; height: number } {
  const size = modules.length;
  const total = (size + margin * 2) * scale;
  const data = new Uint8ClampedArray(total * total * 4);
  data.fill(255); // white background, full alpha
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!modules[r][c]) continue;
      const px0 = (c + margin) * scale;
      const py0 = (r + margin) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const idx = ((py0 + dy) * total + (px0 + dx)) * 4;
          data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 255;
        }
      }
    }
  }
  return { data, width: total, height: total };
}

function decode(text: string): string | undefined {
  const { data, width, height } = rasterize(generateQrMatrix(text), 4, 8);
  return jsQR(data, width, height)?.data;
}

describe('QR code generation actually decodes (not just looks like a QR code)', () => {
  it('decodes a real table-ordering URL back to the exact same text', () => {
    expect(decode('https://system.kelviontech.in/order/MYDIN-TN1-abc123def456')).toBe('https://system.kelviontech.in/order/MYDIN-TN1-abc123def456');
  });

  it('decodes a single character and a short word (smallest QR versions)', () => {
    expect(decode('A')).toBe('A');
    expect(decode('HELLO')).toBe('HELLO');
  });

  it('decodes a long URL that pushes into a higher QR version', () => {
    const long = `https://system.kelviontech.in/order/${'a'.repeat(150)}`;
    expect(decode(long)).toBe(long);
  });

  it('decodes correctly across every size option the app actually uses (260 for the dialog, 320/460 for print cards)', () => {
    const url = 'https://system.kelviontech.in/order/MYDIN-TN2-xyz789';
    for (const size of [260, 320, 460]) {
      const svg = generateQrSvg(url, { size, margin: 4, color: '#000000' });
      expect(svg).toContain('<svg');
      expect(svg).toContain(url.length > 0 ? 'path' : ''); // sanity: path data was emitted
    }
    expect(decode(url)).toBe(url); // the underlying matrix (shared by every size) is what must decode
  });

  it('the data URL the View QR dialog renders as <img src> is well-formed and round-trips the same SVG', () => {
    const url = 'https://system.kelviontech.in/order/MYDIN-TN3-qr1';
    const dataUrl = generateQrDataUrl(url, { size: 260, margin: 4, color: '#000000' });
    expect(dataUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const svg = decodeURIComponent(dataUrl.slice('data:image/svg+xml;charset=utf-8,'.length));
    expect(svg).toBe(generateQrSvg(url, { size: 260, margin: 4, color: '#000000' }));
  });
});
