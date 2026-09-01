import React, { useState } from 'react';
import { Modal, Button } from '@jamanvaar/ui';
import { PREBUILT_MENU_TEMPLATES, db, MenuRepository, AuditRepository } from '@jamanvaar/database';

interface PrebuiltMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}

export const PrebuiltMenuModal: React.FC<PrebuiltMenuModalProps> = ({
  isOpen,
  onClose,
  onImported
}) => {
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(['tpl-north-indian', 'tpl-gujarati']);
  const [importMode, setImportMode] = useState<'ADD' | 'REPLACE'>('ADD');

  const handleToggleTemplate = (id: string) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((tId) => tId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedTemplateIds.length === PREBUILT_MENU_TEMPLATES.length) {
      setSelectedTemplateIds([]);
    } else {
      setSelectedTemplateIds(PREBUILT_MENU_TEMPLATES.map((t) => t.id));
    }
  };

  const handleImport = () => {
    const tpls = PREBUILT_MENU_TEMPLATES.filter((t) => selectedTemplateIds.includes(t.id));
    if (tpls.length === 0) return;

    if (importMode === 'REPLACE') {
      db.menuItems = [];
      db.categories = [];
    }

    let addedItemsCount = 0;
    tpls.forEach((tpl) => {
      tpl.categories.forEach((cat: any) => {
        let existingCat = db.categories.find((c) => c.name.toLowerCase() === cat.name.toLowerCase());
        if (!existingCat) {
          existingCat = {
            id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: cat.name,
            slug: cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            iconName: 'UtensilsCrossed',
            sortOrder: db.categories.length + 1,
            isActive: true
          };
          db.categories.push(existingCat);
        }

        cat.items.forEach((it: any) => {
          MenuRepository.createMenuItem({
            name: it.name,
            sku: it.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
            price: it.suggestedPrice || 220,
            categoryId: existingCat!.id,
            description: it.description || '',
            dietaryType: it.dietaryType || 'VEG',
            spiceLevel: it.spiceLevel || 'NONE',
            imageUrl: it.imageUrl || '/assets/menu/common/fallback-dish.svg',
            kitchenStation: it.station || 'Main Kitchen',
            isAvailable: true
          });
          addedItemsCount++;
        });
      });
    });

    AuditRepository.log({
      action: 'PRELOADED_MENU_IMPORTED',
      category: 'MENU',
      details: `Imported ${addedItemsCount} dishes from ${tpls.length} templates (${importMode} mode)`,
      username: 'Manager'
    });

    db.notify();
    onImported(addedItemsCount);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${PREBUILT_MENU_TEMPLATES.length} Preloaded Starter Menu Templates`} maxWidth="2xl">
      <div className="space-y-4 py-1">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Select one or more restaurant cuisines to import prebuilt categories, items, and pricing:
          </p>
          <button
            onClick={handleSelectAll}
            className="text-xs font-bold text-[#E66817] hover:underline"
          >
            {selectedTemplateIds.length === PREBUILT_MENU_TEMPLATES.length ? 'Deselect All' : `Select All ${PREBUILT_MENU_TEMPLATES.length}`}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
          {PREBUILT_MENU_TEMPLATES.map((tpl) => {
            const isSelected = selectedTemplateIds.includes(tpl.id);
            return (
              <div
                key={tpl.id}
                onClick={() => handleToggleTemplate(tpl.id)}
                className={`p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-[#E66817] bg-[#FFF4ED]'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-[#0B253A] block">{tpl.name}</span>
                  {isSelected && <span className="text-xs text-[#E66817] font-black">✓</span>}
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {tpl.approxItemCount || 20} dishes • {tpl.cuisine}
                </span>
              </div>
            );
          })}
        </div>

        {/* Import Mode */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
          <span className="font-bold text-amber-900">Import Mode:</span>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 font-bold cursor-pointer text-slate-700">
              <input
                type="radio"
                name="impMode"
                checked={importMode === 'ADD'}
                onChange={() => setImportMode('ADD')}
              />
              Add to Existing Menu
            </label>
            <label className="flex items-center gap-1.5 font-bold cursor-pointer text-rose-700">
              <input
                type="radio"
                name="impMode"
                checked={importMode === 'REPLACE'}
                onChange={() => setImportMode('REPLACE')}
              />
              Replace Entire Menu
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <button
            disabled={selectedTemplateIds.length === 0}
            onClick={handleImport}
            className="px-4 py-2 bg-[#E66817] hover:bg-[#EA580C] disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            Import Selected ({selectedTemplateIds.length} Cuisines)
          </button>
        </div>
      </div>
    </Modal>
  );
};
