import { useState } from 'react';
import { Modal } from '@jamanvaar/ui';

/** Search is usable on a touch-only terminal as well as with a physical keyboard. */
export function KioskSearchKeyboard({
  value,
  onChange,
  onClose,
  title,
  confirmLabel = 'Show results',
  placeholder = 'Type a name or option',
  ariaLabel = 'Touch search text',
  startNumeric = false,
  mask = false
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  title: string;
  /** This component started life as search-only ("Show results"); other reused fields (coupon code, kitchen note) pass their own label. */
  confirmLabel?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** Opens straight into the numeric row — for PIN-style fields where letters never apply. */
  startNumeric?: boolean;
  /** Shows dots instead of the typed characters — for a staff PIN on a public-facing screen. */
  mask?: boolean;
}) {
  const [numbers, setNumbers] = useState(startNumeric);
  const rows = numbers ? ['1234567890', '-_.()&/'] : ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      maxWidth="2xl"
      footer={
        <button type="button" className="min-h-12 rounded-xl bg-jaman-saffron text-white font-bold px-6" onClick={onClose}>
          {confirmLabel}
        </button>
      }
    >
      <input
        aria-label={ariaLabel}
        inputMode="none"
        readOnly
        value={mask ? '•'.repeat(value.length) : value}
        className="w-full rounded-xl border p-4 text-lg mb-4"
        placeholder={placeholder}
      />
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row} className="flex justify-center gap-1 sm:gap-2">
            {[...row].map((key) => (
              <button
                key={key}
                aria-label={`Search key ${key}`}
                type="button"
                className="min-h-12 min-w-0 flex-1 max-w-14 rounded-xl border border-jaman-border bg-jaman-cream text-jaman-navy font-bold text-lg active:bg-orange-100"
                onClick={() => onChange((value + key).slice(0, 200))}
              >
                {key}
              </button>
            ))}
          </div>
        ))}
        <div className="grid grid-cols-[1fr_2fr_1fr_1fr] gap-2">
          <button type="button" className="min-h-12 rounded-xl border font-bold" onClick={() => setNumbers((v) => !v)}>
            {numbers ? 'ABC' : '123'}
          </button>
          <button
            aria-label="Search space"
            type="button"
            className="min-h-12 rounded-xl border font-bold"
            onClick={() => onChange((value + ' ').slice(0, 200))}
          >
            Space
          </button>
          <button aria-label="Search backspace" type="button" className="min-h-12 rounded-xl border font-bold" onClick={() => onChange(value.slice(0, -1))}>
            Delete
          </button>
          <button type="button" className="min-h-12 rounded-xl border font-bold" onClick={() => onChange('')}>
            Clear
          </button>
        </div>
      </div>
    </Modal>
  );
}
