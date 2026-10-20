import { useEffect, useId, useRef } from 'react';

/**
 * Open dialogs, outermost first. Escape and the focus trap act on the last entry only, so a
 * confirmation opened from inside a form closes by itself instead of taking the form with it.
 */
const openDialogs: string[] = [];
let previousBodyOverflow = '';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Rendered and not hidden by itself or an ancestor (checked via styles, so it also works without layout). */
const isVisible = (el: HTMLElement) => {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
};

/**
 * Keyboard and focus behaviour every dialog in the product shares:
 * moves focus inside on open (an explicit `[data-autofocus]` target, else the first control that
 * is not the close button, else the card), keeps Tab inside, closes only the top-most dialog on
 * Escape, and returns focus to whatever opened it. Attach the returned `cardRef` to the dialog
 * element and give that element `tabIndex={-1}`.
 */
export function useDialogFocus<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const dialogId = useId();
  const cardRef = useRef<T>(null);
  // Read at event time so a parent re-rendering with a new onClose never re-runs the focus effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (openDialogs.length === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogs.push(dialogId);

    const card = cardRef.current;
    if (card && !card.contains(document.activeElement)) {
      const explicit = card.querySelector<HTMLElement>('[data-autofocus],[autofocus]');
      const first = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)].find((el) => isVisible(el) && !el.hasAttribute('data-modal-close'));
      (explicit ?? first ?? card).focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== dialogId) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      const el = cardRef.current;
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
      if (items.length === 0) { e.preventDefault(); el.focus(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === el)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && active === lastEl) { e.preventDefault(); firstEl.focus(); }
      else if (!el.contains(active)) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const at = openDialogs.lastIndexOf(dialogId);
      if (at >= 0) openDialogs.splice(at, 1);
      if (openDialogs.length === 0) document.body.style.overflow = previousBodyOverflow;
      // Return focus to whatever opened the dialog, if it is still in the page.
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
    };
  }, [isOpen, dialogId]);

  return { cardRef, dialogId };
}
