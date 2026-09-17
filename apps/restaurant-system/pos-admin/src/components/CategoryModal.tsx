import React, { useState, useEffect } from 'react';
import { Category } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { MenuRepository, AuditRepository } from '@jamanvaar/database';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryToEdit: Category | null;
  onSaved: () => void;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  categoryToEdit,
  onSaved
}) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [iconName, setIconName] = useState('UtensilsCrossed');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (categoryToEdit) {
      setName(categoryToEdit.name);
      setSlug(categoryToEdit.slug);
      setDescription(categoryToEdit.description || '');
      setIconName(categoryToEdit.iconName || 'UtensilsCrossed');
      setIsActive(categoryToEdit.isActive ?? true);
    } else {
      setName('');
      setSlug('');
      setDescription('');
      setIconName('UtensilsCrossed');
      setIsActive(true);
    }
  }, [categoryToEdit, isOpen]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!categoryToEdit) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name) {
      setFormError('Category name is required.');
      return;
    }

    if (categoryToEdit) {
      MenuRepository.updateCategory(categoryToEdit.id, {
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        description,
        iconName,
        isActive
      });
      AuditRepository.log({
        action: 'CATEGORY_UPDATED',
        category: 'MENU',
        details: `Updated category "${name}"`,
        username: 'Manager'
      });
    } else {
      MenuRepository.createCategory({
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        description,
        iconName,
        isActive
      });
      AuditRepository.log({
        action: 'CATEGORY_CREATED',
        category: 'MENU',
        details: `Created category "${name}"`,
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
      title={categoryToEdit ? `Edit Category: ${categoryToEdit.name}` : 'Add Menu Category'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Category Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Starters & Appetizers"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">URL / Code Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. starters-appetizers"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Icon Style</label>
            <select
              value={iconName}
              onChange={(e) => setIconName(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
            >
              <option value="UtensilsCrossed">🍽️ Utensils</option>
              <option value="Flame">🔥 Tandoor / Grill</option>
              <option value="Coffee">☕ Coffee / Drink</option>
              <option value="Cake">🍰 Dessert / Sweet</option>
              <option value="Pizza">🍕 Pizza / Fast Food</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Description (Optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Authentic charcoal cooked appetizers"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-jaman-saffron"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            <span>Active & Visible on Customer Kiosk / POS</span>
          </label>
        </div>

        {formError && (
          <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="submit"
            className="px-4 py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            {categoryToEdit ? 'Save Changes' : 'Create Category'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
