import React, { useState, useEffect, useMemo } from 'react';
import { usePosStore, isManagerOrAboveRole, isHighDiscount } from '../../store/posStore';
import { formatINR } from '@jamanvaar/utils';
import { sound } from '@jamanvaar/ui';
import { db } from '@jamanvaar/database';
import { calculateCart } from '@jamanvaar/business';
import {
  X,
  Percent,
  IndianRupee,
  Tag,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Sparkles,
  ShieldCheck,
  Layers,
  FileText
} from 'lucide-react';

interface PosDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PREDEFINED_REASONS = [
  'Customer Loyalty',
  'Manager Approval',
  'Promotional Offer',
  'Service Recovery',
  'Festival Offer',
  'Staff Discount',
  'Other'
];

const PERCENT_PRESETS = [5, 10, 15, 20, 25, 50];
const FIXED_PRESETS = [50, 100, 200, 500];

export const PosDiscountModal: React.FC<PosDiscountModalProps> = ({ isOpen, onClose }) => {
  const {
    cart,
    currentUser,
    billDiscountPercent,
    billDiscountFlat,
    discountReason: currentReason,
    discountScope: currentScope,
    discountCode: currentCode,
    applyDiscount,
    applyDiscountUnchecked,
    removeDiscount,
    requestManagerOverride
  } = usePosStore();

  const [scope, setScope] = useState<'BILL' | 'ITEMS'>('BILL');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [reason, setReason] = useState<string>('Customer Loyalty');
  const [customReason, setCustomReason] = useState<string>('');
  const [discountCode, setDiscountCode] = useState<string>('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [itemDiscountValues, setItemDiscountValues] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Load existing cart discount state upon opening
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      setScope(currentScope || 'BILL');

      if (billDiscountPercent > 0) {
        setDiscountType('PERCENTAGE');
        setDiscountValue(billDiscountPercent.toString());
      } else if (billDiscountFlat > 0) {
        setDiscountType('FIXED');
        setDiscountValue(billDiscountFlat.toString());
      } else {
        setDiscountType('PERCENTAGE');
        setDiscountValue('');
      }

      if (currentReason) {
        if (PREDEFINED_REASONS.includes(currentReason)) {
          setReason(currentReason);
          setCustomReason('');
        } else {
          setReason('Other');
          setCustomReason(currentReason);
        }
      } else {
        setReason('Customer Loyalty');
        setCustomReason('');
      }

      setDiscountCode(currentCode || '');

      // Initialize item selection with all cart items
      if (cart.items && cart.items.length > 0) {
        const itemIdsWithDiscount = cart.items
          .filter((it) => (it.itemDiscountPercent && it.itemDiscountPercent > 0) || (it.itemDiscountAmount && it.itemDiscountAmount > 0))
          .map((it) => it.cartItemId);

        setSelectedItemIds(itemIdsWithDiscount.length > 0 ? itemIdsWithDiscount : cart.items.map((it) => it.cartItemId));

        const initValues: Record<string, number> = {};
        cart.items.forEach((it) => {
          if (it.itemDiscountPercent) initValues[it.cartItemId] = it.itemDiscountPercent;
          else if (it.itemDiscountAmount) initValues[it.cartItemId] = it.itemDiscountAmount;
        });
        setItemDiscountValues(initValues);
      }
    }
  }, [isOpen, billDiscountPercent, billDiscountFlat, currentReason, currentScope, currentCode, cart.items]);

  // Calculate live preview
  const preview = useMemo(() => {
    const rawSubtotal = cart.items.reduce((acc, it) => acc + (it.itemTotal || 0), 0);
    const numVal = parseFloat(discountValue) || 0;

    const items = cart.items.map(it => scope === 'ITEMS' && selectedItemIds.includes(it.cartItemId)
      ? { ...it, itemDiscountPercent: discountType === 'PERCENTAGE' ? numVal : 0, itemDiscountAmount: discountType === 'FIXED' ? numVal : 0 }
      : it);
    const priced = calculateCart({ items, taxGroups: db.taxGroups, discountType, discountValue: numVal, discountScope: scope });
    return { rawSubtotal, calculatedDiscount: priced.discountAmount, taxable: Number(Math.max(0, priced.subtotal - priced.discountAmount).toFixed(2)), totalTax: priced.taxAmount, totalPayable: priced.totalPayable, roundOff: priced.roundOffAmount };
  }, [cart.items, scope, discountType, discountValue, selectedItemIds]);

  const handleApply = () => {
    setErrorMessage('');
    const numVal = Number(discountValue);

    if (!discountValue.trim() || !Number.isFinite(numVal) || numVal <= 0) {
      setErrorMessage('Please enter a valid discount amount greater than 0.');
      return;
    }

    if (discountType === 'PERCENTAGE' && (numVal < 0 || numVal > 100)) {
      setErrorMessage('Percentage discount must be between 0% and 100%.');
      return;
    }

    if (discountType === 'FIXED' && numVal > preview.rawSubtotal) {
      setErrorMessage(`Fixed discount cannot exceed the order subtotal (${formatINR(preview.rawSubtotal)}).`);
      return;
    }

    const finalReason = reason === 'Other' ? (customReason.trim() || 'Other Discount') : reason;

    // Manager-approval threshold (SEC-013): same rule the store itself now enforces
    // at the actual mutation boundary — checked here too only so the PIN prompt
    // appears immediately, with correct modal-close/sound timing, instead of via
    // a delayed round-trip through the store's own override redirect.
    const isManagerRole = isManagerOrAboveRole(currentUser);
    const needsApproval =
      isHighDiscount(
        {
          scope,
          type: discountType,
          value: numVal,
          itemIds: scope === 'ITEMS' ? selectedItemIds : undefined
        },
        cart.items
      ) && !isManagerRole;

    if (needsApproval) {
      requestManagerOverride(
        'HIGH_DISCOUNT',
        `High Discount Approval (${discountType === 'PERCENTAGE' ? `${numVal}%` : `₹${numVal}`})`,
        `Cashier ${currentUser?.fullName} is applying ${discountType === 'PERCENTAGE' ? `${numVal}%` : `₹${numVal}`} discount for "${finalReason}".`,
        (managerName) => {
          applyDiscountUnchecked({
            scope,
            type: discountType,
            value: numVal,
            reason: `${finalReason} (Approved by ${managerName})`,
            code: discountCode.trim() || undefined,
            itemIds: scope === 'ITEMS' ? selectedItemIds : undefined
          });
          sound.play('success');
          onClose();
        }
      );
      return;
    }

    applyDiscount({
      scope,
      type: discountType,
      value: numVal,
      reason: finalReason,
      code: discountCode.trim() || undefined,
      itemIds: scope === 'ITEMS' ? selectedItemIds : undefined
    });

    sound.play('success');
    onClose();
  };

  const handleRemove = () => {
    removeDiscount();
    sound.play('remove');
    onClose();
  };

  const toggleItemSelection = (cartItemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(cartItemId) ? prev.filter((id) => id !== cartItemId) : [...prev, cartItemId]
    );
  };

  // Escape closes this dialog like any other in the app, not just its own Close button.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasDiscountApplied = cart.discountAmount > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-150 font-sans">
      <div className="bg-white border border-jaman-border rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-jaman-cream border-b border-jaman-border p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF4ED] border border-[#FDBA74] flex items-center justify-center text-jaman-saffron">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-jaman-navy tracking-tight">Apply Order Discount</h2>
              <p className="text-xs text-slate-500 font-medium">Configure bill-level or item-level discount</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl hover:bg-slate-200 text-slate-400 hover:text-jaman-navy transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto max-h-[calc(92vh-180px)]">
          {/* Error message */}
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Scope Selection (Entire Bill vs Selected Items) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
              Apply Discount To:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope('BILL')}
                className={`py-2.5 px-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  scope === 'BILL'
                    ? 'bg-jaman-navy text-white border-jaman-navy shadow-xs'
                    : 'bg-white border-jaman-border text-slate-700 hover:border-slate-300'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Entire Bill</span>
              </button>

              <button
                type="button"
                onClick={() => setScope('ITEMS')}
                className={`py-2.5 px-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  scope === 'ITEMS'
                    ? 'bg-jaman-navy text-white border-jaman-navy shadow-xs'
                    : 'bg-white border-jaman-border text-slate-700 hover:border-slate-300'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Selected Items ({selectedItemIds.length})</span>
              </button>
            </div>
          </div>

          {/* Item Selector List (if Selected Items active) */}
          {scope === 'ITEMS' && (
            <div className="border border-jaman-border rounded-2xl p-3 bg-slate-50/70 space-y-2 max-h-48 overflow-y-auto">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                Select items eligible for discount:
              </div>
              {cart.items.map((it) => {
                const isSelected = selectedItemIds.includes(it.cartItemId);
                return (
                  <div
                    key={it.cartItemId}
                    onClick={() => toggleItemSelection(it.cartItemId)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-white border-jaman-saffron shadow-xs text-jaman-navy'
                        : 'bg-white/60 border-slate-200 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-jaman-saffron border-jaman-saffron text-white' : 'border-slate-300'}`}>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                      <span className="font-bold truncate">{it.item.name}</span>
                      <span className="text-[10px] text-slate-400 font-medium">x{it.quantity}</span>
                    </div>
                    <span className="font-mono font-bold">{formatINR(it.itemTotal)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 2. Discount Type Selection (Percentage vs Fixed Amount) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
              Discount Type:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDiscountType('PERCENTAGE')}
                className={`py-2.5 px-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  discountType === 'PERCENTAGE'
                    ? 'bg-jaman-saffron text-white border-jaman-saffron shadow-xs'
                    : 'bg-white border-jaman-border text-slate-700 hover:border-slate-300'
                }`}
              >
                <Percent className="w-4 h-4" />
                <span>Percentage (%)</span>
              </button>

              <button
                type="button"
                onClick={() => setDiscountType('FIXED')}
                className={`py-2.5 px-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  discountType === 'FIXED'
                    ? 'bg-jaman-saffron text-white border-jaman-saffron shadow-xs'
                    : 'bg-white border-jaman-border text-slate-700 hover:border-slate-300'
                }`}
              >
                <IndianRupee className="w-4 h-4" />
                <span>Fixed Amount (₹)</span>
              </button>
            </div>
          </div>

          {/* 3. Discount Value Input & Quick Presets */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
              Discount Value {discountType === 'PERCENTAGE' ? '(%)' : '(₹)'}:
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max={discountType === 'PERCENTAGE' ? 100 : preview.rawSubtotal}
                step="0.01"
                aria-label="Discount value"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === 'PERCENTAGE' ? 'Enter percentage (e.g. 10)' : 'Enter amount in ₹'}
                className="w-full h-12 px-4 rounded-2xl border-2 border-jaman-border focus:border-jaman-saffron text-lg font-mono font-bold text-jaman-navy outline-none transition-colors"
                autoFocus
              />
              <span className="absolute right-4 top-3 text-slate-400 font-bold">
                {discountType === 'PERCENTAGE' ? '%' : '₹'}
              </span>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight shrink-0 mr-1">Presets:</span>
              {(discountType === 'PERCENTAGE' ? PERCENT_PRESETS : FIXED_PRESETS).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDiscountValue(p.toString())}
                  className={`px-3 py-1 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                    discountValue === p.toString()
                      ? 'bg-jaman-navy text-white border-jaman-navy'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {discountType === 'PERCENTAGE' ? `${p}%` : `₹${p}`}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Reason & Optional Promo Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
                Reason for Discount:
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-11 px-3 rounded-2xl border border-jaman-border bg-white text-xs font-bold text-jaman-navy outline-none cursor-pointer"
              >
                {PREDEFINED_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
                Discount / Coupon Code (Optional):
              </label>
              <input
                type="text"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                placeholder="e.g. VIP20, FESTIVAL"
                className="w-full h-11 px-3 rounded-2xl border border-jaman-border bg-white text-xs font-mono font-bold text-jaman-navy uppercase outline-none"
              />
            </div>
          </div>

          {reason === 'Other' && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                Custom Reason Details:
              </label>
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Enter specific justification for audit log"
                className="w-full h-10 px-3 rounded-xl border border-jaman-border text-xs font-medium text-jaman-navy outline-none"
              />
            </div>
          )}

          {/* 5. Live Financial Calculation Breakdown Card */}
          <div className="p-3.5 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600 font-medium">
              <span>Gross Order Subtotal:</span>
              <span className="font-mono font-bold">{formatINR(preview.rawSubtotal)}</span>
            </div>

            <div className="flex justify-between text-emerald-600 font-bold">
              <span>Calculated Discount:</span>
              <span className="font-mono">- {formatINR(preview.calculatedDiscount)}</span>
            </div>

            <div className="flex justify-between text-slate-600 font-medium">
              <span>Net Taxable Turnover:</span>
              <span className="font-mono font-bold">{formatINR(preview.taxable)}</span>
            </div>

            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>GST (CGST + SGST):</span>
              <span className="font-mono font-bold">{formatINR(preview.totalTax)}</span>
            </div>

            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 font-black text-sm text-jaman-navy">
              <span>New Total Payable:</span>
              <span className="text-base text-jaman-navy font-mono">{formatINR(preview.totalPayable)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-jaman-cream border-t border-jaman-border flex items-center justify-between shrink-0">
          <div>
            {hasDiscountApplied && (
              <button
                type="button"
                onClick={handleRemove}
                className="px-3.5 py-2 rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Discount</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl border border-jaman-border bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2.5 rounded-2xl bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-black shadow-md shadow-jaman-saffron/25 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Apply Discount</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
