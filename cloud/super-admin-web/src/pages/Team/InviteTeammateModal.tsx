// Deep import on purpose: the '@jamanvaar/utils' barrel drags in the local device database (see tests/super_admin_css_classes.test.ts).
import { copyText } from '../../../../../packages/utils/src/clipboard';
import React, { useState } from 'react';
import { Modal, Button, Input } from '../../components/ui';
import { api, ApiError } from '../../api/client';
import type { PlatformRole } from '../../api/types';
import { UserPlus, Check, Copy } from 'lucide-react';

interface InviteTeammateModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const ROLE_OPTIONS: Array<{ role: PlatformRole; label: string; desc: string }> = [
  { role: 'SUPER_ADMIN', label: 'Super Admin', desc: 'Full administrative access across all SaaS modules and restaurants' },
  { role: 'PLATFORM_OPS', label: 'Platform Operations', desc: 'Manage hardware devices, application releases, and edge sync' },
  { role: 'SUPPORT_ADMIN', label: 'Support Admin', desc: 'Customer support diagnostics, account unlocks, and audit telemetry' },
  { role: 'FINANCE_ADMIN', label: 'Finance Admin', desc: 'Manage subscription plans, invoices, refunds, and billing history' },
  { role: 'READ_ONLY', label: 'Read-Only Auditor', desc: 'Read-only visibility for reporting, compliance, and auditing' }
];

export function InviteTeammateModal({ onClose, onSuccess }: InviteTeammateModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PlatformRole>('READ_ONLY');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{
    success: boolean;
    emailSent: boolean;
    activationUrl?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setFullName('');
    setEmail('');
    setRole('READ_ONLY');
    setError(null);
    setInviteResult(null);
    setCopied(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await api.post<{
        user: any;
        emailSent: boolean;
        activationUrl?: string;
      }>('/api/v1/platform-users/invite', {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        role
      });

      setInviteResult({
        success: true,
        emailSent: res.emailSent,
        activationUrl: res.activationUrl
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to invite platform teammate');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyActivationLink() {
    if (inviteResult?.activationUrl && (await copyText(inviteResult.activationUrl))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <Modal
      title={inviteResult ? 'Teammate Invitation Sent' : 'Invite Platform Teammate'}
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        inviteResult ? (
          <Button
            variant="primary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Done
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset();
                onClose();
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={submitting || !fullName.trim() || !email.trim()}
              onClick={handleSubmit}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <UserPlus className="w-4 h-4" />
              {submitting ? 'Sending Invite…' : 'Send Invitation'}
            </Button>
          </>
        )
      }
    >
      {inviteResult ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              padding: '16px',
              borderRadius: 8,
              background: inviteResult.emailSent ? '#ecfdf5' : 'var(--jv-warning-soft)',
              border: `1px solid ${inviteResult.emailSent ? '#a7f3d0' : '#fde68a'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div style={{ fontWeight: 700, color: inviteResult.emailSent ? '#065f46' : '#92400e', fontSize: 14 }}>
              {inviteResult.emailSent
                ? 'Invitation email delivered successfully'
                : 'Invitation created (Email service unavailable)'}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: inviteResult.emailSent ? '#047857' : '#b45309' }}>
              {inviteResult.emailSent
                ? `An invitation with an activation link was dispatched to ${email}.`
                : 'SMTP is not configured in this environment. Please share the direct activation link below:'}
            </p>
          </div>

          {inviteResult.activationUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-secondary)' }}>Activation Link</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  readOnly
                  value={inviteResult.activationUrl}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    background: 'var(--jv-surface-subtle)',
                    border: '1px solid var(--jv-border-hover)',
                    borderRadius: 6
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyActivationLink}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: 13
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-secondary)' }}>Full Name *</label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Aryan Sharma"
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-secondary)' }}>Email Address *</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-secondary)' }}>Assign Platform Role *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ROLE_OPTIONS.map((opt) => (
                <label
                  key={opt.role}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1.5px solid ${role === opt.role ? '#0B253A' : 'var(--jv-border)'}`,
                    background: role === opt.role ? 'var(--jv-surface-subtle)' : 'var(--jv-surface-card)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <input
                    type="radio"
                    name="platformRole"
                    value={opt.role}
                    checked={role === opt.role}
                    onChange={() => setRole(opt.role)}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--jv-text)' }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--jv-text-muted)' }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
