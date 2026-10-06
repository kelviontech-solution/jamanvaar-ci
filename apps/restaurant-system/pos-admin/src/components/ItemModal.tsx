import React, { useState, useEffect, useRef } from 'react';
import { MenuItem, Category, DietaryType, SpiceLevel } from '@jamanvaar/types';
import { Modal, Button, VirtualKeyboard, type VirtualKeyboardLanguage } from '@jamanvaar/ui';
import { MenuRepository, FOOD_IMAGE_LIBRARY, AuditRepository, db, KioskDisplaySettingsRepository, safeMenuImage } from '@jamanvaar/database';
import { Upload, Sparkles, Image as ImageIcon, Sliders } from 'lucide-react';

/** Mirrors kiosk-admin's KIOSK_LANGUAGE_LABELS (apps/kiosk-system/kiosk-admin/src/App.tsx:234-242). */
const KIOSK_LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  hi: 'हिन्दी (Hindi)',
  gu: 'ગુજરાતી (Gujarati)',
  mr: 'मराठी (Marathi)',
  ta: 'தமிழ் (Tamil)',
  te: 'తెలుగు (Telugu)',
  kn: 'ಕನ್ನಡ (Kannada)'
};

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
  const [subcategory, setSubcategory] = useState('');
  const [tags, setTags] = useState('');
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
  const [taxGroupId, setTaxGroupId] = useState('');
  const [sellOnQr, setSellOnQr] = useState(true);
  const [sortOrder, setSortOrder] = useState('');
  const [minQuantity, setMinQuantity] = useState('1');
  const [maxQuantity, setMaxQuantity] = useState('50');
  const [allowInstructions, setAllowInstructions] = useState(true);
  const [formError, setFormError] = useState('');
  const [translations, setTranslations] = useState<Record<string, { name: string; description: string }>>({});
  const [activeKeyboardField, setActiveKeyboardField] = useState<{ lang: VirtualKeyboardLanguage; field: 'name' | 'description' } | null>(null);

  const initializedForm = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) { initializedForm.current = null; return; }
    const session = itemToEdit?.id ?? 'new';
    if (initializedForm.current === session) return;
    initializedForm.current = session;
    if (itemToEdit) {
      setName(itemToEdit.name);
      setSku(itemToEdit.sku); setSubcategory(itemToEdit.subcategory || ''); setTags((itemToEdit.tags || []).join('; '));
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
      setTaxGroupId(itemToEdit.taxGroupId || '');
      setSellOnQr(itemToEdit.salesChannels ? itemToEdit.salesChannels.includes('QR') : itemToEdit.isQrOrderingEnabled !== false);
      setSortOrder(String(itemToEdit.sortOrder ?? ''));
      setMinQuantity(String(itemToEdit.minQuantity ?? 1));
      setMaxQuantity(String(itemToEdit.maxQuantity ?? 50));
      setAllowInstructions(itemToEdit.allowInstructions !== false);
      setTranslations(
        Object.fromEntries(
          Object.entries(itemToEdit.translations ?? {}).map(([code, t]) => [code, { name: t.name, description: t.description ?? '' }])
        )
      );
    } else {
      setName(''); setSubcategory(''); setTags('');
      setSku(`SKU-${Math.floor(100 + Math.random() * 900)}`);
      setPrice('');
      setCategoryId(categories[0]?.id || '');
      setKitchenStation('Main Kitchen');
      setDietaryType('VEG');
      setSpiceLevel('NONE');
      setDescription('');
      setImageUrl('/assets/menu/common/fallback-dish.svg');
      setIsAvailable(true);
      setIsPopular(false);
      setIsFeatured(false);
      // A new dish starts with NO customisations: the restaurant attaches the ones that belong to it.
      setModifierGroupIds([]);
      const activeTax = db.taxGroups.filter((t) => t.isActive);
      setTaxGroupId(activeTax.length === 1 ? activeTax[0].id : '');
      setSellOnQr(true);
      setSortOrder('');
      setMinQuantity('1');
      setMaxQuantity('50');
      setAllowInstructions(true);
      setTranslations({});
    }
  }, [itemToEdit, categories, isOpen]);

  const handleDeviceImageUpload = (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setFormError('Choose a PNG, JPEG or WebP under 2MB.'); return; }
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
    reader.onerror = () => setFormError('Could not read this image.');
    reader.readAsDataURL(file);
  };

  // B2-039: none of these had any validation — a blank (whitespace-only) name, a duplicate name,
  // a ₹9,99,99,999 price and raw HTML in the name were all accepted, none refused, no message on
  // any. React escapes the name on screen, so nothing executes there, but the raw string is still
  // stored and synced to receipts/KOTs/printers, which don't get that same escaping for free.
  const MAX_DISH_PRICE = 100000; // no real dish costs more; catches the fat-finger ₹9,99,99,999 case
  const MAX_NAME_LENGTH = 80;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!safeMenuImage(imageUrl)) { setFormError('Use an HTTP(S), local asset or raster image URL.'); return; }
    const trimmedName = name.trim();
    if (!trimmedName || !price) {
      setFormError('Dish name and price are required.');
      return;
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      setFormError(`Dish name is too long — keep it under ${MAX_NAME_LENGTH} characters.`);
      return;
    }
    if (/[<>]/.test(trimmedName)) {
      setFormError('Dish name cannot contain < or > characters.');
      return;
    }

    if (!categoryId) {
      setFormError('Create a category first, then choose it for this dish.');
      return;
    }
    const minQ = Math.floor(Number(minQuantity) || 1);
    const maxQ = Math.floor(Number(maxQuantity) || 50);
    if (minQ < 1 || maxQ < minQ || maxQ > 50) {
      setFormError('Quantity limits must satisfy 1 ≤ minimum ≤ maximum ≤ 50.');
      return;
    }
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      setFormError('Price must be a number greater than zero.');
      return;
    }
    if (numPrice > MAX_DISH_PRICE) {
      setFormError(`Price is unrealistically large — enter a value under ₹${MAX_DISH_PRICE.toLocaleString('en-IN')}.`);
      return;
    }

    // Only a NEW name can clash: saving a dish whose name did not change (a price edit, say) must never be blocked by another record
    // that happens to share it.
    const nameChanged = !itemToEdit || MenuRepository.normalizeDishName(itemToEdit.name) !== MenuRepository.normalizeDishName(trimmedName);
    const nameCollision = nameChanged
      ? db.menuItems.find((i) => MenuRepository.normalizeDishName(i.name) === MenuRepository.normalizeDishName(trimmedName) && i.id !== itemToEdit?.id && !i.archivedAt && i.categoryId === categoryId)
      : undefined;
    if (nameCollision) {
      setFormError(`"${trimmedName}" already exists on the menu — edit that dish instead of creating a duplicate.`);
      return;
    }

    // Empty translation fields are never saved -- only a language the admin actually typed a
    // name for (matches kiosk-admin's handleCreateMenuItem, the reference implementation).
    const cleanedTranslations: MenuItem['translations'] = {};
    for (const [code, t] of Object.entries(translations)) {
      if (t.name.trim()) cleanedTranslations[code] = { name: t.name.trim(), description: t.description.trim() || undefined };
    }
    const translationsToSave = Object.keys(cleanedTranslations).length > 0 ? cleanedTranslations : undefined;

    if (itemToEdit) {
      MenuRepository.updateMenuItem(itemToEdit.id, {
        name: trimmedName,
        sku, subcategory: subcategory.trim() || undefined, tags: tags.split(';').map(t => t.trim()).filter(Boolean),
        price: numPrice,
        categoryId,
        kitchenStation: kitchenStation.trim() || 'Main Kitchen',
        dietaryType,
        spiceLevel,
        description,
        imageUrl,
        isAvailable,
        isPopular,
        isFeatured,
        taxGroupId: taxGroupId || undefined,
        isQrOrderingEnabled: sellOnQr,
        ...(itemToEdit?.salesChannels ? { salesChannels: (sellOnQr ? Array.from(new Set([...itemToEdit.salesChannels, 'QR'])) : itemToEdit.salesChannels.filter((c) => c !== 'QR')) as MenuItem['salesChannels'] } : {}),
        minQuantity: minQ,
        maxQuantity: maxQ,
        allowInstructions,
        ...(sortOrder.trim() !== '' && Number.isFinite(Number(sortOrder)) ? { sortOrder: Number(sortOrder) } : {}),
        modifierGroupIds,
        translations: translationsToSave
      });
      AuditRepository.log({
        action: 'MENU_ITEM_UPDATED',
        category: 'MENU',
        details: `Updated dish "${trimmedName}" (Price: ₹${numPrice}, SKU: ${sku}, Modifiers: ${modifierGroupIds.length})`,
        username: 'Manager'
      });
    } else {
      MenuRepository.createMenuItem({
        name: trimmedName,
        sku, subcategory: subcategory.trim() || undefined, tags: tags.split(';').map(t => t.trim()).filter(Boolean),
        price: numPrice,
        categoryId: categoryId || categories[0]?.id,
        kitchenStation: kitchenStation.trim() || 'Main Kitchen',
        dietaryType,
        spiceLevel,
        description,
        imageUrl,
        isAvailable,
        isPopular,
        isFeatured,
        taxGroupId: taxGroupId || undefined,
        isQrOrderingEnabled: sellOnQr,
        minQuantity: minQ,
        maxQuantity: maxQ,
        allowInstructions,
        ...(sortOrder.trim() !== '' && Number.isFinite(Number(sortOrder)) ? { sortOrder: Number(sortOrder) } : {}),
        modifierGroupIds,
        translations: translationsToSave
      });
      AuditRepository.log({
        action: 'MENU_ITEM_CREATED',
        category: 'MENU',
        details: `Created dish "${trimmedName}" (Price: ₹${numPrice}, SKU: ${sku}, Modifiers: ${modifierGroupIds.length})`,
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
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paneer Butter Masala"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Price (₹) *</label>
            <input
              type="number"
              required
              min="1"
              max={MAX_DISH_PRICE}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 260"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-brand"
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
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Menu Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-600">Subcategory<input aria-label="Dish subcategory" maxLength={120} value={subcategory} onChange={e => setSubcategory(e.target.value)} className="block w-full border p-2 rounded-xl" /></label><label className="text-xs font-bold text-slate-600">Food tags (separate with semicolons)<input aria-label="Dish tags" value={tags} onChange={e => setTags(e.target.value)} className="block w-full border p-2 rounded-xl" /></label></div>
        {/* Station & Dietary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Kitchen Station</label>
            {/* Any station name works; the ones already on the menu are suggested. The KDS screens list exactly these. */}
            <input
              list="kitchen-station-options"
              value={kitchenStation}
              onChange={(e) => setKitchenStation(e.target.value)}
              placeholder="e.g. Main Kitchen, Tandoor, Bar"
              maxLength={40}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            />
            <datalist id="kitchen-station-options">
              {Array.from(new Set(['Main Kitchen', ...db.menuItems.map((m) => (m.kitchenStation || '').trim()).filter(Boolean)])).map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Dietary Type</label>
            <select
              value={dietaryType}
              onChange={(e) => setDietaryType(e.target.value as DietaryType)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            >
              <option value="VEG">Veg</option>
              <option value="JAIN">Jain</option>
              <option value="VEGAN">Vegan</option>
              <option value="NON_VEG">Non-Veg</option><option value="EGG">Egg</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Spice Level</label>
            <select
              value={spiceLevel}
              onChange={(e) => setSpiceLevel(e.target.value as SpiceLevel)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
            >
              <option value="NONE">Mild / Non-Spicy</option>
              <option value="MILD">Mild</option>
              <option value="MEDIUM">Medium Spice</option>
              <option value="SPICY">Spicy </option>
              <option value="EXTRA_SPICY">Extra Spicy </option>
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
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand"
          />
        </div>

        {/* Tax, QR ordering and ordering rules: the restaurant decides these per dish; nothing is assumed. */}
        <div className="p-3 bg-jaman-ivory border border-jaman-border rounded-2xl space-y-3">
          <span className="text-xs font-bold text-slate-700">Tax, QR ordering &amp; rules</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Tax group</label>
              <select value={taxGroupId} onChange={(e) => setTaxGroupId(e.target.value)} className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs">
                <option value="">No tax (0%)</option>
                {db.taxGroups.filter((t) => t.isActive || t.id === taxGroupId).map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.igstPercent || t.cgstPercent + t.sgstPercent}%{t.isInclusive ? ', included in price' : ', added on top'})</option>
                ))}
              </select>
              {db.taxGroups.length === 0 && <p className="text-[11px] text-amber-600 mt-1">No tax groups yet. Add one under Menu → Customisations &amp; Tax.</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Position in menu (lower shows first)</label>
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} placeholder="Automatic" className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Guests may order</label>
              <div className="flex items-center gap-2 text-xs">
                <input type="number" min={1} max={50} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} className="w-16 bg-white border border-jaman-border rounded-lg px-2 py-1.5" />
                <span>to</span>
                <input type="number" min={1} max={50} value={maxQuantity} onChange={(e) => setMaxQuantity(e.target.value)} className="w-16 bg-white border border-jaman-border rounded-lg px-2 py-1.5" />
                <span>at a time</span>
              </div>
            </div>
            <div className="space-y-1.5 text-xs">
              <label className="flex items-center gap-2"><input type="checkbox" checked={sellOnQr} onChange={(e) => setSellOnQr(e.target.checked)} /> Sell this dish through QR ordering</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={allowInstructions} onChange={(e) => setAllowInstructions(e.target.checked)} /> Let guests add a cooking note</label>
            </div>
          </div>
        </div>

        {/* Customization & Modifier Groups Selector */}
        <div className="p-3 bg-jaman-ivory border border-jaman-border rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              <span>Customization & Modifier Groups</span>
            </span>
            <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
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
                      ? 'bg-[#FFF7ED] border-brand shadow-2xs'
                      : 'bg-white border-jaman-border hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="w-4 h-4 rounded text-brand focus:ring-brand cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-jaman-navy truncate">{group.name}</span>
                        {group.isRequired && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {group.options.map((o) => `${o.name}${o.priceDelta ? ` (+₹${o.priceDelta})` : ''}`).join(', ')}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                    isChecked ? 'bg-brand text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isChecked ? 'Active' : '+ Add'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Image Preview & Upload */}
        <div className="p-3 bg-jaman-ivory border border-jaman-border rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">Photo & Visual Asset</span>
            <button
              type="button"
              onClick={() => setIsLibraryOpen(!isLibraryOpen)}
              className="text-xs font-bold text-brand hover:underline flex items-center gap-1"
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
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleDeviceImageUpload(f);
                }}
                className="text-xs text-slate-600 file:mr-2 file:py-1 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-jaman-navy file:text-white"
              />
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Or paste direct image URL..."
                className="w-full bg-white border border-jaman-border rounded-xl px-2.5 py-1 text-[11px] font-mono"
              />
              <button type="button" onClick={() => setImageUrl('')} className="text-xs text-rose-700">Remove Image</button>
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
                  className="w-full h-12 rounded-lg object-cover cursor-pointer hover:ring-2 hover:ring-brand transition-all"
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

        {/* Admin writes these by hand; nothing auto-translates. Before this, there was no way at
            all to set these, so every admin-added dish showed only in English on the customer
            kiosk regardless of selected language. The keyboard button opens a phonetic on-screen
            keyboard for admins without a native-script keyboard. */}
        <div className="pt-2 border-t border-slate-200 space-y-3">
          <p className="text-xs font-bold text-slate-600">Translations (optional, shown when a customer selects that language)</p>

          {KioskDisplaySettingsRepository.getSettings().enabledLanguages.filter((code) => code !== 'en').length === 0 && (
            <p className="text-xs text-[#64748B]">No other languages are enabled on this kiosk yet — turn one on from Restaurant Settings → Customer Kiosk Language to add a translation here.</p>
          )}

          {KioskDisplaySettingsRepository.getSettings().enabledLanguages.filter((code) => code !== 'en').map((code) => {
            const lang = code as VirtualKeyboardLanguage;
            const current = translations[lang] ?? { name: '', description: '' };
            const setCurrent = (next: Partial<{ name: string; description: string }>) =>
              setTranslations((prev) => ({ ...prev, [lang]: { ...current, ...next } }));
            return (
              <div key={lang} className="space-y-2 p-3 bg-jaman-ivory rounded-xl border border-jaman-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-600">{KIOSK_LANGUAGE_LABELS[lang]} Name</label>
                  <button
                    type="button"
                    onClick={() => setActiveKeyboardField({ lang, field: 'name' })}
                    className="text-[11px] font-bold text-brand px-2 py-0.5 rounded-md border border-brand/30 hover:bg-brand/[0.07]"
                  >
                    ⌨ Keyboard
                  </button>
                </div>
                <input
                  type="text"
                  value={current.name}
                  onChange={(e) => setCurrent({ name: e.target.value })}
                  placeholder={`${KIOSK_LANGUAGE_LABELS[lang]} dish name`}
                  className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-sm focus:outline-none"
                />
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-600">{KIOSK_LANGUAGE_LABELS[lang]} Description</label>
                  <button
                    type="button"
                    onClick={() => setActiveKeyboardField({ lang, field: 'description' })}
                    className="text-[11px] font-bold text-brand px-2 py-0.5 rounded-md border border-brand/30 hover:bg-brand/[0.07]"
                  >
                    ⌨ Keyboard
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={current.description}
                  onChange={(e) => setCurrent({ description: e.target.value })}
                  className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            );
          })}
        </div>

        {formError && (
          <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {formError}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="submit"
            className="px-4 py-2 bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            {itemToEdit ? 'Save Changes' : 'Create Dish'}
          </button>
        </div>
      </form>

      {/* Phonetic virtual keyboard for the translation fields above — bound to whichever
          language/field was last opened. */}
      {activeKeyboardField && (
        <VirtualKeyboard
          language={activeKeyboardField.lang}
          value={(translations[activeKeyboardField.lang] ?? { name: '', description: '' })[activeKeyboardField.field]}
          onChange={(next) =>
            setTranslations((prev) => ({
              ...prev,
              [activeKeyboardField.lang]: { ...(prev[activeKeyboardField.lang] ?? { name: '', description: '' }), [activeKeyboardField.field]: next }
            }))
          }
          onClose={() => setActiveKeyboardField(null)}
        />
      )}
    </Modal>
  );
};
