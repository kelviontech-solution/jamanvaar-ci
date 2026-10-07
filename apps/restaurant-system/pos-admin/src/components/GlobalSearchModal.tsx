import React, { useState, useMemo } from 'react';
import { Search, X, ShoppingBag, UtensilsCrossed, Users, User, Grid, ArrowRight } from 'lucide-react';
import { CachedImg, Modal } from '@jamanvaar/ui';
import { db } from '@jamanvaar/database';
import { formatINR, formatTime } from '@jamanvaar/utils';
import { Order, MenuItem, CustomerAccount, DiningTable, User as UserType } from '@jamanvaar/types';

interface GlobalSearchModalProps {
  showCustomers?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSelectOrder: (order: Order) => void;
  onSelectMenuItem: (item: MenuItem) => void;
  onSelectCustomer: (cust: CustomerAccount) => void;
  onSelectTable: (table: DiningTable) => void;
  onSelectStaff: (user: UserType) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  showCustomers = true,
  isOpen,
  onClose,
  onSelectOrder,
  onSelectMenuItem,
  onSelectCustomer,
  onSelectTable,
  onSelectStaff
}) => {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        orders: db.orders.slice(0, 4),
        items: db.menuItems.slice(0, 4),
        customers: showCustomers ? db.customerAccounts.slice(0, 4) : [],
        tables: db.tables.slice(0, 4),
        staff: db.users.slice(0, 4)
      };
    }

    const matchedOrders = db.orders.filter(
      (o) =>
        o.orderNumber?.toLowerCase().includes(q) ||
        o.tokenNumber?.includes(q) ||
        o.customerPhone?.includes(q) ||
        o.customerName?.toLowerCase().includes(q)
    );

    const matchedItems = db.menuItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.kitchenStation?.toLowerCase().includes(q)
    );

    const matchedCustomers = db.customerAccounts.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
    );

    const matchedTables = db.tables.filter(
      (t) =>
        t.tableNumber.includes(q) ||
        t.zone?.toLowerCase().includes(q)
    );

    const matchedStaff = db.users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.roleId?.toLowerCase().includes(q)
    );

    return {
      orders: matchedOrders,
      items: matchedItems,
      customers: showCustomers ? matchedCustomers : [],
      tables: matchedTables,
      staff: matchedStaff
    };
  }, [query, showCustomers]);

  const totalResults =
    results.orders.length +
    results.items.length +
    results.customers.length +
    results.tables.length +
    results.staff.length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Global Restaurant Search" maxWidth="2xl">
      <div className="space-y-4 py-1">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            autoFocus
            placeholder="Search orders, token, dishes, SKU, customers, tables, staff..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-jaman-ivory border-2 border-jaman-border rounded-2xl pl-11 pr-10 py-3 text-sm font-bold text-jaman-navy focus:outline-none focus:border-brand transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Results Container */}
        <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
          {/* Orders Section */}
          {results.orders.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#64748B] uppercase">
                <ShoppingBag className="w-3.5 h-3.5 text-slate-500" />
                <span>Orders & Invoices ({results.orders.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {results.orders.map((o) => (
                  <div
                    key={o.id}
                    onClick={() => {
                      onSelectOrder(o);
                      onClose();
                    }}
                    className="p-3 bg-white border border-jaman-border hover:border-brand rounded-xl cursor-pointer transition-all hover:shadow-xs group flex justify-between items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-jaman-navy">{o.orderNumber}</span>
                        <span className="bg-brand/[0.07] text-brand font-bold text-[11px] px-1.5 py-0.5 rounded">
                          #{o.tokenNumber}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 block">
                        {o.orderType} • {formatTime(o.createdAt)} • {o.customerName || 'Walk-in'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-xs text-emerald-700 block">
                        {formatINR(o.totalAmount)}
                      </span>
                      <span className="text-[11px] font-bold uppercase text-slate-500">{o.paymentMethod}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dishes Section */}
          {results.items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#64748B] uppercase">
                <UtensilsCrossed className="w-3.5 h-3.5 text-slate-500" />
                <span>Dishes & Menu ({results.items.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {results.items.map((i) => (
                  <div
                    key={i.id}
                    onClick={() => {
                      onSelectMenuItem(i);
                      onClose();
                    }}
                    className="p-3 bg-white border border-jaman-border hover:border-brand rounded-xl cursor-pointer transition-all hover:shadow-xs group flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <CachedImg src={i.imageUrl} alt={i.name} className="w-9 h-9 rounded-lg object-cover bg-slate-100" />
                      <div>
                        <span className="font-bold text-xs text-jaman-navy block">{i.name}</span>
                        <span className="text-[11px] text-slate-500 font-mono">{i.sku} • {i.kitchenStation}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="tabular-nums font-bold text-xs text-emerald-700 block">₹{i.price}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${i.isAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {i.isAvailable ? 'In Stock' : '86 Out'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Customers Section */}
          {results.customers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#64748B] uppercase">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span>Customers CRM ({results.customers.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {results.customers.map((c) => (
                  <div
                    key={c.phone}
                    onClick={() => {
                      onSelectCustomer(c);
                      onClose();
                    }}
                    className="p-3 bg-white border border-jaman-border hover:border-brand rounded-xl cursor-pointer transition-all hover:shadow-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-xs text-jaman-navy block">{c.name}</span>
                      <span className="text-[11px] font-mono text-slate-500">{c.phone}</span>
                    </div>
                    <span className="text-xs font-bold text-amber-600 font-mono">
                      {c.loyaltyPoints} Pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tables Section */}
          {results.tables.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#64748B] uppercase">
                <Grid className="w-3.5 h-3.5 text-slate-500" />
                <span>Dining Tables ({results.tables.length})</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {results.tables.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      onSelectTable(t);
                      onClose();
                    }}
                    className="p-2.5 bg-white border border-jaman-border hover:border-brand rounded-xl cursor-pointer transition-all flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-xs text-jaman-navy block">Table {t.tableNumber}</span>
                      <span className="text-[11px] text-slate-500">{t.capacity} Guests</span>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.status === 'OCCUPIED' ? 'bg-brand text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Staff Section */}
          {results.staff.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#64748B] uppercase">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span>Staff & Roles ({results.staff.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {results.staff.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => {
                      onSelectStaff(u);
                      onClose();
                    }}
                    className="p-2.5 bg-white border border-jaman-border hover:border-brand rounded-xl cursor-pointer transition-all flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-xs text-jaman-navy block">{u.fullName}</span>
                      <span className="text-[11px] text-slate-500">@{u.username}</span>
                    </div>
                    <span className="text-[11px] font-bold uppercase bg-slate-100 px-2 py-0.5 rounded">
                      {u.roleId}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalResults === 0 && (
            <div className="py-10 text-center text-slate-500 text-xs">
              No matching orders, dishes, customers, tables, or staff found for "{query}".
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
