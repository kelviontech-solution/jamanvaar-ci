import React from 'react';
import { Bell, CheckCheck, Clock, Flame } from 'lucide-react';
import type { ExpoDish, ExpoOrder } from './kdsLogic';
import { COURSE_LABEL } from './kdsLogic';

interface Props {
  orders: ExpoOrder[];
  orderTypeLabel: (orderType: string) => string;
  onServeOrder: (order: ExpoOrder) => void;
  /** False when this restaurant has no Captain app: then the pass is the only one who can ever send a table order out. */
  captainHandlesService: boolean;
}

const AGE_STYLE: Record<ExpoOrder['age']['level'], string> = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warn: 'bg-amber-50 text-amber-900 border-amber-300',
  late: 'bg-rose-50 text-rose-800 border-rose-300'
};

const DISH_STYLE: Record<string, string> = {
  READY: 'bg-emerald-100 border-emerald-400 text-emerald-900',
  SERVED: 'bg-slate-100 border-slate-200 text-slate-400 line-through',
  PREPARING: 'bg-amber-50 border-amber-300 text-amber-900',
  PENDING: 'bg-amber-50 border-amber-300 text-amber-900'
};

const Dish: React.FC<{ dish: ExpoDish }> = ({ dish }) => (
  <li className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${DISH_STYLE[dish.status] ?? DISH_STYLE.PENDING}`}>
    <span className="min-w-0 break-words">
      <span className="font-mono mr-1.5">{dish.quantity}×</span>
      {dish.name}
      {dish.course && COURSE_LABEL[dish.course] && <span className="ml-2 text-[10px] font-black uppercase opacity-70">{COURSE_LABEL[dish.course]}</span>}
    </span>
    <span className="shrink-0 text-[10px] font-black uppercase tracking-wide opacity-80">{dish.status === 'READY' ? 'Ready' : dish.status === 'SERVED' ? 'Out' : dish.station}</span>
  </li>
);

/** The pass: every order that still has food to bring together, one card per table, with what each station still owes. */
export const KdsExpoBoard: React.FC<Props> = ({ orders, orderTypeLabel, onServeOrder, captainHandlesService }) => {
  if (orders.length === 0) {
    return (
      <div className="col-span-full text-center py-16" data-testid="kds-expo-empty">
        <CheckCheck className="w-10 h-10 mx-auto text-emerald-500 mb-3" />
        <p className="text-lg font-black text-jaman-navy">Nothing waiting at the pass</p>
        <p className="text-sm text-slate-500 mt-1">Orders appear here as soon as any station starts on them, and leave when everything is served.</p>
      </div>
    );
  }
  return (
    <>
      {orders.map((o) => {
        const pct = o.total === 0 ? 0 : Math.round(((o.ready + o.served) / o.total) * 100);
        return (
          <section key={o.orderId} data-testid="kds-expo-order" aria-label={`Order ${o.tokenNumber}`} className={`rounded-3xl border-2 bg-white p-4 shadow-sm space-y-3 ${o.allReady ? 'border-emerald-500 ring-4 ring-emerald-100' : 'border-jaman-border'}`}>
            <header className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xl font-black text-jaman-navy truncate">{o.tableNumber ? `Table ${o.tableNumber}` : `Token ${o.tokenNumber}`}</h3>
                <p className="text-xs font-bold text-slate-500">#{o.orderNumber} · {orderTypeLabel(o.orderType)}</p>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-mono font-black ${AGE_STYLE[o.age.level]}`}>
                <Clock className="w-3.5 h-3.5" />{o.age.timeStr}
              </span>
            </header>

            <div>
              <div className="flex justify-between text-[11px] font-black uppercase text-slate-500 mb-1"><span>{o.ready + o.served} of {o.total} ready</span><span>{pct}%</span></div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${o.allReady ? 'bg-emerald-500' : 'bg-jaman-saffron'}`} style={{ width: `${pct}%` }} /></div>
            </div>

            <ul className="space-y-1.5">{o.dishes.map((d) => <Dish key={`${d.kotId}-${d.itemId}`} dish={d} />)}</ul>

            {o.waitingOn.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <Flame className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Waiting on {o.waitingOn.map((w) => `${w.station} (${w.dishes.join(', ')})`).join('; ')}</span>
              </p>
            )}

            {o.tableNumber && captainHandlesService ? (
              <div
                className={`w-full min-h-[48px] rounded-2xl text-sm font-black flex items-center justify-center gap-2 ${o.allReady ? 'bg-amber-50 border border-amber-300 text-amber-800' : 'bg-slate-100 text-slate-400'}`}
                title="Only the captain who delivers this order to the table marks it served"
              >
                {o.allReady ? <><Bell className="w-4 h-4" /> All ready: waiting for captain</> : 'Not everything is ready yet'}
              </div>
            ) : (
              <button
                type="button"
                disabled={!o.allReady}
                onClick={() => onServeOrder(o)}
                className={`w-full min-h-[48px] rounded-2xl text-sm font-black transition-all active:scale-95 ${o.allReady ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                {o.allReady ? 'All ready: send out' : 'Not everything is ready yet'}
              </button>
            )}
          </section>
        );
      })}
    </>
  );
};
