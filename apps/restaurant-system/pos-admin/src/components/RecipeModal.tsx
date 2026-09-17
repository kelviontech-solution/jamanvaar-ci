import React, { useState, useEffect } from 'react';
import { MenuItem, InventoryItem, Recipe, RecipeIngredient } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { RecipeRepository } from '@jamanvaar/database';
import { Plus, Trash2, Scale } from 'lucide-react';

interface RecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: MenuItem[];
  inventoryItems: InventoryItem[];
  recipeToEdit: Recipe | null;
  onSaved: () => void;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({
  isOpen,
  onClose,
  menuItems,
  inventoryItems,
  recipeToEdit,
  onSaved
}) => {
  const [menuItemId, setMenuItemId] = useState('');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (recipeToEdit) {
      setMenuItemId(recipeToEdit.menuItemId);
      setIngredients([...recipeToEdit.ingredients]);
    } else {
      setMenuItemId(menuItems[0]?.id || '');
      setIngredients([]);
    }
  }, [recipeToEdit, menuItems, isOpen]);

  const handleAddIngredient = () => {
    if (inventoryItems.length === 0) return;
    const firstInv = inventoryItems[0];
    setIngredients((prev) => [
      ...prev,
      {
        inventoryItemId: firstInv.id,
        inventoryItemName: firstInv.name,
        quantityPerPortion: 0.1,
        unit: firstInv.unit
      }
    ]);
  };

  const handleRemoveIngredient = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleIngredientChange = (idx: number, field: string, val: any) => {
    setIngredients((prev) => {
      const updated = [...prev];
      if (field === 'inventoryItemId') {
        const itm = inventoryItems.find((i) => i.id === val);
        if (itm) {
          updated[idx] = {
            ...updated[idx],
            inventoryItemId: itm.id,
            inventoryItemName: itm.name,
            unit: itm.unit
          };
        }
      } else if (field === 'quantityPerPortion') {
        updated[idx] = {
          ...updated[idx],
          quantityPerPortion: parseFloat(val) || 0
        };
      }
      return updated;
    });
  };

  const selectedDish = menuItems.find((m) => m.id === menuItemId);

  // Compute calculated portion cost based on ingredients
  const calculatedCost = ingredients.reduce((sum, ing) => {
    const inv = inventoryItems.find((i) => i.id === ing.inventoryItemId);
    const unitCost = inv?.costPerUnit || 0;
    return sum + unitCost * ing.quantityPerPortion;
  }, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!menuItemId || ingredients.length === 0) {
      setFormError('Select a dish and add at least one ingredient.');
      return;
    }
    const dish = menuItems.find((m) => m.id === menuItemId);
    if (!dish) {
      setFormError('Selected dish could not be found — pick it again from the list.');
      return;
    }

    RecipeRepository.createRecipe({
      id: recipeToEdit?.id,
      menuItemId,
      menuItemName: dish.name,
      ingredients,
      isActive: true
    });

    onSaved();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={recipeToEdit ? `Edit Recipe: ${recipeToEdit.menuItemName}` : 'Create Dish Recipe & BOM Formula'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Target Menu Dish *</label>
          <select
            disabled={!!recipeToEdit}
            value={menuItemId}
            onChange={(e) => setMenuItemId(e.target.value)}
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron disabled:opacity-70"
          >
            {menuItems.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} (Selling Price: ₹{m.price})
              </option>
            ))}
          </select>
        </div>

        {/* Ingredients Builder */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-600">Raw Ingredients & Portions per Dish</label>
            <button
              type="button"
              onClick={handleAddIngredient}
              className="px-2.5 py-1 bg-[#FFF4ED] border border-[#FDBA74] text-jaman-saffron font-bold text-xs rounded-lg flex items-center gap-1 hover:bg-[#FFE8D6]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Raw Ingredient</span>
            </button>
          </div>

          {ingredients.length === 0 ? (
            <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400">
              No ingredients added yet. Click "+ Add Raw Ingredient" above to build the recipe formula.
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {ingredients.map((ing, idx) => (
                <div key={idx} className="p-2.5 bg-jaman-ivory border border-jaman-border rounded-xl flex items-center gap-2">
                  <div className="flex-1">
                    <select
                      value={ing.inventoryItemId}
                      onChange={(e) => handleIngredientChange(idx, 'inventoryItemId', e.target.value)}
                      className="w-full bg-white border border-jaman-border rounded-lg px-2 py-1.5 text-xs font-bold"
                    >
                      {inventoryItems.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.name} (₹{inv.costPerUnit}/{inv.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28 flex items-center gap-1">
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={ing.quantityPerPortion}
                      onChange={(e) => handleIngredientChange(idx, 'quantityPerPortion', e.target.value)}
                      className="w-full bg-white border border-jaman-border rounded-lg px-2 py-1.5 text-xs font-bold font-mono text-right"
                    />
                    <span className="text-xs font-semibold text-slate-500">{ing.unit}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveIngredient(idx)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cost vs Price Summary Ribbon */}
        {selectedDish && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
            <div>
              <span className="text-emerald-800 font-bold">Estimated Cost of Ingredients:</span>
              <span className="font-mono font-black text-emerald-950 ml-2">₹{calculatedCost.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-emerald-800 font-bold">Dish Selling Price:</span>
              <span className="font-mono font-black text-jaman-navy ml-2">₹{selectedDish.price}</span>
            </div>
          </div>
        )}

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
            disabled={ingredients.length === 0}
            className="px-4 py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50"
          >
            Save Recipe Formula
          </button>
        </div>
      </form>
    </Modal>
  );
};
