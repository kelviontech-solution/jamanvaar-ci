export type WebsiteStep = 'design' | 'preview' | 'publish' | 'qr' | 'test';
export function QrWebsiteJourney({ current, live, canPublish = true, onStep }: { current: WebsiteStep; live: boolean; canPublish?: boolean; onStep: (step: WebsiteStep) => void }) {
  return <nav className="qr-website-journey" aria-label="Restaurant website launch steps">{([['design','Design'],['preview','Preview'],['publish','Publish'],['qr','Download QR'],['test','Test scan']] as const).map(([step,label], index) => <button key={step} type="button" aria-current={step === current ? 'step' : undefined} disabled={((step === 'qr' || step === 'test') && !live) || (step === 'publish' && !canPublish)} onClick={() => onStep(step)}><span>{index + 1}</span>{label}</button>)}</nav>;
}
