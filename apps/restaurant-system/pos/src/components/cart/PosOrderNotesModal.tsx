import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { X, MessageSquare, Plus, Check } from 'lucide-react';

interface PosOrderNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_CHEF_NOTES = [
  'Less spicy',
  'Extra spicy',
  'No onion',
  'No garlic',
  'Jain preparation',
  'Extra cheese',
  'Pack separately',
  'Serve starter first',
  'No ice in drinks',
  'Crispy preparation'
];

export const PosOrderNotesModal: React.FC<PosOrderNotesModalProps> = ({ isOpen, onClose }) => {
  const { orderNotes, setOrderNotes } = usePosStore();
  const [customText, setCustomText] = useState(orderNotes || '');

  if (!isOpen) return null;

  const toggleChip = (chip: string) => {
    let current = customText.trim();
    if (current.includes(chip)) {
      current = current
        .replace(new RegExp(`(^|,\\s*)${chip}`, 'i'), '')
        .replace(/^,\s*/, '')
        .trim();
    } else {
      current = current ? `${current}, ${chip}` : chip;
    }
    setCustomText(current);
  };

  const handleSave = () => {
    setOrderNotes(customText.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-jaman-cream border border-jaman-border rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-jaman-navy text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-jaman-saffron" />
            <h3 className="text-sm font-bold text-white">Kitchen & Chef Instructions</h3>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 bg-white">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Quick Kitchen Presets:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_CHEF_NOTES.map((chip) => {
                const isActive = customText.toLowerCase().includes(chip.toLowerCase());
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleChip(chip)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                      isActive
                        ? 'bg-jaman-saffron text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {isActive && <Check className="w-3 h-3" />}
                    <span>{chip}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Custom Order Note (flows to KOT ticket & KDS):
            </label>
            <textarea
              rows={3}
              placeholder="e.g. VIP guest, urgent preparation, no plastic cutlery..."
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-jaman-navy focus:outline-hidden focus:border-jaman-saffron focus:bg-white resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-jaman-cream border-t border-jaman-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 rounded-xl bg-jaman-saffron text-white font-bold text-xs shadow-xs hover:bg-jaman-orange"
          >
            Save Instructions
          </button>
        </div>
      </div>
    </div>
  );
};
