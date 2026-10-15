import { useState } from 'react';
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
export function initializeDisplayPreferences() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.jvDisplay = read();
  if (document.getElementById('jv-display-style')) return;
  const style = document.createElement('style');
  style.id = 'jv-display-style';
  style.textContent = `html[data-jv-display=large]{font-size:19px}html[data-jv-display=large] :is(button,input,select,[role=button]){min-height:48px}html[data-jv-display=large] :is(.text-xs,.text-sm){font-size:max(15px,1em);line-height:1.5}html[data-jv-display=contrast]{font-size:18px}html[data-jv-display=contrast] :is(.text-slate-400,.text-slate-500,.text-slate-600,.text-gray-400,.text-gray-500){color:#243648!important}html[data-jv-display=contrast] :is(input,select,textarea,button){border:2px solid #56697a;min-height:48px}html[data-jv-display=contrast] :focus-visible{outline:3px solid #005fcc!important;outline-offset:3px}.jv-display-control{position:fixed;bottom:8px;left:8px;z-index:45;font:13px system-ui;color:#0b253a;max-width:calc(100vw - 16px)}.jv-display-control summary{cursor:pointer;border:1px solid #8a98a5;border-radius:12px;padding:8px 12px;background:#fff;min-height:36px}.jv-display-control[open]{padding:12px;background:white;border:1px solid #8a98a5;border-radius:12px;box-shadow:0 6px 24px #0b253a22}.jv-display-control select{font:inherit;min-height:44px;background:white;color:#0b253a;border:1px solid #8a98a5;padding:8px;border-radius:8px}`;
  document.head.append(style);
}
export function DisplayPreferences({ compact = false }: { compact?: boolean }) {
  const [preset, setPreset] = useState<Preset>(read);
  const control = (
    <label style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      Display size and contrast
      <select
        aria-label="Display size and contrast"
        value={preset}
        onChange={(e) => {
          const v = e.target.value as Preset;
          setPreset(v);
          try {
            localStorage.setItem(key(), v);
          } catch {
            /* optional preference */
          }
          document.documentElement.dataset.jvDisplay = v;
        }}
      >
        <option value="standard">Standard</option>
        <option value="large">Larger text & touch targets</option>
        <option value="contrast">Stronger contrast & large controls</option>
      </select>
    </label>
  );
  return compact ? (
    <details className="jv-display-control">
      <summary>Display</summary>
      {control}
    </details>
  ) : (
    <section
      style={{
        padding: 20,
        background: 'white',
        border: '1px solid #ddd',
        borderRadius: 16,
        marginBottom: 20,
      }}
    >
      <h3 style={{ fontWeight: 700 }}>Accessible display</h3>
      <p>Saved on this device for this app. Use Standard to restore the normal layout.</p>
      {control}
    </section>
  );
}
