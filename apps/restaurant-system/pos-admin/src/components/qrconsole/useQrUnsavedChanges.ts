import { useEffect } from 'react';
export const QR_BEFORE_NAVIGATE = 'jamanvaar-qr-before-navigate';
export function useQrUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: Event) => {
      event.preventDefault(); // The workspace owns the themed, asynchronous confirmation.
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener(QR_BEFORE_NAVIGATE, navigate);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener(QR_BEFORE_NAVIGATE, navigate); };
  }, [dirty]);
}

export function requestQrLeave():Promise<boolean>{if(window.dispatchEvent(new Event(QR_BEFORE_NAVIGATE,{cancelable:true})))return Promise.resolve(true);return new Promise(resolve=>window.dispatchEvent(new CustomEvent('jamanvaar-qr-request-leave',{detail:{resolve}})));}
