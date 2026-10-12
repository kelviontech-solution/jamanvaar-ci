import React, { useState } from 'react';
import { usePosStore, PosTab, isManagerOrAboveRole } from '../../store/posStore';
import { db, BusinessDayRepository } from '@jamanvaar/database';
import { useAiAccess, sound, StaffLanguagePicker, useStaffLanguage } from '@jamanvaar/ui';
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
  const {t} = useStaffLanguage();
  const ai = useAiAccess();
  const {
    activeTab,
    setActiveTab,
    setIsPrintQueueOpen,
    setIsChatbotOpen,
    setIsHoldOrdersOpen,
    selectedCategory,
    setSelectedCategory,
    currentUser
  } = usePosStore();

  // On the Billing/Menu screen, the sidebar shows dish categories instead of the main navigation
  // (there's no room, and no need, for both at once). The back arrow at the top brings the
  // ordinary navigation back so the cashier can jump to another screen; picking "Billing / Menu"
  // there returns to categories. Leaving the Menu tab for any other screen resets this, so the
  // categories are always what greets a cashier coming back to billing.
  const [showNavWhileOnMenu, setShowNavWhileOnMenu] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const manager = isManagerOrAboveRole(currentUser);
  const showCategories = activeTab === 'MENU' && !showNavWhileOnMenu;
  const categoryGroups = useCategoryGroups();

  // Calculate live badge counts for active business session
  const activeDay = BusinessDayRepository.getActiveBusinessDay();
  const activeOrdersCount = db.orders.filter(
    (o) =>
      (o.orderStatus === 'PREPARING' || o.orderStatus === 'READY' || o.orderStatus === 'CONFIRMED' || o.orderStatus === 'NEW') &&
      BusinessDayRepository.orderBelongsToBusinessDay(o, activeDay)
  ).length;

  const activeKotsCount = db.kots.filter((k) => k.status === 'PREPARING' || k.status === 'PENDING').length;
  const heldCartsCount = db.heldOrders.length;
  const occupiedTablesCount = db.tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILLING').length;
  // Archiving a dish also sets isAvailable: false (see repositories.ts), so without excluding
  // archivedAt here every discontinued dish inflated this as if it were merely out of stock.
  const outOfStockCount = db.menuItems.filter((i) => !i.archivedAt && !i.isAvailable).length;
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
    <aside className="w-28 sm:w-36 lg:w-52 xl:w-56 bg-white border border-jaman-border rounded-2xl flex flex-col justify-between select-none shrink-0 z-20 shadow-2xs overflow-hidden">
      <nav aria-label="Everyday tasks" className="grid grid-cols-2 gap-1 p-2 border-b border-jaman-border shrink-0">
        {([{id:'MENU',label:'Billing',icon:UtensilsCrossed},{id:'ORDERS',label:'Orders',icon:ShoppingBag},{id:'TABLES',label:'Tables',icon:LayoutGrid},{id:'ORDERS',label:'Collect',icon:Receipt}] as const).map(item => <button key={item.label} type="button" onClick={() => { usePosStore.getState().setOrderInboxMode(item.label === 'Collect' ? 'COLLECTIONS' : 'ALL'); goToTab(item.id); }} className="min-h-12 rounded-xl p-2 text-xs font-bold text-jaman-navy hover:bg-jaman-cream flex flex-col items-center justify-center gap-1"><item.icon size={18}/>{t(item.label)}</button>)}
      </nav>
      {showCategories ? (
        /* ---- CATEGORY RAIL: shown instead of the main nav while billing, so the categories a
           cashier needs most are always one tap away on the left, exactly where the nav usually is. */
        <nav className="p-2.5 space-y-1 overflow-y-auto flex-1 min-h-0">
          <button
            type="button"
            onClick={() => setShowNavWhileOnMenu(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs text-slate-600 hover:bg-jaman-cream hover:text-jaman-navy transition-all mb-1.5 cursor-pointer"
            title="Back to the main menu"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="text-left tracking-tight text-xs">All pages</span>
          </button>

          <div className="hidden lg:block px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Categories</div>

          <button
            type="button"
            onClick={() => { sound.play('click'); setSelectedCategory('ALL'); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-bold text-xs transition-all relative ${
              selectedCategory === 'ALL'
                ? 'bg-[#FFF2E8] text-jaman-saffron border border-[#FDBA74]/70'
                : 'text-jaman-navy bg-jaman-cream hover:bg-white border border-transparent hover:border-jaman-border'
            }`}
          >
            <Sparkles className={`w-4 h-4 shrink-0 ${'text-jaman-saffron'}`} />
            <span className="text-left tracking-tight text-xs flex-1">{t('All Menu')}</span>
            <span
              className={`hidden lg:inline-block text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-md shrink-0 ${
                selectedCategory === 'ALL' ? 'bg-white text-jaman-saffron border border-[#FDBA74]/70' : 'bg-white text-slate-600 border border-jaman-border'
              }`}
            >
              {db.menuItems.filter((i) => !i.archivedAt).length}
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
                    ? 'bg-[#FFF2E8] text-jaman-saffron border border-[#FDBA74]/70'
                    : 'text-slate-600 hover:bg-jaman-cream hover:text-jaman-navy'
                }`}
              >
                <span className="hidden lg:inline-block text-left tracking-tight truncate whitespace-nowrap flex-1">{group.displayLabel}</span>
                <span className="lg:hidden text-xs font-bold break-words w-full text-left">{group.displayLabel}</span>
                <span
                  className={`hidden lg:inline-block text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-md shrink-0 ${
                    isSelected ? 'bg-white text-jaman-saffron border border-[#FDBA74]/70' : 'bg-white text-slate-600 border border-jaman-border'
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
        <nav className="p-2.5 space-y-1 overflow-y-auto flex-1 min-h-0">
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
          {navItems.filter(item => manager || showMoreTools || ['MENU','TABLES','ORDERS','BILLS','CUSTOMERS','SHIFTS'].includes(item.id) || item.id === activeTab).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => goToTab(item.id)}
                className={`w-full min-h-11 flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all relative ${
                  isActive
                    ? 'bg-[#FFF2E8] text-jaman-saffron border border-[#FDBA74]/70'
                    : 'text-slate-600 hover:bg-jaman-cream hover:text-jaman-navy'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-jaman-saffron' : 'text-slate-500'}`} />
                <span className="text-left tracking-tight break-words text-xs">
                  {t(item.label)}
                </span>

                {/* Dynamic Live Badge */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`ml-auto text-[11px] font-bold px-1.5 py-0.2 rounded-full ${
                      'bg-jaman-saffron text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {!manager && <button type="button" aria-expanded={showMoreTools} onClick={() => setShowMoreTools(value => !value)} className="min-h-11 w-full px-3 text-left text-xs font-bold rounded-xl border border-jaman-border">{showMoreTools ? t('Fewer tools') : t('More tools')}</button>}

          {/* Dedicated AI ASSISTANT Navigation Trigger in Sidebar */}
          <div className="pt-2 border-t border-jaman-border my-1">
            {ai.showButton(db.restaurant?.showJamanAI !== false) && (
        <button
              onClick={() => setIsChatbotOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-bold text-xs transition-all relative bg-white hover:bg-[#FFF2E8] border border-[#FDBA74]/70 text-jaman-saffron shadow-2xs group cursor-pointer active:scale-98"
              title="JAMAN AI Assistant (Voice & Conversational POS Actions)"
            >
              <Sparkles className="w-4 h-4 text-jaman-saffron shrink-0" />
              <span className="hidden lg:inline-block text-left tracking-tight truncate whitespace-nowrap font-bold">
                JAMAN AI Assistant
              </span>
              <span className="hidden lg:inline-block ml-auto text-[10px] font-bold bg-jaman-saffron text-white px-1.5 py-0.2 rounded-full uppercase">
                AI
              </span>
            </button>
        )}
          </div>
        </nav>
      )}

      {/* Bottom Area: Print Queue Trigger & Held Orders */}
      <div className="p-2.5 border-t border-jaman-border space-y-1.5">
        <StaffLanguagePicker/>
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
            <span className="bg-rose-500 text-white font-bold text-[10px] px-1.5 py-0.2 rounded-full">
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
            <span className="bg-amber-500 text-white font-bold text-[11px] px-1.5 py-0.2 rounded-full">
              {heldCartsCount}
            </span>
          </div>
        )}

        <div className="hidden lg:block text-[11px] text-slate-500 px-2 py-1 text-center bg-white rounded-lg border border-jaman-border font-semibold">
          <span>Core: <strong className="text-emerald-700">Offline First</strong></span>
        </div>
      </div>
    </aside>
  );
};
