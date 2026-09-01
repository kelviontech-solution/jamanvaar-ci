import React, { useState, useMemo } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, OrderRepository, BusinessDayRepository, QrOrderingRepository } from '@jamanvaar/database';
import { Order, OrderStatus } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
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
  Flame
} from 'lucide-react';

export const PosOrdersView: React.FC = () => {
  const {
    setSelectedTable,
    loadOrderFromTable,
    setActiveTab,
    setLastCompletedOrder,
    setIsReceiptOpen,
    setIsPaymentOpen
  } = usePosStore();

  const [scopeFilter, setScopeFilter] = useState<'ACTIVE_DAY' | 'ALL_DAYS'>('ACTIVE_DAY');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

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
      // Fallback for orders created on the same calendar date
      const oDate = new Date(o.createdAt).toISOString().slice(0, 10);
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
    const active = scopedOrders.filter((o) => o.orderStatus === 'PREPARING' || o.orderStatus === 'CONFIRMED' || o.orderStatus === 'NEW').length;
    const totalSales = scopedOrders
      .filter((o) => o.orderStatus === 'COMPLETED')
      .reduce((sum, o) => sum + o.totalAmount, 0);

    return { total, completed, active, totalSales };
  }, [scopedOrders]);

  const handleSettleCounterCash = (order: Order) => {
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

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAF7F2] p-4 sm:p-6 overflow-hidden select-none">
      {/* Header & Session Scope Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#0B253A] flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-[#E66817]" />
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
        <div className="flex items-center gap-1.5 bg-white border border-[#EBE6DD] p-1 rounded-2xl shadow-2xs">
          <button
            type="button"
            onClick={() => setScopeFilter('ACTIVE_DAY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              scopeFilter === 'ACTIVE_DAY'
                ? 'bg-[#E66817] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#0B253A] hover:bg-slate-50'
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
                ? 'bg-[#0B253A] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#0B253A] hover:bg-slate-50'
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
            className="w-full bg-white border border-[#EBE6DD] rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-[#0B253A] placeholder:text-slate-400 focus:outline-none focus:border-[#E66817]"
          />
        </div>

        {/* Source Pills */}
        <div className="flex items-center gap-1 bg-white border border-[#EBE6DD] p-1 rounded-xl shadow-2xs overflow-x-auto">
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
                  ? 'bg-[#0B253A] text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-[#0B253A]'
              }`}
            >
              {src.label}
            </button>
          ))}
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1 bg-white border border-[#EBE6DD] p-1 rounded-xl shadow-2xs">
          {['ALL', 'NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-[#E66817] text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-[#0B253A]'
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
        <div className="lg:col-span-8 bg-white border border-[#EBE6DD] rounded-2xl overflow-y-auto shadow-2xs divide-y divide-slate-100">
          {filteredOrders.length > 0 ? (
            filteredOrders.map((order) => {
              const isQr = order.source_type === 'QR_TABLE' || order.orderType === 'QR_TABLE';
              const isKiosk =
                !isQr &&
                (order.source_type === 'KIOSK' ||
                  (order.kioskId?.startsWith('KIOSK') && order.source_type !== 'POS' && order.source_type !== 'CAPTAIN'));
              const isCaptain = !isQr && order.source_type === 'CAPTAIN';
              const isCounterCashPending =
                order.paymentMethod === 'CASH_AT_COUNTER' && order.paymentStatus === 'PENDING';

              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                    selectedOrder?.id === order.id
                      ? 'bg-amber-50/60 border-l-4 border-l-[#E66817]'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm text-[#0B253A]">
                        #{order.orderNumber}
                      </span>
                      <span className="text-xs font-black bg-[#E66817] text-white px-2 py-0.5 rounded-md font-mono">
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
                      <div className="font-mono font-black text-base text-[#0B253A]">
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSettleCounterCash(order);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                        title="Collect cash & print thermal receipt"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Settle Cash</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="font-black text-base text-[#0B253A]">
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
                  className="px-4 py-2 bg-white border border-[#EBE6DD] hover:border-[#E66817] text-[#0B253A] rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 inline-flex items-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5 text-[#E66817]" />
                  <span>View Past Orders History ({allOrders.length})</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Selected Order Detail Preview Pane */}
        <div className="lg:col-span-4 bg-white border border-[#EBE6DD] rounded-2xl p-5 shadow-2xs flex flex-col justify-between overflow-y-auto">
          {selectedOrder ? (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-lg text-[#0B253A]">
                    #{selectedOrder.orderNumber}
                  </span>
                  <span className="text-xs font-black bg-[#E66817] text-white px-2 py-0.5 rounded-md font-mono">
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
                  <strong className="text-[#0B253A] uppercase">{selectedOrder.orderType}</strong>
                </div>
                {selectedOrder.tableNumber && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Table:</span>
                    <strong className="text-[#0B253A]">Table {selectedOrder.tableNumber}</strong>
                  </div>
                )}
                {selectedOrder.customerName && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Customer:</span>
                    <strong className="text-[#0B253A]">{selectedOrder.customerName}</strong>
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
                  <span className="font-bold text-[#0B253A]">
                    {selectedOrder.paymentMethod || 'CASH'} ({selectedOrder.paymentStatus})
                  </span>
                </div>
              </div>

              {/* Special Instructions / Notes Banner */}
              {selectedOrder.customerNotes && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 font-medium">
                  <strong>Guest Note:</strong> &ldquo;{selectedOrder.customerNotes}&rdquo;
                </div>
              )}

              {/* Kitchen Station Routing Breakdown */}
              <div className="p-2.5 rounded-xl bg-[#FAF7F2] border border-[#EBE6DD] text-xs space-y-1">
                <div className="flex items-center justify-between font-black text-[#0B253A]">
                  <span className="flex items-center gap-1.5">
                    <ChefHat className="w-3.5 h-3.5 text-[#E66817]" />
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
                        <span className="font-bold text-[#0B253A] block">
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
                      <span className="font-mono font-bold text-[#0B253A]">
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
                <div className="flex justify-between text-sm font-black text-[#0B253A] pt-1 border-t border-dashed border-slate-200">
                  <span>Total Payable:</span>
                  <span className="font-mono text-[#E66817]">{formatINR(selectedOrder.totalAmount)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                {selectedOrder.orderStatus === 'NEW' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleAdvanceStatus(selectedOrder.id, 'ACCEPTED')}
                      className="py-2 bg-[#0B253A] hover:bg-[#123959] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      Accept Order
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdvanceStatus(selectedOrder.id, 'PREPARING')}
                      className="py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
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
                    className="w-full py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
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
                  <Printer className="w-3.5 h-3.5 text-[#E66817]" />
                  <span>Print Thermal Receipt</span>
                </button>
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
  );
};
