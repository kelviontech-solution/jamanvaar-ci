import { useEffect, useState } from 'react';
import { ops, type MenuReview, type Versioned } from './operationsClient';
type Window = {
  id: string;
  title: string;
  version: number;
  days: number[];
  open: string;
  close: string;
  skipDates: string[];
  active: boolean;
  status: string;
  failureReason?: string;
};
export function ServiceConfiguration({ branch, view }: { branch: string; view: 'recurring' | 'cashier' }) {
  const [menu, setMenu] = useState<MenuReview>(),
    [schedules, setSchedules] = useState<Window[]>([]),
    [cashier, setCashier] = useState<Versioned<any>>(),
    [refills, setRefills] = useState<Versioned<any>>(),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const load = async () => {
    try {
      const [m, w, c, r] = await Promise.all([
        ops<MenuReview>(branch, 'menu-review'),
        ops<Window[]>(branch, 'recurring-menus'),
        view === 'cashier' ? ops<Versioned<any>>(branch, 'cashier-settings') : Promise.resolve(undefined),
        view === 'cashier' ? ops<Versioned<any>>(branch, 'refill-policy') : Promise.resolve(undefined)
      ]);
      setMenu(m);
      setSchedules(w);
      setCashier(c);
      setRefills(r);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load settings');
    }
  };
  useEffect(() => {
    void load();
  }, [branch, view]);
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await fn();
      setMessage('Saved successfully.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  const options = menu?.items.map((i) => (
    <option key={i.id} value={i.id}>
      {i.name}
    </option>
  ));
  return (
    <section className="ops-card">
      <h3>{view === 'recurring' ? 'Recurring menu windows' : 'Cashier & refill controls'}</h3>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {!menu ? (
        <p>Loading menu…</p>
      ) : view === 'recurring' ? (
        <>
          <p>
            Times use this branch’s timezone. Prices and availability change only in this branch and restore after the window. Publication stops if an
            unreviewed menu edit conflicts. Overnight service needs two windows.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(() =>
                ops(branch, 'recurring-menus', {
                  title: String(f.get('title')),
                  days: f.getAll('day').map(Number),
                  open: String(f.get('open')),
                  close: String(f.get('close')),
                  skipDates: String(f.get('exceptions'))
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                  reviewedChecksum: menu.checksum,
                  changes: [
                    {
                      itemId: String(f.get('dish')),
                      ...(String(f.get('price')).trim() ? { price: Number(f.get('price')) } : {}),
                      ...(f.get('availability') === 'unchanged' ? {} : { isAvailable: f.get('availability') === 'available' })
                    }
                  ]
                })
              );
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Window name
                <input name="title" maxLength={100} required placeholder="Breakfast specials" />
              </label>
              <div className="ops-actions">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                  <label key={d}>
                    <input type="checkbox" name="day" value={i} defaultChecked={i > 0 && i < 6} />
                    {d}
                  </label>
                ))}
              </div>
              <div className="ops-grid">
                <label>
                  Start
                  <input type="time" name="open" required />
                </label>
                <label>
                  End
                  <input type="time" name="close" required />
                </label>
              </div>
              <label>
                Holiday exceptions (YYYY-MM-DD, separated by commas)
                <input name="exceptions" placeholder="2026-12-25, 2027-01-01" />
              </label>
              <label>
                Dish
                <select aria-label="Dish" required name="dish">
                  <option value="">Choose dish</option>
                  {options}
                </select>
              </label>
              <label>
                Price during window (blank keeps normal price)
                <input type="number" step="0.01" min="0" name="price" />
              </label>
              <label>
                Availability during window
                <select aria-label="Availability during window" name="availability">
                  <option value="unchanged">Keep normal availability</option>
                  <option value="available">Available</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </label>
              <p>Preview: changes apply to this branch only. Other menu drafts may be included in publication; review the current shared menu first.</p>
              <button type="submit">Create reviewed recurring window</button>
            </fieldset>
          </form>
          <h4>Scheduled windows</h4>
          {schedules.length === 0 ? (
            <p>No recurring windows.</p>
          ) : (
            schedules.map((w) => (
              <article key={w.id} className="ops-card">
                <strong>{w.title}</strong>
                <p>
                  {w.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')} · {w.open}–{w.close} ·{' '}
                  {w.active ? 'Active' : 'Outside window'} · {w.status}
                </p>
                {w.failureReason && <p role="alert">{w.failureReason}</p>}
                {w.status !== 'CANCELLED' && (
                  <button disabled={busy} onClick={() => void run(() => ops(branch, `recurring-menus/${w.id}/cancel`, { expectedVersion: w.version }))}>
                    Stop & restore normal settings
                  </button>
                )}
              </article>
            ))
          )}
        </>
      ) : (
        <>
          {cashier && (
            <form
              key={'cashier' + cashier.version}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(() =>
                  ops(branch, 'cashier-settings', {
                    expectedVersion: cashier.version,
                    favoriteItemIds: f.getAll('favorite').map(String),
                    quickAmounts: String(f.get('amounts'))
                      .split(',')
                      .map((s) => Number(s.trim())),
                    paymentMethods: f.getAll('method').map(String),
                    barcodeAliases: Object.fromEntries(
                      String(f.get('barcodes'))
                        .split('\n')
                        .filter((s) => s.trim())
                        .map((line) => line.split('=').map((s) => s.trim()))
                    )
                  })
                );
              }}
            >
              <fieldset disabled={busy}>
                <h4>Faster POS checkout</h4>
                <label>
                  Favourite dishes
                  <select aria-label="Favourite dishes" name="favorite" multiple defaultValue={cashier.data?.favoriteItemIds ?? []} size={6}>
                    {options}
                  </select>
                </label>
                <label>
                  Quick cash amounts (rupees, separated by commas)
                  <input name="amounts" defaultValue={(cashier.data?.quickAmounts ?? [100, 200, 500, 1000, 2000, 5000]).join(', ')} required />
                </label>
                <p>Enabled payment methods</p>
                {['CASH', 'UPI', 'CARD', 'WALLET', 'HOUSE_ACCOUNT'].map((method) => (
                  <label key={method}>
                    <input
                      name="method"
                      type="checkbox"
                      value={method}
                      defaultChecked={(cashier.data?.paymentMethods ?? ['CASH', 'UPI', 'CARD', 'WALLET', 'HOUSE_ACCOUNT']).includes(method)}
                    />
                    {method.replaceAll('_', ' ')}
                  </label>
                ))}
                <label>
                  Optional barcode aliases (one barcode=dish ID per line)
                  <textarea
                    name="barcodes"
                    defaultValue={Object.entries(cashier.data?.barcodeAliases ?? {})
                      .map(([code, id]) => `${code}=${id}`)
                      .join('\n')}
                  />
                </label>
                <details>
                  <summary>Dish IDs for barcode setup</summary>
                  {menu.items.map((i) => (
                    <p key={i.id}>
                      {i.name}: <code>{i.id}</code>
                    </p>
                  ))}
                </details>
                <button type="submit">Save cashier settings</button>
              </fieldset>
            </form>
          )}
          {refills && (
            <form
              key={'refill' + refills.version}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(() =>
                  ops(branch, 'refill-policy', {
                    expectedVersion: refills.version,
                    mealItemId: String(f.get('meal')),
                    includedItemIds: f.getAll('refill').map(String),
                    maxRefillsPerOrder: Number(f.get('max'))
                  })
                );
              }}
            >
              <fieldset disabled={busy}>
                <h4>Thali refill policy</h4>
                <label>
                  Meal that includes refills
                  <select aria-label="Meal that includes refills" name="meal" required defaultValue={refills.data?.mealItemId ?? ''}>
                    <option value="">Choose meal</option>
                    {options}
                  </select>
                </label>
                <label>
                  Included refill dishes
                  <select aria-label="Included refill dishes" name="refill" multiple required size={6} defaultValue={refills.data?.includedItemIds ?? []}>
                    {options}
                  </select>
                </label>
                <label>
                  Maximum included refill portions per order
                  <input type="number" min="1" max="100" name="max" required defaultValue={refills.data?.maxRefillsPerOrder ?? 20} />
                </label>
                <p>Other dishes remain chargeable extras. Captain sends included refills to the dish’s configured kitchen station on the same order.</p>
                <button type="submit">Save refill policy</button>
              </fieldset>
            </form>
          )}
        </>
      )}
    </section>
  );
}
