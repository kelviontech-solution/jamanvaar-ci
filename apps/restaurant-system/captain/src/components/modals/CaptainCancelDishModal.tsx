import React, { useEffect, useState } from 'react';
import { useEscapeToClose } from '../useEscapeToClose';
import { useCaptainStore } from '../../store/captainStore';
import { X, AlertTriangle } from 'lucide-react';

const REASONS = ['Guest changed mind', 'Wrong dish taken', 'Out of stock', 'Kitchen delay', 'Guest left'];

interface Props {
  /** The order line to cancel, with the words to show for it. */
  dish: { orderItemId: string; name: string; quantity: number } | null;
  onClose: () => void;
  onCancelled: () => void;
}

/**
 * Cancelling a dish that was already sent takes it off the bill and stops the kitchen cooking it, so it needs a reason and a
 * manager: the manager keys in their PIN here (a manager who is signed in does not need to).
 */
export const CaptainCancelDishModal: React.FC<Props> = ({ dish, onClose, onCancelled }) => {
  useEscapeToClose(!!dish, onClose);
  const cancelDish = useCaptainStore((s) => s.cancelDish);
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (dish) {
      setReason('');
      setCustom('');
      setPin('');
      setError('');
      setBusy(false);
    }
  }, [dish?.orderItemId]);

  if (!dish) return null;
  const finalReason = reason === 'Other' ? custom.trim() : reason;

  const submit = async () => {
    setError('');
    setBusy(true);
    const result = await cancelDish(dish.orderItemId, finalReason, pin || undefined);
    setBusy(false);
    if (result.ok) onCancelled();
    else setError(result.error);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Cancel ${dish.name}`}>
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl border border-jaman-border space-y-4 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-jaman-navy flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              Cancel this dish?
            </h3>
            <p className="text-sm font-bold text-slate-700 mt-1 break-words">{dish.quantity}× {dish.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">It is taken off the bill and the kitchen is told to stop.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 cursor-pointer shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Reason</label>
          <div className="flex flex-wrap gap-2">
            {[...REASONS, 'Other'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer min-h-[40px] ${reason === r ? 'bg-rose-600 text-white border-rose-600' : 'bg-jaman-cream text-slate-700 border-jaman-border'}`}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === 'Other' && (
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Type the reason"
              maxLength={120}
              className="w-full px-3 py-2.5 bg-jaman-cream border border-jaman-border rounded-xl text-sm text-jaman-navy outline-none focus:bg-white focus:border-jaman-saffron"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cancel-pin" className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Manager PIN</label>
          <input
            id="cancel-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="• • • •"
            className="w-full text-center text-xl tracking-[0.5em] font-mono py-2.5 px-4 rounded-xl bg-white border border-jaman-border focus:border-jaman-saffron outline-none text-jaman-navy"
          />
          <p className="text-[11px] text-slate-500">A manager keys their PIN in here. Not needed when a manager is signed in.</p>
        </div>

        {error && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="py-3 rounded-2xl bg-jaman-cream border border-jaman-border text-slate-700 font-black text-sm cursor-pointer">
            Keep dish
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || finalReason.length < 3}
            className="py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black text-sm cursor-pointer"
          >
            {busy ? 'Cancelling…' : 'Cancel dish'}
          </button>
        </div>
      </div>
    </div>
  );
};
