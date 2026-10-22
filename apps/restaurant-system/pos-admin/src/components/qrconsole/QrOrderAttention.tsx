import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { BellRing, Volume2, RefreshCw } from 'lucide-react';
import { Modal, QrServiceInbox } from '@jamanvaar/ui';
import { qrApi } from '../../cloud/cloudClient';
import './qr-order-attention.css';

export interface AttentionItem {
  id: string;
  kind: 'SERVICE' | 'NEW_ORDER' | 'DELAYED_ORDER' | 'PAYMENT_DUE' | 'PAYMENT_PENDING';
  priority: 'URGENT' | 'ACTION';
  title: string;
  detail: string;
  at: string;
  branchId: string | null;
  branchName?: string;
  requestId?: string;
  version?: number;
  status?: string;
  quietNow?: boolean;
  orderId?: string;
  orderNumber?: string;
}
interface AttentionFeed {
  scope: string | null;
  checkedAt: string;
  serviceAvailable: boolean;
  total: number;
  urgent: number;
  servicePending: number;
  items: AttentionItem[];
}
const base = '/api/v1/restaurant/qr/operations',
  soundKey = 'qr_admin_attention_sound';
export function QrOrderAttention({ branchId, onOpenOrder, compact = false, includeNewOrderSound = false }: { branchId: string; onOpenOrder: (id: string) => Promise<void>; compact?: boolean; includeNewOrderSound?: boolean }) {
  const [feed, setFeed] = useState<AttentionFeed | null>(null),
    [error, setError] = useState(''),
    [actionError, setActionError] = useState(''),
    [busy, setBusy] = useState(''),
    [inbox, setInbox] = useState(false),
    [expanded, setExpanded] = useState(false),
    [soundError, setSoundError] = useState(''),
    [stickyTop, setStickyTop] = useState<number | undefined>();
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem(soundKey) === '1';
    } catch {
      return false;
    }
  });
  const audio = useRef<AudioContext | null>(null),
    alive = useRef(false),
    loading = useRef(false),
    queued = useRef(false),
    latest = useRef<AttentionFeed | null>(null),
    seen = useRef<Map<string, string> | null>(null),
    soundOn = useRef(sound),
    lastBeep = useRef(0);
  soundOn.current = sound;
  useEffect(() => {
    const header = document.querySelector('.qr-admin-header');
    if (!header) return;
    const measure = () => setStickyTop(header.getBoundingClientRect().height + 8);
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(header);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const chime = useCallback(async (userGesture = false) => {
    try {
      const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) throw Error('Sound is unavailable in this browser.');
      if (!audio.current || audio.current.state === 'closed') audio.current = new Context();
      const context = audio.current;
      if (context.state === 'suspended') {
        if (!userGesture) throw Error('Click Test sound to allow sound alerts in this browser.');
        await context.resume();
      }
      if (context.state !== 'running') throw Error('Click Test sound to allow sound alerts in this browser.');
      const oscillator = context.createOscillator(),
        gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.09, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.45);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.45);
      lastBeep.current = Date.now();
      if (alive.current) setSoundError('');
    } catch (error) {
      if (alive.current) setSoundError(error instanceof Error ? error.message : 'Could not play the alert.');
    }
  }, []);
  const load = useCallback(async () => {
    if (loading.current) {
      queued.current = true;
      return;
    }
    loading.current = true;
    try {
      const next = await qrApi<AttentionFeed>(base + '/attention' + (branchId ? '?branchId=' + encodeURIComponent(branchId) : ''));
      if (!alive.current) return;
      const audible = next.items.filter((item) => (includeNewOrderSound || item.kind !== 'NEW_ORDER') && !item.quietNow),
        ids = new Map(audible.map((item) => [item.id, item.priority]));
      const incoming = seen.current && audible.some((item) => !seen.current!.has(item.id) || seen.current!.get(item.id) !== item.priority);
      if (soundOn.current && incoming) void chime();
      seen.current = ids;
      latest.current = next;
      setFeed(next);
      setError('');
    } catch (error) {
      latest.current = null;
      if (alive.current) setError(error instanceof Error ? error.message : 'Could not check urgent tasks.');
    } finally {
      loading.current = false;
      if (queued.current && alive.current) {
        queued.current = false;
        void load();
      }
    }
  }, [branchId, chime, includeNewOrderSound]);
  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    const reminder = setInterval(() => {
      if (
        !document.hidden &&
        soundOn.current &&
        Date.now() - lastBeep.current >= 30000 &&
        latest.current?.items.some((item) => item.kind === 'SERVICE' && !item.quietNow && item.status === 'OPEN')
      )
        void chime();
    }, 5000);
    const wake = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      alive.current = false;
      clearInterval(timer);
      clearInterval(reminder);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
      void audio.current?.close().catch(() => undefined);
    };
  }, [load, chime]);
  const serviceApi = useCallback(
    async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
      const result = await qrApi<any>(base + path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (method !== 'GET') void load();
      return (
        path === '/requests' && branchId ? { ...result, requests: result.requests.filter((request: AttentionItem) => request.branchId === branchId) } : result
      ) as T;
    },
    [branchId, load]
  );
  async function acknowledge(item: AttentionItem) {
    if (!item.requestId || busy) return;
    setBusy(item.id);
    setActionError('');
    try {
      await serviceApi(`/requests/${encodeURIComponent(item.requestId)}/action`, 'POST', { status: 'ACKNOWLEDGED', version: item.version });
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not acknowledge the request.');
      void load();
    } finally {
      if (alive.current) setBusy('');
    }
  }
  async function openOrder(item: AttentionItem) {
    if (!item.orderId || busy) return;
    setBusy(item.id);
    setActionError('');
    try {
      await onOpenOrder(item.orderId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not open this order.');
    } finally {
      if (alive.current) setBusy('');
    }
  }
  const collapsed = compact && !expanded && !feed?.urgent;
  const count = feed?.total ?? 0,
    items = feed?.items ?? [],
    shown = collapsed ? [] : expanded ? items : items.slice(0, 3);
  return (
    <>
      <section
        className={`qr-order-attention ${compact ? 'is-compact' : ''} ${feed?.urgent ? 'has-urgent' : count ? 'has-tasks' : ''}`}
        aria-label="Live attention centre"
        style={stickyTop ? ({ '--qr-attention-top': `${stickyTop}px` } as CSSProperties) : undefined}
      >
        <header>
          <div className="qr-attention-heading">
            <BellRing size={22} />
            <div>
              <h2>
                Needs attention <span>{feed ? count : '…'}</span>
              </h2>
              <p>{!feed ? 'Checking live requests and orders…' : `${feed.servicePending} service requests · ${feed.urgent} urgent issues`}</p>
            </div>
          </div>
          {!collapsed && <div className="qr-attention-controls">
            <label>
              <input
                type="checkbox"
                checked={sound}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setSound(enabled);
                  soundOn.current = enabled;
                  try {
                    localStorage.setItem(soundKey, enabled ? '1' : '0');
                  } catch {
                    /* Session preference still applies. */
                  }
                  if (enabled) void chime(true);
                }}
              />
              Sound alerts
            </label>
            <button type="button" onClick={() => void chime(true)} title="Allow and test attention sound">
              <Volume2 size={16} />
              Test sound
            </button>
            <button type="button" onClick={() => void load()} aria-label="Refresh attention">
              <RefreshCw size={16} />
            </button>
          </div>}
          {compact && !feed?.urgent && <button type="button" aria-expanded={!collapsed} onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide alert details' : 'Show alert details'}</button>}
        </header>
        <p className="sr-only" role="status" aria-live="polite">
          {feed ? `${count} tasks need attention. ${feed.servicePending} pending service requests. ${feed.urgent} urgent issues.` : 'Checking attention tasks.'}
        </p>
        {error && (
          <p className="qr-attention-error" role="alert">
            Live check failed: {error}{' '}
            {feed ? 'Showing the last successful check; tasks may have changed.' : 'Requests may be waiting. Open the service inbox or retry.'}
          </p>
        )}
        {actionError && (
          <p className="qr-attention-error" role="alert">
            {actionError}
          </p>
        )}
        {soundError && (
          <p className="qr-attention-error" role="status">
            {soundError} Visual alerts remain active.
          </p>
        )}
        {feed && !count && !error && !collapsed && <p className="qr-attention-clear">No pending attention tasks. Requests and orders are checked every 5 seconds.</p>}
        {!!shown.length && (
          <ul className="qr-attention-list">
            {shown.map((item) => (
              <li key={item.id} className={item.priority === 'URGENT' ? 'is-urgent' : ''}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <small>
                    {item.branchName ? item.branchName + ' · ' : ''}
                    {Math.max(0, Math.floor((Date.now() - Date.parse(item.at)) / 60000))} min ago
                    {item.status ? ` · ${item.status.toLowerCase().replaceAll('_', ' ')}` : ''}{item.priority === 'URGENT' ? ' · Urgent' : ''}
                    {item.quietNow ? ' · Quiet hours' : ''}
                  </small>
                </div>
                <div className="qr-attention-actions">
                  {item.kind === 'SERVICE' ? (
                    <>
                      {item.status === 'OPEN' && (
                        <button type="button" disabled={!!busy || !!error} onClick={() => void acknowledge(item)}>
                          {busy === item.id ? 'Saving…' : 'Acknowledge'}
                        </button>
                      )}
                      <button type="button" onClick={() => setInbox(true)}>
                        Open requests
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={!!busy} onClick={() => void openOrder(item)}>
                      {busy === item.id ? 'Opening…' : 'Open order'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!collapsed && <footer>
          {items.length > 3 && (
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Show fewer' : `View all ${count} tasks`}
            </button>
          )}
          {(feed?.serviceAvailable || !!error) && (
            <button type="button" onClick={() => setInbox(true)}>
              Service inbox{feed?.servicePending ? ` (${feed.servicePending})` : ''}
            </button>
          )}
          <small>{feed ? `Last checked ${new Date(feed.checkedAt).toLocaleTimeString()}` : 'Waiting for live status'}</small>
        </footer>}
      </section>
      <Modal
        isOpen={inbox}
        onClose={() => {
          setInbox(false);
          void load();
        }}
        title="Table service requests"
      >
        <QrServiceInbox api={serviceApi} />
      </Modal>
    </>
  );
}
