import React, { useEffect, useMemo, useState } from 'react';
// Deep import, not the '@jamanvaar/ui' barrel (see layout/ProtectedLayout.tsx).
import { printElement } from '../../../../../packages/ui/src/printElement';
import { api, ApiError } from '../../api/client';
import type { Invoice, BillingSummary, RestaurantCore, Plan, PaymentMethod, ReceiptData } from '../../api/types';
import {
  Card,
  EmptyState,
  Badge,
  type BadgeTone,
  Button,
  Modal,
  Input,
  SearchBar,
  FilterTabs,
  SkeletonTable
} from '../../components/ui';
import {
  CreditCard,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Receipt,
  Download,
  Printer,
  XCircle,
  TrendingUp,
  FileText,
  ShieldCheck,
  Building2,
  RefreshCw,
  Eye,
  Check
} from 'lucide-react';
import { exportRowsToCsv } from '../../lib/csvExport';
import { fetchAllPages } from '../../lib/fetchAll';
import { useDebounced, usePagedList } from '../../hooks/usePagedList';
import { Pager } from '../../components/Pager';
import '../../components/shared.css';
import '../Dashboard/dashboard.css';
import './billing.css';

type InvoiceFilterStatus = 'ALL' | 'ISSUED' | 'PAID' | 'PAST_DUE' | 'VOID';

interface ReceivableRow {
  restaurantId: string;
  restaurantName: string;
  outstanding: number;
  overdue: number;
  unpaidInvoices: number;
  oldestDue: string | null;
  lastPaymentAt: string | null;
  nextRenewal: string | null;
}

