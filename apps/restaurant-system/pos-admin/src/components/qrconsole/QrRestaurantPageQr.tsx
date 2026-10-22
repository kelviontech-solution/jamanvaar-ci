import { useEffect, useState } from 'react';
import { useConfirm } from '@jamanvaar/ui';
import { cloudQrAccount, request } from '../../cloud/cloudClient';
import { QrAdminApi, type QrPrintData, type QrPrintDesign } from '../../cloud/qrAdminClient';
import { designSvg, downloadCardPng, downloadDesignSvg, printCards, withLogo } from './qrPrint';
import { useQrUnsavedChanges } from './useQrUnsavedChanges';
import type { QrTab } from './qrNavigation';
import './restaurant-page-qr.css';
import { useQrScope, QrEditingScope } from './QrScope';
import { QrWebsiteJourney } from './QrWebsiteJourney';

type DesignState = { version: number; design: QrPrintDesign };
type Branch = { id: string; name: string };
const endpoint = (branch: string) => '/api/v1/tenant/qr-page/print-design?scope=' + encodeURIComponent(branch);
const presets = [
  { id: 'website', name: 'Heritage evening', color: '#0B253A' },
  { id: 'website-minimal', name: 'Clean & minimal', color: '#245B45' },
  { id: 'website-cafe', name: 'Warm café', color: '#8B4D2D' }
] as const;
/** One published branch website, with artwork separate from the table-ordering cards. */
export function QrRestaurantPageQr({ onNavigate }: { onNavigate: (tab: QrTab, branch: string) => void }) {
  const workspaceScope = useQrScope();
  const [scanCheck, setScanCheck] = useState(() => {try{const requested=sessionStorage.getItem('qr_website_open_scan_check') === '1';sessionStorage.removeItem('qr_website_open_scan_check');return requested;}catch{return false;}});
  const [outputReady, setOutputReady] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]),
    [branch, setBranch] = useState('');
  const [saved, setSaved] = useState<DesignState | null>(null),
    [design, setDesign] = useState<QrPrintDesign | null>(null);
  const [card, setCard] = useState<QrPrintData | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [availability, setAvailability] = useState(''),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const { confirm, confirmDialog } = useConfirm();
  const dirty = !!saved && !!design && JSON.stringify(saved.design) !== JSON.stringify(design);
  useQrUnsavedChanges(dirty);
  useEffect(() => {
    let active = true;
    void cloudQrAccount()
      .then(async (account) => {
        const scope = account.role === 'OWNER' ? workspaceScope.managed && workspaceScope.branchId ? workspaceScope.branchId : 'restaurant' : account.branchId;
        if (!scope) throw Error('Choose an assigned branch to manage its restaurant page QR.');
        const data = await request<{ branches: Branch[] }>('/api/v1/tenant/qr-page?scope=' + encodeURIComponent(scope));
        if (active) {
          setBranches(data.branches);
          const requested = new URLSearchParams(location.search).get('setupBranch');
          setBranch(workspaceScope.managed && workspaceScope.branchId ? workspaceScope.branchId : data.branches.find((row) => row.id === requested)?.id || data.branches[0]?.id || '');
          if (!data.branches.length) setError('Add an active branch before preparing a restaurant page QR.');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!branch) return;
    let active = true;
    setSaved(null);
    setDesign(null);
    setCard(null);
    setError('');
    setAvailability('');
    setNotice('');
    setOutputReady(false);
    void request<DesignState>(endpoint(branch))
      .then((data) => {
        if (active) {
          setSaved(data);
          setDesign(data.design);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    void QrAdminApi.websitePrintData(branch)
      .then(withLogo)
      .then((data) => {
        if (active) setCard(data);
      })
      .catch((e) => {
        if (active) setAvailability(e.message);
      });
    return () => {
      active = false;
    };
  }, [branch, retry]);
  async function changeBranch(next: string) {
    if (
      dirty &&
      !(await confirm({
        title: 'Discard QR design changes?',
        message: 'Your restaurant page QR design has not been saved.',
        confirmLabel: 'Discard & switch branch',
        cancelLabel: 'Keep editing',
        tone: 'danger'
      }))
    )
      return;
    setBranch(next);
  }
  async function save() {
    if (!design || !saved) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request<DesignState>(endpoint(branch), { method: 'PUT', body: { version: saved.version, design } });
      setSaved(result);
      setDesign(result.design);
      setNotice('Restaurant page QR design saved for this branch. Table QR designs are unchanged.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function output(format: 'PRINT' | 'PNG' | 'SVG') {
    if (!card || dirty || !saved) return;
    const printWindow = format === 'PRINT' ? window.open('', '_blank', 'width=720,height=900') : null;
    if (format === 'PRINT' && !printWindow) {
      setError('Allow pop-ups to print the restaurant page QR.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const fresh = await QrAdminApi.websitePrintData(branch).then(withLogo);
      if (JSON.stringify(fresh.design) !== JSON.stringify(saved.design)) throw Error('The saved QR design changed. Reload and review it before printing.');
      const file = `${fresh.restaurantName}-${fresh.branchName || 'branch'}-restaurant-page-qr`;
      if (format === 'PRINT') printCards([fresh], undefined, printWindow!);
      else if (format === 'PNG') await downloadCardPng(fresh, file);
      else downloadDesignSvg(fresh, file);
      setCard(fresh);
      setOutputReady(true);setScanCheck(true);
      setNotice(
        format === 'PRINT' ? 'Print preview opened. Choose your printer or Save as PDF.' : 'Restaurant page QR downloaded. Test scan it before displaying it.'
      );
    } catch (e) {
      printWindow?.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="qr-website-qr" aria-label="Restaurant page QR workspace">
      <QrWebsiteJourney current={scanCheck ? 'test' : 'qr'} live={!!card} onStep={step => {if(step === 'test'){setScanCheck(true);requestAnimationFrame(()=>document.getElementById('qr-website-scan-check')?.scrollIntoView({behavior:'smooth',block:'center'}));}else if(step === 'qr')setScanCheck(false);else {const url=new URL(location.href);url.searchParams.set('websiteStep',step);history.replaceState(null,'',url);onNavigate('RESTAURANT_PAGE',branch);}}} />
      {scanCheck && card?.url && <section className="qr-scan-check" id="qr-website-scan-check" aria-label="Website QR test scan"><strong>{outputReady ? 'Your QR output is ready. Test it on your phone.' : 'Test your restaurant website QR'}</strong><ol><li>Open your phone camera and scan the QR in the preview or printed poster.</li><li>Check that your restaurant, review link and Instagram are correct.</li><li>Tap Order online and confirm it opens the right branch menu.</li></ol><a href={card.url} target="_blank" rel="noopener noreferrer">Open live website ↗</a><small>This opens the website for inspection. A successful phone scan is not automatically certified.</small></section>}
      <div className="qr-website-purpose">
        <strong>Restaurant Page QR → your restaurant website</strong>
        <p>
          Use it on your entrance, visiting cards or social posters. Guests see your story, menu, photos, contact details and review link. It does not select a
          table.
        </p>
        <button className="qr-btn secondary" onClick={() => onNavigate('TABLES', branch)}>
          Need table ordering QRs?
        </button>
      </div>
      {workspaceScope.managed && workspaceScope.branchId ? <QrEditingScope /> : <label className="qr-website-branch">
        Branch to print
        <select aria-label="Branch to print" disabled={busy || !branches.length} value={branch} onChange={(e) => void changeBranch(e.target.value)}>
          {branches.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>}
      {error && (
        <p role="alert" className="qr-website-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="qr-website-notice">
          {notice}
        </p>
      )}
      {availability && (
        <div role="status" className="qr-website-purpose">
          <strong>Get this branch page ready to print</strong>
          <p>{availability}</p>
          <button className="qr-btn" onClick={() => onNavigate('RESTAURANT_PAGE', branch)}>
            Set up / publish restaurant page
          </button>
        </div>
      )}
      {!branch && !error && <p role="status">Loading your branches…</p>}
      {branch && !design && !error && <p role="status">Loading the saved QR design…</p>}
      {design && (
        <div className="qr-website-grid">
          <div className="qr-website-editor">
            <h2>Design your restaurant page QR</h2>
            <p>Artwork and wording apply to this branch’s website QR only.</p>
            <fieldset disabled={busy}>
              <legend>Poster style</legend>
              <div className="qr-website-presets">
                {presets.map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    aria-pressed={design.template === preset.id}
                    onClick={() => setDesign({ ...design, template: preset.id, accent: preset.color })}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        background: preset.id === 'website-minimal' ? '#f2f6f1' : preset.id === 'website-cafe' ? '#fff0dc' : preset.color,
                        color: preset.id === 'website' ? 'white' : '#163c31'
                      }}
                    >
                      ▦
                    </span>
                    {preset.name}
                  </button>
                ))}
              </div>
              <label>
                Accent colour
                <input type="color" value={design.accent} onChange={(e) => setDesign({ ...design, accent: e.target.value })} />
              </label>
              <label>
                Message below the QR
                <input maxLength={48} value={design.instruction} onChange={(e) => setDesign({ ...design, instruction: e.target.value })} />
              </label>
              <label>
                Footer message
                <input maxLength={100} value={design.footer} onChange={(e) => setDesign({ ...design, footer: e.target.value })} />
              </label>
              <label>
                Print format
                <select value={design.layout} onChange={(e) => setDesign({ ...design, layout: e.target.value as QrPrintDesign['layout'] })}>
                  <option value="CARD">Poster / card</option>
                  <option value="TENT">Foldable counter tent</option>
                  <option value="LABEL">Small label</option>
                </select>
              </label>
              <label className="qr-website-check">
                <input type="checkbox" checked={design.showLogo} onChange={(e) => setDesign({ ...design, showLogo: e.target.checked })} /> Include restaurant
                logo
              </label>
              <button className="qr-btn" disabled={!dirty || !design.instruction.trim()} onClick={() => void save()}>
                Save QR design
              </button>
            </fieldset>
            <button
              className="qr-btn secondary"
              disabled={busy}
              onClick={async () => {
                if (
                  dirty &&
                  !(await confirm({
                    title: 'Reload saved design?',
                    message: 'This discards your unsaved design changes.',
                    confirmLabel: 'Discard & reload',
                    cancelLabel: 'Keep editing',
                    tone: 'danger'
                  }))
                )
                  return;
                setRetry((v) => v + 1);
              }}
            >
              Reload saved design
            </button>
          </div>
          <div className="qr-website-preview">
            <h2>Print preview</h2>
            {card ? (
              <>
                <img
                  alt="Restaurant Page QR poster preview"
                  src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(designSvg({ ...card, design }, design))}
                />
                <p className="qr-website-url">
                  <strong>Scan destination</strong>
                  <a href={card.url || undefined} target="_blank" rel="noopener noreferrer">
                    {card.url}
                  </a>
                </p>
              </>
            ) : (
              <p>A real preview appears after this branch’s restaurant page is published and enabled.</p>
            )}
            {dirty && <p role="status">Save your design before printing or downloading.</p>}
            <div className="qr-website-actions">
              <button className="qr-btn" disabled={busy || dirty || !card} onClick={() => void output('PRINT')}>
                Print / Save PDF
              </button>
              <button className="qr-btn secondary" disabled={busy || dirty || !card} onClick={() => void output('PNG')}>
                Download PNG
              </button>
              <button className="qr-btn secondary" disabled={busy || dirty || !card} onClick={() => void output('SVG')}>
                Download SVG
              </button>
            </div>
            <p>Test scan the finished print. It should open the restaurant page; table cards should open the ordering menu.</p>
          </div>
        </div>
      )}
      {confirmDialog}
    </section>
  );
}
