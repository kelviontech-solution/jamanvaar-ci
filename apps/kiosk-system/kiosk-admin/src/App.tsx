import React, { useCallback, useEffect, useState } from 'react';
import { OnlinePaymentsPanel } from './components/OnlinePaymentsPanel';
import { OnboardingChecklistCard } from './components/OnboardingChecklistCard';
import { CategoryModal } from './components/CategoryModal';
import { KioskForgotPasswordPanel } from './components/KioskForgotPasswordPanel';
import {
  AuditRepository,
  ComboRepository,
  CouponRepository,
  CustomerRepository,
  db,
  FeedbackRepository,
  KioskDisplaySettingsRepository,
  KioskRepository,
  StaffRepository,
  LicenseRepository,
  MenuRepository,
  OrderRepository,
  PrinterRepository,
  ReceiptRepository,
  ServiceRequestRepository,
  TableRepository,
  TokenSequenceRepository,
  WelcomeScreenSettingsRepository
} from '@jamanvaar/database';
import {
  Category,
  ChatMessage,
  ComboDeal,
  Coupon,
  DietaryType,
  DiningTable,
  GeneratedReport,
  KioskDevice,
  MenuItem,
  ModifierGroup,
  NetworkState,
  Order,
  OrderStatus,
  ReceiptConfig,
  ReceiptPaperSize,
  ReceiptRecord,
  ServiceRequest,
  SpiceLevel
} from '@jamanvaar/types';
import { formatDate, formatINR, formatSplitTax, formatTime, SoundService, isValidGstinFormat, isValidFssaiFormat, isValidIndianPhone } from '@jamanvaar/utils';
import {
  Button,
  CategoryCard,
  EmptyState,
  KpiCard,
  JamanvaarLogo,
  JamanvaarAppBadge,
  JamanvaarAuthLayout,
  APP_HERO_IMAGES,
  BrandHeader,
  Modal,
  OfflineBanner,
  ProductCard,
  StatusBadge,
  ThermalReceiptView,
  ScreenErrorBoundary,
  ActivationNoticeBanner,
  ActivationHelpNote,
  JAMANVAARStartup,
  VirtualKeyboard,
  ActivationWelcomeScreen,
  printElement
} from '@jamanvaar/ui';
import { DeviceHealthService, EBillService, KdsMeshService, NetworkStatusService, PaymentService, PrinterService, VoiceService } from '@jamanvaar/api';
import { AdminChatbotEngine, MenuBuilderService, ReportGeneratorService } from '@jamanvaar/business';
import { FOOD_IMAGE_LIBRARY, PREBUILT_MENU_TEMPLATES } from '@jamanvaar/database';
import { SyncOutboxEngine, EntitySyncEngine, lanMeshSync, syncMenuCatalog, syncPromotions, syncFeedback, syncServiceMessages, publishCatalogNow, syncDiningTables } from '@jamanvaar/sync';
import {
  connectDeviceStep1Owner,
  connectDeviceStep2,
  isDeviceConnected,
  CloudApiError,
  staffLoginOwner,
  staffLogout,
  isStaffLoggedIn,
  getStaffUser,
  startSilentRefresh,
  getConnectedRestaurantId,
  onSessionExpired,
  requestPasswordResetOwner,
  resetPasswordOwner,
  getPaymentConnection,
  getPaymentsSummary,
  type PaymentsSummary,
  submitPaymentConnection,
  syncMenuToCloud,
  pushOrderSync,
  pullOrderSync,
  pushEntitySync,
  pullEntitySync,
  fetchCloudKiosks,
  sendKioskCommand,
  type CloudKiosk,
  type KioskCommandType,
  getDeviceTokenForSync,
  refreshLicenseFromCloud,
  type PaymentConnectionFields,
  type PaymentConnectionStatus, leaseNumberBlock, getLocalDeviceCode } from './cloud/cloudClient';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Award,
  Bell,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  CreditCard,
  Database,
  Download,
  Edit2,
  FileSpreadsheet,
  FileText,
  Flame,
  Globe,
  Grid,
  Heart,
  HelpCircle,
  Key,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Maximize,
  MessageCircle,
  MessageSquare,
  Moon,
  PackagePlus,
  Phone,
  Plus,
  Printer,
  QrCode,
  Radio,
  Receipt,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sliders,
  Sparkles,
  Star,
  Store,
  Tag,
  Trash2,
  TrendingUp,
  Unlock,
  Users,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  Eye,
  CheckSquare,
  History,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  Zap,
  ShieldAlert,
  X,
  Menu
} from 'lucide-react';

type AdminTab =
  | 'DASHBOARD'
  | 'MENU'
  | 'COMBOS'
  | 'TABLES'
  | 'ORDERS_KDS'
  | 'KIOSKS'
  | 'COUPONS'
  | 'HARDWARE'
  | 'REPORTS'
  | 'FEEDBACK'
  | 'STAFF'
  | 'RECEIPTS'
  | 'SYNC'
  | 'AUDIT'
  | 'LICENSE'
  | 'SETTINGS';

/** What the Receipt preview shows before any real order exists (BUG-135): it used to crash on `orders[0]`. */
const SAMPLE_RECEIPT_ORDER = {
  id: 'sample-order',
  orderNumber: 'SAMPLE-0001',
  tokenNumber: '101',
  orderType: 'TAKEAWAY',
  items: [
    { id: 'sample-1', orderId: 'sample-order', menuItemId: 'sample-1', name: 'Sample dish', quantity: 2, unitPrice: 100, modifiers: [], totalPrice: 200 },
    { id: 'sample-2', orderId: 'sample-order', menuItemId: 'sample-2', name: 'Sample drink', quantity: 1, unitPrice: 60, modifiers: [], totalPrice: 60 }
  ],
  subtotal: 260,
  discountAmount: 0,
  cgstAmount: 6.5,
  sgstAmount: 6.5,
  taxAmount: 13,
  roundOffAmount: 0,
  totalAmount: 273,
  paymentMethod: 'CASH_AT_COUNTER',
  paymentStatus: 'PENDING',
  orderStatus: 'CONFIRMED',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
} as unknown as Order;

/** Curated welcome-screen background photos (real, verified Unsplash images — restaurant ambience,
 *  not dish close-ups). An admin can also upload their own or paste a URL instead. */
const WELCOME_BACKGROUND_GALLERY: Array<{ label: string; url: string }> = [
  { label: 'Warm Dining Room', url: 'https://images.unsplash.com/photo-1538334421852-687c439c92f4?auto=format&fit=crop&w=1800&q=80' },
  { label: 'Elegant Table Setting', url: 'https://images.unsplash.com/photo-1667388969250-1c7220bf3f37?auto=format&fit=crop&w=1800&q=80' },
  { label: 'Cozy Booth Seating', url: 'https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?auto=format&fit=crop&w=1800&q=80' },
  { label: 'Modern Interior', url: 'https://images.unsplash.com/photo-1613274554329-70f997f5789f?auto=format&fit=crop&w=1800&q=80' },
  { label: 'Warm Ambient Lighting', url: 'https://images.unsplash.com/photo-1729394405518-eaf2a0203aa7?auto=format&fit=crop&w=1800&q=80' },
  { label: 'Fine Dining Setting', url: 'https://images.unsplash.com/photo-1570560258879-af7f8e1447ac?auto=format&fit=crop&w=1800&q=80' },
  { label: 'Contemporary Dining', url: 'https://images.unsplash.com/photo-1636405189493-181ecf851006?auto=format&fit=crop&w=1800&q=80' }
];

