import { useState } from 'react';
import { createPortal } from 'react-dom';
import { installNativeUpdate, type NativeUpdateProgress } from './native_update';
import { useConfirm } from './ConfirmDialog';

export function NativeUpdateButton({ className = '' }: { className?: string }) {
  const [progress, setProgress] = useState<NativeUpdateProgress | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const busy = progress && ['checking', 'downloading', 'installing'].includes(progress.phase);
  const start = async () => {
    // Updating is a maintenance action, never interrupt another operational modal.
    const operationalDialog = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some(el => !el.hasAttribute('data-update-dialog') && !el.textContent?.includes('Update required'));
    if (operationalDialog) { setProgress({ phase: 'error', message: 'Finish and close the current order, payment or settings dialog before updating.' }); return; }
    if (!(await confirm({ title: 'Update this terminal now?', message: 'Finish active billing and printing first. Saved offline orders will be retained.', confirmLabel: 'Update now', cancelLabel: 'Not now' }))) return;
    void installNativeUpdate(setProgress).catch(() => undefined);
  };
  return <>
    {confirmDialog}
    <button type="button" disabled={!!busy} className={className} onClick={start}>{busy ? 'Updating…' : 'Update app'}</button>
    {progress && !busy && <span role="status" className="ml-2 text-sm">{progress.message}</span>}
    {busy && createPortal(<div role="alertdialog" aria-modal="true" data-update-dialog className="fixed inset-0 z-[20000] flex items-center justify-center bg-[#0B253A]/95 p-6">
      <div className="max-w-md rounded-3xl bg-white p-8 text-[#0B253A] shadow-xl"><h2 className="text-xl font-bold">Updating this terminal</h2><p className="mt-3">{progress.message}</p>{progress.percent !== undefined && <progress className="mt-4 w-full" max={100} value={progress.percent} />}<p className="mt-3 text-sm">Keep the device powered on. Saved orders and settings remain in local storage.</p></div>
    </div>, document.body)}
  </>;
}
