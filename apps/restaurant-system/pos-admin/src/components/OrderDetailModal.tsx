import { RefundRegisterSelect } from './billing/RefundRegisterSelect';
import React, { useState, useRef, useEffect } from 'react';
import { refundBillingOrder, voidBillingOrder } from './billing/billingCommands';
import { Order, OrderStatus } from '@jamanvaar/types';
import { formatDate, formatINR, formatTime, formatSplitTax, restaurantGstRate, taxLabels } from '@jamanvaar/utils';
import { Modal, Button, printThermalReceipt, OrderActivityView, type CanonicalOrderActivity } from '@jamanvaar/ui';
import { SessionPersistence } from '@jamanvaar/business';
import { db, OrderRepository, AuditRepository, ReceiptRepository } from '@jamanvaar/database';
import { getCurrentAdminName } from '../currentAdminIdentity';
import { signedDeviceFetch } from '../cloud/cloudClient';
const loadOrderActivity = async (id: string): Promise<CanonicalOrderActivity> => { const response = await signedDeviceFetch(`/api/v1/orders/sync/${encodeURIComponent(id)}/activity`); if (!response.ok) throw new Error('Order activity unavailable'); return response.json(); };
// The restaurant's configured GST (Customisations & Tax), read when shown.
const gstLabels = () => taxLabels(restaurantGstRate(db.taxGroups));
import { Printer, CheckCircle, Clock, Check } from 'lucide-react';

