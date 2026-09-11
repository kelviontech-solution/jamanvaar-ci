import React, { useState } from 'react';
import { Delete, Space, X, CornerDownLeft } from 'lucide-react';
import { transliterateToDevanagari, transliterateToGujarati } from '@jamanvaar/utils';

export interface VirtualKeyboardProps {
  /** 'en' inserts Latin characters directly. 'hi'/'gu' treat every key as
   *  phonetic Roman input and live-convert it to Devanagari/Gujarati — the
   *  same approach tools like Google Input Tools use, so an admin without
   *  a native-script keyboard can still type a reasonable translation
   *  (reviewable in the field itself before saving, never assumed exact). */
  language: 'en' | 'hi' | 'gu';
  /** Current value of the field this keyboard is typing into. */
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  title?: string;
}

const ROW_1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const ROW_2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
const ROW_3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];

const PHONETIC_HINTS: Array<{ latin: string; result: string }> = [
  { latin: 'ka', result: 'क' },
  { latin: 'kha', result: 'ख' },
  { latin: 'ga', result: 'ग' },
  { latin: 'cha', result: 'च' },
  { latin: 'ta', result: 'त' },
  { latin: 'Ta', result: 'ट (retroflex)' },
  { latin: 'da', result: 'द' },
  { latin: 'Da', result: 'ड (retroflex)' },
  { latin: 'na', result: 'न' },
  { latin: 'pa', result: 'प' },
  { latin: 'ma', result: 'म' },
  { latin: 'ra', result: 'र' },
  { latin: 'la', result: 'ल' },
  { latin: 'sha', result: 'श' },
  { latin: 'aa / A', result: 'ा (long a)' },
  { latin: 'ii / I', result: 'ी (long i)' }
];

/**
 * On-screen keyboard for kiosk-admin's Add Dish form. Hindi/Gujarati modes
 * transliterate phonetic Roman typing into native script live, so an
 * admin who doesn't have (or know) a Devanagari/Gujarati physical keyboard
 * layout can still fill in a real, reviewable translation instead of
 * leaving the field blank or typing gibberish into a script keyboard they
 * don't understand.
 */
export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ language, value, onChange, onClose, title }) => {
  // For hi/gu: the raw Roman characters typed since this keyboard opened.
  // The bound field's value is always `prefix + transliterate(phoneticTail)`
  // so existing content (already-native-script or from a prior session)
  // is never re-processed or corrupted — only the newly-typed tail is.
  const [prefix] = useState(value);
  const [phoneticTail, setPhoneticTail] = useState('');
  const [isShift, setIsShift] = useState(false);
  const [showHints, setShowHints] = useState(false);

  const transliterate = language === 'hi' ? transliterateToDevanagari : transliterateToGujarati;

  const commit = (nextTail: string) => {
    setPhoneticTail(nextTail);
    if (language === 'en') {
      onChange(nextTail);
    } else {
      onChange(prefix + transliterate(nextTail));
    }
  };

  const currentRaw = language === 'en' ? value : phoneticTail;

  const pressKey = (key: string) => {
    const char = isShift ? key.toUpperCase() : key;
    commit(currentRaw + char);
    if (isShift) setIsShift(false);
  };

  const pressBackspace = () => {
    commit(currentRaw.slice(0, -1));
  };

  const pressSpace = () => {
    commit(currentRaw + ' ');
  };

  const rowClass = 'flex items-center justify-center gap-1.5';
  const keyClass =
    'h-11 min-w-[2.5rem] px-2 rounded-lg bg-white border border-[#EBE6DD] text-sm font-bold text-[#0B253A] hover:bg-[#FFF4ED] hover:border-[#E66817] active:scale-95 transition-all shadow-xs';

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl bg-[#FBF9F5] border-t-2 border-[#E66817] rounded-t-3xl shadow-2xl p-4 sm:p-6 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-black text-sm text-[#0B253A]">
              {title || (language === 'en' ? 'English Keyboard' : language === 'hi' ? 'हिन्दी Keyboard (phonetic)' : 'ગુજરાતી Keyboard (phonetic)')}
            </h4>
            {language !== 'en' && (
              <p className="text-[11px] text-[#8C9BAE]">
                Type sounds in Roman letters (e.g. "paneer tikka") — native script appears live. Review the field before saving.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {language !== 'en' && (
              <button
                type="button"
                onClick={() => setShowHints((s) => !s)}
                className="text-[11px] font-bold text-[#E66817] px-2.5 py-1 rounded-lg border border-[#E66817]/30 hover:bg-[#FFF4ED]"
              >
                {showHints ? 'Hide' : 'Show'} examples
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white border border-[#EBE6DD] flex items-center justify-center text-[#4A5568]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showHints && language !== 'en' && (
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 p-2.5 bg-white rounded-xl border border-[#EBE6DD] text-[11px]">
            {PHONETIC_HINTS.map((h) => (
              <div key={h.latin} className="text-center">
                <div className="font-mono font-bold text-[#0B253A]">{h.latin}</div>
                <div className="text-[#E66817]">{h.result}</div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <div className={rowClass}>
            {ROW_1.map((k) => (
              <button key={k} type="button" className={keyClass} onClick={() => pressKey(k)}>
                {isShift ? k.toUpperCase() : k}
              </button>
            ))}
          </div>
          <div className={rowClass}>
            {ROW_2.map((k) => (
              <button key={k} type="button" className={keyClass} onClick={() => pressKey(k)}>
                {isShift ? k.toUpperCase() : k}
              </button>
            ))}
          </div>
          <div className={rowClass}>
            <button
              type="button"
              onClick={() => setIsShift((s) => !s)}
              className={`${keyClass} ${isShift ? 'bg-[#0B253A] text-white border-[#0B253A]' : ''}`}
              title={language !== 'en' ? 'Shift — capital letters select retroflex consonants (T/D/N) in phonetic mode' : 'Shift'}
            >
              ⇧
            </button>
            {ROW_3.map((k) => (
              <button key={k} type="button" className={keyClass} onClick={() => pressKey(k)}>
                {isShift ? k.toUpperCase() : k}
              </button>
            ))}
            <button type="button" className={keyClass} onClick={pressBackspace} title="Backspace">
              <Delete className="w-4 h-4 mx-auto" />
            </button>
          </div>
          <div className={rowClass}>
            <button type="button" onClick={pressSpace} className={`${keyClass} flex-1 max-w-md flex items-center justify-center gap-2`}>
              <Space className="w-4 h-4" />
              <span>Space</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-lg bg-[#0B253A] text-white text-sm font-bold flex items-center gap-2 shadow-sm active:scale-95 transition-all"
            >
              <CornerDownLeft className="w-4 h-4" />
              <span>Done</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
