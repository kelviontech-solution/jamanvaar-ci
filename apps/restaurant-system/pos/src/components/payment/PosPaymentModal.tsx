import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { usePosStore } from '../../store/posStore';
import { PaymentMethod, PaymentSplit } from '@jamanvaar/types';
import { OrderRepository } from '@jamanvaar/database';
import { formatINR, generateUUID } from '@jamanvaar/utils';
import { sound } from '@jamanvaar/ui';
import { PosDiscountModal } from '../cart/PosDiscountModal';
import {
  X,
  Banknote,
  QrCode,
  CreditCard,
  Wallet,
  Building2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit2,
  ArrowRight,
  Check,
  Sparkles,
  Split,
  Tag,
  Percent
} from 'lucide-react';

type PaymentChannel = 'CASH' | 'UPI' | 'CARD' | 'WALLET' | 'HOUSE_ACCOUNT';

interface ChannelConfig {
  id: PaymentChannel;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  keyNumber: string;
}

const CHANNELS: ChannelConfig[] = [
  {
    id: 'CASH',
    label: 'Cash',
    sublabel: 'Cash at Counter',
    icon: Banknote,
    keyNumber: '1'
  },
  {
    id: 'UPI',
    label: 'UPI / QR',
    sublabel: 'UPI / Bharat QR',
    icon: QrCode,
    keyNumber: '2'
  },
  {
    id: 'CARD',
    label: 'Card',
    sublabel: 'Credit / Debit Card',
    icon: CreditCard,
    keyNumber: '3'
  },
  {
    id: 'WALLET',
    label: 'Digital Wallet',
    sublabel: 'Paytm / PhonePe / Other',
    icon: Wallet,
    keyNumber: '4'
  },
  {
    id: 'HOUSE_ACCOUNT',
    label: 'House Account',
    sublabel: 'Customer Credit / Ledger',
    icon: Building2,
    keyNumber: '5'
  }
];

