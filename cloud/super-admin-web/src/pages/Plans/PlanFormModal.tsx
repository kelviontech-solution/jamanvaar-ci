import { useState, useMemo, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { ENTITLEMENT_KEYS, ENTITLEMENT_LABELS, type Entitlements, type Plan } from '../../api/types';
import {
  CORE_PLAN_FEATURE_GROUPS,
  PRO_PLAN_FEATURE_GROUPS,
  OPERATIONAL_MODULE_CATEGORIES,
  CORE_DEFAULT_ENTITLEMENTS,
  PRO_DEFAULT_ENTITLEMENTS,
  PRO_EXCLUSIVE_KEYS,
  resolveTierEntitlements,
  countFeatures,
  type PlanFeatureGroup
} from '@jamanvaar/types';
import { Button } from '../../components/ui';
import '../../components/shared.css';
import './plans.css';

interface FormState {
  // QR/ENTERPRISE plans are created via seed/API today, not this form — 'QR' is accepted here so
  // opening an *existing* QR-tier plan for edit doesn't type-error or crash; the tier picker below
  // only offers CORE/PRO/ENTERPRISE, unchanged from before this phase.
  tier: 'CORE' | 'PRO' | 'QR' | 'ENTERPRISE';
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  maxBranches: string;
  maxDevices: string;
  maxUsers: string;
  entitlements: Entitlements;
}

const EMPTY_ENTITLEMENTS = Object.fromEntries(ENTITLEMENT_KEYS.map((k) => [k, false])) as Entitlements;

function toFormState(plan?: Plan): FormState {
  if (!plan) {
    return {
      tier: 'CORE',
      name: 'JAMANVAAR CORE',
      description: 'Foundation Edition: Complete offline-first restaurant operations suite.',
      priceMonthly: '5000',
      priceYearly: '50000',
      maxBranches: '1',
      maxDevices: '5',
      maxUsers: '10',
      entitlements: { ...CORE_DEFAULT_ENTITLEMENTS } as Entitlements
    };
  }
  return {
    tier: plan.tier,
    name: plan.name,
    description: plan.description ?? '',
    priceMonthly: String(plan.priceMonthly / 100),
    priceYearly: plan.priceYearly ? String(plan.priceYearly / 100) : '',
    maxBranches: String(plan.maxBranches),
    maxDevices: String(plan.maxDevices),
    maxUsers: String(plan.maxUsers),
    entitlements: { ...EMPTY_ENTITLEMENTS, ...plan.entitlements }
  };
}

export function PlanFormModal({
  plan,
  onClose,
  onSaved
}: {
  plan?: Plan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'details' | 'limits' | 'preview'>('matrix');
  const [form, setForm] = useState<FormState>(() => toFormState(plan));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    pos_billing: true,
    connected_ecosystem: true
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleTierChange(tier: FormState['tier']) {
    // When tier changes in creation mode or user requests it, apply canonical tier inheritance.
    // resolveTierEntitlements (from @jamanvaar/types, shared with the local runtime) only knows
    // CORE/PRO/ENTERPRISE — 'QR' plans aren't created/edited via this tier-switcher (the picker
    // below only offers those three), so QR falls back to CORE's entitlement defaults here.
    const resolved = resolveTierEntitlements(tier === 'QR' ? 'CORE' : tier, form.entitlements);
    let defaultPrice = form.priceMonthly;
    let defaultName = form.name;
    if (!plan) {
      if (tier === 'CORE') {
        defaultPrice = '5000';
        defaultName = 'JAMANVAAR CORE';
      } else if (tier === 'PRO') {
        defaultPrice = '7000';
        defaultName = 'JAMANVAAR PRO';
      } else {
        defaultPrice = '15000';
        defaultName = 'JAMANVAAR ENTERPRISE';
      }
    }
    setForm((f) => ({
      ...f,
      tier,
      name: defaultName,
      priceMonthly: defaultPrice,
      entitlements: { ...resolved } as Entitlements
    }));
  }

  function applyTierDefaults() {
    const defaults = form.tier === 'PRO' ? PRO_DEFAULT_ENTITLEMENTS : CORE_DEFAULT_ENTITLEMENTS;
    setForm((f) => ({
      ...f,
      entitlements: { ...defaults } as Entitlements
    }));
  }

  function toggleEntitlement(key: keyof Entitlements) {
    setForm((f) => ({
      ...f,
      entitlements: { ...f.entitlements, [key]: !f.entitlements[key] }
    }));
  }

  function toggleModuleAll(categoryKeys: (keyof Entitlements)[], turnOn: boolean) {
    setForm((f) => {
      const nextEnt = { ...f.entitlements };
      for (const k of categoryKeys) {
        nextEnt[k] = turnOn;
      }
      return { ...f, entitlements: nextEnt };
    });
  }

  function toggleExpandModule(modId: string) {
    setExpandedModules((prev) => ({ ...prev, [modId]: !prev[modId] }));
  }

  // Combined catalog lookup for granular capabilities
  const allFeatureGroups: PlanFeatureGroup[] = useMemo(() => {
    return [...CORE_PLAN_FEATURE_GROUPS, ...PRO_PLAN_FEATURE_GROUPS];
  }, []);

  // Compute live enabled feature and module metrics
  const metrics = useMemo(() => {
    const activeKeys = ENTITLEMENT_KEYS.filter((k) => form.entitlements[k]);
    const enabledGroups = allFeatureGroups.filter((g) =>
      g.entitlementKeys.some((k) => form.entitlements[k as keyof Entitlements])
    );
    const enabledFeaturesCount = countFeatures(enabledGroups);

    return {
      activeEntitlementsCount: activeKeys.length,
      totalEntitlementsCount: ENTITLEMENT_KEYS.length,
      enabledModulesCount: enabledGroups.length,
      enabledFeaturesCount
    };
  }, [form.entitlements, allFeatureGroups]);

  // Dependency validation
  const dependencyWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (form.entitlements.qrTableOrdering && (!form.entitlements.tableManagement || !form.entitlements.menuManagement)) {
      warnings.push('QR Table Ordering requires both Table Management and Menu Management to be active.');
    }
    if (form.entitlements.captainApp && !form.entitlements.tableManagement) {
      warnings.push('Wireless Captain App requires Table Management.');
    }
    if (form.entitlements.advancedCaptainReports && !form.entitlements.salesAndGstReports) {
      warnings.push('Advanced Analytics requires Base Sales & GST Reports.');
    }
    return warnings;
  }, [form.entitlements]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        tier: form.tier,
        name: form.name,
        description: form.description || undefined,
        priceMonthly: Math.round(Number(form.priceMonthly) * 100),
        priceYearly: form.priceYearly ? Math.round(Number(form.priceYearly) * 100) : undefined,
        maxBranches: Number(form.maxBranches),
        maxDevices: Number(form.maxDevices),
        maxUsers: Number(form.maxUsers),
        entitlements: form.entitlements
      };
      if (plan) {
        await api.patch(`/api/v1/plans/${plan.id}`, payload);
      } else {
        await api.post('/api/v1/plans', payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save plan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide plan-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* MODAL HEADER */}
        <div className="modal-header">
          <div>
            <h2>{plan ? `Edit Plan: ${plan.name}` : 'SaaS Plan Builder & Configurator'}</h2>
            <div className="form-note">
              Centralized feature entitlement resolution for KELVIONTECH commercial licenses.
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* SUB-TABS NAVIGATION */}
        <div style={{ padding: '12px 24px 0 24px', background: '#faf8f5', borderBottom: '1px solid var(--jv-border)' }}>
          <div className="plan-nav-tabs">
            <button
              type="button"
              className={`plan-tab-btn ${activeSubTab === 'matrix' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('matrix')}
            >
              <span>⚡ Feature Entitlements</span>
              <span className="module-badge">{metrics.activeEntitlementsCount}/{metrics.totalEntitlementsCount}</span>
            </button>
            <button
              type="button"
              className={`plan-tab-btn ${activeSubTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('details')}
            >
              <span>💳 Pricing &amp; Details</span>
            </button>
            <button
              type="button"
              className={`plan-tab-btn ${activeSubTab === 'limits' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('limits')}
            >
              <span>🏢 Usage Limits</span>
            </button>
            <button
              type="button"
              className={`plan-tab-btn ${activeSubTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('preview')}
            >
              <span>👁️ Card Preview</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="plan-modal-body">
          {/* TAB 1: FEATURE ENTITLEMENTS MATRIX */}
          {activeSubTab === 'matrix' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Tier Selection & Inheritance Banner */}
              <div className="plan-tier-selector">
                <div
                  className={`tier-option-card ${form.tier === 'CORE' ? 'selected' : ''}`}
                  onClick={() => handleTierChange('CORE')}
                >
                  <div className="tier-title">
                    <span>JAMANVAAR CORE</span>
                    <span className="module-badge">₹5,000</span>
                  </div>
                  <div className="tier-desc">Foundation edition. Counter POS, billing, KOT, tables & inventory.</div>
                </div>

                <div
                  className={`tier-option-card ${form.tier === 'PRO' ? 'selected' : ''}`}
                  onClick={() => handleTierChange('PRO')}
                >
                  <div className="tier-title">
                    <span style={{ color: '#ea580c' }}>JAMANVAAR PRO</span>
                    <span className="module-badge pro">₹7,000</span>
                  </div>
                  <div className="tier-desc">Flagship edition. Everything in Core + Captain app, QR table ordering, mesh sync &amp; AI.</div>
                </div>

                <div
                  className={`tier-option-card ${form.tier === 'ENTERPRISE' ? 'selected' : ''}`}
                  onClick={() => handleTierChange('ENTERPRISE')}
                >
                  <div className="tier-title">
                    <span>ENTERPRISE</span>
                    <span className="module-badge">Custom</span>
                  </div>
                  <div className="tier-desc">Multi-outlet restaurant chains with custom limits and integrations.</div>
                </div>
              </div>

              {/* Automatic Core Inheritance Notification */}
              {form.tier === 'PRO' && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>✓</span>
                    <span>Automatic Core Inheritance Active: All 10 Core base modules (183 features) are included.</span>
                  </div>
                  <button
                    type="button"
                    onClick={applyTierDefaults}
                    className="module-toggle-btn"
                    style={{ color: '#15803d' }}
                  >
                    Reset to Canonical PRO
                  </button>
                </div>
              )}

              {/* Search & Bulk Control Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <input
                  type="search"
                  placeholder="Search features or modules (e.g. QR, Captain, KDS, GST)..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 260,
                    height: 38,
                    borderRadius: 10,
                    border: '1px solid var(--jv-border)',
                    padding: '0 12px',
                    fontSize: 13
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const allKeys = ENTITLEMENT_KEYS;
                      toggleModuleAll(allKeys as unknown as (keyof Entitlements)[], true);
                    }}
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const allKeys = ENTITLEMENT_KEYS;
                      toggleModuleAll(allKeys as unknown as (keyof Entitlements)[], false);
                    }}
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              {/* Dependency Alerts */}
              {dependencyWarnings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dependencyWarnings.map((warn, idx) => (
                    <div key={idx} className="dependency-alert">
                      <span>⚠️</span>
                      <span>{warn}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 7 Operational Modules List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {OPERATIONAL_MODULE_CATEGORIES.map((category) => {
                  const isExpanded = !!expandedModules[category.id] || !!searchFilter.trim();
                  const catKeys = category.entitlementKeys;
                  const checkedCount = catKeys.filter((k) => form.entitlements[k as keyof Entitlements]).length;
                  const isAllChecked = checkedCount === catKeys.length;

                  // Find related granular catalog groups
                  const relatedGroups = allFeatureGroups.filter((g) => category.catalogGroupIds.includes(g.id));
                  const totalGranularCount = countFeatures(relatedGroups);

                  // Filter matching check
                  if (searchFilter.trim()) {
                    const term = searchFilter.toLowerCase();
                    const matchesCategory = category.name.toLowerCase().includes(term);
                    const matchesKeys = catKeys.some((k) => ENTITLEMENT_LABELS[k as keyof Entitlements]?.toLowerCase().includes(term));
                    const matchesGranular = relatedGroups.some((g) => g.features.some((f) => f.toLowerCase().includes(term)));
                    if (!matchesCategory && !matchesKeys && !matchesGranular) {
                      return null;
                    }
                  }

                  return (
                    <div
                      key={category.id}
                      className={`module-accordion-card ${category.isProExclusive ? 'pro-exclusive' : ''} ${isExpanded ? 'open' : ''}`}
                    >
                      <div className="module-accordion-header" onClick={() => toggleExpandModule(category.id)}>
                        <div className="module-header-left">
                          <span style={{ fontSize: 16 }}>{category.isProExclusive ? '⭐' : '📦'}</span>
                          <div>
                            <span className="module-name">{category.name}</span>
                            {category.isProExclusive && (
                              <span className="module-badge pro" style={{ marginLeft: 8 }}>
                                PRO EXCLUSIVE
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="module-header-right" onClick={(e) => e.stopPropagation()}>
                          <span className="module-badge">
                            {checkedCount} / {catKeys.length} Entitlements ({totalGranularCount} Capabilities)
                          </span>
                          <button
                            type="button"
                            className="module-toggle-btn"
                            onClick={() => toggleModuleAll(catKeys as unknown as (keyof Entitlements)[], !isAllChecked)}
                          >
                            {isAllChecked ? 'Deselect Module' : 'Select All'}
                          </button>
                          <button
                            type="button"
                            className="module-toggle-btn"
                            onClick={() => toggleExpandModule(category.id)}
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="module-accordion-content">
                          <div className="form-note">{category.description}</div>

                          {/* Checkboxes for Entitlement Flags in this Category */}
                          <div className="module-entitlement-grid">
                            {catKeys.map((key) => {
                              const isChecked = form.entitlements[key as keyof Entitlements];
                              const isProExclusive = PRO_EXCLUSIVE_KEYS.includes(key);

                              return (
                                <label
                                  key={key}
                                  className={`entitlement-checkbox-label ${isChecked ? 'checked' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleEntitlement(key as keyof Entitlements)}
                                  />
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <span>{ENTITLEMENT_LABELS[key as keyof Entitlements] || key}</span>
                                      {isProExclusive && (
                                        <span style={{ fontSize: 9, fontWeight: 800, color: '#ea580c', background: '#fff7ed', padding: '1px 5px', borderRadius: 4 }}>
                                          PRO
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>

                          {/* Granular Feature Capabilities preview */}
                          <div style={{ marginTop: 6 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--jv-text-secondary)', marginBottom: 6 }}>
                              Included Granular Capabilities:
                            </div>
                            <div className="granular-feature-pills">
                              {relatedGroups.flatMap((g) => g.features).slice(0, 16).map((fName, fIdx) => (
                                <span key={fIdx} className="feature-pill">
                                  ✓ {fName}
                                </span>
                              ))}
                              {totalGranularCount > 16 && (
                                <span className="feature-pill" style={{ background: '#fff4ed', color: '#ea580c', fontWeight: 700 }}>
                                  +{totalGranularCount - 16} more capabilities
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: PRICING & DETAILS */}
          {activeSubTab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-section-label">General Information</div>
              <div className="form-grid">
                <div className="field">
                  <label>Plan Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="e.g. JAMANVAAR CORE or JAMANVAAR PRO"
                    required
                  />
                </div>
                <div className="field">
                  <label>Plan Tier *</label>
                  <select
                    value={form.tier}
                    onChange={(e) => handleTierChange(e.target.value as FormState['tier'])}
                  >
                    <option value="CORE">CORE (Foundation)</option>
                    <option value="PRO">PRO (Flagship Connected)</option>
                    <option value="ENTERPRISE">ENTERPRISE (Custom)</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>Commercial Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 10,
                    border: '1px solid var(--jv-border)',
                    fontSize: 13,
                    fontFamily: 'inherit'
                  }}
                  placeholder="Marketing description shown on subscription screens..."
                />
              </div>

              <div className="form-section-label">Commercial Pricing (₹ INR)</div>
              <div className="form-grid">
                <div className="field">
                  <label>Monthly License Fee (₹) *</label>
                  <input
                    type="number"
                    min={0}
                    value={form.priceMonthly}
                    onChange={(e) => update('priceMonthly', e.target.value)}
                    required
                  />
                  <span className="form-note">Core standard: ₹5,000 / Pro standard: ₹7,000</span>
                </div>
                <div className="field">
                  <label>Yearly License Fee (₹ optional)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.priceYearly}
                    onChange={(e) => update('priceYearly', e.target.value)}
                  />
                  <span className="form-note">e.g. ₹50,000 for 12 months</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TENANT USAGE LIMITS */}
          {activeSubTab === 'limits' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-section-label">License Provisioning &amp; Quotas</div>
              <div className="form-note">
                These usage boundaries are strictly enforced across Cloud API authentication and device registration.
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="field">
                  <label>Max Branches *</label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxBranches}
                    onChange={(e) => update('maxBranches', e.target.value)}
                    required
                  />
                  <span className="form-note">Core: 1 branch / Pro: 5 branches</span>
                </div>

                <div className="field">
                  <label>Max Devices (Terminals) *</label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxDevices}
                    onChange={(e) => update('maxDevices', e.target.value)}
                    required
                  />
                  <span className="form-note">POS + Captain + KDS nodes</span>
                </div>

                <div className="field">
                  <label>Max User Accounts *</label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxUsers}
                    onChange={(e) => update('maxUsers', e.target.value)}
                    required
                  />
                  <span className="form-note">Cashiers, Managers &amp; Waiters</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LIVE PLAN CARD PREVIEW */}
          {activeSubTab === 'preview' && (
            <div className="plan-preview-container">
              <div className="form-note" style={{ marginBottom: 16 }}>
                Real-time preview of how this plan renders in the Restaurant Admin Subscription portal:
              </div>

              <div className={`preview-card-frame ${form.tier === 'PRO' ? 'pro' : ''}`}>
                {form.tier === 'PRO' && (
                  <div className="preview-ribbon">RECOMMENDED</div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: 16, marginBottom: 16 }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: form.tier === 'PRO' ? '#ea580c' : '#64748b' }}>
                      {form.tier === 'PRO' ? 'FLAGSHIP CONNECTED ECOSYSTEM' : 'FOUNDATION EDITION'}
                    </span>
                    <h3 style={{ margin: '2px 0 0 0', fontSize: 22, fontWeight: 900, color: '#0B253A' }}>
                      {form.name || 'Untitled Plan'}
                    </h3>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                      {form.tier === 'PRO' ? 'POS + Complete Management + Connected Floor' : 'POS + Complete Restaurant Management'}
                    </span>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#0B253A', fontFamily: 'monospace' }}>
                      ₹{Number(form.priceMonthly || 0).toLocaleString('en-IN')}
                    </div>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>per license</span>
                  </div>
                </div>

                <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.4, background: '#f8fafc', padding: 12, borderRadius: 12, margin: '0 0 16px 0' }}>
                  {form.description || 'Commercial restaurant operating software licensing by KELVIONTECH.'}
                </p>

                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <span className="module-badge">
                    🏢 Up to {form.maxBranches} Branch{Number(form.maxBranches) > 1 ? 'es' : ''}
                  </span>
                  <span className="module-badge">
                    💻 Up to {form.maxDevices} Devices
                  </span>
                  <span className="module-badge">
                    👥 Up to {form.maxUsers} Users
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>
                    INCLUDED MODULES ({metrics.enabledModulesCount} Groups • {metrics.enabledFeaturesCount} Features):
                  </div>

                  {OPERATIONAL_MODULE_CATEGORIES.map((cat) => {
                    const hasAny = cat.entitlementKeys.some((k) => form.entitlements[k as keyof Entitlements]);
                    if (!hasAny) return null;

                    return (
                      <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                        <span style={{ color: '#16a34a', fontWeight: 900 }}>✓</span>
                        <span>{cat.name}</span>
                        {cat.isProExclusive && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#ea580c', background: '#fff7ed', padding: '1px 5px', borderRadius: 4 }}>
                            PRO
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          {/* MODAL FOOTER ACTIONS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--jv-border)', paddingTop: 16, marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-secondary)' }}>
              <span>{metrics.activeEntitlementsCount} / {metrics.totalEntitlementsCount} Entitlements Active</span>
              <span style={{ margin: '0 8px' }}>•</span>
              <span style={{ color: '#ea580c' }}>{metrics.enabledFeaturesCount} Granular Features</span>
            </div>

            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Saving Plan…' : plan ? 'Save Changes' : 'Create Plan'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
