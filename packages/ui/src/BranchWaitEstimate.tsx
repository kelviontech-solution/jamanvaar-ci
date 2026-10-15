import { useEffect, useState } from 'react';
export type WaitEstimate = { message: string; estimateMinutes: number; sampleCount: number; basis: string; generatedAt: string };
export function BranchWaitEstimate({ load }: { load: () => Promise<WaitEstimate> }) {
  const [data, setData] = useState<WaitEstimate>(),
    [stale, setStale] = useState(false);
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const next = await load();
        if (live) {
          setData(next);
          setStale(false);
        }
      } catch {
        if (live) setStale(true);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 30000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [load]);
  return data ? (
    <p role="status" className="rounded-xl bg-orange-50 text-amber-950 px-3 py-2 text-sm">
      Kitchen wait: {data.message}
      {stale
        ? ' · Last estimate; connection unavailable'
        : data.sampleCount < 5
          ? ' · Based on configured preparation time'
          : ' · Based on recent preparation times'}
    </p>
  ) : null;
}
