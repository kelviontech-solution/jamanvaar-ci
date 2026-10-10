import { useEffect } from 'react';
export const QR_BEFORE_NAVIGATE = 'jamanvaar-qr-before-navigate';
export function useQrUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: Event) => {
      if (!window.confirm('Discard your unsaved changes and open another page?')) event.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener(QR_BEFORE_NAVIGATE, navigate);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener(QR_BEFORE_NAVIGATE, navigate); };
  }, [dirty]);
}
