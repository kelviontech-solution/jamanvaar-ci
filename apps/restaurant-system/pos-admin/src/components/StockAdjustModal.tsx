import React, { useState } from 'react';
import { InventoryItem, StockMovement } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { InventoryRepository } from '@jamanvaar/database';

interface StockAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  onSaved: () => void;
}

export const StockAdjustModal: React.FC<StockAdjustModalProps> = ({
  isOpen,
  onClose,
  item,
  onSaved
}) => {
  const [movementType, setMovementType] = useState<StockMovement['type']>('RESTOCK');
  const [quantity, setQuantity] = useState('5');
  const [reason, setReason] = useState('Weekly wholesale purchase received');

  if (!item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return;

    let delta = qty;
    if (movementType === 'WASTE' || movementType === 'SPOILAGE') {
      delta = -qty;
    } else if (movementType === 'ADJUSTMENT') {
      // Physical count adjustment: delta is target count - current count
      delta = qty - item.currentStock;
    }

    InventoryRepository.recordMovement({
      itemId: item.id,
      itemName: item.name,
      type: movementType,
      quantityDelta: delta,
      unit: item.unit,
      costImpact: Math.abs(delta * item.costPerUnit),
      reason,
      performedBy: 'Manager'
    });

    onSaved();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Adjust Stock: ${item.name}`} maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="p-3 bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl flex justify-between text-xs">
          <div>
            <span className="text-slate-400 font-bold block">Current Stock:</span>
            <span className="font-bold text-sm text-[#0B253A] font-mono">{item.currentStock} {item.unit}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 font-bold block">Unit Cost:</span>
            <span className="font-bold text-sm text-emerald-700 font-mono">₹{item.costPerUnit}/{item.unit}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Adjustment Type</label>
          <select
            value={movementType}
            onChange={(e) => {
              const val = e.target.value as StockMovement['type'];
              setMovementType(val);
              if (val === 'RESTOCK') setReason('Supplier delivery received');
              else if (val === 'WASTE') setReason('Kitchen preparation trim / drop');
              else if (val === 'SPOILAGE') setReason('Ingredient expired / spoiled');
              else if (val === 'ADJUSTMENT') setReason('Physical stock audit reconciliation');
            }}
            className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
          >
            <option value="RESTOCK">📦 Restock / Purchase Received (+)</option>
            <option value="WASTE">🗑️ Kitchen Wastage (-)</option>
            <option value="SPOILAGE">⚠️ Spoilage / Expired (-)</option>
            <option value="ADJUSTMENT">⚖️ Physical Count Reconciliation</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">
            {movementType === 'ADJUSTMENT' ? `Exact Count Found (${item.unit})` : `Quantity (${item.unit})`}
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-[#E66817]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Reason / Notes</label>
          <input
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Invoice #9981 from dairy supplier"
            className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#E66817]"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="submit"
            className="px-4 py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            Record Movement
          </button>
        </div>
      </form>
    </Modal>
  );
};
