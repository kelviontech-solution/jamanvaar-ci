import { useMemo } from 'react';
import type { Order } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { formatINR, formatDate, formatTime } from '@jamanvaar/utils';

export type DrillDownMetric = 'GROSS' | 'NET' | 'DISCOUNTS' | 'TAX' | 'ORDERS' | 'AOV' | 'REFUNDS' | 'CANCELLED';

const METRIC_LABEL: Record<DrillDownMetric, string> = {
  GROSS: 'Gross Sales', NET: 'Net Collected', DISCOUNTS: 'Discounts', TAX: 'Tax Collected',
  ORDERS: 'Total Orders', AOV: 'Average Ticket', REFUNDS: 'Refunds', CANCELLED: 'Cancelled Orders'
};

/** Matches calculateSummary's own predicates in reportDataEngine.ts, so the drill-down total always ties back to the KPI it explains. */
function ordersFor(metric: DrillDownMetric, orders: Order[]): Order[] {
  const anyO = (o: Order) => o as unknown as { refundStatus?: string };
  switch (metric) {
    case 'CANCELLED':
      return orders.filter((o) => o.orderStatus === 'CANCELLED');
    case 'REFUNDS':
      return orders.filter((o) => ['FULL_REFUND', 'PARTIAL_REFUND'].includes(anyO(o).refundStatus ?? ''));
    case 'DISCOUNTS':
      return orders.filter((o) => o.orderStatus !== 'CANCELLED' && Number(o.discountAmount || 0) > 0);
    default:
      return orders.filter((o) => o.orderStatus !== 'CANCELLED');
  }
}

/**
 * #18: KPI cards were plain numbers with no way to see what produced them -- an owner noticing
 * an unexpected "Net Collected" figure had to go reopen Orders and manually re-filter by the
 * same date range to find out why. This reuses the same order list the KPI was computed from
 * (currentOrders), filtered by the metric's own definition, so the total always reconciles.
 */
export function KpiDrillDownModal({ metric, orders, onClose }: { metric: DrillDownMetric; orders: Order[]; onClose: () => void }) {
  const rows = useMemo(() => ordersFor(metric, orders), [metric, orders]);
  const total = useMemo(() => {
    if (metric === 'DISCOUNTS') return rows.reduce((s, o) => s + Number(o.discountAmount || 0), 0);
    if (metric === 'TAX') return rows.reduce((s, o) => s + Number(o.cgstAmount || 0) + Number(o.sgstAmount || 0), 0);
    if (metric === 'GROSS') return rows.reduce((s, o) => s + Number(o.subtotal || 0), 0);
    if (metric === 'REFUNDS') return rows.reduce((s, o) => s + Number((o as unknown as { refundAmount?: number }).refundAmount || 0), 0);
    return rows.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
  }, [metric, rows]);

  return (
    <Modal isOpen onClose={onClose} title={`${METRIC_LABEL[metric]} — ${rows.length} order(s)`} maxWidth="2xl">
      <div className="space-y-3">
        <p className="text-sm font-bold text-jaman-navy">
          {metric === 'ORDERS' || metric === 'AOV' ? `${rows.length} orders` : formatINR(total)} from {rows.length} order(s) in the selected period.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">No orders match this figure in the selected period.</p>
        ) : (
          <div className="max-h-96 overflow-auto rounded-xl border border-jaman-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-jaman-cream text-slate-500 uppercase font-bold text-[11px]">
                <tr>
                  <th className="p-2.5">Order</th>
                  <th className="p-2.5">When</th>
                  <th className="p-2.5">Status</th>
                  {metric === 'DISCOUNTS' && <th className="p-2.5">Discount</th>}
                  {metric === 'REFUNDS' && <th className="p-2.5">Refunded</th>}
                  <th className="p-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="p-2.5 font-mono font-bold text-jaman-navy">{o.orderNumber}</td>
                    <td className="p-2.5 text-slate-600">{formatDate(o.createdAt)} {formatTime(o.createdAt)}</td>
                    <td className="p-2.5 text-slate-600">{o.orderStatus}</td>
                    {metric === 'DISCOUNTS' && <td className="p-2.5 text-rose-600 font-bold">-{formatINR(o.discountAmount || 0)}</td>}
                    {metric === 'REFUNDS' && <td className="p-2.5 text-rose-600 font-bold">-{formatINR((o as unknown as { refundAmount?: number }).refundAmount || 0)}</td>}
                    <td className="p-2.5 text-right font-mono font-bold">{formatINR(o.totalAmount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
