import React, { useMemo, useState } from 'react';
import { X, Users } from 'lucide-react';
import { amountsByMethod, groupsBySeat, groupsEqually, splitBill, type GuestMethod, type SplitBillTotals, type SplitGroup, type SplitLine } from '@jamanvaar/business';
import { formatINR } from '@jamanvaar/utils';

/** Exact rupees and paise: a guest paying by UPI pays the exact amount, so a share is never rounded to whole rupees. */
const exact = (n: number): string => `₹${n.toFixed(2)}`;

export interface GuestSplitPlan {
  guests: Array<{ label: string; total: number; method: GuestMethod; dishes: string[] }>;
  amounts: Record<GuestMethod, number>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lines: SplitLine[];
  bill: SplitBillTotals;
  onApply: (plan: GuestSplitPlan) => void;
}

type Mode = 'SEAT' | 'EQUAL' | 'PICK';
const METHODS: Array<{ id: GuestMethod; label: string }> = [{ id: 'CASH', label: 'Cash' }, { id: 'UPI', label: 'UPI' }, { id: 'CARD', label: 'Card' }];
const MAX_GUESTS = 10;

/**
 * Splits one bill between guests: by the seat each dish was taken for, equally, or by picking who had what. Each guest's share
 * (with its part of the discount and tax) adds up to the bill exactly. Choose how each guest pays; the bill is then settled in
 * the ordinary payment screen with those amounts, so cash change and UPI / card confirmation work as they always do.
 */
