import { useEffect, useState } from 'react';

/** Keeps a guest call visible without capturing payment focus or blocking the application. */
export function GuestAssistanceStrip({
  id,
  title,
  message,
  waiting,
  onAccept
}: {
  id: string;
  title: string;
  message: string;
  waiting: number;
  onAccept: () => void;
}) {
  const [snoozed, setSnoozed] = useState<{ id: string; until: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (snoozed?.id === id && snoozed.until > now) return null;
  return (
    <aside
      role="region"
      aria-label="Guest assistance"
      className="fixed bottom-4 right-4 z-[90] max-w-sm w-[calc(100%-2rem)] rounded-2xl border-2 border-rose-400 bg-white p-4 shadow-xl space-y-2"
    >
      <div aria-live="polite">
        <h2 className="font-bold text-jaman-navy">{title}</h2>
        <p className="text-sm text-slate-600">{message}</p>
        {waiting > 0 && <p className="text-xs text-rose-700">{waiting} more requests waiting</p>}
      </div>
      <div className="flex gap-2">
        <button type="button" className="min-h-11 flex-1 rounded-xl bg-rose-600 px-3 text-white font-bold" onClick={onAccept}>
          Accept — on my way
        </button>
        <button type="button" className="min-h-11 rounded-xl border px-3 text-sm" onClick={() => setSnoozed({ id, until: Date.now() + 60000 })}>
          Remind in 1 min
        </button>
      </div>
    </aside>
  );
}