const inr0 = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export function BillingPage() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Search and Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceFilterStatus>('ALL');
  // BUG-051: receivables by restaurant first; the invoice table is searched, filtered and paged on the server.
  const [tab, setTab] = useState<'RECEIVABLES' | 'INVOICES'>('RECEIVABLES');
  const debouncedSearch = useDebounced(search);
  const invoiceList = usePagedList<Invoice, { statusCounts: Record<string, number> }>(
    '/api/v1/invoices',
    {
      q: debouncedSearch,
      // "Overdue" is one rule (unpaid and past its due date), not just the stored PAST_DUE status.
      status: statusFilter === 'ALL' || statusFilter === 'PAST_DUE' ? undefined : statusFilter,
      overdue: statusFilter === 'PAST_DUE' ? 'true' : undefined
    },
    25,
    tab === 'INVOICES'
  );
  const receivables = usePagedList<ReceivableRow>('/api/v1/invoices/receivables', { q: debouncedSearch }, 25, tab === 'RECEIVABLES');
  const invoices = invoiceList.items;
  const loading = (tab === 'INVOICES' ? invoiceList.loading : receivables.loading) && summary === null;
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Issue Invoice Modal
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [restaurants, setRestaurants] = useState<RestaurantCore[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [issueRestaurantId, setIssueRestaurantId] = useState('');
  const [issuePlanId, setIssuePlanId] = useState('');
  const [issueAmount, setIssueAmount] = useState('');
  const [issueTax, setIssueTax] = useState('');
  const [issueDueDate, setIssueDueDate] = useState('');
  const [issueNotes, setIssueNotes] = useState('');
  const [issuing, setIssuing] = useState(false);

  // Record Payment Modal
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);

  // View Tax Invoice Modal
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);

  // View Payment Receipt Modal
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  // Automated Renewals Check
  const [runningRenewals, setRunningRenewals] = useState(false);

  // Action Menu
  const [actionMenuInvoiceId, setActionMenuInvoiceId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  function loadBillingData() {
    invoiceList.reload();
    receivables.reload();
    api
      .get<BillingSummary>('/api/v1/invoices/summary')
      .then((summaryData) => {
        setSummary(summaryData);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load billing records'));
  }

  useEffect(() => {
    loadBillingData();
  }, []);

  useEffect(() => {
    if (!actionMenuInvoiceId) return;
    const close = () => setActionMenuInvoiceId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [actionMenuInvoiceId]);

  function openIssueModal() {
    api.get<RestaurantCore[]>('/api/v1/restaurants').then(setRestaurants).catch(() => {});
    api.get<Plan[]>('/api/v1/plans').then((all) => {
      setPlans(all);
      const pro = all.find((p) => p.tier === 'PRO') || all[0];
      if (pro) {
        setIssuePlanId(pro.id);
        const amt = pro.priceMonthly / 100;
        setIssueAmount(String(amt));
        setIssueTax(String(Math.round(amt * 0.18)));
      }
    }).catch(() => {});

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    setIssueDueDate(nextWeek.toISOString().slice(0, 10));
    setIssueModalOpen(true);
  }

  async function handleIssueInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!issueRestaurantId) return;

    setIssuing(true);
    try {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const baseAmt = Math.round(Number(issueAmount) * 100);
      const taxAmt = Math.round(Number(issueTax) * 100);

      await api.post('/api/v1/invoices', {
        restaurantId: issueRestaurantId,
        planId: issuePlanId || undefined,
        amount: baseAmt,
        taxAmount: taxAmt,
        dueDate: new Date(issueDueDate).toISOString(),
        billingPeriodStart: now.toISOString(),
        billingPeriodEnd: end.toISOString(),
        notes: issueNotes.trim() || undefined
      });

      setIssueModalOpen(false);
      showToast('Statutory tax invoice issued successfully');
      loadBillingData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to issue invoice');
    } finally {
      setIssuing(false);
    }
  }

  function openPaymentModal(invoice: Invoice) {
    setPaymentModalInvoice(invoice);
    const paidPaise = invoice.payments?.reduce((s, p) => s + p.amount, 0) || 0;
    const remainingPaise = Math.max(0, invoice.totalAmount - paidPaise);
    setPaymentAmount(String(remainingPaise / 100));
    setPaymentMethod('UPI');
    setPaymentRef('');
    setPaymentNotes('');
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentModalInvoice) return;

    setRecordingPayment(true);
    try {
      const res = await api.post<{ invoice: Invoice; payment: { id: string; receiptNumber?: string } }>(
        `/api/v1/invoices/${paymentModalInvoice.id}/payments`,
        {
          amount: Math.round(Number(paymentAmount) * 100),
          method: paymentMethod,
          referenceNumber: paymentRef.trim() || undefined,
          notes: paymentNotes.trim() || undefined
        }
      );

      setPaymentModalInvoice(null);
      const rcpNum = res?.payment?.receiptNumber;
      showToast(`Payment recorded! Official Receipt ${rcpNum || ''} issued.`);
      loadBillingData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  }

  async function handleViewReceipt(invoiceId: string) {
    setLoadingReceipt(true);
    try {
      const data = await api.get<ReceiptData>(`/api/v1/invoices/${invoiceId}/receipt`);
      setReceiptData(data);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No completed payment receipt found for this invoice');
    } finally {
      setLoadingReceipt(false);
    }
  }

  async function handleRunRenewalCheck() {
    setRunningRenewals(true);
    try {
      const res = await api.post<{ scannedCount: number; invoicesGeneratedCount: number; generatedInvoiceNumbers: string[]; markedPastDueCount: number }>(
        '/api/v1/invoices/check-renewals',
        {}
      );
      showToast(
        `Renewal scan complete: ${res.scannedCount} reviewed, ${res.invoicesGeneratedCount} renewal invoice(s) generated, ${res.markedPastDueCount} flagged past-due.`
      );
      loadBillingData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to execute renewal check');
    } finally {
      setRunningRenewals(false);
    }
  }

  async function handleUpdateInvoiceStatus(invoice: Invoice, status: 'VOID' | 'REFUNDED') {
    setActionMenuInvoiceId(null);
    const verb = status === 'VOID' ? 'void' : 'mark as refunded';
    if (!window.confirm(`Are you sure you want to ${verb} invoice ${invoice.invoiceNumber}? This action cannot be undone.`)) {
      return;
    }
    setUpdatingStatusId(invoice.id);
    try {
      await api.patch(`/api/v1/invoices/${invoice.id}/status`, { status });
      showToast(`Invoice ${invoice.invoiceNumber} updated to ${status}.`);
      loadBillingData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${verb} invoice`);
    } finally {
      setUpdatingStatusId(null);
    }
  }

  function getStatusTone(status: string): BadgeTone {
    switch (status) {
      case 'PAID':
        return 'success';
      case 'ISSUED':
        return 'accent';
      case 'PAST_DUE':
        return 'error';
      case 'VOID':
      case 'REFUNDED':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  const filteredInvoices = invoices;

  async function handleExportCsv() {
    setExporting(true);
    let rows: Invoice[];
    try {
      // Every invoice matching the filters, not just the page on screen.
      rows = (await fetchAllPages<Invoice>('/api/v1/invoices', {
        q: debouncedSearch,
        status: statusFilter === 'ALL' || statusFilter === 'PAST_DUE' ? undefined : statusFilter,
        overdue: statusFilter === 'PAST_DUE' ? 'true' : undefined
      })).rows;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export failed');
      setExporting(false);
      return;
    }
    setExporting(false);
    exportRowsToCsv(`jamanvaar_invoices_${new Date().toISOString().slice(0, 10)}.csv`, rows, [
      { header: 'Invoice #', value: (i) => i.invoiceNumber },
      { header: 'Restaurant', value: (i) => i.restaurant?.name || '' },
      { header: 'Plan', value: (i) => i.plan?.name || 'Custom Fee' },
      { header: 'Amount (₹)', value: (i) => (i.amount / 100).toFixed(2) },
      { header: 'Tax (₹)', value: (i) => (i.taxAmount / 100).toFixed(2) },
      { header: 'Total (₹)', value: (i) => (i.totalAmount / 100).toFixed(2) },
      { header: 'Due Date', value: (i) => i.dueDate.slice(0, 10) },
      { header: 'Status', value: (i) => i.status },
      { header: 'Paid At', value: (i) => (i.paidAt ? i.paidAt.slice(0, 10) : 'Unpaid') }
    ]);
  }

  const statusCounts = invoiceList.extra?.statusCounts;
  const issuedCount = statusCounts?.ISSUED;
  const paidCount = statusCounts?.PAID;
  const overdueCount = summary?.overdueInvoices ?? summary?.pastDueInvoices;

  return (
    <div className="billing-container">
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

      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
            Invoices & Billing
          </h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Commercial SaaS receivables, statutory GST 18% tax invoices, and verified payment reconciliations.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="ghost"
            onClick={handleRunRenewalCheck}
            disabled={runningRenewals}
            title="Renewal invoices are also issued automatically; this runs the scan right now"
          >
            <RefreshCw className={`w-4 h-4 ${runningRenewals ? 'animate-spin' : ''}`} />
            <span>{runningRenewals ? 'Scanning…' : 'Check Renewals'}</span>
          </Button>
          <Button variant="ghost" onClick={handleExportCsv} disabled={exporting || tab !== 'INVOICES' || invoiceList.total === 0}>
            <Download className="w-4 h-4" />
            <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
          </Button>
          <Button variant="accent" onClick={openIssueModal}>
            <Plus className="w-4 h-4" />
            <span>Issue Invoice</span>
          </Button>
        </div>
      </div>

      {/* Payment Gateway Status Banner */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          fontSize: 13,
          color: '#475569'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, flex: '1 1 260px' }}>
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" style={{ marginTop: 2 }} />
          <span>
            <strong>How payments work:</strong> payments for these invoices are recorded by hand (bank transfer or UPI) using Record Payment. Renewal invoices and overdue marking run automatically every 15 minutes.
          </span>
        </div>
      </div>

      {error && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Summary KPI Cards (Derived from real backend data) */}
      {loading ? (
        <div className="billing-metrics-grid">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="stat-tile">
              <div style={{ height: 72 }} />
            </Card>
          ))}
        </div>
      ) : summary && (
        <div className="billing-metrics-grid">
          <div className="billing-metric-card">
            <div className="billing-metric-header">
              <span className="billing-metric-title">Reconciled Collections</span>
              <div className="billing-metric-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="billing-metric-value">
                ₹{summary.totalCollected.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
              <div className="billing-metric-subtext" style={{ color: '#059669' }}>
                <Check className="w-3.5 h-3.5" />
                <span>{summary.collectionRatePercent ?? 0}% of billed amount collected</span>
              </div>
            </div>
          </div>

          <div className="billing-metric-card">
            <div className="billing-metric-header">
              <span className="billing-metric-title">Invoiced Receivables</span>
              <div className="billing-metric-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="billing-metric-value" style={{ color: summary.pendingAmount > 0 ? '#b45309' : '#0f172a' }}>
                ₹{summary.pendingAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
              <div className="billing-metric-subtext" style={{ color: '#64748b' }}>
                <span>{summary.pendingInvoices} Awaiting Tenant Payment</span>
              </div>
            </div>
          </div>

          <div className="billing-metric-card">
            <div className="billing-metric-header">
              <span className="billing-metric-title">Settled Invoices</span>
              <div className="billing-metric-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="billing-metric-value">
                {summary.paidInvoices} <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 600 }}>/ {summary.totalInvoices} Total</span>
              </div>
              <div className="billing-metric-subtext" style={{ color: '#2563eb' }}>
                <span>{summary.collectionRatePercent ?? (summary.totalInvoices > 0 ? Math.round((summary.paidInvoices / summary.totalInvoices) * 100) : 0)}% Collection Rate</span>
              </div>
            </div>
          </div>

          <div className="billing-metric-card">
            <div className="billing-metric-header">
              <span className="billing-metric-title">Overdue Invoices</span>
              <div className="billing-metric-icon" style={{ background: (overdueCount ?? 0) > 0 ? '#fef2f2' : '#f8fafc', color: (overdueCount ?? 0) > 0 ? '#dc2626' : '#94a3b8' }}>
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="billing-metric-value" style={{ color: (overdueCount ?? 0) > 0 ? '#dc2626' : '#0f172a' }}>
                {overdueCount ?? 0}
              </div>
              <div className="billing-metric-subtext" style={{ color: (overdueCount ?? 0) > 0 ? '#dc2626' : '#64748b' }}>
                <span>{(overdueCount ?? 0) > 0 ? `${inr0(summary.overdueAmount ?? 0)} overdue` : 'All Accounts Current'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {summary?.ageing && (summary.overdueAmount ?? 0) > 0 && (
        <div className="banner" style={{ marginBottom: 12, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }} aria-label="Overdue by age">
          <strong>Overdue by age:</strong>
          {(['0-30', '31-60', '61-90', '90+'] as const).map((b) => (
            <span key={b}>{b} days: <strong>{inr0(summary.ageing![b])}</strong></span>
          ))}
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 8 }}>
        <FilterTabs<'RECEIVABLES' | 'INVOICES'>
          value={tab}
          onChange={setTab}
          options={[
            { id: 'RECEIVABLES', label: 'Who owes' },
            { id: 'INVOICES', label: 'All invoices' }
          ]}
        />
      </div>

      {/* Search & Filter Toolbar */}
      <div className="toolbar" style={{ marginTop: 8, flexWrap: 'wrap', gap: 12 }}>
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by invoice #, restaurant, or plan…"
          width="320px"
        />

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setFiltersOpen((prev) => !prev)}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Filters</span>
          {statusFilter !== 'ALL' && (
            <span className="badge badge-accent" style={{ fontSize: 10, padding: '1px 6px' }}>1</span>
          )}
        </button>

        {statusFilter !== 'ALL' && (
          <span
            className="badge badge-neutral"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}
            onClick={() => setStatusFilter('ALL')}
            title="Remove this filter"
          >
            Status: {statusFilter} ✕
          </span>
        )}

        {(search || statusFilter !== 'ALL') && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
              setFiltersOpen(false);
            }}
          >
            Clear filters
          </button>
        )}

        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {tab === 'INVOICES' ? `${invoiceList.total} invoice${invoiceList.total === 1 ? '' : 's'}` : `${receivables.total} restaurant${receivables.total === 1 ? '' : 's'} with unpaid invoices`}
        </span>
      </div>

      {filtersOpen && (
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <FilterTabs<InvoiceFilterStatus>
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { id: 'ALL', label: 'All Invoices', count: statusCounts ? Object.values(statusCounts).reduce((a, b) => a + b, 0) : undefined },
              { id: 'ISSUED', label: 'Pending', count: issuedCount },
              { id: 'PAID', label: 'Paid', count: paidCount },
              { id: 'PAST_DUE', label: 'Overdue', count: overdueCount },
              { id: 'VOID', label: 'Void / Cancelled' }
            ]}
          />
        </div>
      )}

      {tab === 'RECEIVABLES' && (
        <Card>
          {receivables.items.length === 0 ? (
            <EmptyState
              icon={<Receipt className="w-6 h-6 text-slate-400" />}
              title={receivables.loading ? 'Loading…' : search ? 'No matching restaurants' : 'Nothing owed'}
              description={search ? 'Try a different search.' : 'Every issued invoice has been paid.'}
            />
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Restaurant</th>
                    <th>Outstanding</th>
                    <th>Overdue</th>
                    <th>Unpaid invoices</th>
                    <th>Oldest due</th>
                    <th>Last payment</th>
                    <th>Next renewal</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {receivables.items.map((r) => (
                    <tr key={r.restaurantId}>
                      <td style={{ fontWeight: 700 }}>{r.restaurantName}</td>
                      <td>{inr0(r.outstanding)}</td>
                      <td style={{ color: r.overdue > 0 ? '#dc2626' : undefined, fontWeight: r.overdue > 0 ? 700 : undefined }}>{r.overdue > 0 ? inr0(r.overdue) : '—'}</td>
                      <td>{r.unpaidInvoices}</td>
                      <td>{r.oldestDue ? new Date(r.oldestDue).toLocaleDateString('en-IN') : '—'}</td>
                      <td>{r.lastPaymentAt ? new Date(r.lastPaymentAt).toLocaleDateString('en-IN') : 'None yet'}</td>
                      <td>{r.nextRenewal ? new Date(r.nextRenewal).toLocaleDateString('en-IN') : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Button size="sm" variant="ghost" onClick={() => { setSearch(r.restaurantName); setStatusFilter('ALL'); setTab('INVOICES'); }}>
                          View invoices
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Invoices List Table */}
      {tab === 'INVOICES' && (<>
      <Card>
        {loading ? (
          <SkeletonTable rows={5} />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-6 h-6 text-slate-400" />}
            title={invoiceList.total === 0 && !search && statusFilter === 'ALL' ? 'No invoices issued' : 'No matching invoices'}
            description={
              invoiceList.total === 0 && !search && statusFilter === 'ALL'
                ? 'Assign a subscription or click "Issue Invoice" to issue a statutory billing record.'
                : 'Try changing your search query or status filter.'
            }
            action={
              search || statusFilter !== 'ALL' ? (
                <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('ALL'); }}>
                  Reset Filters
                </Button>
              ) : (
                <Button variant="accent" onClick={openIssueModal}>
                  Issue First Invoice
                </Button>
              )
            }
          />
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Restaurant</th>
                  <th>Plan</th>
                  <th>Amount (₹)</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const hasPayments = inv.payments && inv.payments.length > 0;
                  const isPaid = inv.status === 'PAID';
                  return (
                    <tr key={inv.id}>
                      <td>
                        <button
                          type="button"
                          className="table-link"
                          style={{
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: '#2563eb'
                          }}
                          onClick={() => setViewInvoice(inv)}
                          title="View statutory GST invoice"
                        >
                          {inv.invoiceNumber}
                        </button>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {inv.restaurant?.name || 'Unknown Restaurant'}
                        </div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {inv.restaurant?.city || 'India'}
                          {inv.restaurant?.gstin ? ` • GSTIN: ${inv.restaurant.gstin}` : ''}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#334155' }}>
                          {inv.plan?.name || 'Custom Fee'}
                        </span>
                        {inv.plan?.tier && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            Tier: {inv.plan.tier}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong style={{ fontFamily: 'monospace', fontSize: 14, color: '#0f172a' }}>
                          ₹{(inv.totalAmount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </strong>
                        <div className="muted" style={{ fontSize: 11 }}>
                          ₹{(inv.amount / 100).toLocaleString('en-IN')} + ₹{(inv.taxAmount / 100).toLocaleString('en-IN')} GST
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 13, color: '#334155' }}>
                          {new Date(inv.dueDate).toLocaleDateString('en-IN')}
                        </div>
                        {inv.status === 'ISSUED' && new Date(inv.dueDate) < new Date() && (
                          <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>OVERDUE</div>
                        )}
                      </td>
                      <td>
                        <Badge tone={getStatusTone(inv.status)} pulse={isPaid}>
                          {inv.status}
                        </Badge>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, position: 'relative', alignItems: 'center' }}>
                          {!isPaid && inv.status !== 'VOID' && inv.status !== 'REFUNDED' && (
                            <Button size="sm" variant="accent" onClick={() => openPaymentModal(inv)}>
                              Record Payment
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setViewInvoice(inv)} title="View Statutory GST Invoice">
                            <FileText className="w-3.5 h-3.5" />
                            <span>Invoice</span>
                          </Button>
                          {(isPaid || hasPayments) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleViewReceipt(inv.id)}
                              disabled={loadingReceipt}
                              title="View Official Payment Receipt"
                              style={{ color: '#059669', borderColor: '#a7f3d0' }}
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Receipt</span>
                            </Button>
                          )}

                          {inv.status !== 'VOID' && inv.status !== 'REFUNDED' && (
                            <>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                title="More actions"
                                disabled={updatingStatusId === inv.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionMenuInvoiceId(actionMenuInvoiceId === inv.id ? null : inv.id);
                                }}
                              >
                                ⋮
                              </button>
                              {actionMenuInvoiceId === inv.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    position: 'absolute',
                                    right: 0,
                                    top: '100%',
                                    marginTop: 4,
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 8,
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                    zIndex: 30,
                                    minWidth: 160
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateInvoiceStatus(inv, 'VOID')}
                                    style={{
                                      display: 'block',
                                      width: '100%',
                                      textAlign: 'left',
                                      padding: '8px 12px',
                                      fontSize: 12,
                                      fontWeight: 600,
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      color: '#475569'
                                    }}
                                  >
                                    Void Invoice
                                  </button>
                                  {isPaid && (
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateInvoiceStatus(inv, 'REFUNDED')}
                                      style={{
                                        display: 'block',
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '8px 12px',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#dc2626',
                                        borderTop: '1px solid #f1f5f9'
                                      }}
                                    >
                                      Mark as Refunded
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </>)}

      {tab === 'RECEIVABLES' && receivables.total > 0 && (
        <Pager page={receivables.page} pageSize={receivables.pageSize} total={receivables.total} totalPages={receivables.totalPages} loading={receivables.loading} onPage={receivables.setPage} />
      )}
      {tab === 'INVOICES' && invoiceList.total > 0 && (
        <Pager page={invoiceList.page} pageSize={invoiceList.pageSize} total={invoiceList.total} totalPages={invoiceList.totalPages} loading={invoiceList.loading} onPage={invoiceList.setPage} />
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: STATUTORY A4 GST TAX INVOICE PREVIEW
          ───────────────────────────────────────────────────────────── */}
      {viewInvoice && (
        <Modal
          title={`Statutory Tax Invoice — ${viewInvoice.invoiceNumber}`}
          onClose={() => setViewInvoice(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {viewInvoice.status !== 'PAID' && (
                  <Button
                    variant="accent"
                    onClick={() => {
                      const inv = viewInvoice;
                      setViewInvoice(null);
                      openPaymentModal(inv);
                    }}
                  >
                    Record Payment
                  </Button>
                )}
                {(viewInvoice.status === 'PAID' || (viewInvoice.payments && viewInvoice.payments.length > 0)) && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const id = viewInvoice.id;
                      setViewInvoice(null);
                      handleViewReceipt(id);
                    }}
                  >
                    <Receipt className="w-4 h-4" />
                    <span>View Receipt</span>
                  </Button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" onClick={() => setViewInvoice(null)}>
                  Close
                </Button>
                <Button variant="accent" onClick={() => printElement('[data-print-doc="platform-invoice"]', { title: 'Invoice', pageSize: 'A4 portrait' })}>
                  <Printer className="w-4 h-4" />
                  <span>Print Invoice (A4)</span>
                </Button>
              </div>
            </div>
          }
        >
          <div className="doc-sheet print-surface" data-print-doc="platform-invoice">
            {/* Header / Brand */}
            <div className="doc-brand-header">
              <div>
                <div className="doc-brand-title">
                  <Building2 className="w-7 h-7 text-amber-500" />
                  <span>JAMANVAAR</span>
                </div>
                <div className="doc-brand-tagline">KELVIONTECH PRIVATE LIMITED</div>
                <div className="doc-brand-meta">
                  Plot 42, Science City Road, Sola, Ahmedabad, Gujarat 380060<br />
                  <strong>GSTIN:</strong> 24AAACK7890F1ZT &nbsp;|&nbsp; <strong>PAN:</strong> AAACK7890F &nbsp;|&nbsp; <strong>SAC:</strong> 997331<br />
                  <strong>Support:</strong> billing@kelviontech.com
                </div>
              </div>
              <div className="doc-type-badge">
                <div className="doc-type-title">TAX INVOICE</div>
                <div style={{ marginTop: 6 }}>
                  <Badge tone={getStatusTone(viewInvoice.status)}>{viewInvoice.status}</Badge>
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'monospace', marginTop: 8, color: '#0f172a' }}>
                  {viewInvoice.invoiceNumber}
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: 2 }}>
                  <strong>Date:</strong> {new Date(viewInvoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  <strong>Due:</strong> {new Date(viewInvoice.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>
            </div>

            {/* Parties Info Grid */}
            <div className="doc-info-grid">
              <div>
                <div className="doc-section-title">BILLED TO (BUYER):</div>
                <div className="doc-party-name">{viewInvoice.restaurant?.name}</div>
                {viewInvoice.restaurant?.legalName && (
                  <div className="doc-party-detail"><strong>Legal Name:</strong> {viewInvoice.restaurant.legalName}</div>
                )}
                {viewInvoice.restaurant?.address && (
                  <div className="doc-party-detail">{viewInvoice.restaurant.address}</div>
                )}
                <div className="doc-party-detail">
                  {viewInvoice.restaurant?.city || 'Ahmedabad'}, {viewInvoice.restaurant?.state || 'Gujarat'}
                </div>
                <div className="doc-party-detail" style={{ marginTop: 4 }}>
                  <strong>GSTIN:</strong> {viewInvoice.restaurant?.gstin || 'Unregistered Commercial Buyer'}
                </div>
                {viewInvoice.restaurant?.fssaiNumber && (
                  <div className="doc-party-detail"><strong>FSSAI:</strong> {viewInvoice.restaurant.fssaiNumber}</div>
                )}
              </div>

              <div>
                <div className="doc-section-title">SUBSCRIPTION & BILLING PERIOD:</div>
                <div className="doc-party-name">{viewInvoice.plan?.name || 'JAMANVAAR SaaS Subscription'}</div>
                <div className="doc-party-detail">
                  <strong>Service:</strong> Cloud Restaurant POS & Multi-Outlet SaaS
                </div>
                <div className="doc-party-detail">
                  <strong>Period:</strong> {new Date(viewInvoice.billingPeriodStart).toLocaleDateString('en-IN')} – {new Date(viewInvoice.billingPeriodEnd).toLocaleDateString('en-IN')}
                </div>
                <div className="doc-party-detail">
                  <strong>Place of Supply:</strong> {viewInvoice.restaurant?.state || 'Gujarat'} (Code: 24)
                </div>
                <div className="doc-party-detail">
                  <strong>Currency:</strong> Indian Rupee (INR)
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>SAC Code</th>
                  <th className="num">Billing Period</th>
                  <th className="num">Taxable Value (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>{viewInvoice.plan?.name || 'JAMANVAAR Subscription'}</strong>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                      Multi-outlet cloud license, menu syndication, device MDM, offline sync & analytics
                    </div>
                  </td>
                  <td>997331</td>
                  <td className="num" style={{ fontSize: '0.8125rem' }}>
                    30 Days
                  </td>
                  <td className="num" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    ₹{(viewInvoice.amount / 100).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Tax & Total Summary */}
            <div className="doc-summary-wrap">
              <div className="doc-summary-box">
                <div className="doc-summary-row">
                  <span>Taxable Amount:</span>
                  <span style={{ fontFamily: 'monospace' }}>₹{(viewInvoice.amount / 100).toFixed(2)}</span>
                </div>

                {/* GST Breakup: check if Gujarat intra-state or inter-state */}
                {(!viewInvoice.restaurant?.state || viewInvoice.restaurant.state.toLowerCase() === 'gujarat') ? (
                  <>
                    <div className="doc-summary-row">
                      <span>CGST (9%):</span>
                      <span style={{ fontFamily: 'monospace' }}>₹{((viewInvoice.taxAmount / 2) / 100).toFixed(2)}</span>
                    </div>
                    <div className="doc-summary-row">
                      <span>SGST (9%):</span>
                      <span style={{ fontFamily: 'monospace' }}>₹{((viewInvoice.taxAmount / 2) / 100).toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <div className="doc-summary-row">
                    <span>IGST (18%):</span>
                    <span style={{ fontFamily: 'monospace' }}>₹{(viewInvoice.taxAmount / 100).toFixed(2)}</span>
                  </div>
                )}

                <div className="doc-summary-row total">
                  <span>TOTAL AMOUNT:</span>
                  <span style={{ fontFamily: 'monospace' }}>₹{(viewInvoice.totalAmount / 100).toFixed(2)}</span>
                </div>

                {viewInvoice.payments && viewInvoice.payments.length > 0 && (
                  <>
                    <div className="doc-summary-row settled" style={{ marginTop: 8 }}>
                      <span>Amount Paid:</span>
                      <span style={{ fontFamily: 'monospace' }}>
                        ₹{(viewInvoice.payments.reduce((s, p) => s + p.amount, 0) / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="doc-summary-row" style={{ fontWeight: 700 }}>
                      <span>Balance Due:</span>
                      <span style={{ fontFamily: 'monospace' }}>
                        ₹{Math.max(0, (viewInvoice.totalAmount - viewInvoice.payments.reduce((s, p) => s + p.amount, 0)) / 100).toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Bank Details & Payment Remittance */}
            <div className="doc-bank-box">
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#0f172a' }}>
                Bank Remittance & UPI Payment Instructions:
              </div>
              <div><strong>Beneficiary:</strong> KELVIONTECH PRIVATE LIMITED &nbsp;|&nbsp; <strong>Bank:</strong> HDFC Bank Ltd, Science City Branch</div>
              <div><strong>A/C No:</strong> 50200084920194 &nbsp;|&nbsp; <strong>IFSC:</strong> HDFC0001248 &nbsp;|&nbsp; <strong>UPI ID:</strong> kelviontech@hdfcbank</div>
            </div>

            {/* Payment History if exists */}
            {viewInvoice.payments && viewInvoice.payments.length > 0 && (
              <div style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, fontSize: '0.8125rem', marginBottom: 6, color: '#0f172a' }}>
                  Recorded Transactions
                </div>
                {viewInvoice.payments.map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: '#475569', padding: '4px 0' }}>
                    <span>
                      {p.method} • Ref: {p.referenceNumber || 'N/A'} {p.receiptNumber ? `• Receipt: ${p.receiptNumber}` : ''} ({new Date(p.createdAt).toLocaleDateString('en-IN')})
                    </span>
                    <strong style={{ fontFamily: 'monospace', color: '#059669' }}>₹{(p.amount / 100).toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="doc-footer">
              This is a computer-generated statutory GST invoice issued by KELVIONTECH PRIVATE LIMITED for the JAMANVAAR SaaS Platform.<br />
              Thank you for partnering with JAMANVAAR. For billing queries, contact <strong>billing@kelviontech.com</strong>.
            </div>
          </div>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: OFFICIAL PAYMENT RECEIPT PREVIEW
          ───────────────────────────────────────────────────────────── */}
      {receiptData && (
        <Modal
          title={`Official Payment Receipt — ${receiptData.receiptNumber}`}
          onClose={() => setReceiptData(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" onClick={() => setReceiptData(null)}>
                Close
              </Button>
              <Button variant="accent" onClick={() => printElement('[data-print-doc="platform-receipt"]', { title: 'Receipt', pageSize: 'A4 portrait' })}>
                <Printer className="w-4 h-4" />
                <span>Print Receipt (A4)</span>
              </Button>
            </div>
          }
        >
          <div className="doc-sheet print-surface" data-print-doc="platform-receipt">
            <div className="doc-brand-header">
              <div>
                <div className="doc-brand-title">
                  <Building2 className="w-7 h-7 text-amber-500" />
                  <span>JAMANVAAR</span>
                </div>
                <div className="doc-brand-tagline">KELVIONTECH PRIVATE LIMITED</div>
                <div className="doc-brand-meta">
                  Plot 42, Science City Road, Sola, Ahmedabad, Gujarat 380060<br />
                  <strong>GSTIN:</strong> 24AAACK7890F1ZT &nbsp;|&nbsp; <strong>SAC:</strong> 997331
                </div>
              </div>
              <div className="doc-type-badge">
                <div className="doc-type-title" style={{ color: '#059669' }}>PAYMENT RECEIPT</div>
                <div style={{ marginTop: 6 }}>
                  <Badge tone="success">PAYMENT RECONCILED</Badge>
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: 800, fontFamily: 'monospace', marginTop: 8, color: '#0f172a' }}>
                  {receiptData.receiptNumber}
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: 2 }}>
                  <strong>Date:</strong> {new Date(receiptData.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            <div className="doc-info-grid">
              <div>
                <div className="doc-section-title">RECEIVED FROM:</div>
                <div className="doc-party-name">{receiptData.receivedFrom.restaurantName}</div>
                {receiptData.receivedFrom.legalName && (
                  <div className="doc-party-detail"><strong>Legal Entity:</strong> {receiptData.receivedFrom.legalName}</div>
                )}
                {receiptData.receivedFrom.address && (
                  <div className="doc-party-detail">{receiptData.receivedFrom.address}</div>
                )}
                <div className="doc-party-detail">
                  {receiptData.receivedFrom.city || 'Ahmedabad'}, {receiptData.receivedFrom.state || 'Gujarat'}
                </div>
                <div className="doc-party-detail" style={{ marginTop: 4 }}>
                  <strong>GSTIN:</strong> {receiptData.receivedFrom.gstin || 'Unregistered'}
                </div>
                <div className="doc-party-detail">
                  <strong>Contact:</strong> {receiptData.receivedFrom.ownerName} ({receiptData.receivedFrom.ownerEmail})
                </div>
              </div>

              <div>
                <div className="doc-section-title">PAYMENT RECONCILIATION:</div>
                <div className="doc-party-name">{receiptData.planName} ({receiptData.planTier})</div>
                <div className="doc-party-detail">
                  <strong>Against Invoice:</strong> {receiptData.invoiceNumber}
                </div>
                <div className="doc-party-detail">
                  <strong>Payment Method:</strong> {receiptData.paymentMethod}
                </div>
                <div className="doc-party-detail">
                  <strong>Transaction / UTR:</strong> {receiptData.transactionId}
                </div>
                <div className="doc-party-detail">
                  <strong>Billing Period:</strong> {new Date(receiptData.billingPeriodStart).toLocaleDateString('en-IN')} – {new Date(receiptData.billingPeriodEnd).toLocaleDateString('en-IN')}
                </div>
              </div>
            </div>

            <table className="doc-table">
              <thead>
                <tr>
                  <th>Item / Fee Particulars</th>
                  <th>Payment Mode</th>
                  <th className="num">Reference / UTR</th>
                  <th className="num">Amount Received</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Subscription License Settlement</strong>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Invoice #{receiptData.invoiceNumber} • {receiptData.planName}
                    </div>
                  </td>
                  <td>{receiptData.paymentMethod}</td>
                  <td className="num" style={{ fontFamily: 'monospace' }}>{receiptData.transactionId}</td>
                  <td className="num" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#059669', fontSize: 15 }}>
                    ₹{receiptData.amountPaidRupees}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="doc-summary-wrap">
              <div className="doc-summary-box">
                <div className="doc-summary-row">
                  <span>Total Invoice Value:</span>
                  <span style={{ fontFamily: 'monospace' }}>₹{(receiptData.totalInvoiceAmount / 100).toFixed(2)}</span>
                </div>
                <div className="doc-summary-row settled">
                  <span>Total Paid to Date:</span>
                  <span style={{ fontFamily: 'monospace' }}>₹{(receiptData.totalPaid / 100).toFixed(2)}</span>
                </div>
                <div className="doc-summary-row total" style={{ color: '#059669' }}>
                  <span>BALANCE OUTSTANDING:</span>
                  <span style={{ fontFamily: 'monospace' }}>₹{(receiptData.balanceDue / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #cbd5e1' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 700, fontSize: '0.9rem' }}>
                  <ShieldCheck className="w-5 h-5" />
                  <span>OFFICIALLY RECONCILED & SETTLED</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                  Transaction logged into JAMANVAAR Central Accounting Ledger
                </div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 200 }}>
                <div style={{ height: 36, borderBottom: '1px solid #94a3b8', marginBottom: 6 }} />
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>Authorized Accounts Officer</div>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>KELVIONTECH PRIVATE LIMITED</div>
              </div>
            </div>

            <div className="doc-footer" style={{ marginTop: '2rem' }}>
              This payment receipt confirms full or partial settlement of SaaS charges. Keep this document for statutory GST input credit records.
            </div>
          </div>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 3: RECORD PAYMENT
          ───────────────────────────────────────────────────────────── */}
      {paymentModalInvoice && (
        <Modal
          title={`Record Payment — ${paymentModalInvoice.invoiceNumber}`}
          onClose={() => setPaymentModalInvoice(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPaymentModalInvoice(null)} disabled={recordingPayment}>
                Cancel
              </Button>
              <Button variant="accent" onClick={handleRecordPayment} disabled={recordingPayment}>
                {recordingPayment ? 'Recording…' : 'Record & Issue Receipt'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleRecordPayment} className="modal-form">
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Target Account</div>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{paymentModalInvoice.restaurant?.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13 }}>
                <span>Invoice Total: <strong>₹{(paymentModalInvoice.totalAmount / 100).toFixed(2)}</strong></span>
                <span>Already Paid: <strong>₹{((paymentModalInvoice.payments?.reduce((s, p) => s + p.amount, 0) || 0) / 100).toFixed(2)}</strong></span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Amount (₹) *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label>Payment Method *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  style={{ height: 40, width: '100%', borderRadius: 6, border: '1px solid #cbd5e1', padding: '0 10px' }}
                  required
                >
                  <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                  <option value="BANK_TRANSFER">Bank Transfer (NEFT / RTGS / IMPS)</option>
                  <option value="CARD">Debit / Credit Card</option>
                  <option value="CHEQUE">Bank Cheque / DD</option>
                  <option value="MANUAL">Cash / Manual Settle</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <label>Reference / UTR Number</label>
              <Input
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g. UPI-3498239048 or NEFT-HDFC98234"
              />
            </div>

            <div className="form-field">
              <label>Notes / Accounting Remark</label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="e.g. Reconciled against HDFC bank statement"
              />
            </div>
          </form>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 4: ISSUE CUSTOM INVOICE
          ───────────────────────────────────────────────────────────── */}
      {issueModalOpen && (
        <Modal
          title="Issue Platform Tax Invoice"
          onClose={() => setIssueModalOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setIssueModalOpen(false)} disabled={issuing}>
                Cancel
              </Button>
              <Button variant="accent" onClick={handleIssueInvoice} disabled={issuing}>
                {issuing ? 'Issuing…' : 'Issue Invoice'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleIssueInvoice} className="modal-form">
            <div className="form-field">
              <label>Target Restaurant *</label>
              <select
                value={issueRestaurantId}
                onChange={(e) => setIssueRestaurantId(e.target.value)}
                style={{ height: 40, width: '100%', borderRadius: 6, border: '1px solid #cbd5e1', padding: '0 10px' }}
                required
              >
                <option value="">Select a restaurant…</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.city || 'India'})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Associated SaaS Plan</label>
              <select
                value={issuePlanId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setIssuePlanId(pid);
                  const p = plans.find((x) => x.id === pid);
                  if (p) {
                    const amt = p.priceMonthly / 100;
                    setIssueAmount(String(amt));
                    setIssueTax(String(Math.round(amt * 0.18)));
                  }
                }}
                style={{ height: 40, width: '100%', borderRadius: 6, border: '1px solid #cbd5e1', padding: '0 10px' }}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (₹{(p.priceMonthly / 100).toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Base Amount (₹) *</label>
                <Input
                  type="number"
                  value={issueAmount}
                  onChange={(e) => {
                    setIssueAmount(e.target.value);
                    setIssueTax(String(Math.round(Number(e.target.value) * 0.18)));
                  }}
                  required
                />
              </div>
              <div className="form-field">
                <label>Statutory GST 18% (₹)</label>
                <Input
                  type="number"
                  value={issueTax}
                  onChange={(e) => setIssueTax(e.target.value)}
                />
              </div>
            </div>

            <div className="form-field">
              <label>Due Date *</label>
              <Input
                type="date"
                value={issueDueDate}
                onChange={(e) => setIssueDueDate(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>Invoice Notes</label>
              <Input
                value={issueNotes}
                onChange={(e) => setIssueNotes(e.target.value)}
                placeholder="e.g. Monthly recurring license subscription"
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
