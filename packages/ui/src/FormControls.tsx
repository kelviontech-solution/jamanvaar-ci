import React, { forwardRef, useCallback, useEffect, useRef } from 'react';

/**
 * Shared building blocks for the compact admin-style forms (modals, panels) that used to repeat
 * the same class strings dozens of times. They render exactly the markup those call sites had;
 * every native prop (value, onChange, ref, aria-*, …) passes straight through.
 */

const FIELD_BASE = 'w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold';
const FIELD_FOCUS = 'focus:outline-none focus:border-brand';

const fieldClass = (mono?: boolean) => `${FIELD_BASE}${mono ? ' font-mono' : ''} ${FIELD_FOCUS}`;

type WithMono<T> = T & {
  /** Monospaced digits/codes (SKUs, phone numbers, PINs). */
  mono?: boolean;
};

export const FormInput = forwardRef<HTMLInputElement, WithMono<React.InputHTMLAttributes<HTMLInputElement>>>(
  ({ mono, ...rest }, ref) => <input ref={ref} className={fieldClass(mono)} {...rest} />
);
FormInput.displayName = 'FormInput';

export const FormSelect = forwardRef<HTMLSelectElement, WithMono<React.SelectHTMLAttributes<HTMLSelectElement>>>(
  ({ mono, ...rest }, ref) => <select ref={ref} className={fieldClass(mono)} {...rest} />
);
FormSelect.displayName = 'FormSelect';

export const FormTextarea = forwardRef<HTMLTextAreaElement, WithMono<React.TextareaHTMLAttributes<HTMLTextAreaElement>>>(
  ({ mono, ...rest }, ref) => <textarea ref={ref} className={fieldClass(mono)} {...rest} />
);
FormTextarea.displayName = 'FormTextarea';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const DISMISS_LABEL = /^(close|cancel|back|dismiss|done|no|not now|×|✕)$/i;
let headingSeq = 0;

// The control that had focus before a dialog opened. Tracked globally because a dialog's own autofocus can move focus
// into it before any per-dialog effect gets to look.
let lastFocusOutsideDialog: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && !target.closest('[data-jv-dialog]')) lastFocusOutsideDialog = target;
  }, true);
}

/**
 * Dialog behaviour every backdrop-based modal should have, applied in one place: the right role and an accessible name,
 * focus moved into the dialog and returned afterwards, Tab kept inside it, and Escape that closes only the topmost
 * dialog. Escape activates the dialog's own Close/Cancel control rather than guessing its state, so any "discard
 * changes?" confirmation a dialog performs still runs; a dialog with no such control is left open.
 */
function useBackdropDialog(node: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = node.current;
    if (!root) return;
    const previous = (document.activeElement instanceof HTMLElement && !document.activeElement.closest('[data-jv-dialog]') ? document.activeElement : null) ?? lastFocusOutsideDialog;
    if (!root.hasAttribute('aria-label') && !root.hasAttribute('aria-labelledby')) {
      const heading = root.querySelector<HTMLElement>('h1, h2, h3');
      if (heading) {
        if (!heading.id) heading.id = `jv-dialog-title-${++headingSeq}`;
        root.setAttribute('aria-labelledby', heading.id);
      }
    }
    if (!root.contains(document.activeElement)) {
      const first = root.querySelector<HTMLElement>('[autofocus]') ?? root.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? root).focus({ preventScroll: true });
    }
    const topmost = () => { const all = document.querySelectorAll('[data-jv-dialog]'); return all[all.length - 1] === root; };
    const onKey = (event: KeyboardEvent) => {
      if (!topmost()) return;
      if (event.key === 'Tab') {
        const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; });
        if (!items.length) { event.preventDefault(); return; }
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
      const target = buttons.find((b) => /^close/i.test(b.getAttribute('aria-label') ?? '') || /^close/i.test(b.title))
        ?? buttons.find((b) => DISMISS_LABEL.test((b.textContent ?? '').trim()));
      if (target) { event.preventDefault(); event.stopPropagation(); target.click(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [node]);
}

/**
 * Full-screen dimmed layer behind a dialog, drawer or sheet. `className` carries the layout
 * (alignment, padding, animation) so each call site keeps its own arrangement.
 */
export const ModalBackdrop = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...rest }, ref) => {
    const inner = useRef<HTMLDivElement | null>(null);
    const setRef = useCallback((el: HTMLDivElement | null) => {
      inner.current = el;
      if (typeof ref === 'function') ref(el); else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }, [ref]);
    useBackdropDialog(inner);
    return <div ref={setRef} role="dialog" aria-modal="true" tabIndex={-1} data-jv-dialog className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-xs outline-none ${className}`.trim()} {...rest} />;
  }
);
ModalBackdrop.displayName = 'ModalBackdrop';
