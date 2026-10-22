import { useEffect, useRef, useState } from 'react';
import { requestQrLeave } from './useQrUnsavedChanges';
import { QrOrderingRules, QrAnalyticsView } from './QrAdvanced';
import { QrPaymentWizard, QrReconciliation } from './QrWorkflows';
const sections = [['setup','Payment setup'],['test','Test checkout'],['collections','Collections'],['reports','Payment reports']] as const;
export type PaymentSection = typeof sections[number][0];
export function QrPaymentsWorkspace({ initial = 'setup', showToast }: { initial?: PaymentSection; showToast: (text: string) => void }) {
  const [section, setSection] = useState<PaymentSection>(() => sections.some(([key]) => key === new URLSearchParams(location.search).get('paymentSection')) ? new URLSearchParams(location.search).get('paymentSection') as PaymentSection : initial);
  const previous = useRef(initial);
  useEffect(() => { if(previous.current !== initial){previous.current=initial;setSection(initial);} }, [initial]);
  const select = async (next: PaymentSection) => {
    if (section === next || !(await requestQrLeave())) return;
    setSection(next);
    const url = new URL(location.href); url.searchParams.set('paymentSection', next); history.replaceState(null, '', url);
  };
  return <div className="qr-payments-workspace"><nav className="qr-task-tabs" aria-label="Payment workspace sections">{sections.map(([key,label]) => <button key={key} type="button" aria-current={section === key ? 'page' : undefined} onClick={() => void select(key)}>{label}</button>)}</nav>
    {section === 'setup' && <QrOrderingRules showToast={showToast} payments />}
    {section === 'test' && <QrPaymentWizard />}
    {section === 'collections' && <QrReconciliation />}
    {section === 'reports' && <QrAnalyticsView paymentsOnly />}
  </div>;
}
