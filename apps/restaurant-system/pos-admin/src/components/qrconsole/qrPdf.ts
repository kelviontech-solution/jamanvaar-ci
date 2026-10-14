import type { QrPrintData } from '../../cloud/qrAdminClient';
import { designSvg } from './qrPrint';
/** A4 PDF sheets embed the exact shared SVG card renderer, including Unicode text and the logo. */
export async function createQrPdf(cards: QrPrintData[]): Promise<Uint8Array> {
  const encoder = new TextEncoder(),
    objects: Uint8Array[] = [];
  const encode = (s: string) => encoder.encode(s);
  const join = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  const add = (bytes: Uint8Array) => {
    objects.push(bytes);
    return objects.length;
  };
  const catalog = add(encode('')),
    pages = add(encode('')),
    pageIds: number[] = [];
  for (let start = 0; start < cards.length; start += 4) {
    const photos: number[] = [];
    for (const card of cards.slice(start, start + 4)) {
      const svg = URL.createObjectURL(new Blob([designSvg(card)], { type: 'image/svg+xml' })),
        canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 1720;
      try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(Error('Could not render PDF card'));
          image.src = svg;
        });
        const ctx = canvas.getContext('2d');
        if (!ctx) throw Error('PDF drawing is unavailable');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(Error('Could not create PDF image'))), 'image/jpeg', 1)
        );
        const bytes = new Uint8Array(await blob.arrayBuffer());
        photos.push(
          add(
            join([
              encode(
                '<< /Type /XObject /Subtype /Image /Width 1280 /Height 1720 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
                  bytes.length +
                  ' >>\nstream\n'
              ),
              bytes,
              encode('\nendstream')
            ])
          )
        );
      } finally {
        URL.revokeObjectURL(svg);
      }
    }
    const commands = photos
        .map((_, i) => 'q 240.945 0 0 323.770 ' + (i % 2 === 0 ? '40' : '314') + ' ' + (i < 2 ? '434' : '82') + ' cm /Card' + i + ' Do Q')
        .join('\n'),
      content = add(encode('<< /Length ' + encode(commands).length + ' >>\nstream\n' + commands + '\nendstream'));
    pageIds.push(
      add(
        encode(
          '<< /Type /Page /Parent ' +
            pages +
            ' 0 R /MediaBox [0 0 595.276 841.890] /Resources << /XObject << ' +
            photos.map((id, i) => '/Card' + i + ' ' + id + ' 0 R').join(' ') +
            ' >> >> /Contents ' +
            content +
            ' 0 R >>'
        )
      )
    );
  }
  objects[catalog - 1] = encode('<< /Type /Catalog /Pages ' + pages + ' 0 R >>');
  objects[pages - 1] = encode('<< /Type /Pages /Count ' + pageIds.length + ' /Kids [' + pageIds.map((id) => id + ' 0 R').join(' ') + '] >>');
  const parts = [encode('%PDF-1.4\n%JAMANVAAR\n')],
    offsets = [0];
  let offset = parts[0].length;
  objects.forEach((o, i) => {
    offsets.push(offset);
    const body = join([encode(i + 1 + ' 0 obj\n'), o, encode('\nendobj\n')]);
    parts.push(body);
    offset += body.length;
  });
  parts.push(
    encode(
      'xref\n0 ' +
        (objects.length + 1) +
        '\n0000000000 65535 f \n' +
        offsets
          .slice(1)
          .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
          .join('') +
        'trailer\n<< /Size ' +
        (objects.length + 1) +
        ' /Root ' +
        catalog +
        ' 0 R >>\nstartxref\n' +
        offset +
        '\n%%EOF\n'
    )
  );
  return join(parts);
}
