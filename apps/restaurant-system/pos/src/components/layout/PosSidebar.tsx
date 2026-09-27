import React, { useState } from 'react';
import { usePosStore, PosTab } from '../../store/posStore';
import { db, BusinessDayRepository } from '@jamanvaar/database';
import { sound } from '@jamanvaar/ui';
import { useCategoryGroups } from '../menu/useCategoryGroups';
import {
  UtensilsCrossed,
  LayoutGrid,
  ShoppingBag,
  Receipt,
  ChefHat,
  Users,
  Clock,
  BarChart3,
  Package,
  Settings,
  CirclePause,
  Printer,
  Sparkles,
  CalendarDays,
  ArrowLeft,
  Menu as MenuIcon
} from 'lucide-react';

interface NavItem {
  id: PosTab;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

export const PosSidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    setIsPrintQueueOpen,
    setIsChatbotOpen,
    setIsHoldOrdersOpen,
    selectedCategory,
    setSelectedCategory
  } = usePosStore();

  // On the Billing/Menu screen, the sidebar shows dish categories instead of the main navigation
  // (there's no room, and no need, for both at once). The back arrow at the top brings the
  // ordinary navigation back so the cashier can jump to another screen; picking "Billing / Menu"
  // there returns to categories. Leaving the Menu tab for any other screen resets this, so the
  // categories are always what greets a cashier coming back to billing.
  const [showNavWhileOnMenu, setShowNavWhileOnMenu] = useState(false);
  const showCategories = activeTab === 'MENU' && !showNavWhileOnMenu;
  const categoryGroups = useCategoryGroups();

  // Calculate live badge counts for active business session
  const activeDay = BusinessDayRepository.getActiveBusinessDay();
  const activeOrdersCount = db.orders.filter(
    (o) =>
      (o.orderStatus === 'PREPARING' || o.orderStatus === 'READY' || o.orderStatus === 'CONFIRMED' || o.orderStatus === 'NEW') &&
      o.businessDayId === activeDay.id
  ).length;

  const activeKotsCount = db.kots.filter((k) => k.status === 'PREPARING' || k.status === 'PENDING').length;
  const heldCartsCount = db.heldOrders.length;
  const occupiedTablesCount = db.tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILLING').length;
  const outOfStockCount = db.menuItems.filter((i) => !i.isAvailable).length;
  const failedPrintsCount = db.printJobs.filter((j) => j.status === 'FAILED').length;

  const navItems: NavItem[] = [
    { id: 'MENU', label: 'Billing / Menu', icon: UtensilsCrossed },
    { id: 'TABLES', label: 'Floor & Tables', icon: LayoutGrid, badge: occupiedTablesCount },
    { id: 'ORDERS', label: 'Live Orders', icon: ShoppingBag, badge: activeOrdersCount },
    { id: 'BILLS', label: 'Bills & Invoices', icon: Receipt },
    { id: 'KOT', label: 'Kitchen & KOT', icon: ChefHat, badge: activeKotsCount },
    { id: 'CUSTOMERS', label: 'Customers CRM', icon: Users },
    { id: 'SHIFTS', label: 'Shift & Cash', icon: Clock },
    { id: 'DAYS', label: 'Day History', icon: CalendarDays },
    { id: 'REPORTS', label: 'POS Reports', icon: BarChart3 },
    { id: 'INVENTORY', label: 'Inventory & Stock', icon: Package, badge: outOfStockCount },
    { id: 'SETTINGS', label: 'Settings', icon: Settings }
  ];

  const goToTab = (id: PosTab) => {
    setActiveTab(id);
    setShowNavWhileOnMenu(false); // arriving anywhere (including back on Menu) always shows that screen's own content, not the nav overlay
  };

  return (
    <aside className="w-16 lg:w-48 xl:w-52 bg-white border-r border-jaman-border flex flex-col justify-between select-none shrink-0 z-20 shadow-2xs">
      {showCategories ? (
        /* ---- CATEGORY RAIL: shown instead of the main nav while billing, so the categories a
           cashier needs most are always one tap away on the left, exactly where the nav usually is. */
        <nav className="p-2 space-y-1 overflow-y-auto flex-1 min-h-0">
          <button
            type="button"
            onClick={() => setShowNavWhileOnMenu(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs text-[#4A5568] hover:bg-jaman-cream hover:text-jaman-navy transition-all mb-1.5 cursor-pointer"
            title="Back to the main menu"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline-block text-left tracking-tight truncate whitespace-nowrap">Menu</span>
          </button>

          <div className="hidden lg:block px-3 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Categories</div>

          <button
            type="button"
            onClick={() => { sound.play('click'); setSelectedCategory('ALL'); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-black text-xs transition-all relative ${
              selectedCategory === 'ALL'
                ? 'bg-jaman-saffron text-white shadow-sm shadow-jaman-saffron/25'
                : 'text-jaman-navy bg-jaman-cream hover:bg-white border border-transparent hover:border-jaman-border'
            }`}
          >
            <Sparkles className={`w-4 h-4 shrink-0 ${selectedCategory === 'ALL' ? 'text-white' : 'text-jaman-saffron'}`} />
            <span className="hidden lg:inline-block text-left tracking-tight truncate whitespace-nowrap flex-1">All Menu</span>
            <span
              className={`hidden lg:inline-block text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md shrink-0 ${
                selectedCategory === 'ALL' ? 'bg-black/20 text-white' : 'bg-white text-slate-600 border border-jaman-border'
              }`}
            >
              {db.menuItems.length}
            </span>
          </button>

          {categoryGroups.map((group) => {
            const isSelected = selectedCategory === group.canonicalKey || group.categoryIds.includes(selectedCategory);
            return (
              <button
                key={group.canonicalKey}
                type="button"
                onClick={() => { sound.play('click'); setSelectedCategory(group.canonicalKey); }}
                title={group.primaryCategory.name}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-bold text-xs transition-all relative ${
                  isSelected
                    ? 'bg-jaman-saffron text-white shadow-sm shadow-jaman-saffron/25'
                    : 'text-[#4A5568] hover:bg-jaman-cream hover:text-jaman-navy'
                }`}
              >
                <span className="hidden lg:inline-block text-left tracking-tight truncate whitespace-nowrap flex-1">{group.displayLabel}</span>
                <span className="lg:hidden text-[10px] font-black truncate w-full text-center">{group.displayLabel.slice(0, 3)}</span>
                <span
                  className={`hidden lg:inline-block text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md shrink-0 ${
                    isSelected ? 'bg-black/20 text-white' : 'bg-white text-slate-600 border border-jaman-border'
                  }`}
                >
                  {group.totalDishCount}
                </span>
              </button>
            );
          })}
        </nav>
      ) : (
        /* Primary Navigation Links */
        <nav className="p-2 space-y-1 overflow-y-auto">
          {activeTab === 'MENU' && (
            <button
              type="button"
              onClick={() => setShowNavWhileOnMenu(false)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs text-jaman-saffron bg-[#FFF4ED] hover:bg-[#FFE8D6] transition-all mb-1.5 cursor-pointer"
              title="Back to categories"
            >
              <MenuIcon className="w-4 h-4 shrink-0" />
              <span className="hidden lg:inline-block text-left tracking-tight truncate whitespace-nowrap">Categories</span>
            </button>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => goToTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all relative ${
                  isActive
                    ? 'bg-jaman-saffron text-white shadow-sm shadow-jaman-saffron/25'
                    : 'text-[#4A5568] hover:bg-jaman-cream hover:text-jaman-navy'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline-block text-left tracking-tight truncate whitespace-nowrap">
                  {item.label}
                </span>

                {/* Dynamic Live Badge */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`ml-auto text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-white text-jaman-saffron' : 'bg-jaman-saffron text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* ✨ Dedicated AI ASSISTANT Navigation Trigger in Sidebar */}
          <div className="pt-2 border-t border-jaman-border my-1">
            <button
              onClick={() => setIsChatbotOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-black text-xs transition-all relative bg-gradient-to-r from-amber-500/10 via-jaman-saffron/10 to-amber-500/10 hover:from-amber-500/20 hover:to-jaman-saffron/20 border border-[#FED7AA] text-jaman-saffron shadow-2xs group cursor-pointer active:scale-98"
              title="JAMAN AI Assistant (Voice & Conversational POS Actions)"
            >
              <Sparkles className="w-4 h-4 text-jaman-saffron group-hover:rotate-12 transition-transform shrink-0 animate-pulse" />
              <span className="hidden lg:inline-block text-left tracking-tight truncate whitespace-nowrap font-extrabold">
                JAMAN AI Assistant
              </span>
              <span className="hidden lg:inline-block ml-auto text-[9px] font-black bg-jaman-saffron text-white px-1.5 py-0.2 rounded-full uppercase">
                AI
              </span>
            </button>
          </div>
        </nav>
      )}

      {/* Bottom Area: Print Queue Trigger & Held Orders */}
      <div className="p-2 border-t border-jaman-border space-y-1.5 bg-jaman-cream/40">
        {/* Hardware Print Queue Trigger */}
        <button
          onClick={() => setIsPrintQueueOpen(true)}
          className={`w-full p-2 rounded-xl flex items-center justify-between transition-colors text-xs font-bold ${
            failedPrintsCount > 0
              ? 'bg-rose-50 border border-rose-200 text-rose-700'
              : 'bg-white hover:bg-jaman-cream border border-jaman-border text-jaman-navy'
          }`}
          title="Print Queue"
        >
          <div className="flex items-center gap-2">
            <Printer className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="hidden lg:inline truncate text-[11px]">Print Queue</span>
          </div>
          {failedPrintsCount > 0 && (
            <span className="bg-rose-500 text-white font-bold text-[9px] px-1.5 py-0.2 rounded-full">
              {failedPrintsCount}
            </span>
          )}
        </button>

        {heldCartsCount > 0 && (
          <div
            onClick={() => setIsHoldOrdersOpen(true)}
            className="p-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between cursor-pointer hover:bg-amber-100 transition-colors"
          >
            <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
              <CirclePause className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden lg:inline text-[11px]">Held Carts</span>
            </div>
            <span className="bg-amber-500 text-white font-bold text-[10px] px-1.5 py-0.2 rounded-full">
              {heldCartsCount}
            </span>
          </div>
        )}

        <div className="hidden lg:block text-[10px] text-slate-500 px-2 py-1 text-center bg-white rounded-lg border border-jaman-border font-semibold">
          <span>Core: <strong className="text-emerald-700">Offline First</strong></span>
        </div>
      </div>
    </aside>
  );
};
