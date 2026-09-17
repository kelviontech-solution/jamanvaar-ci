import React from 'react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from './Button';

export interface ActivationWelcomeScreenProps {
  /** Shown in the headline, e.g. "POS Terminal", "Captain", "Kitchen Display", "Kiosk Admin". */
  appName: string;
  /** 2-4 short, concrete first-steps for this specific app. */
  tips: string[];
  onContinue: () => void;
}

/**
 * A one-time screen shown right after a device's first successful
 * activation, before it drops into its normal login/main screen. All 5
 * device-activation flows in this product (POS, Captain, KDS, Kiosk Admin,
 * Kiosk customer) previously went straight from "activation succeeded" to
 * the main screen with zero orientation for whoever set the device up.
 */
export const ActivationWelcomeScreen: React.FC<ActivationWelcomeScreenProps> = ({
  appName,
  tips,
  onContinue
}) => (
  <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2] p-6">
    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-lg space-y-5 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
      </div>
      <div>
        <h1 className="text-xl font-black text-[#0B253A]">You're Connected!</h1>
        <p className="text-sm text-[#4A5568] mt-1">
          This {appName} is now activated and linked to your restaurant.
        </p>
      </div>
      <ul className="text-left space-y-2.5 bg-[#FAF7F2] border border-[#EBE6DD] rounded-2xl p-4">
        {tips.map((tip, i) => (
          <li key={i} className="flex items-start gap-2 text-xs font-semibold text-[#0B253A]">
            <span className="w-4 h-4 rounded-full bg-[#E66817] text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
      <Button variant="primary" onClick={onContinue} className="w-full justify-center" rightIcon={<ArrowRight className="w-4 h-4" />}>
        Continue
      </Button>
    </div>
  </div>
);
