import React, { useState, useEffect, useMemo } from 'react';
import { MenuItem } from '@jamanvaar/types';
import { db, MenuRepository } from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';
import { X, Check, UtensilsCrossed, Image as ImageIcon } from 'lucide-react';

interface QrDishConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem | null;
  onSave?: (updatedItem: MenuItem) => void;
}

export const QrDishConfigModal: React.FC<QrDishConfigModalProps> = ({
  isOpen,
  onClose,
  item,
  onSave
}) => {
  // NOTE: every hook must run on every render - an early `return null` above these
  // used to change the hook count between renders and crash React.
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [price, setPrice] = useState<number>(0);
  const [isDigitalMenuVisible, setIsDigitalMenuVisible] = useState<boolean>(true);
  const [isQrOrderingEnabled, setIsQrOrderingEnabled] = useState<boolean>(true);
  const [isKioskEnabled, setIsKioskEnabled] = useState<boolean>(true);
  const [kitchenStation, setKitchenStation] = useState<string>('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Re-seed the form from the canonical record whenever a different dish is opened
  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setDescription(item.description || '');
    setPrice(item.price);
    setIsDigitalMenuVisible(item.isDigitalMenuVisible ?? true);
    setIsQrOrderingEnabled(item.isQrOrderingEnabled ?? true);
    setIsKioskEnabled(item.isKioskEnabled ?? true);
    setKitchenStation(item.kitchenStation || '');
    setSaveError(null);
  }, [item?.id, isOpen]);

  /** Routing stations actually in use across the canonical menu, plus the item's own. */
  const kitchenStations = useMemo(() => {
    const set = new Set<string>();
    db.menuItems.forEach((m) => {
      if (m.kitchenStation) set.add(m.kitchenStation);
    });
    if (item?.kitchenStation) set.add(item.kitchenStation);
    return Array.from(set).sort();
  }, [item?.id, isOpen]);

  if (!isOpen || !item) return null;

  const handleSave = () => {
    if (!name.trim()) {
      setSaveError('Dish name cannot be empty.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setSaveError('Enter a valid price.');
      return;
    }

    // Persist through the canonical repository, then render back what it returns
    const updated = MenuRepository.updateMenuItem(item.id, {
      name: name.trim(),
      description,
      price,
      isDigitalMenuVisible,
      isQrOrderingEnabled,
      isKioskEnabled,
      kitchenStation: kitchenStation || undefined
    });

    if (!updated) {
      setSaveError('This dish is no longer on the canonical menu. Refresh and try again.');
      return;
    }

    if (onSave) onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#FAF7F2] border border-[#EBE6DD] w-full max-w-lg rounded-3xl shadow-2xl flex flex-col overflow-hidden text-[#0B253A]">
        {/* Header */}
        <div className="bg-[#0B253A] text-white px-5 py-4 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#E66817]/20 border border-[#E66817]/40 flex items-center justify-center text-[#E66817]">
              <UtensilsCrossed className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wide">Configure Digital Menu Item</h2>
              <p className="text-[11px] text-slate-300">Set pricing, visibility and channel controls</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 max-h-[75vh]">
          {/* Item Top Preview */}
          <div className="flex items-center gap-3 p-3 bg-white border border-[#EBE6DD] rounded-2xl shadow-2xs">
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.sku}</span>
              <h3 className="font-black text-sm text-[#0B253A]">{name}</h3>
              <span className="font-mono font-black text-xs text-[#E66817]">{formatINR(price)}</span>
            </div>
          </div>

          {/* Dish Name */}
          <div className="space-y-1">
            <label className="text-xs font-black text-[#0B253A]">Dish Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold text-[#0B253A] focus:outline-none focus:border-[#E66817]"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-black text-[#0B253A]">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-white border border-[#EBE6DD] rounded-xl p-2.5 text-xs text-[#0B253A] focus:outline-none focus:border-[#E66817]"
            />
          </div>

          {/* Price & Kitchen Station */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-black text-[#0B253A]">Price (₹)</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full bg-white border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-mono font-black text-[#0B253A] focus:outline-none focus:border-[#E66817]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-[#0B253A]">Kitchen Routing Station</label>
              <select
                value={kitchenStation}
                onChange={(e) => setKitchenStation(e.target.value)}
                className="w-full bg-white border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold text-[#0B253A] focus:outline-none focus:border-[#E66817] cursor-pointer"
              >
                <option value="">Unassigned</option>
                {kitchenStations.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Channel & Visibility Toggles */}
          <div className="bg-white border border-[#EBE6DD] rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
            <h4 className="text-xs font-black text-[#0B253A] uppercase tracking-wider">Channel Availability</h4>

            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-[#0B253A] block">Digital Menu Visibility</span>
                <span className="text-[10px] text-slate-400">Display item on QR customer menu</span>
              </div>
              <input
                type="checkbox"
                checked={isDigitalMenuVisible}
                onChange={(e) => setIsDigitalMenuVisible(e.target.checked)}
                className="w-4 h-4 text-[#E66817] rounded cursor-pointer accent-[#E66817]"
              />
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-[#0B253A] block">QR Ordering Allowed</span>
                <span className="text-[10px] text-slate-400">Allow table customers to order this item</span>
              </div>
              <input
                type="checkbox"
                checked={isQrOrderingEnabled}
                onChange={(e) => setIsQrOrderingEnabled(e.target.checked)}
                className="w-4 h-4 text-[#E66817] rounded cursor-pointer accent-[#E66817]"
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <span className="text-xs font-bold text-[#0B253A] block">Kiosk Touch Ordering</span>
                <span className="text-[10px] text-slate-400">Show item on Self-Order Kiosks</span>
              </div>
              <input
                type="checkbox"
                checked={isKioskEnabled}
                onChange={(e) => setIsKioskEnabled(e.target.checked)}
                className="w-4 h-4 text-[#E66817] rounded cursor-pointer accent-[#E66817]"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-white border-t border-[#EBE6DD] p-4 flex items-center justify-end gap-2.5 shrink-0 flex-wrap">
          {saveError && (
            <span className="text-[11px] font-bold text-rose-600 mr-auto">{saveError}</span>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white text-xs font-black shadow-md shadow-[#E66817]/30 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save Configuration</span>
          </button>
        </div>
      </div>
    </div>
  );
};