export const PosPaymentModal: React.FC = () => {
  const {
    isPaymentOpen,
    setIsPaymentOpen,
    cart,
    selectedTable,
    runningOrderId,
    selectedCustomer,
    completePayment,
    isDiscountModalOpen,
    setIsDiscountModalOpen,
    removeDiscount
  } = usePosStore();

  const totalPayable = Number(cart?.totalPayable) || 0;
  const itemsCount = cart?.items?.length || 0;

  // Is Split Mode active?
  const [isSplitMode, setIsSplitMode] = useState(false);

  // Active channel selected for direct keypad/focus
  const [activeChannel, setActiveChannel] = useState<PaymentChannel>('CASH');

  // For Split Mode: Primary & Secondary Channels
  const [splitPrimaryChannel, setSplitPrimaryChannel] = useState<PaymentChannel>('CASH');
  const [splitSecondaryChannel, setSplitSecondaryChannel] = useState<PaymentChannel>('UPI');

  // Allocation per channel
  const [allocations, setAllocations] = useState<Record<PaymentChannel, number>>({
    CASH: totalPayable,
    UPI: 0,
    CARD: 0,
    WALLET: 0,
    HOUSE_ACCOUNT: 0
  });

  // Cash-specific tendering (Customer note given)
  const [cashReceivedInput, setCashReceivedInput] = useState<string>(
    totalPayable > 0 ? totalPayable.toString() : ''
  );

  // Manual payment verification flags
  const [upiConfirmed, setUpiConfirmed] = useState(false);
  const [cardConfirmed, setCardConfirmed] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  // Ref guard: a rapid double-click/double-Enter can fire handleSettle a
  // second time before React commits the isProcessing state update, which
  // would otherwise settle the same bill twice.
  const settlingRef = useRef(false);

  // The modal component stays mounted while closed (it just renders null), so
  // its state survives between bills. Without this, `isProcessing` stayed true
  // after the first settlement (button stuck on "Processing Settlement...") and
  // UPI/Card "verified" flags carried over to the next bill.
  useEffect(() => {
    if (isPaymentOpen) {
      settlingRef.current = false;
      setIsProcessing(false);
      setUpiConfirmed(false);
      setCardConfirmed(false);
      setErrorMessage('');
      setIsSplitMode(false);
      setActiveChannel('CASH');
    }
  }, [isPaymentOpen]);

  // A confirmation belongs to one specific amount - changing what is due on
  // UPI or Card means the cashier must confirm again.
  useEffect(() => {
    setUpiConfirmed(false);
  }, [allocations.UPI]);
  useEffect(() => {
    setCardConfirmed(false);
  }, [allocations.CARD]);

  // Initialize or synchronize on modal open & payable change
  useEffect(() => {
    if (isPaymentOpen) {
      const payable = Number(cart?.totalPayable) || 0;
      if (!isSplitMode) {
        setAllocations({
          CASH: 0,
          UPI: 0,
          CARD: 0,
          WALLET: 0,
          HOUSE_ACCOUNT: 0,
          [activeChannel]: payable
        });
        if (activeChannel === 'CASH') {
          setCashReceivedInput(payable > 0 ? payable.toString() : '');
        }
      }
    }
  }, [isPaymentOpen, cart?.totalPayable, isSplitMode, activeChannel]);

  // Derived Calculations
  const totalAllocated = useMemo(() => {
    return Object.values(allocations).reduce((sum, val) => sum + (Number(val) || 0), 0);
  }, [allocations]);

  const remainingDue = Number((totalPayable - totalAllocated).toFixed(2));
  const isFullyAllocated = totalAllocated === totalPayable && totalPayable > 0;
  const isOverAllocated = totalAllocated > totalPayable;
  const isUnderAllocated = totalAllocated < totalPayable;

  // "Mark UPI Paid"/"Mark Card Paid" used to be purely decorative — a
  // cashier could hit Confirm & Settle without ever tapping them. Now any
  // channel actually allocated money must be confirmed before settlement.
  const upiPortion = Number(allocations.UPI) || 0;
  const cardPortion = Number(allocations.CARD) || 0;
  const isReadyToSettle =
    isFullyAllocated && (upiPortion === 0 || upiConfirmed) && (cardPortion === 0 || cardConfirmed);

  // Cash change calculation
  const cashPortion = Number(allocations.CASH) || 0;
  const parsedCashReceived = parseFloat(cashReceivedInput);
  const cashReceived = !isNaN(parsedCashReceived) ? parsedCashReceived : cashPortion;
  const changeDue = Math.max(0, Number((cashReceived - cashPortion).toFixed(2)));

  // Single Pay: Select payment method and assign 100% of the bill
  const handleSelectSingleMethod = (channel: PaymentChannel) => {
    setIsSplitMode(false);
    setActiveChannel(channel);
    setAllocations({
      CASH: channel === 'CASH' ? totalPayable : 0,
      UPI: channel === 'UPI' ? totalPayable : 0,
      CARD: channel === 'CARD' ? totalPayable : 0,
      WALLET: channel === 'WALLET' ? totalPayable : 0,
      HOUSE_ACCOUNT: channel === 'HOUSE_ACCOUNT' ? totalPayable : 0
    });
    if (channel === 'CASH') {
      setCashReceivedInput(totalPayable.toString());
    }
    setErrorMessage('');
  };

  // Switch to Split Payment Card
  const handleSelectSplitModeCard = () => {
    setIsSplitMode(true);
    // Split 50/50 Cash + UPI
    const half = Math.floor(totalPayable / 2);
    const rem = Number((totalPayable - half).toFixed(2));
    setAllocations({
      CASH: half,
      UPI: rem,
      CARD: 0,
      WALLET: 0,
      HOUSE_ACCOUNT: 0
    });
    setSplitPrimaryChannel('CASH');
    setSplitSecondaryChannel('UPI');
    setCashReceivedInput(half.toString());
    setActiveChannel('CASH');
    setErrorMessage('');
  };

  // Auto-Remaining Split Logic: When cashier enters an amount for Primary Method in Split Mode
  const handlePrimarySplitAmountChange = (val: string | number) => {
    const primaryAmt = Math.max(0, Math.min(totalPayable, Number(val) || 0));
    const secondaryAmt = Number((totalPayable - primaryAmt).toFixed(2));

    setAllocations({
      CASH: 0,
      UPI: 0,
      CARD: 0,
      WALLET: 0,
      HOUSE_ACCOUNT: 0,
      [splitPrimaryChannel]: primaryAmt,
      [splitSecondaryChannel]: secondaryAmt
    });

    if (splitPrimaryChannel === 'CASH') {
      setCashReceivedInput(primaryAmt.toString());
    }
  };

  // When cashier enters an amount for Secondary Method in Split Mode
  const handleSecondarySplitAmountChange = (val: string | number) => {
    const secondaryAmt = Math.max(0, Math.min(totalPayable, Number(val) || 0));
    const primaryAmt = Number((totalPayable - secondaryAmt).toFixed(2));

    setAllocations({
      CASH: 0,
      UPI: 0,
      CARD: 0,
      WALLET: 0,
      HOUSE_ACCOUNT: 0,
      [splitPrimaryChannel]: primaryAmt,
      [splitSecondaryChannel]: secondaryAmt
    });

    if (splitPrimaryChannel === 'CASH') {
      setCashReceivedInput(primaryAmt.toString());
    }
  };

  // Direct editing of any channel amount (with auto-routing remainder if lower than total)
  const handleDirectChannelAmountChange = (channel: PaymentChannel, val: string | number) => {
    const num = Math.max(0, parseFloat(val.toString()) || 0);

    // If entering an amount smaller than total on a single channel, automatically switch to split with secondary channel
    if (num < totalPayable && !isSplitMode) {
      setIsSplitMode(true);
      const secondary = channel === 'CASH' ? 'UPI' : 'CASH';
      setSplitPrimaryChannel(channel);
      setSplitSecondaryChannel(secondary);
      const remainder = Number((totalPayable - num).toFixed(2));

      setAllocations({
        CASH: 0,
        UPI: 0,
        CARD: 0,
        WALLET: 0,
        HOUSE_ACCOUNT: 0,
        [channel]: num,
        [secondary]: remainder
      });

      if (channel === 'CASH') {
        setCashReceivedInput(num.toString());
      }
      return;
    }

    // Otherwise standard update
    setAllocations((prev) => {
      const next = { ...prev, [channel]: num };
      if (channel === 'CASH' && num <= cashReceived) {
        // keep cash received
      } else if (channel === 'CASH') {
        setCashReceivedInput(num.toString());
      }
      return next;
    });
  };

  // Quick 50/50 Split Shortcut
  const handleSplit5050 = () => {
    const half = Math.floor(totalPayable / 2);
    const rem = Number((totalPayable - half).toFixed(2));
    setAllocations({
      CASH: 0,
      UPI: 0,
      CARD: 0,
      WALLET: 0,
      HOUSE_ACCOUNT: 0,
      [splitPrimaryChannel]: half,
      [splitSecondaryChannel]: rem
    });
    if (splitPrimaryChannel === 'CASH') {
      setCashReceivedInput(half.toString());
    }
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    if (!isPaymentOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (e.key === 'Escape') {
        e.preventDefault();
        setIsPaymentOpen(false);
      } else if (e.key === 'Enter' && !isInput && isReadyToSettle) {
        e.preventDefault();
        handleSettle();
      } else if (!isInput) {
        if (e.key === '1') handleSelectSingleMethod('CASH');
        if (e.key === '2') handleSelectSingleMethod('UPI');
        if (e.key === '3') handleSelectSingleMethod('CARD');
        if (e.key === '4') handleSelectSingleMethod('WALLET');
        if (e.key === '5') handleSelectSingleMethod('HOUSE_ACCOUNT');
        if (e.key.toLowerCase() === 's') handleSelectSplitModeCard();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPaymentOpen, isReadyToSettle]);

  // Settle and Confirm Payment
  const handleSettle = () => {
    if (settlingRef.current) return;
    setErrorMessage('');

    if (totalAllocated !== totalPayable) {
      if (isUnderAllocated) {
        setErrorMessage(`⚠ ₹${remainingDue} still remaining to be allocated.`);
      } else {
        setErrorMessage(`⚠ Allocation exceeds bill total by ₹${Number((totalAllocated - totalPayable).toFixed(2))}.`);
      }
      return;
    }

    if (cashPortion > 0 && cashReceived < cashPortion) {
      setErrorMessage(`⚠ Cash received (₹${cashReceived}) is less than cash due (₹${cashPortion}).`);
      return;
    }

    // Determine final payment method type
    const activeEntries = (Object.entries(allocations) as [PaymentChannel, number][]).filter(
      ([, amt]) => amt > 0
    );

    let finalMethod: PaymentMethod = 'CASH';
    if (activeEntries.length > 1) {
      finalMethod = 'SPLIT';
    } else if (activeEntries.length === 1) {
      const single = activeEntries[0][0];
      finalMethod = single === 'CASH' ? 'CASH' : single === 'UPI' ? 'UPI_QR' : single === 'CARD' ? 'CARD' : 'WALLET';
    }

    settlingRef.current = true;
    setIsProcessing(true);

    try {
      // A real random reference, not a clock-derived value — this is the
      // persisted transaction reference used for reconciliation, not just
      // display text, so it needs genuine uniqueness guarantees.
      const txnRef = `TXN-${generateUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      const channelToSplit: Record<PaymentChannel, PaymentSplit['method']> = {
        CASH: 'CASH',
        UPI: 'UPI',
        CARD: 'CARD',
        WALLET: 'WALLET',
        HOUSE_ACCOUNT: 'HOUSE_ACCOUNT'
      };
      const splits: PaymentSplit[] = activeEntries.map(([channel, amt]) => ({
        method: channelToSplit[channel],
        amount: Number(amt)
      }));
      const res = completePayment(
        finalMethod,
        cashPortion > 0 ? cashReceived : undefined,
        txnRef,
        splits
      );

      if (!res) {
        sound.play('error');
        settlingRef.current = false;
        setIsProcessing(false);
        setErrorMessage('Failed to finalize settlement. Please try again.');
      } else {
        sound.play('payment');
      }
    } catch (err: any) {
      sound.play('error');
      settlingRef.current = false;
      setIsProcessing(false);
      setErrorMessage(err?.message || 'An error occurred during payment settlement.');
    }
  };

  if (!isPaymentOpen) return null;

  // An order that was already sent to the kitchen is saved: name it, instead of calling it new (BUG-154).
  const savedOrderId = runningOrderId || selectedTable?.currentOrderId || null;
  const savedOrder = savedOrderId ? OrderRepository.getOrderById(savedOrderId) : undefined;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-150 font-sans">
      <div className="bg-white border border-jaman-border rounded-3xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* TOP HEADER: Clean, Large, Prominent */}
        <div className="bg-jaman-cream border-b border-jaman-border p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black text-jaman-saffron uppercase tracking-wider bg-[#FFF4ED] px-2 py-0.5 rounded border border-[#FDBA74]">
                PAYMENT & SETTLEMENT
              </span>
              <span className="text-xs text-slate-500 font-mono font-bold uppercase">
                {savedOrder ? `Order ${savedOrder.orderNumber} · Token #${savedOrder.tokenNumber}` : 'New Order — Not Yet Saved'}
              </span>
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total Payable:</span>
              <h2 className="text-2xl sm:text-3xl font-black text-jaman-navy font-mono leading-tight">
                {formatINR(totalPayable)}
              </h2>
              <button
                type="button"
                onClick={() => setIsDiscountModalOpen(true)}
                className={`px-2.5 py-1 rounded-xl border text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                  cart.discountAmount > 0
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-2xs'
                    : 'bg-[#FFF4ED] border-[#FDBA74] text-jaman-saffron hover:bg-[#FFE8D6]'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>{cart.discountAmount > 0 ? `Discount: -${formatINR(cart.discountAmount)}` : '+ Apply Discount'}</span>
              </button>
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
              <span>{selectedTable ? `Table #${selectedTable.tableNumber}` : 'Counter Takeaway'}</span>
              <span>•</span>
              <span>{itemsCount} items</span>
              {cart.discountAmount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-slate-400 line-through font-mono">Gross: {formatINR(cart.subtotal)}</span>
                </>
              )}
              {selectedCustomer && (
                <>
                  <span>•</span>
                  <span className="font-semibold text-slate-700">Guest: {selectedCustomer.name}</span>
                </>
              )}
            </div>
          </div>

          {/* Allocation Status Pill */}
          <div className="flex items-center gap-3">
            <div
              className={`px-4 py-2 rounded-2xl border text-xs font-black flex items-center gap-2 transition-all ${
                isFullyAllocated
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs'
                  : isOverAllocated
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}
            >
              {isFullyAllocated ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>✓ FULLY ALLOCATED ({formatINR(totalAllocated)} / {formatINR(totalPayable)})</span>
                </>
              ) : isOverAllocated ? (
                <>
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>⚠ EXCEEDS BILL BY {formatINR(totalAllocated - totalPayable)}</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>⚠ REMAINING: {formatINR(remainingDue)}</span>
                </>
              )}
            </div>

            <button
              onClick={() => setIsPaymentOpen(false)}
              className="p-2 rounded-2xl hover:bg-slate-200 text-slate-400 hover:text-jaman-navy transition-colors"
              title="Close (Esc)"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* ERROR NOTIFICATION BANNER */}
        {errorMessage && (
          <div className="bg-rose-50 border-b border-rose-200 px-5 py-2.5 text-xs font-bold text-rose-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage('')} className="text-rose-600 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* WORKSPACE BODY (2 Columns) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* LEFT COLUMN (7 Cols): Cashier Payment Cards & Active Channel Controls */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* PAYMENT METHOD CARDS (Includes Split Payment Card as 6th option) */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Select Payment Method:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {CHANNELS.map((ch) => {
                  const Icon = ch.icon;
                  const isSelected = !isSplitMode && activeChannel === ch.id;
                  const amt = allocations[ch.id] || 0;

                  return (
                    <div
                      key={ch.id}
                      onClick={() => handleSelectSingleMethod(ch.id)}
                      className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between select-none ${
                        isSelected
                          ? 'border-jaman-saffron bg-[#FFF7ED] shadow-sm ring-2 ring-jaman-saffron/20'
                          : amt > 0 && !isSplitMode
                          ? 'border-emerald-300 bg-emerald-50/40'
                          : 'border-jaman-border bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                          isSelected
                            ? 'bg-jaman-saffron text-white shadow-xs'
                            : amt > 0 && !isSplitMode
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.2 rounded">
                          [{ch.keyNumber}]
                        </span>
                      </div>

                      <div className="mt-2">
                        <span className="text-xs font-black text-jaman-navy block">{ch.label}</span>
                        <span className="text-[10px] text-slate-400 block truncate">{ch.sublabel}</span>
                      </div>

                      <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between">
                        <span className="font-mono font-black text-xs text-jaman-navy">
                          {!isSplitMode && isSelected ? formatINR(totalPayable) : amt > 0 ? formatINR(amt) : '₹0'}
                        </span>
                        {!isSplitMode && isSelected && (
                          <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-md uppercase">
                            100%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* 6th Card: DEDICATED SPLIT PAYMENT CARD */}
                <div
                  onClick={handleSelectSplitModeCard}
                  className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between select-none ${
                    isSplitMode
                      ? 'border-jaman-saffron bg-[#FFF7ED] shadow-sm ring-2 ring-jaman-saffron/20'
                      : 'border-jaman-border bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                      isSplitMode
                        ? 'bg-jaman-saffron text-white shadow-xs'
                        : 'bg-indigo-50 text-indigo-700'
                    }`}>
                      <Split className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.2 rounded">
                      [S]
                    </span>
                  </div>

                  <div className="mt-2">
                    <span className="text-xs font-black text-jaman-navy block">Split Payment</span>
                    <span className="text-[10px] text-slate-400 block truncate">Cash + UPI / Multi</span>
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between">
                    <span className="font-mono font-black text-xs text-jaman-saffron">
                      {isSplitMode ? '⚡ Split Active' : 'Multi-Tender'}
                    </span>
                    {isSplitMode && (
                      <span className="text-[9px] font-extrabold text-indigo-700 bg-indigo-100 px-1.5 py-0.2 rounded-md uppercase">
                        Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* SPLIT PAYMENT WORKSPACE: Two interactive linked inputs with auto-remaining calculation */}
            {isSplitMode ? (
              <div className="bg-jaman-cream border-2 border-jaman-border rounded-2xl p-4 sm:p-5 space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Split className="w-4 h-4 text-jaman-saffron" />
                    <span className="text-xs font-black text-jaman-navy uppercase tracking-wide">
                      Split Bill Payment
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleSplit5050}
                    className="px-2.5 py-1 bg-white border border-jaman-border hover:border-jaman-saffron rounded-lg text-xs font-bold text-jaman-navy flex items-center gap-1 shadow-2xs"
                  >
                    <Sparkles className="w-3 h-3 text-jaman-saffron" />
                    <span>⚡ 50/50 Split</span>
                  </button>
                </div>

                {/* Method 1 Input (e.g. Cash) */}
                <div className="bg-white p-3.5 rounded-xl border border-jaman-border space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-jaman-navy">
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-jaman-saffron" />
                      <span>1. Method: {CHANNELS.find((c) => c.id === splitPrimaryChannel)?.label} Amount</span>
                    </div>
                    <span className="text-[11px] text-slate-400">Enter cash amount:</span>
                  </div>

                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-black text-slate-400 text-lg">
                      ₹
                    </span>
                    <input
                      type="number"
                      value={allocations[splitPrimaryChannel] || ''}
                      onChange={(e) => handlePrimarySplitAmountChange(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-jaman-cream border-2 border-jaman-border focus:border-jaman-saffron rounded-xl pl-8 pr-3 py-2 text-xl font-mono font-black text-jaman-navy focus:outline-none"
                    />
                  </div>
                </div>

                {/* Method 2 Input (e.g. UPI / Card / Wallet) */}
                <div className="bg-white p-3.5 rounded-xl border border-jaman-border space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-jaman-navy">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-blue-600" />
                      <span>2. Method:</span>
                      <select
                        value={splitSecondaryChannel}
                        onChange={(e) => {
                          const newSec = e.target.value as PaymentChannel;
                          setSplitSecondaryChannel(newSec);
                          const secAmt = allocations[splitSecondaryChannel];
                          setAllocations((prev) => ({
                            ...prev,
                            [splitSecondaryChannel]: 0,
                            [newSec]: secAmt
                          }));
                        }}
                        className="bg-jaman-cream border border-jaman-border rounded-lg px-2 py-0.5 text-xs font-bold text-jaman-navy focus:outline-none"
                      >
                        <option value="UPI">UPI / Bharat QR</option>
                        <option value="CARD">Credit / Debit Card</option>
                        <option value="WALLET">Digital Wallet</option>
                        <option value="HOUSE_ACCOUNT">House Account</option>
                      </select>
                    </div>
                  </div>

                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-black text-slate-400 text-lg">
                      ₹
                    </span>
                    <input
                      type="number"
                      value={allocations[splitSecondaryChannel] || ''}
                      onChange={(e) => handleSecondarySplitAmountChange(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-jaman-cream border-2 border-jaman-border focus:border-jaman-saffron rounded-xl pl-8 pr-3 py-2 text-xl font-mono font-black text-jaman-navy focus:outline-none"
                    />
                  </div>
                </div>

                {/* Cash Tendered / Change Calculator when Cash is in the split */}
                {allocations.CASH > 0 && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">Cash Note Given by Guest:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 text-[11px]">Note (₹):</span>
                        <input
                          type="number"
                          value={cashReceivedInput}
                          onChange={(e) => setCashReceivedInput(e.target.value)}
                          className="w-24 bg-white border border-jaman-border focus:border-jaman-saffron rounded-lg px-2 py-1 text-right font-mono font-black text-xs text-jaman-navy focus:outline-none"
                        />
                      </div>
                    </div>

                    {changeDue > 0 && (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs text-emerald-950">
                        <span className="font-bold">CHANGE TO RETURN:</span>
                        <span className="font-mono font-black text-base text-emerald-900">{formatINR(changeDue)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Split bills: each UPI / Card portion must be confirmed here.
                    "Mark ... Paid" used to be drawn only for single-method UPI/Card,
                    so a split containing UPI or Card could never be settled. */}
                {(upiPortion > 0 || cardPortion > 0) && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-2">
                    {upiPortion > 0 && (
                      <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                        <div className="flex items-center gap-2">
                          <QrCode className="w-5 h-5 text-blue-700" />
                          <div>
                            <span className="text-xs font-black text-blue-950 block">UPI / Bharat QR</span>
                            <span className="text-[11px] text-blue-800 font-mono">Amount: {formatINR(upiPortion)}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setUpiConfirmed(true)}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                            upiConfirmed ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                          }`}
                        >
                          {upiConfirmed ? '✓ UPI Verified' : 'Mark UPI Paid'}
                        </button>
                      </div>
                    )}
                    {cardPortion > 0 && (
                      <div className="flex items-center justify-between p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-5 h-5 text-indigo-700" />
                          <div>
                            <span className="text-xs font-black text-indigo-950 block">EDC Swipe Terminal</span>
                            <span className="text-[11px] text-indigo-800 font-mono">Amount: {formatINR(cardPortion)}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCardConfirmed(true)}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                            cardConfirmed ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                          }`}
                        >
                          {cardConfirmed ? '✓ Card Approved' : 'Mark Card Paid'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* SINGLE PAYMENT WORKSPACE (100% of Bill on selected channel) */
              <div className="bg-jaman-cream border-2 border-jaman-border rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                  <span className="text-xs font-black text-jaman-navy uppercase tracking-wide">
                    Amount for {CHANNELS.find((c) => c.id === activeChannel)?.label}:
                  </span>
                  <span className="text-xs font-bold text-emerald-700">100% Single Payment</span>
                </div>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono font-black text-slate-400 text-xl">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={allocations[activeChannel] || ''}
                    onChange={(e) => handleDirectChannelAmountChange(activeChannel, e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white border-2 border-jaman-border focus:border-jaman-saffron rounded-2xl pl-10 pr-4 py-3 text-2xl font-mono font-black text-jaman-navy focus:outline-none transition-colors shadow-2xs"
                  />
                </div>

                {/* CASH SPECIFIC: Denominations, Received & Change Calculator */}
                {activeChannel === 'CASH' && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-bold text-slate-700 block">Cash Tendered / Note Handed Over:</span>
                        <span className="text-[11px] text-slate-400">e.g. ₹500, ₹1000, ₹2000, ₹3000</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 text-[11px]">Tendered (₹):</span>
                        <input
                          type="number"
                          value={cashReceivedInput}
                          onChange={(e) => setCashReceivedInput(e.target.value)}
                          className="w-28 bg-white border border-jaman-border focus:border-jaman-saffron rounded-xl px-2.5 py-1 text-right font-mono font-black text-sm text-jaman-navy focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Quick Denomination Chips */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCashReceivedInput(cashPortion.toString())}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-colors ${
                          cashReceived === cashPortion
                            ? 'bg-jaman-navy text-white border-jaman-navy'
                            : 'bg-white text-slate-700 border-jaman-border hover:bg-slate-50'
                        }`}
                      >
                        Exact Note ({formatINR(cashPortion)})
                      </button>
                      {[100, 200, 500, 1000, 2000, 5000]
                        .filter((val) => val >= cashPortion)
                        .slice(0, 5)
                        .map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setCashReceivedInput(val.toString())}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold border transition-colors ${
                              cashReceived === val
                                ? 'bg-jaman-saffron text-white border-jaman-saffron'
                                : 'bg-white text-slate-700 border-jaman-border hover:bg-slate-50'
                            }`}
                          >
                            ₹{val}
                          </button>
                        ))}
                    </div>

                    {/* PROMINENT CHANGE DUE RETURN BANNER */}
                    {changeDue > 0 && (
                      <div className="p-3 bg-emerald-50 border-2 border-emerald-300 rounded-2xl flex items-center justify-between text-emerald-950 animate-in fade-in">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider block text-emerald-800">
                            CHANGE TO RETURN TO GUEST:
                          </span>
                          <div className="text-xl font-black font-mono text-emerald-900 mt-0.5">
                            {formatINR(changeDue)}
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">
                          Cashier Drawer
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* UPI SPECIFIC: Dynamic QR & Mark Paid Button */}
                {activeChannel === 'UPI' && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-3">
                    <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-2xl">
                      <div className="flex items-center gap-2.5">
                        <QrCode className="w-6 h-6 text-blue-700" />
                        <div>
                          <span className="text-xs font-black text-blue-950 block">UPI / Bharat QR Payment</span>
                          <span className="text-[11px] text-blue-800 font-mono">Amount: {formatINR(allocations.UPI)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setUpiConfirmed(true)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                          upiConfirmed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                        }`}
                      >
                        {upiConfirmed ? '✓ UPI Verified' : 'Mark UPI Paid'}
                      </button>
                    </div>
                  </div>
                )}

                {/* CARD SPECIFIC: Terminal Confirmation */}
                {activeChannel === 'CARD' && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-3">
                    <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-2xl">
                      <div className="flex items-center gap-2.5">
                        <CreditCard className="w-6 h-6 text-indigo-700" />
                        <div>
                          <span className="text-xs font-black text-indigo-950 block">EDC Swipe Terminal</span>
                          <span className="text-[11px] text-indigo-800 font-mono">Amount: {formatINR(allocations.CARD)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCardConfirmed(true)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                          cardConfirmed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                        }`}
                      >
                        {cardConfirmed ? '✓ Card Approved' : 'Mark Card Paid'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN (5 Cols): Compact Summary & Primary Settlement Action */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            
            <div className="bg-white border-2 border-jaman-border rounded-3xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-black text-xs uppercase tracking-wider text-jaman-navy">
                  Payment Summary
                </h3>
                {isSplitMode && (
                  <button
                    type="button"
                    onClick={handleSplit5050}
                    className="text-[10px] font-bold text-jaman-saffron hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Split 50/50</span>
                  </button>
                )}
              </div>

              {/* Financial Breakdown with Subtotal & Discount */}
              <div className="space-y-1.5 text-xs text-slate-600 font-medium">
                <div className="flex justify-between">
                  <span>Gross Subtotal:</span>
                  <span className="font-mono font-bold text-jaman-navy">{formatINR(cart.subtotal)}</span>
                </div>

                {cart.discountAmount > 0 ? (
                  <div className="flex justify-between items-center text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200">
                    <div className="flex items-center gap-1 truncate max-w-[170px]">
                      <Tag className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">Discount {cart.discountReason ? `(${cart.discountReason})` : ''}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-black">-{formatINR(cart.discountAmount)}</span>
                      <button
                        type="button"
                        onClick={() => setIsDiscountModalOpen(true)}
                        className="text-emerald-800 hover:underline text-[10px] font-bold cursor-pointer"
                        title="Edit discount"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDiscount()}
                        className="w-4 h-4 rounded-full bg-emerald-200/80 hover:bg-rose-100 hover:text-rose-700 text-emerald-800 flex items-center justify-center text-[10px] cursor-pointer"
                        title="Remove discount"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsDiscountModalOpen(true)}
                    className="w-full py-2 px-3 rounded-xl border border-dashed border-[#FDBA74] bg-[#FFF8F3] hover:bg-[#FFF2E8] text-jaman-saffron text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>+ Add Order Discount / Coupon</span>
                  </button>
                )}

                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>GST (CGST 2.5% + SGST 2.5%):</span>
                  <span className="font-mono">{formatINR(cart.taxAmount)}</span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-200">
                  <span className="font-bold text-slate-700">Total Payable:</span>
                  <span className="font-mono font-black text-lg text-jaman-navy">
                    {formatINR(totalPayable)}
                  </span>
                </div>
              </div>

              {/* Active Tender Breakdown Lines */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                {(Object.entries(allocations) as [PaymentChannel, number][])
                  .filter(([, amt]) => amt > 0)
                  .map(([channel, amt]) => (
                    <div
                      key={channel}
                      className="p-2.5 rounded-xl bg-jaman-cream border border-jaman-border flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-extrabold text-jaman-navy block">
                          {CHANNELS.find((c) => c.id === channel)?.label}
                        </span>
                        {channel === 'CASH' && changeDue > 0 && (
                          <span className="text-[10px] text-emerald-700 font-bold block">
                            Tendered: {formatINR(cashReceived)} (Change: {formatINR(changeDue)})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-jaman-navy">
                          {formatINR(amt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveChannel(channel);
                          }}
                          className="p-1 text-slate-400 hover:text-jaman-saffron rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {isSplitMode && (
                          <button
                            type="button"
                            onClick={() => {
                              setAllocations((prev) => ({ ...prev, [channel]: 0 }));
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                {(Object.values(allocations).reduce((a, b) => a + b, 0) === 0) && (
                  <div className="text-center py-4 text-xs text-slate-400">
                    No payment tender selected yet
                  </div>
                )}
              </div>

              {/* Bottom Totals */}
              <div className="space-y-1.5 pt-3 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-500">Allocated:</span>
                  <span className="font-mono font-black text-slate-800">{formatINR(totalAllocated)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-500">Remaining:</span>
                  <span className={`font-mono font-black ${remainingDue > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {formatINR(remainingDue)}
                  </span>
                </div>
              </div>
            </div>

            {/* PRIMARY SETTLEMENT BUTTON */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleSettle}
                disabled={!isReadyToSettle || isProcessing}
                className={`w-full py-4 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg transition-all active:scale-98 ${
                  isReadyToSettle && !isProcessing
                    ? 'bg-gradient-to-r from-jaman-saffron to-[#F27E2B] hover:from-[#EA580C] hover:to-jaman-saffron text-white shadow-orange-500/25 cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300/60'
                }`}
              >
                {isProcessing ? (
                  <span>Processing Settlement...</span>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    <span>CONFIRM & SETTLE {formatINR(totalPayable)}</span>
                  </>
                )}
              </button>

              <span className="text-[10px] text-slate-400 text-center block">
                {isFullyAllocated && !isReadyToSettle
                  ? `Confirm ${upiPortion > 0 && !upiConfirmed ? 'UPI' : ''}${
                      upiPortion > 0 && !upiConfirmed && cardPortion > 0 && !cardConfirmed ? ' & ' : ''
                    }${cardPortion > 0 && !cardConfirmed ? 'Card' : ''} payment above before settling.`
                  : 'Settles bill, queues 80mm thermal receipt, and updates active cashier shift ledger.'}
              </span>
            </div>
          </div>
        </div>

        {/* Nested Discount Modal for on-the-fly discounts during checkout */}
        <PosDiscountModal
          isOpen={isDiscountModalOpen}
          onClose={() => setIsDiscountModalOpen(false)}
        />
      </div>
    </div>
  );
};
