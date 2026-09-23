import React, { useState, useMemo, useEffect } from 'react';
import { db, QrOrderingRepository, BusinessDayRepository, MenuRepository, TableRepository, getGuestOrderBaseUrl } from '@jamanvaar/database';
import { Order, DiningTable, MenuItem, QrOrderingSettings, OrderStatus } from '@jamanvaar/types';
import { EntitlementService, PLAN_DEFINITIONS } from '@jamanvaar/business';
import { formatINR, generateQrSvg, generateQrDataUrl, copyText } from '@jamanvaar/utils';
import { lanMeshSync } from '@jamanvaar/sync';
import {
  QrCode,
  Smartphone,
  UtensilsCrossed,
  ShoppingBag,
  TrendingUp,
  Settings,
  Grid,
  CheckCircle2,
  Clock,
  Printer,
  Download,
  Copy,
  ExternalLink,
  Plus,
  Search,
  Filter,
  Eye,
  ArrowRight,
  Flame,
  ChefHat,
  ShieldCheck,
  Radio,
  Zap,
  AlertCircle,
  Volume2,
  VolumeX,
  Sliders,
  DollarSign,
  Edit2,
  Check,
  Lock,
  Crown,
  ShieldAlert,
  Trash2,
  RefreshCw,
  X
} from 'lucide-react';
import { CustomerQrExperienceModal } from './CustomerQrExperienceModal';
import { QrCardDesignerModal } from './QrCardDesignerModal';
import { QrDishConfigModal } from './QrDishConfigModal';

export type QrAdminSubTab = 'OVERVIEW' | 'TABLES' | 'MENU' | 'ORDERS' | 'ANALYTICS' | 'SETTINGS';

