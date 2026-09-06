import React, { useEffect, useState } from 'react';
import { DiningTable } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { ReservationRepository, AuditRepository } from '@jamanvaar/database';

interface ReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tables: DiningTable[];
  defaultDate: string;
  onSaved: (customerName: string) => void;
}

export const ReservationModal: React.FC<ReservationModalProps> = ({
  isOpen,
  onClose,
  tables,
  defaultDate,
  onSaved
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [guestCount, setGuestCount] = useState('2');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('19:00');
  const [tableId, setTableId] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [depositAmount, setDepositAmount] = useState('0');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCustomerName('');
      setCustomerPhone('');
      setGuestCount('2');
      setDate(defaultDate);
      setTime('19:00');
      setTableId('');
      setSpecialRequests('');
      setDepositAmount('0');
      setFormError('');
    }
  }, [isOpen, defaultDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!customerName.trim()) {
      setFormError('Guest name is required.');
      return;
    }
    const guests = Number(guestCount);
    if (!guestCount || isNaN(guests) || guests <= 0) {
      setFormError('Guest count must be a number greater than zero.');
      return;
    }
    if (!date || !time) {
      setFormError('Reservation date and time are required.');
      return;
    }

    const reservationTime = new Date(`${date}T${time}:00`).toISOString();
    const table = tables.find((t) => t.id === tableId);

    const created = ReservationRepository.create({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      guestCount: guests,
      tableId: table?.id,
      tableNumber: table?.tableNumber,
      reservationTime,
      status: 'CONFIRMED',
      specialRequests: specialRequests.trim() || undefined,
      depositAmount: Number(depositAmount) || 0
    });

    AuditRepository.log({
      action: 'RESERVATION_CREATED',
      category: 'SETTINGS',
      details: `Reservation for ${created.customerName} (${created.guestCount} guests) at ${new Date(created.reservationTime).toLocaleString('en-IN')}`,
      username: 'Manager'
    });

    onSaved(created.customerName);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Table Reservation" maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {formError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl px-3 py-2">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Guest Name *</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Rohan Mehta"
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Phone Number</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="e.g. 98765 43210"
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Date *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Time *</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-[#E66817]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Guests *</label>
            <input
              type="number"
              min="1"
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-[#E66817]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Preferred Table (optional)</label>
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            >
              <option value="">No preference — assign at arrival</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>Table {t.tableNumber} ({t.capacity} seats, {t.zone})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Deposit Collected (₹)</label>
            <input
              type="number"
              min="0"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-[#E66817]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Special Requests (optional)</label>
          <input
            type="text"
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            placeholder="e.g. Birthday cake, window seating, high chair needed"
            className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#E66817]"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">Confirm Reservation</Button>
        </div>
      </form>
    </Modal>
  );
};
