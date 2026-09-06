import React, { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Button } from '../../components/ui';

interface IssuedCertificateResponse {
  payload: string;
  signature: string;
}

/**
 * ENT-001 fix: the issuing side of the offline license certificate scheme.
 * Restaurant Admin's Settings → Subscription Plan verifies certificates
 * cryptographically (see packages/business/src/license_certificate.ts) —
 * this is the only place one can legitimately be minted, always derived from
 * this restaurant's real, current subscription in Postgres.
 */
export function LicenseCertificatePanel({ restaurantId }: { restaurantId: string }) {
  const [certificate, setCertificate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const result = await api.get<IssuedCertificateResponse>(`/api/v1/restaurants/${restaurantId}/license-certificate`);
      setCertificate(`${result.payload}.${result.signature}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate a certificate for this restaurant.');
      setCertificate(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!certificate) return;
    try {
      await navigator.clipboard.writeText(certificate);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context) — the
      // certificate is still selectable/copyable manually from the textarea below.
    }
  }

  return (
    <div>
      <Button variant="accent" onClick={handleGenerate} disabled={busy}>
        {busy ? 'Generating…' : 'Generate Certificate for This Restaurant'}
      </Button>

      {error && (
        <p style={{ color: '#B91C1C', fontSize: 13, marginTop: 10 }}>{error}</p>
      )}

      {certificate && (
        <div style={{ marginTop: 14 }}>
          <textarea
            readOnly
            value={certificate}
            rows={3}
            style={{
              width: '100%',
              fontFamily: 'monospace',
              fontSize: 12,
              padding: 10,
              borderRadius: 10,
              border: '1px solid #E4DDCF',
              background: '#FAF7F2',
              resize: 'vertical'
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button variant="ghost" onClick={handleCopy}>
              {copied ? 'Copied ✓' : 'Copy Certificate'}
            </Button>
            <span style={{ fontSize: 12, color: '#8b93a0' }}>
              Reflects this restaurant's plan at the moment it was generated — regenerate after any plan change.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
