// Uses the real console with isolated responses, extending the existing guest fixture.
import '../qr-experience-2026-10-22/fixture';
const f=(window as any).__experience;
f.branches.push({id:'branch-b',name:'Uptown',status:'ACTIVE',address:'Uptown Road'});
f.page.affectedBranches=f.branches.map((branch:any)=>({...branch,licensed:true}));
f.requests=[];f.menuWrites=0;f.menuVersion=1;f.menuDirty=false;f.paused=[];f.liveIds=f.items.map((item:any)=>item.id);
f.program={version:1,enabled:true,earnPoints:10,perRupeesSpent:100};f.rewards=[];f.ruleWrites=[];
const now=new Date().toISOString();
f.orders=[{id:'order-one',orderNumber:'QR-101',table:'1',placedAt:now,version:1,status:'NEW',total:199,paymentMethod:'CASH_AT_COUNTER',paymentStatus:'PENDING',customerName:'Test guest',customerPhone:'9999999999',notes:'Less spicy',history:[],items:[{name:'Paneer Tikka',quantity:1,modifiers:[]}],balance:{totalPaise:19900,collectedPaise:0,outstandingPaise:19900,refundedPaise:0}}];
f.attention=[{id:'request-one',kind:'SERVICE',priority:'URGENT',title:'Table 1 needs water',detail:'Bring drinking water',at:now,branchId:'branch-a',branchName:'Main Dining',requestId:'request-one',version:1,status:'OPEN'},{id:'attention-order',kind:'PAYMENT_DUE',priority:'ACTION',title:'QR-101 payment due',detail:'Table 1 · ₹199 at counter',at:now,branchId:'branch-a',branchName:'Main Dining',orderId:'order-one'}];
