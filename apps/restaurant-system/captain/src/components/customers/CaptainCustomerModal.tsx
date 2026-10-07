import React, { useState } from 'react';
import { useCaptainStore } from '../../store/captainStore';
import { captainDb, CustomerRepository } from '@jamanvaar/database';
import { CustomerAccount } from '@jamanvaar/types';
import { Search, UserPlus, X, Check, Phone, Star, User } from 'lucide-react';

/**
 * Attaches a guest to the table's order for the CRM record and loyalty earning (BUG: Captain had no
 * customer surface at all — a guest's visit here never reached the CRM, and a guest seated by a waiter
 * never earned a single point, even though the same tiered program already worked at POS and the kiosk).
 * Redemption itself still happens at the till in POS, where the manager-approval discount gate already
 * lives — this screen only ever attaches, so it never needs that gate.
 */
export const CaptainCustomerModal: React.FC = () => {
  const { isCustomerModalOpen, setIsCustomerModalOpen, attachedCustomer, setAttachedCustomer } = useCaptainStore();
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  if (!isCustomerModalOpen) return null;

  const customers = captainDb.customerAccounts;
  const filtered = query.trim()
    ? customers.filter(
        (c) => c.phone.includes(query.trim()) || (c.name || '').toLowerCase().includes(query.trim().toLowerCase())
      )
    : customers;

  const handleSelect = (customer: CustomerAccount) => {
    setAttachedCustomer(customer);
    setIsCustomerModalOpen(false);
  };

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim() || !newName.trim()) return;
    const created = CustomerRepository.getOrCreate(newPhone.trim(), newName.trim());
    setAttachedCustomer(created);
    setIsCreating(false);
    setIsCustomerModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-jaman-cream border border-jaman-border rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="bg-jaman-navy text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <User className="w-5 h-5 text-jaman-saffron" />
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Attach Guest</h2>
              <span className="text-xs text-slate-300">Phone lookup, loyalty points & CRM</span>
            </div>
          </div>
          <button onClick={() => setIsCustomerModalOpen(false)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-white border-b border-jaman-border space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="tel"
              autoFocus
              placeholder="Search by 10-digit mobile number or guest name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-mono text-jaman-navy placeholder:font-sans placeholder:text-slate-400 focus:outline-hidden focus:border-jaman-saffron focus:bg-white transition-all"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">{filtered.length} guests found</span>
            <button
              onClick={() => { setIsCreating(true); setNewPhone(query.replace(/\D/g, '')); }}
              className="px-3 py-1.5 rounded-xl bg-jaman-saffron/10 hover:bg-jaman-saffron/20 text-jaman-saffron text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[36px]"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ New Guest</span>
            </button>
          </div>
        </div>

        {isCreating && (
          <form onSubmit={handleCreateCustomer} className="p-4 bg-amber-50/80 border-b border-amber-200 space-y-3">
            <h4 className="text-xs font-bold text-jaman-navy uppercase">Register Guest</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Mobile Number *</label>
                <input
                  type="tel" required placeholder="e.g. 9825012345"
                  value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono min-h-[40px]"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Full Name *</label>
                <input
                  type="text" required placeholder="e.g. Ketan Sheth"
                  value={newName} onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[40px]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsCreating(false)} className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-bold min-h-[40px]">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 bg-jaman-saffron text-white rounded-lg text-xs font-bold shadow-xs min-h-[40px]">
                Save &amp; Attach
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.length > 0 ? (
            filtered.map((customer) => {
              const isSelected = attachedCustomer?.phone === customer.phone;
              return (
                <div
                  key={customer.phone}
                  onClick={() => handleSelect(customer)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected ? 'bg-jaman-saffron/10 border-jaman-saffron shadow-xs' : 'bg-white border-jaman-border hover:border-slate-400'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-jaman-navy">{customer.name}</span>
                      {isSelected && (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Attached
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="font-mono flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" />{customer.phone}</span>
                      <span className="flex items-center gap-1 font-bold text-amber-600"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{customer.loyaltyPoints || 0} pts</span>
                    </div>
                  </div>
                  <button className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-jaman-saffron hover:text-white text-slate-700 text-xs font-bold transition-colors min-h-[36px]">
                    {isSelected ? 'Change' : 'Select'}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="h-40 flex flex-col items-center justify-center text-center text-slate-400">
              <User className="w-8 h-8 text-slate-300 mb-1" />
              <p className="text-xs">No guests matched "{query}"</p>
              <button
                onClick={() => { setIsCreating(true); setNewPhone(query.replace(/\D/g, '')); }}
                className="mt-2 text-xs font-bold text-jaman-saffron hover:underline min-h-[36px]"
              >
                + Register this phone number
              </button>
            </div>
          )}
        </div>

        <div className="p-3 bg-white border-t border-jaman-border flex justify-between items-center shrink-0">
          {attachedCustomer ? (
            <button onClick={() => { setAttachedCustomer(null); setIsCustomerModalOpen(false); }} className="text-xs text-rose-600 font-bold hover:underline min-h-[36px]">
              Detach Guest
            </button>
          ) : (
            <span className="text-xs text-slate-400">No guest attached</span>
          )}
          <button onClick={() => setIsCustomerModalOpen(false)} className="px-4 py-2 bg-jaman-navy text-white rounded-xl font-bold text-xs min-h-[40px]">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
