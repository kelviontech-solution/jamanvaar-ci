import React,{useEffect,useState} from 'react';
import {fetchCloudBranches,fetchTenantDashboard,type CloudBranch} from '../../cloud/cloudClient';
import {activeAdminBranch,saveAdminBranch} from '../../adminBranchScope';

export function AdminBranchWorkspace({onReady}:{onReady:()=>void}) {
  const [branches,setBranches]=useState<CloudBranch[]>([]),[allowAll,setAllowAll]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [retry,setRetry]=useState(0);
  async function change(branch:string) {
    setBusy(true);
    try {
      const storage=(window as unknown as {__jamanvaarStorage?:{flush:()=>Promise<void>}}).__jamanvaarStorage;
      await storage?.flush();saveAdminBranch(branch);
      window.location.reload();
    } catch {setError('Could not save the workspace. Try again.');setBusy(false);}
  }
  useEffect(()=>{let stopped=false;setError('');void Promise.all([fetchCloudBranches(),fetchTenantDashboard()]).then(async([list,overview])=>{
    if(stopped)return;setBranches(list);setAllowAll(overview.scope.branchId===null);
    const preferred=activeAdminBranch??overview.scope.branchId??(list.length===1?list[0].id:'all');
    const valid=preferred==='all'?overview.scope.branchId===null:list.some(b=>b.id===preferred);
    if(!valid){setError('The saved branch is no longer available. Choose an accessible branch.');return;}
    if(!activeAdminBranch){await change(preferred);return;}onReady();
  }).catch(e=>{if(!stopped)setError(e instanceof Error?e.message:'Could not load branches');});return()=>{stopped=true;};},[retry]);
  return <div className="px-4 py-2 border-b border-jaman-border bg-white flex flex-wrap items-center gap-3 text-sm">
    <label className="font-bold" htmlFor="admin-branch-workspace">Workspace</label><select id="admin-branch-workspace" aria-label="Branch workspace" value={activeAdminBranch??''} disabled={busy} onChange={e=>void change(e.target.value)} className="rounded-xl border border-jaman-border py-2 px-3 bg-jaman-cream max-w-full"><option value="" disabled>Choose branch</option>{allowAll&&<option value="all">All restaurant · overview</option>}{branches.map(b=><option key={b.id} value={b.id} disabled={b.status!=='ACTIVE'}>{b.name} · {b.code}{b.status!=='ACTIVE'?' (inactive)':''}</option>)}</select>
    <span className="text-xs text-slate-500">{activeAdminBranch==='all'?'Choose a branch to manage orders, tables and devices.':'Orders, tables, inventory and devices belong to this branch.'}</span>
    {error&&<><span role="alert" className="text-rose-700">{error}</span><button onClick={()=>setRetry(n=>n+1)} className="rounded-lg border px-3 py-1">Retry</button></>}
  </div>;
}
