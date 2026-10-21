import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
const query = new URLSearchParams(location.search);
(window as any).__paymentFixture = {active:false,requested:false,enabled:false,planAllowed:!query.has('blocked'),failSave:false,failRead:false,writes:[],requests:0,approvals:0,role:query.has('support')?'SUPPORT_ADMIN':'SUPER_ADMIN',rules:{hours:[],pausedUntil:null,minimumOrderPaise:0,preparationMinutes:20,maxPendingOrders:0,maxOrdersPerWindow:0,windowMinutes:5,customerInstructions:'',paymentInstructions:'Pay at counter',orderingModes:['DINE_IN','TAKEAWAY']}};
async function main() {
 if(query.get('mode')==='ticket') {
  const [{TicketDetailModal},{AuthProvider},{QrOrderingPage}]=await Promise.all([import('../../../cloud/super-admin-web/src/pages/Tickets/TicketDetailModal'),import('../../../cloud/super-admin-web/src/auth/AuthContext'),import('../../../cloud/super-admin-web/src/pages/QrOrdering/QrOrderingPage'),import('../../../cloud/super-admin-web/src/styles.css'),import('../../../cloud/super-admin-web/src/components/shared.css')]);
  const ticket={id:'ticket-payment',number:13,subject:'Enable QR online payments for River House',description:'The owner accepted a 2% commission on QR online collections.',restaurantId:'restaurant-a',restaurant:{name:'River House'},source:'RESTAURANT',category:'PAYMENTS',status:'OPEN',priority:'MEDIUM',slaDueAt:new Date().toISOString(),createdAt:new Date().toISOString(),events:[{id:'request',type:'QR_PAYMENT_ACTIVATION_REQUEST',actorName:'Owner',toValue:'200',createdAt:new Date().toISOString()}],comments:[],attachments:[]};
  createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><Routes><Route path="/qr-ordering" element={<QrOrderingPage/>}/><Route path="*" element={<TicketDetailModal ticket={ticket as any} team={[]} onClose={()=>{}} onUpdate={()=>{}} onChanged={async()=>{}} showToast={()=>{}}/>}/></Routes></AuthProvider></BrowserRouter>);
 } else {
  const [{QrOrderingRules}]=await Promise.all([import('../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrAdvanced'),import('../../../apps/restaurant-system/pos-admin/src/index.css'),import('../../../apps/restaurant-system/pos-admin/src/qr/workspace.css')]);
  createRoot(document.getElementById('root')!).render(<main className="qr-admin-app" style={{padding:16,height:'100vh',overflowY:'auto'}}><h1 className="text-2xl font-bold mb-5">QR payment settings · River House</h1><QrOrderingRules payments showToast={()=>{}}/></main>);
 }
}void main();
