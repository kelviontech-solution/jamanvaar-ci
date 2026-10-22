import {OrderReceipt} from './OrderReceipt';
import {RestaurantPage,RestaurantContactFooter} from '../../../packages/ui/src/restaurant-page/RestaurantPage';
import type {RestaurantPageView,RestaurantPageDish,PageEngagementAction} from '../../../packages/ui/src/restaurant-page/types';
import { translatedPage } from '../../../packages/ui/src/restaurant-page/page-content';
import type { ComponentProps } from 'react';
import {ServiceRequests,PickupSelector} from './Operations';
import { accentInk, accentText } from './brandContrast';
import {readGuestSession,saveGuestSession} from './guestSession';
import { shouldRefreshGuestOrder } from './paymentProgress';
import { LoyaltyPanel } from './LoyaltyPanel';
import { GuestAccount } from './GuestAccount';
import { GroupOrder } from './GroupOrder';
import { OrderFeedback, GuestHistory } from './AdvancedGuest';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { loadCheckoutSdk, openQrCheckout } from './checkout';
import { ApiError, QrApi, imageSrc, type Describe, type Menu, type MenuGroup, type MenuItem, type Placed, type Quote } from './api';
import { addLine, emptyCart, itemCount, parseCart, removeLine, setQuantity, toOrderItems, unavailableLines, withAttempt, estimatedSubtotal, MAX_LINE_QUANTITY, type Cart, type CartLine } from './cart';

const restaurantPageBackgrounds: Record<RestaurantPageView['content']['template'], string> = {
  HERITAGE: '#FAF5EB', CAFE: '#FFF7ED', MODERN: '#F6F7F1', INDIAN: '#FBE9D0'
};

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

/**
 * The checkout screen unmounts when the guest taps back to Cart to double-check a dish, and
 * remounts fresh with blank fields — so without this, their name/phone/note typed a moment
 * earlier was gone (F09). Kept in localStorage (never the URL) alongside the cart itself, scoped
 * by table token, and cleared once the order is actually placed or abandoned long enough to be stale.
 */
interface CheckoutDraft { name: string; phone: string; notes: string; orderType: 'DINE_IN' | 'TAKEAWAY' | ''; pickupAt: string; asap: boolean; tableNumber: string; savedAt: number }
const CHECKOUT_DRAFT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
function loadCheckoutDraft(token: string): Partial<CheckoutDraft> {
  try {
    const raw = store.get(`jv_qr_checkout:${token}`);
    if (!raw) return {};
    const d = JSON.parse(raw) as CheckoutDraft;
    if (!d || typeof d.savedAt !== 'number' || Date.now() - d.savedAt > CHECKOUT_DRAFT_MAX_AGE_MS) return {};
    return d;
  } catch { return {}; }
}
function saveCheckoutDraft(token: string, draft: Omit<CheckoutDraft, 'savedAt'>): void {
  store.set(`jv_qr_checkout:${token}`, JSON.stringify({ ...draft, savedAt: Date.now() }));
}
function clearCheckoutDraft(token: string): void {
  store.del(`jv_qr_checkout:${token}`);
}

function tokenFromPath(): string | null {
  const m = /^\/q\/([A-Za-z0-9_-]{10,200})\/?$/.exec(window.location.pathname);
  return m ? m[1] : null;
}

// The session is issued and signed by the server (once per browser); a made-up one would simply be ignored.
let sessionId = '';
// The menu version this guest is looking at; sent with the order so a menu published meanwhile is never charged silently.
let seenMenuVersion: number | undefined;
let sessionRequest: Promise<string> | null = null;
async function ensureSession(): Promise<string> {
  if (sessionId) return sessionId;
  if (sessionRequest) return sessionRequest;
  sessionRequest = (async () => {
    sessionId = readGuestSession();
    if (!sessionId) {
      sessionId = (await QrApi.session()).session;
      saveGuestSession(sessionId);
    }
    return sessionId;
  })().finally(() => { sessionRequest = null; });
  return sessionRequest;
}

type Screen = 'HOME' | 'MENU' | 'CART' | 'CHECKOUT' | 'STATUS';
const currentScreen = (): Screen => ({'#home':'HOME','#menu':'MENU','#cart':'CART','#checkout':'CHECKOUT','#status':'STATUS'} as Record<string,Screen>)[location.hash] ?? 'MENU';
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
  const site=/^\/q\/site\/([A-Za-z0-9_-]{6,80})\/?$/.exec(location.pathname);
  if(site)return <PublicRestaurantSite slug={site[1]}/>;
  const token = tokenFromPath();
  if (!token) return <Message title="This QR code is not valid" text="Please scan the code on your table again, or ask a team member." />;
  return <Ordering token={token} />;
}

