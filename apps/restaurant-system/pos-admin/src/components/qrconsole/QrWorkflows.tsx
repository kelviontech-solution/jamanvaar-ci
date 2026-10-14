import { useEffect, useRef, useState } from 'react';
import { Modal } from '@jamanvaar/ui';
import { formatINR, formatRestaurantDate } from '@jamanvaar/utils';
import { qrApi } from '../../cloud/cloudClient';
import { QrAdminApi } from '../../cloud/qrAdminClient';
import { useQrUnsavedChanges } from './useQrUnsavedChanges';
export const flowBase = '/api/v1/restaurant/qr/workflows';
const button = 'min-h-11 rounded-xl border px-4 py-2 font-bold disabled:opacity-40',
  field = 'mt-1 w-full rounded-xl border p-3 min-h-11',
  box = 'rounded-2xl border bg-white p-5 space-y-4';
export function csvDownload(name: string, headers: string[], rows: unknown[][]) {
  const cell = (value: unknown) =>
    '"' +
    String(value ?? '')
      .replace(/^[=+@\t\r-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const url = URL.createObjectURL(new Blob(['\uFEFF' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const title = (s: string) => s.toLowerCase().replaceAll('_', ' ');
export function QrOrderTimeline({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    setError('');
    if (!id) return;
    let active = true;
    qrApi(flowBase + '/timeline/' + encodeURIComponent(id))
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <Modal isOpen={!!id} title="Order & payment timeline" onClose={onClose} maxWidth="2xl">
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Loading timeline...</p>}
      {data && (
        <div className="space-y-4">
          <p>
            {data.orderId} / {title(data.status)} / {title(data.paymentStatus || 'unpaid')}
          </p>
          <p className="font-bold">
            Collected {formatINR(data.ledger.collectedPaise / 100)} / Remaining {formatINR(data.ledger.outstandingPaise / 100)} / Refunded{' '}
            {formatINR(data.ledger.refundedPaise / 100)}
          </p>
          <a className={button} href={'?tab=ADVANCED&feature=Collections&order=' + encodeURIComponent(data.orderId)}>
            Open collection ledger
          </a>
          <ol className="space-y-3">
            {data.events.map((e: any, i: number) => (
              <li key={i} className="rounded-xl border p-3">
                <b>{e.type}</b>
                <p>
                  {title(String(e.detail || ''))}
                  {e.amountPaise !== undefined ? ' / ' + formatINR(e.amountPaise / 100) : ''}
                </p>
                <time>{formatRestaurantDate(e.at)}</time>
              </li>
            ))}
          </ol>
          <p className="text-xs">Attempts are separate from confirmed money. Kitchen completion does not settle the bill.</p>
        </div>
      )}
    </Modal>
  );
}
export function QrPaymentWizard() {
  const [data, setData] = useState<any>(null),
    [tables, setTables] = useState<any[]>([]),
    [draft, setDraft] = useState({ orderId: '', mobileCheckout: false, appReturn: false, kitchenReceived: false, notes: '' }),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  useQrUnsavedChanges(!!draft.orderId || draft.mobileCheckout || draft.appReturn || draft.kitchenReceived || !!draft.notes);
  const load = async () => {
    const [d, t] = await Promise.all([qrApi(flowBase + '/payment-acceptance'), QrAdminApi.tables()]);
    setData(d);
    setTables(t);
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  return (
    <section className={box}>
      <h2 className="text-xl font-bold">Online payment acceptance</h2>
      <p>
        Configuration readiness and an actual phone checkout are separate checks. Run a small order through your normal table QR, pay on the phone, return and
        verify that the same order reaches the kitchen.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <ol className="space-y-4">
        <li>
          <h3 className="font-bold">1. Check your payment configuration</h3>
          {data?.health.checks
            .filter((c: any) => ['payment', 'online', 'license'].includes(c.id))
            .map((c: any) => (
              <p key={c.id}>
                {c.ready ? 'Ready' : 'Needs attention'}: {c.label}
                {!c.ready ? ' / ' + c.action : ''}
              </p>
            ))}
          <a href="?tab=PAYMENTS" className={button}>
            Open payment settings
          </a>
        </li>
        <li>
          <h3 className="font-bold">2. Test on your actual phone</h3>
          <p>Open or scan one of these active table links. This creates a real order only when you submit checkout; it can charge your chosen amount.</p>
          <div className="flex flex-wrap gap-2">
            {tables
              .filter((t) => t.qr?.url)
              .slice(0, 12)
              .map((t) => (
                <a key={t.tableId} href={t.qr.url} target="_blank" rel="noreferrer" className={button}>
                  Table {t.displayNumber}
                </a>
              ))}
          </div>
          {!tables.some((t) => t.qr?.url) && <a href="?tab=TABLES">Generate a table QR first</a>}
        </li>
        <li>
          <h3 className="font-bold">3. Record verified acceptance</h3>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError('');
              try {
                setData(await qrApi(flowBase + '/payment-acceptance', { method: 'POST', body: JSON.stringify({ ...draft, version: data.version }) }));
                setDraft({ orderId: '', mobileCheckout: false, appReturn: false, kitchenReceived: false, notes: '' });
                setNotice('Acceptance recorded against the confirmed payment. Repeat after merchant or checkout changes.');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Server-confirmed online order
              <select required className={field} value={draft.orderId} onChange={(e) => setDraft({ ...draft, orderId: e.target.value })}>
                <option value="">Select paid test order</option>
                {data?.verifiedOrders.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.token || o.id} / {formatINR(o.totalPaise / 100)} / {formatRestaurantDate(o.at)}
                  </option>
                ))}
              </select>
            </label>
            {!data?.verifiedOrders.length && <p>No confirmed online order in this scope yet. Cash or pending orders cannot certify online checkout.</p>}
            {[
              ['mobileCheckout', 'Payment app / checkout worked on the phone'],
              ['appReturn', 'Phone returned and displayed the verified payment result'],
              ['kitchenReceived', 'Same order appeared in POS / KDS']
            ].map(([key, label]) => (
              <label key={key} className="block">
                <input type="checkbox" required checked={(draft as any)[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} /> {label}
              </label>
            ))}
            <label>
              Acceptance notes
              <input className={field} maxLength={1000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
            <button className={button} disabled={busy || !draft.orderId}>
              Record acceptance
            </button>
          </form>
        </li>
      </ol>
      {data?.record && (
        <aside className="rounded-xl bg-emerald-50 p-4">
          <b>Last recorded acceptance</b>
          <p>
            {data.record.orderId} / {formatRestaurantDate(data.record.at)}
          </p>
          <p>{data.record.notes}</p>
          <p>Historical evidence for this branch, not a guarantee that current provider credentials still work.</p>
        </aside>
      )}
      <button className={button} onClick={() => void load().catch((e) => setError(e.message))}>
        Refresh payment readiness
      </button>
    </section>
  );
}
export function QrReconciliation() {
  const today = formatRestaurantDate(new Date(), 'ISO_DATE'),
    [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [cursor, setCursor] = useState(''),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [timeline, setTimeline] = useState<string | null>(null);
  const request = useRef(0);
  const load = async () => {
    const id = ++request.current;
    setData(null);
    try {
      const result = await qrApi(flowBase + '/reconciliation?' + new URLSearchParams({ from, to, cursor }));
      if (id !== request.current) return;
      setData(result);
      setError('');
    } catch (e) {
      if (id !== request.current) return;
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [from, to, cursor]);
  return (
    <section className={box}>
      <h2 className="text-xl font-bold">QR cash & collection reconciliation</h2>
      <p>
        Money collected or refunded during these restaurant calendar dates, regardless of when the order was placed. All totals include every ledger entry in
        the period; the detailed list pages separately. Legacy bills without ledger entries require ledger review first.
      </p>
      <div className="flex flex-wrap gap-3">
        <label>
          From (restaurant date)
          <input
            className={field}
            type="date"
            value={from}
            onChange={(e) => {
              setCursor('');
              setFrom(e.target.value);
            }}
          />
        </label>
        <label>
          To (restaurant date)
          <input
            className={field}
            type="date"
            value={to}
            onChange={(e) => {
              setCursor('');
              setTo(e.target.value);
            }}
          />
        </label>
        <button className={button} onClick={() => void load()}>
          Refresh collections
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            {data.timezone} / {formatRestaurantDate(data.from)} to {formatRestaurantDate(data.to)} (exclusive)
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Collected', data.collectedPaise],
              ['Refunded', data.refundedPaise],
              ['Net collection', data.netPaise]
            ].map(([label, value]) => (
              <article key={String(label)} className="rounded-xl border p-4">
                <p>{label}</p>
                <b className="text-xl">{formatINR(Number(value) / 100)}</b>
              </article>
            ))}
          </div>
          <button
            className={button}
            onClick={() =>
              csvDownload(
                'qr-collections-' + from + '-' + to + '.csv',
                ['Branch', 'Collector', 'Method', 'Kind', 'Entries', 'Amount (paise)', 'Timezone'],
                data.groups.map((g: any) => [g.branch, g.actor, g.method, g.kind, g.count, g.amountPaise, data.timezone])
              )
            }
          >
            Export full summary CSV
          </button>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Branch', 'Collector', 'Method', 'Type', 'Entries', 'Amount'].map((h) => (
                    <th key={h} className="p-3 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g: any, i: number) => (
                  <tr key={i}>
                    <td className="p-3">{g.branch}</td>
                    <td>{g.actor}</td>
                    <td>{title(g.method)}</td>
                    <td>{title(g.kind)}</td>
                    <td>{g.count}</td>
                    <td>{formatINR(g.amountPaise / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="font-bold">Collection / refund entries</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.entries.map((e: any) => (
              <article key={e.id} className="rounded-xl border p-3">
                <b>
                  {e.token || e.orderId} / {formatINR(e.amountPaise / 100)}
                </b>
                <p>
                  {title(e.kind)} / {title(e.method)} / {e.actor}
                </p>
                <p>{formatRestaurantDate(e.at)}</p>
                <button className={button} onClick={() => setTimeline(e.orderId)}>
                  Order timeline
                </button>
              </article>
            ))}
          </div>
          {!data.entries.length && <p>No confirmed ledger entries in this period.</p>}
          <button className={button} disabled={!cursor} onClick={() => setCursor('')}>
            First entries
          </button>{' '}
          <button className={button} disabled={!data.nextCursor} onClick={() => setCursor(data.nextCursor)}>
            Older entries
          </button>
        </>
      )}
      <QrOrderTimeline id={timeline} onClose={() => setTimeline(null)} />
    </section>
  );
}
export function QrPickupCalendar() {
  const [day, setDay] = useState(formatRestaurantDate(new Date(), 'ISO_DATE')),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [timeline, setTimeline] = useState<string | null>(null);
  const request = useRef(0);
  const load = async () => {
    const id = ++request.current;
    try {
      const result = await qrApi(flowBase + '/pickup-calendar?' + new URLSearchParams({ from: day, to: day }));
      if (id !== request.current) return;
      setData(result);
      setError('');
    } catch (e) {
      if (id !== request.current) return;
      setData(null);
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    setData(null);
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 10000);
    return () => clearInterval(timer);
  }, [day]);
  const slots = [...new Set<string>(data?.orders.map((o: any) => o.pickupAt) || [])].sort();
  return (
    <section className={box}>
      <h2 className="text-xl font-bold">Pickup calendar & handover</h2>
      <p>
        Booked slots for the selected branch. Pending online payments hold capacity; cancelled/refunded orders release it. Mark handover only after food reaches
        the guest.
      </p>
      <label>
        Pickup date (restaurant time)
        <input className={field} type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            {data.timezone} / Scheduling {data.enabled ? 'enabled' : 'paused'} / Capacity {data.capacity} orders per slot
          </p>
          {!slots.length && <p>No scheduled pickups for this date.</p>}
          {slots.map((at) => {
            const orders = data.orders.filter((o: any) => o.pickupAt === at),
              held = orders.filter((o: any) => !['CANCELLED', 'VOIDED', 'REFUNDED'].includes(o.status)).length;
            return (
              <section key={at} className="rounded-xl border p-4 space-y-3">
                <h3 className="font-bold">
                  {formatRestaurantDate(at)} / {held} of {data.capacity} bookings
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {orders.map((o: any) => (
                    <article key={o.id} className="rounded-xl border p-3 space-y-2">
                      <b>
                        {o.token || o.id} / {o.customer}
                      </b>
                      <p>
                        {title(o.status)} / {title(o.paymentStatus || 'unpaid')}
                      </p>
                      <p>{o.items.map((i: any) => i.quantity + ' x ' + i.name).join(', ')}</p>
                      <button className={button} onClick={() => setTimeline(o.id)}>
                        Order timeline
                      </button>
                      {o.status === 'READY' && (
                        <button
                          className={button}
                          disabled={!!busy}
                          onClick={async () => {
                            setBusy(o.id);
                            try {
                              await QrAdminApi.orderAction(o.id, 'COMPLETED', o.version);
                              await load();
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy('');
                            }
                          }}
                        >
                          Confirm guest handover
                        </button>
                      )}
                      {['SERVED', 'COMPLETED'].includes(o.status) && <p className="text-emerald-700">Order completed / handed over</p>}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
      <QrOrderTimeline id={timeline} onClose={() => setTimeline(null)} />
    </section>
  );
}
