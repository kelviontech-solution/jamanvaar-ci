import { useEffect, useState } from 'react';
import { api, ApiError, API_BASE, getAccessToken } from '../../api/client';
import {
  PageHeader,
  Card,
  Badge,
  FilterTabs,
  SkeletonCard,
  SkeletonTable,
  EmptyState,
  ErrorState,
  Button
} from '../../components/ui';
import {
  BarChart3,
  TrendingUp,
  Store,
  Laptop2,
  Download,
  IndianRupee,
  Layers,
  Calendar
} from 'lucide-react';
import './reports.css';

interface SummaryData {
  restaurants: { total: number; active: number; suspended: number };
  branches: { total: number };
  devices: { total: number; active: number; offline: number };
  subscriptions: { total: number; active: number };
  revenue: { mrr: number; arr: number; collectedRevenue: number; outstandingReceivables: number };
}

interface RevenueData {
  byPlan: Array<{ tier: string; name: string; revenue: number; count: number }>;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    restaurantName: string;
    planName: string;
    total: number;
    status: string;
    issuedAt: string;
  }>;
}

interface RestaurantReportData {
  total: number;
  cityBreakdown: Array<{ city: string; count: number }>;
  list: Array<{
    id: string;
    name: string;
    city: string | null;
    status: string;
    branchCount: number;
    deviceCount: number;
    activePlan: string;
    createdAt: string;
  }>;
}

interface DeviceReportData {
  total: number;
  byType: Array<{ type: string; count: number }>;
  list: Array<{
    id: string;
    restaurantName: string;
    branchName: string;
    type: string;
    appVersion: string | null;
    status: string;
    lastSeenAt: string | null;
    syncStatus: string | null;
  }>;
}

interface SubscriptionReportData {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  list: Array<{
    id: string;
    restaurantName: string;
    planName: string;
    tier: string;
    status: string;
    startDate: string;
    expiresAt: string;
  }>;
}

