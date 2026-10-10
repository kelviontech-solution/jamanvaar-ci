import { DeviceCommandRunner } from '@jamanvaar/sync';
import { KioskWelcomeScreen } from '@jamanvaar/ui';
import { KioskConfigurationRepository } from '@jamanvaar/database';
import { welcomePresentation, welcomeBackgroundUrl, welcomeLandscapeUrl, WelcomeImageCache, resolveMenuImage } from '@jamanvaar/utils';
import { kioskActivationError } from './activationErrors';
import { resetTerminal } from './cloud/cloudClient';
import { syncKioskConfiguration } from '@jamanvaar/sync';
import { syncStaffUsers } from '@jamanvaar/sync';
import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { KioskProductCard } from './KioskProductCard';
import { KioskReceiptDeliveryDialog, type ReceiptDeliveryChannel, type ReceiptDeliveryResult } from './KioskReceiptDeliveryDialog';
import { useKioskConfirmationReturn } from './useKioskConfirmationReturn';
import { cancelAbandonedKioskDraft, confirmKioskCashOrder } from './kioskOrderLifecycle';
import {
  activateKioskDevice,
  resolveRestaurantByCode,
  syncRestaurantIdentity,
  RESTAURANT_CODE_RE,
  isKioskDeviceConnected,
  getKioskDeviceId,
  getKioskRestaurantId,
  createPaymentOrder,
  createPaymentQr,
  markPaymentFulfilled,
  claimKitchenTicket,
  savePendingPayment,
  loadPendingPayment,
  clearPendingPayment,
  getPaymentOrderStatus,
  sendReceipt,
  emailReceipt,
  whatsappReceipt,
  pushOrderSync,
  pullOrderSync,
  reportHeartbeat, reportCustomerAiQuery,
  pushEntitySync,
  pullEntitySync,
  CloudApiError,
  type CartLinePayload, leaseNumberBlock, verifyManagerPin } from './cloud/cloudClient';
import {
  AuditRepository,
  ComboRepository,
  CouponRepository,
  CustomerRepository,
  db,
  KeyValueStore,
  FeedbackRepository,
  KioskDisplaySettingsRepository,
  KioskRepository,
  KOTRepository,
  MenuRepository,
  OrderRepository,
  ReceiptRepository,
  ServiceMessages,
  ServiceRequestRepository,
  TableRepository,
  WelcomeScreenSettingsRepository,
  StaffRepository,
  RestaurantIdentityRepository,
  KioskLocalPrinterRepository
} from '@jamanvaar/database';
import { KioskPrinterSettingsModal } from './KioskPrinterSettingsModal';
import {
  CartItem,
  Category,
  ChatMessage,
  ComboDeal,
  Coupon,
  CustomerAccount,
  DietaryType,
  DiningTable,
  KioskDevice,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  NetworkState,
  Order,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  SelectedModifier,
  VoiceLanguage
} from '@jamanvaar/types';
import { buildStandardMenu } from './standardMenu';
import {
  calculateCart,
  calculateItemTotal,
  calculateItemUnitPrice,
  CustomerChatbotEngine, AiConfig, refreshConfiguredAi,
  RecommendationEngine,
  validateModifiers
} from '@jamanvaar/business';
import {
  Button,
  EmptyState,
  JamanvaarLogo,
  BrandHeader,
  Logo,
  Modal,
  OfflineBanner,
  StatusBadge,
  ThermalReceiptView,
  JAMANVAARStartup,
  JamanvaarKioskAuthLayout,
  ActivationNoticeBanner,
  ActivationHelpNote,
  CachedImg,
  MenuCategoryIcon,
  LocalCorePairing, useAiAccess, JamanAiAccessNotice
} from '@jamanvaar/ui';
import { formatDate, formatINR, formatSplitTax, splitTaxPaise, formatTime, generateIdempotencyKey, generateSecureNumericCode, generateUUID, localizedDescription, localizedName, SoundService, ImageCache, menuDishImage, collectMenuImageUrls, isMenuPlaceholder } from '@jamanvaar/utils';
import { getTranslation, SupportedLanguage, translate, TranslationKey } from '@jamanvaar/i18n';
import { EBillService, NetworkStatusService, PrinterService, VoiceService, Platform, isOrderStillSyncingMessage } from '@jamanvaar/api';
import { SyncOutboxEngine, EntitySyncEngine, lanMeshSync, syncMenuCatalog, syncDiningTables, syncPromotions, syncFeedback, syncLoyaltyTiers, syncLoyaltyRewards, syncLoyaltyProgramSettings, pushServiceMessages } from '@jamanvaar/sync';
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
  Download,
  Eye,
  Flame,
  Globe,
  Grid,
  Heart,
  Info,
  ArrowRight,
  Key,
  KeyRound,
  HelpCircle,
  Lock,
  Mail,
  MessageCircle,
  Minus,
  PackagePlus,
  PhoneCall,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  Send,
  Settings,
  Share2,
  ShieldAlert,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Tag,
  ThumbsUp,
  Trash2,
  Unlock,
  UserCheck,
  UtensilsCrossed,
  Wallet,
  Wifi,
  WifiOff,
  X
} from 'lucide-react';
// Namespace import used only to resolve a category's admin-set iconName to
// an actual icon component for the left nav (see CategoryCard.tsx, which
// does the same lookup) — everything else in this file uses the named
// imports above for normal tree-shaken references.

type KioskStep =
  | 'LANGUAGE_SELECT'
  | 'WELCOME'
  | 'ORDER_TYPE'
  | 'TABLE_SELECT'
  | 'MENU'
  | 'CHECKOUT_PAYMENT'
  | 'CONFIRMATION';

/** Display labels for every language the kiosk *could* offer — which of
 *  these actually show up is decided by KioskDisplaySettings.enabledLanguages,
 *  not by this list, so Kiosk Admin can turn one off without a code change. */
const LANGUAGE_OPTIONS: Array<{ code: SupportedLanguage; label: string; native: string }> = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' }
];

/**
 * VoiceService only has verified browser speech-synthesis support for en/hi/gu (its own
 * langMap in packages/api/src/services/voice.ts). The newer text-only languages (Marathi,
 * Tamil, Telugu, Kannada) have real i18n/UI support but no verified TTS voice for their locale,
 * so the spoken prompts fall back to English for those rather than guessing at an unverified
 * voice — never silently claiming voice support this app hasn't actually confirmed works.
 */
function toVoiceLanguage(lang: SupportedLanguage): VoiceLanguage {
  return lang === 'en' || lang === 'hi' || lang === 'gu' ? lang : 'en';
}

/** Every real activation key is JMV-XXXX-XXXX-XXXX (see activation-keys.service.ts's own generator) — reformats as the installer types so they don't have to type the dashes themselves. */
function formatActivationKeyInput(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const groups = [clean.slice(0, 3), clean.slice(3, 7), clean.slice(7, 11), clean.slice(11, 15)].filter(Boolean);
  return groups.join('-');
}

/**
 * Razorpay returns the UPI QR as a base64 image (Order Pay API, `qrcode` channel). Accepts a ready-made
 * data: URL or bare base64; anything else (for example a raw upi:// string, which this kiosk has no QR
 * renderer for) is treated as unusable so the guest is offered cash at the counter instead of a blank box.
 */
function toQrImageSrc(payload: string, contentType: string | null): string | null {
  const trimmed = payload.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  // Razorpay's QR image address: shown as is.
  if (contentType === 'image/url' && /^https:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
    const mime = contentType && contentType.startsWith('image/') ? contentType : 'image/png';
    return `data:${mime};base64,${trimmed.replace(/\s+/g, '')}`;
  }
  return null;
}

