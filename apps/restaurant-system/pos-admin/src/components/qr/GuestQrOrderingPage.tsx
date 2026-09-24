import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SelectedModifier } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import {
  Search,
  Plus,
  Minus,
  ShoppingBag,
  ArrowLeft,
  Sparkles,
  Flame,
  Info,
  Check,
  DollarSign,
  UtensilsCrossed,
  AlertTriangle,
  X,
  ChevronRight,
  Loader2
} from 'lucide-react';
import {
  fetchQrGuestSession,
  placeQrGuestOrder,
  fetchQrGuestOrderStatus,
  generateIdempotencyKey,
  QrGuestApiError,
  type QrGuestSession,
  type QrGuestModifierGroup
} from '../../cloud/qrGuestClient';

interface GuestQrOrderingPageProps {
  tableNumber?: string;
  qrToken?: string;
  /** Jump straight to the live tracker for an existing order (used by the POS "Guest Tracker" action). */
  initialOrderId?: string;
  onExit?: () => void;
}

interface GuestMenuItemVM {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  price: number; // rupees
  imageUrl?: string;
  dietaryType?: string;
  modifierGroupIds: string[];
}

interface GuestModifierOptionVM {
  id: string;
  name: string;
  priceDelta: number; // rupees
}

interface GuestModifierGroupVM {
  id: string;
  name: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: GuestModifierOptionVM[];
}

interface LocalCartItem {
  cartId: string;
  menuItem: GuestMenuItemVM;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  specialInstructions: string;
  totalPrice: number;
}

interface TrackedOrderLineVM {
  id: string;
  name: string;
  quantity: number;
  modifierNames: string[];
  specialInstructions?: string;
  totalPrice: number; // rupees
}

interface TrackedOrderVM {
  externalOrderId: string;
  tokenNumber: string;
  createdAt?: string;
  /** Known only for an order placed THIS session — the guest status endpoint deliberately returns just status/token. */
  totalAmount?: number;
  status: string;
  items?: TrackedOrderLineVM[];
}

/** The platform's shared modifier catalogue is priced in paise server-side; this page works in rupees throughout, like every other price on it. */
function toModifierGroupVMs(groups: QrGuestModifierGroup[]): GuestModifierGroupVM[] {
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    isRequired: g.isRequired,
    minSelections: g.minSelections,
    maxSelections: g.maxSelections,
    options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta / 100 }))
  }));
}

const TERMINAL_STATUSES = new Set(['SERVED', 'COLLECTED', 'COMPLETED', 'CANCELLED', 'REFUNDED']);

