import { useState } from 'react';
import { QrApi, type Placed } from './api';
import { printElement } from '../../../packages/ui/src/printElement';
import './order-receipt.css';

export function OrderReceipt({ order }: { order: Placed }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const design = order.receiptDesign;
  const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: order.currency || 'INR' }).format(amount);
  const paid = order.paymentStatus === 'SUCCESS' || (order.balance ? order.balance.outstandingPaise <= 0 : false);
  async function download() {
    setBusy(true);
    setError('');
    try {
      const blob = await QrApi.receipt(order.publicOrderId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bill-${(order.orderNumber || order.publicOrderId).replace(/[^A-Za-z0-9_-]/g, '')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the bill.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="guest-bill" aria-label="Your order bill">
      <header>
        <div>
          <h3>Your bill</h3>
          <p>{order.status === 'CANCELLED' ? 'Order cancelled' : paid ? 'Payment received' : 'Bill available · payment pending'}</p>
        </div>
        <button type="button" className="primary" disabled={busy} onClick={() => void download()}>
          {busy ? 'Preparing PDF…' : 'Download bill PDF'}
        </button>
      </header>
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
      <details className="receipt">
        <summary>View itemised bill</summary>
        <div id="qr-order-receipt" className="guest-bill-document" style={{ borderTopColor: design?.accent || '#0b253a' }}>
          <div className="guest-bill-identity">
            <h3>{order.restaurantName}</h3>
            <p>{order.branchName}</p>
            {design?.contact && <p>{design.contact}</p>}
            <strong>{order.status === 'CANCELLED' ? 'Cancelled order' : design?.heading || 'Order bill'}</strong>
          </div>
          <dl className="guest-bill-meta">
            <div>
              <dt>Order</dt>
              <dd>{order.orderNumber || order.publicOrderId}</dd>
            </div>
            <div>
              <dt>Table</dt>
              <dd>{order.table || 'Takeaway'}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{new Date(order.placedAt).toLocaleString()}</dd>
            </div>
          </dl>
          {design?.showCustomer !== false && order.customer && (
            <p>{[order.customer.name, order.customer.phone, order.customer.email].filter(Boolean).join(' · ')}</p>
          )}
          <ul className="lines">
            {order.items?.map((item, index) => (
              <li key={index}>
                <div className="grow">
                  <b>
                    {item.name} × {item.quantity}
                  </b>
                  <p className="idesc">
                    {item.options.join(', ')}
                    {design?.showNotes !== false && item.note ? ` · ${item.note}` : ''}
                  </p>
                  <small>{money(item.unitPrice)} each</small>
                </div>
                <span>{money(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{money(order.subtotal ?? 0)}</dd>
            </div>
            {!!order.discount && (
              <div>
                <dt>Discount</dt>
                <dd>−{money(order.discount)}</dd>
              </div>
            )}
            {design?.showTaxBreakup !== false && order.cgst !== undefined && order.sgst !== undefined ? (
              <>
                <div>
                  <dt>CGST</dt>
                  <dd>{money(order.cgst)}</dd>
                </div>
                <div>
                  <dt>SGST</dt>
                  <dd>{money(order.sgst)}</dd>
                </div>
              </>
            ) : (
              <div>
                <dt>Tax</dt>
                <dd>{money(order.tax ?? 0)}</dd>
              </div>
            )}
            <div className="grand">
              <dt>Total</dt>
              <dd>{money(order.total)}</dd>
            </div>
            <div>
              <dt>Collected</dt>
              <dd>{money(order.balance ? order.balance.collectedPaise / 100 : paid ? order.total : 0)}</dd>
            </div>
            <div>
              <dt>Balance due</dt>
              <dd>{money(order.balance ? order.balance.outstandingPaise / 100 : paid ? 0 : order.total)}</dd>
            </div>
            {!!order.balance?.refundedPaise && (
              <div>
                <dt>Refunded</dt>
                <dd>{money(order.balance.refundedPaise / 100)}</dd>
              </div>
            )}
          </dl>
          <p className="receipt-payment-status">
            {order.status === 'CANCELLED'
              ? 'Order cancelled'
              : paid
                ? 'Payment received'
                : order.paymentMethod === 'ONLINE'
                  ? 'Online payment pending verification'
                  : 'Payment due at counter'}
          </p>
          {design?.showNotes !== false && order.notes && <p>Kitchen notes: {order.notes}</p>}
          <p className="guest-bill-reference">Reference: {order.publicOrderId}</p>
          <p>{design?.thankYou || 'Thank you for dining with us!'}</p>
          {design?.footer && <p>{design.footer}</p>}
        </div>
        <button
          type="button"
          className="link no-print"
          onClick={() => printElement('#qr-order-receipt', { title: `${order.restaurantName} - ${order.orderNumber || order.publicOrderId}`, margin: '12mm' })}
        >
          Print bill
        </button>
      </details>
    </section>
  );
}
