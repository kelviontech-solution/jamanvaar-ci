import React, { useState, useEffect, useRef } from 'react';
import { Category } from '@jamanvaar/types';
import { CachedImg, Modal, Button, MenuCategoryIcon, FormInput, FormSelect, useConfirm } from '@jamanvaar/ui';
import { CATEGORY_ICON_OPTIONS, isMenuPlaceholder, menuCategoryImage } from '@jamanvaar/utils';
import { MenuRepository, AuditRepository } from '@jamanvaar/database';
import { getCurrentAdminName } from '../currentAdminIdentity';
import { useEditConflictGuard } from '../hooks/useEditConflictGuard';

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
  const [iconName, setIconName] = useState('auto');
  const [isActive, setIsActive] = useState(true);
  const [qrVisible, setQrVisible] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [formError, setFormError] = useState('');

  // #2: same simultaneous-edit guard as ItemModal -- categories have no version field either,
  // so updatedAt (already bumped unconditionally by updateCategory) is the conflict key.
  const { confirm, confirmDialog } = useConfirm();
  const conflictGuard = useEditConflictGuard<Category>();
  const applyCategoryToForm = (cat: Category) => {
    conflictGuard.snapshot(cat.id, cat);
    setName(cat.name); setSortOrder(cat.sortOrder);
    setSlug(cat.slug);
    setDescription(cat.description || '');
    setIconName(cat.iconName === 'Cake' ? 'CakeSlice' : CATEGORY_ICON_OPTIONS.some(([icon]) => icon === cat.iconName) ? cat.iconName! : 'auto');
    setIsActive(cat.isActive ?? true);
    setQrVisible(cat.qrVisible !== false);
    setImageUrl(cat.imageUrl || '');
  };
  const initializedForm = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) { initializedForm.current = null; return; }
    const session = categoryToEdit?.id ?? 'new';
    if (initializedForm.current === session) return;
    initializedForm.current = session;
    if (categoryToEdit) {
      applyCategoryToForm(categoryToEdit);
    } else {
      setName(''); setSortOrder(1);
      setSlug('');
      setDescription('');
      setIconName('auto');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!Number.isInteger(sortOrder) || sortOrder < 0) { setFormError('Display order must be a non-negative integer.'); return; }
    if (!name.trim()) {
      setFormError('Category name is required.');
      return;
    }

    if (categoryToEdit) {
      const { conflicted, live } = conflictGuard.check(categoryToEdit.id, () => MenuRepository.getCategoryById(categoryToEdit.id));
      if (conflicted) {
        const changes = !live
          ? ['This category was removed elsewhere while you were editing.']
          : [
              live.name !== categoryToEdit.name ? `Name: "${categoryToEdit.name}" → "${live.name}"` : '',
              live.isActive !== categoryToEdit.isActive ? `Active: ${categoryToEdit.isActive ? 'Yes' : 'No'} → ${live.isActive ? 'Yes' : 'No'}` : ''
            ].filter(Boolean);
        const overwrite = live && await confirm({
          title: 'Someone else changed this category',
          message: `${changes.length ? changes.join(' · ') : 'Another change was saved to this category'} while you were editing. Saving now will overwrite that with your version.`,
          confirmLabel: 'Keep my changes & overwrite',
          cancelLabel: 'Discard mine & reload latest',
          tone: 'danger'
        });
        if (!overwrite) {
          if (live) applyCategoryToForm(live);
          else onClose();
          return;
        }
      }
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
        username: getCurrentAdminName()
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
        username: getCurrentAdminName()
      });
    }

    onSaved();
    onClose();
  };

  const categoryPreview = menuCategoryImage(imageUrl, name, description, categoryToEdit?.templateCategoryKey);
  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={categoryToEdit ? `Edit Category: ${categoryToEdit.name}` : 'Add Menu Category'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Category Name *</label>
          <FormInput
            type="text"
            required
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Starters & Appetizers"

          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">URL / Code Slug</label>
            <FormInput
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. starters-appetizers"
              mono
            />
          </div>
          <div>
            <label htmlFor="category-icon-style" className="block text-xs font-bold text-slate-600 mb-1">Icon Style</label>
            <FormSelect
              id="category-icon-style"
              value={iconName}
              onChange={(e) => setIconName(e.target.value)}

            >
              {CATEGORY_ICON_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </FormSelect>
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
          <MenuCategoryIcon name={name || 'Meals'} iconName={iconName} size="lg" />
          {!isMenuPlaceholder(categoryPreview) && <CachedImg src={categoryPreview} alt="Category picture preview" className="w-14 h-14 rounded-xl object-cover border border-jaman-border" />}
          <label className="text-xs font-bold text-slate-600">Picture (optional)
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickImage(f); }} className="block mt-1 text-xs" />
          </label>
          {imageUrl && <button type="button" onClick={() => setImageUrl('')} className="text-xs font-bold text-rose-600">Remove</button>}
        </div>
        <p className="text-xs text-slate-500">Automatic icons match the category name. Without a custom picture, the menu uses a matching template cover or a dish from this category.</p>

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
            className="min-h-11 px-4 py-2 bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-sm rounded-xl shadow-xs transition-all active:scale-95"
          >
            {categoryToEdit ? 'Save Changes' : 'Create Category'}
          </button>
        </div>
      </form>
    </Modal>
    {confirmDialog}
    </>
  );
};
