import React from 'react';
import { db } from '@jamanvaar/database';

export function RefundRegisterSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-bold text-jaman-navy">Register recording the return
    <select className="mt-1 w-full rounded-xl border p-2.5" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Original open register</option>
      {db.shifts.filter(shift => shift.status === 'OPEN').map(shift => <option key={shift.id} value={shift.id}>{shift.posId} · {shift.cashierName}</option>)}
    </select>
    <span className="mt-1 block font-normal text-slate-500">For an older or closed till, choose the register paying today. Its cash-out is recorded separately; the previous cash count stays intact.</span>
  </label>;
}
