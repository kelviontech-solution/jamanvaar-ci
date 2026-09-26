import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, QrApi, type Describe, type Menu, type MenuGroup, type MenuItem, type Placed, type Quote } from './api';
import { addLine, emptyCart, itemCount, parseCart, removeLine, setQuantity, toOrderItems, unavailableLines, withAttempt, estimatedSubtotal, type Cart } from './cart';

/** Whole rupees stay whole (₹249); anything with paise shows both digits (₹40.40). */
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const randomId = (n = 20) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

/** localStorage can be unavailable (private mode); everything works without it, it only remembers the cart. */
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* not remembered */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* nothing to remove */ } }
};

function tokenFromPath(): string | null {
  const m = /^\/q\/([A-Za-z0-9_-]{10,200})\/?$/.exec(window.location.pathname);
  return m ? m[1] : null;
}

const sessionId = (() => {
  try {
    let s = sessionStorage.getItem('jv_qr_session');
    if (!s) { s = randomId(16); sessionStorage.setItem('jv_qr_session', s); }
    return s;
  } catch { return randomId(16); }
})();

type Screen = 'MENU' | 'CART' | 'CHECKOUT' | 'STATUS';

export default function App() {
  const token = tokenFromPath();
  if (!token) return <Message title="This QR code is not valid" text="Please scan the code on your table again, or ask a team member." />;
  return <Ordering token={token} />;
}

function Message({ title, text, action }: { title: string; text?: string; action?: { label: string; run: () => void } }) {
  return (
    <main className="center">
      <h1>{title}</h1>
      {text && <p className="muted">{text}</p>}
      {action && <button className="primary" onClick={action.run}>{action.label}</button>}
    </main>
  );
}

