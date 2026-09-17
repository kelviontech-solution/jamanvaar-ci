import React, { useState, useMemo } from 'react';
import { BusinessDay, Order, OrderStatus, OrderType, PaymentMethod } from '@jamanvaar/types';
import { BusinessDayRepository } from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';
import {
  X,
  Search,
  Filter,
  ShoppingBag,
  Clock,
  User,
  CreditCard,
  Banknote,
  QrCode,
  ChefHat,
  Receipt,
  Layers,
  Sparkles,
  ChevronRight
} from 'lucide-react';

interface PosDayOrdersModalProps {
  businessDay: BusinessDay;
  isOpen: boolean;
  onClose: () => void;
}

export const PosDayOrdersModal: React.FC<PosDayOrdersModalProps> = ({
  businessDay,
  isOpen,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const dayOrders = useMemo(() => {
    return BusinessDayRepository.getOrdersForBusinessDay(businessDay.id);
  }, [businessDay.id]);

  const filteredOrders = useMemo(() => {
    return dayOrders.filter((o) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesOrder = o.orderNumber.toLowerCase().includes(q);
        const matchesToken = o.tokenNumber.toLowerCase().includes(q);
        const matchesCustomer = (o.customerName || '').toLowerCase().includes(q) || (o.customerPhone || '').includes(q);
        const matchesItem = o.items.some((it) => it.name.toLowerCase().includes(q));
        if (!matchesOrder && !matchesToken && !matchesCustomer && !matchesItem) return false;
      }

      // Status
      if (statusFilter !== 'ALL' && o.orderStatus !== statusFilter) return false;

      // Type
      if (typeFilter !== 'ALL' && o.orderType !== typeFilter) return false;

      // Source
      if (sourceFilter !== 'ALL' && (o.source_type || 'POS') !== sourceFilter) return false;

      // Payment
      if (paymentFilter !== 'ALL') {
        if (paymentFilter === 'CASH' && o.paymentMethod !== 'CASH' && o.paymentMethod !== 'CASH_AT_COUNTER') return false;
        if (paymentFilter === 'UPI' && o.paymentMethod !== 'UPI' && o.paymentMethod !== 'UPI_QR') return false;
        if (paymentFilter === 'CARD' && o.paymentMethod !== 'CARD' && o.paymentMethod !== 'CARD_TERMINAL') return false;
      }

      return true;
    });
  }, [dayOrders, searchQuery, statusFilter, typeFilter, sourceFilter, paymentFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in select-none">
      <div className="bg-jaman-cream border border-jaman-border w-full max-w-6xl h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-jaman-border flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-jaman-saffron">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-jaman-navy">
                  All Orders for {businessDay.displayDate}
                </h2>
                <span className="font-mono text-xs text-slate-400">({businessDay.id})</span>
              </div>
              <p className="text-xs text-slate-500">
                Permanent archived database records for this business day. Showing {filteredOrders.length} of {dayOrders.length} orders.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-jaman-navy rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Ribbon */}
        <div className="p-3 bg-jaman-cream border-b border-jaman-border flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Order #, Token #, Customer, Dish..."
              className="w-full bg-white border border-jaman-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-jaman-navy font-bold placeholder:text-slate-400 focus:outline-none focus:border-jaman-saffron"
            />
          </div>

          {/* Quick Filter Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-jaman-border rounded-xl px-2.5 py-1.5 font-bold text-jaman-navy focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PREPARING">Preparing</option>
              <option value="READY">Ready</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REFUNDED">Refunded</option>
            </select>

            {/* Type */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-white border border-jaman-border rounded-xl px-2.5 py-1.5 font-bold text-jaman-navy focus:outline-none"
            >
              <option value="ALL">All Types</option>
              <option value="DINE_IN">Dine-In</option>
              <option value="TAKEAWAY">Takeaway</option>
              <option value="DELIVERY">Delivery</option>
            </select>

            {/* Source */}
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-white border border-jaman-border rounded-xl px-2.5 py-1.5 font-bold text-jaman-navy focus:outline-none"
            >
              <option value="ALL">All Sources</option>
              <option value="POS">Counter POS</option>
              <option value="KIOSK">Kiosk</option>
              <option value="CAPTAIN">Captain</option>
              <option value="ONLINE">Online</option>
            </select>

            {/* Payment */}
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="bg-white border border-jaman-border rounded-xl px-2.5 py-1.5 font-bold text-jaman-navy focus:outline-none"
            >
              <option value="ALL">All Payments</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI / QR</option>
              <option value="CARD">Card</option>
            </select>
          </div>
        </div>

        {/* Content Area: Left Orders List, Right Order Details Inspector */}
        <div className="flex-1 flex overflow-hidden">
          {/* Order Rows List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 border-r border-jaman-border">
            {filteredOrders.map((o) => {
              const isSelected = selectedOrder?.id === o.id;
              const formattedTime = new Date(o.createdAt).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={o.id}
                  onClick={() => setSelectedOrder(o)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-jaman-navy text-white border-jaman-navy shadow-md'
                      : 'bg-white border-jaman-border hover:border-slate-400 hover:shadow-2xs text-jaman-navy'
                  }`}
                >
                  {/* Left Metadata */}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="text-sm font-black font-mono tracking-tight">{o.orderNumber}</strong>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        Token #{o.tokenNumber}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        o.orderStatus === 'COMPLETED'
                          ? isSelected ? 'bg-emerald-500/30 text-emerald-200' : 'bg-emerald-50 text-emerald-700'
                          : o.orderStatus === 'CANCELLED'
                          ? isSelected ? 'bg-rose-500/30 text-rose-200' : 'bg-rose-50 text-rose-700'
                          : isSelected ? 'bg-amber-500/30 text-amber-200' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {o.orderStatus}
                      </span>
                    </div>

                    <div className={`text-xs flex items-center gap-2 truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                      <span>🕒 {formattedTime}</span>
                      <span>•</span>
                      <span>{o.orderType}</span>
                      {o.tableNumber && <span>• Table {o.tableNumber}</span>}
                      {o.customerName && <span>• {o.customerName}</span>}
                    </div>

                    <div className={`text-[11px] truncate ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}>
                      {o.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
                    </div>
                  </div>

                  {/* Right Amount & Tender */}
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="font-mono font-black text-base">
                      {formatINR(o.totalAmount)}
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                      isSelected ? 'text-amber-300' : 'text-slate-500'
                    }`}>
                      {o.paymentMethod}
                    </span>
                  </div>
                </div>
              );
            })}

            {filteredOrders.length === 0 && (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <ShoppingBag className="w-10 h-10 mx-auto opacity-30" />
                <div className="font-bold text-sm">No orders matched your filters</div>
                <div className="text-xs">Try clearing your search query or selecting "All Statuses"</div>
              </div>
            )}
          </div>

          {/* Right Selected Order Inspector */}
          <div className="w-80 lg:w-96 bg-white overflow-y-auto p-5 shrink-0 hidden md:block">
            {selectedOrder ? (
              <div className="space-y-4 text-xs text-jaman-navy">
                {/* Header */}
                <div className="border-b border-jaman-border pb-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-extrabold text-base">{selectedOrder.orderNumber}</span>
                    <span className="bg-jaman-saffron text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                      Token #{selectedOrder.tokenNumber}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Business Day: <strong className="text-jaman-navy font-mono">{businessDay.id}</strong>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Placed: {new Date(selectedOrder.createdAt).toLocaleString('en-IN')}
                  </div>
                </div>

                {/* Items Breakdown */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                    Ordered Dishes ({selectedOrder.items.length})
                  </span>
                  <div className="space-y-1.5">
                    {selectedOrder.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 rounded-xl bg-jaman-cream border border-jaman-border">
                        <div>
                          <strong className="text-xs text-jaman-navy block">{it.name}</strong>
                          <span className="text-[10px] text-slate-500">{it.quantity} x {formatINR(it.unitPrice)}</span>
                        </div>
                        <span className="font-mono font-bold text-xs">{formatINR(it.totalPrice)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="p-3 bg-jaman-cream rounded-2xl border border-jaman-border space-y-1.5 text-slate-600">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-mono">{formatINR(selectedOrder.subtotal || selectedOrder.totalAmount)}</span>
                  </div>
                  {selectedOrder.discountAmount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Discount:</span>
                      <span className="font-mono">- {formatINR(selectedOrder.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>CGST (2.5%):</span>
                    <span className="font-mono">{formatINR(selectedOrder.cgstAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SGST (2.5%):</span>
                    <span className="font-mono">{formatINR(selectedOrder.sgstAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 font-black text-sm text-jaman-navy">
                    <span>Grand Total:</span>
                    <span className="font-mono text-jaman-saffron">{formatINR(selectedOrder.totalAmount)}</span>
                  </div>
                </div>

                {/* Audit & Staff Metadata */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-[11px] space-y-1 text-slate-500">
                  <div className="flex justify-between">
                    <span>Source Terminal:</span>
                    <strong className="font-mono text-jaman-navy">{selectedOrder.kioskId || 'POS-01'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Order Type:</span>
                    <strong className="text-jaman-navy">{selectedOrder.orderType}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Payment Tender:</span>
                    <strong className="text-jaman-navy">{selectedOrder.paymentMethod} ({selectedOrder.paymentStatus})</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-6 space-y-2">
                <Receipt className="w-10 h-10 opacity-30" />
                <div className="font-bold text-xs">Select an order from the left</div>
                <p className="text-[11px]">View full line item charges, taxes, modifiers, and audit logs.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
