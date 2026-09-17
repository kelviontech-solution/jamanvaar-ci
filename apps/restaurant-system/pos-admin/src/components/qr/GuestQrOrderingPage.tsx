import React, { useState, useMemo, useEffect } from 'react';
import { db, QrOrderingRepository, MenuRepository, NotificationRepository, KOTRepository } from '@jamanvaar/database';
import { lanMeshSync } from '@jamanvaar/sync';
import { MenuItem, DiningTable, Order, SelectedModifier, DietaryType, OrderStatus } from '@jamanvaar/types';
import { formatINR, generateQrDataUrl } from '@jamanvaar/utils';
import {
  Smartphone,
  Search,
  Plus,
  Minus,
  ShoppingBag,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Sparkles,
  Flame,
  ChefHat,
  Info,
  Check,
  CreditCard,
  QrCode,
  DollarSign,
  UtensilsCrossed,
  RotateCcw,
  AlertTriangle,
  Bell,
  X,
  ChevronRight,
  ShieldCheck,
  Coffee,
  Heart
} from 'lucide-react';

interface GuestQrOrderingPageProps {
  tableNumber?: string;
  qrToken?: string;
  /** Jump straight to the live tracker for an existing order (used by the POS "Guest Tracker" action). */
  initialOrderId?: string;
  onExit?: () => void;
}

interface LocalCartItem {
  cartId: string;
  menuItem: MenuItem;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  specialInstructions: string;
  totalPrice: number;
}

