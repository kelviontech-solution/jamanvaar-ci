import React, { useSyncExternalStore } from 'react';
import { DisplayScale, MAX_DISPLAY_SCALE, MIN_DISPLAY_SCALE } from '@jamanvaar/sync';
import { Monitor } from 'lucide-react';

/** Screen size for this terminal (BUG-008): the restaurant default from Restaurant Admin, or a size picked here. */
export const DisplaySizeCard: React.FC = () => {
  const effective = useSyncExternalStore(
    (cb) => DisplayScale.subscribe(cb),
    () => DisplayScale.getEffective(),
    () => DisplayScale.getEffective()
  );
  const override = DisplayScale.getLocalOverride();
  const restaurantDefault = DisplayScale.getCloudDefault();

  return (
    <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Monitor className="w-5 h-5 text-jaman-saffron" />
          <h3 className="font-bold text-sm text-jaman-navy">Screen size</h3>
        </div>
        <span className="text-[10px] font-black bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{effective}%</span>
      </div>
      <div className="space-y-3 text-xs">
        <p className="text-slate-500">
          Makes everything on this screen bigger or smaller. Your restaurant default is {restaurantDefault}% (set in Restaurant Admin).{' '}
          {override === null ? 'This terminal is using it.' : `This terminal is set to ${override}%.`}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-slate-500 w-8 text-right">{MIN_DISPLAY_SCALE}%</span>
          <input
            aria-label="Screen size"
            type="range"
            min={MIN_DISPLAY_SCALE}
            max={MAX_DISPLAY_SCALE}
            step={5}
            value={effective}
            onChange={(e) => DisplayScale.setLocalOverride(Number(e.target.value))}
            className="flex-1 accent-jaman-saffron"
          />
          <span className="text-slate-500 w-10">{MAX_DISPLAY_SCALE}%</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => DisplayScale.setLocalOverride(null)} disabled={override === null} className="px-3 py-1.5 rounded-xl border border-jaman-border font-bold text-jaman-navy disabled:opacity-50">
            Use the restaurant default
          </button>
          <button type="button" onClick={() => DisplayScale.setLocalOverride(100)} className="px-3 py-1.5 rounded-xl border border-jaman-border font-bold text-jaman-navy">
            Reset to 100%
          </button>
        </div>
      </div>
    </div>
  );
};
