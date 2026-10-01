import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IndianRupee, MessageCircle, Pause, RefreshCw, ShoppingBag, Store } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Badge, Card, EmptyState, ErrorState, SearchBar, SkeletonTable, statusTone, type BadgeTone } from '../../components/ui';
import '../../components/shared.css';

const RESTAURANTS_ENDPOINT = '/api/v1/whatsapp-ordering/restaurants';
const METRICS_ENDPOINT = '/api/v1/whatsapp-ordering/metrics';

interface WhatsAppOrderingRestaurantItem {
  restaurantId: string;
  restaurantName: string;
  connectionStatus: 'PENDING' | 'CONNECTED' | 'REVOKED';
  keyPrefix: string;
  autoAccept: boolean;
  paused: boolean;
  connectedAt: string | null;
  lastUsedAt: string | null;
  entitlementEnabled: boolean;
  entitlementReason: string;
  ordersTotal: number;
  revenueTotalPaise: number;
  lastOrderAt: string | null;
}

interface PlatformWhatsAppOrderingMetrics {
  connectedRestaurants: number;
  pendingRestaurants: number;
  totalOrders: number;
  totalRevenuePaise: number;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function entitlementTone(enabled: boolean): BadgeTone {
  return enabled ? 'success' : 'warning';
}

function StatTile({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-top">
        <span className="stat-label">{label}</span>
        <span className="stat-tile-icon stat-tile-icon-green">{icon}</span>
      </div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-sub">{sub}</div>
      </div>
    </div>
  );
}

export function WhatsAppOrderingPage() {
  const [restaurants, setRestaurants] = useState<WhatsAppOrderingRestaurantItem[] | null>(null);
  const [metrics, setMetrics] = useState<PlatformWhatsAppOrderingMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, m] = await Promise.all([
        api.get<WhatsAppOrderingRestaurantItem[]>(RESTAURANTS_ENDPOINT),
        api.get<PlatformWhatsAppOrderingMetrics>(METRICS_ENDPOINT)
      ]);
      setRestaurants(Array.isArray(list) ? list : []);
      setMetrics(m);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the WhatsApp connector fleet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = (restaurants ?? []).filter((r) => r.restaurantName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="page-title">WhatsApp Ordering Connector</h1>
            <Badge tone="gold">Pilot</Badge>
          </div>
          <p className="page-subtitle">
            Which restaurants have connected their WhatsApp ordering key, and whether it's healthy. Entitlement
            (who's allowed to connect at all) is managed per-restaurant on its own Applications tab — this is
            read-only visibility into who actually has, not a duplicate toggle.
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-md" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {!metrics && !error && loading && (
        <div className="stat-grid" style={{ marginBottom: 20 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="stat-tile">
              <div className="skeleton-shimmer" style={{ height: 14, width: '55%', borderRadius: 4 }} />
              <div className="skeleton-shimmer" style={{ height: 26, width: '40%', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      )}

      {metrics && (
        <div className="stat-grid" style={{ marginBottom: 20 }}>
          <StatTile label="Connected" value={String(metrics.connectedRestaurants)} sub="Restaurants live on WhatsApp ordering" icon={<Store className="w-5 h-5" />} />
          <StatTile label="Waiting to connect" value={String(metrics.pendingRestaurants)} sub="Key generated, not yet pasted into product/whatsapp" icon={<MessageCircle className="w-5 h-5" />} />
          <StatTile label="Total orders" value={String(metrics.totalOrders)} sub="Paid WhatsApp orders, all time" icon={<ShoppingBag className="w-5 h-5" />} />
          <StatTile label="Total revenue" value={formatRupees(metrics.totalRevenuePaise)} sub="Settled WhatsApp order value" icon={<IndianRupee className="w-5 h-5" />} />
        </div>
      )}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--jv-border)' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search restaurants…" />
        </div>

        {loading && !restaurants ? (
          <SkeletonTable rows={5} cols={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void loadData()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="w-6 h-6 text-slate-400" />}
            title={restaurants && restaurants.length > 0 ? 'No restaurants match' : 'No restaurant has connected yet'}
            description={
              restaurants && restaurants.length > 0
                ? 'Try a different search term.'
                : 'A restaurant connects from pos-admin → Settings → WhatsApp Ordering, once WHATSAPP_ORDERING is enabled on its plan.'
            }
          />
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Connection</th>
                  <th>Entitlement</th>
                  <th>Auto-accept</th>
                  <th>Orders</th>
                  <th>Revenue</th>
                  <th>Last order</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.restaurantId}>
                    <td>
                      <Link to={`/restaurants/${r.restaurantId}`} className="table-link" style={{ fontWeight: 700, fontSize: 13.5 }}>
                        {r.restaurantName}
                      </Link>
                      <div style={{ fontSize: 11, color: 'var(--jv-text-muted)', fontFamily: 'monospace' }}>{r.keyPrefix}••••••••••••</div>
                    </td>
                    <td>
                      <Badge tone={statusTone(r.connectionStatus)}>{r.connectionStatus}</Badge>
                      {r.paused && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: 'var(--jv-warning)' }}>
                          <Pause className="w-3 h-3" /> Paused by restaurant
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge tone={entitlementTone(r.entitlementEnabled)}>{r.entitlementEnabled ? 'Entitled' : r.entitlementReason}</Badge>
                    </td>
                    <td>{r.autoAccept ? 'On' : 'Off'}</td>
                    <td>{r.ordersTotal}</td>
                    <td>{formatRupees(r.revenueTotalPaise)}</td>
                    <td>{formatRelative(r.lastOrderAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
