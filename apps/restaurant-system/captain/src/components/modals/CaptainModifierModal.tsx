import React, { useState } from 'react';
import { MenuItem, SelectedModifier } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import { X, Plus, Minus, Check, Flame, Sparkles } from 'lucide-react';

interface CaptainModifierModalProps {
  item: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    item: MenuItem,
    modifiers: SelectedModifier[],
    notes: string,
    course: 'COURSE_1' | 'COURSE_2' | 'COURSE_3',
    quantity: number
  ) => void;
}

export const CaptainModifierModal: React.FC<CaptainModifierModalProps> = ({
  item,
  isOpen,
  onClose,
  onConfirm
}) => {
  if (!isOpen || !item) return null;

  const [quantity, setQuantity] = useState(1);
  const [spice, setSpice] = useState<'MILD' | 'MEDIUM' | 'SPICY'>('MEDIUM');
  const [isJain, setIsJain] = useState(false);
  const [extraCheese, setExtraCheese] = useState(false);
  const [extraButter, setExtraButter] = useState(false);
  const [notes, setNotes] = useState('');
  const [course, setCourse] = useState<'COURSE_1' | 'COURSE_2' | 'COURSE_3'>('COURSE_1');

  // Compute total price
  let modExtra = 0;
  if (extraCheese) modExtra += 40;
  if (extraButter) modExtra += 25;
  const unitPrice = item.price + modExtra;
  const totalPrice = unitPrice * quantity;

  const handleAdd = () => {
    const selectedMods: SelectedModifier[] = [];
    if (spice !== 'MEDIUM') {
      selectedMods.push({
        groupId: 'mod-spice',
        groupName: 'Spice Level',
        optionId: `spice-${spice.toLowerCase()}`,
        optionName: spice === 'MILD' ? 'Less Spicy' : 'Extra Spicy',
        priceDelta: 0
      });
    }
    if (isJain) {
      selectedMods.push({
        groupId: 'mod-prep',
        groupName: 'Diet Preparation',
        optionId: 'prep-jain',
        optionName: 'Jain (No Onion No Garlic)',
        priceDelta: 0
      });
    }
    if (extraCheese) {
      selectedMods.push({
        groupId: 'mod-extras',
        groupName: 'Extras',
        optionId: 'extra-cheese',
        optionName: 'Extra Cheese',
        priceDelta: 40
      });
    }
    if (extraButter) {
      selectedMods.push({
        groupId: 'mod-extras',
        groupName: 'Extras',
        optionId: 'extra-butter',
        optionName: 'Extra Butter',
        priceDelta: 25
      });
    }

    onConfirm(item, selectedMods, notes, course, quantity);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-[#EBE6DD] space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${item.dietaryType === 'VEG' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <h3 className="text-lg font-black text-[#0B253A]">{item.name}</h3>
            </div>
            <span className="text-xs text-[#E66817] font-bold font-mono block mt-0.5">
              Base Price: {formatINR(item.price)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Spice Level */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Spice Level
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['MILD', 'MEDIUM', 'SPICY'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setSpice(lvl)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  spice === lvl
                    ? 'bg-[#0B253A] text-white shadow-xs'
                    : 'bg-[#FAF7F2] text-slate-600 hover:bg-slate-100 border border-[#EBE6DD]'
                }`}
              >
                {lvl === 'MILD' ? '🌿 Mild' : lvl === 'MEDIUM' ? '🌶️ Regular' : '🔥 Extra Spicy'}
              </button>
            ))}
          </div>
        </div>

        {/* Dietary & Add-ons */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Dietary & Add-ons
          </label>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setIsJain(!isJain)}
              className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                isJain
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-[#FAF7F2] border-[#EBE6DD] text-slate-600'
              }`}
            >
              <span>Jain (No Onion, No Garlic)</span>
              {isJain && <Check className="w-4 h-4 text-emerald-600" />}
            </button>

            <button
              type="button"
              onClick={() => setExtraCheese(!extraCheese)}
              className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                extraCheese
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-[#FAF7F2] border-[#EBE6DD] text-slate-600'
              }`}
            >
              <span>Extra Cheese (+₹40)</span>
              {extraCheese && <Check className="w-4 h-4 text-amber-600" />}
            </button>

            <button
              type="button"
              onClick={() => setExtraButter(!extraButter)}
              className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                extraButter
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-[#FAF7F2] border-[#EBE6DD] text-slate-600'
              }`}
            >
              <span>Extra Butter (+₹25)</span>
              {extraButter && <Check className="w-4 h-4 text-amber-600" />}
            </button>
          </div>
        </div>

        {/* Serving Course */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Serving Course
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'COURSE_1', label: '1st Course (Starters)' },
              { id: 'COURSE_2', label: '2nd Course (Mains)' },
              { id: 'COURSE_3', label: '3rd Course (Dessert)' }
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCourse(c.id as any)}
                className={`py-2 px-2 rounded-xl text-[11px] font-bold text-center transition-all cursor-pointer ${
                  course === c.id
                    ? 'bg-[#E66817] text-white shadow-xs'
                    : 'bg-[#FAF7F2] text-slate-600 hover:bg-slate-100 border border-[#EBE6DD]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Special Instructions Note */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Special Chef Instructions
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Less oil, extra crispy, gluten sensitive..."
            className="w-full px-3 py-2 bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl text-xs text-[#0B253A] outline-none focus:bg-white focus:border-[#E66817]"
          />
        </div>

        {/* Quantity & Add Action */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0B253A] font-black flex items-center justify-center cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-8 text-center text-lg font-black font-mono text-[#0B253A]">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0B253A] font-black flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            className="flex-1 py-3 px-4 rounded-2xl bg-[#E66817] hover:bg-[#EA580C] text-white font-black text-xs sm:text-sm shadow-md shadow-[#E66817]/20 transition-all active:scale-98 cursor-pointer flex items-center justify-between"
          >
            <span>Add to Order</span>
            <span className="font-mono">{formatINR(totalPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