type ReportTab = 'revenue' | 'restaurants' | 'devices' | 'subscriptions';
type DateRange = '7d' | '30d' | '90d' | 'all';

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('revenue');
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [restaurantData, setRestaurantData] = useState<RestaurantReportData | null>(null);
  const [deviceData, setDeviceData] = useState<DeviceReportData | null>(null);
  const [subData, setSubData] = useState<SubscriptionReportData | null>(null);

  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = () => {
    setLoading(true);
    setError(null);

    Promise.all([
      api.get<SummaryData>('/api/v1/platform/reports/summary'),
      api.get<RevenueData>('/api/v1/platform/reports/revenue'),
      api.get<RestaurantReportData>('/api/v1/platform/reports/restaurants'),
      api.get<DeviceReportData>('/api/v1/platform/reports/devices'),
      api.get<SubscriptionReportData>('/api/v1/platform/reports/subscriptions')
    ])
      .then(([sum, rev, rest, dev, sub]) => {
        setSummary(sum);
        setRevenue(rev);
        setRestaurantData(rest);
        setDeviceData(dev);
        setSubData(sub);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load platform reports');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const handleExport = async (type: string) => {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/platform/reports/export?type=${type}`, {
        credentials: 'include',
        headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}
      });
      if (!res.ok) throw new Error('Failed to export CSV');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jamanvaar_${type}_report_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showToast('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="reports-page-container">
      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}
      <PageHeader
        title="Platform Reports & Analytics"
        subtitle="Comprehensive SaaS telemetry, financial reconciliation, restaurant cohort growth, and device fleet operations."
        actions={
          <div className="reports-header-actions">
            <div className="date-range-selector">
              <Calendar className="w-4 h-4 text-secondary" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRange)}
                className="date-range-select"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last Quarter (90d)</option>
                <option value="all">All-Time Cohort</option>
              </select>
            </div>
            <Button
              variant="accent"
              icon={<Download className="w-4 h-4" />}
              disabled={exporting}
              onClick={() => handleExport(activeTab)}
            >
              {exporting ? 'Exporting...' : `Export ${activeTab.toUpperCase()} CSV`}
            </Button>
          </div>
        }
      />

      {/* KPI Overview Grid */}
      <div className="reports-kpi-grid">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : summary ? (
          <>
            <Card className="reports-kpi-card">
              <div className="kpi-icon-wrap kpi-icon-green">
                <IndianRupee className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="kpi-meta">
                <span className="kpi-label">Monthly Recurring Revenue</span>
                <span className="kpi-value">₹{summary.revenue.mrr.toLocaleString('en-IN')}</span>
                <span className="kpi-sub">ARR: ₹{summary.revenue.arr.toLocaleString('en-IN')}</span>
              </div>
            </Card>

            <Card className="reports-kpi-card">
              <div className="kpi-icon-wrap kpi-icon-orange">
                <Store className="w-5 h-5 text-amber-600" />
              </div>
              <div className="kpi-meta">
                <span className="kpi-label">Active Restaurants</span>
                <span className="kpi-value">{summary.restaurants.active}</span>
                <span className="kpi-sub">
                  {summary.restaurants.total} total · {summary.restaurants.suspended} suspended
                </span>
              </div>
            </Card>

            <Card className="reports-kpi-card">
              <div className="kpi-icon-wrap kpi-icon-blue">
                <Layers className="w-5 h-5 text-blue-600" />
              </div>
              <div className="kpi-meta">
                <span className="kpi-label">Active Subscriptions</span>
                <span className="kpi-value">{summary.subscriptions.active}</span>
                <span className="kpi-sub">{summary.subscriptions.total} total issued</span>
              </div>
            </Card>

            <Card className="reports-kpi-card">
              <div className="kpi-icon-wrap kpi-icon-purple">
                <Laptop2 className="w-5 h-5 text-purple-600" />
              </div>
              <div className="kpi-meta">
                <span className="kpi-label">Hardware Terminals</span>
                <span className="kpi-value">{summary.devices.active}</span>
                <span className="kpi-sub">
                  {summary.devices.offline} offline · {summary.devices.total} registered
                </span>
              </div>
            </Card>
          </>
        ) : null}
      </div>

      {/* Tabs Filter */}
      <div className="reports-tabs-bar">
        <FilterTabs
          options={[
            { id: 'revenue', label: 'Revenue Analytics' },
            { id: 'restaurants', label: 'Restaurant Cohorts' },
            { id: 'devices', label: 'Device Telemetry' },
            { id: 'subscriptions', label: 'Plan Distribution' }
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <div className="reports-tab-content">
          {/* 1. REVENUE ANALYTICS */}
          {activeTab === 'revenue' && revenue && (
            <div className="reports-revenue-section">
              <div className="revenue-breakdown-grid">
                {revenue.byPlan.map((p) => (
                  <Card key={p.tier} className="plan-revenue-card">
                    <div className="plan-card-header">
                      <span className="plan-name">{p.name}</span>
                      <Badge tone={p.tier === 'PRO' ? 'accent' : 'neutral'}>{p.tier}</Badge>
                    </div>
                    <div className="plan-revenue-val">₹{p.revenue.toLocaleString('en-IN')}</div>
                    <div className="plan-card-footer">
                      <span>{p.count} Invoices generated</span>
                      <span className="plan-price-tag">
                        {p.tier === 'CORE' ? '₹5,000/mo' : '₹7,000/mo'}
                      </span>
                    </div>
                  </Card>
                ))}

                <Card className="revenue-collection-card">
                  <div className="collection-header">Financial Reconciliation Status</div>
                  <div className="collection-meters">
                    <div className="meter-item">
                      <span className="meter-label">Collected Collections</span>
                      <span className="meter-value text-emerald-600">
                        ₹{(summary?.revenue.collectedRevenue ?? 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="meter-item">
                      <span className="meter-label">Outstanding Invoiced Receivables</span>
                      <span className="meter-value text-amber-600">
                        ₹{(summary?.revenue.outstandingReceivables ?? 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                  <div className="gateway-notice-text">
                    * Automated payment gateway reconciliations reflect verified bank and card settlements.
                  </div>
                </Card>
              </div>

              <div className="reports-table-card">
                <div className="table-card-title">Recent Tax Invoices</div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Restaurant</th>
                        <th>Plan</th>
                        <th>Total Amount</th>
                        <th>Status</th>
                        <th>Date Issued</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenue.recentInvoices.map((inv) => (
                        <tr key={inv.id}>
                          <td className="font-mono font-medium">{inv.invoiceNumber}</td>
                          <td className="font-semibold">{inv.restaurantName}</td>
                          <td>
                            <Badge tone={inv.planName.includes('PRO') ? 'accent' : 'neutral'}>
                              {inv.planName}
                            </Badge>
                          </td>
                          <td className="font-bold">₹{inv.total.toLocaleString('en-IN')}</td>
                          <td>
                            <Badge
                              tone={
                                inv.status === 'PAID'
                                  ? 'success'
                                  : inv.status === 'OVERDUE'
                                  ? 'error'
                                  : 'warning'
                              }
                            >
                              {inv.status}
                            </Badge>
                          </td>
                          <td className="text-secondary text-sm">
                            {new Date(inv.issuedAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. RESTAURANT COHORTS */}
          {activeTab === 'restaurants' && restaurantData && (
            <div className="reports-restaurants-section">
              <div className="city-distribution-card">
                <div className="table-card-title">Geographic Footprint by City</div>
                <div className="city-pills-row">
                  {restaurantData.cityBreakdown.map((c) => (
                    <div key={c.city} className="city-pill">
                      <span className="city-name">{c.city}</span>
                      <span className="city-badge">{c.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="reports-table-card">
                <div className="table-card-title">Recent Restaurant Onboardings</div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Restaurant</th>
                        <th>City</th>
                        <th>Status</th>
                        <th>Branches</th>
                        <th>Devices</th>
                        <th>Active Tier</th>
                        <th>Onboarded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restaurantData.list.map((r) => (
                        <tr key={r.id}>
                          <td className="font-semibold">{r.name}</td>
                          <td>{r.city ?? '—'}</td>
                          <td>
                            <Badge tone={r.status === 'ACTIVE' ? 'success' : 'error'}>{r.status}</Badge>
                          </td>
                          <td>{r.branchCount}</td>
                          <td>{r.deviceCount}</td>
                          <td>
                            <Badge tone={r.activePlan.includes('PRO') ? 'accent' : 'neutral'}>
                              {r.activePlan}
                            </Badge>
                          </td>
                          <td className="text-secondary text-sm">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 3. DEVICE TELEMETRY */}
          {activeTab === 'devices' && deviceData && (
            <div className="reports-devices-section">
              <div className="device-types-grid">
                {deviceData.byType.map((d) => (
                  <Card key={d.type} className="device-type-card">
                    <span className="device-type-title">{d.type}</span>
                    <span className="device-type-count">{d.count}</span>
                    <span className="device-type-sub">Terminals</span>
                  </Card>
                ))}
              </div>

              <div className="reports-table-card">
                <div className="table-card-title">Hardware Fleet Status</div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Device ID</th>
                        <th>Restaurant</th>
                        <th>Branch</th>
                        <th>Type</th>
                        <th>Version</th>
                        <th>Status</th>
                        <th>Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deviceData.list.length === 0 ? (
                        <tr>
                          <td colSpan={7}>
                            <EmptyState
                              icon={<Laptop2 className="w-8 h-8 text-secondary" />}
                              title="No Hardware Devices Registered Yet"
                              description="Registered POS terminals, Captain tablets, and KDS devices will report their real-time telemetry here."
                            />
                          </td>
                        </tr>
                      ) : (
                        deviceData.list.map((d) => (
                          <tr key={d.id}>
                            <td className="font-mono text-xs">{d.id.slice(0, 13)}…</td>
                            <td className="font-medium">{d.restaurantName}</td>
                            <td>{d.branchName}</td>
                            <td>
                              <Badge tone="accent">{d.type}</Badge>
                            </td>
                            <td className="font-mono text-xs">{d.appVersion ?? 'v1.0.0'}</td>
                            <td>
                              <Badge tone={d.status === 'ACTIVE' ? 'success' : 'neutral'}>
                                {d.status}
                              </Badge>
                            </td>
                            <td className="text-secondary text-xs">
                              {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 4. SUBSCRIPTION DISTRIBUTION */}
          {activeTab === 'subscriptions' && subData && (
            <div className="reports-subscriptions-section">
              <div className="sub-status-grid">
                {subData.byStatus.map((s) => (
                  <Card key={s.status} className="sub-status-card">
                    <span className="sub-status-label">{s.status}</span>
                    <span className="sub-status-count">{s.count}</span>
                    <span className="sub-status-sub">Subscriptions</span>
                  </Card>
                ))}
              </div>

              <div className="reports-table-card">
                <div className="table-card-title">Active Platform Subscriptions</div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Restaurant</th>
                        <th>Plan Name</th>
                        <th>Tier</th>
                        <th>Status</th>
                        <th>Start Date</th>
                        <th>Renewal Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subData.list.map((s) => (
                        <tr key={s.id}>
                          <td className="font-semibold">{s.restaurantName}</td>
                          <td>{s.planName}</td>
                          <td>
                            <Badge tone={s.tier === 'PRO' ? 'accent' : 'neutral'}>{s.tier}</Badge>
                          </td>
                          <td>
                            <Badge tone={s.status === 'ACTIVE' ? 'success' : 'warning'}>
                              {s.status}
                            </Badge>
                          </td>
                          <td className="text-secondary text-sm">
                            {new Date(s.startDate).toLocaleDateString()}
                          </td>
                          <td className="text-secondary text-sm">
                            {new Date(s.expiresAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
