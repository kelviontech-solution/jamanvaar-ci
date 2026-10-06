import React, { useState } from 'react';
import { InventoryItem, WastageReasonCode } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { InventoryRepository } from '@jamanvaar/database';
import { Camera, X } from 'lucide-react';

interface WastageLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  onSaved: () => void;
  onRequestConfirm?: (dialog: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    isDanger: boolean;
    onConfirm: () => void;
  }) => void;
}

const WASTAGE_REASONS: Array<{ code: WastageReasonCode; label: string }> = [
  { code: 'KITCHEN_PREP_TRIM', label: 'Kitchen Prep Trim' },
  { code: 'DROPPED_SPILLED', label: 'Dropped / Spilled' },
  { code: 'EXPIRED_SPOILED', label: 'Expired / Spoiled' },
  { code: 'QUALITY_REJECT', label: 'Quality Reject' },
  { code: 'CUSTOMER_RETURN', label: 'Customer Return' },
  { code: 'OTHER', label: 'Other' }
];

/**
 * Dedicated wastage-logging workflow — previously "wastage" was just one of
 * four generic types in the StockAdjustModal dropdown with a single free-text
 * reason field. This gives it its own structured reason taxonomy, optional
 * photo evidence, and an explicit confirmation step before the stock write
 * (this app has no separate manager-approver role, so the confirm dialog is
 * the approval gate).
 */
export const WastageLogModal: React.FC<WastageLogModalProps> = ({
  isOpen,
  onClose,
  item,
  onSaved,
  onRequestConfirm
}) => {
  const [reasonCode, setReasonCode] = useState<WastageReasonCode>('KITCHEN_PREP_TRIM');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [formError, setFormError] = useState('');

  if (!item) return null;

  const qty = parseFloat(quantity) || 0;
  const costImpact = qty * item.costPerUnit;

  const handlePhotoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 480;
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxSize) {
          h = Math.round((h * maxSize) / w);
          w = maxSize;
        } else if (h > maxSize) {
          w = Math.round((w * maxSize) / h);
          h = maxSize;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setPhotoUrl(canvas.toDataURL('image/jpeg', 0.8));
        }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setReasonCode('KITCHEN_PREP_TRIM');
    setQuantity('1');
    setNotes('');
    setPhotoUrl('');
    setFormError('');
  };

  const commitWastage = () => {
    const reasonLabel = WASTAGE_REASONS.find((r) => r.code === reasonCode)?.label ?? 'Other';
    InventoryRepository.recordMovement({
      itemId: item.id,
      itemName: item.name,
      type: reasonCode === 'EXPIRED_SPOILED' ? 'SPOILAGE' : 'WASTE',
      quantityDelta: -qty,
      unit: item.unit,
      costImpact,
      reason: notes.trim() ? `${reasonLabel} — ${notes.trim()}` : reasonLabel,
      wastageReasonCode: reasonCode,
      photoUrl: photoUrl || undefined,
      performedBy: 'Manager'
    });
    reset();
    onSaved();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (isNaN(qty) || qty <= 0) {
      setFormError('Enter a wasted quantity greater than zero.');
      return;
    }
    if (qty > item.currentStock) {
      setFormError(`Cannot waste more than the ${item.currentStock} ${item.unit} currently in stock.`);
      return;
    }

    const message = `Log ${qty} ${item.unit} of "${item.name}" as wastage (${WASTAGE_REASONS.find((r) => r.code === reasonCode)?.label}) — a cost impact of ₹${costImpact.toFixed(2)}. This cannot be undone.`;

    if (onRequestConfirm) {
      onRequestConfirm({
        isOpen: true,
        title: 'Confirm Wastage Entry',
        message,
        confirmText: 'Log Wastage',
        isDanger: true,
        onConfirm: commitWastage
      });
    } else if (window.confirm(message)) {
      commitWastage();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        reset();
        onClose();
      }}
      title={`Log Wastage: ${item.name}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="p-3 bg-jaman-ivory border border-jaman-border rounded-xl flex justify-between text-xs">
          <div>
            <span className="text-slate-500 font-bold block">Current Stock:</span>
            <span className="font-bold text-sm text-jaman-navy tabular-nums">{item.currentStock} {item.unit}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-500 font-bold block">Unit Cost:</span>
            <span className="font-bold text-sm text-emerald-700 tabular-nums">₹{item.costPerUnit}/{item.unit}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Reason *</label>
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value as WastageReasonCode)}
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand"
          >
            {WASTAGE_REASONS.map((r) => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Quantity Wasted ({item.unit}) *</label>
          <input
            type="number"
            step="0.1"
            min="0"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-brand"
          />
        </div>

        {qty > 0 && (
          <div className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 inline-block">
            Estimated cost impact: ₹{costImpact.toFixed(2)}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Tray slipped during plating"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Photo Evidence (optional)</label>
          {photoUrl ? (
            <div className="relative w-24 h-24">
              <img src={photoUrl} alt="Wastage evidence" className="w-24 h-24 object-cover rounded-xl border border-jaman-border" />
              <button
                type="button"
                onClick={() => setPhotoUrl('')}
                className="absolute -top-2 -right-2 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center shadow-sm cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 w-fit px-3 py-2 bg-jaman-ivory border border-dashed border-jaman-border rounded-xl text-xs font-bold text-slate-500 hover:border-brand hover:text-brand cursor-pointer transition-colors">
              <Camera className="w-3.5 h-3.5" />
              <span>Attach a photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file);
                }}
              />
            </label>
          )}
        </div>

        {formError && (
          <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={() => { reset(); onClose(); }}>
            Cancel
          </Button>
          <button
            type="submit"
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            Review & Log Wastage
          </button>
        </div>
      </form>
    </Modal>
  );
};
