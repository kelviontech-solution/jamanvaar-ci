// Real components with isolated transports. No production restaurant is changed.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_RESTAURANT_PAGE } from '../../../packages/ui/src/restaurant-page/types';
import { menuDishImage } from '../../../packages/utils/src/dish_photos';
const query=new URLSearchParams(location.search),mode=query.get('mode')||'admin';
if(query.has('branchScope')||!localStorage.getItem('jamanvaar_admin_branch:unbound'))localStorage.setItem('jamanvaar_admin_branch:unbound',query.get('branchScope')||'branch-a');
const photo=(name:string)=>location.origin+menuDishImage('',name);
const categories=[{id:'pizza',name:'Pizza',sortOrder:1},{id:'snacks',name:'Small plates',sortOrder:2},{id:'sweets',name:'Desserts',sortOrder:3}];
const items=['Margherita Pizza','Paneer Tikka','Gulab Jamun'].map((name,i)=>({id:'dish-'+i,name,categoryId:categories[i].id,description:'Freshly made in our kitchen.',price:149+i*50,imageUrl:photo(name),modifierGroupIds:[],isAvailable:true,dietaryType:'VEG'}));
const content={...DEFAULT_RESTAURANT_PAGE,enabled:false,entryMode:'PAGE',title:'Good food.\nGreat company.',tagline:'River House Kitchen',welcome:'Fresh Indian flavours, warm welcomes and meals worth sharing.',about:'Come together over slow-cooked favourites and fresh seasonal dishes. Our family kitchen has a place for everyone.',address:'River Road, Ahmedabad',phone:'+919876543210',instagram:'https://instagram.com/riverhouse',reviewUrl:'https://g.page/r/riverhouse/review',mapsUrl:'https://maps.google.com/?q=Ahmedabad',heroUrl:photo('Paneer Tikka'),gallery:items.map(i=>({url:i.imageUrl,caption:i.name})),businessHours:{timezone:'Asia/Kolkata',weekly:Array.from({length:7},(_,day)=>({day,intervals:[{start:'10:00',end:'22:00'}]})),exceptions:[]}};
const branches=[{id:'branch-a',name:'Main Dining',address:content.address,status:'ACTIVE'}];
content.logoUrl=location.origin+'/assets/branding/jamanvaar-logo.png';
const page={scope:'branch-a',canEditGlobal:true,version:1,draft:content,published:null,publishedAt:null,inherited:false,capability:{enabled:true,reason:'OK'},restaurantName:'River House Kitchen',branchName:'Main Dining',currency:'INR',defaultAddress:content.address,branches,affectedBranches:[],items,categories,menuReady:true,loyaltyEnabled:true,shareUrl:null,sharePath:null,orderOnlineUrl:location.origin+'/q/fixture-table-token',history:[]};
const codes=['QR_RESTAURANT_PAGE','QR_LOYALTY','QR_BRANDING','QR_PROMOTIONS','QR_FEEDBACK','QR_MULTILINGUAL','QR_SERVICE_REQUESTS','QR_MENU_ANALYTICS','QR_RESERVATIONS','QR_SCHEDULED_PICKUP','QR_NOTIFICATIONS','QR_GROUP_ORDERING','QR_INVENTORY_SYNC','QR_ORDER_HISTORY','QR_MULTI_BRANCH','QR_KITCHEN_CAPACITY'];
(window as any).__experience={page,branches,items,categories,capabilities:codes.map(code=>({code,enabled:true,reason:'OK'})),settings:{loyaltyEnabled:true,feedbackEnabled:true,promotionsEnabled:true,languages:['en','hi','gu'],defaultLanguage:'en',translations:{},notificationTypes:[],maxGuests:8,sessionMinutes:60,groupEnabled:false},saves:0,publishes:0,writes:[],unexpected:[],verified:false,profile:null,points:200};
async function main(){
 if(mode==='guest'||mode==='order'){
  history.replaceState(null,'',mode==='order'?'/q/fixture-table-token#menu':'/q/site/riverhouse-fixture?template='+(query.get('template')||'HERITAGE'));
  (window as any).__experience.page.draft.template=query.get('template')||'HERITAGE';
  const [{default:App}]=await Promise.all([import('../../../apps/qr-guest/src/App'),import('../../../apps/qr-guest/src/styles.css')]);
  createRoot(document.getElementById('root')!).render(<App/>);
 }else if(mode==='plan'){
  const [{QrPlanCapabilities}]=await Promise.all([import('../../../cloud/super-admin-web/src/pages/Plans/QrPlanCapabilities'),import('../../../cloud/super-admin-web/src/styles.css'),import('../../../cloud/super-admin-web/src/components/shared.css'),import('../../../cloud/super-admin-web/src/pages/Plans/plans.css')]);
  const features=codes.map((code,i)=>({id:code,code,name:code.replace('QR_','').replaceAll('_',' ').toLowerCase(),legacyEntitlementKey:'feature'+i,isActive:true,rolloutPercent:100}));
  function Plan(){const[flags,setFlags]=React.useState<Record<string,boolean>>({});return <main style={{padding:24,maxWidth:1100,margin:'auto'}}><h1>QR plan features</h1><QrPlanCapabilities features={features as any} flags={flags} loading={false} error="" onChange={next=>{setFlags(next);(window as any).__experience.planFlags=next;}}/></main>;}
  createRoot(document.getElementById('root')!).render(<Plan/>);
 }else if(mode==='owner-dashboard'){
  const [{default:Workspace}]=await Promise.all([import('../../../apps/restaurant-system/pos-admin/src/qr/QrWorkspace'),import('../../../apps/restaurant-system/pos-admin/src/index.css'),import('../../../apps/restaurant-system/pos-admin/src/qr/workspace.css')]);
  createRoot(document.getElementById('root')!).render(<div className="qr-admin-app"><Workspace page="ADMIN" toast={()=>{}}/></div>);
 }else{
  const[{QrConsole}]=await Promise.all([import('../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole'),import('../../../apps/restaurant-system/pos-admin/src/index.css'),import('../../../apps/restaurant-system/pos-admin/src/qr/workspace.css')]);
  createRoot(document.getElementById('root')!).render(<main className="qr-admin-app"><header className="qr-admin-header" style={{padding:20,minHeight:80}}><strong>QR Admin · River House Kitchen</strong><span>Main Dining</span></header><QrConsole layout="workspace" onViewPlan={()=>{}} showToast={message=>{(window as any).__toast=message;}}/></main>);
 }
}void main();
