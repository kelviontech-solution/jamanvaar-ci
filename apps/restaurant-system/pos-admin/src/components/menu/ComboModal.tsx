import React, { useState, useEffect, useMemo } from 'react';
import { MenuItem } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { ComboRepository, AuditRepository } from '@jamanvaar/database';
import type { ComboDeal } from '@jamanvaar/types';

interface ComboModalProps {
  isOpen: boolean;
  onClose: () => void;
  comboToEdit: ComboDeal | null;
  menuItems: MenuItem[];
  onSaved: () => void;
}

function ItemPicker({
  label,
  items,
  selectedIds,
  onToggle
}: {
  label: string;
  items: MenuItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">{label}</label>
      <div className="max-h-32 overflow-y-auto border border-jaman-border rounded-xl bg-jaman-ivory p-2 space-y-1">
        {items.length === 0 ? (
          <p className="text-[11px] text-slate-500 px-1 py-1">No dishes available — add menu items first.</p>
        ) : (
          items.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-white cursor-pointer text-xs"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={() => onToggle(item.id)}
              />
              <span className="font-semibold text-jaman-navy">{item.name}</span>
              <span className="text-slate-500 tabular-nums ml-auto">₹{item.price}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export const ComboModal: React.FC<ComboModalProps> = ({ isOpen, onClose, comboToEdit, menuItems, onSaved }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [mainItemIds, setMainItemIds] = useState<string[]>([]);
  const [sideItemIds, setSideItemIds] = useState<string[]>([]);
  const [drinkItemIds, setDrinkItemIds] = useState<string[]>([]);
  const [dessertItemIds, setDessertItemIds] = useState<string[]>([]);
  const [isAvailable, setIsAvailable] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (comboToEdit) {
      setName(comboToEdit.name);
      setDescription(comboToEdit.description || '');
      setBasePrice(String(comboToEdit.basePrice));
      setOriginalPrice(String(comboToEdit.originalPrice));
      setMainItemIds(comboToEdit.mainItemIds || []);
      setSideItemIds(comboToEdit.sideItemIds || []);
      setDrinkItemIds(comboToEdit.drinkItemIds || []);
      setDessertItemIds(comboToEdit.dessertItemIds || []);
      setIsAvailable(comboToEdit.isAvailable ?? true);
      setFeatured(!!comboToEdit.featured);
    } else {
      setName('');
      setDescription('');
      setBasePrice('');
      setOriginalPrice('');
      setMainItemIds([]);
      setSideItemIds([]);
      setDrinkItemIds([]);
      setDessertItemIds([]);
      setIsAvailable(true);
      setFeatured(false);
    }
    setFormError('');
  }, [comboToEdit, isOpen]);

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) => {
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const savingsAmount = useMemo(() => {
    const base = Number(basePrice) || 0;
    const orig = Number(originalPrice) || 0;
    return Math.max(0, orig - base);
  }, [basePrice, originalPrice]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Combo name is required.');
      return;
    }
    const base = Number(basePrice);
    const orig = Number(originalPrice);
    if (!basePrice || isNaN(base) || base <= 0) {
      setFormError('Combo price must be a number greater than zero.');
      return;
    }
    if (!originalPrice || isNaN(orig) || orig <= 0) {
      setFormError('Original (à la carte) price must be a number greater than zero.');
      return;
    }
    if (mainItemIds.length === 0) {
      setFormError('Select at least one main dish for this combo.');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      basePrice: base,
      originalPrice: orig,
      savingsAmount,
      mainItemIds,
      sideItemIds,
      drinkItemIds,
      dessertItemIds,
      imageUrl: comboToEdit?.imageUrl,
      isAvailable,
      featured
    };

    if (comboToEdit) {
      ComboRepository.updateCombo(comboToEdit.id, payload);
      AuditRepository.log({
        action: 'COMBO_UPDATED',
        category: 'MENU',
        details: `Updated combo "${name}" (Price: ₹${base})`,
        username: 'Manager'
      });
    } else {
      const created = ComboRepository.createCombo(payload);
      AuditRepository.log({
        action: 'COMBO_CREATED',
        category: 'MENU',
        details: `Created combo "${created.name}" (Price: ₹${created.basePrice})`,
        username: 'Manager'
      });
    }

    onSaved();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={comboToEdit ? `Edit Combo: ${comboToEdit.name}` : 'Create Combo / Meal Deal'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {formError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl px-3 py-2">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Combo Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Family Feast Combo"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 2 mains, a side, and a drink"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Combo Price (₹) *</label>
            <input
              type="number"
              min="1"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              placeholder="e.g. 449"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">À La Carte Price (₹) *</label>
            <input
              type="number"
              min="1"
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              placeholder="e.g. 550"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        {savingsAmount > 0 && (
          <div className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 inline-block">
            Customer saves ₹{savingsAmount} vs. ordering à la carte
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ItemPicker label="Main Dishes *" items={menuItems} selectedIds={mainItemIds} onToggle={toggle(setMainItemIds)} />
          <ItemPicker label="Sides (optional)" items={menuItems} selectedIds={sideItemIds} onToggle={toggle(setSideItemIds)} />
          <ItemPicker label="Drinks (optional)" items={menuItems} selectedIds={drinkItemIds} onToggle={toggle(setDrinkItemIds)} />
          <ItemPicker label="Desserts (optional)" items={menuItems} selectedIds={dessertItemIds} onToggle={toggle(setDessertItemIds)} />
        </div>

        <div className="flex items-center gap-5 pt-1">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
            <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
            Available now
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            Featured (highlighted in Kiosk / QR ordering)
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">{comboToEdit ? 'Save Changes' : 'Create Combo'}</Button>
        </div>
      </form>
    </Modal>
  );
};