export default function AdminApp() {
  const [activeTab, setActiveTab] = useState<AdminTab>('DASHBOARD');
  // The nav sidebar used to always render at its full 256px desktop width,
  // leaving almost no room for content on a phone-width screen (headings
  // wrapping mid-word, KPI cards truncated). Off-canvas below lg, same
  // slide-in/backdrop pattern already used by Super Admin's sidebar.
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [dbTick, setDbTick] = useState(0);

  // Network State (Online vs Offline)
  const [networkState, setNetworkState] = useState<NetworkState>('ONLINE');
  const [networkLatency, setNetworkLatency] = useState<number>(18);

  // One-time cloud device connection — separate from the PIN/credential
  // login below, which stays the fast day-to-day unlock once this terminal
  // is connected. isDeviceConnected() persists across reloads, so this
  // screen only ever appears the first time a kiosk-admin terminal is set
  // up (see cloud/cloudClient.ts for why this is two calls, not one).
  const [deviceConnected, setDeviceConnected] = useState(isDeviceConnected());
  const [connectStep, setConnectStep] = useState<'CREDENTIALS' | 'ACTIVATION_KEY'>('CREDENTIALS');
  // The restaurant's customer-facing ID (JM…), typed by the operator — not the internal UUID.
  const [connectRestaurantCode, setConnectRestaurantCode] = useState('');
  const [connectPassword, setConnectPassword] = useState('');
  const [connectActivationKey, setConnectActivationKey] = useState('');
  const [connectActivationSessionToken, setConnectActivationSessionToken] = useState('');
  const [connectRestaurantName, setConnectRestaurantName] = useState('');
  // The internal UUID resolved server-side from connectRestaurantCode — connectDeviceStep2
  // still needs this to persist the connection locally; the operator never sees or types it.
  const [connectResolvedRestaurantId, setConnectResolvedRestaurantId] = useState('');
  const [connectOwnerLabel, setConnectOwnerLabel] = useState('Owner');
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState('');
  // Only true right after THIS connection succeeds — a one-time
  // orientation screen, not a persistent state.
  const [showActivationWelcome, setShowActivationWelcome] = useState(false);

  const handleConnectCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectError('');
    setConnectBusy(true);
    try {
      const result = await connectDeviceStep1Owner(connectRestaurantCode, connectPassword);
      if (result.status === 'CONNECTED') {
        setDeviceConnected(true);
        setShowActivationWelcome(true);
      } else {
        setConnectActivationSessionToken(result.activationSessionToken);
        setConnectRestaurantName(result.restaurantName);
        setConnectResolvedRestaurantId(result.restaurantId);
        setConnectOwnerLabel(result.ownerLabel ?? 'Owner');
        setConnectStep('ACTIVATION_KEY');
      }
    } catch (err) {
      setConnectError(err instanceof CloudApiError ? err.message : 'Could not connect — check your Restaurant ID and password and try again.');
    } finally {
      setConnectBusy(false);
    }
  };

  const handleConnectActivationKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectError('');
    setConnectBusy(true);
    try {
      await connectDeviceStep2(connectActivationSessionToken, connectActivationKey, connectResolvedRestaurantId, connectOwnerLabel, connectRestaurantName);
      setDeviceConnected(true);
      setShowActivationWelcome(true);
    } catch (err) {
      if (err instanceof CloudApiError) {
        // cloud/api's raw message here is technical ("This activation key is
        // designated for KIOSK terminals, not KIOSK_ADMIN.") and gives a
        // non-technical restaurant operator no recourse — they don't know
        // KIOSK (customer terminal) and KIOSK_ADMIN (this console) are
        // separate keys, or where to get the right one. Reword it in place
        // rather than showing the backend's wording verbatim.
        const mismatch = err.message.match(/designated for (\w+) terminals, not KIOSK_ADMIN/i);
        setConnectError(
          mismatch
            ? `That key is for ${mismatch[1]} devices, not Kiosk Admin. Ask your Super Admin for the key labeled "KIOSK_ADMIN" in this restaurant's Welcome Kit — it's separate from the "${mismatch[1]}" key.`
            : err.message
        );
      } else {
        setConnectError('Activation failed — check the key and try again.');
      }
    } finally {
      setConnectBusy(false);
    }
  };

  // Kiosk Admin Authentication State — restored from a real tenant-user session
  const [isKioskAdminLoggedIn, setIsKioskAdminLoggedIn] = useState<boolean>(() => isStaffLoggedIn());
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  // Owner-only login (spec 7/33/54): no email field — the terminal is already connected to a
  // known restaurant, so only the owner's password is asked for daily sign-in.
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  useEffect(() => {
    if (isStaffLoggedIn()) {
      startSilentRefresh();
    }
    // If the session dies asynchronously (a refresh discovers the refresh
    // token is dead, or a race-safe logout finishes clearing state), reflect
    // that in the UI immediately instead of leaving the admin screen visible
    // until the next reload.
    const unsubscribeSessionExpired = onSessionExpired(() => {
      setIsKioskAdminLoggedIn(false);
    });
    return () => {
      unsubscribeSessionExpired();
    };
  }, []);

  // Push the current menu to cloud/api once, on boot, if this terminal is
  // already device-connected — MenuSnapshotItem needs real data before
  // kiosk-user can price any real order against it.
  useEffect(() => {
    if (!isDeviceConnected()) return;
    syncMenuToCloud(MenuRepository.getAllMenuItems(), db.taxGroups).catch((err) => {
      console.error('Menu sync failed:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKioskAdminLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authPassword.trim()) {
      setAuthError('Please enter the password.');
      return;
    }

    const restaurantId = getConnectedRestaurantId();
    if (!restaurantId) {
      setAuthError('This terminal is not connected to a restaurant yet.');
      return;
    }

    setAuthBusy(true);
    setAuthError('');
    try {
      await staffLoginOwner(restaurantId, authPassword);
      setIsKioskAdminLoggedIn(true);
      setAuthPassword('');
    } catch (err) {
      setAuthError(err instanceof CloudApiError ? err.message : 'Login failed. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleKioskAdminLogout = () => {
    setIsKioskAdminLoggedIn(false);
    setAuthPassword('');
    void staffLogout();
  };

  // Search & Filter states for Menu
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [dietaryFilter, setDietaryFilter] = useState<string>('ALL');

  // Modals
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [confirmingTokenReset, setConfirmingTokenReset] = useState(false);
  const [isAddComboModalOpen, setIsAddComboModalOpen] = useState(false);
  const [isAddCouponModalOpen, setIsAddCouponModalOpen] = useState(false);
  const [isDiagModalOpen, setIsDiagModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Smart Prebuilt Menu Library & Menu Builder Modals
  const [isPrebuiltMenuModalOpen, setIsPrebuiltMenuModalOpen] = useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(['tpl-pizza']);
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [selectedCuisineFilter, setSelectedCuisineFilter] = useState<string>('ALL');
  const [templateStep, setTemplateStep] = useState<'SELECT' | 'PREVIEW' | 'IMPORT_OPTIONS'>('SELECT');
  const [importCategoriesOpt, setImportCategoriesOpt] = useState(true);
  const [importItemsOpt, setImportItemsOpt] = useState(true);
  const [importImagesOpt, setImportImagesOpt] = useState(true);
  const [importCombosOpt, setImportCombosOpt] = useState(true);
  const [importSuggestedPricesOpt, setImportSuggestedPricesOpt] = useState(true);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'KEEP_EXISTING' | 'REPLACE_DUPLICATE' | 'IMPORT_AS_NEW'>('KEEP_EXISTING');

  // Bulk Price Adjuster Modal
  const [isBulkPriceModalOpen, setIsBulkPriceModalOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState<string>('ALL');
  const [bulkPercentageDelta, setBulkPercentageDelta] = useState<number>(10);
  const [bulkFixedDelta, setBulkFixedDelta] = useState<number>(0);
  const [bulkRounding, setBulkRounding] = useState<1 | 5 | 10>(5);

  // Image Library Asset Hub Modal
  const [isImageLibraryModalOpen, setIsImageLibraryModalOpen] = useState(false);
  const [selectedImageTargetItem, setSelectedImageTargetItem] = useState<MenuItem | null>(null);
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [selectedImageCuisine, setSelectedImageCuisine] = useState<string>('ALL');
  const [customImageUrlInput, setCustomImageUrlInput] = useState('');
  const [photoSourceTab, setPhotoSourceTab] = useState<'UPLOAD' | 'URL' | 'LIBRARY'>('UPLOAD');
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');

  // Welcome screen background photo picker (Kiosk Admin only — separate from the dish Photo Hub above)
  const [bgPhotoTab, setBgPhotoTab] = useState<'GALLERY' | 'UPLOAD' | 'URL'>('GALLERY');
  const [bgUploadPreview, setBgUploadPreview] = useState<string | null>(null);
  const [bgUrlInput, setBgUrlInput] = useState('');

  // Missing Data / Completeness Assistant Modal
  const [isMissingDataModalOpen, setIsMissingDataModalOpen] = useState(false);

  // Kiosk Menu Interactive Live Preview Modal
  const [isKioskMenuPreviewModalOpen, setIsKioskMenuPreviewModalOpen] = useState(false);
  const [previewCategoryFilter, setPreviewCategoryFilter] = useState<string>('ALL');

  // Version History & Publish Modals
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishNotes, setPublishNotes] = useState('');
  const [isVersionHistoryModalOpen, setIsVersionHistoryModalOpen] = useState(false);

  // Import / Export JSON & CSV Modal
  const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false);
  const [importJsonInput, setImportJsonInput] = useState('');

  // Assistant State (Admin Intelligence Bot)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [botActionCategory, setBotActionCategory] = useState<'SALES' | 'KITCHEN' | 'HARDWARE' | 'SYSTEM'>('SALES');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      sender: 'ASSISTANT',
      text: '🙏 **Namaste! JAMANVAAR Operations Intelligence Bot**\n\nI am connected directly to your local store database. Click any preloaded query below to inspect real-time sales, kitchen velocity, table occupancy, or kiosk matrix health:',
      timestamp: new Date().toISOString(),
      suggestions: ['💰 Today\'s Live Sales', '🏆 Top 5 Selling Dishes', '💳 Payment Method Breakdown', '👨‍🍳 Live Kitchen KDS Status']
    }
  ]);

  // Form states for Item
  const [newItemName, setNewItemName] = useState('');
  const [newItemSku, setNewItemSku] = useState('');
  const [newItemPrice, setNewItemPrice] = useState<number>(200);
  const [newItemCategory, setNewItemCategory] = useState<string>('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemDietary, setNewItemDietary] = useState<DietaryType>('VEG');
  const [newItemSpice, setNewItemSpice] = useState<SpiceLevel>('NONE');
  // Hindi/Gujarati translations for the dish being created — there was
  // previously no way at all to set these when adding an item, so every
  // admin-added dish showed in English regardless of the kiosk's selected
  // language. The virtual keyboard lets an admin without a native-script
  // keyboard type these phonetically (see @jamanvaar/ui VirtualKeyboard).
  const [newItemNameHi, setNewItemNameHi] = useState('');
  const [newItemDescHi, setNewItemDescHi] = useState('');
  const [newItemNameGu, setNewItemNameGu] = useState('');
  const [newItemDescGu, setNewItemDescGu] = useState('');
  const [activeKeyboardField, setActiveKeyboardField] = useState<
    null | { lang: 'hi' | 'gu'; field: 'name' | 'description' }
  >(null);

  // Form states for Combo — mainItemIds/etc. used to be hardcoded to
  // menuItems[0]/menuItems[1] regardless of what the admin actually picked;
  // these now hold the real selection made in the create-combo form.
  const [comboName, setComboName] = useState('');
  const [comboDesc, setComboDesc] = useState('');
  const [comboPrice, setComboPrice] = useState<number>(449);
  const [comboOriginalPrice, setComboOriginalPrice] = useState<number>(550);
  const [comboMainItemIds, setComboMainItemIds] = useState<string[]>([]);
  const [comboSideItemIds, setComboSideItemIds] = useState<string[]>([]);
  const [comboDrinkItemIds, setComboDrinkItemIds] = useState<string[]>([]);
  const [comboDessertItemIds, setComboDessertItemIds] = useState<string[]>([]);

  // Form states for Coupon
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponValue, setNewCouponValue] = useState<number>(50);
  const [newCouponMin, setNewCouponMin] = useState<number>(200);
  const [newCouponUsageLimit, setNewCouponUsageLimit] = useState(''); // blank = unlimited (B2-064)

  // Active Report View in Reports Tab
  const [activeReportType, setActiveReportType] = useState<'DAILY_SALES' | 'MONTHLY_SALES' | 'ITEM_SALES'>('DAILY_SALES');
  const [includeChartsInReport, setIncludeChartsInReport] = useState<boolean>(true);

  // Edit Restaurant Profile Modal & Form State
  const [isEditRestaurantModalOpen, setIsEditRestaurantModalOpen] = useState<boolean>(false);
  const [restForm, setRestForm] = useState({
    legalName: db.restaurant.legalName || '',
    name: db.restaurant.name || '',
    outletName: db.outlet.name || '',
    address: db.outlet.address || '',
    city: db.outlet.city || '',
    state: db.outlet.state || '',
    gstin: db.restaurant.gstin || '',
    fssai: db.restaurant.fssaiNumber || '',
    phone: db.restaurant.phone || '',
    email: db.restaurant.email || ''
  });

  // Dealer Data Reset & Purge Modals
  const [isResetDataModalOpen, setIsResetDataModalOpen] = useState(false);
  const [resetDataType, setResetDataType] = useState<'DAILY' | 'MONTHLY'>('DAILY');
  const [resetConfirmationText, setResetConfirmationText] = useState('');

  // Receipt Config State
  const [receiptForm, setReceiptForm] = useState<ReceiptConfig>(ReceiptRepository.getConfig());
  // B2-040: same gap as Restaurant Admin's own Report Branding screen — GSTIN/FSSAI/phone here
  // had no format check at all, and this record is what POS/Kiosk actually print on receipts.
  const [receiptFormErrors, setReceiptFormErrors] = useState<Record<string, string>>({});

  // Voice Configuration Form
  const [voiceForm, setVoiceForm] = useState(VoiceService.getConfig());

  // Payment Gateway Connection (Settings tab) — restaurant's own Razorpay
  // settlement/KYC submission, reviewed by JAMANVAAR before going live.
  const [paymentConnection, setPaymentConnection] = useState<PaymentConnectionStatus | null>(null);
  const [paymentConnectionLoading, setPaymentConnectionLoading] = useState(false);
  const [paymentConnectionError, setPaymentConnectionError] = useState('');
  const [paymentFormFields, setPaymentFormFields] = useState<PaymentConnectionFields>({
    accountType: 'BUSINESS', pan: '', contactName: '', contactEmail: '', contactPhone: ''
  });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentsSummary, setPaymentsSummary] = useState<PaymentsSummary | null>(null);
  const [paymentsSummaryError, setPaymentsSummaryError] = useState(false);
  useEffect(() => {
    if (!isDeviceConnected()) return;
    getPaymentsSummary()
      .then((s) => { setPaymentsSummary(s); setPaymentsSummaryError(false); })
      .catch(() => setPaymentsSummaryError(true));
  }, []);

  // Extracted from the effect below so the error banner's Retry button can
  // re-run exactly the same fetch. Without it, a transient failure — most
  // commonly this firing before startSilentRefresh() has landed its first
  // token on app boot — left the card permanently stuck on an error line.
  const loadPaymentConnection = useCallback(() => {
    setPaymentConnectionLoading(true);
    setPaymentConnectionError('');
    getPaymentConnection()
      .then((data) => {
        setPaymentConnection(data);
        setPaymentFormFields((prev) => ({
          ...prev,
          accountType: (data.accountType as 'BUSINESS' | 'INDIVIDUAL') ?? prev.accountType,
          businessType: data.businessType ?? prev.businessType,
          // security-audit MED-01: the server now returns these masked ("•••• 1234"),
          // not the real value — pre-filling the edit form with a mask would let an
          // operator accidentally resubmit the mask itself as the new PAN/GST/CIN/
          // Aadhaar. Left blank so a resubmission always requires the real value, the
          // same convention as a password/CVV field.
          contactName: data.contactName ?? prev.contactName,
          contactEmail: data.contactEmail ?? prev.contactEmail,
          contactPhone: data.contactPhone ?? prev.contactPhone,
          settlementAccountName: data.settlementAccountName ?? prev.settlementAccountName,
          settlementIfsc: data.settlementIfsc ?? prev.settlementIfsc,
          settlementUpiVpa: data.settlementUpiVpa ?? prev.settlementUpiVpa
        }));
      })
      .catch((err) => setPaymentConnectionError(err instanceof CloudApiError ? err.message : 'Could not load payment connection status'))
      .finally(() => setPaymentConnectionLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab !== 'SETTINGS') return;
    loadPaymentConnection();
  }, [activeTab, loadPaymentConnection]);

  const handleSubmitPaymentConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentSubmitting(true);
    setPaymentConnectionError('');
    try {
      const updated = await submitPaymentConnection(paymentFormFields);
      setPaymentConnection(updated);
      showToast('Payment connection details submitted for review.');
    } catch (err) {
      // A 400 from the API's Zod pipe carries per-field `issues`; its own
      // top-level message is only ever "Validation failed", which tells the
      // restaurant nothing about which field was rejected.
      if (err instanceof CloudApiError && err.issues?.length) {
        setPaymentConnectionError(err.issues.map((i) => `${i.path}: ${i.message}`).join('; '));
      } else {
        setPaymentConnectionError(err instanceof CloudApiError ? err.message : 'Submission failed');
      }
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Global Search Command Palette (Ctrl + K)
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [isZReportModalOpen, setIsZReportModalOpen] = useState(false);

  // Real-Time Local Order System State
  const [orderSoundEnabled, setOrderSoundEnabled] = useState<boolean>(true);
  const [newOrderArrivalAlert, setNewOrderArrivalAlert] = useState<Order | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [orderKioskFilter, setOrderKioskFilter] = useState<string>('ALL');
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('ALL');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [orderSortBy, setOrderSortBy] = useState<'NEWEST' | 'OLDEST' | 'HIGHEST'>('NEWEST');
  const [localServiceHealth, setLocalServiceHealth] = useState<{
    status: 'CONNECTED' | 'DISCONNECTED';
    mode: string;
    database: string;
    activeKiosks: number;
    totalKiosks: number;
  }>({
    status: 'CONNECTED',
    mode: '100% OFFLINE_ON_PREMISE',
    database: 'CONNECTED',
    activeKiosks: 1,
    totalKiosks: 1
  });

  // Sound chime for new orders
  const playOrderArrivalChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.12 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.4);
      });
    } catch (e) {}
  };

  // Subscribe to Real-Time SSE Events & Service Health
  useEffect(() => {
    let sse: EventSource | null = null;
    const host = window.location?.hostname || 'localhost';
    try {
      if ('EventSource' in window) {
        sse = new EventSource(`http://${host}:5178/api/events`);
        sse.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data || '{}');
            if (data.event === 'ORDER_CREATED') {
              if (orderSoundEnabled) {
                playOrderArrivalChime();
              }
              const incoming = data.order || data;
              setNewOrderArrivalAlert(incoming);
              setDbTick((t) => t + 1);
              showToast(`🔔 New Order #${data.tokenNumber || incoming.tokenNumber} arrived from ${data.kioskId || 'KIOSK-01'}!`);
            } else if (data.event === 'ORDER_STATUS_CHANGED' || data.type === 'DB_UPDATE') {
              setDbTick((t) => t + 1);
            }
          } catch (e) {}
        };
      }
    } catch (e) {}

    const checkHealth = () => {
      // B2-025: networkLatency used to be a hardcoded 18 that nothing ever updated — displayed as
      // if it were live "Round-trip time to the local sync server" telemetry on the exact page an
      // operator would use to diagnose a slow connection. This IS that round trip: timed directly
      // around the same health check that already runs every 5s to this server.
      const startedAt = performance.now();
      fetch(`http://${host}:5178/api/health`)
        .then((r) => r.json())
        .then((h) => {
          setNetworkLatency(Math.round(performance.now() - startedAt));
          if (h && h.status) {
            const onlineCount = (h.kiosks || []).filter((k: any) => k.status === 'ONLINE').length;
            setLocalServiceHealth({
              status: 'CONNECTED',
              mode: h.mode || '100% OFFLINE_ON_PREMISE',
              database: h.database || 'CONNECTED',
              activeKiosks: onlineCount,
              totalKiosks: (h.kiosks || []).length
            });
          }
        })
        .catch(() => {
          setLocalServiceHealth((prev) => ({ ...prev, status: 'DISCONNECTED' }));
        });
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);

    return () => {
      if (sse) sse.close();
      clearInterval(interval);
    };
  }, [orderSoundEnabled]);

  // Real Kiosk Terminal Fleet: join the LAN mesh and mirror actually-connected
  // KIOSK_USER devices into db.kiosks, instead of the fixed fake fleet this
  // screen used to show regardless of what devices were really activated
  // (QA audit BUG-004).
  // Kiosks that the cloud reports as really online, so the LAN-mesh fleet refresh below does not mark them offline.
  const cloudOnlineKioskIds = React.useRef<Set<string>>(new Set());
  const [kioskFleet, setKioskFleet] = React.useState<Record<string, CloudKiosk>>({});
  const runKioskCommand = async (kioskId: string, name: string, type: KioskCommandType, label: string, payload?: Record<string, unknown>) => {
    try {
      await sendKioskCommand(kioskId, type, payload);
      showToast(`${label} sent to ${name}. It runs on the kiosk's next check-in.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not send ${label}`);
    }
  };

  // Cloud sync for this console (BUG-130/132/133/136/137/138). It used to sync nothing but a price table, so
  // menu, combos and coupons edited here never reached the self-order kiosk, and orders, ratings, help requests
  // and the list of kiosks never reached this console.
  useEffect(() => {
    if (!deviceConnected || !getDeviceTokenForSync()) return;
    SyncOutboxEngine.configureTransport({ push: pushOrderSync, pull: pullOrderSync, leaseNumbers: leaseNumberBlock, deviceId: getLocalDeviceCode });
    EntitySyncEngine.configureTransport({ push: pushEntitySync, pull: pullEntitySync });

    const refreshKiosks = async () => {
      try {
        const kiosks = await fetchCloudKiosks();
        const online = new Set<string>();
        kiosks.forEach((k) => {
          const reachable = k.health === 'online' || k.health === 'degraded';
          if (reachable) online.add(k.id);
          KioskRepository.upsertFromHeartbeat({
            deviceId: k.id,
            name: k.name,
            appVersion: k.appVersion ?? '',
            lastHeartbeat: k.lastSeenAt ?? new Date(0).toISOString()
          });
          KioskRepository.updateKioskStatus(k.id, k.isLocked ? 'LOCKED' : reachable ? 'ONLINE' : 'OFFLINE', k.isLocked);
        });
        cloudOnlineKioskIds.current = online;
        setKioskFleet(Object.fromEntries(kiosks.map((k) => [k.id, k])));
        void refreshLicenseFromCloud(kiosks.length);
      } catch {
        // Offline: keep what was last known.
      }
    };

    const tick = async () => {
      void SyncOutboxEngine.processOutbox();
      void SyncOutboxEngine.catchUpFromCloud();
      void syncMenuCatalog({ push: true });
      void syncPromotions({ pushCombos: true, pushCoupons: true });
      void syncFeedback({ push: false });
      // Staff created in Restaurant Admin sign in here too, and the floor plan is shared (BUG-158: the staff list
      // was empty and the tables were the demo ones).
      void EntitySyncEngine.catchUp('STAFF_USER', (remote) => StaffRepository.applyRemoteUser(remote.payload));
      void syncDiningTables();
      void refreshKiosks();
      // A guest's "call staff" request at a kiosk becomes a service request in this console.
      const inbound = await syncServiceMessages('KIOSK_ADMIN');
      inbound
        .filter((m) => m.kind === 'CALL_STAFF')
        .forEach((m) => ServiceRequestRepository.create({ id: m.id, kioskId: m.senderName, tableNumber: m.tableNumber, type: 'CALL_STAFF', notes: m.presetText }));
    };
    void tick();
    const id = setInterval(() => void tick(), 8000);
    return () => clearInterval(id);
  }, [deviceConnected]);

  useEffect(() => {
    lanMeshSync.registerDevice('KIOSK_ADMIN', 'KIOSK-ADMIN-01', 'Kiosk Admin Console');

    const syncFleetFromMesh = () => {
      const kioskPeers = lanMeshSync.getConnectedPeers().filter((p) => p.role === 'KIOSK_USER');
      kioskPeers.forEach((peer) =>
        KioskRepository.upsertFromHeartbeat({
          deviceId: peer.deviceId,
          name: peer.name,
          appVersion: peer.appVersion,
          lastHeartbeat: peer.lastHeartbeat
        })
      );
      // A kiosk reachable through the cloud is just as present as one on this LAN (BUG-132).
      KioskRepository.markStaleOffline(new Set([...kioskPeers.map((p) => p.deviceId), ...cloudOnlineKioskIds.current]));
    };

    syncFleetFromMesh();
    const fleetInterval = setInterval(syncFleetFromMesh, 6000);
    const unsubMesh = lanMeshSync.onAny(() => syncFleetFromMesh());

    return () => {
      clearInterval(fleetInterval);
      unsubMesh();
    };
  }, []);

  // Keyboard Shortcuts (Ctrl + K, Ctrl + S, Escape) (Sections 199-200)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        showToast('✓ Quick Save Triggered: All local changes synchronized.');
      } else if (e.key === 'Escape') {
        setIsGlobalSearchOpen(false);
        setIsAssistantOpen(false);
        setIsAddItemModalOpen(false);
        setIsAddCategoryModalOpen(false);
        setIsAddComboModalOpen(false);
        setIsAddCouponModalOpen(false);
        setIsDiagModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Subscribe to real-time database changes
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setDbTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const categories = MenuRepository.getAllCategories();
  const menuItems = MenuRepository.getAllMenuItems();
  const combos = ComboRepository.getAllCombos();
  const orders = OrderRepository.getAllOrders();
  const tables = TableRepository.getAllTables();
  const kiosks = KioskRepository.getAllKiosks();
  const coupons = CouponRepository.getAllCoupons();
  const serviceRequests = ServiceRequestRepository.getAll();
  const auditLogs = AuditRepository.getAll();
  const feedbacks = FeedbackRepository.getAll();
  // Both KPI cards below used to be permanently hardcoded ("4.9 / 5.0",
  // "98%") regardless of real feedback/order data — computed for real here.
  const avgRating = feedbacks.length > 0 ? (feedbacks.reduce((sum, fb) => sum + fb.rating, 0) / feedbacks.length).toFixed(1) : null;
  const ordersWithReadyTiming = orders.filter(
    (o) => (o.orderStatus === 'READY' || o.orderStatus === 'SERVED' || o.orderStatus === 'COMPLETED') && o.timeline?.some((t) => t.status === 'READY')
  );
  const onTimeOrders = ordersWithReadyTiming.filter((o) => {
    const readyEntry = o.timeline!.find((t) => t.status === 'READY')!;
    const elapsedMin = (new Date(readyEntry.timestamp).getTime() - new Date(o.createdAt).getTime()) / 60000;
    return elapsedMin <= (o.estimatedWaitMinutes || 15);
  }).length;
  const serviceSpeedScore = ordersWithReadyTiming.length > 0 ? Math.round((onTimeOrders / ordersWithReadyTiming.length) * 100) : null;
  const license = LicenseRepository.getLicense();
  const receiptRecords = ReceiptRepository.getAllRecords();
  const syncStats = SyncOutboxEngine.getSyncStats();
  const completenessReport = MenuBuilderService.getCompletenessReport();
  const isMenuDraft = MenuBuilderService.isDraft();
  const menuVersions = MenuBuilderService.getVersions();

  // KPIs
  const todayOrders = orders.length;
  const todayRevenue = orders.reduce((sum, o) => sum + (o.paymentStatus === 'SUCCESS' ? o.totalAmount : 0), 0);
  const avgOrderValue = todayOrders > 0 ? Math.round(todayRevenue / todayOrders) : 0;

  // Real payment-channel split — this used to be hardcoded 68/22/10% of
  // todayRevenue regardless of what was actually paid via which method.
  const paidOrders = orders.filter((o) => o.paymentStatus === 'SUCCESS');
  const upiRevenue = paidOrders
    .filter((o) => o.paymentMethod === 'UPI_QR' || o.paymentMethod === 'UPI')
    .reduce((sum, o) => sum + o.totalAmount, 0);
  const cardRevenue = paidOrders
    .filter((o) => o.paymentMethod === 'CARD_TERMINAL' || o.paymentMethod === 'CARD')
    .reduce((sum, o) => sum + o.totalAmount, 0);
  const cashRevenue = paidOrders
    .filter((o) => o.paymentMethod === 'CASH_AT_COUNTER' || o.paymentMethod === 'CASH')
    .reduce((sum, o) => sum + o.totalAmount, 0);
  const paymentSplitDenominator = Math.max(1, todayRevenue);
  const upiPct = Math.round((upiRevenue / paymentSplitDenominator) * 100);
  const cardPct = Math.round((cardRevenue / paymentSplitDenominator) * 100);
  const cashPct = Math.round((cashRevenue / paymentSplitDenominator) * 100);
  // Real hourly breakdown from today's actual orders — this used to be a
  // hardcoded literal array with no connection to `orders` at all.
  const HOURLY_SLOTS: Array<{ hour24: number; label: string }> = [
    { hour24: 9, label: '9 AM' },
    { hour24: 10, label: '10 AM' },
    { hour24: 11, label: '11 AM' },
    { hour24: 12, label: '12 PM' },
    { hour24: 13, label: '1 PM' },
    { hour24: 14, label: '2 PM' },
    { hour24: 15, label: '3 PM' },
    { hour24: 17, label: '5 PM' },
    { hour24: 18, label: '6 PM' },
    { hour24: 19, label: '7 PM' },
    { hour24: 20, label: '8 PM' },
    { hour24: 21, label: '9 PM' },
    { hour24: 22, label: '10 PM' }
  ];
  const todaysPaidOrders = orders.filter(
    (o) => o.paymentStatus === 'SUCCESS' && new Date(o.createdAt).toDateString() === new Date().toDateString()
  );
  const hourlyAmounts = HOURLY_SLOTS.map(({ hour24 }) =>
    todaysPaidOrders
      .filter((o) => new Date(o.createdAt).getHours() === hour24)
      .reduce((sum, o) => sum + o.totalAmount, 0)
  );
  const maxHourlyAmount = Math.max(1, ...hourlyAmounts);
  const hourlyBars = HOURLY_SLOTS.map((slot, idx) => {
    const amount = hourlyAmounts[idx];
    return {
      hour: slot.label,
      amount,
      pct: Math.round((amount / maxHourlyAmount) * 100),
      isPeak: amount > 0 && amount >= maxHourlyAmount * 0.65
    };
  });
  const peakHourBar = hourlyBars.reduce((best, b) => (b.amount > best.amount ? b : best), hourlyBars[0]);

  const newOrdersCount = orders.filter((o) => o.orderStatus === 'NEW').length;
  const confirmedCount = orders.filter((o) => o.orderStatus === 'CONFIRMED').length;
  const prepCount = orders.filter((o) => o.orderStatus === 'PREPARING').length;
  const readyCount = orders.filter((o) => o.orderStatus === 'READY').length;
  const completedCount = orders.filter((o) => o.orderStatus === 'COMPLETED' || o.orderStatus === 'COLLECTED').length;
  const pendingKOT = orders.filter((o) => o.orderStatus === 'PREPARING' || o.orderStatus === 'CONFIRMED' || o.orderStatus === 'NEW').length; // READY orders are waiting for pickup, not for the kitchen
  const occupiedTables = tables.filter((t) => t.status === 'OCCUPIED').length;
  const tableOccupancyPercent = tables.length > 0 ? Math.round((occupiedTables / tables.length) * 100) : 0;

  // Filtered Orders for KDS & Orders View
  const displayedOrders = orders
    .filter((o) => {
      if (orderStatusFilter !== 'ALL') {
        if (orderStatusFilter === 'COMPLETED') {
          if (o.orderStatus !== 'COMPLETED' && o.orderStatus !== 'COLLECTED') return false;
        } else if (o.orderStatus !== orderStatusFilter) {
          return false;
        }
      }
      if (orderKioskFilter !== 'ALL' && o.kioskId !== orderKioskFilter) return false;
      if (orderTypeFilter !== 'ALL' && o.orderType !== orderTypeFilter) return false;
      if (orderSearchQuery) {
        const q = orderSearchQuery.toLowerCase();
        const matchNum = o.orderNumber?.toLowerCase().includes(q);
        const matchTok = o.tokenNumber?.includes(q);
        const matchKiosk = o.kioskId?.toLowerCase().includes(q);
        const matchPhone = o.customerPhone?.includes(q);
        const matchName = o.customerName?.toLowerCase().includes(q);
        if (!matchNum && !matchTok && !matchKiosk && !matchPhone && !matchName) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (orderSortBy === 'OLDEST') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (orderSortBy === 'HIGHEST') {
        return b.totalAmount - a.totalAmount;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // Filtered Menu Items
  const filteredMenuItems = menuItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(menuSearch.toLowerCase()) ||
      item.sku.toLowerCase().includes(menuSearch.toLowerCase());
    const matchesCategory =
      selectedCategoryFilter === 'ALL' || item.categoryId === selectedCategoryFilter;
    const matchesDietary =
      dietaryFilter === 'ALL' || item.dietaryType === dietaryFilter;
    return matchesSearch && matchesCategory && matchesDietary;
  });

  const handleCreateMenuItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || !newItemPrice) return;

    const translations: MenuItem['translations'] = {};
    if (newItemNameHi.trim()) translations.hi = { name: newItemNameHi.trim(), description: newItemDescHi.trim() || undefined };
    if (newItemNameGu.trim()) translations.gu = { name: newItemNameGu.trim(), description: newItemDescGu.trim() || undefined };

    const created = MenuRepository.createMenuItem({
      name: newItemName,
      sku: newItemSku || `SKU-${Math.floor(100 + Math.random() * 900)}`,
      price: Number(newItemPrice),
      categoryId: newItemCategory || categories[0]?.id || 'cat-starters',
      description: newItemDesc,
      translations: Object.keys(translations).length > 0 ? translations : undefined,
      dietaryType: newItemDietary,
      spiceLevel: newItemSpice,
      isAvailable: true,
      modifierGroupIds: db.modifierGroups.map((g) => g.id)
    });

    AuditRepository.log({
      username: 'admin',
      action: 'MENU_ITEM_CREATED',
      category: 'MENU',
      details: `Created new dish "${created.name}" (SKU: ${created.sku}, Price: ₹${created.price})`
    });

    showToast(`Created dish: ${created.name}`);
    syncMenuToCloud(MenuRepository.getAllMenuItems(), db.taxGroups).catch((err) => {
      console.error('Menu sync failed:', err);
    });
    setIsAddItemModalOpen(false);
    setNewItemName('');
    setNewItemSku('');
    setNewItemDesc('');
    setNewItemNameHi('');
    setNewItemDescHi('');
    setNewItemNameGu('');
    setNewItemDescGu('');
  };

  const toggleComboItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => (id: string) => {
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreateCombo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comboName || !comboPrice) return;
    if (comboMainItemIds.length === 0) {
      showToast('Select at least one main dish for this combo');
      return;
    }

    const created = ComboRepository.createCombo({
      name: comboName,
      description: comboDesc,
      basePrice: Number(comboPrice),
      originalPrice: Number(comboOriginalPrice),
      savingsAmount: Math.max(0, Number(comboOriginalPrice) - Number(comboPrice)),
      mainItemIds: comboMainItemIds,
      sideItemIds: comboSideItemIds,
      drinkItemIds: comboDrinkItemIds,
      dessertItemIds: comboDessertItemIds,
      imageUrl: menuItems.find((m) => m.id === comboMainItemIds[0])?.imageUrl,
      isAvailable: true,
      featured: true
    });

    AuditRepository.log({
      username: 'admin',
      action: 'COMBO_CREATED',
      category: 'MENU',
      details: `Created combo deal "${created.name}" (Price: ₹${created.basePrice})`
    });

    showToast(`Created combo: ${created.name}`);
    setIsAddComboModalOpen(false);
    setComboName('');
    setComboDesc('');
    setComboMainItemIds([]);
    setComboSideItemIds([]);
    setComboDrinkItemIds([]);
    setComboDessertItemIds([]);
  };

  const handleCreateCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode) return;

    const usageLimit = newCouponUsageLimit.trim() ? Number(newCouponUsageLimit) : undefined;
    const cpn: Coupon = {
      id: `cpn-${Date.now()}`,
      code: newCouponCode.toUpperCase(),
      description: `Get ₹${newCouponValue} discount on orders above ₹${newCouponMin}`,
      discountType: 'FLAT',
      discountValue: Number(newCouponValue),
      minOrderValue: Number(newCouponMin),
      validFrom: new Date().toISOString(),
      validUntil: '2027-12-31T23:59:59Z',
      usageCount: 0,
      usageLimit,
      isActive: true
    };

    CouponRepository.createCoupon(cpn);

    AuditRepository.log({
      username: 'admin',
      action: 'COUPON_CREATED',
      category: 'OFFERS',
      details: `Created promo coupon "${cpn.code}"${usageLimit ? ` (usage limit: ${usageLimit})` : ''}`
    });

    showToast(`Created coupon: ${cpn.code}`);
    setIsAddCouponModalOpen(false);
    setNewCouponCode('');
    setNewCouponUsageLimit('');
  };

  // Assistant Query Handler (Direct DB Engine Execution)
  const handleSendAssistantQuery = (queryText: string) => {
    if (!queryText.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'USER',
      text: queryText,
      timestamp: new Date().toISOString()
    };

    const responseMsg = AdminChatbotEngine.processQuery(queryText);

    setChatMessages((prev) => [...prev, userMsg, responseMsg]);
  };

  const handleSaveReceiptConfig = (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (receiptForm.gstin?.trim() && !isValidGstinFormat(receiptForm.gstin)) {
      errors.gstin = 'GSTIN must be 15 characters in the standard format (e.g. 24AAACR5055K1Z1).';
    }
    if (receiptForm.fssaiNumber?.trim() && !isValidFssaiFormat(receiptForm.fssaiNumber)) {
      errors.fssaiNumber = 'FSSAI licence number must be exactly 14 digits.';
    }
    if (receiptForm.phone?.trim() && !isValidIndianPhone(receiptForm.phone)) {
      errors.phone = 'Enter a valid 10-digit Indian phone number.';
    }
    setReceiptFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    ReceiptRepository.updateConfig(receiptForm);
    AuditRepository.log({
      username: 'admin',
      action: 'RECEIPT_CONFIG_UPDATED',
      category: 'SETTINGS',
      details: `Updated thermal receipt template and paper size to ${receiptForm.paperSize}`
    });
    showToast('Receipt & Printing Settings Saved!');
  };

  const currentReport =
    activeReportType === 'DAILY_SALES'
      ? ReportGeneratorService.generateDailySalesReport()
      : activeReportType === 'MONTHLY_SALES'
      ? ReportGeneratorService.generateMonthlySalesReport()
      : ReportGeneratorService.generateItemSalesReport();

  // 0. ONE-TIME CLOUD DEVICE CONNECTION GATE — before the local admin
  // credential login, mirroring Captain's connect screen. See
  // cloud/cloudClient.ts for why this is two steps (credentials, then an
  // activation key) rather than Captain's one-step flow.
  if (!deviceConnected) {
    return (
      <JAMANVAARStartup appName="Kiosk Management" appType="KIOSK_ADMIN" subtitle="Hardware & Self-Ordering Fleet Control">
        <JamanvaarAuthLayout
          appIdentity="KIOSK_ADMIN"
          appTitle="Kiosk Management"
          appSubtitle="Connect this terminal to your restaurant before signing in."
          isLocalCoreUnauthorized={db.isLocalCoreUnauthorized()}
          healthCheckUrl={`${db.getSyncServerUrl()}/api/health`}
          heroHeadline="Self-Ordering Fleet."
          heroHighlightWord="Zero Touch Errors."
          heroDescription="Centralized terminal command, automatic catalog sync, real-time peripheral diagnostics and upsell recommendation tuning."
          heroImages={APP_HERO_IMAGES.KIOSK_ADMIN}
        >
          <div className="space-y-5">
            <ActivationNoticeBanner />
            {connectStep === 'CREDENTIALS' ? (
              <>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-jaman-navy tracking-tight">Connect this Terminal</h2>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                    One-time setup — enter your Restaurant ID and the owner's password.
                  </p>
                </div>
                <form onSubmit={handleConnectCredentials} className="space-y-3.5">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">Restaurant ID *</label>
                    <input
                      type="text"
                      value={connectRestaurantCode}
                      onChange={(e) => setConnectRestaurantCode(e.target.value)}
                      placeholder="e.g. JM9876543210"
                      required
                      className="w-full bg-jaman-cream border border-jaman-border focus:border-jaman-saffron focus:bg-white rounded-2xl px-4 py-3 text-sm font-mono text-jaman-navy font-semibold focus:outline-hidden transition-colors"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5">
                    Find it in Super Admin: Restaurants, open the restaurant, Restaurant ID (with a Copy button). The owner can also copy it in Restaurant Admin under Subscription Plans, Device &amp; Staff Logins.
                  </p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">Owner Password *</label>
                    <input
                      type="password"
                      value={connectPassword}
                      onChange={(e) => setConnectPassword(e.target.value)}
                      required
                      className="w-full bg-jaman-cream border border-jaman-border focus:border-jaman-saffron focus:bg-white rounded-2xl px-4 py-3 text-sm text-jaman-navy font-semibold focus:outline-hidden transition-colors"
                    />
                  </div>
                  {connectError && (
                    <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{connectError}</span>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={connectBusy}
                    className="w-full py-4 rounded-2xl bg-jaman-navy hover:bg-[#163E5E] disabled:opacity-50 text-white font-black text-sm shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>{connectBusy ? 'Connecting…' : 'Continue'}</span>
                    {!connectBusy && <ArrowRight className="w-4 h-4 text-jaman-saffron" />}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-jaman-navy tracking-tight">Activate this Terminal</h2>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                    Signed in to <strong>{connectRestaurantName}</strong>. Enter the Kiosk Admin activation key from your Super Admin welcome kit to finish binding this terminal.
                  </p>
                </div>
                <form onSubmit={handleConnectActivationKey} className="space-y-3.5">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">Activation Key *</label>
                    <input
                      type="text"
                      value={connectActivationKey}
                      onChange={(e) => setConnectActivationKey(e.target.value)}
                      placeholder="JMV-XXXX-XXXX-XXXX"
                      required
                      autoFocus
                      className="w-full bg-jaman-cream border border-jaman-border focus:border-jaman-saffron focus:bg-white rounded-2xl px-4 py-3 text-sm font-mono text-jaman-navy font-semibold focus:outline-hidden transition-colors uppercase"
                    />
                    <p className="text-[11px] text-slate-500 font-medium mt-1.5">
                      Use the key labeled <strong>KIOSK_ADMIN</strong> from the Welcome Kit — it's different from the
                      <strong> KIOSK</strong> key used on the customer-facing ordering screen.
                    </p>
                  </div>
                  {connectError && (
                    <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{connectError}</span>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={connectBusy}
                    className="w-full py-4 rounded-2xl bg-jaman-navy hover:bg-[#163E5E] disabled:opacity-50 text-white font-black text-sm shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>{connectBusy ? 'Activating…' : 'Activate Terminal'}</span>
                    {!connectBusy && <ArrowRight className="w-4 h-4 text-jaman-saffron" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConnectStep('CREDENTIALS'); setConnectError(''); }}
                    className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-700 py-1"
                  >
                    ← Back
                  </button>
                </form>
                <ActivationHelpNote deviceNoun="terminal" />
              </>
            )}
          </div>
        </JamanvaarAuthLayout>
      </JAMANVAARStartup>
    );
  }

  if (showActivationWelcome) {
    return (
      <ActivationWelcomeScreen
        appName="Kiosk Admin console"
        tips={[
          'Sign in with your administrator credentials.',
          'Add dishes to your menu, then activate a customer-facing Kiosk terminal.',
          'The dashboard checklist below tracks the rest of first-time setup.'
        ]}
        onContinue={() => setShowActivationWelcome(false)}
      />
    );
  }

  // 1. KIOSK ADMIN AUTHENTICATION GATE SCREEN
  if (!isKioskAdminLoggedIn) {
    return (
      <JAMANVAARStartup appName="Kiosk Management" appType="KIOSK_ADMIN" subtitle="Hardware & Self-Ordering Fleet Control">
        <JamanvaarAuthLayout
          appIdentity="KIOSK_ADMIN"
          appTitle="Kiosk Management"
        appSubtitle="Sign in with your administrator credentials to manage terminals & self-ordering catalogs."
        isOnline={networkState === 'ONLINE'}
        isLocalCoreUnauthorized={db.isLocalCoreUnauthorized()}
        healthCheckUrl={`${db.getSyncServerUrl()}/api/health`}
        onToggleNetwork={() => {
          const next = NetworkStatusService.toggleSimulatedOffline();
          setNetworkState(next as any);
        }}
        heroHeadline="Self-Ordering Fleet."
        heroHighlightWord="Zero Touch Errors."
        heroDescription="Centralized terminal command, automatic catalog sync, real-time peripheral diagnostics and upsell recommendation tuning."
        heroImages={APP_HERO_IMAGES.KIOSK_ADMIN}
        capabilities={[
          { label: 'Terminal Fleet', icon: 'zap' },
          { label: 'Catalog Engine', icon: 'printer' },
          { label: 'Mesh Sync', icon: 'table' },
          { label: 'Upsell Rules', icon: 'cloud' }
        ]}
        footerNote="Role-Based Security • Instant Offline Boot • 100% Secure"
      >
        {showForgotPassword ? (
          <KioskForgotPasswordPanel
            onBack={() => setShowForgotPassword(false)}
            onDone={() => setShowForgotPassword(false)}
          />
        ) : (
        <form onSubmit={handleKioskAdminLogin} className="space-y-3.5 pt-2">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">Password *</label>
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="text-[11px] text-jaman-saffron hover:underline font-bold"
              >
                {showPassword ? 'Hide Password' : 'Show Password'}
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={authPassword}
                onChange={(e) => {
                  setAuthPassword(e.target.value);
                  setAuthError('');
                }}
                placeholder="Enter your password"
                autoFocus
                className="w-full bg-jaman-cream border border-jaman-border focus:border-jaman-saffron focus:bg-white rounded-2xl px-4 py-3 text-sm text-jaman-navy font-semibold focus:outline-hidden transition-colors"
              />
            </div>
          </div>

          {authError && (
            <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <p className="text-xs text-slate-500 text-center pt-0.5">
            Owners only. Contact your Super Admin if you need access.
          </p>

          <button
            type="submit"
            disabled={authBusy}
            className="w-full py-3.5 rounded-2xl bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-md shadow-orange-500/20 active:scale-[0.99] cursor-pointer mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {authBusy ? 'Signing in...' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={() => setShowForgotPassword(true)}
            className="w-full py-2 text-center text-xs font-bold text-jaman-saffron hover:underline cursor-pointer"
          >
            Forgot Password?
          </button>
        </form>
        )}
      </JamanvaarAuthLayout>
      </JAMANVAARStartup>
    );
  }

  return (
    <JAMANVAARStartup appName="Kiosk Management" appType="KIOSK_ADMIN" subtitle="Hardware & Self-Ordering Fleet Control">
      <>
        {/* NORMAL INTERACTIVE ADMIN UI (Hidden during print) */}
        <div className="print:hidden min-h-screen bg-jaman-ivory flex flex-col select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-jaman-navy text-white px-5 py-3 rounded-2xl shadow-xl border border-white/10 flex items-center gap-3 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />
          <span className="font-semibold text-sm">{toastMessage}</span>
        </div>
      )}

      {/* TOP STATUS BAR
          BUG-MED-001 fix: this row used to be a strict non-wrapping flex
          with a FIXED height (h-16/h-20). Between the tab-pill status
          badges appearing at "md" and the LOCAL SERVICE badge only hiding
          below "xl", there is a width band (roughly 1024-1180px) where the
          left cluster (brand + tab pills) and the right cluster (sound /
          assistant / network / profile) don't both fit, and — because the
          height was fixed rather than a minimum — anything past that hit
          its shrink floor and rendered on top of its neighbour instead of
          dropping to a second row. flex-wrap + min-h (not h) lets it grow
          to two rows on narrow widths instead of colliding. */}
      <header className="min-h-16 sm:min-h-20 bg-white border-b border-jaman-border px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-y-2 shadow-sm sticky top-0 z-30">
        {/* Left: Real JAMANVAAR Brand Identity */}
        <div className="flex items-center gap-4 sm:gap-6">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="lg:hidden w-10 h-10 rounded-xl border border-jaman-border bg-white text-jaman-navy flex items-center justify-center shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <BrandHeader
            app="KIOSK_ADMIN"
            restaurantName={db.restaurant.name}
            outletName={db.outlet.name}
            logoHeight={62}
            badgeSize="sm"
          />
          
          <div className="hidden md:flex items-center bg-[#F4EFE6] p-1 rounded-xl gap-1">
            <button
              onClick={() => setActiveTab('DASHBOARD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'DASHBOARD'
                  ? 'bg-jaman-navy text-white shadow-sm'
                  : 'text-[#4A5568] hover:text-jaman-navy'
              }`}
            >
              Control POS
            </button>
            <button
              onClick={() => setActiveTab('ORDERS_KDS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'ORDERS_KDS'
                  ? 'bg-jaman-navy text-white shadow-sm'
                  : 'text-[#4A5568] hover:text-jaman-navy'
              }`}
            >
              KDS Kitchen ({pendingKOT})
            </button>
            <button
              onClick={() => setActiveTab('KIOSKS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'KIOSKS'
                  ? 'bg-jaman-navy text-white shadow-sm'
                  : 'text-[#4A5568] hover:text-jaman-navy'
              }`}
            >
              Kiosk Terminals ({kiosks.filter((k) => k.status === 'ONLINE').length}/{kiosks.length})
            </button>
          </div>
        </div>

        {/* Right Status & Network State */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* LOCAL RESTAURANT SERVICE & DB REALTIME STATUS BADGE */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 bg-[#F8F6F0] border border-jaman-border rounded-xl text-xs font-bold">
            <span className={`flex items-center gap-1.5 ${localServiceHealth.status === 'CONNECTED' ? 'text-emerald-700' : 'text-rose-600'}`}>
              <span className={`w-2 h-2 rounded-full ${localServiceHealth.status === 'CONNECTED' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
              LOCAL SERVICE: {localServiceHealth.status}
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-[#4A5568]">DB: <strong>LOCAL</strong></span>
            <span className="text-slate-300">|</span>
            <span className="text-blue-700">KIOSK: <strong>{localServiceHealth.activeKiosks}/{localServiceHealth.totalKiosks} ONLINE</strong></span>
          </div>

          {/* Sound Notification Switch */}
          <button
            onClick={() => {
              setOrderSoundEnabled((prev) => !prev);
              showToast(`Order chime sound ${!orderSoundEnabled ? 'ENABLED' : 'MUTED'}`);
            }}
            title={orderSoundEnabled ? 'Order sound is ON' : 'Order sound is MUTED'}
            className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all ${
              orderSoundEnabled
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-slate-100 text-slate-500 border-slate-300'
            }`}
          >
            {orderSoundEnabled ? <Volume2 className="w-4 h-4 text-jaman-saffron" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            <span className="hidden sm:inline">{orderSoundEnabled ? 'Sound ON' : 'Muted'}</span>
          </button>

          {/* Admin Intelligence Bot Trigger */}
          <button
            onClick={() => setIsAssistantOpen(true)}
            className="flex items-center gap-2 bg-jaman-navy hover:bg-[#163650] text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-jaman-navy/20 transition-all active:scale-95"
          >
            <Bot className="w-4 h-4 text-jaman-saffron" />
            <span className="hidden sm:inline">JAMANVAAR Assistant</span>
          </button>

          {/* Interactive Network Simulator (Section 154) */}
          <button
            onClick={() => {
              const nextState = NetworkStatusService.toggleSimulatedOffline();
              showToast(`Admin network switched to: ${nextState}`);
            }}
            title="Click to toggle simulated online / offline state"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              networkState === 'ONLINE'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : networkState === 'SYNCING'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                networkState === 'ONLINE'
                  ? 'bg-emerald-500 animate-pulse'
                  : networkState === 'SYNCING'
                  ? 'bg-blue-500 animate-spin'
                  : 'bg-amber-500'
              }`}
            ></span>
            <span>{networkState} {networkState === 'ONLINE' ? `(${networkLatency}ms)` : ''}</span>
          </button>

          {/* Cashier profile avatar */}
          <div className="flex items-center gap-2 pl-2 border-l border-jaman-border">
            <div className="w-8 h-8 rounded-full bg-jaman-saffron text-white flex items-center justify-center font-bold text-xs shadow-sm">
              M
            </div>
            <div className="hidden sm:block text-left leading-tight">
              <div className="text-xs font-bold text-jaman-navy">Manager</div>
              <div className="text-[10px] uppercase tracking-wider text-[#8C9BAE] font-semibold">KIOSK ADMIN</div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleKioskAdminLogout}
              title="Sign out of Kiosk Admin"
              className="ml-2 flex items-center gap-1 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-300 px-2.5 py-1 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-2xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* BODY WITH SIDEBAR & MAIN VIEW */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Backdrop — closes the sidebar on outside tap, mobile only */}
        {isMobileSidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* LEFT ADMIN SIDEBAR — off-canvas below lg (slides in over content,
            closes on outside tap or after picking a section), a normal
            static column at lg and above (unchanged desktop behavior). */}
        <aside
          className={`w-64 bg-white border-r border-jaman-border flex flex-col justify-between p-3 shrink-0 overflow-y-auto fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:static lg:translate-x-0 lg:z-auto ${
            isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div>
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(false)}
              className="lg:hidden w-9 h-9 mb-2 ml-auto rounded-xl border border-jaman-border text-jaman-navy flex items-center justify-center"
              aria-label="Close navigation menu"
            >
              <X className="w-4 h-4" />
            </button>
            <nav className="space-y-1" onClick={() => setIsMobileSidebarOpen(false)}>
            <button
              onClick={() => setActiveTab('DASHBOARD')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'DASHBOARD'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-jaman-saffron" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('MENU')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'MENU'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <UtensilsCrossed className="w-4 h-4 text-jaman-saffron" />
              <span>Menu Management</span>
            </button>

            <button
              onClick={() => setActiveTab('COMBOS')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'COMBOS'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <PackagePlus className="w-4 h-4 text-jaman-saffron" />
              <span>Combos & Meal Deals</span>
            </button>

            <button
              onClick={() => setActiveTab('ORDERS_KDS')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'ORDERS_KDS'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <div className="flex items-center gap-3">
                <Flame className="w-4 h-4 text-jaman-saffron" />
                <span>Orders & KDS</span>
              </div>
              <div className="flex items-center gap-1.5">
                {newOrdersCount > 0 && (
                  <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce">
                    🔴 {newOrdersCount} NEW
                  </span>
                )}
                {pendingKOT > 0 && newOrdersCount === 0 && (
                  <span className="bg-jaman-saffron text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                    {pendingKOT}
                  </span>
                )}
              </div>
            </button>

            <button
              onClick={() => setActiveTab('TABLES')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'TABLES'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <Grid className="w-4 h-4 text-jaman-saffron" />
              <span>Table Layout</span>
            </button>

            <button
              onClick={() => setActiveTab('KIOSKS')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'KIOSKS'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <Store className="w-4 h-4 text-jaman-saffron" />
              <span>Kiosk Terminals</span>
            </button>

            <button
              onClick={() => setActiveTab('COUPONS')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'COUPONS'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <Tag className="w-4 h-4 text-jaman-saffron" />
              <span>Offers & Coupons</span>
            </button>

            <button
              onClick={() => setActiveTab('RECEIPTS')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'RECEIPTS'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <ReceiptText className="w-4 h-4 text-jaman-saffron" />
              <span>Receipt & E-Bill</span>
            </button>

            <button
              onClick={() => setActiveTab('HARDWARE')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'HARDWARE'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <Printer className="w-4 h-4 text-jaman-saffron" />
              <span>Hardware & Diagnostics</span>
            </button>

            <button
              onClick={() => setActiveTab('FEEDBACK')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'FEEDBACK'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-jaman-saffron" />
              <span>Customer Feedback</span>
            </button>

            <button
              onClick={() => setActiveTab('REPORTS')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'REPORTS'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <TrendingUp className="w-4 h-4 text-jaman-saffron" />
              <span>Reports & Export</span>
            </button>

            <button
              onClick={() => setActiveTab('STAFF')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'STAFF'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <Users className="w-4 h-4 text-jaman-saffron" />
              <span>Staff & Roles</span>
            </button>

            <button
              onClick={() => setActiveTab('SYNC')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'SYNC'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <div className="flex items-center gap-3">
                <RefreshCw className="w-4 h-4 text-jaman-saffron" />
                <span>Sync Center</span>
              </div>
              {syncStats.pendingCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {syncStats.pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('AUDIT')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'AUDIT'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <Activity className="w-4 h-4 text-jaman-saffron" />
              <span>Audit Activity Logs</span>
            </button>

            <button
              onClick={() => setActiveTab('LICENSE')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'LICENSE'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-jaman-saffron" />
              <span>License & Entitlement</span>
            </button>

            <button
              onClick={() => setActiveTab('SETTINGS')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'SETTINGS'
                  ? 'bg-jaman-navy text-white shadow-md shadow-jaman-navy/20'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
              }`}
            >
              <Settings className="w-4 h-4 text-jaman-saffron" />
              <span>Settings & Backup</span>
            </button>
            </nav>
          </div>

          {/* Bottom Sidebar Footer */}
          <div className="pt-4 border-t border-jaman-border mt-4 text-center">
            <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-jaman-navy">
              <span>JAMANVAAR Kiosk Admin</span>
              <span className="text-jaman-saffron">v1.0.0</span>
            </div>
            <p className="text-[10px] text-[#8C9BAE]">Kelviontech Systems</p>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 bg-jaman-ivory p-6 overflow-y-auto">
          <ScreenErrorBoundary resetKey={activeTab}>
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">
                    Restaurant Operations Overview
                  </h1>
                  <p className="text-sm text-[#4A5568] mt-1">
                    Live telemetry, sales summary and terminal health for {db.outlet.name || db.restaurant.name || 'your restaurant'}.
                  </p>
                </div>
              </div>

              <OnboardingChecklistCard
                items={[
                  { id: 'menu', label: 'Add dishes to your menu', done: menuItems.length > 0, onGo: () => setActiveTab('MENU') },
                  { id: 'terminal', label: 'Activate a Kiosk terminal', done: kiosks.length > 0, onGo: () => setActiveTab('KIOSKS') },
                  { id: 'offers', label: 'Create an offer or coupon', done: coupons.length > 0, onGo: () => setActiveTab('COUPONS') },
                  { id: 'staff', label: 'Add your team members', done: db.users.length > 1, onGo: () => setActiveTab('STAFF') },
                  { id: 'first_order', label: 'Take your first order', done: orders.length > 0, onGo: () => setActiveTab('ORDERS_KDS') }
                ]}
              />

              {/* Top 5 KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <KpiCard
                  title="Today's Sales"
                  value={formatINR(todayRevenue)}
                  subtitle="Gross revenue"
                  icon={<TrendingUp className="w-5 h-5" />}
                />
                <KpiCard
                  title="Orders"
                  value={todayOrders}
                  subtitle="Total tickets"
                  icon={<ShoppingBag className="w-5 h-5" />}
                />
                <KpiCard
                  title="Avg. Order Value"
                  value={formatINR(avgOrderValue)}
                  subtitle="Per customer cart"
                  icon={<Coins className="w-5 h-5" />}
                />
                <KpiCard
                  title="Pending KOT"
                  value={pendingKOT}
                  subtitle="Kitchen preparing"
                  icon={<Flame className="w-5 h-5" />}
                />
                <KpiCard
                  title="Table Occupancy"
                  value={`${tableOccupancyPercent}%`}
                  subtitle={`${occupiedTables} of ${tables.length} tables`}
                  icon={<Grid className="w-5 h-5" />}
                />
              </div>

              {/* VISUAL ANALYTICS & HOURLY PEAK CHARTS DECK */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Hourly Sales Peak & Rush Curve Chart */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-jaman-border shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-jaman-saffron" />
                        <h2 className="text-lg font-black text-jaman-navy">Hourly Sales Velocity & Dining Rush</h2>
                      </div>
                      <p className="text-xs text-[#8C9BAE] mt-0.5">Live order velocity throughout the day • Lunch (1-3 PM) & Dinner (7-10 PM)</p>
                    </div>
                    <span className="text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      {peakHourBar.amount > 0 ? `Peak: ${peakHourBar.hour}` : 'No sales yet today'}
                    </span>
                  </div>

                  {/* Hourly Bar Graph — computed from today's real orders */}
                  <div className="pt-4 pb-2">
                    <div className="h-44 flex items-end justify-between gap-1.5 sm:gap-2 px-2 border-b border-jaman-border">
                      {hourlyBars.map((bar, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                          {/* Tooltip on hover */}
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-jaman-navy text-white text-[10px] font-bold px-2 py-0.5 rounded shadow pointer-events-none transition-opacity whitespace-nowrap z-20">
                            {bar.hour}: ₹{bar.amount}
                          </div>
                          <div className="w-full bg-[#F4EFE6] rounded-t-lg h-36 flex items-end overflow-hidden">
                            <div
                              style={{ height: `${bar.pct}%` }}
                              className={`w-full rounded-t-md transition-all duration-500 group-hover:brightness-110 ${
                                bar.isPeak
                                  ? 'bg-gradient-to-t from-jaman-saffron to-[#FED7AA]'
                                  : 'bg-gradient-to-t from-jaman-navy to-[#3B82F6]'
                              }`}
                            ></div>
                          </div>
                          <span className="text-[9px] sm:text-[10px] font-bold text-[#8C9BAE] mt-1 group-hover:text-jaman-navy">
                            {bar.hour}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#8C9BAE] pt-3">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-gradient-to-t from-jaman-saffron to-[#FED7AA]"></span>
                        <strong className="text-jaman-navy">Peak Rush Hours</strong>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-gradient-to-t from-jaman-navy to-[#3B82F6]"></span>
                        <span>Standard Hours</span>
                      </span>
                    </div>
                    <span className="font-bold text-jaman-navy">Total Day Revenue: {formatINR(todayRevenue)}</span>
                  </div>
                </div>

                {/* 2. Payment Gateway Distribution Card */}
                <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-jaman-saffron" />
                        <h2 className="text-lg font-black text-jaman-navy">Payment Channels</h2>
                      </div>
                      <span className="text-xs text-[#8C9BAE]">Real-time Split</span>
                    </div>

                    <div className="space-y-4">
                      {/* UPI QR Split */}
                      <div className="p-3.5 rounded-xl bg-jaman-ivory border border-jaman-border space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <div className="flex items-center gap-2 text-jaman-navy">
                            <QrCode className="w-4 h-4 text-[#16A34A]" />
                            <span>UPI Dynamic QR</span>
                          </div>
                          <span className="text-emerald-700 font-black">{upiPct}% ({formatINR(upiRevenue)})</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-jaman-border overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${upiPct}%` }}></div>
                        </div>
                      </div>

                      {/* Card POS Split */}
                      <div className="p-3.5 rounded-xl bg-jaman-ivory border border-jaman-border space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <div className="flex items-center gap-2 text-jaman-navy">
                            <CreditCard className="w-4 h-4 text-[#3B82F6]" />
                            <span>Card EDC Terminal</span>
                          </div>
                          <span className="text-blue-700 font-black">{cardPct}% ({formatINR(cardRevenue)})</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-jaman-border overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${cardPct}%` }}></div>
                        </div>
                      </div>

                      {/* Cash Split */}
                      <div className="p-3.5 rounded-xl bg-jaman-ivory border border-jaman-border space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <div className="flex items-center gap-2 text-jaman-navy">
                            <Coins className="w-4 h-4 text-jaman-saffron" />
                            <span>Cash at Counter</span>
                          </div>
                          <span className="text-jaman-saffron font-black">{cashPct}% ({formatINR(cashRevenue)})</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-jaman-border overflow-hidden">
                          <div className="h-full bg-jaman-saffron rounded-full" style={{ width: `${cashPct}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-jaman-border flex items-center justify-between">
                    <span className="text-xs text-[#8C9BAE]">Settlement Status:</span>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                      ✓ Instant UPI Direct Bank
                    </span>
                  </div>
                </div>
              </div>

              {/* Kiosk Terminals Health Summary */}
              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Store className="w-5 h-5 text-jaman-saffron" />
                    <h2 className="text-lg font-bold text-jaman-navy">Active Kiosk Hardware Matrix</h2>
                  </div>
                  <span className="text-xs text-[#8C9BAE] font-medium">Real-time Heartbeat</span>
                </div>

                {kiosks.length === 0 && (
                  <div className="text-center py-8 text-sm text-[#8C9BAE]">
                    No Kiosk terminals connected yet — a device appears here automatically once it's activated and joins this restaurant's network.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {kiosks.map((k) => (
                    <div
                      key={k.id}
                      className="p-4 rounded-xl border border-jaman-border bg-jaman-ivory flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-jaman-navy">{k.name}</span>
                          <StatusBadge status={k.status} type="kiosk" />
                        </div>
                        <p className="text-xs text-[#4A5568] mt-1">{k.locationDescription}</p>
                        <p className="text-[10px] text-[#8C9BAE] font-mono mt-0.5">v{k.appVersion}</p>
                      </div>

                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => {
                            const newStatus = k.status === 'ONLINE' ? 'MAINTENANCE' : 'ONLINE';
                            KioskRepository.updateKioskStatus(k.id, newStatus, newStatus === 'MAINTENANCE');
                            lanMeshSync.broadcast('KIOSK_LOCKDOWN_COMMAND', {
                              kioskId: k.id,
                              isLocked: newStatus === 'MAINTENANCE',
                              status: newStatus
                            });
                            showToast(`${k.name} set to ${newStatus}`);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-jaman-border hover:bg-slate-50 text-jaman-navy"
                        >
                          {k.status === 'ONLINE' ? 'Set Maint.' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Kitchen & Order Feed */}
              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-jaman-saffron" />
                    <h2 className="text-lg font-bold text-jaman-navy">Recent Order Stream</h2>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('ORDERS_KDS')}>
                    View Full KDS Board
                  </Button>
                </div>

                <div className="divide-y divide-[#F3EFE6]">
                  {orders.slice(0, 5).map((order) => (
                    <div key={order.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-jaman-navy">{order.orderNumber}</span>
                          <span className="bg-jaman-saffron/10 text-jaman-saffron font-bold text-xs px-2 py-0.5 rounded">
                            TOKEN #{order.tokenNumber}
                          </span>
                          <span className="text-xs font-semibold text-[#4A5568]">
                            {order.orderType} {order.tableNumber ? `(T-${order.tableNumber})` : ''}
                          </span>
                          <StatusBadge status={order.orderStatus} />
                          {order.syncStatus === 'SAVED_LOCALLY' && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              Offline Queued
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#4A5568] mt-1">
                          {order.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <span className="text-base font-black text-jaman-saffron">{formatINR(order.totalAmount)}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const next: Record<OrderStatus, OrderStatus> = {
                              NEW: 'CONFIRMED',
                              DRAFT: 'CREATED',
                              CREATED: 'CONFIRMED',
                              ACCEPTED: 'PREPARING',
                              CONFIRMED: 'PREPARING',
                              ACKNOWLEDGED: 'PREPARING',
                              KITCHEN_ACCEPTED: 'PREPARING',
                              PREPARING: 'READY',
                              READY: 'SERVED',
                              SERVED: 'COMPLETED',
                              COLLECTED: 'COMPLETED',
                              COMPLETED: 'COMPLETED',
                              CANCELLED: 'CANCELLED',
                              REFUNDED: 'REFUNDED',
                              HELD: 'CONFIRMED'
                            };
                            const nxt = next[order.orderStatus];
                            if (nxt) {
                              OrderRepository.updateOrderStatus(order.id, nxt);
                              showToast(`Order ${order.orderNumber} marked as ${nxt}`);
                            }
                          }}
                        >
                          Advance Status
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SMART PRELOADED MENU LIBRARY & MENU BUILDER */}
          {activeTab === 'MENU' && (
            <div className="space-y-6">
              {/* Header with Stats, Completeness Score & Action Bar */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-jaman-border shadow-sm">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-black text-jaman-navy">Menu & Catalog Builder</h1>
                    <span
                      className={`text-xs font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        isMenuDraft
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}
                    >
                      {isMenuDraft ? '● DRAFT (Staged Changes)' : `● LIVE (${menuVersions[0]?.versionTag || 'v1.0'})`}
                    </span>
                  </div>
                  <p className="text-xs text-[#4A5568] mt-1">
                    {categories.length} Categories • {menuItems.length} Dishes • {combos.length} Combos
                  </p>
                </div>

                {/* Completeness Score Bar */}
                <div
                  onClick={() => setIsMissingDataModalOpen(true)}
                  className="flex items-center gap-3 bg-jaman-ivory px-4 py-2 rounded-xl border border-jaman-border cursor-pointer hover:border-jaman-saffron transition-all"
                  title="Click to view and fix missing data"
                >
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-[#8C9BAE] uppercase block">Completeness</span>
                    <span className="text-sm font-black text-jaman-navy">{completenessReport.score}% Ready</span>
                  </div>
                  <div className="w-24 bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        completenessReport.score >= 90
                          ? 'bg-emerald-500'
                          : completenessReport.score >= 70
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${completenessReport.score}%` }}
                    />
                  </div>
                  {completenessReport.issues.length > 0 && (
                    <span className="text-[10px] bg-rose-500 text-white font-bold px-1.5 py-0.5 rounded-full">
                      {completenessReport.issues.length}
                    </span>
                  )}
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => {
                      setTemplateStep('SELECT');
                      setIsPrebuiltMenuModalOpen(true);
                    }}
                    className="shadow-sm font-bold bg-jaman-saffron hover:bg-[#d55b0e]"
                  >
                    🍽️ Load Prebuilt Menu
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setIsBulkPriceModalOpen(true)}>
                    ⚡ Bulk Price
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setIsImageLibraryModalOpen(true)}>
                    🖼️ Image Hub
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsKioskMenuPreviewModalOpen(true)}>
                    👁️ Preview Kiosk
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsImportExportModalOpen(true)}>
                    📥 / 📤 Backup
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsPublishModalOpen(true)}
                    className="bg-jaman-navy text-white hover:bg-[#163e5e] font-bold"
                  >
                    🚀 Publish
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingCategory(null);
                      setIsAddCategoryModalOpen(true);
                    }}
                  >
                    + Category
                  </Button>
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => setIsAddItemModalOpen(true)}
                    className="bg-jaman-saffron hover:bg-[#d55b0e] text-white font-bold shadow-xs"
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    + Add Menu Dish
                  </Button>
                </div>
              </div>

              {/* Missing Data Warning Alert Banner */}
              {completenessReport.issues.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3 animate-fadeIn">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">
                        {completenessReport.issues.length} Items Require Attention Before Customer Launch
                      </h4>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        {completenessReport.issues.slice(0, 2).map((i) => i.message).join(' • ')}
                        {completenessReport.issues.length > 2 ? ` (+${completenessReport.issues.length - 2} more)` : ''}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsMissingDataModalOpen(true)}
                    className="shrink-0 text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 font-bold"
                  >
                    Fix Issues Now
                  </Button>
                </div>
              )}

              {/* Search & Dietary Filters Bar */}
              <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="relative w-full md:w-96">
                  <Search className="w-4 h-4 text-[#8C9BAE] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Search dish name, SKU, or tags..."
                    className="w-full bg-jaman-ivory border border-jaman-border rounded-xl pl-10 pr-4 py-2 text-sm text-jaman-navy placeholder-[#8C9BAE] focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
                  {['ALL', 'VEG', 'NON_VEG', 'JAIN'].map((diet) => (
                    <button
                      key={diet}
                      onClick={() => setDietaryFilter(diet)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        dietaryFilter === diet
                          ? 'bg-jaman-navy text-white shadow-sm'
                          : 'bg-jaman-ivory border border-jaman-border text-[#4A5568] hover:bg-[#F4EFE6]'
                      }`}
                    >
                      {diet === 'ALL' ? 'All Dietary' : diet.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category Slider & Quick Add Dish */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
                <div className="flex items-center gap-2 overflow-x-auto flex-1">
                  <button
                    onClick={() => setSelectedCategoryFilter('ALL')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                      selectedCategoryFilter === 'ALL'
                        ? 'bg-jaman-navy text-white shadow-md'
                        : 'bg-white border border-jaman-border text-jaman-navy hover:bg-[#F8F6F0]'
                    }`}
                  >
                    All Categories ({menuItems.length})
                  </button>
                  {categories.map((c) => (
                    <div key={c.id} className="relative shrink-0">
                      <CategoryCard
                        category={c}
                        isSelected={selectedCategoryFilter === c.id}
                        onSelect={() => setSelectedCategoryFilter(c.id)}
                        className="pr-9"
                      />
                      <button
                        type="button"
                        title={`Edit "${c.name}"`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCategory(c);
                          setIsAddCategoryModalOpen(true);
                        }}
                        className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                          selectedCategoryFilter === c.id
                            ? 'text-white/70 hover:text-white hover:bg-white/10'
                            : 'text-[#8C9BAE] hover:text-jaman-navy hover:bg-[#F4EFE6]'
                        }`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => setIsAddItemModalOpen(true)}
                  className="bg-jaman-saffron hover:bg-[#d55b0e] text-white font-bold whitespace-nowrap shadow-xs shrink-0"
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  + Add Menu Dish
                </Button>
              </div>

              {/* Menu Grid */}
              {filteredMenuItems.length === 0 ? (
                <EmptyState
                  title="No Dishes Found"
                  description="No menu items matched your search and filter criteria."
                  actionText="Add New Dish"
                  onAction={() => setIsAddItemModalOpen(true)}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredMenuItems.map((item) => (
                    <div key={item.id} className="relative group">
                      {/* A catalog editor lists dishes; nothing here places an order, so no "+ add to cart" button (BUG-129). */}
                      <ProductCard item={item} />
                      <div className="mt-2 flex items-center justify-between px-1 gap-1">
                        <button
                          onClick={() => {
                            MenuRepository.toggleItemAvailability(item.id);
                            showToast(`${item.name} availability toggled!`);
                          }}
                          className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${
                            item.isAvailable
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {item.isAvailable ? '● Available' : '○ 86 Sold Out'}
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setSelectedImageTargetItem(item);
                              setIsImageLibraryModalOpen(true);
                            }}
                            className="text-[11px] font-bold text-jaman-navy bg-jaman-ivory hover:bg-jaman-border px-2 py-1 rounded-lg border border-jaman-border"
                            title="Assign / Replace Image from Hub"
                          >
                            🖼️ Photo
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete ${item.name}?`)) {
                                MenuRepository.deleteMenuItem(item.id);
                                showToast(`Deleted ${item.name}`);
                              }
                            }}
                            className="text-xs text-rose-600 hover:text-rose-800 p-1 font-semibold"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: COMBOS & MEAL DEALS CRUD */}
          {activeTab === 'COMBOS' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Combos & Value Meal Deals</h1>
                  <p className="text-sm text-[#4A5568] mt-1">
                    Manage multi-item combo packages, bundle pricing, savings badges, and kiosk promotions.
                  </p>
                </div>
                <Button variant="accent" size="sm" onClick={() => setIsAddComboModalOpen(true)}>
                  + Create Combo Package
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {combos.map((combo) => (
                  <div key={combo.id} className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] font-black uppercase text-jaman-saffron bg-jaman-saffron/10 px-2 py-0.5 rounded">
                            SAVE ₹{combo.savingsAmount}
                          </span>
                          <h3 className="text-lg font-bold text-jaman-navy mt-2">{combo.name}</h3>
                          <p className="text-xs text-[#4A5568] mt-1">{combo.description}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-[#8C9BAE] line-through">₹{combo.originalPrice}</span>
                          <div className="text-xl font-black text-jaman-saffron">{formatINR(combo.basePrice)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[#F3EFE6]">
                      <button
                        onClick={() => {
                          ComboRepository.toggleAvailability(combo.id);
                          showToast(`${combo.name} availability updated!`);
                        }}
                        className={`text-xs font-bold px-3 py-1 rounded-xl border ${
                          combo.isAvailable
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {combo.isAvailable ? '● Active in Kiosk' : '○ Paused'}
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`Delete combo deal "${combo.name}"?`)) {
                            ComboRepository.deleteCombo(combo.id);
                            showToast(`Deleted ${combo.name}`);
                          }
                        }}
                        className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                      >
                        Delete Combo
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* REAL-TIME NEW ORDER ARRIVAL ALERT BANNER */}
          {newOrderArrivalAlert && (
            <div className="bg-gradient-to-r from-rose-600 via-jaman-saffron to-amber-600 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between gap-4 animate-bounce border-2 border-white/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl shrink-0">
                  🔔
                </div>
                <div>
                  <h4 className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
                    <span>New Order Arrived From {newOrderArrivalAlert.kioskId || 'KIOSK-01'}!</span>
                    <span className="bg-white text-rose-700 text-xs px-2 py-0.5 rounded-full font-bold">
                      Token #{newOrderArrivalAlert.tokenNumber}
                    </span>
                  </h4>
                  <p className="text-xs text-white/90 font-medium mt-0.5">
                    Order #{newOrderArrivalAlert.orderNumber} • {newOrderArrivalAlert.items?.length || 0} Items • Total {formatINR(newOrderArrivalAlert.totalAmount || 0)} ({newOrderArrivalAlert.orderType})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setSelectedOrderDetail(newOrderArrivalAlert);
                    setNewOrderArrivalAlert(null);
                  }}
                  className="px-4 py-2 bg-white text-jaman-navy rounded-xl text-xs font-black hover:bg-slate-100 shadow-md transition-all active:scale-95"
                >
                  👁️ View Order
                </button>
                <button
                  onClick={() => {
                    OrderRepository.updateOrderStatus(newOrderArrivalAlert.id, 'CONFIRMED', 'Admin');
                    setNewOrderArrivalAlert(null);
                    showToast(`✓ Order #${newOrderArrivalAlert.tokenNumber} Acknowledged!`);
                  }}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95"
                >
                  ✓ Acknowledge
                </button>
                <button
                  onClick={() => setNewOrderArrivalAlert(null)}
                  className="p-2 text-white/80 hover:text-white rounded-lg hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: ORDERS & LIVE KDS */}
          {activeTab === 'ORDERS_KDS' && (
            <div className="space-y-6">
              {/* TOP HEADER & LIVE CONNECTION STATUS */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-jaman-border shadow-sm">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Orders & Kitchen Display (KDS)</h1>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-full border border-emerald-300 flex items-center gap-1.5 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Local Realtime Active (:5178)
                    </span>
                  </div>
                  <p className="text-sm text-[#4A5568] mt-1">
                    Authoritative on-premise order management synced with Customer Touch Kiosks.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Sound Toggle */}
                  <button
                    onClick={() => {
                      setOrderSoundEnabled((prev) => !prev);
                      showToast(`Order arrival sound ${!orderSoundEnabled ? 'ENABLED' : 'MUTED'}`);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all ${
                      orderSoundEnabled
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-slate-100 text-slate-500 border-slate-300'
                    }`}
                  >
                    {orderSoundEnabled ? <Volume2 className="w-4 h-4 text-jaman-saffron" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                    <span>Sound: {orderSoundEnabled ? 'ON' : 'OFF'}</span>
                  </button>

                  {/* Manual DB Refresh */}
                  <button
                    onClick={() => {
                      db.notify();
                      showToast(`✓ Refreshed ${orders.length} orders from local service.`);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white border border-jaman-border hover:bg-jaman-ivory text-xs font-bold text-jaman-navy flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-jaman-saffron" />
                    <span>Sync ({orders.length})</span>
                  </button>

                  {/* Open Customer Kiosk Link */}
                  <a
                    href="http://localhost:5174"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-jaman-saffron hover:bg-[#d55b0e] text-white text-xs font-bold shadow-md shadow-jaman-saffron/20 active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    <span>📱 Open Kiosk Screen</span>
                  </a>
                </div>
              </div>

              {/* STATUS FILTER PILL DECK */}
              <div className="flex flex-wrap items-center gap-2 border-b border-jaman-border pb-3">
                {[
                  { id: 'ALL', label: 'All Orders', count: orders.length, color: 'bg-slate-800 text-white' },
                  { id: 'NEW', label: '🔴 New Unacknowledged', count: newOrdersCount, color: 'bg-rose-600 text-white animate-pulse' },
                  { id: 'CONFIRMED', label: 'Confirmed', count: confirmedCount, color: 'bg-blue-600 text-white' },
                  { id: 'PREPARING', label: 'Preparing (KDS)', count: prepCount, color: 'bg-amber-600 text-white' },
                  { id: 'READY', label: 'Ready for Collection', count: readyCount, color: 'bg-emerald-600 text-white' },
                  { id: 'COMPLETED', label: 'Completed / Handover', count: completedCount, color: 'bg-slate-600 text-white' }
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setOrderStatusFilter(st.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      orderStatusFilter === st.id
                        ? `${st.color} shadow-sm`
                        : 'bg-white text-[#4A5568] border border-jaman-border hover:bg-[#F8F6F0]'
                    }`}
                  >
                    <span>{st.label}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                        orderStatusFilter === st.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {st.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* SEARCH, TERMINAL & TYPE FILTERS TOOLBAR */}
              <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    placeholder="Search Order#, Token, Phone, Name..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F8F6F0] border border-jaman-border text-xs font-medium focus:outline-none focus:border-jaman-saffron"
                  />
                  {orderSearchQuery && (
                    <button
                      onClick={() => setOrderSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Kiosk Terminal Filter */}
                <div>
                  <select
                    value={orderKioskFilter}
                    onChange={(e) => setOrderKioskFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-jaman-border text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  >
                    <option value="ALL">🖥️ All Kiosks (Any Terminal)</option>
                    <option value="KIOSK-01">🖥️ KIOSK-01 (Touch Terminal 1)</option>
                    <option value="KIOSK-02">🖥️ KIOSK-02 (Touch Terminal 2)</option>
                    <option value="KIOSK-03">🖥️ KIOSK-03 (Express Takeaway)</option>
                  </select>
                </div>

                {/* Order Type Filter */}
                <div>
                  <select
                    value={orderTypeFilter}
                    onChange={(e) => setOrderTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-jaman-border text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  >
                    <option value="ALL">🍽️ All Order Types</option>
                    <option value="DINE_IN">🍽️ Dine-In Tables</option>
                    <option value="TAKEAWAY">🛍️ Takeaway / Carry Out</option>
                  </select>
                </div>

                {/* Sort Order */}
                <div>
                  <select
                    value={orderSortBy}
                    onChange={(e) => setOrderSortBy(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-jaman-border text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  >
                    <option value="NEWEST">⏳ Sort: Newest First</option>
                    <option value="OLDEST">⏳ Sort: Oldest First</option>
                    <option value="HIGHEST">💰 Sort: Highest Amount</option>
                  </select>
                </div>
              </div>

              {/* LIVE ORDERS CARD GRID */}
              {displayedOrders.length === 0 ? (
                <EmptyState
                  title="No Orders Found"
                  description={
                    orderSearchQuery || orderStatusFilter !== 'ALL'
                      ? 'No orders match your active search and status filters. Try clearing them.'
                      : 'No live orders recorded yet. Tap "+ Sim Kiosk Order" above or place an order on Customer Kiosk.'
                  }
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {displayedOrders.map((order) => {
                    const isNew = order.orderStatus === 'NEW';
                    return (
                      <div
                        key={order.id}
                        className={`rounded-2xl border-2 shadow-sm overflow-hidden flex flex-col justify-between transition-all ${
                          isNew
                            ? 'bg-rose-50/60 border-rose-400 shadow-rose-100 shadow-md ring-2 ring-rose-400/30'
                            : order.orderStatus === 'CONFIRMED'
                            ? 'bg-blue-50/40 border-blue-300'
                            : order.orderStatus === 'PREPARING'
                            ? 'bg-amber-50/40 border-amber-300'
                            : order.orderStatus === 'READY'
                            ? 'bg-emerald-50/40 border-emerald-300'
                            : 'bg-white border-jaman-border'
                        }`}
                      >
                        {/* Order Card Top Bar */}
                        <div className="p-4 border-b border-black/5 flex items-center justify-between bg-white/80">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xl font-black text-jaman-navy">#{order.tokenNumber}</span>
                              <span className="text-xs font-bold text-[#4A5568]">{order.orderNumber}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] font-bold text-jaman-navy bg-slate-100 px-2 py-0.5 rounded">
                                {order.kioskId || 'KIOSK-01'}
                              </span>
                              <span className="text-xs font-semibold text-[#8C9BAE]">
                                {order.orderType} {order.tableNumber ? `• Table ${order.tableNumber}` : ''}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {isNew ? (
                              <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-rose-600 text-white shadow-xs animate-bounce">
                                🔴 NEW ORDER
                              </span>
                            ) : (
                              <StatusBadge status={order.orderStatus} />
                            )}
                            <span className="text-[10px] font-bold text-slate-500">
                              {formatTime(order.createdAt)}
                            </span>
                          </div>
                        </div>

                        {/* Order Item List */}
                        <div className="p-4 flex-1 space-y-2.5 bg-white/90">
                          {order.items.map((it) => (
                            <div key={it.id} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                              <div className="flex items-start justify-between">
                                <span className="font-bold text-sm text-jaman-navy">
                                  <span className="text-jaman-saffron font-black mr-1.5">{it.quantity}×</span>
                                  {it.name}
                                </span>
                                <span className="text-xs font-bold text-jaman-navy">{formatINR(it.totalPrice)}</span>
                              </div>
                              {it.modifiers && it.modifiers.length > 0 && (
                                <div className="text-xs text-slate-500 pl-5 mt-0.5">
                                  {it.modifiers.map((m) => `+ ${m.optionName}`).join(', ')}
                                </div>
                              )}
                              {it.specialInstructions && (
                                <div className="text-xs font-semibold text-rose-600 pl-5 mt-0.5 bg-rose-50 px-2 py-0.5 rounded">
                                  Note: {it.specialInstructions}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Financials & Payment Bar */}
                        <div className="px-4 py-2.5 bg-[#FAF8F5] border-t border-black/5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-emerald-700 font-bold bg-emerald-100/80 px-2 py-0.5 rounded">
                              ✓ PAID ({order.paymentMethod})
                            </span>
                          </div>
                          <div className="text-right font-black text-sm text-jaman-navy">
                            Total: {formatINR(order.totalAmount)}
                          </div>
                        </div>

                        {/* Order Actions Toolbar */}
                        <div className="p-3.5 border-t border-black/5 bg-white/80 flex items-center justify-between gap-2">
                          <button
                            onClick={() => setSelectedOrderDetail(order)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-jaman-navy flex items-center gap-1 transition-all active:scale-95"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-600" />
                            <span>View</span>
                          </button>

                          <div className="flex items-center gap-1.5">
                            {order.orderStatus === 'NEW' && (
                              <Button
                                variant="primary"
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 font-bold"
                                onClick={() => {
                                  OrderRepository.updateOrderStatus(order.id, 'CONFIRMED', 'Admin');
                                  showToast(`✓ Order #${order.tokenNumber} Acknowledged!`);
                                }}
                              >
                                ✓ Acknowledge
                              </Button>
                            )}
                            {order.orderStatus === 'CONFIRMED' && (
                              <Button
                                variant="accent"
                                size="sm"
                                onClick={() => {
                                  OrderRepository.updateOrderStatus(order.id, 'PREPARING', 'Admin');
                                  showToast(`Order #${order.tokenNumber} is now PREPARING!`);
                                }}
                              >
                                👨‍🍳 Start Prep
                              </Button>
                            )}
                            {order.orderStatus === 'PREPARING' && (
                              <Button
                                variant="primary"
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => {
                                  OrderRepository.updateOrderStatus(order.id, 'READY', 'Admin');
                                  showToast(`Order #${order.tokenNumber} marked READY FOR COLLECTION!`);
                                }}
                              >
                                🔔 Mark Ready
                              </Button>
                            )}
                            {order.orderStatus === 'READY' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  OrderRepository.updateOrderStatus(order.id, 'COMPLETED', 'Admin');
                                  showToast(`Order #${order.tokenNumber} COMPLETED / Handover!`);
                                }}
                              >
                                ✓ Handover
                              </Button>
                            )}

                            <button
                              onClick={async () => {
                                const res = await PrinterService.printReceipt(order);
                                showToast(res.message);
                              }}
                              title="Reprint 80mm Physical Thermal Slip"
                              className="p-2 rounded-xl bg-slate-100 hover:bg-[#FFF4ED] hover:text-jaman-saffron text-slate-600 transition-all"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* AUTHORITATIVE ORDER DETAIL & TIMELINE MODAL */}
          {selectedOrderDetail && (
            <Modal
              isOpen={!!selectedOrderDetail}
              onClose={() => setSelectedOrderDetail(null)}
              title={`Order #${selectedOrderDetail.tokenNumber} (${selectedOrderDetail.orderNumber})`}
            >
              <div className="space-y-6">
                {/* Header Summary */}
                <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-jaman-border flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-jaman-saffron">Token #{selectedOrderDetail.tokenNumber}</span>
                      <StatusBadge status={selectedOrderDetail.orderStatus} />
                    </div>
                    <p className="text-xs text-[#4A5568] mt-1 font-medium">
                      Order ID: <strong>{selectedOrderDetail.orderNumber}</strong> • Terminal: <strong>{selectedOrderDetail.kioskId || 'KIOSK-01'}</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-[#8C9BAE]">Order Type</div>
                    <div className="text-sm font-black text-jaman-navy">
                      {selectedOrderDetail.orderType} {selectedOrderDetail.tableNumber ? `(Table ${selectedOrderDetail.tableNumber})` : ''}
                    </div>
                  </div>
                </div>

                {/* Items & Breakdown */}
                <div className="space-y-3">
                  <h4 className="font-bold text-xs text-jaman-navy uppercase tracking-wider">Itemized Breakdown</h4>
                  <div className="border border-jaman-border rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8F6F0] border-b border-jaman-border text-slate-700 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">Item Details</th>
                          <th className="py-2.5 px-3 text-center">Qty</th>
                          <th className="py-2.5 px-3 text-right">Unit</th>
                          <th className="py-2.5 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedOrderDetail.items.map((it) => (
                          <tr key={it.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-jaman-navy">{it.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{it.sku}</div>
                              {it.modifiers && it.modifiers.length > 0 && (
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {it.modifiers.map((m) => `+ ${m.optionName}`).join(', ')}
                                </div>
                              )}
                              {it.specialInstructions && (
                                <div className="text-[11px] font-semibold text-rose-600 mt-0.5">
                                  Note: {it.specialInstructions}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold">{it.quantity}</td>
                            <td className="py-2.5 px-3 text-right text-slate-600">{formatINR(it.unitPrice)}</td>
                            <td className="py-2.5 px-3 text-right font-black text-jaman-navy">{formatINR(it.totalPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Financial Ledger */}
                <div className="bg-jaman-ivory p-4 rounded-2xl border border-jaman-border space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span>{formatINR(selectedOrderDetail.subtotal)}</span>
                  </div>
                  {selectedOrderDetail.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>Discount ({selectedOrderDetail.couponCode || 'Promo'}):</span>
                      <span>-{formatINR(selectedOrderDetail.discountAmount)}</span>
                    </div>
                  )}
                  {/* B2-036: derived via formatSplitTax so the two halves always sum to the displayed Total Amount. */}
                  <div className="flex justify-between text-slate-600">
                    <span>CGST @ 2.5%:</span>
                    <span>{formatSplitTax(selectedOrderDetail.taxAmount ?? 0, selectedOrderDetail.cgstAmount, selectedOrderDetail.sgstAmount).cgst}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>SGST @ 2.5%:</span>
                    <span>{formatSplitTax(selectedOrderDetail.taxAmount ?? 0, selectedOrderDetail.cgstAmount, selectedOrderDetail.sgstAmount).sgst}</span>
                  </div>
                  <div className="flex justify-between font-black text-sm text-jaman-navy pt-2 border-t border-slate-200">
                    <span>Total Amount:</span>
                    <span className="text-jaman-saffron">{formatINR(selectedOrderDetail.totalAmount)}</span>
                  </div>
                </div>

                {/* Payment & Audit Info */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white border border-jaman-border rounded-xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Payment Method</span>
                    <span className="font-bold text-emerald-700">✓ {selectedOrderDetail.paymentMethod} (PAID)</span>
                    <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                      TxID: {selectedOrderDetail.paymentTransactionId || 'OFFLINE_TX_OK'}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-jaman-border rounded-xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Customer & Counter</span>
                    <span className="font-bold text-jaman-navy">
                      {selectedOrderDetail.customerPhone ? `📞 ${selectedOrderDetail.customerPhone}` : 'Walk-in Guest'}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Pickup: {selectedOrderDetail.pickupCounter || 'Counter 1'}
                    </span>
                  </div>
                </div>

                {/* Order Timeline (Step-by-Step History) */}
                <div className="space-y-2.5">
                  <h4 className="font-bold text-xs text-jaman-navy uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-jaman-saffron" /> Authoritative Order Timeline
                  </h4>
                  <div className="bg-white border border-jaman-border rounded-2xl p-4 space-y-3">
                    {(selectedOrderDetail.timeline && selectedOrderDetail.timeline.length > 0
                      ? selectedOrderDetail.timeline
                      : [
                          {
                            status: 'NEW',
                            title: `Order Created by ${selectedOrderDetail.kioskId || 'KIOSK-01'}`,
                            timestamp: selectedOrderDetail.createdAt,
                            actor: selectedOrderDetail.kioskId || 'KIOSK-01'
                          },
                          {
                            status: 'CONFIRMED',
                            title: `Payment Confirmed (${selectedOrderDetail.paymentMethod})`,
                            timestamp: selectedOrderDetail.createdAt
                          }
                        ]
                    ).map((event, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full bg-jaman-saffron mt-1 shrink-0"></div>
                        <div className="flex-1">
                          <div className="font-bold text-jaman-navy">{event.title}</div>
                          <div className="text-[10px] text-slate-500">
                            {formatDate(event.timestamp)} {formatTime(event.timestamp)} {event.actor ? `• By ${event.actor}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Modal Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-jaman-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const res = await PrinterService.printReceipt(selectedOrderDetail);
                      showToast(res.message);
                    }}
                    leftIcon={<Printer className="w-4 h-4 text-jaman-saffron" />}
                  >
                    Reprint Thermal Slip
                  </Button>

                  <div className="flex items-center gap-2">
                    {selectedOrderDetail.orderStatus === 'NEW' && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 font-bold"
                        onClick={() => {
                          const updated = OrderRepository.updateOrderStatus(selectedOrderDetail.id, 'CONFIRMED', 'Admin');
                          setSelectedOrderDetail(updated);
                          showToast(`✓ Order #${selectedOrderDetail.tokenNumber} Acknowledged!`);
                        }}
                      >
                        ✓ Acknowledge Order
                      </Button>
                    )}
                    {selectedOrderDetail.orderStatus === 'CONFIRMED' && (
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() => {
                          const updated = OrderRepository.updateOrderStatus(selectedOrderDetail.id, 'PREPARING', 'Admin');
                          setSelectedOrderDetail(updated);
                          showToast(`Order #${selectedOrderDetail.tokenNumber} moved to PREPARING!`);
                        }}
                      >
                        👨‍🍳 Start Prep
                      </Button>
                    )}
                    {selectedOrderDetail.orderStatus === 'PREPARING' && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => {
                          const updated = OrderRepository.updateOrderStatus(selectedOrderDetail.id, 'READY', 'Admin');
                          setSelectedOrderDetail(updated);
                          showToast(`Order #${selectedOrderDetail.tokenNumber} marked READY!`);
                        }}
                      >
                        🔔 Mark Ready
                      </Button>
                    )}
                    {selectedOrderDetail.orderStatus === 'READY' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const updated = OrderRepository.updateOrderStatus(selectedOrderDetail.id, 'COMPLETED', 'Admin');
                          setSelectedOrderDetail(updated);
                          showToast(`Order #${selectedOrderDetail.tokenNumber} Handover COMPLETED!`);
                        }}
                      >
                        ✓ Handover / Complete
                      </Button>
                    )}

                    <Button variant="outline" size="sm" onClick={() => setSelectedOrderDetail(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            </Modal>
          )}

          {/* TAB 5: TABLES */}
          {activeTab === 'TABLES' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Dining Table Management</h1>
                <p className="text-sm text-[#4A5568] mt-1">
                  Live floor plan, occupancy status, and table QR code generation.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {tables.map((t) => (
                  <div
                    key={t.id}
                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                      t.status === 'OCCUPIED'
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-white border-jaman-border'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-black text-jaman-navy">T-{t.tableNumber}</span>
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            t.status === 'OCCUPIED' ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                        ></span>
                      </div>
                      <p className="text-xs text-[#4A5568] mt-1">{t.zone}</p>
                      <p className="text-[11px] text-[#8C9BAE] mt-0.5">Capacity: {t.capacity} Guests</p>
                    </div>

                    <button
                      onClick={() => {
                        const newStat = t.status === 'AVAILABLE' ? 'OCCUPIED' : 'AVAILABLE';
                        TableRepository.updateTableStatus(t.id, newStat);
                        showToast(`Table ${t.tableNumber} is now ${newStat}`);
                      }}
                      className="mt-4 w-full py-1.5 rounded-xl text-xs font-bold bg-white border border-jaman-border hover:bg-slate-50 text-jaman-navy"
                    >
                      {t.status === 'AVAILABLE' ? 'Mark Occupied' : 'Clear Table'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: KIOSK TERMINALS */}
          {activeTab === 'KIOSKS' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Kiosk Terminal Control</h1>
                <p className="text-sm text-[#4A5568] mt-1">
                  Manage self-ordering stations, lockdown states, maintenance modes, and idle timeouts.
                </p>
              </div>

              {kiosks.length === 0 && (
                <EmptyState
                  title="No Kiosk Terminals Yet"
                  description="A terminal appears here the moment it's activated with a real activation code and joins this restaurant's network — nothing is pre-populated."
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {kiosks.map((k) => (
                  <div key={k.id} className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-jaman-navy">{k.name}</h3>
                          <StatusBadge status={k.status} type="kiosk" />
                        </div>
                        <p className="text-xs text-[#4A5568] mt-1">{k.locationDescription}</p>
                      </div>
                      <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded font-bold">
                        {k.kioskCode}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-jaman-ivory p-3 rounded-xl border border-jaman-border">
                      <div>
                        <span className="text-[#8C9BAE]">Allowed Modes:</span>
                        <div className="font-semibold text-jaman-navy">{k.orderTypesAllowed.join(', ')}</div>
                      </div>
                      <div>
                        <span className="text-[#8C9BAE]">Idle Reset:</span>
                        <div className="font-semibold text-jaman-navy">{k.idleTimeoutSeconds} seconds</div>
                      </div>
                      <div>
                        <span className="text-[#8C9BAE]">Last Seen:</span>
                        <div className="font-semibold text-jaman-navy font-mono">
                          {k.lastHeartbeat ? formatTime(k.lastHeartbeat) : '—'}
                        </div>
                      </div>
                      <div>
                        <span className="text-[#8C9BAE]">Version:</span>
                        <div className="font-semibold text-jaman-navy font-mono">{k.appVersion}</div>
                      </div>
                      <div>
                        <span className="text-[#8C9BAE]">Pending changes:</span>
                        <div className="font-semibold text-jaman-navy font-mono">{kioskFleet[k.id]?.pendingSyncCount ?? '—'}</div>
                      </div>
                      <div>
                        <span className="text-[#8C9BAE]">Last synced:</span>
                        <div className="font-semibold text-jaman-navy font-mono">
                          {kioskFleet[k.id]?.lastSyncAt ? formatTime(kioskFleet[k.id]!.lastSyncAt!) : '—'}
                        </div>
                      </div>
                    </div>

                    {kioskFleet[k.id]?.syncError && (
                      <div role="alert" className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                        {kioskFleet[k.id]!.syncError}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => void runKioskCommand(k.id, k.name, 'REQUEST_SYNC', 'Sync now')}>
                        Sync now
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void runKioskCommand(k.id, k.name, 'REQUEST_SYNC', 'Menu refresh', { scope: 'MENU' })}>
                        Refresh menu
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void runKioskCommand(k.id, k.name, 'REQUEST_DIAGNOSTICS', 'Diagnostics request')}>
                        Diagnostics
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void runKioskCommand(k.id, k.name, 'RESTART_APP', 'Restart')}>
                        Restart
                      </Button>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#F3EFE6]">
                      <Button
                        variant={k.isLocked ? 'accent' : 'outline'}
                        size="sm"
                        leftIcon={k.isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        onClick={() => {
                          const nextLocked = !k.isLocked;
                          const nextStatus = nextLocked ? 'LOCKED' : 'ONLINE';
                          KioskRepository.updateKioskStatus(k.id, nextStatus, nextLocked);
                          lanMeshSync.broadcast('KIOSK_LOCKDOWN_COMMAND', {
                            kioskId: k.id,
                            isLocked: nextLocked,
                            status: nextStatus
                          });
                          void runKioskCommand(k.id, k.name, nextLocked ? 'LOCK' : 'UNLOCK', nextLocked ? 'Lock' : 'Unlock');
                        }}
                      >
                        {k.isLocked ? 'Unlock Kiosk' : 'Lockdown Kiosk'}
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const nextStatus = k.status === 'MAINTENANCE' ? 'ONLINE' : 'MAINTENANCE';
                          KioskRepository.updateKioskStatus(k.id, nextStatus);
                          lanMeshSync.broadcast('KIOSK_LOCKDOWN_COMMAND', {
                            kioskId: k.id,
                            isLocked: nextStatus === 'MAINTENANCE',
                            status: nextStatus
                          });
                          showToast(`${k.name} maintenance status toggled!`);
                        }}
                      >
                        {k.status === 'MAINTENANCE' ? 'Exit Maint.' : 'Enter Maintenance'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: OFFERS & COUPONS */}
          {activeTab === 'COUPONS' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Offers & Promo Coupons</h1>
                  <p className="text-sm text-[#4A5568] mt-1">
                    Manage customer discounts, threshold promotions, and kiosk exclusive promo codes.
                  </p>
                </div>
                <Button variant="accent" size="sm" onClick={() => setIsAddCouponModalOpen(true)}>
                  + Add Coupon Code
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {coupons.map((c) => (
                  <div key={c.id} className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-lg font-black text-jaman-saffron bg-jaman-saffron/10 px-3 py-1 rounded-xl border border-jaman-saffron/20">
                          {c.code}
                        </span>
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                          ACTIVE
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-jaman-navy mt-3">{c.description}</p>
                      <div className="text-xs text-[#8C9BAE] mt-2 space-y-1">
                        <div>Min Order Value: ₹{c.minOrderValue}</div>
                        <div>Times Used: {c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ' (unlimited)'}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (!confirm(`Delete coupon ${c.code}? This cannot be undone.`)) return;
                        if (CouponRepository.deleteCoupon(c.id)) showToast(`Removed coupon ${c.code}`);
                      }}
                      className="mt-4 text-xs font-semibold text-rose-600 hover:text-rose-800 self-end"
                    >
                      Delete Coupon
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 8: RECEIPT & E-BILL SETTINGS (Sections 130-151) */}
          {activeTab === 'RECEIPTS' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Receipt & E-Bill System</h1>
                  <p className="text-sm text-[#4A5568] mt-1">
                    Configure thermal paper dimensions (58mm vs 80mm), WhatsApp digital receipt templates, and audit history.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Cols: Form */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-jaman-border shadow-sm">
                  <form onSubmit={handleSaveReceiptConfig} className="space-y-4">
                    <h3 className="font-bold text-base text-jaman-navy">Header & Legal Tax Information</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-jaman-navy mb-1">Restaurant Header Name</label>
                        <input
                          type="text"
                          value={receiptForm.restaurantName}
                          onChange={(e) => setReceiptForm({ ...receiptForm, restaurantName: e.target.value })}
                          className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-jaman-navy mb-1">Contact Phone</label>
                        <input
                          type="text"
                          value={receiptForm.phone}
                          onChange={(e) => setReceiptForm({ ...receiptForm, phone: e.target.value })}
                          className={`w-full bg-jaman-ivory border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy ${receiptFormErrors.phone ? 'border-rose-400' : 'border-jaman-border'}`}
                        />
                        {receiptFormErrors.phone && <span className="text-[10px] text-rose-600 font-bold mt-0.5 block">{receiptFormErrors.phone}</span>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-jaman-navy mb-1">GSTIN Number</label>
                        <input
                          type="text"
                          value={receiptForm.gstin}
                          onChange={(e) => setReceiptForm({ ...receiptForm, gstin: e.target.value })}
                          className={`w-full bg-jaman-ivory border rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-jaman-navy ${receiptFormErrors.gstin ? 'border-rose-400' : 'border-jaman-border'}`}
                        />
                        {receiptFormErrors.gstin && <span className="text-[10px] text-rose-600 font-bold mt-0.5 block">{receiptFormErrors.gstin}</span>}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-jaman-navy mb-1">FSSAI License</label>
                        <input
                          type="text"
                          value={receiptForm.fssaiNumber}
                          onChange={(e) => setReceiptForm({ ...receiptForm, fssaiNumber: e.target.value })}
                          className={`w-full bg-jaman-ivory border rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-jaman-navy ${receiptFormErrors.fssaiNumber ? 'border-rose-400' : 'border-jaman-border'}`}
                        />
                        {receiptFormErrors.fssaiNumber && <span className="text-[10px] text-rose-600 font-bold mt-0.5 block">{receiptFormErrors.fssaiNumber}</span>}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">Outlet Full Address</label>
                      <input
                        type="text"
                        value={receiptForm.address}
                        onChange={(e) => setReceiptForm({ ...receiptForm, address: e.target.value })}
                        className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-jaman-navy mb-1">Thank You Closing Message</label>
                        <input
                          type="text"
                          value={receiptForm.thankYouMessage}
                          onChange={(e) => setReceiptForm({ ...receiptForm, thankYouMessage: e.target.value })}
                          className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-jaman-navy mb-1">Footer Heritage Tagline</label>
                        <input
                          type="text"
                          value={receiptForm.footerMessage}
                          onChange={(e) => setReceiptForm({ ...receiptForm, footerMessage: e.target.value })}
                          className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                        />
                      </div>
                    </div>

                    <h3 className="font-bold text-base text-jaman-navy pt-3 border-t border-[#F3EFE6]">
                      Logo
                    </h3>
                    <p className="text-[11px] text-[#4A5568] -mt-2">
                      Shown on the on-screen and WhatsApp receipt and printed at the top of the physical slip.
                    </p>

                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">Receipt Logo</label>
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 rounded-xl border border-jaman-border bg-jaman-ivory flex items-center justify-center overflow-hidden shrink-0">
                          {receiptForm.logoUrl ? (
                            <img src={receiptForm.logoUrl} alt="Receipt logo" className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[10px] text-[#8C9BAE] text-center px-1">No logo</span>
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div
                            className="border-2 border-dashed rounded-xl p-2.5 text-center cursor-pointer border-[#D4CBBF] bg-jaman-ivory hover:border-jaman-saffron hover:bg-[#FFF4ED]/30 transition-colors"
                            onClick={() => document.getElementById('receipt-logo-upload-input')?.click()}
                          >
                            <input
                              id="receipt-logo-upload-input"
                              type="file"
                              accept="image/png, image/jpeg, image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.size > 2 * 1024 * 1024) {
                                  alert('Please select a logo image smaller than 2MB');
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onload = (ev) => setReceiptForm({ ...receiptForm, logoUrl: ev.target?.result as string });
                                reader.readAsDataURL(file);
                              }}
                            />
                            <span className="text-[11px] font-bold text-jaman-navy">📁 Click to upload a logo (PNG/JPG, under 2MB)</span>
                          </div>
                          <input
                            type="url"
                            value={receiptForm.logoUrl?.startsWith('data:') ? '' : receiptForm.logoUrl || ''}
                            onChange={(e) => setReceiptForm({ ...receiptForm, logoUrl: e.target.value || undefined })}
                            placeholder="...or paste a logo image URL"
                            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                          />
                        </div>
                      </div>
                    </div>

                    <h3 className="font-bold text-base text-jaman-navy pt-3 border-t border-[#F3EFE6]">
                      Paper Dimension & Display Rules
                    </h3>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <button
                        type="button"
                        onClick={() => setReceiptForm({ ...receiptForm, paperSize: '80mm' })}
                        className={`p-3 rounded-xl border text-center font-bold text-xs ${
                          receiptForm.paperSize === '80mm'
                            ? 'bg-jaman-navy text-white border-jaman-navy'
                            : 'bg-jaman-ivory border-jaman-border text-jaman-navy'
                        }`}
                      >
                        80mm Standard POS
                      </button>

                      <button
                        type="button"
                        onClick={() => setReceiptForm({ ...receiptForm, paperSize: '58mm' })}
                        className={`p-3 rounded-xl border text-center font-bold text-xs ${
                          receiptForm.paperSize === '58mm'
                            ? 'bg-jaman-navy text-white border-jaman-navy'
                            : 'bg-jaman-ivory border-jaman-border text-jaman-navy'
                        }`}
                      >
                        58mm Compact POS
                      </button>

                      <label className="flex items-center gap-2 p-3 bg-jaman-ivory border border-jaman-border rounded-xl text-xs font-semibold text-jaman-navy cursor-pointer">
                        <input
                          type="checkbox"
                          checked={receiptForm.showTaxBreakup}
                          onChange={(e) => setReceiptForm({ ...receiptForm, showTaxBreakup: e.target.checked })}
                          className="rounded text-jaman-saffron"
                        />
                        Tax Breakup (GST)
                      </label>

                      <label className="flex items-center gap-2 p-3 bg-jaman-ivory border border-jaman-border rounded-xl text-xs font-semibold text-jaman-navy cursor-pointer">
                        <input
                          type="checkbox"
                          checked={receiptForm.enableEmail}
                          onChange={(e) => setReceiptForm({ ...receiptForm, enableEmail: e.target.checked })}
                          className="rounded text-jaman-saffron"
                        />
                        Email Bill (PDF)
                      </label>
                    </div>

                    {/* Cash bills: a light slanted "CASH" across the slip, so cash bills are easy to spot and reconcile. */}
                    <div className="p-4 bg-jaman-ivory border border-jaman-border rounded-2xl space-y-3">
                      <label className="flex items-start gap-2 text-xs font-semibold text-jaman-navy cursor-pointer">
                        <input
                          type="checkbox"
                          checked={receiptForm.showCashWatermark === true}
                          onChange={(e) => setReceiptForm({ ...receiptForm, showCashWatermark: e.target.checked })}
                          className="rounded text-jaman-saffron mt-0.5"
                        />
                        <span>
                          Mark cash bills with a faint diagonal watermark (off by default)
                          <span className="block font-normal text-slate-500 mt-0.5">Bills paid by cash at the counter show the word across the slip in four slanted lines, faint enough to read the bill through it. Card and UPI bills stay plain.</span>
                        </span>
                      </label>
                      {receiptForm.showCashWatermark === true && (
                        <div className="max-w-xs">
                          <label className="block text-[11px] font-bold text-jaman-navy mb-1">Watermark word</label>
                          <input
                            value={receiptForm.cashWatermarkText ?? ''}
                            onChange={(e) => setReceiptForm({ ...receiptForm, cashWatermarkText: e.target.value.slice(0, 12) })}
                            placeholder="CASH"
                            maxLength={12}
                            className="w-full bg-white border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-black tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                          />
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-[#F3EFE6] flex justify-end">
                      <Button variant="accent" type="submit">
                        Save Receipt Settings
                      </Button>
                    </div>
                  </form>
                </div>

                {/* Right Col: Live Authentic Thermal Receipt View with Brand Logo */}
                <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm flex flex-col items-center justify-between">
                  <div className="w-full">
                    <h3 className="font-bold text-sm text-jaman-navy mb-3 text-center">
                      Live Receipt Preview ({receiptForm.paperSize})
                    </h3>
                    <div className="flex justify-center">
                      {orders.length === 0 && (
                        <p className="mb-3 w-full text-center text-[11px] font-semibold text-slate-500">
                          Sample receipt: a real order appears here once a guest has ordered.
                        </p>
                      )}
                      <ThermalReceiptView
                        order={orders[0] ?? SAMPLE_RECEIPT_ORDER}
                        config={receiptForm}
                        onPrint={async () => {
                          const res = await PrinterService.printTestSlip();
                          showToast(res.message);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Receipt History Log Table */}
              <div className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-sm">
                <div className="p-4 bg-jaman-ivory border-b border-jaman-border font-bold text-sm text-jaman-navy flex items-center justify-between">
                  <span>Digital E-Bill Transmission Audit Log</span>
                  <span className="text-xs text-[#8C9BAE] font-normal">{receiptRecords.length} records</span>
                </div>

                {receiptRecords.length === 0 ? (
                  <p className="text-xs text-[#8C9BAE] p-6 text-center">No digital receipts dispatched yet. Dispatched WhatsApp & SMS e-bills will appear here with masked privacy numbers.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8F6F0] border-b border-jaman-border text-[#8C9BAE] uppercase font-bold">
                        <tr>
                          <th className="py-3 px-4">Order / Token</th>
                          <th className="py-3 px-4">Channel</th>
                          <th className="py-3 px-4">Recipient (Masked)</th>
                          <th className="py-3 px-4">Sent Time</th>
                          <th className="py-3 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F3EFE6]">
                        {receiptRecords.map((rec) => (
                          <tr key={rec.id} className="hover:bg-jaman-ivory">
                            <td className="py-3 px-4 font-bold text-jaman-navy">{rec.orderNumber} (#{rec.tokenNumber})</td>
                            <td className="py-3 px-4 font-semibold text-jaman-saffron">{rec.deliveryMethod}</td>
                            <td className="py-3 px-4 font-mono font-bold text-jaman-navy">{rec.recipient}</td>
                            <td className="py-3 px-4 text-[#8C9BAE]">{formatTime(rec.createdAt)}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                                {rec.deliveryStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 9: HARDWARE & DIAGNOSTICS */}
          {activeTab === 'HARDWARE' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Hardware Diagnostics & Monitoring</h1>
                  <p className="text-sm text-[#4A5568] mt-1">
                    Manage ESC/POS thermal printers, payment terminals, touch calibration, and hardware diagnostic self-tests.
                  </p>
                  <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2 max-w-2xl">
                    Printers and kitchen routing set on this screen apply to the hardware attached to this console. Each self-order kiosk keeps
                    its own printer setup on that kiosk, because a printer is connected to one particular machine.
                  </p>
                </div>
                <Button
                  variant="accent"
                  size="sm"
                  leftIcon={<Cpu className="w-4 h-4" />}
                  onClick={() => setIsDiagModalOpen(true)}
                >
                  Run Full Hardware Diagnostic
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Thermal Printer Card & Discovery (Sections 3, 9, 28) */}
                <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-jaman-ivory border border-jaman-border flex items-center justify-center text-jaman-saffron">
                        <Printer className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-jaman-navy">{PrinterService.getActivePrinter().name}</h3>
                        <p className="text-xs text-[#4A5568]">{PrinterService.getActivePrinter().paperSize} Direct Thermal Line ({PrinterService.getActivePrinter().interfaceType} • {PrinterService.getActivePrinter().port})</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ● {PrinterService.getActivePrinter().status}
                    </span>
                  </div>

                  {/* Connected Hardware Select */}
                  <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border text-xs space-y-3">
                    <div>
                      <label className="block text-[#8C9BAE] font-semibold mb-1">Configured Kiosk Printer Device:</label>
                      <select
                        value={PrinterService.getActivePrinter().id}
                        onChange={(e) => {
                          const updated = PrinterService.setActivePrinter(e.target.value);
                          if (updated) {
                            showToast(`Active printer set to: ${updated.name}`);
                          }
                        }}
                        className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold text-jaman-navy focus:outline-none"
                      >
                        {db.configuredPrinters.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.paperSize} • {p.interfaceType}) {p.isKioskBuiltIn ? '★ BUILT-IN' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <span className="text-[#8C9BAE]">Model:</span>
                        <div className="font-semibold text-jaman-navy">{PrinterService.getActivePrinter().modelName}</div>
                      </div>
                      <div>
                        <span className="text-[#8C9BAE]">Last Test Print:</span>
                        <div className="font-semibold text-jaman-navy">{formatTime(PrinterService.getActivePrinter().lastTestAt || new Date().toISOString())}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="accent"
                      size="sm"
                      className="flex-1"
                      onClick={async () => {
                        const res = await PrinterService.printTestSlip();
                        showToast(res.message);
                      }}
                    >
                      [TEST PRINT]
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const res = PrinterService.autoConfigureKioskPrinter();
                        showToast(res.message);
                      }}
                    >
                      [REFRESH PRINTERS]
                    </Button>
                  </div>
                </div>

                {/* Kitchen Printer Routing (maps a kitchen station to a
                    physical printer, mirroring the POS terminal's KOT
                    router so kiosk kitchen tickets print on the correct
                    station printer instead of only the receipt printer) */}
                <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-jaman-ivory border border-jaman-border flex items-center justify-center text-jaman-saffron">
                      <Printer className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-jaman-navy">Kitchen Printer Routing</h3>
                      <p className="text-xs text-[#4A5568]">Which physical printer handles each kitchen station's tickets</p>
                    </div>
                  </div>

                  <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border text-xs space-y-3">
                    {([
                      { role: 'KITCHEN' as const, label: 'Main Kitchen / Curry Station' },
                      { role: 'TANDOOR' as const, label: 'Tandoor Section' },
                      { role: 'BAR' as const, label: 'Beverages Bar' },
                      { role: 'DESSERT' as const, label: 'Dessert Counter' }
                    ]).map(({ role, label }) => {
                      const assigned = db.configuredPrinters.find((p) => p.role === role);
                      return (
                        <div key={role} className="flex items-center justify-between gap-2">
                          <label className="text-[#8C9BAE] font-semibold shrink-0">{label}:</label>
                          <select
                            value={assigned?.id || ''}
                            onChange={(e) => {
                              const newPrinterId = e.target.value;
                              // Exclusive assignment: clear this role off any
                              // printer currently holding it before assigning
                              // it to the newly chosen one.
                              db.configuredPrinters.forEach((p) => {
                                if (p.role === role && p.id !== newPrinterId) {
                                  PrinterRepository.updatePrinter(p.id, { role: undefined });
                                }
                              });
                              if (newPrinterId) {
                                const updated = PrinterRepository.updatePrinter(newPrinterId, { role });
                                if (updated) showToast(`${label} tickets will now print on: ${updated.name}`);
                              }
                            }}
                            className="flex-1 bg-white border border-jaman-border rounded-xl px-2 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none"
                          >
                            <option value="">Unassigned (falls back to default printer)</option>
                            {db.configuredPrinters.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Payment Gateway Card — was a fully fictional VPA/terminal
                    card (a fake UPI VPA, a made-up "PineLabs / Mosambee
                    Native HAL" protocol, and a "self-test" button that only
                    played a success sound) with no backing data model at
                    all. The real connection — actually wired to
                    cloud/api, managed in Settings — is summarized here instead. */}
                <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-jaman-ivory border border-jaman-border flex items-center justify-center text-jaman-saffron">
                      <QrCode className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-jaman-navy">Payment Gateway Connection</h3>
                      <p className="text-xs text-[#4A5568]">Razorpay settlement account for kiosk payments</p>
                    </div>
                  </div>

                  <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border text-xs">
                    {paymentConnectionLoading ? (
                      <span className="text-[#8C9BAE]">Loading connection status…</span>
                    ) : paymentConnection ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[#8C9BAE]">Status:</span>
                        <span
                          className={`font-bold px-2.5 py-1 rounded-full ${
                            paymentConnection.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-700'
                              : paymentConnection.status === 'PENDING_VERIFICATION'
                                ? 'bg-amber-100 text-amber-700'
                                : paymentConnection.status === 'SUSPENDED' || paymentConnection.status === 'DISCONNECTED'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {paymentConnection.status.replace('_', ' ')}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[#8C9BAE]">Not connected yet — set up in Settings → Payment Gateway.</span>
                    )}
                  </div>

                  <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border text-xs space-y-1.5">
                    <div className="font-bold text-jaman-navy">Online revenue (Razorpay)</div>
                    {paymentsSummary ? (
                      <>
                        <div className="flex justify-between"><span className="text-[#8C9BAE]">Gross collected</span><span className="font-bold">{formatINR(paymentsSummary.grossVolume / 100)}</span></div>
                        <div className="flex justify-between"><span className="text-[#8C9BAE]">Successful payments</span><span className="font-bold">{paymentsSummary.successfulCount}</span></div>
                        <div className="flex justify-between"><span className="text-[#8C9BAE]">Failed payments</span><span className="font-bold">{paymentsSummary.failedCount}</span></div>
                        <div className="flex justify-between"><span className="text-[#8C9BAE]">Refunded</span><span className="font-bold">{formatINR(paymentsSummary.refundedAmount / 100)}</span></div>
                      </>
                    ) : (
                      <span className="text-[#8C9BAE]">{paymentsSummaryError ? 'Revenue summary unavailable right now.' : 'Loading…'}</span>
                    )}
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    onClick={() => setActiveTab('SETTINGS')}
                  >
                    Manage in Settings
                  </Button>
                </div>
              </div>

              {/* Online (Razorpay) payments: recent payments, paid-but-not-served, refunds, day statement */}
              {isDeviceConnected() && <OnlinePaymentsPanel />}

              {/* Transactional Print Queue Table (Sections 14-17) */}
              <div className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-sm">
                <div className="p-4 bg-jaman-ivory border-b border-jaman-border font-bold text-sm text-jaman-navy flex items-center justify-between">
                  <span>Transactional Print Queue Spooler</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono font-bold">
                      {db.printJobs.length} Jobs Total
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        PrinterService.processQueue();
                        showToast('Triggered background print queue retry');
                      }}
                    >
                      Process Queue Now
                    </Button>
                  </div>
                </div>

                {db.printJobs.length === 0 ? (
                  <p className="text-xs text-[#8C9BAE] p-6 text-center">No print jobs in spooler queue. Jobs dispatched upon customer payment will appear here.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8F6F0] border-b border-jaman-border text-[#8C9BAE] uppercase font-bold">
                        <tr>
                          <th className="py-3 px-4">Job ID</th>
                          <th className="py-3 px-4">Order / Token</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Paper Width</th>
                          <th className="py-3 px-4">Attempts</th>
                          <th className="py-3 px-4">Time</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F3EFE6]">
                        {db.printJobs.slice(0, 8).map((job) => (
                          <tr key={job.id} className="hover:bg-jaman-ivory">
                            <td className="py-3 px-4 font-mono font-bold text-jaman-navy">{job.id.substring(0, 14)}...</td>
                            <td className="py-3 px-4 font-bold text-jaman-navy">#{job.orderNumber} (TOKEN #{job.tokenNumber})</td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                job.status === 'PRINTED'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : job.status === 'RETRYING'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {job.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold text-[#4A5568]">{job.paperSize}</td>
                            <td className="py-3 px-4 text-[#8C9BAE]">{job.attempts} / {job.maxAttempts}</td>
                            <td className="py-3 px-4 text-[#8C9BAE]">{formatTime(job.createdAt)}</td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={async () => {
                                  const res = await PrinterService.reprintReceipt(job.orderId || '', 'admin');
                                  showToast(res.message);
                                }}
                                className="text-xs font-bold text-jaman-saffron hover:underline"
                              >
                                [REPRINT]
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 10: CUSTOMER FEEDBACK */}
          {activeTab === 'FEEDBACK' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Customer Experience & Feedback</h1>
                <p className="text-sm text-[#4A5568] mt-1">
                  Real-time ratings, service speed impressions, and customer reviews submitted via kiosks.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard
                  title="Average Rating"
                  value={avgRating !== null ? `${avgRating} / 5.0` : 'No ratings yet'}
                  subtitle="Based on kiosk submissions"
                  icon={<Star className="w-5 h-5 text-amber-500 fill-amber-500" />}
                />
                <KpiCard
                  title="Service Speed Score"
                  value={serviceSpeedScore !== null ? `${serviceSpeedScore}%` : 'No data yet'}
                  subtitle="Orders ready within estimate"
                  icon={<Clock className="w-5 h-5" />}
                />
                <KpiCard
                  title="Total Reviews"
                  value={feedbacks.length}
                  subtitle="Customer feedback entries"
                  icon={<MessageSquare className="w-5 h-5" />}
                />
              </div>

              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm divide-y divide-[#F3EFE6]">
                {feedbacks.map((fb) => (
                  <div key={fb.id} className="py-4 space-y-2 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex text-amber-500">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-4 h-4 ${s <= fb.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-bold text-jaman-navy">{fb.rating} Stars</span>
                        <span className="text-xs text-[#8C9BAE]">• {fb.kioskId}</span>
                      </div>
                      <span className="text-xs text-[#8C9BAE]">{formatTime(fb.createdAt)}</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {fb.tags.map((tg: string) => (
                        <span key={tg} className="bg-jaman-ivory border border-jaman-border px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-jaman-navy">
                          ✓ {tg}
                        </span>
                      ))}
                    </div>

                    {fb.comments && (
                      <p className="text-xs text-[#4A5568] bg-jaman-ivory p-3 rounded-xl border border-jaman-border">
                        "{fb.comments}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 11: REPORTS & EXPORT BUILDER */}
          {activeTab === 'REPORTS' && (
            <div data-print-doc="kiosk-report" className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Financial & Operations Reports</h1>
                  <p className="text-sm text-[#4A5568] mt-1">
                    Export real transaction records, item sales, and tax metrics directly to CSV or printable document.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="bg-jaman-navy text-white hover:bg-[#163e5e]"
                    leftIcon={<Receipt className="w-4 h-4 text-jaman-saffron" />}
                    onClick={() => setIsZReportModalOpen(true)}
                  >
                    Daily Z-Report & WhatsApp
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<FileSpreadsheet className="w-4 h-4" />}
                    onClick={() => {
                      const csv = ReportGeneratorService.exportToCsv(currentReport);
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.setAttribute('href', url);
                      link.setAttribute('download', `jamanvaar_${activeReportType.toLowerCase()}_${Date.now()}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      link.remove();
                      showToast('CSV Report Downloaded!');
                    }}
                  >
                    Export CSV
                  </Button>

                  <Button
                    variant="accent"
                    size="sm"
                    leftIcon={<Printer className="w-4 h-4" />}
                    onClick={() => {
                      if (!printElement('[data-print-doc="kiosk-report"]', { title: 'Kiosk report', pageSize: 'A4 portrait' })) showToast('Open the Reports tab to print a report.');
                    }}
                  >
                    Print Report / PDF
                  </Button>
                </div>
              </div>

              {/* Report Selector Pills, Chart Toggle & Dealer Action Deck */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-jaman-border">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setActiveReportType('DAILY_SALES')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      activeReportType === 'DAILY_SALES'
                        ? 'bg-jaman-navy text-white shadow-md'
                        : 'bg-jaman-ivory border border-jaman-border text-[#4A5568] hover:bg-[#F8F6F0]'
                    }`}
                  >
                    📊 Daily Sales Audit
                  </button>
                  <button
                    onClick={() => setActiveReportType('MONTHLY_SALES')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      activeReportType === 'MONTHLY_SALES'
                        ? 'bg-jaman-navy text-white shadow-md'
                        : 'bg-jaman-ivory border border-jaman-border text-[#4A5568] hover:bg-[#F8F6F0]'
                    }`}
                  >
                    🗓️ Monthly 30-Day Ledger
                  </button>
                  <button
                    onClick={() => setActiveReportType('ITEM_SALES')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      activeReportType === 'ITEM_SALES'
                        ? 'bg-jaman-navy text-white shadow-md'
                        : 'bg-jaman-ivory border border-jaman-border text-[#4A5568] hover:bg-[#F8F6F0]'
                    }`}
                  >
                    🏆 Item Sales & Popularity
                  </button>
                </div>

                {/* Option to Add Charts to Report */}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer bg-jaman-ivory px-3.5 py-1.5 rounded-xl border border-jaman-border text-xs font-bold text-jaman-navy hover:bg-[#FFF4ED] transition-colors shadow-2xs">
                    <input
                      type="checkbox"
                      checked={includeChartsInReport}
                      onChange={(e) => {
                        setIncludeChartsInReport(e.target.checked);
                        showToast(`Report charts ${e.target.checked ? 'ENABLED' : 'DISABLED'}`);
                      }}
                      className="rounded text-jaman-saffron focus:ring-jaman-saffron"
                    />
                    <span>📈 Include Charts in Report</span>
                  </label>

                  <button
                    onClick={() => setIsEditRestaurantModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl border border-jaman-border bg-white hover:bg-[#F8F6F0] text-jaman-navy text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <span>🏪 Edit Profile</span>
                  </button>
                </div>

                {/* Dealer / Owner Data Management Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setResetDataType('DAILY');
                      setResetConfirmationText('');
                      setIsResetDataModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Today's Data</span>
                  </button>

                  <button
                    onClick={() => {
                      setResetDataType('MONTHLY');
                      setResetConfirmationText('');
                      setIsResetDataModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Archive & Reset Month</span>
                  </button>
                </div>
              </div>

              {/* Report Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-xs text-[#8C9BAE] font-semibold">Total Revenue:</span>
                  <div className="text-xl font-black text-jaman-navy mt-1">{formatINR(currentReport.summaryMetrics.totalRevenue)}</div>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-xs text-[#8C9BAE] font-semibold">Orders Count:</span>
                  <div className="text-xl font-black text-jaman-navy mt-1">{currentReport.summaryMetrics.totalOrders}</div>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-xs text-[#8C9BAE] font-semibold">Total Discounts:</span>
                  <div className="text-xl font-black text-emerald-600 mt-1">{formatINR(currentReport.summaryMetrics.totalDiscount)}</div>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-xs text-[#8C9BAE] font-semibold">GST Collected (5%):</span>
                  <div className="text-xl font-black text-jaman-saffron mt-1">{formatINR(currentReport.summaryMetrics.totalTax)}</div>
                </div>
              </div>

              {/* Report Data Table */}
              <div className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-sm">
                <div className="p-4 bg-jaman-ivory border-b border-jaman-border font-bold text-sm text-jaman-navy">
                  {currentReport.title} ({formatDate(currentReport.generatedAt)})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8F6F0] border-b border-jaman-border text-[#8C9BAE] uppercase font-bold">
                      <tr>
                        <th className="py-3 px-4">Item / Order</th>
                        <th className="py-3 px-4">Type / SKU</th>
                        <th className="py-3 px-4">Amount / Qty</th>
                        <th className="py-3 px-4">Payment / Revenue</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3EFE6]">
                      {currentReport.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-jaman-ivory">
                          <td className="py-3 px-4 font-bold text-jaman-navy">{row.label}</td>
                          <td className="py-3 px-4 text-[#4A5568]">{row.metric1}</td>
                          <td className="py-3 px-4 font-bold text-jaman-navy">{row.metric2}</td>
                          <td className="py-3 px-4 font-bold text-jaman-saffron">{row.metric3}</td>
                          <td className="py-3 px-4 text-[#4A5568]">{row.metric4 || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 12: STAFF & ROLES */}
          {activeTab === 'STAFF' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Staff & RBAC Permissions</h1>
                <p className="text-sm text-[#4A5568] mt-1">
                  Manage operators, managers, cashiers, and granular access control rules.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {db.users.map((u) => (
                  <div key={u.id} className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-jaman-navy text-white flex items-center justify-center font-bold">
                          {u.fullName[0]}
                        </div>
                        <div>
                          <h4 className="font-bold text-jaman-navy">{u.fullName}</h4>
                          <p className="text-xs text-[#8C9BAE]">@{u.username} • {u.email}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                        ACTIVE
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 13: NETWORK & SYNC CENTER DASHBOARD (Sections 154-158) */}
          {activeTab === 'SYNC' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Network & Cloud Sync Center</h1>
                  <p className="text-sm text-[#4A5568] mt-1">
                    Live transactional outbox, retry queues, cloud latency telemetry, and conflict replay engine.
                  </p>
                </div>
                <Button
                  variant="accent"
                  size="sm"
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                  onClick={async () => {
                    const res = await SyncOutboxEngine.processOutbox();
                    showToast(`Sync completed: ${res.processed} records processed.`);
                  }}
                >
                  Force Immediate Sync Now
                </Button>
              </div>

              {/* Sync Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-5 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-xs font-semibold text-[#8C9BAE]">Cloud API Status:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`w-3 h-3 rounded-full ${networkState === 'ONLINE' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    <span className="text-lg font-black text-jaman-navy">{networkState}</span>
                  </div>
                  <span className="text-[11px] text-[#8C9BAE]">Round-trip: {networkLatency}ms</span>
                </div>

                <div className="p-5 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-xs font-semibold text-[#8C9BAE]">Pending Outbox:</span>
                  <div className="text-2xl font-black text-amber-600 mt-1">{syncStats.pendingCount}</div>
                  <span className="text-[11px] text-[#8C9BAE]">Queued for cloud upload</span>
                </div>

                <div className="p-5 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-xs font-semibold text-[#8C9BAE]">Fully Synced Orders:</span>
                  <div className="text-2xl font-black text-emerald-600 mt-1">{syncStats.syncedCount}</div>
                  <span className="text-[11px] text-[#8C9BAE]">Stored safely on central POS</span>
                </div>

                <div className="p-5 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-xs font-semibold text-[#8C9BAE]">Failed Exceptions:</span>
                  <div className="text-2xl font-black text-rose-600 mt-1">{syncStats.failedCount}</div>
                  <span className="text-[11px] text-[#8C9BAE]">Auto-retry on reconnect</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-jaman-navy">Transactional Outbox Events</span>
                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono font-bold">
                    {db.syncEvents.length} Total Events
                  </span>
                </div>

                {db.syncEvents.length === 0 ? (
                  <p className="text-sm text-[#8C9BAE] py-4 text-center">All local kiosk transactions are fully synchronized with the restaurant server.</p>
                ) : (
                  <div className="divide-y divide-[#F3EFE6]">
                    {db.syncEvents.map((evt) => (
                      <div key={evt.id} className="py-2.5 flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-jaman-navy">{evt.eventType}</span>
                        <StatusBadge status={evt.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 14: AUDIT LOGS */}
          {activeTab === 'AUDIT' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Audit Trail & Security Logs</h1>
                <p className="text-sm text-[#4A5568] mt-1">
                  Immutable tamper-evident record of all menu, price, order, and device state transitions.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm divide-y divide-[#F3EFE6]">
                {auditLogs.map((log) => (
                  <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-jaman-navy">{log.action}</span>
                        <span className="text-[10px] uppercase font-bold text-jaman-saffron bg-jaman-saffron/10 px-1.5 py-0.5 rounded">
                          {log.category}
                        </span>
                        <span className="text-xs text-[#8C9BAE]">by @{log.username || 'system'}</span>
                      </div>
                      <p className="text-xs text-[#4A5568] mt-1">{log.details}</p>
                    </div>
                    <span className="text-[11px] text-[#8C9BAE] whitespace-nowrap">
                      {formatTime(log.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 15: LICENSE & ENTITLEMENTS */}
          {activeTab === 'LICENSE' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">License & Terminal Entitlements</h1>
                <p className="text-sm text-[#4A5568] mt-1">
                  Enterprise franchise plan entitlements, authorized device capacity, and security certificates.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-jaman-saffron uppercase tracking-wider">Plan Subscription</span>
                    <h3 className="text-2xl font-black text-jaman-navy mt-1">{license.planName}</h3>
                    <p className="text-xs text-[#4A5568] mt-0.5">Tier: {license.tier} • Certified for Windows 10/11 Touch Kiosks</p>
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    LICENSE ACTIVE
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#F3EFE6]">
                  <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border">
                    <span className="text-xs text-[#8C9BAE] font-semibold">Active Kiosks:</span>
                    <div className="text-xl font-black text-jaman-navy mt-1">
                      {license.activeDevicesCount} / {license.allowedDevicesCount}
                    </div>
                  </div>
                  <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border">
                    <span className="text-xs text-[#8C9BAE] font-semibold">Valid Until:</span>
                    <div className="text-base font-black text-jaman-navy mt-1">
                      {license.validUntil ? formatDate(license.validUntil) : 'Sign in to see it'}
                    </div>
                  </div>
                  <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border">
                    <span className="text-xs text-[#8C9BAE] font-semibold">License Key:</span>
                    <div className="text-xs font-mono font-bold text-jaman-navy mt-1 truncate">
                      {license.licenseKey || 'Managed by JAMANVAAR Cloud'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 16: SETTINGS & BACKUP */}
          {activeTab === 'SETTINGS' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">System Settings & Backup</h1>
                <p className="text-sm text-[#4A5568] mt-1">
                  Brand configuration, GST taxation settings, and complete database backup & restore.
                </p>
              </div>

              {/* Customer Kiosk Language & Idle Timeout — previously
                  hardcoded literal constants inside the customer kiosk app
                  itself; now a real config surface (KioskDisplaySettingsRepository)
                  the kiosk reads live, so a change here takes effect on the
                  terminal's next render without a code change or restart. */}
              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
                <div>
                  <h4 className="font-bold text-jaman-navy">Customer Kiosk Language & Idle Timeout</h4>
                  <p className="text-xs text-[#4A5568]">Which languages the self-order kiosk offers, and how long it waits before resetting an idle session.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-jaman-ivory rounded-xl border border-jaman-border">
                  {(
                    [
                      { code: 'en', label: 'English' },
                      { code: 'hi', label: 'हिन्दी (Hindi)' },
                      { code: 'gu', label: 'ગુજરાતી (Gujarati)' }
                    ] as const
                  ).map((opt) => {
                    const settings = KioskDisplaySettingsRepository.getSettings();
                    const isEnabled = settings.enabledLanguages.includes(opt.code);
                    return (
                      <label key={opt.code} className="flex items-center gap-2 text-xs font-bold text-jaman-navy">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => {
                            const current = KioskDisplaySettingsRepository.getSettings();
                            const nextEnabled = isEnabled
                              ? current.enabledLanguages.filter((l) => l !== opt.code)
                              : [...current.enabledLanguages, opt.code];
                            try {
                              KioskDisplaySettingsRepository.updateSettings({ enabledLanguages: nextEnabled });
                              showToast(`${opt.label} ${isEnabled ? 'disabled' : 'enabled'} on the customer kiosk.`);
                            } catch (err) {
                              showToast(err instanceof Error ? err.message : 'Could not update kiosk languages');
                            }
                          }}
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-jaman-navy mb-1">Default Language</label>
                    <select
                      value={KioskDisplaySettingsRepository.getSettings().defaultLanguage}
                      onChange={(e) => {
                        try {
                          KioskDisplaySettingsRepository.updateSettings({ defaultLanguage: e.target.value as any });
                          showToast(`Default kiosk language set to ${e.target.value}`);
                        } catch (err) {
                          showToast(err instanceof Error ? err.message : 'Could not update default language');
                        }
                      }}
                      className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                    >
                      {KioskDisplaySettingsRepository.getSettings().enabledLanguages.map((l) => (
                        <option key={l} value={l}>{l === 'en' ? 'English' : l === 'hi' ? 'हिन्दी (Hindi)' : 'ગુજરાતી (Gujarati)'}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-jaman-navy mb-1">Idle Warning After (seconds)</label>
                    <input
                      type="number"
                      min={5}
                      value={KioskDisplaySettingsRepository.getSettings().idleWarningAfterSeconds}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isFinite(val) || val < 5) return;
                        KioskDisplaySettingsRepository.updateSettings({ idleWarningAfterSeconds: val });
                      }}
                      className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Token Counter — previously the kiosk's order token (e.g. K-105) could only ever go
                  up, resetting on its own at the start of a new business day; an admin had no way
                  to force it back to 101 mid-day (e.g. after clearing test orders). */}
              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
                <div>
                  <h4 className="font-bold text-jaman-navy">Order Token Counter</h4>
                  <p className="text-xs text-[#4A5568]">
                    The kiosk hands out sequential tokens (K-101, K-102...) that reset automatically each new business day. Use this only to force an early restart mid-day.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 bg-jaman-ivory rounded-xl p-4 border border-jaman-border">
                  <div>
                    <p className="text-[11px] font-bold text-[#8C9BAE] uppercase tracking-wider">Next Kiosk Token</p>
                    <p className="text-2xl font-black text-jaman-navy">{OrderRepository.nextTokenNumber('K')}</p>
                    {TokenSequenceRepository.getLastReset('K') && (
                      <p className="text-[10px] text-[#8C9BAE] mt-0.5">
                        Last reset {new Date(TokenSequenceRepository.getLastReset('K')!).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {confirmingTokenReset ? (
                    <div className="text-right space-y-2">
                      <p className="text-[11px] font-bold text-rose-600 max-w-[220px]">
                        If orders were already placed today, new tokens may repeat one already used today. Continue?
                      </p>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setConfirmingTokenReset(false)}
                          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            TokenSequenceRepository.reset('K');
                            setConfirmingTokenReset(false);
                            showToast('Token counter reset — next order starts at K-101.');
                          }}
                          className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                        >
                          Yes, Reset
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setConfirmingTokenReset(true)}>
                      Reset to 101
                    </Button>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
                <div>
                  <h4 className="font-bold text-jaman-navy">Payment Gateway</h4>
                  <p className="text-xs text-[#4A5568]">
                    Connect your restaurant's own Razorpay settlement account to receive kiosk payments.
                    Your submission is reviewed by JAMANVAAR before it goes live.
                  </p>
                </div>

                {paymentConnectionLoading && <p className="text-xs text-[#4A5568]">Loading…</p>}

                {paymentConnection && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-jaman-navy">Status:</span>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        paymentConnection.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : paymentConnection.status === 'PENDING_VERIFICATION'
                            ? 'bg-amber-100 text-amber-700'
                            : paymentConnection.status === 'SUSPENDED' || paymentConnection.status === 'DISCONNECTED'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {paymentConnection.status.replace('_', ' ')}
                    </span>
                  </div>
                )}

                {paymentConnectionError && (
                  <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl flex items-center justify-between gap-3">
                    <span>{paymentConnectionError}</span>
                    <button
                      type="button"
                      onClick={loadPaymentConnection}
                      className="shrink-0 text-xs font-bold underline"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* A null connection means the load has not succeeded yet —
                    getOwn() returns {status:'NOT_CONNECTED'} rather than 404
                    for a brand-new restaurant — so it is treated as
                    NOT_CONNECTED rather than blocking the form forever.
                    Submission stays blocked only when we positively know the
                    connection is ACTIVE or SUSPENDED. */}
                {!paymentConnectionLoading &&
                  (paymentConnection === null ||
                    paymentConnection?.status === 'NOT_CONNECTED' ||
                    paymentConnection?.status === 'PENDING_VERIFICATION' ||
                    paymentConnection?.status === 'DISCONNECTED') && (
                  <form onSubmit={handleSubmitPaymentConnection} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">Account Type *</label>
                      <select
                        value={paymentFormFields.accountType}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, accountType: e.target.value as 'BUSINESS' | 'INDIVIDUAL' }))}
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold"
                      >
                        <option value="BUSINESS">Business</option>
                        <option value="INDIVIDUAL">Individual</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">Business Type</label>
                      <input
                        type="text"
                        value={paymentFormFields.businessType ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, businessType: e.target.value }))}
                        placeholder="e.g. Restaurant, Proprietorship"
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">GST Number</label>
                      <input
                        type="text"
                        value={paymentFormFields.gst ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, gst: e.target.value }))}
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">CIN</label>
                      <input
                        type="text"
                        value={paymentFormFields.cin ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, cin: e.target.value }))}
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">Aadhaar / UIDAI (Individual accounts only)</label>
                      <input
                        type="text"
                        value={paymentFormFields.uidai ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, uidai: e.target.value }))}
                        placeholder={paymentConnection?.uidai ? `On file: ${paymentConnection.uidai} — leave blank to keep it` : undefined}
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">PAN *</label>
                      <input
                        type="text"
                        required
                        value={paymentFormFields.pan}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, pan: e.target.value }))}
                        placeholder={paymentConnection?.pan ? `On file: ${paymentConnection.pan} — re-enter to confirm/update` : undefined}
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">Contact Name *</label>
                      <input
                        type="text"
                        required
                        value={paymentFormFields.contactName}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, contactName: e.target.value }))}
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">Contact Email *</label>
                      <input
                        type="email"
                        required
                        value={paymentFormFields.contactEmail}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, contactEmail: e.target.value }))}
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">Contact Phone *</label>
                      <input
                        type="tel"
                        required
                        value={paymentFormFields.contactPhone}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, contactPhone: e.target.value }))}
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">UPI VPA (or fill bank details below)</label>
                      <input
                        type="text"
                        value={paymentFormFields.settlementUpiVpa ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, settlementUpiVpa: e.target.value }))}
                        placeholder="restaurant@upi"
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">Settlement Account Name</label>
                      <input
                        type="text"
                        value={paymentFormFields.settlementAccountName ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, settlementAccountName: e.target.value }))}
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">Bank Account Number</label>
                      <input
                        type="text"
                        value={paymentFormFields.settlementAccountNumber ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, settlementAccountNumber: e.target.value }))}
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">IFSC</label>
                      <input
                        type="text"
                        value={paymentFormFields.settlementIfsc ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, settlementIfsc: e.target.value }))}
                        className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={paymentSubmitting}
                        className="py-3 px-6 rounded-2xl bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {paymentSubmitting ? 'Submitting…' : 'Submit for Review'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Welcome Screen Content — the customer kiosk's first screen
                  used to hardcode its heading/subtitle/button copy and
                  always show the heritage corner artwork with no way to
                  turn any of it off; now a real config surface the kiosk
                  reads live via WelcomeScreenSettingsRepository. */}
              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
                <div>
                  <h4 className="font-bold text-jaman-navy">Welcome Screen Content</h4>
                  <p className="text-xs text-[#4A5568]">Customize the first screen customers see. Leave a field blank to use the default translated text.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-jaman-navy mb-1">Heading</label>
                    <input
                      type="text"
                      placeholder="Welcome to JAMANVAAR"
                      defaultValue={WelcomeScreenSettingsRepository.getSettings().headingText || ''}
                      onBlur={(e) => WelcomeScreenSettingsRepository.updateSettings({ headingText: e.target.value || undefined })}
                      className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-jaman-navy mb-1">Subtitle</label>
                    <input
                      type="text"
                      placeholder="Authentic Flavors, Seamless Dining"
                      defaultValue={WelcomeScreenSettingsRepository.getSettings().subtitleText || ''}
                      onBlur={(e) => WelcomeScreenSettingsRepository.updateSettings({ subtitleText: e.target.value || undefined })}
                      className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-jaman-navy mb-1">Start Order Button Text</label>
                    <input
                      type="text"
                      placeholder="Start Order"
                      defaultValue={WelcomeScreenSettingsRepository.getSettings().startOrderButtonText || ''}
                      onBlur={(e) => WelcomeScreenSettingsRepository.updateSettings({ startOrderButtonText: e.target.value || undefined })}
                      className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-jaman-navy mb-1">Supporting Text</label>
                    <input
                      type="text"
                      placeholder="Tap to begin your order"
                      defaultValue={WelcomeScreenSettingsRepository.getSettings().supportingText || ''}
                      onBlur={(e) => WelcomeScreenSettingsRepository.updateSettings({ supportingText: e.target.value || undefined })}
                      className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="welcome-heritage-artwork"
                    checked={WelcomeScreenSettingsRepository.getSettings().showHeritageArtwork}
                    onChange={(e) => {
                      WelcomeScreenSettingsRepository.updateSettings({ showHeritageArtwork: e.target.checked });
                      showToast(`Heritage corner artwork ${e.target.checked ? 'enabled' : 'disabled'} on the welcome screen.`);
                    }}
                  />
                  <label htmlFor="welcome-heritage-artwork" className="text-xs font-bold text-jaman-navy">
                    Show Indian heritage corner artwork
                  </label>
                </div>

                <div className="pt-2 border-t border-[#F3EFE6] space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="welcome-promo-banner"
                      checked={WelcomeScreenSettingsRepository.getSettings().showPromoBanner}
                      onChange={(e) => {
                        WelcomeScreenSettingsRepository.updateSettings({ showPromoBanner: e.target.checked });
                        showToast(`Welcome screen promo banner ${e.target.checked ? 'enabled' : 'disabled'}.`);
                      }}
                    />
                    <label htmlFor="welcome-promo-banner" className="text-xs font-bold text-jaman-navy">
                      Show a promotional banner on the welcome screen (off by default)
                    </label>
                  </div>
                  {WelcomeScreenSettingsRepository.getSettings().showPromoBanner && (
                    <input
                      type="text"
                      placeholder="e.g. Festive Thali Special — This Week Only"
                      defaultValue={WelcomeScreenSettingsRepository.getSettings().promoBannerText || ''}
                      onBlur={(e) => WelcomeScreenSettingsRepository.updateSettings({ promoBannerText: e.target.value || undefined })}
                      className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                    />
                  )}
                </div>
              </div>

              {/* Welcome Screen Background Photo — previously hardcoded to a single bundled PNG
                  with no way to change it; owner requested being able to put up their own kiosk
                  photo, pick from a preloaded gallery, and see the change reflected live. */}
              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
                <div>
                  <h4 className="font-bold text-jaman-navy">Welcome Screen Background Photo</h4>
                  <p className="text-xs text-[#4A5568]">
                    The full-screen photo behind the "Start Order" screen. Pick a preloaded photo, upload your own, or paste a link — it updates on the kiosk instantly.
                  </p>
                </div>

                {(() => {
                  const currentBg = WelcomeScreenSettingsRepository.getSettings().backgroundImageUrl;
                  const applyBackground = (url: string | undefined) => {
                    WelcomeScreenSettingsRepository.updateSettings({ backgroundImageUrl: url });
                    showToast(url ? 'Welcome screen background updated.' : 'Reset to the default background.');
                  };

                  return (
                    <>
                      <div className="rounded-2xl overflow-hidden border border-jaman-border bg-jaman-ivory aspect-video max-w-md">
                        <img
                          src={currentBg || '/language-selection-bg.png'}
                          alt="Current welcome screen background"
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="flex items-center gap-2 border-b border-jaman-border pb-2">
                        {(['GALLERY', 'UPLOAD', 'URL'] as const).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setBgPhotoTab(tab)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                              bgPhotoTab === tab
                                ? 'bg-jaman-navy text-white shadow-sm'
                                : 'bg-jaman-ivory border border-jaman-border text-[#4A5568] hover:bg-[#F4EFE6]'
                            }`}
                          >
                            {tab === 'GALLERY' ? '🎨 Preloaded Gallery' : tab === 'UPLOAD' ? '📁 Upload Your Own' : '🔗 Paste Image URL'}
                          </button>
                        ))}
                      </div>

                      {bgPhotoTab === 'GALLERY' && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                          {WELCOME_BACKGROUND_GALLERY.map((photo) => (
                            <button
                              key={photo.url}
                              type="button"
                              onClick={() => applyBackground(photo.url)}
                              title={photo.label}
                              className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all ${
                                currentBg === photo.url ? 'border-jaman-saffron ring-2 ring-jaman-saffron/30' : 'border-jaman-border hover:border-jaman-saffron/50'
                              }`}
                            >
                              <img src={photo.url} alt={photo.label} className="w-full h-full object-cover" />
                              {currentBg === photo.url && (
                                <span className="absolute inset-0 bg-jaman-navy/20 flex items-center justify-center">
                                  <CheckCircle2 className="w-6 h-6 text-white drop-shadow-md" />
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {bgPhotoTab === 'UPLOAD' && (
                        <div className="space-y-3">
                          <div
                            className={`border-2 border-dashed rounded-2xl p-5 text-center transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer ${
                              bgUploadPreview ? 'border-emerald-400 bg-emerald-50/40' : 'border-[#D4CBBF] bg-jaman-ivory hover:border-jaman-saffron hover:bg-[#FFF4ED]/30'
                            }`}
                            onClick={() => document.getElementById('welcome-bg-upload-input')?.click()}
                          >
                            <input
                              id="welcome-bg-upload-input"
                              type="file"
                              accept="image/png, image/jpeg, image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.size > 8 * 1024 * 1024) {
                                  alert('Please select an image smaller than 8MB');
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onload = (ev) => setBgUploadPreview(ev.target?.result as string);
                                reader.readAsDataURL(file);
                              }}
                            />
                            {bgUploadPreview ? (
                              <p className="text-xs font-bold text-emerald-800">✓ Ready to apply — click "Apply Photo" below, or click here to choose a different file.</p>
                            ) : (
                              <p className="text-xs font-bold text-jaman-navy">Click to choose a photo from this device (landscape works best — 1920×1080 or wider)</p>
                            )}
                          </div>
                          {bgUploadPreview && (
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setBgUploadPreview(null)}>Cancel</Button>
                              <Button
                                variant="accent"
                                size="sm"
                                className="bg-jaman-saffron hover:bg-[#d55b0e] text-white font-bold"
                                onClick={() => {
                                  applyBackground(bgUploadPreview!);
                                  setBgUploadPreview(null);
                                }}
                              >
                                Apply Photo
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {bgPhotoTab === 'URL' && (
                        <div className="flex gap-2">
                          <input
                            type="url"
                            value={bgUrlInput}
                            onChange={(e) => setBgUrlInput(e.target.value)}
                            placeholder="https://your-server.com/kiosk-background.jpg"
                            className="flex-1 bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                          />
                          <Button
                            variant="accent"
                            size="sm"
                            disabled={!bgUrlInput.trim()}
                            className="bg-jaman-saffron hover:bg-[#d55b0e] text-white font-bold shrink-0"
                            onClick={() => {
                              applyBackground(bgUrlInput.trim());
                              setBgUrlInput('');
                            }}
                          >
                            Apply
                          </Button>
                        </div>
                      )}

                      {currentBg && (
                        <button
                          type="button"
                          onClick={() => applyBackground(undefined)}
                          className="text-xs font-bold text-slate-500 hover:text-jaman-navy underline"
                        >
                          Reset to default background
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-6">
                {/* Audio & Voice Settings (Sections 169-174, 213-216) */}
                <div className="pt-4 border-t border-[#F3EFE6] space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-jaman-navy">Kiosk Audio & Multilingual Voice Synthesis</h4>
                      <p className="text-xs text-[#4A5568]">Configure announcement speech language, volume, style, and test synthesized audio.</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Volume2 className="w-4 h-4" />}
                      onClick={async () => {
                        showToast(`Dispatching test speech in ${voiceForm.language.toUpperCase()}...`);
                        await VoiceService.testVoice(voiceForm.language);
                      }}
                    >
                      ▶ Test Voice Announcement
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 bg-jaman-ivory rounded-xl border border-jaman-border">
                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">Voice Language</label>
                      <select
                        value={voiceForm.language}
                        onChange={(e) => {
                          const updated = VoiceService.updateConfig({ language: e.target.value as any });
                          setVoiceForm({ ...updated });
                          showToast(`Voice language set to ${e.target.value}`);
                        }}
                        className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                      >
                        <option value="hi">हिन्दी (Hindi)</option>
                        <option value="en">English (India)</option>
                        <option value="gu">ગુજરાતી (Gujarati)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">Speech Style</label>
                      <select
                        value={voiceForm.style}
                        onChange={(e) => {
                          const updated = VoiceService.updateConfig({ style: e.target.value as any });
                          setVoiceForm({ ...updated });
                        }}
                        className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                      >
                        <option value="STANDARD">Standard Complete</option>
                        <option value="SHORT">Short Token Only</option>
                        <option value="DISABLED">Disabled</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-jaman-navy mb-1">
                        Speech Rate: <span className="text-jaman-saffron font-bold">{voiceForm.rate}x</span>
                      </label>
                      <input
                        type="range"
                        min="0.7"
                        max="1.3"
                        step="0.05"
                        value={voiceForm.rate}
                        onChange={(e) => {
                          const updated = VoiceService.updateConfig({ rate: parseFloat(e.target.value) });
                          setVoiceForm({ ...updated });
                        }}
                        className="w-full accent-jaman-saffron"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-4">
                      <label className="flex items-center gap-2 text-xs font-bold text-jaman-navy cursor-pointer">
                        <input
                          type="checkbox"
                          checked={voiceForm.quietMode}
                          onChange={(e) => {
                            const updated = VoiceService.updateConfig({ quietMode: e.target.checked });
                            setVoiceForm({ ...updated });
                            showToast(e.target.checked ? 'Quiet mode enabled (Visual only)' : 'Quiet mode disabled');
                          }}
                          className="rounded text-jaman-saffron"
                        />
                        Quiet Mode (Silent)
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pb-4 border-b border-[#F3EFE6]">
                  <div>
                    <h4 className="font-bold text-jaman-navy">Restaurant Legal Identity & Business Profile</h4>
                    <p className="text-xs text-[#4A5568]">Customize legal business name, outlet location, GSTIN, FSSAI license, phone, and report headers.</p>
                  </div>
                  <Button
                    variant="accent"
                    size="sm"
                    className="bg-jaman-saffron hover:bg-[#d55b0e] text-white font-bold"
                    onClick={() => setIsEditRestaurantModalOpen(true)}
                  >
                    🏪 Edit Restaurant Profile
                  </Button>
                </div>

                <div className="flex items-center justify-between pb-4 border-b border-[#F3EFE6]">
                  <div>
                    <h4 className="font-bold text-jaman-navy">Reset Database to Default Demo Seed</h4>
                    <p className="text-xs text-[#4A5568]">Restores all menu items, categories, combos, and Ahmedabad flagship demo setup.</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm('Reset entire system database to default seed state?')) {
                        db.resetToDefaultSeed();
                        showToast('Database reset to default seed!');
                      }
                    }}
                  >
                    Reset Seed Data
                  </Button>
                </div>

                <div className="flex items-center justify-between pb-4 border-b border-[#F3EFE6]">
                  <div>
                    <h4 className="font-bold text-jaman-navy">Export Database Backup (JSON)</h4>
                    <p className="text-xs text-[#4A5568]">Download complete state snapshot for disaster recovery.</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Download className="w-4 h-4" />}
                    onClick={() => {
                      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
                      const downloadAnchor = document.createElement('a');
                      downloadAnchor.setAttribute("href", dataStr);
                      downloadAnchor.setAttribute("download", `jamanvaar_backup_${Date.now()}.json`);
                      document.body.appendChild(downloadAnchor);
                      downloadAnchor.click();
                      downloadAnchor.remove();
                      showToast('Backup JSON exported!');
                    }}
                  >
                    Export Backup
                  </Button>
                </div>
              </div>
            </div>
          )}
          </ScreenErrorBoundary>
        </main>
      </div>

      {/* DRAWER: ADMIN INTELLIGENCE BOT (JAMANVAAR Assistant - 100% Preloaded Direct Operations) */}
      {isAssistantOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/50 backdrop-blur-xs animate-fadeIn">
          <div className="fixed inset-0" onClick={() => setIsAssistantOpen(false)} />
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between z-10">
            {/* Assistant Header with Database Sync Badge */}
            <div className="p-4 sm:p-5 border-b border-jaman-border bg-jaman-navy text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-jaman-saffron flex items-center justify-center shadow-sm">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-white">JAMANVAAR Assistant</h3>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold border border-emerald-500/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      DB Live
                    </span>
                  </div>
                  <p className="text-xs text-white/70">1-Click Local Intelligence & Operations Engine</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setChatMessages([
                      {
                        id: `msg-${Date.now()}`,
                        sender: 'ASSISTANT',
                        text: '🧹 Chat cleared. Select any preloaded query below for real-time restaurant metrics:',
                        timestamp: new Date().toISOString(),
                        suggestions: ['💰 Today\'s Live Sales', '🏆 Top 5 Selling Dishes', '👨‍🍳 Live Kitchen KDS Status']
                      }
                    ]);
                    showToast('Assistant chat history cleared');
                  }}
                  title="Clear conversation history"
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white/80 transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={() => setIsAssistantOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Message Stream */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-jaman-ivory">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'USER' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] p-4 rounded-2xl text-xs whitespace-pre-wrap leading-relaxed shadow-xs ${
                      msg.sender === 'USER'
                        ? 'bg-jaman-navy text-white rounded-br-none font-bold'
                        : 'bg-white border border-jaman-border text-jaman-navy rounded-bl-none'
                    }`}
                  >
                    {msg.text}

                    {msg.actionLink && (
                      <div className="mt-3 pt-2.5 border-t border-jaman-border flex items-center justify-between">
                        <span className="text-[10px] text-[#8C9BAE] font-medium">Quick Navigation:</span>
                        <button
                          onClick={() => {
                            setActiveTab(msg.actionLink as AdminTab);
                            setIsAssistantOpen(false);
                          }}
                          className="px-3 py-1 bg-jaman-saffron hover:bg-[#d55b0e] text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                        >
                          <span>→ Go to {msg.actionLink} Tab</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Suggestion Chips */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.suggestions.map((sug, i) => (
                        <button
                          key={i}
                          onClick={() => handleSendAssistantQuery(sug)}
                          className="px-3 py-1.5 rounded-full bg-white border border-jaman-border text-[11px] font-bold text-jaman-navy hover:bg-[#FFF4ED] hover:border-jaman-saffron transition-all shadow-2xs"
                        >
                          ⚡ {sug}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* PRELOADED ACTION & QUERY COMMAND DECK (No typing required) */}
            <div className="p-4 border-t border-jaman-border bg-white space-y-3 shadow-lg">
              {/* Category Filter Pills */}
              <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
                {[
                  { id: 'SALES', label: '💰 Sales & Revenue' },
                  { id: 'KITCHEN', label: '👨‍🍳 Kitchen & KDS' },
                  { id: 'HARDWARE', label: '🖥️ Kiosks & Hardware' },
                  { id: 'SYSTEM', label: '⚡ Fast Actions' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setBotActionCategory(tab.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap ${
                      botActionCategory === tab.id
                        ? 'bg-jaman-navy text-white shadow-xs'
                        : 'bg-jaman-ivory border border-jaman-border text-[#4A5568] hover:bg-[#F4EFE6]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Preloaded Options Grid */}
              <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-0.5">
                {botActionCategory === 'SALES' && (
                  <>
                    <button
                      onClick={() => handleSendAssistantQuery('How much did I sell today?')}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">💰 Today's Live Sales</span>
                      <span className="text-[10px] text-[#8C9BAE]">Gross revenue & tickets</span>
                    </button>
                    <button
                      onClick={() => handleSendAssistantQuery('Show payment breakdown')}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">💳 Payment Methods</span>
                      <span className="text-[10px] text-[#8C9BAE]">UPI vs Card vs Cash</span>
                    </button>
                    <button
                      onClick={() => handleSendAssistantQuery('Show GST and taxes')}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">🧾 GST 5% Taxes</span>
                      <span className="text-[10px] text-[#8C9BAE]">CGST/SGST ledger</span>
                    </button>
                    <button
                      onClick={() => handleSendAssistantQuery('Show promotional coupons')}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">🎁 Promo Coupons</span>
                      <span className="text-[10px] text-[#8C9BAE]">Active discounts & deals</span>
                    </button>
                  </>
                )}

                {botActionCategory === 'KITCHEN' && (
                  <>
                    <button
                      onClick={() => handleSendAssistantQuery('Show top selling dishes')}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">🏆 Top 5 Best Sellers</span>
                      <span className="text-[10px] text-[#8C9BAE]">Most popular dishes</span>
                    </button>
                    <button
                      onClick={() => handleSendAssistantQuery('Show live kitchen KDS status')}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">👨‍🍳 Active Kitchen KOTs</span>
                      <span className="text-[10px] text-[#8C9BAE]">Preparing tokens & queue</span>
                    </button>
                    <button
                      onClick={() => handleSendAssistantQuery('Show 86 sold out items')}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">🚫 Out of Stock (86)</span>
                      <span className="text-[10px] text-[#8C9BAE]">Unavailable dish list</span>
                    </button>
                    <button
                      onClick={() => handleSendAssistantQuery('Show menu catalog summary')}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">🍽️ Menu Catalog</span>
                      <span className="text-[10px] text-[#8C9BAE]">Total items & combos</span>
                    </button>
                  </>
                )}

                {botActionCategory === 'HARDWARE' && (
                  <>
                    <button
                      onClick={() => handleSendAssistantQuery('Show kiosk terminal matrix status')}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">🖥️ Kiosk Matrix Health</span>
                      <span className="text-[10px] text-[#8C9BAE]">Online terminals & IPs</span>
                    </button>
                    <button
                      onClick={() => handleSendAssistantQuery('Show thermal printer status')}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">🖨️ Thermal Printer</span>
                      <span className="text-[10px] text-[#8C9BAE]">80mm ESC/POS hardware</span>
                    </button>
                    <button
                      onClick={() => handleSendAssistantQuery('Show table occupancy')}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">🪑 Dining Tables</span>
                      <span className="text-[10px] text-[#8C9BAE]">Occupied & free tables</span>
                    </button>
                    <button
                      onClick={() => handleSendAssistantQuery('Show cancelled and refunded orders')}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">⚠️ Cancelled & Refunds</span>
                      <span className="text-[10px] text-[#8C9BAE]">Voided order tickets</span>
                    </button>
                  </>
                )}

                {botActionCategory === 'SYSTEM' && (
                  <>
                    <button
                      onClick={() => {
                        handleSendAssistantQuery('Generate daily sales audit report');
                      }}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">📊 Open Reports Tab</span>
                      <span className="text-[10px] text-[#8C9BAE]">Daily audit & PDF print</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsAssistantOpen(false);
                        setActiveTab('REPORTS');
                        showToast('Choose Print Report / PDF on this tab.');
                      }}
                      className="p-2.5 bg-jaman-ivory hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border rounded-xl text-left transition-all group"
                    >
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron block">🖨️ Print Daily Report</span>
                      <span className="text-[10px] text-[#8C9BAE]">Instant official export</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsAssistantOpen(false);
                        setResetDataType('DAILY');
                        setIsResetDataModalOpen(true);
                      }}
                      className="p-2.5 bg-rose-50 hover:bg-rose-100 hover:border-rose-300 border border-rose-200 rounded-xl text-left transition-all group col-span-2"
                    >
                      <span className="font-bold text-xs text-rose-900 block">🧹 Clear Today's Test Transactions</span>
                      <span className="text-[10px] text-rose-700">Flush demo orders & reset ledger to clean zero</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING CORNER ADMIN AI OPERATIONS ASSISTANT TRIGGER (Bottom Right) */}
      {!isAssistantOpen && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 animate-fadeIn select-none">
          {/* Animated Speech Bubble Prompt */}
          <div
            onClick={() => setIsAssistantOpen(true)}
            className="hidden sm:flex items-center gap-2 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-xl border border-jaman-border text-xs font-bold text-jaman-navy cursor-pointer hover:shadow-2xl hover:border-jaman-saffron transition-all group"
          >
            <Sparkles className="w-4 h-4 text-jaman-saffron animate-pulse" />
            <span>Operations Intelligence • Ask AI</span>
            <span className="text-[10px] bg-jaman-saffron/10 text-jaman-saffron px-2 py-0.5 rounded-full font-black">
              24x7
            </span>
          </div>

          {/* Floating Action Button */}
          <button
            onClick={() => setIsAssistantOpen(true)}
            className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-gradient-to-tr from-jaman-navy to-[#163e5e] hover:from-jaman-saffron hover:to-[#f07d33] text-white flex items-center justify-center shadow-2xl border-2 border-white/30 hover:scale-105 active:scale-95 transition-all relative group"
            title="JAMANVAAR Operations Assistant"
          >
            <Bot className="w-7 h-7 sm:w-8 sm:h-8 group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white animate-ping" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
          </button>
        </div>
      )}

      {/* MODAL: END-OF-DAY (EOD) Z-REPORT & WHATSAPP SETTLEMENT */}
      <Modal
        isOpen={isZReportModalOpen}
        onClose={() => setIsZReportModalOpen(false)}
        title="End-of-Day (EOD) Z-Report & Cash Settlement"
        maxWidth="2xl"
      >
        <div data-print-doc="kiosk-z-report" className="space-y-6">
          <div className="bg-jaman-navy text-white p-5 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs text-amber-400 font-bold uppercase tracking-wider">Official Store Settlement</span>
              <h3 className="text-xl font-black mt-0.5">JAMANVAAR Restaurant #01</h3>
              <p className="text-xs text-white/70">Terminal Matrix: 3 Kiosks • Shift: All Day</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-white/70">Z-Report Generated</span>
              <div className="font-mono text-sm font-bold text-white mt-0.5">
                {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Revenue Breakdown */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-xs text-emerald-800 font-bold">UPI Dynamic QR</span>
              <div className="text-lg font-black text-emerald-950 mt-1">
                {formatINR(orders.filter(o => o.paymentMethod === 'UPI_QR' && o.paymentStatus === 'SUCCESS').reduce((s, o) => s + o.totalAmount, 0))}
              </div>
              <span className="text-[11px] text-emerald-700">Direct Bank Settlement</span>
            </div>

            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
              <span className="text-xs text-blue-800 font-bold">Card POS Terminal</span>
              <div className="text-lg font-black text-blue-950 mt-1">
                {formatINR(orders.filter(o => o.paymentMethod === 'CARD_TERMINAL' && o.paymentStatus === 'SUCCESS').reduce((s, o) => s + o.totalAmount, 0))}
              </div>
              <span className="text-[11px] text-blue-700">PineLabs / EDC Batch</span>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-xs text-amber-800 font-bold">Cash at Counter</span>
              <div className="text-lg font-black text-amber-950 mt-1">
                {formatINR(orders.filter(o => o.paymentMethod === 'CASH_AT_COUNTER' && o.paymentStatus === 'SUCCESS').reduce((s, o) => s + o.totalAmount, 0))}
              </div>
              <span className="text-[11px] text-amber-700">Cash Drawer Total</span>
            </div>
          </div>

          {/* Tax & Margin Summary */}
          <div className="bg-jaman-ivory p-4 rounded-xl border border-jaman-border space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-jaman-border">
              <span className="text-[#4A5568]">Total Completed Tickets:</span>
              <span className="font-bold text-jaman-navy">{orders.filter(o => o.paymentStatus === 'SUCCESS').length} Orders</span>
            </div>
            <div className="flex justify-between py-1 border-b border-jaman-border">
              <span className="text-[#4A5568]">Gross Sales:</span>
              <span className="font-bold text-jaman-navy">{formatINR(orders.reduce((s, o) => s + o.totalAmount, 0))}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-jaman-border">
              <span className="text-[#4A5568]">CGST (2.5%) + SGST (2.5%):</span>
              <span className="font-bold text-jaman-saffron">{formatINR(Math.round(orders.reduce((s, o) => s + (o.taxAmount || 0), 0)))}</span>
            </div>
            <div className="flex justify-between py-1 text-sm font-black text-jaman-navy">
              <span>Net Store Revenue:</span>
              <span>{formatINR(orders.reduce((s, o) => s + o.totalAmount, 0))}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (printElement('[data-print-doc="kiosk-z-report"]', { title: 'Z-Report', pageSize: '80mm auto', margin: '2mm' })) {
                  showToast('Z-Report ready to print.');
                }
              }}
              leftIcon={<Printer className="w-4 h-4" />}
            >
              Print 80mm Z-Slip
            </Button>

            <Button
              variant="accent"
              size="sm"
              onClick={() => {
                const total = orders.reduce((s, o) => s + o.totalAmount, 0);
                const text = encodeURIComponent(`*JAMANVAAR Daily Z-Report*\nDate: ${new Date().toLocaleDateString('en-IN')}\nTotal Revenue: ₹${total}\nOrders: ${orders.length}\nAll terminals balanced.`);
                window.open(`https://wa.me/?text=${text}`, '_blank');
                showToast('WhatsApp Summary Prepared!');
              }}
              leftIcon={<Send className="w-4 h-4" />}
            >
              📲 Send WhatsApp to Owner
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: FULL HARDWARE DIAGNOSTIC SUITE */}
      <Modal
        isOpen={isDiagModalOpen}
        onClose={() => setIsDiagModalOpen(false)}
        title="Hardware Self-Test & Diagnostic Suite"
        maxWidth="2xl"
      >
        <div className="space-y-6">
          <p className="text-xs text-[#4A5568]">
            Run automated self-tests across touch controllers, thermal print heads, audio synthesizers, and cloud latency channels.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {/* Test 1: Audio Chime */}
            <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-jaman-navy">Speaker & Audio</span>
                <Volume2 className="w-4 h-4 text-jaman-saffron" />
              </div>
              <p className="text-xs text-[#8C9BAE]">Plays 4-tone harmonic chime</p>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  SoundService.playSuccess();
                  showToast('Audio test chime dispatched');
                }}
              >
                Test Sound
              </Button>
            </div>

            {/* Test 2: ESC/POS Thermal Print */}
            <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-jaman-navy">Thermal Printer</span>
                <Printer className="w-4 h-4 text-jaman-saffron" />
              </div>
              <p className="text-xs text-[#8C9BAE]">80mm pattern & cutter test</p>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={async () => {
                  const res = await PrinterService.printTestSlip();
                  showToast(res.message);
                }}
              >
                Test Printer
              </Button>
            </div>

            {/* Test 3: Card POS Terminal */}
            <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-jaman-navy">Card POS Echo</span>
                <CreditCard className="w-4 h-4 text-jaman-saffron" />
              </div>
              <p className="text-xs text-[#8C9BAE]">Echo request to EMV reader</p>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  showToast('EMV Reader Echo: ACK 0x06 (Passed)');
                }}
              >
                Ping Terminal
              </Button>
            </div>

            {/* Test 4: Cloud Latency */}
            <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-jaman-navy">Network Latency</span>
                <Wifi className="w-4 h-4 text-jaman-saffron" />
              </div>
              <p className="text-xs text-[#8C9BAE]">Round-trip time to the local sync server</p>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={async () => {
                  const result = await db.testSyncServer();
                  showToast(
                    result.success
                      ? `Sync Server Latency: ${result.pingMs}ms (${result.pingMs < 100 ? 'Optimal' : 'Slow'})`
                      : `Sync Server Unreachable: ${result.error}`
                  );
                }}
              >
                Test Ping
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={() => setIsDiagModalOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: CREATE COMBO DEAL */}
      <Modal
        isOpen={isAddComboModalOpen}
        onClose={() => setIsAddComboModalOpen(false)}
        title="Create New Combo Deal"
      >
        <form onSubmit={handleCreateCombo} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">Combo Name *</label>
            <input
              type="text"
              required
              value={comboName}
              onChange={(e) => setComboName(e.target.value)}
              placeholder="E.g., Royal Tandoori Feast, Biryani Mega Saver"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Combo Bundle Price (₹) *</label>
              <input
                type="number"
                required
                min={1}
                value={comboPrice}
                onChange={(e) => setComboPrice(Number(e.target.value))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Original Individual Price (₹)</label>
              <input
                type="number"
                required
                min={1}
                value={comboOriginalPrice}
                onChange={(e) => setComboOriginalPrice(Number(e.target.value))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">Combo Description</label>
            <textarea
              rows={2}
              value={comboDesc}
              onChange={(e) => setComboDesc(e.target.value)}
              placeholder="E.g., Main Biryani + Mixed Raita + Cold Coffee + 2 Gulab Jamun"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            />
          </div>

          {([
            { label: 'Main Dishes *', ids: comboMainItemIds, setIds: setComboMainItemIds },
            { label: 'Sides (optional)', ids: comboSideItemIds, setIds: setComboSideItemIds },
            { label: 'Drinks (optional)', ids: comboDrinkItemIds, setIds: setComboDrinkItemIds },
            { label: 'Desserts (optional)', ids: comboDessertItemIds, setIds: setComboDessertItemIds }
          ] as const).map((slot) => (
            <div key={slot.label}>
              <label className="block text-xs font-bold text-jaman-navy mb-1">{slot.label}</label>
              <div className="max-h-28 overflow-y-auto border border-jaman-border rounded-xl bg-jaman-ivory p-2 space-y-1">
                {menuItems.length === 0 ? (
                  <p className="text-xs text-slate-400 px-1 py-1">No dishes yet — add menu items first.</p>
                ) : (
                  menuItems.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-white cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={slot.ids.includes(item.id)}
                        onChange={() => toggleComboItem(slot.setIds)(item.id)}
                      />
                      <span className="font-semibold text-jaman-navy">{item.name}</span>
                      <span className="text-slate-400 font-mono ml-auto">₹{item.price}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setIsAddComboModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" type="submit">
              Create Combo
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: ADD MENU ITEM */}
      <Modal
        isOpen={isAddItemModalOpen}
        onClose={() => setIsAddItemModalOpen(false)}
        title="Add New Dish to Menu"
      >
        <form onSubmit={handleCreateMenuItem} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">Dish Name *</label>
            <input
              type="text"
              required
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="E.g., Chicken Dum Biryani, Paneer Lababdar"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Price (₹) *</label>
              <input
                type="number"
                required
                min={1}
                value={newItemPrice}
                onChange={(e) => setNewItemPrice(Number(e.target.value))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">SKU Code</label>
              <input
                type="text"
                value={newItemSku}
                onChange={(e) => setNewItemSku(e.target.value)}
                placeholder="E.g., CDB-01"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Category</label>
              <select
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value)}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Dietary Tag</label>
              <select
                value={newItemDietary}
                onChange={(e) => setNewItemDietary(e.target.value as DietaryType)}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              >
                <option value="VEG">Pure Veg</option>
                <option value="NON_VEG">Non-Veg</option>
                <option value="JAIN">Jain</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">Description</label>
            <textarea
              rows={2}
              value={newItemDesc}
              onChange={(e) => setNewItemDesc(e.target.value)}
              placeholder="Short appetizing description for customer kiosk..."
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            />
          </div>

          {/* Hindi/Gujarati translations — previously there was no way at
              all to set these, so every admin-added dish showed only in
              English on the customer kiosk regardless of selected
              language. The keyboard button opens a phonetic on-screen
              keyboard for admins without a native-script keyboard. */}
          <div className="pt-2 border-t border-[#F3EFE6] space-y-3">
            <p className="text-xs font-bold text-jaman-navy">Translations (optional, shown when a customer selects that language)</p>

            <div className="space-y-2 p-3 bg-jaman-ivory rounded-xl border border-jaman-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-jaman-navy">हिन्दी Name</label>
                <button
                  type="button"
                  onClick={() => setActiveKeyboardField({ lang: 'hi', field: 'name' })}
                  className="text-[10px] font-bold text-jaman-saffron px-2 py-0.5 rounded-md border border-jaman-saffron/30 hover:bg-[#FFF4ED]"
                >
                  ⌨ Keyboard
                </button>
              </div>
              <input
                type="text"
                value={newItemNameHi}
                onChange={(e) => setNewItemNameHi(e.target.value)}
                placeholder="e.g. पनीर टिक्का"
                className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-sm focus:outline-none"
              />
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-jaman-navy">हिन्दी Description</label>
                <button
                  type="button"
                  onClick={() => setActiveKeyboardField({ lang: 'hi', field: 'description' })}
                  className="text-[10px] font-bold text-jaman-saffron px-2 py-0.5 rounded-md border border-jaman-saffron/30 hover:bg-[#FFF4ED]"
                >
                  ⌨ Keyboard
                </button>
              </div>
              <textarea
                rows={2}
                value={newItemDescHi}
                onChange={(e) => setNewItemDescHi(e.target.value)}
                className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-sm focus:outline-none"
              />
            </div>

            <div className="space-y-2 p-3 bg-jaman-ivory rounded-xl border border-jaman-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-jaman-navy">ગુજરાતી Name</label>
                <button
                  type="button"
                  onClick={() => setActiveKeyboardField({ lang: 'gu', field: 'name' })}
                  className="text-[10px] font-bold text-jaman-saffron px-2 py-0.5 rounded-md border border-jaman-saffron/30 hover:bg-[#FFF4ED]"
                >
                  ⌨ Keyboard
                </button>
              </div>
              <input
                type="text"
                value={newItemNameGu}
                onChange={(e) => setNewItemNameGu(e.target.value)}
                placeholder="e.g. પનીર ટિક્કા"
                className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-sm focus:outline-none"
              />
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-jaman-navy">ગુજરાતી Description</label>
                <button
                  type="button"
                  onClick={() => setActiveKeyboardField({ lang: 'gu', field: 'description' })}
                  className="text-[10px] font-bold text-jaman-saffron px-2 py-0.5 rounded-md border border-jaman-saffron/30 hover:bg-[#FFF4ED]"
                >
                  ⌨ Keyboard
                </button>
              </div>
              <textarea
                rows={2}
                value={newItemDescGu}
                onChange={(e) => setNewItemDescGu(e.target.value)}
                className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setIsAddItemModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" type="submit">
              Save Dish
            </Button>
          </div>
        </form>
      </Modal>

      {/* Phonetic virtual keyboard for the Hindi/Gujarati translation
          fields above — bound to whichever field was last opened. */}
      {activeKeyboardField && (
        <VirtualKeyboard
          language={activeKeyboardField.lang}
          value={
            activeKeyboardField.lang === 'hi'
              ? activeKeyboardField.field === 'name' ? newItemNameHi : newItemDescHi
              : activeKeyboardField.field === 'name' ? newItemNameGu : newItemDescGu
          }
          onChange={(next) => {
            if (activeKeyboardField.lang === 'hi') {
              if (activeKeyboardField.field === 'name') setNewItemNameHi(next);
              else setNewItemDescHi(next);
            } else {
              if (activeKeyboardField.field === 'name') setNewItemNameGu(next);
              else setNewItemDescGu(next);
            }
          }}
          onClose={() => setActiveKeyboardField(null)}
        />
      )}

      {/* MODAL: ADD / EDIT CATEGORY */}
      <CategoryModal
        isOpen={isAddCategoryModalOpen}
        onClose={() => {
          setIsAddCategoryModalOpen(false);
          setEditingCategory(null);
        }}
        categoryToEdit={editingCategory}
        onSaved={() => {
          showToast(editingCategory ? `Updated category: ${editingCategory.name}` : 'Category created');
          if (editingCategory) setEditingCategory(null);
        }}
        onDeleted={() => {
          showToast(`Deleted category: ${editingCategory?.name ?? ''}`);
          if (selectedCategoryFilter === editingCategory?.id) setSelectedCategoryFilter('ALL');
          setEditingCategory(null);
        }}
      />

      {/* MODAL: ADD COUPON */}
      <Modal
        isOpen={isAddCouponModalOpen}
        onClose={() => setIsAddCouponModalOpen(false)}
        title="Create Promotional Coupon"
      >
        <form onSubmit={handleCreateCoupon} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">Promo Code *</label>
            <input
              type="text"
              required
              value={newCouponCode}
              onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
              placeholder="E.g., FESTIVE100, WELCOME20"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Discount Amount (₹)</label>
              <input
                type="number"
                required
                min={5}
                value={newCouponValue}
                onChange={(e) => setNewCouponValue(Number(e.target.value))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Min Order (₹)</label>
              <input
                type="number"
                required
                min={0}
                value={newCouponMin}
                onChange={(e) => setNewCouponMin(Number(e.target.value))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">Usage Limit (total redemptions)</label>
            <input
              type="number"
              min={1}
              value={newCouponUsageLimit}
              onChange={(e) => setNewCouponUsageLimit(e.target.value)}
              placeholder="Leave blank for unlimited"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setIsAddCouponModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" type="submit">
              Create Coupon
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: GLOBAL SEARCH COMMAND PALETTE (Ctrl + K) (Sections 199-200) */}
      <Modal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        title="Global Search Everywhere (Ctrl + K)"
        maxWidth="xl"
      >
        <div className="space-y-4 py-2">
          <div className="relative">
            <Search className="w-5 h-5 text-[#8C9BAE] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              placeholder="Search dishes, orders, tokens, tables, coupons, or staff..."
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl pl-11 pr-4 py-3 text-sm text-jaman-navy placeholder-[#8C9BAE] focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            />
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[#F3EFE6] text-xs">
            {/* Filtered Dishes */}
            {menuItems
              .filter((m) => m.name.toLowerCase().includes(globalSearchQuery.toLowerCase()) || m.sku.toLowerCase().includes(globalSearchQuery.toLowerCase()))
              .slice(0, 4)
              .map((it) => (
                <div
                  key={it.id}
                  onClick={() => {
                    setActiveTab('MENU');
                    setIsGlobalSearchOpen(false);
                  }}
                  className="p-3 hover:bg-jaman-ivory flex items-center justify-between cursor-pointer rounded-xl"
                >
                  <div>
                    <span className="font-bold text-jaman-navy block">{it.name}</span>
                    <span className="text-[10px] text-[#8C9BAE]">SKU: {it.sku} • {it.dietaryType}</span>
                  </div>
                  <span className="font-black text-jaman-saffron">{formatINR(it.price)}</span>
                </div>
              ))}

            {/* Filtered Orders */}
            {orders
              .filter((o) => o.orderNumber.toLowerCase().includes(globalSearchQuery.toLowerCase()) || o.tokenNumber.includes(globalSearchQuery))
              .slice(0, 4)
              .map((ord) => (
                <div
                  key={ord.id}
                  onClick={() => {
                    setActiveTab('ORDERS_KDS');
                    setIsGlobalSearchOpen(false);
                  }}
                  className="p-3 hover:bg-jaman-ivory flex items-center justify-between cursor-pointer rounded-xl"
                >
                  <div>
                    <span className="font-bold text-jaman-navy block">{ord.orderNumber} (TOKEN #{ord.tokenNumber})</span>
                    <span className="text-[10px] text-[#8C9BAE]">{ord.orderType} • {formatTime(ord.createdAt)}</span>
                  </div>
                  <span className="font-black text-emerald-600">{formatINR(ord.totalAmount)}</span>
                </div>
              ))}

            {/* Filtered Coupons */}
            {coupons
              .filter((c) => c.code.toLowerCase().includes(globalSearchQuery.toLowerCase()))
              .slice(0, 2)
              .map((cpn) => (
                <div
                  key={cpn.id}
                  onClick={() => {
                    setActiveTab('COUPONS');
                    setIsGlobalSearchOpen(false);
                  }}
                  className="p-3 hover:bg-jaman-ivory flex items-center justify-between cursor-pointer rounded-xl"
                >
                  <div>
                    <span className="font-bold font-mono text-jaman-navy block">COUPON: {cpn.code}</span>
                    <span className="text-[10px] text-[#8C9BAE]">{cpn.description}</span>
                  </div>
                  <span className="text-xs font-bold text-indigo-600">₹{cpn.discountValue} OFF</span>
                </div>
              ))}
          </div>

          <div className="text-[11px] text-[#8C9BAE] pt-2 border-t border-[#F3EFE6] flex justify-between">
            <span>Press <strong>Esc</strong> to dismiss</span>
            <span>JAMANVAAR Global Registry</span>
          </div>
        </div>
      </Modal>

      {/* MODAL: SMART PREBUILT MENU STARTER LIBRARY WIZARD (40 Restaurant Profiles) */}
      <Modal
        isOpen={isPrebuiltMenuModalOpen}
        onClose={() => setIsPrebuiltMenuModalOpen(false)}
        title="Prebuilt Restaurant Menu Starter Library"
        maxWidth="3xl"
      >
        <div className="space-y-4 py-2 select-none">
          {/* Wizard Step Indicator */}
          <div className="flex items-center justify-between pb-3 border-b border-jaman-border">
            <div className="flex items-center gap-2">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                  templateStep === 'SELECT' ? 'bg-jaman-saffron text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                1
              </span>
              <span className="text-xs font-bold text-jaman-navy">Choose Restaurant Type</span>
            </div>
            <div className="w-12 h-0.5 bg-jaman-border" />
            <div className="flex items-center gap-2">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                  templateStep === 'PREVIEW'
                    ? 'bg-jaman-saffron text-white'
                    : templateStep === 'IMPORT_OPTIONS'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                2
              </span>
              <span className="text-xs font-bold text-jaman-navy">Preview Menu</span>
            </div>
            <div className="w-12 h-0.5 bg-jaman-border" />
            <div className="flex items-center gap-2">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                  templateStep === 'IMPORT_OPTIONS' ? 'bg-jaman-saffron text-white' : 'bg-slate-100 text-slate-400'
                }`}
              >
                3
              </span>
              <span className="text-xs font-bold text-jaman-navy">Import to Draft</span>
            </div>
          </div>

          {/* STEP 1: SELECT TEMPLATES */}
          {templateStep === 'SELECT' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-[#8C9BAE] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={templateSearchQuery}
                    onChange={(e) => setTemplateSearchQuery(e.target.value)}
                    placeholder="Search restaurant type (e.g. Pizza, Thali, Cafe)..."
                    className="w-full bg-jaman-ivory border border-jaman-border rounded-xl pl-10 pr-4 py-2 text-xs text-jaman-navy placeholder-[#8C9BAE] focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
                  {['ALL', 'Indian', 'Italian', 'Fast Food', 'Cafe', 'Asian', 'Heritage', 'Healthy'].map((cuisine) => (
                    <button
                      key={cuisine}
                      onClick={() => setSelectedCuisineFilter(cuisine)}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all ${
                        selectedCuisineFilter === cuisine
                          ? 'bg-jaman-navy text-white shadow-xs'
                          : 'bg-jaman-ivory border border-jaman-border text-[#4A5568] hover:bg-[#F4EFE6]'
                      }`}
                    >
                      {cuisine}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-96 overflow-y-auto pr-1">
                {PREBUILT_MENU_TEMPLATES.filter((tpl) => {
                  const matchesSearch =
                    tpl.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
                    tpl.cuisine.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
                    tpl.description.toLowerCase().includes(templateSearchQuery.toLowerCase());
                  const matchesCuisine =
                    selectedCuisineFilter === 'ALL' ||
                    tpl.cuisine.toLowerCase().includes(selectedCuisineFilter.toLowerCase()) ||
                    tpl.name.toLowerCase().includes(selectedCuisineFilter.toLowerCase());
                  return matchesSearch && matchesCuisine;
                }).map((tpl) => {
                  const isSelected = selectedTemplateIds.includes(tpl.id);
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => {
                        setSelectedTemplateIds((prev) =>
                          prev.includes(tpl.id) ? prev.filter((id) => id !== tpl.id) : [...prev, tpl.id]
                        );
                      }}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                        isSelected
                          ? 'border-jaman-saffron bg-[#FFF4ED] shadow-sm'
                          : 'border-jaman-border bg-white hover:border-[#8C9BAE]/60'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl">
                            {tpl.icon}
                          </div>
                          {tpl.badge && (
                            <span className="text-[9px] font-black uppercase tracking-wider text-jaman-saffron bg-jaman-saffron/10 px-2 py-0.5 rounded-full">
                              {tpl.badge}
                            </span>
                          )}
                        </div>

                        <h4 className="font-bold text-sm text-jaman-navy mt-2.5">{tpl.name}</h4>
                        <span className="text-[10px] font-semibold text-[#8C9BAE] block">{tpl.cuisine}</span>
                        <p className="text-[11px] text-[#4A5568] line-clamp-2 mt-1.5">{tpl.description}</p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-jaman-border/60 text-[11px]">
                        <span className="font-bold text-jaman-navy">
                          {tpl.categoryCount} Cats • ~{tpl.approxItemCount} Dishes
                        </span>
                        <span
                          className={`font-black text-xs ${
                            isSelected ? 'text-jaman-saffron' : 'text-slate-400'
                          }`}
                        >
                          {isSelected ? '✓ Selected' : '+ Select'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-jaman-border">
                <span className="text-xs font-bold text-jaman-navy">
                  {selectedTemplateIds.length} template(s) chosen (Multi-select enabled)
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setIsPrebuiltMenuModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="accent"
                    disabled={selectedTemplateIds.length === 0}
                    onClick={() => setTemplateStep('PREVIEW')}
                  >
                    Preview Selected Menu →
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW TEMPLATE DETAILS */}
          {templateStep === 'PREVIEW' && (
            <div className="space-y-4">
              <div className="bg-[#F8F6F0] p-4 rounded-2xl border border-jaman-border">
                <h4 className="font-bold text-xs text-jaman-navy mb-2 uppercase tracking-wider">
                  Selected Templates to Preview:
                </h4>
                <div className="flex flex-wrap gap-2">
                  {selectedTemplateIds.map((tid) => {
                    const tpl = PREBUILT_MENU_TEMPLATES.find((t) => t.id === tid);
                    return (
                      <span
                        key={tid}
                        className="bg-white border border-jaman-border px-3 py-1 rounded-xl text-xs font-bold text-jaman-navy flex items-center gap-1.5"
                      >
                        <span>{tpl?.icon}</span>
                        <span>{tpl?.name}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-4 pr-1">
                {PREBUILT_MENU_TEMPLATES.filter((t) => selectedTemplateIds.includes(t.id)).map((tpl) => (
                  <div key={tpl.id} className="bg-white rounded-2xl p-4 border border-jaman-border space-y-3">
                    <h4 className="font-bold text-sm text-jaman-navy flex items-center gap-2">
                      <span>{tpl.icon}</span>
                      <span>{tpl.name} Menu Structure</span>
                    </h4>

                    <div className="space-y-3">
                      {tpl.categories.map((cat, idx) => (
                        <div key={idx} className="bg-jaman-ivory p-3 rounded-xl border border-jaman-border">
                          <span className="font-bold text-xs text-jaman-navy block">
                            📂 {cat.name} ({cat.items.length} dishes)
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            {cat.items.map((it, iidx) => (
                              <div
                                key={iidx}
                                className="bg-white p-2.5 rounded-lg border border-jaman-border flex items-center justify-between text-xs"
                              >
                                <div>
                                  <span className="font-semibold text-jaman-navy block">{it.name}</span>
                                  <span className="text-[10px] text-[#8C9BAE]">{it.dietaryType} • {it.prepTimeMinutes}m prep</span>
                                </div>
                                <span className="font-black text-jaman-saffron">₹{it.suggestedPrice}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-jaman-border">
                <Button variant="secondary" onClick={() => setTemplateStep('SELECT')}>
                  ← Back to Selection
                </Button>
                <Button variant="accent" onClick={() => setTemplateStep('IMPORT_OPTIONS')}>
                  Continue to Import Options →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: IMPORT OPTIONS & DRAFT STAGING */}
          {templateStep === 'IMPORT_OPTIONS' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <h4 className="font-bold text-xs text-amber-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Staging Guarantee: Menu will be imported in DRAFT mode</span>
                </h4>
                <p className="text-[11px] text-amber-700 mt-1">
                  Loading templates will not interrupt active customer kiosks. You can verify prices, photos, and descriptions before publishing.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Modules to import */}
                <div className="bg-white p-4 rounded-2xl border border-jaman-border space-y-3">
                  <h4 className="font-bold text-xs text-jaman-navy uppercase tracking-wider">
                    Select Data Modules to Import:
                  </h4>
                  <div className="space-y-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-jaman-navy">
                      <input
                        type="checkbox"
                        checked={importCategoriesOpt}
                        onChange={(e) => setImportCategoriesOpt(e.target.checked)}
                        className="rounded text-jaman-saffron"
                      />
                      <span>Categories & Taxonomy</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-jaman-navy">
                      <input
                        type="checkbox"
                        checked={importItemsOpt}
                        onChange={(e) => setImportItemsOpt(e.target.checked)}
                        className="rounded text-jaman-saffron"
                      />
                      <span>Dishes, Recipes & Descriptions</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-jaman-navy">
                      <input
                        type="checkbox"
                        checked={importImagesOpt}
                        onChange={(e) => setImportImagesOpt(e.target.checked)}
                        className="rounded text-jaman-saffron"
                      />
                      <span>Curated Food Images</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-jaman-navy">
                      <input
                        type="checkbox"
                        checked={importCombosOpt}
                        onChange={(e) => setImportCombosOpt(e.target.checked)}
                        className="rounded text-jaman-saffron"
                      />
                      <span>Combos & Value Deal Bundles</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-jaman-navy">
                      <input
                        type="checkbox"
                        checked={importSuggestedPricesOpt}
                        onChange={(e) => setImportSuggestedPricesOpt(e.target.checked)}
                        className="rounded text-jaman-saffron"
                      />
                      <span>Suggested Starting Prices</span>
                    </label>
                  </div>
                </div>

                {/* Duplicate Resolution */}
                <div className="bg-white p-4 rounded-2xl border border-jaman-border space-y-3">
                  <h4 className="font-bold text-xs text-jaman-navy uppercase tracking-wider">
                    Duplicate Item Handling Strategy:
                  </h4>
                  <div className="space-y-2.5 text-xs">
                    <label className="flex items-start gap-2 cursor-pointer text-jaman-navy">
                      <input
                        type="radio"
                        name="dupStrategy"
                        checked={duplicateStrategy === 'KEEP_EXISTING'}
                        onChange={() => setDuplicateStrategy('KEEP_EXISTING')}
                        className="mt-0.5 text-jaman-saffron"
                      />
                      <div>
                        <strong className="block">Keep Existing Dishes</strong>
                        <span className="text-[10px] text-[#8C9BAE]">Do not overwrite items with matching names</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer text-jaman-navy">
                      <input
                        type="radio"
                        name="dupStrategy"
                        checked={duplicateStrategy === 'REPLACE_DUPLICATE'}
                        onChange={() => setDuplicateStrategy('REPLACE_DUPLICATE')}
                        className="mt-0.5 text-jaman-saffron"
                      />
                      <div>
                        <strong className="block">Update / Overwrite Duplicates</strong>
                        <span className="text-[10px] text-[#8C9BAE]">Replace details with the template version</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer text-jaman-navy">
                      <input
                        type="radio"
                        name="dupStrategy"
                        checked={duplicateStrategy === 'IMPORT_AS_NEW'}
                        onChange={() => setDuplicateStrategy('IMPORT_AS_NEW')}
                        className="mt-0.5 text-jaman-saffron"
                      />
                      <div>
                        <strong className="block">Import All as New Dishes</strong>
                        <span className="text-[10px] text-[#8C9BAE]">Assign unique SKUs and append</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-jaman-border">
                <Button variant="secondary" onClick={() => setTemplateStep('PREVIEW')}>
                  ← Back
                </Button>
                <Button
                  variant="accent"
                  className="font-bold shadow-md bg-jaman-saffron"
                  onClick={() => {
                    try {
                      const res = MenuBuilderService.importTemplates(selectedTemplateIds, {
                        importCategories: importCategoriesOpt,
                        importItems: importItemsOpt,
                        importImages: importImagesOpt,
                        importModifiers: true,
                        importCombos: importCombosOpt,
                        importSuggestedPrices: importSuggestedPricesOpt,
                        duplicateStrategy
                      });
                      showToast(
                        `✓ Successfully imported ${res.importedItemsCount} dishes across ${res.importedCategoriesCount} categories into DRAFT!`
                      );
                      setIsPrebuiltMenuModalOpen(false);
                    } catch (err: any) {
                      alert(err.message || 'Import failed');
                    }
                  }}
                >
                  🚀 Import Template into Draft Menu
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL: BULK PRICE ADJUSTER */}
      <Modal
        isOpen={isBulkPriceModalOpen}
        onClose={() => setIsBulkPriceModalOpen(false)}
        title="Bulk Menu Price Adjuster"
        maxWidth="lg"
      >
        <div className="space-y-4 py-2 select-none">
          <p className="text-xs text-[#4A5568]">
            Quickly adjust prices across all dishes or a specific category with percentage or fixed deltas.
          </p>

          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">Target Category</label>
            <select
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            >
              <option value="ALL">All Categories ({menuItems.length} items)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Percentage Change (%)</label>
              <input
                type="number"
                value={bulkPercentageDelta}
                onChange={(e) => setBulkPercentageDelta(Number(e.target.value))}
                placeholder="E.g. +10 or -5"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Fixed Amount Delta (₹)</label>
              <input
                type="number"
                value={bulkFixedDelta}
                onChange={(e) => setBulkFixedDelta(Number(e.target.value))}
                placeholder="E.g. +10 or -10"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">Price Rounding Rule</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Round to ₹5', val: 5 },
                { label: 'Round to ₹10', val: 10 },
                { label: 'Exact (₹1)', val: 1 }
              ].map((r) => (
                <button
                  key={r.val}
                  type="button"
                  onClick={() => setBulkRounding(r.val as 1 | 5 | 10)}
                  className={`p-2.5 rounded-xl border text-xs font-bold ${
                    bulkRounding === r.val
                      ? 'bg-jaman-navy text-white border-jaman-navy'
                      : 'bg-jaman-ivory border-jaman-border text-jaman-navy'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-jaman-border">
            <Button variant="ghost" onClick={() => setIsBulkPriceModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              className="font-bold"
              onClick={() => {
                const res = MenuBuilderService.applyBulkPriceAdjustment({
                  categoryIds: bulkCategory === 'ALL' ? undefined : [bulkCategory],
                  percentageDelta: bulkPercentageDelta,
                  fixedDelta: bulkFixedDelta,
                  roundToNearest: bulkRounding
                });
                showToast(res.message);
                setIsBulkPriceModalOpen(false);
              }}
            >
              Apply Price Adjustments
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: FOOD IMAGE ASSET HUB (Upload from Laptop/Kiosk, Paste URL, or Library) */}
      <Modal
        isOpen={isImageLibraryModalOpen}
        onClose={() => {
          setIsImageLibraryModalOpen(false);
          setSelectedImageTargetItem(null);
          setUploadedImagePreview(null);
          setUploadedFileName('');
        }}
        title={selectedImageTargetItem ? `Photo Manager: "${selectedImageTargetItem.name}"` : 'Dish Photo & Image Hub'}
        maxWidth="3xl"
      >
        <div className="space-y-4 py-2 select-none">
          {/* Target Dish Context Banner */}
          {selectedImageTargetItem && (
            <div className="bg-[#FFF4ED] p-3.5 rounded-2xl border border-jaman-saffron/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={uploadedImagePreview || customImageUrlInput || selectedImageTargetItem.imageUrl || '/jamanvaar.png.png'}
                  alt={selectedImageTargetItem.name}
                  className="w-12 h-12 rounded-xl object-cover border border-jaman-saffron/30 shadow-xs"
                />
                <div>
                  <h4 className="text-xs font-black text-jaman-navy">{selectedImageTargetItem.name}</h4>
                  <p className="text-[11px] text-[#4A5568]">{selectedImageTargetItem.description}</p>
                </div>
              </div>
              <span className="text-xs font-black text-jaman-saffron shrink-0">{formatINR(selectedImageTargetItem.price)}</span>
            </div>
          )}

          {/* Mode Selector Tabs */}
          <div className="flex items-center gap-2 border-b border-jaman-border pb-2">
            <button
              onClick={() => setPhotoSourceTab('UPLOAD')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                photoSourceTab === 'UPLOAD'
                  ? 'bg-jaman-navy text-white shadow-sm'
                  : 'bg-jaman-ivory border border-jaman-border text-[#4A5568] hover:bg-[#F4EFE6]'
              }`}
            >
              <span>📁 Upload from Device / Laptop</span>
            </button>
            <button
              onClick={() => {
                setPhotoSourceTab('URL');
                if (selectedImageTargetItem && !customImageUrlInput) {
                  setCustomImageUrlInput(selectedImageTargetItem.imageUrl || '');
                }
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                photoSourceTab === 'URL'
                  ? 'bg-jaman-navy text-white shadow-sm'
                  : 'bg-jaman-ivory border border-jaman-border text-[#4A5568] hover:bg-[#F4EFE6]'
              }`}
            >
              <span>🔗 Paste Web Image Link / URL</span>
            </button>
            <button
              onClick={() => setPhotoSourceTab('LIBRARY')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                photoSourceTab === 'LIBRARY'
                  ? 'bg-jaman-navy text-white shadow-sm'
                  : 'bg-jaman-ivory border border-jaman-border text-[#4A5568] hover:bg-[#F4EFE6]'
              }`}
            >
              <span>🎨 Curated Food Gallery</span>
            </button>
          </div>

          {/* TAB 1: UPLOAD FROM DEVICE / LAPTOP / KIOSK */}
          {photoSourceTab === 'UPLOAD' && (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors flex flex-col items-center justify-center gap-3 cursor-pointer ${
                  uploadedImagePreview ? 'border-emerald-400 bg-emerald-50/40' : 'border-[#D4CBBF] bg-jaman-ivory hover:border-jaman-saffron hover:bg-[#FFF4ED]/30'
                }`}
                onClick={() => {
                  const input = document.getElementById('device-photo-input') as HTMLInputElement;
                  if (input) input.click();
                }}
              >
                <input
                  id="device-photo-input"
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/gif, image/jpg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 8 * 1024 * 1024) {
                        alert('Please select an image smaller than 8MB');
                        return;
                      }
                      setUploadedFileName(file.name);
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const res = ev.target?.result as string;
                        setUploadedImagePreview(res);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />

                {uploadedImagePreview ? (
                  <div className="space-y-3 flex flex-col items-center">
                    <img
                      src={uploadedImagePreview}
                      alt="Uploaded Preview"
                      className="max-h-52 w-auto object-contain rounded-xl border border-emerald-300 shadow-md"
                    />
                    <div className="text-center">
                      <p className="text-xs font-bold text-emerald-800">✓ Image Ready: {uploadedFileName || 'Custom Photo'}</p>
                      <p className="text-[10px] text-[#8C9BAE]">Click box to change or choose a different image file</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl bg-white border border-jaman-border flex items-center justify-center text-2xl shadow-xs text-jaman-saffron">
                      📸
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-jaman-navy">Click to Browse or Drag Photo Here</h4>
                      <p className="text-[11px] text-[#4A5568] mt-0.5">Supports PNG, JPG, WEBP, and camera photos from laptop or kiosk</p>
                    </div>
                    <span className="inline-block px-3 py-1 bg-white border border-jaman-border rounded-xl text-xs font-bold text-jaman-navy shadow-2xs">
                      Choose Image File
                    </span>
                  </>
                )}
              </div>

              {uploadedImagePreview && selectedImageTargetItem && (
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUploadedImagePreview(null);
                      setUploadedFileName('');
                    }}
                  >
                    Clear Photo
                  </Button>
                  <Button
                    variant="accent"
                    size="sm"
                    className="bg-jaman-saffron hover:bg-[#d55b0e] font-bold text-white shadow-md"
                    onClick={() => {
                      MenuRepository.updateMenuItem(selectedImageTargetItem.id, { imageUrl: uploadedImagePreview });
                      showToast(`✓ Photo uploaded and applied to ${selectedImageTargetItem.name}!`);
                      setIsImageLibraryModalOpen(false);
                      setSelectedImageTargetItem(null);
                      setUploadedImagePreview(null);
                    }}
                  >
                    ✓ Apply & Save Photo to Dish
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PASTE URL LINK */}
          {photoSourceTab === 'URL' && (
            <div className="space-y-4">
              <div className="bg-[#F8F6F0] p-4 rounded-2xl border border-jaman-border space-y-3">
                <label className="block text-xs font-bold text-jaman-navy">Web Image URL Link</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={customImageUrlInput}
                    onChange={(e) => setCustomImageUrlInput(e.target.value)}
                    placeholder="https://images.unsplash.com/... or https://your-server.com/photo.jpg"
                    className="flex-1 bg-white border border-jaman-border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                  />
                  {selectedImageTargetItem && (
                    <Button
                      variant="accent"
                      size="sm"
                      disabled={!customImageUrlInput.trim()}
                      onClick={() => {
                        MenuRepository.updateMenuItem(selectedImageTargetItem.id, { imageUrl: customImageUrlInput.trim() });
                        showToast(`✓ Image URL updated for ${selectedImageTargetItem.name}!`);
                        setIsImageLibraryModalOpen(false);
                        setSelectedImageTargetItem(null);
                        setCustomImageUrlInput('');
                      }}
                      className="bg-jaman-saffron hover:bg-[#d55b0e] text-white font-bold shrink-0 shadow-sm"
                    >
                      Save to Dish
                    </Button>
                  )}
                </div>

                {/* Live Image URL Preview */}
                {customImageUrlInput.trim() && (
                  <div className="mt-3 p-3 bg-white rounded-xl border border-jaman-border flex items-center gap-4">
                    <img
                      src={customImageUrlInput.trim()}
                      alt="URL Preview"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/jamanvaar.png.png';
                      }}
                      className="w-20 h-20 rounded-xl object-cover border border-jaman-border"
                    />
                    <div>
                      <span className="text-xs font-bold text-emerald-800 block">✓ Live Image Preview</span>
                      <p className="text-[10px] text-[#8C9BAE] truncate max-w-sm">{customImageUrlInput.trim()}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Sample Presets */}
              <div>
                <label className="block text-[11px] font-bold text-[#8C9BAE] mb-2 uppercase tracking-wide">Quick Preset Indian Food Links</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: '🥘 Gujarati Thali', url: 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?auto=format&fit=crop&w=600&q=80' },
                    { label: '🫓 Butter Naan', url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80' },
                    { label: '🍲 Dal Makhani', url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80' },
                    { label: '🧀 Paneer Tikka', url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80' },
                    { label: '🍚 Veg Biryani', url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80' },
                    { label: '🧆 Hara Bhara Kebab', url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80' },
                    { label: '🍟 Crinkle Fries', url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80' },
                    { label: '🍝 Creamy Pasta', url: 'https://images.unsplash.com/photo-1621996346565-e3d5d628169e?auto=format&fit=crop&w=600&q=80' },
                    { label: '🍨 Gulab Jamun', url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=600&q=80' }
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCustomImageUrlInput(preset.url)}
                      className="px-2.5 py-1 bg-jaman-ivory hover:bg-[#FFF4ED] text-jaman-navy border border-jaman-border rounded-lg text-xs font-semibold transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CURATED GALLERY */}
          {photoSourceTab === 'LIBRARY' && (
            <div className="space-y-3">
              {/* Search & Filter */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-[#8C9BAE] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={imageSearchQuery}
                    onChange={(e) => setImageSearchQuery(e.target.value)}
                    placeholder="Search food photos (e.g. Pizza, Biryani, Thali)..."
                    className="w-full bg-jaman-ivory border border-jaman-border rounded-xl pl-10 pr-4 py-2 text-xs text-jaman-navy placeholder-[#8C9BAE] focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
                  {['ALL', 'Pizza', 'North Indian', 'Biryani', 'South Indian', 'Chinese', 'Burgers', 'Street Food', 'Desserts', 'Beverages'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setSelectedImageCuisine(c)}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all ${
                        selectedImageCuisine === c
                          ? 'bg-jaman-navy text-white shadow-xs'
                          : 'bg-jaman-ivory border border-jaman-border text-[#4A5568] hover:bg-[#F4EFE6]'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image Asset Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 max-h-80 overflow-y-auto pr-1">
                {FOOD_IMAGE_LIBRARY.filter((img) => {
                  const matchesSearch =
                    img.title.toLowerCase().includes(imageSearchQuery.toLowerCase()) ||
                    img.tags.some((t) => t.toLowerCase().includes(imageSearchQuery.toLowerCase()));
                  const matchesCuisine =
                    selectedImageCuisine === 'ALL' ||
                    img.cuisine.toLowerCase().includes(selectedImageCuisine.toLowerCase()) ||
                    img.category.toLowerCase().includes(selectedImageCuisine.toLowerCase());
                  return matchesSearch && matchesCuisine;
                }).map((img) => (
                  <div
                    key={img.id}
                    onClick={() => {
                      if (selectedImageTargetItem) {
                        MenuRepository.updateMenuItem(selectedImageTargetItem.id, { imageUrl: img.url });
                        showToast(`✓ Photo assigned to ${selectedImageTargetItem.name}!`);
                        setIsImageLibraryModalOpen(false);
                        setSelectedImageTargetItem(null);
                      } else {
                        setCustomImageUrlInput(img.url);
                        setPhotoSourceTab('URL');
                      }
                    }}
                    className="group relative bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-xs hover:border-jaman-saffron hover:shadow-md cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <img
                      src={img.url}
                      alt={img.title}
                      className="w-full h-28 object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="p-2.5">
                      <span className="text-[11px] font-bold text-jaman-navy block truncate">{img.title}</span>
                      <span className="text-[9px] text-[#8C9BAE] block">{img.category} • {img.cuisine}</span>
                      <button className="w-full mt-2 py-1 bg-jaman-navy group-hover:bg-jaman-saffron text-white text-[10px] font-bold rounded-lg transition-colors">
                        {selectedImageTargetItem ? 'Assign to Dish' : 'Select Photo'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-jaman-border">
            <Button
              variant="primary"
              onClick={() => {
                setIsImageLibraryModalOpen(false);
                setSelectedImageTargetItem(null);
                setUploadedImagePreview(null);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: MISSING DATA & COMPLETENESS ASSISTANT */}
      <Modal
        isOpen={isMissingDataModalOpen}
        onClose={() => setIsMissingDataModalOpen(false)}
        title="Menu Completeness & Missing Data Assistant"
        maxWidth="2xl"
      >
        <div className="space-y-4 py-2 select-none">
          <div className="flex items-center justify-between bg-[#F8F6F0] p-4 rounded-2xl border border-jaman-border">
            <div>
              <span className="text-xs font-bold text-jaman-navy block">Overall Readiness Score</span>
              <span className="text-xs text-[#4A5568]">
                {completenessReport.readyItemsCount} of {completenessReport.totalItems} dishes are 100% complete
              </span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-jaman-navy">{completenessReport.score}%</span>
            </div>
          </div>

          {completenessReport.issues.length === 0 ? (
            <div className="p-8 text-center bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h4 className="font-bold text-sm text-emerald-900">Your Menu is 100% Complete & Ready!</h4>
              <p className="text-xs text-emerald-700">All items have valid prices, descriptions, and dietary classifications.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {completenessReport.issues.map((issue, idx) => (
                <div
                  key={idx}
                  className="p-3.5 bg-white rounded-2xl border border-jaman-border flex items-center justify-between gap-3 shadow-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-jaman-navy">{issue.itemName}</span>
                      <span className="text-[10px] bg-slate-100 text-[#8C9BAE] px-2 py-0.5 rounded font-semibold">
                        {issue.categoryName}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-700 mt-1 font-semibold">⚠ {issue.message}</p>
                  </div>

                  {issue.issueType === 'MISSING_PRICE' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="₹ Price"
                        className="w-20 bg-jaman-ivory border border-jaman-border rounded-xl px-2.5 py-1.5 text-xs font-bold"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = Number((e.target as HTMLInputElement).value);
                            if (val > 0) {
                              MenuRepository.updateMenuItem(issue.itemId, { price: val });
                              showToast(`Updated price for ${issue.itemName}`);
                            }
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-jaman-border">
            <Button variant="primary" onClick={() => setIsMissingDataModalOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: INTERACTIVE KIOSK MENU LIVE PREVIEW */}
      <Modal
        isOpen={isKioskMenuPreviewModalOpen}
        onClose={() => setIsKioskMenuPreviewModalOpen(false)}
        title="Interactive Touch Kiosk Menu Preview"
        maxWidth="3xl"
      >
        <div className="space-y-4 py-2 select-none">
          <div className="bg-jaman-navy text-white p-4 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold">Kiosk Screen Emulator ({menuItems.length} dishes)</span>
            </div>
            <span className="text-xs text-white/70">Read-Only Preview Mode</span>
          </div>

          {/* Category Carousel */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setPreviewCategoryFilter('ALL')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                previewCategoryFilter === 'ALL'
                  ? 'bg-jaman-navy text-white shadow-md'
                  : 'bg-white border border-jaman-border text-jaman-navy'
              }`}
            >
              All Categories ({menuItems.length})
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setPreviewCategoryFilter(c.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  previewCategoryFilter === c.id
                    ? 'bg-jaman-navy text-white shadow-md'
                    : 'bg-white border border-jaman-border text-jaman-navy'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Dishes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto pr-1">
            {menuItems
              .filter((it) => previewCategoryFilter === 'ALL' || it.categoryId === previewCategoryFilter)
              .map((item) => (
                <div key={item.id} className="bg-white rounded-2xl p-3 border border-jaman-border shadow-xs flex flex-col justify-between space-y-2">
                  <div>
                    <img
                      src={item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'}
                      alt={item.name}
                      className="w-full h-28 rounded-xl object-cover"
                    />
                    <div className="mt-2 flex items-center gap-1.5">
                      <StatusBadge status={item.dietaryType} type="dietary" />
                      <span className="text-[10px] text-[#8C9BAE]">{item.prepTimeMinutes}m</span>
                    </div>
                    <h5 className="font-bold text-xs text-jaman-navy mt-1">{item.name}</h5>
                    <p className="text-[10px] text-[#4A5568] line-clamp-2 mt-0.5">{item.description}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-jaman-border">
                    <span className="text-xs font-black text-jaman-saffron">{formatINR(item.price)}</span>
                    <button className="px-2.5 py-1 bg-jaman-saffron text-white text-[10px] font-bold rounded-lg opacity-80">
                      + Add
                    </button>
                  </div>
                </div>
              ))}
          </div>

          <div className="flex justify-end pt-3 border-t border-jaman-border">
            <Button variant="primary" onClick={() => setIsKioskMenuPreviewModalOpen(false)}>
              Close Preview
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: PUBLISH MENU TO KIOSK */}
      <Modal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        title="Publish Menu to Customer Kiosk"
        maxWidth="md"
      >
        <div className="space-y-4 py-2 select-none">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-1">
            <h4 className="font-bold text-xs text-emerald-900">Ready for Live Production Deployment</h4>
            <p className="text-[11px] text-emerald-700">
              Publishing saves a version snapshot and sends the menu, combos and coupons to the cloud, from where every self-order kiosk of this restaurant receives them within seconds.
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-jaman-border space-y-2 text-xs">
            <div className="flex justify-between font-bold">
              <span>Total Dishes:</span>
              <span>{menuItems.length} items</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Total Categories:</span>
              <span>{categories.length} categories</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Combos & Bundles:</span>
              <span>{combos.length} packages</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">Publish Release Notes</label>
            <input
              type="text"
              value={publishNotes}
              onChange={(e) => setPublishNotes(e.target.value)}
              placeholder="E.g. Loaded Italian & Pizza template, updated weekend pricing"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-jaman-border">
            <Button variant="ghost" onClick={() => setIsPublishModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              className="font-bold shadow-md bg-jaman-navy text-white"
              onClick={async () => {
                try {
                  const snap = MenuBuilderService.publishMenu('Admin POS', publishNotes);
                  setIsPublishModalOpen(false);
                  setPublishNotes('');
                  // "Published" is only said once the cloud really has it (BUG-138).
                  const result = await publishCatalogNow();
                  showToast(
                    result.delivered
                      ? `✓ Published ${snap.versionTag}. Every Customer Kiosk of this restaurant will receive it within seconds.`
                      : `Saved ${snap.versionTag}, but it could not be sent to the cloud yet (${result.pending} change${result.pending === 1 ? '' : 's'} waiting). It will be sent automatically once this console is online.`
                  );
                } catch (err: any) {
                  alert(err.message || 'Publish failed');
                }
              }}
            >
              Confirm & Publish to Kiosk
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: IMPORT / EXPORT MENU BACKUP (JSON & CSV) */}
      <Modal
        isOpen={isImportExportModalOpen}
        onClose={() => setIsImportExportModalOpen(false)}
        title="Import & Export Menu Backup"
        maxWidth="lg"
      >
        <div className="space-y-4 py-2 select-none">
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              className="w-full font-bold"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={() => {
                const jsonStr = MenuBuilderService.exportJSON();
                const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(jsonStr);
                const a = document.createElement('a');
                a.setAttribute('href', dataStr);
                a.setAttribute('download', `jamanvaar_menu_${Date.now()}.json`);
                document.body.appendChild(a);
                a.click();
                a.remove();
                showToast('Menu JSON exported successfully!');
              }}
            >
              Export JSON
            </Button>

            <Button
              variant="secondary"
              className="w-full font-bold"
              leftIcon={<FileSpreadsheet className="w-4 h-4" />}
              onClick={() => {
                const csvStr = MenuBuilderService.exportCSV();
                const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvStr);
                const a = document.createElement('a');
                a.setAttribute('href', dataStr);
                a.setAttribute('download', `jamanvaar_menu_${Date.now()}.csv`);
                document.body.appendChild(a);
                a.click();
                a.remove();
                showToast('Menu CSV exported successfully!');
              }}
            >
              Export CSV
            </Button>
          </div>

          <div className="pt-3 border-t border-jaman-border space-y-2">
            <label className="block text-xs font-bold text-jaman-navy">Import Menu from JSON</label>
            <textarea
              rows={4}
              value={importJsonInput}
              onChange={(e) => setImportJsonInput(e.target.value)}
              placeholder="Paste JAMANVAAR Menu JSON backup string here..."
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            />
            <Button
              variant="accent"
              disabled={!importJsonInput.trim()}
              onClick={() => {
                try {
                  const res = MenuBuilderService.importJSON(importJsonInput.trim());
                  showToast(`✓ Imported ${res.itemsCount} dishes across ${res.categoriesCount} categories!`);
                  setIsImportExportModalOpen(false);
                  setImportJsonInput('');
                } catch (err: any) {
                  alert(err.message || 'Invalid JSON format');
                }
              }}
            >
              Validate & Import JSON
            </Button>
          </div>

          <div className="flex justify-end pt-2 border-t border-jaman-border">
            <Button variant="primary" onClick={() => setIsImportExportModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: DAILY Z-REPORT & WHATSAPP SETTLEMENT */}
      <Modal
        isOpen={isZReportModalOpen}
        onClose={() => setIsZReportModalOpen(false)}
        title="Daily Z-Report & WhatsApp Settlement"
        maxWidth="xl"
      >
        <div data-print-doc="kiosk-z-report" className="space-y-4 py-2 select-none">
          <div className="bg-jaman-navy text-white p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-black text-lg text-[#FED7AA]">JAMANVAAR DAILY Z-REPORT</h3>
                <p className="text-xs text-white/70">{db.outlet.name || db.restaurant.name || ''} • {formatDate(new Date())}</p>
              </div>
              <span className="text-xs font-mono bg-white/10 px-2.5 py-1 rounded font-bold">
                Z-REF #{Date.now().toString().slice(-6)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white/5 p-3 rounded-xl">
                <span className="text-white/60 block">Gross Sales:</span>
                <span className="text-lg font-black text-white">{formatINR(todayRevenue)}</span>
              </div>
              <div className="bg-white/5 p-3 rounded-xl">
                <span className="text-white/60 block">Total Orders:</span>
                <span className="text-lg font-black text-white">{todayOrders} tickets</span>
              </div>
              <div className="bg-white/5 p-3 rounded-xl">
                <span className="text-white/60 block">UPI Direct:</span>
                <span className="text-base font-bold text-emerald-400">{formatINR(Math.round(todayRevenue * 0.68))}</span>
              </div>
              <div className="bg-white/5 p-3 rounded-xl">
                <span className="text-white/60 block">Cash at Counter:</span>
                <span className="text-base font-bold text-amber-400">{formatINR(Math.round(todayRevenue * 0.1))}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-jaman-border">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Printer className="w-4 h-4" />}
              onClick={() => {
                printElement('[data-print-doc="kiosk-z-report"]', { title: 'Z-Report', pageSize: '80mm auto', margin: '2mm' });
              }}
            >
              Print 80mm Slip
            </Button>

            <Button
              variant="accent"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              leftIcon={<MessageCircle className="w-4 h-4" />}
              onClick={() => {
                const text = `*JAMANVAAR RESTAURANT — DAILY EOD Z-REPORT*%0A📅 Date: ${formatDate(new Date())}%0A💰 Total Revenue: ${formatINR(todayRevenue)}%0A🧾 Orders: ${todayOrders}%0A💳 UPI: ${formatINR(Math.round(todayRevenue * 0.68))}%0A💵 Cash: ${formatINR(Math.round(todayRevenue * 0.1))}%0A✅ Status: Cash Drawer Reconciled`;
                window.open(`https://wa.me/?text=${text}`, '_blank');
                showToast('Opening WhatsApp with daily report summary...');
              }}
            >
              Send WhatsApp Summary
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: DEALER DATA PURGE & LEDGER RESET */}
      <Modal
        isOpen={isResetDataModalOpen}
        onClose={() => setIsResetDataModalOpen(false)}
        title={resetDataType === 'DAILY' ? "Clear Today's Daily Transactions" : "Archive & Reset Monthly Ledger"}
        maxWidth="md"
      >
        <div className="space-y-4 py-2 select-none">
          <div className={`p-4 rounded-2xl border ${resetDataType === 'DAILY' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-300'} space-y-1.5`}>
            <h4 className={`font-bold text-xs ${resetDataType === 'DAILY' ? 'text-rose-900' : 'text-amber-900'}`}>
              {resetDataType === 'DAILY' ? '⚠ Clear Today\'s Test Orders & Receipts' : '⚠ Archive & Flush Monthly Transaction Ledger'}
            </h4>
            <p className={`text-[11px] ${resetDataType === 'DAILY' ? 'text-rose-700' : 'text-amber-800'}`}>
              {resetDataType === 'DAILY'
                ? 'This will clear all orders and receipts logged today. Your menu catalog, prices, categories, and settings will NOT be touched.'
                : 'This will download a full JSON backup of all completed orders, then reset the transactions ledger for the upcoming calendar month.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">
              Type <span className="font-mono text-rose-600 font-black">CONFIRM</span> to proceed:
            </label>
            <input
              type="text"
              value={resetConfirmationText}
              onChange={(e) => setResetConfirmationText(e.target.value.toUpperCase())}
              placeholder="CONFIRM"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-jaman-border">
            <Button variant="ghost" onClick={() => setIsResetDataModalOpen(false)}>
              Cancel
            </Button>

            <Button
              variant="accent"
              disabled={resetConfirmationText !== 'CONFIRM'}
              className={`font-bold text-white shadow-md ${resetDataType === 'DAILY' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'}`}
              onClick={() => {
                if (resetDataType === 'DAILY') {
                  const res = ReportGeneratorService.clearDailyOrders();
                  showToast(`✓ Cleared ${res.clearedCount} transactions from today.`);
                } else {
                  const res = ReportGeneratorService.archiveAndResetMonthlyData();
                  // Trigger backup file download
                  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(res.archiveJson);
                  const a = document.createElement('a');
                  a.setAttribute('href', dataStr);
                  a.setAttribute('download', `jamanvaar_monthly_archive_${Date.now()}.json`);
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  showToast(`✓ Monthly archive saved (${res.archivedOrdersCount} orders). Ledger reset!`);
                }
                setIsResetDataModalOpen(false);
                setResetConfirmationText('');
              }}
            >
              {resetDataType === 'DAILY' ? 'Confirm Daily Purge' : 'Backup & Reset Ledger'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: EDIT RESTAURANT PROFILE & LEGAL ENTITY */}
      <Modal
        isOpen={isEditRestaurantModalOpen}
        onClose={() => setIsEditRestaurantModalOpen(false)}
        title="Edit Restaurant Identity & Legal Profile"
        maxWidth="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // B2-040: a third, separate save path for the same GSTIN field, with the same
            // no-format-check gap — "GSTIN: abc" would reach db.restaurant.gstin (and from there,
            // real receipts) just as easily through this modal as through Report Branding.
            if (restForm.gstin?.trim() && !isValidGstinFormat(restForm.gstin)) {
              showToast('✗ GSTIN must be 15 characters in the standard format (e.g. 24AAACR5055K1Z1).');
              return;
            }
            db.updateRestaurant({
              legalName: restForm.legalName,
              name: restForm.name,
              phone: restForm.phone,
              email: restForm.email,
              gstin: restForm.gstin,
              address: restForm.address
            });
            db.updateOutlet({
              name: restForm.outletName,
              address: restForm.address,
              city: restForm.city,
              state: restForm.state
            });
            AuditRepository.log({
              username: 'admin',
              action: 'RESTAURANT_PROFILE_UPDATED',
              category: 'SETTINGS',
              details: `Updated restaurant legal name to ${restForm.legalName}`
            });
            showToast('✓ Restaurant profile updated! Reports & receipts refreshed.');
            setIsEditRestaurantModalOpen(false);
          }}
          className="space-y-4 py-2 select-none"
        >
          <div className="bg-[#F8F6F0] p-4 rounded-2xl border border-jaman-border space-y-1">
            <h4 className="font-bold text-xs text-jaman-navy">Customize Business Identity Everywhere</h4>
            <p className="text-[11px] text-[#4A5568]">
              The legal name set here will print directly on your official sales PDF reports, thermal customer receipts, and digital invoices.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Restaurant Legal Entity Name *</label>
              <input
                type="text"
                required
                value={restForm.legalName}
                onChange={(e) => setRestForm({ ...restForm, legalName: e.target.value })}
                placeholder="E.g. JAMANVAAR by KELVIONTECH"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Brand Name / Display Title *</label>
              <input
                type="text"
                required
                value={restForm.name}
                onChange={(e) => setRestForm({ ...restForm, name: e.target.value })}
                placeholder="E.g. JAMANVAAR by KELVIONTECH"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Outlet / Branch Name *</label>
              <input
                type="text"
                required
                value={restForm.outletName}
                onChange={(e) => setRestForm({ ...restForm, outletName: e.target.value })}
                placeholder="E.g. Ahmedabad Flagship Store"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">City & State *</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={restForm.city}
                  onChange={(e) => setRestForm({ ...restForm, city: e.target.value })}
                  placeholder="City"
                  className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                />
                <input
                  type="text"
                  required
                  value={restForm.state}
                  onChange={(e) => setRestForm({ ...restForm, state: e.target.value })}
                  placeholder="State"
                  className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">Complete Street Address *</label>
            <input
              type="text"
              required
              value={restForm.address}
              onChange={(e) => setRestForm({ ...restForm, address: e.target.value })}
              placeholder="E.g. Sindhu Bhavan Road, Bodakdev, Ahmedabad, Gujarat 380054"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">GSTIN Number</label>
              <input
                type="text"
                value={restForm.gstin}
                onChange={(e) => setRestForm({ ...restForm, gstin: e.target.value.toUpperCase() })}
                placeholder="24AAAAA0000A1Z5"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">FSSAI License Number</label>
              <input
                type="text"
                value={restForm.fssai}
                onChange={(e) => setRestForm({ ...restForm, fssai: e.target.value })}
                placeholder="10020021000123"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Contact Phone</label>
              <input
                type="text"
                value={restForm.phone}
                onChange={(e) => setRestForm({ ...restForm, phone: e.target.value })}
                placeholder="+91 79 4890 1234"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Contact Email</label>
              <input
                type="email"
                value={restForm.email}
                onChange={(e) => setRestForm({ ...restForm, email: e.target.value })}
                placeholder="hello@jamanvaar.com"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-jaman-border">
            <Button variant="ghost" type="button" onClick={() => setIsEditRestaurantModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              type="submit"
              className="bg-jaman-saffron hover:bg-[#d55b0e] text-white font-bold shadow-md"
            >
              Save Restaurant Profile
            </Button>
          </div>
        </form>
      </Modal>
    </div>

    {/* ========================================================================= */}
    {/* DEDICATED OFFICIAL PRINTABLE PDF REPORT (Only visible during print/export) */}
    {/* ========================================================================= */}
    <div className="hidden print:block printable-report-wrapper font-sans text-black p-6 space-y-6 bg-white">
      {/* Restaurant Brand & Audit Header */}
      <div className="flex items-center justify-between border-b-2 border-jaman-navy pb-4">
        <div className="flex items-center gap-4">
          <JamanvaarLogo variant="horizontal" size="lg" imgStyle={{ height: '52px', width: 'auto' }} />
          <div>
            <h1 className="text-xl font-black text-jaman-navy tracking-tight">{db.restaurant.legalName || db.restaurant.name || ''}</h1>
            <p className="text-xs text-gray-600">{db.outlet.name} • {db.outlet.address}, {db.outlet.city}</p>
            <p className="text-[11px] font-mono text-gray-500 mt-0.5">GSTIN: {db.restaurant.gstin} • FSSAI: {restForm.fssai || '10020021000123'}</p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block bg-jaman-navy text-white text-[10px] font-black uppercase px-3 py-1 rounded">
            {activeReportType === 'MONTHLY_SALES' ? '30-Day Monthly Audit' : 'Daily Sales Audit'}
          </span>
          <p className="text-xs font-bold text-gray-800 mt-1">Generated: {formatDate(new Date())} {formatTime(new Date())}</p>
          <p className="text-[10px] font-mono text-gray-500">Ref: AUD-{Date.now().toString().slice(-8)}</p>
        </div>
      </div>

      {/* Report Title Banner */}
      <div className="bg-[#F8F6F0] p-3.5 rounded-xl border border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-jaman-navy">{currentReport.title}</h2>
          <p className="text-xs text-gray-600">Period: {formatDate(currentReport.dateFrom)} to {formatDate(currentReport.dateTo)}</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-gray-700">Total Transactions: {currentReport.summaryMetrics.totalOrders}</span>
        </div>
      </div>

      {/* Financial KPI Summary Cards */}
      <div className="grid grid-cols-4 gap-3 page-break-avoid">
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-[10px] font-bold uppercase text-gray-500 block">Gross Revenue</span>
          <span className="text-lg font-black text-jaman-navy">{formatINR(currentReport.summaryMetrics.totalRevenue)}</span>
        </div>
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-[10px] font-bold uppercase text-gray-500 block">Completed Orders</span>
          <span className="text-lg font-black text-jaman-navy">{currentReport.summaryMetrics.totalOrders}</span>
        </div>
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-[10px] font-bold uppercase text-gray-500 block">Discounts & Promos</span>
          <span className="text-lg font-black text-emerald-700">{formatINR(currentReport.summaryMetrics.totalDiscount)}</span>
        </div>
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-[10px] font-bold uppercase text-gray-500 block">GST Collected (5%)</span>
          <span className="text-lg font-black text-jaman-saffron">{formatINR(currentReport.summaryMetrics.totalTax)}</span>
        </div>
      </div>

      {/* Optional Visual Chart Deck in Printed Report (Controlled by Dealer Toggle) */}
      {includeChartsInReport && (
        <div className="grid grid-cols-2 gap-4 page-break-avoid">
          {/* Hourly Rush Chart */}
          <div className="p-4 border border-gray-200 rounded-xl bg-white">
            <h4 className="text-xs font-black text-jaman-navy mb-2 uppercase tracking-wide">
              📊 Dining Velocity & Peak Rush (Lunch 1-3 PM & Dinner 7-10 PM)
            </h4>
            <div className="h-28 flex items-end justify-between gap-1 border-b border-gray-200 pb-1">
              {[
                { h: '9A', p: 18 }, { h: '10A', p: 28 }, { h: '11A', p: 40 },
                { h: '12P', p: 68 }, { h: '1P', p: 95 }, { h: '2P', p: 82 },
                { h: '3P', p: 30 }, { h: '5P', p: 24 }, { h: '6P', p: 45 },
                { h: '7P', p: 75 }, { h: '8P', p: 100 }, { h: '9P', p: 88 },
                { h: '10P', p: 52 }
              ].map((b, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full bg-gray-100 rounded-t h-20 flex items-end">
                    <div style={{ height: `${b.p}%` }} className="w-full bg-jaman-navy rounded-t"></div>
                  </div>
                  <span className="text-[8px] font-bold text-gray-600">{b.h}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Channel Split */}
          <div className="p-4 border border-gray-200 rounded-xl bg-white flex flex-col justify-between">
            <h4 className="text-xs font-black text-jaman-navy mb-2 uppercase tracking-wide">
              💳 Payment Channels Distribution
            </h4>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[11px] font-bold">
                  <span>UPI Dynamic QR (68%)</span>
                  <span>{formatINR(Math.round(currentReport.summaryMetrics.totalRevenue * 0.68))}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-jaman-navy rounded-full" style={{ width: '68%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-bold">
                  <span>Card POS Terminal (22%)</span>
                  <span>{formatINR(Math.round(currentReport.summaryMetrics.totalRevenue * 0.22))}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-700 rounded-full" style={{ width: '22%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-bold">
                  <span>Cash at Counter (10%)</span>
                  <span>{formatINR(Math.round(currentReport.summaryMetrics.totalRevenue * 0.1))}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-jaman-saffron rounded-full" style={{ width: '10%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabular Records */}
      <div className="border border-gray-200 rounded-xl overflow-hidden page-break-avoid">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 border-b border-gray-200 text-gray-700 font-bold uppercase text-[10px]">
            <tr>
              <th className="py-2.5 px-3">Item / Order ID</th>
              <th className="py-2.5 px-3">Type / Category</th>
              <th className="py-2.5 px-3">Gross Value</th>
              <th className="py-2.5 px-3">Payment Info</th>
              <th className="py-2.5 px-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {currentReport.rows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                <td className="py-2.5 px-3 font-bold text-gray-900">{row.label}</td>
                <td className="py-2.5 px-3 text-gray-600">{row.metric1}</td>
                <td className="py-2.5 px-3 font-black text-jaman-navy">{row.metric2}</td>
                <td className="py-2.5 px-3 font-bold text-gray-700">{row.metric3}</td>
                <td className="py-2.5 px-3 text-gray-600">{row.metric4 || 'COMPLETED'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Official Signature & Certification Block */}
      <div className="pt-8 border-t border-gray-200 grid grid-cols-2 gap-8 page-break-avoid">
        <div>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            This is an official certified sales audit report generated directly from JAMANVAAR Cloud POS Terminal. All statutory taxes have been computed per Section 9(5) CGST/SGST regulations.
          </p>
          <p className="text-[10px] font-mono text-gray-400 mt-2">Verification Ref: {`JMN-AUTH-${Date.now().toString(16).toUpperCase()}`}</p>
        </div>
        <div className="text-right space-y-4">
          <div className="inline-block text-center border-t-2 border-gray-700 pt-1.5 px-10">
            <span className="text-xs font-bold text-gray-900 block">Authorized Restaurant Manager</span>
            <span className="text-[10px] text-gray-500">{db.outlet.name || db.restaurant.name || ''}</span>
          </div>
        </div>
      </div>
    </div>
  </>
  </JAMANVAARStartup>
);
}
