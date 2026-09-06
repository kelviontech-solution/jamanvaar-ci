import React, { useEffect, useRef, useState } from 'react';
import {
  AuditRepository,
  ComboRepository,
  CouponRepository,
  CustomerRepository,
  db,
  FeedbackRepository,
  KioskRepository,
  MenuRepository,
  OrderRepository,
  ReceiptRepository,
  ServiceRequestRepository,
  TableRepository
} from '@jamanvaar/database';
import {
  CartItem,
  Category,
  ChatMessage,
  ComboDeal,
  Coupon,
  CustomerAccount,
  DietaryType,
  DiningTable,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  NetworkState,
  Order,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  ReceiptDeliveryMethod,
  SelectedModifier
} from '@jamanvaar/types';
import {
  calculateCart,
  calculateItemTotal,
  calculateItemUnitPrice,
  CustomerChatbotEngine,
  IdempotencyManager,
  RecommendationEngine,
  validateModifiers
} from '@jamanvaar/business';
import {
  Button,
  CategoryCard,
  EmptyState,
  JamanvaarLogo,
  BrandHeader,
  Logo,
  Modal,
  OfflineBanner,
  ProductCard,
  StatusBadge,
  ThermalReceiptView,
  JAMANVAARStartup
} from '@jamanvaar/ui';
import { formatDate, formatINR, formatTime, generateIdempotencyKey, generateUUID, SoundService } from '@jamanvaar/utils';
import { getTranslation, SupportedLanguage, translate, TranslationKey } from '@jamanvaar/i18n';
import { EBillService, KdsMeshService, NetworkStatusService, PaymentService, PrinterService, VoiceService } from '@jamanvaar/api';
import { SyncOutboxEngine } from '@jamanvaar/sync';
import { APP_CONSTANTS } from '@jamanvaar/config';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Bell,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  CreditCard,
  Download,
  Eye,
  FileText,
  Flame,
  Globe,
  Grid,
  Heart,
  HelpCircle,
  Info,
  Key,
  Lock,
  Mail,
  MessageCircle,
  MessageSquare,
  Minus,
  PackagePlus,
  Phone,
  PhoneCall,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  Send,
  Share2,
  ShieldAlert,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Tag,
  ThumbsUp,
  Trash2,
  Unlock,
  UserCheck,
  UtensilsCrossed,
  Volume2,
  Wallet,
  Wifi,
  WifiOff,
  X
} from 'lucide-react';

type KioskStep =
  | 'WELCOME'
  | 'ORDER_TYPE'
  | 'TABLE_SELECT'
  | 'MENU'
  | 'CHECKOUT_PAYMENT'
  | 'CONFIRMATION'
  | 'TRACKING';

