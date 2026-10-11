import React, { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';
import { SettingsSaveBar, SettingsSection } from '@jamanvaar/ui';
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
  const [justSaved, setJustSaved] = useState(false);

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
      setJustSaved(true);
      showToast(`Terminal screen size set to ${n}%. Terminals pick it up within a minute.`);
    } catch (err) {
      setError(err instanceof CloudApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const dirty = saved !== null && saved !== value;
  const saveState = saving ? 'saving' : error ? 'error' : justSaved && !dirty ? 'saved' : dirty ? 'dirty' : 'idle';

  return (
    <SettingsSection
      icon={<Monitor className="w-5 h-5" />}
      title="Terminal screen size"
      description="The size POS, KDS, Captain and Kiosk screens open at. Someone at a terminal can still pick a different size for that screen."
      footer={
        ready ? (
          <SettingsSaveBar
            state={saveState}
            onSave={save}
            disableWhenClean
            scope="all terminals of this restaurant"
            message={saveState === 'saved' ? 'Saved. Terminals pick it up within a minute.' : error ?? undefined}
          />
        ) : undefined
      }
    >
      {!ready ? (
        <p className="text-xs text-[#4A5568]">{cloudSetupHint()} You need it to set a screen size for all your terminals.</p>
      ) : (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[#4A5568] w-8 text-right">{MIN}%</span>
          <input
            aria-label="Terminal screen size"
            type="range"
            min={MIN}
            max={MAX}
            step={5}
            value={value}
            onChange={(e) => { setJustSaved(false); setValue(Number(e.target.value)); }}
            className="flex-1 accent-brand"
          />
          <span className="text-[#4A5568] w-10">{MAX}%</span>
          <strong className="w-12 text-jaman-navy">{value}%</strong>
        </div>
      )}
    </SettingsSection>
  );
};
