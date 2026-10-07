import React from 'react';
import type { KOTItem, KOTRecord } from '@jamanvaar/types';
import { Flame, Bell, CheckCheck, Check, Clock, AlertTriangle, AlertCircle, RotateCcw, X, Undo2, Printer } from 'lucide-react';
import { COURSE_LABEL, dishAllergy, effectiveItemStatus, allergyText, type TicketAge } from './kdsLogic';

interface Props {
  kot: KOTRecord;
  age: TicketAge;
  /** How many of this order's dishes are ready across every station's ticket. */
  progress: { ready: number; total: number; tickets: number };
  orderTypeLabel: string;
  takenBy: string | null;
  onToggleDish: (kot: KOTRecord, item: KOTItem) => void;
  onStart: (kot: KOTRecord) => void;
  onAllReady: (kot: KOTRecord) => void;
  onServe: (kot: KOTRecord) => void;
  onRecall: (kot: KOTRecord) => void;
  onDismiss: (kot: KOTRecord) => void;
  priority: 'NORMAL' | 'URGENT';
  onPriority: (kot: KOTRecord, priority: 'NORMAL' | 'URGENT') => void;
  onReprint: (kot: KOTRecord) => void;
}

const BTN = 'w-full min-w-0 min-h-[48px] rounded-xl font-extrabold text-xs sm:text-sm uppercase tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer';

