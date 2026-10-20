import { useId, useState, useSyncExternalStore } from 'react';
import { ChevronDown, MonitorCog } from 'lucide-react';
import { SettingsFeedback, SettingsSection } from './Settings';
import {
  configureDisplayButtonScope, displayButtonSnapshot, notifyDisplayPreferenceScopeChange,
  saveDisplayButtonVisibility, subscribeDisplayButton, type DisplayButtonScope
} from './displayButtonPreference';
export { notifyDisplayPreferenceScopeChange } from './displayButtonPreference';
type Preset = 'standard' | 'large' | 'contrast';
const key = () =>
  `jamanvaar-display:${typeof location === 'undefined' ? 'app' : (location.pathname.split('/').filter(Boolean)[0] ?? 'app')}`;
function read(): Preset {
  try {
    const v = localStorage.getItem(key());
    return v === 'large' || v === 'contrast' ? v : 'standard';
  } catch {
    return 'standard';
  }
}
function currentPreset(): Preset {
  const value = typeof document === 'undefined' ? undefined : document.documentElement.dataset.jvDisplay;
  return value === 'standard' || value === 'large' || value === 'contrast' ? value : read();
}
export function initializeDisplayPreferences(scope?: DisplayButtonScope) {
  if (typeof document === 'undefined') return;
  if (scope) configureDisplayButtonScope(scope);
  document.documentElement.dataset.jvDisplay = read();
  if (document.getElementById('jv-display-style')) return;
  const style = document.createElement('style');
  style.id = 'jv-display-style';
  style.textContent = `html[data-jv-display=large]{font-size:19px}html[data-jv-display=large] :is(button,input,select,[role=button]){min-height:48px}html[data-jv-display=large] :is(.text-xs,.text-sm){font-size:max(15px,1em);line-height:1.5}html[data-jv-display=contrast]{font-size:18px}html[data-jv-display=contrast] :is(.text-slate-400,.text-slate-500,.text-slate-600,.text-gray-400,.text-gray-500){color:#243648!important}html[data-jv-display=contrast] :is(input,select,textarea,button){border:2px solid #56697a;min-height:48px}html[data-jv-display=contrast] :focus-visible{outline:3px solid #005fcc!important;outline-offset:3px}.jv-display-control{position:fixed;bottom:8px;left:8px;z-index:45;font:13px system-ui;color:#0b253a;max-width:calc(100vw - 16px)}.jv-display-control summary{cursor:pointer;border:1px solid #8a98a5;border-radius:12px;padding:8px 12px;background:#fff;min-height:36px}.jv-display-control[open]{padding:12px;background:white;border:1px solid #8a98a5;border-radius:12px;box-shadow:0 6px 24px #0b253a22}.jv-display-control select{font:inherit;min-height:44px;background:white;color:#0b253a;border:1px solid #8a98a5;padding:8px;border-radius:8px}`;
  document.head.append(style);
}

function useDisplayButtonVisibility() {
  const snapshot = useSyncExternalStore(subscribeDisplayButton, displayButtonSnapshot, () => 'on');
  return { visible: !snapshot.endsWith(':off'), unavailable: snapshot === 'unavailable' };
}

/** A device-local preference; placed only in each app's existing settings surface. */
export function DisplayButtonSetting() {
  const { visible, unavailable } = useDisplayButtonVisibility();
  const [error, setError] = useState('');
  const descriptionId = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <span className="block text-sm font-medium text-jaman-navy">Display Button</span>
          <p id={descriptionId} className="mt-0.5 text-xs text-slate-500">Show or hide the floating Display button on this screen.</p>
        </div>
        <button
          type="button" role="switch" aria-label="Display Button" aria-checked={visible}
          aria-describedby={descriptionId} disabled={unavailable}
          onClick={() => {
            try { saveDisplayButtonVisibility(!visible); setError(''); }
            catch { setError('Could not save the Display Button preference. Please try again.'); }
          }}
          className="min-h-11 min-w-12 shrink-0 flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jaman-saffron focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <span className={`w-11 h-6 rounded-full border flex items-center px-0.5 transition-colors ${visible ? 'bg-jaman-saffron border-jaman-saffron justify-end' : 'bg-slate-200 border-slate-300 justify-start'}`}>
            <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
          </span>
          <span className="sr-only">{visible ? 'On' : 'Off'}</span>
        </button>
      </div>
      {(unavailable || error) && <SettingsFeedback kind="error">
        {unavailable ? 'Could not load the Display Button preference. Allow local storage, then try again.' : error}
        {unavailable && <button type="button" className="ml-2 underline font-semibold" onClick={notifyDisplayPreferenceScopeChange}>Try again</button>}
      </SettingsFeedback>}
    </div>
  );
}

const SELECT_CLASS =
  'jv-display-select w-full min-h-[44px] appearance-none rounded-xl border border-jaman-border bg-white pl-3.5 pr-10 py-2 text-sm text-jaman-navy ' +
  'hover:border-slate-400 focus:border-jaman-saffron focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jaman-saffron/40 transition-colors';

export function DisplayPreferences({ compact = false, showButtonSetting = true }: { compact?: boolean; showButtonSetting?: boolean }) {
  const preset = useSyncExternalStore(subscribeDisplayButton, currentPreset, () => 'standard' as Preset);
  const { visible } = useDisplayButtonVisibility();
  const selectId = useId();
  const onPresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as Preset;
    try {
      localStorage.setItem(key(), v);
    } catch {
      /* optional preference */
    }
    document.documentElement.dataset.jvDisplay = v;
    notifyDisplayPreferenceScopeChange();
  };
  const options = (
    <>
      <option value="standard">Standard</option>
      <option value="large">Larger text & touch targets</option>
      <option value="contrast">Stronger contrast & large controls</option>
    </>
  );
  if (compact) {
    return visible ? (
      <details className="jv-display-control">
        <summary>Display</summary>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          Display size and contrast
          <select aria-label="Display size and contrast" value={preset} onChange={onPresetChange}>{options}</select>
        </label>
      </details>
    ) : null;
  }
  return (
    <SettingsSection
      title="Accessible display"
      description="Saved on this device for this app. Use Standard to restore the normal layout."
      icon={<MonitorCog className="w-4 h-4 text-jaman-saffron" />}
    >
      <div className="divide-y divide-slate-100 [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
        {showButtonSetting && <DisplayButtonSetting />}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <label htmlFor={selectId} className="text-sm font-medium text-jaman-navy">Display size and contrast</label>
          <div className="relative w-full sm:w-72 shrink-0">
            <select id={selectId} value={preset} onChange={onPresetChange} className={SELECT_CLASS}>{options}</select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden="true" />
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