export default function KioskUserApp() {
  const remoteLogoutSafety = useRef(false);
  const remoteLogoutInProgressRef = useRef(false);
  const [remoteLogoutInProgress, setRemoteLogoutInProgress] = useState(false);
  // Device activation (Phase 3) — this terminal has no identity until an
  // activation code is redeemed; everything below assumes a real device.
  const [isDeviceActivated, setIsDeviceActivated] = useState<boolean>(() => isKioskDeviceConnected());
  const [restaurantCodeInput, setRestaurantCodeInput] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [activationError, setActivationError] = useState('');
  const [showKeyHint, setShowKeyHint] = useState(false);
  const kioskId = getKioskDeviceId() ?? 'KIOSK-01';

  type ActivationStep = 'form' | 'verifying' | 'registering' | 'syncing' | 'success';
  const [activationStep, setActivationStep] = useState<ActivationStep>('form');
  const [activationSuccess, setActivationSuccess] = useState<{
    restaurantName: string;
    deviceId: string;
    mismatchNote: string | null;
  } | null>(null);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActivationError('');

    const typedCode = restaurantCodeInput.trim().toUpperCase();
    if (!RESTAURANT_CODE_RE.test(typedCode)) {
      setActivationError('Restaurant ID must look like JM9876543210.');
      return;
    }

    setActivationStep('verifying');
    let resolved: { restaurantId: string; name: string };
    try {
      resolved = await resolveRestaurantByCode(typedCode);
    } catch (err) {
      setActivationError(kioskActivationError(err, 'restaurant', navigator.onLine));
      setActivationStep('form');
      return;
    }

    setActivationStep('registering');
    let result: Awaited<ReturnType<typeof activateKioskDevice>>;
    try {
      result = await activateKioskDevice(activationCode);
    } catch (err) {
      setActivationError(kioskActivationError(err, 'key', navigator.onLine));
      setActivationStep('form');
      return;
    }

    if (result.branding) {
      RestaurantIdentityRepository.adopt(getKioskRestaurantId() || db.restaurant.id, result.branding);
      db.notify();
    }

    setActivationStep('syncing');
    try {
      await syncRestaurantIdentity();
    } catch {
      // The device is already correctly activated at this point (redeem already succeeded) — a
      // failed identity pull just means the very latest edits sync on the next heartbeat instead
      // of immediately. Never strand the installer here or fail an otherwise-successful activation.
    }

    setActivationSuccess({
      restaurantName: result.branding?.name ?? resolved.name,
      deviceId: result.deviceId,
      mismatchNote:
        result.restaurantId !== resolved.restaurantId
          ? `This activation key belongs to a different restaurant (${result.branding?.name ?? 'unknown'}) than the ID you entered (${resolved.name}). The kiosk is connected to ${result.branding?.name ?? "the key's restaurant"}.`
          : null
    });
    setActivationStep('success');
    setIsDeviceActivated(true);
  };

  useEffect(() => {
    if (activationStep !== 'success') return;
    const timer = setTimeout(() => setActivationStep('form'), 4000);
    return () => clearTimeout(timer);
  }, [activationStep]);

  // Wires the real sync bridge (Phase 3) so orders placed here actually
  // reach KDS/Captain via a persisted, catch-up-capable path instead of the
  // "✓ Sent to Kitchen" badge below being asserted rather than proven.
  useEffect(() => {
    if (!isDeviceActivated) {
      SyncOutboxEngine.configureTransport(null);
      return;
    }
    SyncOutboxEngine.configureTransport({ push: pushOrderSync, pull: pullOrderSync, leaseNumbers: leaseNumberBlock, deviceId: () => localStorage.getItem('jamanvaar_kiosk_user_device_id') });
    EntitySyncEngine.configureTransport({ push: pushEntitySync, pull: pullEntitySync });
    DeviceCommandRunner.registerHandler('REQUEST_SYNC', async command => {
      const payload = command.payload as { scope?: string; configVersion?: string } | undefined;
      if (payload?.scope === 'WELCOME') {
        await syncKioskConfiguration();
        const configuration = KioskConfigurationRepository.snapshot();
        if (!payload.configVersion || Date.parse(configuration.updatedAt) < Date.parse(payload.configVersion)) throw Error('Welcome configuration has not arrived yet. Retry sync after the connection is restored.');
        const presentation = welcomePresentation(configuration.welcome, kioskId);
        const image = welcomeBackgroundUrl(presentation, configuration.welcome.customBackgrounds);
        for (const source of new Set([image, welcomeLandscapeUrl(image, presentation.backgroundLandscapeImageUrl)])) {
          const cached = await WelcomeImageCache.source(source);
          if (!cached.startsWith('blob:') && !cached.startsWith('data:')) throw Error('Welcome background could not be cached. Check the asset and connection, then retry sync.');
          if (cached.startsWith('blob:')) URL.revokeObjectURL(cached);
        }
        return { scope: 'WELCOME', configVersion: configuration.updatedAt, imageCached: true };
      }
      if (payload?.scope === 'MENU') { await syncMenuCatalog({ push: false }); return { scope: 'MENU' }; }
      const pushed = await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
      const pulled = await SyncOutboxEngine.catchUpFromCloud();
      await syncKioskConfiguration();
      return { scope: payload?.scope || 'ALL', ...pushed, ...pulled };
    });
    DeviceCommandRunner.registerHandler('FORCE_LOGOUT', async () => {
      if (remoteLogoutSafety.current || loadPendingPayment()) throw new Error('A payment is in progress or awaiting fulfilment. Finish or cancel it before logging out this kiosk.');
      remoteLogoutInProgressRef.current = true; setRemoteLogoutInProgress(true);
      await SyncOutboxEngine.processOutbox();
      if (remoteLogoutSafety.current || loadPendingPayment()) throw new Error('A payment started while preparing logout. Finish it before retrying.');
      const stats = SyncOutboxEngine.getSyncStats();
      if (stats.pendingCount || stats.failedCount || stats.deadLetterCount) throw new Error('Unsent orders remain. Sync them before logging out this kiosk.');
      return { readyForLogout: true, ordersRetained: true };
    }, { recheckBeforeAcknowledgement: true });
    DeviceCommandRunner.registerAfterAcknowledgement('FORCE_LOGOUT', () => {
      db.unpairLocalCore(); resetTerminal(); setIsDeviceActivated(false);
    });
    DeviceCommandRunner.registerAfterAttempt('FORCE_LOGOUT', () => { remoteLogoutInProgressRef.current = false; setRemoteLogoutInProgress(false); });

    // BUG-016: this terminal had no menu sync at all, so a fresh or cleared kiosk fell back
    // to the local seed menu instead of the restaurant's real one. Pull-only — a customer
    // kiosk never edits the menu.

    // BUG-019/034/035: the manager-override staff PIN used to work only on the device that created
    // it — a kiosk was never in the entity-sync loop for staff, despite the create/reset screen's own
    // promise that the PIN would work on Kiosk too. Pull only — a kiosk never edits staff.
    const syncStaff = () => syncStaffUsers({ push: false });

    void SyncOutboxEngine.processOutbox();
    void SyncOutboxEngine.catchUpFromCloud();
    void syncMenuCatalog({ push: false });
    void syncDiningTables();
    void syncKioskConfiguration().catch(() => {});
    // BUG-130/133/136/137: combos and coupons made in Kiosk Admin arrive here; coupon redemptions, guest ratings
    // and "call staff" requests go back.
    void syncPromotions({ pushCombos: false, pushCoupons: true });
    void syncFeedback({ push: true });
    // The admin's loyalty program (tier multipliers, base earn rate) — this device only ever reads it.
    void syncLoyaltyTiers({ push: false });
    void syncLoyaltyRewards({ push: false });
    void syncLoyaltyProgramSettings({ push: false });
    void pushServiceMessages();
    void syncStaff();
    void reportHeartbeat();

    // Join the LAN mesh as a real KIOSK_USER peer so Kiosk Admin's Terminal
    // Fleet screen can see this device actually connected, instead of the
    // fixed fake fleet the QA audit found (BUG-004).
    lanMeshSync.registerDevice('KIOSK_USER', kioskId, `Kiosk Terminal (${kioskId})`);
    KioskRepository.upsertFromHeartbeat({
      deviceId: kioskId,
      name: `Kiosk Terminal (${kioskId})`,
      appVersion: '1.0.0',
      lastHeartbeat: new Date().toISOString()
    });

    // Enforce a real Lock/Maintenance command from Kiosk Admin — the audit
    // found this previously only toggled a value nothing ever read.
    const unsubLockdown = lanMeshSync.on<{ kioskId: string; isLocked: boolean; status: KioskDevice['status'] }>(
      'KIOSK_LOCKDOWN_COMMAND',
      (event) => {
        if (event.payload.kioskId === kioskId) {
          KioskRepository.updateKioskStatus(kioskId, event.payload.status, event.payload.isLocked);
        }
      }
    );

    const interval = setInterval(() => {
      void SyncOutboxEngine.processOutbox();
      void SyncOutboxEngine.catchUpFromCloud();
      void syncMenuCatalog({ push: false });
      void syncDiningTables();
    void syncKioskConfiguration().catch(() => {});
      void syncPromotions({ pushCombos: false, pushCoupons: true });
      void syncFeedback({ push: true });
      void syncLoyaltyTiers({ push: false });
      void syncLoyaltyRewards({ push: false });
      void syncLoyaltyProgramSettings({ push: false });
      void pushServiceMessages();
      void syncStaff();
      void reportHeartbeat();
    }, 15000);

    return () => {
      clearInterval(interval);
      unsubLockdown();
    };
  }, [isDeviceActivated]);

  const [dbTick, setDbTick] = useState(0);
  const [lang, setLang] = useState<SupportedLanguage>(
    () => KioskDisplaySettingsRepository.getSettings().defaultLanguage as SupportedLanguage
  );
  // Welcome (branding, "Start Order") is the very first screen — a customer
  // should see which restaurant they're ordering from before anything else.
  // Language is asked only after they tap Start Order, not on kiosk boot.
  const [step, setStep] = useState<KioskStep>('WELCOME');

  // Welcome → Language Select transition (purely visual — see the ~3s
  // tap/exit/enter sequence below; none of these three flags touch routing
  // or session state, they only drive CSS classes).
  const [startOrderTapped, setStartOrderTapped] = useState(false);
  const [welcomeExiting, setWelcomeExiting] = useState(false);
  const [langEntered, setLangEntered] = useState(false);

  const handleStartOrder = () => {
    SoundService.playTap();
    setStartOrderTapped(true);
    window.setTimeout(() => setWelcomeExiting(true), 220);
    window.setTimeout(() => {
      setSessionId(generateUUID());
      setStep('LANGUAGE_SELECT');
    }, 650);
  };

  // Reset the transition flags whenever a step is (re)entered directly
  // (e.g. the Language Select back button, or a full session reset) so the
  // animation replays cleanly instead of mounting already mid-transition.
  useEffect(() => {
    if (step === 'WELCOME') {
      setStartOrderTapped(false);
      setWelcomeExiting(false);
    }
    if (step === 'LANGUAGE_SELECT') {
      setLangEntered(false);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setLangEntered(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
  }, [step]);

  // Network Connectivity State (Section 121-129)
  const [networkState, setNetworkState] = useState<NetworkState>('ONLINE');

  // Accessibility States
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [localCoreSetupOpen, setLocalCoreSetupOpen] = useState(() => new URLSearchParams(window.location.search).get('local-core-setup') === '1');
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
  // B2-001: the generated OTP itself, its expiry and a wrong-attempt counter — none of this
  // existed before, which is how "any 4-character input" and a fixed, reused '1234' passed.
  // No SMS gateway is wired into this codebase (checked: no SMS/Twilio/MSG91 provider or env
  // var anywhere), so there is no channel to deliver the code off-device — it is shown on
  // screen honestly labelled as such, rather than a fabricated "sent to your phone" claim.
  const [otpGenerated, setOtpGenerated] = useState('');
  const [otpExpiresAt, setOtpExpiresAt] = useState<number>(0);
  const [otpAttempts, setOtpAttempts] = useState(0);
  const OTP_VALID_MS = 2 * 60 * 1000;
  const OTP_MAX_ATTEMPTS = 5;
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
  const cartRef = useRef<CartItem[]>([]);
  // Opening or emptying the cart changes the whole layout, so that one change is wrapped in a
  // View Transition: the browser animates it from CSS instead of re-laying out every frame.
  const applyCart = (update: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    const prev = cartRef.current;
    const next = typeof update === 'function' ? update(prev) : update;
    cartRef.current = next;
    const toggled = (prev.length === 0) !== (next.length === 0);
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (toggled && doc.startViewTransition) {
      doc.startViewTransition(() => flushSync(() => setCartItems(next)));
    } else {
      setCartItems(next);
    }
  };
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Payment State Machine
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('CREATED');
  const [paymentTimeLeft, setPaymentTimeLeft] = useState<number>(180);
  const [realPaymentId, setRealPaymentId] = useState<string | null>(null);
  const [quotedPayable, setQuotedPayable] = useState<number | null>(null);
  const [localOrderIdForPayment, setLocalOrderIdForPayment] = useState<string | null>(null);
  const [onlinePaymentUnavailable, setRazorpayUnavailable] = useState(false);
  // The restaurant's online payments are switched on only once its Razorpay vendor is verified. Until then the guest is told so.
  const [onlinePaymentsPending, setOnlinePaymentsPending] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  remoteLogoutSafety.current = isProcessingPayment || (!!realPaymentId && !['SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].includes(paymentStatus));
  // The UPI QR shown on this screen for the pending payment (created by the server, rendered here).
  const [qrImageSrc, setQrImageSrc] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(0);
  const [qrLoading, setQrLoading] = useState(false);
  // True when the QR opens a payment page (scanned with the phone camera) rather than being a UPI QR any UPI app can scan.
  // Bounded window (from order creation) that background payment-status
  // polling keeps running past the visible countdown's expiry, so a UPI
  // payment that Razorpay confirms moments after the customer is told to
  // pay cash still gets caught and settled automatically.
  const reconciliationDeadlineRef = useRef<number | null>(null);

  // Confirmed Order & Auto-Print State
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [autoPrintStatus, setAutoPrintStatus] = useState<{ printed: boolean; message: string; printerName: string }>({
    printed: false,
    message: '',
    printerName: ''
  });
  // Distinct from autoPrintStatus.printed (which is false both before the
  // print attempt runs AND after it fails) — this only flips once the
  // auto-print attempt has actually resolved, success or failure, so the
  // auto-return-to-Welcome timer can wait for it without ever confusing
  // "not tried yet" with "tried and failed".
  const [printSettled, setPrintSettled] = useState(false);
  const [speechSettled, setSpeechSettled] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Digital E-Bill & Email Receipt States (Sections 130-152)
  const [receiptDeliveryChannel, setReceiptDeliveryChannel] = useState<ReceiptDeliveryChannel | null>(null);
  const [receiptDeliveryBusy, setReceiptDeliveryBusy] = useState(false);
  const [confirmationActivity, setConfirmationActivity] = useState(0);
  const receiptGeneration = useRef(0);
  const [eBillSuccessMessage, setEBillSuccessMessage] = useState<string | null>(null);

  // Modals for Extra Features
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isHandoffModalOpen, setIsHandoffModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isStaffPinModalOpen, setIsStaffPinModalOpen] = useState(false);
  const [staffPin, setStaffPin] = useState('');
  const [staffOverrideActive, setStaffOverrideActive] = useState(false);
  // One staff PIN gates both tasks staff actually use the Welcome screen's "Staff Mode" button
  // for -- applying a manager discount and configuring this Kiosk's printer -- via an action
  // menu shown on success, instead of silently doing one hardcoded thing (B2 follow-up: that
  // used to apply the 10% discount immediately on PIN success with no menu, which is what a
  // staff member configuring the printer saw instead of what they came for).
  const [isStaffActionMenuOpen, setIsStaffActionMenuOpen] = useState(false);
  const [verifiedStaffName, setVerifiedStaffName] = useState<string | null>(null);
  const [isKioskPrinterSettingsOpen, setIsKioskPrinterSettingsOpen] = useState(false);
  // B2-059: was pre-filled at 5 with no requirement to actually choose one — a guest tapping
  // "Submit Rating" without picking a star recorded a perfect score, inflating the average.
  const [feedbackRating, setFeedbackRating] = useState<number>(0);
  const [feedbackTags, setFeedbackTags] = useState<string[]>([]);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Customer Chatbot Assistant ("Need Help?") State
  const ai = useAiAccess();
  const showCustomerAi = ai.showButton(db.restaurant?.showJamanAI !== false);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  useEffect(() => { if (isChatbotOpen) void refreshConfiguredAi(); }, [isChatbotOpen]);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'cust-init',
      sender: 'ASSISTANT',
      text: KioskDisplaySettingsRepository.getSettings().texts?.[lang]?.chatWelcome || 'Namaste! How can I help you choose your meal today?',
      timestamp: new Date().toISOString(),
      suggestions: ['Order', 'Veg', 'Jain', 'Offers', 'Pay'].map((suffix, index) => KioskDisplaySettingsRepository.getSettings().texts?.[lang]?.[`chatSuggestion${suffix}`] || ['What should I order?', 'Show vegetarian dishes', 'Show Jain food', "Show today's offers", 'How do I pay?'][index])
    }
  ]);

  // Read current settings on database notifications; later sessions use newly published thresholds.
  const idleThresholds = (() => {
    const s = KioskDisplaySettingsRepository.getSettings();
    return { warningAfter: s.idleWarningAfterSeconds, resetCountdown: s.idleResetCountdownSeconds };
  })();
  const [idleSeconds, setIdleSeconds] = useState<number>(0);
  const [showIdleWarning, setShowIdleWarning] = useState<boolean>(false);
  const [idleCountdown, setIdleCountdown] = useState<number>(idleThresholds.resetCountdown);

  const t = (key: TranslationKey) => KioskDisplaySettingsRepository.getSettings().texts?.[lang]?.[key] || translate(key, lang);
  const kioskCopy = (key: string, fallback: string) => KioskDisplaySettingsRepository.getSettings().texts?.[lang]?.[key] || fallback;

  // Auto-configure built-in kiosk thermal printer & resume crash recovery on startup (Sections 2, 8, 17)
  useEffect(() => {
    PrinterService.autoConfigureKioskPrinter();
    PrinterService.resumeCrashRecovery();
  }, []);

  // A self-order kiosk must not sleep while it is on the welcome screen.
  useEffect(() => {
    Platform.display.keepAwake(true);
    return () => Platform.display.keepAwake(false);
  }, []);

  // Subscribe to Network Status
  useEffect(() => {
    const unsub = NetworkStatusService.subscribe((state) => {
      setNetworkState(state);
    });
    return unsub;
  }, []);

  // Keep the menu pictures on this device, so the menu still shows them when the internet is down.
  // Runs only when online and only does work when the set of pictures has changed.
  const menuImageKey = useRef('');
  useEffect(() => {
    if (networkState !== 'ONLINE') return;
    const list = collectMenuImageUrls(db.menuItems, db.categories, db.combos ?? []);
    const key = list.join('|');
    if (key === menuImageKey.current) return;
    menuImageKey.current = key;
    void ImageCache.sync(list);
  }, [networkState, dbTick]);

  // Real-time Database Subscription
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setDbTick((c) => c + 1);
    });
    return unsubscribe;
  }, []);

  // Confirmation uses the same persisted order as sync; it never keeps a LAN-only snapshot.
  useEffect(() => {
    if (!placedOrder) return;
    const current = OrderRepository.getOrderById(placedOrder.id);
    if (current && current !== placedOrder) setPlacedOrder(current);
  }, [dbTick, placedOrder]);

  // Idle Timer Reset on Touch/Interaction
  const resetIdleTimer = () => {
    setIdleSeconds(0);
    if (step === 'CONFIRMATION') setConfirmationActivity(version => version + 1);
    if (showIdleWarning) {
      setShowIdleWarning(false);
      setIdleCountdown(idleThresholds.resetCountdown);
    }
  };

  const awaitingOnlinePayment = step === 'CHECKOUT_PAYMENT' && paymentMethod === 'UPI' && !onlinePaymentUnavailable && paymentStatus !== 'EXPIRED';

  useEffect(() => {
    if (step === 'WELCOME' || step === 'LANGUAGE_SELECT' || awaitingOnlinePayment || receiptDeliveryBusy) return;

    const interval = setInterval(() => {
      setIdleSeconds((prev) => {
        const next = prev + 1;
        if (next >= idleThresholds.warningAfter && !showIdleWarning) {
          setShowIdleWarning(true);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step, showIdleWarning, awaitingOnlinePayment, receiptDeliveryBusy]);

  // Idle Countdown
  useEffect(() => {
    if (!showIdleWarning) return;
    const interval = setInterval(() => {
      setIdleCountdown((prev) => {
        if (prev <= 1) {
          handleFullSessionReset();
          return idleThresholds.resetCountdown;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showIdleWarning]);

  // B2-023: once Razorpay is known unavailable, don't leave the guest sitting on a UPI selection
  // the screen itself says can't be used — switch to the one method that always works, the same
  // way the OFFLINE case already does in handleProceedToPayment.
  useEffect(() => {
    if (onlinePaymentUnavailable && paymentMethod === 'UPI') {
      setPaymentMethod('CASH_AT_COUNTER');
    }
  }, [onlinePaymentUnavailable, paymentMethod]);

  // Payment Countdown + real-payment polling. The Razorpay webhook (handled
  // entirely server-side) is what actually confirms payment — this only
  // ever reflects what GET /api/v1/payments/:paymentId/status already
  // recorded, never a client-side belief about success.
  useEffect(() => {
    if (paymentStatus === 'SUCCESS') return;
    if (!realPaymentId) {
      // Cash-at-counter path: no real payment to poll, fall back to the
      // plain visible countdown (only while the payment screen is showing).
      if (step !== 'CHECKOUT_PAYMENT' || paymentStatus === 'EXPIRED') return;
      const plainInterval = setInterval(() => {
        setPaymentTimeLeft((prev) => {
          if (prev <= 1) {
            setPaymentStatus('EXPIRED');
            return 0;
          }
          return prev - 1;
        });
      }, 3000);
      return () => clearInterval(plainInterval);
    }

    // Deliberately NOT tied to the payment screen: a guest who taps Back or Cancel after scanning may
    // still complete the payment on their phone, and that must still produce their token and KOT.
    let checking = false;
    const interval = setInterval(async () => {
      if (checking) return;
      if (reconciliationDeadlineRef.current && Date.now() > reconciliationDeadlineRef.current) {
        clearInterval(interval);
        return;
      }

      checking = true;
      try {
        const result = await getPaymentOrderStatus(realPaymentId);
        if (result.status === 'SUCCESS') {
          clearInterval(interval);
          if (localOrderIdForPayment) {
            await finalizePaidOrder(realPaymentId, localOrderIdForPayment);
          }
          return;
        }
        if (result.status === 'FAILED' || result.status === 'USER_DROPPED') {
          clearPendingPayment();
          setRazorpayUnavailable(true);
          clearInterval(interval);
          return;
        }
      } catch (err) {
        console.error('Payment status poll failed:', err);
      } finally { checking = false; }
    }, 1000);

    return () => clearInterval(interval);
    // `lang` must be a dependency: the polling interval's closure captures
    // whichever `proceedToConfirmation` (and thus whichever active
    // language) existed when this effect last ran. Without `lang` here,
    // a guest who changes language from the header while a UPI payment is
    // still polling gets confirmation audio in the language that was
    // active when polling *started*, not the one active when the payment
    // actually succeeds — this is what was causing the wrong-language
    // confirmation audio.
  }, [step, paymentStatus, realPaymentId, localOrderIdForPayment, lang]);

  // Live countdown for the QR on screen; when it runs out the QR is hidden and a fresh one can be requested.
  // Status polling above keeps going, so a payment made in the last seconds is still caught.
  useEffect(() => {
    if (!qrExpiresAt || paymentStatus === 'SUCCESS') return;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((qrExpiresAt - Date.now()) / 1000));
      setQrSecondsLeft(left);
      if (left === 0) setPaymentStatus('EXPIRED');
    }, 1000);
    return () => clearInterval(tick);
  }, [qrExpiresAt, paymentStatus]);

  // Crash / reload recovery. If this terminal was restarted after a QR was shown, check that payment now:
  // if it succeeded, create the token and KOT that never got created; if it failed, forget it; if it is
  // still open, keep watching it for a few minutes. Anything older is left to the server-side
  // "needs attention" list, which staff see in Kiosk Admin and Super Admin.
  useEffect(() => {
    const pending = loadPendingPayment();
    if (!pending || !isKioskDeviceConnected()) return;
    let stopped = false;
    let recoveryTimer: ReturnType<typeof setInterval> | undefined;
    let recoveryChecking = false;
    const RESUME_WINDOW_MS = 6 * 60 * 1000;

    const check = async (): Promise<boolean> => {
      if (recoveryChecking || stopped) return false;
      recoveryChecking = true;
      try {
        const result = await getPaymentOrderStatus(pending.paymentId);
        if (result.status === 'SUCCESS') {
          await finalizePaidOrder(pending.paymentId, pending.localOrderId);
          return true;
        }
        if (result.status === 'FAILED' || result.status === 'USER_DROPPED' || result.status === 'CANCELLED') {
          clearPendingPayment();
          return true;
        }
      } catch (err) {
        console.error('Resuming pending payment failed:', err);
      } finally { recoveryChecking = false; }
      return false;
    };

    void (async () => {
      if (await check()) return;
      if (Date.now() - pending.startedAt > RESUME_WINDOW_MS) {
        clearPendingPayment();
        return;
      }
      if (stopped) return;
      const timer = recoveryTimer = setInterval(async () => {
        if (stopped || Date.now() - pending.startedAt > RESUME_WINDOW_MS) {
          clearInterval(timer);
          if (!stopped) clearPendingPayment();
          return;
        }
        if (await check()) clearInterval(timer);
      }, 3000);
    })();

    return () => {
      stopped = true;
      clearInterval(recoveryTimer);
    };
    // Runs once per app start on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The return hook is called below, after the session reset handler exists.

  // Periodic Heartbeat to Authoritative Local Service
  useEffect(() => {
    const sendHeartbeat = () => {
      if (window.location.protocol === 'https:') return;
      if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
      if (db.isLocalCoreUnauthorized()) return;
      db.localCoreFetch('/api/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kioskId,
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

  const cancelAbandonedPendingOrder = () => cancelAbandonedKioskDraft(localOrderIdForPayment);

  // Full Session Memory Scrub (Sections 224-226: No customer data leaks)
  const handleFullSessionReset = () => {
    receiptGeneration.current += 1;
    const currentDisplay = KioskDisplaySettingsRepository.getSettings();
    const nextSessionCopy = (key: string, fallback: string) => currentDisplay.texts?.[currentDisplay.defaultLanguage]?.[key] || fallback;
    cancelAbandonedPendingOrder();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSessionId(generateUUID());
    setStep('WELCOME');
    setLang(currentDisplay.defaultLanguage as SupportedLanguage);
    applyCart([]);
    setIsCartOpen(false);
    setPrintSettled(false);
    setSpeechSettled(false);
    setSelectedTable(null);
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setCustomizingItem(null);
    setSelectedModifiers([]);
    setSpecialInstructions('');
    setPaymentStatus('CREATED');
    setRealPaymentId(null);
    setQuotedPayable(null);
    setLocalOrderIdForPayment(null);
    setRazorpayUnavailable(false);
    setPlacedOrder(null);
    setShowIdleWarning(false);
    setIdleSeconds(0);
    setLoggedInAccount(null);
    setRedeemedPoints(0);
    setStaffOverrideActive(false);
    setFeedbackSubmitted(false);
    setFeedbackRating(0);
    setFeedbackTags([]);
    setIsChatbotOpen(false);
    setReceiptDeliveryChannel(null);
    setReceiptDeliveryBusy(false);
    setIsHandoffModalOpen(false);
    setEBillSuccessMessage(null);
    setChatMessages([
      {
        id: 'cust-init',
        sender: 'ASSISTANT',
        text: nextSessionCopy('chatWelcome', 'Namaste! How can I help you choose your meal today?'),
        timestamp: new Date().toISOString(),
        suggestions: [
          nextSessionCopy('chatSuggestionOrder', 'What should I order?'),
          nextSessionCopy('chatSuggestionVeg', 'Show vegetarian dishes'),
          nextSessionCopy('chatSuggestionJain', 'Show Jain food'),
          nextSessionCopy('chatSuggestionOffers', "Show today's offers"),
          nextSessionCopy('chatSuggestionPay', 'How do I pay?')
        ]
      }
    ]);
  };

  useKioskConfirmationReturn({
    active: step === 'CONFIRMATION',
    ready: printSettled && speechSettled,
    blocked: receiptDeliveryChannel !== null || receiptDeliveryBusy || isHandoffModalOpen,
    activityVersion: confirmationActivity,
    onReturn: handleFullSessionReset
  });

  const openReceiptDelivery = (channel: ReceiptDeliveryChannel) => {
    resetIdleTimer();
    setReceiptDeliveryChannel(channel);
  };
  const closeReceiptDelivery = () => {
    if (receiptDeliveryBusy) return;
    resetIdleTimer();
    setReceiptDeliveryChannel(null);
  };

  // Cart Calculations with loyalty redemption & staff override discounts
  const rawCalculated = calculateCart({
    items: cartItems,
    taxGroups: db.taxGroups,
    roundToRupee: false,
    coupon: appliedCoupon
  });

  const staffDiscount = staffOverrideActive ? Math.round(rawCalculated.subtotal * 0.1) : 0;
  const netTotalPayable = step === 'CHECKOUT_PAYMENT' && paymentMethod === 'UPI' && quotedPayable !== null
    ? quotedPayable : Math.max(0, rawCalculated.totalPayable - redeemedPoints - staffDiscount);

  // Read live so a Kiosk Admin toggling a language takes effect on the next
  // render without requiring the terminal to be restarted.
  const kioskSettings = KioskDisplaySettingsRepository.getSettings();
  const welcomeSettings = welcomePresentation(WelcomeScreenSettingsRepository.getSettings(), kioskId);

  // Categories & Items from DB
  const { categories, items: menuItems } = buildStandardMenu(
    MenuRepository.getAllCategories(),
    MenuRepository.getAllMenuItems(),
    KeyValueStore.get('jamanvaar_bound_branch_id') || undefined
  );
  // A combo must have a published backing dish visible to this kiosk/branch.
  const allCombos = ComboRepository.getAllCombos();
  const combos = allCombos.filter(combo => combo.isAvailable !== false && menuItems.some(item => item.id === `combo-${combo.id}`)).map(combo => ({ ...combo, imageUrl: menuDishImage(combo.imageUrl, combo.name) }));
  const isNonVegCombo = (combo: ComboDeal) => MenuRepository.getMenuItemById(`combo-${combo.id}`)?.dietaryType === 'NON_VEG' || [...combo.mainItemIds, ...combo.sideItemIds, ...combo.drinkItemIds, ...combo.dessertItemIds].some(id => MenuRepository.getMenuItemById(id)?.dietaryType === 'NON_VEG');
  const tables = TableRepository.getAllTables();
  const kioskConfig = KioskRepository.getKioskById(kioskId);
  const receiptConfig = ReceiptRepository.getConfig();

  // Filtered Menu Items — excludes items marked unavailable/sold-out in
  // Kiosk Admin so a guest can never see or order a dish that's 86'd.
  const filteredItems = menuItems.filter((item) => {
    if (allCombos.some(combo => item.id === `combo-${combo.id}`)) return false;
    if (!item.isAvailable) return false;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      localizedName(item, lang).toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subcategory?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory =
      selectedCategoryId === 'ALL' || item.categoryId === selectedCategoryId;
    const matchesDietary =
      dietaryFilter === 'ALL' || item.dietaryType === dietaryFilter;
    return matchesSearch && matchesCategory && matchesDietary;
  });
  const filteredCombos = combos.filter(combo => {
    const backing = menuItems.find(item => item.id === `combo-${combo.id}`)!;
    const query = searchQuery.trim().toLowerCase();
    return (selectedCategoryId === 'ALL' || selectedCategoryId === 'cat-combos' || selectedCategoryId === backing.categoryId) &&
      (dietaryFilter === 'ALL' || backing.dietaryType === dietaryFilter) &&
      [combo.name, combo.description, localizedName(combo, lang), backing.sku, ...(backing.tags || [])].some(value => value?.toLowerCase().includes(query));
  });

  // Label for the CENTER column's heading in the kiosk menu's 10/70/20
  // layout — mirrors whichever category the LEFT nav has selected.
  const activeCategoryObj = categories.find((c) => c.id === selectedCategoryId);
  const currentCategoryLabel =
    selectedCategoryId === 'ALL'
      ? 'All Dishes & Specialities'
      : selectedCategoryId === 'cat-combos'
      ? 'Combos & Deals'
      : activeCategoryObj
      ? localizedName(activeCategoryObj, lang)
      : 'Menu';

  // Intelligent recommendations from RecommendationEngine
  const intelligentRecommendations = RecommendationEngine.getCartRecommendations(
    cartItems.map((ci) => ci.menuItemId)
  );

  const defaultModifiersFor = (item: MenuItem): SelectedModifier[] => {
    const defaults: SelectedModifier[] = [];
    (item.modifierGroups || []).forEach((g) => {
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
    return defaults;
  };

  /** Opens the customization modal unconditionally — used by the explicit
   *  "Customize" button and by tapping the card itself, so a guest can
   *  still add cheese/extra spice to something that has no *required*
   *  choice, without every single item forcing that detour. */
  const handleOpenCustomize = (item: MenuItem) => {
    SoundService.playTap();
    resetIdleTimer();
    setCustomizingItem(item);
    setActiveItemQuantity(1);
    setSpecialInstructions('');
    setSelectedModifiers(defaultModifiersFor(item));
  };

  // Tapping the card body itself (not the + or Customize buttons) opens the
  // options modal when the item actually has something to customize —
  // otherwise it used to force the modal open for every card, including
  // plain items like Butter Naan with zero modifier groups. For a plain
  // item, the tap instead adds it directly (same as "+"), so tapping the
  // card body is never a dead click.
  const handleCardClick = (item: MenuItem) => {
    if (item.modifierGroupIds && item.modifierGroupIds.length > 0) {
      handleOpenCustomize(item);
    } else {
      handleSelectItem(item);
    }
  };

  // The kiosk's "+" quick-add always adds directly with default options,
  // even for an item that has a required modifier group — the modal only
  // opens from the explicit "Customize" button now. Guests can still
  // adjust a default choice afterward from the cart, but tapping + must
  // never interrupt them with a card.
  const handleSelectItem = (item: MenuItem) => {
    SoundService.playTap();
    resetIdleTimer();
    addToCartDirect(item, 1, defaultModifiersFor(item), '');
  };

  // Two selected-modifier sets are "the same customization" if every
  // option in one has a matching option in the other, ignoring order.
  const sameModifiers = (a: SelectedModifier[], b: SelectedModifier[]) => {
    if (a.length !== b.length) return false;
    const key = (m: SelectedModifier) => `${m.groupId}::${m.optionId}`;
    const aKeys = a.map(key).sort();
    const bKeys = b.map(key).sort();
    return aKeys.every((k, idx) => k === bKeys[idx]);
  };

  const addToCartDirect = (
    item: MenuItem,
    quantity: number,
    modifiers: SelectedModifier[],
    notes: string
  ) => {
    SoundService.playAdd();
    const unitPrice = calculateItemUnitPrice(item.price, modifiers);

    applyCart((prev) => {
      // Adding the exact same item with the exact same customization and
      // notes should increase that line's quantity, not create a second,
      // visually-duplicate line — this used to always push a brand new
      // line, so tapping + on "Butter Naan" twice showed two separate
      // "Butter Naan x1" rows instead of one "Butter Naan x2" row.
      const existingIdx = prev.findIndex(
        (ci) =>
          ci.menuItemId === item.id &&
          ci.specialInstructions === notes &&
          sameModifiers(ci.selectedModifiers, modifiers)
      );

      if (existingIdx !== -1) {
        const next = [...prev];
        const existing = next[existingIdx];
        const nextQty = existing.quantity + quantity;
        next[existingIdx] = {
          ...existing,
          quantity: nextQty,
          itemTotal: calculateItemTotal(item.price, nextQty, existing.selectedModifiers)
        };
        return next;
      }

      const newCartItem: CartItem = {
        cartItemId: generateUUID(),
        menuItemId: item.id,
        item,
        quantity,
        unitPrice,
        selectedModifiers: modifiers,
        specialInstructions: notes,
        itemTotal: calculateItemTotal(item.price, quantity, modifiers)
      };
      return [...prev, newCartItem];
    });
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
    const publishedBundle = MenuRepository.getMenuItemById(comboItem.id);
    if (!publishedBundle || !publishedBundle.isAvailable) { showToast('This combo is not published or is unavailable. Please choose another item.'); return; }
    addToCartDirect(publishedBundle, 1, [], combo.description);
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
    applyCart((prev) =>
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

  // Asks the server for the UPI QR of one pending payment and shows it. The server holds the Razorpay keys
  // and only issues a QR for an open payment of an ACTIVE restaurant; anything else falls back to cash.
  const showPaymentQr = async (paymentId: string) => {
    setQrLoading(true);
    try {
      const qr = await createPaymentQr(paymentId);
      const src = toQrImageSrc(qr.qrPayload, qr.contentType);
      if (!src) throw new Error('Razorpay returned a QR the kiosk cannot display');
      const expires = new Date(qr.expiresAt).getTime();
      setQrImageSrc(src);
      setQrExpiresAt(expires);
      setQrSecondsLeft(Math.max(0, Math.round((expires - Date.now()) / 1000)));
      setPaymentStatus('WAITING_FOR_USER');
      // Keep watching for two minutes past this QR's expiry so a payment made in its last seconds is caught.
      reconciliationDeadlineRef.current = expires + 2 * 60 * 1000;
    } catch (err) {
      console.error('Payment QR failed:', err);
      setQrImageSrc(null);
      setQrExpiresAt(null);
      setRazorpayUnavailable(true);
    } finally {
      setQrLoading(false);
    }
  };

  // The guest backs out of the QR screen. The order is cancelled on this terminal and the payment is no
  // longer watched; if they pay anyway the server lists it under "needs attention" for staff.
  const handleCancelQr = () => {
    SoundService.playTap();
    const orderId = localOrderIdForPayment;
    clearPendingPayment();
    setRealPaymentId(null);
    setQuotedPayable(null);
    setQrImageSrc(null);
    setQrExpiresAt(null);
    setQrSecondsLeft(0);
    setPaymentStatus('CREATED');
    if (orderId) {
      try {
        cancelAbandonedKioskDraft(orderId);
      } catch (err) {
        console.error('Could not cancel the pending order:', err);
      }
    }
    setLocalOrderIdForPayment(null);
    setStep('MENU');
    setIsCartOpen(true);
  };

  // Start Payment Process
  const handleProceedToPayment = async () => {
    if (remoteLogoutInProgressRef.current) return;
    SoundService.playTap();
    resetIdleTimer();
    if (cartItems.length === 0) return;
    setQrImageSrc(null);
    setQrExpiresAt(null);
    setQrSecondsLeft(0);

    if (networkState === 'OFFLINE' && paymentMethod === 'UPI') {
      setPaymentMethod('CASH_AT_COUNTER');
      showToast('Internet offline: Switched to Pay Cash at Counter.');
    }

    setIsCartOpen(false);
    setStep('CHECKOUT_PAYMENT');
    setPaymentTimeLeft(60);
    setPaymentStatus('WAITING_FOR_USER');
    setRazorpayUnavailable(false);

    const effectiveMethod = networkState === 'OFFLINE' ? 'CASH_AT_COUNTER' : paymentMethod;

    // Create the local order PENDING first, before any network call, so it
    // has a stable id — this order is what handleGetToken (cash-at-counter)
    // and the real UPI success path below both act on. Never
    // paymentStatus: 'SUCCESS' here; that only ever happens once a real
    // payment is confirmed.
    const pendingOrder = OrderRepository.createOrder({
      idempotencyKey: generateIdempotencyKey('kiosk_ord'),
      // This kiosk numbers its own tokens, so they carry a prefix (K-101) that can never equal the counter's #101 (BUG-160).
      tokenNumber: OrderRepository.nextTokenNumber('K'),
      kioskId,
      sessionId,
      orderType,
      tableId: selectedTable?.id,
      tableNumber: selectedTable?.tableNumber,
      guestCount,
      customerPhone: loggedInAccount?.phone || undefined,
      customerName: loggedInAccount?.name || undefined,
      items: rawCalculated.items.map((ci) => ({
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
        snapshot: ci.taxSnapshot,
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
      paymentMethod: effectiveMethod,
      paymentStatus: 'PENDING',
      orderStatus: 'DRAFT',
      estimatedWaitMinutes: APP_CONSTANTS.DEFAULT_ESTIMATED_PREP_MINUTES,
      // Being online is not the same as having actually reached the cloud —
      // only SyncOutboxEngine.processOutbox() flipping this to SYNCED after
      // a real push means that. Marking it SYNCED here just because the
      // network looked up is the exact false-confirmation bug (BUG-009's
      // Kiosk-facing symptom: a "✓ Sent to Kitchen" badge that isn't true).
      syncStatus: 'SAVED_LOCALLY',
      isSynced: false
    });
    setLocalOrderIdForPayment(pendingOrder.id);

    if (effectiveMethod !== 'UPI') {
      // Cash-at-counter: the order is created, kitchen prep proceeds
      // (handleGetToken), payment is settled for real later at the counter.
      return;
    }

    await requestUpiPayment(pendingOrder);
  };

  /**
   * B2-XXX: picking the "UPI QR Payment" tile on the CHECKOUT_PAYMENT screen only ever called
   * setPaymentMethod('UPI') — a pure local state toggle with no network call. The QR was only
   * ever requested once, automatically, inside handleProceedToPayment, at the moment the guest
   * first reached this screen. A guest who arrived with Cash selected (or switched away from UPI
   * and back) saw the UPI tile highlight normally but the QR panel stuck on the generic
   * "Preparing…" message forever, with nothing happening server-side. createOrGetPaymentOrder is
   * idempotent by the local order's id, so re-requesting here for an already-created order is
   * safe — it returns the existing attempt rather than double-charging.
   */
  const requestUpiPayment = async (order: { id: string; totalAmount: number; items: Order['items'] }) => {
    const restaurantId = getKioskRestaurantId();
    if (!restaurantId) {
      setRazorpayUnavailable(true);
      return;
    }

    const lines: CartLinePayload[] = cartItems.map((ci) => ({
      externalItemId: ci.menuItemId,
      quantity: ci.quantity,
      selectedOptionIds: ci.selectedModifiers.map((m) => m.optionId)
    }));

    try {
      const result = await createPaymentOrder(order.id, lines);
      setQuotedPayable(result.amount / 100);
      setRealPaymentId(result.paymentId);
      reconciliationDeadlineRef.current = Date.now() + 5 * 60 * 1000; // 5 minutes total from order creation

      // The cloud prices independently from MenuSnapshotItem — reconcile the
      // local order to match whatever Razorpay will actually charge, so the
      // KOT, receipt, and revenue reports never disagree with the real
      // payment. This can legitimately differ if a kiosk-admin price edit
      // reached the cloud before it reached this terminal's own local menu
      // cache (LAN sync lag) — the cloud amount is always the one actually
      // charged, so it wins.
      const localAmountPaise = Math.round(order.totalAmount * 100);
      if (result.quote) {
        const { cgst: cgstPaise, sgst: sgstPaise } = splitTaxPaise(result.quote.taxAmount);
        OrderRepository.updateOrder(order.id, {
          subtotal: result.quote.subtotal / 100, taxAmount: result.quote.taxAmount / 100,
          cgstAmount: cgstPaise / 100, sgstAmount: sgstPaise / 100,
          totalAmount: result.amount / 100, discountAmount: 0, couponCode: undefined, roundOffAmount: 0,
          items: order.items.map((item, index) => {
            const line = result.quote.lines[index];
            return line ? { ...item, unitPrice: line.unitPrice / 100, totalPrice: line.unitPrice * item.quantity / 100,
              snapshot: { taxGroupId: line.taxGroupId, taxRateBp: line.taxRate, taxInclusive: line.taxInclusive, lineTax: line.lineTax } } : item;
          })
        });
      }
      // The online quote currently has no coupon/points discount contract. Never consume a benefit the gateway did not apply.
      if (appliedCoupon || redeemedPoints > 0 || staffDiscount > 0) {
        setAppliedCoupon(null); setRedeemedPoints(0); setStaffOverrideActive(false);
        showToast('Discounts were not applied to this online payment. No coupon or points will be used; check the updated total before paying.');
      } else if (result.amount !== localAmountPaise) {
        showToast('Your order total was updated to match the latest price.');
      }

      if (!result.paymentId) {
        setRazorpayUnavailable(true);
        return;
      }

      // Remember this payment on the terminal until its token/KOT are confirmed, so a crash or reload
      // between "customer paid" and "token printed" is recovered on the next start.
      savePendingPayment({ paymentId: result.paymentId, localOrderId: order.id, startedAt: Date.now() });
      await showPaymentQr(result.paymentId);
    } catch (err) {
      // A 403 here means this restaurant's Razorpay connection isn't ACTIVE
      // yet (payments.service.ts's own gate) — not a transient failure, so
      // no retry is offered; fall straight to the cash-at-counter messaging.
      console.error('Payment order creation failed:', err);
      setOnlinePaymentsPending(err instanceof CloudApiError && err.code === 'PAYMENTS_NOT_ACTIVE');
      setRazorpayUnavailable(true);
    }
  };

  // Tells the server the token and KOT now exist for this paid order. Kept on the terminal until the server
  // acknowledges, and retried, because the server treats a paid order with no acknowledgement as "needs
  // attention" and staff would otherwise be asked to chase an order that was in fact served.
  const acknowledgeFulfilled = async (paymentId: string) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await markPaymentFulfilled(paymentId);
        clearPendingPayment();
        return;
      } catch (err) {
        console.error('Could not confirm fulfilment yet:', err);
        await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
      }
    }
  };

  const finalizingRef = useRef(false);

  // A UPI payment the server has confirmed: settle the local order, then create the token, KOT and receipt
  // exactly once. Safe to call from the live poll and from crash recovery at the same time, and safe to
  // repeat after a restart (a KOT that already exists is never created twice).
  const finalizePaidOrder = async (paymentId: string, localOrderId: string) => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    try {
      setPaymentStatus('SUCCESS');
      let order = OrderRepository.getOrderById(localOrderId);
      if (!order) {
        // This terminal no longer has the order (storage cleared). The server still shows the paid
        // order as needing attention, which is where staff will find it.
        clearPendingPayment();
        return;
      }
      if (order.paymentStatus !== 'SUCCESS') {
        // Payment acceptance is not kitchen completion. Keep the order active until food is served.
        OrderRepository.updateOrder(localOrderId, {
          paymentMethod: 'UPI', paymentStatus: 'SUCCESS', paymentTransactionId: paymentId,
          orderStatus: 'CONFIRMED'
        });
        order = OrderRepository.getOrderById(localOrderId) ?? order;
      }
      if (KOTRepository.getKOTsForOrder(localOrderId).length > 0) {
        await acknowledgeFulfilled(paymentId);
        return;
      }
      await proceedToConfirmation(order, typeof navigator !== 'undefined' ? navigator.onLine : true, paymentId);
    } finally {
      finalizingRef.current = false;
    }
  };

  // Complete Order Creation (Truthful Status: Online vs Offline)
  // Shared confirmation/KOT/print/voice tail — runs once an order's real
  // payment is settled, whichever path settled it: cash at the counter
  // (handleGetToken) or a Razorpay-confirmed UPI payment (finalizePaidOrder).
  const proceedToConfirmation = async (order: Order, isCurrentlyOnline: boolean, paymentId?: string) => {
    // Audio chime on successful order
    SoundService.playSuccess();

    // Generate station-routed Kitchen Order Tickets so this order appears
    // on the KDS board grouped by kitchen station, exactly like a POS
    // order — previously the kiosk only printed a customer receipt and
    // never created KOT records, so kitchen staff never saw kiosk orders.
    // Built from the saved order, not the on-screen cart, so it also works after a restart when the cart is gone.
    const kotItems = order.items.map((it) => ({
      id: `koti-${it.id}`,
      orderItemId: it.id,
      menuItemId: it.menuItemId,
      name: it.name,
      quantity: it.quantity,
      modifiers: it.modifiers,
      specialInstructions: it.specialInstructions,
      kitchenStation: db.menuItems.find((m) => m.id === it.menuItemId)?.kitchenStation || 'Main Kitchen',
      status: 'PREPARING' as const
    }));
    // One set of kitchen tickets per order, however many times this runs (double tap, a re-render, or a restart on the
    // confirmation screen). A second run used to create a second set of tickets and print them again.
    const existingKots = KOTRepository.getKOTsForOrder(order.id);
    const orderLabel = String(order.orderNumber || order.tokenNumber || order.id).replace(/[^A-Za-z0-9-]/g, '');
    const kots = existingKots.length > 0 ? [] : KOTRepository.generateKOT({
      orderId: order.id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      tableNumber: order.tableNumber ?? selectedTable?.tableNumber,
      orderType: order.orderType ?? orderType,
      items: kotItems,
      cashierName: 'Kiosk Self-Order',
      // Deterministic ids: the same order always yields the same tickets, so a repeat can never add a second copy.
      idBase: `kot-${order.id}-r1`,
      numberBase: `KOT-${orderLabel}`
    });
    // Both cash and verified online orders must leave the outbox immediately.
    // Receipt printing and speech must not hold up the kitchen delivery.
    const confirmationSync = SyncOutboxEngine.processOutbox();
    // A prepaid order's tickets print only once, across every terminal. Online, the server decides who may print.
    // If the server cannot be reached, the tickets print anyway: a missed kitchen ticket is worse than a rare repeat.
    // Tickets print only when they were made just now: an order whose tickets already exist was printed before.
    let printTickets = kots.length > 0;
    if (printTickets && paymentId && isCurrentlyOnline) {
      try {
        printTickets = (await claimKitchenTicket(paymentId)).claimed;
      } catch (err) {
        console.error('Kitchen ticket claim unavailable; printing locally:', err);
      }
    }
    if (printTickets) kots.forEach((kot) => PrinterService.printKOT(kot));

    // The ticket now exists: tell the server, which stops flagging this paid order as needing attention.
    if (paymentId) void confirmationSync.then(() => acknowledgeFulfilled(paymentId));

    // If logged in, earn loyalty points on the same tiered program POS and Captain use (base rate ×
    // tier multiplier, both set by the restaurant admin) — this used to be its own separate, disconnected
    // flat 10% rule, so a kiosk guest's tier, multiplier and even the admin's own configured rate never
    // applied to a kiosk purchase. Guarded by loyaltyPointsEarned the same way settleOrder is, so a kiosk
    // order (which, unlike POS, can legitimately re-run this confirmation tail on a crash-recovery retry)
    // can never be credited twice for one purchase.
    if (loggedInAccount && order.loyaltyPointsEarned === undefined) {
      order.loyaltyPointsEarned = CustomerRepository.earnPointsForOrder(loggedInAccount.phone, order.totalAmount, order.id);
      if (redeemedPoints > 0) {
        CustomerRepository.redeemPoints(loggedInAccount.phone, redeemedPoints);
      }
    }

    // Update coupon usage
    if (order.couponCode && order.discountAmount > 0) {
      CouponRepository.incrementUsage(order.couponCode);
    }

    AuditRepository.log({
      kioskId,
      action: 'ORDER_PLACED',
      category: 'ORDER',
      details: `Customer placed Order ${order.orderNumber} (Token #${order.tokenNumber}, Total ₹${order.totalAmount}, Mode: ${isCurrentlyOnline ? 'ONLINE' : 'OFFLINE_SAVED'})`
    });

    setPlacedOrder(order);
    setPaymentStatus('SUCCESS');
    setIsProcessingPayment(false);
    setStep('CONFIRMATION');
    setPrintSettled(false);
    setSpeechSettled(false);

    // 1. Automatically dispatch receipt to thermal printer (Zero user prompts required)
    try {
      const printRes = await printKioskReceipt(order);
      setAutoPrintStatus({
        printed: printRes.success,
        message: printRes.message,
        printerName: printRes.printerName
      });
      if (printRes.success) {
        showToast(`Receipt dispatch: ${printRes.message}`);
      }
    } catch (err) {
      console.warn('Auto print dispatch error:', err);
    } finally {
      setPrintSettled(true);
    }

    // 2. Trigger audio chime and spoken confirmation in selected language (Hindi/Gujarati/English)
    const voiceMsg = VoiceService.getConfirmationMessage(
      order.tokenNumber,
      toVoiceLanguage(lang),
      'STANDARD',
      isCurrentlyOnline
    );

    const voicePromise = VoiceService.speak(voiceMsg, toVoiceLanguage(lang));
    const watchdogPromise = new Promise(resolve => setTimeout(resolve, 15000));
    Promise.race([voicePromise, watchdogPromise]).finally(() => {
      setSpeechSettled(true);
    });
  };

  // Cash-at-counter confirmation: the order was already created PENDING in
  // handleProceedToPayment — this just fetches it and runs the shared tail.
  const handleGetToken = async () => {
    resetIdleTimer();
    setIsProcessingPayment(true);
    if (!localOrderIdForPayment) {
      setIsProcessingPayment(false);
      return;
    }
    // The order was created before the guest chose how to pay (default UPI): record the real choice (BUG-134).
    const order = confirmKioskCashOrder(localOrderIdForPayment);
    if (!order) {
      setIsProcessingPayment(false);
      return;
    }
    await proceedToConfirmation(order, networkState === 'ONLINE');
  };

  // Entry and acknowledgement belong to the touch dialog; retain the existing
  // cloud-order synchronization recovery without letting it reset this session.
  const handleReceiptDelivery = async (channel: ReceiptDeliveryChannel, recipient: string): Promise<ReceiptDeliveryResult> => {
    if (!placedOrder || receiptDeliveryBusy) return { success: false, message: 'Your order is not available for receipt delivery. Please ask the counter.' };
    const generation = receiptGeneration.current;
    const order = placedOrder;
    resetIdleTimer();
    setReceiptDeliveryBusy(true);
    try {
      let res;
      if (channel === 'EMAIL') {
        res = await EBillService.sendEmailEBill(order, recipient, emailReceipt);
        for (let attempt = 0; !res.success && isOrderStillSyncingMessage(res.message) && attempt < 4 && generation === receiptGeneration.current; attempt++) {
          await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
          await new Promise((resolve) => setTimeout(resolve, 1500));
          if (generation !== receiptGeneration.current) return { success: false, message: 'The kiosk session has ended.' };
          res = await EBillService.sendEmailEBill(order, recipient, emailReceipt);
        }
      } else {
        res = await EBillService.sendWhatsAppBill(order, recipient, whatsappReceipt);
      }
      ReceiptRepository.addRecord(res.record);
      if (res.success && generation === receiptGeneration.current) setEBillSuccessMessage(res.message);
      return { success: res.success, message: res.message };
    } catch {
      return { success: false, message: 'Your bill could not be sent. Please try again or ask the counter for help.' };
    } finally {
      if (generation === receiptGeneration.current) {
        setReceiptDeliveryBusy(false);
        resetIdleTimer();
      }
    }
  };

  // Staff Call Service
  // Whether the counter really received the last "call staff" request. The guest is told a team member is on the
  // way only when it did; otherwise they are asked to go to the counter (BUG-137).
  const [staffCallDelivered, setStaffCallDelivered] = useState<boolean | null>(null);

  const handleCallStaff = () => {
    SoundService.playTap();
    resetIdleTimer();
    ServiceRequestRepository.create({
      kioskId,
      tableNumber: selectedTable?.tableNumber,
      sessionId,
      type: 'CALL_STAFF'
    });
    // Send it to the people who staff the counter (POS, Restaurant Admin, Kiosk Admin).
    ServiceMessages.enqueue({
      kind: 'CALL_STAFF',
      recipient: 'COUNTER',
      senderName: 'Self-order kiosk',
      presetText: selectedTable?.tableNumber ? `A guest at Table ${selectedTable.tableNumber} asked for help.` : 'A guest at the self-order kiosk asked for help.',
      tableNumber: selectedTable?.tableNumber
    });
    setStaffCallDelivered(null);
    setIsStaffModalOpen(true);
    void pushServiceMessages().then(setStaffCallDelivered);
  };

  // Customer Chatbot Assistant Handler
  const handleSendCustomerQuery = (queryText: string) => {
    if (!queryText.trim() || !AiConfig.isEnabled()) return;
    if (!AiConfig.canQuery()) {
      showToast("Today's JAMAN AI question limit has been reached.");
      return;
    }
    const queryStarted = performance.now();

    const userMsg: ChatMessage = {
      id: `cust-user-${Date.now()}`,
      sender: 'USER',
      text: queryText,
      timestamp: new Date().toISOString()
    };

    const responseMsg = CustomerChatbotEngine.processQuery(queryText, { paymentMethods: onlinePaymentUnavailable ? ["Cash at counter"] : ["UPI / online QR", "Cash at counter"] });
    void reportCustomerAiQuery(performance.now() - queryStarted);

    setChatMessages((prev) => [...prev, userMsg, responseMsg]);
    setChatInput('');
  };

  // Staff PIN Check — was a hardcoded '1234' bypass (printed on-screen) with
  // zero backend verification, the same bug class as pos-admin's admin123
  // backdoor and KDS's unchecked PIN, just applied here to unlock a manager
  // discount override. Now validates against a real db.users record with a
  // manager/admin-tier role, same as Captain's SEC-006 fix.
  const handleStaffPinVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    // The kiosk holds no PIN hashes (a public terminal must not): the server says whether this is a manager's PIN.
    let matchedUser: { fullName: string } | undefined;
    let serverMessage: string | null = null;
    try {
      const approved = await verifyManagerPin(staffPin);
      matchedUser = approved ? { fullName: approved.staffName } : undefined;
    } catch (err) {
      serverMessage = err instanceof Error && (err as { status?: number }).status === 429 ? err.message : 'A manager override needs a connection to the restaurant server.';
    }

    if (matchedUser) {
      setIsStaffPinModalOpen(false);
      setStaffPin('');
      setVerifiedStaffName(matchedUser.fullName);
      setIsStaffActionMenuOpen(true);
      AuditRepository.log({
        kioskId,
        action: 'STAFF_OVERRIDE_PIN_SUCCESS',
        category: 'STAFF_OVERRIDE',
        details: `Staff authenticated on Kiosk User by ${matchedUser.fullName}`
      });
    } else {
      setStaffPin('');
      showToast(serverMessage ?? 'Invalid staff PIN.');
      AuditRepository.log({
        kioskId,
        action: 'STAFF_OVERRIDE_PIN_FAILED',
        category: 'STAFF_OVERRIDE',
        details: 'Staff override PIN entry failed verification'
      });
    }
  };

  /**
   * Prints to this Kiosk's own local printer when one is configured (see
   * KioskPrinterSettingsModal) -- never resolved through the shared, LAN-synced
   * db.configuredPrinters list, which has no notion of which physical machine a printer is
   * plugged into. Falls back to the shared system only when this Kiosk has no local printer
   * set up, preserving existing behaviour for any install that still relies on it.
   */
  const printKioskReceipt = async (order: Order): Promise<{ success: boolean; message: string; printerName: string }> => {
    const local = KioskLocalPrinterRepository.get();
    if (local) {
      const res = await PrinterService.printReceiptOnPrinter(order, {
        id: 'kiosk-local-printer',
        name: local.name,
        interfaceType: local.interfaceType,
        port: local.port,
        ipAddress: local.ipAddress,
        systemPrinterName: local.systemPrinterName,
        baudRate: local.baudRate,
        paperSize: local.paperSize,
        status: 'READY',
        isDefault: true,
        isKioskBuiltIn: true,
        modelName: 'Kiosk Local Printer'
      });
      return { ...res, printerName: local.name };
    }
    const activePrn = PrinterService.getActivePrinter();
    const res = await PrinterService.printReceipt(order);
    return { ...res, printerName: activePrn?.name ?? 'No printer configured' };
  };

  const handleApplyManagerDiscount = () => {
    setStaffOverrideActive(true);
    setIsStaffActionMenuOpen(false);
    showToast('Staff Mode: 10% Manager Discount Applied');
    AuditRepository.log({
      kioskId,
      action: 'STAFF_OVERRIDE_PIN_SUCCESS',
      category: 'STAFF_OVERRIDE',
      details: `Manager discount applied for customer assistance by ${verifiedStaffName ?? 'staff'}`
    });
  };

  const handleOpenPrinterSettings = () => {
    setIsStaffActionMenuOpen(false);
    setIsKioskPrinterSettingsOpen(true);
    AuditRepository.log({
      kioskId,
      action: 'STAFF_OVERRIDE_PIN_SUCCESS',
      category: 'STAFF_OVERRIDE',
      details: `Kiosk printer settings opened by ${verifiedStaffName ?? 'staff'}`
    });
  };

  // Feedback Submission
  const handleSubmitFeedback = () => {
    if (feedbackRating === 0) return; // defense in depth alongside the button's own disabled state
    FeedbackRepository.submit({
      orderId: placedOrder?.id,
      kioskId,
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
    const code = generateSecureNumericCode(4);
    setOtpGenerated(code);
    setOtpExpiresAt(Date.now() + OTP_VALID_MS);
    setOtpAttempts(0);
    setOtpInput('');
    setOtpSent(true);
    // Honest, not "sent to your phone": no SMS gateway is configured anywhere in this build.
    showToast(`No SMS gateway configured — your one-time code is: ${code}`);
  };

  const handleVerifyOtp = () => {
    if (Date.now() > otpExpiresAt) {
      alert('That code has expired. Tap Send OTP again for a new one.');
      setOtpSent(false);
      setOtpInput('');
      return;
    }
    if (otpAttempts >= OTP_MAX_ATTEMPTS) {
      alert('Too many wrong attempts. Tap Send OTP again for a new code.');
      setOtpSent(false);
      setOtpInput('');
      return;
    }
    if (otpInput.length === 4 && otpInput === otpGenerated) {
      const account = CustomerRepository.getOrCreateAccount(phoneInput);
      setLoggedInAccount(account);
      setIsAuthModalOpen(false);
      setOtpSent(false);
      setPhoneInput('');
      setOtpInput('');
      setOtpGenerated('');
      setOtpAttempts(0);
      showToast(`Welcome back, ${account.name}! (${account.loyaltyPoints} Loyalty Points Available)`);
    } else {
      const attempts = otpAttempts + 1;
      setOtpAttempts(attempts);
      setOtpInput('');
      alert(attempts >= OTP_MAX_ATTEMPTS ? 'Incorrect code. No attempts left — tap Send OTP again.' : `Incorrect code. ${OTP_MAX_ATTEMPTS - attempts} attempt(s) left.`);
    }
  };

  if (activationStep === 'success' && activationSuccess) {
    return (
      <div className="min-h-screen bg-jaman-ivory flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="flex justify-center">
          <JamanvaarLogo variant="horizontal" size="xl" imgStyle={{ height: '80px', width: 'auto' }} />
        </div>
        <div className="mt-8 p-8 max-w-md bg-white rounded-3xl border border-jaman-border shadow-xl">
          <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600 mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-jaman-navy">Kiosk Connected!</h2>
          <p className="text-sm text-[#4A5568] mt-3 leading-relaxed">
            This terminal is now activated for <strong>{activationSuccess.restaurantName}</strong>.
          </p>
          {activationSuccess.mismatchNote && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-4 text-left">
              {activationSuccess.mismatchNote}
            </p>
          )}
          <div className="mt-6 pt-4 border-t border-[#F3EFE6] text-xs text-[#8C9BAE] font-medium">
            Terminal ID: {activationSuccess.deviceId.slice(0, 8)}
          </div>
          <button
            type="button"
            onClick={() => setActivationStep('form')}
            className="mt-6 w-full py-3 rounded-2xl bg-gradient-to-r from-[#FF8A00] to-[#F97316] hover:brightness-105 text-white font-extrabold text-sm shadow-[0_10px_24px_rgba(249,115,22,0.28)] transition-all active:scale-[0.99] cursor-pointer"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Device activation gate — nothing below assumes a valid restaurant/
  // device identity until this passes, so it runs before every other
  // early-return (including the maintenance lock check right below).
  if (!isDeviceActivated) {
    return (
      <JAMANVAARStartup appName="Self-Order Kiosk" appType="KIOSK" subtitle="Customer Self-Ordering Terminal">
        <JamanvaarKioskAuthLayout
          backgroundPhoto={welcomeBackgroundUrl({ backgroundId: 'modern-indian-dining', showHeritageArtwork: false, showPromoBanner: false })}
          foodPhoto="/assets/menu/biryani/royal-veg-biryani.jpg"
          heroHeadline={['Guests order.', 'Kitchen fires', 'instantly.']}
          heroDescription="A modern self-ordering kiosk for a smoother and happier dining experience."
          features={[
            { icon: 'touch', label: 'Touch to Order' },
            { icon: 'kitchen', label: 'Instant Kitchen Orders' },
            { icon: 'suggest', label: 'Smart Suggestions' },
            { icon: 'happy', label: 'Happier Customers' }
          ]}
        >
          <ActivationNoticeBanner />
          <div className="space-y-1 mb-5">
            <h2 className="text-2xl sm:text-3xl font-black text-jaman-navy tracking-tight">Activate Your Kiosk</h2>
            <p className="text-sm sm:text-base text-[#52677A] font-medium">
              Enter the activation key from your Super Admin Welcome Kit to connect this kiosk to your restaurant.
            </p>
          </div>
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label htmlFor="kiosk-restaurant-code" className="text-xs font-extrabold text-jaman-navy flex items-center gap-1.5 mb-1.5">
                <Store className="w-3.5 h-3.5 text-jaman-saffron" />
                Restaurant ID *
              </label>
              <input
                id="kiosk-restaurant-code"
                type="text"
                value={restaurantCodeInput}
                onChange={(e) => setRestaurantCodeInput(e.target.value.toUpperCase())}
                placeholder="JM9876543210"
                required
                autoFocus
                inputMode="text"
                className="w-full bg-[#FFFCF8] border-[1.5px] border-[#E5D7C8] focus:border-[#F97316] focus:shadow-[0_0_0_4px_rgba(249,115,22,0.10)] rounded-2xl px-5 py-4 text-lg text-center font-mono text-jaman-navy font-bold focus:outline-hidden transition-all uppercase tracking-wider placeholder:text-slate-400"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="kiosk-activation-key" className="text-xs font-extrabold text-jaman-navy flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-jaman-saffron" />
                  Activation Key *
                </label>
                <button
                  type="button"
                  onClick={() => setShowKeyHint((v) => !v)}
                  className="text-xs font-bold text-jaman-navy/80 hover:text-jaman-saffron flex items-center gap-1 cursor-pointer min-h-11 -my-3.5"
                  aria-expanded={showKeyHint}
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Where can I find this?
                </button>
              </div>
              {showKeyHint && (
                <p className="text-[11px] text-[#52677A] font-medium bg-[#FFF8EE] border border-[#F0E2D0] rounded-xl px-3 py-2 mb-2">
                  Your restaurant owner gets both of these from Restaurant Admin under Subscription Plans, Device &amp; Staff Logins, once JAMANVAAR has activated your plan.
                </p>
              )}
              <input
                id="kiosk-activation-key"
                type="text"
                value={activationCode}
                onChange={(e) => setActivationCode(formatActivationKeyInput(e.target.value))}
                placeholder="JMV-XXXX-XXXX-XXXX"
                required
                inputMode="text"
                aria-describedby={activationError ? 'kiosk-activation-error' : undefined}
                className="w-full bg-[#FFFCF8] border-[1.5px] border-[#E5D7C8] focus:border-[#F97316] focus:shadow-[0_0_0_4px_rgba(249,115,22,0.10)] rounded-2xl px-5 py-4 text-lg text-center font-mono text-jaman-navy font-bold focus:outline-hidden transition-all uppercase tracking-wider placeholder:text-slate-400"
              />
            </div>
            {activationError && (
              <div id="kiosk-activation-error" role="alert" className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl text-center flex items-center justify-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{activationError}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={activationStep !== 'form' || !activationCode.trim() || !restaurantCodeInput.trim()}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#C2570C] to-[#B8500C] hover:brightness-105 disabled:opacity-100 disabled:grayscale-0 disabled:bg-none disabled:bg-[#5F6F80] disabled:shadow-none text-white font-extrabold text-base shadow-[0_10px_24px_rgba(249,115,22,0.28)] transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
            >
              <span>
                {activationStep === 'verifying' && 'Verifying restaurant…'}
                {activationStep === 'registering' && 'Connecting kiosk…'}
                {activationStep === 'syncing' && 'Syncing restaurant details…'}
                {activationStep === 'form' && 'Activate Kiosk'}
              </span>
              {activationStep === 'form' && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>
          <div className="mt-4">
            <ActivationHelpNote deviceNoun="kiosk" />
          </div>
        </JamanvaarKioskAuthLayout>
      </JAMANVAARStartup>
    );
  }

  if (remoteLogoutInProgress) return <JAMANVAARStartup appName="Self-Order Kiosk" appType="KIOSK"><div role="status" className="p-8 text-center"><h2 className="text-2xl font-bold">Kiosk logout in progress</h2><p>Waiting for Restaurant Admin confirmation. Your saved orders are retained.</p></div></JAMANVAARStartup>;

  // Maintenance screen if locked by Admin
  if (kioskConfig && kioskConfig.isLocked) {
    return (
      <div className="min-h-screen bg-jaman-ivory flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="flex justify-center">
          <JamanvaarLogo variant="horizontal" size="xl" imgStyle={{ height: '80px', width: 'auto' }} />
        </div>
        <div className="mt-8 p-8 max-w-md bg-white rounded-3xl border border-jaman-border shadow-xl">
          <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-jaman-saffron mb-4">
            <UtensilsCrossed className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-jaman-navy">KIOSK TEMPORARILY UNAVAILABLE</h2>
          <p className="text-sm text-[#4A5568] mt-3 leading-relaxed">
            Our self-ordering kiosk is currently undergoing scheduled updates. Please place your order at the main counter.
          </p>
          <div className="mt-6 pt-4 border-t border-[#F3EFE6] text-xs text-[#8C9BAE] font-medium">
            JAMANVAAR • Terminal {kioskId}
          </div>
        </div>
      </div>
    );
  }

  return (
    <JAMANVAARStartup appName="Self-Order Kiosk" appType="KIOSK" subtitle="Customer Self-Ordering Experience">
      <div
        style={{ '--color-brand': kioskSettings.accentColor || '#EF6A0B', '--kiosk-accent': kioskSettings.accentColor || '#EF6A0B' } as React.CSSProperties}
        onClick={resetIdleTimer}
        onTouchStart={resetIdleTimer}
        className={`min-h-screen min-h-dvh flex flex-col bg-jaman-ivory text-jaman-navy select-none ${
          isHighContrast ? 'contrast-125 saturate-150' : ''
        } ${isLargeText ? 'text-lg' : 'text-base'}`}
      >
      {/* Welcome → Language Select transition — lightweight CSS
          transform/opacity only, no libraries. Kept as one shared block
          (rather than duplicated per-step) since both screens reference
          these classes. See handleStartOrder / the step-effect above for
          the JS side that flips these on and off. */}
      <style>{`
        .bg-brand, .bg-jaman-saffron { background-color: var(--kiosk-accent); }
        .text-brand, .text-jaman-saffron { color: var(--kiosk-accent); }
        .border-brand { border-color: var(--kiosk-accent); }
        @keyframes kioskStartOrderTap {
          0% { transform: scale(1); }
          45% { transform: scale(0.93); }
          100% { transform: scale(1); }
        }
        .kiosk-start-order-btn.kiosk-tapped { animation: kioskStartOrderTap 0.22s ease-out; }

        .kiosk-welcome-center {
          transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .kiosk-welcome-center.kiosk-welcome-exiting {
          opacity: 0;
          transform: scale(0.96);
        }
        .kiosk-food-panel {
          transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .kiosk-food-panel-left.kiosk-welcome-exiting { opacity: 0; transform: translateX(-32px); }
        .kiosk-food-panel-right.kiosk-welcome-exiting { opacity: 0; transform: translateX(32px); }

        .kiosk-lang-photo {
          opacity: 0;
          transform: scale(1.04);
          transition: opacity 0.65s ease, transform 0.65s ease;
        }
        .kiosk-lang-page.kiosk-lang-entered .kiosk-lang-photo { opacity: 1; transform: scale(1); }

        .kiosk-lang-logo,
        .kiosk-lang-heading {
          opacity: 0;
          transform: translateY(14px);
          transition: opacity 0.28s ease, transform 0.28s ease;
        }
        .kiosk-lang-page.kiosk-lang-entered .kiosk-lang-logo {
          opacity: 1; transform: translateY(0); transition-delay: 0.02s;
        }
        .kiosk-lang-page.kiosk-lang-entered .kiosk-lang-heading {
          opacity: 1; transform: translateY(0); transition-delay: 0.09s;
        }

        .kiosk-lang-card {
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 0.25s ease, transform 0.25s ease;
        }
        .kiosk-lang-page.kiosk-lang-entered .kiosk-lang-card:nth-child(1) { opacity: 1; transform: translateY(0); transition-delay: 0.22s; }
        .kiosk-lang-page.kiosk-lang-entered .kiosk-lang-card:nth-child(2) { opacity: 1; transform: translateY(0); transition-delay: 0.3s; }
        .kiosk-lang-page.kiosk-lang-entered .kiosk-lang-card:nth-child(3) { opacity: 1; transform: translateY(0); transition-delay: 0.38s; }

        /* Menu screen — cart panel's own reveal, on top of the layout's
           10/90 → 10/70/20 width transition (see the inline style on the
           grid container below). Plays once on mount (cart empty → first
           item added); does not replay on later item adds since the panel
           stays mounted for as long as the cart is non-empty. */
        @keyframes kioskCartRise {
          from { transform: translate3d(0, 100%, 0); }
          to { transform: translate3d(0, 0, 0); }
        }
        @keyframes kioskCartSink {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(0, 100%, 0); }
        }
        ::view-transition-old(root),
        ::view-transition-new(root) {
          animation: none;
        }
        ::view-transition-old(kiosk-menu) {
          animation: 200ms ease-out both kioskFadeOut;
        }
        ::view-transition-new(kiosk-menu) {
          animation: 240ms ease-out both kioskFadeIn;
        }
        ::view-transition-new(kiosk-cart) {
          animation: kioskCartRise 300ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        ::view-transition-old(kiosk-cart) {
          animation: kioskCartSink 200ms cubic-bezier(0.4, 0, 1, 1) both;
        }
        @keyframes kioskFadeIn { from { opacity: 0.4; } to { opacity: 1; } }
        @keyframes kioskFadeOut { from { opacity: 1; } to { opacity: 0.4; } }
        @supports not (view-transition-name: none) {
          .kiosk-cart-panel { animation: kioskCartRise 300ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        }

        @media (prefers-reduced-motion: reduce) {
          .kiosk-start-order-btn.kiosk-tapped,
          .kiosk-welcome-center,
          .kiosk-food-panel,
          .kiosk-lang-photo,
          .kiosk-lang-logo,
          .kiosk-lang-heading,
          .kiosk-lang-card,
          .kiosk-cart-panel {
            animation: none !important;
            transition: none !important;
          }
          ::view-transition-old(*),
          ::view-transition-new(*) {
            animation: none !important;
          }
        }
      `}</style>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-jaman-navy text-white px-6 py-4 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-3 animate-bounce">
          <CheckCircle2 className="w-6 h-6 text-[#16A34A]" />
          <span className="font-bold text-base">{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER — hidden on the language-select screen itself, which
          already asks the one question this header's language switcher
          would otherwise duplicate, and reads cleaner as a distraction-free
          first screen. */}
      {step !== 'LANGUAGE_SELECT' && step !== 'WELCOME' && (
      <header className="min-h-20 sm:min-h-24 bg-white border-b border-jaman-border px-6 py-2 flex flex-wrap items-center justify-between gap-2 shadow-sm sticky top-0 z-30">
        {/* Left: Real JAMANVAAR Brand Identity */}
        <div className="flex items-center gap-4">
          {(
            <button
              onClick={() => {
                SoundService.playTap();
                if (step === 'MENU') setStep('ORDER_TYPE');
                else if (step === 'CHECKOUT_PAYMENT') {
                  // B2-021: leaving the payment screen this way must not leave behind the real,
                  // unpaid order handleProceedToPayment already created — see cancelAbandonedPendingOrder.
                  cancelAbandonedPendingOrder();
                  setLocalOrderIdForPayment(null);
                  setRealPaymentId(null);
    setQuotedPayable(null);
                  setStep('MENU');
                }
                else if (step === 'TABLE_SELECT') setStep('ORDER_TYPE');
                else if (step === 'ORDER_TYPE') setStep('LANGUAGE_SELECT');
              }}
              className="w-12 h-12 rounded-2xl bg-jaman-ivory border border-jaman-border text-jaman-navy hover:bg-[#F4EFE6] flex items-center justify-center transition-transform active:scale-95"
            >
              <ArrowLeft className="w-6 h-6 stroke-[2.5]" />
            </button>
          )}
          <BrandHeader
            app="KIOSK"
            logoUrl={kioskSettings.logoUrl}
            logoHeight={64}
            badgeSize="sm"
            showContext={false}
          />
        </div>

        {/* Right: Controls — trimmed to what a guest actually needs to see
            on every screen (language, help, call staff, cart). Accessibility,
            the network-simulation debug toggle, the phone-handoff QR, and
            login-when-logged-out used to all sit here permanently, making
            this read like a demo/dealer-review overlay rather than a
            dedicated self-service machine. They're all still one tap away
            in the "More" menu — nothing was removed, only decluttered. */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0 max-w-full">
          {/* Customer Loyalty Profile — shown only once actually logged in;
              the login prompt itself moved into "More" below. */}
          {loggedInAccount && (
            <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-800">
              <Award className="w-4 h-4 text-emerald-600" />
              <span>{loggedInAccount.loyaltyPoints}{kioskCopy("screen_pts__f501d5", "Pts (₹")}{loggedInAccount.loyaltyPoints})</span>
            </div>
          )}

          {showCustomerAi && (<>
          {/* Customer Chatbot Assistant Trigger ("Need Help?") */}
          <button
            onClick={() => {
              SoundService.playTap();
              setIsChatbotOpen(true);
            }}
            className="flex items-center gap-2 h-11 bg-jaman-saffron/10 hover:bg-jaman-saffron/20 text-jaman-saffron px-4 py-2.5 rounded-xl text-sm font-bold border border-jaman-saffron/30 transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">{kioskCopy("screen_need_help__5c799f", "Need Help?")}</span>
          </button>

          </>)}
          {/* Call Staff Button — kept directly visible and one tap, not
              behind an overflow menu, since it's the one control a guest
              may urgently need. */}
          <button
            onClick={handleCallStaff}
            className="flex items-center gap-2 h-11 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold text-sm hover:bg-amber-100 active:scale-95 transition-all shadow-sm"
          >
            <Bell className="w-4 h-4 text-jaman-saffron" />
            <span className="hidden sm:inline">{t('callStaff')}</span>
          </button>

          {/* Language Switcher — offers only what Kiosk Admin has enabled. */}
          <div className="flex items-center bg-jaman-ivory border border-jaman-border p-1 rounded-xl">
            {(kioskSettings.enabledLanguages as SupportedLanguage[]).map((l) => (
              <button
                key={l}
                onClick={() => {
                  SoundService.playTap();
                  setLang(l);
                }}
                aria-pressed={lang === l}
                className={`h-11 min-w-[3.25rem] px-3.5 rounded-lg text-sm font-black transition-all ${
                  lang === l
                    ? 'bg-jaman-saffron text-white shadow-sm'
                    : 'text-[#4A5568] hover:bg-white hover:text-jaman-navy'
                }`}
              >
                {l === 'en' ? 'EN' : LANGUAGE_OPTIONS.find((opt) => opt.code === l)?.native ?? l}
              </button>
            ))}
          </div>

          {/* "More" overflow — everything below still works exactly as
              before, just not permanently occupying the header. */}
          <div className="relative">
            <button
              onClick={() => {
                SoundService.playTap();
                setIsMoreMenuOpen((v) => !v);
              }}
              title="More options"
              aria-expanded={isMoreMenuOpen}
              className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all active:scale-95 ${
                isMoreMenuOpen
                  ? 'bg-jaman-navy border-jaman-navy text-white'
                  : 'bg-jaman-ivory border-jaman-border text-jaman-navy hover:bg-[#F4EFE6]'
              }`}
            >
              <Settings className="w-5 h-5" />
            </button>

            {isMoreMenuOpen && (
              <>
                {/* Backdrop to close on outside tap — a kiosk has no
                    keyboard/Escape affordance, so this is the only way out. */}
                <div className="fixed inset-0 z-40" onClick={() => setIsMoreMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-white rounded-2xl border border-jaman-border shadow-xl p-2 space-y-1">
                  {/* Network status — genuinely useful ambient info for an
                      offline-first kiosk, just not something that needs to
                      occupy the primary bar on every screen. */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-[#4A5568]">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        networkState === 'ONLINE'
                          ? 'bg-emerald-500'
                          : networkState === 'SYNCING'
                          ? 'bg-blue-500 animate-spin'
                          : 'bg-amber-500'
                      }`}
                    ></span>
                    <span>{kioskCopy("screen_network__760113", "Network:")}{networkState === 'ONLINE' ? 'Online' : networkState === 'SYNCING' ? 'Syncing…' : 'Offline'}
                    </span>
                    <button
                      onClick={() => {
                        const nextState = NetworkStatusService.toggleSimulatedOffline();
                        showToast(`Network switched to: ${nextState}`);
                      }}
                      title="Simulate online/offline (staff diagnostic)"
                      className="ml-auto text-[10px] text-[#8C9BAE] underline"
                    >{kioskCopy("screen_simulate_b9efe3", "simulate")}</button>
                  </div>

                  <button
                    onClick={() => {
                      const next = !(isHighContrast && isLargeText);
                      setIsHighContrast(next);
                      setIsLargeText(next);
                      setIsMoreMenuOpen(false);
                      showToast(next ? 'Accessibility mode on: larger text, higher contrast' : 'Accessibility mode off');
                    }}
                    aria-pressed={isHighContrast && isLargeText}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-jaman-navy hover:bg-jaman-ivory text-left"
                  >
                    <Eye className="w-4 h-4 text-jaman-saffron" />
                    {isHighContrast && isLargeText ? 'Turn off larger text & contrast' : 'Larger text & higher contrast'}
                  </button>

                  <button
                    onClick={() => {
                      SoundService.playTap();
                      setIsHandoffModalOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-jaman-navy hover:bg-jaman-ivory text-left"
                  >
                    <Smartphone className="w-4 h-4 text-jaman-saffron" />{kioskCopy("screen_order_on_phone_a6b0af", "Order on Phone")}</button>

                  {loggedInAccount ? (
                    <div className="sm:hidden flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-emerald-800">
                      <Award className="w-4 h-4 text-emerald-600" />
                      {loggedInAccount.loyaltyPoints}{kioskCopy("screen_loyalty_points_d9d154", "Loyalty Points")}</div>
                  ) : (
                    <button
                      onClick={() => {
                        SoundService.playTap();
                        setIsAuthModalOpen(true);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-jaman-navy hover:bg-jaman-ivory text-left"
                    >
                      <UserCheck className="w-4 h-4 text-jaman-saffron" />{kioskCopy("screen_loyalty_login_eceb65", "Loyalty / Login")}</button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Cart Trigger Button */}
          {step === 'MENU' && (
            <button
              onClick={() => {
                SoundService.playTap();
                setIsCartOpen(true);
              }}
              className="flex items-center gap-2.5 bg-jaman-saffron hover:bg-[#F27A2B] active:bg-[#D1560D] text-white px-4 py-2.5 rounded-2xl font-black text-sm shadow-lg shadow-jaman-saffron/25 transition-transform active:scale-95"
            >
              <ShoppingBag className="w-4 h-4 stroke-[2.5]" />
              <span>{t('cart')}</span>
              <span className="bg-white text-jaman-saffron px-2 py-0.5 rounded-full text-xs font-black">
                {cartItems.reduce((sum, it) => sum + it.quantity, 0)}
              </span>
              <span className="border-l border-white/30 pl-2">
                {formatINR(netTotalPayable)}
              </span>
            </button>
          )}
        </div>
      </header>
      )}

      {/* STEP 0: LANGUAGE SELECTION — the very first thing a freshly-booted
          kiosk asks. The header's own language switcher only handles
          changing it later; this is the dedicated first choice. */}
      {step === 'LANGUAGE_SELECT' && (
        <div className={`kiosk-lang-page w-full h-full flex-1 flex flex-col items-center justify-center p-8 relative isolate bg-jaman-ivory text-center space-y-10 ${langEntered ? 'kiosk-lang-entered' : ''}`}>
          <style>{`
            /* This photo's real detail (furniture, plants, marble floor,
               signboard) sits in its bottom third at full width; the rest
               is mostly open sky, so bg-bottom keeps the crop on that
               detail instead of the blank middle/top. */
            .kiosk-lang-bg { background-image: url(${JSON.stringify(resolveMenuImage('/assets/branding/kiosk-welcome-v1/modern-indian-dining.webp'))}); }
          `}</style>

          {/* Photo as its own layer (not the page's own background) so it
              gets a visibly distinct fade-in of its own, instead of just
              silently inheriting whatever opacity the page container ends
              up at. */}
          <div className="kiosk-lang-photo kiosk-lang-bg absolute inset-0 -z-20 bg-cover bg-bottom bg-no-repeat" />

          {/* Light legibility wash — same treatment as the Welcome page's
              own overlay: flat opacity (no gradient stops, so no possible
              boundary line), inset-0 over the full w-full h-full container
              for guaranteed 100% screen coverage. */}
          <div className="absolute inset-0 -z-10 bg-white/50" />

          <button
            onClick={() => {
              SoundService.playTap();
              setStep('WELCOME');
            }}
            className="absolute top-6 left-6 w-11 h-11 rounded-2xl bg-white/80 hover:bg-white border border-jaman-border text-jaman-navy flex items-center justify-center transition-transform active:scale-95 z-10"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>
          <div className="kiosk-lang-logo relative z-10 flex justify-center">
            {kioskSettings.logoUrl ? <img src={kioskSettings.logoUrl} alt="Restaurant logo" style={{height: 96, maxWidth: '100%', objectFit: 'contain'}} /> : <JamanvaarLogo variant="horizontal" size="2xl" imgStyle={{ height: '96px', width: 'auto' }} className="drop-shadow-sm" />}
          </div>

          <div className="kiosk-lang-heading relative z-10 space-y-2">
            <h1 className="text-3xl sm:text-4xl font-black text-jaman-navy tracking-tight font-serif">{kioskCopy("screen_choose_your_language_8e2d06", "Choose your language")}</h1>
            <p className="text-base text-[#4A5568] font-medium">भाषा चुनें • ભાષા પસંદ કરો</p>
          </div>

          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-3xl">
            {LANGUAGE_OPTIONS.filter((l) => kioskSettings.enabledLanguages.includes(l.code)).map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  SoundService.playTap();
                  setLang(l.code);
                  setStep('ORDER_TYPE');
                }}
                className="kiosk-lang-card bg-white p-8 rounded-3xl border-2 border-jaman-border hover:border-jaman-saffron shadow-lg hover:shadow-xl flex flex-col items-center gap-2 transition-all duration-200 active:scale-95 group"
              >
                <span className="text-3xl font-black text-jaman-navy group-hover:text-jaman-saffron transition-colors">
                  {l.native}
                </span>
                <span className="text-xs font-bold text-[#8C9BAE] uppercase tracking-wider">{l.label}</span>
              </button>
            ))}
          </div>

          <p className="relative z-10 text-xs font-semibold text-[#8C9BAE] tracking-wide uppercase">{kioskCopy("screen_you_can_change_this_anytime_from_the_header_d8f222", "You can change this anytime from the header")}</p>
        </div>
      )}

      {/* One renderer for the real kiosk and the owner's preview. */}
      {step === 'WELCOME' && <KioskWelcomeScreen
        settings={welcomeSettings}
        backgroundUrl={welcomeBackgroundUrl(welcomeSettings, WelcomeScreenSettingsRepository.getSettings().customBackgrounds)}
        restaurantName={db.restaurant.name}
        logoUrl={kioskSettings.logoUrl}
        accentColor={kioskSettings.accentColor}
        heading={(lang === 'en' && welcomeSettings.headingText) || t('welcomeLine1').replace('{{name}}', '')}
        subtitle={(lang === 'en' && welcomeSettings.subtitleText) || t('tagline')}
        buttonText={(lang === 'en' && welcomeSettings.startOrderButtonText) || t('startOrder')}
        instruction={(lang === 'en' && welcomeSettings.supportingText) || t('touchToBegin')}
        terminalId={kioskId} busy={startOrderTapped}
        onStart={handleStartOrder} onStaff={() => setIsStaffPinModalOpen(true)}
      />}

      {/* STEP 2: ORDER TYPE SELECTION */}
      {step === 'ORDER_TYPE' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-4xl mx-auto w-full space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl sm:text-4xl font-black text-jaman-navy">
              {t('selectOrderType')}
            </h2>
            <p className="text-base text-[#4A5568]">
              {t('selectOrderTypeSub')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-2xl">
            <button
              onClick={() => {
                SoundService.playTap();
                setOrderType('DINE_IN');
                console.info('[kiosk] Dine-In tapped, tables:', tables.length);
                setStep('TABLE_SELECT');
              }}
              className="bg-white p-8 rounded-3xl border-2 border-jaman-border hover:border-jaman-saffron shadow-lg hover:shadow-xl flex flex-col items-center text-center space-y-4 transition-all duration-200 active:scale-95 group"
            >
              <div className="w-24 h-24 rounded-3xl bg-jaman-ivory border border-jaman-border group-hover:bg-[#FFF4ED] group-hover:border-jaman-saffron/30 flex items-center justify-center text-jaman-navy group-hover:text-jaman-saffron transition-colors">
                <UtensilsCrossed className="w-12 h-12 stroke-[2]" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-jaman-navy group-hover:text-jaman-saffron transition-colors">
                  {t('dineIn')}
                </h3>
                <p className="text-sm text-[#4A5568] mt-1">
                  {t('dineInDesc')}
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
              className="bg-white p-8 rounded-3xl border-2 border-jaman-border hover:border-jaman-saffron shadow-lg hover:shadow-xl flex flex-col items-center text-center space-y-4 transition-all duration-200 active:scale-95 group"
            >
              <div className="w-24 h-24 rounded-3xl bg-jaman-ivory border border-jaman-border group-hover:bg-[#FFF4ED] group-hover:border-jaman-saffron/30 flex items-center justify-center text-jaman-navy group-hover:text-jaman-saffron transition-colors">
                <ShoppingBag className="w-12 h-12 stroke-[2]" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-jaman-navy group-hover:text-jaman-saffron transition-colors">
                  {t('takeaway')}
                </h3>
                <p className="text-sm text-[#4A5568] mt-1">
                  {t('takeawayDesc')}
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
            <h2 className="text-3xl font-black text-jaman-navy">{t('selectTable')}</h2>
            <p className="text-sm text-[#4A5568]">{kioskCopy("screen_tap_the_table_number_where_you_are_seated__5e0202", "Tap the table number where you are seated.")}</p>
          </div>

          {tables.length === 0 && (
            <div className="rounded-2xl border border-jaman-border bg-white p-6 text-center text-sm text-[#4A5568]">{kioskCopy("screen_no_dining_tables_are_set_up_for_this_kiosk_yet_continue_5dc39c", "No dining tables are set up for this kiosk yet. Continue without a table, or ask staff to add tables.")}</div>
          )}
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
                    ? 'bg-jaman-navy text-white border-jaman-navy shadow-xl'
                    : 'bg-white text-jaman-navy border-jaman-border hover:border-jaman-saffron'
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
            >{kioskCopy("screen_skip_table_selection_pick_up_at_counter__b68635", "Skip Table Selection (Pick up at counter)")}</Button>
          </div>
        </div>
      )}

      {/* STEP 4: MENU CATALOG */}
      {step === 'MENU' && (
        <div
          // Explicit, DEFINITE height (not flex-1) — the app shell above is
          // sized with min-h-screen (a floor, not a fixed height), so in a
          // column flex container flex-grow has no real "extra space" to
          // distribute and never actually clamps this block; its content
          // was free to grow the whole page. Pinning the exact height here
          // (viewport minus the header's own h-20/h-24) gives every nested
          // overflow-hidden/overflow-y-auto below a genuinely bounded box
          // to work against, independent of the ambiguous parent sizing —
          // this is what makes the three-panel independent scroll actually
          // hold, not just the panels' own overflow classes.
          className="h-[calc(100dvh-80px)] sm:h-[calc(100dvh-96px)] min-h-0 grid overflow-hidden"
          style={{
            // Three fixed panels that never resize as the cart fills: the
            // category rail, the menu, and the cart (which shows an empty
            // state until items are added). minmax(0, …) keeps each track
            // from being pushed wider by its content.
            gridTemplateColumns: cartItems.length > 0 ? 'minmax(72px, 11fr) minmax(0, 66fr) minmax(0, 23fr)' : 'minmax(72px, 11fr) minmax(0, 89fr) 0fr',
            boxSizing: 'border-box'
          }}
        >
          {/* LEFT — CATEGORY RAIL: fixed-width, independently scrollable.
              Every tile shares one image box and one label style; the
              active tile is marked with an orange border and tint. Images
              are existing dish photos from each category (categories carry
              no photo of their own). */}
          <div className="min-w-0 h-full overflow-y-auto overflow-x-hidden bg-white border-r border-jaman-border flex flex-col gap-2 p-2">
            <button
              onClick={() => {
                SoundService.playTap();
                setSelectedCategoryId('ALL');
              }}
              className={`w-full flex flex-col items-center gap-1.5 p-2 rounded-2xl border text-center transition-colors active:scale-95 ${
                selectedCategoryId === 'ALL'
                  ? 'bg-jaman-saffron/10 border-jaman-saffron text-jaman-navy'
                  : 'bg-white border-jaman-border text-[#4A5568] hover:bg-jaman-ivory'
              }`}
            >
              <div className="w-full h-16 rounded-xl bg-jaman-ivory flex items-center justify-center text-jaman-saffron">
                <Grid className="w-6 h-6" />
              </div>
              <span className="text-xs font-semibold leading-tight line-clamp-2">{t('allMenu')}</span>
            </button>

            <button
              onClick={() => {
                SoundService.playTap();
                setSelectedCategoryId('cat-combos');
              }}
              className={`w-full flex flex-col items-center gap-1.5 p-2 rounded-2xl border text-center transition-colors active:scale-95 ${
                selectedCategoryId === 'cat-combos'
                  ? 'bg-jaman-saffron/10 border-jaman-saffron text-jaman-navy'
                  : 'bg-white border-jaman-border text-[#4A5568] hover:bg-jaman-ivory'
              }`}
            >
              <div className="w-full h-16 rounded-xl bg-jaman-ivory flex items-center justify-center text-jaman-saffron">
                <Flame className="w-6 h-6" />
              </div>
              <span className="text-xs font-semibold leading-tight line-clamp-2">{kioskCopy("screen_combos_deals_e531d6", "Combos & Deals")}</span>
            </button>

            {categories.filter((cat) => menuItems.some((m) => m.categoryId === cat.id && m.isAvailable)).map((cat) => {
              const cover =
                (cat as any).imageUrl || menuItems.find((m) => m.categoryId === cat.id && m.imageUrl)?.imageUrl;
              const photo = isMenuPlaceholder(cover) ? undefined : cover;
              const active = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    SoundService.playTap();
                    setSelectedCategoryId(cat.id);
                  }}
                  className={`w-full flex flex-col items-center gap-1.5 p-2 rounded-2xl border text-center transition-colors active:scale-95 ${
                    active
                      ? 'bg-jaman-saffron/10 border-jaman-saffron text-jaman-navy'
                      : 'bg-white border-jaman-border text-[#4A5568] hover:bg-jaman-ivory'
                  }`}
                >
                  <div className="relative w-full h-16 rounded-xl overflow-hidden bg-jaman-ivory flex items-center justify-center text-jaman-saffron">
                    {photo ? (
                      <CachedImg src={photo} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <MenuCategoryIcon name={cat.name} iconName={cat.iconName} size="md" />
                    )}
                    {photo && <MenuCategoryIcon name={cat.name} iconName={cat.iconName} className="absolute bottom-1 right-1 shadow-sm" />}
                  </div>
                  <span className="text-xs font-semibold leading-tight line-clamp-2">{localizedName(cat, lang)}</span>
                </button>
              );
            })}
          </div>

          {/* CENTER — MENU ITEMS (~70%, or ~90% before the first item is
              added): the filter bar stays put, everything below it scrolls
              on its own. */}
          <div className="min-w-0 h-full flex flex-col overflow-hidden" style={{ viewTransitionName: 'kiosk-menu' }}>
            {/* Filter Bar */}
            <div className="bg-white border-b border-jaman-border px-4 sm:px-6 py-3 flex items-center gap-3 shadow-sm shrink-0 min-w-0">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-[#8C9BAE] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchDishPlaceholder')}
                  className="w-full bg-jaman-ivory border border-jaman-border rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold text-jaman-navy placeholder-[#8C9BAE] focus:outline-none focus:ring-2 focus:ring-jaman-navy transition-all min-w-0"
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto scrollbar-none max-w-[55vw] sm:max-w-none">
                <button
                  onClick={() => {
                    SoundService.playTap();
                    setDietaryFilter('ALL');
                  }}
                  className={`px-4 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
                    dietaryFilter === 'ALL'
                      ? 'bg-jaman-navy text-white shadow-sm'
                      : 'bg-jaman-ivory text-[#4A5568] border border-jaman-border hover:bg-[#F4EFE6]'
                  }`}
                >
                  {t('allMenu')}
                </button>
                <button
                  onClick={() => {
                    SoundService.playTap();
                    setDietaryFilter('VEG');
                  }}
                  className={`px-4 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap flex items-center gap-1.5 transition-all ${
                    dietaryFilter === 'VEG'
                      ? 'bg-[#16A34A] text-white shadow-sm border border-[#16A34A]'
                      : 'bg-jaman-ivory text-[#4A5568] border border-jaman-border hover:bg-emerald-50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dietaryFilter === 'VEG' ? 'bg-white' : 'bg-[#16A34A]'}`}></span>
                  {t('pureVeg')}
                </button>
                <button
                  onClick={() => {
                    SoundService.playTap();
                    setDietaryFilter('JAIN');
                  }}
                  className={`px-4 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap flex items-center gap-1.5 transition-all ${
                    dietaryFilter === 'JAIN'
                      ? 'bg-jaman-saffron text-white shadow-sm border border-jaman-saffron'
                      : 'bg-jaman-ivory text-[#4A5568] border border-jaman-border hover:bg-orange-50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dietaryFilter === 'JAIN' ? 'bg-white' : 'bg-jaman-saffron'}`}></span>{kioskCopy("screen__pure_jain_521c29", "🌱 Pure Jain")}</button>
              </div>
            </div>

            {/* Scrollable: hero banners + category title + grid */}
            <div className="flex-1 overflow-y-auto pb-8">
              {/* Featured deals — a compact horizontally-scrolling strip
                  (small thumbnail + two lines of text) instead of three
                  full-width hero cards, so the actual food menu below is
                  what the eye lands on. Same three tap targets/handlers as
                  before, just far less visual weight. Titles/subs pull from
                  the shared i18n banner keys so the deal copy is translated
                  along with the rest of the kiosk. */}
              <div className="px-4 sm:px-6 md:px-8 pt-4">
                <div className="flex items-center gap-3 overflow-x-auto pb-1">
                  {(() => {
                    // Was hardcoded literal prices/photos that could silently
                    // diverge from the resolved item/combo's real current
                    // price and image the moment either was edited in Menu
                    // Builder — now read directly off the resolved object.
                    // B2-022: the `|| combos[0]`/`|| menuItems[0]` fallbacks used to substitute a
                    // completely unrelated dish (whatever happens to be first) whenever this
                    // restaurant's menu doesn't have that exact seeded id — while the tile's own
                    // title kept showing the *intended* dish's name from a hardcoded i18n string,
                    // so the guest saw one name, tapped it, and got a different dish added to cart.
                    // No fallback now: the tile is simply hidden (the `{x && (...)}` guards below
                    // already handle that) when this restaurant doesn't have that specific dish,
                    // and the title is always the resolved item's own real name, never a string
                    // that can drift from whatever actually gets added to the cart.
                    const biryaniCombo = combos.find((c) => c.id === 'combo-biryani-feast');
                    const thali = menuItems.find((m) => m.id === 'item-thali-guj');
                    const coffee = menuItems.find((m) => m.id === 'item-cc-ice');
                    return (
                      <>
                        {biryaniCombo && (
                          <button
                            onClick={() => handleSelectCombo(biryaniCombo)}
                            className="shrink-0 flex items-center gap-2.5 bg-[#FFF4ED] hover:bg-[#FFEAD9] border border-[#FDBA74] rounded-2xl pl-2 pr-4 py-2 text-left transition-colors active:scale-95"
                          >
                            <CachedImg
                              src={biryaniCombo.imageUrl || 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=200&q=80'}
                              alt=""
                              className="w-11 h-11 rounded-xl object-cover shrink-0"
                            />
                            <div>
                              <span className="block text-xs sm:text-sm font-black text-jaman-saffron whitespace-nowrap">{biryaniCombo.name}</span>
                              <span className="block text-[11px] text-[#4A5568] whitespace-nowrap">
                                ₹{biryaniCombo.basePrice}
                                {biryaniCombo.savingsAmount ? ` · Save ₹${biryaniCombo.savingsAmount}` : ''}
                              </span>
                            </div>
                          </button>
                        )}

                        {thali && (
                          <button
                            onClick={() => handleSelectItem(thali)}
                            className="shrink-0 flex items-center gap-2.5 bg-[#F4EFE6] hover:bg-[#EFE7D8] border border-jaman-border rounded-2xl pl-2 pr-4 py-2 text-left transition-colors active:scale-95"
                          >
                            <CachedImg
                              src={thali.imageUrl || 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?auto=format&fit=crop&w=200&q=80'}
                              alt=""
                              className="w-11 h-11 rounded-xl object-cover shrink-0"
                            />
                            <div>
                              <span className="block text-xs sm:text-sm font-black text-jaman-navy whitespace-nowrap">{thali.name}</span>
                              <span className="block text-[11px] text-[#4A5568] whitespace-nowrap">₹{thali.price}{kioskCopy("screen__chef_signature_093f51", "· Chef Signature")}</span>
                            </div>
                          </button>
                        )}

                        {coffee && (
                          <button
                            onClick={() => handleSelectItem(coffee)}
                            className="shrink-0 hidden sm:flex items-center gap-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-2xl pl-2 pr-4 py-2 text-left transition-colors active:scale-95"
                          >
                            <CachedImg
                              src={coffee.imageUrl || 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=200&q=80'}
                              alt=""
                              className="w-11 h-11 rounded-xl object-cover shrink-0"
                            />
                            <div>
                              <span className="block text-xs sm:text-sm font-black text-emerald-800 whitespace-nowrap">{coffee.name}</span>
                              <span className="block text-[11px] text-[#4A5568] whitespace-nowrap">₹{coffee.price}{kioskCopy("screen__cold_beverage_f926d2", "· Cold Beverage")}</span>
                            </div>
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Menu Items & Combos Grid */}
              <div className="px-4 sm:px-6 md:px-8 space-y-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-jaman-navy">{currentCategoryLabel}</h2>
                  {activeCategoryObj && activeCategoryObj.description && (
                    <p className="text-[#4A5568] text-sm mt-1">{localizedDescription(activeCategoryObj, lang)}</p>
                  )}
                </div>

                {/* One continuous grid: dishes fill the space beside combos. */}
                {filteredCombos.length === 0 && (selectedCategoryId === 'cat-combos' || filteredItems.length === 0) ? (
                  <EmptyState title="No dishes found" description="Try another search term or filter category." actionText="View All Dishes" onAction={() => { setSelectedCategoryId('ALL'); setDietaryFilter('ALL'); setSearchQuery(''); }} />
                ) : (
                  <div data-testid="kiosk-menu-grid" className="grid gap-4 sm:gap-5 items-stretch" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))' }}>
                      {filteredCombos.map((combo) => (
                        <div
                          key={combo.id}
                          data-testid="kiosk-menu-card"
                          className="flex flex-col h-full bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-sm hover:border-jaman-saffron/60 transition-colors"
                        >
                          <div className="relative w-full aspect-[4/3] bg-jaman-ivory overflow-hidden">
                            <CachedImg
                              src={combo.imageUrl}
                              dishName={combo.name}
                              alt={localizedName(combo, lang)}
                              className="w-full h-full object-cover"
                            />
                            <span className={`absolute top-2 left-2 flex items-center gap-1.5 bg-white/95 rounded-full px-2.5 py-1 text-[11px] font-black ${isNonVegCombo(combo) ? 'text-rose-700' : 'text-emerald-700'}`}>
                              <span className={`w-3 h-3 border flex items-center justify-center rounded-sm ${isNonVegCombo(combo) ? 'border-rose-600' : 'border-emerald-600'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isNonVegCombo(combo) ? 'bg-rose-600' : 'bg-emerald-600'}`} />
                              </span>
                              {isNonVegCombo(combo) ? kioskCopy('nonVegCombo', 'Non-Vegetarian Combo') : t('pureVegCombo')}
                            </span>
                          </div>
                          <div className="flex flex-col flex-1 p-3 gap-1.5">
                            <h4 className="font-black text-base text-jaman-navy leading-snug line-clamp-2 min-h-[2.75rem]">{localizedName(combo, lang)}</h4>
                            <p className="text-xs text-[#4A5568] leading-relaxed line-clamp-2">{localizedDescription(combo, lang)}</p>
                            <div className="mt-auto pt-2 flex items-end justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xl font-black text-jaman-saffron leading-none">
                                  ₹{combo.basePrice}
                                  <span className="text-sm line-through text-[#8C9BAE] font-medium ml-1">₹{combo.originalPrice}</span>
                                </div>
                                <span className="block mt-1 text-[11px] font-bold text-emerald-600">{kioskCopy("screen_save__2eaea5", "Save ₹")}{combo.savingsAmount}</span>
                              </div>
                              <button
                                onClick={() => handleSelectCombo(combo)}
                                className="w-12 h-12 rounded-full bg-jaman-saffron text-white flex items-center justify-center shadow-sm active:scale-90 active:bg-[#D1560D] transition-transform shrink-0"
                                title="Add Combo to Cart"
                                aria-label={`Add ${localizedName(combo, lang)} combo to cart`}
                              >
                                <Plus className="w-6 h-6 stroke-[2.5]" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                        {selectedCategoryId !== 'cat-combos' && filteredItems.map((item) => (
                          <KioskProductCard
                            key={item.id}
                            item={item}
                            displayName={localizedName(item, lang)}
                            displayDescription={localizedDescription(item, lang)}
                            onAdd={handleSelectItem}
                            onSelectDetails={handleCardClick}
                            onCustomize={handleOpenCustomize}

                          />
                        ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — CART (0 width until the first item is added, then rises
              in from the bottom while its grid track widens). */}
          <div className="min-w-0 h-full overflow-hidden">
            {cartItems.length > 0 && (
              <div
                className="kiosk-cart-panel h-full w-full min-w-0 box-border bg-white border-l border-jaman-border flex flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.03)]"
                style={{ viewTransitionName: 'kiosk-cart' }}
              >
                <div className="px-5 py-4 sm:px-6 sm:py-5 bg-jaman-navy shrink-0">
                  <h2 className="text-lg sm:text-xl font-black text-white flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <ShoppingBag className="w-5 h-5" />
                      {t('orderSummary')}
                      <span className="ml-1 bg-jaman-saffron text-white text-xs px-2.5 py-0.5 rounded-full align-middle">
                        {cartItems.reduce((acc, ci) => acc + ci.quantity, 0)}
                      </span>
                    </span>
                    <button
                      onClick={handleFullSessionReset}
                      className="text-xs font-bold text-white/90 hover:text-white flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />{kioskCopy("screen_clear_all_ddceb7", "Clear All")}</button>
                  </h2>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-6 space-y-4 bg-white">
                  <div className="space-y-3">
                    {cartItems.map((ci) => (
                      <div key={ci.cartItemId} className="rounded-2xl border border-jaman-border bg-white p-3 shadow-sm">
                        <div className="flex items-start gap-3 relative">
                          {ci.item.imageUrl && (
                            <CachedImg src={ci.item.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 border border-[#F3EFE6]" />
                          )}
                          <div className="flex-1 min-w-0 pr-6">
                            <h4 className="font-bold text-base text-jaman-navy leading-snug">{localizedName(ci.item, lang)}</h4>
                            <span className="font-black text-base text-jaman-saffron block mt-0.5">
                              {formatINR(ci.itemTotal)}
                            </span>
                            {ci.selectedModifiers && ci.selectedModifiers.length > 0 && (
                              <div className="text-[10px] text-[#8C9BAE] mt-1 leading-tight">
                                {ci.selectedModifiers.map((m) => `+ ${m.optionName}`).join(', ')}
                              </div>
                            )}
                            {ci.specialInstructions && (
                              <div className="text-xs text-rose-600 font-medium mt-0.5">
                                *{ci.specialInstructions}
                              </div>
                            )}
                          </div>
                          
                          <button
                            onClick={() => updateCartItemQuantity(ci.cartItemId, -ci.quantity)}
                            className="absolute -top-1 -right-1 w-10 h-10 rounded-full flex items-center justify-center text-[#8C9BAE] hover:text-jaman-navy hover:bg-gray-50 active:bg-gray-100 transition-colors" aria-label="Remove item"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex justify-end mt-2">
                          <div className="flex items-center gap-3 bg-white border border-jaman-border py-1 px-1 rounded-xl shadow-sm">
                            <button
                              onClick={() => updateCartItemQuantity(ci.cartItemId, -1)}
                              className="w-11 h-11 rounded-lg bg-gray-50 flex items-center justify-center active:bg-gray-200 transition-colors"
                              aria-label={`Decrease quantity of ${localizedName(ci.item, lang)}`}
                            >
                              <Minus className="w-5 h-5 text-jaman-navy" />
                            </button>
                            <span className="font-bold text-lg w-8 text-center text-jaman-navy">{ci.quantity}</span>
                            <button
                              onClick={() => updateCartItemQuantity(ci.cartItemId, 1)}
                              className="w-11 h-11 rounded-lg bg-gray-50 flex items-center justify-center active:bg-gray-200 transition-colors"
                              aria-label={`Increase quantity of ${localizedName(ci.item, lang)}`}
                            >
                              <Plus className="w-5 h-5 text-jaman-navy" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Smart Recommendations Engine */}
                  {intelligentRecommendations.length > 0 && (
                    <div className="pt-4 space-y-3">
                      <div className="flex items-center justify-between text-[#4A5568] px-1">
                        <span className="text-sm font-bold flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>{kioskCopy("screen_add_ons_suggested__fa91bb", "Add-ons (Suggested)")}</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                      </div>
                      <div className="space-y-2">
                        {intelligentRecommendations.map((rec) => (
                          <div key={rec.item.id} className="p-3 bg-white rounded-2xl border border-jaman-border flex items-center justify-between gap-2 shadow-sm">
                            <div className="flex items-center gap-3 min-w-0 pr-2">
                              <CachedImg src={rec.item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=60'} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 border border-[#F3EFE6]" />
                              <div className="min-w-0">
                                <h5 className="font-bold text-sm text-jaman-navy truncate">{localizedName(rec.item, lang)}</h5>
                                <span className="text-sm font-black text-jaman-saffron block">{formatINR(rec.item.price)}</span>
                              </div>
                            </div>
                            <button
                              className="h-11 px-5 rounded-full border-[1.5px] border-jaman-saffron bg-white text-jaman-saffron text-sm font-bold shrink-0 active:bg-jaman-saffron/10 transition-colors"
                              onClick={() => handleSelectItem(rec.item)}
                            >{kioskCopy("screen_add_9fd728", "Add")}</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Financial Summary */}
                <div className="p-5 sm:p-6 border-t border-[#F3EFE6] bg-jaman-ivory space-y-4 shrink-0">

                  {/* Coupon Code (B2-065: handleApplyCoupon/getByCode/incrementUsage already existed and
                      worked, but no input or button anywhere in this file ever called them, so a guest
                      could never actually redeem a coupon). */}
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs">
                      <div>
                        <span className="font-bold text-emerald-900">{kioskCopy("screen_coupon_applied__194992", "Coupon Applied:")}{appliedCoupon.code}</span>
                        <p className="text-[10px] text-emerald-700">{appliedCoupon.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setAppliedCoupon(null); setCouponCodeInput(''); setCouponError(null); }}
                        className="text-xs font-bold text-rose-600"
                      >{kioskCopy("screen_remove_c3812f", "Remove")}</button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={couponCodeInput}
                          onChange={(e) => { setCouponCodeInput(e.target.value.toUpperCase()); setCouponError(null); }}
                          placeholder="Enter coupon code"
                          className="flex-1 bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                        />
                        <button
                          type="button"
                          onClick={handleApplyCoupon}
                          disabled={!couponCodeInput.trim()}
                          className="px-4 py-2 bg-jaman-navy text-white text-xs font-bold rounded-xl disabled:opacity-40 shrink-0"
                        >{kioskCopy("screen_apply_31e392", "Apply")}</button>
                      </div>
                      {couponError && <p className="text-[10px] text-rose-600 font-semibold">{couponError}</p>}
                    </div>
                  )}

                  {/* Loyalty Redemption Option */}
                  {loggedInAccount && loggedInAccount.loyaltyPoints > 0 && (
                    <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs">
                      <div>
                        <span className="font-bold text-emerald-900">{kioskCopy("screen_redeem_loyalty_points_8591d3", "Redeem Loyalty Points")}</span>
                        <p className="text-[10px] text-emerald-700">{kioskCopy("screen_balance__e03512", "Balance:")}{loggedInAccount.loyaltyPoints}{kioskCopy("screen_pts_52ee19", "Pts")}</p>
                      </div>
                      {redeemedPoints > 0 ? (
                        <button
                          onClick={() => setRedeemedPoints(0)}
                          className="text-xs font-bold text-rose-600"
                        >{kioskCopy("screen_remove__4a816f", "Remove (₹")}{redeemedPoints})
                        </button>
                      ) : (
                        <button
                          onClick={() => setRedeemedPoints(Math.min(loggedInAccount.loyaltyPoints, rawCalculated.subtotal))}
                          className="px-2.5 py-1 bg-emerald-600 text-white font-bold rounded-lg"
                        >{kioskCopy("screen_redeem__324583", "Redeem ₹")}{Math.min(loggedInAccount.loyaltyPoints, rawCalculated.subtotal)}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Subtotal / Tax breakdown */}
                  <div className="rounded-2xl bg-jaman-ivory border border-jaman-border p-4 space-y-2">
                    <div className="flex justify-between text-sm font-semibold text-jaman-navy">
                      <span>{t('subtotal')}</span>
                      <span>{formatINR(rawCalculated.subtotal)}</span>
                    </div>
                    {rawCalculated.discountAmount > 0 && (
                      <div className="flex justify-between text-sm text-emerald-600 font-bold">
                        <span>{t('discount')} ({appliedCoupon?.code})</span>
                        <span>-{formatINR(rawCalculated.discountAmount)}</span>
                      </div>
                    )}
                    {redeemedPoints > 0 && (
                      <div className="flex justify-between text-sm text-emerald-600 font-bold">
                        <span>{kioskCopy("screen_loyalty_reward_points_fe7dc0", "Loyalty Reward Points")}</span>
                        <span>-{formatINR(redeemedPoints)}</span>
                      </div>
                    )}
                    {staffDiscount > 0 && (
                      <div className="flex justify-between text-indigo-600 font-bold">
                        <span>{kioskCopy("screen_staff_manager_discount_10__c08554", "Staff Manager Discount (10%)")}</span>
                        <span>-{formatINR(staffDiscount)}</span>
                      </div>
                    )}
                    {/* B2-036: derived via formatSplitTax so the two halves always sum to the displayed Total Payable. */}
                    <div className="flex justify-between text-xs text-[#8C9BAE]">
                      <span>{t('cgst')}</span>
                      <span>{formatSplitTax(rawCalculated.taxAmount, rawCalculated.cgstAmount, rawCalculated.sgstAmount).cgst}</span>
                    </div>
                    <div className="flex justify-between text-xs text-[#8C9BAE]">
                      <span>{t('sgst')}</span>
                      <span>{formatSplitTax(rawCalculated.taxAmount, rawCalculated.cgstAmount, rawCalculated.sgstAmount).sgst}</span>
                    </div>
                    <div className="flex justify-between items-end text-base font-black text-jaman-navy pt-3 mt-1 border-t border-jaman-border">
                      <span>{t('totalPayable')}</span>
                      <span className="text-jaman-saffron text-2xl font-black leading-none">{formatINR(netTotalPayable)}</span>
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
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 5: CHECKOUT & PAYMENT */}
      {step === 'CHECKOUT_PAYMENT' && (
        <div className="flex-1 flex flex-col p-6 md:p-10 max-w-5xl mx-auto w-full space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black text-jaman-navy">{t('paymentTitle')}</h2>
            <p className="text-sm text-[#4A5568]">{kioskCopy("screen_total_payable__6577c8", "Total Payable:")}<span className="font-black text-jaman-saffron text-lg">{formatINR(netTotalPayable)}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* UPI Payment (real, via Razorpay) */}
            <button
              onClick={() => {
                if (networkState === 'OFFLINE') {
                  showToast('Internet required for UPI. Please choose Pay Cash at Counter.');
                  return;
                }
                SoundService.playTap();
                setPaymentMethod('UPI');
                // The server decides whether online payment is active. A flag from an earlier attempt
                // (made before the restaurant was activated) must not block the guest from asking again.
                setRazorpayUnavailable(false);
                setOnlinePaymentsPending(false);
                // No QR has ever been requested yet for this order (guest arrived with Cash
                // selected, or switched away from UPI and back) -- without this, the tile just
                // highlights and the QR panel is stuck on "Preparing…" forever. Safe to call even
                // if a QR already exists/is loading: createOrGetPaymentOrder is idempotent by the
                // local order's id, but skip the redundant call in that case anyway.
                if (!realPaymentId && !qrLoading && localOrderIdForPayment) {
                  const order = OrderRepository.getOrderById(localOrderIdForPayment);
                  if (order) void requestUpiPayment(order);
                }
              }}
              className={`p-6 rounded-3xl border-2 text-left space-y-4 transition-all duration-200 ${
                paymentMethod === 'UPI'
                  ? 'bg-white border-jaman-saffron shadow-xl'
                  : 'bg-jaman-ivory border-jaman-border hover:bg-white'
              } ${networkState === 'OFFLINE' || onlinePaymentUnavailable ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="w-14 h-14 rounded-2xl bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center">
                  <QrCode className="w-8 h-8" />
                </div>
                {/* B2-023: previously this tile stayed fully selectable even when Razorpay had
                    already failed, so the guest saw a live "UPI QR Payment" option directly above
                    text saying it was unavailable. Now marked the same way OFFLINE already is. */}
                {(networkState === 'OFFLINE' || onlinePaymentUnavailable) && (
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                    {networkState === 'OFFLINE' ? 'Requires Internet' : onlinePaymentsPending ? 'Being set up' : 'Unavailable'}
                  </span>
                )}
              </div>
              <div>
                <h4 className="text-xl font-bold text-jaman-navy">{t('upiQr')}</h4>
                <p className="text-xs text-[#4A5568] mt-1">{t('upiSubtitle')}</p>
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
                  ? 'bg-white border-jaman-saffron shadow-xl ring-2 ring-jaman-saffron/20'
                  : 'bg-jaman-ivory border-jaman-border hover:bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="w-14 h-14 rounded-2xl bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center">
                  <Coins className="w-8 h-8" />
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{kioskCopy("screen_offline_online_99d685", "Offline & Online")}</span>
              </div>
              <div>
                <h4 className="text-xl font-bold text-jaman-navy">{t('cashAtCounter')}</h4>
                <p className="text-xs text-[#4A5568] mt-1">{t('cashSubtitle')}</p>
              </div>
            </button>
          </div>

          <div className="bg-white rounded-3xl p-8 border border-jaman-border shadow-lg max-w-xl mx-auto w-full text-center space-y-6">
            {paymentStatus === 'EXPIRED' && !onlinePaymentUnavailable ? (
              <div className="py-8 space-y-4">
                <Clock className="w-16 h-16 text-rose-500 mx-auto" />
                <h3 className="text-xl font-black text-jaman-navy">{kioskCopy("screen_payment_session_expired_4c8564", "Payment Session Expired")}</h3>
                <p className="text-sm text-[#4A5568]">{kioskCopy("screen_this_qr_timed_out_if_you_already_paid_please_wait_a_few_4226ae", "This QR timed out. If you already paid, please wait a few seconds — your token will still print. Otherwise get a fresh code.")}</p>
                <Button
                  variant="accent"
                  size="touch"
                  className="w-full"
                  isLoading={qrLoading}
                  onClick={() => {
                    if (realPaymentId) {
                      void showPaymentQr(realPaymentId);
                    } else {
                      setPaymentStatus('CREATED');
                      setPaymentTimeLeft(60);
                    }
                  }}
                >{kioskCopy("screen_try_again_df0fe9", "Try Again")}</Button>
                {realPaymentId && (
                  <Button variant="ghost" size="touch" className="w-full" onClick={handleCancelQr}>{kioskCopy("screen_cancel_19766e", "Cancel")}</Button>
                )}
              </div>
            ) : (
              <>
            {paymentMethod === 'UPI' && !onlinePaymentUnavailable && (
              <div className="space-y-4">
                {qrImageSrc ? (
                  <>
                    <p className="text-sm font-semibold text-[#4A5568]">{kioskCopy("screen_scan_with_any_upi_app_to_pay_ca123c", "Scan with any UPI app to pay")}<span className="font-black text-jaman-saffron">{formatINR(netTotalPayable)}</span>
                    </p>
                    <div className="mx-auto w-[min(88vw,520px)] h-[min(88vw,520px)] bg-white p-3 rounded-2xl border-2 border-slate-900 shadow-md flex items-center justify-center">
                      <img src={qrImageSrc} alt="UPI payment QR code" className="w-full h-full object-contain" />
                    </div>
                    <div className="text-xs text-[#8C9BAE] font-medium flex items-center justify-center gap-1.5">
                      <Clock className="w-4 h-4 text-jaman-saffron" />
                      <span>{t('paymentExpiresIn')}: <strong className="text-jaman-navy font-mono">{Math.floor(qrSecondsLeft / 60)}:{String(qrSecondsLeft % 60).padStart(2, '0')}</strong></span>
                    </div>
                    <p className="text-xs text-[#4A5568]">{kioskCopy("screen_waiting_for_your_payment_your_token_prints_automaticall_2a6f9b", "Waiting for your payment… your token prints automatically once it is received.")}</p>
                    <Button variant="ghost" size="touch" className="w-full" onClick={handleCancelQr}>{kioskCopy("screen_cancel_19766e", "Cancel")}</Button>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-[#4A5568]">{qrLoading ? 'Preparing your payment QR…' : 'Preparing…'}</p>
                )}
              </div>
            )}

            {paymentMethod === 'UPI' && onlinePaymentUnavailable && (
              <div className="py-8 space-y-4">
                <Coins className="w-16 h-16 text-jaman-saffron mx-auto" />
                <h3 className="text-xl font-black text-jaman-navy">{onlinePaymentsPending ? 'Online payment is being set up' : 'Online Payment Unavailable'}</h3>
                <p className="text-sm text-[#4A5568]">
                  {onlinePaymentsPending
                    ? 'This restaurant is verifying its online payments. Please pay cash at the counter for now — you will get your token as soon as you confirm.'
                    : "Please pay cash at the counter instead — you'll get your token as soon as you confirm."}
                </p>
              </div>
            )}

            {paymentMethod === 'CASH_AT_COUNTER' && (
              <div className="py-8 space-y-4">
                <Coins className="w-16 h-16 text-jaman-saffron mx-auto" />
                <h3 className="text-xl font-black text-jaman-navy">{kioskCopy("screen_pay_at_pickup_counter_c8a1db", "Pay at Pickup Counter")}</h3>
                <p className="text-sm text-[#4A5568]">{kioskCopy("screen_you_will_receive_your_token_now_please_pay_at_counter_1_df2bd4", "You will receive your token now. Please pay at Counter 1.")}</p>
              </div>
            )}

            {paymentMethod === 'CASH_AT_COUNTER' && (
              <div className="pt-4 border-t border-[#F3EFE6]">
                <Button
                  variant="accent"
                  size="touch"
                  className="w-full"
                  isLoading={isProcessingPayment}
                  onClick={handleGetToken}
                >{kioskCopy("screen_confirm_get_token_a40e2d", "Confirm & Get Token")}</Button>
              </div>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {/* STEP 6: ORDER CONFIRMATION & TRUTHFUL STATUS & LIVE THERMAL RECEIPT SLIP */}
      {step === 'CONFIRMATION' && placedOrder && (() => {
        const liveOrder = OrderRepository.getOrderById(placedOrder.id) ?? placedOrder;
        const syncState =
          liveOrder.syncStatus === 'SYNCED' || !liveOrder.syncStatus ? 'delivered' : liveOrder.syncStatus === 'FAILED' ? 'failed' : 'pending';
        const kitchenTickets = db.kots.filter((k) => k.orderId === placedOrder.id);
        const ticketJobs = db.printJobs.filter((j) => j.type === 'KOT_TICKET' && j.orderId === placedOrder.id);
        // The latest print job for a ticket decides what the guest is told about it.
        const ticketStatus = (kotId: string): 'printed' | 'failed' | 'pending' => {
          const job = ticketJobs.filter((j) => j.kotId === kotId).slice(-1)[0];
          if (!job) return 'pending';
          if (job.status === 'PRINTED' || job.status === 'SUCCESS') return 'printed';
          if (job.status === 'FAILED') return 'failed';
          return 'pending';
        };
        const reprintTicket = (kotId: string) => {
          const kot = db.kots.find((k) => k.id === kotId);
          if (!kot) return;
          PrinterService.printKOT(kot);
          showToast('Kitchen ticket sent to the printer again.');
        };
        const stationNames = [...new Set(kitchenTickets.map((k) => k.station || 'Main Kitchen'))];
        const pill = (state: 'delivered' | 'failed' | 'pending' | 'printed' | 'printing') =>
          state === 'delivered' || state === 'printed'
            ? 'bg-emerald-400/15 text-emerald-100 border-emerald-300/40'
            : state === 'failed'
            ? 'bg-rose-400/15 text-rose-100 border-rose-300/40'
            : 'bg-amber-400/15 text-amber-100 border-amber-300/40';
        const pillLabel = (state: 'delivered' | 'failed' | 'pending' | 'printed' | 'printing') =>
          state === 'delivered' ? 'Sent to the kitchen' : state === 'printed' ? 'Printed' : state === 'failed' ? 'Not printed' : 'Sending…';

        return (
          <div className="flex-1 flex flex-col w-full max-w-[1080px] mx-auto gap-4 sm:gap-6 p-4 sm:p-6 xl:p-8 pb-32">
            {/* HERO: confirmed, with the order and where the kitchen stands */}
            <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-jaman-navy via-[#163E5E] to-[#0B253A] text-white shadow-2xl p-6 sm:p-8">
              <div className="pointer-events-none absolute -right-20 -top-20 w-72 h-72 rounded-full bg-jaman-saffron/25 blur-3xl" aria-hidden="true" />
              <div className="relative flex flex-col items-center text-center gap-3">
                <div className="w-20 h-20 rounded-full bg-emerald-400/20 border-2 border-emerald-300 flex items-center justify-center">
                  <CheckCircle2 className="w-11 h-11 text-emerald-300 stroke-[2.5]" />
                </div>
                <h2 className="text-3xl sm:text-5xl font-black font-serif tracking-tight">{t('orderConfirmed')}</h2>
                <p className="text-sm sm:text-base text-white/75 font-semibold">
                  {liveOrder.orderNumber} · {liveOrder.orderType}{liveOrder.tableNumber ? ` · Table ${liveOrder.tableNumber}` : ''}
                </p>
                <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold border ${pill(syncState)}`}>
                  <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${syncState === 'delivered' ? 'bg-emerald-300' : syncState === 'failed' ? 'bg-rose-300' : 'bg-amber-300'}`} />
                  {syncState === 'failed' ? 'Kitchen alert delayed. Please tell a staff member.' : pillLabel(syncState)}
                </span>
              </div>
            </section>

            {/* TOKEN + WAIT: the number the guest keeps until the order is called */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <section className="rounded-[28px] bg-white border-2 border-jaman-border shadow-xl p-6 sm:p-8 text-center flex flex-col items-center justify-center gap-2">
                <span className="text-xs sm:text-sm font-black uppercase tracking-[0.25em] text-[#8C9BAE]">{t('token')}</span>
                <div className="text-7xl sm:text-8xl font-black text-jaman-saffron font-mono tracking-tight leading-none">#{placedOrder.tokenNumber}</div>
              </section>
              <section className="rounded-[28px] bg-white border border-jaman-border shadow-md p-6 sm:p-8 flex flex-col justify-center gap-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-[#4A5568]">{t('estimatedWait')}</span>
                  <span className="text-2xl font-black text-jaman-navy">{placedOrder.estimatedWaitMinutes} {t('minutes')}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                  <span className="text-sm font-bold text-emerald-800">Pickup at</span>
                  <span className="text-lg font-black text-emerald-800">{placedOrder.pickupCounter || 'Counter 1'}</span>
                </div>
              </section>
            </div>

            {/* BILL + KITCHEN: side by side on wide landscape screens, one stacked column on a portrait kiosk */}
            {/* lg (1024px), not xl (1280px): the kiosk's own landscape target is 1024×768 (see the
                per-app device matrix), where a single stacked column needs more scrolling than this
                short viewport should. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
              <section className="rounded-[28px] bg-white border border-jaman-border shadow-md overflow-hidden">
                <header className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 bg-jaman-ivory border-b border-jaman-border">
                  <h3 className="text-sm font-black uppercase tracking-wider text-jaman-navy">{kioskCopy('screen_receipt_dad5a9', 'Your bill')}</h3>
                  <span className="text-lg font-black font-mono text-jaman-navy">{formatINR(liveOrder.totalAmount)}</span>
                </header>
                <div className="p-4 sm:p-5 overflow-x-auto">
                  <ThermalReceiptView order={placedOrder} config={ReceiptRepository.getConfig()} />
                </div>
              </section>

              <section className="rounded-[28px] bg-white border border-jaman-border shadow-md overflow-hidden">
                <header className="flex flex-wrap items-center justify-between gap-2 px-5 sm:px-6 py-4 bg-jaman-ivory border-b border-jaman-border">
                  <h3 className="text-sm font-black uppercase tracking-wider text-jaman-navy">Kitchen tickets</h3>
                  <span className="text-xs font-bold text-slate-500">
                    {kitchenTickets.length} ticket{kitchenTickets.length === 1 ? '' : 's'} · {stationNames.length} station{stationNames.length === 1 ? '' : 's'}
                  </span>
                </header>
                <div className="p-4 sm:p-5 space-y-4">
                  {kitchenTickets.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-6">The kitchen ticket is being prepared.</p>
                  )}
                  {kitchenTickets.map((kot) => {
                    const status = ticketStatus(kot.id);
                    return (
                      <article key={kot.id} className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-black uppercase tracking-wider text-jaman-saffron">{kot.station || 'Main Kitchen'}</p>
                            <p className="text-sm font-bold font-mono text-jaman-navy">KOT {kot.kotNumber}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${pill(status === 'printed' ? 'printed' : status === 'failed' ? 'failed' : 'printing')}`}>
                            {status === 'pending' ? 'Printing…' : pillLabel(status)}
                          </span>
                        </div>
                        <ul className="divide-y divide-slate-100">
                          {kot.items.map((it) => (
                            <li key={it.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                              <span className="font-semibold text-jaman-navy">
                                {it.name}
                                {it.modifiers && it.modifiers.length > 0 && (
                                  <span className="block text-xs font-medium text-slate-500">{it.modifiers.map((m: any) => m.optionName ?? m).join(', ')}</span>
                                )}
                              </span>
                              <span className="font-mono font-black text-jaman-navy">× {it.quantity}</span>
                            </li>
                          ))}
                        </ul>
                        {status === 'failed' && (
                          <button type="button" onClick={() => reprintTicket(kot.id)} className="w-full min-h-[52px] rounded-xl bg-jaman-navy text-white font-bold text-sm">
                            Print this ticket again
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* GET THE BILL */}
            <section className="rounded-[28px] bg-white border border-jaman-border shadow-md p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-jaman-navy text-center">{kioskCopy('screen_digital_delivery_e_bill_options_91fcfc', 'Get your bill')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await printKioskReceipt(placedOrder);
                    if (res.success) {
                      setAutoPrintStatus({ printed: true, message: res.message, printerName: res.printerName });
                      showToast(`Print job sent to ${res.printerName}`);
                    } else {
                      showToast(res.message);
                    }
                  }}
                  className="min-h-[96px] p-4 rounded-2xl bg-jaman-ivory border border-jaman-border hover:border-jaman-saffron flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Printer className="w-7 h-7 text-jaman-saffron" />
                  <span className="text-sm font-bold text-jaman-navy">{kioskCopy('screen_print_receipt_98bad4', 'Print Receipt')}</span>
                </button>
                {receiptConfig.enableEmail && (
                  <button type="button" onClick={() => openReceiptDelivery('EMAIL')} className="min-h-[96px] p-4 rounded-2xl bg-jaman-ivory border border-jaman-border hover:border-emerald-500 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform">
                    <Mail className="w-7 h-7 text-emerald-600" />
                    <span className="text-sm font-bold text-jaman-navy">{kioskCopy('screen_email_bill_64ee94', 'Email Bill')}</span>
                  </button>
                )}
                {receiptConfig.enableWhatsApp && (
                  <button type="button" onClick={() => openReceiptDelivery('WHATSAPP')} className="min-h-[96px] p-4 rounded-2xl bg-jaman-ivory border border-jaman-border hover:border-green-500 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform">
                    <MessageCircle className="w-7 h-7 text-green-600" />
                    <span className="text-sm font-bold text-jaman-navy">WhatsApp Bill</span>
                  </button>
                )}
                {receiptConfig.enableQrReceipt && (
                  <button type="button" onClick={() => setIsHandoffModalOpen(true)} className="min-h-[96px] p-4 rounded-2xl bg-jaman-ivory border border-jaman-border hover:border-purple-500 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform">
                    <QrCode className="w-7 h-7 text-purple-600" />
                    <span className="text-sm font-bold text-jaman-navy">{kioskCopy('screen_qr_invoice_39afac', 'QR Invoice')}</span>
                  </button>
                )}
              </div>
              {eBillSuccessMessage && (
                <p className="text-sm text-emerald-700 font-bold text-center bg-emerald-50 py-2 rounded-xl border border-emerald-200">✓ {eBillSuccessMessage}</p>
              )}
              {autoPrintStatus.printerName && (
                <p className={`text-xs font-semibold text-center ${autoPrintStatus.printed ? 'text-emerald-700' : 'text-amber-700'}`}>
                  Receipt: {autoPrintStatus.printed ? `printed on ${autoPrintStatus.printerName}` : autoPrintStatus.message}
                </p>
              )}
            </section>

            {/* FEEDBACK */}
            {!feedbackSubmitted ? (
              <section className="rounded-[28px] bg-white border border-jaman-border shadow-md p-5 sm:p-6 text-center space-y-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-jaman-navy">{kioskCopy('screen_how_was_your_ordering_experience__ae5150', 'How was your ordering experience?')}</h3>
                <div className="flex justify-center gap-2 sm:gap-3">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-label={`${s} star${s === 1 ? '' : 's'}`}
                      onClick={() => {
                        SoundService.playTap();
                        setFeedbackRating(s);
                      }}
                      className="min-w-[56px] min-h-[56px] flex items-center justify-center"
                    >
                      <Star className={`w-10 h-10 ${s <= feedbackRating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                    </button>
                  ))}
                </div>
                <Button variant="secondary" size="sm" onClick={handleSubmitFeedback} disabled={feedbackRating === 0}>
                  {kioskCopy('screen_submit_rating_79a8aa', 'Submit Rating')}
                </Button>
              </section>
            ) : (
              <p className="text-sm text-emerald-700 font-bold text-center bg-emerald-50 py-3 rounded-2xl border border-emerald-200">
                {kioskCopy('screen__feedback_recorded_thank_you__632564', '✓ Feedback recorded. Thank you!')}
              </p>
            )}

            {/* ONE CLEAR NEXT STEP, always in reach */}
            <div className="fixed inset-x-0 bottom-0 z-30 bg-jaman-ivory/95 backdrop-blur border-t border-jaman-border px-4 sm:px-6 py-4">
              <div className="max-w-[1080px] mx-auto flex items-center gap-4">
                <p className="flex-1 text-sm sm:text-base text-[#4A5568] leading-snug">
                  Keep your token and wait near {placedOrder.pickupCounter || 'the pickup counter'}. The kiosk resets for the next guest.
                </p>
                <button
                  type="button"
                  onClick={handleFullSessionReset}
                  className="min-h-[64px] px-6 sm:px-8 rounded-2xl bg-jaman-navy text-white font-black text-base sm:text-lg shadow-lg active:scale-95 transition-transform whitespace-nowrap"
                >
                  ← {t('newOrder')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Contact entry and success acknowledgement remain on this touch screen. */}
      {receiptDeliveryChannel && (
        <KioskReceiptDeliveryDialog
          key={receiptDeliveryChannel}
          channel={receiptDeliveryChannel}
          onClose={closeReceiptDelivery}
          onDone={handleFullSessionReset}
          onActivity={resetIdleTimer}
          onSend={recipient => handleReceiptDelivery(receiptDeliveryChannel, recipient)}
        />
      )}

      {/* MODAL: ITEM CUSTOMIZATION & MODIFIERS */}
      {customizingItem && (
        <Modal
          isOpen={true}
          onClose={() => setCustomizingItem(null)}
          title={localizedName(customizingItem, lang)}
          maxWidth="2xl"
          footer={
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 bg-jaman-ivory border border-jaman-border px-3 py-2 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    SoundService.playTap();
                    setActiveItemQuantity((q) => Math.max(1, q - 1));
                  }}
                  className="w-8 h-8 rounded-lg bg-white border border-jaman-border flex items-center justify-center font-bold text-jaman-navy"
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
                  className="w-8 h-8 rounded-lg bg-white border border-jaman-border flex items-center justify-center font-bold text-jaman-navy"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <Button variant="accent" size="lg" className="flex-1" onClick={handleConfirmCustomization}>{kioskCopy("screen_add_to_cart__7aa3dd", "Add to Cart •")}{formatINR(calculateItemTotal(customizingItem.price, activeItemQuantity, selectedModifiers))}
              </Button>
            </div>
          }
        >
          <div className="space-y-6">
            {/* A real, prominent product photo — this used to be a small
                96x96 thumbnail squeezed beside the text, out of proportion
                with a modal whose whole point is helping a guest decide
                what they're customizing. */}
            <div className="relative -mx-6 -mt-6">
              <CachedImg
                src={customizingItem.imageUrl || '/assets/menu/common/menu-placeholder-v2.svg'}
                alt={customizingItem.name}
                className="w-full aspect-[4/3] object-cover"
              />
              <div className="absolute top-3 left-3">
                <StatusBadge status={customizingItem.dietaryType} type="dietary" />
              </div>
            </div>
            <div>
              {/* Name already shows in the Modal's own title bar above —
                  no need to repeat it here. */}
              <p className="text-xs text-[#4A5568]">{localizedDescription(customizingItem, lang)}</p>
              <div className="text-lg font-black text-jaman-saffron mt-1.5">
                {formatINR(calculateItemUnitPrice(customizingItem.price, selectedModifiers))}
              </div>
            </div>

            {customizingItem.modifierGroups?.map((group) => (
              <div key={group.id} className="border-t border-[#F3EFE6] pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-base text-jaman-navy">{group.name}</h4>
                    <p className="text-xs text-[#8C9BAE]">{group.description}</p>
                  </div>
                  <span className="text-xs font-semibold text-jaman-saffron bg-jaman-saffron/10 px-2 py-0.5 rounded">
                    {group.isRequired ? t('required') : t('optional')}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {group.options.filter(opt => opt.isAvailable !== false).map((opt) => {
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
                            ? 'bg-jaman-navy text-white border-jaman-navy shadow-sm'
                            : 'bg-white text-jaman-navy border-jaman-border hover:bg-[#F8F6F0]'
                        }`}
                      >
                        <span className="font-bold text-sm">{opt.name}</span>
                        {opt.priceDelta > 0 ? (
                          <span className={`text-xs font-semibold mt-1 ${isSelected ? 'text-[#FED7AA]' : 'text-jaman-saffron'}`}>
                            +{formatINR(opt.priceDelta)}
                          </span>
                        ) : (
                          <span className="text-[10px] opacity-60 mt-1">{kioskCopy("screen_included_ba829a", "Included")}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Special Instructions */}
            <div className="border-t border-[#F3EFE6] pt-4 space-y-2">
              <label className="block text-xs font-bold text-jaman-navy">
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
                    className="px-3 py-1 bg-jaman-ivory border border-jaman-border rounded-lg text-xs font-semibold hover:bg-[#F4EFE6]"
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
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* CART SIDEBAR WITH SMART RECOMMENDATIONS — a real persistent side


      {/* DRAWER: CUSTOMER ASSISTANT CHATBOT ("Need Help?" / Complete Conversational Ordering) */}
      {isChatbotOpen && !AiConfig.isEnabled() && <JamanAiAccessNotice isOpen={isChatbotOpen} onClose={() => setIsChatbotOpen(false)} />}
      {isChatbotOpen && showCustomerAi && AiConfig.isEnabled() && (
        <div role="dialog" aria-modal="true" aria-label="JAMAN AI Food Assistant" className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/60 animate-fadeIn">
          <div className="fixed inset-0" onClick={() => setIsChatbotOpen(false)} />
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between z-10 animate-slideLeft">
            {/* Header with Live Status & Close */}
            <div className="p-5 border-b border-jaman-border bg-jaman-navy text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-jaman-saffron to-[#f07d33] flex items-center justify-center shadow-md">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">{kioskCopy("screen_jaman_ai_8a6f7b", "JAMAN AI")}<span className="text-[10px] bg-emerald-500 text-white font-black px-2 py-0.5 rounded-full uppercase tracking-wider">{kioskCopy("screen_live_ai_a0e6e8", "Menu guide")}</span>
                  </h3>
                  <p className="text-xs text-white/70">{kioskCopy("screen_complete_conversational_food_ordering_dietary_guide_22ba6d", "Suggestions from this restaurant?s current menu")}</p>
                </div>
              </div>
              <button
                onClick={() => setIsChatbotOpen(false)}
                aria-label="Close JAMAN AI"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Category Navigation Ribbon */}
            <div className="bg-[#F8F6F0] px-4 py-2.5 border-b border-jaman-border flex items-center gap-2 overflow-x-auto no-scrollbar text-xs select-none">
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
                  className="px-3 py-1.5 rounded-xl bg-white border border-jaman-border hover:bg-[#FFF4ED] hover:border-jaman-saffron text-jaman-navy font-bold text-[11px] whitespace-nowrap shadow-xs active:scale-95 transition-all"
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Chat Stream with Interactive Dishes, Combos & Cart Summary */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-jaman-ivory">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'USER' ? 'items-end' : 'items-start'}`}
                >
                  {/* Text Message Bubble */}
                  <div
                    className={`max-w-[88%] p-3.5 sm:p-4 rounded-2xl text-xs whitespace-pre-wrap leading-relaxed shadow-sm ${
                      msg.sender === 'USER'
                        ? 'bg-jaman-navy text-white rounded-br-none font-semibold'
                        : 'bg-white border border-jaman-border text-jaman-navy rounded-bl-none'
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
                          className="p-3 bg-white rounded-2xl border border-jaman-border shadow-sm flex items-center justify-between gap-3 hover:border-jaman-saffron/40 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <CachedImg
                              src={item.imageUrl || '/assets/menu/common/menu-placeholder-v2.svg'}
                              alt={localizedName(item, lang)}
                              className="w-14 h-14 rounded-xl object-cover border border-jaman-border shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <StatusBadge status={item.dietaryType} type="dietary" />
                                {item.isPopular && (
                                  <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">{kioskCopy("screen__popular_74fe96", "★ Popular")}</span>
                                )}
                              </div>
                              <h5 className="font-bold text-xs text-jaman-navy truncate mt-0.5">{localizedName(item, lang)}</h5>
                              <span className="text-xs font-black text-jaman-saffron">{formatINR(item.price)}</span>
                            </div>
                          </div>

                          <Button
                            variant="accent"
                            size="sm"
                            onClick={() => {
                              handleSelectItem(item);
                            }}
                            className="shrink-0 font-bold"
                          >{kioskCopy("screen__add_to_cart_927657", "+ Add to Cart")}</Button>
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
                            <span className="text-[10px] uppercase font-black tracking-wider text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded-full inline-block">{kioskCopy("screen_save__2eaea5", "Save ₹")}{combo.savingsAmount}{kioskCopy("screen_deal_ae642d", "Deal")}</span>
                            <h5 className="font-bold text-xs text-jaman-navy mt-1">{localizedName(combo, lang)}</h5>
                            <p className="text-[10px] text-[#4A5568] line-clamp-1 mt-0.5">{localizedDescription(combo, lang)}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs font-black text-jaman-saffron">{formatINR(combo.basePrice)}</span>
                              <span className="text-[10px] text-[#8C9BAE] line-through">{formatINR(combo.originalPrice)}</span>
                            </div>
                          </div>

                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              handleSelectCombo(combo);
                            }}
                            className="shrink-0 font-bold"
                          >{kioskCopy("screen__add_combo_618900", "+ Add Combo")}</Button>
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
                          className="px-3 py-1 rounded-full bg-white border border-jaman-border text-[11px] font-semibold text-jaman-navy hover:bg-[#FFF4ED] hover:border-jaman-saffron shadow-xs transition-all active:scale-95"
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
              <div className="p-3 bg-jaman-navy text-white flex items-center justify-between px-4 border-t border-jaman-border shadow-lg">
                <div>
                  <span className="text-xs font-bold block">{cartItems.length}{kioskCopy("screen_items_added_to_order_e5a5e3", "items added to order")}</span>
                  <span className="text-xs font-black text-[#FED7AA]">{kioskCopy("screen_total__18e872", "Total:")}{formatINR(netTotalPayable)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setIsChatbotOpen(false);
                      setIsCartOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors"
                  >{kioskCopy("screen_view_cart_708640", "View Cart")}</button>
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => {
                      // B2-XXX: this used to jump straight to the CHECKOUT_PAYMENT step without
                      // ever calling handleProceedToPayment — no order was created, no payment QR
                      // was ever requested, so the guest landed on a payment screen that was stuck
                      // on "Preparing…" forever with nothing actually happening server-side. This
                      // quick-access button now does the exact same thing the cart's own "Proceed
                      // to Payment" button does.
                      setIsChatbotOpen(false);
                      void handleProceedToPayment();
                    }}
                    className="font-bold shadow-md"
                  >{kioskCopy("screen__checkout_now_c53cf8", "⚡ Checkout Now")}</Button>
                </div>
              </div>
            )}

            {/* Preloaded Touch Options Deck (Zero Typing Required for Kiosk) */}
            <div className="p-3.5 sm:p-4 border-t border-jaman-border bg-white space-y-2 select-none">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase text-[#8C9BAE] tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-jaman-saffron" />{kioskCopy("screen_tap_any_preloaded_option_below__a407c3", "Tap Any Preloaded Option Below:")}</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">{kioskCopy("screen_1_tap_instant_response_55bf08", "1-Tap Instant Response")}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Recommend best sellers')}
                  className="p-2.5 rounded-2xl bg-[#FFF4ED] hover:bg-[#FFE8D6] border border-[#FDBA74] text-left text-xs font-bold text-jaman-navy flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">🔥</span>
                  <span>{kioskCopy("screen_best_sellers_f4b25b", "Best Sellers")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Show chef value combos')}
                  className="p-2.5 rounded-2xl bg-[#FEF3C7] hover:bg-[#FDE68A] border border-[#FCD34D] text-left text-xs font-bold text-jaman-navy flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">👑</span>
                  <span>{kioskCopy("screen_value_combos_e99d11", "Value Combos")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Show pure jain dishes')}
                  className="p-2.5 rounded-2xl bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#6EE7B7] text-left text-xs font-bold text-jaman-navy flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">🌱</span>
                  <span>{kioskCopy("screen_pure_jain_food_e0750a", "Pure Jain Food")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Show gujarati thali')}
                  className="p-2.5 rounded-2xl bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#93C5FD] text-left text-xs font-bold text-jaman-navy flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">🥘</span>
                  <span>{kioskCopy("screen_gujarati_thali_4acbef", "Gujarati Thali")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Show dum biryani')}
                  className="p-2.5 rounded-2xl bg-[#FAF5FF] hover:bg-[#F3E8FF] border border-[#D8B4FE] text-left text-xs font-bold text-jaman-navy flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">🍛</span>
                  <span>{kioskCopy("screen_dum_biryani_04dea4", "Dum Biryani")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Show cold drinks and desserts')}
                  className="p-2.5 rounded-2xl bg-[#F0FDF4] hover:bg-[#DCFCE7] border border-[#86EFAC] text-left text-xs font-bold text-jaman-navy flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">☕</span>
                  <span>{kioskCopy("screen_drinks_sweets_c3d7d4", "Drinks & Sweets")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('Show active coupons')}
                  className="p-2.5 rounded-2xl bg-[#FFF1F2] hover:bg-[#FFE4E6] border border-[#FDA4AF] text-left text-xs font-bold text-jaman-navy flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">🎁</span>
                  <span>{kioskCopy("screen_offers_coupons_9520f2", "Offers & Coupons")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCustomerQuery('How do I pay?')}
                  className="p-2.5 rounded-2xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] text-left text-xs font-bold text-jaman-navy flex items-center gap-2 transition-all active:scale-95 shadow-2xs"
                >
                  <span className="text-base">💳</span>
                  <span>{kioskCopy("screen_payment_help_c652c4", "Payment Help")}</span>
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
          <p className="text-xs text-[#4A5568]">{kioskCopy("screen_scan_this_qr_code_with_your_phone_camera_to_browse_the__fb1a74", "Scan this QR code with your phone camera to browse the menu and order directly from your mobile browser.")}</p>
          <div className="w-48 h-48 mx-auto bg-white p-4 rounded-2xl border-2 border-slate-900 shadow-md flex items-center justify-center">
            <QrCode className="w-40 h-40 text-jaman-navy" />
          </div>
          <p className="text-xs font-mono font-bold text-[#8C9BAE]">{kioskCopy("screen_https_kiosk_jamanvaar_com_m__ef0f32", "https://kiosk.jamanvaar.com/m/")}{sessionId.substring(0, 8)}
          </p>
          <Button variant="primary" size="md" className="w-full" onClick={() => setIsHandoffModalOpen(false)}>{kioskCopy("screen_close_7d9eb7", "Close")}</Button>
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
              <p className="text-xs text-[#4A5568]">{kioskCopy("screen_enter_your_mobile_number_to_check_loyalty_points_re_ord_08e4ca", "Enter your mobile number to check loyalty points, re-order favorites, and get exclusive rewards.")}</p>
              <div>
                <label className="block text-xs font-bold text-jaman-navy mb-1">{kioskCopy("screen_mobile_number_34975e", "Mobile Number")}</label>
                <div className="flex gap-2">
                  <span className="bg-jaman-ivory border border-jaman-border px-3 py-2 rounded-xl text-xs font-bold flex items-center">+91</span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 10-digit number"
                    className="flex-1 bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                  />
                </div>
              </div>
              <Button variant="accent" size="md" className="w-full" onClick={handleSendOtp}>{kioskCopy("screen_send_otp_9c4566", "Send OTP")}</Button>
            </>
          ) : (
            <>
              <p className="text-xs text-[#4A5568]">{kioskCopy("screen_enter_the_4_digit_code_for_91_cea004", "Enter the 4-digit code for +91")}{phoneInput}{kioskCopy("screen__no_sms_gateway_is_configured_on_this_kiosk_so_the_code_efb4a3", ". No SMS gateway is configured on this kiosk, so the code was shown on screen instead of texted — it expires in 2 minutes.")}</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-4 py-3 text-center text-2xl font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
              <Button variant="accent" size="md" className="w-full" onClick={handleVerifyOtp}>{kioskCopy("screen_verify_login_91ef55", "Verify & Login")}</Button>
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
          <p className="text-xs text-[#4A5568]">{kioskCopy("screen_enter_4_digit_staff_authorization_pin_to_unlock_manager_b6b3eb", "Enter 4-digit staff authorization PIN to unlock manager assistance, discounts, or session cancel.")}</p>
          <input
            type="password"
            maxLength={4}
            value={staffPin}
            onChange={(e) => setStaffPin(e.target.value)}
            placeholder="••••"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-jaman-navy"
          />
          <div className="flex gap-2">
            <Button variant="ghost" type="button" className="flex-1" onClick={() => setIsStaffPinModalOpen(false)}>{kioskCopy("screen_cancel_19766e", "Cancel")}</Button>
            <Button variant="accent" type="submit" className="flex-1">{kioskCopy("screen_verify_pin_d4d945", "Verify PIN")}</Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: STAFF ACTION MENU -- shown once, after the single Staff Mode PIN above succeeds */}
      <Modal
        isOpen={isStaffActionMenuOpen}
        onClose={() => setIsStaffActionMenuOpen(false)}
        title="Staff Mode"
      >
        <div className="space-y-3 py-2">
          <p className="text-xs text-[#4A5568]">{verifiedStaffName ? `Signed in as ${verifiedStaffName}.` : 'Staff verified.'} Choose what you need:</p>
          <Button variant="accent" className="w-full justify-center" onClick={handleApplyManagerDiscount}>
            Apply 10% Manager Discount
          </Button>
          <Button variant="ghost" className="w-full justify-center" onClick={handleOpenPrinterSettings}>
            Configure Kiosk Printer
          </Button>
          <Button variant="ghost" className="w-full justify-center" onClick={() => setIsStaffActionMenuOpen(false)}>
            {kioskCopy("screen_cancel_19766e", "Cancel")}
          </Button>
        </div>
      </Modal>

      <KioskPrinterSettingsModal
        isOpen={isKioskPrinterSettingsOpen}
        onClose={() => setIsKioskPrinterSettingsOpen(false)}
        showToast={showToast}
      />

      {/* Installer-only entry URL; a physical console PIN is still required to pair. */}
      <Modal isOpen={localCoreSetupOpen} onClose={() => {
        setLocalCoreSetupOpen(false);
        const next = new URL(window.location.href); next.searchParams.delete('local-core-setup');
        window.history.replaceState(null, '', next.toString());
      }} title="Local Core setup">
        <LocalCorePairing serverUrl={db.getSyncServerUrl()} paired={db.isLocalCorePaired()} onPair={(pin, url) => db.pairLocalCore(pin, url)} />
      </Modal>
      {/* MODAL: STAFF ASSISTANCE CONFIRMATION */}
      <Modal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        title={t('staffAssistance')}
      >
        <div className="text-center space-y-4 py-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 text-jaman-saffron flex items-center justify-center mx-auto">
            <Bell className="w-8 h-8" />
          </div>
          {staffCallDelivered === null ? (
            <>
              <h3 className="text-xl font-bold text-jaman-navy">{kioskCopy("screen_calling_a_team_member__484ef0", "Calling a team member…")}</h3>
              <p className="text-sm text-[#4A5568] leading-relaxed">{kioskCopy("screen_please_wait_a_moment__11ee54", "Please wait a moment.")}</p>
            </>
          ) : staffCallDelivered ? (
            <>
              <h3 className="text-xl font-bold text-jaman-navy">{kioskCopy("screen_team_member_notified_0a21d5", "Team Member Notified")}</h3>
              <p className="text-sm text-[#4A5568] leading-relaxed">{t('staffOnTheWay')}</p>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold text-jaman-navy">{kioskCopy("screen_please_ask_at_the_counter_73be27", "Please ask at the counter")}</h3>
              <p className="text-sm text-[#4A5568] leading-relaxed">{kioskCopy("screen_we_could_not_reach_our_team_from_this_kiosk_right_now_p_92b60f", "We could not reach our team from this kiosk right now. Please walk to the counter and a team member will help you.")}</p>
            </>
          )}
          <Button variant="accent" size="md" className="w-full" onClick={() => setIsStaffModalOpen(false)}>{kioskCopy("screen_close_7d9eb7", "Close")}</Button>
        </div>
      </Modal>

      {/* MODAL: INACTIVITY IDLE WARNING -- no backdrop-blur below: a full-viewport backdrop-filter
          is one of the most GPU-expensive effects to keep recompositing, and this modal fires
          automatically on every idle timeout -- exactly the "mouse lag while a popup is open"
          reported live. */}
      {showIdleWarning && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-6 bg-black/80 animate-fadeIn select-none">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl border-2 border-amber-400 animate-scaleUp">
            <div className="w-20 h-20 rounded-full bg-amber-50 text-jaman-saffron flex items-center justify-center mx-auto">
              <Clock className="w-10 h-10 animate-spin" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black text-jaman-navy">{t('idleWarningTitle')}</h3>
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
                className="text-xs font-bold text-[#8C9BAE] hover:text-jaman-navy"
              >{kioskCopy("screen_cancel_reset_screen_a5c397", "Cancel & Reset Screen")}</button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING CORNER CHATBOT AI ASSISTANT TRIGGER (Bottom Right) — hidden
          while the cart sidebar is open since both are anchored to the same
          bottom-right corner; without this the AI button physically sat on
          top of the cart's "Proceed to Payment" button, blocking checkout.
          Also hidden on WELCOME, which has its own clean layout. */}
      {showCustomerAi && !isChatbotOpen && !isCartOpen && step !== 'CONFIRMATION' && step !== 'WELCOME' && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 animate-fadeIn">
          {/* Floating Action Button */}
          <button
            onClick={() => {
              SoundService.playTap();
              setIsChatbotOpen(true);
            }}
            className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-gradient-to-tr from-jaman-navy to-[#163e5e] hover:from-jaman-saffron hover:to-[#f07d33] text-white flex items-center justify-center shadow-2xl border-2 border-white/30 hover:scale-105 active:scale-95 transition-all relative group"
            title="JAMANVAAR Food Assistant" aria-label="Open JAMAN AI Food Assistant"
          >
            <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white animate-ping" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
          </button>
        </div>
      )}
    </div>
    </JAMANVAARStartup>
  );
}
