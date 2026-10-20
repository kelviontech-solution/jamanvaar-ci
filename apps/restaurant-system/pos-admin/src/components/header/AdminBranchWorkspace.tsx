import { useEffect, useState, useId } from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import {fetchCloudBranches,fetchTenantDashboard,type CloudBranch} from '../../cloud/cloudClient';
import { db } from '@jamanvaar/database';
import {activeAdminBranch,saveAdminBranch} from '../../adminBranchScope';
import {requestQrLeave} from '../qrconsole/useQrUnsavedChanges';

export function AdminBranchWorkspace({onReady}:{onReady:()=>void}) {
  const pickerId = useId();
  const [branches,setBranches]=useState<CloudBranch[]>([]),[allowAll,setAllowAll]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [retry,setRetry]=useState(0);
  async function change(branch:string) {
    if (!(await requestQrLeave())) return;
    setBusy(true);
    try {
      const storage=(window as unknown as {__jamanvaarStorage?:{flush:()=>Promise<void>}}).__jamanvaarStorage;
      await storage?.flush();saveAdminBranch(branch);
      window.location.reload();
    } catch {setError('Could not save the workspace. Try again.');setBusy(false);}
  }
  useEffect(()=>{let stopped=false;setError('');void Promise.all([fetchCloudBranches(),fetchTenantDashboard()]).then(async([list,overview])=>{
    if(stopped)return;setBranches(list);setAllowAll(overview.scope.branchId===null);
    const accessible=list.filter(branch => branch.status==='ACTIVE');
    const requestedBranch=new URLSearchParams(location.search).get('branchId');
    if(requestedBranch){
      if(!accessible.some(b=>b.id===requestedBranch)){setError('The linked branch is unavailable to this account. Choose an accessible branch.');return;}
      const clean=new URL(location.href);clean.searchParams.delete('branchId');history.replaceState(null,'',clean);
      if(requestedBranch!==activeAdminBranch){await change(requestedBranch);return;}
    }
    const preferred=activeAdminBranch??overview.scope.branchId??(accessible.length===1?accessible[0].id:'all');
    const valid=preferred==='all'?overview.scope.branchId===null:accessible.some(b=>b.id===preferred);
    if(!valid){setError('The saved branch is no longer available. Choose an accessible branch.');return;}
    if(!activeAdminBranch){await change(preferred);return;}
    const branch = list.find(b => b.id === preferred);
    if (branch && (db.outlet.id !== branch.id || db.outlet.name !== branch.name)) { db.outlet = {...db.outlet, id: branch.id, name: branch.name, code: branch.code, restaurantId: db.restaurant.id, address: branch.address || db.restaurant.address || ''}; db.notify(); }
    onReady();
  }).catch(e=>{if(!stopped)setError(e instanceof Error?e.message:'Could not load branches');});return()=>{stopped=true;};},[retry]);
  const selected = branches.find(b => b.id === activeAdminBranch);
  const selectedLabel = activeAdminBranch === 'all' ? 'All restaurant · overview' : selected ? `${selected.name} · ${selected.code}` : 'Choose branch';
  // A compact context strip, tinted like the header above it so the two read as one shell. The label and selector form one control group.
  return <div className="px-2.5 sm:px-6 lg:px-8 py-1.5 min-h-12 bg-[#FAF8F5] border-b border-[#EAE3D6] flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
    <label className="flex items-center gap-2 shrink-0 text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor={pickerId}><Building2 className="w-4 h-4 text-brand" aria-hidden="true" />Branch</label>
    <span className="relative min-w-0 flex-1 sm:flex-none">
      <select id={pickerId} aria-label="Branch workspace" title={selectedLabel} value={activeAdminBranch??''} disabled={busy} onChange={e=>void change(e.target.value)} className="h-9 w-full sm:w-auto sm:min-w-[16rem] max-w-full sm:max-w-md appearance-none truncate rounded-lg border border-jaman-border bg-white pl-3 pr-9 text-sm font-semibold text-jaman-navy shadow-2xs transition-colors hover:border-[#D8D1C3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-60"><option value="" disabled>Choose branch</option>{allowAll&&<option value="all">All restaurant · overview</option>}{branches.map(b=><option key={b.id} value={b.id} disabled={b.status!=='ACTIVE'}>{b.name} · {b.code}{b.status!=='ACTIVE'?' (inactive)':''}</option>)}</select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
    </span>
    {activeAdminBranch==='all'&&<span className="text-xs text-slate-500">Choose a branch to manage orders, tables and devices.</span>}
    {error&&<><span role="alert" className="text-rose-700">{error}</span><button onClick={()=>setRetry(n=>n+1)} className="min-h-9 rounded-lg border border-jaman-border bg-white px-3 text-sm font-semibold hover:bg-[#F5F3EE]">Retry</button></>}
  </div>;
}
