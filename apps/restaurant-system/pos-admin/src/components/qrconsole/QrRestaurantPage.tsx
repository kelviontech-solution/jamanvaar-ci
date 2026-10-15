import { useEffect, useRef, useState } from 'react';
import { request, cloudQrAccount } from '../../cloud/cloudClient';
import { RestaurantPage } from '../../../../../../packages/ui/src/restaurant-page/RestaurantPage';
import { DEFAULT_RESTAURANT_PAGE, type RestaurantPageContent, type RestaurantPageDish } from '../../../../../../packages/ui/src/restaurant-page/types';
import { useQrUnsavedChanges, requestQrLeave } from './useQrUnsavedChanges';
import { resolveMenuImage } from '../../../../../../packages/utils/src/menu_image';
import { FeatureRequestButton } from './FeatureRequestButton';
import { fillPageDetails, pagePublicationStatus, pagePublishIssue } from './restaurantPageSetup';
import { optimizePageImage } from './optimizePageImage';
import { PageComparison, PageContentOptions, PageBranchCopy, PageEngagement, PageLaunchChecklist } from './QrPageEnhancements';
import { PAGE_LANGUAGES } from '../../../../../../packages/ui/src/restaurant-page/types';
import type { QrTab } from './qrNavigation';
import './restaurant-page-editor.css';
type Editor = {
  affectedBranches: { id: string; name: string; licensed: boolean }[];
  scope: string;
  canEditGlobal: boolean;
  version: number;
  draft: RestaurantPageContent;
  published: RestaurantPageContent | null;
  inherited: boolean;
  publishedAt: string | null;
  capability: { enabled: boolean; reason: string };
  restaurantName: string;
  branchName: string;
  currency: string;
  defaultAddress: string;
  branches: { id: string; name: string; address: string | null }[];
  items: RestaurantPageDish[];
  menuReady: boolean;
  sharePath: string | null;
  shareUrl: string | null;
  history: { id: string; at: string; title: string; template: string }[];
};
const templates = [
  { id: 'HERITAGE', name: 'Heritage', caption: 'Warm ivory · editorial serif · side-by-side story', colour: '#A84816' },
  { id: 'CAFE', name: 'Café', caption: 'Soft peach · bold type · playful rounded photos', colour: '#68422C' },
  { id: 'MODERN', name: 'Modern', caption: 'Full-bleed photo · clean type · deep green', colour: '#245B45' }
] as const;
const endpoint = (scope: string, path = '') => '/api/v1/tenant/qr-page' + path + '?scope=' + encodeURIComponent(scope);
const label: Record<string, string> = {
  title: 'Restaurant page heading',
  tagline: 'Cuisine or short tagline',
  welcome: 'Welcome message',
  about: 'Your restaurant story',
  phone: 'Public phone number',
  whatsapp: 'WhatsApp number (country code + digits)',
  instagram: 'Instagram profile link',
  mapsUrl: 'Google Maps directions link',
  reviewUrl: 'Google review link',
  address: 'Public address',
  hours: 'Physical restaurant opening hours',
  notice: 'Service notice',
  footer: 'Footer message'
};
function imageUrl(ref: string) {
  return resolveMenuImage(ref, { apiBase: import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000' }) || '';
}
function BranchPageLinks({ data }: { data: Editor }) {
  const [branch, setBranch] = useState(data.branches[0]?.id || '');
  const [page, setPage] = useState<Editor | null>(null);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!branch) return;
    let active = true;
    setPage(null);
    setMessage('');
    request<Editor>(endpoint(branch))
      .then((v) => {
        if (active) setPage(v);
      })
      .catch(() => {
        if (active) setMessage('Could not load this branch’s public link. Try again.');
      });
    return () => {
      active = false;
    };
  }, [branch, data.publishedAt, retry]);
  return (
    <div className="qpb-sharing">
      <h3>Share a published branch page</h3>
      <p className="qpb-help">
        Choose a branch here without leaving or changing your draft. The link lets guests browse and contact you; table ordering still uses table QR codes.
      </p>
      <label>
        Branch to share
        <select aria-label="Branch to share" value={branch} onChange={(e) => setBranch(e.target.value)}>
          {data.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {page ? (
        page.capability.enabled && page.published?.enabled && page.shareUrl ? (
          <div className="qpb-actions">
            <a href={page.shareUrl} target="_blank" rel="noopener noreferrer">
              Open live branch page ↗
            </a>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(page.shareUrl!);
                  setMessage('Public restaurant page link copied.');
                } catch {
                  setMessage('Copy is unavailable in this browser. Open the live page and copy its address.');
                }
              }}
            >
              Copy branch page link
            </button>
          </div>
        ) : (
          <p className="qpb-help">
            {!page.capability.enabled
              ? 'This branch does not have restaurant page access. Ask Super Admin to check its branch license.'
              : !page.published?.enabled
                ? 'This branch page is not live. Check its published page settings.'
                : 'The platform administrator must configure the public website address before sharing.'}
          </p>
        )
      ) : (
        !message && <p role="status">Loading branch link…</p>
      )}
      {message && (
        <p role="status">
          {message}
          {!page && <button onClick={() => setRetry((n) => n + 1)}>Retry link</button>}
        </p>
      )}
    </div>
  );
}
export function QrRestaurantPage({ onNavigate }: { onNavigate?: (tab: QrTab, scope:string) => void } = {}) {
  const previewArea = useRef<HTMLDivElement>(null);
  const [previewRoom, setPreviewRoom] = useState(430);
  const [previewLanguage, setPreviewLanguage] = useState('en'),
    [previewTime, setPreviewTime] = useState('');
  const [scope, setScope] = useState<string | null>(null),
    [data, setData] = useState<Editor | null>(null),
    [draft, setDraft] = useState<RestaurantPageContent>(DEFAULT_RESTAURANT_PAGE),
    [saved, setSaved] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [width, setWidth] = useState(390),
    [mode, setMode] = useState<'EDIT' | 'PREVIEW'>('EDIT'),
    [ack, setAck] = useState(false),
    [review, setReview] = useState(false);
  const dirty = JSON.stringify(draft) !== saved && !!data;
  useEffect(() => {
    const area = previewArea.current;
    if (!area) return;
    const observer = new ResizeObserver((entries) => {
      const room = entries[0]?.contentRect.width;
      if (room > 50) setPreviewRoom(room);
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, [!!data]);
  useQrUnsavedChanges(dirty);
  const install = (v: Editor) => {
    setData(v);
    setDraft(v.draft);
    setSaved(JSON.stringify(v.draft));
    setAck(false);
    setReview(false);
  };
  useEffect(() => {
    let active = true;
    cloudQrAccount()
      .then((a) => {
        if (active) setScope(a.role === 'OWNER' ? 'restaurant' : a.branchId);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!scope) return;
    let active = true;
    setData(null);
    setError('');
    request<Editor>(endpoint(scope))
      .then((v) => {
        if (active) install(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [scope]);
  const update = <K extends keyof RestaurantPageContent>(key: K, value: RestaurantPageContent[K]) => {
    setDraft((p) => ({ ...p, [key]: value }));
    setAck(false);
    setReview(false);
  };
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete this change');
    } finally {
      setBusy(false);
    }
  }
  const reload = async () => {
    install(await request<Editor>(endpoint(scope!)));
  };
  const openStep = (id: string) => {
    setMode('EDIT');
    requestAnimationFrame(() => {
      const section = document.getElementById(id) as HTMLDetailsElement | null;
      if (section) {
        section.open = true;
        let ancestor = section.parentElement?.closest('details');
        while (ancestor) {
          ancestor.open = true;
          ancestor = ancestor.parentElement?.closest('details') || null;
        }
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        section.querySelector<HTMLElement>('summary')?.focus();
      }
    });
  };
  const saveAndReview = () =>
    void run(async () => {
      const issue = pagePublishIssue(draft);
      if (issue) {
        openStep(issue.startsWith('Notice') ? 'qpb-schedule' : 'qpb-first-impression');
        throw new Error(issue);
      }
      // Saving is still a draft-only action. Publication requires the separate review acknowledgement.
      if (dirty || data?.version === 0) {
        await request(endpoint(scope!), { method: 'PUT', body: { version: data!.version, content: draft } });
        await reload();
      }
      setReview(true);
      setAck(false);
      setMode('PREVIEW');
      requestAnimationFrame(() => document.getElementById('qpb-review')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    });
  async function upload(file: File | undefined, apply: (ref: string) => void) {
    if (!file) return;
    await run(async () => {
      const prepared = await optimizePageImage(file);
      const image = prepared.image;
      const r = await request<{ ref: string }>(endpoint(scope!, '/images'), { method: 'POST', body: { image } });
      apply(r.ref);
      setNotice(
        `Photo uploaded to this restaurant. Optimized from ${Math.round(prepared.originalBytes / 1024)} KB to ${Math.round(prepared.bytes / 1024)} KB. Save the draft to keep it on your page.`
      );
    });
  }
  if (!data)
    return (
      <section className="qr-page-builder">
        <h2>Restaurant page</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (scope) await reload();
                  else {
                    const account = await cloudQrAccount();
                    setScope(account.role === 'OWNER' ? 'restaurant' : account.branchId);
                  }
                })
              }
            >
              Try loading again
            </button>
          </>
        ) : (
          <p>Loading your page studio…</p>
        )}
      </section>
    );
  const locked = !data.capability.enabled;
  const content = {
    ...draft,
    address: draft.address || data.defaultAddress,
    logoUrl: imageUrl(draft.logoUrl),
    heroUrl: imageUrl(draft.heroUrl),
    gallery: draft.gallery.map((i) => ({ ...i, url: imageUrl(i.url) }))
  };
  const selectedBranch = data.branches.find((b) => b.id === scope);
  return (
    <section className="qr-page-builder">
      <header className="qpb-heading">
        <div>
          <p className="qpb-eyebrow">YOUR RESTAURANT, YOUR WELCOME</p>
          <h2>Restaurant page studio</h2>
          <p>Design a warm first impression. Your menu, table and checkout stay connected.</p>
        </div>
        <label>
          Editing scope
          <select
            aria-label="Editing scope"
            value={scope!}
            disabled={busy}
            onChange={async (e) => {
              const next = e.target.value;
              if (!dirty || (await requestQrLeave())) setScope(next);
            }}
          >
            {data.canEditGlobal && <option value="restaurant">Restaurant-wide defaults</option>}
            {data.branches.map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="qpb-scope">
        <strong>{scope === 'restaurant' ? 'Applies to branches using restaurant defaults' : selectedBranch?.name}</strong>
        <span>
          {scope === 'restaurant'
            ? `${data.branches.length} active branches; branches with their own published page keep their override.`
            : data.inherited
              ? 'Currently inherits the restaurant page. Publish here to create a branch override.'
              : 'This branch has its own page.'}
        </span>
      </div>
      {locked && (
        <div className="qpb-locked" role="status">
          <strong>Restaurant page is not included for this scope.</strong>
          <p>Your Super Admin can enable “Restaurant website & mobile page builder” for the plan or restaurant. Existing QR menu ordering continues.</p>
          <p>
            {data.capability.reason === 'PRODUCT_UNAVAILABLE'
              ? 'Your platform administrator must also make this feature available in the feature catalogue.'
              : 'Ask your platform administrator to check this restaurant and branch’s page access.'}
          </p>
          <FeatureRequestButton featureCode="QR_RESTAURANT_PAGE" featureLabel="Restaurant page" />
          <button type="button" disabled={busy} onClick={() => void run(reload)}>
            Check access again
          </button>
        </div>
      )}
      {!locked && (
        <section className="qpb-setup" aria-label="Restaurant page setup">
          <div className="qpb-setup-heading">
            <div>
              <p className="qpb-eyebrow">A FEW STEPS TO YOUR FIRST PAGE</p>
              <h3>Set up your restaurant welcome</h3>
            </div>
            <span className="qpb-status" role="status">
              {pagePublicationStatus(data.published, draft, !locked)}
            </span>
          </div>
          <p>Your changes stay private until you review and publish. Photos, social links and a gallery are optional.</p>
          <div className="qpb-checklist">
            <button disabled={busy} onClick={() => openStep('qpb-design')}>
              1. Choose a design{' '}
              <small>
                {templates.find((t) => t.id === draft.template)?.name} · {draft.enabled ? 'Page enabled in draft' : 'Page off in draft'}
              </small>
            </button>
            <button disabled={busy} onClick={() => openStep('qpb-first-impression')}>
              2. Add your welcome{' '}
              <small>{draft.title.trim() && draft.welcome.trim() ? 'Heading and welcome added' : 'Heading and welcome needed to enable the page'}</small>
            </button>
            <button disabled={busy} onClick={() => openStep('qpb-contact')}>
              3. Check contact details{' '}
              <small>{draft.address || data.defaultAddress ? 'Address available · check links and hours' : 'Optional · add how guests can reach you'}</small>
            </button>
            <button disabled={busy} onClick={saveAndReview}>
              4. Preview & publish <small>Review the design and affected branches</small>
            </button>
          </div>
          {(!draft.title.trim() || !draft.welcome.trim()) && (
            <button
              disabled={busy}
              onClick={() => {
                setDraft(fillPageDetails(draft, data.restaurantName, data.defaultAddress));
                setReview(false);
                setAck(false);
                setNotice('Restaurant heading and welcome filled where empty. Edit the wording, choose when this page opens, then review and publish.');
                openStep('qpb-first-impression');
              }}
            >
              Fill missing restaurant details
            </button>
          )}
          <p className="qpb-help">
            {data.menuReady
              ? 'Menu published. Guests can continue to the existing ordering flow.'
              : 'Menu not published yet. You can publish restaurant information now; publish your menu before accepting orders.'}
          </p>
        </section>
      )}
      {error && (
        <p className="qpb-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="qpb-notice" role="status">
          {notice}
        </p>
      )}
      <div className="qpb-tabs" role="group" aria-label="Page studio view">
        <button aria-pressed={mode === 'EDIT'} onClick={() => setMode('EDIT')}>
          Edit page
        </button>
        <button aria-pressed={mode === 'PREVIEW'} onClick={() => setMode('PREVIEW')}>
          Mobile preview
        </button>
      </div>
      <div className={'qpb-workspace qpb-mode-' + mode.toLowerCase()}>
        <div className="qpb-editor">
          <fieldset disabled={busy || locked}>
            <details open id="qpb-design">
              <summary>01 · Choose your design</summary>
              <div className="qpb-fields">
                <div className="qpb-template-grid">
                  {templates.map((t) => (
                    <button
                      type="button"
                      aria-pressed={draft.template === t.id}
                      key={t.id}
                      className={'qpb-template qpb-template-' + t.id.toLowerCase()}
                      onClick={() => {
                        update('template', t.id);
                        update('accent', t.colour);
                      }}
                    >
                      <span className="qpb-mini">
                        <i />
                        <b>{t.name}</b>
                        <i />
                      </span>
                      <strong>{t.name}</strong>
                      <small>{t.caption}</small>
                    </button>
                  ))}
                </div>
                <label>
                  <input type="checkbox" checked={draft.enabled} onChange={(e) => update('enabled', e.target.checked)} /> Enable published restaurant page
                </label>
                <label>
                  When customers scan
                  <select aria-label="When customers scan" value={draft.entryMode} onChange={(e) => update('entryMode', e.target.value as 'PAGE' | 'MENU')}>
                    <option value="MENU">Open menu directly</option>
                    <option value="PAGE">Show restaurant page first</option>
                  </select>
                </label>
                <p className="qpb-help">Payment returns and existing order/cart tasks resume directly. Existing printed table QR codes keep working.</p>
                <label>
                  Accent colour
                  <input type="color" value={draft.accent} onChange={(e) => update('accent', e.target.value)} />
                </label>
              </div>
            </details>
            <details open id="qpb-first-impression">
              <summary>02 · Photos & first impression</summary>
              <div className="qpb-fields">
                {(['logoUrl', 'heroUrl'] as const).map((k) => (
                  <label key={k}>
                    {k === 'logoUrl' ? 'Restaurant logo' : 'Hero photograph'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload(e.target.files?.[0], (ref) => update(k, ref))} />
                    {draft[k] && (
                      <>
                        <img className="qpb-upload" src={imageUrl(draft[k])} alt={k === 'logoUrl' ? 'Uploaded logo' : 'Uploaded hero'} />
                        <button type="button" onClick={() => update(k, '')}>
                          Remove image
                        </button>
                      </>
                    )}
                  </label>
                ))}
                <label>
                  Photo focal point · {draft.heroPosition}%
                  <input type="range" min="0" max="100" value={draft.heroPosition} onChange={(e) => update('heroPosition', Number(e.target.value))} />
                </label>
                <label>
                  Photo horizontal focal point · {draft.heroPositionX ?? 50}%
                  <input
                    type="range"
                    aria-label="Photo horizontal focal point"
                    min="0"
                    max="100"
                    value={draft.heroPositionX ?? 50}
                    onChange={(e) => update('heroPositionX', Number(e.target.value))}
                  />
                </label>
                <p className="qpb-help">
                  Upload JPEG, PNG or WebP up to 20 MB. We orient, resize and compress it automatically. Adjust the focal points and check the mobile crop
                  before publishing.
                </p>
                {(['title', 'tagline', 'welcome'] as const).map((k) => (
                  <label key={k}>
                    {label[k]}
                    {k === 'welcome' ? (
                      <textarea aria-label={label[k]} maxLength={400} value={draft[k]} onChange={(e) => update(k, e.target.value)} />
                    ) : (
                      <input maxLength={100} value={draft[k]} onChange={(e) => update(k, e.target.value)} />
                    )}
                  </label>
                ))}
              </div>
            </details>
            <details className="qpb-more">
              <summary>More options · story, gallery, contact & languages</summary>
              <div className="qpb-fields">
                <details id="qpb-story">
                  <summary>03 · Story, dishes & gallery</summary>
                  <div className="qpb-fields">
                    <label>
                      {label.about}
                      <textarea aria-label={label.about} rows={5} maxLength={2000} value={draft.about} onChange={(e) => update('about', e.target.value)} />
                    </label>
                    <label>
                      Featured published dishes (up to 8)
                      <select
                        aria-label="Featured published dishes (up to 8)"
                        multiple
                        value={draft.featuredItemIds}
                        onChange={(e) =>
                          update(
                            'featuredItemIds',
                            Array.from(e.target.selectedOptions)
                              .map((o) => o.value)
                              .slice(0, 8)
                          )
                        }
                      >
                        {data.items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!data.menuReady && <p className="qpb-help">Publish your menu to choose dishes. The restaurant information page can be published first.</p>}
                    <label>
                      Add gallery photograph (up to 8)
                      <input
                        disabled={draft.gallery.length >= 8}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => void upload(e.target.files?.[0], (ref) => update('gallery', [...draft.gallery, { url: ref, caption: '' }]))}
                      />
                    </label>
                    {draft.gallery.map((g, i) => (
                      <div key={g.url + i} className="qpb-gallery-row">
                        <img src={imageUrl(g.url)} alt={g.caption || 'Gallery photo'} />
                        <label>
                          Photo {i + 1} caption
                          <input
                            value={g.caption}
                            maxLength={120}
                            onChange={(e) =>
                              update(
                                'gallery',
                                draft.gallery.map((p, j) => (j === i ? { ...p, caption: e.target.value } : p))
                              )
                            }
                          />
                        </label>
                        <button
                          onClick={() =>
                            update(
                              'gallery',
                              draft.gallery.filter((_, j) => j !== i)
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <h3>Page sections</h3>
                    {(['FEATURED', 'ABOUT', 'GALLERY', 'VISIT'] as const).map((s) => (
                      <label key={s}>
                        <input
                          type="checkbox"
                          checked={draft.sections.includes(s)}
                          onChange={(e) => update('sections', e.target.checked ? [...draft.sections, s] : draft.sections.filter((v) => v !== s))}
                        />
                        {{ FEATURED: 'Featured dishes', ABOUT: 'Our story', GALLERY: 'Photo gallery', VISIT: 'Visit & opening hours' }[s]}
                      </label>
                    ))}
                    <p className="qpb-help">Sections appear in selection order. Empty sections are hidden automatically.</p>
                  </div>
                </details>
                <details id="qpb-contact">
                  <summary>04 · Contact, social links & footer</summary>
                  <div className="qpb-fields">
                    <p className="qpb-help">
                      Use this branch’s own address, review link and hours. Hours here describe physical opening; online ordering hours stay under Ordering
                      Rules.
                    </p>
                    {(['address', 'hours', 'phone', 'whatsapp', 'instagram', 'mapsUrl', 'reviewUrl', 'notice', 'footer'] as const).map((k) => (
                      <label key={k}>
                        {label[k]}
                        {['address', 'hours', 'notice', 'footer'].includes(k) ? (
                          <textarea
                            aria-label={label[k]}
                            maxLength={k === 'hours' ? 600 : k === 'address' ? 500 : 250}
                            placeholder={k === 'address' ? data.defaultAddress : undefined}
                            value={draft[k]}
                            onChange={(e) => update(k, e.target.value)}
                          />
                        ) : (
                          <input
                            type={['phone', 'whatsapp'].includes(k) ? 'tel' : 'url'}
                            value={draft[k]}
                            maxLength={1200}
                            onChange={(e) => update(k, e.target.value)}
                            placeholder={k === 'whatsapp' ? '+919876543210' : undefined}
                          />
                        )}
                      </label>
                    ))}
                    <p className="qpb-help">
                      Google review opens Google’s own review form. Private feedback remains separate; review submission is not tracked or rewarded.
                    </p>
                  </div>
                </details>
                <PageContentOptions
                  draft={draft}
                  onChange={(next) => {
                    setDraft(next);
                    setReview(false);
                    setAck(false);
                  }}
                />
              </div>
            </details>
          </fieldset>
          {!locked && <PageLaunchChecklist key={scope!+data.publishedAt} scope={scope!} publication={data.publishedAt} onNavigate={next=>onNavigate?.(next,scope!)} />}
          <section className="qpb-publish">
            <p>
              <strong>{pagePublicationStatus(data.published, draft, !locked)}</strong>
              <small>
                {dirty ? 'Unsaved changes on this screen' : 'Draft saved'} ·{' '}
                {data.published?.enabled ? 'Customers still see your last published page.' : 'Customers currently open the normal QR menu.'}
              </small>
              {data.publishedAt && <small>Last published {new Date(data.publishedAt).toLocaleString()}</small>}
            </p>
            <div className="qpb-actions">
              <button
                disabled={busy || locked || !dirty}
                onClick={() =>
                  void run(async () => {
                    await request(endpoint(scope!), { method: 'PUT', body: { version: data.version, content: draft } });
                    await reload();
                    setNotice('Draft saved. Customers still see the published version.');
                  })
                }
              >
                Save draft
              </button>
              <button disabled={busy || locked} onClick={saveAndReview}>
                {dirty ? 'Save & review' : 'Review & publish'}
              </button>
            </div>
            {review && (
              <div className="qpb-review" id="qpb-review">
                <h3>Review before publishing</h3>
                <PageComparison before={data.published} after={draft} />
                <p>
                  {scope === 'restaurant'
                    ? `Updates ${data.affectedBranches.filter((b) => b.licensed).length} licensed branches using restaurant defaults.`
                    : selectedBranch?.name + ' only.'}
                </p>
                {scope === 'restaurant' && (
                  <ul>
                    {data.affectedBranches.map((b) => (
                      <li key={b.id}>
                        {b.name}
                        {!b.licensed ? ' (page feature not enabled; stays on normal menu)' : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <p>
                  {draft.enabled
                    ? draft.entryMode === 'PAGE'
                      ? 'Fresh scans will open this page first.'
                      : 'Scans open the menu directly; restaurant information stays accessible.'
                    : 'The restaurant page is disabled. Existing menu ordering continues.'}
                </p>
                <label>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I reviewed the design, contact links and affected scope.
                </label>
                <button
                  disabled={!ack || busy || locked}
                  onClick={() =>
                    void run(async () => {
                      install(await request<Editor>(endpoint(scope!, '/publish'), { method: 'POST', body: { version: data.version } }));
                      setNotice('Restaurant page published. New visitors receive this version.');
                    })
                  }
                >
                  Publish reviewed page
                </button>
              </div>
            )}
            {scope !== 'restaurant' && !data.inherited && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (dirty && !(await requestQrLeave())) return;
                    install(await request<Editor>(endpoint(scope!, '/inherit'), { method: 'POST', body: { version: data.version } }));
                    setNotice('This branch now uses the published restaurant defaults.');
                  })
                }
              >
                Use restaurant defaults
              </button>
            )}
            {data.shareUrl && data.published?.enabled && !locked && (
              <p>
                <a href={data.shareUrl} target="_blank" rel="noopener noreferrer">
                  Open shareable restaurant page ↗
                </a>
                <button
                  onClick={() =>
                    void run(async () => {
                      await navigator.clipboard.writeText(data.shareUrl!);
                      setNotice('Public restaurant page link copied.');
                    })
                  }
                >
                  Copy page link
                </button>
                <small>The share link browses the menu without assigning a table.</small>
              </p>
            )}
            {scope === 'restaurant' && data.published?.enabled && !locked && <BranchPageLinks data={data} />}
            {data.sharePath && !data.shareUrl && (
              <p role="status">The public website address must be configured by your platform administrator before sharing this page.</p>
            )}
            {data.history.length > 0 && (
              <label>
                Restore a previous publication into this draft
                <select
                  defaultValue=""
                  disabled={busy || locked}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id)
                      void run(async () => {
                        if (dirty && !(await requestQrLeave())) return;
                        install(await request<Editor>(endpoint(scope!, '/restore'), { method: 'POST', body: { version: data.version, id } }));
                        setNotice('Previous design restored to draft. Preview and publish to apply it.');
                      });
                  }}
                >
                  <option value="">Choose a saved version</option>
                  {data.history.map((h) => (
                    <option key={h.id} value={h.id}>
                      {new Date(h.at).toLocaleString()} · {h.template} · {h.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
          {!locked && (
            <div className="qpb-extra-reports">
              <PageEngagement key={scope!+data.publishedAt} scope={scope!} publication={data.publishedAt} />
              {data.canEditGlobal && <PageBranchCopy key={scope} scope={scope!} version={data.version} dirty={dirty} branches={data.branches} />}
            </div>
          )}
        </div>
        <aside className="qpb-preview">
          <div className="qpb-preview-tools">
            <strong>Live mobile preview</strong>
            <label>
              Preview width
              <select aria-label="Preview width" value={width} onChange={(e) => setWidth(Number(e.target.value))}>
                {[360, 390, 430, 960].map((n) => (
                  <option value={n} key={n}>
                    {n === 960 ? 'Desktop' : n + ' px'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="qpb-preview-options">
            <label>
              Preview language
              <select aria-label="Preview language" value={previewLanguage} onChange={(e) => setPreviewLanguage(e.target.value)}>
                {Array.from(new Set(['en', draft.defaultLanguage || 'en', ...Object.keys(draft.translations || {})])).map((lang) => (
                  <option key={lang} value={lang}>
                    {PAGE_LANGUAGES[lang] || lang}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Preview notice at
              <input aria-label="Preview notice at" type="datetime-local" value={previewTime} onChange={(e) => setPreviewTime(e.target.value)} />
            </label>
            <button onClick={() => setPreviewTime('')}>Use current time</button>
          </div>
          <div className="qpb-device-scroll" ref={previewArea}>
            <div className="qpb-device" style={{ width, maxWidth: 'none', zoom: Math.min(1, (previewRoom - 12) / width) }}>
              <RestaurantPage
                preview
                language={previewLanguage}
                onLanguageChange={setPreviewLanguage}
                now={previewTime ? new Date(previewTime).getTime() : undefined}
                page={{
                  content,
                  restaurantName: data.restaurantName,
                  branchName: data.branchName,
                  table: scope === 'restaurant' ? null : '1',
                  currency: data.currency
                }}
                items={data.items.map((i) => ({ ...i, imageUrl: imageUrl(i.imageUrl || '') }))}
                onMenu={() => setNotice('Preview only: this opens the existing menu in the customer flow. No real order or payment is created.')}
                onDish={() => setNotice('Preview only: dish customization opens in the real menu. No cart was changed.')}
              />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
