import { ModalBackdrop } from '@jamanvaar/ui';
import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, CustomerRepository } from '@jamanvaar/database';
import { CustomerAccount } from '@jamanvaar/types';
import { Users, Search, UserPlus, Gift, ShoppingBag, X } from 'lucide-react';

export const PosCustomersView: React.FC = () => {
  const { setSelectedCustomer, setActiveTab } = usePosStore();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

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

    // security-audit MEDIUM pos-loyalty-01: this used to take an arbitrary cashier-entered
    // points value with no cap or approval, and that value became real, server-accepted
    // discount value for QR-ordering redemption. New customers now get only the repository's
    // own standard welcome bonus (CustomerRepository.createCustomer's default), the same as
    // every other creation path -- a cashier can no longer fabricate a balance here.
    const existing = CustomerRepository.getByPhone(newPhone.trim());
    const acc = existing ?? CustomerRepository.createCustomer({ phone: newPhone.trim(), name: newName.trim() || 'Valued Guest' });
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
    <div className="flex-1 flex flex-col h-full bg-jaman-cream p-4 sm:p-6 overflow-hidden select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-jaman-navy flex items-center gap-2">
            <Users className="w-6 h-6 text-jaman-saffron" />
            <span>Customer Directory & CRM</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Search regular patrons, manage loyalty rewards points, and attach customers to orders.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-xl bg-jaman-saffron hover:bg-jaman-orange text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-jaman-saffron/25"
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
            className="w-full bg-white border border-jaman-border rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-jaman-navy placeholder:text-slate-400 focus:outline-none focus:border-jaman-saffron shadow-2xs"
          />
        </div>
      </div>

      {filteredAccounts.length === 0 && <div className="rounded-2xl border border-jaman-border bg-white p-6 mb-4 text-center space-y-3">
        <h2 className="text-lg font-bold text-jaman-navy">{search ? 'No matching customers' : 'Welcome your first regular guest'}</h2>
        <p className="text-sm text-slate-500">{search ? 'Try another name or phone number.' : 'Create a customer, then attach them to an order. Available loyalty rewards appear at checkout when your restaurant enables the program.'}</p>
        <button className="rounded-xl bg-jaman-saffron text-white px-4 py-3 font-bold" onClick={() => search ? setSearch('') : setShowCreateModal(true)}>{search ? 'Clear search' : 'Create customer'}</button>
        <button className="rounded-xl border px-4 py-3 ml-2" onClick={() => {setSelectedCustomer(null); setActiveTab('MENU');}}>Continue as guest</button>
      </div>}
      {/* Customers Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAccounts.map((account) => (
            <div
              key={account.phone}
              className="bg-white border border-jaman-border rounded-2xl p-4 flex flex-col justify-between shadow-2xs hover:border-jaman-saffron transition-all"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-jaman-navy text-white flex items-center justify-center font-bold text-sm">
                      {account.name?.charAt(0) || 'G'}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-jaman-navy leading-tight">
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
                  <div>Recent Orders: <strong>{account.totalVisits ?? account.recentOrderIds?.length ?? 0} visits</strong></div>
                  <div>Rewards available: <strong className="text-emerald-700">{CustomerRepository.getRewards().filter(r => r.isActive && (!r.expiresAt || Date.parse(r.expiresAt)>Date.now()) && r.pointsCost <= account.loyaltyPoints && (r.discountAmount || r.id === 'reward-100off')).length}</strong></div>
                </div>
              </div>

              <div className="mt-4 pt-2 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => handleAttachToCart(account)}
                  className="w-full py-2 rounded-xl bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold text-xs flex items-center justify-center gap-1 shadow-2xs"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-jaman-saffron" />
                  <span>Attach to Current Order</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Customer Create Modal */}
      {showCreateModal && (
        <ModalBackdrop className="flex items-center justify-center p-4">
          <div className="bg-white border border-jaman-border rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-jaman-navy">Register New Customer</h3>
              <button aria-label="Close customer registration" onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Guest Full Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-jaman-saffron hover:bg-jaman-orange text-white font-bold text-xs"
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
        </ModalBackdrop>
      )}
    </div>
  );
};
