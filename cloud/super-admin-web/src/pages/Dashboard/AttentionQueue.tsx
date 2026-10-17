import '../Restaurants/restaurants.css';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { RestaurantHealthBoard, SupportTicket } from '../../api/types';
import { Button } from '../../components/ui';

export function AttentionQueue() {
  const { can }=useAuth();
  const reports=can('reports','read'), support=can('support','read');
  const [health,setHealth]=useState<RestaurantHealthBoard>(), [tickets,setTickets]=useState<SupportTicket[]>(),
    [errors,setErrors]=useState<string[]>([]),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    setBusy(true);setErrors([]);setHealth(undefined);setTickets(undefined);
    const results=await Promise.allSettled([
      reports?api.get<RestaurantHealthBoard>('/api/v1/platform/dashboard/restaurant-health'):Promise.resolve(undefined),
      support?api.get<SupportTicket[]>('/api/v1/support-tickets?view=all&limit=50&page=1'):Promise.resolve(undefined)
    ]);
    const failures:string[]=[];
    if(results[0].status==='fulfilled')setHealth(results[0].value);else failures.push('Restaurant health is unavailable.');
    if(results[1].status==='fulfilled')setTickets(results[1].value);else failures.push('Support tasks are unavailable.');
    setErrors(failures);setBusy(false);
  },[reports,support]);
  useEffect(()=>{void load();},[load]);
  const open=(tickets??[]).filter(t=>!['RESOLVED','CLOSED'].includes(t.status)).sort((a,b)=>{
    const late=(t:SupportTicket)=>Date.parse(t.slaDueAt)<Date.now()?0:1;
    return late(a)-late(b)||Date.parse(a.slaDueAt)-Date.parse(b.slaDueAt);
  });
  const unhealthy=(health?.restaurants??[]).filter(r=>r.tone!=='healthy').sort((a,b)=>a.score-b.score);
  return <section className="attention-workspace" aria-label="What needs attention">
    <div className="workflow-actions"><div><h2>What needs attention</h2><p>Resolve service problems and finish customer setup before reviewing platform metrics.</p></div><Button variant="ghost" disabled={busy} onClick={()=>void load()}>Refresh attention</Button></div>
    {busy&&<p role="status">Checking restaurant health and support work…</p>}
    {errors.map(message=><p role="alert" key={message}>{message} Use Refresh attention to retry.</p>)}
    {open.length>0&&<><h3>Support work</h3><div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>Restaurant</th><th>Problem</th><th>Responsible person</th><th>Next action</th></tr></thead><tbody>{open.slice(0,6).map(t=><tr key={t.id}><td>{t.restaurant?.name||'Platform'}</td><td>{t.subject}<div>{t.priority} · {Date.parse(t.slaDueAt)<Date.now()?'Overdue':'Due '+new Date(t.slaDueAt).toLocaleString('en-IN')}</div></td><td>{t.assignedTo?.fullName||'Unassigned'}</td><td><Link className="btn btn-ghost" to={`/tickets?open=${t.id}`}>Open task & assign</Link></td></tr>)}</tbody></table></div></>}
    {unhealthy.length>0&&<><h3>Restaurants to review</h3><div className="workflow-task-grid">{unhealthy.slice(0,6).map(r=><article key={r.restaurantId}><strong>{r.name}</strong><p>{r.reasons.join(' · ')}</p><Link className="btn btn-ghost" to={`/restaurants/${r.restaurantId}`}>Review restaurant & next setup task</Link></article>)}</div></>}
    {!busy&&!errors.length&&health&&(!support||tickets)&&!open.length&&!unhealthy.length&&<p>No issues in the current health results or loaded support tasks.</p>}
    <div className="workflow-actions">{reports&&<Link className="btn btn-ghost" to="/restaurant-health">All restaurant health results</Link>}{support&&<Link className="btn btn-ghost" to="/tickets">All support tasks</Link>}<Link className="btn btn-ghost" to="/restaurants">Continue restaurant setup</Link></div>
    <p className="muted">Support preview uses the first 50 returned tickets, showing up to six unresolved tasks. Open All support tasks for the complete queue. Health signals and ticket ownership remain separate.</p>
  </section>;
}
