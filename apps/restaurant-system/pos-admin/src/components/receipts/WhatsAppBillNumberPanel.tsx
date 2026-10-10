import React, { useEffect, useState } from 'react';
import { MessageCircle, CheckCircle2, AlertTriangle, Clock, RefreshCw, Trash2 } from 'lucide-react';
import {
  isCloudConnected,
  isCloudLoggedIn,
  fetchWhatsAppBillSettings,
  saveWhatsAppBillNumber,
  recheckWhatsAppBillNumber,
  createWhatsAppBillTemplate,
  clearWhatsAppBillNumber,
  CloudApiError,
  type WhatsAppBillSettings
} from '../../cloud/cloudClient';

/** Digits only, at most 10 -- letters can never be typed or pasted into the number box. */
export function sanitizeBillNumberInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  return digits.slice(0, 10);
}

/** What the admin should read for each state the number can be in, and what to do about it. */
export function describeBillNumber(s: WhatsAppBillSettings): { tone: 'ok' | 'warn' | 'idle'; title: string; help: string } {
  switch (s.status) {
    case 'READY':
      return { tone: 'ok', title: `Ready — bills are sent from +91 ${s.number}`, help: s.verifiedName ? `WhatsApp business name: ${s.verifiedName}` : '' };
    case 'NOT_FOUND':
      return {
        tone: 'warn',
        title: 'This number is not on your WhatsApp Business account yet',
        help: 'Add and verify this number in Meta WhatsApp Manager (Phone numbers → Add phone number), then press “Check again”.'
      };
    case 'NO_CREDENTIALS':
    case 'TOKEN_INVALID':
      return { tone: 'warn', title: 'WhatsApp is not fully connected for this restaurant', help: 'Reconnect the restaurant’s WhatsApp account in the WhatsApp dashboard, then press “Check again”.' };
    case 'OWNED_BY_OTHER':
      return { tone: 'warn', title: 'This number belongs to another business', help: 'Use a number registered under your own WhatsApp Business account.' };
    case 'NOT_CONNECTED':
      return { tone: 'warn', title: 'This restaurant is not linked to the WhatsApp service', help: 'Connect WhatsApp ordering first, then set the number here.' };
    case 'BAD_NUMBER':
      return { tone: 'warn', title: 'Not a valid mobile number', help: 'Enter the 10-digit mobile number.' };
    case 'UNREACHABLE':
      return { tone: 'warn', title: 'Could not check the number right now', help: s.message || 'Try “Check again” in a minute.' };
    default:
      return { tone: 'idle', title: 'No number set', help: 'Bills are sent from the restaurant’s default WhatsApp number until you set one here.' };
  }
}

const TEMPLATE_TEXT: Record<string, { label: string; tone: 'ok' | 'warn' | 'idle' }> = {
  APPROVED: { label: 'Bill message template: approved — bills can reach any customer', tone: 'ok' },
  PENDING: { label: 'Bill message template: waiting for Meta approval (usually a few minutes)', tone: 'idle' },
  REJECTED: { label: 'Bill message template: rejected by Meta', tone: 'warn' },
  MISSING: { label: 'Bill message template: not created yet — customers who have not messaged you in 24 hours will not receive bills', tone: 'warn' },
  UNKNOWN: { label: 'Bill message template: could not be checked', tone: 'idle' }
};

const toneClass = { ok: 'text-emerald-700 bg-emerald-50 border-emerald-200', warn: 'text-amber-800 bg-amber-50 border-amber-200', idle: 'text-slate-600 bg-slate-50 border-slate-200' } as const;

