import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  PAGE_LANGUAGES,
  type PageEngagementAction,
  type RestaurantPageView,
  type RestaurantPageDish,
  type RestaurantPageCategory,
  type RestaurantBusinessHours,
  type RestaurantPageContent,
  type ReservationInput
} from './types';
import { translatedPage } from './page-content';
import { diverseSignatureDishes, restaurantOpeningStatus } from './restaurant-hours';
import { restaurantLabel, type RestaurantLabel } from './restaurant-labels';
const LabelLanguage = createContext('en');
const useLabel = () => {
  const language = useContext(LabelLanguage);
  return (key: RestaurantLabel, values?: Record<string, string | number>) => restaurantLabel(language, key, values);
};
function OpeningStatus({ hours, now }: { hours: RestaurantBusinessHours | null | undefined; now: number }) {
  const l = useLabel(),
    language = useContext(LabelLanguage),
    status = restaurantOpeningStatus(hours, now);
  if (!status) return null;
  let next = '';
  if (status.next)
    try {
      next = new Intl.DateTimeFormat(language, {
        timeZone: 'UTC',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
      }).format(new Date(status.next.date + 'T' + status.next.time + ':00Z'));
    } catch {
      next = status.next.date + ' ' + status.next.time;
    }
  return (
    <div className={`rp-opening-status ${status.open ? 'is-open' : 'is-closed'}`} role="status">
      <strong>{l(status.open ? 'openNow' : 'closed')}</strong>
      {!status.open && next && (
        <span>
          {l('nextOpening')}: {next}
        </span>
      )}
      <small>{status.timezone}</small>
    </div>
  );
}
function structuredHoursText(hours: RestaurantBusinessHours | null | undefined, language: string) {
  if (!hours || !restaurantOpeningStatus(hours)) return '';
  return hours.weekly
    .slice()
    .sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7))
    .map(
      (row) =>
        new Intl.DateTimeFormat(language, { timeZone: 'UTC', weekday: 'short' }).format(new Date(Date.UTC(2024, 0, 7 + row.day))) +
        ': ' +
        (row.intervals.map((value) => value.start + '–' + value.end).join(', ') || restaurantLabel(language, 'closed'))
    )
    .join('\n');
}
import './restaurant-page.css';
import './restaurant-page-layout.css';
import './restaurant-website.css';
const safe = (v: string) => {
  if (!v.trim()) return '';
  try {
    const u = new URL(v, typeof location !== 'undefined' ? location.origin : 'https://example.invalid');
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : '';
  } catch {
    return '';
  }
};
function Photo({
  src,
  alt,
  className = '',
  position = 50,
  positionX = 50,
  eager = false,
  fallback = ''
}: {
  src: string;
  alt: string;
  className?: string;
  position?: number;
  positionX?: number;
  eager?: boolean;
  fallback?: string;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  useEffect(() => setFailed([]), [src, fallback]);
  const source = [src, fallback].find((value) => safe(value) && !failed.includes(value));
  return source ? (
    <img
      key={source}
      className={className}
      src={safe(source)}
      alt={alt}
      style={{ objectPosition: `${positionX}% ${position}%` }}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      decoding="async"
      onError={() => setFailed((values) => [...values, source])}
    />
  ) : (
    <div className={`rp-photo-empty ${className}`} aria-label={alt}>
      <span aria-hidden="true">✦</span>
    </div>
  );
}
const money = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return String(n);
  }
};
function DishGrid({
  items,
  currency,
  onDish,
  compact = false
}: {
  items: RestaurantPageDish[];
  currency: string;
  onDish?: (id: string) => void;
  compact?: boolean;
}) {
  const l = useLabel();
  return (
    <div
      className={`rp-dishes${compact ? ' rp-dishes-compact' : ''}`}
      tabIndex={compact ? undefined : 0}
      role={compact ? undefined : 'region'}
      aria-label={compact ? undefined : 'Signature dishes; scroll to explore'}
    >
      {items.map((d) => (
        <article className="rp-dish" key={d.id}>
          <Photo src={d.imageUrl || ''} alt={d.name} />
          <div>
            <h3>{d.name}</h3>
            {d.description && <p>{d.description}</p>}
            {d.allergens?.length ? (
              <small>
                {l('allergens')}: {d.allergens.join(', ')}
              </small>
            ) : null}
            <div className="rp-dish-price">
              <b>{money(d.price, currency)}</b>
              {onDish && (
                <button type="button" onClick={() => onDish(d.id)} aria-label={l('view') + ' ' + d.name}>
                  {l('view')} ↗
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function MenuSection({
  items,
  categories = [],
  currency,
  onDish
}: {
  items: RestaurantPageDish[];
  categories?: RestaurantPageCategory[];
  currency: string;
  onDish?: (id: string) => void;
}) {
  const l = useLabel(),
    language = useContext(LabelLanguage);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(8);
  const [category, setCategory] = useState('ALL');
  const available = categories.filter((row) => items.some((item) => item.categoryId === row.id));
  const active = available.some((row) => row.id === category) ? category : 'ALL';
  const filtered = items.filter(
    (item) =>
      (active === 'ALL' || item.categoryId === active) &&
      `${item.name} ${item.description || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  return (
    <section id="rp-menu" className="rp-section rp-menu-section" tabIndex={-1} aria-label="Restaurant menu">
      <div className="rp-section-title">
        <div>
          <p className="rp-kicker">Something for every appetite</p>
          <h2>{l('exploreMenu')}</h2>
        </div>
        <span className="rp-menu-count">{l('dishCount', { count: items.length })}</span>
      </div>
      {available.length > 0 && (
        <div className="rp-menu-categories" role="group" aria-label={l('allCategories')}>
          <button
            type="button"
            aria-pressed={active === 'ALL'}
            onClick={() => {
              setCategory('ALL');
              setLimit(8);
            }}
          >
            {l('allCategories')}
          </button>
          {available.map((row) => (
            <button
              key={row.id}
              type="button"
              aria-pressed={active === row.id}
              onClick={() => {
                setCategory(row.id);
                setLimit(8);
              }}
            >
              {row.translations?.[language]?.name || row.name}
            </button>
          ))}
        </div>
      )}
      <div className="rp-menu-toolbar">
        <label>
          <span>{l('findDish')}</span>
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder={l('search')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(8);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>
        <p role="status">{filtered.length ? l('showing', { visible: Math.min(limit, filtered.length), total: filtered.length }) : l('noMatches')}</p>
      </div>
      <DishGrid items={filtered.slice(0, limit)} currency={currency} onDish={onDish} compact />
      {filtered.length > limit && (
        <button type="button" className="rp-secondary rp-more-menu" onClick={() => setLimit((value) => value + 12)}>
          {l('showMore')} <span aria-hidden="true">↓</span>
        </button>
      )}
    </section>
  );
}
/** Native modal keeps menu browsing separate from the restaurant website and traps focus. */
function MenuDialog({
  items,
  categories,
  currency,
  restaurantName,
  onClose,
  onDish,
  orderHref,
  preview,
  onPreviewOrder,
  onOrder
}: {
  items: RestaurantPageDish[];
  categories: RestaurantPageCategory[];
  currency: string;
  restaurantName: string;
  onClose: () => void;
  onDish?: (id: string) => void;
  orderHref: string | null;
  preview: boolean;
  onPreviewOrder?: () => void;
  onOrder?: () => void;
}) {
  const l = useLabel();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="rp-menu-dialog"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const stops = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
          )
        ).filter((node) => node.getClientRects().length > 0);
        const first = stops[0],
          last = stops[stops.length - 1];
        if (first && event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (last && !event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const bounds = dialog.current.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
        }
      }}
    >
      <div className="rp-menu-dialog-heading">
        <div>
          <p className="rp-kicker">{restaurantName}</p>
          <h2 id={titleId}>{l('exploreMenu')}</h2>
          <p>{l(orderHref ? 'orderHint' : 'menuHint')}</p>
        </div>
        <button autoFocus type="button" className="rp-menu-close" aria-label={l('closeMenu')} onClick={onClose}>
          ×
        </button>
      </div>
      <MenuSection
        items={items}
        categories={categories}
        currency={currency}
        onDish={
          onDish
            ? (id) => {
                onClose();
                onDish(id);
              }
            : undefined
        }
      />
      {orderHref && (
        <div className="rp-menu-dialog-order">
          <p>{l('ready')}</p>
          <a
            className="rp-order"
            href={orderHref}
            onClick={(event) => {
              if (preview) {
                event.preventDefault();
                onPreviewOrder?.();
              } else onOrder?.();
            }}
          >
            {l('orderOnline')} <span aria-hidden="true">↗</span>
          </a>
        </div>
      )}
    </dialog>
  );
}
function LocationMap({ address, branchName }: { address: string; branchName: string }) {
  const l = useLabel();
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="rp-map">
      {loaded ? (
        <iframe
          title={branchName + ' location'}
          src={'https://maps.google.com/maps?q=' + encodeURIComponent(address) + '&output=embed'}
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <button type="button" className="rp-load-map" onClick={() => setLoaded(true)}>
          <span className="rp-map-pin" aria-hidden="true">
            ⌖
          </span>
          <strong>{l('viewMap')}</strong>
          <span>{address}</span>
          <small>{l('loadMap')}</small>
        </button>
      )}
    </div>
  );
}
/** A real website needs a browsable gallery, not a static grid you can only look at --
 * scroll-snap track + arrows + dots, no carousel library. Shows a peek of the next slide
 * (partial-width flex basis, see CSS) so it reads as swipeable rather than a single full-bleed
 * photo that looks static until touched. */
function GalleryCarousel({ photos }: { photos: Array<{ url: string; caption: string }> }) {
  const l = useLabel();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const go = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(photos.length - 1, i));
    const slide = track.children[next] as HTMLElement | undefined;
    const first = track.children[0] as HTMLElement | undefined;
    if (slide && first) track.scrollTo({ left: slide.offsetLeft - first.offsetLeft, behavior: 'smooth' });
    setIndex(next);
  };
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      const slides = Array.from(track.children) as HTMLElement[];
      const start = slides[0]?.offsetLeft ?? 0;
      let nearest = 0;
      slides.forEach((slide, i) => {
        if (Math.abs(slide.offsetLeft - start - track.scrollLeft) < Math.abs((slides[nearest]?.offsetLeft ?? start) - start - track.scrollLeft)) nearest = i;
      });
      setIndex(nearest);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => track.removeEventListener('scroll', onScroll);
  }, [photos.length]);
  return (
    <div className="rp-carousel">
      <div className="rp-carousel-track" ref={trackRef}>
        {photos.map((g, i) => (
          <figure className="rp-carousel-slide" key={g.url + i}>
            <Photo src={g.url} alt={g.caption || 'Restaurant photograph ' + (i + 1)} />
            {g.caption && <figcaption>{g.caption}</figcaption>}
          </figure>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <button
            type="button"
            className="rp-carousel-arrow rp-carousel-prev"
            aria-label={l('previousPhoto')}
            onClick={() => go(index - 1)}
            disabled={index === 0}
          >
            ‹
          </button>
          <button
            type="button"
            className="rp-carousel-arrow rp-carousel-next"
            aria-label={l('nextPhoto')}
            onClick={() => go(index + 1)}
            disabled={index === photos.length - 1}
          >
            ›
          </button>
          <div className="rp-carousel-dots" role="group" aria-label="Photo navigation">
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={i === index}
                aria-label={l('photo') + ' ' + (i + 1)}
                className="rp-carousel-dot"
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
function ReservationForm({ onSubmit }: { onSubmit: (input: ReservationInput) => Promise<unknown> }) {
  const l = useLabel();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [guests, setGuests] = useState(2);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  if (status === 'done')
    return (
      <div className="rp-reserve-done" role="status">
        <p>{l('reservationDone', { name: name.trim().split(' ')[0], phone })}</p>
      </div>
    );
  return (
    <form
      className="rp-reserve-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setStatus('busy');
        setError('');
        try {
          await onSubmit({ name, phone, date, time, guests, note });
          setStatus('done');
        } catch (err) {
          setStatus('error');
          setError((err as Error).message || l('reservationError'));
        }
      }}
    >
      <label>
        {l('name')}
        <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        {l('phone')}
        <input required type="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
      </label>
      <div className="rp-reserve-row">
        <label>
          {l('date')}
          <input required type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {l('time')}
          <input required type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label>
          {l('guests')}
          <input required type="number" min={1} max={50} value={guests} onChange={(e) => setGuests(Number(e.target.value))} />
        </label>
      </div>
      <label>
        {l('note')}
        <textarea maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && (
        <p className="rp-reserve-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="rp-order" disabled={status === 'busy'}>
        {status === 'busy' ? l('sending') : l('requestTable')}
      </button>
    </form>
  );
}
/** Recognizable at a glance in the footer's link row -- a bare "Instagram" text link reads as
 * one more line of copy; a guest scanning the page for "how do I follow/message/find this place"
 * needs the icon shape, not just the label, to jump out. */
const LINK_ICONS: Record<string, JSX.Element> = {
  INSTAGRAM_CLICK: (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="16" height="16" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14.5" cy="5.5" r="1" fill="currentColor" />
    </svg>
  ),
  WHATSAPP_CLICK: (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M10 2.5a7.5 7.5 0 0 0-6.4 11.4L2.5 17.5l3.7-1.1A7.5 7.5 0 1 0 10 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M7.2 7.6c.3-.7.6-.7.9-.7h.5c.2 0 .4 0 .5.4l.6 1.4c.1.2 0 .4-.1.5l-.5.6c-.1.2-.1.3 0 .5.3.6 1.3 1.6 1.9 1.9.2.1.3.1.5 0l.6-.5c.2-.1.3-.2.5-.1l1.4.6c.3.1.4.3.4.5v.5c0 .3 0 .6-.7.9-1 .4-2.6-.2-4.1-1.7s-2.1-3.1-1.7-4.1Z"
        fill="currentColor"
      />
    </svg>
  ),
  DIRECTIONS_CLICK: (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M10 18s6-5.7 6-10.3A6 6 0 0 0 4 7.7C4 12.3 10 18 10 18Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="10" cy="7.7" r="2.1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  REVIEW_CLICK: (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M10 2.8l2.1 4.5 4.9.6-3.6 3.5.9 4.9L10 13.9l-4.3 2.4.9-4.9-3.6-3.5 4.9-.6L10 2.8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
};
export function RestaurantContactFooter({
  content: c,
  branchName,
  restaurantName,
  onAction
}: {
  content: RestaurantPageContent;
  branchName: string;
  restaurantName?: string;
  onAction?: (action: PageEngagementAction) => void;
}) {
  const l = useLabel();
  const links = [
    { label: 'Instagram', url: c.instagram, action: 'INSTAGRAM_CLICK' as const },
    { label: 'WhatsApp', url: c.whatsapp ? 'https://wa.me/' + c.whatsapp.replace(/\D/g, '') : '', action: 'WHATSAPP_CLICK' as const },
    { label: l('directions'), url: c.mapsUrl, action: 'DIRECTIONS_CLICK' as const },
    { label: l('googleReview'), url: c.reviewUrl, action: 'REVIEW_CLICK' as const }
  ].filter((i) => i.url && safe(i.url));
  return (
    <footer className="rp-footer">
      <div>
        <p className="rp-kicker">{l('footerKicker')}</p>
        <strong>{restaurantName || branchName}</strong>
        {restaurantName && restaurantName !== branchName && <p>{branchName}</p>}
        {c.address && <p>{c.address}</p>}
        {c.phone && (
          <a href={'tel:' + c.phone.replace(/[^+\d]/g, '')} onClick={() => onAction?.('CALL_CLICK')}>
            {l('call')} {c.phone}
          </a>
        )}
      </div>
      {c.hours && (
        <div className="rp-footer-hours">
          <h3>{l('hours')}</h3>
          <p>{c.hours}</p>
        </div>
      )}
      {links.length > 0 && (
        <nav aria-label="Restaurant links">
          {links.map((i) => (
            <a key={i.label} href={safe(i.url)} target="_blank" rel="noopener noreferrer" onClick={() => onAction?.(i.action)}>
              {LINK_ICONS[i.action]}
              {i.label}
              <span aria-hidden="true"> ↗</span>
            </a>
          ))}
        </nav>
      )}
      {c.footer && <p className="rp-footer-note">{c.footer}</p>}
      <p className="rp-powered">
        {l('publishedWith')} <b>JAMANVAAR</b>
      </p>
    </footer>
  );
}
export function RestaurantPage({
  page,
  items: sourceItems,
  categories = [],
  onMenu,
  menuLabel = 'View menu',
  availability = '',
  preview = false,
  browseMenu = false,
  onDish,
  language,
  onLanguageChange,
  onAction,
  onReserve,
  now
}: {
  page: RestaurantPageView;
  items: RestaurantPageDish[];
  categories?: RestaurantPageCategory[];
  onMenu?: () => void;
  menuLabel?: string;
  availability?: string;
  preview?: boolean;
  /** Standalone website: menu is opened on demand, separate from the landing page. */
  browseMenu?: boolean;
  onDish?: (id: string) => void;
  language?: string;
  onLanguageChange?: (language: string) => void;
  onAction?: (action: PageEngagementAction) => void;
  onReserve?: (input: ReservationInput) => Promise<unknown>;
  now?: number;
}) {
  const [selectedLanguage, setSelectedLanguage] = useState(page.content.defaultLanguage || 'en');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLElement | null>(null);
  const navigationId = useId();
  const surface = useRef<HTMLDivElement>(null);
  const [showMobileAction, setShowMobileAction] = useState(false);
  useEffect(() => {
    const hero = surface.current?.querySelector('.rp-hero');
    const footer = surface.current?.querySelector('.rp-footer');
    if (!hero || !footer || typeof IntersectionObserver === 'undefined') return;
    let heroVisible = true;
    let footerVisible = false;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) heroVisible = entry.isIntersecting;
        if (entry.target === footer) footerVisible = entry.isIntersecting;
      }
      setShowMobileAction(!heroVisible && !footerVisible);
    });
    observer.observe(hero);
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const languages = Array.from(new Set(['en', page.content.defaultLanguage || 'en', ...Object.keys(page.content.translations || {})])).filter(
    (l) => PAGE_LANGUAGES[l]
  );
  const currentLanguage = languages.includes(language || selectedLanguage) ? language || selectedLanguage : page.content.defaultLanguage || 'en';
  const l = (key: RestaurantLabel, values?: Record<string, string | number>) => restaurantLabel(currentLanguage, key, values);
  const items = sourceItems.map((item) => ({ ...item, ...item.translations?.[currentLanguage] }));
  const displayMenuLabel = currentLanguage === 'en' ? menuLabel : l('exploreMenu');
  const c = translatedPage(page.content, currentLanguage, now ?? clock),
    featured = diverseSignatureDishes(items, c.featuredItemIds),
    name = c.title || page.restaurantName;
  c.hours = structuredHoursText(c.businessHours, currentLanguage) || c.hours;
  const heroDish = items.find((item) => item.imageUrl && safe(item.imageUrl));
  const heroSource = c.heroUrl || heroDish?.imageUrl || c.gallery.find((photo) => safe(photo.url))?.url || '';
  const jump = (id: string) => {
    setNavigationOpen(false);
    const section = surface.current?.querySelector<HTMLElement>(`[id="${id}"]`);
    if (section) {
      section.tabIndex = -1;
      section.focus({ preventScroll: true });
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const rgb = (/^#[0-9a-f]{6}$/i.test(c.accent) ? c.accent : '#A84816')
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16));
  const ink = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 150 ? '#102b32' : '#ffffff';
  const sectionSet = new Set(c.sections);
  const openMenu = () => {
    setNavigationOpen(false);
    onAction?.('MENU_OPEN');
    if (browseMenu) {
      const active = document.activeElement as HTMLElement | null;
      const toggle = surface.current?.querySelector<HTMLButtonElement>('.rp-nav-toggle');
      // The mobile navigation collapses when Menu opens; restore to its visible toggle.
      menuTrigger.current = active?.closest('.rp-nav') && toggle?.getClientRects().length ? toggle : active;
      setMenuOpen(true);
    } else onMenu?.();
  };
  const closeMenu = () => {
    setMenuOpen(false);
    requestAnimationFrame(() => menuTrigger.current?.focus({ preventScroll: true }));
  };
  const navLinks = (
    [
      items.length ? { id: 'rp-menu', label: l('menu') } : null,
      sectionSet.has('ABOUT') && c.about ? { id: 'rp-about', label: l('about') } : null,
      sectionSet.has('GALLERY') && c.gallery.length ? { id: 'rp-gallery', label: l('gallery') } : null,
      sectionSet.has('VISIT') && (c.hours || c.address || c.phone || c.mapsUrl || c.businessHours) ? { id: 'rp-visit', label: l('visit') } : null,
      page.locations?.length ? { id: 'rp-locations', label: l('locations') } : null,
      c.testimonials.length ? { id: 'rp-testimonials', label: l('reviews') } : null,
      page.reservationsEnabled && onReserve ? { id: 'rp-reserve', label: l('reserve') } : null
    ] as const
  ).filter((link): link is { id: string; label: string } => link !== null);
  // A guest already mid-way through their own table's order has a better path than this link --
  // their live table session already knows their table, tenders and in-progress cart. The
  // standalone business-site visitor (no table) is who this button exists for.
  const orderAddress = !page.table && items.length > 0 ? safe(page.orderOnlineUrl || '') : '';
  // A branch can be configured to open its website first. An explicit Order online action
  // must skip that introduction and open the existing ordering menu, preserving the QR token.
  const orderDestination = orderAddress ? new URL(orderAddress) : null;
  if (orderDestination && /^\/q\/[^/]+\/?$/.test(orderDestination.pathname)) orderDestination.hash = 'menu';
  const orderHref = orderDestination?.href || null;
  const action = orderHref ? (
    <a
      className="rp-order"
      href={orderHref}
      onClick={(event) => {
        if (preview) {
          event.preventDefault();
          onMenu?.();
        } else onAction?.('MENU_OPEN');
      }}
    >
      {l('orderOnline')}
      <span aria-hidden="true"> ↗</span>
    </a>
  ) : (
    <button type="button" className="rp-order" disabled={!items.length || (!browseMenu && !onMenu)} onClick={openMenu}>
      {displayMenuLabel}
      <span aria-hidden="true"> ↗</span>
    </button>
  );
  return (
    <LabelLanguage.Provider value={currentLanguage}>
      <div className="rp-surface" ref={surface}>
        <div className={`rp-page rp-${c.template.toLowerCase()}`} style={{ '--rp-accent': c.accent, '--rp-button-ink': ink } as CSSProperties}>
          {preview && <div className="rp-preview-label">LIVE DESIGN PREVIEW · NO REAL ORDER</div>}
          <header
            className="rp-header"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setNavigationOpen(false);
            }}
          >
            <div className="rp-wordmark">
              {c.logoUrl ? (
                <Photo src={c.logoUrl} alt={page.restaurantName + ' logo'} eager />
              ) : (
                <span className="rp-brand-initial" aria-hidden="true">
                  {page.restaurantName.trim().charAt(0)}
                </span>
              )}
              <span title={page.restaurantName}>{page.restaurantName}</span>
            </div>
            {navLinks.length > 0 && (
              <nav id={navigationId} className={`rp-nav${navigationOpen ? ' rp-nav-open' : ''}`} aria-label="Page sections">
                {navLinks.map((link) => (
                  <a
                    key={link.id}
                    href={'#' + link.id}
                    onClick={(e) => {
                      e.preventDefault();
                      link.id === 'rp-menu' ? openMenu() : jump(link.id);
                    }}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            )}
            <div className="rp-header-actions">
              <span className="rp-place">{page.table ? l('table') + ' ' + page.table : page.branchName}</span>
              {orderHref ? (
                <a
                  className="rp-nav-order"
                  href={orderHref}
                  onClick={(event) => {
                    if (preview) {
                      event.preventDefault();
                      onMenu?.();
                    } else onAction?.('MENU_OPEN');
                  }}
                >
                  {l('orderOnline')}
                </a>
              ) : (
                items.length > 0 && (
                  <button type="button" className="rp-nav-order" disabled={!browseMenu && !onMenu} onClick={openMenu}>
                    {displayMenuLabel}
                  </button>
                )
              )}
            </div>
            {navLinks.length > 0 && (
              <button
                type="button"
                className="rp-nav-toggle"
                aria-label={l(navigationOpen ? 'closeNavigation' : 'openNavigation')}
                aria-expanded={navigationOpen}
                aria-controls={navigationId}
                onClick={() => setNavigationOpen((value) => !value)}
              >
                <span aria-hidden="true">{navigationOpen ? '×' : '☰'}</span>
              </button>
            )}
          </header>
          {languages.length > 1 && (
            <nav className="rp-languages" aria-label="Restaurant page language">
              {languages.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={l === currentLanguage}
                  onClick={() => {
                    setSelectedLanguage(l);
                    onLanguageChange?.(l);
                  }}
                >
                  {PAGE_LANGUAGES[l]}
                </button>
              ))}
            </nav>
          )}
          <main>
            <section className="rp-hero">
              <div className="rp-hero-photo">
                <Photo
                  src={heroSource}
                  fallback={heroDish?.imageUrl}
                  alt={!c.heroUrl && heroDish ? heroDish.name : name}
                  position={c.heroPosition}
                  positionX={c.heroPositionX}
                  eager
                />
                <span className="rp-photo-caption">{!c.heroUrl && heroDish ? heroDish.name : c.tagline || page.branchName}</span>
              </div>
              <div className="rp-hero-copy">
                <p className="rp-kicker">{c.tagline || l('heroKicker')}</p>
                <h1>{name}</h1>
                <p className="rp-welcome">{c.welcome}</p>
                <div className="rp-hero-actions">
                  {action}
                  {orderHref ? (
                    <button type="button" className="rp-secondary" onClick={openMenu}>
                      {l('exploreMenu')} <span aria-hidden="true">↗</span>
                    </button>
                  ) : c.mapsUrl && safe(c.mapsUrl) ? (
                    <a className="rp-secondary" href={safe(c.mapsUrl)} target="_blank" rel="noopener noreferrer" onClick={() => onAction?.('DIRECTIONS_CLICK')}>
                      {l('visit')} <span aria-hidden="true">↗</span>
                    </a>
                  ) : page.reservationsEnabled && onReserve ? (
                    <button type="button" className="rp-secondary" onClick={() => jump('rp-reserve')}>
                      {l('requestTable')} <span aria-hidden="true">↗</span>
                    </button>
                  ) : null}
                </div>
                <p className="rp-branch">
                  {page.branchName}
                  {page.table ? ' · ' + l('table') + ' ' + page.table : ''}
                </p>
              </div>
            </section>
            <OpeningStatus hours={c.businessHours} now={now ?? clock} />
            {(c.address || c.hours || c.phone || page.table) && (
              <div className="rp-visit-strip" aria-label="At a glance">
                {page.table ? (
                  <div>
                    <span>{l('yourTable')}</span>
                    <strong>{page.table}</strong>
                  </div>
                ) : c.address ? (
                  <div>
                    <span>{l('findUs')}</span>
                    <a
                      href="#rp-visit"
                      onClick={(event) => {
                        event.preventDefault();
                        sectionSet.has('VISIT') ? jump('rp-visit') : surface.current?.querySelector('.rp-footer')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      {c.address}
                    </a>
                  </div>
                ) : null}
                {c.hours && !c.businessHours && (
                  <div>
                    <span>{l('hours')}</span>
                    <strong>{c.hours}</strong>
                  </div>
                )}
                {c.phone && (
                  <div>
                    <span>{l('talk')}</span>
                    <a href={'tel:' + c.phone.replace(/[^+\d]/g, '')} onClick={() => onAction?.('CALL_CLICK')}>
                      {c.phone}
                    </a>
                  </div>
                )}
              </div>
            )}
            {c.press.length > 0 && (
              <div className="rp-press" aria-label="Press mentions">
                <span className="rp-press-label">As seen in</span>
                {c.press.map((p, i) =>
                  p.url ? (
                    <a key={p.label + i} href={safe(p.url)} target="_blank" rel="noopener noreferrer">
                      {p.label}
                    </a>
                  ) : (
                    <span key={p.label + i}>{p.label}</span>
                  )
                )}
              </div>
            )}
            {c.notice && <aside className="rp-notice">{c.notice}</aside>}
            {availability && (
              <p className="rp-availability" role="status">
                {availability}
              </p>
            )}
            {c.sections.map((section) => {
              if (section === 'FEATURED' && featured.length)
                return (
                  <section key={section} id="rp-signatures" className="rp-section rp-signatures">
                    <div className="rp-section-title">
                      <div>
                        <p className="rp-kicker">{l('fromKitchen')}</p>
                        <h2>{l(c.featuredItemIds.length ? 'signatures' : 'taste')}</h2>
                        <p className="rp-section-intro">{l('inspiration')}</p>
                      </div>
                      <span aria-hidden="true">✦</span>
                    </div>
                    <DishGrid items={featured} currency={page.currency} onDish={onDish} />
                    <button type="button" className="rp-text-link" onClick={openMenu}>
                      {l('exploreMenu')} <span aria-hidden="true">↗</span>
                    </button>
                  </section>
                );
              if (section === 'ABOUT' && c.about)
                return (
                  <section key={section} id="rp-about" className="rp-section rp-about">
                    <div className="rp-story-photo">
                      <Photo
                        src={c.gallery[0]?.url || featured.find((item) => item.imageUrl)?.imageUrl || heroSource}
                        alt={c.gallery[0]?.caption || page.restaurantName}
                      />
                      <span className="rp-story-photo-label">{c.gallery[0]?.caption || c.tagline || page.restaurantName}</span>
                    </div>
                    <div>
                      <p className="rp-kicker">{l('ourStory')}</p>
                      <h2>{l('storyTitle')}</h2>
                      <p>{c.about}</p>
                      {sectionSet.has('VISIT') && (c.address || c.hours || c.phone || c.mapsUrl) && (
                        <button type="button" className="rp-text-link" onClick={() => jump('rp-visit')}>
                          {l('storyLink')} <span aria-hidden="true">↗</span>
                        </button>
                      )}
                    </div>
                  </section>
                );
              if (section === 'GALLERY' && c.gallery.length)
                return (
                  <section key={section} id="rp-gallery" className="rp-section rp-gallery-section">
                    <p className="rp-kicker">{l('closerLook')}</p>
                    <h2>{l('galleryTitle')}</h2>
                    <GalleryCarousel photos={c.gallery} />
                  </section>
                );
              return null;
            })}
            {items.length > 0 && (
              <section className="rp-menu-invitation" aria-label="Explore the restaurant menu">
                <div>
                  <p className="rp-kicker">{l('fromKitchen')}</p>
                  <h2>{l('menuInvitation')}</h2>
                  <p>{l('menuInvitationBody')}</p>
                </div>
                <button type="button" className="rp-secondary" onClick={openMenu}>
                  {l('exploreMenu')} <span aria-hidden="true">↗</span>
                </button>
              </section>
            )}
            {sectionSet.has('VISIT') && (c.hours || c.address || c.phone || c.mapsUrl) && (
              <section id="rp-visit" className="rp-section rp-visit">
                <div>
                  <p className="rp-kicker">{l('comeOver')}</p>
                  <h2>{l('findTable')}</h2>
                  <p>{page.branchName}</p>
                </div>
                <div>
                  {c.address && <p>{c.address}</p>}
                  {c.hours && (
                    <>
                      <h3>{l('hours')}</h3>
                      <p className="rp-preline">{c.hours}</p>
                    </>
                  )}
                  {c.mapsUrl && (
                    <a href={safe(c.mapsUrl)} target="_blank" rel="noopener noreferrer" onClick={() => onAction?.('DIRECTIONS_CLICK')}>
                      {l('directions')} ↗
                    </a>
                  )}
                  {c.address && <LocationMap address={c.address} branchName={page.branchName} />}
                </div>
              </section>
            )}
            {!!page.locations?.length && (
              <section id="rp-locations" className="rp-section">
                <p className="rp-kicker">{l('locations')}</p>
                <h2>{l('locations')}</h2>
                <div className="rp-locations">
                  {page.locations.map((l) => (
                    <div key={l.branchId} className={'rp-location' + (l.isCurrent ? ' rp-location-current' : '')}>
                      <h3>
                        {l.name}
                        {l.isCurrent && <span className="rp-location-badge">{page.branchName}</span>}
                      </h3>
                      {l.address && <p>{l.address}</p>}
                      {l.hours && <p className="rp-preline">{l.hours}</p>}
                      {l.phone && (
                        <a href={'tel:' + l.phone.replace(/[^+\d]/g, '')} onClick={() => onAction?.('CALL_CLICK')}>
                          Call {l.phone}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {c.testimonials.length > 0 && (
              <section id="rp-testimonials" className="rp-section">
                <p className="rp-kicker">{l('theirWords')}</p>
                <h2>{l('guestsSay')}</h2>
                <div className="rp-testimonials">
                  {c.testimonials.map((t, i) => (
                    <figure className="rp-testimonial" key={t.author + i}>
                      <blockquote>“{t.quote}”</blockquote>
                      <figcaption>{t.author}</figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}
            {page.reservationsEnabled && onReserve && (
              <section id="rp-reserve" className="rp-section rp-reserve">
                <div>
                  <p className="rp-kicker">{l('visit')}</p>
                  <h2>{l('reserveTitle')}</h2>
                  <p className="rp-reserve-intro">{l('reserveInfo')}</p>
                </div>
                <ReservationForm onSubmit={onReserve} />
              </section>
            )}
          </main>
          <RestaurantContactFooter content={c} branchName={page.branchName} restaurantName={page.restaurantName} onAction={onAction} />
          <div className="rp-sticky-action" hidden={!showMobileAction}>
            {page.table && (
              <small>
                {l('table')} {page.table}
              </small>
            )}
            {action}
          </div>
          {menuOpen && (
            <MenuDialog
              items={items}
              categories={categories}
              currency={page.currency}
              restaurantName={page.restaurantName}
              onClose={closeMenu}
              onDish={onDish}
              orderHref={orderHref}
              preview={preview}
              onPreviewOrder={onMenu}
              onOrder={() => onAction?.('MENU_OPEN')}
            />
          )}
        </div>
      </div>
    </LabelLanguage.Provider>
  );
}
