import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { db } from '@jamanvaar/database';
import { ModifierGroup, ModifierOption, SelectedModifier } from '@jamanvaar/types';
import { X, Plus, Minus, Check, Sparkles, MessageSquare } from 'lucide-react';

const QUICK_INSTRUCTIONS = [
  'Less Spicy',
  'No Onion / Garlic',
  'Extra Spicy / Kolhapuri',
  'Jain Preparation',
  'Pack Separately',
  'Crispy / Well Done',
  'Less Oil / Ghee',
  'Cut into 4 Pieces'
];

export const PosCustomizationModal: React.FC = () => {
  const { customizingItem, setCustomizingItem, addItemToCart } = usePosStore();
  const [selectedOptions, setSelectedOptions] = useState<SelectedModifier[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState('');

  if (!customizingItem) return null;

  // Retrieve modifier groups for this item
  const modifierGroups: ModifierGroup[] = (customizingItem.modifierGroupIds || [])
    .map((gId) => db.modifierGroups.find((g) => g.id === gId))
    .filter(Boolean) as ModifierGroup[];

  const handleToggleOption = (group: ModifierGroup, option: ModifierOption) => {
    const isMulti = group.maxSelections > 1;

    if (!isMulti) {
      // Single select: Replace existing selection in this group
      const filtered = selectedOptions.filter((so) => so.groupId !== group.id);
      setSelectedOptions([
        ...filtered,
        {
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          optionName: option.name,
          priceDelta: option.priceDelta || 0
        }
      ]);
    } else {
      // Multi-select toggle
      const exists = selectedOptions.some((so) => so.optionId === option.id);
      if (exists) {
        setSelectedOptions(selectedOptions.filter((so) => so.optionId !== option.id));
      } else {
        const groupCount = selectedOptions.filter((so) => so.groupId === group.id).length;
        if (groupCount < group.maxSelections) {
          setSelectedOptions([
            ...selectedOptions,
            {
              groupId: group.id,
              groupName: group.name,
              optionId: option.id,
              optionName: option.name,
              priceDelta: option.priceDelta || 0
            }
          ]);
        }
      }
    }
  };

  const isOptionSelected = (optionId: string) => {
    return selectedOptions.some((so) => so.optionId === optionId);
  };

  const modifierTotal = selectedOptions.reduce((acc, so) => acc + (so.priceDelta || 0), 0);
  const unitPrice = customizingItem.price + modifierTotal;
  const totalPrice = unitPrice * quantity;

  const handleAddToCart = () => {
    addItemToCart(customizingItem, selectedOptions, specialInstructions, quantity);
    setCustomizingItem(null);
  };

  const toggleQuickInstruction = (text: string) => {
    if (specialInstructions.includes(text)) {
      setSpecialInstructions(
        specialInstructions
          .replace(text, '')
          .replace(/,\s*,/g, ',')
          .replace(/^,\s*|,\s*$/g, '')
          .trim()
      );
    } else {
      setSpecialInstructions((prev) => (prev ? `${prev}, ${text}` : text));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-jaman-cream border border-jaman-border rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-jaman-navy text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 overflow-hidden border border-white/20 shrink-0">
              <img
                src={customizingItem.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80'}
                alt={customizingItem.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                {customizingItem.name}
              </h2>
              <div className="text-xs text-slate-300 flex items-center gap-2 mt-0.5">
                <span>Base: ₹{customizingItem.price}</span>
                <span>•</span>
                <span className="text-jaman-saffron font-semibold">{customizingItem.kitchenStation || 'Kitchen'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setCustomizingItem(null)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Customization Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Modifier Groups */}
          {modifierGroups.map((group) => (
            <div key={group.id} className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-sm text-jaman-navy">{group.name}</h3>
                  <span className="text-[11px] text-slate-400">
                    {group.isRequired ? 'Required • Choose 1' : `Optional • Max ${group.maxSelections}`}
                  </span>
                </div>
                {group.isRequired && (
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                    Required
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {group.options.map((opt) => {
                  const selected = isOptionSelected(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleToggleOption(group, opt)}
                      className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                        selected
                          ? 'border-jaman-saffron bg-jaman-saffron/10 text-jaman-navy font-bold shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                            selected
                              ? 'bg-jaman-saffron border-jaman-saffron text-white'
                              : 'border-slate-300'
                          }`}
                        >
                          {selected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="text-xs">{opt.name}</span>
                      </div>

                      <span className="text-xs font-mono font-bold text-slate-600">
                        {opt.priceDelta > 0 ? `+₹${opt.priceDelta}` : 'Free'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quick Cooking Instructions */}
          <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-jaman-saffron" />
              <h3 className="font-bold text-sm text-jaman-navy">Kitchen Instructions</h3>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {QUICK_INSTRUCTIONS.map((text) => {
                const active = specialInstructions.includes(text);
                return (
                  <button
                    key={text}
                    type="button"
                    onClick={() => toggleQuickInstruction(text)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      active
                        ? 'bg-jaman-navy text-white border-jaman-navy'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {text}
                  </button>
                );
              })}
            </div>

            <div className="relative">
              <input
                type="text"
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="Custom instruction for kitchen chef..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-jaman-navy placeholder:text-slate-400 focus:outline-none focus:border-jaman-saffron"
              />
            </div>
          </div>
        </div>

        {/* Footer: Quantity & Confirm Add */}
        <div className="bg-white border-t border-jaman-border p-4 sm:p-5 flex items-center justify-between gap-4">
          {/* Quantity Controls */}
          <div className="flex items-center gap-3 bg-slate-100 border border-slate-200 rounded-2xl p-1">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-50 active:scale-95 shadow-xs"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-8 text-center font-extrabold text-base text-jaman-navy">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-50 active:scale-95 shadow-xs"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add to Order Button */}
          <button
            onClick={handleAddToCart}
            className="flex-1 bg-jaman-saffron hover:bg-jaman-orange text-white py-3.5 px-6 rounded-2xl font-extrabold text-sm uppercase tracking-wider flex items-center justify-between shadow-lg shadow-jaman-saffron/25 active:scale-[0.99] transition-transform cursor-pointer"
          >
            <span>Add to Order</span>
            <span>₹{totalPrice}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
