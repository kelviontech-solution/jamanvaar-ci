import React, { useState, useEffect } from 'react';
import { MenuItem, Category, DietaryType, SpiceLevel } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { MenuRepository, FOOD_IMAGE_LIBRARY, AuditRepository, db } from '@jamanvaar/database';
import { Upload, Sparkles, Image as ImageIcon, Sliders } from 'lucide-react';

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemToEdit: MenuItem | null;
  categories: Category[];
  onSaved: () => void;
}

export const ItemModal: React.FC<ItemModalProps> = ({
  isOpen,
  onClose,
  itemToEdit,
  categories,
  onSaved
}) => {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [kitchenStation, setKitchenStation] = useState('Main Kitchen');
  const [dietaryType, setDietaryType] = useState<DietaryType>('VEG');
  const [spiceLevel, setSpiceLevel] = useState<SpiceLevel>('NONE');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isPopular, setIsPopular] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [modifierGroupIds, setModifierGroupIds] = useState<string[]>([]);

  useEffect(() => {
    if (itemToEdit) {
      setName(itemToEdit.name);
      setSku(itemToEdit.sku);
      setPrice(itemToEdit.price.toString());
      setCategoryId(itemToEdit.categoryId);
      setKitchenStation(itemToEdit.kitchenStation || 'Main Kitchen');
      setDietaryType(itemToEdit.dietaryType || 'VEG');
      setSpiceLevel(itemToEdit.spiceLevel || 'NONE');
      setDescription(itemToEdit.description || '');
      setImageUrl(itemToEdit.imageUrl || '');
      setIsAvailable(itemToEdit.isAvailable ?? true);
      setIsPopular(!!itemToEdit.isPopular);
      setIsFeatured(!!itemToEdit.isFeatured);
      setModifierGroupIds(itemToEdit.modifierGroupIds || []);
    } else {
      setName('');
      setSku(`SKU-${Math.floor(100 + Math.random() * 900)}`);
      setPrice('');
      setCategoryId(categories[0]?.id || 'cat-starters');
      setKitchenStation('Main Kitchen');
      setDietaryType('VEG');
      setSpiceLevel('NONE');
      setDescription('');
      setImageUrl('/assets/menu/common/fallback-dish.svg');
      setIsAvailable(true);
      setIsPopular(false);
      setIsFeatured(false);
      setModifierGroupIds(db.modifierGroups.map((g) => g.id));
    }
  }, [itemToEdit, categories, isOpen]);

  const handleDeviceImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 600;
        const maxH = 600;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxW) {
            h = Math.round((h * maxW) / w);
            w = maxW;
          }
        } else {
          if (h > maxH) {
            w = Math.round((w * maxH) / h);
            h = maxH;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setImageUrl(canvas.toDataURL('image/jpeg', 0.85));
        }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price) return;

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) return;

    if (itemToEdit) {
      MenuRepository.updateMenuItem(itemToEdit.id, {
        name,
        sku,
        price: numPrice,
        categoryId,
        kitchenStation,
        dietaryType,
        spiceLevel,
        description,
        imageUrl,
        isAvailable,
        isPopular,
        isFeatured,
        modifierGroupIds
      });
      AuditRepository.log({
        action: 'MENU_ITEM_UPDATED',
        category: 'MENU',
        details: `Updated dish "${name}" (Price: ₹${numPrice}, SKU: ${sku}, Modifiers: ${modifierGroupIds.length})`,
        username: 'Manager'
      });
    } else {
      MenuRepository.createMenuItem({
        name,
        sku,
        price: numPrice,
        categoryId: categoryId || categories[0]?.id,
        kitchenStation,
        dietaryType,
        spiceLevel,
        description,
        imageUrl,
        isAvailable,
        isPopular,
        isFeatured,
        modifierGroupIds
      });
      AuditRepository.log({
        action: 'MENU_ITEM_CREATED',
        category: 'MENU',
        details: `Created dish "${name}" (Price: ₹${numPrice}, SKU: ${sku}, Modifiers: ${modifierGroupIds.length})`,
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
      title={itemToEdit ? `Edit Dish: ${itemToEdit.name}` : 'Add New Dish to Catalog'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {/* Name & Price */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Dish Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paneer Butter Masala"
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Price (₹) *</label>
            <input
              type="number"
              required
              min="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 260"
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-[#E66817]"
            />
          </div>
        </div>

        {/* SKU & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">SKU / Item Code</label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. PBM-01"
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-[#E66817]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Menu Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Station & Dietary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Kitchen Station</label>
            <select
              value={kitchenStation}
              onChange={(e) => setKitchenStation(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            >
              <option value="Main Kitchen">Main Kitchen</option>
              <option value="Tandoor Section">Tandoor Section</option>
              <option value="Curry Station">Curry Station</option>
              <option value="Beverages Bar">Beverages Bar</option>
              <option value="Dessert Counter">Dessert Counter</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Dietary Type</label>
            <select
              value={dietaryType}
              onChange={(e) => setDietaryType(e.target.value as DietaryType)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            >
              <option value="VEG">🟢 Veg</option>
              <option value="JAIN">🟡 Jain</option>
              <option value="VEGAN">🌱 Vegan</option>
              <option value="NON_VEG">🔴 Non-Veg</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Spice Level</label>
            <select
              value={spiceLevel}
              onChange={(e) => setSpiceLevel(e.target.value as SpiceLevel)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            >
              <option value="NONE">Mild / Non-Spicy</option>
              <option value="MILD">Mild</option>
              <option value="MEDIUM">Medium Spice</option>
              <option value="SPICY">Spicy 🔥</option>
              <option value="EXTRA_SPICY">Extra Spicy 🔥🔥</option>
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Dish Description</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Rich tomato cashew gravy with cottage cheese cubes & aromatic spices"
            className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#E66817]"
          />
        </div>

        {/* Customization & Modifier Groups Selector */}
        <div className="p-3 bg-[#FBF9F5] border border-[#EBE6DD] rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#E66817]" />
              <span>Customization & Modifier Groups</span>
            </span>
            <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
              {modifierGroupIds.length} Attached
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Select modifier options applicable to this dish (Spice Level, Portions, Add-ons, etc.):
          </p>

          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {db.modifierGroups.map((group) => {
              const isChecked = modifierGroupIds.includes(group.id);
              return (
                <div
                  key={group.id}
                  onClick={() => {
                    setModifierGroupIds((prev) =>
                      isChecked ? prev.filter((id) => id !== group.id) : [...prev, group.id]
                    );
                  }}
                  className={`p-2.5 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                    isChecked
                      ? 'bg-[#FFF7ED] border-[#E66817] shadow-2xs'
                      : 'bg-white border-[#EBE6DD] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="w-4 h-4 rounded text-[#E66817] focus:ring-[#E66817] cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#0B253A] truncate">{group.name}</span>
                        {group.isRequired && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">
                        {group.options.map((o) => `${o.name}${o.priceDelta ? ` (+₹${o.priceDelta})` : ''}`).join(', ')}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 ${
                    isChecked ? 'bg-[#E66817] text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isChecked ? '✓ Active' : '+ Add'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Image Preview & Upload */}
        <div className="p-3 bg-[#FBF9F5] border border-[#EBE6DD] rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">Photo & Visual Asset</span>
            <button
              type="button"
              onClick={() => setIsLibraryOpen(!isLibraryOpen)}
              className="text-xs font-bold text-[#E66817] hover:underline flex items-center gap-1"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{isLibraryOpen ? 'Close Library' : 'Pick from Image Library'}</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <img
              src={imageUrl || '/assets/menu/common/fallback-dish.svg'}
              alt="Preview"
              className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0 bg-slate-100"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/assets/menu/common/fallback-dish.svg';
              }}
            />
            <div className="flex-1 space-y-1.5">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleDeviceImageUpload(f);
                }}
                className="text-xs text-slate-600 file:mr-2 file:py-1 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#0B253A] file:text-white"
              />
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Or paste direct image URL..."
                className="w-full bg-white border border-[#EBE6DD] rounded-xl px-2.5 py-1 text-[11px] font-mono"
              />
            </div>
          </div>

          {/* Quick Library Picker Drawer */}
          {isLibraryOpen && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-200 max-h-40 overflow-y-auto">
              {FOOD_IMAGE_LIBRARY.map((libImg) => (
                <img
                  key={libImg.id}
                  src={libImg.url}
                  alt={libImg.title}
                  title={libImg.title}
                  onClick={() => {
                    setImageUrl(libImg.url);
                    setIsLibraryOpen(false);
                  }}
                  className="w-full h-12 rounded-lg object-cover cursor-pointer hover:ring-2 hover:ring-[#E66817] transition-all"
                />
              ))}
            </div>
          )}
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-4 pt-1 text-xs font-bold text-slate-700">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
              className="rounded"
            />
            <span>In Stock (Available for ordering)</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isPopular}
              onChange={(e) => setIsPopular(e.target.checked)}
              className="rounded"
            />
            <span>Show "Popular" Tag</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="submit"
            className="px-4 py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            {itemToEdit ? 'Save Changes' : 'Create Dish'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