function Ordering({ token }: { token: string }) {
  const [info, setInfo] = useState<Describe | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [problem, setProblem] = useState<{ title: string; text: string; retry: boolean } | null>(null);
  const [screen, setScreen] = useState<Screen>('MENU');
  const [cart, setCart] = useState<Cart>(() => parseCart(store.get(`jv_qr_cart:${token}`)));
  const [placed, setPlaced] = useState<Placed | null>(null);
  const etag = useRef<string | null>(null);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      const [d, m] = await Promise.all([QrApi.describe(token, sessionId), QrApi.menu(token, sessionId)]);
      setInfo(d);
      etag.current = m.etag;
      setMenu(m.menu);
    } catch (e) {
      const err = e as ApiError;
      const network = err.code === 'NETWORK';
      setProblem(
        network
          ? { title: 'No connection', text: err.message, retry: true }
          : err.code === 'MENU_NOT_PUBLISHED'
            ? { title: 'The menu is not available yet', text: 'This restaurant has not published its menu for QR ordering. Please order at the counter.', retry: false }
            : { title: 'QR Ordering is currently unavailable', text: err.status === 410 && (err.code === 'QR_REVOKED' || err.code === 'QR_DISABLED') ? err.message : 'QR Ordering is currently unavailable for this restaurant. Please ask a team member.', retry: false }
      );
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // A refresh must not lose the order that was already placed, and must not place it again.
  useEffect(() => {
    const last = store.get(`jv_qr_last:${token}`);
    if (last) QrApi.status(last).then((p) => { setPlaced(p); if (p.status !== 'COMPLETED' && p.status !== 'CANCELLED') setScreen('STATUS'); }).catch(() => store.del(`jv_qr_last:${token}`));
  }, [token]);

  // Keep the menu current while the guest browses: a changed price or a sold-out dish appears without a reload.
  useEffect(() => {
    if (screen === 'STATUS') return;
    const t = setInterval(() => {
      QrApi.menu(token, sessionId, etag.current).then((m) => { if (m.menu) { etag.current = m.etag; setMenu(m.menu); } }).catch(() => undefined);
    }, 60000);
    return () => clearInterval(t);
  }, [token, screen]);

  useEffect(() => { store.set(`jv_qr_cart:${token}`, JSON.stringify(cart)); }, [cart, token]);

  if (problem) return <Message title={problem.title} text={problem.text} action={problem.retry ? { label: 'Try again', run: () => void load() } : undefined} />;
  if (!info || !menu) return <main className="center"><p className="muted">Loading the menu…</p></main>;

  const gone = unavailableLines(cart, new Set(menu.items.map((i) => i.id)));

  return (
    <div className="app">
      <header className="top">
        <div>
          <div className="name">{info.restaurant.name}</div>
          <div className="sub">{info.branch.name}{info.table ? ` · Table ${info.table.displayNumber}` : ' · Menu'}</div>
        </div>
        <div className="mode">{info.mode === 'TABLE_ORDER' ? 'Dine-in ordering' : 'Order'}</div>
      </header>

      {screen === 'MENU' && <MenuScreen info={info} menu={menu} cart={cart} setCart={setCart} onCart={() => setScreen('CART')} placed={placed} onStatus={() => setScreen('STATUS')} />}
      {screen === 'CART' && <CartScreen token={token} cart={cart} setCart={setCart} gone={gone.map((g) => g.key)} onBack={() => setScreen('MENU')} onNext={() => setScreen('CHECKOUT')} />}
      {screen === 'CHECKOUT' && (
        <Checkout token={token} info={info} cart={cart} setCart={setCart} onBack={() => setScreen('CART')}
          onPlaced={(p) => { store.set(`jv_qr_last:${token}`, p.publicOrderId); setPlaced(p); setCart(emptyCart()); setScreen('STATUS'); }} />
      )}
      {screen === 'STATUS' && placed && <StatusScreen placed={placed} setPlaced={setPlaced} showStatus={info.ordering.settings.showOrderStatus} onMore={() => setScreen('MENU')} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------ menu

function MenuScreen({ info, menu, cart, setCart, onCart, placed, onStatus }: { info: Describe; menu: Menu; cart: Cart; setCart: (c: Cart) => void; onCart: () => void; placed: Placed | null; onStatus: () => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const groups = useMemo(() => new Map(menu.modifierGroups.map((g) => [g.id, g])), [menu]);
  const visible = menu.items.filter((i) => (category === 'ALL' || i.categoryId === category) && (!query || `${i.name} ${i.description ?? ''}`.toLowerCase().includes(query.toLowerCase())));

  const quickAdd = (item: MenuItem) => {
    // A dish with nothing to choose goes straight into the cart; one with options (or a required choice) opens the sheet.
    const needsChoice = item.modifierGroupIds.some((id) => groups.get(id)?.isRequired || (info.ordering.settings.allowModifiers && !!groups.get(id)));
    if (needsChoice) return setPicking(item);
    setCart(addLine(cart, { itemId: item.id, name: item.name, unitPrice: item.price, quantity: 1, optionIds: [], optionNames: [] }));
  };

  return (
    <>
      {placed && placed.status !== 'COMPLETED' && placed.status !== 'CANCELLED' && (
        <button className="banner" onClick={onStatus}>Your order {placed.orderNumber ?? ''} is {placed.status.toLowerCase()} — view status</button>
      )}
      <div className="search"><input type="search" placeholder="Search food…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the menu" /></div>
      <nav className="chips" aria-label="Categories">
        <button className={category === 'ALL' ? 'chip on' : 'chip'} onClick={() => setCategory('ALL')}>All</button>
        {menu.categories.map((c) => <button key={c.id} className={category === c.id ? 'chip on' : 'chip'} onClick={() => setCategory(c.id)}>{c.name}</button>)}
      </nav>
      <ul className="items">
        {visible.map((i) => (
          <li key={i.id} className="item">
            {i.imageUrl && <img src={i.imageUrl} alt="" loading="lazy" />}
            <div className="grow">
              <div className="iname">{i.name}</div>
              {i.description && <div className="idesc">{i.description}</div>}
              <div className="price">{inr(i.price)}</div>
            </div>
            <button className="add" onClick={() => quickAdd(i)} aria-label={`Add ${i.name}`}>Add</button>
          </li>
        ))}
        {visible.length === 0 && <li className="muted pad">Nothing matches your search.</li>}
      </ul>
      {itemCount(cart) > 0 && (
        <button className="cartbar" onClick={onCart}><span>{itemCount(cart)} item{itemCount(cart) === 1 ? '' : 's'}</span><span>{inr(estimatedSubtotal(cart))}</span><span>View Cart</span></button>
      )}
      {picking && <Picker item={picking} groups={picking.modifierGroupIds.map((id) => groups.get(id)).filter((g): g is MenuGroup => !!g)} allowMods={info.ordering.settings.allowModifiers} allowNotes={info.ordering.settings.allowCustomerNotes} onClose={() => setPicking(null)}
        onAdd={(line) => { setCart(addLine(cart, line)); setPicking(null); }} />}
    </>
  );
}

function Picker({ item, groups, allowMods, allowNotes, onClose, onAdd }: { item: MenuItem; groups: MenuGroup[]; allowMods: boolean; allowNotes: boolean; onClose: () => void; onAdd: (l: { itemId: string; name: string; unitPrice: number; quantity: number; optionIds: string[]; optionNames: string[]; note?: string }) => void }) {
  const shown = allowMods ? groups : groups.filter((g) => g.isRequired);
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const toggle = (g: MenuGroup, optionId: string) => {
    const cur = chosen[g.id] ?? [];
    const single = g.maxSelections === 1;
    const next = cur.includes(optionId) ? cur.filter((x) => x !== optionId) : single ? [optionId] : g.maxSelections > 0 && cur.length >= g.maxSelections ? cur : [...cur, optionId];
    setChosen({ ...chosen, [g.id]: next });
  };
  const missing = shown.find((g) => (g.isRequired || g.minSelections > 0) && (chosen[g.id]?.length ?? 0) < Math.max(1, g.minSelections));
  const optionIds = Object.values(chosen).flat();
  const all = shown.flatMap((g) => g.options);
  const optionNames = optionIds.map((id) => all.find((o) => o.id === id)?.name ?? '');
  const unit = item.price + optionIds.reduce((s, id) => s + (all.find((o) => o.id === id)?.priceDelta ?? 0), 0);
  return (
    <div className="sheet" role="dialog" aria-label={item.name}>
      <div className="panel">
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <h2>{item.name}</h2>
        {shown.map((g) => (
          <fieldset key={g.id}>
            <legend>{g.name}{g.isRequired ? ' (required)' : g.maxSelections > 0 ? ` (up to ${g.maxSelections})` : ''}</legend>
            {g.options.map((o) => (
              <label key={o.id} className="opt">
                <input type={g.maxSelections === 1 ? 'radio' : 'checkbox'} name={g.id} checked={(chosen[g.id] ?? []).includes(o.id)} onChange={() => toggle(g, o.id)} />
                <span>{o.name}</span><span className="muted">{o.priceDelta ? `+${inr(o.priceDelta)}` : ''}</span>
              </label>
            ))}
          </fieldset>
        ))}
        {allowNotes && <textarea placeholder="Special instructions (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
        <div className="qty"><button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Fewer">−</button><b>{qty}</b><button onClick={() => setQty(Math.min(50, qty + 1))} aria-label="More">+</button></div>
        <button className="primary" disabled={!!missing} onClick={() => onAdd({ itemId: item.id, name: item.name, unitPrice: unit, quantity: qty, optionIds, optionNames, note: note.trim() || undefined })}>
          {missing ? `Choose ${missing.name}` : `Add ${qty} · ${inr(unit * qty)}`}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ cart, checkout

function useQuote(token: string, cart: Cart) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = JSON.stringify(toOrderItems(cart));
  useEffect(() => {
    if (cart.lines.length === 0) { setQuote(null); return; }
    const t = setTimeout(() => {
      QrApi.quote(token, JSON.parse(items)).then((q) => { setQuote(q); setError(null); }).catch((e: ApiError) => { setQuote(null); setError(e.message); });
    }, 350);
    return () => clearTimeout(t);
  }, [token, items, cart.lines.length]);
  return { quote, error };
}

function CartScreen({ token, cart, setCart, gone, onBack, onNext }: { token: string; cart: Cart; setCart: (c: Cart) => void; gone: string[]; onBack: () => void; onNext: () => void }) {
  const { quote, error } = useQuote(token, cart);
  return (
    <section className="page">
      <button className="link" onClick={onBack}>← Menu</button>
      <h2>Your cart</h2>
      {cart.lines.length === 0 && <p className="muted">Your cart is empty.</p>}
      <ul className="lines">
        {cart.lines.map((l) => (
          <li key={l.key} className={gone.includes(l.key) ? 'gone' : ''}>
            <div className="grow">
              <div className="iname">{l.name}</div>
              {l.optionNames.length > 0 && <div className="idesc">{l.optionNames.join(', ')}</div>}
              {l.note && <div className="idesc">“{l.note}”</div>}
              {gone.includes(l.key) && <div className="warn">No longer available. Please remove it.</div>}
            </div>
            <div className="qty small"><button onClick={() => setCart(setQuantity(cart, l.key, l.quantity - 1))} aria-label="Fewer">−</button><b>{l.quantity}</b><button onClick={() => setCart(setQuantity(cart, l.key, l.quantity + 1))} aria-label="More">+</button></div>
            <button className="link danger" onClick={() => setCart(removeLine(cart, l.key))}>Remove</button>
          </li>
        ))}
      </ul>
      {error && <p className="warn">{error}</p>}
      {quote && <Totals quote={quote} />}
      <button className="primary" disabled={cart.lines.length === 0 || gone.length > 0 || !quote} onClick={onNext}>Checkout</button>
    </section>
  );
}

function Totals({ quote }: { quote: Quote }) {
  return (
    <dl className="totals">
      <div><dt>Subtotal</dt><dd>{inr(quote.subtotal)}</dd></div>
      <div><dt>Tax</dt><dd>{inr(quote.tax)}</dd></div>
      <div className="grand"><dt>Total</dt><dd>{inr(quote.total)}</dd></div>
    </dl>
  );
}

function Checkout({ token, info, cart, setCart, onBack, onPlaced }: { token: string; info: Describe; cart: Cart; setCart: (c: Cart) => void; onBack: () => void; onPlaced: (p: Placed) => void }) {
  const s = info.ordering.settings;
  const { quote } = useQuote(token, cart);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY' | ''>('');
  const [tableNumber, setTableNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuOnly = info.mode === 'MENU_ONLY';
  const ready = (!s.requireCustomerName || name.trim()) && (!s.requireCustomerPhone || phone.trim()) && (!menuOnly || orderType === 'TAKEAWAY' || (orderType === 'DINE_IN' && tableNumber.trim()));

  const submit = async () => {
    if (busy) return; // a double tap is ignored here and made harmless on the server by the attempt key
    setBusy(true);
    setError(null);
    const attempt = withAttempt(cart, () => randomId(24));
    if (attempt !== cart) setCart(attempt);
    try {
      const placed = await QrApi.place(token, {
        items: toOrderItems(attempt),
        paymentMethod: 'CASH_AT_COUNTER',
        idempotencyKey: attempt.attemptKey,
        ...(name.trim() ? { customerName: name.trim() } : {}),
        ...(phone.trim() ? { customerPhone: phone.trim() } : {}),
        ...(notes.trim() && s.allowCustomerNotes ? { orderNotes: notes.trim() } : {}),
        ...(menuOnly ? { orderType, ...(orderType === 'DINE_IN' ? { tableNumber: tableNumber.trim() } : {}) } : {})
      }, sessionId);
      onPlaced(placed);
    } catch (e) {
      // The same attempt key is kept: pressing again after a timeout returns the original order instead of a second one.
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page">
      <button className="link" onClick={onBack}>← Cart</button>
      <h2>Checkout</h2>
      <p className="muted">{info.restaurant.name}{info.table ? ` · Table ${info.table.displayNumber}` : ''}</p>
      <ul className="lines compact">{cart.lines.map((l) => <li key={l.key}><span>{l.name} × {l.quantity}</span></li>)}</ul>
      {menuOnly && (
        <fieldset><legend>How would you like it?</legend>
          <label className="opt"><input type="radio" name="ot" checked={orderType === 'DINE_IN'} onChange={() => setOrderType('DINE_IN')} /> <span>Dine-in</span></label>
          <label className="opt"><input type="radio" name="ot" checked={orderType === 'TAKEAWAY'} onChange={() => setOrderType('TAKEAWAY')} /> <span>Takeaway</span></label>
          {orderType === 'DINE_IN' && <input placeholder="Your table number" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} maxLength={20} />}
        </fieldset>
      )}
      <input placeholder={s.requireCustomerName ? 'Your name' : 'Your name (optional)'} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
      <input placeholder={s.requireCustomerPhone ? 'Mobile number' : 'Mobile number (optional)'} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} autoComplete="tel" />
      {s.allowCustomerNotes && <textarea placeholder="Note for the kitchen (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />}
      {quote && <Totals quote={quote} />}
      <p className="muted">You pay at the counter when you are done. No payment is taken here.</p>
      {error && <p className="warn" role="alert">{error}</p>}
      <button className="primary" disabled={busy || !quote || !ready} onClick={() => void submit()}>{busy ? 'Placing…' : quote ? `Place order · ${inr(quote.total)}` : 'Place order'}</button>
    </section>
  );
}

// ------------------------------------------------------------------------------------------ status

const STEPS: Array<[Placed['status'], string]> = [['RECEIVED', 'Order received'], ['PREPARING', 'Preparing'], ['READY', 'Ready'], ['COMPLETED', 'Completed']];

function StatusScreen({ placed, setPlaced, showStatus, onMore }: { placed: Placed; setPlaced: (p: Placed) => void; showStatus: boolean; onMore: () => void }) {
  useEffect(() => {
    if (placed.status === 'COMPLETED' || placed.status === 'CANCELLED') return;
    const t = setInterval(() => { QrApi.status(placed.publicOrderId).then(setPlaced).catch(() => undefined); }, 5000);
    return () => clearInterval(t);
  }, [placed.publicOrderId, placed.status, setPlaced]);
  const at = STEPS.findIndex(([s]) => s === placed.status);
  return (
    <section className="page center-text">
      <h2>{placed.status === 'CANCELLED' ? 'Order cancelled' : 'Thank you!'}</h2>
      <p className="big">{placed.orderNumber ?? placed.publicOrderId}</p>
      <p className="muted">Reference {placed.publicOrderId}{placed.table ? ` · Table ${placed.table}` : ''} · {inr(placed.total)}</p>
      {showStatus && placed.status !== 'CANCELLED' && (
        <ol className="steps">{STEPS.map(([s, label], i) => <li key={s} className={i <= at ? 'done' : ''}>{label}</li>)}</ol>
      )}
      {placed.status === 'CANCELLED' && <p className="warn">The restaurant could not take this order. Please ask a team member.</p>}
      <p className="muted">Pay at the counter when you are done.</p>
      <button className="primary" onClick={onMore}>Order more</button>
    </section>
  );
}