export default function KioskUserApp() {
  const [dbTick, setDbTick] = useState(0);
  const [lang, setLang] = useState<SupportedLanguage>('en');
  const [step, setStep] = useState<KioskStep>('WELCOME');

  // Network Connectivity State (Section 121-129)
  const [networkState, setNetworkState] = useState<NetworkState>('ONLINE');

  // Accessibility States
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [isLargeText, setIsLargeText] = useState(false);

  // Session & Order Details
  const [sessionId, setSessionId] = useState<string>(generateUUID());
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null);
  const [guestCount, setGuestCount] = useState<number>(2);

  // Customer Account & Loyalty
  const [loggedInAccount, setLoggedInAccount] = useState<CustomerAccount | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [redeemedPoints, setRedeemedPoints] = useState<number>(0);

  // Menu Navigation States
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [dietaryFilter, setDietaryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modifier Customization Modal State
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [activeItemQuantity, setActiveItemQuantity] = useState<number>(1);
  const [selectedModifiers, setSelectedModifiers] = useState<SelectedModifier[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState<string>('');

  // Cart State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Payment State Machine
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI_QR');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('CREATED');
  const [paymentTxId, setPaymentTxId] = useState<string | null>(null);
  const [upiQrData, setUpiQrData] = useState<string | null>(null);
  const [paymentTimeLeft, setPaymentTimeLeft] = useState<number>(180);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  // Data-integrity fix: this used to be regenerated fresh inside
  // handleFinalizePayment on every call, so the IdempotencyManager.isDuplicate
  // check there could never trip — a double-tapped "Pay" button created two
  // orders. Generated once per checkout attempt (when payment starts) and
  // reused by every retry of finalizing THAT SAME attempt.
  const orderIdempotencyKeyRef = useRef<string | null>(null);

  // Confirmed Order & Auto-Print State
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [autoPrintStatus, setAutoPrintStatus] = useState<{ printed: boolean; message: string; printerName: string }>({
    printed: false,
    message: '',
    printerName: ''
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Digital E-Bill & WhatsApp Receipt States (Sections 130-152)
  const [isEBillModalOpen, setIsEBillModalOpen] = useState(false);
  const [eBillPhoneInput, setEBillPhoneInput] = useState('');
  const [selectedEBillMethod, setSelectedEBillMethod] = useState<ReceiptDeliveryMethod>('WHATSAPP');
  const [eBillSuccessMessage, setEBillSuccessMessage] = useState<string | null>(null);

  // Modals for Extra Features
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isHandoffModalOpen, setIsHandoffModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isStaffPinModalOpen, setIsStaffPinModalOpen] = useState(false);
  const [staffPin, setStaffPin] = useState('');
  const [staffOverrideActive, setStaffOverrideActive] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackTags, setFeedbackTags] = useState<string[]>([]);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Customer Chatbot Assistant ("Need Help?") State
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'cust-init',
      sender: 'ASSISTANT',
      text: 'Namaste! Welcome to JAMANVAAR. How can I help you choose your feast today?',
      timestamp: new Date().toISOString(),
      suggestions: ['What should I order?', 'Show vegetarian dishes', 'Show Jain food', 'Show today\'s offers', 'How do I pay?']
    }
  ]);

  // Inactivity Idle Timer
  const [idleSeconds, setIdleSeconds] = useState<number>(0);
  const [showIdleWarning, setShowIdleWarning] = useState<boolean>(false);
  const [idleCountdown, setIdleCountdown] = useState<number>(15);

  const t = (key: TranslationKey) => translate(key, lang);

  // Auto-configure built-in kiosk thermal printer & resume crash recovery on startup (Sections 2, 8, 17)
  useEffect(() => {
    PrinterService.autoConfigureKioskPrinter();
    PrinterService.resumeCrashRecovery();
  }, []);

  // Subscribe to Network Status
  useEffect(() => {
    const unsub = NetworkStatusService.subscribe((state) => {
      setNetworkState(state);
    });
    return unsub;
  }, []);

  // Real-time Database Subscription
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setDbTick((c) => c + 1);
    });
    return unsubscribe;
  }, []);

  // Listen to KDS updates for placed order with Live Voice & Chime notification
  useEffect(() => {
    if (!placedOrder) return;
    const unsub = KdsMeshService.subscribeToOrders((updatedOrder) => {
      if (updatedOrder.id === placedOrder.id) {
        const wasReady = placedOrder.orderStatus === 'READY';
        setPlacedOrder({ ...updatedOrder });
        if (updatedOrder.orderStatus === 'READY' && !wasReady) {
          SoundService.playSuccess();
          const readyMsg = VoiceService.getReadyMessage(
            updatedOrder.tokenNumber,
            updatedOrder.pickupCounter || '1',
            lang
          );
          VoiceService.speak(readyMsg, lang);
          showToast(`🔔 TOKEN #${updatedOrder.tokenNumber} IS READY AT COUNTER 1!`);
        }
      }
    });
    return unsub;
  }, [placedOrder, lang]);

  // Idle Timer Reset on Touch/Interaction
  const resetIdleTimer = () => {
    setIdleSeconds(0);
    if (showIdleWarning) {
      setShowIdleWarning(false);
      setIdleCountdown(15);
    }
  };

  useEffect(() => {
    if (step === 'WELCOME') return;

    const interval = setInterval(() => {
      setIdleSeconds((prev) => {
        const next = prev + 1;
        if (next >= 45 && !showIdleWarning) {
          setShowIdleWarning(true);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step, showIdleWarning]);

  // Idle Countdown
  useEffect(() => {
    if (!showIdleWarning) return;
    const interval = setInterval(() => {
      setIdleCountdown((prev) => {
        if (prev <= 1) {
          handleFullSessionReset();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showIdleWarning]);

  // Payment Countdown
  useEffect(() => {
    if (step !== 'CHECKOUT_PAYMENT' || paymentStatus === 'SUCCESS' || paymentStatus === 'EXPIRED') return;
    const interval = setInterval(() => {
      setPaymentTimeLeft((prev) => {
        if (prev <= 1) {
          setPaymentStatus('EXPIRED');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, paymentStatus]);

  // Periodic Heartbeat to Authoritative Local Service
  useEffect(() => {
    const sendHeartbeat = () => {
      if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
      const host = window.location?.hostname || 'localhost';
      fetch(`http://${host}:5178/api/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kioskId: 'KIOSK-01',
          version: '1.0.0',
          isPrinterOnline: PrinterService.isOnline()
        })
      }).catch(() => {});
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Full Session Memory Scrub (Sections 224-226: No customer data leaks)
  const handleFullSessionReset = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSessionId(generateUUID());
    orderIdempotencyKeyRef.current = null;
    setStep('WELCOME');
    setCartItems([]);
    setSelectedTable(null);
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setCustomizingItem(null);
    setSelectedModifiers([]);
    setSpecialInstructions('');
    setPaymentStatus('CREATED');
    setPaymentTxId(null);
    setPlacedOrder(null);
    setShowIdleWarning(false);
    setIdleSeconds(0);
    setLoggedInAccount(null);
    setRedeemedPoints(0);
    setStaffOverrideActive(false);
    setFeedbackSubmitted(false);
    setFeedbackTags([]);
    setEBillPhoneInput('');
    setIsChatbotOpen(false);
    setIsEBillModalOpen(false);
    setEBillSuccessMessage(null);
    setChatMessages([
      {
        id: 'cust-init',
        sender: 'ASSISTANT',
        text: 'Namaste! Welcome to JAMANVAAR. How can I help you choose your feast today?',
        timestamp: new Date().toISOString(),
        suggestions: [
          'What should I order?',
          'Show vegetarian dishes',
          'Show Jain food',
          'Show today\'s offers',
          'How do I pay?'
        ]
      }
    ]);
  };

  // Cart Calculations with loyalty redemption & staff override discounts
  const rawCalculated = calculateCart({
    items: cartItems,
    coupon: appliedCoupon
  });

  const staffDiscount = staffOverrideActive ? Math.round(rawCalculated.subtotal * 0.1) : 0;
  const netTotalPayable = Math.max(0, rawCalculated.totalPayable - redeemedPoints - staffDiscount);

  // Categories & Items from DB
  const categories = MenuRepository.getAllCategories();
  const menuItems = MenuRepository.getAllMenuItems();
  const combos = ComboRepository.getAllCombos();
  const tables = TableRepository.getAllTables();
  const kioskConfig = KioskRepository.getKioskById('KIOSK-01');
  const receiptConfig = ReceiptRepository.getConfig();

  // Filtered Menu Items
  const filteredItems = menuItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategoryId === 'ALL' || item.categoryId === selectedCategoryId;
    const matchesDietary =
      dietaryFilter === 'ALL' || item.dietaryType === dietaryFilter;
    return matchesSearch && matchesCategory && matchesDietary;
  });

  // Intelligent recommendations from RecommendationEngine
  const intelligentRecommendations = RecommendationEngine.getCartRecommendations(
    cartItems.map((ci) => ci.menuItemId)
  );

  // Handle Item Click -> If customizable, open modal, else add directly
  const handleSelectItem = (item: MenuItem) => {
    SoundService.playTap();
    resetIdleTimer();
    if (item.modifierGroupIds && item.modifierGroupIds.length > 0) {
      setCustomizingItem(item);
      setActiveItemQuantity(1);
      setSpecialInstructions('');

      // Pre-select default modifiers
      const defaults: SelectedModifier[] = [];
      const groups = item.modifierGroups || [];
      groups.forEach((g) => {
        const defOpt = g.options.find((o) => o.isDefault && o.isAvailable);
        if (defOpt) {
          defaults.push({
            groupId: g.id,
            groupName: g.name,
            optionId: defOpt.id,
            optionName: defOpt.name,
            priceDelta: defOpt.priceDelta
          });
        }
      });
      setSelectedModifiers(defaults);
    } else {
      addToCartDirect(item, 1, [], '');
    }
  };

  const addToCartDirect = (
    item: MenuItem,
    quantity: number,
    modifiers: SelectedModifier[],
    notes: string
  ) => {
    SoundService.playAdd();
    const unitPrice = calculateItemUnitPrice(item.price, modifiers);
    const itemTotal = calculateItemTotal(item.price, quantity, modifiers);

    const newCartItem: CartItem = {
      cartItemId: generateUUID(),
      menuItemId: item.id,
      item,
      quantity,
      unitPrice,
      selectedModifiers: modifiers,
      specialInstructions: notes,
      itemTotal
    };

    setCartItems((prev) => [...prev, newCartItem]);
    showToast(`${quantity}x ${item.name} ${t('added')}`);
  };

  const handleSelectCombo = (combo: ComboDeal) => {
    SoundService.playTap();
    resetIdleTimer();
    const comboItem: MenuItem = {
      id: `combo-${combo.id}`,
      categoryId: 'cat-combos',
      outletId: 'out-ahmedabad-central',
      name: combo.name,
      sku: `COMBO-${combo.id.toUpperCase()}`,
      description: combo.description,
      price: combo.basePrice,
      dietaryType: 'VEG',
      spiceLevel: 'MILD',
      isPopular: true,
      isNew: false,
      isFeatured: true,
      isAvailable: true,
      prepTimeMinutes: 15,
      allergens: [],
      modifierGroupIds: [],
      sortOrder: 1,
      imageUrl: combo.imageUrl
    };
    addToCartDirect(comboItem, 1, [], 'Chef Value Combo Package');
  };

  const handleConfirmCustomization = () => {
    if (!customizingItem) return;

    if (customizingItem.modifierGroups) {
      const validation = validateModifiers(customizingItem.modifierGroups, selectedModifiers);
      if (!validation.isValid) {
        alert(validation.errors.join('\n'));
        return;
      }
    }

    addToCartDirect(customizingItem, activeItemQuantity, selectedModifiers, specialInstructions);
    setCustomizingItem(null);
  };

  const updateCartItemQuantity = (cartItemId: string, delta: number) => {
    SoundService.playTap();
    resetIdleTimer();
    setCartItems((prev) =>
      prev
        .map((it) => {
          if (it.cartItemId !== cartItemId) return it;
          const nextQty = it.quantity + delta;
          if (nextQty <= 0) return null;
          return {
            ...it,
            quantity: nextQty,
            itemTotal: calculateItemTotal(it.item.price, nextQty, it.selectedModifiers)
          };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleApplyCoupon = () => {
    SoundService.playTap();
    resetIdleTimer();
    setCouponError(null);
    if (!couponCodeInput.trim()) return;

    const coupon = CouponRepository.getByCode(couponCodeInput.trim());
    if (!coupon) {
      setCouponError(t('invalidCoupon'));
      return;
    }

    if (rawCalculated.subtotal < coupon.minOrderValue) {
      setCouponError(`Minimum order amount of ₹${coupon.minOrderValue} required.`);
      return;
    }

    setAppliedCoupon(coupon);
    showToast(t('couponApplied'));
  };

  // Start Payment Process
  const handleProceedToPayment = async () => {
    SoundService.playTap();
    resetIdleTimer();
    if (cartItems.length === 0) return;

    // Offline payment safeguard (Section 128)
    if (networkState === 'OFFLINE' && (paymentMethod === 'UPI_QR' || paymentMethod === 'CARD_TERMINAL')) {
      setPaymentMethod('CASH_AT_COUNTER');
      showToast('Internet offline: Switched to Pay Cash at Counter 1.');
    }

    setIsCartOpen(false);
    setStep('CHECKOUT_PAYMENT');
    setPaymentTimeLeft(180);
    setPaymentStatus('WAITING_FOR_USER');

    const tempOrderId = `ord-${Date.now()}`;
    const idempKey = generateIdempotencyKey('pay');
    // One order-creation idempotency key per checkout attempt, reused by
    // every call to handleFinalizePayment for this attempt (see ref comment).
    orderIdempotencyKeyRef.current = generateIdempotencyKey('kiosk_ord');

    try {
      const res = await PaymentService.startPayment({
        orderId: tempOrderId,
        idempotencyKey: idempKey,
        amount: netTotalPayable,
        method: paymentMethod
      });
      setPaymentTxId(res.transactionId);
      if (res.qrCodeData) {
        setUpiQrData(res.qrCodeData);
      }
    } catch (e) {
      console.error('Payment initiation error:', e);
    }
  };

  // Complete Order Creation (Truthful Status: Online vs Offline)
  const handleFinalizePayment = async () => {
    resetIdleTimer();
    setIsProcessingPayment(true);

    // Fall back to a fresh key only if this was somehow reached without
    // handleStartPayment having run first — the normal path always reuses
    // the same key across retries so the duplicate check below is meaningful.
    const idempotencyKey = orderIdempotencyKeyRef.current || generateIdempotencyKey('kiosk_ord');

    if (IdempotencyManager.isDuplicate(idempotencyKey)) {
      alert('Order already being processed.');
      setIsProcessingPayment(false);
      return;
    }

    IdempotencyManager.markProcessed(idempotencyKey);

    const isCurrentlyOnline = networkState === 'ONLINE';

    // Save order in SQLite database
    const newOrder = OrderRepository.createOrder({
      idempotencyKey,
      kioskId: 'KIOSK-01',
      sessionId,
      orderType,
      tableId: selectedTable?.id,
      tableNumber: selectedTable?.tableNumber,
      guestCount,
      customerPhone: loggedInAccount?.phone || undefined,
      customerName: loggedInAccount?.name || undefined,
      items: cartItems.map((ci) => ({
        id: generateUUID(),
        orderId: '',
        menuItemId: ci.menuItemId,
        name: ci.item.name,
        sku: ci.item.sku,
        quantity: ci.quantity,
        unitPrice: ci.unitPrice,
        modifiers: ci.selectedModifiers,
        specialInstructions: ci.specialInstructions,
        totalPrice: ci.itemTotal,
        kitchenStatus: 'PENDING'
      })),
      subtotal: rawCalculated.subtotal,
      discountAmount: rawCalculated.discountAmount + redeemedPoints + staffDiscount,
      couponCode: appliedCoupon?.code,
      cgstAmount: rawCalculated.cgstAmount,
      sgstAmount: rawCalculated.sgstAmount,
      taxAmount: rawCalculated.taxAmount,
      roundOffAmount: rawCalculated.roundOffAmount,
      totalAmount: netTotalPayable,
      paymentMethod,
      paymentStatus: 'SUCCESS',
      paymentTransactionId: paymentTxId || generateUUID(),
      orderStatus: 'CONFIRMED',
      estimatedWaitMinutes: APP_CONSTANTS.DEFAULT_ESTIMATED_PREP_MINUTES,
      syncStatus: isCurrentlyOnline ? 'SYNCED' : 'SAVED_LOCALLY',
      isSynced: isCurrentlyOnline
    });

    // If offline, queue event into transactional sync outbox (Section 126)
    if (!isCurrentlyOnline) {
      SyncOutboxEngine.queueEvent('ORDER_CREATED', newOrder, 'KIOSK-01');
    }

    // Audio chime on successful order
    SoundService.playSuccess();

    // Broadcast to KDS Kitchen Mesh if online
    if (isCurrentlyOnline) {
      KdsMeshService.broadcastOrderCreated(newOrder);
    }

    // Auto dispatch thermal receipt
    PrinterService.printReceipt(newOrder);

    // If logged in, award points (10% back in points) & record order
    if (loggedInAccount) {
      const earned = Math.floor(netTotalPayable * 0.1);
      CustomerRepository.addPoints(loggedInAccount.phone, earned);
      if (redeemedPoints > 0) {
        CustomerRepository.redeemPoints(loggedInAccount.phone, redeemedPoints);
      }
    }

    // Update coupon usage
    if (appliedCoupon) {
      CouponRepository.incrementUsage(appliedCoupon.code);
    }

    AuditRepository.log({
      kioskId: 'KIOSK-01',
      action: 'ORDER_PLACED',
      category: 'ORDER',
      details: `Customer placed Order ${newOrder.orderNumber} (Token #${newOrder.tokenNumber}, Total ₹${newOrder.totalAmount}, Mode: ${isCurrentlyOnline ? 'ONLINE' : 'OFFLINE_SAVED'})`
    });

    setPlacedOrder(newOrder);
    setPaymentStatus('SUCCESS');
    setIsProcessingPayment(false);
    setStep('CONFIRMATION');

    // 1. Automatically dispatch receipt to thermal printer (Zero user prompts required)
    try {
      const activePrn = PrinterService.getActivePrinter();
      const printRes = await PrinterService.printReceipt(newOrder);
      setAutoPrintStatus({
        printed: printRes.success,
        message: printRes.message,
        printerName: activePrn.name
      });
      if (printRes.success) {
        showToast(`🖨️ Receipt automatically printed on ${activePrn.name}`);
      }
    } catch (err) {
      console.warn('Auto print dispatch error:', err);
    }

    // 2. Trigger audio chime and spoken confirmation in selected language (Hindi/Gujarati/English)
    const voiceMsg = VoiceService.getConfirmationMessage(
      newOrder.tokenNumber,
      lang,
      'STANDARD',
      isCurrentlyOnline
    );
    VoiceService.speak(voiceMsg, lang);
  };

  // Dispatch WhatsApp or SMS E-Bill
  const handleDispatchEBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placedOrder || !eBillPhoneInput) return;

    if (selectedEBillMethod === 'WHATSAPP') {
      const res = await EBillService.sendWhatsAppEBill(placedOrder, eBillPhoneInput, receiptConfig);
      if (res.success) {
        ReceiptRepository.addRecord(res.record);
        setEBillSuccessMessage(res.message);
        showToast(res.message);
      } else {
        alert(res.message);
      }
    } else if (selectedEBillMethod === 'SMS') {
      const res = await EBillService.sendSmsEBill(placedOrder, eBillPhoneInput);
      if (res.success) {
        ReceiptRepository.addRecord(res.record);
        setEBillSuccessMessage(res.message);
        showToast(res.message);
      } else {
        alert(res.message);
      }
    }
  };

  // Staff Call Service
  const handleCallStaff = () => {
    SoundService.playTap();
    resetIdleTimer();
    ServiceRequestRepository.create({
      kioskId: 'KIOSK-01',
      tableNumber: selectedTable?.tableNumber,
      sessionId,
      type: 'CALL_STAFF'
    });
    setIsStaffModalOpen(true);
  };

  // Customer Chatbot Assistant Handler
  const handleSendCustomerQuery = (queryText: string) => {
    if (!queryText.trim()) return;

    const userMsg: ChatMessage = {
      id: `cust-user-${Date.now()}`,
      sender: 'USER',
      text: queryText,
      timestamp: new Date().toISOString()
    };

    const responseMsg = CustomerChatbotEngine.processQuery(queryText);

    setChatMessages((prev) => [...prev, userMsg, responseMsg]);
    setChatInput('');
  };

  // Staff PIN Check
  const handleStaffPinVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (staffPin === '1234') {
      setStaffOverrideActive(true);
      setIsStaffPinModalOpen(false);
      setStaffPin('');
      showToast('Staff Mode Activated: 10% Manager Discount Applied');
      AuditRepository.log({
        kioskId: 'KIOSK-01',
        action: 'STAFF_OVERRIDE_PIN_SUCCESS',
        category: 'STAFF_OVERRIDE',
        details: 'Staff authenticated on Kiosk User for customer assistance'
      });
    } else {
      alert('Invalid Staff PIN (Default Demo PIN: 1234)');
    }
  };

  // Feedback Submission
  const handleSubmitFeedback = () => {
    FeedbackRepository.submit({
      orderId: placedOrder?.id,
      kioskId: 'KIOSK-01',
      rating: feedbackRating,
      tags: feedbackTags
    });
    setFeedbackSubmitted(true);
    showToast('Thank you for your valuable feedback!');
  };

  // OTP Login Handler
  const handleSendOtp = () => {
    if (!phoneInput || phoneInput.length < 10) {
      alert('Please enter a valid 10-digit mobile number');
      return;
    }
    setOtpSent(true);
    showToast('Demo OTP is: 1234');
  };

  const handleVerifyOtp = () => {
    if (otpInput === '1234' || otpInput.length === 4) {
      const account = CustomerRepository.getOrCreateAccount(phoneInput);
      setLoggedInAccount(account);
      setIsAuthModalOpen(false);
      setOtpSent(false);
      setPhoneInput('');
      setOtpInput('');
      showToast(`Welcome back, ${account.name}! (${account.loyaltyPoints} Loyalty Points Available)`);
    } else {
      alert('Invalid OTP (Demo OTP: 1234)');
    }
  };

  // Maintenance screen if locked by Admin
  if (kioskConfig && kioskConfig.isLocked) {
    return (
      <div className="min-h-screen bg-[#FBF9F5] flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="flex justify-center">
          <JamanvaarLogo variant="horizontal" size="xl" imgStyle={{ height: '80px', width: 'auto' }} />
        </div>
        <div className="mt-8 p-8 max-w-md bg-white rounded-3xl border border-[#EBE6DD] shadow-xl">
          <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-[#E66817] mb-4">
            <UtensilsCrossed className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-[#0B253A]">KIOSK TEMPORARILY UNAVAILABLE</h2>
          <p className="text-sm text-[#4A5568] mt-3 leading-relaxed">
            Our self-ordering kiosk is currently undergoing scheduled updates. Please place your order at the main counter.
          </p>
          <div className="mt-6 pt-4 border-t border-[#F3EFE6] text-xs text-[#8C9BAE] font-medium">
            JAMANVAAR • Terminal KIOSK-01
          </div>
        </div>
      </div>
    );
  }

  return (
    <JAMANVAARStartup appName="Self-Order Kiosk" appType="KIOSK" subtitle="Customer Self-Ordering Experience">
      <div
        onClick={resetIdleTimer}
        onTouchStart={resetIdleTimer}
        className={`min-h-screen flex flex-col bg-[#FBF9F5] text-[#0B253A] select-none ${
          isHighContrast ? 'contrast-125 saturate-150' : ''
        } ${isLargeText ? 'text-lg' : 'text-base'}`}
      >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-[#0B253A] text-white px-6 py-4 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-3 animate-bounce">
          <CheckCircle2 className="w-6 h-6 text-[#16A34A]" />
          <span className="font-bold text-base">{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER */}
      <header className="h-20 sm:h-24 bg-white border-b border-[#EBE6DD] px-6 flex items-center justify-between shadow-sm sticky top-0 z-30">
        {/* Left: Real JAMANVAAR Brand Identity */}
        <div className="flex items-center gap-4">
          {step !== 'WELCOME' && (
            <button
              onClick={() => {
                SoundService.playTap();
                if (step === 'MENU') setStep('ORDER_TYPE');
                else if (step === 'CHECKOUT_PAYMENT') setStep('MENU');
                else if (step === 'TABLE_SELECT') setStep('ORDER_TYPE');
                else if (step === 'ORDER_TYPE') setStep('WELCOME');
              }}
              className="w-12 h-12 rounded-2xl bg-[#FBF9F5] border border-[#EBE6DD] text-[#0B253A] hover:bg-[#F4EFE6] flex items-center justify-center transition-transform active:scale-95"
            >
              <ArrowLeft className="w-6 h-6 stroke-[2.5]" />
            </button>
          )}
          <BrandHeader
            app="KIOSK"
            logoHeight={64}
            badgeSize="sm"
            showContext={false}
          />
        </div>

        {/* Right: Controls & Network Status */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Accessibility toggle — high-contrast + large-text mode already
              existed in state/CSS but had no way to turn it on. */}
          <button
            onClick={() => {
              const next = !(isHighContrast && isLargeText);
              setIsHighContrast(next);
              setIsLargeText(next);
              showToast(next ? 'Accessibility mode on: larger text, higher contrast' : 'Accessibility mode off');
            }}
            title="Toggle larger text & higher contrast"
            aria-pressed={isHighContrast && isLargeText}
            className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all active:scale-95 ${
              isHighContrast && isLargeText
                ? 'bg-[#0B253A] border-[#0B253A] text-white'
                : 'bg-[#FBF9F5] border-[#EBE6DD] text-[#0B253A] hover:bg-[#F4EFE6]'
            }`}
          >
            <Eye className="w-5 h-5" />
          </button>

          {/* Subtle Non-Scary Network Indicator (Section 122 & 153) */}
          <button
            onClick={() => {
              const nextState = NetworkStatusService.toggleSimulatedOffline();
              showToast(`Network switched to: ${nextState}`);
            }}
            title="Click to simulate Online / Offline transition"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              networkState === 'ONLINE'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : networkState === 'SYNCING'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                networkState === 'ONLINE'
                  ? 'bg-emerald-500'
                  : networkState === 'SYNCING'
                  ? 'bg-blue-500 animate-spin'
                  : 'bg-amber-500'
              }`}
            ></span>
            <span className="hidden sm:inline">
              {networkState === 'ONLINE'
                ? 'ONLINE'
                : networkState === 'SYNCING'
                ? 'SYNCING...'
                : 'OFFLINE'}
            </span>
          </button>

          {/* Customer Chatbot Assistant Trigger ("Need Help?") */}
          <button
            onClick={() => {
              SoundService.playTap();
              setIsChatbotOpen(true);
            }}
            className="flex items-center gap-2 bg-[#E66817]/10 hover:bg-[#E66817]/20 text-[#E66817] px-3.5 py-2 rounded-xl text-xs font-bold border border-[#E66817]/30 transition-all active:scale-95"
          >
            <Bot className="w-4 h-4" />
            <span>Need Help?</span>
          </button>

          {/* Mobile Handoff QR Button */}
          <button
            onClick={() => {
              SoundService.playTap();
              setIsHandoffModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FBF9F5] border border-[#EBE6DD] text-[#0B253A] text-xs font-bold hover:bg-[#F4EFE6]"
            title="Scan QR to order on mobile phone"
          >
            <Smartphone className="w-4 h-4 text-[#E66817]" />
            <span className="hidden md:inline">Order on Phone</span>
          </button>

          {/* Call Staff Button */}
          <button
            onClick={handleCallStaff}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold text-xs hover:bg-amber-100 active:scale-95 transition-all shadow-sm"
          >
            <Bell className="w-4 h-4 text-[#E66817]" />
            <span className="hidden sm:inline">{t('callStaff')}</span>
          </button>

          {/* Customer Loyalty Profile */}
          {loggedInAccount ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-800">
              <Award className="w-4 h-4 text-emerald-600" />
              <span>{loggedInAccount.loyaltyPoints} Pts (₹{loggedInAccount.loyaltyPoints})</span>
            </div>
          ) : (
            <button
              onClick={() => {
                SoundService.playTap();
                setIsAuthModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FBF9F5] border border-[#EBE6DD] text-xs font-bold text-[#0B253A] hover:bg-[#F4EFE6]"
            >
              <UserCheck className="w-4 h-4 text-[#E66817]" />
              <span className="hidden sm:inline">Loyalty / Login</span>
            </button>
          )}

          {/* Language Switcher */}
          <div className="flex items-center bg-[#FBF9F5] border border-[#EBE6DD] p-1 rounded-xl">
            {(['en', 'hi', 'gu'] as SupportedLanguage[]).map((l) => (
              <button
                key={l}
                onClick={() => {
                  SoundService.playTap();
                  setLang(l);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                  lang === l
                    ? 'bg-[#0B253A] text-white shadow-sm'
                    : 'text-[#4A5568] hover:text-[#0B253A]'
                }`}
              >
                {l === 'en' ? 'EN' : l === 'hi' ? 'हिन्दी' : 'ગુજરાતી'}
              </button>
            ))}
          </div>

          {/* Cart Trigger Button */}
          {step === 'MENU' && (
            <button
              onClick={() => {
                SoundService.playTap();
                setIsCartOpen(true);
              }}
              className="flex items-center gap-2.5 bg-[#E66817] hover:bg-[#F27A2B] active:bg-[#D1560D] text-white px-4 py-2.5 rounded-2xl font-black text-sm shadow-lg shadow-[#E66817]/25 transition-transform active:scale-95"
            >
              <ShoppingBag className="w-4 h-4 stroke-[2.5]" />
              <span>{t('cart')}</span>
              <span className="bg-white text-[#E66817] px-2 py-0.5 rounded-full text-xs font-black">
                {cartItems.reduce((sum, it) => sum + it.quantity, 0)}
              </span>
              <span className="border-l border-white/30 pl-2">
                {formatINR(netTotalPayable)}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* STEP 1: WELCOME SCREEN */}
      {step === 'WELCOME' && (
        <div className="flex-1 flex flex-col justify-between p-8 md:p-12 relative overflow-hidden bg-gradient-to-b from-[#FBF9F5] via-[#FFFDF9] to-[#F7F2E7]">
          <div className="max-w-4xl mx-auto w-full text-center space-y-6 my-auto">
            <div className="flex justify-center pb-2">
              <JamanvaarLogo variant="horizontal" size="2xl" imgStyle={{ height: '110px', width: 'auto' }} className="drop-shadow-sm hover:scale-105 transition-transform" />
            </div>

            <div className="inline-flex items-center gap-2 bg-[#E66817]/10 border border-[#E66817]/25 px-5 py-2 rounded-full text-sm font-bold text-[#E66817] shadow-sm animate-pulse">
              <Sparkles className="w-4 h-4" />
              <span>Authentic Indian Heritage Flavors • Freshly Prepared</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-5xl font-black text-[#0B253A] tracking-tight font-serif">
                {t('welcome')}
              </h1>
              <p className="text-base sm:text-xl text-[#4A5568] max-w-2xl mx-auto font-medium leading-relaxed">
                {t('tagline')}
              </p>
            </div>

            {/* Giant Touch Button */}
            <div className="pt-4">
              <button
                onClick={() => {
                  SoundService.playTap();
                  setSessionId(generateUUID());
                  setStep('ORDER_TYPE');
                }}
                className="w-full max-w-md mx-auto py-6 px-10 bg-[#E66817] hover:bg-[#F27A2B] active:bg-[#D1560D] text-white text-2xl sm:text-3xl font-black rounded-3xl shadow-2xl shadow-[#E66817]/40 flex items-center justify-center gap-4 transition-all duration-300 transform active:scale-95 pulse-glow"
              >
                <span>{t('startOrder')}</span>
                <ChevronRight className="w-8 h-8 stroke-[3]" />
              </button>
              <p className="text-sm font-semibold text-[#8C9BAE] mt-4 tracking-wider uppercase">
                {t('touchToBegin')}
              </p>
            </div>

            {/* Featured Combos on Welcome Screen */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto pt-4 text-left">
              {combos.map((combo) => (
                <div key={combo.id} className="bg-white p-5 rounded-2xl border border-[#EBE6DD] shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#E66817] shrink-0 font-bold">
                    %
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-[#E66817] bg-[#E66817]/10 px-2 py-0.5 rounded">
                      SAVE ₹{combo.savingsAmount}
                    </span>
                    <h4 className="font-bold text-base text-[#0B253A] mt-1">{combo.name}</h4>
                    <p className="text-xs text-[#4A5568]">{combo.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Information */}
          <footer className="flex items-center justify-between text-xs text-[#8C9BAE] font-medium pt-4 border-t border-[#EBE6DD]">
            <span>Terminal KIOSK-01 • Sindhu Bhavan Road, Ahmedabad</span>
            <button
              onClick={() => setIsStaffPinModalOpen(true)}
              className="text-[11px] text-[#8C9BAE] hover:text-[#0B253A] flex items-center gap-1 opacity-60 hover:opacity-100"
            >
              <Lock className="w-3 h-3" />
              <span>Staff Mode</span>
            </button>
          </footer>
        </div>
      )}

      {/* STEP 2: ORDER TYPE SELECTION */}
      {step === 'ORDER_TYPE' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-4xl mx-auto w-full space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl sm:text-4xl font-black text-[#0B253A]">
              {t('selectOrderType')}
            </h2>
            <p className="text-base text-[#4A5568]">
              Select whether you are dining in our restaurant or packing your feast for takeaway.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-2xl">
            <button
              onClick={() => {
                SoundService.playTap();
                setOrderType('DINE_IN');
                setStep('TABLE_SELECT');
              }}
              className="bg-white p-8 rounded-3xl border-2 border-[#EBE6DD] hover:border-[#E66817] shadow-lg hover:shadow-xl flex flex-col items-center text-center space-y-4 transition-all duration-200 active:scale-95 group"
            >
              <div className="w-24 h-24 rounded-3xl bg-[#FBF9F5] border border-[#EBE6DD] group-hover:bg-[#FFF4ED] group-hover:border-[#E66817]/30 flex items-center justify-center text-[#0B253A] group-hover:text-[#E66817] transition-colors">
                <UtensilsCrossed className="w-12 h-12 stroke-[2]" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-[#0B253A] group-hover:text-[#E66817] transition-colors">
                  {t('dineIn')}
                </h3>
                <p className="text-sm text-[#4A5568] mt-1">
                  Enjoy your meal freshly served at your table
                </p>
              </div>
            </button>

            <button
              onClick={() => {
                SoundService.playTap();
                setOrderType('TAKEAWAY');
                setSelectedTable(null);
                setStep('MENU');
              }}
              className="bg-white p-8 rounded-3xl border-2 border-[#EBE6DD] hover:border-[#E66817] shadow-lg hover:shadow-xl flex flex-col items-center text-center space-y-4 transition-all duration-200 active:scale-95 group"
            >
              <div className="w-24 h-24 rounded-3xl bg-[#FBF9F5] border border-[#EBE6DD] group-hover:bg-[#FFF4ED] group-hover:border-[#E66817]/30 flex items-center justify-center text-[#0B253A] group-hover:text-[#E66817] transition-colors">
                <ShoppingBag className="w-12 h-12 stroke-[2]" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-[#0B253A] group-hover:text-[#E66817] transition-colors">
                  {t('takeaway')}
                </h3>
                <p className="text-sm text-[#4A5568] mt-1">
                  Pick up fresh packed food at Counter 1
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: DINE-IN TABLE SELECTION */}
      {step === 'TABLE_SELECT' && (
        <div className="flex-1 flex flex-col p-8 max-w-5xl mx-auto w-full space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black text-[#0B253A]">{t('selectTable')}</h2>
            <p className="text-sm text-[#4A5568]">
              Tap the table number where you are seated.
            </p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {tables.map((tbl) => (
              <button
                key={tbl.id}
                onClick={() => {
                  SoundService.playTap();
                  setSelectedTable(tbl);
                  setStep('MENU');
                }}
                className={`p-6 rounded-2xl border-2 text-center flex flex-col items-center justify-between transition-all duration-200 active:scale-95 ${
                  selectedTable?.id === tbl.id
                    ? 'bg-[#0B253A] text-white border-[#0B253A] shadow-xl'
                    : 'bg-white text-[#0B253A] border-[#EBE6DD] hover:border-[#E66817]'
                }`}
              >
                <span className="text-2xl sm:text-3xl font-black">
                  {tbl.tableNumber}
                </span>
                <span className="text-[11px] font-semibold opacity-70 mt-2">
                  {tbl.zone}
                </span>
              </button>
            ))}
          </div>

          <div className="text-center pt-4">
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                SoundService.playTap();
                setSelectedTable(null);
                setStep('MENU');
              }}
            >
              Skip Table Selection (Pick up at counter)
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: MENU CATALOG */}
      {step === 'MENU' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filter Bar */}
          <div className="bg-white border-b border-[#EBE6DD] px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="relative w-full md:w-96">
              <Search className="w-5 h-5 text-[#8C9BAE] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchDishPlaceholder')}
                className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-2xl pl-12 pr-4 py-3 text-base text-[#0B253A] placeholder-[#8C9BAE] focus:outline-none focus:ring-2 focus:ring-[#0B253A]"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
              <button
                onClick={() => {
                  SoundService.playTap();
                  setDietaryFilter('ALL');
                }}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  dietaryFilter === 'ALL'
                    ? 'bg-[#0B253A] text-white shadow-sm'
                    : 'bg-[#FBF9F5] text-[#4A5568] border border-[#EBE6DD] hover:bg-[#F4EFE6]'
                }`}
              >
                {t('allMenu')}
              </button>
              <button
                onClick={() => {
                  SoundService.playTap();
                  setDietaryFilter('VEG');
                }}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-1.5 transition-all ${
                  dietaryFilter === 'VEG'
                    ? 'bg-[#16A34A] text-white shadow-sm'
                    : 'bg-[#ECFDF5] text-[#16A34A] border border-[#A7F3D0]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current"></span>
                {t('pureVeg')}
              </button>
              <button
                onClick={() => {
                  SoundService.playTap();
                  setDietaryFilter('JAIN');
                }}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-1.5 transition-all ${
                  dietaryFilter === 'JAIN'
                    ? 'bg-[#E66817] text-white shadow-sm'
                    : 'bg-[#FFF4ED] text-[#E66817] border border-[#FDBA74]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current"></span>
                🌱 Pure Jain
              </button>
            </div>
          </div>

          {/* Sticky Category Pills Bar */}
          <div className="bg-[#FBF9F5] border-b border-[#EBE6DD] px-6 py-3 flex items-center gap-2 overflow-x-auto select-none">
            <button
              onClick={() => {
                SoundService.playTap();
                setSelectedCategoryId('ALL');
              }}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedCategoryId === 'ALL'
                  ? 'bg-[#0B253A] text-white shadow-md shadow-[#0B253A]/20'
                  : 'bg-white border border-[#EBE6DD] text-[#0B253A] hover:bg-[#F8F6F0]'
              }`}
            >
              {t('allMenu')}
            </button>

            {/* Combos & Super Saver Deals Category Pill */}
            <button
              onClick={() => {
                SoundService.playTap();
                setSelectedCategoryId('cat-combos');
              }}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm sm:text-base whitespace-nowrap flex items-center gap-2 transition-all ${
                selectedCategoryId === 'cat-combos'
                  ? 'bg-gradient-to-r from-[#E66817] to-[#F59E0B] text-white shadow-md shadow-[#E66817]/30'
                  : 'bg-white border border-[#EBE6DD] text-[#E66817] hover:bg-[#FFF4ED]'
              }`}
            >
              <span>🔥</span>
              <span>Combos & Deals ({combos.length})</span>
            </button>

            {categories.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                isSelected={selectedCategoryId === cat.id}
                onSelect={() => {
                  SoundService.playTap();
                  setSelectedCategoryId(cat.id);
                }}
              />
            ))}
          </div>

          {/* Sunmi Touch Kiosk Hero Banner & Daypart Specials Carousel */}
          <div className="px-6 md:px-8 pt-4 pb-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Banner 1: Mega Combo Deal (1-Tap Direct Add) */}
              <div
                onClick={() => {
                  const biryaniCombo = combos.find((c) => c.id === 'combo-biryani-feast') || combos[0];
                  if (biryaniCombo) {
                    handleSelectCombo(biryaniCombo);
                  }
                }}
                className="bg-gradient-to-r from-[#E66817] to-[#F59E0B] rounded-3xl p-4 sm:p-5 text-white flex items-center justify-between shadow-md cursor-pointer hover:shadow-lg transition-all group overflow-hidden relative active:scale-98"
              >
                <div className="z-10">
                  <span className="bg-white/20 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                    👑 1-Tap Combo Add
                  </span>
                  <h4 className="text-base sm:text-lg font-black mt-1">Royal Veg Biryani Feast</h4>
                  <p className="text-xs text-white/90 mt-0.5">Free Shahi Gulab Jamun & Raita • Save ₹111</p>
                  <span className="inline-block mt-2 bg-white text-[#E66817] font-black text-xs px-3 py-1.5 rounded-xl shadow-sm group-hover:bg-[#0B253A] group-hover:text-white transition-colors">
                    + Add Combo @ ₹449 ➔
                  </span>
                </div>
                <img
                  src="https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=400&q=80"
                  alt="Biryani Deal"
                  className="w-24 h-24 rounded-2xl object-cover shadow-md group-hover:scale-105 transition-transform shrink-0"
                />
              </div>

              {/* Banner 2: Gujarati Heritage Thali */}
              <div
                onClick={() => {
                  const thali = menuItems.find((m) => m.id === 'item-guj-thali') || menuItems[0];
                  if (thali) {
                    handleSelectItem(thali);
                  }
                }}
                className="bg-gradient-to-r from-[#0B253A] to-[#1E3A8A] rounded-3xl p-4 sm:p-5 text-white flex items-center justify-between shadow-md cursor-pointer hover:shadow-lg transition-all group overflow-hidden relative active:scale-98"
              >
                <div className="z-10">
                  <span className="bg-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                    ✨ Chef Signature
                  </span>
                  <h4 className="text-base sm:text-lg font-black mt-1">Gujarati Heritage Thali</h4>
                  <p className="text-xs text-white/80 mt-0.5">12 Authentic Items Special Gujarati Feast</p>
                  <span className="inline-block mt-2 bg-amber-400 text-[#0B253A] font-black text-xs px-3 py-1.5 rounded-xl shadow-sm group-hover:bg-white group-hover:text-[#0B253A] transition-colors">
                    + Add Thali @ ₹280 ➔
                  </span>
                </div>
                <img
                  src="https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?auto=format&fit=crop&w=400&q=80"
                  alt="Gujarati Thali"
                  className="w-24 h-24 rounded-2xl object-cover shadow-md group-hover:scale-105 transition-transform shrink-0"
                />
              </div>

              {/* Banner 3: Happy Hours Treat */}
              <div
                onClick={() => {
                  const coffee = menuItems.find((m) => m.id === 'item-cc-ice') || menuItems[0];
                  if (coffee) {
                    handleSelectItem(coffee);
                  }
                }}
                className="bg-gradient-to-r from-[#059669] to-[#10B981] rounded-3xl p-4 sm:p-5 text-white flex items-center justify-between shadow-md cursor-pointer hover:shadow-lg transition-all group overflow-hidden relative hidden md:flex active:scale-98"
              >
                <div className="z-10">
                  <span className="bg-white/20 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                    ☕ Beverage Offer
                  </span>
                  <h4 className="text-base sm:text-lg font-black mt-1">Cold Coffee with Ice Cream</h4>
                  <p className="text-xs text-white/90 mt-0.5">Velvety Ice Cream Scoop • 100% Arabica</p>
                  <span className="inline-block mt-2 bg-white text-emerald-800 font-black text-xs px-3 py-1.5 rounded-xl shadow-sm group-hover:bg-[#0B253A] group-hover:text-white transition-colors">
                    + Add Coffee @ ₹120 ➔
                  </span>
                </div>
                <img
                  src="https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=400&q=80"
                  alt="Cold Coffee"
                  className="w-24 h-24 rounded-2xl object-cover shadow-md group-hover:scale-105 transition-transform shrink-0"
                />
              </div>
            </div>
          </div>

          {/* Menu Items & Combos Grid */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 pb-32 space-y-8">
            {/* Show Combos Section when on ALL or Combos tab */}
            {(selectedCategoryId === 'ALL' || selectedCategoryId === 'cat-combos') && combos.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🔥</span>
                    <h3 className="text-xl sm:text-2xl font-black text-[#0B253A]">
                      Chef's Special Combo Meals
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-[#E66817] bg-[#FFF4ED] px-3 py-1 rounded-full border border-[#FDBA74]">
                    Save up to ₹111
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {combos.map((combo) => (
                    <div
                      key={combo.id}
                      className="bg-white rounded-3xl p-5 border-2 border-[#EBE6DD] hover:border-[#E66817] shadow-sm hover:shadow-xl transition-all duration-200 flex flex-col sm:flex-row gap-5 items-center justify-between"
                    >
                      <img
                        src={combo.imageUrl}
                        alt={combo.name}
                        className="w-full sm:w-36 h-36 rounded-2xl object-cover shadow-sm"
                      />
                      <div className="flex-1 flex flex-col justify-between h-full space-y-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 border border-emerald-600 flex items-center justify-center p-0.5 rounded-sm">
                              <span className="w-2 h-2 rounded-full bg-emerald-600" />
                            </span>
                            <span className="text-xs font-black uppercase text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                              Pure Veg Combo
                            </span>
                          </div>
                          <h4 className="font-black text-lg text-[#0B253A] mt-1">{combo.name}</h4>
                          <p className="text-xs text-[#4A5568] leading-relaxed line-clamp-2">{combo.description}</p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-[#EBE6DD]">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xl font-black text-[#0B253A]">₹{combo.basePrice}</span>
                              <span className="text-xs line-through text-[#8C9BAE]">₹{combo.originalPrice}</span>
                            </div>
                            <span className="text-[11px] font-bold text-emerald-600">Save ₹{combo.savingsAmount}</span>
                          </div>

                          <button
                            onClick={() => handleSelectCombo(combo)}
                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#E66817] to-[#f07d33] hover:from-[#d1590f] hover:to-[#E66817] text-white font-black text-xs sm:text-sm shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center gap-1.5"
                          >
                            <span>+ Add Combo</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Individual Dishes Grid */}
            {selectedCategoryId !== 'cat-combos' && (
              <div className="space-y-4">
                {selectedCategoryId === 'ALL' && (
                  <h3 className="text-xl sm:text-2xl font-black text-[#0B253A]">All Dishes & Specialities</h3>
                )}

                {filteredItems.length === 0 ? (
                  <EmptyState
                    title="No dishes found"
                    description="Try another search term or filter category."
                    actionText="View All Dishes"
                    onAction={() => {
                      setSelectedCategoryId('ALL');
                      setDietaryFilter('ALL');
                      setSearchQuery('');
                    }}
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredItems.map((item) => (
                      <ProductCard
                        key={item.id}
                        item={item}
                        onAdd={handleSelectItem}
                        onSelectDetails={handleSelectItem}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Centered Floating Touch Cart & Checkout Dock (Easy Ergonomic Access) */}
          {cartItems.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[92%] sm:w-auto min-w-[340px] sm:min-w-[580px] max-w-3xl bg-[#0B253A]/95 backdrop-blur-md text-white rounded-3xl p-3.5 sm:p-4 shadow-[0_20px_60px_rgba(11,37,58,0.45)] border-2 border-white/20 flex items-center justify-between gap-4 animate-slideUp">
              {/* Left Details */}
              <div
                onClick={() => {
                  SoundService.playTap();
                  setIsCartOpen(true);
                }}
                className="flex items-center gap-3.5 cursor-pointer pl-1 group select-none"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#E66817] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                  <ShoppingBag className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <div className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <span>{cartItems.reduce((s, it) => s + it.quantity, 0)} Items Added</span>
                    <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      {orderType}
                    </span>
                  </div>
                  <div className="text-xs text-white/70 font-medium mt-0.5">
                    Payable: <strong className="text-amber-300 text-sm font-black">{formatINR(netTotalPayable)}</strong>
                  </div>
                </div>
              </div>

              {/* Right Centered Action Button */}
              <div className="flex items-center gap-2">
                <Button
                  variant="accent"
                  size="lg"
                  onClick={() => {
                    SoundService.playTap();
                    setIsCartOpen(true);
                  }}
                  className="bg-gradient-to-r from-[#E66817] to-[#f07d33] hover:from-[#d55b0e] hover:to-[#e66817] text-white font-black text-sm sm:text-base px-6 sm:px-8 py-3.5 rounded-2xl shadow-xl active:scale-95 transition-all flex items-center gap-2"
                >
                  <span>{t('viewCart')} & Checkout</span>
                  <ChevronRight className="w-5 h-5 stroke-[3]" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 5: CHECKOUT & PAYMENT */}
      {step === 'CHECKOUT_PAYMENT' && (
        <div className="flex-1 flex flex-col p-6 md:p-10 max-w-5xl mx-auto w-full space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black text-[#0B253A]">{t('paymentTitle')}</h2>
            <p className="text-sm text-[#4A5568]">
              Total Payable: <span className="font-black text-[#E66817] text-lg">{formatINR(netTotalPayable)}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* UPI QR Payment */}
            <button
              onClick={() => {
                if (networkState === 'OFFLINE') {
                  showToast('Internet required for UPI QR. Please choose Pay Cash at Counter.');
                  return;
                }
                SoundService.playTap();
                setPaymentMethod('UPI_QR');
              }}
              className={`p-6 rounded-3xl border-2 text-left space-y-4 transition-all duration-200 ${
                paymentMethod === 'UPI_QR'
                  ? 'bg-white border-[#E66817] shadow-xl'
                  : 'bg-[#FBF9F5] border-[#EBE6DD] hover:bg-white'
              } ${networkState === 'OFFLINE' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="w-14 h-14 rounded-2xl bg-[#FFF4ED] text-[#E66817] flex items-center justify-center">
                  <QrCode className="w-8 h-8" />
                </div>
                {networkState === 'OFFLINE' && (
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                    Requires Internet
                  </span>
                )}
              </div>
              <div>
                <h4 className="text-xl font-bold text-[#0B253A]">{t('upiQr')}</h4>
                <p className="text-xs text-[#4A5568] mt-1">{t('upiSubtitle')}</p>
              </div>
            </button>

            {/* Card POS Payment */}
            <button
              onClick={() => {
                if (networkState === 'OFFLINE') {
                  showToast('Internet required for Card POS. Please choose Pay Cash at Counter.');
                  return;
                }
                SoundService.playTap();
                setPaymentMethod('CARD_TERMINAL');
              }}
              className={`p-6 rounded-3xl border-2 text-left space-y-4 transition-all duration-200 ${
                paymentMethod === 'CARD_TERMINAL'
                  ? 'bg-white border-[#E66817] shadow-xl'
                  : 'bg-[#FBF9F5] border-[#EBE6DD] hover:bg-white'
              } ${networkState === 'OFFLINE' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="w-14 h-14 rounded-2xl bg-[#FFF4ED] text-[#E66817] flex items-center justify-center">
                  <CreditCard className="w-8 h-8" />
                </div>
                {networkState === 'OFFLINE' && (
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                    Requires Internet
                  </span>
                )}
              </div>
              <div>
                <h4 className="text-xl font-bold text-[#0B253A]">{t('cardTerminal')}</h4>
                <p className="text-xs text-[#4A5568] mt-1">{t('cardSubtitle')}</p>
              </div>
            </button>

            {/* Cash at Counter (Always Available Offline & Online) */}
            <button
              onClick={() => {
                SoundService.playTap();
                setPaymentMethod('CASH_AT_COUNTER');
              }}
              className={`p-6 rounded-3xl border-2 text-left space-y-4 transition-all duration-200 ${
                paymentMethod === 'CASH_AT_COUNTER'
                  ? 'bg-white border-[#E66817] shadow-xl ring-2 ring-[#E66817]/20'
                  : 'bg-[#FBF9F5] border-[#EBE6DD] hover:bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="w-14 h-14 rounded-2xl bg-[#FFF4ED] text-[#E66817] flex items-center justify-center">
                  <Coins className="w-8 h-8" />
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Offline & Online
                </span>
              </div>
              <div>
                <h4 className="text-xl font-bold text-[#0B253A]">{t('cashAtCounter')}</h4>
                <p className="text-xs text-[#4A5568] mt-1">{t('cashSubtitle')}</p>
              </div>
            </button>
          </div>

          <div className="bg-white rounded-3xl p-8 border border-[#EBE6DD] shadow-lg max-w-xl mx-auto w-full text-center space-y-6">
            {paymentStatus === 'EXPIRED' ? (
              <div className="py-8 space-y-4">
                <Clock className="w-16 h-16 text-rose-500 mx-auto" />
                <h3 className="text-xl font-black text-[#0B253A]">Payment Session Expired</h3>
                <p className="text-sm text-[#4A5568]">
                  This QR/payment session timed out. Nothing was charged — start again to get a fresh code.
                </p>
                <Button
                  variant="accent"
                  size="touch"
                  className="w-full"
                  onClick={() => {
                    setPaymentStatus('CREATED');
                    setPaymentTimeLeft(180);
                  }}
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <>
            {paymentMethod === 'UPI_QR' && (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-[#4A5568]">{t('scanQrToPay')}</p>
                <div className="w-56 h-56 mx-auto bg-white p-4 rounded-2xl border-2 border-slate-900 shadow-inner flex flex-col items-center justify-center relative">
                  <QrCode className="w-44 h-44 text-[#0B253A]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-lg bg-white border border-[#EBE6DD] p-1 flex items-center justify-center shadow-md">
                      <span className="font-bold text-[10px] text-[#E66817]">JAMAN</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-[#8C9BAE] font-medium flex items-center justify-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#E66817]" />
                  <span>{t('paymentExpiresIn')}: <strong className="text-[#0B253A] font-mono">{paymentTimeLeft}s</strong></span>
                </div>
              </div>
            )}

            {paymentMethod === 'CARD_TERMINAL' && (
              <div className="py-8 space-y-4">
                <CreditCard className="w-16 h-16 text-[#E66817] mx-auto animate-bounce" />
                <h3 className="text-xl font-black text-[#0B253A]">Card Reader Waiting...</h3>
                <p className="text-sm text-[#4A5568]">Please tap, insert or swipe your debit/credit card.</p>
              </div>
            )}

            {paymentMethod === 'CASH_AT_COUNTER' && (
              <div className="py-8 space-y-4">
                <Coins className="w-16 h-16 text-[#E66817] mx-auto" />
                <h3 className="text-xl font-black text-[#0B253A]">Pay at Pickup Counter</h3>
                <p className="text-sm text-[#4A5568]">You will receive your token now. Please pay at Counter 1.</p>
              </div>
            )}

            <div className="pt-4 border-t border-[#F3EFE6]">
              <Button
                variant="accent"
                size="touch"
                className="w-full"
                isLoading={isProcessingPayment}
                onClick={handleFinalizePayment}
              >
                {paymentMethod === 'CASH_AT_COUNTER' ? 'Confirm & Get Token' : 'Simulate Payment Success'}
              </Button>
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* STEP 6: ORDER CONFIRMATION & TRUTHFUL STATUS & LIVE THERMAL RECEIPT SLIP */}
      {step === 'CONFIRMATION' && placedOrder && (
        <div className="flex-1 flex flex-col p-4 sm:p-6 max-w-6xl mx-auto w-full space-y-6">
          <div className="text-center space-y-1">
            <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-300 text-emerald-600 flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-[#0B253A] font-serif">
              {t('orderConfirmed')}
            </h2>
            <p className="text-xs text-[#4A5568]">
              {placedOrder.orderNumber} • {placedOrder.orderType} {placedOrder.tableNumber ? `(Table ${placedOrder.tableNumber})` : ''}
            </p>
            {/* Live Order Confirmed Badge */}
            <div className="pt-0.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Order Sent to Kitchen (KDS) ✓
              </span>
            </div>
          </div>

          {/* Dual Column Layout: Left (Token & Delivery) + Right (Physical Thermal Receipt Slip with Authentic Logo) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Giant Token + Delivery Options + Quick Actions */}
            <div className="lg:col-span-6 space-y-5">
              {/* GIANT TOKEN DISPLAY */}
              <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-[#EBE6DD] shadow-xl text-center space-y-2">
                <span className="text-xs font-black uppercase tracking-widest text-[#8C9BAE]">
                  {t('token')}
                </span>
                <div className="text-5xl sm:text-6xl font-black text-[#E66817] font-mono tracking-tight">
                  #{placedOrder.tokenNumber}
                </div>
                <div className="pt-1 text-xs font-bold text-[#4A5568]">
                  {t('estimatedWait')}: <span className="text-[#0B253A] font-black">{placedOrder.estimatedWaitMinutes} {t('minutes')}</span>
                </div>
                <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 py-1 px-3 rounded-full inline-block mt-1">
                  Pickup at: <strong>{placedOrder.pickupCounter || 'Counter 1'}</strong>
                </div>
              </div>

              {/* THERMAL PRINTER DISPATCH NOTIFICATION (Auto-Print Success vs Fallback Manual Print) */}
              {autoPrintStatus.printed ? (
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-3xl p-4 sm:p-5 border-2 border-emerald-300 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                        <Printer className="w-5 h-5 animate-bounce" />
                      </div>
                      <div className="text-left">
                        <h4 className="font-bold text-xs text-emerald-950">Thermal Receipt Auto-Printed</h4>
                        <p className="text-[11px] text-emerald-700 font-medium">
                          Dispatched to {autoPrintStatus.printerName || '80mm Built-in Thermal Printer'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] bg-emerald-200/80 text-emerald-900 font-bold px-2.5 py-1 rounded-full border border-emerald-400">
                      ✓ Dispensed
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800 bg-white/70 p-2 rounded-xl border border-emerald-200">
                    📄 Please collect your physical 80mm tax receipt & token slip from the printer slot below.
                  </p>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-3xl p-4 sm:p-5 border-2 border-amber-300 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
                        <Printer className="w-5 h-5" />
                      </div>
                      <div className="text-left min-w-0">
                        <h4 className="font-bold text-xs text-amber-950">Receipt Not Auto-Printed</h4>
                        <p className="text-[11px] text-amber-800 font-medium truncate">
                          {autoPrintStatus.message || 'Thermal printer offline or paper out'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={async () => {
                        const activePrn = PrinterService.getActivePrinter();
                        const res = await PrinterService.printReceipt(placedOrder);
                        if (res.success) {
                          setAutoPrintStatus({
                            printed: true,
                            message: res.message,
                            printerName: activePrn.name
                          });
                          showToast('✓ Receipt printed successfully!');
                        } else {
                          showToast(res.message);
                        }
                      }}
                      leftIcon={<Printer className="w-3.5 h-3.5" />}
                      className="font-bold shadow-sm shrink-0 text-xs"
                    >
                      🖨️ Print Receipt
                    </Button>
                  </div>
                  <p className="text-[11px] text-amber-900 bg-white/70 p-2 rounded-xl border border-amber-200">
                    ⚠️ Automatic print did not dispense. Tap <strong>Print Receipt</strong> above or choose WhatsApp / SMS E-Bill below.
                  </p>
                </div>
              )}

              {/* MULTILINGUAL AUDIO ANNOUNCEMENT (Hindi / Gujarati / English Voice) */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#EBE6DD] shadow-sm text-center space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-[#0B253A] uppercase tracking-wider flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-[#E66817]" /> Voice Order Announcement
                  </h4>
                  <span className="text-[10px] text-[#8C9BAE] font-semibold">Tap to replay</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const msg = VoiceService.getConfirmationMessage(placedOrder.tokenNumber, 'hi', 'STANDARD', true);
                      VoiceService.speak(msg, 'hi');
                      showToast('Playing Hindi confirmation voice...');
                    }}
                    className="p-2.5 bg-[#FFF4ED] hover:bg-[#FFE8D6] border border-[#FDBA74] rounded-2xl flex flex-col items-center gap-1 transition-all active:scale-95 group"
                  >
                    <span className="text-sm">🇮🇳 🔊</span>
                    <span className="text-[11px] font-bold text-[#0B253A] group-hover:text-[#E66817]">हिंदी (Hindi)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const msg = VoiceService.getConfirmationMessage(placedOrder.tokenNumber, 'gu', 'STANDARD', true);
                      VoiceService.speak(msg, 'gu');
                      showToast('Playing Gujarati confirmation voice...');
                    }}
                    className="p-2.5 bg-[#FEF3C7] hover:bg-[#FDE68A] border border-[#FCD34D] rounded-2xl flex flex-col items-center gap-1 transition-all active:scale-95 group"
                  >
                    <span className="text-sm">🇮🇳 🔊</span>
                    <span className="text-[11px] font-bold text-[#0B253A] group-hover:text-[#E66817]">ગુજરાતી (Gujarati)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const msg = VoiceService.getConfirmationMessage(placedOrder.tokenNumber, 'en', 'STANDARD', true);
                      VoiceService.speak(msg, 'en');
                      showToast('Playing English confirmation voice...');
                    }}
                    className="p-2.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#93C5FD] rounded-2xl flex flex-col items-center gap-1 transition-all active:scale-95 group"
                  >
                    <span className="text-sm">🇬🇧 🔊</span>
                    <span className="text-[11px] font-bold text-[#0B253A] group-hover:text-blue-700">English</span>
                  </button>
                </div>
              </div>

              {/* POST-PAYMENT DIGITAL RECEIPT DELIVERY OPTIONS */}
              <div className="bg-white rounded-3xl p-5 border border-[#EBE6DD] shadow-sm text-center space-y-3">
                <h4 className="font-bold text-xs text-[#0B253A] uppercase tracking-wider">
                  Digital Delivery & E-Bill Options
                </h4>

                <div className={`grid ${autoPrintStatus.printed ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'} gap-2.5`}>
                  {/* If not auto-printed, show manual print fallback button */}
                  {!autoPrintStatus.printed && (
                    <button
                      onClick={async () => {
                        const activePrn = PrinterService.getActivePrinter();
                        const res = await PrinterService.printReceipt(placedOrder);
                        if (res.success) {
                          setAutoPrintStatus({
                            printed: true,
                            message: res.message,
                            printerName: activePrn.name
                          });
                          showToast('✓ Receipt printed successfully!');
                        } else {
                          showToast(res.message);
                        }
                      }}
                      className="p-3 rounded-2xl bg-[#FBF9F5] border border-[#EBE6DD] hover:bg-[#FFF4ED] hover:border-[#E66817] flex flex-col items-center gap-1.5 transition-all active:scale-95"
                    >
                      <Printer className="w-5 h-5 text-[#E66817]" />
                      <span className="text-[11px] font-bold text-[#0B253A]">Print Slip</span>
                    </button>
                  )}

                  {/* Option 1: WhatsApp E-Bill */}
                  <button
                    onClick={() => {
                      setSelectedEBillMethod('WHATSAPP');
                      setIsEBillModalOpen(true);
                    }}
                    className="p-3 rounded-2xl bg-[#FBF9F5] border border-[#EBE6DD] hover:bg-emerald-50 hover:border-emerald-500 flex flex-col items-center gap-1.5 transition-all active:scale-95"
                  >
                    <MessageSquare className="w-5 h-5 text-emerald-600" />
                    <span className="text-[11px] font-bold text-[#0B253A]">WhatsApp E-Bill</span>
                  </button>

                  {/* Option 2: SMS E-Bill */}
                  <button
                    onClick={() => {
                      setSelectedEBillMethod('SMS');
                      setIsEBillModalOpen(true);
                    }}
                    className="p-3 rounded-2xl bg-[#FBF9F5] border border-[#EBE6DD] hover:bg-blue-50 hover:border-blue-500 flex flex-col items-center gap-1.5 transition-all active:scale-95"
                  >
                    <Phone className="w-5 h-5 text-blue-600" />
                    <span className="text-[11px] font-bold text-[#0B253A]">SMS Receipt</span>
                  </button>

                  {/* Option 3: Scannable QR Code */}
                  <button
                    onClick={() => {
                      setIsHandoffModalOpen(true);
                    }}
                    className="p-3 rounded-2xl bg-[#FBF9F5] border border-[#EBE6DD] hover:bg-purple-50 hover:border-purple-500 flex flex-col items-center gap-1.5 transition-all active:scale-95"
                  >
                    <QrCode className="w-5 h-5 text-purple-600" />
                    <span className="text-[11px] font-bold text-[#0B253A]">QR Invoice</span>
                  </button>
                </div>

                {eBillSuccessMessage && (
                  <p className="text-xs text-emerald-600 font-bold bg-emerald-50 py-1.5 rounded-xl border border-emerald-200">
                    ✓ {eBillSuccessMessage}
                  </p>
                )}
              </div>

              {/* Customer Feedback Prompt */}
              {!feedbackSubmitted ? (
                <div className="bg-white rounded-2xl p-4 border border-[#EBE6DD] shadow-sm text-center space-y-2.5">
                  <h4 className="font-bold text-[11px] text-[#0B253A] uppercase tracking-wider">How was your ordering experience?</h4>
                  <div className="flex justify-center gap-2 text-amber-400">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          SoundService.playTap();
                          setFeedbackRating(s);
                        }}
                      >
                        <Star
                          className={`w-6 h-6 ${s <= feedbackRating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                        />
                      </button>
                    ))}
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleSubmitFeedback}>
                    Submit Rating
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-emerald-600 font-bold text-center bg-emerald-50 py-2 rounded-xl border border-emerald-200">
                  ✓ Feedback recorded. Thank you!
                </p>
              )}

              {/* Action Buttons */}
              <div className="space-y-2">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    SoundService.playTap();
                    setStep('TRACKING');
                  }}
                >
                  {t('trackOrder')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleFullSessionReset}
                >
                  ← {t('newOrder')}
                </Button>
              </div>
            </div>

            {/* Right Column: Visual Thermal Receipt Slip with Authentic JAMANVAAR Brand Logo */}
            <div className="lg:col-span-6 flex flex-col items-center">
              <div className="w-full text-center pb-2">
                <span className="text-xs font-bold text-[#E66817] uppercase tracking-wider flex items-center justify-center gap-1.5">
                  <FileText className="w-4 h-4" /> Official Restaurant Receipt
                </span>
              </div>

              <ThermalReceiptView
                order={placedOrder}
                config={ReceiptRepository.getConfig()}
                onPrint={
                  !autoPrintStatus.printed
                    ? async () => {
                        const activePrn = PrinterService.getActivePrinter();
                        const res = await PrinterService.printReceipt(placedOrder);
                        if (res.success) {
                          setAutoPrintStatus({
                            printed: true,
                            message: res.message,
                            printerName: activePrn.name
                          });
                          showToast('✓ Receipt printed successfully!');
                        } else {
                          showToast(res.message);
                        }
                      }
                    : undefined
                }
                onWhatsApp={() => {
                  setSelectedEBillMethod('WHATSAPP');
                  setIsEBillModalOpen(true);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 7: LIVE KITCHEN TRACKING */}
      {step === 'TRACKING' && placedOrder && (
        <div className="flex-1 flex flex-col p-8 max-w-4xl mx-auto w-full space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black text-[#0B253A]">{t('orderStatus')}</h2>
            <p className="text-sm text-[#4A5568]">
              Live updates from JAMANVAAR Kitchen for Token <strong className="text-[#E66817]">#{placedOrder.tokenNumber}</strong>
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 border border-[#EBE6DD] shadow-lg space-y-8">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto font-bold shadow-md">
                  ✓
                </div>
                <span className="text-xs font-bold text-[#0B253A] block">{t('statusConfirmed')}</span>
              </div>

              <div className="space-y-2">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto font-bold shadow-md ${
                  placedOrder.orderStatus === 'PREPARING' || placedOrder.orderStatus === 'READY' || placedOrder.orderStatus === 'COLLECTED'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-400 border border-slate-300'
                }`}>
                  2
                </div>
                <span className="text-xs font-bold text-[#0B253A] block">{t('statusPreparing')}</span>
              </div>

              <div className="space-y-2">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto font-bold shadow-md ${
                  placedOrder.orderStatus === 'READY' || placedOrder.orderStatus === 'COLLECTED'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-400 border border-slate-300'
                }`}>
                  3
                </div>
                <span className="text-xs font-bold text-[#0B253A] block">{t('statusReady')}</span>
              </div>

              <div className="space-y-2">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto font-bold shadow-md ${
                  placedOrder.orderStatus === 'COLLECTED'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-400 border border-slate-300'
                }`}>
                  4
                </div>
                <span className="text-xs font-bold text-[#0B253A] block">{t('statusCollected')}</span>
              </div>
            </div>

            <div className="border-t border-[#F3EFE6] pt-6">
              <h4 className="font-bold text-sm text-[#0B253A] mb-3">Order Items:</h4>
              <div className="divide-y divide-slate-100">
                {placedOrder.items.map((it) => (
                  <div key={it.id} className="py-2 flex justify-between text-sm">
                    <span className="font-semibold text-[#0B253A]">
                      {it.quantity}x {it.name}
                    </span>
                    <span className="font-bold text-[#E66817]">{formatINR(it.totalPrice)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-center">
            <Button variant="accent" size="lg" onClick={handleFullSessionReset}>
              {t('newOrder')}
            </Button>
          </div>
        </div>
      )}

      {/* MODAL: DIGITAL E-BILL & WHATSAPP DELIVERY */}
      <Modal
        isOpen={isEBillModalOpen}
        onClose={() => setIsEBillModalOpen(false)}
        title={selectedEBillMethod === 'WHATSAPP' ? 'Send WhatsApp E-Bill' : 'Send SMS E-Bill'}
      >
        <form onSubmit={handleDispatchEBill} className="space-y-4 py-2">
          <p className="text-xs text-[#4A5568]">
            Enter your 10-digit mobile number to receive your official JAMANVAAR tax invoice with live tracking.
          </p>

          <div>
            <label className="block text-xs font-bold text-[#0B253A] mb-1">Mobile Number</label>
            <div className="flex gap-2">
              <span className="bg-[#FBF9F5] border border-[#EBE6DD] px-3 py-2 rounded-xl text-xs font-bold flex items-center">+91</span>
              <input
                type="tel"
                maxLength={10}
                required
                value={eBillPhoneInput}
                onChange={(e) => setEBillPhoneInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 10-digit number"
                className="flex-1 bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0B253A]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={() => setIsEBillModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" type="submit" leftIcon={<Send className="w-3.5 h-3.5" />}>
              Send {selectedEBillMethod === 'WHATSAPP' ? 'WhatsApp Bill' : 'SMS Bill'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: ITEM CUSTOMIZATION & MODIFIERS */}
      {customizingItem && (
        <Modal
          isOpen={true}
          onClose={() => setCustomizingItem(null)}
          title={customizingItem.name}
          maxWidth="2xl"
        >
          <div className="space-y-6">
            <div className="flex gap-4 items-center">
              <img
                src={customizingItem.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'}
                alt={customizingItem.name}
                className="w-24 h-24 rounded-2xl object-cover border border-[#EBE6DD]"
              />
              <div>
                <StatusBadge status={customizingItem.dietaryType} type="dietary" />
                <h3 className="text-xl font-bold text-[#0B253A] mt-1">{customizingItem.name}</h3>
                <p className="text-xs text-[#4A5568]">{customizingItem.description}</p>
                <div className="text-lg font-black text-[#E66817] mt-1">
                  {formatINR(calculateItemUnitPrice(customizingItem.price, selectedModifiers))}
                </div>
              </div>
            </div>

            {customizingItem.modifierGroups?.map((group) => (
              <div key={group.id} className="border-t border-[#F3EFE6] pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-base text-[#0B253A]">{group.name}</h4>
                    <p className="text-xs text-[#8C9BAE]">{group.description}</p>
                  </div>
                  <span className="text-xs font-semibold text-[#E66817] bg-[#E66817]/10 px-2 py-0.5 rounded">
                    {group.isRequired ? t('required') : t('optional')}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {group.options.map((opt) => {
                    const isSelected = selectedModifiers.some(
                      (m) => m.groupId === group.id && m.optionId === opt.id
                    );

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          SoundService.playTap();
                          if (group.maxSelections === 1) {
                            setSelectedModifiers((prev) => [
                              ...prev.filter((m) => m.groupId !== group.id),
                              {
                                groupId: group.id,
                                groupName: group.name,
                                optionId: opt.id,
                                optionName: opt.name,
                                priceDelta: opt.priceDelta
                              }
                            ]);
                          } else {
                            if (isSelected) {
                              setSelectedModifiers((prev) =>
                                prev.filter(
                                  (m) => !(m.groupId === group.id && m.optionId === opt.id)
                                )
                              );
                            } else {
                              setSelectedModifiers((prev) => [
                                ...prev,
                                {
                                  groupId: group.id,
                                  groupName: group.name,
                                  optionId: opt.id,
                                  optionName: opt.name,
                                  priceDelta: opt.priceDelta
                                }
                              ]);
                            }
                          }
                        }}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-[#0B253A] text-white border-[#0B253A] shadow-sm'
                            : 'bg-white text-[#0B253A] border-[#EBE6DD] hover:bg-[#F8F6F0]'
                        }`}
                      >
                        <span className="font-bold text-sm">{opt.name}</span>
                        {opt.priceDelta > 0 ? (
                          <span className={`text-xs font-semibold mt-1 ${isSelected ? 'text-[#FED7AA]' : 'text-[#E66817]'}`}>
                            +{formatINR(opt.priceDelta)}
                          </span>
                        ) : (
                          <span className="text-[10px] opacity-60 mt-1">Included</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Special Instructions */}
            <div className="border-t border-[#F3EFE6] pt-4 space-y-2">
              <label className="block text-xs font-bold text-[#0B253A]">
                {t('specialInstructions')}
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  'Less Spicy',
                  'No Onion & Garlic',
                  'Extra Gravy',
                  'Serve Separately',
                  'Make it Crispy'
                ].map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => {
                      SoundService.playTap();
                      setSpecialInstructions((prev) => (prev ? `${prev}, ${note}` : note));
                    }}
                    className="px-3 py-1 bg-[#FBF9F5] border border-[#EBE6DD] rounded-lg text-xs font-semibold hover:bg-[#F4EFE6]"
                  >
                    + {note}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder={t('notesPlaceholder')}
                className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B253A]"
              />
            </div>

            {/* Quantity Stepper & Add Button */}
            <div className="border-t border-[#F3EFE6] pt-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 bg-[#FBF9F5] border border-[#EBE6DD] px-3 py-2 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    SoundService.playTap();
                    setActiveItemQuantity((q) => Math.max(1, q - 1));
                  }}
                  className="w-8 h-8 rounded-lg bg-white border border-[#EBE6DD] flex items-center justify-center font-bold text-[#0B253A]"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-black text-lg w-6 text-center">{activeItemQuantity}</span>
                <button
                  type="button"
                  onClick={() => {
                    SoundService.playTap();
                    setActiveItemQuantity((q) => q + 1);
                  }}
                  className="w-8 h-8 rounded-lg bg-white border border-[#EBE6DD] flex items-center justify-center font-bold text-[#0B253A]"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <Button variant="accent" size="lg" className="flex-1" onClick={handleConfirmCustomization}>
                Add to Cart • {formatINR(calculateItemTotal(customizingItem.price, activeItemQuantity, selectedModifiers))}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* CART DRAWER WITH SMART RECOMMENDATIONS */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="fixed inset-0" onClick={() => setIsCartOpen(false)} />

          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between z-10 animate-slideLeft">
            <div className="p-6 border-b border-[#F3EFE6] bg-[#FBF9F5] flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-[#0B253A]">{t('orderSummary')}</h3>
                <p className="text-xs text-[#4A5568]">
                  {orderType} {selectedTable ? `• Table ${selectedTable.tableNumber}` : ''}
                </p>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="w-9 h-9 rounded-full bg-white border border-[#EBE6DD] flex items-center justify-center text-[#4A5568]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {cartItems.length === 0 ? (
                <EmptyState
                  title={t('emptyCart')}
                  description={t('emptyCartSub')}
                  actionText={t('continueShopping')}
                  onAction={() => setIsCartOpen(false)}
                />
              ) : (
                <>
                  <div className="divide-y divide-[#F3EFE6]">
                    {cartItems.map((ci) => (
                      <div key={ci.cartItemId} className="py-4 space-y-2 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-base text-[#0B253A]">{ci.item.name}</h4>
                            {ci.selectedModifiers && ci.selectedModifiers.length > 0 && (
                              <div className="text-xs text-[#8C9BAE] mt-0.5">
                                {ci.selectedModifiers.map((m) => `+ ${m.optionName}`).join(', ')}
                              </div>
                            )}
                            {ci.specialInstructions && (
                              <div className="text-xs text-rose-600 font-medium mt-0.5">
                                *{ci.specialInstructions}
                              </div>
                            )}
                          </div>
                          <span className="font-black text-base text-[#E66817]">
                            {formatINR(ci.itemTotal)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-2 bg-[#FBF9F5] border border-[#EBE6DD] px-2 py-1 rounded-xl">
                            <button
                              onClick={() => updateCartItemQuantity(ci.cartItemId, -1)}
                              className="w-6 h-6 rounded bg-white border border-[#EBE6DD] flex items-center justify-center font-bold"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-bold text-sm w-4 text-center">{ci.quantity}</span>
                            <button
                              onClick={() => updateCartItemQuantity(ci.cartItemId, 1)}
                              className="w-6 h-6 rounded bg-white border border-[#EBE6DD] flex items-center justify-center font-bold"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            onClick={() => updateCartItemQuantity(ci.cartItemId, -ci.quantity)}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-800 p-1"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Smart Recommendations Engine */}
                  {intelligentRecommendations.length > 0 && (
                    <div className="pt-4 border-t border-[#F3EFE6] space-y-2">
                      <span className="text-xs font-bold text-[#E66817] uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" /> Smart Food Pairings
                      </span>
                      <div className="space-y-2">
                        {intelligentRecommendations.map((rec) => (
                          <div key={rec.item.id} className="p-3 bg-[#FBF9F5] rounded-xl border border-[#EBE6DD] flex items-center justify-between">
                            <div className="pr-2">
                              <h5 className="font-bold text-xs text-[#0B253A]">{rec.item.name}</h5>
                              <p className="text-[10px] text-[#8C9BAE] mt-0.5 leading-tight">{rec.explanation}</p>
                              <span className="text-xs font-black text-[#E66817] mt-1 inline-block">{formatINR(rec.item.price)}</span>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleSelectItem(rec.item)}
                            >
                              + Add
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Financial Summary & Promo Coupon */}
            {cartItems.length > 0 && (
              <div className="p-6 border-t border-[#F3EFE6] bg-[#FBF9F5] space-y-4">
                {/* Coupon input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCodeInput}
                    onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                    placeholder={t('couponPlaceholder')}
                    className="flex-1 bg-white border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-[#0B253A]"
                  />
                  <Button variant="secondary" size="sm" onClick={handleApplyCoupon}>
                    {t('apply')}
                  </Button>
                </div>
                {couponError && <p className="text-xs text-rose-600 font-semibold">{couponError}</p>}

                {/* Loyalty Redemption Option */}
                {loggedInAccount && loggedInAccount.loyaltyPoints > 0 && (
                  <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs">
                    <div>
                      <span className="font-bold text-emerald-900">Redeem Loyalty Points</span>
                      <p className="text-[10px] text-emerald-700">Balance: {loggedInAccount.loyaltyPoints} Pts</p>
                    </div>
                    {redeemedPoints > 0 ? (
                      <button
                        onClick={() => setRedeemedPoints(0)}
                        className="text-xs font-bold text-rose-600"
                      >
                        Remove (₹{redeemedPoints})
                      </button>
                    ) : (
                      <button
                        onClick={() => setRedeemedPoints(Math.min(loggedInAccount.loyaltyPoints, rawCalculated.subtotal))}
                        className="px-2.5 py-1 bg-emerald-600 text-white font-bold rounded-lg"
                      >
                        Redeem ₹{Math.min(loggedInAccount.loyaltyPoints, rawCalculated.subtotal)}
                      </button>
                    )}
                  </div>
                )}

                {/* Subtotal / Tax breakdown */}
                <div className="text-xs space-y-1.5 pt-2 border-t border-[#EBE6DD]">
                  <div className="flex justify-between text-[#4A5568]">
                    <span>{t('subtotal')}</span>
                    <span>{formatINR(rawCalculated.subtotal)}</span>
                  </div>
                  {rawCalculated.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>{t('discount')} ({appliedCoupon?.code})</span>
                      <span>-{formatINR(rawCalculated.discountAmount)}</span>
                    </div>
                  )}
                  {redeemedPoints > 0 && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>Loyalty Reward Points</span>
                      <span>-{formatINR(redeemedPoints)}</span>
                    </div>
                  )}
                  {staffDiscount > 0 && (
                    <div className="flex justify-between text-indigo-600 font-bold">
                      <span>Staff Manager Discount (10%)</span>
                      <span>-{formatINR(staffDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[#4A5568]">
                    <span>{t('cgst')} (2.5%)</span>
                    <span>{formatINR(rawCalculated.cgstAmount)}</span>
                  </div>
                  <div className="flex justify-between text-[#4A5568]">
                    <span>{t('sgst')} (2.5%)</span>
                    <span>{formatINR(rawCalculated.sgstAmount)}</span>
                  </div>
                  <div className="flex justify-between text-base font-black text-[#0B253A] pt-2 border-t border-[#EBE6DD]">
                    <span>{t('totalPayable')}</span>
                    <span className="text-[#E66817] text-lg">{formatINR(netTotalPayable)}</span>
                  </div>
                </div>

                <Button
                  variant="accent"
                  size="touch"
                  className="w-full"
                  onClick={handleProceedToPayment}
                >
                  {t('proceedToPayment')}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DRAWER: CUSTOMER ASSISTANT CHATBOT ("Need Help?" / Complete Conversational Ordering) */}
      {isChatbotOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="fixed inset-0" onClick={() => setIsChatbotOpen(false)} />
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between z-10 animate-slideLeft">
            {/* Header with Live Status & Close */}
            <div className="p-5 border-b border-[#EBE6DD] bg-[#0B253A] text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#E66817] to-[#f07d33] flex items-center justify-center shadow-md">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    JAMANVAAR Assistant
                    <span className="text-[10px] bg-emerald-500 text-white font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Live AI
                    </span>
                  </h3>
                  <p className="text-xs text-white/70">Complete conversational food ordering & dietary guide</p>
                </div>
              </div>
              <button
                onClick={() => setIsChatbotOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Category Navigation Ribbon */}
            <div className="bg-[#F8F6F0] px-4 py-2.5 border-b border-[#EBE6DD] flex items-center gap-2 overflow-x-auto no-scrollbar text-xs select-none">
              {[
                { label: '🔥 Popular', q: 'Show popular dishes' },
                { label: '🎁 Combos', q: 'Show combos' },
                { label: '🍛 Starters', q: 'Show starters' },
                { label: '🍲 Mains', q: 'Show main course' },
                { label: '🍚 Biryani', q: 'Show biryani' },
                { label: '🥬 Pure Jain', q: 'Show Jain food' },
                { label: '🌱 Pure Veg', q: 'Show vegetarian dishes' },
                { label: '🏷️ Coupons', q: 'Show today\'s offers' }
              ].map((pill, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendCustomerQuery(pill.q)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-[#EBE6DD] hover:bg-[#FFF4ED] hover:border-[#E66817] text-[#0B253A] font-bold text-[11px] whitespace-nowrap shadow-xs active:scale-95 transition-all"
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Chat Stream with Interactive Dishes, Combos & Cart Summary */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-[#FBF9F5]">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'USER' ? 'items-end' : 'items-start'}`}
                >
                  {/* Text Message Bubble */}
                  <div
                    className={`max-w-[88%] p-3.5 sm:p-4 rounded-2xl text-xs whitespace-pre-wrap leading-relaxed shadow-sm ${
                      msg.sender === 'USER'
                        ? 'bg-[#0B253A] text-white rounded-br-none font-semibold'
                        : 'bg-white border border-[#EBE6DD] text-[#0B253A] rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* Visual Dish Cards in Chat Stream */}
                  {msg.actionItems && msg.actionItems.length > 0 && (
                    <div className="w-full space-y-2.5 mt-2.5">
                      {msg.actionItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 bg-white rounded-2xl border border-[#EBE6DD] shadow-sm flex items-center justify-between gap-3 hover:border-[#E66817]/40 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'}
                              alt={item.name}
                              className="w-14 h-14 rounded-xl object-cover border border-[#EBE6DD] shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <StatusBadge status={item.dietaryType} type="dietary" />
                                {item.isPopular && (
                                  <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                                    ★ Popular
                                  </span>
                                )}
                              </div>
                              <h5 className="font-bold text-xs text-[#0B253A] truncate mt-0.5">{item.name}</h5>
                              <span className="text-xs font-black text-[#E66817]">{formatINR(item.price)}</span>
                            </div>
                          </div>

                          <Button
                            variant="accent"
                            size="sm"
                            onClick={() => {
                              handleSelectItem(item);
                              showToast(`Added ${item.name} to order!`);
                            }}
                            className="shrink-0 font-bold"
                          >
                            + Add to Cart
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Visual Combo Cards in Chat Stream */}
                  {msg.actionCombos && msg.actionCombos.length > 0 && (
                    <div className="w-full space-y-2.5 mt-2.5">
                      {msg.actionCombos.map((combo) => (
                        <div
                          key={combo.id}
                          className="p-3.5 bg-gradient-to-r from-amber-50/70 to-orange-50/70 rounded-2xl border border-amber-200 shadow-sm flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <span className="text-[10px] uppercase font-black tracking-wider text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded-full inline-block">
                              Save ₹{combo.savingsAmount} Deal
                            </span>
                            <h5 className="font-bold text-xs text-[#0B253A] mt-1">{combo.name}</h5>
                            <p className="text-[10px] text-[#4A5568] line-clamp-1 mt-0.5">{combo.description}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs font-black text-[#E66817]">{formatINR(combo.basePrice)}</span>
                              <span className="text-[10px] text-[#8C9BAE] line-through">{formatINR(combo.originalPrice)}</span>
                            </div>
                          </div>

                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              handleSelectCombo(combo);
                              showToast(`Added combo package: ${combo.name}!`);
                            }}
                            className="shrink-0 font-bold"
                          >
                            + Add Combo
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick Action Suggestion Chips */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {msg.suggestions.map((sug, i) => (
                        <button
                          key={i}
                          onClick={() => handleSendCustomerQuery(sug)}
                          className="px-3 py-1 rounded-full bg-white border border-[#EBE6DD] text-[11px] font-semibold text-[#0B253A] hover:bg-[#FFF4ED] hover:border-[#E66817] shadow-xs transition-all active:scale-95"
                        >
                          💬 {sug}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Quick Sticky Checkout Bar if Cart has items */}
            {cartItems.length > 0 && (
              <div className="p-3 bg-[#0B253A] text-white flex items-center justify-between px-4 border-t border-[#EBE6DD] shadow-lg">
                <div>
                  <span className="text-xs font-bold block">{cartItems.length} items added to order</span>
                  <span className="text-xs font-black text-[#FED7AA]">Total: {formatINR(netTotalPayable)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setIsChatbotOpen(false);
                      setIsCartOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors"
                  >
                    View Cart
                  </button>
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => {
                      setIsChatbotOpen(false);
                      setStep('CHECKOUT_PAYMENT');
                    }}
                    className="font-bold shadow-md"
                  >
                    ⚡ Checkout Now
                  </Button>
                </div>
              </div>
            )}

            {/* Preloaded Touch Options Deck (Zero Typing Required for Kiosk) */}
            <div className="p-3.5 sm:p-4 border-t border-[#EBE6DD] bg-white space-y-2 select-none">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase text-[#8C9BAE] tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#E66817]" />
                  Tap Any Preloaded Option Below:
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                  1-Tap Instant Response
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Recommend best sellers')}
                  className="p-2.5 rounded-2xl bg-[#FFF4ED] hover:bg-[#FFE8D6] border border-[#FDBA74] text-left text-xs font-bold text-[#0B253A] flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">🔥</span>
                  <span>Best Sellers</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Show chef value combos')}
                  className="p-2.5 rounded-2xl bg-[#FEF3C7] hover:bg-[#FDE68A] border border-[#FCD34D] text-left text-xs font-bold text-[#0B253A] flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">👑</span>
                  <span>Value Combos</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Show pure jain dishes')}
                  className="p-2.5 rounded-2xl bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#6EE7B7] text-left text-xs font-bold text-[#0B253A] flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">🌱</span>
                  <span>Pure Jain Food</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Show gujarati thali')}
                  className="p-2.5 rounded-2xl bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#93C5FD] text-left text-xs font-bold text-[#0B253A] flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">🥘</span>
                  <span>Gujarati Thali</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Show dum biryani')}
                  className="p-2.5 rounded-2xl bg-[#FAF5FF] hover:bg-[#F3E8FF] border border-[#D8B4FE] text-left text-xs font-bold text-[#0B253A] flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">🍛</span>
                  <span>Dum Biryani</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Show cold drinks and desserts')}
                  className="p-2.5 rounded-2xl bg-[#F0FDF4] hover:bg-[#DCFCE7] border border-[#86EFAC] text-left text-xs font-bold text-[#0B253A] flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">☕</span>
                  <span>Drinks & Sweets</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Show active coupons')}
                  className="p-2.5 rounded-2xl bg-[#FFF1F2] hover:bg-[#FFE4E6] border border-[#FDA4AF] text-left text-xs font-bold text-[#0B253A] flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">🎁</span>
                  <span>Offers & Coupons</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('How do I pay?')}
                  className="p-2.5 rounded-2xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] text-left text-xs font-bold text-[#0B253A] flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">💳</span>
                  <span>Payment Help</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MOBILE HANDOFF QR */}
      <Modal
        isOpen={isHandoffModalOpen}
        onClose={() => setIsHandoffModalOpen(false)}
        title="Continue Order on Your Mobile"
      >
        <div className="text-center space-y-4 py-4">
          <p className="text-xs text-[#4A5568]">
            Scan this QR code with your phone camera to browse the menu and order directly from your mobile browser.
          </p>
          <div className="w-48 h-48 mx-auto bg-white p-4 rounded-2xl border-2 border-slate-900 shadow-md flex items-center justify-center">
            <QrCode className="w-40 h-40 text-[#0B253A]" />
          </div>
          <p className="text-xs font-mono font-bold text-[#8C9BAE]">
            https://kiosk.jamanvaar.com/m/{sessionId.substring(0, 8)}
          </p>
          <Button variant="primary" size="md" className="w-full" onClick={() => setIsHandoffModalOpen(false)}>
            Close
          </Button>
        </div>
      </Modal>

      {/* MODAL: CUSTOMER PHONE & OTP LOGIN */}
      <Modal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setOtpSent(false);
        }}
        title="Loyalty Rewards & Account Login"
      >
        <div className="space-y-4 py-2">
          {!otpSent ? (
            <>
              <p className="text-xs text-[#4A5568]">
                Enter your mobile number to check loyalty points, re-order favorites, and get exclusive rewards.
              </p>
              <div>
                <label className="block text-xs font-bold text-[#0B253A] mb-1">Mobile Number</label>
                <div className="flex gap-2">
                  <span className="bg-[#FBF9F5] border border-[#EBE6DD] px-3 py-2 rounded-xl text-xs font-bold flex items-center">+91</span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 10-digit number"
                    className="flex-1 bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0B253A]"
                  />
                </div>
              </div>
              <Button variant="accent" size="md" className="w-full" onClick={handleSendOtp}>
                Send OTP
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-[#4A5568]">
                Enter the 4-digit verification code sent to +91 {phoneInput} (Demo OTP: <strong>1234</strong>).
              </p>
              <input
                type="text"
                maxLength={4}
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                placeholder="1234"
                className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-4 py-3 text-center text-2xl font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-[#0B253A]"
              />
              <Button variant="accent" size="md" className="w-full" onClick={handleVerifyOtp}>
                Verify & Login
              </Button>
            </>
          )}
        </div>
      </Modal>

      {/* MODAL: STAFF PIN & OVERRIDES */}
      <Modal
        isOpen={isStaffPinModalOpen}
        onClose={() => setIsStaffPinModalOpen(false)}
        title="Staff Manager Mode PIN"
      >
        <form onSubmit={handleStaffPinVerify} className="space-y-4 py-2">
          <p className="text-xs text-[#4A5568]">
            Enter 4-digit staff authorization PIN to unlock manager assistance, discounts, or session cancel. (Demo PIN: <strong>1234</strong>)
          </p>
          <input
            type="password"
            maxLength={4}
            value={staffPin}
            onChange={(e) => setStaffPin(e.target.value)}
            placeholder="••••"
            className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#0B253A]"
          />
          <div className="flex gap-2">
            <Button variant="ghost" type="button" className="flex-1" onClick={() => setIsStaffPinModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" type="submit" className="flex-1">
              Verify PIN
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: STAFF ASSISTANCE CONFIRMATION */}
      <Modal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        title={t('staffAssistance')}
      >
        <div className="text-center space-y-4 py-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 text-[#E66817] flex items-center justify-center mx-auto">
            <Bell className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-[#0B253A]">Team Member Notified</h3>
          <p className="text-sm text-[#4A5568] leading-relaxed">
            {t('staffOnTheWay')}
          </p>
          <Button variant="accent" size="md" className="w-full" onClick={() => setIsStaffModalOpen(false)}>
            Close
          </Button>
        </div>
      </Modal>

      {/* MODAL: INACTIVITY IDLE WARNING */}
      {showIdleWarning && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl border-2 border-amber-400 animate-scaleUp">
            <div className="w-20 h-20 rounded-full bg-amber-50 text-[#E66817] flex items-center justify-center mx-auto">
              <Clock className="w-10 h-10 animate-spin" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black text-[#0B253A]">{t('idleWarningTitle')}</h3>
              <p className="text-sm text-[#4A5568]">
                {t('idleWarningText')} <strong className="text-rose-600 text-lg font-black">{idleCountdown} {t('seconds')}</strong>.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Button
                variant="accent"
                size="touch"
                className="w-full"
                onClick={resetIdleTimer}
              >
                {t('keepOrdering')}
              </Button>
              <button
                onClick={handleFullSessionReset}
                className="text-xs font-bold text-[#8C9BAE] hover:text-[#0B253A]"
              >
                Cancel & Reset Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING CORNER CHATBOT AI ASSISTANT TRIGGER (Bottom Right) */}
      {!isChatbotOpen && step !== 'CONFIRMATION' && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 animate-fadeIn">
          {/* Animated Speech Bubble Prompt */}
          <div
            onClick={() => {
              SoundService.playTap();
              setIsChatbotOpen(true);
            }}
            className="hidden sm:flex items-center gap-2 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-xl border border-[#EBE6DD] text-xs font-bold text-[#0B253A] cursor-pointer hover:shadow-2xl hover:border-[#E66817] transition-all group"
          >
            <Sparkles className="w-4 h-4 text-[#E66817] animate-pulse" />
            <span>Need help deciding? Ask AI Assistant</span>
            <span className="text-[10px] bg-[#E66817]/10 text-[#E66817] px-2 py-0.5 rounded-full font-black">
              24x7
            </span>
          </div>

          {/* Floating Action Button */}
          <button
            onClick={() => {
              SoundService.playTap();
              setIsChatbotOpen(true);
            }}
            className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-gradient-to-tr from-[#0B253A] to-[#163e5e] hover:from-[#E66817] hover:to-[#f07d33] text-white flex items-center justify-center shadow-2xl border-2 border-white/30 hover:scale-105 active:scale-95 transition-all relative group"
            title="JAMANVAAR Food Assistant"
          >
            <Bot className="w-7 h-7 sm:w-8 sm:h-8 group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white animate-ping" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
          </button>
        </div>
      )}
    </div>
    </JAMANVAARStartup>
  );
}
