import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Copy } from 'lucide-react';
// Deep import on purpose: the '@jamanvaar/utils' barrel drags in the local device database (see tests/super_admin_css_classes.test.ts).
import { copyText } from '../../../../packages/utils/src/clipboard';
import { Button } from './ui';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Copy with visible, honest feedback: `state` is 'copied' for ~2 s only when the text
 * really reached the clipboard, and 'failed' when it did not. Keyed so one hook can
 * drive many buttons in a list.
 */
export function useCopied(resetMs = 2000) {
  const [active, setActive] = useState<{ key: string; state: CopyState } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = useCallback(
    async (text: string, key = 'default'): Promise<boolean> => {
      const ok = await copyText(text);
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
  onResult
}: {
  text: string;
  label?: string;
  title?: string;
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'primary' | 'accent';
  style?: CSSProperties;
  /** Called after each attempt, e.g. to show a toast. */
  onResult?: (ok: boolean) => void;
}) {
  const { copy, stateOf } = useCopied();
  const state = stateOf();
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      title={title ?? label}
      style={{ padding: '2px 8px', height: 'auto', fontSize: 11, ...style }}
      onClick={async (e) => {
        e.stopPropagation();
        onResult?.(await copy(text));
      }}
    >
      {state === 'copied' ? <Check className="w-3.5 h-3.5 mr-1" style={{ color: '#047857' }} /> : <Copy className="w-3.5 h-3.5 mr-1" />}
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}</span>
    </Button>
  );
}
