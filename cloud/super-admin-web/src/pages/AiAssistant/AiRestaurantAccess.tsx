import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { RestaurantListItem } from '../../api/types';
import { Badge, Button, Card } from '../../components/ui';
import '../../components/shared.css';

type State = 'PLAN' | 'ON' | 'LOCKED' | 'OFF';

interface Access {
  state: 'ON' | 'LOCKED' | 'OFF';
  source: 'PLAN' | 'RESTAURANT';
  tier: string;
  planName: string | null;
  dailyLimit: number | null;
  usedToday: number;
  remainingToday: number | null;
  override: { state: string | null; dailyQueryLimit: number | null; thresholdOverrides: Record<string, number> | null } | null;
}

const STATE_TONE = { ON: 'success', LOCKED: 'warning', OFF: 'neutral' } as const;

/**
 * JAMAN AI is decided per restaurant (BUG-057): follow the plan, or grant / lock / hide it for this one
 * restaurant, with an optional daily limit and threshold overrides within the platform's bounds.
 */
export function AiRestaurantAccess() {
  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [restaurantId, setRestaurantId] = useState('');
  const [access, setAccess] = useState<Access | null>(null);
  const [state, setState] = useState<State>('PLAN');
  const [limit, setLimit] = useState('');
  const [kot, setKot] = useState('');
  const [stock, setStock] = useState('');
  const [variance, setVariance] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<RestaurantListItem[]>('/api/v1/restaurants').then(setRestaurants).catch(() => setRestaurants([]));
  }, []);

  useEffect(() => {
    if (!restaurantId) {
      setAccess(null);
      return;
    }
    setMessage(null);
    api
      .get<Access>(`/api/v1/ai-assistant/restaurants/${restaurantId}/access`)
      .then((a) => {
        setAccess(a);
        setState((a.override?.state as State | null) ?? 'PLAN');
        setLimit(a.override?.dailyQueryLimit != null ? String(a.override.dailyQueryLimit) : '');
        const t = a.override?.thresholdOverrides ?? {};
        setKot(t.delayedKotMinutes != null ? String(t.delayedKotMinutes) : '');
        setStock(t.lowStockThreshold != null ? String(t.lowStockThreshold) : '');
        setVariance(t.cashDrawerVarianceThreshold != null ? String(t.cashDrawerVarianceThreshold) : '');
      })
      .catch((e) => setMessage(e instanceof ApiError ? e.message : 'Could not load this restaurant'));
  }, [restaurantId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const overrides: Record<string, number> = {};
    if (kot) overrides.delayedKotMinutes = Number(kot);
    if (stock) overrides.lowStockThreshold = Number(stock);
    if (variance) overrides.cashDrawerVarianceThreshold = Number(variance);
    try {
      const updated = await api.patch<Access>(`/api/v1/ai-assistant/restaurants/${restaurantId}/access`, {
        state: state === 'PLAN' ? null : state,
        dailyQueryLimit: limit ? Number(limit) : null,
        thresholdOverrides: Object.keys(overrides).length ? overrides : null
      });
      setAccess(updated);
      setMessage('Saved. The restaurant\'s terminals pick this up within a few minutes.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.issues?.map((i) => i.message).join(' ') || err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div style={{ padding: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>JAMAN AI for one restaurant</h3>
        <p className="muted" style={{ margin: '4px 0 14px', fontSize: 13 }}>
          By default a restaurant follows its plan: PRO is ON, CORE is LOCKED (a teaser) or OFF (hidden), depending on the teaser setting above.
          Change it here for a single restaurant.
        </p>
        <div className="form-field" style={{ maxWidth: 420 }}>
          <label htmlFor="ai-restaurant">Restaurant</label>
          <select id="ai-restaurant" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)}>
            <option value="">Choose a restaurant…</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {access && (
          <form onSubmit={save} style={{ marginTop: 16, display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>Right now:</span>
              <Badge tone={STATE_TONE[access.state]}>{access.state}</Badge>
              <span className="muted" style={{ fontSize: 13 }}>
                {access.source === 'PLAN' ? `from the ${access.planName ?? 'plan'} (${access.tier})` : 'set for this restaurant'}
                {' · '}
                {access.usedToday} question{access.usedToday === 1 ? '' : 's'} today
                {access.dailyLimit != null ? ` of ${access.dailyLimit}` : ''}
              </span>
            </div>

            <div className="form-field" style={{ maxWidth: 420 }}>
              <label htmlFor="ai-state">Access</label>
              <select id="ai-state" value={state} onChange={(e) => setState(e.target.value as State)}>
                <option value="PLAN">Follow the plan</option>
                <option value="ON">ON: works</option>
                <option value="LOCKED">LOCKED: visible with a lock and a few example questions</option>
                <option value="OFF">OFF: hidden</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              <div className="form-field">
                <label htmlFor="ai-limit">Daily question limit</label>
                <input id="ai-limit" type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Plan default" />
              </div>
              <div className="form-field">
                <label htmlFor="ai-kot">Delayed KOT (minutes)</label>
                <input id="ai-kot" type="number" min={5} max={60} value={kot} onChange={(e) => setKot(e.target.value)} placeholder="Platform value" />
              </div>
              <div className="form-field">
                <label htmlFor="ai-stock">Low-stock level</label>
                <input id="ai-stock" type="number" min={1} max={50} value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Platform value" />
              </div>
              <div className="form-field">
                <label htmlFor="ai-variance">Cash variance alert (₹)</label>
                <input id="ai-variance" type="number" min={50} max={10000} value={variance} onChange={(e) => setVariance(e.target.value)} placeholder="Platform value" />
              </div>
            </div>

            {message && <div className="banner" role="status">{message}</div>}
            <div>
              <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving…' : 'Save for this restaurant'}</Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
