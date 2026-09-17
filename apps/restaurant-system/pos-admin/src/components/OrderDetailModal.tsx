import React, { useState } from 'react';
import { createRefund, CloudApiError } from '../cloud/cloudClient';
import { Order, OrderStatus } from '@jamanvaar/types';
import { formatDate, formatINR, formatTime } from '@jamanvaar/utils';
import { Modal, Button, printThermalReceipt } from '@jamanvaar/ui';
import { OrderRepository, AuditRepository, ReceiptRepository } from '@jamanvaar/database';
import { Printer, XCircle, RefreshCw, CheckCircle, Clock, Utensils, AlertTriangle } from 'lucide-react';

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
      username: 'Manager'
    });
    onOrderUpdated();
  };

  const handleVoid = (e: React.FormEvent) => {
    e.preventDefault();
    setVoidError('');
    if (!voidReason) {
      setVoidError('A reason is required to void this order.');
      return;
    }
    try {
      OrderRepository.voidOrder(order.id, voidReason, 'Manager');
    } catch (err: any) {
      setVoidError(err?.message || 'Void failed.');
      return;
    }
    setIsVoiding(false);
    setVoidReason('');
    onOrderUpdated();
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefundError('');
    const amt = parseFloat(refundAmount) || order.totalAmount;
    if (!amt || !refundReason) {
      setRefundError('A valid amount and reason are required to process this refund.');
      return;
    }

    if (order.paymentMethod === 'UPI' && order.paymentTransactionId) {
      try {
        await createRefund(order.paymentTransactionId, Math.round(amt * 100), refundReason);
      } catch (err) {
        setRefundError(err instanceof CloudApiError ? err.message : 'Refund request failed');
        return; // never flip local status on a failed cloud refund
      }
    }

    try {
      OrderRepository.refundOrder(order.id, amt, refundReason, 'Manager');
    } catch (err: any) {
      setRefundError(err?.message || 'Refund failed.');
      return;
    }
    setIsRefunding(false);
    setRefundAmount('');
    setRefundReason('');
    onOrderUpdated();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Order #${order.orderNumber}`} maxWidth="2xl">
      <div className="space-y-5 py-1">
        {/* Header Summary Banner */}
        <div className="p-4 bg-jaman-navy text-white rounded-2xl flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black font-mono">{order.orderNumber}</span>
              <span className="bg-jaman-saffron text-white font-black text-xs px-2.5 py-0.5 rounded-full">
                TOKEN #{order.tokenNumber}
              </span>
            </div>
            <span className="text-xs text-slate-300 block mt-1">
              {formatDate(order.createdAt)} • {formatTime(order.createdAt)} • {order.orderType}
              {order.tableNumber ? ` • Table ${order.tableNumber}` : ''}
            </span>
          </div>

          <div className="text-right">
            <span className="text-xl font-mono font-black text-emerald-400 block">
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
            <span className="text-slate-400 font-bold block text-[10px] uppercase">GUEST INFORMATION</span>
            <div className="font-bold text-jaman-navy flex items-center justify-between">
              <span>{order.customerName || 'Walk-in Guest'}</span>
              {order.customerPhone && <span className="font-mono text-slate-600 font-normal">{order.customerPhone}</span>}
            </div>
            {order.tableNumber && (
              <span className="text-[11px] text-jaman-saffron font-bold block">
                Table #{order.tableNumber} ({order.guestCount || 4} Guests)
              </span>
            )}
          </div>

          <div className="p-3 bg-jaman-ivory border border-jaman-border rounded-xl space-y-1">
            <span className="text-slate-400 font-bold block text-[10px] uppercase">SERVICE STAFF</span>
            <div className="text-slate-700 font-bold flex items-center justify-between">
              <span>Cashier: <strong>{order.cashierName || 'Amit Dave'}</strong></span>
              <span>Captain: <strong>{order.captainName || (order.tableNumber ? 'Rahul Sharma' : '—')}</strong></span>
            </div>
            <span className="text-[10px] text-slate-400 block font-mono">
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
                    <span className="text-[11px] text-slate-400 block">
                      + {it.modifiers.map((m: any) => m.optionName || m.name).join(', ')}
                    </span>
                  )}
                  {it.specialInstructions && (
                    <span className="text-[10px] text-amber-700 italic block">
                      Note: {it.specialInstructions}
                    </span>
                  )}
                </div>
                <span className="font-mono font-bold text-jaman-navy">{formatINR(it.totalPrice)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Breakup & Split Payment Allocation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-4 bg-jaman-ivory border border-jaman-border rounded-2xl space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">BILL BREAKUP</span>
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono font-semibold">{formatINR(order.subtotal)}</span>
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
                <span className="font-mono">-{formatINR(order.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>CGST (2.5%)</span>
              <span className="font-mono">{formatINR(order.cgstAmount || 0)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>SGST (2.5%)</span>
              <span className="font-mono">{formatINR(order.sgstAmount || 0)}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between font-black text-sm text-jaman-navy">
              <span>Total Payable</span>
              <span className="font-mono text-emerald-700">{formatINR(order.totalAmount)}</span>
            </div>
          </div>

          <div className="p-4 bg-jaman-ivory border border-jaman-border rounded-2xl space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PAYMENT SETTLEMENT</span>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-600">Method:</span>
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-black uppercase">
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
                <span className="text-emerald-700 flex items-center gap-1 font-black">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{order.paymentStatus === 'SUCCESS' ? '✓ FULLY PAID' : order.paymentStatus}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Order Service Timeline */}
        <div className="p-4 bg-jaman-cream border border-jaman-border rounded-2xl space-y-2.5">
          <span className="text-xs font-black uppercase tracking-wider text-jaman-navy flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-jaman-saffron" />
            <span>ORDER SERVICE TIMELINE</span>
          </span>

          <div className="space-y-2 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 text-xs">
            <div className="flex items-start gap-3 relative pl-6">
              <div className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[8px] absolute left-0 top-0.5">
                ✓
              </div>
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <strong className="text-jaman-navy block">Order Created ({order.orderType})</strong>
                  <span className="text-[10px] text-slate-400">Token #{order.tokenNumber} initialized</span>
                </div>
                <span className="font-mono text-slate-500 font-bold">{formatTime(order.createdAt)}</span>
              </div>
            </div>

            <div className="flex items-start gap-3 relative pl-6">
              <div className="w-4 h-4 rounded-full bg-jaman-saffron text-white flex items-center justify-center font-bold text-[8px] absolute left-0 top-0.5">
                ✓
              </div>
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <strong className="text-jaman-navy block">KOT Dispatched to Kitchen Stations</strong>
                  <span className="text-[10px] text-slate-400">Tandoor & Main Kitchen active</span>
                </div>
                <span className="font-mono text-slate-500 font-bold">
                  {formatTime(new Date(new Date(order.createdAt).getTime() + 60000))}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 relative pl-6">
              <div className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[8px] absolute left-0 top-0.5">
                ✓
              </div>
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <strong className="text-jaman-navy block">Payment Received & Bill Settled</strong>
                  <span className="text-[10px] text-slate-400">{order.paymentMethod} verified</span>
                </div>
                <span className="font-mono text-slate-500 font-bold">{formatTime(order.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>

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
                    ? 'bg-jaman-navy text-white shadow-xs'
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
                type="submit"
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Confirm Void Order
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
                onChange={(e) => setRefundAmount(e.target.value)}
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
            {refundError && <p className="font-bold text-amber-800">{refundError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setIsRefunding(false)}>
                Cancel
              </Button>
              <button
                type="submit"
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Confirm Refund
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <div className="flex gap-2">
              {order.orderStatus !== 'CANCELLED' && order.orderStatus !== 'REFUNDED' && (
                <>
                  <button
                    onClick={() => setIsVoiding(true)}
                    className="px-3 py-1.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold text-xs rounded-xl"
                  >
                    Void Order
                  </button>
                  <button
                    onClick={() => {
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
                className="px-4 py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs"
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
