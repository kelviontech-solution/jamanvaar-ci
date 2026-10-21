import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
const capabilityCodes=['QR_FEEDBACK','QR_MULTILINGUAL','QR_LOYALTY','QR_NOTIFICATIONS','QR_PROMOTIONS','QR_GROUP_ORDERING'];
(window as any).__featureFixture={version:1,settings:{feedbackEnabled:false,loyaltyEnabled:false,notificationsEnabled:false,multilingualEnabled:false,languages:['en','hi','gu'],defaultLanguage:'en',translations:{hi:{items:{one:{name:'पिज़्ज़ा',description:'Test description'}}}},notificationTypes:[]},capabilities:capabilityCodes.map(code=>({code,enabled:true,reason:'OK'})),writes:[],failSave:false,grants:0,enabled:false,role:'SUPER_ADMIN',blocked:false,reservationRows:[{id:'reservation-one',branchId:'branch-a',name:'Fixture guest',phone:'9999999999',date:'2026-10-22',time:'19:30',guests:3,status:'PENDING'}]};
async function main(){
 const mode=new URLSearchParams(location.search).get('mode');
 Object.assign((window as any).__featureFixture,{promotions:[],promotionWrites:0,failMenu:new URLSearchParams(location.search).has('failMenu'),failConfig:new URLSearchParams(location.search).has('failConfig')});
 (window as any).__featureFixture.capabilities.push({code:'QR_INVENTORY_SYNC',enabled:false,reason:'NOT_INCLUDED'});
 Object.assign((window as any).__featureFixture.settings,{maxGuests:8,sessionMinutes:60,groupEnabled:false});
 (window as any).__featureFixture.blocked=new URLSearchParams(location.search).has('blocked');
 if(new URLSearchParams(location.search).has('support'))(window as any).__featureFixture.role='SUPPORT_ADMIN';
 if(mode==='ticket'){
  const [{TicketDetailModal},{AuthProvider}]=await Promise.all([import('../../../cloud/super-admin-web/src/pages/Tickets/TicketDetailModal'),import('../../../cloud/super-admin-web/src/auth/AuthContext'),import('../../../cloud/super-admin-web/src/styles.css'),import('../../../cloud/super-admin-web/src/components/shared.css')]);
  const ticket={id:'ticket-a',number:10,subject:'Enable Pickup calendar',description:'Please enable pickup scheduling.',restaurantId:'restaurant-a',restaurant:{name:'River House'},source:'RESTAURANT',category:'FEATURE_REQUEST',status:'OPEN',priority:'LOW',slaDueAt:new Date().toISOString(),createdAt:new Date().toISOString(),events:[],comments:[],attachments:[]};
  createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><TicketDetailModal ticket={ticket as any} team={[]} onClose={()=>{}} onUpdate={()=>{}} onChanged={async()=>{}} showToast={()=>{}}/></AuthProvider></BrowserRouter>);
 }else{
  const [{QrConsole}]=await Promise.all([import('../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole'),import('../../../apps/restaurant-system/pos-admin/src/index.css'),import('../../../apps/restaurant-system/pos-admin/src/qr/workspace.css')]);
  createRoot(document.getElementById('root')!).render(<main className="qr-admin-app"><header className="qr-admin-header" style={{padding:20,minHeight:80}}><strong>QR Admin · River House</strong></header><QrConsole layout="workspace" onViewPlan={()=>{}} showToast={message=>{(window as any).__toast=message;}}/></main>);
 }
}void main();