export const PosSplitByGuestModal: React.FC<Props> = ({ isOpen, onClose, lines, bill, onApply }) => {
  const anySeat = lines.some((l) => l.seat !== undefined && l.amount > 0);
  const [mode, setMode] = useState<Mode>(anySeat ? 'SEAT' : 'EQUAL');
  const [guestCount, setGuestCount] = useState(2);
  const [picks, setPicks] = useState<Record<string, number[]>>({});
  const [methods, setMethods] = useState<GuestMethod[]>([]);

  const liveLines = useMemo(() => lines.filter((l) => l.amount > 0), [lines]);

  const groups: SplitGroup[] = useMemo(() => {
    if (mode === 'SEAT') return groupsBySeat(lines);
    if (mode === 'EQUAL') return groupsEqually(lines, guestCount);
    return Array.from({ length: guestCount }, (_, i) => ({ label: `Guest ${i + 1}`, lineIds: liveLines.filter((l) => picks[l.id]?.includes(i)).map((l) => l.id) }));
  }, [mode, lines, liveLines, guestCount, picks]);

  const result = useMemo(() => splitBill(lines, bill, groups), [lines, bill, groups]);
  const methodOf = (i: number): GuestMethod => methods[i] ?? 'CASH';
  const ready = !result.error && result.unassigned.length === 0 && result.shares.length > 0 && result.shares.every((s) => s.total > 0);

  if (!isOpen) return null;

  const toggle = (lineId: string, guest: number) =>
    setPicks((prev) => {
      const current = prev[lineId] ?? [];
      return { ...prev, [lineId]: current.includes(guest) ? current.filter((g) => g !== guest) : [...current, guest] };
    });

  const apply = () => {
    const nameOf = new Map(lines.map((l) => [l.id, `${l.quantity} x ${l.name}`]));
    onApply({
      guests: result.shares.map((s, i) => ({ label: s.label, total: s.total, method: methodOf(i), dishes: s.lineIds.map((id) => nameOf.get(id) ?? id) })),
      amounts: amountsByMethod(result.shares, result.shares.map((_, i) => methodOf(i)))
    });
  };

  const chip = (active: boolean) => `px-3 py-1.5 rounded-xl text-xs font-black border transition-colors cursor-pointer ${active ? 'bg-jaman-navy text-white border-jaman-navy' : 'bg-white text-slate-700 border-jaman-border hover:bg-slate-50'}`;

  return (
    <div className="fixed inset-0 z-[60] bg-black/65 flex items-center justify-center p-3 sm:p-4 font-sans" role="dialog" aria-label="Split the bill by guest">
      <div className="bg-white border border-jaman-border rounded-3xl max-w-3xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="bg-jaman-cream border-b border-jaman-border p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2"><Users className="w-5 h-5 text-jaman-saffron" /><h2 className="text-lg font-black text-jaman-navy">Split the bill by guest</h2></div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl hover:bg-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {anySeat && <button type="button" className={chip(mode === 'SEAT')} onClick={() => setMode('SEAT')}>By seat</button>}
            <button type="button" className={chip(mode === 'EQUAL')} onClick={() => setMode('EQUAL')}>Equally</button>
            <button type="button" className={chip(mode === 'PICK')} onClick={() => setMode('PICK')}>Pick dishes</button>
            {mode !== 'SEAT' && (
              <label className="ml-auto flex items-center gap-2 text-xs font-bold text-slate-600">
                Guests
                <input type="number" min={1} max={MAX_GUESTS} value={guestCount} onChange={(e) => setGuestCount(Math.min(MAX_GUESTS, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} className="w-16 bg-jaman-ivory border border-jaman-border rounded-xl px-2 py-1 text-right font-mono font-black" />
              </label>
            )}
          </div>

          {mode === 'PICK' && (
            <ul className="space-y-2" aria-label="Who had what">
              {liveLines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-jaman-border p-3">
                  <span className="text-sm font-bold text-jaman-navy">{l.quantity} x {l.name} <span className="font-mono text-slate-500">{formatINR(l.amount)}</span></span>
                  <span className="flex flex-wrap gap-1.5">
                    {Array.from({ length: guestCount }, (_, g) => (
                      <button key={g} type="button" aria-pressed={!!picks[l.id]?.includes(g)} onClick={() => toggle(l.id, g)} className={chip(!!picks[l.id]?.includes(g))}>G{g + 1}</button>
                    ))}
                  </span>
                </li>
              ))}
              <li className="text-[11px] text-slate-500">Tap two guests on one dish to share it equally.</li>
            </ul>
          )}

          {result.error && <p className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{result.error}</p>}
          {!result.error && result.unassigned.length > 0 && (
            <p className="text-sm font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              {result.unassigned.length} dish{result.unassigned.length === 1 ? ' has' : 'es have'} no guest yet: {result.unassigned.map((id) => liveLines.find((l) => l.id === id)?.name).filter(Boolean).join(', ')}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Each guest's share">
            {result.shares.map((s, i) => (
              <div key={`${s.label}-${i}`} className="rounded-2xl border-2 border-jaman-border bg-jaman-cream p-3 space-y-2">
                <div className="flex items-baseline justify-between"><span className="font-black text-jaman-navy">{s.label}</span><span className="font-mono text-xl font-black text-jaman-navy">{exact(s.total)}</span></div>
                <p className="text-[11px] text-slate-500 font-mono">Food {exact(s.subtotal)}{s.discount > 0 ? ` - discount ${exact(s.discount)}` : ''} + tax {exact(s.tax)}{s.charges > 0 ? ` + charges ${exact(s.charges)}` : ''}</p>
                <div className="flex gap-1.5" role="group" aria-label={`How ${s.label} pays`}>
                  {METHODS.map((m) => (
                    <button key={m.id} type="button" aria-pressed={methodOf(i) === m.id} onClick={() => setMethods((prev) => { const next = [...prev]; next[i] = m.id; return next; })} className={chip(methodOf(i) === m.id)}>{m.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-jaman-border p-4 flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-500">Bill total <strong className="font-mono text-jaman-navy">{exact(bill.totalAmount)}</strong></span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-jaman-border text-sm font-bold cursor-pointer">Cancel</button>
            <button type="button" disabled={!ready} onClick={apply} className={`px-5 py-2.5 rounded-xl text-sm font-black ${ready ? 'bg-jaman-saffron hover:bg-[#EA580C] text-white cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>Use these shares</button>
          </div>
        </div>
      </div>
    </div>
  );
};
