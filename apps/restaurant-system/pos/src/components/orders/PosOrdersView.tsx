import React, { useState, useMemo } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, OrderRepository, BusinessDayRepository, QrOrderingRepository, RiderRepository } from '@jamanvaar/database';
import { Order, OrderStatus } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import { getPaymentStatus } from '../../cloud/cloudClient';
import {
  ShoppingBag,
  Search,
  CheckCircle2,
  Clock,
  Printer,
  CreditCard,
  ChefHat,
  Filter,
  ArrowRight,
  Eye,
  AlertCircle,
  Calendar,
  Sparkles,
  History,
  Flame,
  Undo2,
  Ban
} from 'lucide-react';

export const PosOrdersView: React.FC = () => {
  const {
    setSelectedTable,
    loadOrderFromTable,
    setActiveTab,
    setLastCompletedOrder,
    setIsReceiptOpen,
    setIsPaymentOpen,
    requestManagerOverride,
    currentUser
  } = usePosStore();

  const [scopeFilter, setScopeFilter] = useState<'ACTIVE_DAY' | 'ALL_DAYS'>('ACTIVE_DAY');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [checkingOrderId, setCheckingOrderId] = useState<string | null>(null);
  const [refundVoidMode, setRefundVoidMode] = useState<'REFUND' | 'VOID' | null>(null);
  const [refundVoidReason, setRefundVoidReason] = useState('');
  const [refundAmountInput, setRefundAmountInput] = useState('');
  const [refundVoidError, setRefundVoidError] = useState('');

  const activeDay = BusinessDayRepository.getActiveBusinessDay();
  const allOrders = db.orders;

  // Filter orders according to active business day vs historical archive
  const scopedOrders = useMemo(() => {
    if (scopeFilter === 'ALL_DAYS') {
      return allOrders;
    }
    // ACTIVE_DAY: Show orders belonging to the currently open business day
    return allOrders.filter((o) => {
      if (o.businessDayId) {
        return o.businessDayId === activeDay.id;
      }
      // Fallback for orders created on the same business date — matches
      // BusinessDayRepository's own 5:00 AM-cutoff canonical date instead of
      // a raw UTC calendar-date string, which disagreed with it near midnight.
      const oDate = BusinessDayRepository.getCanonicalBusinessDate(new Date(o.createdAt)).dateKey;
      return oDate === activeDay.businessDate;
    });
  }, [allOrders, scopeFilter, activeDay.id, activeDay.businessDate]);

  const filteredOrders = useMemo(() => {
    return scopedOrders.filter((o) => {
      if (statusFilter !== 'ALL' && o.orderStatus !== statusFilter) return false;
      if (sourceFilter !== 'ALL') {
        const orderSrc =
          o.source_type ||
          (o.orderType === 'QR_TABLE'
            ? 'QR_TABLE'
            : o.kioskId?.startsWith('KIOSK')
            ? 'KIOSK'
            : 'POS');
        if (orderSrc !== sourceFilter) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNum = o.orderNumber.toLowerCase().includes(q);
        const matchToken = o.tokenNumber.includes(q);
        const matchCust = o.customerName?.toLowerCase().includes(q) || o.customerPhone?.includes(q) || o.customerNotes?.toLowerCase().includes(q);
        return matchNum || matchToken || matchCust;
      }
      return true;
    });
  }, [scopedOrders, statusFilter, sourceFilter, search]);

  // Session KPIs
  const sessionStats = useMemo(() => {
    const total = scopedOrders.length;
    const completed = scopedOrders.filter((o) => o.orderStatus === 'COMPLETED').length;
    const active = scopedOrders.filter((o) => o.orderStatus === 'PREPARING' || o.orderStatus === 'READY' || o.orderStatus === 'CONFIRMED' || o.orderStatus === 'NEW').length;
    const totalSales = scopedOrders
      .filter((o) => o.orderStatus === 'COMPLETED')
      .reduce((sum, o) => sum + o.totalAmount, 0);

    return { total, completed, active, totalSales };
  }, [scopedOrders]);

  const handleSettleCounterCash = async (order: Order) => {
    const isUnconfirmedKioskUpi = order.paymentMethod === 'UPI' && order.paymentStatus === 'PENDING';
    // A UPI attempt may have landed at Cashfree moments after the kiosk gave
    // up waiting — check the real cloud status before trusting the customer's
    // word, so cash is never collected on top of a payment that already went
    // through.
    if (isUnconfirmedKioskUpi && order.paymentTransactionId) {
      setCheckingOrderId(order.id);
      try {
        const result = await getPaymentStatus(order.paymentTransactionId);
        if (result.status === 'SUCCESS') {
          OrderRepository.settleOrder(order.id, 'UPI', undefined, order.paymentTransactionId, 'Cashfree UPI (reconciled at counter)');
          const updated = OrderRepository.getOrderById(order.id);
          if (updated) {
            setLastCompletedOrder(updated);
            setIsReceiptOpen(true);
          }
          alert('This order was already paid via UPI — do not collect cash. The receipt reflects the online payment.');
          return;
        }
      } catch {
        // Network/device-auth failure — fall through to manual cash
        // settlement; staff already saw the on-screen warning and can ask
        // the customer directly.
      } finally {
        setCheckingOrderId(null);
      }
    }

    OrderRepository.settleOrder(order.id, 'CASH', order.totalAmount, undefined, 'Cashier Counter');
    const updated = OrderRepository.getOrderById(order.id);
    if (updated) {
      setLastCompletedOrder(updated);
      setIsReceiptOpen(true);
    }
  };

  const handleAdvanceStatus = (orderId: string, nextStatus: OrderStatus) => {
    OrderRepository.updateOrderStatus(orderId, nextStatus, 'POS Cashier');
  };

  const openRefundVoid = (mode: 'REFUND' | 'VOID') => {
    if (!selectedOrder) return;
    setRefundVoidMode(mode);
    setRefundVoidReason('');
    setRefundAmountInput(selectedOrder.totalAmount.toString());
    setRefundVoidError('');
  };

  const submitRefundVoid = () => {
    if (!selectedOrder || !refundVoidMode) return;
    if (!refundVoidReason.trim()) {
      setRefundVoidError('Please enter a reason.');
      return;
    }

    const orderId = selectedOrder.id;
    const mode = refundVoidMode;
    const reason = refundVoidReason.trim();
    const amount = Number(refundAmountInput);

    requestManagerOverride(
      mode === 'REFUND' ? 'REFUND' : 'VOID_ORDER',
      mode === 'REFUND' ? `Refund Order #${selectedOrder.orderNumber}` : `Void Order #${selectedOrder.orderNumber}`,
      `${currentUser?.fullName || 'Cashier'} requested a ${mode === 'REFUND' ? `₹${amount} refund` : 'void'} — ${reason}`,
      (managerName: string) => {
        try {
          const updated =
            mode === 'REFUND'
              ? OrderRepository.refundOrder(orderId, amount, reason, managerName)
              : OrderRepository.voidOrder(orderId, reason, managerName);
          if (updated) setSelectedOrder(updated);
          setRefundVoidMode(null);
        } catch (err: any) {
          setRefundVoidError(err?.message || 'Action failed.');
        }
      }
    );
  };

  return (
    <>
    <div className="flex-1 flex flex-col h-full bg-jaman-cream p-4 sm:p-6 overflow-hidden select-none">
      {/* Header & Session Scope Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-jaman-navy flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-jaman-saffron" />
              <span>Live Restaurant Orders</span>
            </h1>
            <span className="text-xs font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {activeDay.status === 'OPEN' ? 'Session Active' : 'Session Closing'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {scopeFilter === 'ACTIVE_DAY'
              ? `Showing real-time orders for current business session: ${activeDay.displayDate} (${activeDay.id})`
              : 'Viewing complete database order archive across all past and closed business sessions.'}
          </p>
        </div>

        {/* Scope Pill Selector: Active Session vs Complete History */}
        <div className="flex items-center gap-1.5 bg-white border border-jaman-border p-1 rounded-2xl shadow-2xs">
          <button
            type="button"
            onClick={() => setScopeFilter('ACTIVE_DAY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              scopeFilter === 'ACTIVE_DAY'
                ? 'bg-jaman-saffron text-white shadow-xs'
                : 'text-slate-600 hover:text-jaman-navy hover:bg-slate-50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Active Session ({activeDay.orderCount || scopedOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setScopeFilter('ALL_DAYS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              scopeFilter === 'ALL_DAYS'
                ? 'bg-jaman-navy text-white shadow-xs'
                : 'text-slate-600 hover:text-jaman-navy hover:bg-slate-50'
            }`}
            title="View complete historical orders across all past days"
          >
            <History className="w-3.5 h-3.5" />
            <span>All History ({allOrders.length})</span>
          </button>
        </div>
      </div>

      {/* Filter Controls & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, token, table, customer..."
            className="w-full bg-white border border-jaman-border rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-jaman-navy placeholder:text-slate-400 focus:outline-none focus:border-jaman-saffron"
          />
        </div>

        {/* Source Pills */}
        <div className="flex items-center gap-1 bg-white border border-jaman-border p-1 rounded-xl shadow-2xs overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Sources' },
            { id: 'QR_TABLE', label: '🟠 QR Table' },
            { id: 'POS', label: '🖥️ Counter POS' },
            { id: 'KIOSK', label: '📱 Self-Order Kiosk' },
            { id: 'CAPTAIN', label: '🧑‍🍳 Floor Captain' }
          ].map((src) => (
            <button
              key={src.id}
              type="button"
              onClick={() => setSourceFilter(src.id)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                sourceFilter === src.id
                  ? 'bg-jaman-navy text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-jaman-navy'
              }`}
            >
              {src.label}
            </button>
          ))}
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1 bg-white border border-jaman-border p-1 rounded-xl shadow-2xs">
          {['ALL', 'NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-jaman-saffron text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-jaman-navy'
              }`}
            >
              {st.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List & Preview Pane */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        {/* Left: Orders Table */}
        <div className="lg:col-span-8 bg-white border border-jaman-border rounded-2xl overflow-y-auto shadow-2xs divide-y divide-slate-100">
          {filteredOrders.length > 0 ? (
            filteredOrders.map((order) => {
              const isQr = order.source_type === 'QR_TABLE' || order.orderType === 'QR_TABLE';
              const isKiosk =
                !isQr &&
                (order.source_type === 'KIOSK' ||
                  (order.kioskId?.startsWith('KIOSK') && order.source_type !== 'POS' && order.source_type !== 'CAPTAIN'));
              const isCaptain = !isQr && order.source_type === 'CAPTAIN';
              // Any PENDING order can be settled with cash at the counter —
              // not just ones the customer picked "Cash" for upfront. A
              // kiosk order whose UPI attempt failed or timed out still
              // carries paymentMethod: 'UPI' with paymentStatus: 'PENDING',
              // and staff need to be able to collect cash for it too.
              const isCounterCashPending = order.paymentStatus === 'PENDING';
              // This specific order attempted a real UPI payment first —
              // Cashfree's webhook (or this kiosk's own background
              // reconciliation) may still confirm it after the visible
              // countdown gave up, so staff should check with the customer
              // before accepting cash for exactly this case.
              const isUnconfirmedKioskUpi = isKiosk && order.paymentMethod === 'UPI' && order.paymentStatus === 'PENDING';

              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                    selectedOrder?.id === order.id
                      ? 'bg-amber-50/60 border-l-4 border-l-jaman-saffron'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm text-jaman-navy">
                        #{order.orderNumber}
                      </span>
                      <span className="text-xs font-black bg-jaman-saffron text-white px-2 py-0.5 rounded-md font-mono">
                        Token #{order.tokenNumber}
                      </span>
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded uppercase">
                        {order.orderType}
                      </span>
                      {isQr ? (
                        <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded">
                          🟠 QR Table {order.tableNumber ? `(T-${order.tableNumber})` : ''}
                        </span>
                      ) : isKiosk ? (
                        <span className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">
                          📱 Kiosk ({order.kioskId || 'KIOSK-01'})
                        </span>
                      ) : isCaptain ? (
                        <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
                          🧑‍🍳 Captain {order.tableNumber ? `(T-${order.tableNumber})` : ''}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
                          🖥️ Counter POS
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {new Date(order.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      <span>•</span>
                      <span>{order.items.length} items</span>
                      {order.customerName && (
                        <>
                          <span>•</span>
                          <span>{order.customerName}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <div className="text-right">
                      <div className="font-mono font-black text-base text-jaman-navy">
                        {formatINR(order.totalAmount)}
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full inline-block ${
                          order.orderStatus === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : order.orderStatus === 'PREPARING'
                            ? 'bg-amber-100 text-amber-800'
                            : order.orderStatus === 'READY'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {order.orderStatus}
                      </span>
                    </div>

                    {/* Fast Cash at Counter Settle Action */}
                    {isCounterCashPending && (
                      <div className="flex flex-col items-end gap-1">
                        {isUnconfirmedKioskUpi && (
                          <p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded max-w-[220px] text-right">
                            ⚠ Attempted UPI first — confirm with the customer they haven't already paid online before accepting cash.
                          </p>
                        )}
                        <button
                          type="button"
                          disabled={checkingOrderId === order.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSettleCounterCash(order);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-wait text-white font-extrabold text-xs flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                          title={isUnconfirmedKioskUpi ? 'Checks the real UPI payment status before collecting cash' : 'Collect cash & print thermal receipt'}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>{checkingOrderId === order.id ? 'Checking…' : 'Settle Cash'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="font-black text-base text-jaman-navy">
                {scopeFilter === 'ACTIVE_DAY'
                  ? `Active Session Ready • 0 Live Orders`
                  : 'No Orders Found in Archive'}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                {scopeFilter === 'ACTIVE_DAY'
                  ? `Business Day ${activeDay.displayDate} is open and ready. New orders from Kiosk, Captain, or Counter POS will appear here automatically.`
                  : 'No orders match your active search or status filters.'}
              </p>
              {scopeFilter === 'ACTIVE_DAY' && allOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScopeFilter('ALL_DAYS')}
                  className="px-4 py-2 bg-white border border-jaman-border hover:border-jaman-saffron text-jaman-navy rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 inline-flex items-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5 text-jaman-saffron" />
                  <span>View Past Orders History ({allOrders.length})</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Selected Order Detail Preview Pane */}
        <div className="lg:col-span-4 bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs flex flex-col justify-between overflow-y-auto">
          {selectedOrder ? (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-lg text-jaman-navy">
                    #{selectedOrder.orderNumber}
                  </span>
                  <span className="text-xs font-black bg-jaman-saffron text-white px-2 py-0.5 rounded-md font-mono">
                    Token #{selectedOrder.tokenNumber}
                  </span>
                </div>
                <span className="text-xs text-slate-400 block mt-0.5">
                  {new Date(selectedOrder.createdAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })}
                </span>
              </div>

              {/* Customer Details */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Order Type:</span>
                  <strong className="text-jaman-navy uppercase">{selectedOrder.orderType}</strong>
                </div>
                {selectedOrder.tableNumber && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Table:</span>
                    <strong className="text-jaman-navy">Table {selectedOrder.tableNumber}</strong>
                  </div>
                )}
                {selectedOrder.customerName && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Customer:</span>
                    <strong className="text-jaman-navy">{selectedOrder.customerName}</strong>
                  </div>
                )}
                {selectedOrder.customerPhone && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-mono text-slate-600">{selectedOrder.customerPhone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Payment:</span>
                  <span className="font-bold text-jaman-navy">
                    {selectedOrder.paymentMethod || 'CASH'} ({selectedOrder.paymentStatus})
                  </span>
                </div>
              </div>

              {/* Delivery Dispatch — previously a DELIVERY order had an
                  orderType and nothing else: no rider, no status tracking. */}
              {selectedOrder.orderType === 'DELIVERY' && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-blue-900 uppercase tracking-wide text-[11px]">Delivery Dispatch</span>
                    <span className="font-bold text-blue-800">{selectedOrder.deliveryStatus || 'UNASSIGNED'}</span>
                  </div>
                  <select
                    value={selectedOrder.riderId || ''}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const updated = RiderRepository.assignRider(selectedOrder.id, e.target.value);
                      if (updated) setSelectedOrder(updated);
                    }}
                    className="w-full bg-white border border-blue-200 rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    <option value="">Assign a rider…</option>
                    {RiderRepository.getActiveRiders().map((r) => (
                      <option key={r.id} value={r.id}>{r.name} ({r.vehicleType})</option>
                    ))}
                  </select>
                  {selectedOrder.riderId && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          const updated = RiderRepository.updateDeliveryStatus(selectedOrder.id, 'OUT_FOR_DELIVERY');
                          if (updated) setSelectedOrder(updated);
                        }}
                        className="flex-1 px-2 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold cursor-pointer"
                      >
                        Out for Delivery
                      </button>
                      <button
                        onClick={() => {
                          const updated = RiderRepository.updateDeliveryStatus(selectedOrder.id, 'DELIVERED');
                          if (updated) setSelectedOrder(updated);
                        }}
                        className="flex-1 px-2 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer"
                      >
                        Delivered
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Special Instructions / Notes Banner */}
              {selectedOrder.customerNotes && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 font-medium">
                  <strong>Guest Note:</strong> &ldquo;{selectedOrder.customerNotes}&rdquo;
                </div>
              )}

              {/* Kitchen Station Routing Breakdown */}
              <div className="p-2.5 rounded-xl bg-jaman-cream border border-jaman-border text-xs space-y-1">
                <div className="flex items-center justify-between font-black text-jaman-navy">
                  <span className="flex items-center gap-1.5">
                    <ChefHat className="w-3.5 h-3.5 text-jaman-saffron" />
                    <span>Kitchen Station Dispatch</span>
                  </span>
                  <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded">
                    DEMO SYNC
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  {selectedOrder.kitchenRouting?.summaryText ||
                    QrOrderingRepository.getStationRouting(selectedOrder.items).summaryText}
                </p>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <span className="text-xs font-black text-slate-400 uppercase tracking-wider block">
                  Ordered Items ({selectedOrder.items.length})
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {selectedOrder.items.map((item, i) => (
                    <div
                      key={i}
                      className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-jaman-navy block">
                          {item.quantity}x {item.name}
                        </span>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <span className="text-[10px] text-slate-400 block">
                            + {item.modifiers.map((m) => m.optionName || (m as any).name).join(', ')}
                          </span>
                        )}
                        {item.specialInstructions && (
                          <span className="text-[10px] text-amber-700 italic block">
                            &ldquo;{item.specialInstructions}&rdquo;
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-bold text-jaman-navy">
                        {formatINR(item.totalPrice)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill Totals */}
              <div className="border-t border-slate-100 pt-3 space-y-1 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span className="font-mono">{formatINR(selectedOrder.subtotal)}</span>
                </div>
                {selectedOrder.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Discount:</span>
                    <span className="font-mono">- {formatINR(selectedOrder.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500">
                  <span>GST Tax (5%):</span>
                  <span className="font-mono">{formatINR(selectedOrder.taxAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-jaman-navy pt-1 border-t border-dashed border-slate-200">
                  <span>Total Payable:</span>
                  <span className="font-mono text-jaman-saffron">{formatINR(selectedOrder.totalAmount)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                {selectedOrder.orderStatus === 'NEW' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleAdvanceStatus(selectedOrder.id, 'ACCEPTED')}
                      className="py-2 bg-jaman-navy hover:bg-[#123959] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      Accept Order
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdvanceStatus(selectedOrder.id, 'PREPARING')}
                      className="py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Flame className="w-3.5 h-3.5" />
                      <span>Send to KOT</span>
                    </button>
                  </div>
                )}

                {selectedOrder.orderStatus === 'CONFIRMED' && (
                  <button
                    type="button"
                    onClick={() => handleAdvanceStatus(selectedOrder.id, 'PREPARING')}
                    className="w-full py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>Send to Kitchen (KOT)</span>
                  </button>
                )}

                {selectedOrder.orderStatus === 'PREPARING' && (
                  <button
                    type="button"
                    onClick={() => handleAdvanceStatus(selectedOrder.id, 'READY')}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Mark Order Prepared & Ready
                  </button>
                )}

                {selectedOrder.orderStatus === 'READY' && (
                  <button
                    type="button"
                    onClick={() => handleAdvanceStatus(selectedOrder.id, 'SERVED')}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Mark Served at Table
                  </button>
                )}

                {(selectedOrder.orderStatus === 'SERVED' || selectedOrder.orderStatus === 'READY') && (
                  <button
                    type="button"
                    onClick={() => handleAdvanceStatus(selectedOrder.id, 'COMPLETED')}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Complete & Deliver Order
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setLastCompletedOrder(selectedOrder);
                    setIsReceiptOpen(true);
                  }}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-jaman-saffron" />
                  <span>Print Thermal Receipt</span>
                </button>

                {selectedOrder.orderStatus !== 'CANCELLED' && selectedOrder.orderStatus !== 'REFUNDED' && (
                  <>
                    {selectedOrder.paymentStatus === 'SUCCESS' ? (
                      <button
                        type="button"
                        onClick={() => openRefundVoid('REFUND')}
                        className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>Refund Order</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openRefundVoid('VOID')}
                        className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Void Order</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6 space-y-2">
              <Eye className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs">Select an order from the list to view full itemized breakdown and print receipt.</p>
            </div>
          )}
        </div>
      </div>
    </div>

    {refundVoidMode && selectedOrder && (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
        <div className="bg-white border border-jaman-border rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
          <div className="flex items-center gap-2.5">
            {refundVoidMode === 'REFUND' ? (
              <Undo2 className="w-5 h-5 text-rose-600" />
            ) : (
              <Ban className="w-5 h-5 text-rose-600" />
            )}
            <h2 className="text-base font-extrabold text-jaman-navy">
              {refundVoidMode === 'REFUND' ? 'Refund Order' : 'Void Order'} #{selectedOrder.orderNumber}
            </h2>
          </div>

          {refundVoidMode === 'REFUND' && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Refund Amount (₹)</label>
              <input
                type="number"
                min={1}
                max={selectedOrder.totalAmount}
                value={refundAmountInput}
                onChange={(e) => setRefundAmountInput(e.target.value)}
                className="w-full bg-jaman-cream border border-jaman-border focus:border-rose-400 rounded-2xl px-4 py-2.5 text-sm font-mono font-bold text-jaman-navy focus:outline-hidden"
              />
              <span className="text-[11px] text-slate-400">Order total: {formatINR(selectedOrder.totalAmount)}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Reason *</label>
            <textarea
              value={refundVoidReason}
              onChange={(e) => setRefundVoidReason(e.target.value)}
              placeholder={refundVoidMode === 'REFUND' ? 'e.g. Wrong item billed, customer complaint' : 'e.g. Kitchen error, customer left'}
              rows={3}
              className="w-full bg-jaman-cream border border-jaman-border focus:border-rose-400 rounded-2xl px-4 py-2.5 text-sm text-jaman-navy focus:outline-hidden resize-none"
            />
          </div>

          {refundVoidError && (
            <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center">
              {refundVoidError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={submitRefundVoid}
              className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              {refundVoidMode === 'REFUND' ? 'Continue to Manager Approval' : 'Continue to Manager Approval'}
            </button>
            <button
              type="button"
              onClick={() => setRefundVoidMode(null)}
              className="px-5 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
