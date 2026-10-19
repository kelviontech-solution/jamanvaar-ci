import { useEffect, useState } from 'react';
import { request } from '../../cloud/cloudClient';
import { PAGE_LANGUAGES, PAGE_TRANSLATED_FIELDS, type RestaurantPageContent } from '../../../../../../packages/ui/src/restaurant-page/types';
import { pageDifferences } from '../../../../../../packages/ui/src/restaurant-page/page-content';
import type { QrTab } from './qrNavigation';
import { resolveMenuImage } from '../../../../../../packages/utils/src/menu_image';
const endpoint = (scope: string, path: string) => '/api/v1/tenant/qr-page/' + path + '?scope=' + encodeURIComponent(scope);
export const pageFieldLabels: Record<string, string> = {
  enabled: 'Page enabled',
  entryMode: 'Scan destination',
  template: 'Design',
  title: 'Heading',
  tagline: 'Tagline',
  welcome: 'Welcome message',
  about: 'Restaurant story',
  accent: 'Accent colour',
  logoUrl: 'Logo',
  heroUrl: 'Hero photo',
  heroPosition: 'Photo vertical focus',
  heroPositionX: 'Photo horizontal focus',
  gallery: 'Gallery',
  featuredItemIds: 'Featured dishes',
  sections: 'Page sections',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  mapsUrl: 'Directions link',
  reviewUrl: 'Google review link',
  address: 'Address',
  hours: 'Opening hours',
  businessHours: 'Structured opening hours & holidays',
  seo: 'Search & social sharing',
  notice: 'Notice',
  footer: 'Footer',
  testimonials: 'Testimonials',
  press: 'Press & awards',
  translations: 'Translations',
  defaultLanguage: 'Default language',
  noticeStart: 'Notice starts',
  noticeEnd: 'Notice ends',
  engagementEnabled: 'Engagement reporting'
};
function readable(value: unknown): string {
  if (value === true) return 'On';
  if (value === false) return 'Off';
  if (!value) return 'Not set';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
function ComparedValue({ field, value }: { field: string; value: unknown }) {
  if(field==='businessHours'&&value&&typeof value==='object'){
    const hours=value as NonNullable<RestaurantPageContent['businessHours']>;
    return <div><p><strong>Timezone:</strong> {hours.timezone}</p>{hours.weekly.map(row=><p key={row.day}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][row.day]}: {row.intervals.map(shift=>`${shift.start} – ${shift.end}`).join(', ')||'Closed'}</p>)}{hours.exceptions.map(row=><p key={row.date}>{row.date}: {row.intervals.map(shift=>`${shift.start} – ${shift.end}`).join(', ')||'Closed all day'}</p>)}</div>;
  }
  if(field==='seo'&&value&&typeof value==='object'){
    const seo=value as NonNullable<RestaurantPageContent['seo']>;
    return <div><p><strong>Title:</strong> {seo.title||'Restaurant name & branch'}</p><p><strong>Description:</strong> {seo.description||'Welcome message'}</p>{seo.imageUrl?<img className="qpb-diff-photo" alt="Sharing photograph" src={resolveMenuImage(seo.imageUrl,{apiBase:import.meta.env.VITE_CLOUD_API_BASE_URL||'http://localhost:4000'})||''}/>:<p>Cover photograph used for sharing</p>}</div>;
  }
  if ((field === 'heroUrl' || field === 'logoUrl') && typeof value === 'string' && value)
    return (
      <img
        className="qpb-diff-photo"
        src={resolveMenuImage(value, { apiBase: import.meta.env.VITE_CLOUD_API_BASE_URL || 'http://localhost:4000' }) || ''}
        alt={pageFieldLabels[field]}
      />
    );
  if (field === 'gallery' && Array.isArray(value) && value.length)
    return (
      <div>
        {value.map((item, i) => (
          <figure key={i}>
            <img
              className="qpb-diff-photo"
              src={resolveMenuImage(item.url, { apiBase: import.meta.env.VITE_CLOUD_API_BASE_URL || 'http://localhost:4000' }) || ''}
              alt={item.caption || 'Gallery photograph'}
            />
            <figcaption>{item.caption}</figcaption>
          </figure>
        ))}
      </div>
    );
  if (field === 'testimonials' && Array.isArray(value) && value.length)
    return (
      <div>
        {value.map((item, i) => (
          <p key={i}>
            “{item.quote}” — {item.author}
          </p>
        ))}
      </div>
    );
  if (field === 'press' && Array.isArray(value) && value.length)
    return (
      <div>
        {value.map((item, i) => (
          <p key={i}>{item.url ? `${item.label} (${item.url})` : item.label}</p>
        ))}
      </div>
    );
  return <p>{readable(value)}</p>;
}
export function PageComparison({ before, after }: { before: RestaurantPageContent | null; after: RestaurantPageContent }) {
  const differences = pageDifferences(before, after);
  return (
    <section className="qpb-comparison" aria-label="Changes since publication">
      <h3>
        {before ? 'Changes since the live version' : 'Your first publication'} · {differences.length} changed settings
      </h3>
      <p className="qpb-help">Review text, photographs and scan behaviour before applying this version.</p>
      {differences.map((d) => (
        <details key={d.key}>
          <summary>{pageFieldLabels[d.key] || d.key}</summary>
          <div className="qpb-diff">
            <div>
              <b>Live</b>
              <ComparedValue field={d.key} value={d.before} />
            </div>
            <div>
              <b>Draft</b>
              <ComparedValue field={d.key} value={d.after} />
            </div>
          </div>
        </details>
      ))}
      {!differences.length && <p>No content changes since publication.</p>}
    </section>
  );
}
const localTime = (iso?: string) => (iso ? new Date(Date.parse(iso) - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const toIso = (local: string) => (local ? new Date(local).toISOString() : '');
export function PageContentOptions({ draft, onChange }: { draft: RestaurantPageContent; onChange: (draft: RestaurantPageContent) => void }) {
  const [lang, setLang] = useState('hi');
  const translation = draft.translations?.[lang] || {};
  return (
    <>
      <details>
        <summary>Languages & translated welcome</summary>
        <div className="qpb-fields">
          <p className="qpb-help">
            Main text is the fallback. Empty translated fields use that main text. Enter your own translation; this does not translate dish names or change your
            menu-language license.
          </p>
          <label>
            Default page language
            <select
              aria-label="Default page language"
              value={draft.defaultLanguage || 'en'}
              onChange={(e) => onChange({ ...draft, defaultLanguage: e.target.value })}
            >
              {Object.entries(PAGE_LANGUAGES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                  {code === 'en' ? ' · main text' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Edit translation
            <select aria-label="Edit translation" value={lang} onChange={(e) => setLang(e.target.value)}>
              {Object.entries(PAGE_LANGUAGES)
                .filter(([code]) => code !== 'en')
                .map(([code, name]) => (
                  <option value={code} key={code}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
          {PAGE_TRANSLATED_FIELDS.map((key) => (
            <label key={key}>
              {PAGE_LANGUAGES[lang]} · {pageFieldLabels[key]}
              <textarea
                aria-label={PAGE_LANGUAGES[lang] + ' ' + pageFieldLabels[key]}
                value={translation[key] || ''}
                maxLength={key === 'about' ? 2000 : key === 'welcome' ? 400 : key === 'hours' ? 600 : key === 'title' || key === 'tagline' ? 100 : 250}
                placeholder={'Uses main text: ' + (draft[key] || 'not set')}
                onChange={(e) => onChange({ ...draft, translations: { ...draft.translations, [lang]: { ...translation, [key]: e.target.value } } })}
              />
            </label>
          ))}
          {draft.translations?.[lang] && (
            <button
              type="button"
              onClick={() => {
                const translations = { ...draft.translations };
                delete translations[lang];
                onChange({ ...draft, translations });
              }}
            >
              Remove this translation
            </button>
          )}
        </div>
      </details>
      <details id="qpb-schedule">
        <summary>Schedule your service notice</summary>
        <div className="qpb-fields">
          <p className="qpb-help">
            Times use this device’s timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). They are stored as exact instants. Empty start means
            immediately; empty end means no expiry. This does not change ordering hours.
          </p>
          <label>
            Scheduled service notice
            <textarea
              aria-label="Scheduled service notice"
              maxLength={250}
              value={draft.notice}
              onChange={(e) => onChange({ ...draft, notice: e.target.value })}
            />
          </label>
          <label>
            Notice starts
            <input
              aria-label="Notice starts"
              type="datetime-local"
              value={localTime(draft.noticeStart)}
              onChange={(e) => onChange({ ...draft, noticeStart: toIso(e.target.value) })}
            />
          </label>
          <label>
            Notice ends
            <input
              aria-label="Notice ends"
              type="datetime-local"
              value={localTime(draft.noticeEnd)}
              onChange={(e) => onChange({ ...draft, noticeEnd: toIso(e.target.value) })}
            />
          </label>
          <button type="button" onClick={() => onChange({ ...draft, noticeStart: '', noticeEnd: '' })}>
            Remove notice schedule
          </button>
        </div>
      </details>
      <details>
        <summary>Page engagement & privacy</summary>
        <div className="qpb-fields">
          <label>
            <input type="checkbox" checked={draft.engagementEnabled === true} onChange={(e) => onChange({ ...draft, engagementEnabled: e.target.checked })} />{' '}
            Collect anonymous page engagement after publishing
          </label>
          <p className="qpb-help">
            Count page views, menu opens and contact-link clicks. No customer name, phone, session or browsing profile is stored for these events. Preview
            creates no events. Do Not Track and Global Privacy Control are respected. Reports show the last 30 days; anonymous event records are cleaned up
            after 90 days when new events arrive. A Google review click does not mean a review was submitted.
          </p>
        </div>
      </details>
    </>
  );
}
type Launch = {
  pageEnabled:boolean;
  health: { checks: { id: string; label: string; ready: boolean; required: boolean; action: string; tab: string }[]; scope: string };
  testCurrent: boolean;
  currentPublication: string | null;
  branchRequired: boolean;
  recentOrders: { id: string; token: string; at: string }[];
};
export function PageLaunchChecklist({ scope, publication, onNavigate }: { scope: string; publication: string | null; onNavigate?: (tab: QrTab) => void }) {
  const [data, setData] = useState<Launch | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [order, setOrder] = useState(''),
    [scanned, setScanned] = useState(false),
    [kitchen, setKitchen] = useState(false);
  const load = async () => {
    setBusy(true);
    setError('');
    try {
      setData(await request<Launch>(endpoint(scope, 'launch')));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    setData(null);
    setOrder('');
    setScanned(false);
    setKitchen(false);
    void load();
  }, [scope, publication]);
  return (
    <details className="qpb-launch">
      <summary>Launch checklist · page, menu, payment & test scan</summary>
      <div className="qpb-fields">
        <p className="qpb-help">
          Information pages can be published before ordering is ready. Complete the ordering checks and a real branch test before inviting customers.
        </p>
        <button disabled={busy} onClick={() => void load()}>
          Refresh launch checklist
        </button>
        {error && <p role="alert">{error}</p>}
        {data && (
          <>
            <p>
              <strong>{data.health.scope}</strong>
            </p>
            <ul className="qpb-launch-list">
              <li>{publication&&data.pageEnabled ? '✓' : '○'} Page reviewed, published and enabled</li>
              {data.health.checks.map((c) => (
                <li key={c.id}>
                  {c.ready ? '✓' : '○'} {c.label}
                  {!c.ready && (
                    <>
                      <p className="qpb-help">{c.action}</p>
                      {onNavigate && <button onClick={() => onNavigate((c.id==='ordering'?'RULES':c.tab) as QrTab)}>Fix {c.label.toLowerCase()}</button>}
                    </>
                  )}
                </li>
              ))}
              <li>
                {data.testCurrent ? '✓' : '○'} Current page test scan and kitchen receipt
                {data.testCurrent && (
                  <p className="qpb-help">
                    Recorded by a signed-in administrator against a real QR order. The scan and kitchen receipt are staff attestations, not automatic device
                    verification.
                  </p>
                )}
              </li>
            </ul>
            {data.branchRequired ? (
              <p className="qpb-help">Choose one branch in Editing scope to record its test. Each branch needs its own acceptance.</p>
            ) : (
              <>
                <label>
                  Test QR order
                  <select aria-label="Test QR order" value={order} onChange={(e) => setOrder(e.target.value)}>
                    <option value="">Choose an order placed after publication</option>
                    {data.recentOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.token} · {new Date(o.at).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input type="checkbox" checked={scanned} onChange={(e) => setScanned(e.target.checked)} /> I scanned this branch’s table QR and placed the
                  selected test order.
                </label>
                <label>
                  <input type="checkbox" checked={kitchen} onChange={(e) => setKitchen(e.target.checked)} /> I checked that staff received this order in the
                  kitchen.
                </label>
                <button
                  disabled={busy || !order || !scanned || !kitchen || !publication}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      setData(
                        await request<Launch>(endpoint(scope, 'launch'), { method: 'POST', body: { orderId: order, scanned, kitchenReceived: kitchen } })
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Record branch launch check
                </button>
                <p className="qpb-help">Online-payment acceptance is separate: use Payment Acceptance to confirm an actual server-verified collection.</p>
              </>
            )}
          </>
        )}
      </div>
    </details>
  );
}
export function PageEngagement({ scope, publication }: { scope: string; publication: string | null }) {
  const [data, setData] = useState<{ counts: Record<string, number>; description: string } | null>(null),
    [error, setError] = useState('');
  const load = () => {
    setError('');
    request<{ counts: Record<string, number>; description: string }>(endpoint(scope, 'engagement'))
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    setData(null);
    load();
  }, [scope, publication]);
  return (
    <details>
      <summary>Engagement report · last 30 days</summary>
      <div className="qpb-fields">
        <button onClick={load}>Refresh engagement report</button>
        {error && <p role="alert">{error}</p>}
        {data && (
          <>
            <p className="qpb-help">{data.description}</p>
            <dl className="qpb-metrics">
              {Object.entries({
                PAGE_VIEW: 'Page views',
                MENU_OPEN: 'Menu opens',
                CALL_CLICK: 'Call clicks',
                WHATSAPP_CLICK: 'WhatsApp clicks',
                DIRECTIONS_CLICK: 'Directions clicks',
                INSTAGRAM_CLICK: 'Instagram clicks',
                REVIEW_CLICK: 'Google review link clicks'
              }).map(([key, name]) => (
                <div key={key}>
                  <dt>{name}</dt>
                  <dd>{data.counts[key] || 0}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </details>
  );
}
export function PageBranchCopy({
  scope,
  version,
  dirty,
  branches
}: {
  scope: string;
  version: number;
  dirty: boolean;
  branches: { id: string; name: string }[];
}) {
  const [targets, setTargets] = useState<string[]>([]),
    [groups, setGroups] = useState(['DESIGN', 'STORY', 'PHOTOS']),
    [plan, setPlan] = useState<{
      checksum: string;
      branches: { id: string; name: string; changes: { field: string; before: unknown; after: unknown }[] }[];
    } | null>(null),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    setPlan(null);
    setAck(false);
  }, [scope, version, dirty, targets, groups]);
  const input = { version, targets, groups };
  const run = async (apply = false) => {
    setBusy(true);
    setMessage('');
    try {
      if (apply) {
        await request(endpoint(scope, 'copy'), { method: 'POST', body: { input, checksum: plan!.checksum } });
        setPlan(null);
        setAck(false);
        setMessage('Copied to branch drafts only. Open each branch to preview and publish it.');
      } else setPlan(await request(endpoint(scope, 'copy-preview'), { method: 'POST', body: input }));
    } catch (e) {
      setPlan(null);
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details>
      <summary>Copy selected content to other branches</summary>
      <div className="qpb-fields">
        <p className="qpb-help">
          Owner-only. Save the source draft, select target branches and review every difference. This creates drafts; live pages do not change. Contact details
          and scan behaviour are excluded unless selected.
        </p>
        {dirty && <p>Save your draft before preparing a branch copy.</p>}
        <fieldset disabled={busy || dirty}>
          <legend>Target branches (up to 20)</legend>
          {branches
            .filter((b) => b.id !== scope)
            .map((b) => (
              <label key={b.id}>
                <input
                  type="checkbox"
                  checked={targets.includes(b.id)}
                  onChange={(e) => setTargets(e.target.checked ? [...targets, b.id] : targets.filter((id) => id !== b.id))}
                />
                {b.name}
              </label>
            ))}
        </fieldset>
        <fieldset disabled={busy || dirty}>
          <legend>What to copy</legend>
          {Object.entries({
            DESIGN: 'Design, colours & sections',
            STORY: 'Welcome, story, testimonials, press, translations & notice',
            PHOTOS: 'Logo, hero & gallery',
            CONTACT: 'Contact details, hours & review links — replaces target details',
            BEHAVIOUR: 'Enablement, scan destination, featured dishes & analytics'
          }).map(([key, name]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={groups.includes(key)}
                onChange={(e) => setGroups(e.target.checked ? [...groups, key] : groups.filter((g) => g !== key))}
              />
              {name}
            </label>
          ))}
        </fieldset>
        <button disabled={busy || dirty || !targets.length || targets.length > 20 || !groups.length} onClick={() => void run()}>
          Review branch copy
        </button>
        {plan && (
          <div className="qpb-review">
            {plan.branches.map((b) => (
              <div key={b.id}>
                <h3>
                  {b.name} · {b.changes.length} changes
                </h3>
                {b.changes.map((c) => (
                  <details key={c.field}>
                    <summary>{pageFieldLabels[c.field] || c.field}</summary>
                    <div className="qpb-diff">
                      <p>Current draft: {readable(c.before)}</p>
                      <p>Copied draft: {readable(c.after)}</p>
                    </div>
                  </details>
                ))}
              </div>
            ))}
            <label>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I reviewed the selected branches and differences.
            </label>
            <button disabled={busy || !ack || dirty} onClick={() => void run(true)}>
              Copy reviewed content to drafts
            </button>
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}
