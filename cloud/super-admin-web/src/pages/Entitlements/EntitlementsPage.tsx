import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { ENTITLEMENT_LABELS, type EntitlementKey, type Plan } from '../../api/types';
import {
  CORE_PLAN_FEATURE_GROUPS,
  PRO_PLAN_FEATURE_GROUPS,
  OPERATIONAL_MODULE_CATEGORIES,
  countFeatures,
  type PlanFeatureGroup
} from '@jamanvaar/types';
import { Card, EmptyState, Badge, statusTone, SkeletonTable, SearchBar } from '../../components/ui';
import '../../components/shared.css';
import '../Plans/plans.css';

export function EntitlementsPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTierFilter, setSelectedTierFilter] = useState<'ALL' | 'ACTIVE_ONLY'>('ACTIVE_ONLY');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .get<Plan[]>('/api/v1/plans')
      .then((data) => {
        setPlans(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load plans'))
      .finally(() => setLoading(false));
  }, []);

  const allFeatureGroups: PlanFeatureGroup[] = useMemo(() => {
    return [...CORE_PLAN_FEATURE_GROUPS, ...PRO_PLAN_FEATURE_GROUPS];
  }, []);

  const filteredPlans = useMemo(() => {
    if (!plans) return [];
    if (selectedTierFilter === 'ACTIVE_ONLY') {
      return plans.filter((p) => p.status === 'ACTIVE');
    }
    return plans;
  }, [plans, selectedTierFilter]);

  const filteredCategories = useMemo(() => {
    return OPERATIONAL_MODULE_CATEGORIES.filter((cat) => {
      if (selectedCategory !== 'ALL' && cat.id !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchCat = cat.name.toLowerCase().includes(q);
        const matchKeys = cat.entitlementKeys.some((k) =>
          (ENTITLEMENT_LABELS[k as EntitlementKey] || k).toLowerCase().includes(q)
        );
        if (!matchCat && !matchKeys) return false;
      }
      return true;
    });
  }, [selectedCategory, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* PAGE HEADER */}
      <div className="page-header">
        <div>
          <h1 className="page-title">SaaS Feature Entitlements &amp; Matrix</h1>
          <p className="page-subtitle">
            Central comparison matrix dynamically calculated from database <code className="mono">Plan.entitlements</code>.
            Plan allotments govern customer terminal access authoritatively.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedTierFilter}
            onChange={(e) => setSelectedTierFilter(e.target.value as 'ALL' | 'ACTIVE_ONLY')}
            style={{
              height: 38,
              padding: '0 12px',
              borderRadius: 10,
              border: '1px solid var(--jv-border)',
              fontSize: 13,
              background: '#ffffff',
              fontWeight: 600
            }}
          >
            <option value="ACTIVE_ONLY">Active Plans Only</option>
            <option value="ALL">All Plans (Including Inactive)</option>
          </select>
          <Link
            to="/plans"
            className="btn btn-accent btn-sm"
          >
            Manage Plans →
          </Link>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {/* Toolbar: Search and Category Pills */}
      <div className="toolbar" style={{ margin: 0 }}>
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search feature or module (e.g. QR, KOT, Captain)…"
          width="320px"
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn btn-sm ${selectedCategory === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelectedCategory('ALL')}
          >
            All Modules
          </button>
          {OPERATIONAL_MODULE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`btn btn-sm ${selectedCategory === c.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelectedCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {loading && !plans && <SkeletonTable rows={6} cols={4} />}

      {/* COMPARATIVE MATRIX CARD */}
      {plans && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {filteredPlans.length === 0 ? (
            <EmptyState title="No plans match criteria" description="Create or activate a plan to view its feature matrix." />
          ) : (
            <div className="entitlement-matrix" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--jv-border)' }}>
                    <th style={{ padding: '16px 20px', textAlign: 'left', width: '38%', minWidth: 280 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>
                        Software Module &amp; Capability
                      </div>
                    </th>
                    {filteredPlans.map((p) => {
                      const enabledGroups = allFeatureGroups.filter((g) =>
                        g.entitlementKeys.some((k) => p.entitlements[k as keyof typeof p.entitlements])
                      );
                      const dynamicFeatCount = countFeatures(enabledGroups);

                      return (
                        <th key={p.id} style={{ padding: '16px 20px', textAlign: 'center', minWidth: 180, borderLeft: '1px solid var(--jv-border)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <Badge tone={p.tier === 'PRO' || p.tier === 'ENTERPRISE' ? 'gold' : 'neutral'}>{p.tier}</Badge>
                            <Link to={`/plans/${p.id}`} style={{ fontWeight: 900, fontSize: 15, color: '#0B253A', textDecoration: 'none' }}>
                              {p.name}
                            </Link>
                            <div style={{ fontSize: 18, fontWeight: 900, color: p.tier === 'PRO' || p.tier === 'ENTERPRISE' ? '#ea580c' : '#0B253A', fontFamily: 'monospace' }}>
                              ₹{(p.priceMonthly / 100).toLocaleString('en-IN')}
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>/mo</span>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 12 }}>
                              {dynamicFeatCount} Capabilities Active
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {filteredCategories.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={filteredPlans.length + 1} style={{ textAlign: 'center', padding: '30px' }}>
                        <span className="muted">No modules match your search filter.</span>
                      </td>
                    </tr>
                  </tbody>
                ) : (
                    filteredCategories.map((category) => {
                      const catKeys = category.entitlementKeys;
                      const relatedGroups = allFeatureGroups.filter((g) => category.catalogGroupIds.includes(g.id));
                      const totalCatFeatures = countFeatures(relatedGroups);

                      return (
                        <tbody key={category.id} style={{ borderBottom: '2px solid #e2e8f0' }}>
                          {/* Section Header Row */}
                          <tr style={{ background: category.isProExclusive ? '#fffaf5' : '#f8fafc' }}>
                            <td
                              colSpan={filteredPlans.length + 1}
                              style={{
                                padding: '12px 20px',
                                fontWeight: 900,
                                fontSize: 13,
                                color: category.isProExclusive ? '#ea580c' : '#0B253A',
                                borderTop: '1px solid var(--jv-border)',
                                borderBottom: '1px solid var(--jv-border)'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span>{category.isProExclusive ? '⭐' : '📦'}</span>
                                  <span>{category.name}</span>
                                  {category.isProExclusive && (
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#ea580c', background: '#fff4ed', border: '1px solid #fed7aa', padding: '1px 6px', borderRadius: 10 }}>
                                      PRO EXCLUSIVE
                                    </span>
                                  )}
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                                  {totalCatFeatures} Capabilities
                                </span>
                              </div>
                            </td>
                          </tr>

                          {/* Individual Entitlement Rows */}
                          {catKeys.map((key) => {
                            const label = ENTITLEMENT_LABELS[key as EntitlementKey] || key;

                            return (
                              <tr key={key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '10px 20px', fontWeight: 600, color: '#1e293b' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ color: '#64748b', fontSize: 12 }}>•</span>
                                    <span>{label}</span>
                                  </div>
                                </td>

                                {filteredPlans.map((p) => {
                                  const isEnabled = Boolean(p.entitlements[key as EntitlementKey]);

                                  return (
                                    <td
                                      key={p.id}
                                      style={{
                                        padding: '10px 20px',
                                        textAlign: 'center',
                                        borderLeft: '1px solid var(--jv-border)',
                                        background: isEnabled && (p.tier === 'PRO' || p.tier === 'ENTERPRISE') ? 'rgba(254, 243, 199, 0.1)' : undefined
                                      }}
                                    >
                                      {isEnabled ? (
                                        <span style={{ color: '#16a34a', fontWeight: 900, fontSize: 15 }}>
                                          ✓ <span style={{ fontSize: 11, fontWeight: 700 }}>Included</span>
                                        </span>
                                      ) : (
                                        <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: 14 }}>
                                          —
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      );
                    })
                )}
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