export const GuestQrOrderingPage: React.FC<GuestQrOrderingPageProps> = ({
  tableNumber: propTableNumber,
  qrToken: propQrToken,
  initialOrderId,
  onExit: _onExit
}) => {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const [tableNumber] = useState<string>(propTableNumber || urlParams?.get('qrTable') || urlParams?.get('table') || '1');
  const [token] = useState<string>(propQrToken || urlParams?.get('token') || urlParams?.get('qrToken') || '');

  // BUG-119: the real session — table, live menu, real modifier catalogue — resolved from the cloud by the QR
  // token alone. Never this device's own local db: a real guest's own phone has never seen it and never will.
  const [session, setSession] = useState<QrGuestSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState<boolean>(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // View state: 'MENU' | 'CUSTOMIZE' | 'CART' | 'TRACKING'
  const [viewState, setViewState] = useState<'MENU' | 'CUSTOMIZE' | 'CART' | 'TRACKING'>('MENU');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');

  // Customization modal state
  const [customizingItem, setCustomizingItem] = useState<GuestMenuItemVM | null>(null);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [selectedOptionIds, setSelectedOptionIds] = useState<Record<string, string[]>>({});
  const [specialNote, setSpecialNote] = useState<string>('');

  // Cart state
  const [cartItems, setCartItems] = useState<LocalCartItem[]>([]);
  const [guestName, setGuestName] = useState<string>('');
  const [guestPhone, setGuestPhone] = useState<string>('');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);

  // Order tracking state
  const [trackedOrder, setTrackedOrder] = useState<TrackedOrderVM | null>(null);
  /** Generated once per checkout attempt and resent unchanged on a retry, so a flaky mobile network never double-orders. */
  const pendingIdempotencyKeyRef = useRef<string | null>(null);

  // Resolve the table and load its real, live menu straight from the cloud.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setSessionLoading(false);
      setSessionError('This QR code is missing its verification code. Please scan the code printed on your table again.');
      return;
    }
    setSessionLoading(true);
    setSessionError(null);
    fetchQrGuestSession(token)
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setSessionError(err instanceof QrGuestApiError ? err.message : 'This table QR is currently unavailable.');
      })
      .finally(() => {
        if (!cancelled) setSessionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Deep-link straight into the live tracker when POS opens a specific guest order
  useEffect(() => {
    if (initialOrderId) {
      setTrackedOrder((prev) => prev ?? { externalOrderId: initialOrderId, tokenNumber: '', status: 'PREPARING' });
      setViewState('TRACKING');
    }
  }, [initialOrderId]);

  // Poll live status while an order is being tracked and hasn't reached a final state
  useEffect(() => {
    if (!trackedOrder || !token || TERMINAL_STATUSES.has(trackedOrder.status)) return;
    let cancelled = false;
    const orderId = trackedOrder.externalOrderId;
    const poll = async () => {
      try {
        const status = await fetchQrGuestOrderStatus(orderId, token);
        if (cancelled) return;
        setTrackedOrder((prev) =>
          prev && prev.externalOrderId === orderId
            ? { ...prev, status: status.status, tokenNumber: status.tokenNumber || prev.tokenNumber }
            : prev
        );
      } catch {
        // Offline or a blip — the last known status stays on screen; the next tick tries again.
      }
    };
    const interval = setInterval(poll, 6000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [trackedOrder?.externalOrderId, trackedOrder?.status, token]);

  const restaurantName = session?.restaurant.name || '';
  const displayTableNumber = session?.table.tableNumber || tableNumber;

  const modifierGroupsById = useMemo(() => {
    const groups = toModifierGroupVMs(session?.modifierGroups || []);
    return new Map(groups.map((g) => [g.id, g]));
  }, [session]);

  /**
   * Modifier groups actually configured for the dish being customised. These come straight from the session
   * the cloud resolved for this token — the guest UI must never invent its own option names or prices, because
   * placeQrGuestOrder re-validates every modifier against the same catalogue and rejects anything unknown.
   */
  const activeModifierGroups = useMemo(() => {
    if (!customizingItem) return [];
    return (customizingItem.modifierGroupIds || [])
      .map((id) => modifierGroupsById.get(id))
      .filter((g): g is GuestModifierGroupVM => !!g);
  }, [customizingItem, modifierGroupsById]);

  /** Flattens the current selection into real SelectedModifier records with catalog prices. */
  const buildSelectedModifiers = (): SelectedModifier[] => {
    const out: SelectedModifier[] = [];
    activeModifierGroups.forEach((group) => {
      const chosen = selectedOptionIds[group.id] || [];
      chosen.forEach((optId) => {
        const opt = group.options.find((o) => o.id === optId);
        if (!opt) return;
        out.push({
          groupId: group.id,
          groupName: group.name,
          optionId: opt.id,
          optionName: opt.name,
          priceDelta: opt.priceDelta
        });
      });
    });
    return out;
  };

  const selectedModifierDelta = useMemo(() => {
    return buildSelectedModifiers().reduce((sum, m) => sum + m.priceDelta, 0);
  }, [selectedOptionIds, activeModifierGroups]);

  /** Required groups (e.g. Spice Level) must be answered before the dish can be added. */
  const unmetRequiredGroups = useMemo(() => {
    return activeModifierGroups.filter((g) => {
      const chosen = selectedOptionIds[g.id] || [];
      const min = g.isRequired ? Math.max(1, g.minSelections || 1) : g.minSelections || 0;
      return chosen.length < min;
    });
  }, [activeModifierGroups, selectedOptionIds]);

  // Categories & Menu items — straight from the resolved session
  const categories = session?.categories || [];

  const menuItems: GuestMenuItemVM[] = useMemo(() => {
    return (session?.items || []).map((it) => ({
      id: it.externalItemId,
      name: it.name,
      description: it.description,
      categoryId: it.categoryId,
      price: it.price,
      imageUrl: it.imageUrl,
      dietaryType: it.dietaryType,
      modifierGroupIds: it.modifierGroupIds
    }));
  }, [session]);

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (activeCategory !== 'ALL' && item.categoryId !== activeCategory) return false;
      if (dietaryFilter === 'VEG' && item.dietaryType !== 'VEG' && item.dietaryType !== 'JAIN') return false;
      if (dietaryFilter === 'NON_VEG' && item.dietaryType !== 'NON_VEG') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchDesc = item.description && item.description.toLowerCase().includes(q);
        return matchName || matchDesc;
      }
      return true;
    });
  }, [menuItems, activeCategory, dietaryFilter, searchQuery]);

  // Cart Calculations
  const cartSubtotal = useMemo(() => cartItems.reduce((s, it) => s + it.totalPrice, 0), [cartItems]);
  const cartCgst = Math.round(cartSubtotal * 0.025 * 100) / 100;
  const cartSgst = Math.round(cartSubtotal * 0.025 * 100) / 100;
  const cartTax = cartCgst + cartSgst;
  const cartTotal = Math.round(cartSubtotal + cartTax);
  const totalItemCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);

  // Handle opening customizer - pre-selects each required group's first option
  const handleOpenCustomize = (item: GuestMenuItemVM) => {
    const groups = (item.modifierGroupIds || [])
      .map((id) => modifierGroupsById.get(id))
      .filter((g): g is GuestModifierGroupVM => !!g);
    const defaults: Record<string, string[]> = {};
    groups.forEach((g) => {
      defaults[g.id] = g.isRequired && g.options.length > 0 ? [g.options[0].id] : [];
    });

    setCustomizingItem(item);
    setItemQuantity(1);
    setSelectedOptionIds(defaults);
    setSpecialNote('');
    setViewState('CUSTOMIZE');
  };

  /** Toggles one catalog option, honouring the group's min/max selection rules. */
  const handleToggleModifierOption = (
    groupId: string,
    optionId: string,
    maxSelections: number,
    isRequired: boolean
  ) => {
    setSelectedOptionIds((prev) => {
      const current = prev[groupId] || [];
      const alreadyChosen = current.includes(optionId);

      // Single-select group behaves like a radio button
      if (maxSelections <= 1) {
        if (alreadyChosen && !isRequired) {
          return { ...prev, [groupId]: [] };
        }
        return { ...prev, [groupId]: [optionId] };
      }

      if (alreadyChosen) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (current.length >= maxSelections) {
        return prev;
      }
      return { ...prev, [groupId]: [...current, optionId] };
    });
  };

  // Add customized item to cart using REAL catalog modifier records
  const handleAddCustomizedToCart = () => {
    if (!customizingItem) return;
    if (unmetRequiredGroups.length > 0) return;

    const modifiers = buildSelectedModifiers();
    const unitPrice = customizingItem.price + modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
    const totalPrice = unitPrice * itemQuantity;

    const newItem: LocalCartItem = {
      cartId: `ci-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      menuItem: customizingItem,
      quantity: itemQuantity,
      selectedModifiers: modifiers,
      specialInstructions: specialNote,
      totalPrice
    };

    setCartItems((prev) => [...prev, newItem]);
    setCustomizingItem(null);
    setViewState('MENU');
  };

  // Update item quantity in cart
  const handleUpdateCartQty = (cartId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.cartId !== cartId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          const unitPrice = item.totalPrice / item.quantity;
          return {
            ...item,
            quantity: nextQty,
            totalPrice: unitPrice * nextQty
          };
        })
        .filter(Boolean) as LocalCartItem[]
    );
  };

  // Place Order through the real cloud pipeline — the same SyncedOrder row every POS/KDS already pulls from
  const handlePlaceOrder = async () => {
    if (cartItems.length === 0 || !token) return;
    setOrderError(null);
    setIsPlacingOrder(true);

    if (!pendingIdempotencyKeyRef.current) pendingIdempotencyKeyRef.current = generateIdempotencyKey();
    const idempotencyKey = pendingIdempotencyKeyRef.current;

    try {
      const confirmation = await placeQrGuestOrder({
        token,
        idempotencyKey,
        items: cartItems.map((ci) => ({
          externalItemId: ci.menuItem.id,
          quantity: ci.quantity,
          selectedOptionIds: ci.selectedModifiers.map((m) => m.optionId),
          specialInstructions: ci.specialInstructions || undefined
        })),
        orderNotes:
          cartItems
            .map((ci) => ci.specialInstructions)
            .filter(Boolean)
            .join('; ') || undefined,
        customerName: guestName.trim() || undefined,
        customerPhone: guestPhone.trim() || undefined
      });

      setTrackedOrder({
        externalOrderId: confirmation.externalOrderId,
        tokenNumber: confirmation.tokenNumber,
        totalAmount: confirmation.totalAmount,
        status: confirmation.status,
        createdAt: new Date().toISOString(),
        items: cartItems.map((ci) => ({
          id: ci.cartId,
          name: ci.menuItem.name,
          quantity: ci.quantity,
          modifierNames: ci.selectedModifiers.map((m) => m.optionName),
          specialInstructions: ci.specialInstructions || undefined,
          totalPrice: ci.totalPrice
        }))
      });
      pendingIdempotencyKeyRef.current = null;
      setCartItems([]);
      setViewState('TRACKING');
    } catch (err: unknown) {
      setOrderError(err instanceof QrGuestApiError ? err.message : 'Failed to place order. Please try again.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // ========================================================================
  // VIEW: LOADING (resolving the token against the cloud)
  // ========================================================================
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-jaman-cream text-jaman-navy flex flex-col items-center justify-center gap-3 p-6 font-sans">
        <Loader2 className="w-8 h-8 text-jaman-saffron animate-spin" />
        <p className="text-xs font-bold text-slate-500">Loading today's menu...</p>
      </div>
    );
  }

  // ========================================================================
  // VIEW: ERROR STATE (Invalid / Disabled / Unreachable QR)
  // ========================================================================
  if (sessionError || !session) {
    return (
      <div className="min-h-screen bg-jaman-cream text-jaman-navy flex flex-col justify-between items-center p-6 font-sans">
        <div className="w-full max-w-md pt-8 text-center space-y-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-jaman-navy text-white flex items-center justify-center font-black text-2xl shadow-lg border border-amber-400/40">
              J
            </div>
            <h1 className="text-xl font-black tracking-wider text-jaman-navy uppercase">JAMANVAAR</h1>
          </div>

          {/* Error Card */}
          <div className="bg-white border border-[#FED7AA] rounded-3xl p-6 shadow-xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-jaman-saffron mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-black text-jaman-navy">Table QR Code Unavailable</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                {sessionError || 'This table QR is currently inactive or has been rotated.'}
              </p>
            </div>

            <div className="bg-jaman-cream p-3 rounded-2xl border border-jaman-border text-xs font-mono font-bold text-slate-500">
              Table Reference: Table {tableNumber}
            </div>
          </div>
        </div>

        <div className="text-center text-[11px] text-slate-400 font-medium pb-4">
          Powered by JAMANVAAR Dining OS • Please ask a team member for help
        </div>
      </div>
    );
  }

  // ========================================================================
  // VIEW: ORDER TRACKING SCREEN (Live Order Status)
  // ========================================================================
  if (viewState === 'TRACKING' && trackedOrder) {
    // A QR order goes straight to the kitchen — there is no separate "accepted by cashier" step for a guest,
    // unlike a cashier building a cart on POS.
    const statuses: Array<{ key: string; label: string; sub: string }> = [
      { key: 'PREPARING', label: 'Order Placed & Cooking', sub: 'Received by kitchen & POS instantly' },
      { key: 'READY', label: 'Ready to Serve', sub: 'Being plated at kitchen station' },
      { key: 'SERVED', label: 'Served at Table', sub: 'Enjoy your delicious feast' }
    ];

    const isCancelled = trackedOrder.status === 'CANCELLED' || trackedOrder.status === 'REFUNDED';
    const currentIdx = statuses.findIndex((s) => s.key === trackedOrder.status);
    const activeStep = currentIdx !== -1 ? currentIdx : TERMINAL_STATUSES.has(trackedOrder.status) ? statuses.length - 1 : 0;

    return (
      <div className="min-h-screen bg-jaman-cream text-jaman-navy flex flex-col font-sans max-w-md mx-auto shadow-2xl border-x border-jaman-border">
        {/* Top Header */}
        <div className="bg-jaman-navy text-white p-4 sticky top-0 z-30 shadow-md flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-jaman-saffron flex items-center justify-center font-black text-sm">
              J
            </div>
            <div>
              <h2 className="text-xs font-black tracking-wider uppercase">JAMANVAAR</h2>
              <p className="text-[10px] text-amber-300 font-bold">Table {displayTableNumber} • Live Tracker</p>
            </div>
          </div>

          <button
            onClick={() => setViewState('MENU')}
            className="text-xs font-bold bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Order More</span>
          </button>
        </div>

        {/* Tracking Body */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {/* Order Summary Hero Card */}
          <div className="bg-white rounded-3xl p-5 border border-jaman-border shadow-sm space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">ORDER CONFIRMED</span>
                <h3 className="text-xl font-black font-mono text-jaman-navy">Token #{trackedOrder.tokenNumber || '—'}</h3>
                {trackedOrder.createdAt && (
                  <span className="text-xs font-bold text-slate-500">
                    Placed {new Date(trackedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>

              {typeof trackedOrder.totalAmount === 'number' && (
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-400 uppercase block">Amount</span>
                  <span className="text-lg font-black font-mono text-jaman-saffron">{formatINR(trackedOrder.totalAmount)}</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded block mt-0.5">
                    Pay at Counter
                  </span>
                </div>
              )}
            </div>
          </div>

          {isCancelled ? (
            <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 text-center space-y-1.5">
              <AlertTriangle className="w-6 h-6 text-rose-600 mx-auto" />
              <h4 className="text-sm font-black text-rose-800">This order was cancelled</h4>
              <p className="text-xs text-rose-600">Please speak to a team member at the counter.</p>
            </div>
          ) : (
            /* Live Timeline Stepper */
            <div className="bg-white rounded-3xl p-5 border border-jaman-border shadow-sm space-y-4">
              <h4 className="text-xs font-black text-jaman-navy uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-jaman-saffron" />
                <span>Live Kitchen & Service Timeline</span>
              </h4>

              <div className="space-y-4 pl-2">
                {statuses.map((step, idx) => {
                  const isPassed = idx <= activeStep;
                  const isCurrent = idx === activeStep;

                  return (
                    <div key={step.key} className="flex items-start gap-3 relative">
                      {/* Vertical connecting line */}
                      {idx < statuses.length - 1 && (
                        <div
                          className={`absolute left-3.5 top-7 bottom-0 w-0.5 ${
                            idx < activeStep ? 'bg-emerald-500' : 'bg-slate-200'
                          }`}
                        />
                      )}

                      {/* Step Icon */}
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 transition-all ${
                          isCurrent
                            ? 'bg-jaman-saffron text-white ring-4 ring-orange-100 animate-pulse'
                            : isPassed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-400 border border-slate-300'
                        }`}
                      >
                        {isPassed && !isCurrent ? (
                          <Check className="w-4 h-4 stroke-[3]" />
                        ) : (
                          <span className="text-xs font-black">{idx + 1}</span>
                        )}
                      </div>

                      {/* Step Content */}
                      <div className="flex-1 pt-0.5">
                        <div className="flex items-center justify-between">
                          <h5
                            className={`text-xs font-black ${
                              isCurrent ? 'text-jaman-saffron' : isPassed ? 'text-jaman-navy' : 'text-slate-400'
                            }`}
                          >
                            {step.label}
                          </h5>
                          {isCurrent && (
                            <span className="text-[10px] font-black bg-orange-100 text-jaman-saffron px-2 py-0.5 rounded-full">
                              IN PROGRESS
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{step.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ordered Dishes List — known only for an order placed this browsing session */}
          {trackedOrder.items && trackedOrder.items.length > 0 && (
            <div className="bg-white rounded-3xl p-5 border border-jaman-border shadow-sm space-y-3">
              <h4 className="text-xs font-black text-jaman-navy uppercase tracking-wider">
                Dishes in this Order ({trackedOrder.items.length})
              </h4>

              <div className="divide-y divide-slate-100">
                {trackedOrder.items.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-black text-jaman-navy">
                        <span className="font-mono text-jaman-saffron">{item.quantity}×</span>
                        <span>{item.name}</span>
                      </div>
                      {item.modifierNames.length > 0 && (
                        <p className="text-[10px] text-slate-500">{item.modifierNames.join(', ')}</p>
                      )}
                      {item.specialInstructions && (
                        <p className="text-[10px] text-amber-700 italic">Note: {item.specialInstructions}</p>
                      )}
                    </div>
                    <span className="font-mono font-bold text-slate-700">{formatINR(item.totalPrice)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Bar: Add more dishes */}
        <div className="p-4 bg-white border-t border-jaman-border sticky bottom-0 z-30">
          <button
            onClick={() => setViewState('MENU')}
            className="w-full py-3.5 rounded-2xl bg-jaman-navy hover:bg-[#123959] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-jaman-saffron" />
            <span>Order More Delicacies for Table {displayTableNumber}</span>
          </button>
        </div>
      </div>
    );
  }

  // ========================================================================
  // VIEW: CART & CHECKOUT DRAWER / MODAL
  // ========================================================================
  if (viewState === 'CART') {
    return (
      <div className="min-h-screen bg-jaman-cream text-jaman-navy flex flex-col font-sans max-w-md mx-auto shadow-2xl border-x border-jaman-border">
        {/* Cart Top Bar */}
        <div className="bg-white border-b border-jaman-border p-4 sticky top-0 z-30 flex items-center justify-between">
          <button
            onClick={() => setViewState('MENU')}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <h2 className="text-sm font-black text-jaman-navy">Your Table Order</h2>
            <p className="text-[11px] text-slate-500 font-bold">Table {displayTableNumber} • {totalItemCount} Items</p>
          </div>
          <div className="w-8" />
        </div>

        {/* Cart Items List */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {orderError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{orderError}</span>
            </div>
          )}

          {cartItems.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <h3 className="text-base font-black text-jaman-navy">Your cart is empty</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Explore our authentic menu and select dishes to self-order from your table.
              </p>
              <button
                onClick={() => setViewState('MENU')}
                className="mt-2 px-5 py-2.5 rounded-2xl bg-jaman-saffron text-white font-bold text-xs cursor-pointer"
              >
                Browse Menu
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Items Card */}
              <div className="bg-white rounded-3xl p-4 border border-jaman-border shadow-sm divide-y divide-slate-100">
                {cartItems.map((item) => (
                  <div key={item.cartId} className="py-3 flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        {item.menuItem.dietaryType === 'VEG' || item.menuItem.dietaryType === 'JAIN' ? (
                          <span className="w-3.5 h-3.5 border border-emerald-600 flex items-center justify-center shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                          </span>
                        ) : (
                          <span className="w-3.5 h-3.5 border border-rose-600 flex items-center justify-center shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                          </span>
                        )}
                        <h4 className="text-xs font-black text-jaman-navy">{item.menuItem.name}</h4>
                      </div>

                      {item.selectedModifiers.length > 0 && (
                        <p className="text-[10px] text-slate-500 pl-5">
                          {item.selectedModifiers.map((m) => m.optionName).join(', ')}
                        </p>
                      )}

                      {item.specialInstructions && (
                        <p className="text-[10px] text-amber-700 italic pl-5">
                          "{item.specialInstructions}"
                        </p>
                      )}

                      <div className="pl-5 pt-0.5">
                        <span className="font-mono font-black text-xs text-jaman-saffron">
                          {formatINR(item.totalPrice)}
                        </span>
                      </div>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center gap-2 bg-jaman-cream border border-jaman-border rounded-xl px-2 py-1 shrink-0">
                      <button
                        onClick={() => handleUpdateCartQty(item.cartId, -1)}
                        className="w-5 h-5 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-200 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-black font-mono w-4 text-center">{item.quantity}</span>
                      <button
                        onClick={() => handleUpdateCartQty(item.cartId, 1)}
                        className="w-5 h-5 rounded-lg flex items-center justify-center text-jaman-saffron hover:bg-orange-100 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bill Summary Card */}
              <div className="bg-white rounded-3xl p-4 border border-jaman-border shadow-sm space-y-2.5">
                <h4 className="text-xs font-black text-jaman-navy uppercase tracking-wider">Bill Breakdown</h4>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Item Subtotal</span>
                    <span className="font-mono font-bold">{formatINR(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 text-[11px]">
                    <span>CGST (2.5%)</span>
                    <span className="font-mono">{formatINR(cartCgst)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 text-[11px]">
                    <span>SGST (2.5%)</span>
                    <span className="font-mono">{formatINR(cartSgst)}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-between font-black text-sm text-jaman-navy">
                    <span>Grand Total</span>
                    <span className="font-mono text-jaman-saffron">{formatINR(cartTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Guest Details & Payment */}
              <div className="bg-white rounded-3xl p-4 border border-jaman-border shadow-sm space-y-3">
                <h4 className="text-xs font-black text-jaman-navy uppercase tracking-wider">Guest Details</h4>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Your Name (Optional)"
                    className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  />
                  <input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="Phone Number for Digital Bill (Optional)"
                    className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  />
                </div>

                {/* v1 is pay-at-counter only (BUG-119): a public, unauthenticated endpoint is not where a first cut of this feature should also integrate a payment gateway. */}
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                  <DollarSign className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="text-[11px] font-bold text-emerald-800">Pay at the counter when your order arrives.</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Place Order Bar */}
        {cartItems.length > 0 && (
          <div className="p-4 bg-white border-t border-jaman-border sticky bottom-0 z-30 space-y-2">
            <button
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder}
              className="w-full py-4 rounded-2xl bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider flex items-center justify-between px-5 shadow-lg shadow-orange-500/25 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              <span>{isPlacingOrder ? 'Sending to Kitchen...' : 'Place Order Now'}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{formatINR(cartTotal)}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
            <p className="text-[10px] text-center text-slate-400 font-medium">
              Orders flow instantly to Kitchen KOT and POS billing.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ========================================================================
  // VIEW: DISH CUSTOMIZATION MODAL
  // ========================================================================
  if (viewState === 'CUSTOMIZE' && customizingItem) {
    const unitPrice = customizingItem.price + selectedModifierDelta;
    const totalCustomPrice = unitPrice * itemQuantity;
    const canAddToCart = unmetRequiredGroups.length === 0;

    return (
      <div className="min-h-screen bg-jaman-cream text-jaman-navy flex flex-col font-sans max-w-md mx-auto shadow-2xl border-x border-jaman-border">
        {/* Customizer Top Bar */}
        <div className="bg-white border-b border-jaman-border p-4 sticky top-0 z-30 flex items-center justify-between">
          <button
            onClick={() => setViewState('MENU')}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-black text-jaman-navy">Customize Dish</h2>
          <div className="w-8" />
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {/* Dish Header */}
          <div className="bg-white rounded-3xl p-4 border border-jaman-border flex items-center gap-3">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
              {customizingItem.imageUrl ? (
                <img src={customizingItem.imageUrl} alt={customizingItem.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <UtensilsCrossed className="w-6 h-6" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-black text-jaman-navy truncate">{customizingItem.name}</h3>
              <p className="text-[11px] text-slate-500 line-clamp-1">{customizingItem.description}</p>
              <span className="font-mono font-black text-xs text-jaman-saffron mt-0.5 block">
                {formatINR(customizingItem.price)}
              </span>
            </div>
          </div>

          {/* Real modifier groups configured for this dish in the canonical catalog */}
          {activeModifierGroups.length === 0 ? (
            <div className="bg-white rounded-3xl p-4 border border-jaman-border text-center space-y-1">
              <Info className="w-5 h-5 text-slate-300 mx-auto" />
              <p className="text-[11px] text-slate-500 font-medium">
                This dish is served exactly as described by the chef. No options to choose.
              </p>
            </div>
          ) : (
            activeModifierGroups.map((group) => {
              const chosen = selectedOptionIds[group.id] || [];
              const maxSel = Math.max(1, group.maxSelections || 1);
              const isUnmet = unmetRequiredGroups.some((g) => g.id === group.id);

              return (
                <div key={group.id} className="bg-white rounded-3xl p-4 border border-jaman-border space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-black text-jaman-navy uppercase tracking-wider flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-jaman-saffron" />
                      <span>{group.name}</span>
                    </h4>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                        isUnmet
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {group.isRequired ? 'Required' : maxSel > 1 ? `Pick up to ${maxSel}` : 'Optional'}
                    </span>
                  </div>

                  <div className={maxSel > 1 ? 'space-y-2' : 'grid grid-cols-2 gap-2'}>
                    {group.options.map((opt) => {
                      const isSelected = chosen.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() =>
                            handleToggleModifierOption(group.id, opt.id, maxSel, Boolean(group.isRequired))
                          }
                          className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 text-left ${
                            isSelected
                              ? 'bg-amber-50 border-jaman-saffron text-jaman-saffron'
                              : 'border-jaman-border bg-jaman-cream text-slate-700 hover:border-[#FED7AA]'
                          }`}
                        >
                          <span className="truncate">{opt.name}</span>
                          <span className="font-mono text-[11px] shrink-0 flex items-center gap-1">
                            {opt.priceDelta > 0 ? `+${formatINR(opt.priceDelta)}` : 'FREE'}
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          {/* Cooking Instructions */}
          <div className="bg-white rounded-3xl p-4 border border-jaman-border space-y-2">
            <h4 className="text-xs font-black text-jaman-navy uppercase tracking-wider">
              Special Cooking Instructions
            </h4>
            <textarea
              value={specialNote}
              onChange={(e) => setSpecialNote(e.target.value)}
              placeholder="e.g., Less spicy, no onion-garlic, extra crispy naan..."
              rows={2}
              className="w-full bg-jaman-cream border border-jaman-border rounded-xl p-2.5 text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
            />
          </div>

          {/* Quantity Selector */}
          <div className="bg-white rounded-3xl p-4 border border-jaman-border flex items-center justify-between">
            <span className="text-xs font-black text-jaman-navy uppercase tracking-wider">Quantity</span>
            <div className="flex items-center gap-3 bg-jaman-cream border border-jaman-border rounded-xl px-3 py-1.5">
              <button
                onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-black font-mono w-6 text-center">{itemQuantity}</span>
              <button
                onClick={() => setItemQuantity((q) => q + 1)}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-jaman-saffron hover:bg-orange-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Add to Cart Button */}
        <div className="p-4 bg-white border-t border-jaman-border sticky bottom-0 z-30 space-y-2">
          {!canAddToCart && (
            <p className="text-[11px] font-bold text-rose-600 text-center">
              Please choose {unmetRequiredGroups.map((g) => g.name).join(', ')} to continue.
            </p>
          )}
          <button
            onClick={handleAddCustomizedToCart}
            disabled={!canAddToCart}
            className="w-full py-4 rounded-2xl bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider flex items-center justify-between px-5 shadow-lg transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Add to Cart</span>
            <span className="font-mono text-sm">{formatINR(totalCustomPrice)}</span>
          </button>
        </div>
      </div>
    );
  }

  // ========================================================================
  // VIEW: MAIN CANONICAL DIGITAL MENU (Mobile Hospitality View)
  // ========================================================================
  return (
    <div className="min-h-screen bg-jaman-cream text-jaman-navy flex flex-col font-sans max-w-md mx-auto shadow-2xl border-x border-jaman-border relative select-none">
      {/* Top Hospitality Header */}
      <header className="bg-jaman-navy text-white p-4 sticky top-0 z-30 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-jaman-saffron to-amber-600 flex items-center justify-center font-black text-white text-base shadow-md border border-amber-300/30">
              J
            </div>
            <div>
              <h1 className="text-xs font-black tracking-widest uppercase">JAMANVAAR</h1>
              <p className="text-[10px] text-amber-300 font-bold">{restaurantName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black bg-jaman-saffron text-white px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
              <span>📍 Table {displayTableNumber}</span>
            </span>
            {trackedOrder && (
              <button
                onClick={() => setViewState('TRACKING')}
                className="text-[10px] font-black bg-emerald-500 text-white px-2 py-1 rounded-full animate-pulse cursor-pointer"
              >
                Track Order
              </button>
            )}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search delicacies, rotis, desserts..."
            className="w-full bg-[#122B42] border border-[#1A3A58] focus:border-jaman-saffron rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-400 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Dietary Filters Pill Strip */}
        <div className="flex items-center gap-1.5 pt-0.5 overflow-x-auto scrollbar-none">
          {[
            { id: 'ALL', label: 'All Dishes' },
            { id: 'VEG', label: '🥦 Pure Veg' },
            { id: 'NON_VEG', label: '🍗 Non-Veg' }
          ].map((flt) => (
            <button
              key={flt.id}
              onClick={() => setDietaryFilter(flt.id as any)}
              className={`px-3 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                dietaryFilter === flt.id
                  ? 'bg-jaman-saffron text-white'
                  : 'bg-[#122B42] text-slate-300 hover:bg-[#1A3A58]'
              }`}
            >
              {flt.label}
            </button>
          ))}
        </div>
      </header>

      {/* Category Tabs Strip */}
      <div className="bg-white border-b border-jaman-border px-3 py-2 flex items-center gap-1.5 overflow-x-auto sticky top-[138px] z-20 shadow-2xs scrollbar-none">
        <button
          onClick={() => setActiveCategory('ALL')}
          className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
            activeCategory === 'ALL'
              ? 'bg-jaman-navy text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          All Items ({menuItems.length})
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
              activeCategory === c.id
                ? 'bg-jaman-navy text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Dishes List */}
      <div className="flex-1 p-3.5 space-y-3 pb-24 overflow-y-auto">
        {filteredMenuItems.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <UtensilsCrossed className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-xs font-black text-slate-600">No dishes match your search</h4>
            <p className="text-[11px] text-slate-400">Try changing dietary filters or search term.</p>
          </div>
        ) : (
          filteredMenuItems.map((item) => {
            const inCart = cartItems.find((ci) => ci.menuItem.id === item.id);

            return (
              <div
                key={item.id}
                className="bg-white rounded-3xl p-3.5 border border-jaman-border shadow-2xs flex gap-3 hover:border-[#FED7AA] transition-all"
              >
                {/* Image */}
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200 relative">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <UtensilsCrossed className="w-6 h-6" />
                    </div>
                  )}

                  {/* Veg / Non-Veg Indicator */}
                  <div className="absolute top-1.5 left-1.5 bg-white/90 backdrop-blur-xs p-0.5 rounded-md shadow-xs">
                    {item.dietaryType === 'VEG' || item.dietaryType === 'JAIN' ? (
                      <span className="w-3.5 h-3.5 border border-emerald-600 flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                      </span>
                    ) : (
                      <span className="w-3.5 h-3.5 border border-rose-600 flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="text-xs font-black text-jaman-navy leading-snug">{item.name}</h3>
                    </div>
                    {item.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-tight">
                        {item.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="font-mono font-black text-sm text-jaman-navy">
                      {formatINR(item.price)}
                    </span>

                    {/* Add / Stepper Button */}
                    {inCart ? (
                      <div className="flex items-center gap-1.5 bg-[#FFF4ED] border border-[#FED7AA] rounded-xl px-2 py-1">
                        <button
                          onClick={() => handleUpdateCartQty(inCart.cartId, -1)}
                          className="w-5 h-5 rounded-lg flex items-center justify-center text-jaman-saffron hover:bg-orange-100 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-black font-mono w-4 text-center text-jaman-navy">
                          {inCart.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateCartQty(inCart.cartId, 1)}
                          className="w-5 h-5 rounded-lg flex items-center justify-center text-jaman-saffron hover:bg-orange-100 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleOpenCustomize(item)}
                        className="bg-[#FFF4ED] hover:bg-jaman-saffron text-jaman-saffron hover:text-white border border-jaman-saffron/40 px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>ADD</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Bottom Cart Bar */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-3 left-3 right-3 max-w-[420px] mx-auto z-40 animate-in slide-in-from-bottom-3">
          <button
            onClick={() => setViewState('CART')}
            className="w-full py-3.5 px-4 rounded-2xl bg-jaman-navy hover:bg-[#123959] text-white flex items-center justify-between shadow-2xl border border-white/10 transition-all cursor-pointer active:scale-98"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-jaman-saffron flex items-center justify-center font-black text-xs text-white">
                {totalItemCount}
              </div>
              <div className="text-left">
                <span className="text-xs font-black block">View Table Order</span>
                <span className="text-[10px] text-slate-300">CGST & SGST included</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-sm text-amber-300">{formatINR(cartTotal)}</span>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
