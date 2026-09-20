import { useEffect } from 'react';

/** Dialogs currently open, oldest first. Escape closes only the topmost one. */
const openDialogs: (() => void)[] = [];
let listening = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || openDialogs.length === 0) return;
  openDialogs[openDialogs.length - 1]();
}

/** Closes the dialog when Escape is pressed (BUG-114). Call it with every render, before any early return. */
export function useEscapeToClose(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return;
    const close = () => onClose();
    openDialogs.push(close);
    if (!listening) {
      window.addEventListener('keydown', onKeyDown);
      listening = true;
    }
    return () => {
      const at = openDialogs.indexOf(close);
      if (at >= 0) openDialogs.splice(at, 1);
      if (openDialogs.length === 0 && listening) {
        window.removeEventListener('keydown', onKeyDown);
        listening = false;
      }
    };
  }, [isOpen, onClose]);
}