export const QrOrderingModule: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<QrAdminSubTab>('OVERVIEW');
  const [tick, setTick] = useState<number>(0);

  // Modals state
  const [isCustomerPreviewOpen, setIsCustomerPreviewOpen] = useState<boolean>(false);
  const [previewTableNumber, setPreviewTableNumber] = useState<string>('1');
  const [previewOrderId, setPreviewOrderId] = useState<string | undefined>(undefined);

  const [isCardDesignerOpen, setIsCardDesignerOpen] = useState<boolean>(false);
  const [designerTable, setDesignerTable] = useState<DiningTable | null>(null);

  const [isDishConfigOpen, setIsDishConfigOpen] = useState<boolean>(false);
  const [configDish, setConfigDish] = useState<MenuItem | null>(null);

  // Filters
  const [ordersStatusFilter, setOrdersStatusFilter] = useState<string>('ALL');
  const [ordersTableFilter, setOrdersTableFilter] = useState<string>('ALL');
  const [ordersSearch, setOrdersSearch] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [menuSearch, setMenuSearch] = useState<string>('');
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<string>('ALL');

  const [analyticsDateRange, setAnalyticsDateRange] = useState<string>('TODAY');

  // Table search and filters
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tableZoneFilter, setTableZoneFilter] = useState<string>('ALL');
  const [tableStatusFilter, setTableStatusFilter] = useState<string>('ALL');

  // Table add / edit modal states
  const [isAddTableOpen, setIsAddTableOpen] = useState<boolean>(false);
  const [newTableNumber, setNewTableNumber] = useState<string>('');
  const [newTableZone, setNewTableZone] = useState<string>('Main Dining Hall');
  const [newTableCapacity, setNewTableCapacity] = useState<number>(4);
  const [newTableFloor, setNewTableFloor] = useState<number>(1);

  const [addTableError, setAddTableError] = useState<string | null>(null);

  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);
  const [editCapacity, setEditCapacity] = useState<number>(4);
  const [editZone, setEditZone] = useState<string>('Main Dining Hall');

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Settings local state
  const [qrSettings, setQrSettings] = useState<QrOrderingSettings>(() => QrOrderingRepository.getSettings());
  const [settingsSavedToast, setSettingsSavedToast] = useState<boolean>(false);
  // Free-text/number drafts so we persist on blur instead of on every keystroke
  const [minOrderDraft, setMinOrderDraft] = useState<string>(() =>
    String(QrOrderingRepository.getSettings().minOrderValue ?? 0)
  );
  const [maxOrderDraft, setMaxOrderDraft] = useState<string>(() =>
    String(QrOrderingRepository.getSettings().maxOrderValue ?? 0)
  );
  const [welcomeDraft, setWelcomeDraft] = useState<string>(
    () => QrOrderingRepository.getSettings().welcomeMessage || ''
  );

  // Table selection & batch actions state
  const [selectedTableNumbers, setSelectedTableNumbers] = useState<string[]>([]);
  const [batchDesignerMode, setBatchDesignerMode] = useState<boolean>(false);

  // Subscribe to live DB updates
  useEffect(() => {
    const unsub = db.subscribe(() => {
      setTick((t) => t + 1);
      setQrSettings(QrOrderingRepository.getSettings());
    });
    return unsub;
  }, []);

  // Re-seed the settings drafts from the canonical record whenever the tab is opened,
  // so a change made elsewhere (or on another device) is reflected here.
  useEffect(() => {
    if (activeSubTab !== 'SETTINGS') return;
    const current = QrOrderingRepository.getSettings();
    setMinOrderDraft(String(current.minOrderValue ?? 0));
    setMaxOrderDraft(String(current.maxOrderValue ?? 0));
    setWelcomeDraft(current.welcomeMessage || '');
  }, [activeSubTab]);

  const tables = db.tables;
  const categories = db.categories;
  const menuItems = db.menuItems;
  const activeDay = BusinessDayRepository.getActiveBusinessDay();

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  // Filtered tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      if (tableStatusFilter === 'ACTIVE' && t.qrStatus === 'DISABLED') return false;
      if (tableStatusFilter === 'DISABLED' && t.qrStatus !== 'DISABLED') return false;
      if (tableZoneFilter !== 'ALL' && t.zone !== tableZoneFilter) return false;
      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase();
        const matchNum = t.tableNumber.toLowerCase().includes(q);
        const matchZone = t.zone?.toLowerCase().includes(q);
        return matchNum || matchZone;
      }
      return true;
    });
  }, [tables, tableStatusFilter, tableZoneFilter, tableSearch, tick]);

  const distinctZones = useMemo(() => {
    const set = new Set<string>();
    tables.forEach((t) => {
      if (t.zone) set.add(t.zone);
    });
    return Array.from(set);
  }, [tables, tick]);

  // QR Orders list
  const allQrOrders = useMemo(() => {
    return QrOrderingRepository.getQrOrders();
  }, [tick, db.orders]);

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (menuCategoryFilter !== 'ALL' && item.categoryId !== menuCategoryFilter) return false;
      if (menuSearch.trim()) {
        const q = menuSearch.toLowerCase();
        return item.name.toLowerCase().includes(q) || (item.sku || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [menuItems, menuCategoryFilter, menuSearch, tick]);

  const filteredQrOrders = useMemo(() => {
    return allQrOrders.filter((o) => {
      if (ordersStatusFilter !== 'ALL' && o.orderStatus !== ordersStatusFilter) return false;
      if (ordersTableFilter !== 'ALL' && o.tableNumber !== ordersTableFilter) return false;
      if (ordersSearch.trim()) {
        const q = ordersSearch.toLowerCase();
        const matchNum = o.orderNumber.toLowerCase().includes(q);
        const matchToken = o.tokenNumber.includes(q);
        const matchCust = o.customerName?.toLowerCase().includes(q) || o.customerNotes?.toLowerCase().includes(q);
        return matchNum || matchToken || matchCust;
      }
      return true;
    });
  }, [allQrOrders, ordersStatusFilter, ordersTableFilter, ordersSearch]);

  /** Real KOT tickets the kitchen received for the selected order. */
  const kotsForSelectedOrder = useMemo(() => {
    if (!selectedOrder) return [];
    return db.kots.filter((k) => k.orderId === selectedOrder.id);
  }, [selectedOrder, tick]);

  // Analytics Stats
  const qrStats = useMemo(() => {
    return QrOrderingRepository.getQrStats(analyticsDateRange);
  }, [tick, analyticsDateRange, db.orders]);

  /**
   * getQrStats() substitutes friendly placeholder strings for topDish/topTable when no
   * QR orders exist. The UI must never present those as measured results, so anything
   * derived from an empty order set is treated as "no data" here.
   */
  const hasQrOrderData = qrStats.totalOrders > 0;
  const tablesWithoutQr = useMemo(() => tables.filter((t) => !t.qrToken), [tables, tick]);

  /** Real service status for the Overview strip - no tile is hard-coded green. */
  const serviceStatuses = useMemo(() => {
    let meshOnline = false;
    let peerCount = 0;
    try {
      meshOnline = lanMeshSync.getIsOnline();
      peerCount = lanMeshSync.getConnectedPeers().length;
    } catch (err) {
      meshOnline = false;
    }

    const orderableDishes = menuItems.filter(
      (m) => m.isAvailable !== false && m.isQrOrderingEnabled !== false
    ).length;
    const activeQrTables = tables.filter((t) => t.qrStatus === 'ACTIVE' && Boolean(t.qrToken)).length;
    const openKots = db.kots.filter(
      (k) => k.status !== 'SERVED' && k.status !== 'CANCELLED'
    ).length;

    return [
      {
        key: 'QR_ORDERING',
        label: 'QR Ordering',
        ok: qrSettings.isQrOrderingActive && qrSettings.allowCustomerOrdering,
        value:
          qrSettings.isQrOrderingActive && qrSettings.allowCustomerOrdering ? 'ACCEPTING ORDERS' : 'PAUSED'
      },
      {
        key: 'MENU',
        label: 'Digital Menu',
        ok: orderableDishes > 0,
        value: orderableDishes > 0 ? `${orderableDishes} DISHES LIVE` : 'NO DISHES LIVE'
      },
      {
        key: 'TABLES',
        label: 'Table QR',
        ok: activeQrTables > 0,
        value: activeQrTables > 0 ? `${activeQrTables} / ${tables.length} ACTIVE` : 'NONE ISSUED'
      },
      {
        key: 'KDS',
        label: 'KDS Routing',
        ok: qrSettings.autoSendToKitchen,
        value: qrSettings.autoSendToKitchen ? `${openKots} OPEN KOT` : 'AUTO-DISPATCH OFF'
      },
      {
        key: 'MESH',
        label: 'LAN Mesh Sync',
        ok: meshOnline,
        value: meshOnline ? `${peerCount} ${peerCount === 1 ? 'PEER' : 'PEERS'}` : 'OFFLINE'
      }
    ];
  }, [qrSettings, menuItems, tables, tick]);

  // Handlers
  /** Opens the guest experience against a REAL table record; never invents a table number. */
  const handleOpenCustomerPreview = (tblNum?: string, ordId?: string) => {
    const target =
      (tblNum && tables.find((t) => t.tableNumber === tblNum)?.tableNumber) ||
      tables.find((t) => t.qrStatus === 'ACTIVE')?.tableNumber ||
      tables[0]?.tableNumber;

    if (!target) {
      showToast('Add a table in Tables & QR before opening the guest preview.');
      return;
    }

    setPreviewTableNumber(target);
    setPreviewOrderId(ordId);
    setIsCustomerPreviewOpen(true);
  };

  const handleOpenDesigner = (table: DiningTable) => {
    setDesignerTable(table);
    setIsCardDesignerOpen(true);
  };

  const handleOpenDishConfig = (item: MenuItem) => {
    setConfigDish(item);
    setIsDishConfigOpen(true);
  };

  const handleAdvanceOrderStatus = (orderId: string, nextStatus: OrderStatus) => {
    const updated = QrOrderingRepository.updateOrderStatus(orderId, nextStatus, 'POS Admin');
    if (updated) {
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...updated });
      }
      try {
        lanMeshSync.broadcast('ORDER_UPDATED', updated);
        lanMeshSync.broadcast('ORDER_STATUS_CHANGED', { orderId, orderStatus: nextStatus, order: updated });
      } catch (err) {
        console.warn('LAN Mesh order update broadcast skipped:', err);
      }
      setTick((t) => t + 1);
      showToast(`Order #${updated.orderNumber} marked ${nextStatus}`);
    }
  };

  const handleCancelOrder = (order: Order) => {
    if (
      !window.confirm(
        `Cancel QR order #${order.orderNumber} for Table ${order.tableNumber}? The kitchen will need to be told separately if it has already started.`
      )
    ) {
      return;
    }
    handleAdvanceOrderStatus(order.id, 'CANCELLED');
  };

  const handleDownloadQrSvg = (table: DiningTable) => {
    // BUG-119: the app's configured public address, never window.location.origin.
    const hostUrl = getGuestOrderBaseUrl();
    let token = table.qrToken;
    if (!token) {
      const generated = QrOrderingRepository.generateTableQr(table.tableNumber);
      token = generated.qrToken;
    }
    const url = `${hostUrl}/?qrTable=${table.tableNumber}&token=${token}`;
    const svg = generateQrSvg(url, { size: 400, margin: 4 });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `JAMANVAAR-Table-${table.tableNumber}-QR.svg`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast(`Downloaded Table ${table.tableNumber} vector QR SVG!`);
  };

  const [copiedQrTable, setCopiedQrTable] = useState<string | null>(null);

  const handleCopyQrLink = async (table: DiningTable) => {
    // BUG-119: the app's configured public address, never window.location.origin.
    const hostUrl = getGuestOrderBaseUrl();
    let token = table.qrToken;
    if (!token) {
      const generated = QrOrderingRepository.generateTableQr(table.tableNumber);
      token = generated.qrToken;
    }
    const url = `${hostUrl}/?qrTable=${table.tableNumber}&token=${token}`;
    const ok = await copyText(url);
    if (ok) {
      setCopiedQrTable(String(table.tableNumber));
      setTimeout(() => setCopiedQrTable(null), 2000);
    }
    showToast(ok ? `Copied Table ${table.tableNumber} QR URL to clipboard!` : 'Could not copy automatically. Open the QR view and copy the link from there.');
  };

  const handleRegenerateQr = (table: DiningTable) => {
    const result = QrOrderingRepository.regenerateTableQr(table.tableNumber);
    setTick((t) => t + 1);
    showToast(`Table ${result.tableNumber}: issued new secure token ${result.qrShortCode}`);
  };

  /** Issues a first QR token for a table that has never had one. */
  const handleGenerateQr = (table: DiningTable) => {
    const result = QrOrderingRepository.generateTableQr(table.tableNumber);
    setTick((t) => t + 1);
    showToast(`Table ${result.tableNumber}: QR ${result.qrShortCode} issued`);
  };

  const handleBulkRegenerateQr = () => {
    if (selectedTableNumbers.length === 0) return;
    if (
      !window.confirm(
        `Rotate QR tokens for ${selectedTableNumbers.length} table(s)? Standees already printed with the old tokens will stop working and must be reprinted.`
      )
    ) {
      return;
    }
    const count = QrOrderingRepository.bulkGenerateQr(selectedTableNumbers);
    setSelectedTableNumbers([]);
    setTick((t) => t + 1);
    showToast(`Rotated secure QR tokens for ${count} table${count === 1 ? '' : 's'}`);
  };

  const handleSaveAddTable = () => {
    const num = newTableNumber.trim();
    if (!num) {
      setAddTableError('Enter a table number or name.');
      return;
    }
    if (tables.some((t) => t.tableNumber.toLowerCase() === num.toLowerCase())) {
      setAddTableError(`Table ${num} already exists in this outlet.`);
      return;
    }

    // Render from the record the repository hands back, never from local assumptions
    const created = QrOrderingRepository.addTable({
      tableNumber: num,
      zone: newTableZone.trim() || 'Main Dining Hall',
      capacity: Number(newTableCapacity),
      floor: Number(newTableFloor)
    });

    setIsAddTableOpen(false);
    setAddTableError(null);
    setNewTableNumber('');
    setTick((t) => t + 1);
    showToast(`Table ${created.tableNumber} created with QR ${created.qrShortCode}`);
  };

  const handleSaveEditTable = () => {
    if (!editingTable) return;
    const updated = TableRepository.updateTable(editingTable.id, {
      capacity: Number(editCapacity),
      zone: editZone.trim() || editingTable.zone
    });
    setEditingTable(null);
    setTick((t) => t + 1);
    showToast(
      updated
        ? `Table ${updated.tableNumber} updated (${updated.zone}, ${updated.capacity} seats)`
        : 'That table no longer exists.'
    );
  };

  const handleDeleteTable = (table: DiningTable) => {
    if (table.status === 'OCCUPIED' || table.currentOrderId) {
      showToast(`Table ${table.tableNumber} has a live order. Settle it before removing the table.`);
      return;
    }
    if (
      window.confirm(
        `Remove Table ${table.tableNumber}? Its QR code will stop working and printed standees must be discarded.`
      )
    ) {
      const removed = QrOrderingRepository.deleteTable(table.id);
      setSelectedTableNumbers((prev) => prev.filter((n) => n !== table.tableNumber));
      setTick((t) => t + 1);
      showToast(removed ? `Removed Table ${table.tableNumber}` : 'That table was already removed.');
    }
  };

  const handleSaveSettings = (updates: Partial<QrOrderingSettings>) => {
    const next = QrOrderingRepository.updateSettings(updates);
    setQrSettings({ ...next });
    setSettingsSavedToast(true);
    setTimeout(() => setSettingsSavedToast(false), 2500);
  };

  const handleToggleTableSelect = (tblNum: string) => {
    setSelectedTableNumbers((prev) =>
      prev.includes(tblNum) ? prev.filter((x) => x !== tblNum) : [...prev, tblNum]
    );
  };

  const handleSelectAllTables = () => {
    if (selectedTableNumbers.length === tables.length) {
      setSelectedTableNumbers([]);
    } else {
      setSelectedTableNumbers(tables.map((t) => t.tableNumber));
    }
  };



  const handleBulkUpdateStatus = (status: 'ACTIVE' | 'DISABLED') => {
    if (selectedTableNumbers.length === 0) return;
    const count = QrOrderingRepository.bulkUpdateQrStatus(selectedTableNumbers, status);
    setSelectedTableNumbers([]);
    setTick((t) => t + 1);
    showToast(`${count} table${count === 1 ? '' : 's'} set to ${status}`);
  };

  const handleToggleSingleTableStatus = (table: DiningTable) => {
    const nextStatus = table.qrStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    QrOrderingRepository.bulkUpdateQrStatus([table.tableNumber], nextStatus);
    setTick((t) => t + 1);
    showToast(`Table ${table.tableNumber} QR ${nextStatus === 'ACTIVE' ? 'enabled' : 'disabled'}`);
  };

  const handleOpenBatchDesigner = () => {
    if (tables.length === 0) {
      showToast('Add at least one table before printing standees.');
      return;
    }
    setBatchDesignerMode(true);
    setDesignerTable(tables[0]);
    setIsCardDesignerOpen(true);
  };

  // ENT-001 / SEC-002 fix: this module used to ship a one-click "Simulate Super
  // Admin Allotment" button that called LicenseRepository.activatePlan() directly
  // — any restaurant on CORE could unlock PRO-only QR ordering for free with no
  // verification at all. Plan changes now only happen via Settings → Subscription
  // Plan, either through a real cloud-connected session or a Super-Admin-signed
  // License Certificate (see SubscriptionPlansView.tsx).

  // Plan Entitlement Check (QR Table Ordering requires ₹7,000 PRO plan allotted by Super Admin)
  const license = db.license;
  const qrEntitlement = EntitlementService.checkQrOrderingAccess();
  const isAllowed = qrEntitlement.allowed;

  // Render Plan Locked Screen if restaurant is on 5K CORE plan
  if (!isAllowed) {
    return (
      <div className="flex-1 flex flex-col h-full bg-jaman-cream overflow-y-auto select-none p-6">
        <div className="max-w-4xl mx-auto w-full space-y-6">
          {/* Top Status Strip */}
          <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-jaman-navy">QR Table Ordering — Locked Module</h2>
                  <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    Current: JAMANVAAR CORE (₹5,000/mo)
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Feature restricted to JAMANVAAR PRO (₹7,000/mo). Allotment is provisioned by Super Admin.
                </p>
              </div>
            </div>

            <span className="text-xs text-slate-500 font-medium">
              Ask Super Admin to allot the PRO plan, or open Settings → Subscription Plan to activate a License Certificate.
            </span>
          </div>

          {/* Hero Explanatory Card */}
          <div className="bg-gradient-to-br from-jaman-navy to-[#123959] text-white rounded-3xl p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-jaman-saffron/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 space-y-4">
              <div className="inline-flex items-center gap-2 bg-jaman-saffron/20 border border-jaman-saffron/40 text-amber-300 px-3 py-1 rounded-full text-xs font-black tracking-wide uppercase">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Super Admin Allotment Required</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                QR Table Ordering & Digital Menus are Available in JAMANVAAR PRO (₹7,000)
              </h1>

              <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                Your restaurant is currently active on the <strong className="text-white">JAMANVAAR CORE (₹5,000/month)</strong> plan,
                which includes Counter POS, offline billing, KOT, and table management.
                The full <strong>QR Table Ordering & Standee Suite</strong> is an exclusive feature of the <strong className="text-white">JAMANVAAR PRO (₹7,000/month)</strong> plan.
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 px-4 border border-white/10 flex items-center gap-3">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Plan Entitlement</span>
                    <span className="text-xs font-black text-white">PRO Plan (₹7,000 / month)</span>
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 px-4 border border-white/10 flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Allotment Authority</span>
                    <span className="text-xs font-black text-white">Platform Super Admin Only</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Plan Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* CORE Plan Card */}
            <div className="bg-white border-2 border-slate-200 rounded-3xl p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black tracking-wider uppercase text-slate-400 block">Current Activated Plan</span>
                  <h3 className="text-lg font-black text-jaman-navy">JAMANVAAR CORE</h3>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-jaman-navy">₹5,000</span>
                  <span className="text-[10px] text-slate-400 block font-bold">per month</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Active License Key in this branch</span>
              </div>

              <ul className="space-y-2 text-xs text-slate-600 font-medium">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Counter POS & Fast Billing</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>100% Offline-First Local Engine</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Kitchen KOT & Station Routing</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Table Management & Dine-In Floor Plan</span>
                </li>
                <li className="flex items-center gap-2 text-rose-600 font-bold">
                  <span className="w-3.5 h-3.5 flex items-center justify-center font-black">✕</span>
                  <span>QR Table Self-Ordering (Not in 5K Plan)</span>
                </li>
                <li className="flex items-center gap-2 text-rose-600 font-bold">
                  <span className="w-3.5 h-3.5 flex items-center justify-center font-black">✕</span>
                  <span>Captain App Table-side Dispatch (Not in 5K Plan)</span>
                </li>
              </ul>
            </div>

            {/* PRO Plan Card */}
            <div className="bg-gradient-to-b from-amber-50/50 to-white border-2 border-jaman-saffron rounded-3xl p-6 space-y-4 shadow-md relative">
              <div className="absolute -top-3 right-6 bg-jaman-saffron text-white text-[10px] font-black px-3 py-0.5 rounded-full tracking-wider uppercase shadow-xs">
                QR Entitled Plan
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black tracking-wider uppercase text-jaman-saffron block">Required Plan</span>
                  <h3 className="text-lg font-black text-jaman-navy">JAMANVAAR PRO</h3>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-jaman-saffron">₹7,000</span>
                  <span className="text-[10px] text-slate-400 block font-bold">per month</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-100/60 border border-amber-300 text-xs font-bold text-jaman-navy flex items-center gap-2">
                <Crown className="w-4 h-4 text-jaman-saffron shrink-0" />
                <span>Includes full QR Table Ordering & Standees</span>
              </div>

              <ul className="space-y-2 text-xs text-slate-700 font-medium">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Everything in JAMANVAAR CORE</span>
                </li>
                <li className="flex items-center gap-2 font-bold text-jaman-navy">
                  <Check className="w-3.5 h-3.5 text-jaman-saffron" />
                  <span>Public Mobile Guest Self-Ordering App</span>
                </li>
                <li className="flex items-center gap-2 font-bold text-jaman-navy">
                  <Check className="w-3.5 h-3.5 text-jaman-saffron" />
                  <span>Super Admin Deterministic Table Security Tokens</span>
                </li>
                <li className="flex items-center gap-2 font-bold text-jaman-navy">
                  <Check className="w-3.5 h-3.5 text-jaman-saffron" />
                  <span>Acrylic Tent Card Standee Designer & Printing</span>
                </li>
                <li className="flex items-center gap-2 font-bold text-jaman-navy">
                  <Check className="w-3.5 h-3.5 text-jaman-saffron" />
                  <span>Real-Time POS Queue & Automated KDS Dispatch</span>
                </li>
                <li className="flex items-center gap-2 font-bold text-jaman-navy">
                  <Check className="w-3.5 h-3.5 text-jaman-saffron" />
                  <span>Wireless Captain App for Waiters</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Super Admin Allotment Workflow Banner */}
          <div className="bg-white border border-jaman-border rounded-3xl p-6 shadow-2xs space-y-4">
            <h3 className="text-xs font-black text-jaman-navy uppercase tracking-wider flex items-center gap-2">
              <Radio className="w-4 h-4 text-jaman-saffron" />
              <span>Super Admin Allotment & Provisioning Workflow</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1.5">
                <span className="w-6 h-6 rounded-full bg-jaman-navy text-white text-xs font-black flex items-center justify-center">1</span>
                <h4 className="text-xs font-black text-jaman-navy">Plan Allotment</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Super Admin allots the ₹7,000 PRO plan to this restaurant in the Super Admin Platform Control Center.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1.5">
                <span className="w-6 h-6 rounded-full bg-jaman-saffron text-white text-xs font-black flex items-center justify-center">2</span>
                <h4 className="text-xs font-black text-jaman-navy">QR Token Generation</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Super Admin generates and provisions deterministic, tamper-proof QR table tokens. Restaurant Admin cannot forge or generate tokens.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1.5">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">3</span>
                <h4 className="text-xs font-black text-jaman-navy">Print & Fulfill</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Restaurant Admin unlocks access to preview and print standees, view guest cart activity, and fulfill live orders.
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100 flex-wrap gap-3">
              <span className="text-xs text-slate-400 font-medium">
                QR table ordering unlocks once this restaurant has an active PRO subscription — go to Settings → Subscription Plan.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-jaman-cream overflow-hidden select-none">
      {/* Top Section Navigation Header */}
      <div className="bg-white border-b border-jaman-border px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#FFF4ED] border border-[#FED7AA] flex items-center justify-center text-jaman-saffron shadow-xs">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-jaman-navy tracking-tight">
                Digital Ordering & QR Suite
              </h1>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  qrSettings.isQrOrderingActive
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    qrSettings.isQrOrderingActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                {qrSettings.isQrOrderingActive ? 'QR Active' : 'QR Paused'}
              </span>
              <span className="text-[10px] font-black bg-jaman-cream text-jaman-navy border border-jaman-border px-2 py-0.5 rounded-full">
                {PLAN_DEFINITIONS[qrEntitlement.tier]?.name || qrEntitlement.tier} (
                {formatINR(PLAN_DEFINITIONS[qrEntitlement.tier]?.price || 0)}/mo)
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Let guests scan table QR codes, explore the canonical digital menu, customize dishes, and order directly.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenCustomerPreview()}
            className="bg-jaman-saffron hover:bg-[#EA580C] text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-md shadow-jaman-saffron/25 transition-all active:scale-95 cursor-pointer"
          >
            <Smartphone className="w-4 h-4" />
            <span>📱 Open Live QR Ordering</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs Strip */}
      <div className="bg-white border-b border-jaman-border px-5 flex items-center gap-1 overflow-x-auto shrink-0 scrollbar-none">
        {[
          { id: 'OVERVIEW', label: 'Overview', icon: Zap },
          { id: 'TABLES', label: 'Tables & QR', icon: Grid },
          { id: 'MENU', label: 'Digital Menu', icon: UtensilsCrossed },
          { id: 'ORDERS', label: 'Live QR Orders', icon: ShoppingBag, badge: allQrOrders.filter(o => o.orderStatus === 'CONFIRMED' || o.orderStatus === 'PREPARING' || o.orderStatus === 'NEW').length || undefined, badgeColor: 'bg-jaman-saffron' },
          { id: 'ANALYTICS', label: 'QR Analytics', icon: TrendingUp },
          { id: 'SETTINGS', label: 'QR Settings', icon: Settings }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as QrAdminSubTab)}
              className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-jaman-saffron text-jaman-saffron bg-amber-50/40'
                  : 'border-transparent text-slate-600 hover:text-jaman-navy hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                    tab.badgeColor ? `${tab.badgeColor} text-white` : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Tab Workspace */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* ============================================================ */}
        {/* TAB 1: OVERVIEW HUB                                          */}
        {/* ============================================================ */}
        {activeSubTab === 'OVERVIEW' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Hero Banner */}
            <div className="bg-gradient-to-r from-jaman-navy via-[#123959] to-jaman-navy rounded-3xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <span className="text-[10px] font-black tracking-widest uppercase bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2.5 py-0.5 rounded-full inline-block">
                  TABLE QR ORDERING SYSTEM
                </span>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                  Seamless Table-to-Kitchen Guest Self-Ordering
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Empower dining guests to scan deterministic table QR tent cards, browse your digital menu with live prices and images, customize toppings and spice levels, and order directly to POS and KDS stations.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => handleOpenCustomerPreview()}
                  className="bg-jaman-saffron hover:bg-[#EA580C] text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-jaman-saffron/30 transition-all active:scale-95 cursor-pointer"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Launch Live Guest Preview</span>
                </button>
                <button
                  onClick={handleOpenBatchDesigner}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Table Standees</span>
                </button>
              </div>
            </div>

            {/* Live KPI Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">Active Table QR</span>
                  <Grid className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="font-mono font-black text-2xl text-jaman-navy">
                  {qrStats.activeTablesCount} / {tables.length}
                </div>
                {tablesWithoutQr.length > 0 ? (
                  <button
                    onClick={() => setActiveSubTab('TABLES')}
                    className="text-[10px] text-amber-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <AlertCircle className="w-3 h-3" /> {tablesWithoutQr.length} without a QR token
                  </button>
                ) : (
                  <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Every table has a secure QR token
                  </p>
                )}
              </div>

              <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">Today&apos;s QR Orders</span>
                  <ShoppingBag className="w-4 h-4 text-jaman-saffron" />
                </div>
                <div className="font-mono font-black text-2xl text-jaman-navy">{qrStats.totalOrders} Orders</div>
                <p className="text-[10px] text-slate-500 font-bold">
                  Revenue: <span className="font-mono text-jaman-navy font-black">{formatINR(qrStats.totalRevenue)}</span>
                </p>
              </div>

              <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">Pending in Kitchen</span>
                  <Flame className="w-4 h-4 text-amber-500" />
                </div>
                <div className="font-mono font-black text-2xl text-amber-600">{qrStats.pendingCount} Active</div>
                <p className="text-[10px] text-slate-500 font-bold">In preparation / scheduled</p>
              </div>

              <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">Top Table Demand</span>
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                </div>
                <div className="font-black text-base text-jaman-navy truncate">
                  {hasQrOrderData ? qrStats.topTable : 'No data yet'}
                </div>
                <p className="text-[10px] text-purple-700 font-bold">
                  {hasQrOrderData ? 'Most popular dining spot' : 'Ranks once QR orders arrive'}
                </p>
              </div>
            </div>

            {/* Integration Status Strip (Part 30 Compliant) */}
            <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-jaman-navy uppercase tracking-wider flex items-center gap-2">
                  <Radio className="w-4 h-4 text-jaman-saffron" />
                  <span>QR Ecosystem Real-Time Service Status</span>
                </h3>
                <span className="text-[10px] font-bold text-slate-400">Local Mesh Architecture</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {serviceStatuses.map((svc) => (
                  <div
                    key={svc.key}
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                      svc.ok ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        svc.ok ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <span
                        className={`text-[10px] font-bold block uppercase ${
                          svc.ok ? 'text-emerald-800' : 'text-slate-500'
                        }`}
                      >
                        {svc.label}
                      </span>
                      <span
                        className={`text-xs font-black truncate block ${
                          svc.ok ? 'text-emerald-950' : 'text-slate-600'
                        }`}
                      >
                        {svc.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions & Recent QR Orders Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 4 cols: Quick Actions */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs space-y-3">
                  <h3 className="text-xs font-black text-jaman-navy uppercase tracking-wider">Quick Actions</h3>

                  <div className="space-y-2">
                    <button
                      onClick={() => setActiveSubTab('TABLES')}
                      className="w-full p-3 rounded-xl bg-jaman-cream hover:bg-amber-50 border border-jaman-border hover:border-[#FED7AA] flex items-center justify-between transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Grid className="w-4 h-4 text-jaman-saffron" />
                        <span className="text-xs font-black text-jaman-navy">Manage Table QR Codes</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button
                      onClick={() => setActiveSubTab('MENU')}
                      className="w-full p-3 rounded-xl bg-jaman-cream hover:bg-amber-50 border border-jaman-border hover:border-[#FED7AA] flex items-center justify-between transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <UtensilsCrossed className="w-4 h-4 text-jaman-saffron" />
                        <span className="text-xs font-black text-jaman-navy">Digital Menu Customizer</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button
                      onClick={() => setActiveSubTab('ORDERS')}
                      className="w-full p-3 rounded-xl bg-jaman-cream hover:bg-amber-50 border border-jaman-border hover:border-[#FED7AA] flex items-center justify-between transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <ShoppingBag className="w-4 h-4 text-jaman-saffron" />
                        <span className="text-xs font-black text-jaman-navy">Live QR Orders Queue</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button
                      onClick={() => setActiveSubTab('SETTINGS')}
                      className="w-full p-3 rounded-xl bg-jaman-cream hover:bg-amber-50 border border-jaman-border hover:border-[#FED7AA] flex items-center justify-between transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Settings className="w-4 h-4 text-jaman-saffron" />
                        <span className="text-xs font-black text-jaman-navy">QR Ordering Controls</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>

                {/* Popular Dish Metric */}
                <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs space-y-2">
                  <span className="text-[10px] font-black uppercase text-slate-400">Most Ordered Delicacy</span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 border border-[#FED7AA] flex items-center justify-center text-jaman-saffron shrink-0">
                      <UtensilsCrossed className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-xs text-jaman-navy truncate">
                        {hasQrOrderData ? qrStats.topDish : 'No QR orders yet'}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {hasQrOrderData
                          ? 'Highest scanned & customized dish'
                          : 'This ranks the moment guests start ordering'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 8 cols: Recent QR Orders Feed */}
              <div className="lg:col-span-8 bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-black text-jaman-navy uppercase tracking-wider">
                      Recent Live Table Orders
                    </h3>
                    <p className="text-[11px] text-slate-500">Orders arriving from restaurant table QR scans</p>
                  </div>
                  <button
                    onClick={() => setActiveSubTab('ORDERS')}
                    className="text-xs font-black text-jaman-saffron hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>View All ({allQrOrders.length})</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {allQrOrders.length === 0 && (
                    <div className="py-10 text-center space-y-2">
                      <ShoppingBag className="w-9 h-9 text-slate-300 mx-auto stroke-1" />
                      <h4 className="text-xs font-black text-jaman-navy">No table QR orders yet</h4>
                      <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                        Orders placed by guests scanning a table QR code appear here instantly, and route
                        straight to POS billing and the kitchen KOT queue.
                      </p>
                    </div>
                  )}
                  {allQrOrders.slice(0, 5).map((order) => (
                    <div
                      key={order.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-jaman-cream px-2 rounded-xl transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedOrder(order);
                        setActiveSubTab('ORDERS');
                      }}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs text-jaman-navy">
                            #{order.orderNumber}
                          </span>
                          <span className="text-[10px] font-black bg-jaman-saffron text-white px-1.5 py-0.2 rounded font-mono">
                            Token #{order.tokenNumber}
                          </span>
                          <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                            📍 Table {order.tableNumber || 'Unassigned'}
                          </span>
                          {order.customerNotes && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded truncate max-w-[140px]">
                              Note: {order.customerNotes}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 flex items-center gap-2">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>
                            {new Date(order.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <span>•</span>
                          <span>{order.items.length} items ({order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')})</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="text-right">
                          <div className="font-mono font-black text-sm text-jaman-navy">
                            {formatINR(order.totalAmount)}
                          </div>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full inline-block ${
                              order.orderStatus === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : order.orderStatus === 'PREPARING'
                                ? 'bg-amber-100 text-amber-800 animate-pulse'
                                : order.orderStatus === 'READY'
                                ? 'bg-blue-100 text-blue-800'
                                : order.orderStatus === 'CANCELLED' || order.orderStatus === 'REFUNDED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            ● {order.orderStatus}
                          </span>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCustomerPreview(order.tableNumber || tables[0]?.tableNumber || '', order.id);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                          title="Open Live Customer Tracker"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: TABLE QR MANAGEMENT                                   */}
        {/* ============================================================ */}
        {activeSubTab === 'TABLES' && (
          <div className="space-y-4 max-w-7xl mx-auto">
            {/* Action Bar matching Image 5 layout */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-jaman-border shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-jaman-navy">Tables & QR</h2>
                  <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    {tables.filter((t) => t.qrStatus !== 'DISABLED').length} / {tables.length} Active
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Operational table records connected directly to the POS order engine and guest QR scanner.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSelectAllTables}
                  disabled={tables.length === 0}
                  className="bg-jaman-cream hover:bg-slate-100 text-jaman-navy border border-jaman-border px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {selectedTableNumbers.length === tables.length && tables.length > 0
                    ? 'Deselect All'
                    : `Select All (${tables.length})`}
                </button>

                <button
                  onClick={handleOpenBatchDesigner}
                  className="bg-jaman-navy hover:bg-[#123959] text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-jaman-saffron" />
                  <span>Batch Print Standees</span>
                </button>

                {/* Primary [+ Add Table] button matching Image 5 */}
                <button
                  onClick={() => setIsAddTableOpen(true)}
                  className="bg-jaman-navy hover:bg-[#123959] text-white px-5 py-2 rounded-full text-xs font-black flex items-center gap-1.5 shadow-md shadow-jaman-navy/20 transition-all cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Table</span>
                </button>
              </div>
            </div>

            {/* Filter and Search Strip */}
            <div className="bg-white p-3.5 rounded-2xl border border-jaman-border shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Search table number, dining zone..."
                  className="w-full bg-jaman-cream border border-jaman-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={tableZoneFilter}
                  onChange={(e) => setTableZoneFilter(e.target.value)}
                  className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron cursor-pointer"
                >
                  <option value="ALL">All Dining Areas ({distinctZones.length})</option>
                  {distinctZones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>

                <select
                  value={tableStatusFilter}
                  onChange={(e) => setTableStatusFilter(e.target.value)}
                  className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron cursor-pointer"
                >
                  <option value="ALL">All QR Statuses</option>
                  <option value="ACTIVE">● Active QR Only</option>
                  <option value="DISABLED">● Disabled QR Only</option>
                </select>
              </div>
            </div>

            {/* Bulk Action Strip when tables are selected */}
            {selectedTableNumbers.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-jaman-saffron text-white text-xs font-black flex items-center justify-center">
                    {selectedTableNumbers.length}
                  </span>
                  <span className="text-xs font-black text-jaman-navy">
                    {selectedTableNumbers.length} {selectedTableNumbers.length === 1 ? 'Table' : 'Tables'} Selected
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleBulkUpdateStatus('ACTIVE')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer shadow-xs"
                  >
                    Enable Selected
                  </button>

                  <button
                    onClick={() => handleBulkUpdateStatus('DISABLED')}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer shadow-xs"
                  >
                    Disable Selected
                  </button>

                  <button
                    onClick={handleBulkRegenerateQr}
                    className="px-3 py-1.5 rounded-xl bg-white border border-amber-400 text-amber-800 hover:bg-amber-100 text-xs font-black flex items-center gap-1 cursor-pointer shadow-xs"
                    title="Issue fresh high-entropy tokens for the selected tables"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Regenerate QR</span>
                  </button>

                  <button
                    onClick={() => {
                      const first = tables.find((t) => selectedTableNumbers.includes(t.tableNumber));
                      setBatchDesignerMode(true);
                      setDesignerTable(first || tables[0] || null);
                      setIsCardDesignerOpen(true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-black flex items-center gap-1 cursor-pointer shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Selected Standees</span>
                  </button>
                </div>
              </div>
            )}

            {/* Empty states: no tables at all vs. none matching the current filters */}
            {tables.length === 0 && (
              <div className="bg-white border border-jaman-border rounded-3xl p-12 text-center space-y-3 shadow-2xs">
                <div className="w-14 h-14 rounded-2xl bg-[#FFF4ED] border border-[#FED7AA] flex items-center justify-center text-jaman-saffron mx-auto">
                  <Grid className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-black text-jaman-navy">No tables configured yet</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Add your dining tables to generate secure QR codes, print tent-card standees, and start
                  accepting guest self-orders straight into POS and the kitchen.
                </p>
                <button
                  onClick={() => setIsAddTableOpen(true)}
                  className="mt-1 px-5 py-2.5 rounded-full bg-jaman-navy hover:bg-[#123959] text-white text-xs font-black inline-flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Your First Table</span>
                </button>
              </div>
            )}

            {tables.length > 0 && filteredTables.length === 0 && (
              <div className="bg-white border border-jaman-border rounded-3xl p-10 text-center space-y-3 shadow-2xs">
                <Search className="w-9 h-9 text-slate-300 mx-auto stroke-1" />
                <h3 className="text-sm font-black text-jaman-navy">No tables match these filters</h3>
                <p className="text-xs text-slate-500">
                  {tables.length} table{tables.length === 1 ? '' : 's'} exist. Try clearing the search or zone
                  and status filters.
                </p>
                <button
                  onClick={() => {
                    setTableSearch('');
                    setTableZoneFilter('ALL');
                    setTableStatusFilter('ALL');
                  }}
                  className="px-4 py-2 rounded-xl border border-jaman-border hover:bg-jaman-cream text-xs font-black text-jaman-navy cursor-pointer"
                >
                  Clear Filters
                </button>
              </div>
            )}

            {/* Tables Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTables.map((table) => {
                const hasQrToken = Boolean(table.qrToken);
                const shortCode = table.qrShortCode || (hasQrToken ? `QR-TABLE-${table.tableNumber}` : null);
                const isSelected = selectedTableNumbers.includes(table.tableNumber);
                const isActive = table.qrStatus !== 'DISABLED';
                // Counts and revenue always come from the shared order engine, never local state
                const tableOrders = allQrOrders.filter((o) => o.tableNumber === table.tableNumber);
                const ordersToday = tableOrders.length;
                const revenueToday = tableOrders
                  .filter((o) => o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REFUNDED')
                  .reduce((s, o) => s + o.totalAmount, 0);

                return (
                  <div
                    key={table.id}
                    className={`bg-white border rounded-2xl p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-3 group ${
                      isSelected ? 'border-jaman-saffron ring-1 ring-jaman-saffron' : 'border-jaman-border'
                    }`}
                  >
                    {/* Top Section matching Image 5: Icon + Table Name + Zone & Seats + Active Badge */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleTableSelect(table.tableNumber)}
                          className="accent-jaman-saffron w-4 h-4 rounded cursor-pointer"
                        />

                        {/* QR Icon with subtle rounded background */}
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 shadow-2xs shrink-0">
                          <QrCode className="w-6 h-6" />
                        </div>

                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-black text-jaman-navy">
                              Table {table.tableNumber}
                            </h3>
                          </div>
                          <p className="text-xs text-slate-500 font-medium">
                            {table.zone || 'Dining area'} • {table.capacity} seats
                          </p>
                        </div>
                      </div>

                      {/* Live QR + occupancy status, toggled through the repository */}
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            table.status === 'OCCUPIED'
                              ? 'bg-amber-100 text-amber-800'
                              : table.status === 'RESERVED'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                          title="Live table occupancy from the shared order engine"
                        >
                          {table.status}
                        </span>

                        <button
                          onClick={() => handleToggleSingleTableStatus(table)}
                          className={`text-[11px] font-black px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                          title={isActive ? 'Deactivate this table QR' : 'Activate this table QR'}
                        >
                          {isActive ? 'Active' : 'Disabled'}
                        </button>

                        <button
                          onClick={() => {
                            setEditingTable(table);
                            setEditCapacity(table.capacity);
                            setEditZone(table.zone || 'Main Dining Hall');
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          title="Edit Table Details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteTable(table)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Remove Table"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Operational Stats Mini Strip */}
                    <div className="bg-jaman-cream px-3 py-2 rounded-xl border border-jaman-border flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="font-bold">Today:</span>
                        <span className="font-mono font-black text-jaman-navy">{ordersToday} orders</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="font-bold">Revenue:</span>
                        <span className="font-mono font-black text-jaman-saffron">{formatINR(revenueToday)}</span>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-slate-100" />

                    {/* Bottom row: real QR short code + copy / rotate / view / download / print */}
                    {hasQrToken ? (
                      <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500 font-medium">
                            QR code: <span className="font-mono font-bold text-jaman-navy">{shortCode}</span>
                          </span>

                          <button
                            onClick={() => handleCopyQrLink(table)}
                            className="p-1 text-slate-400 hover:text-jaman-saffron transition-colors"
                            title="Copy QR Order Link"
                          >
                            {copiedQrTable === String(table.tableNumber) ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={() => handleRegenerateQr(table)}
                            className="p-1 text-slate-400 hover:text-amber-600 transition-colors"
                            title="Rotate security token (invalidates printed standees)"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenCustomerPreview(table.tableNumber)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-black text-jaman-navy transition-colors cursor-pointer"
                          >
                            View
                          </button>

                          <button
                            onClick={() => handleDownloadQrSvg(table)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-black text-jaman-navy flex items-center gap-1 transition-colors cursor-pointer"
                            title="Download Vector QR SVG"
                          >
                            <Download className="w-3 h-3 text-slate-500" />
                            <span>Download</span>
                          </button>

                          <button
                            onClick={() => {
                              setBatchDesignerMode(false);
                              handleOpenDesigner(table);
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-jaman-navy hover:bg-[#123959] text-white text-xs font-black flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                          >
                            <Printer className="w-3 h-3 text-jaman-saffron" />
                            <span>Print</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
                        <span className="text-xs text-amber-700 font-bold flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          No QR token issued
                        </span>
                        <button
                          onClick={() => handleGenerateQr(table)}
                          className="px-3.5 py-1.5 rounded-xl bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-black flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                        >
                          <QrCode className="w-3 h-3" />
                          <span>Generate QR</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: DIGITAL MENU CUSTOMIZATION                            */}
        {/* ============================================================ */}
        {activeSubTab === 'MENU' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header / Filter Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-jaman-navy">Canonical Digital Menu Controls</h2>
                <p className="text-xs text-slate-500">
                  Shared canonical menu data across POS, POS Admin, QR Ordering, and Kiosk. Changes reflect in real time.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Search dishes..."
                    className="w-full bg-jaman-cream border border-jaman-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  />
                </div>

                <select
                  value={menuCategoryFilter}
                  onChange={(e) => setMenuCategoryFilter(e.target.value)}
                  className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron cursor-pointer"
                >
                  <option value="ALL">All Categories ({categories.length})</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => handleOpenCustomerPreview()}
                  className="bg-jaman-saffron hover:bg-[#EA580C] text-white px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview Guest Menu</span>
                </button>
              </div>
            </div>

            {filteredMenuItems.length === 0 && (
              <div className="bg-white border border-jaman-border rounded-3xl p-10 text-center space-y-3 shadow-2xs">
                <UtensilsCrossed className="w-9 h-9 text-slate-300 mx-auto stroke-1" />
                <h3 className="text-sm font-black text-jaman-navy">
                  {menuItems.length === 0 ? 'No dishes on the canonical menu' : 'No dishes match this search'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {menuItems.length === 0
                    ? 'Add dishes in Menu Management. The QR digital menu always mirrors the canonical catalog.'
                    : `${menuItems.length} dishes exist. Try clearing the search or category filter.`}
                </p>
                {menuItems.length > 0 && (
                  <button
                    onClick={() => {
                      setMenuSearch('');
                      setMenuCategoryFilter('ALL');
                    }}
                    className="px-4 py-2 rounded-xl border border-jaman-border hover:bg-jaman-cream text-xs font-black text-jaman-navy cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}

            {/* Menu Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredMenuItems
                .map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-jaman-border rounded-2xl p-3.5 shadow-2xs flex flex-col justify-between space-y-3 hover:border-jaman-saffron/40 transition-all"
                  >
                    <div className="flex gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <UtensilsCrossed className="w-6 h-6" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-mono font-bold text-slate-400">{item.sku}</span>
                        <h4 className="font-extrabold text-xs text-jaman-navy truncate">{item.name}</h4>
                        <span className="font-mono font-black text-xs text-jaman-saffron block">
                          {formatINR(item.price)}
                        </span>
                      </div>
                    </div>

                    {/* Channels & Badges */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100 text-[10px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-bold">QR Ordering:</span>
                        <span
                          className={`font-black px-1.5 py-0.2 rounded ${
                            item.isQrOrderingEnabled !== false
                              ? 'text-emerald-700 bg-emerald-50'
                              : 'text-slate-500 bg-slate-100'
                          }`}
                        >
                          {item.isQrOrderingEnabled !== false ? '● Enabled' : '○ Disabled'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-bold">Kiosk Touch:</span>
                        <span
                          className={`font-black px-1.5 py-0.2 rounded ${
                            item.isKioskEnabled !== false
                              ? 'text-purple-700 bg-purple-50'
                              : 'text-slate-500 bg-slate-100'
                          }`}
                        >
                          {item.isKioskEnabled !== false ? '● Enabled' : '○ Disabled'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-bold">Station Routing:</span>
                        <span className="font-bold text-slate-700">{item.kitchenStation || 'Unassigned'}</span>
                      </div>
                    </div>

                    {/* Action Buttons: Toggle Availability & Configure */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => {
                          const updated = MenuRepository.toggleItemAvailability(
                            item.id,
                            undefined,
                            undefined,
                            'POS Admin'
                          );
                          setTick((t) => t + 1);
                          if (updated) {
                            showToast(
                              `${updated.name} marked ${updated.isAvailable ? 'In Stock' : 'Sold Out'}`
                            );
                          }
                        }}
                        className={`py-1.5 px-2 rounded-xl text-xs font-black border text-center transition-colors cursor-pointer ${
                          item.isAvailable !== false
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
                        }`}
                      >
                        {item.isAvailable !== false ? '● In Stock' : '○ Sold Out'}
                      </button>

                      <button
                        onClick={() => handleOpenDishConfig(item)}
                        className="py-1.5 px-2 rounded-xl border border-slate-200 hover:bg-jaman-cream text-xs font-black text-slate-700 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3 text-jaman-saffron" />
                        <span>Configure</span>
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: LIVE QR ORDERS BOARD                                  */}
        {/* ============================================================ */}
        {activeSubTab === 'ORDERS' && (
          <div className="space-y-4 max-w-7xl mx-auto">
            {/* Filter Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                  placeholder="Search QR order #, token, table..."
                  className="w-full bg-jaman-cream border border-jaman-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                />
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1 bg-jaman-cream p-1 rounded-xl border border-jaman-border overflow-x-auto">
                {['ALL', 'NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'].map(
                  (st) => {
                    const count =
                      st === 'ALL'
                        ? allQrOrders.length
                        : allQrOrders.filter((o) => o.orderStatus === st).length;
                    return (
                      <button
                        key={st}
                        onClick={() => setOrdersStatusFilter(st)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          ordersStatusFilter === st
                            ? 'bg-jaman-saffron text-white shadow-xs font-black'
                            : 'text-slate-600 hover:text-jaman-navy'
                        }`}
                      >
                        {st} <span className="font-mono opacity-70">{count}</span>
                      </button>
                    );
                  }
                )}
              </div>

              {/* Table Selector Filter */}
              <select
                value={ordersTableFilter}
                onChange={(e) => setOrdersTableFilter(e.target.value)}
                className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron cursor-pointer"
              >
                <option value="ALL">All Tables</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.tableNumber}>
                    Table {t.tableNumber} ({t.zone})
                  </option>
                ))}
              </select>
            </div>

            {/* Orders Split: Left List, Right Detail Pane */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Orders List */}
              <div className="lg:col-span-6 xl:col-span-5 bg-white border border-jaman-border rounded-2xl overflow-y-auto max-h-[70vh] shadow-2xs divide-y divide-slate-100">
                {filteredQrOrders.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto" />
                    <h4 className="text-xs font-black text-jaman-navy">No QR Orders Found</h4>
                    <p className="text-[11px] text-slate-500">
                      Place a new live QR table order to see it appear in real-time.
                    </p>
                    <button
                      onClick={() => handleOpenCustomerPreview()}
                      className="px-4 py-2 bg-jaman-saffron text-white text-xs font-black rounded-xl shadow-xs cursor-pointer"
                    >
                      Open Live QR Ordering
                    </button>
                  </div>
                ) : (
                  filteredQrOrders.map((order) => {
                    const isSelected = selectedOrder?.id === order.id;
                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className={`p-4 flex flex-col justify-between gap-2 cursor-pointer transition-colors ${
                          isSelected ? 'bg-amber-50/70 border-l-4 border-l-jaman-saffron' : 'hover:bg-jaman-cream'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-jaman-navy">
                              #{order.orderNumber}
                            </span>
                            <span className="text-[10px] font-black bg-jaman-saffron text-white px-2 py-0.5 rounded font-mono">
                              #T-{order.tokenNumber}
                            </span>
                            <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                              Table {order.tableNumber || 'Unassigned'}
                            </span>
                          </div>

                          <span className="font-mono font-black text-sm text-jaman-navy">
                            {formatINR(order.totalAmount)}
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(order.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                            <span>•</span>
                            <span>{order.items.length} items</span>
                          </span>

                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              order.orderStatus === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : order.orderStatus === 'PREPARING'
                                ? 'bg-amber-100 text-amber-800'
                                : order.orderStatus === 'READY'
                                ? 'bg-blue-100 text-blue-800'
                                : order.orderStatus === 'CANCELLED' || order.orderStatus === 'REFUNDED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            ● {order.orderStatus}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Order Detail & Kitchen Routing Action Pane */}
              <div className="lg:col-span-6 xl:col-span-7 bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs overflow-y-auto max-h-[70vh]">
                {selectedOrder ? (
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-jaman-navy">
                            QR Order #{selectedOrder.orderNumber}
                          </h3>
                          <span className="text-xs font-black bg-jaman-saffron text-white px-2 py-0.5 rounded-md font-mono">
                            Token #{selectedOrder.tokenNumber}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Table {selectedOrder.tableNumber} • Placed at{' '}
                          {new Date(selectedOrder.createdAt).toLocaleTimeString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenCustomerPreview(selectedOrder.tableNumber || tables[0]?.tableNumber || '', selectedOrder.id)}
                          className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-jaman-saffron border border-[#FED7AA] text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>Guest Tracker</span>
                        </button>
                      </div>
                    </div>

                    {/* Customer Notes Banner */}
                    {selectedOrder.customerNotes && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                        <strong>Guest Special Note:</strong> &ldquo;{selectedOrder.customerNotes}&rdquo;
                      </div>
                    )}

                    {/* Kitchen Routing Breakdown (Part 11) */}
                    <div className="bg-jaman-cream border border-jaman-border rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-black text-jaman-navy">
                        <span className="flex items-center gap-1.5">
                          <ChefHat className="w-4 h-4 text-jaman-saffron" />
                          <span>Kitchen Station Routing Dispatch</span>
                        </span>
                        <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                          {kotsForSelectedOrder.length}{' '}
                          {kotsForSelectedOrder.length === 1 ? 'KOT DISPATCHED' : 'KOTS DISPATCHED'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {selectedOrder.kitchenRouting?.summaryText ||
                          QrOrderingRepository.getStationRouting(selectedOrder.items).summaryText}
                      </p>
                      {kotsForSelectedOrder.length > 0 && (
                        <p className="text-[10px] text-slate-500 font-mono">
                          {kotsForSelectedOrder
                            .map((k) => `${k.kotNumber || k.id} - ${k.status}`)
                            .join('  |  ')}
                        </p>
                      )}
                    </div>

                    {/* Items List */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-black text-jaman-navy uppercase tracking-wider">Ordered Dishes</h4>
                      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl p-3">
                        {selectedOrder.items.map((it) => (
                          <div key={it.id} className="py-2 first:pt-0 last:pb-0 flex items-start justify-between">
                            <div>
                              <div className="font-extrabold text-xs text-jaman-navy">
                                {it.quantity} × {it.name}
                              </div>
                              {it.modifiers && it.modifiers.length > 0 && (
                                <p className="text-[10px] text-slate-500">
                                  {it.modifiers.map((m) => m.optionName).join(', ')}
                                </p>
                              )}
                              {it.specialInstructions && (
                                <p className="text-[10px] text-amber-700 italic">
                                  &ldquo;{it.specialInstructions}&rdquo;
                                </p>
                              )}
                            </div>
                            <span className="font-mono font-black text-xs text-jaman-navy">
                              {formatINR(it.totalPrice)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pricing Summary */}
                    <div className="bg-jaman-cream rounded-xl p-3 space-y-1 text-xs">
                      <div className="flex justify-between text-slate-500">
                        <span>Subtotal</span>
                        <span className="font-mono">{formatINR(selectedOrder.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>GST (5%)</span>
                        <span className="font-mono">{formatINR(selectedOrder.taxAmount)}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-sm text-jaman-navy">
                        <span>Total Amount</span>
                        <span className="font-mono text-jaman-saffron">{formatINR(selectedOrder.totalAmount)}</span>
                      </div>
                    </div>

                    {/* Operational Status Action Bar */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                        Advance Kitchen / POS Status
                      </span>

                      <div className="flex flex-wrap items-center gap-2">
                        {selectedOrder.orderStatus === 'NEW' && (
                          <button
                            onClick={() => handleAdvanceOrderStatus(selectedOrder.id, 'ACCEPTED')}
                            className="px-3.5 py-2 rounded-xl bg-jaman-navy text-white text-xs font-black hover:bg-[#123959] transition-all cursor-pointer"
                          >
                            Accept Order
                          </button>
                        )}

                        {(selectedOrder.orderStatus === 'NEW' || selectedOrder.orderStatus === 'ACCEPTED') && (
                          <button
                            onClick={() => handleAdvanceOrderStatus(selectedOrder.id, 'PREPARING')}
                            className="px-3.5 py-2 rounded-xl bg-jaman-saffron text-white text-xs font-black hover:bg-[#EA580C] shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <Flame className="w-3.5 h-3.5" />
                            <span>Send to Kitchen (KOT)</span>
                          </button>
                        )}

                        {selectedOrder.orderStatus === 'PREPARING' && (
                          <button
                            onClick={() => handleAdvanceOrderStatus(selectedOrder.id, 'READY')}
                            className="px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 transition-all cursor-pointer"
                          >
                            Mark Prepared & Ready
                          </button>
                        )}

                        {selectedOrder.orderStatus === 'READY' && (
                          <button
                            onClick={() => handleAdvanceOrderStatus(selectedOrder.id, 'SERVED')}
                            className="px-3.5 py-2 rounded-xl bg-purple-600 text-white text-xs font-black hover:bg-purple-700 transition-all cursor-pointer"
                          >
                            Mark Served at Table
                          </button>
                        )}

                        {(selectedOrder.orderStatus === 'SERVED' || selectedOrder.orderStatus === 'READY') && (
                          <button
                            onClick={() => handleAdvanceOrderStatus(selectedOrder.id, 'COMPLETED')}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition-all cursor-pointer"
                          >
                            Complete &amp; Settle
                          </button>
                        )}

                        {selectedOrder.orderStatus !== 'COMPLETED' &&
                          selectedOrder.orderStatus !== 'CANCELLED' && (
                            <button
                              onClick={() => handleCancelOrder(selectedOrder)}
                              className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-black hover:bg-rose-100 transition-all cursor-pointer ml-auto"
                            >
                              Cancel Order
                            </button>
                          )}

                        {(selectedOrder.orderStatus === 'COMPLETED' ||
                          selectedOrder.orderStatus === 'CANCELLED') && (
                          <span className="text-[11px] font-bold text-slate-400">
                            This order is {selectedOrder.orderStatus.toLowerCase()} and can no longer be
                            advanced.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 text-slate-400">
                    <ShoppingBag className="w-10 h-10 stroke-1" />
                    <p className="text-xs">Select any QR table order from the list to view routing and status controls.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: QR ANALYTICS & TABLE PERFORMANCE                      */}
        {/* ============================================================ */}
        {activeSubTab === 'ANALYTICS' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Filter Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-jaman-navy">QR Table Ordering Performance Reports</h2>
                <p className="text-xs text-slate-500">
                  Analyze self-ordering adoption, guest spend, and busiest tables across dining zones.
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-jaman-cream p-1 rounded-xl border border-jaman-border">
                {[
                  { id: 'TODAY', label: 'Today' },
                  { id: 'YESTERDAY', label: 'Yesterday' },
                  { id: '7_DAYS', label: '7 Days' },
                  { id: '30_DAYS', label: '30 Days' },
                  { id: 'ALL', label: 'All Time' }
                ].map((range) => (
                  <button
                    key={range.id}
                    onClick={() => setAnalyticsDateRange(range.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      analyticsDateRange === range.id
                        ? 'bg-jaman-navy text-white shadow-xs font-black'
                        : 'text-slate-600 hover:text-jaman-navy'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs space-y-1">
                <span className="text-[11px] font-extrabold uppercase text-slate-500">QR Table Orders</span>
                <div className="font-mono font-black text-2xl text-jaman-navy">{qrStats.totalOrders}</div>
                <p className="text-[10px] text-slate-500">Total table orders received</p>
              </div>

              <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs space-y-1">
                <span className="text-[11px] font-extrabold uppercase text-slate-500">QR Gross Revenue</span>
                <div className="font-mono font-black text-2xl text-jaman-saffron">{formatINR(qrStats.totalRevenue)}</div>
                <p className="text-[10px] text-slate-500">Billed & settled QR revenue</p>
              </div>

              <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs space-y-1">
                <span className="text-[11px] font-extrabold uppercase text-slate-500">Average QR Ticket</span>
                <div className="font-mono font-black text-2xl text-jaman-navy">{formatINR(qrStats.avgOrderValue)}</div>
                <p className="text-[10px] text-slate-500">Average spend per table order</p>
              </div>

              <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs space-y-1">
                <span className="text-[11px] font-extrabold uppercase text-slate-500">Top Revenue Table</span>
                <div className="font-black text-base text-jaman-navy truncate">
                  {hasQrOrderData ? qrStats.topTable : 'No data'}
                </div>
                <p className="text-[10px] text-slate-500">
                  {hasQrOrderData ? 'Highest grossing dining station' : 'Needs at least one QR order'}
                </p>
              </div>
            </div>

            {/* Table-by-Table Performance Grid */}
            <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-black text-jaman-navy uppercase tracking-wider">
                  Table-by-Table QR Performance Breakdown
                </h3>
                <span className="text-[10px] font-bold text-slate-400">
                  Computed from {qrStats.totalOrders} QR order{qrStats.totalOrders === 1 ? '' : 's'} in this
                  period
                </span>
              </div>

              {!hasQrOrderData ? (
                <div className="py-12 text-center space-y-3">
                  <TrendingUp className="w-10 h-10 text-slate-300 mx-auto stroke-1" />
                  <h4 className="text-sm font-black text-jaman-navy">
                    No QR orders in the selected period
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    There is nothing to report yet for this date range. Adoption, guest spend and busiest-table
                    rankings appear here as soon as guests order from a table QR code.
                  </p>
                  {analyticsDateRange !== 'ALL' && (
                    <button
                      onClick={() => setAnalyticsDateRange('ALL')}
                      className="px-4 py-2 rounded-xl border border-jaman-border hover:bg-jaman-cream text-xs font-black text-jaman-navy cursor-pointer"
                    >
                      View All Time
                    </button>
                  )}
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-jaman-border text-slate-400 font-black uppercase text-[10px]">
                      <th className="pb-2">Table #</th>
                      <th className="pb-2">Dining Zone</th>
                      <th className="pb-2 text-center">Orders Count</th>
                      <th className="pb-2 text-right">QR Revenue</th>
                      <th className="pb-2 text-right">Avg Order</th>
                      <th className="pb-2 text-right">Last Order</th>
                      <th className="pb-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {qrStats.tableBreakdown
                      .filter((tbl) => tbl.orderCount > 0)
                      .sort((a, b) => b.revenue - a.revenue)
                      .map((tbl) => {
                      const avg = tbl.orderCount > 0 ? Math.round(tbl.revenue / tbl.orderCount) : 0;
                      return (
                        <tr key={tbl.tableNumber} className="hover:bg-jaman-cream transition-colors">
                          <td className="py-2.5 font-black text-jaman-navy">Table {tbl.tableNumber}</td>
                          <td className="py-2.5 text-slate-600">{tbl.zone}</td>
                          <td className="py-2.5 text-center font-mono font-bold text-jaman-navy">
                            {tbl.orderCount}
                          </td>
                          <td className="py-2.5 text-right font-mono font-black text-jaman-saffron">
                            {formatINR(tbl.revenue)}
                          </td>
                          <td className="py-2.5 text-right font-mono text-slate-600">{formatINR(avg)}</td>
                          <td className="py-2.5 text-right font-mono text-slate-400">{tbl.lastOrder}</td>
                          <td className="py-2.5 text-center">
                            <button
                              onClick={() => handleOpenCustomerPreview(tbl.tableNumber)}
                              className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-jaman-saffron text-[10px] font-black cursor-pointer"
                            >
                              Open Guest View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 6: QR ORDERING SETTINGS                                  */}
        {/* ============================================================ */}
        {activeSubTab === 'SETTINGS' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="bg-white p-5 rounded-2xl border border-jaman-border shadow-2xs flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-jaman-navy">QR Table Ordering Configuration</h2>
                <p className="text-xs text-slate-500">
                  Configure customer self-ordering permissions, order limits, and automated kitchen dispatch rules.
                </p>
              </div>

              {settingsSavedToast && (
                <span className="text-xs font-black bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-xl animate-in fade-in flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>Settings Saved!</span>
                </span>
              )}
            </div>

            {/* Granular Feature Toggles */}
            <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
              <h3 className="text-xs font-black text-jaman-navy uppercase tracking-wider">
                Feature Switches & Automation
              </h3>

              <div className="divide-y divide-slate-100">
                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-jaman-navy block">QR Ordering System</span>
                    <span className="text-[11px] text-slate-500">Enable or disable guest table QR ordering globally</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.isQrOrderingActive}
                    onChange={(e) => handleSaveSettings({ isQrOrderingActive: e.target.checked })}
                    className="w-5 h-5 text-jaman-saffron rounded cursor-pointer accent-jaman-saffron"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-jaman-navy block">Allow Customer Ordering</span>
                    <span className="text-[11px] text-slate-500">Permit guests to place orders directly without staff intervention</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.allowCustomerOrdering}
                    onChange={(e) => handleSaveSettings({ allowCustomerOrdering: e.target.checked })}
                    className="w-5 h-5 text-jaman-saffron rounded cursor-pointer accent-jaman-saffron"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-jaman-navy block">Allow Dish Modifications</span>
                    <span className="text-[11px] text-slate-500">Permit guests to select spice levels and paid add-ons</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.allowCustomerModifications}
                    onChange={(e) => handleSaveSettings({ allowCustomerModifications: e.target.checked })}
                    className="w-5 h-5 text-jaman-saffron rounded cursor-pointer accent-jaman-saffron"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-jaman-navy block">Special Cooking Instructions</span>
                    <span className="text-[11px] text-slate-500">Allow guests to write custom notes for chefs (&ldquo;no onion&rdquo;, etc.)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.allowSpecialInstructions}
                    onChange={(e) => handleSaveSettings({ allowSpecialInstructions: e.target.checked })}
                    className="w-5 h-5 text-jaman-saffron rounded cursor-pointer accent-jaman-saffron"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-jaman-navy block">Auto-Dispatch to Kitchen (KOT)</span>
                    <span className="text-[11px] text-slate-500">Automatically send accepted QR orders to kitchen routing stations</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.autoSendToKitchen}
                    onChange={(e) => handleSaveSettings({ autoSendToKitchen: e.target.checked })}
                    className="w-5 h-5 text-jaman-saffron rounded cursor-pointer accent-jaman-saffron"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-jaman-navy block">Live Order Status Timeline</span>
                    <span className="text-[11px] text-slate-500">Show real-time cooking and preparation updates to the guest</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.showOrderStatusTimeline}
                    onChange={(e) => handleSaveSettings({ showOrderStatusTimeline: e.target.checked })}
                    className="w-5 h-5 text-jaman-saffron rounded cursor-pointer accent-jaman-saffron"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-jaman-navy block">Audio Chime on New QR Order</span>
                    <span className="text-[11px] text-slate-500">Play pleasant notification sound at POS when table order arrives</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.enableNotificationSound}
                    onChange={(e) => handleSaveSettings({ enableNotificationSound: e.target.checked })}
                    className="w-5 h-5 text-jaman-saffron rounded cursor-pointer accent-jaman-saffron"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-jaman-navy block">Repeat / Add-On Ordering</span>
                    <span className="text-[11px] text-slate-500">Let a table place further rounds without rescanning the QR code</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.allowRepeatOrdering}
                    onChange={(e) => handleSaveSettings({ allowRepeatOrdering: e.target.checked })}
                    className="w-5 h-5 text-jaman-saffron rounded cursor-pointer accent-jaman-saffron"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-jaman-navy block">Require Waiter Approval</span>
                    <span className="text-[11px] text-slate-500">Hold guest orders for captain confirmation before kitchen dispatch</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.requireWaiterApproval}
                    onChange={(e) => handleSaveSettings({ requireWaiterApproval: e.target.checked })}
                    className="w-5 h-5 text-jaman-saffron rounded cursor-pointer accent-jaman-saffron"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-jaman-navy block">Guest Self-Cancellation</span>
                    <span className="text-[11px] text-slate-500">Allow guests to cancel their own order before the kitchen starts</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.allowCustomerCancellation}
                    onChange={(e) => handleSaveSettings({ allowCustomerCancellation: e.target.checked })}
                    className="w-5 h-5 text-jaman-saffron rounded cursor-pointer accent-jaman-saffron"
                  />
                </div>
              </div>
            </div>

            {/* Guest-Facing Presentation */}
            <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
              <h3 className="text-xs font-black text-jaman-navy uppercase tracking-wider">
                Guest-Facing Presentation
              </h3>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Default Standee Template</label>
                <select
                  value={qrSettings.tableQrTemplate}
                  onChange={(e) =>
                    handleSaveSettings({
                      tableQrTemplate: e.target.value as QrOrderingSettings['tableQrTemplate']
                    })
                  }
                  className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron cursor-pointer"
                >
                  <option value="SIGNATURE">JAMANVAAR Royal Signature</option>
                  <option value="ELEGANT">Deep Navy Imperial</option>
                  <option value="MODERN">Modern Ivory Card</option>
                  <option value="MINIMAL">Ink-Saver Monochrome</option>
                  <option value="PREMIUM">Premium Foil</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Guest Welcome Message</label>
                <textarea
                  value={welcomeDraft}
                  onChange={(e) => setWelcomeDraft(e.target.value)}
                  onBlur={() => {
                    if (welcomeDraft !== (qrSettings.welcomeMessage || '')) {
                      handleSaveSettings({ welcomeMessage: welcomeDraft });
                    }
                  }}
                  rows={2}
                  placeholder="Shown at the top of the guest digital menu"
                  className="w-full bg-jaman-cream border border-jaman-border rounded-xl p-2.5 text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                />
              </div>
            </div>

            {/* Min / Max Order Limits */}
            <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
              <h3 className="text-xs font-black text-jaman-navy uppercase tracking-wider">Order Value Limits</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">Minimum Order Value (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={minOrderDraft}
                    onChange={(e) => setMinOrderDraft(e.target.value)}
                    onBlur={() => {
                      const next = Math.max(0, Number(minOrderDraft) || 0);
                      setMinOrderDraft(String(next));
                      if (next !== qrSettings.minOrderValue) {
                        handleSaveSettings({ minOrderValue: next });
                      }
                    }}
                    className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs font-mono font-black text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  />
                  <p className="text-[10px] text-slate-400">0 disables the minimum.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">Maximum Order Value (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={maxOrderDraft}
                    onChange={(e) => setMaxOrderDraft(e.target.value)}
                    onBlur={() => {
                      const next = Math.max(0, Number(maxOrderDraft) || 0);
                      setMaxOrderDraft(String(next));
                      if (next !== qrSettings.maxOrderValue) {
                        handleSaveSettings({ maxOrderValue: next });
                      }
                    }}
                    className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs font-mono font-black text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  />
                  <p className="text-[10px] text-slate-400">0 disables the cap.</p>
                </div>
              </div>

              {qrSettings.maxOrderValue > 0 && qrSettings.minOrderValue > qrSettings.maxOrderValue && (
                <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Minimum is above the maximum, so no guest order can ever be accepted.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Global Modals */}
      <CustomerQrExperienceModal
        isOpen={isCustomerPreviewOpen}
        onClose={() => setIsCustomerPreviewOpen(false)}
        initialTableNumber={previewTableNumber}
        initialOrderId={previewOrderId}
      />

      <QrCardDesignerModal
        isOpen={isCardDesignerOpen}
        onClose={() => {
          setIsCardDesignerOpen(false);
          setBatchDesignerMode(false);
        }}
        selectedTable={designerTable}
        initialBatchMode={batchDesignerMode}
        initialBatchTableNumbers={batchDesignerMode ? selectedTableNumbers : undefined}
      />

      <QrDishConfigModal
        isOpen={isDishConfigOpen}
        onClose={() => setIsDishConfigOpen(false)}
        item={configDish}
      />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-jaman-navy text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-amber-400/30 text-xs font-bold animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Add Table Modal */}
      {isAddTableOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-jaman-border space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-jaman-saffron">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-jaman-navy">Add New Restaurant Table</h3>
                  <p className="text-[11px] text-slate-500">Creates table record with secure QR code</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddTableOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-xs font-bold text-jaman-navy">Table Number / Name *</label>
                <input
                  type="text"
                  value={newTableNumber}
                  onChange={(e) => {
                    setNewTableNumber(e.target.value);
                    setAddTableError(null);
                  }}
                  placeholder="e.g. 12, T-14, VIP-1"
                  className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 font-black text-sm text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  autoFocus
                />
                {addTableError && (
                  <p className="text-[11px] font-bold text-rose-600">{addTableError}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-jaman-navy">Dining Area / Zone</label>
                <input
                  type="text"
                  list="jv-qr-zone-options"
                  value={newTableZone}
                  onChange={(e) => setNewTableZone(e.target.value)}
                  placeholder="Main Dining Hall"
                  className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 font-bold text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                />
                <datalist id="jv-qr-zone-options">
                  {distinctZones.map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
                {distinctZones.length > 0 && (
                  <p className="text-[10px] text-slate-400">
                    Existing zones: {distinctZones.join(', ')}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-jaman-navy">Seat Capacity</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={newTableCapacity}
                    onChange={(e) => setNewTableCapacity(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 font-bold text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-jaman-navy">Floor</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={newTableFloor}
                    onChange={(e) => setNewTableFloor(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 font-bold text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px]">
                ✓ A high-entropy secure QR token (SEC-010) will be automatically generated and linked to this table.
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsAddTableOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAddTable}
                className="px-4 py-2 rounded-xl bg-jaman-navy hover:bg-[#123959] text-white text-xs font-black"
              >
                Create Table & QR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Table Modal */}
      {editingTable && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-jaman-border space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-jaman-navy">Edit Table {editingTable.tableNumber}</h3>
                  <p className="text-[11px] text-slate-500">Update dining area and seat capacity</p>
                </div>
              </div>
              <button
                onClick={() => setEditingTable(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-xs font-bold text-jaman-navy">Dining Area / Zone</label>
                <input
                  type="text"
                  value={editZone}
                  onChange={(e) => setEditZone(e.target.value)}
                  className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 font-bold text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-jaman-navy">Seat Capacity</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 font-bold text-xs text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditingTable(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditTable}
                className="px-4 py-2 rounded-xl bg-jaman-navy hover:bg-[#123959] text-white text-xs font-black"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
