import { useState } from 'react';
import { useStaffLanguage } from './StaffLanguage';
import {FullTrainingSandbox} from './FullTrainingSandbox';

/** Deliberately owns no repository, network, printing or payment capability. */
export function StaffPracticePanel() {
  const {t} = useStaffLanguage();
  const [open, setOpen] = useState(false); const [stage, setStage] = useState(0);
  const [count, setCount] = useState(0); const [tender, setTender] = useState('Cash');
  const titles = ['Choose a practice dish', 'Review the practice order', 'Prepare the practice order', 'Serve the practice order', 'Collect the practice payment', 'Practice completed'];
  const actions = ['Add practice dish', 'Send practice KOT', 'Mark practice ready', 'Mark practice served', 'Confirm practice collection'];
  const reset = () => {setStage(0); setCount(0); setTender('Cash');};
  return <section className="rounded-2xl border border-amber-200 bg-amber-50 text-jaman-navy p-3">
    <button type="button" aria-label={t('Staff practice')} aria-expanded={open} className="min-h-11 w-full text-left font-bold" onClick={() => {setOpen(!open); reset();}}>{t('Staff practice')} {open ? '−' : '+'}</button>
    {open && <div className="space-y-3">
      <p className="text-sm">{t('Practice only: no real order, payment, stock change or printing.')}</p>
      <FullTrainingSandbox/>
      <ol className="flex flex-wrap gap-2 text-xs" aria-label={t('Practice progress')}>{['Menu', 'Orders', 'Cooking', 'Served', 'Collect', 'Done'].map((label, index) => <li key={label} aria-current={stage === index ? 'step' : undefined} className={`rounded-full px-2 py-1 ${stage === index ? 'bg-jaman-navy text-white' : 'bg-white'}`}>{index + 1}. {t(label)}</li>)}</ol>
      <h3 className="font-bold">{t(titles[stage])}</h3>
      {stage < 5 && <p>{t('Practice dish')} · ₹100 × {count || 1}</p>}
      {stage === 0 && <div className="flex gap-2"><button type="button" className="min-h-11 border rounded-xl px-4 bg-white" onClick={() => setCount(count + 1)}>{t(actions[0])}</button><button type="button" disabled={!count} onClick={() => setStage(1)} className="min-h-11 bg-jaman-navy text-white rounded-xl px-4 disabled:opacity-40">{t('Review order')}</button></div>}
      {stage === 4 && <label className="block text-sm">{t('Payment method')}<select className="min-h-11 ml-2 rounded-xl border p-2" value={tender} onChange={event => setTender(event.target.value)}>{['Cash', 'Cashier-confirmed UPI', 'Card'].map(method => <option key={method} value={method}>{t(method)}</option>)}</select></label>}
      {stage > 0 && stage < 5 && <button type="button" className="min-h-11 rounded-xl px-4 bg-jaman-saffron text-white font-bold" onClick={() => setStage(stage + 1)}>{t(actions[stage])}</button>}
      {stage === 5 && <p role="status">{t('Practice completed')} · ₹{count * 100} · {t(tender)}</p>}
      {stage > 0 && <button type="button" className="min-h-11 border bg-white rounded-xl px-4 ml-2" onClick={reset}>{t('Start again')}</button>}
    </div>}
  </section>;
}
