import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, Copy, Loader2 } from 'lucide-react';
// Deep import on purpose: the '@jamanvaar/utils' barrel drags in the local device database (see tests/super_admin_css_classes.test.ts).
import { copyText } from '../../../../packages/utils/src/clipboard';
import { Button, ModalShell } from './ui';
import './copy-button.css';

type CopyState = 'idle' | 'copying' | 'copied' | 'failed';

/**
 * Copy with visible, honest feedback: `state` is 'copied' for ~2 s only when the text
 * really reached the clipboard, and 'failed' when it did not. Keyed so one hook can
 * drive many buttons in a list.
 */
export function useCopied(resetMs = 3000) {
  const [active, setActive] = useState<{ key: string; state: CopyState } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      sequence.current++;
    },
    []
  );

  const copy = useCallback(
    async (text: string, key = 'default'): Promise<boolean> => {
      const attempt = ++sequence.current;
      if (timer.current) clearTimeout(timer.current);
      setActive({ key, state: 'copying' });
      let ok = false;
      try {
        ok = await copyText(text);
      } catch {
        /* A blocked clipboard is a recoverable UI failure. */
      }
      if (attempt !== sequence.current) return ok;
      setActive({ key, state: ok ? 'copied' : 'failed' });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setActive(null), resetMs);
      return ok;
    },
    [resetMs]
  );

  const stateOf = (key = 'default'): CopyState => (active?.key === key ? active.state : 'idle');
  return { copy, stateOf, isCopied: (key = 'default') => stateOf(key) === 'copied' };
}

export function CopyButton({
  text,
  label = 'Copy',
  title,
  size = 'sm',
  variant = 'ghost',
  style,
  className = '',
  onResult
}: {
  text: string;
  label?: string;
  title?: string;
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'primary' | 'accent';
  style?: CSSProperties;
  className?: string;
  /** Called after each attempt, e.g. to show a toast. */
  onResult?: (ok: boolean) => void;
}) {
  const { copy, stateOf } = useCopied();
  const state = stateOf();
  const [manual, setManual] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        title={state === 'copied' ? 'Copied to clipboard' : (title ?? label)}
        aria-label={label ? undefined : title || 'Copy'}
        className={`copy-control ${className}`}
        data-copy-state={state}
        aria-busy={state === 'copying'}
        disabled={state === 'copying' || !text}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
        }}
        style={{ padding: '8px 12px', minHeight: 44, height: 'auto', fontSize: 13, ...style }}
        onClick={async (e) => {
          e.stopPropagation();
          e.preventDefault();
          const ok = await copy(text);
          if (!ok) setManual(true);
          onResult?.(ok);
        }}
      >
        <span className="copy-control-icon" aria-hidden="true">
          {state === 'copied' ? (
            <Check size={16} />
          ) : state === 'copying' ? (
            <Loader2 size={16} />
          ) : state === 'failed' ? (
            <AlertCircle size={16} />
          ) : (
            <Copy size={16} />
          )}
        </span>
        <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'copying' ? 'Copying…' : state === 'failed' ? 'Copy blocked' : label}</span>
      </Button>
      {manual &&
        createPortal(
          <div onClick={(event) => event.stopPropagation()}>
            <ModalShell label="Copy manually" onClose={() => setManual(false)}>
              <div className="copy-manual">
                <h2>Copy manually</h2>
                <p>Your browser blocked automatic copying. Select the text below and press Ctrl+C (Command+C on Mac), or touch and hold to copy.</p>
                <label>
                  Text to copy
                  <textarea
                    aria-label="Text to copy"
                    readOnly
                    value={text}
                    onFocus={(event) => event.target.select()}
                    onClick={(event) => event.currentTarget.select()}
                  />
                </label>
                <Button type="button" onClick={() => setManual(false)}>
                  Close
                </Button>
              </div>
            </ModalShell>
          </div>,
          document.body
        )}
    </>
  );
}