/** Presentational part, kept free of effects so it can be rendered and tested on its own. */
export const WhatsAppBillNumberView: React.FC<{
  settings: WhatsAppBillSettings;
  input: string;
  busy: boolean;
  error: string;
  onInput: (value: string) => void;
  onSave: () => void;
  onRecheck: () => void;
  onCreateTemplate: () => void;
  onClear: () => void;
}> = ({ settings, input, busy, error, onInput, onSave, onRecheck, onCreateTemplate, onClear }) => {
  const info = describeBillNumber(settings);
  const tpl = settings.templateStatus ? TEMPLATE_TEXT[settings.templateStatus] : undefined;
  const valid = /^[6-9]\d{9}$/.test(input);
  const unchanged = input === settings.number;
  const Icon = info.tone === 'ok' ? CheckCircle2 : info.tone === 'warn' ? AlertTriangle : Clock;

  return (
    <div className="bg-white rounded-2xl p-5 border border-jaman-border shadow-2xs space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="w-4 h-4 text-green-600" />
          <h3 className="text-sm font-bold text-jaman-navy">WhatsApp number for customer bills</h3>
        </div>
        <p className="text-[11px] text-slate-500">
          When a customer asks for their bill on WhatsApp (kiosk or POS), it is sent automatically from this number.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-jaman-navy bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2">+91</span>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          value={input}
          onChange={(e) => onInput(sanitizeBillNumberInput(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter' && valid && !busy) onSave(); }}
          placeholder="94285 21735"
          aria-label="WhatsApp number for bills"
          className="w-44 bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-jaman-navy"
        />
        <button
          type="button"
          disabled={!valid || busy || unchanged}
          onClick={onSave}
          className="px-4 py-2 rounded-xl bg-jaman-saffron text-white text-xs font-bold disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Save & check'}
        </button>
        {settings.number && (
          <>
            <button type="button" disabled={busy} onClick={onRecheck} className="px-3 py-2 rounded-xl border border-jaman-border text-xs font-bold text-jaman-navy flex items-center gap-1.5 disabled:opacity-50">
              <RefreshCw className="w-3.5 h-3.5" /> Check again
            </button>
            <button type="button" disabled={busy} onClick={onClear} className="px-3 py-2 rounded-xl border border-jaman-border text-xs font-bold text-slate-500 flex items-center gap-1.5 disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </>
        )}
      </div>

      {error && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">{error}</p>}

      <div className={`rounded-xl border p-3 text-xs ${toneClass[info.tone]}`}>
        <p className="font-bold flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {info.title}</p>
        {info.help && <p className="mt-1">{info.help}</p>}
      </div>

      {settings.status === 'READY' && tpl && (
        <div className={`rounded-xl border p-3 text-xs ${toneClass[tpl.tone]}`}>
          <p className="font-semibold">{tpl.label}</p>
          {(settings.templateStatus === 'MISSING' || settings.templateStatus === 'REJECTED') && (
            <button type="button" disabled={busy} onClick={onCreateTemplate} className="mt-2 px-3 py-1.5 rounded-lg bg-jaman-navy text-white font-bold disabled:opacity-50">
              {settings.templateStatus === 'REJECTED' ? 'Submit again' : 'Create bill template'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Receipts tab → "WhatsApp number for customer bills". The admin only types a mobile number; the
 * WhatsApp service confirms it is a real sender on the restaurant's own Meta account. Nothing is
 * sent from here -- sending happens when a customer asks for a bill.
 */
export const WhatsAppBillNumberPanel: React.FC<{ showToast: (msg: string) => void }> = ({ showToast }) => {
  const [connected] = useState(isCloudConnected());
  const [loggedIn, setLoggedIn] = useState(isCloudLoggedIn());
  const [settings, setSettings] = useState<WhatsAppBillSettings | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const messageOf = (err: unknown) => (err instanceof CloudApiError || err instanceof Error ? err.message : 'Something went wrong');

  useEffect(() => {
    if (!connected || !loggedIn) return;
    let cancelled = false;
    fetchWhatsAppBillSettings()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        setInput(s.number ?? '');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof CloudApiError && err.status === 401) setLoggedIn(false);
        else setError(messageOf(err));
      });
    return () => { cancelled = true; };
  }, [connected, loggedIn]);

  if (!connected) return null;
  if (!loggedIn) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-jaman-border shadow-2xs">
        <h3 className="text-sm font-bold text-jaman-navy mb-1">WhatsApp number for customer bills</h3>
        <p className="text-[11px] text-slate-500">Sign in to JAMANVAAR Cloud to set the WhatsApp number bills are sent from.</p>
      </div>
    );
  }
  if (!settings) {
    return error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : null;
  }

  const run = async (action: () => Promise<WhatsAppBillSettings>, done?: (s: WhatsAppBillSettings) => string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await action();
      setSettings(next);
      setInput(next.number ?? '');
      if (done) showToast(done(next));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <WhatsAppBillNumberView
      settings={settings}
      input={input}
      busy={busy}
      error={error}
      onInput={setInput}
      onSave={() => run(() => saveWhatsAppBillNumber(input), (s) => (s.status === 'READY' ? 'WhatsApp bill number saved and verified' : 'Number saved — see the status below'))}
      onRecheck={() => run(recheckWhatsAppBillNumber, (s) => (s.status === 'READY' ? 'WhatsApp number verified' : 'Still not ready — see the status below'))}
      onCreateTemplate={() => run(createWhatsAppBillTemplate, () => 'Bill template submitted to Meta')}
      onClear={() => run(clearWhatsAppBillNumber, () => 'WhatsApp bill number removed')}
    />
  );
};
