import React, { useState } from 'react';
import { useCaptainStore, CustomerRequest } from '../../store/captainStore';
import {
  Bell,
  Check,
  Clock,
  Plus,
  CheckCircle2,
  AlertCircle,
  X,
  Droplet,
  Utensils,
  Sparkles,
  UserCheck
} from 'lucide-react';

export const CaptainGuestRequestsView: React.FC = () => {
  const {
    customerRequests,
    acknowledgeCustomerRequest,
    resolveCustomerRequest,
    addCustomerRequest
  } = useCaptainStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newReqTable, setNewReqTable] = useState('12');
  const [newReqType, setNewReqType] = useState<CustomerRequest['type']>('WATER');
  const [newReqNotes, setNewReqNotes] = useState('');

  const pendingRequests = customerRequests.filter((cr) => !cr.isResolved);
  const resolvedRequests = customerRequests.filter((cr) => cr.isResolved);

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    addCustomerRequest(newReqTable, newReqType, newReqNotes);
    setIsAddModalOpen(false);
    setNewReqNotes('');
  };

  const getRequestIcon = (type: CustomerRequest['type']) => {
    switch (type) {
      case 'WATER':
        return '💧';
      case 'PLATES':
        return '🍽️';
      case 'CUTLERY':
        return '🍴';
      case 'TISSUE':
        return '🧻';
      case 'CLEANING':
        return '🧹';
      case 'MANAGER':
        return '👤';
      case 'BILL':
        return '🧾';
      default:
        return '🔔';
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-[#EBE6DD] shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-600" />
            <h2 className="text-xl font-black text-[#0B253A]">Guest Service Requests</h2>
            <span className="bg-amber-100 text-amber-900 text-xs font-black px-2.5 py-0.5 rounded-full">
              {pendingRequests.length} Pending
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Diner requests for water, extra cutlery, table cleaning, and staff assistance.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2 rounded-2xl bg-[#E66817] hover:bg-[#EA580C] text-white font-black text-xs shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Log Guest Request</span>
        </button>
      </div>

      {/* Requests Grid */}
      {pendingRequests.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pendingRequests.map((req) => {
            const elapsedMins = Math.max(
              1,
              Math.round((Date.now() - new Date(req.createdAt).getTime()) / 60000)
            );

            return (
              <div
                key={req.id}
                className="bg-white rounded-3xl border-2 border-amber-400 p-5 space-y-4 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-xl shadow-2xs">
                        {getRequestIcon(req.type)}
                      </div>
                      <div>
                        <span className="text-xl font-black text-[#0B253A]">TABLE {req.tableNumber}</span>
                        <span className="text-xs font-black text-amber-800 uppercase block tracking-wider">
                          {req.type.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-xl">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{elapsedMins}m ago</span>
                    </div>
                  </div>

                  {req.notes && (
                    <div className="mt-3 p-3 rounded-2xl bg-[#FAF7F2] border border-[#EBE6DD] text-xs text-slate-700 font-medium">
                      <span className="font-bold text-slate-900 block mb-0.5">Guest Note:</span>
                      {req.notes}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  {!req.isAcknowledged && (
                    <button
                      type="button"
                      onClick={() => acknowledgeCustomerRequest(req.id)}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs transition-colors cursor-pointer"
                    >
                      Accept
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => resolveCustomerRequest(req.id)}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Mark Done</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center rounded-3xl bg-white border-2 border-dashed border-[#EBE6DD] space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          <h3 className="text-lg font-black text-[#0B253A]">All Guest Requests Completed!</h3>
          <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
            No pending diner requests on your floor right now.
          </p>
        </div>
      )}

      {/* Add Request Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateRequest}
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-[#EBE6DD] space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-[#0B253A]">Log Guest Request</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Table Number
              </label>
              <input
                type="text"
                value={newReqTable}
                onChange={(e) => setNewReqTable(e.target.value)}
                placeholder="e.g. 12"
                className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl text-xs font-bold text-[#0B253A] outline-none focus:bg-white focus:border-[#E66817]"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Request Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'WATER', label: '💧 Drinking Water' },
                  { id: 'PLATES', label: '🍽️ Extra Plates' },
                  { id: 'CUTLERY', label: '🍴 Extra Cutlery' },
                  { id: 'TISSUE', label: '🧻 Napkins / Tissue' },
                  { id: 'CLEANING', label: '🧹 Table Cleaning' },
                  { id: 'MANAGER', label: '👤 Manager Assist' }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setNewReqType(t.id as any)}
                    className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                      newReqType === t.id
                        ? 'bg-[#0B253A] text-white border-[#0B253A]'
                        : 'bg-[#FAF7F2] border-[#EBE6DD] text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Special Note
              </label>
              <input
                type="text"
                value={newReqNotes}
                onChange={(e) => setNewReqNotes(e.target.value)}
                placeholder="e.g. Warm water, 2 small forks..."
                className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl text-xs text-[#0B253A] outline-none focus:bg-white focus:border-[#E66817]"
              />
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white font-black text-xs shadow-md"
              >
                Submit Request
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
