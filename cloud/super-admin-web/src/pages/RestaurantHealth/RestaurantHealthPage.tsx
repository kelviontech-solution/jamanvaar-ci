import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { RestaurantHealthBoard, RestaurantHealthRow } from '../../api/types';
import { Badge, BadgeTone, Button, Card, EmptyState, ErrorState, SearchBar } from '../../components/ui';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import '../../components/shared.css';

const TONE_META: Record<RestaurantHealthRow['tone'], { label: string; badge: BadgeTone }> = {
  healthy: { label: 'Healthy', badge: 'success' },
  watch: { label: 'Watch', badge: 'warning' },
  at_risk: { label: 'At risk', badge: 'error' }
};

type FilterTone = 'ALL' | RestaurantHealthRow['tone'];

export function RestaurantHealthPage() {
  const [board, setBoard] = useState<RestaurantHealthBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [toneFilter, setToneFilter] = useState<FilterTone>('ALL');

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<RestaurantHealthBoard>('/api/v1/platform/dashboard/restaurant-health')
      .then(setBoard)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load restaurant health'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!board) return [];
    const q = search.trim().toLowerCase();
    return board.restaurants.filter((r) => {
      if (toneFilter !== 'ALL' && r.tone !== toneFilter) return false;
      if (q && !r.name.toLowerCase().includes(q) && !(r.city ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [board, search, toneFilter]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Restaurant Health &amp; Risk</h1>
          <p className="page-subtitle">
            Every restaurant scored from its own subscription, bank verification, terminal uptime, open
            tickets, and sync conflicts — so trouble shows up here before a restaurant has to call you.
          </p>
        </div>
        <Button variant="ghost" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
            <Card>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-muted)', textTransform: 'uppercase' }}>Healthy</span>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--jv-success-text)', marginTop: 4 }}>
                {board ? board.summary.healthy : '—'}
              </div>
            </Card>
            <Card>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-muted)', textTransform: 'uppercase' }}>Watch</span>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#b45309', marginTop: 4 }}>
                {board ? board.summary.watch : '—'}
              </div>
            </Card>
            <Card>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-muted)', textTransform: 'uppercase' }}>At risk</span>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--jv-error-text)', marginTop: 4 }}>
                {board ? board.summary.atRisk : '—'}
              </div>
            </Card>
          </div>

          <Card>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search by restaurant or city…" />
              <div style={{ display: 'flex', gap: 8 }}>
                {(['ALL', 'at_risk', 'watch', 'healthy'] as FilterTone[]).map((t) => (
                  <Button key={t} size="sm" variant={toneFilter === t ? 'primary' : 'ghost'} onClick={() => setToneFilter(t)}>
                    {t === 'ALL' ? 'All' : TONE_META[t].label}
                  </Button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--jv-text-light)' }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<AlertTriangle className="w-8 h-8" />}
                title="No restaurants match"
                description="Nothing to show for this filter. Try a different search or tone."
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--jv-border-subtle)', textAlign: 'left', color: 'var(--jv-text-muted)' }}>
                      <th style={{ padding: '12px 14px' }}>Restaurant</th>
                      <th style={{ padding: '12px 14px' }}>Score</th>
                      <th style={{ padding: '12px 14px' }}>Status</th>
                      <th style={{ padding: '12px 14px' }}>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.restaurantId} style={{ borderBottom: '1px solid var(--jv-border-subtle)' }}>
                        <td style={{ padding: '14px' }}>
                          <Link to={`/restaurants/${r.restaurantId}`} className="table-link" style={{ fontWeight: 700 }}>
                            {r.name}
                          </Link>
                          {r.city && <div style={{ color: 'var(--jv-text-muted)', fontSize: 11 }}>{r.city}</div>}
                        </td>
                        <td style={{ padding: '14px', fontWeight: 800 }}>{r.score}</td>
                        <td style={{ padding: '14px' }}>
                          <Badge tone={TONE_META[r.tone].badge}>{TONE_META[r.tone].label}</Badge>
                        </td>
                        <td style={{ padding: '14px', color: 'var(--jv-text-muted)' }}>
                          {r.reasons.length === 0 ? '—' : r.reasons.join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
