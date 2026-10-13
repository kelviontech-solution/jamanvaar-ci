import React from 'react';
import type { Order } from '@jamanvaar/types';
import { orderPaymentPosition } from '@jamanvaar/database';
import { formatINR, formatDate, formatTime, getOrderSource, ORDER_SOURCE_LABELS } from '@jamanvaar/utils';

/** A compact view of the same filtered records as the ledger, never a second data source. */
export function OrderSummaryCards({ orders, onView }: { orders: Order[]; onView: (order: Order) => void }) {
  return <div className="md:hidden print:hidden space-y-3 p-3" data-testid="mobile-order-summaries">
    {orders.map(order => {
      const position = orderPaymentPosition(order);
      const cancelled = order.orderStatus === 'CANCELLED';
      return <article key={order.id} className="bg-white border border-[#ebe6dd] rounded-2xl p-4 space-y-3">
        <div className="flex justify-between gap-3 items-start">
          <div className="min-w-0"><h3 className="font-bold text-[#0b253a] break-words">#{order.orderNumber}</h3><p className="text-sm text-slate-600">{formatDate(order.createdAt)} · {formatTime(order.createdAt)}</p></div>
          <strong className="text-lg text-[#0b253a] shrink-0">{formatINR(order.totalAmount, true)}</strong>
        </div>
        <p className="text-sm text-slate-600">{ORDER_SOURCE_LABELS[getOrderSource(order)]} · {order.tableNumber ? `Table ${order.tableNumber}` : order.orderType.replaceAll('_', ' ')}{order.tokenNumber ? ` · ${order.tokenNumber}` : ''}</p>
        <p className="text-sm font-semibold">{order.customerName || 'Walk-in guest'} · {order.items.length} items</p>
        <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-600">Collected</dt><dd className="font-bold text-emerald-800">{formatINR(position.collectedPaise / 100, true)}</dd></div><div><dt className="text-slate-600">{cancelled ? 'Refunded' : 'Outstanding'}</dt><dd className="font-bold text-amber-800">{formatINR((cancelled ? position.refundedPaise : position.outstandingPaise) / 100, true)}</dd></div></dl>
        <div className="flex flex-wrap justify-between items-center gap-2"><span className="text-sm font-bold text-slate-700">{order.orderStatus.replaceAll('_', ' ')}</span><button type="button" aria-label={`View order ${order.orderNumber}`} onClick={() => onView(order)} className="min-h-11 px-4 rounded-xl bg-[#0b253a] text-white text-sm font-bold">View details</button></div>
      </article>;
    })}
  </div>;
}
