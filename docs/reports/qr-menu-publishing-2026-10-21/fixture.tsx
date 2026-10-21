import React from 'react';
import {createRoot} from 'react-dom/client';
const categories=[{id:'pizza',name:'Pizzas',isActive:true},{id:'snacks',name:'Snacks',isActive:true}];
const items=[{id:'one',name:'Margherita Pizza',price:149,categoryId:'pizza',isAvailable:true,modifierGroupIds:[]},{id:'two',name:'Khaman',price:80,categoryId:'snacks',isAvailable:true,modifierGroupIds:[]}];
(window as any).__publicationFixture={entities:{MENU_CATEGORY:categories,MENU_ITEM:items,MODIFIER_GROUP:[],TAX_GROUP:[]},snapshot:structuredClone(items),version:1,revision:1,publishedRevision:1,publishes:0,fail:false,override:{},snapshotOverride:{}};
async function main(){
 if(new URLSearchParams(location.search).has('guest')){
  history.replaceState(null,'','/q/publication-fixture-token#menu');
  const [{default:App}]=await Promise.all([import('../../../apps/qr-guest/src/App'),import('../../../apps/qr-guest/src/styles.css')]);
  createRoot(document.getElementById('root')!).render(<App/>);
 }else{
  const [{QrMenuWorkspace}]=await Promise.all([import('../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrMenuWorkspace'),import('../../../apps/restaurant-system/pos-admin/src/index.css'),import('../../../apps/restaurant-system/pos-admin/src/qr/workspace.css')]);
  createRoot(document.getElementById('root')!).render(<main className="qr-admin-app"><header className="qr-admin-header" style={{padding:20}}>QR Admin · River House</header><div className="qr-console--workspace" style={{display:'block',padding:20,maxWidth:1300,margin:'auto'}}><h1 style={{fontSize:28,fontWeight:750,marginBottom:20}}>Menu & Availability</h1><QrMenuWorkspace/></div></main>);
 }
}void main();
