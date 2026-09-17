import React, { useState } from 'react';
import { useCaptainStore, PRESET_MESSAGES } from '../../store/captainStore';
import { Send, X, MessageSquare, ChefHat, Server, UserCheck } from 'lucide-react';

interface CaptainQuickMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTableNumber?: string;
}

export const CaptainQuickMessageModal: React.FC<CaptainQuickMessageModalProps> = ({
  isOpen,
  onClose,
  defaultTableNumber = ''
}) => {
  if (!isOpen) return null;

  const { sendMessage } = useCaptainStore();

  const [recipient, setRecipient] = useState<'KITCHEN' | 'POS' | 'MANAGER' | 'ALL'>('KITCHEN');
  const [preset, setPreset] = useState(PRESET_MESSAGES[0]);
  const [customNote, setCustomNote] = useState('');
  const [tableNumber, setTableNumber] = useState(defaultTableNumber);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(recipient, preset, customNote, tableNumber || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-jaman-border space-y-4 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-jaman-saffron" />
            <h3 className="text-lg font-black text-jaman-navy">Send Staff Message</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Recipient */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Send To:
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: 'KITCHEN', label: '🍳 Kitchen Stations' },
              { id: 'POS', label: '💻 Counter POS' },
              { id: 'MANAGER', label: '👔 Floor Manager' },
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

        {/* Table # */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Table Number (Optional)
          </label>
          <input
            type="text"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="e.g. 12 or leave empty"
            className="w-full px-3.5 py-2 bg-jaman-cream border border-jaman-border rounded-xl text-xs font-bold text-jaman-navy outline-none focus:bg-white focus:border-jaman-saffron"
          />
        </div>

        {/* Preset Chips */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Quick Operational Action:
          </label>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
            {PRESET_MESSAGES.map((msg) => (
              <button
                key={msg}
                type="button"
                onClick={() => setPreset(msg)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold text-left transition-all cursor-pointer ${
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
            Additional Details (Optional)
          </label>
          <input
            type="text"
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            placeholder="e.g. Flight in 30 mins, please prioritize"
            className="w-full px-3.5 py-2 bg-jaman-cream border border-jaman-border rounded-xl text-xs text-jaman-navy outline-none focus:bg-white focus:border-jaman-saffron"
          />
        </div>

        {/* Actions */}
        <div className="pt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="py-3 rounded-xl bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs shadow-md flex items-center justify-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Broadcast</span>
          </button>
        </div>
      </form>
    </div>
  );
};
