import React from 'react';
import { HelpCircle } from 'lucide-react';

export interface ActivationHelpNoteProps {
  /** What this device is, in the sentence "your restaurant owner receives one key per ___" — e.g. "terminal", "kiosk", "tablet". */
  deviceNoun: string;
  /** Match the parent JamanvaarAuthLayout's theme — a light cream box reads as a mistake sitting on a dark kitchen-display card. */
  dark?: boolean;
}

/**
 * The two-step explanation of where an activation key actually comes from,
 * shown under every app's activation form. Every activation screen used to
 * either say nothing or one dense sentence — this makes the real dependency
 * explicit (a plan has to exist before a key works; see security-audit's
 * fix for Quick Create Restaurant) instead of just "ask your owner."
 */
export const ActivationHelpNote: React.FC<ActivationHelpNoteProps> = ({ deviceNoun, dark = false }) => (
  <div className={`rounded-2xl px-4 py-3.5 space-y-2.5 ${dark ? 'bg-white/5 border border-white/10' : 'bg-[#FAF7F2] border border-[#EBE6DD]'}`}>
    <p className={`text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${dark ? 'text-[#F5F1E8]' : 'text-[#0B253A]'}`}>
      <HelpCircle className="w-3.5 h-3.5 text-[#E66817]" />
      Don't have an activation key?
    </p>
    <ol className="space-y-1.5">
      <li className={`flex items-start gap-2 text-[11px] font-medium leading-relaxed ${dark ? 'text-[#8CA0B3]' : 'text-slate-600'}`}>
        <span className={`shrink-0 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center mt-0.5 ${dark ? 'bg-[#E66817] text-white' : 'bg-[#0B253A] text-white'}`}>1</span>
        <span>Your restaurant needs an active JAMANVAAR plan — set up once by our Super Admin team.</span>
      </li>
      <li className={`flex items-start gap-2 text-[11px] font-medium leading-relaxed ${dark ? 'text-[#8CA0B3]' : 'text-slate-600'}`}>
        <span className={`shrink-0 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center mt-0.5 ${dark ? 'bg-[#E66817] text-white' : 'bg-[#0B253A] text-white'}`}>2</span>
        <span>Once the plan is active, your restaurant owner gets one key per {deviceNoun} and shares it with you.</span>
      </li>
    </ol>
  </div>
);

export default ActivationHelpNote;