export const GuestQrOrderingPage: React.FC<GuestQrOrderingPageProps> = ({
  tableNumber: propTableNumber,
  qrToken: propQrToken,
  initialOrderId,
  onExit
}) => {
  // Extract table and token from props or URL query parameters
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialTableNumber = propTableNumber || urlParams?.get('qrTable') || urlParams?.get('table') || '1';
  const tableRec = db.tables.find((t) => t.tableNumber === initialTableNumber);
  const initialToken = propQrToken || urlParams?.get('token') || urlParams?.get('qrToken') || tableRec?.qrToken || '';

  const [tableNumber, setTableNumber] = useState<string>(initialTableNumber);
  const [token, setToken] = useState<string>(initialToken);

  useEffect(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const currentTableNum = propTableNumber || params?.get('qrTable') || params?.get('table') || '1';
    setTableNumber(currentTableNum);

    const tRec = db.tables.find((t) => t.tableNumber === currentTableNum);
    const currentTok = propQrToken || params?.get('token') || params?.get('qrToken') || tRec?.qrToken || '';
    setToken(currentTok);
  }, [propTableNumber, propQrToken]);

  // View state: 'MENU' | 'CUSTOMIZE' | 'CART' | 'TRACKING'
  const [viewState, setViewState] = useState<'MENU' | 'CUSTOMIZE' | 'CART' | 'TRACKING'>('MENU');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');

  // Customization modal state
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  /** Chosen modifier option ids keyed by the REAL modifier group id from db.modifierGroups. */
  const [selectedOptionIds, setSelectedOptionIds] = useState<Record<string, string[]>>({});
  const [specialNote, setSpecialNote] = useState<string>('');

  // Cart state
  const [cartItems, setCartItems] = useState<LocalCartItem[]>([]);
  const [guestName, setGuestName] = useState<string>('');
  const [guestPhone, setGuestPhone] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'UPI' | 'CASH' | 'CARD'>('UPI');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);

  // Order tracking state
  const [activeTrackedOrderId, setActiveTrackedOrderId] = useState<string | null>(initialOrderId || null);
  const [tick, setTick] = useState<number>(0);
  const [serviceRequested, setServiceRequested] = useState<boolean>(false);

  // Subscribe to DB updates for live menu sync and order status
  useEffect(() => {
    const unsub = db.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  // Deep-link straight into the live tracker when POS opens a specific guest order
  useEffect(() => {
    if (initialOrderId) {
      setActiveTrackedOrderId(initialOrderId);
      setViewState('TRACKING');
    }
  }, [initialOrderId]);

  // Verify Table & QR token
  const verification = useMemo(() => {
    return QrOrderingRepository.verifyQrToken(tableNumber, token || undefined);
  }, [tableNumber, token, tick]);

  const restaurant = db.restaurant || { name: 'JAMANVAAR RESTAURANT', city: 'Ahmedabad' };
  const outlet = db.outlet || { name: 'Ahmedabad Flagship Store' };
  const table = verification.table || db.tables.find((t) => t.tableNumber === tableNumber);

  // Live QR ordering rules configured by the restaurant admin (QR Settings tab)
  const qrSettings = useMemo(() => QrOrderingRepository.getSettings(), [tick]);

  /**
   * Modifier groups actually configured for the dish being customised.
   * These come straight out of db.modifierGroups - the guest UI must never invent
   * its own option names or prices, because createCustomerQrOrder re-validates every
   * modifier against the canonical catalog (SEC-004) and rejects anything unknown.
   */
  const activeModifierGroups = useMemo(() => {
    if (!customizingItem) return [];
    if (!qrSettings.allowCustomerModifications) return [];
    const ids = customizingItem.modifierGroupIds || [];
    return db.modifierGroups
      .filter((g) => ids.includes(g.id))
      .map((g) => ({
        ...g,
        options: g.options.filter((o) => o.isAvailable !== false)
      }))
      .filter((g) => g.options.length > 0)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [customizingItem, qrSettings.allowCustomerModifications, tick]);

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

  // Categories & Menu items
  const categories = useMemo(() => {
    return db.categories.filter((c) => c.isActive);
  }, [tick]);

  const menuItems = useMemo(() => {
    return db.menuItems.filter((m) => m.isAvailable !== false);
  }, [tick]);

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
  const cartSubtotal = useMemo(() => {
    return cartItems.reduce((s, it) => s + it.totalPrice, 0);
  }, [cartItems]);

  const cartCgst = Math.round(cartSubtotal * 0.025 * 100) / 100;
  const cartSgst = Math.round(cartSubtotal * 0.025 * 100) / 100;
  const cartTax = cartCgst + cartSgst;
  const cartTotal = Math.round(cartSubtotal + cartTax);
  const totalItemCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);

  // Active tracked order
  const trackedOrder: Order | undefined = useMemo(() => {
    if (!activeTrackedOrderId) return undefined;
    return db.orders.find((o) => o.id === activeTrackedOrderId || o.orderNumber === activeTrackedOrderId);
  }, [activeTrackedOrderId, tick, db.orders]);

  // Handle opening customizer - pre-selects each group's catalog default
  const handleOpenCustomize = (item: MenuItem) => {
    const ids = item.modifierGroupIds || [];
    const groups = db.modifierGroups.filter((g) => ids.includes(g.id));
    const defaults: Record<string, string[]> = {};
    groups.forEach((g) => {
      const available = g.options.filter((o) => o.isAvailable !== false);
      const def = available.find((o) => o.isDefault);
      if (def) {
        defaults[g.id] = [def.id];
      } else if (g.isRequired && available.length > 0) {
        defaults[g.id] = [available[0].id];
      } else {
        defaults[g.id] = [];
      }
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
      specialInstructions: qrSettings.allowSpecialInstructions ? specialNote : '',
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

  /** Real order-value guardrails configured in QR Settings. Returns null when the cart is allowed. */
  const orderValueBlockReason = useMemo(() => {
    if (cartItems.length === 0) return null;
    const min = qrSettings.minOrderValue || 0;
    const max = qrSettings.maxOrderValue || 0;
    if (min > 0 && cartTotal < min) {
      return `Minimum table order for this restaurant is ${formatINR(min)}. Please add ${formatINR(min - cartTotal)} more.`;
    }
    if (max > 0 && cartTotal > max) {
      return `Self-order limit for this table is ${formatINR(max)}. Please ask a captain to place the balance of this order.`;
    }
    return null;
  }, [cartItems.length, cartTotal, qrSettings.minOrderValue, qrSettings.maxOrderValue]);

  // Place Order through real backend pipeline
  const handlePlaceOrder = () => {
    if (cartItems.length === 0) return;
    if (orderValueBlockReason) {
      setOrderError(orderValueBlockReason);
      return;
    }
    setOrderError(null);
    setIsPlacingOrder(true);

    try {
      const newOrder = QrOrderingRepository.createCustomerQrOrder({
        tableNumber,
        token: token || undefined,
        items: cartItems.map((ci) => ({
          menuItemId: ci.menuItem.id,
          quantity: ci.quantity,
          selectedModifiers: ci.selectedModifiers,
          specialInstructions: ci.specialInstructions
        })),
        customerNotes: cartItems
          .map((ci) => ci.specialInstructions)
          .filter(Boolean)
          .join('; '),
        customerName: guestName.trim()
          ? `${guestName.trim()} (Table ${tableNumber})`
          : `Guest (Table ${tableNumber})`,
        customerPhone: guestPhone.trim() || undefined,
        paymentMethod: paymentMode
      });

      setActiveTrackedOrderId(newOrder.id);
      setCartItems([]);
      setViewState('TRACKING');

      // 4. Emit LAN Mesh real-time events so POS and KDS receive order & KOTs immediately
      try {
        lanMeshSync.broadcast('ORDER_CREATED', newOrder);
        const kots = KOTRepository.getKOTsForOrder(newOrder.id);
        if (kots.length > 0) {
          lanMeshSync.broadcast('KOT_CREATED', kots);
        }
        lanMeshSync.broadcast('TABLE_STATUS_CHANGED', {
          tableNumber,
          status: 'OCCUPIED',
          orderId: newOrder.id
        });
      } catch (syncErr) {
        console.warn('LAN Mesh sync broadcast skipped:', syncErr);
      }
    } catch (err: any) {
      setOrderError(err?.message || 'Failed to place order. Please verify table connection.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Request Table Assistance / Water
  const handleRequestService = (type: string = 'Service') => {
    NotificationRepository.createNotification({
      type: 'CAPTAIN_CALLED' as any,
      title: `🔔 Table ${tableNumber} Requests ${type}`,
      message: `Guest at Table ${tableNumber} tapped "${type}" on QR Digital Menu.`,
      priority: 'NORMAL',
      targetRoles: ['POS', 'POS_ADMIN', 'CAPTAIN', 'ALL'],
      tableNumber,
      meta: { tableNumber, serviceType: type }
    });
    setServiceRequested(true);
    setTimeout(() => setServiceRequested(false), 4000);
  };

  // ========================================================================
  // VIEW: ERROR STATE (Invalid / Disabled QR)
  // ========================================================================
  if (!verification.isValid) {
    return (
      <div className="min-h-screen bg-jaman-cream text-jaman-navy flex flex-col justify-between items-center p-6 font-sans">
        <div className="w-full max-w-md pt-8 text-center space-y-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-jaman-navy text-white flex items-center justify-center font-black text-2xl shadow-lg border border-amber-400/40">
              J
            </div>
            <h1 className="text-xl font-black tracking-wider text-jaman-navy uppercase">JAMANVAAR</h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{restaurant.name}</p>
          </div>

          {/* Error Card */}
          <div className="bg-white border border-[#FED7AA] rounded-3xl p-6 shadow-xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-jaman-saffron mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-black text-jaman-navy">Table QR Code Unavailable</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                {verification.reason || 'This table QR is currently inactive or has been rotated.'}
              </p>
            </div>

            <div className="bg-jaman-cream p-3 rounded-2xl border border-jaman-border text-xs font-mono font-bold text-slate-500">
              Table Reference: Table {tableNumber}
            </div>

            <button
              onClick={() => handleRequestService('Assistance with QR Code')}
              className="w-full py-3 rounded-2xl bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
            >
              {serviceRequested ? '✓ Staff Notified!' : 'Call Table Staff for Help'}
            </button>
          </div>
        </div>

        <div className="text-center text-[11px] text-slate-400 font-medium pb-4">
          Powered by JAMANVAAR Dining OS • Contact restaurant front desk
        </div>
      </div>
    );
  }

  // ========================================================================
  // VIEW: ORDER TRACKING SCREEN (Live Order Status)
  // ========================================================================
  if (viewState === 'TRACKING' && trackedOrder) {
    const statuses: Array<{ key: OrderStatus; label: string; sub: string }> = [
      { key: 'NEW', label: 'Order Placed', sub: 'Received by kitchen & POS' },
      { key: 'ACCEPTED', label: 'Accepted by Staff', sub: 'Confirmed by restaurant cashier' },
      { key: 'PREPARING', label: 'Cooking in Kitchen', sub: 'Freshly preparing your dishes' },
      { key: 'READY', label: 'Ready to Serve', sub: 'Being plated at kitchen station' },
      { key: 'SERVED', label: 'Served at Table', sub: 'Enjoy your delicious feast' }
    ];

    const currentIdx = statuses.findIndex((s) => s.key === trackedOrder.orderStatus);
    const activeStep = currentIdx !== -1 ? currentIdx : 0;

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
              <p className="text-[10px] text-amber-300 font-bold">Table {tableNumber} • Live Tracker</p>
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
                <h3 className="text-xl font-black font-mono text-jaman-navy">#{trackedOrder.orderNumber}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs font-black bg-jaman-saffron text-white px-2 py-0.5 rounded-md font-mono">
                    Token #{trackedOrder.tokenNumber}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    • Placed {new Date(trackedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-bold text-slate-400 uppercase block">Amount</span>
                <span className="text-lg font-black font-mono text-jaman-saffron">{formatINR(trackedOrder.totalAmount)}</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded block mt-0.5">
                  {trackedOrder.paymentMethod} • {trackedOrder.paymentStatus}
                </span>
              </div>
            </div>

            {/* Estimated time pill: sourced from the order record written by the repository */}
            {trackedOrder.estimatedWaitMinutes ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-amber-900 font-bold">
                  <Clock className="w-4 h-4 text-jaman-saffron" />
                  <span>Estimated Wait Time:</span>
                </div>
                <span className="font-black text-jaman-saffron font-mono text-sm">
                  ~{trackedOrder.estimatedWaitMinutes} mins
                </span>
              </div>
            ) : null}
          </div>

          {/* Live Timeline Stepper */}
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

          {/* Ordered Dishes List */}
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
                    {item.modifiers && item.modifiers.length > 0 && (
                      <p className="text-[10px] text-slate-500">
                        {item.modifiers.map((m) => m.optionName).join(', ')}
                      </p>
                    )}
                    {item.specialInstructions && (
                      <p className="text-[10px] text-amber-700 italic">
                        Note: {item.specialInstructions}
                      </p>
                    )}
                  </div>
                  <span className="font-mono font-bold text-slate-700">{formatINR(item.totalPrice)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Assistance quick buttons */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => handleRequestService('Water')}
              className="py-3 px-3 rounded-2xl bg-white border border-jaman-border hover:bg-slate-50 font-bold text-xs text-slate-700 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span>💧 Request Water</span>
            </button>
            <button
              onClick={() => handleRequestService('Cutlery / Napkins')}
              className="py-3 px-3 rounded-2xl bg-white border border-jaman-border hover:bg-slate-50 font-bold text-xs text-slate-700 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span>🍴 Request Cutlery</span>
            </button>
          </div>

          {serviceRequested && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-center text-xs font-bold text-emerald-800 animate-in fade-in">
              ✓ Table captain notified! Someone will assist you shortly.
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
            <span>Order More Delicacies for Table {tableNumber}</span>
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
            <p className="text-[11px] text-slate-500 font-bold">Table {tableNumber} • {totalItemCount} Items</p>
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
                        {item.menuItem.dietaryType === 'VEG' ? (
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

                      {item.selectedModifiers && item.selectedModifiers.length > 0 && (
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

              {/* Guest Details & Payment Mode */}
              <div className="bg-white rounded-3xl p-4 border border-jaman-border shadow-sm space-y-3">
                <h4 className="text-xs font-black text-jaman-navy uppercase tracking-wider">Guest & Payment</h4>

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

                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Payment Preference</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'UPI', label: 'UPI QR', icon: QrCode },
                      { id: 'CASH', label: 'Pay at Counter', icon: DollarSign },
                      { id: 'CARD', label: 'Card', icon: CreditCard }
                    ].map((mode) => {
                      const Icon = mode.icon;
                      const isSel = paymentMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          onClick={() => setPaymentMode(mode.id as any)}
                          className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                            isSel
                              ? 'bg-amber-50 border-jaman-saffron text-jaman-saffron font-black'
                              : 'border-jaman-border bg-jaman-cream text-slate-600 font-bold'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="text-[10px]">{mode.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Place Order Bar */}
        {cartItems.length > 0 && (
          <div className="p-4 bg-white border-t border-jaman-border sticky bottom-0 z-30 space-y-2">
            {orderValueBlockReason && (
              <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-center">
                {orderValueBlockReason}
              </p>
            )}
            <button
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder || Boolean(orderValueBlockReason)}
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
                {qrSettings.allowCustomerModifications
                  ? 'This dish is served exactly as described by the chef. No options to choose.'
                  : 'Dish customisation is currently turned off by the restaurant.'}
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

                  {group.description && (
                    <p className="text-[11px] text-slate-500 leading-tight">{group.description}</p>
                  )}

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
          {qrSettings.allowSpecialInstructions && (
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
          )}

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
              <p className="text-[10px] text-amber-300 font-bold">{outlet.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black bg-jaman-saffron text-white px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
              <span>📍 Table {tableNumber}</span>
            </span>
            {activeTrackedOrderId && (
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
                    {item.spiceLevel && item.spiceLevel !== 'NONE' && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700">
                        <Flame className="w-3 h-3 text-jaman-saffron" />
                        <span>{item.spiceLevel}</span>
                      </div>
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
