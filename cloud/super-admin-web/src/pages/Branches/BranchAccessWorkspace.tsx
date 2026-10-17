import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { APP_CODES, APP_CODE_LABELS, type AppCode } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui';
import { BranchLicensing } from './BranchLicensing';
import { currentAllocation, type SavedAllocation } from './branchAllocation';

type View = { apps: { appCode: string; enabled: boolean; reason: string; revision: number }[]; history: SavedAllocation[] };
type CopyInput = { appCode: string; enabled: boolean; deviceQuota: number | null; disabledFeatures: string[]; effectiveAt: string; expiresAt: string | null; expectedRevision: number };
type Reviewed = { branchId: string; input: CopyInput; previewHash: string; impact: { activeDevices: number; pendingOrders: number; quotaWarning: string | null; affectedDevices: {id:string;name:string|null;type:string}[] } };

export function BranchAccessWorkspace({ restaurantId, branches, branchId }: {
  restaurantId: string; branches: { id: string; name: string }[]; branchId: string;
}) {
  const { user } = useAuth();
  const writable = user?.role === 'PLATFORM_OWNER' || user?.role === 'SUPER_ADMIN';
  const [views,setViews]=useState<Record<string,View>>({}), [error,setError]=useState(''), [busy,setBusy]=useState(false),
    [reload,setReload]=useState(0), [product,setProduct]=useState<AppCode>('POS'), [targets,setTargets]=useState<string[]>([]),
    [review,setReview]=useState<Reviewed[]>([]), [ack,setAck]=useState(false), [outcomes,setOutcomes]=useState<string[]>([]),
    // Local <input type="datetime-local"> value strings (no timezone suffix); converted to real
    // ISO instants in prepare(). Was hardcoded to "2 minutes from now, no expiry" with no way for
    // the operator to choose either — e.g. scheduling outside trading hours, or a time-limited trial.
    [effectiveAtInput,setEffectiveAtInput]=useState(''), [expiresAtInput,setExpiresAtInput]=useState('');
  // Key by stable branch IDs so parent refreshes do not reset a review.
  const branchKey=branches.map(b=>b.id).join(',');
  useEffect(()=>{let active=true;setViews({});setError('');void Promise.all(branches.map(async b=>[b.id,await api.get<View>(`/api/v1/branches/${b.id}/licenses`)] as const))
    .then(rows=>{if(active)setViews(Object.fromEntries(rows));}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[restaurantId,branchKey,reload]);
  useEffect(()=>{setTargets([]);setReview([]);setAck(false);setOutcomes([]);setEffectiveAtInput('');setExpiresAtInput('');},[branchId]);
  const invalidate=()=>{setReview([]);setAck(false);setOutcomes([]);};
  async function prepare() {
    setBusy(true);setError('');setReview([]);setAck(false);setOutcomes([]);
    try {
      // Re-read source and targets: never submit a cached expected revision or assume inherited access.
      const source=await api.get<View>(`/api/v1/branches/${branchId}/licenses`), allocation=currentAllocation(source.history,product), grant=source.apps.find(a=>a.appCode===product);
      if(!grant)throw Error('Source product unavailable. Refresh and choose another product.');
      const effectiveAt=effectiveAtInput?new Date(effectiveAtInput).toISOString():new Date(Date.now()+120000).toISOString();
      if(new Date(effectiveAt).getTime()<=Date.now())throw Error('Effective time must be in the future.');
      const expiresAt=expiresAtInput?new Date(expiresAtInput).toISOString():null;
      if(expiresAt && new Date(expiresAt).getTime()<=new Date(effectiveAt).getTime())throw Error('Expiry must be after the effective time.');
      const proposals:Reviewed[]=[];
      for(const id of targets) {
        if(id===branchId || !branches.some(b=>b.id===id))throw Error('Choose a different target branch in this restaurant.');
        const target=await api.get<View>(`/api/v1/branches/${id}/licenses`);
        const input:CopyInput={appCode:product,enabled:grant.enabled,deviceQuota:allocation?.deviceQuota??null,disabledFeatures:allocation?.disabledFeatures??[],effectiveAt,expiresAt,expectedRevision:target.apps.find(a=>a.appCode===product)?.revision??0};
        const preview=await api.post<Omit<Reviewed,'branchId'|'input'>>(`/api/v1/branches/${id}/licenses/preview`,input);
        proposals.push({branchId:id,input,...preview});
      }
      setReview(proposals);
    } catch(e){setError(e instanceof Error?e.message:'Could not review branch changes');}finally{setBusy(false);}
  }
  async function apply() {
    setBusy(true);setError('');const messages:string[]=[];
    // Each branch is an independent reviewed transaction. Never imply a multi-branch atomic update.
    for(const row of review) {
      const name=branches.find(b=>b.id===row.branchId)?.name||row.branchId;
      try {await api.post(`/api/v1/branches/${row.branchId}/licenses`,{...row.input,previewHash:row.previewHash,acknowledgeImpact:true});messages.push(`${name}: scheduled successfully.`);}
      catch(e){messages.push(`${name}: NOT saved. ${e instanceof Error?e.message:'Review again before retrying.'}`);}
    }
    setOutcomes(messages);setReview([]);setAck(false);setBusy(false);setReload(n=>n+1);
  }
  return <section aria-label="Branch access comparison">
    <h2>Compare branch access</h2><p>Restaurant plans are shared. These branch restrictions cannot grant extra purchased products. Select a cell to open that branch’s detailed controls.</p>
    {error&&<p role="alert">{error}</p>}
    <Button variant="ghost" disabled={busy} onClick={()=>{invalidate();setReload(n=>n+1);}}>Refresh branch comparison</Button>
    <div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>Branch</th>{APP_CODES.map(code=><th key={code}>{APP_CODE_LABELS[code]}</th>)}</tr></thead><tbody>{branches.map(b=><tr key={b.id}><th>{b.name}</th>{APP_CODES.map(code=>{const grant=views[b.id]?.apps.find(a=>a.appCode===code),saved=views[b.id]&&currentAllocation(views[b.id].history,code);return <td key={code}><Link to={`/restaurants/${restaurantId}?tab=branch-access&branchId=${b.id}`}>{!views[b.id]?'Loading':grant?.enabled?'Enabled':'Unavailable'}</Link><div className="muted">{grant?.reason.replaceAll('_',' ').toLowerCase()}{saved?` · Branch limit: ${saved.deviceQuota??'inherited'}`:' · Inherited'}</div></td>;})}</tr>)}</tbody></table></div>
    <details style={{margin:'20px 0'}}><summary>Copy selected branch settings</summary>
      <p>Source: <strong>{branches.find(b=>b.id===branchId)?.name}</strong>. Copy one product’s enablement, explicit device limit and disabled features. Dates and existing orders are not copied. Each branch saves separately.</p>
      <fieldset disabled={!writable||busy} style={{border:0,padding:0}}><label>Product to copy <select aria-label="Product to copy" value={product} onChange={e=>{setProduct(e.target.value as AppCode);invalidate();}}>{APP_CODES.map(c=><option key={c} value={c}>{APP_CODE_LABELS[c]}</option>)}</select></label>
        {branches.filter(b=>b.id!==branchId).map(b=><label key={b.id} style={{display:'block',padding:8}}><input type="checkbox" checked={targets.includes(b.id)} onChange={e=>{setTargets(rows=>e.target.checked?[...rows,b.id]:rows.filter(id=>id!==b.id));invalidate();}}/> Copy to {b.name}</label>)}
        <label style={{display:'block',padding:'8px 0'}}>Apply at <input type="datetime-local" aria-label="Effective at" value={effectiveAtInput} onChange={e=>{setEffectiveAtInput(e.target.value);invalidate();}}/> <span className="muted">Leave blank for 2 minutes from now.</span></label>
        <label style={{display:'block',padding:'8px 0'}}>Expires at <input type="datetime-local" aria-label="Expires at" value={expiresAtInput} onChange={e=>{setExpiresAtInput(e.target.value);invalidate();}}/> <span className="muted">Leave blank for no expiry.</span></label>
        <Button disabled={!targets.length||busy} onClick={()=>void prepare()}>Review copy impact</Button>
      </fieldset>
      {!writable&&<p>Only a Platform Owner or Super Admin can change branch access.</p>}
      {review.length>0&&<section aria-label="Branch copy impact"><h3>Review every target branch</h3>{review.map(row=><article key={row.branchId}><strong>{branches.find(b=>b.id===row.branchId)?.name}</strong><p>{APP_CODE_LABELS[product]}: {row.input.enabled?'Enabled':'Disabled'} · Device limit {row.input.deviceQuota??'inherited'} · Disabled features: {row.input.disabledFeatures.join(', ')||'None'} · Apply {new Date(row.input.effectiveAt).toLocaleString('en-IN')}{row.input.expiresAt?` · Expires ${new Date(row.input.expiresAt).toLocaleString('en-IN')}`:' · No expiry'}</p><p>{row.impact.activeDevices} devices · {row.impact.pendingOrders} open orders · {row.impact.quotaWarning||'No quota warning'}</p>{row.impact.affectedDevices.map(d=><p key={d.id}>{d.name||d.type}</p>)}</article>)}<label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I reviewed each branch and its pending work.</label><Button disabled={!ack||busy||!writable} onClick={()=>void apply()}>Apply reviewed branch copies</Button></section>}
      {outcomes.length>0&&<ul role="status">{outcomes.map((text,i)=><li key={i}>{text}</li>)}</ul>}
    </details>
    <BranchLicensing key={branchId+':'+reload} branchId={branchId}/>
  </section>;
}
