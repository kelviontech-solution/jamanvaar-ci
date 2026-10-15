import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { installNativeUpdate, scheduleNativeMaintenance, scheduledMaintenance, cancelScheduledMaintenance, type NativeUpdateProgress } from './native_update';
import { useConfirm } from './ConfirmDialog';

export function NativeUpdateButton({ className = '' }: { className?: string }) {
  const [progress, setProgress] = useState<NativeUpdateProgress | null>(null);
  const [scheduleOpen,setScheduleOpen]=useState(false),[time,setTime]=useState(''),[maintenance,setMaintenance]=useState(scheduledMaintenance);
  useEffect(()=>{const update=()=>setMaintenance(scheduledMaintenance());window.addEventListener('jamanvaar-maintenance',update);return()=>window.removeEventListener('jamanvaar-maintenance',update);},[]);
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
    <button type="button" disabled={!!busy} className={className} onClick={()=>setScheduleOpen(v=>!v)}>Schedule outside service</button>
    {scheduleOpen&&<span className="inline-flex flex-wrap gap-2 p-2 rounded-xl bg-white text-[#0B253A]"><label>Maintenance time <input type="datetime-local" value={time} onChange={e=>setTime(e.target.value)}/></label><button type="button" onClick={()=>{try{scheduleNativeMaintenance(new Date(time).toISOString());setScheduleOpen(false);}catch(e){setProgress({phase:'error',message:e instanceof Error?e.message:'Choose a valid time.'});}}}>Schedule this device</button></span>}
    {maintenance&&<span role="status" className="text-sm block">{new Date(maintenance.at).toLocaleString()} · {maintenance.status.toLowerCase()} {maintenance.message}<button type="button" onClick={cancelScheduledMaintenance}>Cancel schedule</button></span>}
    {progress && !busy && <span role="status" className="ml-2 text-sm">{progress.message}</span>}
    {busy && createPortal(<div role="alertdialog" aria-modal="true" data-update-dialog className="fixed inset-0 z-[20000] flex items-center justify-center bg-[#0B253A]/95 p-6">
      <div className="max-w-md rounded-3xl bg-white p-8 text-[#0B253A] shadow-xl"><h2 className="text-xl font-bold">Updating this terminal</h2><p className="mt-3">{progress.message}</p>{progress.percent !== undefined && <progress className="mt-4 w-full" max={100} value={progress.percent} />}<p className="mt-3 text-sm">Keep the device powered on. Saved orders and settings remain in local storage.</p></div>
    </div>, document.body)}
  </>;
}
