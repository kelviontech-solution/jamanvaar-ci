import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, QrApi, imageSrc, type Describe, type Menu, type MenuGroup, type MenuItem, type Placed, type Quote } from './api';
import { addLine, emptyCart, itemCount, parseCart, removeLine, setQuantity, toOrderItems, unavailableLines, withAttempt, estimatedSubtotal, type Cart } from './cart';

/** Money in the restaurant's own currency (from the server). Whole amounts stay whole; anything with a fraction shows both digits. */
let currencyCode = 'INR';
const inr = (n: number) => {
  try {
    return new Intl.NumberFormat(currencyCode === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency: currencyCode, minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currencyCode} ${n.toFixed(Number.isInteger(n) ? 0 : 2)}`;
  }
};
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

// The session is issued and signed by the server (once per browser tab); a made-up one would simply be ignored.
let sessionId = '';
// The menu version this guest is looking at; sent with the order so a menu published meanwhile is never charged silently.
let seenMenuVersion: number | undefined;
let sessionRequest: Promise<string> | null = null;
async function ensureSession(): Promise<string> {
  if (sessionId) return sessionId;
  if (sessionRequest) return sessionRequest;
  sessionRequest = (async () => {
    try { sessionId = sessionStorage.getItem('jv_qr_session2') ?? ''; } catch { /* storage unavailable */ }
    if (!sessionId) {
      sessionId = (await QrApi.session()).session;
      try { sessionStorage.setItem('jv_qr_session2', sessionId); } catch { /* storage unavailable */ }
    }
    return sessionId;
  })().finally(() => { sessionRequest = null; });
  return sessionRequest;
}

type Screen = 'MENU' | 'CART' | 'CHECKOUT' | 'STATUS';
const currentScreen = (): Screen => ({'#menu':'MENU','#cart':'CART','#checkout':'CHECKOUT','#status':'STATUS'} as Record<string,Screen>)[location.hash] ?? 'MENU';
const paymentUrl = (url: string | null | undefined) => {
  try { const value=new URL(url ?? ''); return value.protocol==='https:' && (value.hostname==='rzp.io' || value.hostname==='razorpay.com' || value.hostname.endsWith('.razorpay.com')) ? value.href : null; } catch { return null; }
};

function Icon({ name, className = '' }: { name: 'bag' | 'search' | 'arrow' | 'shield' | 'check' | 'plate'; className?: string }) {
  const paths = { bag: 'M6 7h12l2 14H4L6 7Zm3 0V5a3 3 0 0 1 6 0v2', search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z', arrow: 'M5 12h14m-6-6 6 6-6 6', shield: 'm12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Zm-4 9 3 3 5-5', check: 'm5 12 4 4L19 6', plate: 'M3 17h18M5 15a7 7 0 0 1 14 0M12 8V5m-3 0h6M4 20h16' };
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function DishPhoto({ source, name, className = '' }: { source?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source, name]);
  const fallback = imageSrc('/assets/menu/common/menu-placeholder-v2.svg');
  return <img className={className} src={failed ? fallback : imageSrc(source, name) || fallback} alt={name} loading="lazy" decoding="async" onError={() => { if (!failed) setFailed(true); }} />;
}

export default function App() {
  const token = tokenFromPath();
  if (!token) return <Message title="This QR code is not valid" text="Please scan the code on your table again, or ask a team member." />;
  return <Ordering token={token} />;
}

function Message({ title, text, action }: { title: string; text?: string; action?: { label: string; run: () => void } }) {
  return (
    <main className="center">
      <img className="message-logo" src={imageSrc('/assets/branding/jamanvaar-logo.png')} alt="Jamanvaar by Kelviontech" />
      <Icon name="plate" className="message-icon" />
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
  const [screen, setScreen] = useState<Screen>(currentScreen);
  const navigate = (target: Screen) => { const url=new URL(location.href); if(target!=='STATUS')url.searchParams.delete('order');url.hash=target.toLowerCase();history.pushState({},'',url);setScreen(target); };
  useEffect(()=>{const restore=()=>setScreen(currentScreen());window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[]);
  const [cart, setCart] = useState<Cart>(() => parseCart(store.get(`jv_qr_cart:${token}`)));
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [restoreError,setRestoreError]=useState<string|null>(null);
  const [restoreAttempt,setRestoreAttempt]=useState(0);
  const etag = useRef<string | null>(null);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      await ensureSession();
      const [d, m] = await Promise.all([QrApi.describe(token, sessionId), QrApi.menu(token, sessionId)]);
      currencyCode = d.currency || 'INR';
      setInfo(d);
      seenMenuVersion = m.menu?.menuVersion ?? seenMenuVersion;
      etag.current = m.etag;
      setMenu(m.menu);
    } catch (e) {
      const err = e as ApiError;
      const network = err.code === 'NETWORK' || err.status >= 500;
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
    const returned = new URLSearchParams(location.search).get('order');
    const last = returned || store.get(`jv_qr_last:${token}`);
    let active = true;
    if (last) QrApi.status(last).then((p) => { if(!active)return;setPlaced(p);setRestoreError(null);store.set(`jv_qr_last:${token}`,p.publicOrderId);if (returned || location.hash==='#status' || (p.status !== 'COMPLETED' && p.status !== 'CANCELLED' && !location.hash)) setScreen('STATUS'); })
      .catch((error:ApiError) => { if(!active)return;if(error.status===404)store.del(`jv_qr_last:${token}`);setRestoreError(error.message); });
    return()=>{active=false;};
  }, [token,restoreAttempt]);

  // Keep the menu current while the guest browses: a changed price or a sold-out dish appears without a reload.
  useEffect(() => {
    if (screen === 'STATUS') return;
    let active=true, running=false;
    const refresh=async()=>{
      if(running||document.hidden)return;
      running=true;
      try {
        const [m,d]=await Promise.all([QrApi.menu(token,sessionId,etag.current),QrApi.describe(token,sessionId)]);
        if(!active)return;
        setInfo(d);
        if(m.menu){etag.current=m.etag;seenMenuVersion=m.menu.menuVersion;setMenu(m.menu);}
      } catch { /* Existing menu remains visible; checkout always checks current server availability. */ }
      finally {running=false;}
    };
    const t=setInterval(()=>void refresh(),60000);
    const onFocus=()=>void refresh();
    window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
    return()=>{active=false;clearInterval(t);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
  }, [token, screen]);

  useEffect(() => { store.set(`jv_qr_cart:${token}`, JSON.stringify(cart)); }, [cart, token]);

  if (problem && placed && screen === 'STATUS') return <StatusScreen placed={placed} setPlaced={setPlaced} showStatus onMore={()=>void load().then(()=>navigate('MENU'))} />;
  if (problem) return <Message title={problem.title} text={problem.text} action={problem.retry ? { label: 'Try again', run: () => { setRestoreAttempt(a=>a+1);void load(); } } : undefined} />;
  if (!info || !menu) return <Message title="Setting your table" text="Your restaurant’s fresh menu is on its way…" />;

  const gone = unavailableLines(cart, new Set(menu.items.map((i) => i.id)));

  return (
    <div className="app" style={info.branding?.accentColor ? ({ ['--saffron' as string]: info.branding.accentColor } as React.CSSProperties) : undefined}>
      <header className="top">
        <img src={imageSrc(info.branding?.logoUrl || '/assets/branding/jamanvaar-logo.png')} alt={info.branding?.logoUrl ? info.restaurant.name : 'Jamanvaar by Kelviontech'} className="logo" />
        <div className="restaurant-heading">
          <div className="name">{info.branding?.welcomeTitle || info.restaurant.name}</div>
          <div className="sub">{info.branch.name}{info.table ? ` · Table ${info.table.displayNumber}` : ' · Menu'}</div>
        </div>
        <div className="mode"><span className="live-dot" />{info.table ? `Table ${info.table.displayNumber}` : 'Guest menu'}</div>
      </header>
      {screen !== 'MENU' && <nav className="journey" aria-label="Order progress">{(['MENU', 'CART', 'CHECKOUT', 'STATUS'] as Screen[]).map((step, index) => <span key={step} className={step === screen ? 'current' : ''} aria-current={step === screen ? 'step' : undefined}><b>{index + 1}</b>{({ MENU: 'Menu', CART: 'Cart', CHECKOUT: 'Checkout', STATUS: 'Your order' })[step]}</span>)}</nav>}

      {screen === 'MENU' && <MenuScreen info={info} menu={menu} cart={cart} setCart={setCart} onCart={() => navigate('CART')} placed={placed} onStatus={() => navigate('STATUS')} />}
      {screen === 'CART' && <CartScreen token={token} menu={menu} cart={cart} setCart={setCart} gone={gone.map((g) => g.key)} onBack={() => navigate('MENU')} onNext={() => navigate('CHECKOUT')} />}
      {screen === 'CHECKOUT' && (
        <Checkout token={token} info={info} cart={cart} setCart={setCart} onBack={() => navigate('CART')}
          onPlaced={(p) => { store.set(`jv_qr_last:${token}`, p.publicOrderId); setPlaced(p); setCart(emptyCart()); navigate('STATUS'); const url=paymentUrl(p.payment?.url);if(url)location.assign(url); }} />
      )}
      {screen === 'STATUS' && placed && <StatusScreen placed={placed} setPlaced={setPlaced} showStatus={info.ordering.settings.showOrderStatus} onMore={() => navigate('MENU')} />}
      {screen === 'STATUS' && !placed && <Message title={restoreError?"Could not restore your order":"Checking your order"} text={restoreError||"Please wait while we restore the order status."} action={restoreError?{label:'Check again',run:()=>setRestoreAttempt(a=>a+1)}:{label:'Back to menu',run:()=>navigate('MENU')}} />}
      {info.branding?.footerMessage && <footer className="muted pad" style={{ textAlign: 'center' }}>{info.branding.footerMessage}</footer>}
      <footer className="brand-footer">Thoughtfully served with <strong>Jamanvaar</strong><span>by Kelviontech</span></footer>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ menu

function MenuScreen({ info, menu, cart, setCart, onCart, placed, onStatus }: { info: Describe; menu: Menu; cart: Cart; setCart: (c: Cart) => void; onCart: () => void; placed: Placed | null; onStatus: () => void }) {
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState(() => store.get('jv_qr_language') || 'en');
  const [diet, setDiet] = useState('ALL');
  const local = <T extends { name: string; description?: string; translations?: Record<string, {name: string; description?: string}> }>(value: T): T => ({...value,...value.translations?.[language]});
  const languages = ['en','hi','gu'].filter(l => l==='en'||menu.items.some(i=>i.translations?.[l])||menu.categories.some(c=>c.translations?.[l]));
  const diets = [...new Set(menu.items.map(i=>i.dietaryType).filter((d): d is string=>!!d))];
  const [category, setCategory] = useState<string>('ALL');
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const groups = useMemo(() => new Map(menu.modifierGroups.map((g) => [g.id, g])), [menu]);
  const visible = menu.items.map(local).filter((i) => (diet==='ALL'||i.dietaryType===diet) && (category === 'ALL' || i.categoryId === category) && (!query || `${i.name} ${i.description ?? ''}`.toLowerCase().includes(query.toLowerCase())));

  const quickAdd = (item: MenuItem) => {
    // A dish with nothing to choose goes straight into the cart; one with options (or a required choice) opens the sheet.
    const needsChoice = (item.minQuantity ?? 1) > 1 || item.modifierGroupIds.some((id) => groups.get(id)?.isRequired || (info.ordering.settings.allowModifiers && !!groups.get(id)));
    if (needsChoice) return setPicking(item);
    setCart(addLine(cart, { itemId: item.id, name: item.name, unitPrice: item.price, quantity: 1, optionIds: [], optionNames: [] }));
  };

  return (
    <>
      <section className="menu-hero">
        <div className="hero-copy"><span className="eyebrow">FRESH FROM OUR KITCHEN</span><h1>Good food.<br /><em>Great company.</em></h1><p>{info.branding?.welcomeMessage || 'Pick your favourites, make them yours, and let us take care of the rest.'}</p><div className="hero-note"><Icon name="plate" />{info.table ? `Delivered to table ${info.table.displayNumber}` : 'Prepared fresh for you'}</div></div>
        <div className="hero-photo"><DishPhoto source={(menu.items.find(i => i.imageUrl && /\.(?:jpe?g|png|webp)(?:\?|$)|\/public\/qr\/images\//i.test(i.imageUrl)) || menu.items.find(i => i.imageUrl && !i.imageUrl.includes('placeholder')))?.imageUrl} name="From our menu" /><span>{info.restaurant.name}</span></div>
      </section>
      {placed && placed.status !== 'COMPLETED' && placed.status !== 'CANCELLED' && (
        <button className="banner" onClick={onStatus}>Your order {placed.orderNumber ?? ''} is {placed.status.toLowerCase()} — view status</button>
      )}
      <div className="search"><Icon name="search" /><input type="search" placeholder="Find your next favourite…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the menu" /></div>
      {languages.length>1 && <nav className="chips" aria-label="Language">{languages.map(l=><button key={l} className={language===l?'chip on':'chip'} onClick={()=>{setLanguage(l);store.set('jv_qr_language',l);}}>{({en:'English',hi:'\u0939\u093f\u0928\u094d\u0926\u0940',gu:'\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0'} as Record<string,string>)[l]}</button>)}</nav>}
      {diets.length>0 && <nav className="chips" aria-label="Dietary filters"><button className={diet==='ALL'?'chip on':'chip'} onClick={()=>setDiet('ALL')}>All diets</button>{diets.map(d=><button key={d} className={diet===d?'chip on':'chip'} onClick={()=>setDiet(d)}>{d.replaceAll('_',' ')}</button>)}</nav>}
      <nav className="chips" aria-label="Categories">
        <button className={category === 'ALL' ? 'chip on' : 'chip'} onClick={() => setCategory('ALL')}>All</button>
        {menu.categories.map((c) => <button key={c.id} className={category === c.id ? 'chip on' : 'chip'} onClick={() => setCategory(c.id)}>{local(c).name}</button>)}
      </nav>
      <div className="menu-title"><div><span className="eyebrow">MADE FOR YOUR APPETITE</span><h2>{category === 'ALL' ? 'Explore our menu' : local(menu.categories.find(c => c.id === category) || { name: 'Our menu' }).name}</h2></div><span>{visible.length} dishes</span></div>
      <ul className="items">
        {visible.map((i) => (
          <li key={i.id} className="item">
            <DishPhoto source={i.imageUrl} name={i.name} />
            <div className="grow">
              <div className="iname">{i.name}</div>{i.dietaryType&&<small className={`diet ${i.dietaryType === 'NON_VEG' ? 'nonveg' : ''}`}><span />{i.dietaryType.replaceAll('_',' ')}</small>}
              {i.description && <div className="idesc">{i.description}</div>}
              <div className="price">{inr(i.price)}</div>
            </div>
            <button className="add" onClick={() => quickAdd(i)} aria-label={`Add ${i.name}`}>Add</button>
          </li>
        ))}
        {visible.length === 0 && <li className="muted pad">{query || category !== 'ALL' || diet !== 'ALL' ? 'Nothing matches your search.' : 'No dishes are available right now. Please ask a team member.'}</li>}
      </ul>
      {itemCount(cart) > 0 && (
        <button className="cartbar" onClick={onCart}><Icon name="bag" /><span>{itemCount(cart)} item{itemCount(cart) === 1 ? '' : 's'}<small>{inr(estimatedSubtotal(cart))}</small></span><span className="cart-action">View Cart <Icon name="arrow" /></span></button>
      )}
      {picking && <Picker item={picking} groups={picking.modifierGroupIds.map((id) => groups.get(id)).filter((g): g is MenuGroup => !!g)} allowMods={info.ordering.settings.allowModifiers} allowNotes={info.ordering.settings.allowCustomerNotes} onClose={() => setPicking(null)}
        onAdd={(line) => { setCart(addLine(cart, line)); setPicking(null); }} />}
    </>
  );
}

function Picker({ item, groups, allowMods, allowNotes, onClose, onAdd }: { item: MenuItem; groups: MenuGroup[]; allowMods: boolean; allowNotes: boolean; onClose: () => void; onAdd: (l: { itemId: string; name: string; unitPrice: number; quantity: number; optionIds: string[]; optionNames: string[]; note?: string }) => void }) {
  const shown = allowMods ? groups : groups.filter((g) => g.isRequired);
  // Options the restaurant pre-selected start ticked; the guest can change them.
  const [chosen, setChosen] = useState<Record<string, string[]>>(() => Object.fromEntries(shown.map((g) => [g.id, g.options.filter((o) => o.isDefault).slice(0, g.maxSelections > 0 ? g.maxSelections : undefined).map((o) => o.id)])));
  const minQ = item.minQuantity ?? 1;
  const maxQ = item.maxQuantity ?? 50;
  const [qty, setQty] = useState(minQ);
  const [note, setNote] = useState('');
  const toggle = (g: MenuGroup, optionId: string) => {
    const cur = chosen[g.id] ?? [];
    const single = g.maxSelections === 1;
    const next = cur.includes(optionId) ? cur.filter((x) => x !== optionId) : single ? [optionId] : g.maxSelections > 0 && cur.length >= g.maxSelections ? cur : [...cur, optionId];
    setChosen({ ...chosen, [g.id]: next });
  };
  const needed = (g: MenuGroup) => (g.isRequired || g.minSelections > 0 ? Math.max(1, g.minSelections) : 0);
  const missing = shown.find((g) => (chosen[g.id]?.length ?? 0) < needed(g));
  const rule = (g: MenuGroup) => {
    const n = needed(g);
    if (g.maxSelections === 1) return n ? 'Choose 1 (required)' : 'Choose up to 1';
    if (n && g.maxSelections > 0) return n === g.maxSelections ? `Choose ${n} (required)` : `Choose ${n} to ${g.maxSelections} (required)`;
    if (n) return `Choose at least ${n} (required)`;
    return g.maxSelections > 0 ? `Choose up to ${g.maxSelections}` : 'Choose any';
  };
  const optionIds = Object.values(chosen).flat();
  const all = shown.flatMap((g) => g.options);
  const optionNames = optionIds.map((id) => all.find((o) => o.id === id)?.name ?? '');
  const unit = item.price + optionIds.reduce((s, id) => s + (all.find((o) => o.id === id)?.priceDelta ?? 0), 0);
  return (
    <div className="sheet" role="dialog" aria-label={item.name}>
      <div className="panel">
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <DishPhoto source={item.imageUrl} name={item.name} className="picker-photo" />
        <span className="eyebrow">MAKE IT YOURS</span><h2>{item.name}</h2>
        {shown.map((g) => (
          <fieldset key={g.id}>
            <legend>{g.name} <span className="muted">{rule(g)}{(chosen[g.id]?.length ?? 0) > 0 && g.maxSelections > 1 ? ` · ${chosen[g.id]!.length} chosen` : ''}</span></legend>
            {g.description && <p className="muted">{g.description}</p>}
            {g.options.map((o) => (
              <label key={o.id} className="opt">
                <input type={g.maxSelections === 1 ? 'radio' : 'checkbox'} name={g.id} checked={(chosen[g.id] ?? []).includes(o.id)} onChange={() => toggle(g, o.id)} />
                <span>{o.name}{o.description ? <small className="muted"> {o.description}</small> : null}</span><span className="muted">{o.priceDelta ? `+${inr(o.priceDelta)}` : ''}</span>
              </label>
            ))}
          </fieldset>
        ))}
        {allowNotes && item.allowInstructions !== false && <textarea placeholder="Special instructions (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
        <div className="qty"><button onClick={() => setQty(Math.max(minQ, qty - 1))} disabled={qty <= minQ} aria-label="Fewer">−</button><b>{qty}</b><button onClick={() => setQty(Math.min(maxQ, qty + 1))} disabled={qty >= maxQ} aria-label="More">+</button>{minQ > 1 && <span className="muted"> minimum {minQ}</span>}{maxQ < 50 && <span className="muted"> maximum {maxQ}</span>}</div>
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
    let active=true;
    setQuote(null);
    if (cart.lines.length === 0) { setQuote(null); return; }
    const t = setTimeout(() => {
      QrApi.quote(token, JSON.parse(items)).then((q) => { if(active){setQuote(q);setError(null);} }).catch((e: ApiError) => { if(active){setQuote(null);setError(e.message);} });
    }, 350);
    return () => {active=false;clearTimeout(t);};
  }, [token, items, cart.lines.length, seenMenuVersion]);
  return { quote, error };
}

function CartScreen({ token, menu, cart, setCart, gone, onBack, onNext }: { token: string; menu: Menu; cart: Cart; setCart: (c: Cart) => void; gone: string[]; onBack: () => void; onNext: () => void }) {
  const { quote, error } = useQuote(token, cart);
  return (
    <section className="page">
      <button className="link" onClick={onBack}>← Menu</button>
      <span className="eyebrow">YOUR PICKS, PREPARED FRESH</span><h2>Your cart</h2>
      {cart.lines.length === 0 && <p className="muted">Your cart is empty.</p>}
      <ul className="lines">
        {cart.lines.map((l) => (
          <li key={l.key} className={gone.includes(l.key) ? 'gone' : ''}>
            <DishPhoto source={menu.items.find(i => i.id === l.itemId)?.imageUrl} name={l.name} className="cart-photo" />
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
  const { quote, error: quoteError } = useQuote(token, cart);
  const [paymentMethod,setPaymentMethod]=useState<'CASH_AT_COUNTER'|'ONLINE'>(()=>s.allowCash?'CASH_AT_COUNTER':'ONLINE');
  useEffect(() => { if (paymentMethod === 'ONLINE' && !s.allowOnlinePayment && s.allowCash) setPaymentMethod('CASH_AT_COUNTER'); else if (paymentMethod === 'CASH_AT_COUNTER' && !s.allowCash && s.allowOnlinePayment) setPaymentMethod('ONLINE'); }, [s.allowOnlinePayment, s.allowCash, paymentMethod]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY' | ''>('');
  const [tableNumber, setTableNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const menuOnly = info.mode === 'MENU_ONLY';
  const ready = (!s.requireCustomerName || name.trim()) && (!s.requireCustomerPhone || phone.trim()) && (!menuOnly || orderType === 'TAKEAWAY' || (orderType === 'DINE_IN' && tableNumber.trim()));

  const submit = async () => {
    if (submitLock.current) return; // Latch before React renders, including two taps in the same event turn.
    submitLock.current = true;
    setBusy(true);
    setError(null);
    const attempt = withAttempt(cart, () => randomId(24));
    store.set(`jv_qr_cart:${token}`, JSON.stringify(attempt));
    if (attempt !== cart) setCart(attempt);
    try {
      const placed = await QrApi.place(token, {
        items: toOrderItems(attempt),
        paymentMethod,
        idempotencyKey: attempt.attemptKey,
        ...((quote?.menuVersion ?? seenMenuVersion) !== undefined ? { menuVersion: quote?.menuVersion ?? seenMenuVersion } : {}),
        ...(name.trim() ? { customerName: name.trim() } : {}),
        ...(phone.trim() ? { customerPhone: phone.trim() } : {}),
        ...(notes.trim() && s.allowCustomerNotes ? { orderNotes: notes.trim() } : {}),
        ...(menuOnly ? { orderType, ...(orderType === 'DINE_IN' ? { tableNumber: tableNumber.trim() } : {}) } : {})
      }, sessionId);
      onPlaced(placed);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'MENU_CHANGED') {
        // The restaurant published a new menu with different prices: reload so the cart is checked against it, then the guest confirms.
        setError(err.message);
        setTimeout(() => window.location.reload(), 1800);
      } else {
        // The same attempt key is kept: pressing again after a timeout returns the original order instead of a second one.
        setError(err.message);
      }
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="page">
      <button className="link" onClick={onBack}>← Cart</button>
      <span className="eyebrow">ONE LAST THING</span><h2>Checkout</h2>
      <p className="muted">{info.restaurant.name}{info.table ? ` · Table ${info.table.displayNumber}` : ''}</p>
      <ul className="lines compact">{cart.lines.map((l) => <li key={l.key}><span>{l.name} × {l.quantity}</span></li>)}</ul>
      {menuOnly && (
        <fieldset><legend>How would you like it?</legend>
          <label className="opt"><input type="radio" name="ot" checked={orderType === 'DINE_IN'} onChange={() => setOrderType('DINE_IN')} /> <span>Dine-in</span></label>
          <label className="opt"><input type="radio" name="ot" checked={orderType === 'TAKEAWAY'} onChange={() => setOrderType('TAKEAWAY')} /> <span>Takeaway</span></label>
          {orderType === 'DINE_IN' && <input placeholder="Your table number" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} maxLength={20} />}
        </fieldset>
      )}
      <div className="guest-details"><label>Your name {s.requireCustomerName ? '*' : <small>(optional)</small>}<input placeholder="How should we call you?" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" /></label>
      <label>Mobile number {s.requireCustomerPhone ? '*' : <small>(optional)</small>}<input placeholder="Your mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} autoComplete="tel" /></label>
      {s.allowCustomerNotes && <label>Note for the kitchen <small>(optional)</small><textarea placeholder="Any special requests?" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></label>}</div>
      {quote && <Totals quote={quote} />}
      <fieldset className="payment-options"><legend>How would you like to pay?</legend>
        <label className={`opt payment-card ${paymentMethod === 'CASH_AT_COUNTER' ? 'selected' : ''} ${!s.allowCash ? 'unavailable' : ''}`}><input type="radio" name="payment" disabled={!s.allowCash} checked={paymentMethod==='CASH_AT_COUNTER'} onChange={()=>setPaymentMethod('CASH_AT_COUNTER')} /><span>Pay at counter<small>{s.allowCash ? 'Settle your bill with our team.' : 'Counter payment is unavailable.'}</small></span><Icon name="plate" /></label>
        <label className={`opt payment-card ${paymentMethod === 'ONLINE' ? 'selected' : ''} ${!s.allowOnlinePayment ? 'unavailable' : ''}`}><input type="radio" name="payment" disabled={!s.allowOnlinePayment} checked={paymentMethod==='ONLINE'} onChange={()=>setPaymentMethod('ONLINE')} /><span>Pay online / UPI<small>{s.allowOnlinePayment ? 'UPI, cards & more • Secured by Razorpay' : info.ordering.onlinePayment?.message || 'Currently unavailable. Please pay at the counter.'}</small></span><Icon name="shield" /></label>
      </fieldset>
      <p className="muted">{paymentMethod==='ONLINE'?'You will continue to secure Razorpay checkout. Your order reaches the kitchen after payment is verified.':'You pay at the counter when you are done.'}</p>
      {!s.allowCash&&!s.allowOnlinePayment&&<p className="warn">No payment method is currently available. Please ask a team member.</p>}
      {quoteError&&<p className="warn" role="alert">{quoteError}</p>}
      {error && <p className="warn" role="alert">{error}</p>}
      <button className="primary" disabled={busy || !quote || !ready || !(s.allowCash||s.allowOnlinePayment)} onClick={() => void submit()}>{busy ? 'Placing…' : quote ? `${paymentMethod==='ONLINE'?'Pay online':info.branding?.orderButtonLabel || 'Place order'} · ${inr(quote.total)}` : (info.branding?.orderButtonLabel || 'Place order')}</button>
      <div className="secure-note"><Icon name="shield" />Confirmed prices. Secure checkout.</div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------ status

const STEPS: Array<[Placed['status'], string]> = [['RECEIVED', 'Order received'], ['PREPARING', 'Preparing'], ['READY', 'Ready'], ['COMPLETED', 'Completed']];

function StatusScreen({ placed, setPlaced, showStatus, onMore }: { placed: Placed; setPlaced: (p: Placed) => void; showStatus: boolean; onMore: () => void }) {
  if (placed.currency) currencyCode = placed.currency;
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const mounted=useRef(true),checking=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const refresh=async()=>{if(checking.current)return;checking.current=true;try{const p=await QrApi.status(placed.publicOrderId);if(mounted.current){setPlaced(p);setError(null);}}catch(e){if(mounted.current)setError((e as Error).message);}finally{checking.current=false;}};
  const retry=async()=>{if(busy)return;setBusy(true);try{const p=await QrApi.retryPayment(placed.publicOrderId);setPlaced(p);const url=paymentUrl(p.payment?.url);if(url)location.assign(url);setError(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  useEffect(() => {
    if (placed.status === 'COMPLETED' || placed.status === 'CANCELLED' || (!showStatus && placed.status !== 'PENDING_PAYMENT')) return;
    const t = setInterval(() => { void refresh(); }, 5000);
    const onResume=()=>{if(!document.hidden)void refresh();};
    window.addEventListener('focus',onResume);document.addEventListener('visibilitychange',onResume);
    return () => {clearInterval(t);window.removeEventListener('focus',onResume);document.removeEventListener('visibilitychange',onResume);};
  }, [placed.publicOrderId, placed.status, setPlaced, showStatus]);
  const at = STEPS.findIndex(([s]) => s === placed.status);
  return (
    <section className="page center-text">
      <div className={`status-seal ${placed.status === 'PENDING_PAYMENT' ? 'pending' : ''}`}><Icon name={placed.status === 'PENDING_PAYMENT' ? 'shield' : placed.status === 'CANCELLED' ? 'plate' : 'check'} /></div>
      <h2>{placed.status === 'CANCELLED' ? 'Order cancelled' : placed.status==='PENDING_PAYMENT'?'Payment pending':'Order confirmed'}</h2>
      <p className="big">{placed.orderNumber ?? placed.publicOrderId}</p>
      <p className="muted">Reference {placed.publicOrderId}{placed.table ? ` · Table ${placed.table}` : ''} · {inr(placed.total)}</p>
      {showStatus && placed.status !== 'CANCELLED' && placed.status!=='PENDING_PAYMENT' && (
        <ol className="steps">{STEPS.map(([s, label], i) => <li key={s} className={i <= at ? 'done' : ''}>{label}</li>)}</ol>
      )}
      {placed.status === 'CANCELLED' && <p className="warn">The restaurant could not take this order. Please ask a team member.</p>}
      <p className="muted">{placed.payment?.status==='SUCCESS'||placed.paymentStatus==='SUCCESS'?'Payment verified':placed.paymentMethod==='ONLINE'?'Your payment is being checked. The kitchen will receive this order after payment is verified.':'Pay at the counter when you are done.'}</p>
      {placed.status==='PENDING_PAYMENT'&&<><button className="primary" disabled={busy} onClick={()=>void retry()}>{busy?'Checking…':placed.payment?.status==='FAILED'?'Try payment again':'Continue payment'}</button><button className="link" onClick={()=>void refresh()}>Check payment status</button></>}
      {error&&<p role="alert" className="warn">{error}<button className="link" onClick={()=>void refresh()}>Check again</button></p>}
      <details className="receipt"><summary>Order details / receipt</summary>
        <p><b>{placed.restaurantName}</b>{placed.branchName && ` · ${placed.branchName}`}</p>
        <p>{new Date(placed.placedAt).toLocaleString()}</p>
        <ul className="lines">{placed.items?.map((item,i)=><li key={i}><div className="grow"><b>{item.name} × {item.quantity}</b><p className="idesc">{item.options.join(', ')} {item.note}</p></div><span>{inr(item.lineTotal)}</span></li>)}</ul>
        <dl className="totals"><div><dt>Subtotal</dt><dd>{inr(placed.subtotal??0)}</dd></div><div><dt>Tax</dt><dd>{inr(placed.tax??0)}</dd></div><div><dt>Discount</dt><dd>{inr(placed.discount??0)}</dd></div><div className="grand"><dt>Total</dt><dd>{inr(placed.total)}</dd></div></dl>
        {placed.paymentStatus==='SUCCESS'&&<button className="link" onClick={()=>window.print()}>Print / save receipt</button>}
      </details>
      <button className="primary" onClick={onMore}>Order more</button>
    </section>
  );
}
