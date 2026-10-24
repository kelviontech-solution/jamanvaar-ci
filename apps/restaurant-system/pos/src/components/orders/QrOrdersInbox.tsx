import { useEffect, useState } from 'react';
import { QrCode } from 'lucide-react';
import { db, KeyValueStore } from '@jamanvaar/database';
import { QrOrderDesk } from '@jamanvaar/sync';
import { formatINR } from '@jamanvaar/utils';
import { PosPrinterService } from '../../services/printerService';
import { useConfirm } from '@jamanvaar/ui';

/**
 * Orders that guests placed from their table's QR code and nobody has accepted yet. A QR order is an ordinary order
 * (same list, same kitchen ticket, same payment); the only extra step is that exactly one terminal accepts it. Every
 * terminal sees the same waiting orders; the first to accept owns the order and prints the kitchen ticket, and on any
 * other terminal the order simply leaves this list.
 */
const DEVICE_ID_KEY = 'jamanvaar_pos_device_id';

export function QrOrdersInbox({ actor }: { actor: string }) {
  const { prompt, confirmDialog } = useConfirm();
  const [, tick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => db.subscribe(() => tick((n) => n + 1)), []);
  const pending = QrOrderDesk.pending();
  const cancellationsPending = db.orders.filter(o => o.source_type === 'QR_TABLE' && o.orderStatus === 'CANCELLED' && o.syncStatus !== 'SYNCED');
  if (pending.length === 0 && cancellationsPending.length === 0 && !message) return null;
  const deviceId = KeyValueStore.get(DEVICE_ID_KEY) ?? 'this-pos';

  const accept = async (id: string) => {
    setBusy(id);
    const r = await QrOrderDesk.accept(id, { deviceId, actor, print: (kot) => void PosPrinterService.printKOT(kot) });
    setMessage(r.status === 'ACCEPTED' ? (r.printed > 0 ? 'Accepted. Kitchen ticket sent.' : 'Accepted.') : r.status === 'ALREADY_ACCEPTED' ? 'Another counter accepted this order first.' : 'This order can no longer be accepted.');
    setBusy(null);
  };
  const decline = async (id: string) => {
    // Cancelling the dialog now cancels the decline (the native prompt used to decline anyway on Cancel).
    const reason = await prompt({
      title: 'Decline this order?',
      message: 'The kitchen and counter team will see the reason. The guest does not.',
      inputLabel: 'Reason (optional)',
      confirmLabel: 'Decline order',
      tone: 'danger'
    });
    if (reason === null) return;
    setBusy(id);
    const result = await QrOrderDesk.reject(id, { deviceId, actor, reason: reason.trim() || undefined });
    setMessage(result.status === 'REJECTED' ? 'Cancellation confirmed.' : result.status === 'PENDING_SYNC' ? 'Cancellation awaiting approval and sync. Tell the kitchen directly until it is confirmed.' : 'This order can no longer be declined.');
    setBusy(null);
  };

  return (
    <>
    <div className="mb-4 rounded-2xl border-2 border-jaman-saffron bg-white p-3 shrink-0" data-testid="qr-inbox">
      <div className="flex items-center gap-2 text-sm font-black text-jaman-navy mb-2"><QrCode className="w-4 h-4 text-jaman-saffronText" /> New QR orders ({pending.length})</div>
      {message && <div className="text-xs text-slate-600 mb-2">{message}</div>}
      {cancellationsPending.length > 0 && <div role="status" className="mb-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Cancellation awaiting approval and sync: {cancellationsPending.map(o => o.orderNumber).join(', ')}. Kitchen tickets remain active until confirmed.</div>}
      <div className="grid gap-2">
        {pending.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-jaman-cream p-3">
            <div className="font-black text-jaman-navy">{o.orderNumber}</div>{o.pickupAt&&<p className="text-xs text-orange-800">Pickup {new Date(o.pickupAt).toLocaleString(undefined,{timeZone:o.pickupTimezone})}</p>}
            <div className="text-sm">{o.tableNumber ? `Table ${o.tableNumber}` : o.orderType === 'TAKEAWAY' ? 'Takeaway' : 'No table'}</div>
            <div className="text-xs text-slate-600 flex-1 min-w-[12rem]">{o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}{o.customerNotes ? ` — “${o.customerNotes}”` : ''}</div>
            <div className="font-bold">{formatINR(o.totalAmount)}</div>
            <button disabled={busy === o.id} onClick={() => void accept(o.id)} className="px-4 py-2 rounded-xl bg-jaman-navy text-white text-xs font-black disabled:opacity-50">Accept</button>
            <button disabled={busy === o.id} onClick={() => void decline(o.id)} className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold disabled:opacity-50">Decline</button>
          </div>
        ))}
      </div>
    </div>
    {confirmDialog}
    </>
  );
}
