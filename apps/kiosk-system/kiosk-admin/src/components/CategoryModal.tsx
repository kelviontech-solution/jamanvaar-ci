import React, { useState, useEffect } from 'react';
import { Category } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { MenuRepository, AuditRepository } from '@jamanvaar/database';
import {
  UtensilsCrossed,
  Flame,
  Soup,
  Drumstick,
  Salad,
  Sandwich,
  Pizza,
  Wheat,
  Package,
  IceCream,
  Cookie,
  Coffee,
  CupSoda,
  GlassWater,
  Fish,
  Egg,
  Trash2
} from 'lucide-react';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryToEdit: Category | null;
  onSaved: () => void;
  onDeleted?: () => void;
}

/** Curated, restaurant-relevant subset of lucide-react icons — matched by name against the same
 *  namespace lookup CategoryCard/kiosk-user's sidebar already use, so any name picked here renders
 *  correctly everywhere the category appears. */
const ICON_CHOICES: Array<{ name: string; label: string; Icon: React.FC<{ className?: string }> }> = [
  { name: 'UtensilsCrossed', label: 'General', Icon: UtensilsCrossed },
  { name: 'Flame', label: 'Tandoor & Grill', Icon: Flame },
  { name: 'Soup', label: 'Curries', Icon: Soup },
  { name: 'Drumstick', label: 'Non-Veg', Icon: Drumstick },
  { name: 'Salad', label: 'Starters & Salads', Icon: Salad },
  { name: 'Sandwich', label: 'Rolls & Wraps', Icon: Sandwich },
  { name: 'Pizza', label: 'Fast Food', Icon: Pizza },
  { name: 'Wheat', label: 'Breads & Naan', Icon: Wheat },
  { name: 'Package', label: 'Combos & Deals', Icon: Package },
  { name: 'Fish', label: 'Seafood', Icon: Fish },
  { name: 'Egg', label: 'Egg Dishes', Icon: Egg },
  { name: 'IceCream', label: 'Ice Cream', Icon: IceCream },
  { name: 'Cookie', label: 'Desserts & Sweets', Icon: Cookie },
  { name: 'Coffee', label: 'Hot Beverages', Icon: Coffee },
  { name: 'CupSoda', label: 'Cold Drinks', Icon: CupSoda },
  { name: 'GlassWater', label: 'Water & Juices', Icon: GlassWater }
];

/**
 * Create/edit a menu category — name and, per owner request, a proper visual icon picker (the
 * sidebar previously always fell back to a generic utensils icon since nothing in Kiosk Admin
 * ever let anyone set category.iconName to anything else).
 */
export const CategoryModal: React.FC<CategoryModalProps> = ({ isOpen, onClose, categoryToEdit, onSaved, onDeleted }) => {
  const [name, setName] = useState('');
  const [iconName, setIconName] = useState('UtensilsCrossed');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (categoryToEdit) {
      setName(categoryToEdit.name);
      setIconName(categoryToEdit.iconName || 'UtensilsCrossed');
    } else {
      setName('');
      setIconName('UtensilsCrossed');
    }
    setConfirmingDelete(false);
    setFormError('');
  }, [categoryToEdit, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Category name is required.');
      return;
    }

    if (categoryToEdit) {
      MenuRepository.updateCategory(categoryToEdit.id, { name: name.trim(), iconName });
      AuditRepository.log({
        username: 'admin',
        action: 'CATEGORY_UPDATED',
        category: 'MENU',
        details: `Updated category "${name.trim()}"`
      });
    } else {
      const created = MenuRepository.createCategory({
        name: name.trim(),
        slug: name.trim().toLowerCase().replace(/\s+/g, '-'),
        iconName
      });
      AuditRepository.log({
        username: 'admin',
        action: 'CATEGORY_CREATED',
        category: 'MENU',
        details: `Created new category "${created.name}"`
      });
    }

    onSaved();
    onClose();
  };

  const handleDelete = () => {
    if (!categoryToEdit) return;
    MenuRepository.deleteCategory(categoryToEdit.id);
    AuditRepository.log({
      username: 'admin',
      action: 'CATEGORY_DELETED',
      category: 'MENU',
      details: `Deleted category "${categoryToEdit.name}"`
    });
    onDeleted?.();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={categoryToEdit ? `Edit Category: ${categoryToEdit.name}` : 'Add Menu Category'} maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div>
          <label className="block text-xs font-bold text-jaman-navy mb-1">Category Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="E.g., Tandoori Platters, South Indian, Desserts"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-jaman-navy"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-jaman-navy mb-2">Category Icon</label>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {ICON_CHOICES.map(({ name: iName, label, Icon }) => (
              <button
                key={iName}
                type="button"
                title={label}
                onClick={() => setIconName(iName)}
                className={`aspect-square rounded-xl border flex items-center justify-center transition-all active:scale-95 ${
                  iconName === iName
                    ? 'bg-jaman-navy border-jaman-navy text-white shadow-sm'
                    : 'bg-jaman-ivory border-jaman-border text-jaman-navy hover:bg-[#F4EFE6]'
                }`}
              >
                <Icon className="w-5 h-5" />
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">{ICON_CHOICES.find((c) => c.name === iconName)?.label}</p>
        </div>

        {formError && (
          <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{formError}</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-jaman-border">
          {categoryToEdit ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-rose-600">Delete this category?</span>
                <button type="button" onClick={handleDelete} className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs">
                  Yes, Delete
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 font-bold text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {categoryToEdit ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
