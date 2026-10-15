// Isolated component/style probes. No AuthProvider, protected page, or API data is supplied.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Card, ErrorState, Modal } from '/src/components/ui';
import { FeatureFormModal } from '/src/pages/FeatureCatalog/FeatureFormModal';
import '/src/styles.css';
import '/src/components/shared.css';
import '/src/pages/Settings/settings.css';
import '/src/pages/Onboarding/onboarding.css';
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') || 'light';
const close = () => { document.body.dataset.closed = 'true'; };
const mode = query.get('mode');
createRoot(document.getElementById('root')!).render(mode === 'feature' ?
  <FeatureFormModal categories={[{id:'probe',name:'Probe',sortOrder:0} as any]} allFeatures={[{id:'dependency',name:'Dependency'} as any]} onClose={close} onSaved={() => {}} /> :
  mode === 'onboarding' ? <Card className="onboard-card"><h2 className="form-section-title">Onboarding theme probe</h2><div className="plan-select-card selected"><span className="plan-card-title">Plan theme probe</span></div></Card> :
  mode === 'modal' ? <Modal title="Modal component verification" onClose={close} footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button>Save</Button></>}>
    {Array.from({length:30},(_,i)=><p key={i}>Scrollable component content {i+1}</p>)}
  </Modal> : <main style={{padding:20}}>
    <div className="font-sans" data-font-probe>Typography probe</div>
    <div className="settings-grid"><Card className="settings-card">Settings grid sizing probe</Card></div>
    <div className="onboard-step-pill active">Active step</div>
    <ErrorState message="Error component theme probe" onRetry={()=>{}} />
  </main>);
