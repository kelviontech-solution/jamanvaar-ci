import React, { useState } from 'react';
import { useCaptainStore, InternalMessage, PRESET_MESSAGES } from '../../store/captainStore';
import {
  MessageSquare,
  Send,
  Check,
  CheckCheck,
  Clock,
  Plus,
  Filter,
  Users,
  ChefHat,
  Server,
  UserCheck
} from 'lucide-react';

export const CaptainMessagesView: React.FC = () => {
  const {
    messages,
    sendMessage,
    acknowledgeMessage,
    resolveMessage,
    currentCaptain
  } = useCaptainStore();

  const [filter, setFilter] = useState<'ALL' | 'UNRESOLVED' | 'RESOLVED'>('UNRESOLVED');
  const [recipient, setRecipient] = useState<'KITCHEN' | 'POS' | 'MANAGER' | 'ALL'>('KITCHEN');
  const [preset, setPreset] = useState(PRESET_MESSAGES[0]);
  const [customNote, setCustomNote] = useState('');
  const [tableNumber, setTableNumber] = useState('');

  const filteredMessages = messages.filter((m) => {
    if (filter === 'UNRESOLVED' && m.status === 'RESOLVED') return false;
    if (filter === 'RESOLVED' && m.status !== 'RESOLVED') return false;
    return true;
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(recipient, preset, customNote, tableNumber || undefined);
    setCustomNote('');
    setTableNumber('');
  };

  const getRecipientBadge = (r: InternalMessage['recipient']) => {
    switch (r) {
      case 'KITCHEN':
        return '🍳 Kitchen';
      case 'POS':
        return '💻 POS Counter';
      case 'MANAGER':
        return '👔 Floor Manager';
      default:
        return '📢 All Staff';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pb-16 md:pb-6">
      {/* ── Left 2 Columns: Message Feed ── */}
      <div className="lg:col-span-2 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-jaman-border shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-jaman-saffron" />
              <h2 className="text-xl font-black text-jaman-navy">Floor & Kitchen Communications</h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Live operational messaging between Captain, Kitchen, Cashier, and Manager.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5">
            {[
              { id: 'UNRESOLVED', label: 'Active Unread' },
              { id: 'ALL', label: 'All History' },
              { id: 'RESOLVED', label: 'Resolved' }
            ].map((flt) => (
              <button
                key={flt.id}
                type="button"
                onClick={() => setFilter(flt.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  filter === flt.id
                    ? 'bg-jaman-navy text-white shadow-xs'
                    : 'bg-jaman-cream text-slate-600 hover:bg-slate-100'
                }`}
              >
                {flt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message Cards List */}
        {filteredMessages.length > 0 ? (
          <div className="space-y-3">
            {filteredMessages.map((msg) => {
              const elapsedMins = Math.max(
                1,
                Math.round((Date.now() - new Date(msg.createdAt).getTime()) / 60000)
              );

              return (
                <div
                  key={msg.id}
                  className={`bg-white rounded-3xl border p-4 sm:p-5 space-y-3 shadow-2xs transition-all ${
                    msg.status === 'RESOLVED' ? 'border-jaman-border opacity-75' : 'border-[#FDBA74] bg-[#FFFBF7]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-jaman-navy bg-slate-100 px-2 py-0.5 rounded-md">
                          From: {msg.senderName}
                        </span>
                        <span className="text-xs font-bold text-slate-400">➔</span>
                        <span className="text-xs font-black text-jaman-saffron bg-[#FFF4ED] px-2 py-0.5 rounded-md border border-[#FDBA74]">
                          {getRecipientBadge(msg.recipient)}
                        </span>
                        {msg.tableNumber && (
                          <span className="text-xs font-black bg-jaman-navy text-white px-2 py-0.5 rounded-md">
                            TABLE {msg.tableNumber}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{elapsedMins}m ago</span>
                    </div>
                  </div>

                  {/* Message Body */}
                  <div className="p-3 rounded-2xl bg-white border border-jaman-border space-y-1">
                    <p className="font-extrabold text-xs sm:text-sm text-jaman-navy">
                      {msg.presetText}
                    </p>
                    {msg.customNote && (
                      <p className="text-xs text-slate-600 font-medium italic">
                        "{msg.customNote}"
                      </p>
                    )}
                  </div>

                  {/* Status & Actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                        msg.status === 'RESOLVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : msg.status === 'ACKNOWLEDGED'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {msg.status}
                    </span>

                    <div className="flex items-center gap-2">
                      {msg.status !== 'ACKNOWLEDGED' && msg.status !== 'RESOLVED' && (
                        <button
                          type="button"
                          onClick={() => acknowledgeMessage(msg.id)}
                          className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                        >
                          Acknowledge
                        </button>
                      )}

                      {msg.status !== 'RESOLVED' && (
                        <button
                          type="button"
                          onClick={() => resolveMessage(msg.id)}
                          className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Resolve</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center rounded-3xl bg-white border-2 border-dashed border-jaman-border space-y-3">
            <MessageSquare className="w-12 h-12 text-slate-400 mx-auto" />
            <h3 className="text-lg font-black text-jaman-navy">No Active Messages</h3>
            <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
              All communications have been resolved. Use the composer on the right to send an operational note.
            </p>
          </div>
        )}
      </div>

      {/* ── Right 1 Column: Fast Message Composer ── */}
      <div className="bg-white rounded-3xl border border-jaman-border p-5 space-y-4 shadow-2xs self-start sticky top-24">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Send className="w-4 h-4 text-jaman-saffron" />
          <h3 className="text-base font-black text-jaman-navy">Quick Message Composer</h3>
        </div>

        <form onSubmit={handleSend} className="space-y-3.5">
          {/* Recipient */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Send To:
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'KITCHEN', label: '🍳 Kitchen' },
                { id: 'POS', label: '💻 Counter POS' },
                { id: 'MANAGER', label: '👔 Manager' },
                { id: 'ALL', label: '📢 All Staff' }
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRecipient(r.id as any)}
                  className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    recipient === r.id
                      ? 'bg-jaman-navy text-white shadow-2xs'
                      : 'bg-jaman-cream text-slate-600 hover:bg-slate-100 border border-jaman-border'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table # (Optional) */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Table Number (Optional)
            </label>
            <input
              type="text"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="e.g. 12 or leave empty for general"
              className="w-full px-3.5 py-2 bg-jaman-cream border border-jaman-border rounded-xl text-xs font-bold text-jaman-navy outline-none focus:bg-white focus:border-jaman-saffron"
            />
          </div>

          {/* Preset Message Chips */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Preset Quick Action:
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
              {PRESET_MESSAGES.map((msg) => (
                <button
                  key={msg}
                  type="button"
                  onClick={() => setPreset(msg)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-left transition-all cursor-pointer ${
                    preset === msg
                      ? 'bg-[#FFF4ED] text-jaman-saffron border border-[#FDBA74]'
                      : 'bg-jaman-cream text-slate-600 border border-transparent hover:border-slate-200'
                  }`}
                >
                  ⚡ {msg}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Note */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Custom Details (Optional)
            </label>
            <textarea
              rows={2}
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Type any specific details..."
              className="w-full px-3.5 py-2 bg-jaman-cream border border-jaman-border rounded-xl text-xs text-jaman-navy outline-none focus:bg-white focus:border-jaman-saffron"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-2xl bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs sm:text-sm shadow-md shadow-jaman-saffron/20 transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span>Send Message Broadcast</span>
          </button>
        </form>
      </div>
    </div>
  );
};
