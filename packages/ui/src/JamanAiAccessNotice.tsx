import React, { useEffect, useState } from 'react';
import { AiConfig, refreshConfiguredAi } from '@jamanvaar/business';
import { Sparkles, X, RefreshCw } from 'lucide-react';

/** Explain access failures instead of letting an enabled-looking button silently do nothing. */
export function JamanAiAccessNotice({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const known = AiConfig.isKnown(), state = AiConfig.getState();
  return <div role="dialog" aria-modal="true" aria-label="JAMAN AI access" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
    <div className="w-full max-w-md rounded-3xl border border-orange-100 bg-white p-6 text-jaman-navy shadow-2xl" onClick={e => e.stopPropagation()}>
      <button type="button" aria-label="Close JAMAN AI" onClick={onClose} className="float-right rounded-lg p-2"><X className="h-5 w-5" /></button>
      <Sparkles className="mb-3 h-8 w-8 text-jaman-saffron" />
      <h2 className="text-lg font-black">{!known ? 'Connecting JAMAN AI' : state === 'LOCKED' ? 'JAMAN AI needs platform access' : 'JAMAN AI is switched off'}</h2>
      <p className="mt-2 text-sm text-slate-600">{!known ? 'The restaurant server has not supplied assistant settings yet. Check your connection and try again.' : state === 'LOCKED' ? 'Your restaurant visibility setting is enabled. Your plan or Super Admin must also grant assistant access.' : 'Super Admin has switched off assistant access for this restaurant.'}</p>
      {failed && <p role="alert" className="mt-3 text-sm text-amber-800">Could not refresh access. Check the server connection; your last verified settings are preserved.</p>}
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); setFailed(!await refreshConfiguredAi()); setBusy(false); }} className="mt-4 flex items-center gap-2 rounded-xl bg-jaman-navy px-4 py-2 font-bold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />{busy ? 'Checking…' : 'Check access again'}</button>
    </div>
  </div>;
}
