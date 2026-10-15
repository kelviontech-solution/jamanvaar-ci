import { useEffect, useRef, useState } from 'react';
import { StaffSession, SyncOutboxEngine } from '@jamanvaar/sync';
import { deviceFetch } from '../../cloud/cloudClient';
import { useCaptainStore } from '../../store/captainStore';
type Policy = { mealItemId: string; includedItemIds: string[]; maxRefillsPerOrder: number };
export function ThaliRefills() {
  const { selectedTableOrder: order, menuItems, addItemToCart } = useCaptainStore(),
    [policy, setPolicy] = useState<Policy | null>(null),
    [item, setItem] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    void deviceFetch('/api/v1/operations/device/refill-policy')
      .then(async (r) => {
        if (r.ok && live) setPolicy(await r.json());
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const attempt = useRef<{ order: string; item: string; key: string }>();
  if (!order || !policy || !order.items.some((i) => i.menuItemId === policy.mealItemId && i.kitchenStatus !== 'CANCELLED')) return null;
  const chosen = menuItems.find((i) => i.id === item),
    included = policy.includedItemIds.includes(item);
  async function request() {
    if (!chosen || !order || busy) return;
    if (!included) {
      addItemToCart(chosen, [], 'CHARGEABLE EXTRA');
      setNotice('Chargeable extra added to the order. Review its price and send the KOT.');
      return;
    }
    setBusy(true);
    setNotice('');
    if (!attempt.current || attempt.current.order !== order.id || attempt.current.item !== item)
      attempt.current = { order: order.id, item, key: crypto.randomUUID() };
    try {
      const r = await deviceFetch('/api/v1/operations/device/refills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, itemId: item, quantity: 1, idempotencyKey: attempt.current.key, staffToken: StaffSession.sessionToken() })
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.message ?? 'Refill could not be requested');
      attempt.current = undefined;
      setNotice('Included refill recorded on the original order. Kitchen delivery is being synchronized.');
      SyncOutboxEngine.flush();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not request refill');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50 p-3 my-2">
      <h3 className="font-bold">Thali refills & extras</h3>
      <label className="text-sm">
        Dish
        <select className="block w-full p-2 rounded-lg mt-1" value={item} onChange={(e) => setItem(e.target.value)}>
          <option value="">Choose dish</option>
          {menuItems
            .filter((i) => i.isAvailable !== false)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {policy.includedItemIds.includes(i.id) ? 'Included refill' : `Extra ₹${i.price}`}
              </option>
            ))}
        </select>
      </label>
      <button className="rounded-lg bg-jaman-navy text-white px-3 py-2 mt-2 disabled:opacity-40" disabled={!chosen || busy} onClick={() => void request()}>
        {busy ? 'Recording…' : included ? 'Request included refill' : 'Add chargeable extra'}
      </button>
      {notice && (
        <p role="status" className="text-sm mt-2">
          {notice}
        </p>
      )}
    </section>
  );
}
