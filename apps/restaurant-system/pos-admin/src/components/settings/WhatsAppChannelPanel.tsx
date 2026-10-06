import { copyText } from '@jamanvaar/utils';
import React, { useEffect, useState } from 'react';
import {
  isCloudConnected,
  isCloudLoggedIn,
  fetchWhatsAppChannelStatus,
  fetchWhatsAppChannelEntitlement,
  generateWhatsAppChannelKey,
  revokeWhatsAppChannelKey,
  updateWhatsAppChannelSettings,
  CloudApiError,
  type WhatsAppChannelStatus,
  type WhatsAppChannelEntitlement
} from '../../cloud/cloudClient';
import { MessageCircle, KeyRound, Copy, CheckCircle2, Ban, Clock, Lock } from 'lucide-react';

/**
 * Restaurant Admin → Settings → WhatsApp Ordering (Phase 1 of the Jamanvaar connector —
 * see docs/integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md). Generates the
 * API key the owner pastes into product/whatsapp's own dashboard to connect the two
 * platforms; nothing here talks to WhatsApp/Meta directly — that's product/whatsapp's job.
 */
export const WhatsAppChannelPanel: React.FC<{ showToast: (msg: string) => void }> = ({ showToast }) => {
  const [connected] = useState(isCloudConnected());
  const [loggedIn, setLoggedIn] = useState(isCloudLoggedIn());
  const [status, setStatus] = useState<WhatsAppChannelStatus | null>(null);
  const [entitlement, setEntitlement] = useState<WhatsAppChannelEntitlement | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [justGenerated, setJustGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [autoAccept, setAutoAccept] = useState(false);
  const [prepTime, setPrepTime] = useState(15);
  const [savingSettings, setSavingSettings] = useState(false);

  async function refresh() {
    try {
      const [s, ent] = await Promise.all([fetchWhatsAppChannelStatus(), fetchWhatsAppChannelEntitlement()]);
      setStatus(s);
      setEntitlement(ent);
      setLoggedIn(true);
      setLoadError('');
      setAutoAccept(Boolean(s.autoAccept));
      setPrepTime(s.prepTimeMinutes ?? 15);
    } catch (err) {
      if (err instanceof CloudApiError && err.status === 401) {
        setLoggedIn(false);
      } else {
        setLoadError(err instanceof CloudApiError ? err.message : 'Could not load WhatsApp connector status');
      }
    }
  }

  useEffect(() => {
    if (connected && loggedIn) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, loggedIn]);

  if (!connected) return null;

  if (!loggedIn) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-jaman-border shadow-2xs">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-bold text-jaman-navy">WhatsApp Ordering</h3>
        </div>
        <p className="text-[11px] text-slate-500">Sign in to JAMANVAAR Cloud above to connect WhatsApp ordering.</p>
      </div>
    );
  }

  async function handleGenerate() {
    setBusy(true);
    setLoadError('');
    try {
      const res = await generateWhatsAppChannelKey();
      setJustGenerated(res.key);
      setConfirmingRevoke(false);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof CloudApiError ? err.message : 'Could not generate a key');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    setBusy(true);
    setLoadError('');
    try {
      await revokeWhatsAppChannelKey();
      setJustGenerated(null);
      setConfirmingRevoke(false);
      await refresh();
      showToast('WhatsApp ordering disconnected.');
    } catch (err) {
      setLoadError(err instanceof CloudApiError ? err.message : 'Could not revoke the key');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    setLoadError('');
    try {
      const s = await updateWhatsAppChannelSettings({ autoAccept, prepTimeMinutes: prepTime });
      setStatus(s);
      showToast('WhatsApp ordering settings saved.');
    } catch (err) {
      setLoadError(err instanceof CloudApiError ? err.message : 'Could not save settings');
    } finally {
      setSavingSettings(false);
    }
  }

  async function copyKey() {
    if (!justGenerated) return;
    if (!(await copyText(justGenerated))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const isConnected = status?.status === 'CONNECTED';
  const hasKey = status?.status === 'PENDING' || status?.status === 'CONNECTED';
  // entitlement is fetched alongside status, so it's only meaningfully "locked" once we
  // actually have an answer — null (still loading) never shows the lock banner.
  const locked = entitlement !== null && !entitlement.enabled;

  return (
    <div className="bg-white rounded-2xl p-5 border border-jaman-border shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-bold text-jaman-navy">WhatsApp Ordering</h3>
          {locked ? (
            <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              <Lock className="w-2.5 h-2.5" />
              Locked
            </span>
          ) : (
            status && (
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  isConnected ? 'bg-emerald-50 text-emerald-700' : status.status === 'PENDING' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {isConnected ? 'Connected' : status.status === 'PENDING' ? 'Waiting to connect' : 'Not connected'}
              </span>
            )
          )}
        </div>
        {!hasKey && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || locked}
            title={locked ? entitlement?.lockedMessage ?? undefined : undefined}
            className="px-3.5 py-2 rounded-xl bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{busy ? 'Generating…' : 'Generate Key'}</span>
          </button>
        )}
      </div>

      {locked && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2 text-[11px] text-slate-600">
          <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
          <span>{entitlement?.lockedMessage ?? 'WhatsApp Ordering is not available on your current plan.'}</span>
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        Generate a key here, then paste it into your WhatsApp ordering dashboard's Integrations → Jamanvaar screen. Once
        connected, this restaurant's real menu, prices and orders flow through your own POS and KDS — the WhatsApp side
        never invents a price or keeps its own menu.
      </p>

      {loadError && <div className="form-error">{loadError}</div>}

      {justGenerated && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl space-y-1.5">
          <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Key generated — copy it now, it isn't shown again</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="font-bold text-jaman-navy break-all">{justGenerated}</span>
            <button type="button" onClick={copyKey} className="text-slate-500 hover:text-jaman-navy cursor-pointer shrink-0">
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button type="button" onClick={() => setJustGenerated(null)} className="text-[11px] font-bold text-emerald-700 underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {hasKey && status && (
        <div className="p-3.5 bg-jaman-cream border border-jaman-border rounded-2xl space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Key</span>
            <code className="font-mono font-bold text-jaman-navy">{status.keyPrefix}••••••••••••</code>
          </div>
          {status.connectedAt && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Clock className="w-3 h-3" />
              <span>Connected {new Date(status.connectedAt).toLocaleString('en-IN')}</span>
            </div>
          )}

          {isConnected && (
            <div className="space-y-2 pt-1 border-t border-jaman-border">
              <label className="flex items-center gap-2 text-xs font-semibold text-jaman-navy cursor-pointer">
                <input type="checkbox" checked={autoAccept} onChange={(e) => setAutoAccept(e.target.checked)} className="accent-brand" />
                Auto-accept paid WhatsApp orders (skip the manual accept step)
              </label>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-jaman-navy">Prep time</span>
                <input
                  type="number"
                  min={0}
                  max={180}
                  value={prepTime}
                  onChange={(e) => setPrepTime(Number(e.target.value))}
                  className="w-20 bg-white border border-jaman-border rounded-lg px-2 py-1 text-xs font-mono font-bold text-jaman-navy focus:outline-none focus:border-brand"
                />
                <span className="text-slate-500">minutes</span>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={savingSettings || locked}
                  title={locked ? entitlement?.lockedMessage ?? undefined : undefined}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover active:bg-brand-press disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[11px] cursor-pointer"
                >
                  {savingSettings ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          <div className="pt-1 border-t border-jaman-border">
            {!confirmingRevoke ? (
              <button
                type="button"
                onClick={() => setConfirmingRevoke(true)}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
              >
                <Ban className="w-3 h-3" />
                Disconnect WhatsApp ordering
              </button>
            ) : (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-600">Disconnect and revoke this key? WhatsApp orders stop reaching this restaurant.</span>
                <button type="button" onClick={handleRevoke} disabled={busy} className="font-bold text-rose-600 hover:text-rose-700 cursor-pointer disabled:opacity-40">
                  {busy ? 'Disconnecting…' : 'Yes, disconnect'}
                </button>
                <button type="button" onClick={() => setConfirmingRevoke(false)} className="font-bold text-slate-500 hover:text-jaman-navy cursor-pointer">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
