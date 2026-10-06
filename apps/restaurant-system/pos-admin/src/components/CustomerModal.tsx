import React, { useState, useEffect } from 'react';
import { CustomerAccount } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { CustomerRepository, db } from '@jamanvaar/database';
import { formatINR, formatDate, formatTime, isValidIndianPhone, normalizeIndianPhone } from '@jamanvaar/utils';
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
  const [formError, setFormError] = useState('');

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
    setFormError('');
    if (!name || !phone) {
      setFormError('Name and phone number are required.');
      return;
    }

    // B2-043: "123", "Short Ph", pure letters and "+91 92222 22223" were all accepted verbatim
    // as a phone number — the last one becoming a *different* customer record from the same
    // guest's "9222222223", since matching was by exact string. The phone is this record's real
    // identity (loyalty points, the kiosk login from B2-001), so it's normalised to a bare
    // 10-digit number and format-checked — but only for a *new* registration: the phone field is
    // disabled while editing an existing customer (it's the record's own key, never resubmitted
    // in `payload` below), so validating it then would block fixing an existing customer's other
    // details just because their phone was saved before this check existed.
    let normalizedPhone = phone;
    if (!customerToEdit) {
      if (!isValidIndianPhone(phone)) {
        setFormError('Enter a valid 10-digit Indian phone number.');
        return;
      }
      normalizedPhone = normalizeIndianPhone(phone);

      // Registering a new guest with a phone that already belongs to someone used to silently
      // merge into — and overwrite the name of — the existing record with no message at all
      // ("Dup A" vanished the moment "Dup B" reused its number). A staff member creating what
      // they believe is a brand-new guest needs to be told plainly instead.
      const existing = CustomerRepository.getByPhone(normalizedPhone);
      if (existing) {
        setFormError(`This number already belongs to "${existing.name}" — open that guest's profile to edit it instead of registering a new one.`);
        return;
      }
    }

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
        phone: normalizedPhone,
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
              <User className="w-3.5 h-3.5 text-jaman-navy" />
              <span>Customer Full Name *</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Patel"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-jaman-navy" />
              <span>Mobile Phone Number *</span>
            </label>
            <input
              type="text"
              required
              disabled={!!customerToEdit}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-brand disabled:opacity-60"
            />
          </div>
        </div>

        {/* Email and Address */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-jaman-navy" />
              <span>Email Address</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. ramesh.patel@gmail.com"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-jaman-navy" />
              <span>Delivery / Home Address</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Satellite Towers, Bodakdev"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        {/* Birthday & Anniversary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Date of Birth (Birthday)</span>
            </label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
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
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
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
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-800 focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        {/* Customer Tags / Segments */}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-jaman-navy" />
            <span>Customer Profile Tags & Dining Preferences:</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_TAGS.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  selectedTags.includes(tag)
                    ? 'bg-brand/[0.09] text-brand ring-1 ring-inset ring-brand/40 font-semibold'
                    : 'bg-jaman-ivory border border-jaman-border text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tag === 'VIP' ? 'VIP' : tag}
              </button>
            ))}
          </div>
        </div>

        {/* Notes & Special Dietary Instructions */}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-jaman-navy" />
            <span>Personal Notes & Dietary Instructions</span>
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Strict Jain (no onion/garlic), prefers table 12 by the window, mild spices."
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl p-2.5 text-xs font-medium focus:outline-none focus:border-brand"
          />
        </div>

        {/* Lifetime Order Summary if editing */}
        {customerToEdit && (
          <div className="bg-jaman-cream p-3.5 rounded-2xl border border-jaman-border space-y-2">
            <span className="text-[11px] font-bold uppercase text-slate-500 block">
              LIFETIME DINING INTELLIGENCE:
            </span>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block font-bold">Total Spent</span>
                <strong className="tabular-nums text-emerald-700 font-bold">{formatINR(customerToEdit.totalSpend || totalSpent)}</strong>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block font-bold">Visits / Orders</span>
                <strong className="tabular-nums text-jaman-navy font-bold">{customerToEdit.totalVisits || customerOrders.length} visits</strong>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block font-bold">Avg Order Value</span>
                <strong className="font-mono text-blue-700 font-bold">
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

        {formError && (
          <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <button
            type="submit"
            className="px-4 py-2 bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            {customerToEdit ? 'Save Changes' : 'Register Customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
