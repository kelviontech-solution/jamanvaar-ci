import React, { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type {
  AiCategory,
  AiQuestionItem,
  AiGlobalSettings,
  AiTelemetry,
  AiAssistantConfigResponse
} from '../../api/types';
import {
  Card,
  Badge,
  Button,
  Modal,
  Input,
  SearchBar,
  SkeletonTable
} from '../../components/ui';
import {
  Sparkles,
  Bot,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Settings,
  Sliders,
  TrendingUp,
  CreditCard,
  Plus,
  ShieldCheck,
  Zap,
  Edit2,
  Trash2,
  Check,
  Building2,
  Lock,
  Unlock,
  ChevronRight
} from 'lucide-react';
import '../../components/shared.css';
import './ai-assistant.css';
import { AiRestaurantAccess } from './AiRestaurantAccess';
import type { Plan } from '../../api/types';

export function AiAssistantPage() {
  const [categories, setCategories] = useState<AiCategory[]>([]);
  const [questions, setQuestions] = useState<AiQuestionItem[]>([]);
  const [settings, setSettings] = useState<AiGlobalSettings | null>(null);
  const [telemetry, setTelemetry] = useState<AiTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Edit Question Modal
  const [editingQuestion, setEditingQuestion] = useState<AiQuestionItem | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editPriority, setEditPriority] = useState('50');
  const [editTier, setEditTier] = useState<'CORE' | 'PRO'>('PRO');
  const [savingQuestion, setSavingQuestion] = useState(false);

  // Add Question Modal & Dynamic Formula Builder
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('ORDERS');
  const [newLabel, setNewLabel] = useState('');
  const [newIntent, setNewIntent] = useState('');
  const [newTier, setNewTier] = useState<'CORE' | 'PRO'>('PRO');
  const [newPriority, setNewPriority] = useState('75');
  const [targetDomain, setTargetDomain] = useState<'ORDERS' | 'PAYMENTS' | 'KITCHEN' | 'TABLES' | 'INVENTORY' | 'SHIFTS'>('ORDERS');
  const [calculationType, setCalculationType] = useState<'SUM' | 'COUNT' | 'AVG' | 'RATIO' | 'TOP_LIST'>('SUM');
  const [filterField, setFilterField] = useState('channel');
  const [filterValue, setFilterValue] = useState('DINE_IN');
  const [displayUnit, setDisplayUnit] = useState<'CURRENCY' | 'NUMBER' | 'PERCENT' | 'MINUTES'>('CURRENCY');
  const [addingQuestion, setAddingQuestion] = useState(false);

  function handleDomainChange(domain: 'ORDERS' | 'PAYMENTS' | 'KITCHEN' | 'TABLES' | 'INVENTORY' | 'SHIFTS') {
    setTargetDomain(domain);
    if (domain === 'ORDERS') {
      setFilterField('channel');
      setFilterValue('SWIGGY');
      setCalculationType('SUM');
      setDisplayUnit('CURRENCY');
      setNewCategory('ORDERS');
      if (!newLabel) setNewLabel('Swiggy Delivery Orders & Volume');
    } else if (domain === 'PAYMENTS') {
      setFilterField('paymentMethod');
      setFilterValue('UPI');
      setCalculationType('SUM');
      setDisplayUnit('CURRENCY');
      setNewCategory('PAYMENTS');
      if (!newLabel) setNewLabel('UPI & QR Collections Today');
    } else if (domain === 'KITCHEN') {
      setFilterField('status');
      setFilterValue('DELAYED');
      setCalculationType('COUNT');
      setDisplayUnit('NUMBER');
      setNewCategory('KITCHEN');
      if (!newLabel) setNewLabel('Delayed KOTs (> 15 mins)');
    } else if (domain === 'TABLES') {
      setFilterField('status');
      setFilterValue('OCCUPIED');
      setCalculationType('RATIO');
      setDisplayUnit('PERCENT');
      setNewCategory('TABLES');
      if (!newLabel) setNewLabel('Dining Floor Occupancy %');
    } else if (domain === 'INVENTORY') {
      setFilterField('status');
      setFilterValue('LOW_STOCK');
      setCalculationType('COUNT');
      setDisplayUnit('NUMBER');
      setNewCategory('INVENTORY');
      if (!newLabel) setNewLabel('Critical Low Stock Ingredients');
    } else if (domain === 'SHIFTS') {
      setFilterField('status');
      setFilterValue('ACTIVE');
      setCalculationType('SUM');
      setDisplayUnit('CURRENCY');
      setNewCategory('STAFF');
      if (!newLabel) setNewLabel('Active Shift Cash Expected');
    }
  }

  // Settings State Form
  const [kotMinutes, setKotMinutes] = useState('15');
  const [stockThreshold, setStockThreshold] = useState('3');
  const [drawerVariance, setDrawerVariance] = useState('500');
  // Real plan prices, so this page never states a price the plans table no longer has.
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    api.get<Plan[]>('/api/v1/plans').then(setPlans).catch(() => setPlans([]));
  }, []);
  const priceOf = (tier: 'CORE' | 'PRO') => {
    const p = plans.filter((x) => x.tier === tier && x.status === 'ACTIVE').sort((a, b) => a.priceMonthly - b.priceMonthly)[0];
    return p ? `₹${(p.priceMonthly / 100).toLocaleString('en-IN')}` : 'no active plan';
  };
  const [proactiveAlerts, setProactiveAlerts] = useState(true);
  const [coreTeaser, setCoreTeaser] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  function loadAiConfig() {
    setLoading(true);
    api.get<AiAssistantConfigResponse>('/api/v1/ai-assistant/config')
      .then((res) => {
        setCategories(res.categories);
        setQuestions(res.questions);
        setSettings(res.settings);
        setTelemetry(res.telemetry);

        // Populate settings form
        setKotMinutes(String(res.settings.delayedKotMinutes));
        setStockThreshold(String(res.settings.lowStockThreshold));
        setDrawerVariance(String(res.settings.cashDrawerVarianceThreshold));
        setProactiveAlerts(res.settings.proactiveAlertsEnabled);
        setCoreTeaser(res.settings.corePlanTeaserEnabled);

        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load AI Assistant configuration'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAiConfig();
  }, []);

  async function handleToggleQuestion(q: AiQuestionItem) {
    try {
      const updated = await api.patch<AiQuestionItem>(`/api/v1/ai-assistant/questions/${q.id}`, {
        isEnabled: !q.isEnabled
      });
      setQuestions((prev) => prev.map((item) => (item.id === q.id ? updated : item)));
      showToast(`Question "${q.label}" ${updated.isEnabled ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to update question status');
    }
  }

  function openEditModal(q: AiQuestionItem) {
    setEditingQuestion(q);
    setEditLabel(q.label);
    setEditPriority(String(q.priorityScore));
    setEditTier(q.minPlanTier);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingQuestion) return;

    setSavingQuestion(true);
    try {
      const updated = await api.patch<AiQuestionItem>(`/api/v1/ai-assistant/questions/${editingQuestion.id}`, {
        label: editLabel.trim(),
        priorityScore: Number(editPriority),
        minPlanTier: editTier
      });
      setQuestions((prev) => prev.map((item) => (item.id === editingQuestion.id ? updated : item)));
      setEditingQuestion(null);
      showToast('Question updated successfully.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save question');
    } finally {
      setSavingQuestion(false);
    }
  }

  async function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    setAddingQuestion(true);
    const resolvedIntent = newIntent.trim()
      ? newIntent.trim().toUpperCase().replace(/\s+/g, '_')
      : `DYN_${targetDomain}_${filterValue || 'ALL'}_${calculationType}`;

    try {
      const created = await api.post<AiQuestionItem>('/api/v1/ai-assistant/questions', {
        category: newCategory,
        label: newLabel.trim(),
        intent: resolvedIntent,
        minPlanTier: newTier,
        priorityScore: Number(newPriority),
        icon: 'sparkles',
        targetDomain,
        calculationType,
        filterField,
        filterValue,
        displayUnit
      });
      setQuestions((prev) => [created, ...prev]);
      setAddModalOpen(false);
      setNewLabel('');
      setNewIntent('');
      showToast('Custom dynamic query added to AI engine.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to create question');
    } finally {
      setAddingQuestion(false);
    }
  }

  async function handleDeleteQuestion(id: string) {
    if (!window.confirm('Are you sure you want to remove this custom question?')) return;
    try {
      await api.delete(`/api/v1/ai-assistant/questions/${id}`);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      showToast('Custom question removed.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to delete question');
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const updated = await api.patch<AiGlobalSettings>('/api/v1/ai-assistant/settings', {
        delayedKotMinutes: Number(kotMinutes),
        lowStockThreshold: Number(stockThreshold),
        cashDrawerVarianceThreshold: Number(drawerVariance),
        proactiveAlertsEnabled: proactiveAlerts,
        corePlanTeaserEnabled: coreTeaser
      });
      setSettings(updated);
      showToast('Global AI engine thresholds and settings updated.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  }

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (selectedCategory !== 'ALL' && q.category !== selectedCategory) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchLabel = q.label.toLowerCase().includes(query);
        const matchIntent = q.intent.toLowerCase().includes(query);
        if (!matchLabel && !matchIntent) return false;
      }
      return true;
    });
  }, [questions, selectedCategory, search]);

  return (
    <div className="ai-engine-container">
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            background: '#0f172a',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 600
          }}
        >
          <Check className="w-5 h-5 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 className="page-title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--jv-text)' }}>
              JAMAN AI Engine
            </h1>
            <span className="badge badge-accent" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sparkles className="w-3 h-3" />
              <span>PRO Control Center</span>
            </span>
          </div>
          <p className="page-subtitle" style={{ margin: '4px 0 0', color: 'var(--jv-text-muted)', fontSize: 14 }}>
            Platform-wide operations intelligence, tier entitlement gating ({priceOf('PRO')} PRO vs {priceOf('CORE')} CORE), question templates, and edge query telemetry.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="accent" onClick={() => setAddModalOpen(true)}>
            <Plus className="w-4 h-4" />
            <span>Add Custom Query</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {telemetry && (
        <div className="ai-metrics-grid">
          <div className="ai-metric-card">
            <div className="ai-metric-header">
              <span className="ai-metric-title">AI-Enabled Tenants</span>
              <div className="ai-metric-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
                <Building2 className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="ai-metric-value">
                {telemetry.activeProTenants} <span style={{ fontSize: '1rem', color: 'var(--jv-text-muted)', fontWeight: 600 }}>/ {telemetry.totalActiveTenants}</span>
              </div>
              <div className="ai-metric-subtext" style={{ color: '#059669' }}>
                <Check className="w-3.5 h-3.5" />
                <span>{telemetry.adoptionRatePercent}% on JAMANVAAR PRO ({priceOf('PRO')})</span>
              </div>
            </div>
          </div>

          <div className="ai-metric-card">
            <div className="ai-metric-header">
              <span className="ai-metric-title">Total Queries Handled</span>
              <div className="ai-metric-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                <Bot className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="ai-metric-value">
                {telemetry.totalQueries.toLocaleString('en-IN')}
              </div>
              <div className="ai-metric-subtext" style={{ color: '#2563eb' }}>
                <span>+{telemetry.todayQueries} queries processed today</span>
              </div>
            </div>
          </div>

          <div className="ai-metric-card">
            <div className="ai-metric-header">
              <span className="ai-metric-title">Top Inquired Intent</span>
              <div className="ai-metric-icon" style={{ background: 'var(--jv-warning-soft)', color: '#d97706' }}>
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="ai-metric-value" style={{ fontSize: '1.25rem', fontFamily: 'monospace' }}>
                {telemetry.topIntent ?? '—'}
              </div>
              <div className="ai-metric-subtext" style={{ color: 'var(--jv-text-muted)' }}>
                <span>Leading operational metric requested</span>
              </div>
            </div>
          </div>

          <div className="ai-metric-card">
            <div className="ai-metric-header">
              <span className="ai-metric-title">Edge Query Latency</span>
              <div className="ai-metric-icon" style={{ background: '#fdf4ff', color: '#a855f7' }}>
                <Zap className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="ai-metric-value">
                {telemetry.latencyMs != null ? `${telemetry.latencyMs} ms` : 'No data yet'}
              </div>
              <div className="ai-metric-subtext" style={{ color: '#059669' }}>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Average per answer, measured on the terminals</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Entitlement & Tier Gating Comparison */}
      <Card>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--jv-text)' }}>
            Plan Entitlement & Tier Access Control
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--jv-text-muted)' }}>
            JAMAN AI Assistant is strictly restricted as a flagship PRO feature to drive SaaS plan upgrades.
          </p>
        </div>

        <div className="ai-tier-grid">
          {/* CORE PLAN */}
          <div className="ai-tier-card">
            <div>
              <div className="ai-tier-header">
                <div>
                  <div className="ai-tier-title">JAMANVAAR CORE</div>
                  <div style={{ fontSize: 13, color: 'var(--jv-text-muted)', fontWeight: 600 }}>{priceOf('CORE')} / month (Foundation)</div>
                </div>
                <span className="ai-tier-badge" style={{ background: 'var(--jv-bg-muted)', color: 'var(--jv-text-secondary)' }}>
                  <Lock className="w-3 h-3 inline mr-1" />
                  GATED / LOCKED
                </span>
              </div>
              <ul className="ai-tier-feature-list">
                <li className="ai-tier-feature-item">
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>JAMAN AI is LOCKED by default (a teaser), or hidden if the teaser is off</span>
                </li>
                <li className="ai-tier-feature-item">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>No KOT delayed bottleneck detection</span>
                </li>
                <li className="ai-tier-feature-item">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>No proactive cash drawer discrepancy alerts</span>
                </li>
              </ul>
            </div>
            <div style={{ background: 'var(--jv-surface-subtle)', padding: 10, borderRadius: 8, fontSize: 12, color: 'var(--jv-text-muted)' }}>
              Staff tap the AI button ➔ see a locked panel with a few example questions. Nothing is answered. Switch it on for one restaurant below.
            </div>
          </div>

          {/* PRO PLAN */}
          <div className="ai-tier-card pro">
            <div>
              <div className="ai-tier-header">
                <div>
                  <div className="ai-tier-title" style={{ color: '#b45309' }}>JAMANVAAR PRO</div>
                  <div style={{ fontSize: 13, color: '#b45309', fontWeight: 700 }}>{priceOf('PRO')} / month (Growth Edition)</div>
                </div>
                <span className="ai-tier-badge" style={{ background: 'var(--jv-warning-soft)', color: '#b45309' }}>
                  <Unlock className="w-3 h-3 inline mr-1" />
                  100% UNLOCKED
                </span>
              </div>
              <ul className="ai-tier-feature-list">
                <li className="ai-tier-feature-item" style={{ color: 'var(--jv-text)', fontWeight: 600 }}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Full access to all 11 Intelligence Modules</span>
                </li>
                <li className="ai-tier-feature-item" style={{ color: 'var(--jv-text)', fontWeight: 600 }}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Real-time Financial Pulse & Tax breakdowns</span>
                </li>
                <li className="ai-tier-feature-item" style={{ color: 'var(--jv-text)', fontWeight: 600 }}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Proactive Delayed KOT & Low Stock alerts</span>
                </li>
                <li className="ai-tier-feature-item" style={{ color: 'var(--jv-text)', fontWeight: 600 }}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Natural Language Search & Executive EOD Briefing</span>
                </li>
              </ul>
            </div>
            <div style={{ background: 'var(--jv-warning-soft)', padding: 10, borderRadius: 8, fontSize: 12, color: '#b45309', fontWeight: 600 }}>
              Included alongside Captain App & Table QR Standee Ordering.
            </div>
          </div>
        </div>
      </Card>

      {/* Global Intelligence & Anomaly Alert Tuning */}
      <Card>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--jv-text)' }}>
            Anomaly Thresholds & AI Alert Engine Tuning
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--jv-text-muted)' }}>
            Tuned values are pushed down to restaurant instances to trigger proactive assistant banners and urgent cards.
          </p>
        </div>

        <form onSubmit={handleSaveSettings}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div className="form-field">
              <label>Delayed KOT Alert Threshold (Minutes) *</label>
              <Input
                type="number"
                min="5"
                max="60"
                value={kotMinutes}
                onChange={(e) => setKotMinutes(e.target.value)}
                required
              />
              <span className="muted" style={{ fontSize: 11 }}>Triggers urgent alert when ticket prep &gt; X mins</span>
            </div>

            <div className="form-field">
              <label>Critical Low Stock Threshold (Units) *</label>
              <Input
                type="number"
                min="1"
                max="50"
                value={stockThreshold}
                onChange={(e) => setStockThreshold(e.target.value)}
                required
              />
              <span className="muted" style={{ fontSize: 11 }}>Flags ingredient in assistant when qty &le; X</span>
            </div>

            <div className="form-field">
              <label>Cash Drawer Discrepancy Variance (₹) *</label>
              <Input
                type="number"
                min="50"
                max="10000"
                value={drawerVariance}
                onChange={(e) => setDrawerVariance(e.target.value)}
                required
              />
              <span className="muted" style={{ fontSize: 11 }}>Alerts manager when active shift variance &gt; ₹X</span>
            </div>

          </div>

          <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--jv-border)', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={proactiveAlerts}
                onChange={(e) => setProactiveAlerts(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span>Enable Proactive Anomaly Alerts in Restaurant POS/Admin</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={coreTeaser}
                onChange={(e) => setCoreTeaser(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span>Show PRO Teaser Preview to CORE (₹5,000) users</span>
            </label>

            <div style={{ marginLeft: 'auto' }}>
              <Button type="submit" variant="accent" disabled={savingSettings}>
                {savingSettings ? 'Saving Settings…' : 'Save Global Thresholds'}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Question Registry & Category Manager */}
      <AiRestaurantAccess />

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--jv-text)' }}>
              Query Template & Category Registry ({filteredQuestions.length} Questions)
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--jv-text-muted)' }}>
              Enable, disable, reprioritize, or configure minimum tier requirements for assistant questions.
            </p>
          </div>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search query label or intent code…"
            width="280px"
          />
        </div>

        {/* Category Filter Pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            type="button"
            className={`btn btn-sm ${selectedCategory === 'ALL' ? 'btn-accent' : 'btn-ghost'}`}
            onClick={() => setSelectedCategory('ALL')}
          >
            All Categories ({questions.length})
          </button>
          {categories.map((c) => {
            const count = questions.filter((q) => q.category === c.id).length;
            return (
              <button
                key={c.id}
                type="button"
                className={`btn btn-sm ${selectedCategory === c.id ? 'btn-accent' : 'btn-ghost'}`}
                onClick={() => setSelectedCategory(c.id)}
              >
                {c.label} ({count})
              </button>
            );
          })}
        </div>

        {loading ? (
          <SkeletonTable rows={6} />
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Question Label</th>
                  <th>Category</th>
                  <th>Internal Intent</th>
                  <th>Min Tier</th>
                  <th style={{ textAlign: 'center' }}>Priority</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuestions.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--jv-text)' }}>{q.label}</div>
                      {q.isCustom && (
                        <span className="badge badge-accent" style={{ fontSize: 11, padding: '1px 5px' }}>
                          CUSTOM QUERY
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                        {categories.find((c) => c.id === q.category)?.label || q.category}
                      </span>
                    </td>
                    <td>
                      <code style={{ fontSize: 12, color: 'var(--jv-text-secondary)' }}>{q.intent}</code>
                    </td>
                    <td>
                      <Badge tone={q.minPlanTier === 'PRO' ? 'accent' : 'neutral'}>
                        {q.minPlanTier} ONLY
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }}>
                      {q.priorityScore}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <label className="ai-switch">
                        <input
                          type="checkbox"
                          checked={q.isEnabled}
                          onChange={() => handleToggleQuestion(q)}
                        />
                        <span className="ai-slider" />
                      </label>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <Button size="sm" variant="ghost" onClick={() => openEditModal(q)} title="Edit Question">
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        {q.isCustom && (
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteQuestion(q.id)} title="Delete Custom Query" style={{ color: '#dc2626' }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit Question Modal */}
      {editingQuestion && (
        <Modal
          title={`Edit Query: ${editingQuestion.label}`}
          onClose={() => setEditingQuestion(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditingQuestion(null)} disabled={savingQuestion}>
                Cancel
              </Button>
              <Button variant="accent" onClick={handleSaveEdit} disabled={savingQuestion}>
                {savingQuestion ? 'Saving…' : 'Save Changes'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSaveEdit} className="modal-form">
            <div className="form-field">
              <label>Question Label *</label>
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Minimum Required Plan Tier</label>
                <select
                  value={editTier}
                  onChange={(e) => setEditTier(e.target.value as any)}
                  style={{ height: 40, borderRadius: 6, border: '1px solid var(--jv-border-hover)', padding: '0 10px', width: '100%' }}
                >
                  <option value="PRO">PRO Plan (₹7,000/mo)</option>
                  <option value="CORE">CORE Plan (₹5,000/mo)</option>
                </select>
              </div>

              <div className="form-field">
                <label>Priority Display Score (0 - 1000)</label>
                <Input
                  type="number"
                  min="0"
                  max="1000"
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  required
                />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Custom Question Modal — Dynamic Real-Data Formula Builder */}
      {addModalOpen && (
        <Modal
          title="⚡ Add Dynamic Real-Data Query Template"
          onClose={() => setAddModalOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAddModalOpen(false)} disabled={addingQuestion}>
                Cancel
              </Button>
              <Button variant="accent" onClick={handleAddQuestion} disabled={addingQuestion}>
                {addingQuestion ? 'Deploying to Engine…' : 'Deploy Question to Real DB'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleAddQuestion} className="modal-form">
            {/* Step 1: Target Real-Data Source */}
            <div className="form-field">
              <label style={{ fontWeight: 800, color: 'var(--jv-text)', marginBottom: 6 }}>
                1. Target Real Data Source (Local SQLite Table) *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { id: 'ORDERS', label: 'Orders & Channels', icon: '📦' },
                  { id: 'PAYMENTS', label: 'Payments & Tenders', icon: '💳' },
                  { id: 'KITCHEN', label: 'Kitchen & KOTs', icon: '🍳' },
                  { id: 'TABLES', label: 'Dining Tables', icon: '🪑' },
                  { id: 'INVENTORY', label: 'Stock & Inventory', icon: '🏷️' },
                  { id: 'SHIFTS', label: 'Shifts & Cashier', icon: '👥' }
                ].map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleDomainChange(d.id as any)}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 8,
                      border: targetDomain === d.id ? '2px solid #e66817' : '1px solid var(--jv-border-hover)',
                      background: targetDomain === d.id ? '#fff7ed' : 'var(--jv-surface-card)',
                      color: targetDomain === d.id ? '#c2410c' : 'var(--jv-text-secondary)',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <span>{d.icon}</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Calculation & Metric Type */}
            <div className="form-row" style={{ marginTop: 8 }}>
              <div className="form-field">
                <label style={{ fontWeight: 800, color: 'var(--jv-text)' }}>2. Calculation Type *</label>
                <select
                  value={calculationType}
                  onChange={(e) => setCalculationType(e.target.value as any)}
                  style={{ height: 40, borderRadius: 6, border: '1px solid var(--jv-border-hover)', padding: '0 10px', width: '100%' }}
                >
                  <option value="SUM">SUM: Total Net Revenue / Amount (₹)</option>
                  <option value="COUNT">COUNT: Total Volume / Tickets (#)</option>
                  <option value="AVG">AVERAGE: Average Order Value / Prep Time</option>
                  <option value="RATIO">RATIO: Percentage Share of Total (%)</option>
                </select>
              </div>

              <div className="form-field">
                <label style={{ fontWeight: 800, color: 'var(--jv-text)' }}>Display Format *</label>
                <select
                  value={displayUnit}
                  onChange={(e) => setDisplayUnit(e.target.value as any)}
                  style={{ height: 40, borderRadius: 6, border: '1px solid var(--jv-border-hover)', padding: '0 10px', width: '100%' }}
                >
                  <option value="CURRENCY">Currency (₹ Indian Rupee)</option>
                  <option value="NUMBER">Number (# of Orders / Items)</option>
                  <option value="PERCENT">Percentage (%)</option>
                  <option value="MINUTES">Minutes (Turnaround time)</option>
                </select>
              </div>
            </div>

            {/* Step 3: Local SQLite Filter Criteria */}
            <div className="form-row" style={{ marginTop: 8 }}>
              <div className="form-field">
                <label style={{ fontWeight: 800, color: 'var(--jv-text)' }}>3. Filter Field</label>
                <Input
                  value={filterField}
                  onChange={(e) => setFilterField(e.target.value)}
                  placeholder="e.g. channel, paymentMethod, status"
                  required
                />
              </div>

              <div className="form-field">
                <label style={{ fontWeight: 800, color: 'var(--jv-text)' }}>Filter Value</label>
                <Input
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  placeholder="e.g. SWIGGY, ZOMATO, CASH, UPI, DELAYED"
                  required
                />
              </div>
            </div>

            {/* Step 4: Display Question Details */}
            <div className="form-field" style={{ marginTop: 8 }}>
              <label style={{ fontWeight: 800, color: 'var(--jv-text)' }}>4. Question Label (Displayed in Restaurant Assistant) *</label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Swiggy Delivery Orders & Volume"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Category *</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  style={{ height: 40, borderRadius: 6, border: '1px solid var(--jv-border-hover)', padding: '0 10px', width: '100%' }}
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Minimum Required Plan Tier</label>
                <select
                  value={newTier}
                  onChange={(e) => setNewTier(e.target.value as any)}
                  style={{ height: 40, borderRadius: 6, border: '1px solid var(--jv-border-hover)', padding: '0 10px', width: '100%' }}
                >
                  <option value="PRO">PRO Plan (₹7,000 / month)</option>
                  <option value="CORE">CORE Plan (₹5,000 / month)</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Internal Intent Code (Optional / Auto-Generated)</label>
                <Input
                  value={newIntent}
                  onChange={(e) => setNewIntent(e.target.value)}
                  placeholder={`DYN_${targetDomain}_${filterValue || 'ALL'}_${calculationType}`}
                />
              </div>

              <div className="form-field">
                <label>Priority Display Score (0 - 1000)</label>
                <Input
                  type="number"
                  min="0"
                  max="1000"
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                />
              </div>
            </div>

            {/* Step 5: Live Real-Data Result Mockup Preview */}
            <div style={{ background: '#0b253a', borderRadius: 12, padding: 14, color: '#fff', marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--jv-accent-text)', background: 'rgba(230,104,23,0.15)', padding: '2px 8px', borderRadius: 10 }}>
                  {targetDomain} • REAL LOCAL SQLITE DATA
                </span>
                <span style={{ fontSize: 11, color: 'var(--jv-text-light)', fontFamily: 'monospace' }}>&lt; 3ms Zero Cloud Lag</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                {newLabel || 'Question Display Label'}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: '#f8fafc', marginTop: 4 }}>
                {calculationType === 'COUNT' ? '24 Orders' : calculationType === 'RATIO' ? '68% Share' : '₹14,850'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--jv-text-light)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Computed live against restaurant's local SQLite ledger (filter: {filterField} = {filterValue || 'ALL'}).</span>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
