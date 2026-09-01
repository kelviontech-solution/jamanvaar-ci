import React, { useState, useEffect } from 'react';
import { CustomerAccount } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { CustomerRepository, db } from '@jamanvaar/database';
import { formatINR, formatDate, formatTime } from '@jamanvaar/utils';
import {
  Award,
  ShoppingBag,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Tag,
  FileText,
  Clock,
  Sparkles
} from 'lucide-react';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerToEdit: CustomerAccount | null;
  onSaved: () => void;
}

const AVAILABLE_TAGS = ['VIP', 'REGULAR', 'CORPORATE', 'FAMILY', 'VEGAN', 'JAIN'];

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  customerToEdit,
  onSaved
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [dob, setDob] = useState('');
  const [anniversary, setAnniversary] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(['REGULAR']);
  const [loyaltyPoints, setLoyaltyPoints] = useState('50');

  useEffect(() => {
    if (customerToEdit) {
      setName(customerToEdit.name || '');
      setPhone(customerToEdit.phone || '');
      setEmail(customerToEdit.email || '');
      setAddress(customerToEdit.address || '');
      setDob(customerToEdit.dob || '');
      setAnniversary(customerToEdit.anniversary || '');
      setNotes(customerToEdit.notes || '');
      setSelectedTags(customerToEdit.tags && customerToEdit.tags.length > 0 ? customerToEdit.tags : ['REGULAR']);
      setLoyaltyPoints((customerToEdit.loyaltyPoints ?? 50).toString());
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setDob('');
      setAnniversary('');
      setNotes('');
      setSelectedTags(['REGULAR']);
      setLoyaltyPoints('50');
    }
  }, [customerToEdit, isOpen]);

  const customerOrders = React.useMemo(() => {
    if (!customerToEdit?.phone) return [];
    return db.orders.filter((o) => o.customerPhone === customerToEdit.phone);
  }, [customerToEdit]);

  const totalSpent = React.useMemo(() => {
    return customerOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  }, [customerOrders]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    const payload: Partial<CustomerAccount> = {
      name,
      email,
      address,
      dob,
      anniversary,
      notes,
      tags: selectedTags,
      loyaltyPoints: Number(loyaltyPoints) || 0
    };

    if (customerToEdit) {
      CustomerRepository.updateCustomer(customerToEdit.phone, payload);
    } else {
      CustomerRepository.createCustomer({
        phone,
        name,
        ...payload
      });
    }

    onSaved();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={customerToEdit ? `Customer 360 Profile: ${customerToEdit.name}` : 'Register New Guest Profile'}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {/* Basic Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-[#0B253A]" />
              <span>Customer Full Name *</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Patel"
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-[#0B253A]" />
              <span>Mobile Phone Number *</span>
            </label>
            <input
              type="text"
              required
              disabled={!!customerToEdit}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-[#E66817] disabled:opacity-60"
            />
          </div>
        </div>

        {/* Email and Address */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-[#0B253A]" />
              <span>Email Address</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. ramesh.patel@gmail.com"
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#0B253A]" />
              <span>Delivery / Home Address</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Satellite Towers, Bodakdev"
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            />
          </div>
        </div>

        {/* Birthday & Anniversary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#E66817]" />
              <span>Date of Birth (Birthday)</span>
            </label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-rose-500" />
              <span>Wedding Anniversary</span>
            </label>
            <input
              type="date"
              value={anniversary}
              onChange={(e) => setAnniversary(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span>Loyalty Points Balance</span>
            </label>
            <input
              type="number"
              value={loyaltyPoints}
              onChange={(e) => setLoyaltyPoints(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-mono font-black text-amber-800 focus:outline-none focus:border-[#E66817]"
            />
          </div>
        </div>

        {/* Customer Tags / Segments */}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-[#0B253A]" />
            <span>Customer Profile Tags & Dining Preferences:</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_TAGS.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
                  selectedTags.includes(tag)
                    ? 'bg-[#0B253A] text-white shadow-xs'
                    : 'bg-[#FBF9F5] border border-[#EBE6DD] text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tag === 'VIP' ? '⭐ VIP' : tag}
              </button>
            ))}
          </div>
        </div>

        {/* Notes & Special Dietary Instructions */}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-[#0B253A]" />
            <span>Personal Notes & Dietary Instructions</span>
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Strict Jain (no onion/garlic), prefers table 12 by the window, mild spices."
            className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl p-2.5 text-xs font-medium focus:outline-none focus:border-[#E66817]"
          />
        </div>

        {/* Lifetime Order Summary if editing */}
        {customerToEdit && (
          <div className="bg-[#FAF7F2] p-3.5 rounded-2xl border border-[#EBE6DD] space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-500 block">
              LIFETIME DINING INTELLIGENCE:
            </span>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-bold">Total Spent</span>
                <strong className="font-mono text-emerald-700 font-black">{formatINR(customerToEdit.totalSpend || totalSpent)}</strong>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-bold">Visits / Orders</span>
                <strong className="font-mono text-[#0B253A] font-black">{customerToEdit.totalVisits || customerOrders.length} visits</strong>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-bold">Avg Order Value</span>
                <strong className="font-mono text-blue-700 font-black">
                  {formatINR(
                    Math.round(
                      (customerToEdit.totalSpend || totalSpent) /
                        Math.max(1, customerToEdit.totalVisits || customerOrders.length)
                    )
                  )}
                </strong>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <button
            type="submit"
            className="px-4 py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            {customerToEdit ? 'Save Changes' : 'Register Customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
