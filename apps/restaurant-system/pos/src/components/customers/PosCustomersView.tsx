import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, CustomerRepository } from '@jamanvaar/database';
import { CustomerAccount } from '@jamanvaar/types';
import {
  Users,
  Search,
  UserPlus,
  Phone,
  Gift,
  ShoppingBag,
  CheckCircle2,
  Calendar,
  Sparkles
} from 'lucide-react';

export const PosCustomersView: React.FC = () => {
  const { setSelectedCustomer, setActiveTab } = usePosStore();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPoints, setNewPoints] = useState(50);

  const accounts = db.customerAccounts;

  const filteredAccounts = accounts.filter((a) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return a.phone.includes(q) || a.name?.toLowerCase().includes(q);
    }
    return true;
  });

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) return;

    const acc = CustomerRepository.getOrCreateAccount(newPhone.trim(), newName.trim() || undefined);
    if (newPoints > 0) acc.loyaltyPoints = newPoints;
    db.notify();

    setSelectedCustomer(acc);
    setShowCreateModal(false);
    setNewName('');
    setNewPhone('');
    setActiveTab('MENU');
  };

  const handleAttachToCart = (customer: CustomerAccount) => {
    setSelectedCustomer(customer);
    setActiveTab('MENU');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAF7F2] p-4 sm:p-6 overflow-hidden select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#0B253A] flex items-center gap-2">
            <Users className="w-6 h-6 text-[#E66817]" />
            <span>Customer Directory & CRM</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Search regular patrons, manage loyalty rewards points, and attach customers to orders.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-xl bg-[#E66817] hover:bg-[#F97316] text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-[#E66817]/25"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ New Customer</span>
        </button>
      </div>

      {/* Search */}
      <div className="mb-4 shrink-0 max-w-md">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by phone number or guest name..."
            className="w-full bg-white border border-[#EBE6DD] rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-[#0B253A] placeholder:text-slate-400 focus:outline-none focus:border-[#E66817] shadow-2xs"
          />
        </div>
      </div>

      {/* Customers Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAccounts.map((account) => (
            <div
              key={account.phone}
              className="bg-white border border-[#EBE6DD] rounded-2xl p-4 flex flex-col justify-between shadow-2xs hover:border-[#E66817] transition-all"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#0B253A] text-white flex items-center justify-center font-bold text-sm">
                      {account.name?.charAt(0) || 'G'}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-[#0B253A] leading-tight">
                        {account.name || 'Valued Guest'}
                      </h3>
                      <span className="text-xs text-slate-400 font-mono">{account.phone}</span>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                    <Gift className="w-3 h-3 text-amber-600" />
                    {account.loyaltyPoints} pts
                  </span>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                  <div>Recent Orders: <strong>{account.recentOrderIds?.length || 1} visits</strong></div>
                  <div>Redeemable Value: <strong className="text-emerald-700">₹{account.loyaltyPoints}</strong></div>
                </div>
              </div>

              <div className="mt-4 pt-2 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => handleAttachToCart(account)}
                  className="w-full py-2 rounded-xl bg-[#0B253A] hover:bg-[#1E3A4C] text-white font-bold text-xs flex items-center justify-center gap-1 shadow-2xs"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-[#E66817]" />
                  <span>Attach to Current Order</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Customer Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#EBE6DD] rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-[#0B253A]">Register New Customer</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Guest Full Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Welcome Loyalty Points</label>
                <input
                  type="number"
                  value={newPoints}
                  onChange={(e) => setNewPoints(Number(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#E66817] hover:bg-[#F97316] text-white font-bold text-xs"
                >
                  Save & Attach to Order
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