function recordPageAction(page:RestaurantPageView,action:PageEngagementAction){
  if(navigator.doNotTrack==='1'||(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl)return;
  if(page.trackingSlug&&page.content.engagementEnabled)void QrApi.pageEvent(page.trackingSlug,action).catch(()=>{});
}
function GuestRestaurantPage(props:ComponentProps<typeof RestaurantPage>){
  const [language,setLanguage]=useState(()=>store.get('jv_qr_language')||props.page.content.defaultLanguage||'en');
  useEffect(()=>{recordPageAction(props.page,'PAGE_VIEW');},[props.page.trackingSlug,props.page.publishedAt]);
  return <RestaurantPage {...props} language={language} onLanguageChange={value=>{setLanguage(value);store.set('jv_qr_language',value);}} onAction={action=>recordPageAction(props.page,action)}/>;
}
function PublicRestaurantSite({slug}:{slug:string}){
 const [page,setPage]=useState<(RestaurantPageView&{items:RestaurantPageDish[];menuReady:boolean})|null>(null),[error,setError]=useState('');
 const [accountOpen,setAccountOpen]=useState(false),[accountSession,setAccountSession]=useState('');
 const openAccount=async()=>{try{setAccountSession(await ensureSession());setAccountOpen(true);}catch(e){setError((e as Error).message);}};
 useEffect(()=>{let alive=true,running=false;const refresh=async()=>{if(running||document.hidden)return;running=true;try{const value=await QrApi.site(slug);if(alive){setPage(value);setError('');}}catch(e){if(alive){setError((e as Error).message);if(e instanceof ApiError&&e.status===404)setPage(null);}}finally{running=false;}};void refresh();const timer=setInterval(()=>void refresh(),15000);return()=>{alive=false;clearInterval(timer);};},[slug]);
 if(!page)return <Message title={error?'Restaurant page unavailable':'Opening the restaurant'} text={error||'Please wait a moment.'}/>;
 // The website presents the restaurant. Menu browsing is on demand; ordering uses the branch's existing QR checkout.
 return <><GuestRestaurantPage browseMenu categories={page.categories} page={{...page,content:{...page.content,logoUrl:(imageSrc(page.content.logoUrl)||''),heroUrl:(imageSrc(page.content.heroUrl)||''),gallery:page.content.gallery.map(i=>({...i,url:(imageSrc(i.url)||'')}))}}} items={page.menuReady?page.items.map(i=>({...i,imageUrl:imageSrc(i.imageUrl,i.name)})):[]} menuLabel="View menu" availability={page.menuReady?(page.orderOnlineUrl?'':'Online ordering is not available here yet. Browse the menu or contact the restaurant.'):'Our menu is not available online yet. Please contact the restaurant.'} onAccount={()=>void openAccount()} onReserve={page.reservationsEnabled?(input)=>QrApi.reservation(slug,input):undefined}/>{error&&<p role="alert" className="site-connection-notice">{error}</p>}{accountOpen&&accountSession&&<GuestAccount source={{kind:'site',id:slug}} session={accountSession} onClose={()=>setAccountOpen(false)}/>}</>;
}

function Message({ title, text, action, busy, note }: { title: string; text?: string; action?: { label: string; run: () => void }; busy?: boolean; note?: string }) {
  return (
    <main className="center">
      <img className="message-logo" src={imageSrc('/assets/branding/jamanvaar-logo.png')} alt="Jamanvaar by Kelviontech" />
      <Icon name="plate" className="message-icon" />
      <h1>{title}</h1>
      {text && <p className="muted">{text}</p>}
      {note && !busy && <p className="warn" role="status">{note}</p>}
      {action && <button className="primary" onClick={action.run} disabled={busy} aria-busy={busy || undefined}>{busy ? 'Trying again…' : action.label}</button>}
    </main>
  );
}

function Ordering({ token }: { token: string }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [info, setInfo] = useState<Describe | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [problem, setProblem] = useState<{ title: string; text: string; retry: boolean } | null>(null);
  const [screen, setScreen] = useState<Screen>(currentScreen);
  const navigate = (target: Screen) => { const url=new URL(location.href); if(target!=='STATUS')url.searchParams.delete('order');else{const id=store.get(`jv_qr_last:${token}`);if(id)url.searchParams.set('order',id);}url.hash=target.toLowerCase();history.pushState({},'',url);setScreen(target); };
  useEffect(()=>{if(info&&screen==='HOME'&&!info.restaurantPage)navigate('MENU');},[info,screen]);
  useEffect(()=>{const restore=()=>setScreen(currentScreen());window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[]);
  const [cart, setCart] = useState<Cart>(() => parseCart(store.get(`jv_qr_cart:${token}`)));
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [openingPayment, setOpeningPayment] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [featuredDish,setFeaturedDish]=useState<string|null>(null);
  const [restoreError,setRestoreError]=useState<string|null>(null);
  const [restoreAttempt,setRestoreAttempt]=useState(0);
  // A manual retry must visibly do something: busy label while it runs, and an explicit note if it fails again.
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const etag = useRef<string | null>(null);
  const restoredActive=useRef(false);
  useEffect(() => {
    const resume = (event: PageTransitionEvent) => {
      if (event.persisted && openingPayment) { setOpeningPayment(null); navigate('STATUS'); }
    };
    window.addEventListener('pageshow', resume);
    return () => window.removeEventListener('pageshow', resume);
  }, [openingPayment]);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      await ensureSession();
      const [d, menuResult] = await Promise.all([QrApi.describe(token, sessionId), QrApi.menu(token, sessionId).catch((error:ApiError)=>({error}))]);
      if('error' in menuResult && (!d.restaurantPage || menuResult.error.code!=='MENU_NOT_PUBLISHED'))throw menuResult.error;
      const m='error' in menuResult?{menu:{items:[],categories:[],modifierGroups:[],menuVersion:0,etag:''} as Menu,etag:null}:menuResult;
      // Table/menu codes open ordering directly. Restaurant Page QRs use /q/site/:slug.
      // Explicit About links, saved carts, payment returns and active-order recovery retain their own screens.
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
            ? { title: 'The menu is not available yet', text: 'The restaurant is preparing its menu. Try again shortly, or ask a team member to help you order at the counter.', retry: true }
            : { title: 'QR Ordering is currently unavailable', text: err.status === 410 && (err.code === 'QR_REVOKED' || err.code === 'QR_DISABLED') ? err.message : 'QR Ordering is currently unavailable for this restaurant. Please ask a team member.', retry: false }
      );
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (info?.ordering.settings.allowOnlinePayment) void loadCheckoutSdk().catch(() => undefined); }, [info?.ordering.settings.allowOnlinePayment]);
  useEffect(() => { if (itemCount(cart) > 0 && sessionId) void QrApi.event(token, 'QR_CART_CREATED', sessionId).catch(() => undefined); }, [itemCount(cart) > 0, token]);
  useEffect(() => { if (screen === 'CHECKOUT' && sessionId) void QrApi.event(token, 'QR_CHECKOUT_STARTED', sessionId).catch(() => undefined); }, [screen, token]);

  // A refresh must not lose the order that was already placed, and must not place it again.
  useEffect(() => {
    const returned = new URLSearchParams(location.search).get('order');
    const last = returned || store.get(`jv_qr_last:${token}`);
    let active = true;
    if(returned){restoredActive.current=true;setScreen('STATUS');}
    if(!last&&location.hash==='#status')setRestoreError('This link does not contain an order reference. Ask the restaurant to help locate your bill.');
    if (last) ensureSession().then(() => QrApi.status(last)).then((p) => { if(!active)return;setPlaced(p);setRestoreError(null);store.set(`jv_qr_last:${token}`,p.publicOrderId);if (returned || location.hash==='#status' || (p.status !== 'COMPLETED' && p.status !== 'CANCELLED' && !location.hash)){restoredActive.current=true;setScreen('STATUS');} })
      .catch((error:ApiError) => { if(!active)return;setRestoreError(error.message); });
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
        const [m,d]=await Promise.all([QrApi.menu(token,sessionId,etag.current).catch((error:ApiError)=>{if(error.code==='MENU_NOT_PUBLISHED')return {menu:null,etag:null};throw error;}),QrApi.describe(token,sessionId)]);
        if(!active)return;
        setInfo(d);
        if(m.menu){etag.current=m.etag;seenMenuVersion=m.menu.menuVersion;setMenu(m.menu);}
        setProblem(null);
      } catch { /* Existing menu remains visible; checkout always checks current server availability. */ }
      finally {running=false;}
    };
    // Recheck payment methods, rules and availability when entering checkout.
    if (screen === 'CHECKOUT' || screen === 'MENU') void refresh();
    const t=setInterval(()=>void refresh(),20000);
    const onFocus=()=>void refresh();
    window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
    return()=>{active=false;clearInterval(t);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
  }, [token, screen]);

  useEffect(() => { store.set(`jv_qr_cart:${token}`, JSON.stringify(cart)); }, [cart, token]);

  if (openingPayment) return <Message title="Opening secure payment" text="Choose your preferred method in secure Razorpay checkout. Your order is confirmed only after payment is verified." action={openingPayment === 'STANDARD' ? undefined : { label: 'Continue to Razorpay', run: () => location.assign(openingPayment) }} />;
  if (problem && placed && screen === 'STATUS') return <StatusScreen placed={placed} setPlaced={setPlaced} showStatus onMore={()=>void load().then(()=>navigate('MENU'))} />;
  if (problem) return <Message title={problem.title} text={problem.text} busy={retrying} note={retryFailed ? 'Still not connected. Check your internet connection, then try again.' : undefined} action={problem.retry ? { label: 'Try again', run: () => { setRetryFailed(false); setRetrying(true); setRestoreAttempt(a=>a+1); void load().finally(() => { setRetrying(false); setRetryFailed(true); }); } } : undefined} />;
  if (!info || !menu) return <Message title="Setting your table" text="Your restaurant’s fresh menu is on its way…" />;

  const gone = unavailableLines(cart, new Set(menu.items.map((i) => i.id)));
  const acceptPlaced=async(p:Placed)=>{
            store.set(`jv_qr_last:${token}`, p.publicOrderId); setPlaced(p); setCart(emptyCart());
            if (p.status === 'PENDING_PAYMENT' && p.payment?.checkout) {
              flushSync(() => setOpeningPayment('STANDARD'));
              try { setPlaced(await openQrCheckout(p)); }
              catch (e) { setPaymentNotice((e as Error).message); }
              finally { setOpeningPayment(null); navigate('STATUS'); }
              return;
            }
            const url = p.status === 'PENDING_PAYMENT' ? paymentUrl(p.payment?.url) : null;
            if (url) { flushSync(() => setOpeningPayment(url)); location.assign(url); }
            else navigate('STATUS');

  };

  const restaurantPage=info.restaurantPage?{...info.restaurantPage,restaurantName:info.restaurant.name,branchName:info.branch.name,table:info.table?.displayNumber,currency:info.currency||'INR',content:{...info.restaurantPage.content,logoUrl:(imageSrc(info.restaurantPage.content.logoUrl)||''),heroUrl:(imageSrc(info.restaurantPage.content.heroUrl)||''),gallery:info.restaurantPage.content.gallery.map(i=>({...i,url:(imageSrc(i.url)||'')}))}}:null;
  const effectiveBrand=restaurantPage?{...info.branding,welcomeTitle:restaurantPage.content.title||info.restaurant.name,welcomeMessage:restaurantPage.content.welcome,logoUrl:restaurantPage.content.logoUrl||info.branding?.logoUrl||null,coverUrl:restaurantPage.content.heroUrl||info.branding?.coverUrl,accentColor:restaurantPage.content.accent,backgroundColor:restaurantPageBackgrounds[restaurantPage.content.template]}:info.branding;
  const menuInfo=effectiveBrand?{...info,branding:{...effectiveBrand,footerMessage:effectiveBrand.footerMessage??null,orderButtonLabel:effectiveBrand.orderButtonLabel??null}}:info;
  if(screen==='HOME'&&restaurantPage)return <><GuestRestaurantPage page={{...restaurantPage,loyaltyEnabled:info.advanced?.loyaltyEnabled}} categories={menu.categories} items={menu.items.map(i=>({...i,imageUrl:imageSrc(i.imageUrl,i.name)}))} onMenu={info.ordering.menuReady?()=>navigate('MENU'):undefined} availability={!info.ordering.menuReady?'Our menu is not available online yet. Please contact the restaurant.':!info.ordering.enabled?info.ordering.availability?.message||'Ordering is currently unavailable. You can still browse the menu.':''} onAccount={()=>setAccountOpen(true)} onDish={id=>{setFeaturedDish(id);navigate('MENU');}}/>{accountOpen&&<GuestAccount source={{kind:'table',id:token}} session={sessionId} onClose={()=>setAccountOpen(false)}/>}</>;

  return (
    <div className={`app brand-${effectiveBrand?.layout??'CARDS'}`} style={{'--saffron':effectiveBrand?.accentColor||'#c2570c','--bg':effectiveBrand?.backgroundColor||'#faf7f2','--accent-ink':accentInk(effectiveBrand?.accentColor||'#c2570c'),'--accent-text':accentText(effectiveBrand?.accentColor||'#c2570c')} as React.CSSProperties}>
      <header className="top">
        <img src={imageSrc(effectiveBrand?.logoUrl || '/assets/branding/jamanvaar-logo.png')} alt={effectiveBrand?.logoUrl ? info.restaurant.name : 'Jamanvaar by Kelviontech'} className="logo" />
        <div className="restaurant-heading">
          <div className="name">{effectiveBrand?.welcomeTitle || info.restaurant.name}</div>
          <div className="sub">{info.branch.name}{info.table ? ` · Table ${info.table.displayNumber}` : ' · Menu'}</div>
        </div>
        <div className="guest-header-links">
          {restaurantPage&&<button type="button" className="rp-info-link" onClick={()=>navigate('HOME')}>About & contact</button>}
          {info.advanced?.loyaltyEnabled&&<button type="button" className="rp-info-link" onClick={()=>setAccountOpen(true)}>My rewards</button>}
        </div>
        <div className="mode"><span className="live-dot" />{info.table ? `Table ${info.table.displayNumber}` : 'Guest menu'}</div>
      </header>
      {accountOpen&&<GuestAccount source={{kind:'table',id:token}} session={sessionId} onClose={()=>setAccountOpen(false)}/>}
      <ServiceRequests token={token} session={sessionId}/>{screen !== 'MENU' && <nav className="journey" aria-label="Order progress">{(['MENU', 'CART', 'CHECKOUT', 'STATUS'] as Screen[]).map((step, index) => { const current = screen === 'STATUS' && placed?.status === 'PENDING_PAYMENT' ? 'CHECKOUT' : screen; return <span key={step} className={step === current ? 'current' : ''} aria-current={step === current ? 'step' : undefined}><b>{index + 1}</b>{({ HOME: 'Restaurant', MENU: 'Menu', CART: 'Cart', CHECKOUT: 'Checkout', STATUS: 'Your order' })[step]}</span>; })}</nav>}

      {screen === 'MENU' && <MenuScreen info={menuInfo} menu={menu} cart={cart} setCart={setCart} onCart={() => navigate('CART')} placed={placed} onStatus={() => navigate('STATUS')} initialDishId={featuredDish} onDishOpened={()=>setFeaturedDish(null)} />}
      {screen==='MENU'&&info.advanced?.historyEnabled&&<GuestHistory token={token} session={sessionId} onRecover={async id=>{try{setPlaced(await QrApi.status(id));store.set(`jv_qr_last:${token}`,id);navigate('STATUS');}catch(err){setPaymentNotice((err as Error).message);}}} onReorder={items=>{let next=cart;let skipped=0;for(const line of items){const item=menu.items.find(i=>i.id===line.itemId);const options=item?item.modifierGroupIds.flatMap(id=>menu.modifierGroups.find(g=>g.id===id)?.options??[]):[];const chosen=line.optionIds.map(id=>options.find(o=>o.id===id));if(!item||chosen.some(o=>!o)){skipped++;continue;}next=addLine(next,{itemId:item.id,name:item.name,quantity:line.quantity,unitPrice:item.price+chosen.reduce((n,o)=>n+(o?.priceDelta??0),0),optionIds:line.optionIds,optionNames:chosen.map(o=>o!.name),note:line.note});}setCart(next);setPaymentNotice(skipped?`${skipped} previous item(s) are no longer available. Review your cart and required choices.`:'Previous items added at current menu prices. Review your cart before ordering.');navigate('CART');}}/>}
      {screen==='MENU'&&info.advanced?.groupEnabled&&<GroupOrder token={token} session={sessionId} cart={cart} info={info} onPlaced={acceptPlaced}/>}
      {paymentNotice && <p className="warn pad" role="alert">{paymentNotice}</p>}
      {screen === 'CART' && <CartScreen token={token} menu={menu} settings={info.ordering.settings} cart={cart} setCart={setCart} gone={gone.map((g) => g.key)} onBack={() => navigate('MENU')} onNext={() => navigate('CHECKOUT')} />}
      {screen === 'CHECKOUT' && (
        <Checkout token={token} info={info} cart={cart} setCart={setCart} onBack={() => navigate('CART')}
          onPlaced={acceptPlaced} />
      )}
      {screen === 'STATUS' && placed && <StatusScreen placed={placed} setPlaced={setPlaced} showStatus={info.ordering.settings.showOrderStatus} onMore={() => navigate('MENU')} />}
      {screen==='STATUS'&&placed?.status==='COMPLETED'&&info.advanced?.feedbackEnabled&&<OrderFeedback key={placed.publicOrderId} order={placed}/>}
      {screen === 'STATUS' && !placed && <Message title={restoreError?"Could not restore your order":"Checking your order"} text={restoreError?`${restoreError} Reopen it in the browser where you ordered. Private browsing, cleared browser data or a different device may require help from the restaurant.`:"Please wait while we restore the order status."} action={restoreError?{label:'Check again',run:()=>setRestoreAttempt(a=>a+1)}:{label:'Back to menu',run:()=>navigate('MENU')}} />}
      {screen === 'STATUS' && !placed && restoreError && <button className="primary restore-order-more" onClick={() => navigate('MENU')}>Order more for this table</button>}
      {restaurantPage&&<RestaurantContactFooter content={translatedPage(restaurantPage.content,store.get('jv_qr_language')||restaurantPage.content.defaultLanguage||'en')} branchName={info.branch.name} onAction={action=>recordPageAction(restaurantPage,action)}/>}
      {!restaurantPage&&effectiveBrand?.contactMessage&&<p className="muted pad">{effectiveBrand.contactMessage}</p>}{!restaurantPage&&effectiveBrand?.footerMessage && <footer className="muted pad" style={{ textAlign: 'center' }}>{effectiveBrand.footerMessage}</footer>}
      {!restaurantPage&&<footer className="brand-footer">Thoughtfully served with <strong>Jamanvaar</strong><span>by Kelviontech</span></footer>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------ menu

function MenuScreen({ info, menu, cart, setCart, onCart, placed, onStatus,initialDishId,onDishOpened }: { info: Describe; menu: Menu; cart: Cart; setCart: (c: Cart) => void; onCart: () => void; placed: Placed | null; onStatus: () => void;initialDishId?:string|null;onDishOpened?:()=>void }) {
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState(() => store.get('jv_qr_language') || menu.defaultLanguage || 'en');
  const [lowBandwidth,setLowBandwidth]=useState(()=>store.get('jv_qr_compact')==='yes');
  const [diet, setDiet] = useState('ALL');
  const local = <T extends { name: string; description?: string; translations?: Record<string, {name: string; description?: string}> }>(value: T): T => ({...value,...value.translations?.[languages.includes(language)?language:menu.defaultLanguage ?? 'en']});
  const languages = menu.languages ?? ['en','hi','gu'].filter(l => l==='en'||menu.items.some(i=>i.translations?.[l])||menu.categories.some(c=>c.translations?.[l]));
  const diets = [...new Set(menu.items.map(i=>i.dietaryType).filter((d): d is string=>!!d))];
  const [category, setCategory] = useState<string>('ALL');
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const noteLimit = (item: MenuItem, before: Cart, after: Cart) => {
    const max = item.maxQuantity ?? MAX_LINE_QUANTITY;
    const line = after.lines.find((l) => l.itemId === item.id && l.quantity >= max);
    const prevLine = before.lines.find((l) => l.key === line?.key);
    if (line && prevLine && prevLine.quantity >= max) {
      setLimitNotice(`${item.name} is limited to ${max} per order — you already have the maximum.`);
      setTimeout(() => setLimitNotice((cur) => (cur?.startsWith(item.name) ? null : cur)), 4000);
    }
  };
  useEffect(()=>{if(initialDishId){setPicking(menu.items.find(i=>i.id===initialDishId)??null);onDishOpened?.();}},[initialDishId,menu.items,onDishOpened]);
  const groups = useMemo(() => new Map(menu.modifierGroups.map((g) => [g.id, g])), [menu]);
  const visible = menu.items.map(local).filter((i) => (diet==='ALL'||i.dietaryType===diet) && (category === 'ALL' || i.categoryId === category) && (!query || `${i.name} ${i.description ?? ''}`.toLowerCase().includes(query.toLowerCase())));

  const quickAdd = (item: MenuItem) => {
    // A dish with nothing to choose goes straight into the cart; one with options (or a required choice) opens the sheet.
    const needsChoice = (item.minQuantity ?? 1) > 1 || item.modifierGroupIds.some((id) => groups.get(id)?.isRequired || (info.ordering.settings.allowModifiers && !!groups.get(id)));
    void QrApi.event(tokenFromPath()!, 'QR_ITEM_VIEWED', sessionId,item.id).catch(()=>undefined);
    if (needsChoice) return setPicking(item);
    const next = addLine(cart, { itemId: item.id, name: item.name, unitPrice: item.price, quantity: 1, optionIds: [], optionNames: [] }, item.maxQuantity);
    noteLimit(item, cart, next);
    setCart(next);
    void QrApi.event(tokenFromPath()!, 'QR_ITEM_ADDED', sessionId,item.id).catch(() => undefined);
  };

  return (
    <>
      <section className={`menu-hero ${lowBandwidth?'text-only':''}`}>
        <div className="hero-copy"><span className="eyebrow">FRESH FROM OUR KITCHEN</span><h1>Good food.<br /><em>Great company.</em></h1><p>{info.branding?.welcomeMessage || 'Pick your favourites, make them yours, and let us take care of the rest.'}</p><div className="hero-note"><Icon name="plate" />{info.table ? `Delivered to table ${info.table.displayNumber}` : 'Prepared fresh for you'}</div></div>
        {!lowBandwidth&&<div className="hero-photo"><DishPhoto source={info.branding?.coverUrl||(menu.items.find(i => i.imageUrl && /\.(?:jpe?g|png|webp)(?:\?|$)|\/public\/qr\/images\//i.test(i.imageUrl)) || menu.items.find(i => i.imageUrl && !i.imageUrl.includes('placeholder')))?.imageUrl} name="From our menu" /><span>{info.restaurant.name}</span></div>}
      </section>
      {!info.ordering.enabled && <p className="availability-note" role="status">{info.ordering.availability?.message || 'Ordering is currently paused. You can still browse the menu.'}</p>}
      {info.ordering.settings.customerInstructions && <p className="availability-note">{info.ordering.settings.customerInstructions}</p>}
      {placed && placed.status !== 'COMPLETED' && placed.status !== 'CANCELLED' && (
        <button className="banner" onClick={onStatus}>Your order {placed.orderNumber ?? ''} is {placed.status.toLowerCase()} — view status</button>
      )}
      <div className="search"><Icon name="search" /><input type="search" placeholder="Find your next favourite…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the menu" />{query && <button className="link" aria-label="Clear search" onClick={() => setQuery('')}>Clear</button>}</div>
      {languages.length>1 && <nav className="chips" aria-label="Language">{languages.map(l=><button key={l} className={language===l?'chip on':'chip'} onClick={()=>{setLanguage(l);store.set('jv_qr_language',l);}}>{({en:'English',hi:'\u0939\u093f\u0928\u094d\u0926\u0940',gu:'\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0'} as Record<string,string>)[l] ?? l}</button>)}</nav>}
      {diets.length>0 && <nav className="chips" aria-label="Dietary filters"><button className={diet==='ALL'?'chip on':'chip'} onClick={()=>setDiet('ALL')}>All diets</button>{diets.map(d=><button key={d} className={diet===d?'chip on':'chip'} onClick={()=>setDiet(d)}>{d.replaceAll('_',' ')}</button>)}</nav>}
      <label className="compact-choice"><input type="checkbox" checked={lowBandwidth} onChange={e=>{setLowBandwidth(e.target.checked);store.set('jv_qr_compact',e.target.checked?'yes':'no');}}/> Text-only menu (save data)</label>
      <nav className="chips" aria-label="Categories">
        <button className={category === 'ALL' ? 'chip on' : 'chip'} onClick={() => setCategory('ALL')}>All</button>
        {menu.categories.map((c) => <button key={c.id} className={category === c.id ? 'chip on' : 'chip'} onClick={() => setCategory(c.id)}>{local(c).name}</button>)}
      </nav>
      {!!info.advanced?.recommendationIds.length&&<section className="recommendations"><h3>Pairs well with your meal</h3><div className="chips">{info.advanced.recommendationIds.map(id=>menu.items.find(i=>i.id===id)).filter((item):item is MenuItem=>!!item).filter(i=>diet==='ALL'||i.dietaryType===diet).map(local).map(item=><button className="chip" key={item.id} onClick={()=>quickAdd(item)} aria-label={`Add recommended ${item.name}`}>{item.name} ? {inr(item.price)} +</button>)}</div></section>}
      <div className="menu-title"><div><span className="eyebrow">MADE FOR YOUR APPETITE</span><h2>{category === 'ALL' ? 'Explore our menu' : local(menu.categories.find(c => c.id === category) || { name: 'Our menu' }).name}</h2></div><span>{visible.length} dishes</span></div>
      <ul className="items">
        {visible.map((i) => (
          <li key={i.id} className="item">
            {!lowBandwidth&&<DishPhoto source={i.imageUrl} name={i.name} />}
            <div className="grow">
              <div className="iname">{i.name}</div>{i.dietaryType&&<small className={`diet ${i.dietaryType === 'NON_VEG' ? 'nonveg' : ''}`}><span />{i.dietaryType.replaceAll('_',' ')}</small>}
              {i.description && <div className="idesc">{i.description}</div>}
              {!!i.allergens?.length && <p className="allergen-note">Declared allergens: {i.allergens.join(', ')}</p>}
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
      {limitNotice && <p className="warn" role="status">{limitNotice}</p>}
      {picking && <Picker item={picking} groups={picking.modifierGroupIds.map((id) => groups.get(id)).filter((g): g is MenuGroup => !!g)} allowMods={info.ordering.settings.allowModifiers} allowNotes={info.ordering.settings.allowCustomerNotes} onClose={() => setPicking(null)}
        onAdd={(line) => { const next = addLine(cart, line, picking.maxQuantity); noteLimit(picking, cart, next); setCart(next); setPicking(null); void QrApi.event(tokenFromPath()!, 'QR_ITEM_ADDED', sessionId,line.itemId).catch(() => undefined); }} />}
    </>
  );
}

function Picker({ item, groups, allowMods, allowNotes, initial, onClose, onAdd }: { item: MenuItem; groups: MenuGroup[]; allowMods: boolean; allowNotes: boolean; initial?: CartLine; onClose: () => void; onAdd: (l: { itemId: string; name: string; unitPrice: number; quantity: number; optionIds: string[]; optionNames: string[]; note?: string }) => void }) {
  const shown = allowMods ? groups : groups.filter((g) => g.isRequired);
  // Options the restaurant pre-selected start ticked; the guest can change them.
  const [chosen, setChosen] = useState<Record<string, string[]>>(() => Object.fromEntries(shown.map((g) => [g.id, g.options.filter((o) => initial ? initial.optionIds.includes(o.id) : o.isDefault).slice(0, g.maxSelections > 0 ? g.maxSelections : undefined).map((o) => o.id)])));
  const minQ = item.minQuantity ?? 1;
  const maxQ = item.maxQuantity ?? 50;
  const [qty, setQty] = useState(Math.max(minQ, Math.min(maxQ, initial?.quantity ?? minQ)));
  const [note, setNote] = useState(initial?.note ?? '');
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key !== 'Tab') return;
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea') ?? [])];
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); before?.focus(); };
  }, []);
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
    <div className="sheet" role="dialog" aria-label={item.name} aria-modal="true">
      <div className="panel" ref={panel}>
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
        {!!item.allergens?.length && <p className="allergen-note">Declared allergens: {item.allergens.join(', ')}. Ask staff about cross-contact.</p>}
        {allowNotes && item.allowInstructions !== false && <textarea placeholder="Allergies or special instructions (tell staff about severe allergies)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
        <div className="qty"><button onClick={() => setQty(Math.max(minQ, qty - 1))} disabled={qty <= minQ} aria-label="Fewer">−</button><b>{qty}</b><button onClick={() => setQty(Math.min(maxQ, qty + 1))} disabled={qty >= maxQ} aria-label="More">+</button>{minQ > 1 && <span className="muted"> minimum {minQ}</span>}{maxQ < 50 && <span className="muted"> maximum {maxQ}</span>}</div>
        <button className="primary" disabled={!!missing} onClick={() => onAdd({ itemId: item.id, name: item.name, unitPrice: unit, quantity: qty, optionIds, optionNames, note: allowNotes && item.allowInstructions !== false ? note.trim() || undefined : undefined })}>
          {missing ? `Choose ${missing.name}` : `${initial ? 'Save changes' : `Add ${qty}`} · ${inr(unit * qty)}`}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ cart, checkout

function useQuote(token: string, cart: Cart, couponCode='', loyaltyRewardId='') {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const items = JSON.stringify(toOrderItems(cart));
  useEffect(() => {
    let active=true;
    setQuote(null);
    if (cart.lines.length === 0) { setQuote(null); setError(null); return; }
    const t = setTimeout(() => {
      QrApi.quote(token, JSON.parse(items),{...(couponCode?{couponCode}:{}),...(loyaltyRewardId?{loyaltyRewardId}:{})},sessionId).then((q) => { if(active){setQuote(q);setError(null);} }).catch((e: ApiError) => { if(active){setQuote(null);setError(e.message);} });
    }, 350);
    return () => {active=false;clearTimeout(t);};
    // retryCount has no effect on what's fetched — it only exists to re-run this effect on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, items, cart.lines.length, seenMenuVersion,couponCode,loyaltyRewardId,retryCount]);
  // Reconnecting after a drop is itself a reason the last quote attempt may have failed.
  useEffect(() => {
    const onOnline = () => setRetryCount((c) => c + 1);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);
  return {
    quote, error,
    // F: measuring customer difficulty — a guest who has to retry the price check hit something
    // that didn't work the first time; counting retries (not just the final success/fail) is what
    // tells the restaurant this step is causing trouble, not just whether it eventually succeeded.
    retry: () => { setRetryCount((c) => c + 1); void QrApi.event(token, 'QR_QUOTE_RETRY', sessionId).catch(() => undefined); }
  };
}

function CartScreen({ token, menu, settings, cart, setCart, gone, onBack, onNext }: { token: string; menu: Menu; settings: Describe['ordering']['settings']; cart: Cart; setCart: (c: Cart) => void; gone: string[]; onBack: () => void; onNext: () => void }) {
  const { quote, error, retry } = useQuote(token, cart);
  const [editing, setEditing] = useState<CartLine | null>(null);
  const editItem = editing && menu.items.find(i => i.id === editing.itemId);
  return (
    <section className="page">
      <button className="link" onClick={onBack}>← Menu</button>
      <span className="eyebrow">YOUR PICKS, PREPARED FRESH</span><h2>Your cart</h2>
      {cart.lines.length === 0 && <p className="muted">Your cart is empty.</p>}
      <ul className="lines">
        {cart.lines.map((l, index) => (
          <li key={l.key} className={gone.includes(l.key) ? 'gone' : ''}>
            <DishPhoto source={menu.items.find(i => i.id === l.itemId)?.imageUrl} name={l.name} className="cart-photo" />
            <div className="grow">
              <div className="iname">{l.name}</div>
              <div className="line-amount">{quote?.lines[index] ? inr(quote.lines[index].lineTotal) : error ? 'Price unavailable' : 'Checking price...'}</div>
              {l.optionNames.length > 0 && <div className="idesc">{l.optionNames.join(', ')}</div>}
              {l.note && <div className="idesc">“{l.note}”</div>}
              {gone.includes(l.key) && <div className="warn">No longer available. Please remove it.</div>}
              {!gone.includes(l.key) && <button className="link" onClick={() => setEditing(l)} aria-label={`Edit ${l.name}`}>Edit choices / note</button>}
            </div>
            <div className="qty small"><button disabled={l.quantity <= (menu.items.find(i => i.id === l.itemId)?.minQuantity ?? 1)} onClick={() => setCart(setQuantity(cart, l.key, l.quantity - 1))} aria-label="Fewer">−</button><b>{l.quantity}</b><button disabled={l.quantity >= (menu.items.find(i => i.id === l.itemId)?.maxQuantity ?? 50)} onClick={() => setCart(setQuantity(cart, l.key, l.quantity + 1))} aria-label="More">+</button></div>
            <button className="link danger" onClick={() => setCart(removeLine(cart, l.key))}>Remove</button>
          </li>
        ))}
      </ul>
      {error && <p className="warn" role="alert">{error} <button className="link" onClick={retry}>Retry price check</button></p>}
      {quote && <Totals quote={quote} />}
      <button className="primary" disabled={cart.lines.length === 0 || gone.length > 0 || !quote} onClick={onNext}>Checkout</button>
      {editing && editItem && <Picker item={editItem} groups={editItem.modifierGroupIds.map(id => menu.modifierGroups.find(g => g.id === id)).filter((g): g is MenuGroup => !!g)} allowMods={settings.allowModifiers} allowNotes={settings.allowCustomerNotes} initial={editing} onClose={() => setEditing(null)} onAdd={line => { setCart(addLine(removeLine(cart, editing.key), line, editItem.maxQuantity)); setEditing(null); }} />}
    </section>
  );
}

function Totals({ quote }: { quote: Quote }) {
  return (
    <dl className="totals">
      <div><dt>Subtotal</dt><dd>{inr(quote.subtotal)}</dd></div>
      {!!quote.discount&&<div><dt>Discount</dt><dd>-{inr(quote.discount)}</dd></div>}
      <div><dt>Tax</dt><dd>{inr(quote.tax)}</dd></div>
      <div className="grand"><dt>Total</dt><dd>{inr(quote.total)}</dd></div>
    </dl>
  );
}

function Checkout({ token, info, cart, setCart, onBack, onPlaced }: { token: string; info: Describe; cart: Cart; setCart: (c: Cart) => void; onBack: () => void; onPlaced: (p: Placed) => void }) {
  const s = info.ordering.settings;
  const [couponInput,setCouponInput]=useState(''),[couponCode,setCouponCode]=useState(''),[rewardId,setRewardId]=useState('');
  const { quote, error: quoteError, retry: retryQuote } = useQuote(token, cart,couponCode,rewardId);
  const [paymentMethod,setPaymentMethod]=useState<'CASH_AT_COUNTER'|'ONLINE'>(()=>s.allowCash?'CASH_AT_COUNTER':'ONLINE');
  useEffect(() => { if (paymentMethod === 'ONLINE' && !s.allowOnlinePayment && s.allowCash) setPaymentMethod('CASH_AT_COUNTER'); else if (paymentMethod === 'CASH_AT_COUNTER' && !s.allowCash && s.allowOnlinePayment) setPaymentMethod('ONLINE'); }, [s.allowOnlinePayment, s.allowCash, paymentMethod]);
  const draft = useMemo(() => loadCheckoutDraft(token), [token]);
  const [name, setName] = useState(draft.name ?? '');
  const [phone, setPhone] = useState(draft.phone ?? '');
  const [notes, setNotes] = useState(draft.notes ?? '');
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY' | ''>(draft.orderType ?? '');
  const [pickupAt,setPickupAt]=useState(draft.pickupAt ?? ''),[asap,setAsap]=useState(draft.asap ?? true);
  const [tableNumber, setTableNumber] = useState(draft.tableNumber ?? '');
  useEffect(() => {
    saveCheckoutDraft(token, { name, phone, notes, orderType, pickupAt, asap, tableNumber });
  }, [token, name, phone, notes, orderType, pickupAt, asap, tableNumber]);
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const menuOnly = info.mode === 'MENU_ONLY';
  const ready = (info.ordering.enabled||(!!pickupAt&&orderType==='TAKEAWAY')) && (orderType!=='TAKEAWAY'||asap||!!pickupAt) && (!s.minimumOrder || (quote?.total ?? 0) >= s.minimumOrder) && (!s.requireCustomerName || name.trim()) && (!s.requireCustomerPhone || phone.trim()) && (!menuOnly || orderType === 'TAKEAWAY' || (orderType === 'DINE_IN' && tableNumber.trim()));

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
        ...(pickupAt&&orderType==='TAKEAWAY'?{pickupAt}:{}),
        ...(couponCode?{couponCode}:{}),
        ...(rewardId?{loyaltyRewardId:rewardId}:{}),
        ...(quote ? {expectedTotalPaise:Math.round(quote.total*100)} : {}),
        idempotencyKey: attempt.attemptKey,
        ...((quote?.menuVersion ?? seenMenuVersion) !== undefined ? { menuVersion: quote?.menuVersion ?? seenMenuVersion } : {}),
        ...(name.trim() ? { customerName: name.trim() } : {}),
        ...(phone.trim() ? { customerPhone: phone.trim() } : {}),
        ...(notes.trim() && s.allowCustomerNotes ? { orderNotes: notes.trim() } : {}),
        ...(menuOnly ? { orderType, ...(orderType === 'DINE_IN' ? { tableNumber: tableNumber.trim() } : {}) } : {})
      }, sessionId);
      clearCheckoutDraft(token);
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
          {(s.orderingModes ?? ['DINE_IN','TAKEAWAY']).includes('DINE_IN') && <label className="opt"><input type="radio" name="ot" checked={orderType === 'DINE_IN'} onChange={() => setOrderType('DINE_IN')} /> <span>Dine-in</span></label>}
          {(s.orderingModes ?? ['DINE_IN','TAKEAWAY']).includes('TAKEAWAY') && <label className="opt"><input type="radio" name="ot" checked={orderType === 'TAKEAWAY'} onChange={() => setOrderType('TAKEAWAY')} /> <span>Takeaway</span></label>}
          {orderType === 'DINE_IN' && <label>Table number<input placeholder="Your table number" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} maxLength={20} /></label>}
        </fieldset>
      )}
      {menuOnly&&orderType==='TAKEAWAY'&&<PickupSelector token={token} session={sessionId} onChange={s=>{setPickupAt(s);setCart({...cart,attemptKey:null});}} onOptions={s=>setAsap(s.asapEnabled)}/>}<div className="guest-details"><label>Your name {s.requireCustomerName ? '*' : <small>(optional)</small>}<input placeholder="How should we call you?" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" /></label>
      <label>Mobile number {s.requireCustomerPhone ? '*' : <small>(optional)</small>}<input placeholder="Your mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} autoComplete="tel" /></label>
      {s.allowCustomerNotes && <label>Note for the kitchen <small>(optional)</small><textarea placeholder="Any special requests?" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></label>}</div>
      {info.advanced?.promotionsEnabled&&<section className="coupon-panel"><label>Coupon code <small>(optional)</small><input maxLength={40} value={couponInput} onChange={e=>setCouponInput(e.target.value.toUpperCase())} placeholder="Enter coupon code"/></label><button className="link" onClick={()=>{setCouponCode(couponInput.trim());setRewardId('');setCart({...cart,attemptKey:null});}}>Apply coupon</button>{couponCode&&<button className="link" onClick={()=>{setCouponCode('');setCouponInput('');setCart({...cart,attemptKey:null});}}>Remove coupon</button>}</section>}
      {info.advanced?.loyaltyEnabled&&<LoyaltyPanel token={token} session={sessionId} rewardId={rewardId} onReward={id=>{setRewardId(id);setCouponCode('');setCart({...cart,attemptKey:null});}}/>}
      {quote && <Totals quote={quote} />}
      <fieldset className="payment-options"><legend>How would you like to pay?</legend>
        {s.allowCash && <label className={`opt payment-card ${paymentMethod === 'CASH_AT_COUNTER' ? 'selected' : ''} ${!s.allowCash ? 'unavailable' : ''}`}><input type="radio" name="payment" disabled={!s.allowCash} checked={paymentMethod==='CASH_AT_COUNTER'} onChange={()=>setPaymentMethod('CASH_AT_COUNTER')} /><span>Pay at counter<small>{s.allowCash ? 'Settle your bill with our team.' : 'Counter payment is unavailable.'}</small></span><Icon name="plate" /></label>}
        {s.allowOnlinePayment && <label className={`opt payment-card ${paymentMethod === 'ONLINE' ? 'selected' : ''} ${!s.allowOnlinePayment ? 'unavailable' : ''}`}><input type="radio" name="payment" disabled={!s.allowOnlinePayment} checked={paymentMethod==='ONLINE'} onChange={()=>setPaymentMethod('ONLINE')} /><span>Pay online / UPI<small>{s.allowOnlinePayment ? 'Secure Razorpay checkout - methods enabled by the merchant' : info.ordering.onlinePayment?.message || 'Currently unavailable. Please pay at the counter.'}</small></span><Icon name="shield" /></label>}
      </fieldset>
      {!info.ordering.enabled && <p role="status" className="warn">{info.ordering.availability?.message}</p>}
      {!!s.minimumOrder && (quote?.total ?? 0) < s.minimumOrder && <p className="warn">Minimum order: {inr(s.minimumOrder)}. Add another dish to continue.</p>}
      {s.paymentInstructions && <p className="muted">{s.paymentInstructions}</p>}
      <p className="muted">{paymentMethod==='ONLINE'?'You will continue to secure Razorpay checkout. Your order reaches the kitchen after payment is verified.':'You pay at the counter when you are done.'}</p>
      {!s.allowCash&&!s.allowOnlinePayment&&<p className="warn">No payment method is currently available. Please ask a team member.</p>}
      {quoteError&&<p className="warn" role="alert">{quoteError} <button className="link" onClick={retryQuote}>Retry price check</button></p>}
      {error && <p className="warn" role="alert">{error}</p>}
      <button className="primary" disabled={busy || !quote || !ready || !(s.allowCash||s.allowOnlinePayment)} onClick={() => void submit()}>{busy ? paymentMethod === 'ONLINE' ? 'Opening secure payment…' : 'Placing…' : quote ? `${paymentMethod==='ONLINE'?'Pay online':info.branding?.orderButtonLabel || 'Place order'} · ${inr(quote.total)}` : (info.branding?.orderButtonLabel || 'Place order')}</button>
      <div className="secure-note"><Icon name="shield" />Confirmed prices. Secure checkout.</div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------ status

const STEPS: Array<[Placed['status'], string]> = [['RECEIVED', 'Order received'], ['PREPARING', 'Preparing'], ['READY', 'Ready'], ['COMPLETED', 'Completed']];

export function StatusScreen({ placed, setPlaced, showStatus, onMore }: { placed: Placed; setPlaced: (p: Placed) => void; showStatus: boolean; onMore: () => void }) {
  if (placed.currency) currencyCode = placed.currency;
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [opening,setOpening]=useState<string|null>(null);
  const mounted=useRef(true),checking=useRef(false),acting=useRef(false),revision=useRef(0);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const refresh=async()=>{if(checking.current||acting.current)return;checking.current=true;const version=revision.current;try{const p=await QrApi.status(placed.publicOrderId);if(mounted.current&&version===revision.current){setPlaced(p);setError(null);}}catch(e){if(mounted.current&&version===revision.current)setError((e as Error).message);}finally{checking.current=false;}};
  const changePayment=async(counter=false)=>{
    if(acting.current)return;acting.current=true;revision.current+=1;setBusy(true);setError(null);
    // F: measuring customer difficulty — a guest retrying a FAILED payment (not just continuing a
    // fresh one) is a direct difficulty signal worth counting, separate from the final outcome.
    if (!counter && placed.payment?.status === 'FAILED') { const tk = tokenFromPath(); if (tk) void QrApi.event(tk, 'QR_PAYMENT_RETRY', sessionId).catch(() => undefined); }
    try{
      const p=await (counter?QrApi.switchToCounter(placed.publicOrderId):QrApi.retryPayment(placed.publicOrderId));
      if(!mounted.current)return;
      setPlaced(p);const url=counter||p.status!=='PENDING_PAYMENT'?null:paymentUrl(p.payment?.url);
      if (!counter && p.status === 'PENDING_PAYMENT' && p.payment?.checkout) {
        setOpening('STANDARD');
        try { const result = await openQrCheckout(p); if (mounted.current) setPlaced(result); }
        finally { if (mounted.current) setOpening(null); }
        return;
      }
      if(url){flushSync(()=>setOpening(url));location.assign(url);}
      else if(!counter&&p.status==='PENDING_PAYMENT')setError('Checkout is not ready yet. Please check payment status or choose pay at counter.');
    }catch(e){if(mounted.current)setError((e as Error).message);}
    finally{acting.current=false;if(mounted.current)setBusy(false);}
  };
  useEffect(() => {
    if (!shouldRefreshGuestOrder(placed, showStatus)) return;
    // Keep automatic refresh bounded; explicit refresh remains available afterwards.
    const deadline = Date.now() + 30 * 60 * 1000;
    const t = setInterval(() => { if (Date.now() < deadline && !document.hidden) void refresh(); }, 5000);
    const onResume=()=>{if(!document.hidden)void refresh();};
    void refresh();
    window.addEventListener('focus',onResume);document.addEventListener('visibilitychange',onResume);
    return () => {clearInterval(t);window.removeEventListener('focus',onResume);document.removeEventListener('visibilitychange',onResume);};
  }, [placed.publicOrderId, placed.status, placed.paymentStatus, placed.payment?.status, placed.balance?.outstandingPaise, setPlaced, showStatus]);
  useEffect(()=>{const resume=(event:PageTransitionEvent)=>{if(event.persisted){setOpening(null);void refresh();}};window.addEventListener('pageshow',resume);return()=>window.removeEventListener('pageshow',resume);},[placed.publicOrderId]);
  if(opening)return <Message title="Opening secure payment" text="Finish payment in secure checkout. We will verify the result here." action={opening === 'STANDARD' ? undefined : {label:'Continue to Razorpay',run:()=>location.assign(opening)}} />;
  const at = STEPS.findIndex(([s]) => s === placed.status);
  return (
    <section className="page center-text">
      <div className={`status-seal ${placed.status === 'PENDING_PAYMENT' ? 'pending' : ''}`}><Icon name={placed.status === 'PENDING_PAYMENT' ? 'shield' : placed.status === 'CANCELLED' ? 'plate' : 'check'} /></div>
      <h2>{placed.status === 'CANCELLED' ? 'Order cancelled' : placed.status==='PENDING_PAYMENT'?'Complete your payment':placed.status==='COMPLETED'?'Order completed':placed.status==='READY'?'Your order is ready':'Order confirmed'}</h2>
      <p className="big">{placed.orderNumber ?? placed.publicOrderId}</p>
      {placed.pickupAt&&<p className="pickup-confirmation">Pickup: {new Date(placed.pickupAt).toLocaleString(undefined,{timeZone:placed.pickupTimezone})}</p>}<p className="muted">Reference {placed.publicOrderId}{placed.table ? ` · Table ${placed.table}` : ''} · {inr(placed.total)}</p>
      {placed.status === 'RECEIVED' && !placed.pickupAt && !!placed.preparationMinutes && <p className="muted">Usually ready in about {placed.preparationMinutes} minutes.</p>}
      {showStatus && placed.status !== 'CANCELLED' && placed.status!=='PENDING_PAYMENT' && (
        <ol className="steps">{STEPS.map(([s, label], i) => <li key={s} className={i <= at ? 'done' : ''}>{label}</li>)}</ol>
      )}
      {placed.status === 'CANCELLED' && <p className="warn">The restaurant could not take this order. Please ask a team member.</p>}
      {(() => {
        // Payment copy must agree with the order's actual state: a cancelled order or one with
        // nothing left to collect must never still say "pay at counter" (F13) — that line was
        // computed from paymentMethod/paymentStatus alone, blind to status and outstanding balance.
        const outstandingPaise = placed.balance ? placed.balance.outstandingPaise : Math.round(placed.total * 100);
        const isPaid = placed.payment?.status === 'SUCCESS' || placed.paymentStatus === 'SUCCESS' || outstandingPaise <= 0;
        if (placed.status === 'CANCELLED') return isPaid ? <p className="muted">This order was not charged.</p> : null;
        if (isPaid) return <p className="muted">{placed.paymentMethod === 'ONLINE' ? 'Payment verified' : 'Payment received'}</p>;
        if (placed.paymentMethod === 'ONLINE') return <p className="muted">Complete secure checkout to confirm your order. The kitchen receives it after payment is verified.</p>;
        return <p className="muted">Payment due at counter: {inr(outstandingPaise / 100)}. Please pay our team.</p>;
      })()}
      {placed.status !== 'PENDING_PAYMENT' && <button className="link" disabled={busy} onClick={() => void refresh()}>Refresh order & payment</button>}
      {placed.status==='PENDING_PAYMENT'&&<>
        <button className="primary" disabled={busy} onClick={()=>void changePayment()}>{busy?'Checking…':placed.payment?.status==='FAILED'?'Try payment again':'Continue payment'}</button>
        <p className="muted">Choose UPI on secure Razorpay checkout, then select your preferred payment app. Return here to see the verified result.</p>
        <div className="payment-actions">
          {placed.allowCounterPayment&&<button className="link" disabled={busy} onClick={()=>void changePayment(true)}>Pay at counter instead</button>}
          <button className="link" disabled={busy} onClick={()=>void refresh()}>Check payment status</button>
        </div>
      </>}
      {error&&<p role="alert" className="warn">{error}<button className="link" onClick={()=>void refresh()}>Check again</button></p>}
      {placed.balance&&<p className="muted" role="status">Collected: {inr(placed.balance.collectedPaise/100)} · Remaining: {inr(placed.balance.outstandingPaise/100)}{placed.balance.refundedPaise>0?` · Refunded: ${inr(placed.balance.refundedPaise/100)}`:''}</p>}
      <OrderReceipt order={placed}/>
      <button className="primary" onClick={onMore}>Order more</button>
    </section>
  );
}
