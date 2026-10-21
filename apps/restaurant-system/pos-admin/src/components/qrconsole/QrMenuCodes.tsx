import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, Download, ExternalLink, Plus, Printer, QrCode } from 'lucide-react';
import { Modal, useConfirm } from '@jamanvaar/ui';
import { copyText, generateQrDataUrl } from '@jamanvaar/utils';
import { QrAdminApi, type QrCodeView, type QrMenuCodePage, type QrMenuCodeRow } from '../../cloud/qrAdminClient';
import { downloadCardPng, printCards, withLogo } from './qrPrint';
import './qr-menu-codes.css';

const message = (error: unknown) => (error instanceof Error ? error.message : 'Could not complete this action. Please try again.');

/** Saved generic menu codes have no dining-table relation, so they need their own list. */
export function QrMenuCodes({
  branchId,
  branchName,
  creating,
  onCloseCreate,
  onCreate,
  showToast
}: {
  branchId: string;
  branchName: string;
  creating: boolean;
  onCloseCreate: () => void;
  onCreate: () => void;
  showToast: (text: string) => void;
}) {
  const [page, setPage] = useState<QrMenuCodePage | null>(null),
    [error, setError] = useState(''),
    [actionError, setActionError] = useState(''),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(''),
    [label, setLabel] = useState('Menu card'),
    [viewing, setViewing] = useState<QrCodeView | null>(null),
    [copied, setCopied] = useState(false);
  const alive = useRef(false),
    request = useRef(0),
    working = useRef(false),
    copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const { confirm, confirmDialog } = useConfirm();
  const load = useCallback(
    async (cursor?: string) => {
      const serial = ++request.current;
      setLoading(true);
      setError('');
      try {
        const result = await QrAdminApi.menuCodes(branchId, cursor);
        if (!alive.current || serial !== request.current) return;
        setPage((previous) =>
          cursor && previous ? { ...result, rows: [...previous.rows, ...result.rows.filter((row) => !previous.rows.some((old) => old.id === row.id))] } : result
        );
      } catch (e) {
        if (alive.current && serial === request.current) setError(message(e));
      } finally {
        if (alive.current && serial === request.current) setLoading(false);
      }
    },
    [branchId]
  );
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      request.current++;
      clearTimeout(copyTimer.current);
    };
  }, [load]);
  const act = async (key: string, fn: () => Promise<void>) => {
    if (working.current || !alive.current) return;
    working.current = true;
    setBusy(key);
    setActionError('');
    try {
      await fn();
    } catch (e) {
      if (alive.current) setActionError(message(e));
    } finally {
      working.current = false;
      if (alive.current) setBusy('');
    }
  };
  const open = (code: QrCodeView) => {
    setCopied(false);
    clearTimeout(copyTimer.current);
    setActionError('');
    setViewing(code);
  };
  const enableMode = () =>
    act('mode', async () => {
      await QrAdminApi.saveSettings({ menuOnlyEnabled: true }, branchId);
      if (!alive.current) return;
      setPage((previous) => (previous ? { ...previous, menuOnlyEnabled: true } : previous));
      showToast('Menu QR codes enabled for this branch.');
      await load();
    });
  const create = () =>
    act('create', async () => {
      const code = await QrAdminApi.menuCode(branchId, label.trim());
      if (!alive.current) return;
      onCloseCreate();
      setLabel('Menu card');
      if (code.url) {
        open(code);
        showToast('Menu QR code saved.');
      } else
        setActionError('Code saved, but its public menu address is not configured. Ask your platform administrator to configure it, then refresh this list.');
      await load();
    });
  const change = async (row: QrMenuCodeRow, action: 'disable' | 'enable' | 'regenerate' | 'revoke') => {
    if (
      action !== 'enable' &&
      !(await confirm({
        title: action === 'regenerate' ? 'Replace this menu QR code?' : action === 'revoke' ? 'Permanently revoke this code?' : 'Turn off this menu QR code?',
        message:
          action === 'regenerate'
            ? 'The old printed QR stops working. Download and print the replacement before using it.'
            : action === 'revoke'
              ? 'This printed QR will stop working and cannot be enabled again.'
              : 'Existing prints will stop opening the menu until you turn this code back on.',
        confirmLabel: action === 'regenerate' ? 'Replace code' : action === 'revoke' ? 'Revoke code' : 'Turn off',
        tone: action === 'revoke' ? 'danger' : 'default'
      }))
    )
      return;
    await act(row.id, async () => {
      const replacement = action === 'regenerate' ? await QrAdminApi.regenerate(row.id) : null;
      if (action !== 'regenerate') await QrAdminApi[action](row.id);
      if (!alive.current) return;
      if (replacement) open(replacement);
      showToast(
        action === 'regenerate'
          ? 'Replacement saved. Reprint this code.'
          : action === 'enable'
            ? 'Code turned on.'
            : action === 'disable'
              ? 'Code turned off.'
              : 'Code revoked.'
      );
      await load();
    });
  };
  const copy = () =>
    act('copy', async () => {
      if (!viewing?.url) return;
      const success = await copyText(viewing.url);
      if (!alive.current) return;
      if (!success) throw Error('Copy was blocked by your browser. Select and copy the link below.');
      setCopied(true);
      showToast('Menu link copied.');
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => {
        if (alive.current) setCopied(false);
      }, 2500);
    });
  const download = () =>
    act('download', async () => {
      if (!viewing) return;
      const data = await QrAdminApi.printData(viewing.id);
      if (!alive.current) return;
      await downloadCardPng(data, `menu-qr-${viewing.displayNumber || viewing.id}`);
      if (alive.current) showToast('Menu QR PNG downloaded.');
    });
  const print = () => {
    if (working.current || !viewing) return;
    // Open during the click, before fetching artwork, so browser popup rules allow printing.
    const printWindow = window.open('', '_blank', 'width=720,height=900');
    if (!printWindow) {
      setActionError('Allow pop-ups to print this QR code.');
      return;
    }
    printWindow.document.title = 'Preparing menu QR';
    void act('print', async () => {
      try {
        const data = await QrAdminApi.printData(viewing.id).then(withLogo);
        if (!alive.current) {
          printWindow.close();
          return;
        }
        printCards([data], undefined, printWindow);
      } catch (e) {
        printWindow.close();
        throw e;
      }
    });
  };
  const modeWarning =
    page && !page.menuOnlyEnabled ? (
      <div className="qr-menu-codes-notice">
        <strong>Menu QR codes are switched off for {branchName}.</strong>
        <p>Saved codes remain here, but scans will not open the menu. Enable this mode before sharing or printing.</p>
        <button type="button" disabled={!!busy} onClick={() => void enableMode()}>
          {busy === 'mode' ? 'Enabling…' : 'Enable menu QR codes for this branch'}
        </button>
      </div>
    ) : null;
  const publicUrlWarning =
    page?.publicBaseUrlConfigured === false ? (
      <p role="alert" className="qr-menu-codes-error">
        The public ordering address is not configured. Your platform administrator must configure it before you can generate a usable QR link.
      </p>
    ) : null;
  return (
    <section className="qr-menu-codes" aria-label="Menu QR codes without a fixed table" aria-busy={loading}>
      <header>
        <div>
          <h3>
            <QrCode size={20} aria-hidden="true" /> Menu QR codes <span>No fixed table</span>
          </h3>
          <p>For {branchName}. Guests open the menu, then choose takeaway or enter their table for dine-in, according to your ordering rules.</p>
          <p>For a restaurant website with photos and contact details, use Restaurant Page QR.</p>
        </div>
        <button type="button" disabled={loading || !!busy} onClick={() => void load()}>
          Refresh menu codes
        </button>
      </header>
      {modeWarning}
      {publicUrlWarning}
      {error && (
        <div role="alert" className="qr-menu-codes-error">
          Could not refresh menu codes: {error} {page ? 'Previously loaded codes are still shown.' : 'Use Refresh menu codes to try again.'}
        </div>
      )}
      {actionError && !creating && !viewing && (
        <p role="alert" className="qr-menu-codes-error">
          {actionError}
        </p>
      )}
      {!page && loading && <p role="status">Loading saved menu QR codes…</p>}
      {page && (
        <>
          {page.rows.length === 0 ? (
            <div className="qr-menu-codes-empty">
              <p>No menu QR codes yet. Create one to see its QR preview and sharing options.</p>
              <button type="button" onClick={onCreate} disabled={!!busy}>
                <Plus size={16} /> Create menu QR
              </button>
            </div>
          ) : (
            <>
              <p className="qr-menu-codes-count">
                {page.rows.length} of {page.total} saved codes · Previously generated menu codes appear here too.
              </p>
              <ul>
                {page.rows.map((row) => (
                  <li key={row.id}>
                    <div className="qr-menu-codes-summary">
                      <strong>{row.displayNumber || 'Menu card'}</strong>
                      <span className={`qr-menu-codes-status qr-menu-codes-status--${row.status === 'ACTIVE' && !page.menuOnlyEnabled ? 'mode-off' : row.status.toLowerCase()}`}>
                        {row.status === 'ACTIVE'
                          ? page.menuOnlyEnabled
                            ? 'Active'
                            : 'Mode switched off'
                          : row.status === 'DISABLED'
                            ? 'Turned off'
                            : 'Revoked'}
                      </span>
                      <small>
                        Version {row.version} · {new Date(row.createdAt).toLocaleString()}
                      </small>
                    </div>
                    <div className="qr-menu-codes-actions">
                      {row.status === 'ACTIVE' && row.url && (
                        <button type="button" disabled={!!busy} onClick={() => open(row)}>
                          View QR
                        </button>
                      )}
                      {row.status !== 'REVOKED' && (
                        <>
                          <button type="button" disabled={!!busy || loading} onClick={() => void change(row, row.status === 'ACTIVE' ? 'disable' : 'enable')}>
                            {row.status === 'ACTIVE' ? 'Turn off' : 'Turn on'}
                          </button>
                          <button type="button" disabled={!!busy || loading} onClick={() => void change(row, 'regenerate')}>
                            Replace code
                          </button>
                          <button type="button" className="qr-menu-codes-danger" disabled={!!busy || loading} onClick={() => void change(row, 'revoke')}>
                            Revoke
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {page.nextCursor && (
            <button type="button" disabled={loading || !!busy} onClick={() => void load(page.nextCursor!)}>
              {loading ? 'Loading…' : 'Load more menu codes'}
            </button>
          )}
        </>
      )}
      <Modal
        isOpen={creating}
        title="Create menu QR"
        maxWidth="md"
        onClose={() => {
          if (!working.current) {
            setActionError('');
            onCloseCreate();
          }
        }}
      >
        <form
          className="qr-menu-codes-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim() && !busy && !loading && page && page.publicBaseUrlConfigured !== false) void create();
          }}
        >
          <p>
            This QR opens the ordering menu for <strong>{branchName}</strong> without choosing a table automatically.
          </p>
          <label>
            Code name
            <input autoFocus maxLength={60} required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Counter menu card" />
          </label>
          {!page && (
            <p role={error ? 'alert' : 'status'}>
              {error ? `Could not check branch settings: ${error}. Close this dialog and refresh menu codes to try again.` : 'Checking branch settings…'}
            </p>
          )}
          {modeWarning}
          {publicUrlWarning}
          {actionError && (
            <p role="alert" className="qr-menu-codes-error">
              {actionError}
            </p>
          )}
          <button
            className="qr-menu-codes-primary"
            disabled={!label.trim() || !!busy || loading || !page || page.publicBaseUrlConfigured === false}
            type="submit"
          >
            {busy === 'create' ? 'Creating…' : 'Create & view QR'}
          </button>
        </form>
      </Modal>
      <Modal
        isOpen={!!viewing}
        title="Menu QR preview"
        maxWidth="md"
        onClose={() => {
          if (!working.current) {
            setViewing(null);
            setActionError('');
          }
        }}
      >
        {viewing?.url && (
          <div className="qr-menu-codes-preview">
            <h3>{viewing.displayNumber || 'Menu card'}</h3>
            <p>{branchName} · No fixed table</p>
            {modeWarning}
            <img
              src={generateQrDataUrl(viewing.url, { size: 260, margin: 4, color: '#000000' })}
              width={260}
              height={260}
              alt={`Menu QR code for ${viewing.displayNumber || 'Menu card'}`}
            />
            <label>
              Menu link
              <input readOnly value={viewing.url} onFocus={(e) => e.currentTarget.select()} />
            </label>
            {actionError && (
              <p role="alert" className="qr-menu-codes-error">
                {actionError}
              </p>
            )}
            <div className="qr-menu-codes-actions">
              <button type="button" disabled={!!busy} onClick={() => void copy()}>
                {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button type="button" disabled={!!busy || !page?.menuOnlyEnabled || loading} onClick={() => void download()}>
                <Download size={16} />
                {busy === 'download' ? 'Downloading…' : 'Download PNG'}
              </button>
              <button type="button" disabled={!!busy || !page?.menuOnlyEnabled || loading} onClick={print}>
                <Printer size={16} />
                Print / Save PDF
              </button>
              {page?.menuOnlyEnabled && (
                <a href={viewing.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} />
                  Open menu
                </a>
              )}
            </div>
            <p>Test a scan before displaying the print. Table-specific QR cards remain separate.</p>
            <span role="status" className="sr-only">
              {copied ? 'Menu link copied to clipboard.' : ''}
            </span>
          </div>
        )}
      </Modal>
      {confirmDialog}
    </section>
  );
}
