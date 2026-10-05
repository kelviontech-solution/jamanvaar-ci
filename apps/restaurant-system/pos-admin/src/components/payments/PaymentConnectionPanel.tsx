import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@jamanvaar/ui';
import { SessionPersistence } from '@jamanvaar/business';
import {
  getPaymentConnection,
  submitPaymentConnection,
  type PaymentConnectionFields,
  type PaymentConnectionStatus
} from '../../cloud/cloudClient';

const EMPTY_FIELDS: PaymentConnectionFields = {
  accountType: 'INDIVIDUAL',
  businessType: '',
  pan: '',
  gst: '',
  cin: '',
  uidai: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  settlementAccountName: '',
  settlementAccountNumber: '',
  settlementIfsc: '',
  settlementUpiVpa: ''
};

function maskedSummary(s: PaymentConnectionStatus): string {
  if (s.settlementUpiVpa) return `UPI: ${s.settlementUpiVpa}`;
  if (s.settlementAccountName) return `Bank account: ${s.settlementAccountName}`;
  return 'Submitted bank details';
}

interface PaymentConnectionPanelProps {
  onStatusChange?: (status: PaymentConnectionStatus) => void;
}

export const PaymentConnectionPanel: React.FC<PaymentConnectionPanelProps> = ({ onStatusChange }) => {
  const admin = SessionPersistence.load('admin');
  const canManage = admin?.roleId === 'role-admin' || admin?.roleId === 'role-manager';

  const [status, setStatus] = useState<PaymentConnectionStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [fields, setFields] = useState<PaymentConnectionFields>(EMPTY_FIELDS);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const mountId = useRef(0);

  const load = () => {
    const myMount = ++mountId.current;
    getPaymentConnection()
      .then((s) => {
        if (mountId.current !== myMount) return; // a later load already started; drop this stale result
        setStatus(s);
        setLoadError('');
        onStatusChange?.(s);
      })
      .catch((e) => {
        if (mountId.current !== myMount) return;
        setLoadError(e instanceof Error ? e.message : 'Could not load your payment connection status');
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEditForm = () => {
    if (status) {
      setFields({
        accountType: (status.accountType as PaymentConnectionFields['accountType']) || 'INDIVIDUAL',
        businessType: status.businessType || '',
        pan: status.pan || '',
        gst: status.gst || '',
        cin: status.cin || '',
        uidai: status.uidai || '',
        contactName: status.contactName || '',
        contactEmail: status.contactEmail || '',
        contactPhone: status.contactPhone || '',
        settlementAccountName: status.settlementAccountName || '',
        settlementAccountNumber: '',
        settlementIfsc: status.settlementIfsc || '',
        settlementUpiVpa: status.settlementUpiVpa || ''
      });
    } else {
      setFields(EMPTY_FIELDS);
    }
    setSubmitError('');
    setIsEditing(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    try {
      const updated = await submitPaymentConnection(fields);
      setStatus(updated);
      onStatusChange?.(updated);
      setIsEditing(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit your bank details');
    } finally {
      setSubmitting(false);
    }
  };

  if (!canManage) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm">
        <h3 className="text-lg font-bold text-jaman-navy">Online payments</h3>
        <p className="text-xs text-[#4A5568] mt-1">
          Ask your restaurant owner or manager to connect online payments from this tab.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm">
        <h3 className="text-lg font-bold text-jaman-navy">Online payments</h3>
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 mt-2">{loadError}</div>
        <Button variant="ghost" size="sm" className="mt-2" onClick={load}>Retry</Button>
      </div>
    );
  }

  if (status === null) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm">
        <p className="text-xs text-[#8C9BAE]">Loading your payment connection status…</p>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-jaman-navy">
          {status.status === 'NOT_CONNECTED' ? 'Connect online payments' : 'Update your bank details'}
        </h3>
        {submitError && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{submitError}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Account type *</label>
              <select
                value={fields.accountType}
                onChange={(e) => setFields((f) => ({ ...f, accountType: e.target.value as PaymentConnectionFields['accountType'] }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm"
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="BUSINESS">Business</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">PAN *</label>
              <input
                type="text"
                required
                value={fields.pan}
                onChange={(e) => setFields((f) => ({ ...f, pan: e.target.value.toUpperCase() }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Contact name *</label>
              <input
                type="text"
                required
                value={fields.contactName}
                onChange={(e) => setFields((f) => ({ ...f, contactName: e.target.value }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Contact email *</label>
              <input
                type="email"
                required
                value={fields.contactEmail}
                onChange={(e) => setFields((f) => ({ ...f, contactEmail: e.target.value }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Contact phone *</label>
              <input
                type="tel"
                required
                value={fields.contactPhone}
                onChange={(e) => setFields((f) => ({ ...f, contactPhone: e.target.value }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">UPI VPA (optional)</label>
              <input
                type="text"
                value={fields.settlementUpiVpa}
                onChange={(e) => setFields((f) => ({ ...f, settlementUpiVpa: e.target.value }))}
                placeholder="yourname@bank"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Bank account number</label>
              <input
                type="text"
                value={fields.settlementAccountNumber}
                onChange={(e) => setFields((f) => ({ ...f, settlementAccountNumber: e.target.value }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">IFSC</label>
              <input
                type="text"
                value={fields.settlementIfsc}
                onChange={(e) => setFields((f) => ({ ...f, settlementIfsc: e.target.value.toUpperCase() }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit for verification'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-jaman-navy">Online payments</h3>
        <Button variant="ghost" size="sm" onClick={openEditForm}>
          {status.status === 'NOT_CONNECTED' ? 'Connect' : 'Update bank details'}
        </Button>
      </div>

      {status.status === 'NOT_CONNECTED' && (
        <p className="text-xs text-[#4A5568]">
          Not connected yet. Connect your bank details so customers can pay by UPI/QR from the Kiosk or QR table ordering.
        </p>
      )}

      {status.status === 'PENDING_VERIFICATION' && (
        <>
          <div className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Verification in progress — Jamanvaar will review your bank details shortly.
          </div>
          <p className="text-xs text-[#8C9BAE]">{maskedSummary(status)}</p>
        </>
      )}

      {status.bankVerificationStatus === 'REJECTED' && (
        <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          Your submitted bank details were rejected. Please check them and resubmit.
        </div>
      )}

      {status.status === 'ACTIVE' && (
        <>
          <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            Online payments are live.
          </div>
          <p className="text-xs text-[#8C9BAE]">{maskedSummary(status)}</p>
        </>
      )}

      {status.status === 'SUSPENDED' && (
        <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          Online payments are suspended. Contact Jamanvaar support.
        </div>
      )}
    </div>
  );
};
