import { ChevronLeft, ChevronRight } from 'lucide-react';
import { rangeLabel } from '../lib/pagedQuery';
import { Button } from './ui';

/** Previous / next with the visible range, for any server-paged list. */
export function Pager({ page, pageSize, total, totalPages, onPage, loading }: {
  page: number; pageSize: number; total: number; totalPages: number; onPage: (p: number) => void; loading?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 4px', flexWrap: 'wrap' }}>
      <span className="muted" style={{ fontSize: 13 }} aria-live="polite">{rangeLabel(page, pageSize, total)}</span>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Button size="sm" variant="ghost" disabled={loading || page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="w-4 h-4" /> Prev
        </Button>
        <span style={{ fontSize: 13 }}>Page {page} of {totalPages}</span>
        <Button size="sm" variant="ghost" disabled={loading || page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
