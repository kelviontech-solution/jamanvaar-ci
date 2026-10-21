import React from 'react';
import {createRoot} from 'react-dom/client';
import {QrOperationalOrders} from '../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrAdvanced';
import '../../../apps/restaurant-system/pos-admin/src/index.css';
import '../../../apps/restaurant-system/pos-admin/src/qr/workspace.css';
(window as any).__attentionFixture={items:[],requests:[],fail:false,reads:0,sounds:0,orderSearches:[],checkedAt:null};
localStorage.setItem('jamanvaar_cloud_restaurant_id','fixture-restaurant');
createRoot(document.getElementById('root')!).render(<main className="qr-admin-app"><header className="qr-admin-header" style={{height:80,display:'flex',alignItems:'center'}}><strong>QR Admin · River House</strong></header><div className="qr-console--workspace" style={{display:'block',padding:20,maxWidth:1200,margin:'auto'}}><h1 style={{fontSize:28,fontWeight:750,marginBottom:20}}>QR Orders</h1><QrOperationalOrders showToast={message=>console.log(message)}/></div></main>);
