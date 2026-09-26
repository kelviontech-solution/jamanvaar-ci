import { generateQrSvg } from '@jamanvaar/utils';
import type { QrPrintData } from '../../cloud/qrAdminClient';

/**
 * The card a restaurant prints and puts on a table. Nothing internal appears on it: the restaurant's name, the table,
 * the code, and a call to action. High contrast (dark on white, wide quiet zone) so it scans from a phone at arm's length.
 */
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function cardSvg(data: QrPrintData, size = 320): string {
  if (!data.url) throw new Error('This code has no address to print.');
  return generateQrSvg(data.url, { size, margin: 4, color: '#000000', backgroundColor: '#FFFFFF' });
}

function cardHtml(data: QrPrintData): string {
  return `<section class="card">
    <div class="name">${escapeHtml(data.restaurantName)}</div>
    ${data.branchName ? `<div class="branch">${escapeHtml(data.branchName)}</div>` : ''}
    <div class="scan">Scan to Order</div>
    <div class="qr">${cardSvg(data)}</div>
    <div class="table">${escapeHtml(data.tableLabel)}</div>
    <div class="tag">${escapeHtml(data.tagline)}</div>
  </section>`;
}

const PRINT_CSS = `
  @page { size: A5; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; color: #111; }
  .card { page-break-after: always; text-align: center; padding: 14mm 8mm; border: 2px solid #111; border-radius: 12px; }
  .card:last-child { page-break-after: auto; }
  .name { font-size: 26px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; }
  .branch { font-size: 14px; color: #444; margin-top: 4px; }
  .scan { font-size: 20px; font-weight: 700; margin: 14px 0 6px; }
  .qr svg { width: 300px; height: 300px; }
  .table { font-size: 40px; font-weight: 800; margin-top: 8px; }
  .tag { font-size: 15px; color: #444; margin-top: 10px; letter-spacing: 1px; }
`;

/** Opens the browser print dialog (which also offers "Save as PDF") for one or many cards. */
export function printCards(cards: QrPrintData[]): void {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) throw new Error('Allow pop-ups to print QR cards.');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR cards</title><style>${PRINT_CSS}</style></head><body>${cards.map(cardHtml).join('')}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

/** Renders the card to a PNG and downloads it. */
export async function downloadCardPng(data: QrPrintData, fileName: string): Promise<void> {
  const scale = 2;
  const width = 640;
  const height = 860;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot draw the card in this browser.');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, width - 24, height - 24);
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.font = '800 38px Arial, sans-serif';
  ctx.fillText(data.restaurantName.toUpperCase().slice(0, 28), width / 2, 90);
  if (data.branchName) {
    ctx.font = '400 22px Arial, sans-serif';
    ctx.fillStyle = '#444444';
    ctx.fillText(data.branchName, width / 2, 128);
  }
  ctx.fillStyle = '#111111';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText('Scan to Order', width / 2, 190);

  const svg = cardSvg(data, 460);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not draw the QR code.'));
    img.src = url;
  });
  ctx.drawImage(img, (width - 460) / 2, 215, 460, 460);
  URL.revokeObjectURL(url);

  ctx.font = '800 60px Arial, sans-serif';
  ctx.fillText(data.tableLabel, width / 2, 750);
  ctx.font = '400 22px Arial, sans-serif';
  ctx.fillStyle = '#444444';
  ctx.fillText(data.tagline, width / 2, 800);

  const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fileName.replace(/[^A-Za-z0-9-_]+/g, '-')}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
