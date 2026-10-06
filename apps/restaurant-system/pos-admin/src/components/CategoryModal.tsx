import React, { useState, useEffect, useRef } from 'react';
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
  const [sortOrder, setSortOrder] = useState(1);
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [iconName, setIconName] = useState('UtensilsCrossed');
  const [isActive, setIsActive] = useState(true);
  const [qrVisible, setQrVisible] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [formError, setFormError] = useState('');

  const initializedForm = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) { initializedForm.current = null; return; }
    const session = categoryToEdit?.id ?? 'new';
    if (initializedForm.current === session) return;
    initializedForm.current = session;
    if (categoryToEdit) {
      setName(categoryToEdit.name); setSortOrder(categoryToEdit.sortOrder);
      setSlug(categoryToEdit.slug);
      setDescription(categoryToEdit.description || '');
      setIconName(categoryToEdit.iconName || 'UtensilsCrossed');
      setIsActive(categoryToEdit.isActive ?? true);
      setQrVisible(categoryToEdit.qrVisible !== false);
      setImageUrl(categoryToEdit.imageUrl || '');
    } else {
      setName(''); setSortOrder(1);
      setSlug('');
      setDescription('');
      setIconName('UtensilsCrossed');
      setIsActive(true);
      setQrVisible(true);
      setImageUrl('');
    }
  }, [categoryToEdit, isOpen]);

  // A category picture is shrunk in the browser (max 600 px, JPEG) so the published menu stays small.
  const pickImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 600 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setImageUrl(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!categoryToEdit) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!Number.isInteger(sortOrder) || sortOrder < 0) { setFormError('Display order must be a non-negative integer.'); return; }
    if (!name.trim()) {
      setFormError('Category name is required.');
      return;
    }

    if (categoryToEdit) {
      MenuRepository.updateCategory(categoryToEdit.id, {
        name: name.trim(), sortOrder,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        description,
        iconName,
        isActive,
        qrVisible,
        imageUrl: imageUrl || undefined
      });
      AuditRepository.log({
        action: 'CATEGORY_UPDATED',
        category: 'MENU',
        details: `Updated category "${name}"`,
        username: 'Manager'
      });
    } else {
      MenuRepository.createCategory({
        name: name.trim(), sortOrder,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        description,
        iconName,
        isActive,
        qrVisible,
        imageUrl: imageUrl || undefined
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
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
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
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Icon Style</label>
            <select
              value={iconName}
              onChange={(e) => setIconName(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            >
              <option value="UtensilsCrossed">Utensils</option>
              <option value="Flame">Tandoor / Grill</option>
              <option value="Coffee">Coffee / Drink</option>
              <option value="Cake">Dessert / Sweet</option>
              <option value="Pizza">Pizza / Fast Food</option>
            </select>
          </div>
        </div>

        <label className="block text-xs font-bold">Category display order<input aria-label="Category display order" type="number" min={0} value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} className="block w-full border p-2 rounded-xl" /></label>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Description (Optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Authentic charcoal cooked appetizers"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand"
          />
        </div>

        <div className="flex items-center gap-3">
          {imageUrl && <img src={imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-jaman-border" />}
          <label className="text-xs font-bold text-slate-600">Picture (optional)
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickImage(f); }} className="block mt-1 text-xs" />
          </label>
          {imageUrl && <button type="button" onClick={() => setImageUrl('')} className="text-xs font-bold text-rose-600">Remove</button>}
        </div>

        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={qrVisible} onChange={(e) => setQrVisible(e.target.checked)} className="rounded" />
          <span>Show this category to guests who order by QR</span>
        </label>

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
            className="px-4 py-2 bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            {categoryToEdit ? 'Save Changes' : 'Create Category'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
