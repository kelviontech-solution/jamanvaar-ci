import { useState } from 'react';
import { Modal } from '@jamanvaar/ui';

/** Search is usable on a touch-only terminal as well as with a physical keyboard. */
export function KioskSearchKeyboard({
  value,
  onChange,
  onClose,
  title
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  title: string;
}) {
  const [numbers, setNumbers] = useState(false);
  const rows = numbers ? ['1234567890', '-_.()&/'] : ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      maxWidth="2xl"
      footer={
        <button type="button" className="min-h-12 rounded-xl bg-jaman-saffron text-white font-bold px-6" onClick={onClose}>
          Show results
        </button>
      }
    >
      <input
        aria-label="Touch search text"
        inputMode="none"
        readOnly
        value={value}
        className="w-full rounded-xl border p-4 text-lg mb-4"
        placeholder="Type a name or option"
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
