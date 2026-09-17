import React, { useState } from 'react';
import { CheckCircle2, Circle, X, Rocket } from 'lucide-react';

const DISMISS_KEY = 'jamanvaar_kioskadmin_onboarding_dismissed';

export interface OnboardingChecklistItem {
  id: string;
  label: string;
  done: boolean;
  onGo: () => void;
}

interface OnboardingChecklistCardProps {
  items: OnboardingChecklistItem[];
}

/**
 * First-run checklist for a brand-new kiosk owner — same pattern as
 * Restaurant Admin's OnboardingChecklistCard (this app had no equivalent
 * at all). Each item reflects real state, not a canned tutorial, and
 * disappears for good once every item is complete or the owner dismisses it.
 */
export const OnboardingChecklistCard: React.FC<OnboardingChecklistCardProps> = ({ items }) => {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const allDone = items.every((i) => i.done);
  if (dismissed || allDone) return null;

  const doneCount = items.filter((i) => i.done).length;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // localStorage unavailable — checklist just reappears next session, harmless.
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-jaman-border shadow-2xs p-5 relative">
      <button
        onClick={dismiss}
        title="Dismiss checklist"
        className="absolute top-3 right-3 p-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center shrink-0">
          <Rocket className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-black text-jaman-navy">Get Your Kiosk Ready</h3>
          <p className="text-[11px] text-slate-500">{doneCount} of {items.length} steps complete</p>
        </div>
      </div>

      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-jaman-saffron rounded-full transition-all"
          style={{ width: `${(doneCount / items.length) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onGo}
            disabled={item.done}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-colors ${
              item.done
                ? 'bg-emerald-50 text-emerald-800 cursor-default'
                : 'bg-jaman-cream hover:bg-[#F4EFE6] text-jaman-navy cursor-pointer'
            }`}
          >
            {item.done ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-slate-300 shrink-0" />
            )}
            <span className={item.done ? 'line-through decoration-emerald-400' : ''}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
