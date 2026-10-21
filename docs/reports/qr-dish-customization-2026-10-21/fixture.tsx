import React from 'react';
import { createRoot } from 'react-dom/client';

(window as any).__choicesFixture = {entities:{MENU_ITEM:[],MENU_CATEGORY:[],MODIFIER_GROUP:[],TAX_GROUP:[]},failOnce:false,writes:[],published:0,loading:false};
async function main() {
 if(new URLSearchParams(location.search).has('guest')) {
  history.replaceState(null,'','/q/dish-choice-fixture-token#menu');
  const [{default:App}] = await Promise.all([import('../../../apps/qr-guest/src/App'),import('../../../apps/qr-guest/src/styles.css')]);
  createRoot(document.getElementById('root')!).render(<App/>);
 } else {
  const [{QrCatalog}] = await Promise.all([import('../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrCatalog'),import('../../../apps/restaurant-system/pos-admin/src/index.css'),import('../../../apps/restaurant-system/pos-admin/src/qr/workspace.css')]);
  createRoot(document.getElementById('root')!).render(<main className="qr-admin-app" style={{padding:20,maxWidth:1240,margin:'auto'}}><h1 style={{fontSize:28,fontWeight:750,marginBottom:20}}>Menu & Availability</h1><QrCatalog/></main>);
 }
}
void main();