interface OrderDetailModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated: () => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  isOpen,
  onClose,
  onOrderUpdated
}) => {
  const operationLock = useRef(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [payingShiftId, setPayingShiftId] = useState('');
  const [moneyReturned, setMoneyReturned] = useState(false);
  const [returnMethod, setReturnMethod] = useState<'CASH' | 'UPI_TO_CUSTOMER'>('CASH');
  useEffect(() => { setMoneyReturned(false); setPayingShiftId(''); setIsVoiding(false); setIsRefunding(false); }, [order?.id, isOpen]);
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [voidError, setVoidError] = useState('');
  const [refundError, setRefundError] = useState('');

  if (!order) return null;

  const handlePrint = () => {
    printThermalReceipt(order, '80mm', ReceiptRepository.getConfig());
  };

  const handleAdvanceStatus = (newStatus: OrderStatus) => {
    OrderRepository.updateOrderStatus(order.id, newStatus, 'Admin Center');
    AuditRepository.log({
      action: 'ORDER_STATUS_CHANGED',
      category: 'ORDER',
      details: `Advanced order #${order.orderNumber} status to ${newStatus}`,
      username: getCurrentAdminName()
    });
    onOrderUpdated();
  };

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (operationLock.current) return;
    operationLock.current = true; setOperationBusy(true); setVoidError('');
    try { await voidBillingOrder(order, voidReason); setIsVoiding(false); setVoidReason(''); onOrderUpdated(); }
    catch (error) { setVoidError(error instanceof Error ? error.message : 'Cancellation failed.'); }
    finally { operationLock.current = false; setOperationBusy(false); }
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (operationLock.current) return;
    operationLock.current = true; setOperationBusy(true); setRefundError('');
    try {
      await refundBillingOrder(order, refundReason, moneyReturned, returnMethod, Number(refundAmount), payingShiftId || undefined);
      setIsRefunding(false); setRefundAmount(''); setRefundReason(''); setMoneyReturned(false); onOrderUpdated();
    } catch (error) { setRefundError(error instanceof Error ? error.message : 'Refund failed.'); }
    finally { operationLock.current = false; setOperationBusy(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Order #${order.orderNumber}`} maxWidth="2xl">
      <div className="space-y-5 py-1">
        {/* Header Summary Banner */}
        <div className="p-4 bg-jaman-navy text-white rounded-2xl flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold font-mono">{order.orderNumber}</span>
              <span className="bg-brand text-white font-bold text-xs px-2.5 py-0.5 rounded-full">
                TOKEN #{order.tokenNumber}
              </span>
            </div>
            <span className="text-xs text-slate-300 block mt-1">
              {formatDate(order.createdAt)} • {formatTime(order.createdAt)} • {order.orderType}
              {order.tableNumber ? ` • Table ${order.tableNumber}` : ''}
            </span>
          </div>

          <div className="text-right">
            <span className="text-xl font-mono font-bold text-emerald-400 block">
              {formatINR(order.totalAmount)}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              {order.paymentMethod} • {order.orderStatus}
            </span>
          </div>
        </div>

        {/* Customer & Staff Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-jaman-ivory border border-jaman-border rounded-xl space-y-1">
            <span className="text-slate-500 font-bold block text-[11px] uppercase">GUEST INFORMATION</span>
            <div className="font-bold text-jaman-navy flex items-center justify-between">
              <span>{order.customerName || 'Walk-in Guest'}</span>
              {order.customerPhone && <span className="font-mono text-slate-600 font-normal">{order.customerPhone}</span>}
            </div>
            {order.tableNumber && (
              <span className="text-[11px] text-brand font-bold block">
                Table #{order.tableNumber} ({order.guestCount || 4} Guests)
              </span>
            )}
          </div>

          <div className="p-3 bg-jaman-ivory border border-jaman-border rounded-xl space-y-1">
            <span className="text-slate-500 font-bold block text-[11px] uppercase">SERVICE STAFF</span>
            <div className="text-slate-700 font-bold flex items-center justify-between">
              <span>Cashier: <strong>{order.cashierName || '—'}</strong></span>
              <span>Captain: <strong>{order.captainName || '—'}</strong></span>
            </div>
            <span className="text-[11px] text-slate-500 block font-mono">
              Terminal: {order.kioskId || 'POS-01'}
            </span>
          </div>
        </div>

        {/* Items List */}
        <div className="space-y-2">
          <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Ordered Items ({order.items.length})</h4>
          <div className="border border-jaman-border rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs">
            {order.items.map((it, idx) => (
              <div key={idx} className="p-3 bg-white flex items-center justify-between">
                <div>
                  <span className="font-bold text-jaman-navy">{it.quantity}x {it.name}</span>
                  {it.modifiers && it.modifiers.length > 0 && (
                    <span className="text-[11px] text-slate-500 block">
                      + {it.modifiers.map((m: any) => m.optionName || m.name).join(', ')}
                    </span>
                  )}
                  {it.specialInstructions && (
                    <span className="text-[11px] text-amber-700 italic block">
                      Note: {it.specialInstructions}
                    </span>
                  )}
                </div>
                <span className="tabular-nums font-bold text-jaman-navy">{formatINR(it.totalPrice)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Breakup & Split Payment Allocation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-4 bg-jaman-ivory border border-jaman-border rounded-2xl space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">BILL BREAKUP</span>
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums font-semibold">{formatINR(order.subtotal)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>
                  Discount
                  {order.discountReason
                    ? ` (${order.discountReason})`
                    : order.couponCode
                    ? ` (${order.couponCode})`
                    : ''}
                </span>
                <span className="tabular-nums">-{formatINR(order.discountAmount)}</span>
              </div>
            )}
            {/* B2-036: formatSplitTax guarantees the two halves sum to the displayed Total Payable. */}
            <div className="flex justify-between text-slate-600">
              <span>{gstLabels().cgst}</span>
              <span className="tabular-nums">{formatSplitTax(order.taxAmount ?? 0, order.cgstAmount, order.sgstAmount).cgst}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>{gstLabels().sgst}</span>
              <span className="tabular-nums">{formatSplitTax(order.taxAmount ?? 0, order.cgstAmount, order.sgstAmount).sgst}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-jaman-navy">
              <span>Total Payable</span>
              <span className="tabular-nums text-emerald-700">{formatINR(order.totalAmount)}</span>
            </div>
          </div>

          <div className="p-4 bg-jaman-ivory border border-jaman-border rounded-2xl space-y-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">PAYMENT SETTLEMENT</span>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-600">Method:</span>
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 text-[11px] font-bold uppercase">
                  {order.paymentMethod}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-500">Total Settled:</span>
                <strong className="text-emerald-700 font-bold">{formatINR(order.totalAmount)}</strong>
              </div>
              <div className="flex items-center justify-between font-mono text-slate-500">
                <span>Remaining:</span>
                <span>₹0.00</span>
              </div>
              <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[11px] font-bold">
                <span className="text-slate-600">Status:</span>
                <span className="text-emerald-700 flex items-center gap-1 font-bold">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{order.paymentStatus === 'SUCCESS' ? 'FULLY PAID' : order.paymentStatus}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <OrderActivityView order={order} loadActivity={loadOrderActivity} />

        {/* Status Actions */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Advance Status:</span>
          <div className="flex flex-wrap gap-2">
            {(['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'] as OrderStatus[]).map((st) => (
              <button
                key={st}
                disabled={order.orderStatus === st || order.orderStatus === 'CANCELLED' || order.orderStatus === 'REFUNDED'}
                onClick={() => handleAdvanceStatus(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  order.orderStatus === st
                    ? 'bg-brand/[0.09] text-brand ring-1 ring-inset ring-brand/40 font-semibold'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Void / Refund Drawer Trigger Forms */}
        {isVoiding ? (
          <form onSubmit={handleVoid} className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-xs">
            <span className="font-bold text-rose-900 block">Reason for Voiding Order:</span>
            <input
              type="text"
              required
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Customer cancelled before cooking / duplicate bill"
              className="w-full bg-white border border-rose-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none"
            />
            {voidError && <p className="font-bold text-rose-700">{voidError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setIsVoiding(false)}>
                Cancel
              </Button>
              <button
                type="submit" disabled={operationBusy || !voidReason.trim()}
                className="min-h-11 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl shadow-xs"
              >
                {operationBusy ? 'Cancelling...' : 'Confirm Void Order'}
              </button>
            </div>
          </form>
        ) : isRefunding ? (
          <form onSubmit={handleRefund} className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-xs">
            <span className="font-bold text-amber-900 block">Process Refund:</span>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                required
                value={refundAmount}
                min="0.01" max={order.totalAmount} step="0.01"
                onChange={(e) => { setRefundAmount(e.target.value); setMoneyReturned(false); }}
                placeholder={`Amount (Max ₹${order.totalAmount})`}
                className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none"
              />
              <input
                type="text"
                required
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Reason (e.g. Food return)"
                className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none"
              />
            </div>
            <p>This records money already returned by staff; it does not send money through Razorpay.</p>
            <label className="block font-bold">Return method<select className="ml-2 rounded-xl border p-2" value={returnMethod} onChange={e => { setReturnMethod(e.target.value as 'CASH' | 'UPI_TO_CUSTOMER'); setMoneyReturned(false); }}><option value="CASH">Cash</option><option value="UPI_TO_CUSTOMER">UPI sent to customer</option></select></label>
            <RefundRegisterSelect value={payingShiftId} onChange={value => { setPayingShiftId(value); setMoneyReturned(false); }} />
            <label className="flex gap-2 items-center"><input type="checkbox" checked={moneyReturned} onChange={e => setMoneyReturned(e.target.checked)} />I confirm this amount has already been returned to the customer.</label>
            {refundError && <p className="font-bold text-amber-800">{refundError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setIsRefunding(false)}>
                Cancel
              </Button>
              <button
                type="submit" disabled={operationBusy || !moneyReturned || !refundReason.trim()}
                className="min-h-11 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-xl shadow-xs"
              >
                {operationBusy ? 'Recording...' : 'Record returned payment'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <div className="flex gap-2">
              {order.orderStatus !== 'CANCELLED' && order.orderStatus !== 'REFUNDED' && (
                <>
                  <button
                    disabled={['SUCCESS', 'REFUNDED', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus) || !!order.paymentAllocationSummary?.collectedPaise}
                    onClick={() => setIsVoiding(true)}
                    className="px-3 py-1.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold text-xs rounded-xl"
                  >
                    Void Order
                  </button>
                  <button
                    disabled={order.paymentStatus !== 'SUCCESS' || !!order.refundAmount}
                    onClick={() => {
                      setMoneyReturned(false);
                      setRefundAmount(order.totalAmount.toString());
                      setIsRefunding(true);
                    }}
                    className="px-3 py-1.5 bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 font-bold text-xs rounded-xl"
                  >
                    Refund Order
                  </button>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
              <button
                onClick={handlePrint}
                className="min-h-11 px-4 py-2 bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-sm rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Reprint Receipt</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
