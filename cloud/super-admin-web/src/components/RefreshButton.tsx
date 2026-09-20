import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from './ui';

/**
 * BUG-063: every page's "Refresh" button had its own (usually missing) feedback — no spin,
 * not disabled while loading, no sign the data actually changed. One shared button: spins
 * and disables itself while `loading` is true, and its `title` reports when it last
 * refreshed so a silent no-visible-change reload isn't mistaken for "nothing happened".
 */
export function RefreshButton({
  loading,
  onRefresh,
  label = 'Refresh',
  lastUpdatedAt
}: {
  loading: boolean;
  onRefresh: () => void;
  label?: string;
  lastUpdatedAt?: Date | null;
}) {
  return (
    <Button variant="ghost" onClick={onRefresh} disabled={loading} title={lastUpdatedAt ? `Last updated ${formatRelativeTime(lastUpdatedAt)}` : undefined}>
      <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Refreshing…' : label}
    </Button>
  );
}

/** A live "Updated Xs ago" caption next to a RefreshButton. Ticks on its own so it stays accurate. */
export function LastUpdatedNote({ at }: { at: Date | null }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  if (!at) return null;
  return <span className="muted" style={{ fontSize: 11 }}>Updated {formatRelativeTime(at)}</span>;
}

export function formatRelativeTime(at: Date, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at.getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