export const KdsTicketCard: React.FC<Props> = ({ kot, age, progress, orderTypeLabel, takenBy, onToggleDish, onStart, onAllReady, onServe, onRecall, onDismiss, priority, onPriority, onReprint }) => {
  const cancelled = kot.status === 'CANCELLED';
  const isReady = kot.status === 'READY';
  const isServed = kot.status === 'SERVED';
  const isPending = kot.status === 'PENDING' || kot.status === 'ACCEPTED';
  const isPreparing = !cancelled && !isReady && !isServed && !isPending;
  const hasCancelledDish = !cancelled && kot.items.some((i) => i.status === 'CANCELLED');
  const ticketAllergy = allergyText(kot.orderNotes) || kot.items.some((i) => i.status !== 'CANCELLED' && dishAllergy(i));
  const showCourses = new Set(kot.items.map((i) => i.course).filter(Boolean)).size > 1;

  const ring = cancelled
    ? 'border-rose-500 ring-2 ring-rose-500/30'
    : isReady
    ? 'border-emerald-500 ring-2 ring-emerald-500/20'
    : age.level === 'late'
    ? 'border-rose-400'
    : age.level === 'warn'
    ? 'border-amber-500'
    : isServed
    ? 'border-slate-200 opacity-75'
    : 'border-jaman-border';
  const bar = cancelled ? 'bg-rose-600' : isReady ? 'bg-emerald-500' : isServed ? 'bg-slate-300' : age.level === 'late' ? 'bg-rose-500' : isPreparing ? 'bg-amber-500' : 'bg-blue-400';

  return (
    <article
      data-testid="kds-ticket"
      data-status={kot.status}
      aria-label={`Token ${kot.tokenNumber}, ${kot.station}, ${kot.status.toLowerCase()}`}
      className={`bg-white rounded-3xl border-2 shadow-xs flex flex-col justify-between overflow-hidden relative select-none min-w-0 kds-ticket ${ring}`}
    >
      <div className={`h-2 w-full ${bar}`} />

      <div className="kds-ticket-body p-3 sm:p-4 space-y-3 min-w-0">
        {cancelled && (
          <div className="rounded-2xl bg-rose-600 text-white px-3 py-2 text-xs sm:text-sm font-black flex items-center gap-2 animate-pulse" role="alert">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>CANCELLED: stop cooking this ticket</span>
          </div>
        )}
        {hasCancelledDish && (
          <div className="rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 px-3 py-1.5 text-[11px] sm:text-xs font-black flex items-center gap-2" role="alert">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>A dish on this ticket was cancelled: do not cook it.</span>
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-jaman-border pb-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="kds-token font-black font-mono break-words text-jaman-navy leading-none">#{kot.tokenNumber}</span>
              <span className="text-[10px] break-all font-black bg-jaman-saffron text-white px-2 py-0.5 rounded-md font-mono">{kot.kotNumber}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold mt-1 flex-wrap">
              <span>{kot.tableNumber ? `Table ${kot.tableNumber}` : 'No table'}</span>
              <span>•</span>
              <span className="uppercase text-[11px] bg-slate-100 px-1.5 py-0.5 rounded font-black text-slate-700">{orderTypeLabel}</span>
              <span>•</span>
              <span className="text-slate-500">{kot.station}</span>
            </div>
          </div>


        </div>

        <div className="flex items-center justify-between gap-2">
          <select aria-label={`Priority for token ${kot.tokenNumber}`} value={priority} disabled={cancelled || isServed}
            onChange={e => onPriority(kot, e.target.value as 'NORMAL' | 'URGENT')}
            className={`min-h-[40px] min-w-0 rounded-xl border px-2 text-xs font-bold ${priority === 'URGENT' ? 'bg-rose-50 text-rose-800 border-rose-300' : 'bg-jaman-cream text-jaman-navy border-jaman-border'}`}>
            <option value="NORMAL">Normal priority</option><option value="URGENT">Urgent · cook first</option>
          </select>
          {!isServed && !cancelled && (
            <span
              className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black font-mono border ${
                age.level === 'late'
                  ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
                  : age.level === 'warn'
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-jaman-cream text-slate-600 border-jaman-border'
              }`}
              title={`Usually about ${age.prep} minutes`}
            >
              {age.level === 'late' ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3 text-slate-400" />}
              {age.level === 'late' ? `Late ${age.mins}m` : age.timeStr}
            </span>
          )}
          <button type="button" onClick={() => onReprint(kot)} aria-label={`Reprint KOT ${kot.kotNumber}`} title="Reprint this ticket without creating another order"
            className="min-h-[40px] min-w-[40px] rounded-xl border border-jaman-border flex items-center justify-center text-jaman-navy bg-white hover:bg-jaman-cream"><Printer className="w-4 h-4" /></button>
        </div>
        {progress.tickets > 0 && progress.total > 0 && !cancelled && (progress.tickets > 1 || progress.ready > 0) && (
          <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
            <span className="inline-block h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
              <span className="block h-full bg-emerald-500" style={{ width: `${Math.round((progress.ready / progress.total) * 100)}%` }} />
            </span>
            <span className="font-mono">{progress.ready}/{progress.total} of the order ready</span>
          </div>
        )}

        {kot.orderNotes && (
          <div className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-start gap-1.5 border ${allergyText(kot.orderNotes) ? 'bg-rose-100 text-rose-900 border-rose-400' : 'bg-amber-100/80 text-amber-900 border-amber-300/60'}`}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{kot.orderNotes}</span>
          </div>
        )}

        <ul className="kds-dishes space-y-2" tabIndex={0} aria-label={`Dishes for token ${kot.tokenNumber}`}>
          {kot.items.map((it, idx) => {
            const status = cancelled ? 'CANCELLED' : effectiveItemStatus(kot, it);
            const done = status === 'READY';
            const served = status === 'SERVED';
            const gone = status === 'CANCELLED';
            const tappable = !cancelled && !gone && !served && !isPending;
            const allergy = gone ? null : dishAllergy(it);
            return (
              <li key={it.id ?? idx}>
                <button
                  type="button"
                  disabled={!tappable}
                  onClick={() => onToggleDish(kot, it)}
                  aria-pressed={done}
                  aria-label={`${it.quantity} ${it.name}: ${gone ? 'cancelled' : served ? 'served' : done ? 'ready, tap to undo' : 'cooking, tap when ready'}`}
                  className={`w-full text-left p-2.5 sm:p-3 rounded-2xl border flex items-start gap-2.5 min-h-[52px] transition-colors ${
                    gone
                      ? 'bg-rose-50 border-rose-300'
                      : allergy
                      ? 'bg-rose-50 border-rose-400'
                      : done
                      ? 'bg-emerald-50 border-emerald-300'
                      : 'bg-jaman-cream border-jaman-border'
                  } ${tappable ? 'cursor-pointer active:scale-[0.99] hover:brightness-95' : 'cursor-default'}`}
                >
                  <span
                    className={`mt-0.5 w-7 h-7 shrink-0 rounded-full border-2 flex items-center justify-center ${
                      gone ? 'border-rose-500 bg-rose-500 text-white' : served ? 'border-slate-300 bg-slate-300 text-white' : done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-amber-500 text-amber-600 bg-white'
                    }`}
                    aria-hidden="true"
                  >
                    {gone ? <X className="w-4 h-4" /> : served || done ? <Check className="w-4 h-4" /> : <Flame className="w-3.5 h-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="shrink-0 font-mono font-black text-lg text-jaman-saffron leading-none">{it.quantity}×</span>
                      <span className={`min-w-0 flex-1 kds-dish-name font-extrabold text-jaman-navy leading-snug break-words ${gone ? 'line-through text-rose-700' : ''}`}>{it.name}</span>
                      {showCourses && it.course && !gone && (
                        <span className="text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">{COURSE_LABEL[it.course] ?? it.course}</span>
                      )}
                    </span>
                    {gone && <span className="block text-xs font-black text-rose-700 mt-0.5">CANCELLED{it.cancelReason ? `: ${it.cancelReason}` : ''}</span>}
                    {!gone && it.modifiers && it.modifiers.length > 0 && (
                      <span className="block text-sm font-bold text-slate-800 pt-0.5">
                        {it.modifiers.map((m, i) => (
                          <span key={i} className="block break-words">• {m.optionName}</span>
                        ))}
                      </span>
                    )}
                    {!gone && it.specialInstructions && (
                      <span className={`mt-1 px-2 py-0.5 rounded-lg text-xs font-bold inline-flex items-start gap-1 border max-w-full ${allergy ? 'bg-rose-200 text-rose-900 border-rose-500' : 'bg-amber-100/80 text-amber-900 border-amber-300/60'}`}>
                        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span className="break-words min-w-0">{allergy ? 'ALLERGY / DIET: ' : ''}{it.specialInstructions}</span>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {ticketAllergy && !cancelled && (
          <p className="text-[11px] font-black text-rose-700 uppercase tracking-wide flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Allergy or diet request on this ticket</p>
        )}
      </div>

      <div className="kds-ticket-footer p-3 sm:p-4 bg-jaman-cream border-t border-jaman-border space-y-2.5">
        <div className="flex items-center justify-between text-xs text-slate-600 font-bold gap-2">
          <span className="truncate">{takenBy ?? ''}</span>
          <span className="font-mono text-slate-400 shrink-0">#{kot.id.slice(-5)}</span>
        </div>

        {cancelled && (
          <button type="button" onClick={() => onDismiss(kot)} className={`${BTN} bg-rose-600 hover:bg-rose-700 text-white shadow-md`}>
            <Check className="w-4 h-4" /> Got it: dismiss
          </button>
        )}

        {isPending && (
          <button type="button" onClick={() => onStart(kot)} className={`${BTN} bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/25`}>
            <Flame className="w-4 h-4" /> Start cooking
          </button>
        )}

        {isPreparing && (
          <button type="button" onClick={() => onAllReady(kot)} className={`${BTN} bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-md shadow-emerald-600/25`}>
            <Bell className="w-4 h-4" /> All dishes ready
          </button>
        )}

        {isReady && (
          <div className="flex gap-2">
            <button type="button" onClick={() => onRecall(kot)} className={`${BTN} !w-auto shrink-0 whitespace-nowrap px-4 bg-white text-slate-700 border border-jaman-border hover:bg-slate-50`} title="Marked ready by mistake? Put it back to cooking">
              <Undo2 className="w-4 h-4" /> Undo
            </button>
            <button type="button" onClick={() => onServe(kot)} className={`${BTN} bg-gradient-to-r from-jaman-navy to-jaman-darkBorder text-white shadow-md shadow-slate-900/20`}>
              <CheckCheck className="w-4 h-4 text-emerald-400" /> Served
            </button>
          </div>
        )}

        {isServed && (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-h-[44px] rounded-2xl bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-600" /> Served
            </div>
            <button type="button" onClick={() => onRecall(kot)} className={`${BTN} !w-auto shrink-0 whitespace-nowrap px-4 bg-white text-slate-700 border border-jaman-border hover:bg-slate-50`} title="Served by mistake? Bring the ticket back">
              <RotateCcw className="w-4 h-4" /> Recall
            </button>
          </div>
        )}
      </div>
    </article>
  );
};
