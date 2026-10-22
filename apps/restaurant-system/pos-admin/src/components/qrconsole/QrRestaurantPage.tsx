import { useEffect, useRef, useState } from 'react';
import { request, cloudQrAccount } from '../../cloud/cloudClient';
import { RestaurantPage } from '../../../../../../packages/ui/src/restaurant-page/RestaurantPage';
import { DEFAULT_RESTAURANT_PAGE, type RestaurantPageContent, type RestaurantPageDish, type RestaurantPageCategory } from '../../../../../../packages/ui/src/restaurant-page/types';
import { diverseSignatureDishes } from '../../../../../../packages/ui/src/restaurant-page/restaurant-hours';
import { RestaurantHoursEditor } from './RestaurantPageDetails';
import { useQrUnsavedChanges, requestQrLeave } from './useQrUnsavedChanges';
import { resolveMenuImage } from '../../../../../../packages/utils/src/menu_image';
import { menuDishImage } from '../../../../../../packages/utils/src/dish_photos';
import { FeatureRequestButton } from './FeatureRequestButton';
import { fillPageDetails, pagePublicationStatus, pageReviewIssue } from './restaurantPageSetup';
import { optimizePageImage } from './optimizePageImage';
import { PageComparison, PageContentOptions, PageBranchCopy, PageEngagement, PageLaunchChecklist } from './QrPageEnhancements';
import { PAGE_LANGUAGES } from '../../../../../../packages/ui/src/restaurant-page/types';
import type { QrTab } from './qrNavigation';
import './restaurant-page-editor.css';
import { Modal } from '@jamanvaar/ui';
import { copyText } from '@jamanvaar/utils';
import { storedAdminBranch } from '../../adminBranchScope';
import { useQrScope, QrEditingScope } from './QrScope';
import { QrWebsiteJourney, type WebsiteStep } from './QrWebsiteJourney';
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
  categories?:RestaurantPageCategory[];
  menuReady: boolean;
  loyaltyEnabled?: boolean;
  sharePath: string | null;
  shareUrl: string | null;
  orderOnlineUrl?: string | null;
  history: { id: string; at: string; title: string; template: string }[];
};
const templates = [
  { id: 'HERITAGE', name: 'Heritage', caption: 'Warm ivory · editorial serif · side-by-side story', colour: '#A84816' },
  { id: 'CAFE', name: 'Café', caption: 'Soft peach · bold type · playful rounded photos', colour: '#68422C' },
  { id: 'MODERN', name: 'Modern', caption: 'Full-bleed photo · clean type · deep green', colour: '#245B45' },
  { id: 'INDIAN', name: 'Indian Restaurant', caption: 'Arched photo frame · jewel-tone welcome panel · gold accents', colour: '#9A3324' }
] as const;
const endpoint = (scope: string, path = '') => '/api/v1/tenant/qr-page' + path + '?scope=' + encodeURIComponent(scope);
const label: Record<string, string> = {
  title: 'Page heading',
  tagline: 'Cuisine or short tagline',
  welcome: 'Welcome message',
  about: 'Your story',
  phone: 'Public phone number',
  whatsapp: 'WhatsApp number (country code + digits)',
  instagram: 'Instagram profile link',
  mapsUrl: 'Google Maps directions link',
  reviewUrl: 'Google review link',
  address: 'Public address',
  hours: 'Physical opening hours',
  notice: 'Service notice',
  footer: 'Footer message'
};
function imageUrl(ref: string) {
  return resolveMenuImage(ref, { apiBase: import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000' }) || '';
}
function initialPageScope(account: { role: string; branchId: string | null }) {
  if (account.role !== 'OWNER') return account.branchId;
  const requested = new URLSearchParams(location.search).get('setupBranch');
  const selected = storedAdminBranch();
  return requested || (selected === 'all' ? 'restaurant' : selected || account.branchId || 'restaurant');
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
                  await copyText(page.shareUrl!);
                  setMessage('Public business page link copied.');
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
              ? 'This branch does not have business page access. Ask Super Admin to check its branch license.'
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
export function QrRestaurantPage({ onNavigate }: { onNavigate?: (tab: QrTab, scope: string) => void } = {}) {
  const workspaceScope = useQrScope();
  const previewArea = useRef<HTMLDivElement>(null);
  const firstScope = useRef(true);
  const handledJourneyLink = useRef(false);
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
    [mode, setMode] = useState<'EDIT' | 'PREVIEW'>(() => new URLSearchParams(location.search).get('websiteStep') === 'preview' ? 'PREVIEW' : 'EDIT'),
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
        if (active) setScope(workspaceScope.managed ? (a.role === 'OWNER' ? workspaceScope.branchId || 'restaurant' : a.branchId) : initialPageScope(a));
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
        if (active) {
          if (!workspaceScope.managed && firstScope.current && scope === 'restaurant' && v.canEditGlobal && v.branches.length === 1 && new URLSearchParams(location.search).get('setupBranch') !== 'restaurant' && storedAdminBranch() !== 'all') {
            firstScope.current = false; setScope(v.branches[0].id); return;
          }
          firstScope.current = false; install(v);
        }
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
      // Publish is an explicit intent to go live. A new/off page should not require
      // discovering another activation checkbox before it can be reviewed.
      const publication = !draft.enabled && !data!.published?.enabled
        ? { ...fillPageDetails(draft, data!.restaurantName, data!.defaultAddress), enabled: true }
        : draft;
      const issue = pageReviewIssue(publication,data!.published);
      if (issue) {
        openStep(issue.startsWith('Opening hours') ? 'qpb-contact' : issue.startsWith('Notice') ? 'qpb-schedule' : 'qpb-first-impression');
        throw new Error(issue);
      }
      // Saving is still a draft-only action. Publication requires the separate review acknowledgement.
      if (dirty || data?.version === 0 || publication !== draft) {
        await request(endpoint(scope!), { method: 'PUT', body: { version: data!.version, content: publication } });
        await reload();
      }
      setReview(true);
      setAck(false);
      setMode('PREVIEW');
    });
  useEffect(() => {
    if (!data || handledJourneyLink.current) return;
    handledJourneyLink.current = true;
    const url = new URL(location.href), step = url.searchParams.get('websiteStep');
    if (!step) return;
    url.searchParams.delete('websiteStep'); history.replaceState(null, '', url);
    if (step === 'preview') setMode('PREVIEW');
    if (step === 'publish' && data.capability.enabled) saveAndReview();
  }, [!!data]);
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
        <h2>Business page</h2>
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
                    setScope(workspaceScope.managed ? workspaceScope.branchId || 'restaurant' : initialPageScope(account));
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
  const previewItems = data.items.map((item) => ({ ...item, imageUrl: imageUrl(menuDishImage(item.imageUrl, item.name) || '') }));
  const selectedBranch = data.branches.find((b) => b.id === scope);
  const journey = (step: WebsiteStep) => {
    if(step === 'design') {setMode('EDIT');openStep('qpb-design');}
    else if(step === 'preview')setMode('PREVIEW');
    else if(step === 'publish')saveAndReview();
    else if(onNavigate){if(step === 'test')try{sessionStorage.setItem('qr_website_open_scan_check','1');}catch{}onNavigate('WEBSITE_QR',scope === 'restaurant' ? data.branches[0]?.id || '' : scope!);}
  };
  return (
    <section className="qr-page-builder">
      <header className="qpb-heading">
        <div>
          <p className="qpb-eyebrow">YOUR RESTAURANT, YOUR WELCOME</p>
          <h2 className="sr-only">Business page studio</h2>
          <p>Design a warm first impression. Your menu, table and checkout stay connected.</p>
        </div>
        {workspaceScope.managed ? <QrEditingScope /> : <label>
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
            {data.canEditGlobal && <option value="restaurant">Business-wide defaults</option>}
            {data.branches.map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>}
      </header>
      <QrWebsiteJourney current={review ? 'publish' : mode === 'PREVIEW' ? 'preview' : 'design'} canPublish={!locked} live={!!data.published?.enabled && !locked} onStep={journey} />
      <div className="qpb-toolbar" role="region" aria-label="Website publishing">
        <div><strong>{pagePublicationStatus(data.published, draft, !locked)}</strong><span>{dirty ? 'You have unsaved edits' : data.published?.enabled ? 'Your website is live' : 'Your draft is private'}</span></div>
          <div className="qpb-actions">
            {data.published?.enabled && onNavigate && <button type="button" onClick={() => journey('qr')}>Download website QR</button>}
          <button type="button" disabled={busy || locked || !dirty} onClick={() => void run(async () => {
            await request(endpoint(scope!), { method: 'PUT', body: { version: data.version, content: draft } });
            await reload(); setNotice('Draft saved. Your live website has not changed.');
          })}>{busy ? 'Please wait…' : 'Save draft'}</button>
          <button type="button" className="qpb-primary" disabled={busy || locked} onClick={saveAndReview}>{!draft.enabled && data.published?.enabled ? 'Review switch-off' : data.published?.enabled ? 'Publish changes' : 'Publish website'}</button>
        </div>
      </div>
      <div className="qpb-scope">
        <strong>{scope === 'restaurant' ? 'Applies to branches using business defaults' : selectedBranch?.name}</strong>
        <span>
          {scope === 'restaurant'
            ? `${data.branches.length} active branches; branches with their own published page keep their override.`
            : data.inherited
              ? 'Currently inherits the business page. Publish here to create a branch override.'
              : 'This branch has its own page.'}
        </span>
      </div>
      {locked && (
        <div className="qpb-locked" role="status">
          <strong>Business page is not included for this scope.</strong>
          <p>Your Super Admin can enable “Business website & mobile page builder” for the plan or restaurant. Existing QR menu ordering continues.</p>
          <p>
            {data.capability.reason === 'PRODUCT_UNAVAILABLE'
              ? 'Your platform administrator must also make this feature available in the feature catalogue.'
              : 'Ask your platform administrator to check this business and branch’s page access.'}
          </p>
          <FeatureRequestButton featureCode="QR_RESTAURANT_PAGE" featureLabel="Business page" />
          <button type="button" disabled={busy} onClick={() => void run(reload)}>
            Check access again
          </button>
        </div>
      )}
      {!locked && (
        <details className="qpb-setup" aria-label="Business page setup">
          <summary className="qpb-setup-heading">
            <strong>Quick setup guide</strong>
            <span className="qpb-status" role="status">
              {pagePublicationStatus(data.published, draft, !locked)}
            </span>
          </summary>
          <p>
            Your changes stay private until you review and publish. Start with your headline, a cover photo and a few dishes, then add your story and contact
            details.
          </p>
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
            <button disabled={busy} onClick={() => openStep('qpb-story')}>
              4. Tell your story & choose dishes{' '}
              <small>
                {draft.featuredItemIds.length ? `${draft.featuredItemIds.length} featured dishes chosen` : '3 dishes from different categories shown automatically'} ·{' '}
                {draft.about.trim() ? 'Story added' : 'Add your restaurant story'}
              </small>
            </button>
            <button disabled={busy} onClick={saveAndReview}>
              5. Preview & publish <small>Review the design and affected branches</small>
            </button>
          </div>
          {(!draft.title.trim() || !draft.welcome.trim()) && (
            <button
              disabled={busy}
              onClick={() => {
                setDraft(fillPageDetails(draft, data.restaurantName, data.defaultAddress));
                setReview(false);
                setAck(false);
                setNotice('Page heading and welcome filled where empty. Edit the wording, choose when this page opens, then review and publish.');
                openStep('qpb-first-impression');
              }}
            >
              Fill missing business details
            </button>
          )}
          <p className="qpb-help">
            {data.menuReady
              ? 'Menu published. Guests can continue to the existing ordering flow.'
              : 'Menu not published yet. You can publish business information now; publish your menu before accepting orders.'}
          </p>
        </details>
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
          <fieldset disabled={busy || locked} hidden={locked}>
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
                        {content.heroUrl||previewItems[0]?.imageUrl?<img src={content.heroUrl||previewItems[0].imageUrl} alt=""/>:<i />}
                        <b>{t.name}</b>
                        <i />
                      </span>
                      <strong>{t.name}</strong>
                      <small>{t.caption}</small>
                    </button>
                  ))}
                </div>
                {data.published?.enabled && <label>
                  <input type="checkbox" checked={draft.enabled} onChange={(e) => update('enabled', e.target.checked)} /> Keep website live after publishing
                </label>}
                <div className="qpb-image-note"><strong>Two QR types, two clear destinations</strong><p>Restaurant Page QRs open this website. Table Ordering QRs open the ordering menu directly and keep the table number. Guests can still open About & contact from the menu.</p>{onNavigate&&<button type="button" onClick={()=>onNavigate('WEBSITE_QR',scope!)}>Design & print Restaurant Page QR</button>}</div>
                <label>
                  Accent colour
                  <input type="color" value={draft.accent} onChange={(e) => update('accent', e.target.value)} />
                </label>
              </div>
            </details>
            <details id="qpb-first-impression">
              <summary>02 · Photos & first impression</summary>
              <div className="qpb-fields">
                {(['logoUrl', 'heroUrl'] as const).map((k) => (
                  <label key={k}>
                    {k === 'logoUrl' ? 'Business logo' : 'Hero photograph'}
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
                {!draft.heroUrl && (
                  <p className="qpb-image-note">
                    {previewItems.some((item) => item.imageUrl)
                      ? 'Your first published dish photo is used as the cover until you upload your own restaurant or food photograph. The same fallback appears on the live page.'
                      : 'Add a cover photograph to give your page a strong first impression. Without photos, the page uses a neutral background.'}
                  </p>
                )}
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
            <details id="qpb-contact">
              <summary>03 · Contact, social links & footer</summary>
              <div className="qpb-fields">
                <p className="qpb-help">
                  Use this branch’s own address, review link and hours. Hours here describe physical opening; online ordering hours stay under Ordering Rules.
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
                <RestaurantHoursEditor value={draft.businessHours} onChange={value=>update('businessHours',value)}/>
              </div>
            </details>
            <details id="qpb-story">
              <summary>04 · Story, dishes & gallery</summary>
              <div className="qpb-fields">
                <label>
                  {label.about}
                  <textarea aria-label={label.about} rows={5} maxLength={2000} value={draft.about} onChange={(e) => update('about', e.target.value)} />
                </label>
                <fieldset className="qpb-featured-picker">
                  <legend>Featured published dishes · {draft.featuredItemIds.length}/8</legend>
                  <p className="qpb-help">
                    Choose your own dishes below. With none selected, 3 published dishes from different categories appear automatically. Hide the Featured dishes section
                    below to remove the showcase.
                  </p>
                  <button type="button" onClick={()=>update('featuredItemIds',diverseSignatureDishes(data.items,[]).map(item=>item.id))}>Choose 3 varied dishes for me</button>
                  <div>
                    {previewItems.map((item) => (
                      <label key={item.id}>
                        <input
                          type="checkbox"
                          checked={draft.featuredItemIds.includes(item.id)}
                          disabled={!draft.featuredItemIds.includes(item.id) && draft.featuredItemIds.length >= 8}
                          onChange={(event) =>
                            update(
                              'featuredItemIds',
                              event.target.checked ? [...draft.featuredItemIds, item.id] : draft.featuredItemIds.filter((id) => id !== item.id)
                            )
                          }
                        />
                        {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" />}
                        <span>{item.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {!data.menuReady && <p className="qpb-help">Publish your menu to choose dishes. The business information page can be published first.</p>}
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
                <p className="qpb-help">
                  Your website shows your story, photos and visit details. Order online opens the ordering menu. Empty sections stay hidden.
                </p>
              </div>
            </details>
            <details className="qpb-more">
              <summary>More options · search previews, languages & extras</summary>
              <div className="qpb-fields">
                <details id="qpb-sharing"><summary>Search & social sharing preview</summary><div className="qpb-fields"><p className="qpb-help">These settings are published with your website. Leave them blank to use your restaurant name, welcome and cover photo. A search engine decides how and when it indexes your page.</p>
                  <label>Search title<input maxLength={80} value={draft.seo?.title||''} onChange={event=>update('seo',{...DEFAULT_RESTAURANT_PAGE.seo!,...draft.seo,title:event.target.value})}/></label>
                  <label>Search description<textarea maxLength={180} value={draft.seo?.description||''} onChange={event=>update('seo',{...DEFAULT_RESTAURANT_PAGE.seo!,...draft.seo,description:event.target.value})}/></label>
                  <label>Sharing photograph<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>void upload(event.target.files?.[0],ref=>update('seo',{title:'',description:'',...draft.seo,imageUrl:ref}))}/></label>
                  {draft.seo?.imageUrl&&<><img className="qpb-upload" src={imageUrl(draft.seo.imageUrl)} alt="Sharing preview"/><button type="button" onClick={()=>update('seo',{...draft.seo!,imageUrl:''})}>Use cover photo instead</button></>}
                  <div className="qpb-search-preview"><small>Search & link preview · draft · {selectedBranch?.name||data.branchName}</small><strong>{draft.seo?.title||`${data.restaurantName} · ${selectedBranch?.name||data.branchName}`}</strong><p>{draft.seo?.description||draft.welcome}</p></div>
                </div></details>
                <details id="qpb-testimonials">
                  <summary>05 · Testimonials & press</summary>
                  <div className="qpb-fields">
                    <p className="qpb-help">
                      Each section only appears on the public page once you add at least one entry here. Keep quotes short and genuine — written by you, not
                      generated.
                    </p>
                    <h3>Guest testimonials (up to 6)</h3>
                    {draft.testimonials.map((t, i) => (
                      <div key={i} className="qpb-gallery-row">
                        <label>
                          Quote {i + 1}
                          <textarea
                            maxLength={300}
                            value={t.quote}
                            onChange={(e) =>
                              update(
                                'testimonials',
                                draft.testimonials.map((p, j) => (j === i ? { ...p, quote: e.target.value } : p))
                              )
                            }
                          />
                        </label>
                        <label>
                          Guest name
                          <input
                            maxLength={60}
                            value={t.author}
                            onChange={(e) =>
                              update(
                                'testimonials',
                                draft.testimonials.map((p, j) => (j === i ? { ...p, author: e.target.value } : p))
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            update(
                              'testimonials',
                              draft.testimonials.filter((_, j) => j !== i)
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {draft.testimonials.length < 6 && (
                      <button type="button" onClick={() => update('testimonials', [...draft.testimonials, { quote: '', author: '' }])}>
                        Add testimonial
                      </button>
                    )}
                    <h3>Press & awards mentions (up to 8)</h3>
                    {draft.press.map((p, i) => (
                      <div key={i} className="qpb-gallery-row">
                        <label>
                          Label
                          <input
                            maxLength={120}
                            placeholder="e.g. Featured in Times of India"
                            value={p.label}
                            onChange={(e) =>
                              update(
                                'press',
                                draft.press.map((row, j) => (j === i ? { ...row, label: e.target.value } : row))
                              )
                            }
                          />
                        </label>
                        <label>
                          Link (optional)
                          <input
                            type="url"
                            maxLength={1200}
                            value={p.url}
                            onChange={(e) =>
                              update(
                                'press',
                                draft.press.map((row, j) => (j === i ? { ...row, url: e.target.value } : row))
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            update(
                              'press',
                              draft.press.filter((_, j) => j !== i)
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {draft.press.length < 8 && (
                      <button type="button" onClick={() => update('press', [...draft.press, { label: '', url: '' }])}>
                        Add press mention
                      </button>
                    )}
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
          {!locked && (
            <PageLaunchChecklist
              key={scope! + data.publishedAt}
              scope={scope!}
              publication={data.publishedAt}
              onNavigate={(next) => onNavigate?.(next, scope!)}
            />
          )}
          <section className="qpb-publish" aria-label="Published website and history">
            <p>
              <strong>{pagePublicationStatus(data.published, draft, !locked)}</strong>
              <small>
                {dirty ? 'Unsaved changes on this screen' : 'Draft saved'} ·{' '}
                {data.published?.enabled ? 'Customers still see your last published page.' : 'Customers currently open the normal QR menu.'}
              </small>
              {data.publishedAt && <small>Last published {new Date(data.publishedAt).toLocaleString()}</small>}
            </p>
            {review && (
              <Modal isOpen onClose={() => { if (!busy) setReview(false); }} title={draft.enabled ? 'Publish restaurant website' : 'Switch off restaurant website'} maxWidth="xl" footer={<div className="qpb-review-footer"><button type="button" disabled={busy} onClick={() => setReview(false)}>Keep editing</button><button type="button" className="qpb-primary" disabled={!ack || busy || locked} onClick={() => void run(async () => {
                const published = await request<Editor>(endpoint(scope!, '/publish'), { method: 'POST', body: { version: data.version } });
                install(published);
                setNotice(published.published?.enabled ? 'Your restaurant website is live. You can now share or print its QR.' : 'Your restaurant website is switched off.');
              })}>{busy ? 'Publishing…' : draft.enabled ? 'Publish website now' : 'Switch off website'}</button></div>}>
              <div className="qpb-review" id="qpb-review">
                <PageComparison before={data.published} after={draft} />
                <p>
                  {scope === 'restaurant'
                    ? `Updates ${data.affectedBranches.filter((b) => b.licensed).length} licensed branches using business defaults.`
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
                    ? 'Restaurant Page QRs open this website. Table Ordering QRs open the menu directly.'
                    : 'The business page is disabled. Existing menu ordering continues.'}
                </p>
                <label>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I reviewed the design, contact links and affected scope.
                </label>
                {error && <p role="alert" className="qpb-error">{error}</p>}
              </div>
              </Modal>
            )}
            {error&&<p className="qpb-error">{error}</p>}
            {scope !== 'restaurant' && !data.inherited && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (dirty && !(await requestQrLeave())) return;
                    install(await request<Editor>(endpoint(scope!, '/inherit'), { method: 'POST', body: { version: data.version } }));
                    setNotice('This branch now uses the published business defaults.');
                  })
                }
              >
                Use business defaults
              </button>
            )}
            {data.shareUrl && data.published?.enabled && !locked && (
              <p>
                <a href={data.shareUrl} target="_blank" rel="noopener noreferrer">
                  Open shareable business page ↗
                </a>
                <button
                  onClick={() =>
                    void run(async () => {
                      await copyText(data.shareUrl!);
                      setNotice('Public business page link copied.');
                    })
                  }
                >
                  Copy page link
                </button>
                <small>The share link browses the menu without assigning a table.</small>
              </p>
            )}
            {data.shareUrl && data.published?.enabled && !locked && (
              <div className="qpb-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      onNavigate?.('WEBSITE_QR',scope!);
                    })
                  }
                >
                  Design & print Restaurant Page QR
                </button>
                <small>
                  A distinct poster QR for your door, counter or table tents — scanning it opens this business page, never the table-ordering menu codes.
                </small>
              </div>
            )}
            {scope === 'restaurant' && data.published?.enabled && !locked && <BranchPageLinks data={data} />}
            {scope==='restaurant'&&!locked&&onNavigate&&<button type="button" onClick={()=>onNavigate('WEBSITE_QR',data.branches[0]?.id||'')}>Design & print Restaurant Page QR</button>}
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
            <details className="qpb-extra-reports"><summary>Website activity & branch copying</summary>
              <PageEngagement key={scope! + data.publishedAt} scope={scope!} publication={data.publishedAt} />
              {data.canEditGlobal && <PageBranchCopy key={scope} scope={scope!} version={data.version} dirty={dirty} branches={data.branches} />}
            </details>
          )}
        </div>
        <aside className="qpb-preview">
          <div className="qpb-preview-tools">
            <strong>Live website preview</strong>
            <label>
              Preview width
              <select aria-label="Preview width" value={width} onChange={(e) => setWidth(Number(e.target.value))}>
                {[360, 390, 430, 1280].map((n) => (
                  <option value={n} key={n}>
                    {n === 1280 ? 'Desktop · 1280 px' : n + ' px'}
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
          <p className="qpb-help">
            This preview shows your draft design and menu. Ordering and reservation availability on the live page follow the selected branch’s settings.
          </p>
          <div className="qpb-device-scroll" ref={previewArea}>
            <div className="qpb-device" style={{ width, maxWidth: 'none', zoom: Math.min(1, (previewRoom - 12) / width) }}>
              <RestaurantPage
                preview
                browseMenu
                language={previewLanguage}
                onLanguageChange={setPreviewLanguage}
                now={previewTime ? new Date(previewTime).getTime() : undefined}
                page={{
                  content,
                  restaurantName: data.restaurantName,
                  branchName: data.branchName,
                  table: null,
                  orderOnlineUrl: data.orderOnlineUrl,
                  currency: data.currency,
                  loyaltyEnabled: data.loyaltyEnabled
                }}
                items={previewItems}
                categories={data.categories}
                onMenu={() => setNotice('Preview only: this opens the existing menu in the customer flow. No real order or payment is created.')}
                onAccount={() => setNotice('Preview only: customers sign in with a phone code on your live website. Points come from verified paid orders.')}
                onDish={() => setNotice('Preview only: dish customization opens in the real menu. No cart was changed.')}
              />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
