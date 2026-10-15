import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { PAGE_LANGUAGES, type PageEngagementAction, type RestaurantPageView, type RestaurantPageDish, type RestaurantPageContent } from './types';
import { translatedPage } from './page-content';
import './restaurant-page.css';
const safe = (v: string) => {
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
  positionX = 50
}: {
  src: string;
  alt: string;
  className?: string;
  position?: number;
  positionX?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      key={src}
      className={className}
      src={safe(src)}
      alt={alt}
      style={{ objectPosition: `${positionX}% ${position}%` }}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
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
export function RestaurantContactFooter({
  content: c,
  branchName,
  onAction
}: {
  content: RestaurantPageContent;
  branchName: string;
  onAction?: (action: PageEngagementAction) => void;
}) {
  const links = [
    { label: 'Instagram', url: c.instagram, action: 'INSTAGRAM_CLICK' as const },
    { label: 'WhatsApp', url: c.whatsapp ? 'https://wa.me/' + c.whatsapp.replace(/\D/g, '') : '', action: 'WHATSAPP_CLICK' as const },
    { label: 'Directions', url: c.mapsUrl, action: 'DIRECTIONS_CLICK' as const },
    { label: 'Leave a Google review', url: c.reviewUrl, action: 'REVIEW_CLICK' as const }
  ].filter((i) => i.url && safe(i.url));
  return (
    <footer className="rp-footer">
      <div>
        <strong>{branchName}</strong>
        {c.address && <p>{c.address}</p>}
        {c.phone && (
          <a href={'tel:' + c.phone.replace(/[^+\d]/g, '')} onClick={() => onAction?.('CALL_CLICK')}>
            Call {c.phone}
          </a>
        )}
      </div>
      {links.length > 0 && (
        <nav aria-label="Restaurant links">
          {links.map((i) => (
            <a key={i.label} href={safe(i.url)} target="_blank" rel="noopener noreferrer" onClick={() => onAction?.(i.action)}>
              {i.label}
              <span aria-hidden="true"> ↗</span>
            </a>
          ))}
        </nav>
      )}
      {c.footer && <p className="rp-footer-note">{c.footer}</p>}
      <p className="rp-powered">
        Served with <b>JAMANVAAR</b>
      </p>
    </footer>
  );
}
export function RestaurantPage({
  page,
  items,
  onMenu,
  menuLabel = 'View menu',
  availability = '',
  preview = false,
  onDish,
  language,
  onLanguageChange,
  onAction,
  now
}: {
  page: RestaurantPageView;
  items: RestaurantPageDish[];
  onMenu?: () => void;
  menuLabel?: string;
  availability?: string;
  preview?: boolean;
  onDish?: (id: string) => void;
  language?: string;
  onLanguageChange?: (language: string) => void;
  onAction?: (action: PageEngagementAction) => void;
  now?: number;
}) {
  const [selectedLanguage, setSelectedLanguage] = useState(page.content.defaultLanguage || 'en');
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const languages = Array.from(new Set(['en', page.content.defaultLanguage || 'en', ...Object.keys(page.content.translations || {})])).filter(
    (l) => PAGE_LANGUAGES[l]
  );
  const currentLanguage = languages.includes(language || selectedLanguage) ? language || selectedLanguage : page.content.defaultLanguage || 'en';
  const c = translatedPage(page.content, currentLanguage, now ?? clock),
    featured = c.featuredItemIds.map((id) => items.find((i) => i.id === id)).filter((i): i is RestaurantPageDish => !!i),
    name = c.title || page.restaurantName;
  const rgb = (/^#[0-9a-f]{6}$/i.test(c.accent) ? c.accent : '#A84816')
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16));
  const ink = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 150 ? '#102b32' : '#ffffff';
  const action = (
    <button
      type="button"
      className="rp-order"
      disabled={!onMenu}
      onClick={() => {
        onAction?.('MENU_OPEN');
        onMenu?.();
      }}
    >
      {menuLabel}
      <span aria-hidden="true"> ↗</span>
    </button>
  );
  return (
    <div className="rp-surface">
      <div className={`rp-page rp-${c.template.toLowerCase()}`} style={{ '--rp-accent': c.accent, '--rp-button-ink': ink } as CSSProperties}>
        {preview && <div className="rp-preview-label">LIVE DESIGN PREVIEW · NO REAL ORDER</div>}
        <header className="rp-header">
          <div className="rp-wordmark">
            {c.logoUrl && <Photo src={c.logoUrl} alt={page.restaurantName + ' logo'} />}
            <span>{page.restaurantName}</span>
          </div>
          <span className="rp-place">{page.table ? 'Table ' + page.table : page.branchName}</span>
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
              <Photo src={c.heroUrl} alt={name} position={c.heroPosition} positionX={c.heroPositionX} />
              <span className="rp-photo-caption">{c.tagline || page.branchName}</span>
            </div>
            <div className="rp-hero-copy">
              <p className="rp-kicker">{c.tagline || 'A place at our table'}</p>
              <h1>{name}</h1>
              <p className="rp-welcome">{c.welcome}</p>
              {action}
              <p className="rp-branch">
                {page.branchName}
                {page.table ? ' · Table ' + page.table : ''}
              </p>
            </div>
          </section>
          {c.notice && <aside className="rp-notice">{c.notice}</aside>}
          {availability && (
            <p className="rp-availability" role="status">
              {availability}
            </p>
          )}
          {c.sections.map((section) => {
            if (section === 'FEATURED' && featured.length)
              return (
                <section key={section} className="rp-section">
                  <div className="rp-section-title">
                    <div>
                      <p className="rp-kicker">From our kitchen</p>
                      <h2>A few favourites</h2>
                    </div>
                    <span aria-hidden="true">✦</span>
                  </div>
                  <div className="rp-dishes">
                    {featured.map((d) => (
                      <article className="rp-dish" key={d.id}>
                        <Photo src={d.imageUrl || ''} alt={d.name} />
                        <div>
                          <h3>{d.name}</h3>
                          {d.description && <p>{d.description}</p>}
                          {d.allergens?.length ? <small>Allergens: {d.allergens.join(', ')}</small> : null}
                          <div className="rp-dish-price">
                            <b>{money(d.price, page.currency)}</b>
                            {onDish && (
                              <button type="button" onClick={() => onDish(d.id)} aria-label={'View ' + d.name}>
                                View ↗
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            if (section === 'ABOUT' && c.about)
              return (
                <section key={section} className="rp-section rp-about">
                  <span className="rp-ornament" aria-hidden="true">
                    ✳
                  </span>
                  <div>
                    <p className="rp-kicker">Our story</p>
                    <h2>
                      Made with care.
                      <br />
                      Shared with you.
                    </h2>
                    <p>{c.about}</p>
                  </div>
                </section>
              );
            if (section === 'GALLERY' && c.gallery.length)
              return (
                <section key={section} className="rp-section">
                  <p className="rp-kicker">A closer look</p>
                  <h2>At our place</h2>
                  <div className="rp-gallery">
                    {c.gallery.map((g, i) => (
                      <figure key={g.url + i}>
                        <Photo src={g.url} alt={g.caption || 'Restaurant photograph ' + (i + 1)} />
                        {g.caption && <figcaption>{g.caption}</figcaption>}
                      </figure>
                    ))}
                  </div>
                </section>
              );
            if (section === 'VISIT' && (c.hours || c.address || c.phone || c.mapsUrl))
              return (
                <section key={section} className="rp-section rp-visit">
                  <div>
                    <p className="rp-kicker">Come on over</p>
                    <h2>Find your table.</h2>
                    <p>{page.branchName}</p>
                  </div>
                  <div>
                    {c.address && <p>{c.address}</p>}
                    {c.hours && (
                      <>
                        <h3>Restaurant opening hours</h3>
                        <p className="rp-preline">{c.hours}</p>
                      </>
                    )}
                    {c.mapsUrl && (
                      <a href={safe(c.mapsUrl)} target="_blank" rel="noopener noreferrer" onClick={() => onAction?.('DIRECTIONS_CLICK')}>
                        Get directions ↗
                      </a>
                    )}
                  </div>
                </section>
              );
            return null;
          })}
        </main>
        <RestaurantContactFooter content={c} branchName={page.branchName} onAction={onAction} />
        <div className="rp-sticky-action">
          {page.table && <small>Ordering for Table {page.table}</small>}
          {action}
        </div>
      </div>
    </div>
  );
}
