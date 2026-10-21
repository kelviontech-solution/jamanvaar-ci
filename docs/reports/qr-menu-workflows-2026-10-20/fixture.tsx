import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QrCatalog} from '../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrCatalog';
import {QrMenuPerformance} from '../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrOperations';
import {PlanFormModal} from '../../../cloud/super-admin-web/src/pages/Plans/PlanFormModal';
import '../../../apps/restaurant-system/pos-admin/src/index.css';
import '../../../apps/restaurant-system/pos-admin/src/qr/workspace.css';
const features=[['QR_ORDERING','QR Ordering','qrTableOrdering'],['QR_MENU_ANALYTICS','Menu Performance','qrMenuAnalytics'],['QR_RESTAURANT_PAGE','Restaurant page','qrRestaurantPage'],['QR_LOYALTY','Loyalty','qrLoyalty']].map(([code,name,legacyEntitlementKey],index)=>({id:String(index),code,name,legacyEntitlementKey,isActive:true,rolloutPercent:100}));
(window as any).__menuFixture={entities:{MENU_ITEM:[],MENU_CATEGORY:[],MODIFIER_GROUP:[],TAX_GROUP:[]},writes:[],requests:[],published:0,failOnce:false,analyticsAllowed:false,networkFailure:false,features,savedPlan:null};
const plan={id:'fixture-plan',tier:'QR',productFamily:'RESTAURANT',name:'QR plan fixture',description:'Synthetic plan',priceMonthly:10000,priceYearly:null,maxBranches:1,maxDevices:3,maxUsers:5,entitlements:{qrTableOrdering:true,menuManagement:true,tableManagement:true,foodCustomization:true}};
const mode=new URLSearchParams(location.search).get('view');
function PlanFixture(){const[saved,setSaved]=useState(false);return saved?<p role="status">Plan saved</p>:<PlanFormModal plan={plan as any} onClose={()=>{}} onSaved={()=>setSaved(true)}/>;}
async function main(){if(mode==='plan')await import('../../../cloud/super-admin-web/src/styles.css');createRoot(document.getElementById('root')!).render(<BrowserRouter>{mode==='plan'?<PlanFixture/>:<main className="qr-admin-app" style={{padding:20,minHeight:'100vh',maxWidth:1300,margin:'auto'}}><h1 style={{fontSize:26,fontWeight:750,marginBottom:20}}>QR Admin · {mode==='performance'?'Menu Performance':'Menu & Availability'}</h1>{mode==='performance'?<QrMenuPerformance/>:<QrCatalog/>}</main>}</BrowserRouter>);}
void main();
