import React, { useState, useEffect } from 'react';
import { MenuItem, InventoryItem, Recipe, RecipeIngredient } from '@jamanvaar/types';
import { Modal, Button, useConfirm } from '@jamanvaar/ui';
import { RecipeRepository, convertQuantity } from '@jamanvaar/database';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';

/**
 * #5: ing.unit always mirrors the chosen inventory item's own unit here (handleIngredientChange
 * forces it, and there is no separate unit field to type a mismatched one into) -- a recipe and
 * its inventory item can never disagree on unit through this screen. The real, reachable mistake
 * is magnitude: a quantityPerPortion fat-fingered at the wrong scale for that unit (typing "500"
 * meaning grams while the item is tracked in kg, i.e. 500 kg of one ingredient in a single
 * portion). Normalizes through the same convertQuantity table stock deduction already trusts,
 * so this never invents its own notion of "how much is a kg".
 */
function quantitySanityIssue(ing: RecipeIngredient): string | null {
  const grams = convertQuantity(ing.quantityPerPortion, ing.unit, 'g');
  if (grams !== null) {
    if (grams > 10000) return `${ing.quantityPerPortion} ${ing.unit} per portion is ${(grams / 1000).toFixed(1)} kg -- unusually large for a single dish. Did you mean a smaller unit (e.g. grams instead of kg)?`;
    if (grams > 0 && grams < 0.5) return `${ing.quantityPerPortion} ${ing.unit} per portion is under half a gram -- unusually small. Did you mean a larger unit (e.g. kg instead of grams)?`;
    return null;
  }
  const ml = convertQuantity(ing.quantityPerPortion, ing.unit, 'ml');
  if (ml !== null) {
    if (ml > 10000) return `${ing.quantityPerPortion} ${ing.unit} per portion is ${(ml / 1000).toFixed(1)} litres -- unusually large for a single dish. Did you mean a smaller unit (e.g. ml instead of litres)?`;
    if (ml > 0 && ml < 0.5) return `${ing.quantityPerPortion} ${ing.unit} per portion is under half a ml -- unusually small. Did you mean a larger unit (e.g. litres instead of ml)?`;
    return null;
  }
  const pcs = convertQuantity(ing.quantityPerPortion, ing.unit, 'pcs');
  if (pcs !== null && pcs > 200) return `${ing.quantityPerPortion} ${ing.unit} per portion is unusually high for a count unit.`;
  return null;
}

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
  const { confirm, confirmDialog } = useConfirm();

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

  const quantityIssues = ingredients.map(quantitySanityIssue);
  // #5: the magnitude check above is unit-agnostic (it would not catch a genuinely overpriced
  // inventory item costed correctly), so cost-vs-selling-price is a second, independent signal
  // that also catches a wrong costPerUnit on the inventory item itself, not just a wrong quantity.
  const costExceedsPrice = !!selectedDish && selectedDish.price > 0 && calculatedCost > selectedDish.price * 3;

  const handleSubmit = async (e: React.FormEvent) => {
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

    const realIssues = quantityIssues.filter((i): i is string => !!i);
    if (realIssues.length || costExceedsPrice) {
      const lines = [
        ...realIssues,
        ...(costExceedsPrice ? [`Estimated ingredient cost (₹${calculatedCost.toFixed(2)}) is more than 3x this dish's selling price (₹${dish.price}) -- check quantities and ingredient costs.`] : [])
      ];
      if (!(await confirm({
        title: 'Check these quantities before saving',
        message: lines.join(' '),
        confirmLabel: 'Save anyway',
        tone: 'danger'
      }))) return;
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
    <>
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
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand disabled:opacity-70"
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
              className="px-2.5 py-1 bg-brand/[0.07] border border-brand/30 text-brand font-bold text-xs rounded-lg flex items-center gap-1 hover:bg-[#FFE8D6]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Raw Ingredient</span>
            </button>
          </div>

          {ingredients.length === 0 ? (
            <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-500">
              No ingredients added yet. Click "+ Add Raw Ingredient" above to build the recipe formula.
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {ingredients.map((ing, idx) => (
                <div key={idx}>
                  <div className="p-2.5 bg-jaman-ivory border border-jaman-border rounded-xl flex items-center gap-2">
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
                  {quantityIssues[idx] && (
                    <p className="mt-1 ml-1 text-[11px] font-bold text-amber-700 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {quantityIssues[idx]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cost vs Price Summary Ribbon */}
        {selectedDish && (
          <div className={`p-3 rounded-2xl flex items-center justify-between text-xs border ${costExceedsPrice ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-200'}`}>
            <div>
              <span className={`font-bold ${costExceedsPrice ? 'text-amber-800' : 'text-emerald-800'}`}>Estimated Cost of Ingredients:</span>
              <span className={`tabular-nums font-bold ml-2 ${costExceedsPrice ? 'text-amber-900' : 'text-emerald-950'}`}>₹{calculatedCost.toFixed(2)}</span>
            </div>
            <div>
              <span className={`font-bold ${costExceedsPrice ? 'text-amber-800' : 'text-emerald-800'}`}>Dish Selling Price:</span>
              <span className="tabular-nums font-bold text-jaman-navy ml-2">₹{selectedDish.price}</span>
            </div>
          </div>
        )}
        {costExceedsPrice && (
          <p className="text-[11px] font-bold text-amber-700 flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> Ingredient cost is more than 3x the selling price — check quantities and ingredient costs before saving.
          </p>
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
            className="min-h-11 px-4 py-2 bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-sm rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50"
          >
            Save Recipe Formula
          </button>
        </div>
      </form>
    </Modal>
    {confirmDialog}
    </>
  );
};
