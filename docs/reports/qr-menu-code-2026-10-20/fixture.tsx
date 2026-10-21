import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QrMenuCodes } from '../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrMenuCodes';
import '../../../apps/restaurant-system/pos-admin/src/index.css';
import '../../../apps/restaurant-system/pos-admin/src/qr/workspace.css';

const initial = { codes: [{id:'legacy-menu',status:'ACTIVE',mode:'MENU_ONLY',version:1,tableId:null,displayNumber:'Existing counter card',branchId:'branch-a',url:'https://restaurant.example/q/previously-created-menu',branchName:'Main Dining',createdAt:new Date().toISOString()}], enabled:{'branch-a':false,'branch-b':true}, creates:0, fail:false, failCreate:false, failPrint:false, requests:[], slowBranch:false };
try { (window as any).__menuFixture = JSON.parse(sessionStorage.getItem('menu-code-fixture') || 'null') || initial; } catch { (window as any).__menuFixture = initial; }
function Fixture() {
 const [creating,setCreating]=useState(false),[branch,setBranch]=useState('branch-a'),[toast,setToast]=useState('');
 return <main className="qr-admin-app"><header className="qr-admin-header" style={{padding:20}}>QR ADMIN · River House</header><div className="qr-console--workspace" style={{display:'block',padding:20,maxWidth:1200,margin:'auto'}}>
  <h1 style={{fontSize:28,fontWeight:750,marginBottom:16}}>Tables & QR</h1>
  <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}}><label>Branch<select aria-label="Branch" value={branch} onChange={e=>{setCreating(false);setBranch(e.target.value);}}><option value="branch-a">Main Dining</option><option value="branch-b">Second Branch</option></select></label>
   <button style={{background:'#0b253a',color:'white',padding:'12px 18px',borderRadius:12}} onClick={()=>setCreating(true)}>Create menu QR</button></div>
  <QrMenuCodes key={branch} branchId={branch} branchName={branch==='branch-a'?'Main Dining':'Second Branch'} creating={creating} onCreate={()=>setCreating(true)} onCloseCreate={()=>setCreating(false)} showToast={setToast}/>
  <p role="status" style={{marginTop:16}}>{toast}</p>
 </div></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
