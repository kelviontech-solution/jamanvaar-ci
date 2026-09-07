import React, { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Invoice, BillingSummary, RestaurantCore, Plan, PaymentMethod } from '../../api/types';
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
  Building2
} from 'lucide-react';
import { exportRowsToCsv } from '../../lib/csvExport';
import '../../components/shared.css';
import '../Dashboard/dashboard.css';

type InvoiceFilterStatus = 'ALL' | 'ISSUED' | 'PAID' | 'PAST_DUE';

export function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Search and Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceFilterStatus>('ALL');
  // The filter tabs used to always render inline next to search, making the
  // toolbar row read as a wall of controls even when nothing was filtered.
  // Collapsed behind this toggle by default; the active filter still shows
  // as a removable chip so it's never hidden once applied.
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

  // View Invoice Modal
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);

  // Void / Refund — reachable actions that previously had a real backend
  // endpoint (PATCH /invoices/:id/status) but no UI path to trigger them.
  const [actionMenuInvoiceId, setActionMenuInvoiceId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  function loadBillingData() {
    setLoading(true);
    Promise.all([
      api.get<Invoice[]>('/api/v1/invoices'),
      api.get<BillingSummary>('/api/v1/invoices/summary')
    ])
      .then(([invoicesList, summaryData]) => {
        setInvoices(invoicesList);
        setSummary(summaryData);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load billing records'))
      .finally(() => setLoading(false));
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
      showToast('Tax invoice issued successfully');
      loadBillingData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to issue invoice');
    } finally {
      setIssuing(false);
    }
  }

  function openPaymentModal(invoice: Invoice) {
    setPaymentModalInvoice(invoice);
    const remainingPaise = invoice.totalAmount - (invoice.payments?.reduce((s, p) => s + p.amount, 0) || 0);
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
      await api.post(`/api/v1/invoices/${paymentModalInvoice.id}/payments`, {
        amount: Math.round(Number(paymentAmount) * 100),
        method: paymentMethod,
        referenceNumber: paymentRef.trim() || undefined,
        notes: paymentNotes.trim() || undefined
      });

      setPaymentModalInvoice(null);
      showToast('Payment recorded and reconciled!');
      loadBillingData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  }

  async function handleUpdateInvoiceStatus(invoice: Invoice, status: 'VOID' | 'REFUNDED') {
    setActionMenuInvoiceId(null);
    const verb = status === 'VOID' ? 'void' : 'mark as refunded';
    if (!window.confirm(`Are you sure you want to ${verb} invoice ${invoice.invoiceNumber}? This cannot be undone.`)) {
      return;
    }
    setUpdatingStatusId(invoice.id);
    try {
      await api.patch(`/api/v1/invoices/${invoice.id}/status`, { status });
      showToast(`Invoice ${invoice.invoiceNumber} ${status === 'VOID' ? 'voided' : 'marked as refunded'}.`);
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

  const filteredInvoices = useMemo(() => {
    return invoices.filter((i) => {
      if (statusFilter !== 'ALL' && i.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNum = i.invoiceNumber.toLowerCase().includes(q);
        const matchRest = (i.restaurant?.name || '').toLowerCase().includes(q);
        const matchPlan = (i.plan?.name || '').toLowerCase().includes(q);
        if (!matchNum && !matchRest && !matchPlan) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, search]);

  function handleExportCsv() {
    exportRowsToCsv(`jamanvaar_invoices_${new Date().toISOString().slice(0, 10)}.csv`, filteredInvoices, [
      { header: 'Invoice #', value: (i) => i.invoiceNumber },
      { header: 'Restaurant', value: (i) => i.restaurant?.name || '' },
      { header: 'Plan', value: (i) => i.plan?.name || 'Custom Fee' },
      { header: 'Amount (₹)', value: (i) => (i.amount / 100).toFixed(2) },
      { header: 'Tax (₹)', value: (i) => (i.taxAmount / 100).toFixed(2) },
      { header: 'Total (₹)', value: (i) => (i.totalAmount / 100).toFixed(2) },
      { header: 'Due Date', value: (i) => new Date(i.dueDate).toISOString().slice(0, 10) },
      { header: 'Status', value: (i) => i.status }
    ]);
  }

  const issuedCount = useMemo(() => invoices.filter((i) => i.status === 'ISSUED').length, [invoices]);
  const paidCount = useMemo(() => invoices.filter((i) => i.status === 'PAID').length, [invoices]);
  const overdueCount = useMemo(() => invoices.filter((i) => i.status === 'PAST_DUE').length, [invoices]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices &amp; Billing</h1>
          <p className="page-subtitle">
            Commercial SaaS receivables, statutory GST 18% tax invoices, and verified payment reconciliations.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button variant="ghost" onClick={handleExportCsv} disabled={invoices.length === 0}>
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </Button>
          <Button variant="accent" onClick={openIssueModal}>
            <Plus className="w-4 h-4" />
            <span>Issue Invoice</span>
          </Button>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}
      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Gateway Status Banner */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>
            <strong>Payment Gateway Integration: </strong>
            Manual Reconciliation &amp; UPI/NEFT Bank Settled. Automated payment gateway webhook listener is active in sandbox mode.
          </span>
        </div>
        <span className="badge badge-neutral" style={{ fontSize: 10 }}>MANUAL + WEBHOOK SANDBOX</span>
      </div>

      {summary && (
        <div className="stat-grid">
          <Card className="stat-tile">
            <div className="stat-tile-top">
              <div className="stat-label">Reconciled Collections</div>
              <div className="stat-tile-icon stat-tile-icon-green">
                <Receipt className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="stat-value">₹{summary.totalCollected.toLocaleString('en-IN')}</div>
              <div className="stat-sub">
                <span style={{ color: '#059669', fontWeight: 700 }}>● GST Compliant</span> • 100% Settled
              </div>
            </div>
          </Card>

          <Card className="stat-tile">
            <div className="stat-tile-top">
              <div className="stat-label">Invoiced Receivables</div>
              <div className="stat-tile-icon stat-tile-icon-amber">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="stat-value" style={{ color: summary.pendingAmount > 0 ? '#d97706' : 'inherit' }}>
                ₹{summary.pendingAmount.toLocaleString('en-IN')}
              </div>
              <div className="stat-sub">
                {summary.pendingAmount > 0 ? 'Awaiting Tenant Payment' : 'Zero Pending Dues'}
              </div>
            </div>
          </Card>

          <Card className="stat-tile">
            <div className="stat-tile-top">
              <div className="stat-label">Settled Invoices</div>
              <div className="stat-tile-icon stat-tile-icon-blue">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="stat-value">
                {summary.paidInvoices}{' '}
                <span style={{ fontSize: 14, color: 'var(--jv-text-muted)', fontWeight: 600 }}>
                  / {summary.totalInvoices} Total
                </span>
              </div>
              <div className="stat-sub">
                {summary.totalInvoices > 0
                  ? `${Math.round((summary.paidInvoices / summary.totalInvoices) * 100)}% Collection Rate`
                  : '0 Total Issued'}
              </div>
            </div>
          </Card>

          <Card className="stat-tile">
            <div className="stat-tile-top">
              <div className="stat-label">Overdue Invoices</div>
              <div className="stat-tile-icon stat-tile-icon-orange">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="stat-value" style={{ color: summary.pastDueInvoices > 0 ? '#dc2626' : 'inherit' }}>
                {summary.pastDueInvoices}
              </div>
              <div className="stat-sub">
                {summary.pastDueInvoices > 0 ? 'Requires Follow-up' : 'All Accounts Current'}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar" style={{ marginTop: 16, flexWrap: 'wrap' }}>
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

        {/* Applied filter stays visible as a removable chip even while the
            rest of the filter controls are collapsed. */}
        {statusFilter !== 'ALL' && (
          <span
            className="badge badge-neutral"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}
            onClick={() => setStatusFilter('ALL')}
            title="Remove this filter"
          >
            Status: {statusFilter === 'ISSUED' ? 'Pending' : statusFilter === 'PAST_DUE' ? 'Overdue' : 'Paid'} ✕
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
          {filteredInvoices.length} of {invoices.length} invoices
        </span>
      </div>

      {filtersOpen && (
        <div style={{ marginTop: 10, marginBottom: 6 }}>
          <FilterTabs<InvoiceFilterStatus>
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { id: 'ALL', label: 'All Invoices', count: invoices.length },
              { id: 'ISSUED', label: 'Pending', count: issuedCount },
              { id: 'PAID', label: 'Paid', count: paidCount },
              { id: 'PAST_DUE', label: 'Overdue', count: overdueCount }
            ]}
          />
        </div>
      )}

      {loading && invoices.length === 0 ? (
        <SkeletonTable rows={5} cols={7} />
      ) : (
        <Card>
          {filteredInvoices.length === 0 ? (
            <EmptyState
              icon={<Receipt className="w-6 h-6 text-slate-400" />}
              title={invoices.length === 0 ? 'No invoices issued' : 'No matching invoices'}
              description={
                invoices.length === 0
                  ? 'Issue a commercial invoice or wait for automated subscription renewal dispatch.'
                  : 'Try changing your search query or status filter.'
              }
              action={
                invoices.length > 0 ? (
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
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <button
                          type="button"
                          className="table-link"
                          style={{ fontWeight: 700, fontFamily: 'monospace', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                          onClick={() => setViewInvoice(inv)}
                        >
                          {inv.invoiceNumber}
                        </button>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{inv.restaurant?.name || 'Unknown Restaurant'}</div>
                        {inv.restaurant?.city && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {inv.restaurant.city} {inv.restaurant?.gstin ? `• GST: ${inv.restaurant.gstin}` : ''}
                          </div>
                        )}
                      </td>
                      <td>{inv.plan?.name || 'Custom Fee'}</td>
                      <td>
                        <strong style={{ fontFamily: 'monospace', fontSize: 14 }}>
                          ₹{(inv.totalAmount / 100).toLocaleString('en-IN')}
                        </strong>
                        <div className="muted" style={{ fontSize: 11 }}>
                          ₹{(inv.amount / 100).toLocaleString('en-IN')} + ₹{(inv.taxAmount / 100).toLocaleString('en-IN')} GST
                        </div>
                      </td>
                      <td>{new Date(inv.dueDate).toLocaleDateString('en-IN')}</td>
                      <td>
                        <Badge tone={getStatusTone(inv.status)} pulse={inv.status === 'PAID'}>{inv.status}</Badge>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
                          {inv.status !== 'PAID' && inv.status !== 'VOID' && inv.status !== 'REFUNDED' && (
                            <Button size="sm" variant="accent" onClick={() => openPaymentModal(inv)}>
                              Record Payment
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setViewInvoice(inv)}>
                            View Tax Receipt
                          </Button>

                          {inv.status !== 'VOID' && inv.status !== 'REFUNDED' && (
                            <>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                title="More invoice actions"
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
                                    background: 'var(--jv-surface)',
                                    border: '1px solid var(--jv-border)',
                                    borderRadius: 8,
                                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                    zIndex: 20,
                                    minWidth: 160
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateInvoiceStatus(inv, 'VOID')}
                                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--jv-text-secondary)' }}
                                  >
                                    Void Invoice
                                  </button>
                                  {inv.status === 'PAID' && (
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateInvoiceStatus(inv, 'REFUNDED')}
                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--jv-error)', borderTop: '1px solid var(--jv-border)' }}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Record Payment Modal */}
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
                {recordingPayment ? 'Recording…' : 'Confirm Payment'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleRecordPayment} className="modal-form">
            <div className="form-field">
              <label>Restaurant</label>
              <Input value={paymentModalInvoice.restaurant?.name || ''} disabled />
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Amount (₹) *</label>
                <Input
                  type="number"
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
                  style={{ height: 40 }}
                >
                  <option value="UPI">UPI BharatQR / GPay / PhonePe</option>
                  <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS)</option>
                  <option value="CARD">Credit / Debit Card</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="MANUAL">Cash / Manual Settlement</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <label>Transaction / Reference ID</label>
              <Input
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g. UPI-REF-88392019"
              />
            </div>

            <div className="form-field">
              <label>Notes</label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Optional billing remarks"
              />
            </div>
          </form>
        </Modal>
      )}

      {/* Issue Custom Invoice Modal */}
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
                style={{ height: 40 }}
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
                style={{ height: 40 }}
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

      {/* Printable Tax Invoice Modal */}
      {viewInvoice && (
        <Modal
          title={`Statutory Tax Invoice — ${viewInvoice.invoiceNumber}`}
          onClose={() => setViewInvoice(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setViewInvoice(null)}>
                Close
              </Button>
              <Button variant="accent" onClick={() => window.print()}>
                <Printer className="w-4 h-4" />
                <span>Print Invoice</span>
              </Button>
            </>
          }
        >
          <div style={{ padding: '1rem', background: 'var(--jv-bg)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--jv-border)', paddingBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0B253A', fontWeight: 900 }}>JAMANVAAR</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--jv-text-secondary)' }}>KELVIONTECH SaaS Platform</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--jv-text-muted)' }}>Ahmedabad, Gujarat, India</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Badge tone={getStatusTone(viewInvoice.status)}>{viewInvoice.status}</Badge>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.4rem' }}>
                  {viewInvoice.invoiceNumber}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--jv-text-muted)' }}>
                  Date: {new Date(viewInvoice.createdAt).toLocaleDateString('en-IN')}
                </div>
              </div>
            </div>

            <div style={{ margin: '1rem 0', fontSize: '0.85rem' }}>
              <div style={{ color: 'var(--jv-text-muted)', fontSize: '0.75rem' }}>BILLED TO:</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0B253A' }}>{viewInvoice.restaurant?.name}</div>
              {viewInvoice.restaurant?.legalName && <div>{viewInvoice.restaurant.legalName}</div>}
              {viewInvoice.restaurant?.city && <div>{viewInvoice.restaurant.city}</div>}
              {viewInvoice.restaurant?.gstin && <div className="mono">GSTIN: {viewInvoice.restaurant.gstin}</div>}
            </div>

            <table className="data-table" style={{ margin: '1rem 0' }}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{viewInvoice.plan?.name || 'JAMANVAAR Subscription License'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>₹{(viewInvoice.amount / 100).toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Goods and Services Tax (GST 18%)</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>₹{(viewInvoice.taxAmount / 100).toFixed(2)}</td>
                </tr>
                <tr style={{ fontWeight: 800, borderTop: '2px solid var(--jv-border)' }}>
                  <td>TOTAL AMOUNT</td>
                  <td style={{ textAlign: 'right', color: 'var(--jv-accent)', fontFamily: 'monospace', fontSize: 16 }}>
                    ₹{(viewInvoice.totalAmount / 100).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>

            {viewInvoice.payments && viewInvoice.payments.length > 0 && (
              <div style={{ marginTop: '1rem', borderTop: '1px dashed var(--jv-border)', paddingTop: '0.5rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.25rem' }}>Payment History</div>
                {viewInvoice.payments.map((p) => (
                  <div key={p.id} style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', color: 'var(--jv-text-secondary)' }}>
                    <span>
                      {p.method} {p.referenceNumber ? `(${p.referenceNumber})` : ''} • {new Date(p.createdAt).toLocaleDateString('en-IN')}
                    </span>
                    <strong style={{ fontFamily: 'monospace' }}>₹{(p.amount / 100).toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
