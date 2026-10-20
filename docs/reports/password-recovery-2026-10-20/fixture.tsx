import React from 'react';
import {createRoot} from 'react-dom/client';
import QrWorkspace from '../../../apps/restaurant-system/pos-admin/src/qr/QrWorkspace';
import {ForgotPasswordPanel} from '../../../apps/restaurant-system/pos-admin/src/components/auth/ForgotPasswordPanel';
import '../../../apps/restaurant-system/pos-admin/src/index.css';
import '../../../apps/restaurant-system/pos-admin/src/qr/product.css';
(window as any).__recovery={calls:[],sendCount:0,code:'123456'};
const panel = new URLSearchParams(location.search).has('panel');
createRoot(document.getElementById('root')!).render(panel ? <div style={{maxWidth:450,margin:'30px auto',padding:20,background:'white'}}><ForgotPasswordPanel onDone={()=>{}} onBack={()=>{}} onActivate={()=>{}}/></div> : <QrWorkspace page="RECOVER" toast={()=>{}}/>);
