import React, { useState, useEffect } from 'react';
import { InventoryItem } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { InventoryRepository } from '@jamanvaar/database';

const MAX_STOCK_QUANTITY = 1_000_000;

/**
 * B2-044: the form auto-filled `RAW-` + a random 3-digit number (900 possible values —
 * collisions start at ~35 items, confirmed live: two items both got `RAW-525`). Widened to 4
 * digits (9,000 values) and, more importantly, actually checks it's unique against every
 * existing item's SKU before accepting it, regenerating on a collision instead of trusting the
 * odds.
 */
function generateUniqueSku(): string {
  const existing = new Set(InventoryRepository.getAllItems().map((i) => i.sku));
  let candidate: string;
  let attempts = 0;
  do {
    candidate = `RAW-${Math.floor(1000 + Math.random() * 9000)}`;
    attempts++;
  } while (existing.has(candidate) && attempts < 50);
  return candidate;
}

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemToEdit: InventoryItem | null;
  onSaved: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  isOpen,
  onClose,
  itemToEdit,
  onSaved
}) => {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('Dairy');
  const [unit, setUnit] = useState('kg');
  const [currentStock, setCurrentStock] = useState('10');
  const [minStockLevel, setMinStockLevel] = useState('3');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [costPerUnit, setCostPerUnit] = useState('100');
  const [supplierName, setSupplierName] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (itemToEdit) {
      setName(itemToEdit.name);
      setSku(itemToEdit.sku);
      setCategory(itemToEdit.category);
      setUnit(itemToEdit.unit);
      setCurrentStock(itemToEdit.currentStock.toString());
      setMinStockLevel(itemToEdit.minStockLevel.toString());
      setReorderLevel(itemToEdit.reorderLevel.toString());
      setCostPerUnit(itemToEdit.costPerUnit.toString());
      setSupplierName(itemToEdit.supplierName || '');
    } else {
      setName('');
      setSku(generateUniqueSku());
      setCategory('Dairy');
      setUnit('kg');
      setCurrentStock('10');
      setMinStockLevel('3');
      setReorderLevel('5');
      setCostPerUnit('100');
      setSupplierName('');
    }
  }, [itemToEdit, isOpen]);

  // B2-044: none of these seven inputs (name, cost, stock, threshold) had any validation at all
  // — negative stock, negative cost, a 1,000,000,000,000-unit quantity and a duplicate item name
  // were all accepted, none refused, no message on any. Every rule below is a real, live-confirmed
  // gap, not a guess: the repository itself (InventoryRepository.createItem/updateItem) enforces
  // the same numeric limits as a second, independent layer — this pre-check exists purely so the
  // cashier sees exactly *which* field is wrong, immediately, instead of a generic failure.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name || !costPerUnit) {
      setFormError('Item name and cost per unit are required.');
      return;
    }

    const stockNum = parseFloat(currentStock);
    const minNum = parseFloat(minStockLevel);
    const reorderNum = parseFloat(reorderLevel);
    const costNum = parseFloat(costPerUnit);

    if (!Number.isFinite(stockNum) || stockNum < 0) {
      setFormError('Current stock cannot be negative.');
      return;
    }
    if (stockNum > MAX_STOCK_QUANTITY) {
      setFormError(`Current stock is unrealistically large — enter a value under ${MAX_STOCK_QUANTITY.toLocaleString('en-IN')}.`);
      return;
    }
    if (!Number.isFinite(minNum) || minNum < 0) {
      setFormError('Min threshold cannot be negative.');
      return;
    }
    if (!Number.isFinite(reorderNum) || reorderNum < 0) {
      setFormError('Reorder level cannot be negative.');
      return;
    }
    if (!Number.isFinite(costNum) || costNum < 0) {
      setFormError('Cost per unit cannot be negative.');
      return;
    }

    // A duplicate item name is almost never intentional — it just splits one ingredient's real
    // stock across two untracked records (confirmed live: two separate "QA Paneer" items).
    const nameCollision = InventoryRepository.getAllItems().find(
      (i) => i.name.trim().toLowerCase() === name.trim().toLowerCase() && i.id !== itemToEdit?.id
    );
    if (nameCollision) {
      setFormError(`"${name}" already exists in inventory (${nameCollision.currentStock} ${nameCollision.unit} in stock) — edit that item instead of creating a duplicate.`);
      return;
    }

    const payload = {
      name,
      sku,
      category,
      unit,
      currentStock: stockNum,
      minStockLevel: minNum,
      reorderLevel: reorderNum,
      costPerUnit: costNum,
      supplierName
    };

    const saved = itemToEdit
      ? InventoryRepository.updateItem(itemToEdit.id, payload)
      : InventoryRepository.createItem(payload);

    if (!saved) {
      setFormError('Could not save this item — check the SKU is not already in use on another item.');
      return;
    }

    onSaved();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={itemToEdit ? `Edit Stock Item: ${itemToEdit.name}` : 'Add New Inventory Raw Ingredient'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Item Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fresh Malai Paneer"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Raw SKU Code</label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. RAW-PAN-01"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
            >
              <option value="Dairy">Dairy & Cheese</option>
              <option value="Grains & Pulses">Grains & Pulses</option>
              <option value="Vegetables">Fresh Vegetables</option>
              <option value="Spices & Oils">Spices & Cooking Oils</option>
              <option value="Beverage Raw">Beverage Raw Materials</option>
              <option value="Packaging">Packaging & Disposables</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Stock Unit of Measurement</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
            >
              <option value="kg">kg (Kilograms)</option>
              <option value="g">g (Grams)</option>
              <option value="L">L (Litres)</option>
              <option value="ml">ml (Millilitres)</option>
              <option value="pcs">pcs (Pieces / Units)</option>
              <option value="packets">packets (Packets)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Current Stock ({unit})</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max={MAX_STOCK_QUANTITY}
              required
              value={currentStock}
              onChange={(e) => setCurrentStock(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Min Threshold ({unit})</label>
            <input
              type="number"
              step="0.1"
              min="0"
              required
              value={minStockLevel}
              onChange={(e) => setMinStockLevel(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron"
            />
          </div>
          <div>
            {/* B2-044: this level existed on every item (`reorderLevel`) but had no input anywhere
                in this form — it was hardcoded to a fixed '5' regardless of the item's real unit,
                so "5" meant 5kg of rice and 5 saffron threads alike, and Purchasing's "Reorder &
                expiry" tab (which reads this field) was silently wrong for almost every item. */}
            <label className="block text-xs font-bold text-slate-600 mb-1">Reorder Level ({unit})</label>
            <input
              type="number"
              step="0.1"
              min="0"
              required
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Cost / Unit (₹)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              required
              value={costPerUnit}
              onChange={(e) => setCostPerUnit(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Supplier Name / Vendor (Optional)</label>
          <input
            type="text"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="e.g. Amul Dairy Direct / Metro Wholesale"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
          />
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
            {itemToEdit ? 'Save Changes' : 'Create Inventory Item'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
