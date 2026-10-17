import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, KeyRound, Monitor, RefreshCw } from 'lucide-react';
import {
  createSupportTicket,
  fetchSupportTickets,
  fetchSupportTicket,
  fetchKioskSetup,
  type SupportTicketRow,
  type SupportTicketDetail
} from '../../cloud/cloudClient';
import { TicketView } from '../support/SupportTicketsModule';
import { kioskSetupLink, KIOSK_KEY_REQUEST_SUBJECT } from './kioskSetup';

const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-jaman-border px-4 py-2.5 text-sm font-bold disabled:opacity-50';
const card = 'rounded-2xl border border-jaman-border bg-white p-5 space-y-3';
const ticketNumber = (n: number) => 'TKT-' + String(n).padStart(6, '0');
export function KioskSetupPanel({
  branchId,
  branchName,
  terminalCount,
  fleetLoading,
  fleetError,
  onRefresh,
  onNavigate,
  showToast
}: {
  branchId: string;
  branchName: string;
  terminalCount: number;
  fleetLoading: boolean;
  fleetError: string;
  onRefresh: () => Promise<void>;
  onNavigate: (page: 'KIOSK_WELCOME' | 'DOWNLOADS' | 'MENU') => void;
  showToast: (message: string) => void;
}) {
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof fetchKioskSetup>> | null>(null),
    [metaError, setMetaError] = useState(''),
    [requests, setRequests] = useState<SupportTicketRow[]>([]),
    [historyError, setHistoryError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const [requesting, setRequesting] = useState(false),
    [haveKey, setHaveKey] = useState(false),
    [name, setName] = useState(''),
    [notes, setNotes] = useState(''),
    [sending, setSending] = useState(false),
    [error, setError] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [additionalRequest, setAdditionalRequest] = useState(false);
  const requestForm = useRef<HTMLFormElement>(null),
    keyGuide = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (requesting) {
      requestForm.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      requestForm.current?.querySelector('input')?.focus({ preventScroll: true });
    } else if (haveKey) {
      keyGuide.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      keyGuide.current?.focus({ preventScroll: true });
    }
  }, [requesting, haveKey]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setHistoryError('');
    setMetaError('');
    void Promise.allSettled([
      fetchKioskSetup()
        .then((data) => {
          if (live) setMeta(data);
        })
        .catch(() => {
          if (live) setMetaError('Could not load your Restaurant ID. Retry before opening the kiosk link.');
        }),
      fetchSupportTickets()
        .then((rows) => {
          if (live) setRequests(rows.filter((row) => row.branchId === branchId && row.category === 'ONBOARDING' && row.subject === KIOSK_KEY_REQUEST_SUBJECT));
        })
        .catch(() => {
          if (live) setHistoryError('Could not check previous key requests. Retry to avoid sending a duplicate.');
        })
    ]).then(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [branchId, revision]);
  const pending = requests.find((row) => row.status === 'OPEN' || row.status === 'IN_PROGRESS'),
    latest = requests[0];
  const devBase = import.meta.env.DEV ? `${location.protocol}//${location.hostname}:5174/kiosk/` : undefined;
  const launch = kioskSetupLink(import.meta.env.VITE_KIOSK_WEB_URL || devBase || meta?.kioskWebUrl, meta?.restaurantCode || null, branchId);
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(label + ' copied.');
    } catch {
      setError('Copy is unavailable in this browser. Select and copy the displayed text.');
    }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (sending || (pending && !additionalRequest) || historyError || loading) return;
    setSending(true);
    setError('');
    try {
      const created = await createSupportTicket({
        activationRequest:{type:'KIOSK',terminalName:name.trim() || 'New customer kiosk'},
        subject: KIOSK_KEY_REQUEST_SUBJECT,
        category: 'ONBOARDING',
        priority: 'MEDIUM',
        branchId,
        description: `Please issue one KIOSK terminal activation key for ${branchName}.\nRestaurant ID: ${meta?.restaurantCode || 'See attached restaurant account'}\nBranch ID: ${branchId}\nTerminal name: ${name.trim() || 'New customer kiosk'}\n${pending && additionalRequest ? 'This is an additional kiosk, separate from open request ' + ticketNumber(pending.number) + '.' : ''}\n${notes.trim()}\nThe owner already has kiosk management access. This request is for a customer-facing KIOSK terminal, not an admin-console key.`
      });
      setRequests((rows) => [created, ...rows]);
      setRequesting(false);
      setConfirmation(`${ticketNumber(created.number)} sent. Your request is awaiting the JAMANVAAR team; no key has been issued yet.`);
      showToast('Kiosk activation request sent.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your request. Please retry.');
      setRevision((n) => n + 1);
    } finally {
      setSending(false);
    }
  }
  async function openTicket(id: string) {
    setError('');
    try {
      setTicket(await fetchSupportTicket(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the request.');
    }
  }
  if (ticket)
    return (
      <TicketView
        ticket={ticket}
        backLabel="Back to kiosk setup"
        onBack={() => {
          setTicket(null);
          setRevision((n) => n + 1);
        }}
        onChanged={async () => setTicket(await fetchSupportTicket(ticket.id))}
        showToast={showToast}
      />
    );
  return (
    <section aria-label="Kiosk setup" className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 flex flex-wrap gap-4 justify-between items-center">
        <div className="min-w-0">
          <p className="font-bold text-emerald-900 flex gap-2 items-center">
            <CheckCircle2 size={19} />
            Kiosk management is ready
          </p>
          <p className="text-sm text-emerald-900 mt-1">
            You can manage kiosks here with your existing admin login. No extra Kiosk Admin activation key is needed.
          </p>
        </div>
        <button type="button" className={button + ' bg-white'} onClick={() => onNavigate('KIOSK_WELCOME')}>
          Manage welcome screens
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </p>
      )}
      {confirmation && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {confirmation}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={card}>
          <h2 className="font-bold text-lg text-jaman-navy">1. Get a kiosk key</h2>
          <p className="text-sm text-slate-600">
            A key connects one customer-facing kiosk to <strong>{branchName}</strong>. Your plan and device limits still apply.
          </p>
          <p className="text-xs text-slate-500">
            Unlike other JAMANVAAR apps, a kiosk key isn't issued instantly — a JAMANVAAR team member reviews each request
            and issues the key by hand. You'll see it update to "Being worked on" here, and we'll notify you once it's ready.
          </p>
          {loading ? (
            <p role="status" className="text-sm">
              Checking requests...
            </p>
          ) : historyError ? (
            <div role="alert">
              <p className="text-sm text-rose-700">{historyError}</p>
              <button type="button" className={button} onClick={() => setRevision((n) => n + 1)}>
                Retry setup information
              </button>
            </div>
          ) : pending ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm">
              <strong>
                {ticketNumber(pending.number)} · {pending.status === 'OPEN' ? 'Awaiting support' : 'Being worked on'}
              </strong>
              <p className="mt-1">A request is already open for this branch. Follow it below instead of sending another.</p>
              <button type="button" className={button + ' mt-2 bg-white'} onClick={() => void openTicket(pending.id)}>
                View request and replies
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={button + ' bg-brand text-white'}
              onClick={() => {
                setRequesting(true);
                setHaveKey(false);
                setError('');
              }}
            >
              <KeyRound size={17} />
              Request activation key
            </button>
          )}
          {!pending && latest && (
            <button type="button" className={button} onClick={() => void openTicket(latest.id)}>
              View last request and replies
            </button>
          )}
          {pending && (
            <button
              type="button"
              className={button + ' w-full'}
              onClick={() => {
                setAdditionalRequest(false);
                setName('');
                setNotes('');
                setRequesting(true);
                setHaveKey(false);
                setError('');
              }}
            >
              Request another kiosk key
            </button>
          )}
          {requests.length > 1 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-bold">Other kiosk requests ({requests.length - 1})</summary>
              <div className="mt-2 space-y-2">
                {requests
                  .filter((row) => row.id !== (pending || latest)?.id)
                  .map((row) => (
                    <button type="button" key={row.id} className={button + ' w-full'} onClick={() => void openTicket(row.id)}>
                      {ticketNumber(row.number)} · {row.status.replace('_', ' ')}
                    </button>
                  ))}
              </div>
            </details>
          )}
          <button
            type="button"
            className={button + ' w-full'}
            onClick={() => {
              setHaveKey(true);
              setRequesting(false);
            }}
          >
            I already have a key
          </button>
        </div>
        <div className={card}>
          <h2 className="font-bold text-lg text-jaman-navy">2. Enter it on the kiosk</h2>
          <p className="text-sm text-slate-600">
            On the touchscreen device, open the <strong>JAMANVAAR Customer Kiosk</strong> app. On <strong>Activate Your Kiosk</strong>, enter your Restaurant ID
            and the <strong>KIOSK activation key</strong>, then tap Activate Kiosk.
          </p>
          {meta?.restaurantCode && (
            <div className="rounded-xl bg-jaman-ivory border border-jaman-border p-3">
              <p className="text-xs text-slate-600">Restaurant ID</p>
              <code className="text-base font-bold break-all">{meta.restaurantCode}</code>
              <button
                type="button"
                aria-label="Copy Restaurant ID"
                className={button + ' mt-2 w-full bg-white'}
                onClick={() => void copy(meta.restaurantCode!, 'Restaurant ID')}
              >
                <Copy size={15} />
                Copy ID
              </button>
            </div>
          )}
          {metaError && (
            <div role="alert" className="text-sm text-rose-700">
              {metaError}
              <button type="button" className={button} onClick={() => setRevision((n) => n + 1)}>
                Retry setup information
              </button>
            </div>
          )}
          {launch && (
            <>
              <a className={button + ' bg-jaman-navy text-white w-full'} href={launch} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} />
                Open customer kiosk
              </a>
              <button type="button" className={button + ' w-full'} onClick={() => void copy(launch, 'Kiosk setup link')}>
                Copy link for the kiosk device
              </button>
              <p className="text-xs text-slate-500">Open customer kiosk uses this device. If your touchscreen is a different device, copy the link and open it there before entering the key.</p>
            </>
          )}
          <button type="button" className={button + ' w-full'} onClick={() => onNavigate('DOWNLOADS')}>
            Install the kiosk app
          </button>
        </div>
        <div className={card}>
          <h2 className="font-bold text-lg text-jaman-navy">3. Check the connection</h2>
          <p className="text-sm text-slate-600">After activation, the terminal appears below. You can keep this admin page open on your laptop.</p>
          <p className="text-sm font-bold">
            {fleetLoading
              ? 'Checking terminals...'
              : fleetError
                ? 'Connection check unavailable'
                : `${terminalCount} connected terminal record${terminalCount === 1 ? '' : 's'} in this branch`}
          </p>
          <button type="button" disabled={fleetLoading} className={button + ' w-full'} onClick={() => void onRefresh()}>
            <RefreshCw size={16} />
            Check for connected kiosks
          </button>
          <button type="button" className={button + ' w-full'} onClick={() => onNavigate('MENU')}>
            Manage kiosk menu
          </button>
          <p className="text-xs text-slate-500">
            The list refreshes automatically and when you return to this window. Check terminal health below before opening service.
          </p>
        </div>
      </div>
      {requesting && (
        <form ref={requestForm} aria-label="Request kiosk activation key" onSubmit={send} className={card + ' max-w-2xl'}>
          <h2 className="font-bold text-lg">Request one kiosk key</h2>
          {pending && (
            <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={additionalRequest} onChange={(e) => setAdditionalRequest(e.target.checked)} />
              This is for an additional kiosk, separate from my open request.
            </label>
          )}
          <p className="text-sm text-slate-600">
            Restaurant and branch details are attached automatically. The JAMANVAAR team issues the key after checking your plan.
          </p>
          <label className="block text-sm font-bold">
            Terminal name
            <input
              className="mt-1 w-full rounded-xl border p-3 font-normal"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example, Entrance kiosk"
            />
          </label>
          <label className="block text-sm font-bold">
            Notes (optional)
            <textarea
              className="mt-1 w-full rounded-xl border p-3 font-normal"
              maxLength={1000}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={sending || loading || !!historyError || (!!pending && !additionalRequest)}
              className={button + ' bg-brand text-white'}
            >
              {sending ? 'Sending request...' : 'Send key request'}
            </button>
            <button type="button" disabled={sending} className={button} onClick={() => setRequesting(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {haveKey && (
        <div ref={keyGuide} tabIndex={-1} role="status" className="rounded-2xl border border-sky-200 bg-sky-50 p-5 space-y-2">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Monitor size={20} />
            Where do I enter my key?
          </h2>
          <p className="text-sm">
            Enter it on the <strong>Customer Kiosk → Activate Your Kiosk</strong> screen, in the <strong>Activation Key</strong> field. Use the Restaurant ID
            shown above. You do not enter a KIOSK key in Restaurant Admin or Help & Support.
          </p>
          <p className="text-sm">
            Use Open customer kiosk above, or launch the installed kiosk app on your touchscreen. Keys issued for POS, Captain, KDS or an admin console cannot
            activate a customer kiosk.
          </p>
        </div>
      )}
    </section>
  );
}
