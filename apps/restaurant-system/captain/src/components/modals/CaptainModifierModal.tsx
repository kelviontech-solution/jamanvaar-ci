import React, { useEffect, useMemo, useState } from 'react';
import { useEscapeToClose } from '../useEscapeToClose';
import { MenuItem, SelectedModifier } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import { captainDb } from '@jamanvaar/database';
import {
  resolveModifierGroups,
  defaultModifierSelection,
  selectionToModifiers,
  missingRequiredGroups,
  type ModifierSelection
} from '@jamanvaar/business';
import { X, Plus, Minus, Check } from 'lucide-react';

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
  useEscapeToClose(isOpen, onClose);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [course, setCourse] = useState<'COURSE_1' | 'COURSE_2' | 'COURSE_3'>('COURSE_1');
  const [selection, setSelection] = useState<ModifierSelection>({});

  // The dish's own options (BUG-112) — none are invented for a dish that has none.
  const groups = useMemo(() => (item ? resolveModifierGroups(item, captainDb.modifierGroups) : []), [item?.id]);

  useEffect(() => {
    if (isOpen && item) {
      setQuantity(1);
      setNotes('');
      setCourse('COURSE_1');
      setSelection(defaultModifierSelection(groups));
    }
  }, [isOpen, item?.id]);

  if (!isOpen || !item) return null;

  const modifiers = selectionToModifiers(groups, selection);
  const unitPrice = item.price + modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
  const totalPrice = unitPrice * quantity;
  const missing = missingRequiredGroups(groups, selection);

  const toggle = (groupId: string, optionId: string, max: number) =>
    setSelection((prev) => {
      const current = prev[groupId] ?? [];
      if (max <= 1) return { ...prev, [groupId]: [optionId] };
      if (current.includes(optionId)) return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      if (current.length >= max) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });

  const handleAdd = () => {
    if (missing.length > 0) return;
    onConfirm(item, modifiers, notes, course, quantity);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-jaman-border space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${item.dietaryType === 'VEG' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <h3 className="text-lg font-black text-jaman-navy">{item.name}</h3>
            </div>
            <span className="text-xs text-jaman-saffron font-bold font-mono block mt-0.5">
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

        {/* The dish's own modifier groups */}
        {groups.map((g) => {
          const max = Math.max(1, g.maxSelections);
          const chosen = selection[g.id] ?? [];
          return (
            <div key={g.id} className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>{g.name}{g.isRequired ? ' *' : ''}</span>
                {max > 1 && <span className="text-[10px] normal-case font-semibold text-slate-400">choose up to {max}</span>}
              </label>
              <div className="space-y-1.5">
                {g.options.map((o) => {
                  const on = chosen.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggle(g.id, o.id, max)}
                      className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                        on ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-jaman-cream border-jaman-border text-slate-600'
                      }`}
                    >
                      <span>{o.name}{o.priceDelta ? ` (+${formatINR(o.priceDelta)})` : ''}</span>
                      {on && <Check className="w-4 h-4 text-amber-600" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

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
                    ? 'bg-jaman-saffron text-white shadow-xs'
                    : 'bg-jaman-cream text-slate-600 hover:bg-slate-100 border border-jaman-border'
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
            className="w-full px-3 py-2 bg-jaman-cream border border-jaman-border rounded-xl text-xs text-jaman-navy outline-none focus:bg-white focus:border-jaman-saffron"
          />
        </div>

        {/* Quantity & Add Action */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-jaman-navy font-black flex items-center justify-center cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-8 text-center text-lg font-black font-mono text-jaman-navy">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-jaman-navy font-black flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={missing.length > 0}
            title={missing.length > 0 ? `Choose: ${missing.join(', ')}` : undefined}
            className="flex-1 disabled:opacity-50 py-3 px-4 rounded-2xl bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs sm:text-sm shadow-md shadow-jaman-saffron/20 transition-all active:scale-98 cursor-pointer flex items-center justify-between"
          >
            <span>Add to Order</span>
            <span className="font-mono">{formatINR(totalPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
