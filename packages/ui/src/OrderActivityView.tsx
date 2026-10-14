import { useEffect, useState } from 'react';
import type { Order } from '@jamanvaar/types';
import { formatINR, formatRestaurantDate } from '@jamanvaar/utils';
import { receiptPaymentSummary } from './ThermalReceiptView';

export interface CanonicalOrderActivity {
  externalOrderId: string;
  source: string;
  branch: string;
  status: string;
  paymentStatus: string | null;
  version: number;
  balance: { collectedPaise: number; outstandingPaise: number; refundedPaise: number };
  events: Array<{ at: string; label: string; amountPaise?: number }>;
  generatedAt: string;
}
export function OrderActivityView({ order, loadActivity }: { order: Order; loadActivity?: (id: string) => Promise<CanonicalOrderActivity> }) {
  const [remote, setRemote] = useState<CanonicalOrderActivity | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setRemote(null);
    setError('');
    if (loadActivity)
      void loadActivity(order.id)
        .then((data) => {
          if (active) setRemote(data);
        })
        .catch(() => {
          if (active) setError('Server history unavailable. Showing recorded activity on this device.');
        });
    return () => {
      active = false;
    };
  }, [order.id, order.remoteSyncVersion, loadActivity]);
  const payment = receiptPaymentSummary(order);
  const local = [
    { at: order.createdAt, label: 'Order created' },
    ...(order.timeline || [])
      .filter((event) => !['PAID', 'SUCCESS', 'REFUNDED'].includes(event.status))
      .map((event) => ({ at: event.timestamp, label: event.title }))
  ];
  if (order.paymentConfirmation) local.push({ at: order.paymentConfirmation.at, label: `Collection confirmed by ${order.paymentConfirmation.actor}` });
  const events =
    remote?.events ||
    local.filter((event, i, all) => Number.isFinite(Date.parse(event.at)) && all.findIndex((e) => e.at === event.at && e.label === event.label) === i);
  return (
    <section className="rounded-2xl border border-jaman-border bg-jaman-cream p-4 space-y-3" aria-label="Order activity">
      <h3 className="font-bold text-jaman-navy">Order activity</h3>
      <p className="text-xs text-slate-600">
        {remote
          ? `${remote.source} · ${remote.branch} · Server version ${remote.version}`
          : `${order.source_type || order.orderType} · Recorded on this device`}
      </p>
      <p className="text-sm">
        Collected {formatINR(remote ? remote.balance.collectedPaise / 100 : payment.collected)} · Balance due{' '}
        {formatINR(remote ? remote.balance.outstandingPaise / 100 : payment.outstanding)}
        {remote && remote.balance.refundedPaise > 0 ? ` · Refunded ${formatINR(remote.balance.refundedPaise / 100)}` : ''}
      </p>
      {error && (
        <p role="status" className="text-xs text-amber-800">
          {error}
        </p>
      )}
      <ol className="space-y-2 max-h-64 overflow-y-auto">
        {events.map((event, i) => (
          <li key={`${event.at}:${i}`} className="border-l-2 border-brand pl-3 text-xs">
            <strong>{event.label}</strong>
            {'amountPaise' in event && typeof event.amountPaise === 'number' && <span> · {formatINR(event.amountPaise / 100)}</span>}
            <time className="block text-slate-500" dateTime={event.at}>
              {formatRestaurantDate(event.at)}
            </time>
          </li>
        ))}
      </ol>
      <p className="text-xs text-slate-500">
        Order status: {remote?.status || order.orderStatus}. Payment status:{' '}
        {(remote?.paymentStatus || order.paymentStatus || 'pending').toLowerCase().replaceAll('_', ' ')}. Events without a recorded timestamp are not inferred.
      </p>
    </section>
  );
}
