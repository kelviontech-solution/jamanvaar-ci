import { useState } from 'react';
import type { QrOrderRow } from '../../cloud/qrAdminClient';
import { qrReceiptPdf } from '../../cloud/cloudClient';
import './qr-receipts.css';

export function QrGuestDetails({ order }: { order: QrOrderRow }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const phone = order.customerPhone?.replace(/[^+0-9]/g, '') || '';
  const digits = phone.replace(/\D/g, '');
  // National Indian mobiles are accepted by the existing checkout; WhatsApp requires a country code.
  const whatsapp = /^[6-9]\d{9}$/.test(digits) ? `91${digits}` : digits;
  async function download() {
    setBusy(true);
    setError('');
    try {
      const blob = await qrReceiptPdf(order.id),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `bill-${(order.orderNumber || order.id).replace(/[^A-Za-z0-9_-]/g, '')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the bill.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="qr-guest-details" aria-label="Guest contact and requests">
      <h3>Guest details</h3>
      <dl>
        <div>
          <dt>Name</dt>
          <dd>{order.customerName || 'Not provided'}</dd>
        </div>
        <div>
          <dt>Mobile</dt>
          <dd>{order.customerPhone || 'Not provided'}</dd>
        </div>
        {order.customerEmail && (
          <div>
            <dt>Email</dt>
            <dd>{order.customerEmail}</dd>
          </div>
        )}
      </dl>
      <div className="qr-receipt-actions">
        {phone && <a href={`tel:${phone}`}>Call guest</a>}
        {whatsapp && (
          <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        )}
        {order.customerEmail && <a href={`mailto:${order.customerEmail}`}>Email guest</a>}
      </div>
      {order.notes && (
        <p className="qr-guest-note">
          <strong>Kitchen / guest request</strong>
          <br />
          {order.notes}
        </p>
      )}
      {order.pickupAt && (
        <p>
          Pickup: {new Date(order.pickupAt).toLocaleString(undefined, { timeZone: order.pickupTimezone })}
          {order.pickupInstructions && (
            <>
              <br />
              {order.pickupInstructions}
            </>
          )}
        </p>
      )}
      {!!order.sharedGuests?.length && (
        <details>
          <summary>Shared table requests</summary>
          {order.sharedGuests.map((guest, index) => (
            <div key={index}>
              <strong>{guest.label}</strong>
              {guest.lines.map((line, n) => (
                <p key={n}>
                  {line.quantity} × {line.itemId}
                  {line.note ? ` · ${line.note}` : ''}
                </p>
              ))}
            </div>
          ))}
        </details>
      )}
      <button type="button" onClick={() => void download()} disabled={busy}>
        {busy ? 'Preparing PDF…' : 'Download bill PDF'}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
