import React, { useState, useMemo, useEffect } from 'react';
import { db, QrOrderingRepository, BusinessDayRepository, MenuRepository } from '@jamanvaar/database';
import { Order, DiningTable, MenuItem, QrOrderingSettings, OrderStatus } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
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
  Sparkles,
  AlertCircle,
  Volume2,
  VolumeX,
  Sliders,
  DollarSign,
  Edit2,
  Check
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
  const [previewTableNumber, setPreviewTableNumber] = useState<string>('12');
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

  // Settings local state
  const [qrSettings, setQrSettings] = useState<QrOrderingSettings>(() => QrOrderingRepository.getSettings());
  const [settingsSavedToast, setSettingsSavedToast] = useState<boolean>(false);

  // Subscribe to live DB updates
  useEffect(() => {
    const unsub = db.subscribe(() => {
      setTick((t) => t + 1);
      setQrSettings(QrOrderingRepository.getSettings());
    });
    return unsub;
  }, []);

  const tables = db.tables;
  const categories = db.categories;
  const menuItems = db.menuItems;
  const activeDay = BusinessDayRepository.getActiveBusinessDay();

  // QR Orders list
  const allQrOrders = useMemo(() => {
    return QrOrderingRepository.getQrOrders();
  }, [tick, db.orders]);

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

  // Analytics Stats
  const qrStats = useMemo(() => {
    return QrOrderingRepository.getQrStats(analyticsDateRange);
  }, [tick, analyticsDateRange, db.orders]);

  // Handlers
  const handleOpenCustomerPreview = (tblNum: string = '12', ordId?: string) => {
    setPreviewTableNumber(tblNum);
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
    if (updated && selectedOrder?.id === orderId) {
      setSelectedOrder({ ...updated });
    }
  };

  const handleSaveSettings = (updates: Partial<QrOrderingSettings>) => {
    const next = QrOrderingRepository.updateSettings(updates);
    setQrSettings({ ...next });
    setSettingsSavedToast(true);
    setTimeout(() => setSettingsSavedToast(false), 2500);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAF7F2] overflow-hidden select-none">
      {/* Top Section Navigation Header */}
      <div className="bg-white border-b border-[#EBE6DD] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#FFF4ED] border border-[#FED7AA] flex items-center justify-center text-[#E66817] shadow-xs">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-[#0B253A] tracking-tight">
                Digital Ordering & QR Suite
              </h1>
              <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                QR Active
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Let guests scan table QR codes, explore the canonical digital menu, customize dishes, and order directly.
            </p>
          </div>
        </div>

        {/* Action Button: Simulator */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenCustomerPreview('12')}
            className="bg-[#E66817] hover:bg-[#EA580C] text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-md shadow-[#E66817]/25 transition-all active:scale-95 cursor-pointer"
          >
            <Smartphone className="w-4 h-4" />
            <span>📱 Test Scan-to-Order Simulator</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs Strip */}
      <div className="bg-white border-b border-[#EBE6DD] px-5 flex items-center gap-1 overflow-x-auto shrink-0 scrollbar-none">
        {[
          { id: 'OVERVIEW', label: 'Overview', icon: Zap },
          { id: 'TABLES', label: 'Tables & QR', icon: Grid },
          { id: 'MENU', label: 'Digital Menu', icon: UtensilsCrossed },
          { id: 'ORDERS', label: 'Live QR Orders', icon: ShoppingBag, badge: allQrOrders.filter(o => o.orderStatus === 'CONFIRMED' || o.orderStatus === 'PREPARING' || o.orderStatus === 'NEW').length || undefined, badgeColor: 'bg-[#E66817]' },
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
                  ? 'border-[#E66817] text-[#E66817] bg-amber-50/40'
                  : 'border-transparent text-slate-600 hover:text-[#0B253A] hover:bg-slate-50'
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
            <div className="bg-gradient-to-r from-[#0B253A] via-[#123959] to-[#0B253A] rounded-3xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
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
                  onClick={() => handleOpenCustomerPreview('12')}
                  className="bg-[#E66817] hover:bg-[#EA580C] text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-[#E66817]/30 transition-all active:scale-95 cursor-pointer"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Launch Live Guest Preview</span>
                </button>
                <button
                  onClick={() => {
                    setDesignerTable(tables[11] || tables[0]);
                    setIsCardDesignerOpen(true);
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Table Standees</span>
                </button>
              </div>
            </div>

            {/* Live KPI Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">Active Table QR</span>
                  <Grid className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="font-mono font-black text-2xl text-[#0B253A]">{tables.length} Tables</div>
                <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> All 12 tables mapped & active
                </p>
              </div>

              <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">Today&apos;s QR Orders</span>
                  <ShoppingBag className="w-4 h-4 text-[#E66817]" />
                </div>
                <div className="font-mono font-black text-2xl text-[#0B253A]">{qrStats.totalOrders} Orders</div>
                <p className="text-[10px] text-slate-500 font-bold">
                  Revenue: <span className="font-mono text-[#0B253A] font-black">{formatINR(qrStats.totalRevenue)}</span>
                </p>
              </div>

              <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">Pending in Kitchen</span>
                  <Flame className="w-4 h-4 text-amber-500" />
                </div>
                <div className="font-mono font-black text-2xl text-amber-600">{qrStats.pendingCount} Active</div>
                <p className="text-[10px] text-slate-500 font-bold">In preparation / scheduled</p>
              </div>

              <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">Top Table Demand</span>
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                </div>
                <div className="font-black text-base text-[#0B253A] truncate">{qrStats.topTable}</div>
                <p className="text-[10px] text-purple-700 font-bold">Most popular dining spot</p>
              </div>
            </div>

            {/* Integration Status Strip (Part 30 Compliant) */}
            <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-[#0B253A] uppercase tracking-wider flex items-center gap-2">
                  <Radio className="w-4 h-4 text-[#E66817]" />
                  <span>QR Ecosystem Real-Time Service Status</span>
                </h3>
                <span className="text-[10px] font-bold text-slate-400">Local Mesh Architecture</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <span className="text-[10px] text-emerald-800 font-bold block uppercase">QR Ordering</span>
                    <span className="text-xs font-black text-emerald-950">● ACTIVE</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <div>
                    <span className="text-[10px] text-emerald-800 font-bold block uppercase">Digital Menu</span>
                    <span className="text-xs font-black text-emerald-950">● LIVE</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <div>
                    <span className="text-[10px] text-emerald-800 font-bold block uppercase">POS Terminal</span>
                    <span className="text-xs font-black text-emerald-950">● CONNECTED</span>
                  </div>
                </div>

                {/* KDS Dispatch Ready - Honest Demo Sync Label (Part 12 & Part 30) */}
                <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-300 flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <div>
                    <span className="text-[10px] text-amber-800 font-bold block uppercase">KDS Routing</span>
                    <span className="text-xs font-black text-amber-950">● DEMO SYNC</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <div>
                    <span className="text-[10px] text-emerald-800 font-bold block uppercase">Thermal Printer</span>
                    <span className="text-xs font-black text-emerald-950">● READY</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions & Recent QR Orders Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 4 cols: Quick Actions */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-3">
                  <h3 className="text-xs font-black text-[#0B253A] uppercase tracking-wider">Quick Actions</h3>

                  <div className="space-y-2">
                    <button
                      onClick={() => setActiveSubTab('TABLES')}
                      className="w-full p-3 rounded-xl bg-[#FAF7F2] hover:bg-amber-50 border border-[#EBE6DD] hover:border-[#FED7AA] flex items-center justify-between transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Grid className="w-4 h-4 text-[#E66817]" />
                        <span className="text-xs font-black text-[#0B253A]">Manage Table QR Codes</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button
                      onClick={() => setActiveSubTab('MENU')}
                      className="w-full p-3 rounded-xl bg-[#FAF7F2] hover:bg-amber-50 border border-[#EBE6DD] hover:border-[#FED7AA] flex items-center justify-between transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <UtensilsCrossed className="w-4 h-4 text-[#E66817]" />
                        <span className="text-xs font-black text-[#0B253A]">Digital Menu Customizer</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button
                      onClick={() => setActiveSubTab('ORDERS')}
                      className="w-full p-3 rounded-xl bg-[#FAF7F2] hover:bg-amber-50 border border-[#EBE6DD] hover:border-[#FED7AA] flex items-center justify-between transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <ShoppingBag className="w-4 h-4 text-[#E66817]" />
                        <span className="text-xs font-black text-[#0B253A]">Live QR Orders Queue</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button
                      onClick={() => setActiveSubTab('SETTINGS')}
                      className="w-full p-3 rounded-xl bg-[#FAF7F2] hover:bg-amber-50 border border-[#EBE6DD] hover:border-[#FED7AA] flex items-center justify-between transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Settings className="w-4 h-4 text-[#E66817]" />
                        <span className="text-xs font-black text-[#0B253A]">QR Ordering Controls</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>

                {/* Popular Dish Metric */}
                <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-2">
                  <span className="text-[10px] font-black uppercase text-slate-400">Most Ordered Delicacy</span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 border border-[#FED7AA] flex items-center justify-center text-[#E66817] font-black shrink-0">
                      🍛
                    </div>
                    <div>
                      <h4 className="font-extrabold text-xs text-[#0B253A]">{qrStats.topDish}</h4>
                      <p className="text-[11px] text-slate-500">Highest scanned & customized dish</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 8 cols: Recent QR Orders Feed */}
              <div className="lg:col-span-8 bg-white border border-[#EBE6DD] rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-black text-[#0B253A] uppercase tracking-wider">
                      Recent Live Table Orders
                    </h3>
                    <p className="text-[11px] text-slate-500">Orders arriving from restaurant table QR scans</p>
                  </div>
                  <button
                    onClick={() => setActiveSubTab('ORDERS')}
                    className="text-xs font-black text-[#E66817] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>View All ({allQrOrders.length})</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {allQrOrders.slice(0, 5).map((order) => (
                    <div
                      key={order.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FAF7F2] px-2 rounded-xl transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedOrder(order);
                        setActiveSubTab('ORDERS');
                      }}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs text-[#0B253A]">
                            #{order.orderNumber}
                          </span>
                          <span className="text-[10px] font-black bg-[#E66817] text-white px-1.5 py-0.2 rounded font-mono">
                            Token #{order.tokenNumber}
                          </span>
                          <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                            📍 Table {order.tableNumber || '12'}
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
                          <div className="font-mono font-black text-sm text-[#0B253A]">
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
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            ● {order.orderStatus}
                          </span>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCustomerPreview(order.tableNumber || '12', order.id);
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
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs">
              <div>
                <h2 className="text-sm font-black text-[#0B253A]">Restaurant Table QR Management</h2>
                <p className="text-xs text-slate-500">
                  Every table has a unique deterministic identifier. Guests scanning the QR automatically route orders to that table.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setDesignerTable(tables[0]);
                    setIsCardDesignerOpen(true);
                  }}
                  className="bg-[#0B253A] hover:bg-[#123959] text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[#E66817]" />
                  <span>Batch Print All 12 Standees</span>
                </button>
              </div>
            </div>

            {/* Tables Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {tables.map((table) => {
                const shortCode = table.qrShortCode || `QR-TABLE-${table.tableNumber.padStart(3, '0')}`;
                const ordersToday = table.totalOrdersToday || allQrOrders.filter((o) => o.tableNumber === table.tableNumber).length;
                const revenueToday = table.totalRevenueToday || allQrOrders
                  .filter((o) => o.tableNumber === table.tableNumber && o.orderStatus !== 'CANCELLED')
                  .reduce((s, o) => s + o.totalAmount, 0);

                return (
                  <div
                    key={table.id}
                    className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs hover:shadow-md hover:border-[#E66817]/40 transition-all flex flex-col justify-between space-y-3 group"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-[#0B253A]">TABLE {table.tableNumber}</h3>
                          <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                            ● QR Active
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{table.zone} • {table.capacity} Seats</p>
                      </div>

                      <div className="w-10 h-10 rounded-xl bg-amber-50 border border-[#FED7AA] flex items-center justify-center text-[#E66817]">
                        <QrCode className="w-5 h-5" />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="bg-[#FAF7F2] p-2.5 rounded-xl border border-[#EBE6DD] flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Orders Today</span>
                        <span className="font-mono font-black text-[#0B253A]">{ordersToday} Orders</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Revenue</span>
                        <span className="font-mono font-black text-[#E66817]">{formatINR(revenueToday)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-mono font-bold text-slate-400">{shortCode}</span>
                      <span>Last: {table.lastOrderTime || '12:45 PM'}</span>
                    </div>

                    {/* Table Actions */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                      <button
                        onClick={() => handleOpenDesigner(table)}
                        className="py-1.5 px-2.5 rounded-xl border border-slate-200 hover:bg-[#FAF7F2] text-xs font-black text-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#E66817]" />
                        <span>View Standee</span>
                      </button>

                      <button
                        onClick={() => handleOpenCustomerPreview(table.tableNumber)}
                        className="py-1.5 px-2.5 rounded-xl bg-[#FFF4ED] hover:bg-[#E66817] text-[#E66817] hover:text-white border border-[#E66817]/30 text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Test Scan</span>
                      </button>
                    </div>
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
            <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-[#0B253A]">Canonical Digital Menu Controls</h2>
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
                    className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                  />
                </div>

                <select
                  value={menuCategoryFilter}
                  onChange={(e) => setMenuCategoryFilter(e.target.value)}
                  className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-1.5 text-xs font-bold text-[#0B253A] focus:outline-none focus:border-[#E66817] cursor-pointer"
                >
                  <option value="ALL">All Categories ({categories.length})</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => handleOpenCustomerPreview('12')}
                  className="bg-[#E66817] hover:bg-[#EA580C] text-white px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview Guest Menu</span>
                </button>
              </div>
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {menuItems
                .filter((item) => {
                  if (menuCategoryFilter !== 'ALL' && item.categoryId !== menuCategoryFilter) return false;
                  if (menuSearch.trim()) {
                    const q = menuSearch.toLowerCase();
                    return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
                  }
                  return true;
                })
                .map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-[#EBE6DD] rounded-2xl p-3.5 shadow-2xs flex flex-col justify-between space-y-3 hover:border-[#E66817]/40 transition-all"
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
                        <h4 className="font-extrabold text-xs text-[#0B253A] truncate">{item.name}</h4>
                        <span className="font-mono font-black text-xs text-[#E66817] block">
                          {formatINR(item.price)}
                        </span>
                      </div>
                    </div>

                    {/* Channels & Badges */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100 text-[10px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-bold">QR Ordering:</span>
                        <span className="font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                          {item.isQrOrderingEnabled !== false ? '● Enabled' : '○ Disabled'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-bold">Kiosk Touch:</span>
                        <span className="font-black text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded">
                          {item.isKioskEnabled !== false ? '● Enabled' : '○ Disabled'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-bold">Station Routing:</span>
                        <span className="font-bold text-slate-700">{item.kitchenStation || 'Tandoor'}</span>
                      </div>
                    </div>

                    {/* Configure Button */}
                    <button
                      onClick={() => handleOpenDishConfig(item)}
                      className="w-full py-1.5 px-3 rounded-xl border border-slate-200 hover:bg-[#FAF7F2] text-xs font-black text-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-[#E66817]" />
                      <span>Configure Item</span>
                    </button>
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
            <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                  placeholder="Search QR order #, token, table..."
                  className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                />
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1 bg-[#FAF7F2] p-1 rounded-xl border border-[#EBE6DD] overflow-x-auto">
                {['ALL', 'NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setOrdersStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      ordersStatusFilter === st
                        ? 'bg-[#E66817] text-white shadow-xs font-black'
                        : 'text-slate-600 hover:text-[#0B253A]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Table Selector Filter */}
              <select
                value={ordersTableFilter}
                onChange={(e) => setOrdersTableFilter(e.target.value)}
                className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-1.5 text-xs font-bold text-[#0B253A] focus:outline-none focus:border-[#E66817] cursor-pointer"
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
              <div className="lg:col-span-6 xl:col-span-5 bg-white border border-[#EBE6DD] rounded-2xl overflow-y-auto max-h-[70vh] shadow-2xs divide-y divide-slate-100">
                {filteredQrOrders.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto" />
                    <h4 className="text-xs font-black text-[#0B253A]">No QR Orders Found</h4>
                    <p className="text-[11px] text-slate-500">
                      Use the customer simulator to place a new test QR order from Table 12.
                    </p>
                    <button
                      onClick={() => handleOpenCustomerPreview('12')}
                      className="px-4 py-2 bg-[#E66817] text-white text-xs font-black rounded-xl shadow-xs cursor-pointer"
                    >
                      Place Demo QR Order
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
                          isSelected ? 'bg-amber-50/70 border-l-4 border-l-[#E66817]' : 'hover:bg-[#FAF7F2]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-[#0B253A]">
                              #{order.orderNumber}
                            </span>
                            <span className="text-[10px] font-black bg-[#E66817] text-white px-2 py-0.5 rounded font-mono">
                              #T-{order.tokenNumber}
                            </span>
                            <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                              Table {order.tableNumber || '12'}
                            </span>
                          </div>

                          <span className="font-mono font-black text-sm text-[#0B253A]">
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
              <div className="lg:col-span-6 xl:col-span-7 bg-white border border-[#EBE6DD] rounded-2xl p-5 shadow-2xs overflow-y-auto max-h-[70vh]">
                {selectedOrder ? (
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-[#0B253A]">
                            QR Order #{selectedOrder.orderNumber}
                          </h3>
                          <span className="text-xs font-black bg-[#E66817] text-white px-2 py-0.5 rounded-md font-mono">
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
                          onClick={() => handleOpenCustomerPreview(selectedOrder.tableNumber || '12', selectedOrder.id)}
                          className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-[#E66817] border border-[#FED7AA] text-xs font-bold flex items-center gap-1 cursor-pointer"
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
                    <div className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-black text-[#0B253A]">
                        <span className="flex items-center gap-1.5">
                          <ChefHat className="w-4 h-4 text-[#E66817]" />
                          <span>Kitchen Station Routing Dispatch</span>
                        </span>
                        <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                          DEMO SYNC READY
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {selectedOrder.kitchenRouting?.summaryText ||
                          QrOrderingRepository.getStationRouting(selectedOrder.items).summaryText}
                      </p>
                    </div>

                    {/* Items List */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-black text-[#0B253A] uppercase tracking-wider">Ordered Dishes</h4>
                      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl p-3">
                        {selectedOrder.items.map((it) => (
                          <div key={it.id} className="py-2 first:pt-0 last:pb-0 flex items-start justify-between">
                            <div>
                              <div className="font-extrabold text-xs text-[#0B253A]">
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
                            <span className="font-mono font-black text-xs text-[#0B253A]">
                              {formatINR(it.totalPrice)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pricing Summary */}
                    <div className="bg-[#FAF7F2] rounded-xl p-3 space-y-1 text-xs">
                      <div className="flex justify-between text-slate-500">
                        <span>Subtotal</span>
                        <span className="font-mono">{formatINR(selectedOrder.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>GST (5%)</span>
                        <span className="font-mono">{formatINR(selectedOrder.taxAmount)}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-sm text-[#0B253A]">
                        <span>Total Amount</span>
                        <span className="font-mono text-[#E66817]">{formatINR(selectedOrder.totalAmount)}</span>
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
                            className="px-3.5 py-2 rounded-xl bg-[#0B253A] text-white text-xs font-black hover:bg-[#123959] transition-all cursor-pointer"
                          >
                            Accept Order
                          </button>
                        )}

                        {(selectedOrder.orderStatus === 'NEW' || selectedOrder.orderStatus === 'ACCEPTED') && (
                          <button
                            onClick={() => handleAdvanceOrderStatus(selectedOrder.id, 'PREPARING')}
                            className="px-3.5 py-2 rounded-xl bg-[#E66817] text-white text-xs font-black hover:bg-[#EA580C] shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
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
                            Complete & Settle
                          </button>
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
            <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-[#0B253A]">QR Table Ordering Performance Reports</h2>
                <p className="text-xs text-slate-500">
                  Analyze self-ordering adoption, guest spend, and busiest tables across dining zones.
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-[#FAF7F2] p-1 rounded-xl border border-[#EBE6DD]">
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
                        ? 'bg-[#0B253A] text-white shadow-xs font-black'
                        : 'text-slate-600 hover:text-[#0B253A]'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-1">
                <span className="text-[11px] font-extrabold uppercase text-slate-500">QR Table Orders</span>
                <div className="font-mono font-black text-2xl text-[#0B253A]">{qrStats.totalOrders}</div>
                <p className="text-[10px] text-slate-500">Total table orders received</p>
              </div>

              <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-1">
                <span className="text-[11px] font-extrabold uppercase text-slate-500">QR Gross Revenue</span>
                <div className="font-mono font-black text-2xl text-[#E66817]">{formatINR(qrStats.totalRevenue)}</div>
                <p className="text-[10px] text-slate-500">Billed & settled QR revenue</p>
              </div>

              <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-1">
                <span className="text-[11px] font-extrabold uppercase text-slate-500">Average QR Ticket</span>
                <div className="font-mono font-black text-2xl text-[#0B253A]">{formatINR(qrStats.avgOrderValue)}</div>
                <p className="text-[10px] text-slate-500">Average spend per table order</p>
              </div>

              <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-1">
                <span className="text-[11px] font-extrabold uppercase text-slate-500">Top Revenue Table</span>
                <div className="font-black text-base text-[#0B253A] truncate">{qrStats.topTable}</div>
                <p className="text-[10px] text-slate-500">Highest grossing dining station</p>
              </div>
            </div>

            {/* Table-by-Table Performance Grid (Part 15) */}
            <div className="bg-white border border-[#EBE6DD] rounded-2xl p-5 shadow-2xs space-y-4">
              <h3 className="text-xs font-black text-[#0B253A] uppercase tracking-wider">
                Table-by-Table QR Performance Breakdown
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#EBE6DD] text-slate-400 font-black uppercase text-[10px]">
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
                    {qrStats.tableBreakdown.map((tbl) => {
                      const avg = tbl.orderCount > 0 ? Math.round(tbl.revenue / tbl.orderCount) : 0;
                      return (
                        <tr key={tbl.tableNumber} className="hover:bg-[#FAF7F2] transition-colors">
                          <td className="py-2.5 font-black text-[#0B253A]">Table {tbl.tableNumber}</td>
                          <td className="py-2.5 text-slate-600">{tbl.zone}</td>
                          <td className="py-2.5 text-center font-mono font-bold text-[#0B253A]">
                            {tbl.orderCount}
                          </td>
                          <td className="py-2.5 text-right font-mono font-black text-[#E66817]">
                            {formatINR(tbl.revenue)}
                          </td>
                          <td className="py-2.5 text-right font-mono text-slate-600">{formatINR(avg)}</td>
                          <td className="py-2.5 text-right font-mono text-slate-400">{tbl.lastOrder}</td>
                          <td className="py-2.5 text-center">
                            <button
                              onClick={() => handleOpenCustomerPreview(tbl.tableNumber)}
                              className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-[#E66817] text-[10px] font-black cursor-pointer"
                            >
                              Simulate
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 6: QR ORDERING SETTINGS                                  */}
        {/* ============================================================ */}
        {activeSubTab === 'SETTINGS' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="bg-white p-5 rounded-2xl border border-[#EBE6DD] shadow-2xs flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-[#0B253A]">QR Table Ordering Configuration</h2>
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
            <div className="bg-white border border-[#EBE6DD] rounded-2xl p-5 shadow-2xs space-y-4">
              <h3 className="text-xs font-black text-[#0B253A] uppercase tracking-wider">
                Feature Switches & Automation
              </h3>

              <div className="divide-y divide-slate-100">
                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-[#0B253A] block">QR Ordering System</span>
                    <span className="text-[11px] text-slate-500">Enable or disable guest table QR ordering globally</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.isQrOrderingActive}
                    onChange={(e) => handleSaveSettings({ isQrOrderingActive: e.target.checked })}
                    className="w-5 h-5 text-[#E66817] rounded cursor-pointer accent-[#E66817]"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-[#0B253A] block">Allow Customer Ordering</span>
                    <span className="text-[11px] text-slate-500">Permit guests to place orders directly without staff intervention</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.allowCustomerOrdering}
                    onChange={(e) => handleSaveSettings({ allowCustomerOrdering: e.target.checked })}
                    className="w-5 h-5 text-[#E66817] rounded cursor-pointer accent-[#E66817]"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-[#0B253A] block">Allow Dish Modifications</span>
                    <span className="text-[11px] text-slate-500">Permit guests to select spice levels and paid add-ons</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.allowCustomerModifications}
                    onChange={(e) => handleSaveSettings({ allowCustomerModifications: e.target.checked })}
                    className="w-5 h-5 text-[#E66817] rounded cursor-pointer accent-[#E66817]"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-[#0B253A] block">Special Cooking Instructions</span>
                    <span className="text-[11px] text-slate-500">Allow guests to write custom notes for chefs (&ldquo;no onion&rdquo;, etc.)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.allowSpecialInstructions}
                    onChange={(e) => handleSaveSettings({ allowSpecialInstructions: e.target.checked })}
                    className="w-5 h-5 text-[#E66817] rounded cursor-pointer accent-[#E66817]"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-[#0B253A] block">Auto-Dispatch to Kitchen (KOT)</span>
                    <span className="text-[11px] text-slate-500">Automatically send accepted QR orders to kitchen routing stations</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.autoSendToKitchen}
                    onChange={(e) => handleSaveSettings({ autoSendToKitchen: e.target.checked })}
                    className="w-5 h-5 text-[#E66817] rounded cursor-pointer accent-[#E66817]"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-[#0B253A] block">Live Order Status Timeline</span>
                    <span className="text-[11px] text-slate-500">Show real-time cooking and preparation updates to the guest</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.showOrderStatusTimeline}
                    onChange={(e) => handleSaveSettings({ showOrderStatusTimeline: e.target.checked })}
                    className="w-5 h-5 text-[#E66817] rounded cursor-pointer accent-[#E66817]"
                  />
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-[#0B253A] block">Audio Chime on New QR Order</span>
                    <span className="text-[11px] text-slate-500">Play pleasant notification sound at POS when table order arrives</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.enableNotificationSound}
                    onChange={(e) => handleSaveSettings({ enableNotificationSound: e.target.checked })}
                    className="w-5 h-5 text-[#E66817] rounded cursor-pointer accent-[#E66817]"
                  />
                </div>
              </div>
            </div>

            {/* Min / Max Order Limits */}
            <div className="bg-white border border-[#EBE6DD] rounded-2xl p-5 shadow-2xs space-y-4">
              <h3 className="text-xs font-black text-[#0B253A] uppercase tracking-wider">Order Value Limits</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">Minimum Order Value (₹)</label>
                  <input
                    type="number"
                    value={qrSettings.minOrderValue}
                    onChange={(e) => handleSaveSettings({ minOrderValue: Number(e.target.value) })}
                    className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-mono font-black text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">Maximum Order Value (₹)</label>
                  <input
                    type="number"
                    value={qrSettings.maxOrderValue}
                    onChange={(e) => handleSaveSettings({ maxOrderValue: Number(e.target.value) })}
                    className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-mono font-black text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                  />
                </div>
              </div>
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
        onClose={() => setIsCardDesignerOpen(false)}
        selectedTable={designerTable}
      />

      <QrDishConfigModal
        isOpen={isDishConfigOpen}
        onClose={() => setIsDishConfigOpen(false)}
        item={configDish}
      />
    </div>
  );
};
