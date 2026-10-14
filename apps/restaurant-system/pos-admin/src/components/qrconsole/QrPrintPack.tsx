import { createQrPdf } from './qrPdf';
import { useEffect, useState } from 'react';
import { QrAdminApi, type QrPrintData } from '../../cloud/qrAdminClient';
import { qrApi } from '../../cloud/cloudClient';
import { designSvg, withLogo } from './qrPrint';
import { createQrZip } from './qrZip';
const button = 'min-h-11 rounded-xl border px-4 py-2 font-bold disabled:opacity-40';
export function QrPrintPack() {
  const [inventory, setInventory] = useState<any>(null),
    [chosen, setChosen] = useState<string[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const load = async () => {
    const data = await qrApi<any>('/api/v1/restaurant/qr/workflows/print-inventory');
    setInventory(data);
    setChosen(
      data.codes
        .filter((c: any) => c.status === 'ACTIVE')
        .slice(0, 100)
        .map((c: any) => c.id)
    );
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function make(print: boolean) {
    if (busy) return;
    const windowToPrint = print ? window.open('', '_blank') : null;
    if (print && !windowToPrint) {
      setError('Allow pop-ups to print sheets.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const cards: QrPrintData[] = [];
      if (chosen.length > 100) throw Error('Choose up to 100 cards per pack.');
      let bytes = 0;
      for (const id of chosen) {
        const card = await withLogo(await QrAdminApi.printData(id));
        bytes += card.logoUrl?.length || 0;
        if (bytes > 24_000_000) throw Error('Choose fewer cards or use a smaller logo for this pack.');
        cards.push(card);
      }
      const fresh = await qrApi<any>('/api/v1/restaurant/qr/workflows/print-inventory');
      if (chosen.some((id) => !fresh.codes.some((c: any) => c.id === id && c.status === 'ACTIVE')))
        throw Error('A selected code changed. Refresh inventory and regenerate the pack.');
      const sheet =
        '<!doctype html><html><head><meta charset="utf-8"><title>Restaurant QR print sheets</title><style>@page{size:A4;margin:10mm}body{font-family:Arial;margin:0}.sheet{display:grid;grid-template-columns:1fr 1fr;gap:8mm;break-after:page}.card{break-inside:avoid}.card svg{width:85mm;height:auto}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}</style></head><body>' +
        Array.from(
          { length: Math.ceil(cards.length / 4) },
          (_, page) =>
            '<section class="sheet">' +
            cards
              .slice(page * 4, page * 4 + 4)
              .map((c) => '<article class="card">' + designSvg(c) + '</article>')
              .join('') +
            '</section>'
        ).join('') +
        '</body></html>';
      if (print) {
        windowToPrint!.document.write(sheet);
        windowToPrint!.document.close();
        windowToPrint!.focus();
        setTimeout(() => windowToPrint!.print(), 500);
      } else {
        const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '-'),
          cell = (s: unknown) =>
            '"' +
            String(s ?? '')
              .replace(/^[=+@\t\r-]/, "'$&")
              .replaceAll('"', '""') +
            '"';
        const files: Array<{ name: string; content: string | Uint8Array }> = cards.map((c, i) => ({
          name: 'cards/' + safe(c.tableLabel) + '-' + chosen[i] + '.svg',
          content: designSvg(c)
        }));
        files.push(
          { name: 'print-sheets.html', content: sheet },
          { name: 'print-sheets.pdf', content: await createQrPdf(cards) },
          {
            name: 'inventory.csv',
            content: [
              ['Branch', 'Table', 'Code ID', 'Version', 'Status', 'Created', 'Replacement needed'],
              ...fresh.codes.map((c: any) => [c.branch, c.table, c.id, c.version, c.status, c.createdAt, c.status === 'ACTIVE' ? 'NO' : 'YES'])
            ]
              .map((r) => r.map(cell).join(','))
              .join('\r\n')
          },
          {
            name: 'README.txt',
            content:
              'Print print-sheets.pdf or print-sheets.html at 100% on A4 and use Print / Save as PDF. Four cards per sheet, each 85 mm wide. Test scan before service. Revoked and disabled codes in inventory.csv need replacement; they are never included as usable cards. Created ' +
              new Date().toISOString() +
              '. QR codes grant guest access: distribute the pack only to restaurant staff.'
          }
        );
        const url = URL.createObjectURL(createQrZip(files)),
          a = document.createElement('a');
        a.href = url;
        a.download = 'restaurant-qr-print-pack.zip';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice(cards.length + ' active branded QR cards prepared. Test scan your printed cards before service.');
    } catch (e) {
      windowToPrint?.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border bg-white p-5 space-y-4">
      <h2 className="text-xl font-bold">Bulk QR print packs</h2>
      <p>
        Up to 100 selected active cards, A4 sheets and a replacement inventory in one ZIP. Print or save the sheets as PDF. QR artwork uses your saved design
        and restaurant branding.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy} onClick={() => void load().catch((e) => setError(e.message))}>
          Refresh inventory
        </button>
        <button className={button} disabled={busy || !chosen.length} onClick={() => void make(false)}>
          Download ZIP print pack
        </button>
        <button className={button} disabled={busy || !chosen.length} onClick={() => void make(true)}>
          Print sheets / Save PDF
        </button>
      </div>
      {inventory && (
        <>
          <p>
            {inventory.codes.filter((c: any) => c.status !== 'ACTIVE').length} inactive/revoked codes need replacement. {chosen.length} active cards selected.
          </p>
          <div className="max-h-[60vh] overflow-auto space-y-2">
            {inventory.codes.map((c: any) => (
              <label key={c.id} className="flex gap-3 items-center rounded-xl border p-3">
                <input
                  type="checkbox"
                  disabled={c.status !== 'ACTIVE' || busy}
                  checked={chosen.includes(c.id)}
                  onChange={(e) => setChosen(e.target.checked ? [...chosen, c.id] : chosen.filter((id) => id !== c.id))}
                />
                <span>
                  {c.branch} / {c.table} / version {c.version}
                  <small className="block">
                    {c.status === 'ACTIVE' ? 'Current card' : c.status.toLowerCase() + ' - replace old print'} / {c.id}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
