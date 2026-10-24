import { useEffect, useState } from 'react';
import { db } from '@jamanvaar/database';
import { usePosStore } from '../../store/posStore';
import { deviceFetch } from '../../cloud/cloudClient';
import { cashierSettings, saveCashierSettings, type CashierSettings } from '../../cashierSpeed';
import { PosOperationalShortcuts } from '../layout/PosOperationalShortcuts';
export function CashierSpeedBar() {
  const [settings, setSettings] = useState(cashierSettings),
    [code, setCode] = useState(''),
    [notice, setNotice] = useState(''),
    [expanded, setExpanded] = useState(false);
  const { quickAddOrCustomize, repeatLastOrder, cart } = usePosStore();
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await deviceFetch('/api/v1/operations/device/cashier-settings');
        if (!r.ok) return;
        const data = await r.json();
        if (live) {
          saveCashierSettings(data.data as CashierSettings);
          setSettings(cashierSettings());
        }
      } catch {
        /* Cached settings support offline billing. */
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  const add = (id: string) => {
    const item = db.menuItems.find((i) => i.id === id && i.isAvailable !== false);
    if (!item) {
      setNotice('This dish is unavailable.');
      return;
    }
    quickAddOrCustomize(item);
    // The store adds straight away unless a required choice has no default, in which case it opens customization.
    const needsChoice = usePosStore.getState().customizingItem?.id === item.id;
    setNotice(needsChoice ? `Choose options for ${item.name}.` : `${item.name} added.`);
  };
  return (
    <section className="shrink-0 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-1 basis-[260px] min-w-0 flex-wrap gap-2 items-center">
          <button className="min-h-10 rounded-xl border border-jaman-border bg-white px-3.5 text-xs font-bold text-jaman-navy hover:border-[#FDBA74] hover:text-jaman-saffronText transition-colors" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            Quick service {expanded ? '−' : '+'}
          </button>
          <button
            disabled={cart.items.length > 0}
            className="min-h-10 rounded-xl border border-jaman-border bg-white px-3.5 text-xs font-bold text-jaman-navy hover:border-[#FDBA74] hover:text-jaman-saffronText transition-colors disabled:opacity-40 disabled:hover:border-jaman-border disabled:hover:text-jaman-navy"
            onClick={() => {
              const repeated = repeatLastOrder();
              setNotice(repeated ? 'Previous order restored at current prices. Review before charging.' : 'No previous completed order is available.');
            }}
          >
            Repeat last order
          </button>
          {settings.favoriteItemIds.map((id) => {
            const item = db.menuItems.find((i) => i.id === id);
            return (
              item && (
                <button key={id} disabled={item.isAvailable === false} className="min-h-10 rounded-xl border border-jaman-border bg-white px-3 text-xs font-semibold text-jaman-navy hover:border-[#FDBA74] transition-colors disabled:opacity-40" onClick={() => add(id)}>
                  {item.name}
                </button>
              )
            );
          })}
        </div>
        <PosOperationalShortcuts />
      </div>
      {expanded && (
        <form
          className="flex gap-2 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            const id = settings.barcodeAliases[code] ?? db.menuItems.find((i) => i.sku === code)?.id;
            if (id) {
              add(id);
              setCode('');
            } else setNotice('No dish matches that barcode or SKU.');
          }}
        >
          <label className="flex-1">
            Barcode / SKU
            <input className="w-full rounded-lg border p-2" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan a barcode or enter SKU" />
          </label>
          <button type="submit" className="rounded-lg bg-jaman-navy text-white px-3">
            Add dish
          </button>
        </form>
      )}
      {notice && (
        <p role="status" className="mt-1">
          {notice}
        </p>
      )}
      {cart.items.length > 0 && expanded && <p className="mt-1 text-xs">Finish or hold this cart before repeating another order.</p>}
    </section>
  );
}
