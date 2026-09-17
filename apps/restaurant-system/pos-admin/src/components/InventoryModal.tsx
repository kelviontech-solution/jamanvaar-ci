import React, { useState, useEffect } from 'react';
import { InventoryItem } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { InventoryRepository } from '@jamanvaar/database';

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
      setSku(`RAW-${Math.floor(100 + Math.random() * 900)}`);
      setCategory('Dairy');
      setUnit('kg');
      setCurrentStock('10');
      setMinStockLevel('3');
      setReorderLevel('5');
      setCostPerUnit('100');
      setSupplierName('');
    }
  }, [itemToEdit, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name || !costPerUnit) {
      setFormError('Item name and cost per unit are required.');
      return;
    }

    if (itemToEdit) {
      InventoryRepository.updateItem(itemToEdit.id, {
        name,
        sku,
        category,
        unit,
        currentStock: parseFloat(currentStock) || 0,
        minStockLevel: parseFloat(minStockLevel) || 0,
        reorderLevel: parseFloat(reorderLevel) || 0,
        costPerUnit: parseFloat(costPerUnit) || 0,
        supplierName
      });
    } else {
      InventoryRepository.createItem({
        name,
        sku,
        category,
        unit,
        currentStock: parseFloat(currentStock) || 0,
        minStockLevel: parseFloat(minStockLevel) || 0,
        reorderLevel: parseFloat(reorderLevel) || 0,
        costPerUnit: parseFloat(costPerUnit) || 0,
        supplierName
      });
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

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Current Stock ({unit})</label>
            <input
              type="number"
              step="0.1"
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
              required
              value={minStockLevel}
              onChange={(e) => setMinStockLevel(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Cost / Unit (₹)</label>
            <input
              type="number"
              step="0.1"
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
