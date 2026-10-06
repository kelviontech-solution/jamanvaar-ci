import React, { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';
import { CloudApiError, cloudSetupHint, fetchDisplayScale, isCloudConnected, isCloudLoggedIn, saveDisplayScale } from '../../cloud/cloudClient';

const MIN = 70;
const MAX = 150;

/** The default screen size for this restaurant's terminals (BUG-008). Each terminal can still choose its own. */
export const TerminalDisplaySettings: React.FC<{ showToast: (msg: string) => void }> = ({ showToast }) => {
  const ready = isCloudConnected() && isCloudLoggedIn();
  const [saved, setSaved] = useState<number | null>(null);
  const [value, setValue] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready) return;
    fetchDisplayScale()
      .then((n) => {
        setSaved(n);
        setValue(n);
      })
      .catch((err) => setError(err instanceof CloudApiError ? err.message : 'Could not load the display size.'));
  }, [ready]);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const n = await saveDisplayScale(value);
      setSaved(n);
      showToast(`Terminal screen size set to ${n}%. Terminals pick it up within a minute.`);
    } catch (err) {
      setError(err instanceof CloudApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-3 max-w-4xl mx-auto mb-6">
      <div className="flex items-center gap-2">
        <Monitor className="w-5 h-5 text-slate-500" />
        <h3 className="font-bold text-sm text-jaman-navy">Terminal screen size</h3>
      </div>
      {!ready ? (
        <p className="text-xs text-slate-500">{cloudSetupHint()} You need it to set a screen size for all your terminals.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">The size POS, KDS, Captain and Kiosk screens open at. Someone at a terminal can still pick a different size for that screen.</p>
          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500 w-8 text-right">{MIN}%</span>
            <input aria-label="Terminal screen size" type="range" min={MIN} max={MAX} step={5} value={value} onChange={(e) => setValue(Number(e.target.value))} className="flex-1 accent-brand" />
            <span className="text-slate-500 w-10">{MAX}%</span>
            <strong className="w-12 text-jaman-navy">{value}%</strong>
            <button type="button" onClick={save} disabled={saving || saved === value} className="rounded-xl bg-jaman-navy px-4 py-2 font-bold text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
