import React, { useState, useMemo, useEffect, useRef } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, CustomerRepository } from '@jamanvaar/database';
import { MenuItem, DiningTable, Order, CustomerAccount, KOTRecord } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import {
  Search,
  X,
  Utensils,
  LayoutGrid,
  Receipt,
  Users,
  ChefHat,
  ArrowRight,
  Sparkles,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Tag,
  Flame,
  CornerDownLeft
} from 'lucide-react';

export const GlobalSearchModal: React.FC = () => {
  const {
    isGlobalSearchOpen,
    setIsGlobalSearchOpen,
    addItemToCart,
    setCustomizingItem,
    setSelectedTable,
    setSelectedCustomer,
    setActiveTab,
    setLastCompletedOrder,
    setIsReceiptOpen,
    setOrderType,
    cart
  } = usePosStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isGlobalSearchOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isGlobalSearchOpen]);

  // Multi-domain search query indexing
  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return { items: [], tables: [], orders: [], customers: [], bills: [], kots: [] };

    // 1. Menu & Dishes
    const items = db.menuItems
      .filter((i) => {
        const cat = db.categories.find((c) => c.id === i.categoryId);
        return (
          i.name.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          (cat && cat.name.toLowerCase().includes(q)) ||
          i.kitchenStation?.toLowerCase().includes(q) ||
          i.dietaryType?.toLowerCase().includes(q)
        );
      })
      .slice(0, 6);

    // 2. Floor Tables
    const tables = db.tables
      .filter(
        (t) =>
          t.tableNumber.toLowerCase().includes(q) ||
          (t.zone && t.zone.toLowerCase().includes(q)) ||
          t.status.toLowerCase().includes(q)
      )
      .slice(0, 4);

    // 3. Orders & Tokens
    const orders = db.orders
      .filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          (o.tokenNumber && o.tokenNumber.toLowerCase().includes(q)) ||
          (o.customerName && o.customerName.toLowerCase().includes(q)) ||
          (o.customerPhone && o.customerPhone.includes(q)) ||
          (o.tableNumber && o.tableNumber.toLowerCase().includes(q))
      )
      .slice(0, 4);

    // 4. Customers CRM
    const customers = CustomerRepository.getAll()
      .filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q))
      )
      .slice(0, 4);

    // 5. Bills & Invoices
    const bills = db.orders
      .filter(
        (o) =>
          (o.orderStatus === 'COMPLETED' || o.orderStatus === 'REFUNDED') &&
          (o.orderNumber.toLowerCase().includes(q) ||
            (o.paymentMethod && o.paymentMethod.toLowerCase().includes(q)) ||
            (o.customerName && o.customerName.toLowerCase().includes(q)))
      )
      .slice(0, 4);

    // 6. Kitchen KOTs
    const kots = db.kots
      .filter(
        (k) =>
          k.kotNumber.toLowerCase().includes(q) ||
          k.station.toLowerCase().includes(q) ||
          (k.tableNumber && k.tableNumber.includes(q))
      )
      .slice(0, 3);

    return { items, tables, orders, customers, bills, kots };
  }, [query]);

  // Flatten searchable list for keyboard up/down navigation
  const flatResultActions = useMemo(() => {
    const actions: { type: string; id: string; onSelect: () => void }[] = [];

    results.items.forEach((item) => {
      actions.push({
        type: 'ITEM',
        id: item.id,
        onSelect: () => handleSelectDish(item)
      });
    });

    results.tables.forEach((tbl) => {
      actions.push({
        type: 'TABLE',
        id: tbl.id,
        onSelect: () => handleSelectTable(tbl)
      });
    });

    results.customers.forEach((c) => {
      actions.push({
        type: 'CUSTOMER',
        id: c.phone,
        onSelect: () => handleSelectCustomer(c)
      });
    });

    results.orders.forEach((ord) => {
      actions.push({
        type: 'ORDER',
        id: ord.id,
        onSelect: () => handleSelectOrder(ord)
      });
    });

    results.bills.forEach((bill) => {
      actions.push({
        type: 'BILL',
        id: bill.id,
        onSelect: () => handleSelectInvoice(bill)
      });
    });

    results.kots.forEach((kot) => {
      actions.push({
        type: 'KOT',
        id: kot.id,
        onSelect: () => handleSelectKot(kot)
      });
    });

    return actions;
  }, [results]);

  // Optional hardware key selection handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < flatResultActions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : flatResultActions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResultActions[selectedIndex]) {
        flatResultActions[selectedIndex].onSelect();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsGlobalSearchOpen(false);
    }
  };

  // Action Handlers
  const handleSelectDish = (item: MenuItem) => {
    const itemModifierGroups = (item.modifierGroupIds || [])
      .map((gid) => db.modifierGroups.find((g) => g.id === gid))
      .filter(Boolean);

    const hasRequiredModifiers = itemModifierGroups.some(
      (g) => g && (g.isRequired || g.minSelections > 0)
    );

    if (hasRequiredModifiers) {
      setCustomizingItem(item);
    } else {
      addItemToCart(item);
    }
    setIsGlobalSearchOpen(false);
    setActiveTab('MENU');
  };

  const handleSelectTable = (tbl: DiningTable) => {
    setSelectedTable(tbl);
    setOrderType('DINE_IN');
    setIsGlobalSearchOpen(false);
    if (cart.items.length > 0) {
      setActiveTab('MENU');
    } else {
      setActiveTab('TABLES');
    }
  };

  const handleSelectCustomer = (c: CustomerAccount) => {
    setSelectedCustomer(c);
    setIsGlobalSearchOpen(false);
    setActiveTab('MENU');
  };

  const handleSelectOrder = (ord: Order) => {
    setLastCompletedOrder(ord);
    setIsReceiptOpen(true);
    setIsGlobalSearchOpen(false);
  };

  const handleSelectInvoice = (bill: Order) => {
    setLastCompletedOrder(bill);
    setIsReceiptOpen(true);
    setIsGlobalSearchOpen(false);
  };

  const handleSelectKot = (kot: KOTRecord) => {
    setActiveTab('KOT');
    setIsGlobalSearchOpen(false);
  };

  if (!isGlobalSearchOpen) return null;

  const hasAnyResults =
    results.items.length > 0 ||
    results.tables.length > 0 ||
    results.orders.length > 0 ||
    results.customers.length > 0 ||
    results.bills.length > 0 ||
    results.kots.length > 0;

  // Empty state recommendations
  const popularDishes = db.menuItems.filter((i) => i.isAvailable !== false).slice(0, 4);
  const occupiedTables = db.tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILLING').slice(0, 4);
  const recentInvoices = db.orders.filter((o) => o.orderStatus === 'COMPLETED').slice(-3).reverse();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 pt-12 sm:pt-16 select-none animate-in fade-in duration-150"
      onClick={() => setIsGlobalSearchOpen(false)}
    >
      <div
        className="bg-white border border-[#EBE6DD] rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header Input (Large 52px+ touch area) */}
        <div className="p-3.5 sm:p-4 border-b border-[#EBE6DD] flex items-center gap-3 bg-[#FAF7F2] shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-[#FFF4ED] border border-[#FED7AA] flex items-center justify-center shrink-0">
            <Search className="w-5 h-5 text-[#E66817]" />
          </div>

          <div className="flex-1 flex flex-col">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Search dish, SKU, table, token, bill #, customer..."
              className="w-full text-base sm:text-lg font-bold text-[#0B253A] placeholder:text-slate-400 bg-transparent focus:outline-none"
            />
            <span className="text-[10px] text-slate-400 font-medium hidden sm:block">
              Type anything to search across Menu, Tables, Orders, Invoices & CRM
            </span>
          </div>

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-[#0B253A] hover:bg-slate-200 transition-colors"
              title="Clear search query"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsGlobalSearchOpen(false)}
            className="px-3 py-2 rounded-xl bg-white border border-[#EBE6DD] text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1 shadow-2xs"
          >
            <span className="hidden sm:inline">ESC</span>
            <X className="w-4 h-4 sm:hidden" />
          </button>
        </div>

        {/* Scrollable Results Body */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Active Results Display */}
          {query ? (
            hasAnyResults ? (
              <div className="space-y-4">
                {/* 1. Dishes */}
                {results.items.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-[11px] font-black uppercase text-[#E66817] tracking-wider flex items-center gap-1.5">
                        <Utensils className="w-3.5 h-3.5" />
                        <span>Menu & Dishes ({results.items.length})</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Tap to add to active order</span>
                    </div>

                    <div className="space-y-1.5">
                      {results.items.map((it) => (
                        <div
                          key={it.id}
                          onClick={() => handleSelectDish(it)}
                          className="min-h-[48px] p-2.5 sm:p-3 rounded-2xl border border-[#EBE6DD] hover:border-[#E66817] hover:bg-[#FFFDFB] flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] group shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 border border-[#EBE6DD] shrink-0">
                              <img
                                src={it.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=120&q=80'}
                                alt={it.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="truncate">
                              <div className="font-extrabold text-sm text-[#0B253A] group-hover:text-[#E66817] transition-colors truncate">
                                {it.name}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                                <span>SKU: {it.sku}</span>
                                {it.kitchenStation && <span>• {it.kitchenStation}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono font-black text-sm text-[#0B253A]">
                              {formatINR(it.price)}
                            </span>
                            <button
                              type="button"
                              className="px-2.5 py-1.5 bg-[#E66817] text-white font-extrabold text-[11px] rounded-xl flex items-center gap-1 shadow-xs group-hover:bg-[#EA580C]"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              <span>ADD</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Floor Tables */}
                {results.tables.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-[11px] font-black uppercase text-blue-600 tracking-wider flex items-center gap-1.5">
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>Floor Tables ({results.tables.length})</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {results.tables.map((tbl) => (
                        <div
                          key={tbl.id}
                          onClick={() => handleSelectTable(tbl)}
                          className="min-h-[48px] p-3 rounded-2xl border border-[#EBE6DD] hover:border-blue-500 hover:bg-blue-50/30 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 font-black flex items-center justify-center text-xs">
                              {tbl.tableNumber}
                            </div>
                            <div>
                              <strong className="text-sm font-bold text-[#0B253A] block">
                                Table {tbl.tableNumber}
                              </strong>
                              <span className="text-[10px] text-slate-400">
                                {tbl.zone || 'Main Dining'} • {tbl.capacity} Seats
                              </span>
                            </div>
                          </div>

                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                              tbl.status === 'OCCUPIED'
                                ? 'bg-amber-100 text-amber-800'
                                : tbl.status === 'BILLING'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {tbl.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Customers */}
                {results.customers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-[11px] font-black uppercase text-purple-600 tracking-wider flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>Customers CRM ({results.customers.length})</span>
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {results.customers.map((c) => (
                        <div
                          key={c.phone}
                          onClick={() => handleSelectCustomer(c)}
                          className="min-h-[48px] p-2.5 sm:p-3 rounded-2xl border border-[#EBE6DD] hover:border-purple-500 hover:bg-purple-50/30 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                              <Users className="w-4 h-4" />
                            </div>
                            <div>
                              <strong className="text-sm font-bold text-[#0B253A] block">{c.name}</strong>
                              <span className="text-[11px] text-slate-400 font-mono">{c.phone}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold text-xs rounded-xl"
                          >
                            Attach to Cart
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Orders & Invoices */}
                {results.orders.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-[11px] font-black uppercase text-emerald-600 tracking-wider flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Orders & Bills ({results.orders.length})</span>
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {results.orders.map((ord) => (
                        <div
                          key={ord.id}
                          onClick={() => handleSelectOrder(ord)}
                          className="min-h-[48px] p-2.5 sm:p-3 rounded-2xl border border-[#EBE6DD] hover:border-emerald-500 hover:bg-emerald-50/30 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                              <Receipt className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <strong className="text-sm font-bold text-[#0B253A]">
                                  #{ord.orderNumber}
                                </strong>
                                {ord.tokenNumber && (
                                  <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.2 rounded font-bold">
                                    Token #{ord.tokenNumber}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {ord.orderType} • {ord.paymentMethod || 'CASH'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5">
                            <strong className="font-mono text-sm font-black text-[#0B253A]">
                              {formatINR(ord.totalAmount)}
                            </strong>
                            <span className="text-[10px] uppercase font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                              {ord.orderStatus}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                <h4 className="font-bold text-sm text-[#0B253A]">No matches for "{query}"</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Try searching by dish name, 2-letter SKU (e.g. PT-04), table number, order #, or customer phone.
                </p>
              </div>
            )
          ) : (
            /* Quick / Recent Results when Search Input is Empty */
            <div className="space-y-4">
              {/* Frequently Ordered Dishes */}
              <div>
                <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-2 px-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#E66817]" />
                  <span>Popular Dishes (1-Tap Add)</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {popularDishes.map((it) => (
                    <div
                      key={it.id}
                      onClick={() => handleSelectDish(it)}
                      className="p-2.5 rounded-2xl border border-[#EBE6DD] hover:border-[#E66817] hover:bg-[#FFFDFB] flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] shadow-2xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Utensils className="w-3.5 h-3.5 text-[#E66817] shrink-0" />
                        <span className="font-bold text-xs text-[#0B253A] truncate">{it.name}</span>
                      </div>
                      <span className="font-mono font-bold text-xs text-[#0B253A] shrink-0 ml-2">
                        {formatINR(it.price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Floor Tables */}
              {occupiedTables.length > 0 && (
                <div>
                  <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-2 px-1 flex items-center gap-1.5">
                    <LayoutGrid className="w-3.5 h-3.5 text-blue-600" />
                    <span>Active Occupied Tables</span>
                  </span>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {occupiedTables.map((tbl) => (
                      <div
                        key={tbl.id}
                        onClick={() => handleSelectTable(tbl)}
                        className="p-2.5 rounded-2xl border border-amber-200 bg-amber-50/50 hover:bg-amber-100/50 flex flex-col justify-between cursor-pointer transition-all active:scale-[0.99]"
                      >
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-black text-[#0B253A]">
                            Table {tbl.tableNumber}
                          </strong>
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1 font-mono">
                          {tbl.currentOrderId ? 'Occupied' : 'Open'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Invoices */}
              {recentInvoices.length > 0 && (
                <div>
                  <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-2 px-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Recent Completed Invoices</span>
                  </span>

                  <div className="space-y-1.5">
                    {recentInvoices.map((inv) => (
                      <div
                        key={inv.id}
                        onClick={() => handleSelectInvoice(inv)}
                        className="p-2.5 rounded-2xl border border-[#EBE6DD] hover:border-emerald-500 hover:bg-emerald-50/30 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-2">
                          <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-bold text-xs text-[#0B253A]">#{inv.orderNumber}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({inv.paymentMethod || 'CASH'})
                          </span>
                        </div>
                        <span className="font-mono font-bold text-xs text-[#0B253A]">
                          {formatINR(inv.totalAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Touch-Friendly Global Search Footer */}
        <div className="p-3 px-4 bg-[#FAF7F2] border-t border-[#EBE6DD] flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#0B253A]">Tap any result to select</span>
            <span className="text-slate-300">•</span>
            <span>Real-time Offline Database</span>
          </div>

          <button
            type="button"
            onClick={() => setIsGlobalSearchOpen(false)}
            className="px-3 py-1 bg-white hover:bg-slate-100 border border-[#EBE6DD] text-[#0B253A] font-bold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
