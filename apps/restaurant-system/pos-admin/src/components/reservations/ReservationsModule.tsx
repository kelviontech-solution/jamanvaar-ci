import React, { useMemo, useState } from 'react';
import { DiningTable, Reservation } from '@jamanvaar/types';
import { ReservationRepository, AuditRepository } from '@jamanvaar/database';
import {
  CalendarClock,
  Plus,
  Phone,
  Users as UsersIcon,
  MessageSquare,
  CheckCircle2,
  XCircle,
  UserX
} from 'lucide-react';
import { ReservationModal } from './ReservationModal';

interface ReservationsModuleProps {
  reservations: Reservation[];
  tables: DiningTable[];
  showToast: (msg: string) => void;
  onRequestConfirm?: (dialog: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    isDanger: boolean;
    onConfirm: () => void;
  }) => void;
}

function toDateKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

const STATUS_META: Record<Reservation['status'], { label: string; className: string }> = {
  CONFIRMED: { label: 'Confirmed', className: 'bg-blue-50 text-blue-800 border-blue-200' },
  SEATED: { label: 'Seated', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  CANCELLED: { label: 'Cancelled', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  NO_SHOW: { label: 'No-Show', className: 'bg-rose-50 text-rose-700 border-rose-200' }
};

export const ReservationsModule: React.FC<ReservationsModuleProps> = ({
  reservations,
  tables,
  showToast,
  onRequestConfirm
}) => {
  const todayKey = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reservationToEdit, setReservationToEdit] = useState<Reservation | null>(null);

  const dayReservations = useMemo(
    () => reservations.filter((r) => toDateKey(r.reservationTime) === selectedDate),
    [reservations, selectedDate]
  );

  const todayCount = useMemo(() => reservations.filter((r) => toDateKey(r.reservationTime) === todayKey).length, [reservations, todayKey]);
  const upcomingCount = useMemo(
    () => reservations.filter((r) => r.status === 'CONFIRMED' && new Date(r.reservationTime).getTime() > Date.now()).length,
    [reservations]
  );
  const noShowCount = useMemo(() => reservations.filter((r) => r.status === 'NO_SHOW').length, [reservations]);

  const setStatus = (res: Reservation, status: Reservation['status']) => {
    ReservationRepository.updateStatus(res.id, status);
    AuditRepository.log({
      action: `RESERVATION_${status}`,
      category: 'SETTINGS',
      details: `Reservation for ${res.customerName} (${res.guestCount} guests) marked ${status}`,
      username: 'Manager'
    });
    showToast(`Reservation for ${res.customerName} marked ${STATUS_META[status].label}`);
  };

  const handleCancel = (res: Reservation) => {
    const doCancel = () => setStatus(res, 'CANCELLED');
    if (onRequestConfirm) {
      onRequestConfirm({
        isOpen: true,
        title: 'Cancel Reservation',
        message: `Cancel the reservation for "${res.customerName}" at ${new Date(res.reservationTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}?`,
        confirmText: 'Cancel Reservation',
        isDanger: true,
        onConfirm: doCancel
      });
    } else if (window.confirm(`Cancel reservation for "${res.customerName}"?`)) {
      doCancel();
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">Table Reservations</h1>
            <span className="bg-orange-50 text-[#E66817] font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-orange-200/70">
              {todayCount} TODAY
            </span>
          </div>
          <p className="text-xs text-[#4A5568] mt-0.5">Take bookings ahead of time and track table demand by time slot.</p>
        </div>
        <button
          onClick={() => {
            setReservationToEdit(null);
            setIsModalOpen(true);
          }}
          className="px-3.5 py-2 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Reservation</span>
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Today's Bookings</span>
          <div className="text-2xl font-black text-[#0B253A] font-mono">{todayCount}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Upcoming Confirmed</span>
          <div className="text-2xl font-black text-blue-700 font-mono">{upcomingCount}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">No-Shows (All Time)</span>
          <div className="text-2xl font-black text-rose-700 font-mono">{noShowCount}</div>
        </div>
      </div>

      {/* Date selector + list */}
      <div className="bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden shadow-2xs">
        <div className="p-4 bg-[#FAF7F2] border-b border-[#EBE6DD] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[#E66817]" />
            <span className="font-extrabold text-sm text-[#0B253A]">Bookings for</span>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white border border-[#EBE6DD] rounded-xl px-3 py-1.5 text-xs font-bold text-[#0B253A] focus:outline-none focus:border-[#E66817]"
          />
        </div>

        {dayReservations.length === 0 ? (
          <div className="py-14 text-center px-4 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#E66817] flex items-center justify-center mx-auto">
              <CalendarClock className="w-6 h-6" />
            </div>
            <h4 className="font-extrabold text-[#0B253A] text-sm">No Reservations This Day</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Bookings for {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} will appear here as they're taken.
            </p>
            <button
              onClick={() => { setReservationToEdit(null); setIsModalOpen(true); }}
              className="px-4 py-2 bg-[#E66817] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
            >
              + Take a Reservation
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dayReservations.map((res) => {
              const meta = STATUS_META[res.status];
              return (
                <div key={res.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-[#FDFBF7] transition-colors">
                  <div className="w-16 shrink-0 text-center">
                    <div className="font-mono font-black text-sm text-[#0B253A]">
                      {new Date(res.reservationTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-sm text-[#0B253A]">{res.customerName}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${meta.className}`}>{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                      {res.customerPhone && (
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{res.customerPhone}</span>
                      )}
                      <span className="flex items-center gap-1"><UsersIcon className="w-3 h-3" />{res.guestCount} guests</span>
                      {res.tableNumber && <span>Table {res.tableNumber}</span>}
                      {res.specialRequests && (
                        <span className="flex items-center gap-1 text-slate-400"><MessageSquare className="w-3 h-3" />{res.specialRequests}</span>
                      )}
                    </div>
                  </div>
                  {res.status === 'CONFIRMED' && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setStatus(res, 'SEATED')}
                        title="Mark Seated"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Seat
                      </button>
                      <button
                        onClick={() => setStatus(res, 'NO_SHOW')}
                        title="Mark No-Show"
                        className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <UserX className="w-3.5 h-3.5" /> No-Show
                      </button>
                      <button
                        onClick={() => handleCancel(res)}
                        title="Cancel"
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ReservationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        tables={tables}
        defaultDate={selectedDate}
        onSaved={(name) => showToast(`Reservation created for ${name}`)}
      />
    </div>
  );
};
