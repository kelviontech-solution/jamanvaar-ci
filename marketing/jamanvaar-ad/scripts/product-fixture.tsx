// Isolated marketing preview. Real components, fictional data, no device login or cloud writes.
import React from 'react';
import { createRoot } from 'react-dom/client';
const mode=new URLSearchParams(location.search).get('product')||'pos';
async function main(){
  if(mode==='admin'||mode==='qr'){
    const q=new URL(location.href);q.searchParams.set('mode',mode==='qr'?'order':'owner-dashboard');q.searchParams.set('tab','OVERVIEW');history.replaceState(null,'',q);
    if(mode==='admin')await import('../../../apps/restaurant-system/pos-admin/src/qr/product.css');
    await import('../../../docs/reports/qr-owner-flow-2026-10-22/fixture');return;
  }
  const [{db},{menuDishImage}]=await Promise.all([import('@jamanvaar/database'),import('@jamanvaar/utils')]);
  const names=['Paneer Tikka','Margherita Pizza','Dal Makhani','Butter Naan','Gulab Jamun','Masala Dosa'];
  const items=names.map((name,i)=>({id:'ad-dish-'+i,name,price:[249,199,229,49,99,159][i],description:'Freshly prepared in our kitchen.',imageUrl:menuDishImage('',name),categoryId:i<2?'starters':i<4?'mains':'favourites',isAvailable:true,dietaryType:'VEG',modifierGroupIds:[],sortOrder:i,sku:'DEMO-'+i}));
  db.menuItems=items as any;db.categories=[{id:'starters',name:'Starters',sortOrder:0},{id:'mains',name:'Main course',sortOrder:1},{id:'favourites',name:'Favourites',sortOrder:2}] as any;
  db.orders=[];db.kots=[];db.customers=[];db.restaurant.name='River House Kitchen';db.notify();
  if(mode==='pos'){
    const [{PosBillingWorkspace},{usePosStore}]=await Promise.all([import('../../../apps/restaurant-system/pos/src/components/menu/PosBillingWorkspace'),import('../../../apps/restaurant-system/pos/src/store/posStore'),import('../../../apps/restaurant-system/pos/src/index.css')]);
    usePosStore.setState({currentUser:{id:'ad-cashier',fullName:'Demo cashier',roleId:'role-cashier'} as any,posTerminalId:'ad-terminal',orderType:'TAKEAWAY',selectedTable:null,runningOrderId:null});usePosStore.getState().clearCart();
    (window as any).__demoAdd=(i:number)=>usePosStore.getState().addItemToCart(db.menuItems[i]);
    createRoot(document.getElementById('root')!).render(<main style={{height:'100vh',display:'flex',flexDirection:'column',padding:18,background:'#faf7f2'}}><header style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 6px 18px'}}><img src="/assets/branding/jamanvaar-logo.png" style={{width:130}}/><strong>River House Kitchen · Counter</strong><span>Local demo</span></header><PosBillingWorkspace/></main>);
  }else if(mode==='kiosk'){
    const [{KioskWelcomeScreen},{KioskProductCard},{welcomePresentation},{WelcomeScreenSettingsRepository}]=await Promise.all([import('@jamanvaar/ui'),import('../../../apps/kiosk-system/kiosk-user/src/KioskProductCard'),import('@jamanvaar/utils'),import('@jamanvaar/database'),import('../../../apps/kiosk-system/kiosk-user/src/index.css')]);
    const settings=welcomePresentation(WelcomeScreenSettingsRepository.getSettings(),'ad-preview');
    function Preview(){const[step,setStep]=React.useState(0);return step===0?<KioskWelcomeScreen settings={settings} backgroundUrl="/welcome-bg.png" restaurantName="River House Kitchen" logoUrl="/assets/branding/jamanvaar-logo.png" heading="Welcome to" subtitle="Fresh flavours. Your favourites." buttonText="Start your order" onStart={()=>setStep(1)}/>:<main style={{padding:28,background:'#faf7f2',minHeight:'100vh'}}><header style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:25}}><img src="/assets/branding/jamanvaar-logo.png" style={{width:140}}/><strong>Our favourites</strong></header><div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:20}}>{items.slice(0,4).map(item=><KioskProductCard key={item.id} item={item as any} onAdd={()=>{}}/>)}</div><p style={{padding:20,fontSize:18}}>Local preview · Customer kiosk components</p></main>;}
    createRoot(document.getElementById('root')!).render(<Preview/>);
  }else{
    const[{KdsTicketCard}]=await Promise.all([import('../../../apps/restaurant-system/kds/src/KdsTicketCard'),import('../../../apps/restaurant-system/kds/src/index.css')]);
    const noop=()=>{};const tickets=[0,1,2].map((n)=>({id:'demo-kot-'+n,orderId:'demo-order-'+n,tokenNumber:41+n,tableNumber:n?'':4,station:'Main kitchen',status:n===1?'PREPARING':'PENDING',createdAt:new Date().toISOString(),items:items.slice(n,n+2).map((item,i)=>({id:'line-'+n+'-'+i,menuItemId:item.id,name:item.name,quantity:i+1,modifiers:[],status:n===1?'PREPARING':'PENDING',course:'COURSE_1'}))}));
    createRoot(document.getElementById('root')!).render(<main style={{minHeight:'100vh',background:'#f7f4ed',padding:28}}><header style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:32}}><img src="/assets/branding/jamanvaar-logo.png" style={{width:145}}/><div><h1 style={{fontSize:32,fontWeight:800}}>Kitchen Display</h1><p>River House Kitchen · Local ticket preview</p></div></header><div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:22}}>{tickets.map((kot,i)=><KdsTicketCard key={kot.id} kot={kot as any} age={{mins:i+1,secs:0,timeStr:`0${i+1}:00`,level:'ok',prep:15}} progress={{ready:0,total:2,tickets:1}} orderTypeLabel={i?'Takeaway':'Dine In'} takenBy="Demo cashier" onToggleDish={noop} onStart={noop} onAllReady={noop} onServe={noop} captainHandlesService={true} onRecall={noop} onDismiss={noop} priority="NORMAL" onPriority={noop} onReprint={noop}/>)}</div></main>);
  }
}
main().catch(error=>{document.body.textContent=String(error);console.error(error);});
