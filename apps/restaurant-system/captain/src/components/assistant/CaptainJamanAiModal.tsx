import React, { useState, useSyncExternalStore } from 'react';
import { AiConfig } from '@jamanvaar/business';
import { reportAiQueryNow } from '../../cloud/cloudClient';
import { useCaptainStore } from '../../store/captainStore';
import {
  Sparkles,
  X,
  Send,
  Flame,
  Receipt,
  AlertTriangle,
  Users,
  CheckCircle2,
  Bot
} from 'lucide-react';

interface CaptainJamanAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTab: (tab: any) => void;
}

export const CaptainJamanAiModal: React.FC<CaptainJamanAiModalProps> = ({
  isOpen,
  onClose,
  onNavigateToTab
}) => {
  // What the platform allows this restaurant (BUG-057): OFF hides it, LOCKED shows why it does not answer.
  const aiState = useSyncExternalStore((cb) => AiConfig.subscribe(cb), () => AiConfig.getState(), () => AiConfig.getState());
  if (!isOpen || aiState === 'OFF') return null;
  if (aiState === 'LOCKED') {
    return (
      <div role="dialog" aria-modal="true" aria-label="JAMAN AI is not enabled" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <Sparkles className="mx-auto h-8 w-8 text-jaman-saffron" />
          <h2 className="text-base font-black text-jaman-navy">JAMAN AI isn&apos;t enabled for your restaurant</h2>
          <p className="text-xs text-slate-600">Ask your JAMANVAAR account manager to switch it on. It answers floor questions from your own live tables and kitchen tickets.</p>
          <button type="button" onClick={onClose} className="rounded-xl bg-jaman-navy px-4 py-2 text-xs font-bold text-white">Close</button>
        </div>
      </div>
    );
  }

  const {
    tables,
    foodReadyItems,
    kots,
    messages,
    customerRequests,
    shiftStats,
    currentCaptain
  } = useCaptainStore();

  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);

  const activeFoodReady = foodReadyItems.filter((fr) => !fr.isServed);
  // Threshold from the cloud settings (Super Admin), not a number typed into the code.
  const delayedMinutes = AiConfig.getSettings().delayedKotMinutes;
  const billRequestedTables = tables.filter((t) => t.status === 'BILL_REQUESTED');
  const delayedKots = kots.filter((k) => {
    if (k.status === 'SERVED' || k.status === 'CANCELLED') return false;
    const elapsedMinutes = (Date.now() - new Date(k.createdAt).getTime()) / 60000;
    return elapsedMinutes > delayedMinutes;
  });
  const pendingRequests = customerRequests.filter((cr) => !cr.isResolved);
  const occupiedTables = tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILL_REQUESTED');

  const runQuery = (q: string) => {
    if (!AiConfig.canQuery()) {
      setActiveQuery(q);
      setResponse("Today's JAMAN AI question limit has been reached. It resets tomorrow.");
      return;
    }
    const started = performance.now();
    setActiveQuery(q);
    queueMicrotask(() => void reportAiQueryNow(q, performance.now() - started));
    switch (q) {
      case 'ATTENTION':
        setResponse(
          `⚡ **Attention Summary for Floor Captain ${currentCaptain?.name || 'there'}**:\n\n` +
          `• **Food Ready:** ${activeFoodReady.length} dishes waiting across ${new Set(activeFoodReady.map((fr) => fr.tableNumber)).size} tables.\n` +
          `• **Bill Requests:** ${billRequestedTables.length} tables (${billRequestedTables.map((t) => `Table ${t.tableNumber}`).join(', ') || 'None'}).\n` +
          `• **Delayed KOTs:** ${delayedKots.length} tickets > ${delayedMinutes} mins in kitchen.\n` +
          `• **Guest Requests:** ${pendingRequests.length} pending service calls.`
        );
        break;
      case 'FOOD_READY':
        if (activeFoodReady.length > 0) {
          const itemsTxt = activeFoodReady
            .map((fr) => `• Table ${fr.tableNumber}: ${fr.dishName} ×${fr.quantity} (${fr.station || 'Kitchen'})`)
            .join('\n');
          setResponse(`🔥 **${activeFoodReady.length} Dishes Ready for Immediate Table Delivery:**\n\n${itemsTxt}`);
        } else {
          setResponse(`✓ **All clear!** There are currently 0 ready dishes waiting in the kitchen.`);
        }
        break;
      case 'DELAYED_KOTS':
        if (delayedKots.length > 0) {
          const kotsTxt = delayedKots
            .map((k) => `• KOT #${k.kotNumber?.slice(-3)} for Table ${k.tableNumber} (${Math.round((Date.now() - new Date(k.createdAt).getTime()) / 60000)} mins elapsed)`)
            .join('\n');
          setResponse(`🔴 **${delayedKots.length} Delayed KOTs exceeding ${delayedMinutes} minutes:**\n\n${kotsTxt}\n\nTap 'Live KOTs' to message the chef.`);
        } else {
          setResponse(`✓ **All kitchen stations running smoothly!** No KOT tickets exceed ${delayedMinutes} minutes preparation time.`);
        }
        break;
      case 'BILLS':
        if (billRequestedTables.length > 0) {
          const billsTxt = billRequestedTables
            .map((t) => `• Table ${t.tableNumber} (${t.currentGuests || 2} Guests) — Status: BILL REQUESTED`)
            .join('\n');
          setResponse(`💜 **${billRequestedTables.length} Tables Waiting for Bill Settlement:**\n\n${billsTxt}`);
        } else {
          setResponse(`✓ **No pending bill requests.** All occupied tables are currently dining.`);
        }
        break;
      case 'GUEST_REQUESTS':
        if (pendingRequests.length > 0) {
          const reqsTxt = pendingRequests
            .map((r) => `• Table ${r.tableNumber}: ${r.type.replace('_', ' ')} (${r.notes || 'No note'})`)
            .join('\n');
          setResponse(`🟠 **${pendingRequests.length} Pending Guest Requests:**\n\n${reqsTxt}`);
        } else {
          setResponse(`✓ **No pending diner requests!** All guest service calls have been resolved.`);
        }
        break;
      case 'SHIFT':
        setResponse(
          `⏱️ **Shift Performance for Captain ${currentCaptain?.name}**:\n\n` +
          `• Tables Handled: ${shiftStats.tablesServed}\n` +
          `• Orders Taken: ${shiftStats.ordersTaken}\n` +
          `• KOTs Fired: ${shiftStats.kotsSent}\n` +
          `• Dishes Served: ${shiftStats.foodServed}\n` +
          `• Bills Requested: ${shiftStats.billsRequested}`
        );
        break;
      default:
        setResponse(`JAMAN AI is connected to your local floor database. Select any quick query below.`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:justify-end p-0 sm:p-4">
      <div className="w-full sm:max-w-md h-[85vh] sm:h-[90vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-jaman-border flex flex-col justify-between overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 bg-jaman-navy text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-jaman-saffron flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white fill-white" />
            </div>
            <div>
              <span className="font-extrabold text-sm block">JAMAN AI Floor Intelligence</span>
              <span className="text-[10px] text-emerald-300 font-bold">● OFFLINE DB LINKED</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Answers */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-jaman-cream">
          {/* Intro Card */}
          <div className="p-3.5 rounded-2xl bg-white border border-jaman-border text-xs text-jaman-navy space-y-1 shadow-2xs">
            <p className="font-bold">
              🙏 Namaste Captain {currentCaptain?.name || 'there'}!
            </p>
            <p className="text-slate-600">
              I am connected to your live floor tables, KDS food ready queue, and kitchen KOT tickets. Tap any quick query below for instant answers.
            </p>
          </div>

          {/* Active AI Query Response */}
          {response && (
            <div className="p-4 rounded-2xl bg-white border-2 border-jaman-saffron shadow-sm text-xs space-y-2 animate-in fade-in">
              <div className="flex items-center gap-1.5 font-bold text-jaman-saffron">
                <Bot className="w-4 h-4" />
                <span>Real-Time Floor Answer:</span>
              </div>
              <div className="whitespace-pre-line leading-relaxed text-jaman-navy font-medium">
                {response}
              </div>
            </div>
          )}
        </div>

        {/* Preloaded Captain Query Chips Footer */}
        <div className="p-4 bg-white border-t border-jaman-border space-y-2.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Preloaded Captain Floor Inquiries:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'ATTENTION', label: '⚡ What needs my attention right now?' },
              { id: 'FOOD_READY', label: '🔥 Which food is ready to deliver?' },
              { id: 'DELAYED_KOTS', label: '🔴 Which KOTs are delayed in kitchen?' },
              { id: 'BILLS', label: '💜 Which tables are waiting for bill?' },
              { id: 'GUEST_REQUESTS', label: '💧 Show pending guest requests' },
              { id: 'SHIFT', label: '⏱️ Show my shift performance stats' }
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => runQuery(chip.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                  activeQuery === chip.id
                    ? 'bg-jaman-saffron text-white shadow-xs'
                    : 'bg-jaman-cream hover:bg-[#FFF4ED] border border-slate-200 hover:border-jaman-saffron text-slate-700 hover:text-jaman-saffron'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
