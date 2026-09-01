import React, { useState } from 'react';
import { LicenseRepository } from '@jamanvaar/database';
import { PlanTier } from '@jamanvaar/types';
import {
  Check,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  KeyRound,
  UtensilsCrossed,
  Banknote,
  LayoutGrid,
  ChefHat,
  Package,
  BarChart3,
  HardDrive,
  Printer,
  Users,
  Settings,
  Smartphone,
  QrCode,
  Network,
  Bot
} from 'lucide-react';

interface SubscriptionPlansViewProps {
  showToast: (msg: string) => void;
  onUpdated?: () => void;
}

export const SubscriptionPlansView: React.FC<SubscriptionPlansViewProps> = ({
  showToast,
  onUpdated
}) => {
  const [dealerKeyInput, setDealerKeyInput] = useState('');
  const [licenseFeedback, setLicenseFeedback] = useState('');
  const [licenseError, setLicenseError] = useState('');
  const [expandedCoreCategory, setExpandedCoreCategory] = useState<string | null>('pos_billing');
  const [expandedProCategory, setExpandedProCategory] = useState<string | null>('captain');
  const [showAllCoreFeatures, setShowAllCoreFeatures] = useState(false);
  const [showAllProFeatures, setShowAllProFeatures] = useState(false);

  const currentLicense = LicenseRepository.getLicense();
  const currentTier: PlanTier = currentLicense.tier || 'CORE';

  const handleActivatePlan = (tier: PlanTier) => {
    setLicenseError('');
    LicenseRepository.activatePlan(tier);
    const msg = `Successfully activated ${tier === 'PRO' ? 'JAMANVAAR PRO (₹7,000)' : 'JAMANVAAR CORE (₹5,000)'}!`;
    setLicenseFeedback(msg);
    showToast(msg);
    if (onUpdated) onUpdated();
    setTimeout(() => setLicenseFeedback(''), 4000);
  };

  const handleActivateWithDealerKey = () => {
    setLicenseError('');
    const key = dealerKeyInput.trim().toUpperCase();
    if (!key) {
      setLicenseError('Please enter a valid dealer activation license key');
      return;
    }

    if (key.includes('PRO')) {
      LicenseRepository.activatePlan('PRO', key);
      const msg = `Valid Dealer Key: Activated JAMANVAAR PRO (${key})`;
      setLicenseFeedback(msg);
      showToast(msg);
      setDealerKeyInput('');
    } else if (key.includes('CORE')) {
      LicenseRepository.activatePlan('CORE', key);
      const msg = `Valid Dealer Key: Activated JAMANVAAR CORE (${key})`;
      setLicenseFeedback(msg);
      showToast(msg);
      setDealerKeyInput('');
    } else {
      LicenseRepository.activatePlan('PRO', key);
      const msg = `Custom Enterprise Key Applied: (${key})`;
      setLicenseFeedback(msg);
      showToast(msg);
      setDealerKeyInput('');
    }
    if (onUpdated) onUpdated();
    setTimeout(() => setLicenseFeedback(''), 4000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto select-none">
      {/* Toast / Feedback Banner */}
      {licenseFeedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl text-xs font-black flex items-center justify-between animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{licenseFeedback}</span>
          </div>
          <button
            onClick={() => setLicenseFeedback('')}
            className="text-emerald-700 hover:text-emerald-900 font-bold text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {licenseError && (
        <div className="p-3.5 bg-red-50 border border-red-300 text-red-800 rounded-2xl text-xs font-black flex items-center justify-between animate-fadeIn shadow-xs">
          <span>⚠️ {licenseError}</span>
          <button
            onClick={() => setLicenseError('')}
            className="text-red-700 hover:text-red-900 font-bold text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Plan Comparison Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">
            JAMANVAAR Software Plans
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Commercial restaurant POS & connected restaurant ecosystem licensing by KELVIONTECH.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-black text-[#E66817] bg-[#FFF4ED] border border-[#FDBA74] px-3.5 py-1 rounded-xl w-fit shadow-2xs">
            Active Plan: {currentLicense.planName || 'JAMANVAAR CORE'} ({currentTier})
          </span>
          <span className="text-[11px] font-bold text-slate-500 bg-[#FAF7F2] border border-[#EBE6DD] px-3 py-1 rounded-xl w-fit">
            Lifetime License • No Monthly Commissions • 100% Offline-First
          </span>
        </div>
      </div>

      {/* TWO CARDS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CARD 1: JAMANVAAR CORE (₹5,000) - 5 Cols */}
        <div
          className={`lg:col-span-5 bg-white rounded-3xl p-5 sm:p-6 border flex flex-col justify-between transition-all select-none ${
            currentTier === 'CORE'
              ? 'border-[#0B253A] shadow-md ring-2 ring-[#0B253A]/10'
              : 'border-[#EBE6DD] shadow-2xs hover:border-slate-300'
          }`}
        >
          <div className="space-y-4">
            {/* Card Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-black tracking-wider uppercase text-slate-400 block">
                  FOUNDATION EDITION
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-[#0B253A]">JAMANVAAR CORE</h2>
                <span className="text-xs text-slate-600 font-bold block mt-0.5">
                  POS + Complete Restaurant Management
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-2xl sm:text-3xl font-black text-[#0B253A] font-mono">₹5,000</span>
                <span className="text-[10px] text-slate-400 block">per license</span>
              </div>
            </div>

            {/* Positioning Tagline */}
            <p className="text-xs text-slate-600 leading-relaxed bg-[#FAF7F2] p-3 rounded-2xl border border-[#EBE6DD]">
              Complete offline-first restaurant POS for billing, payments, tables, kitchen operations, inventory and daily restaurant management.
            </p>

            {/* CORE Feature Modules Accordion */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                  INCLUDED MODULES & CAPABILITIES (183 FEATURES):
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllCoreFeatures(!showAllCoreFeatures)}
                  className="text-[10px] font-bold text-slate-500 hover:text-[#0B253A] underline cursor-pointer"
                >
                  {showAllCoreFeatures ? 'Collapse All' : 'Expand All'}
                </button>
              </div>

              {[
                {
                  id: 'pos_billing',
                  title: '1. POS & Fast Billing',
                  icon: UtensilsCrossed,
                  features: [
                    'Fast Counter Billing',
                    'New Order Creation',
                    'Dine-In Orders',
                    'Takeaway Orders',
                    'Delivery Orders',
                    'Token Orders',
                    'Item Search',
                    'SKU Search',
                    'Category-Based Menu',
                    'Quick Add Items',
                    'Item Quantity Control',
                    'Item Customization',
                    'Item Modifiers',
                    'Special Instructions',
                    'Order Notes',
                    'Customer Attachment',
                    'Repeat Previous Order',
                    'Hold Order',
                    'Recall Held Order',
                    'Order Editing',
                    'Discount Application',
                    'Automatic Tax Calculation',
                    'Bill Preview',
                    'Bill Generation',
                    'Bill Reopening',
                    'Invoice Numbering',
                    'Token Number Generation',
                    'Fast Touch-Friendly POS Interface'
                  ]
                },
                {
                  id: 'payments_cash',
                  title: '2. Payments & Cash Drawer',
                  icon: Banknote,
                  features: [
                    'Cash Payment',
                    'UPI Payment',
                    'BharatQR Payment',
                    'Card Payment',
                    'Split Payment',
                    'Multiple Payment Methods',
                    'Payment Settlement',
                    'Cash Tender Entry',
                    'Automatic Change Calculation',
                    'Cash Drawer Management',
                    'Opening Cash / Float',
                    'Closing Cash',
                    'Cash Variance',
                    'Cashier Shift Tracking',
                    'Payment History',
                    'Refund Management',
                    'Payment Status Tracking',
                    'Daily Cash Collection',
                    'Payment Reconciliation'
                  ]
                },
                {
                  id: 'table_floor',
                  title: '3. Table & Floor Management',
                  icon: LayoutGrid,
                  features: [
                    'Visual Floor Plan',
                    'Multiple Restaurant Sections',
                    'Table Creation',
                    'Table Numbering',
                    'Table Capacity',
                    'Available Table Status',
                    'Occupied Table Status',
                    'Reserved Table Status',
                    'Table Order Management',
                    'Guest Count',
                    'Open Table',
                    'Close Table',
                    'Transfer Table',
                    'Merge Tables',
                    'Split Table',
                    'Move Order Between Tables',
                    'Table-Based Billing',
                    'Table Occupancy Tracking',
                    'Table Turnover Tracking',
                    'Real-Time Table Status'
                  ]
                },
                {
                  id: 'kitchen_kot',
                  title: '4. Kitchen / KOT / Basic KDS',
                  icon: ChefHat,
                  features: [
                    'KOT Creation',
                    'KOT Sending',
                    'KOT Printing',
                    'KOT Reprinting',
                    'Kitchen Order Queue',
                    'Kitchen Station Routing',
                    'Kitchen Station Assignment',
                    'Order Preparing Status',
                    'Order Ready Status',
                    'Order Completed Status',
                    'Food Ready Notification',
                    'KOT Cancellation',
                    'KOT Modification',
                    'Kitchen Notes',
                    'Order Priority',
                    'Kitchen Order Timing',
                    'Basic KDS',
                    'Pending KOT Tracking',
                    'Kitchen Availability Status'
                  ]
                },
                {
                  id: 'menu_inventory',
                  title: '5. Menu & Inventory',
                  icon: Package,
                  features: [
                    'Menu Management',
                    'Category Management',
                    'Dish Management',
                    'Dish Images',
                    'Dish Descriptions',
                    'Dish SKU',
                    'Dish Pricing',
                    'Veg / Jain / Non-Veg Classification',
                    'Dish Availability',
                    'Mark Dish Available',
                    'Mark Dish Unavailable',
                    'Kitchen Station Assignment',
                    'Modifier Management',
                    'Recipe Information',
                    'Inventory Tracking',
                    'Low Stock Status',
                    'Item Availability Management',
                    'Inventory Search',
                    'Category Filtering',
                    'Starter Menu Import',
                    'Bulk Menu Management'
                  ]
                },
                {
                  id: 'reports_gst',
                  title: '6. Reports & GST',
                  icon: BarChart3,
                  features: [
                    'Daily Sales Report',
                    'Order Report',
                    'Payment Report',
                    'Cash Report',
                    'GST Report',
                    'CGST / SGST Breakdown',
                    'Discount Report',
                    'Top Selling Dishes',
                    'Dish Velocity',
                    'Average Order Value',
                    'Sales by Order Type',
                    'Sales by Payment Method',
                    'Cashier Performance',
                    'Shift Performance',
                    'Date-Based Reports',
                    'Custom Date Reports',
                    'Monthly Reports',
                    'Yearly Reports',
                    'Report Preview',
                    'Print Reports',
                    'PDF Reports',
                    'CSV Export'
                  ]
                },
                {
                  id: 'offline_ops',
                  title: '7. Offline-First Operations',
                  icon: HardDrive,
                  features: [
                    'Local SQLite Database',
                    'Offline Billing',
                    'Offline Order Creation',
                    'Offline Menu Access',
                    'Offline Table Management',
                    'Offline KOT Queue',
                    'Offline Reports',
                    'Local Print Queue',
                    'Offline Payment Recording',
                    'Automatic Sync When Online',
                    'Sync Retry',
                    'Local Data Persistence',
                    'Connection Status',
                    'Local Engine Status',
                    'Offline-First POS Operation'
                  ]
                },
                {
                  id: 'printing_hw',
                  title: '8. Printing & Hardware',
                  icon: Printer,
                  features: [
                    '58mm Thermal Printer Support',
                    '80mm Thermal Printer Support',
                    'ESC/POS Printing',
                    'Automatic Printer Detection',
                    'Receipt Printing',
                    'KOT Printing',
                    'Report Printing',
                    'Reprint Receipt',
                    'Print Queue',
                    'Printer Status',
                    'Printer Test Print',
                    'Auto-Print After Payment',
                    'Auto-Print KOT',
                    'Cash Drawer Trigger',
                    'Printer Configuration'
                  ]
                },
                {
                  id: 'customer_mgmt',
                  title: '9. Customer Management',
                  icon: Users,
                  features: [
                    'Customer Database',
                    'Customer Search',
                    'Customer Phone Number',
                    'Customer Order History',
                    'Customer Visit History',
                    'Customer Spending History',
                    'Customer Notes',
                    'Loyalty Points',
                    'Repeat Customer Tracking',
                    'Customer Information on Bills'
                  ]
                },
                {
                  id: 'restaurant_admin',
                  title: '10. Restaurant Administration',
                  icon: Settings,
                  features: [
                    'Restaurant Settings',
                    'Branch Information',
                    'Tax Configuration',
                    'Bill Configuration',
                    'Printer Configuration',
                    'Kitchen Configuration',
                    'Menu Configuration',
                    'User Management',
                    'Role Management',
                    'Cashier Management',
                    'Device Configuration',
                    'License Management',
                    'Subscription Management',
                    'Audit Records'
                  ]
                }
              ].map((group) => {
                const isExpanded = expandedCoreCategory === group.id || showAllCoreFeatures;

                return (
                  <div key={group.id} className="border border-[#EBE6DD] rounded-2xl overflow-hidden bg-white shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setExpandedCoreCategory(expandedCoreCategory === group.id ? null : group.id)}
                      className="w-full px-3.5 py-2.5 bg-[#FAF7F2] hover:bg-slate-100 flex items-center justify-between font-bold text-xs text-[#0B253A] cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                        <span>{group.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <span className="text-[10px] font-mono font-bold text-slate-600 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                          {group.features.length} features
                        </span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="p-3 text-[11px] text-slate-700 bg-white border-t border-[#EBE6DD]">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1.5">
                          {group.features.map((feat, fIdx) => (
                            <div key={fIdx} className="flex items-start gap-1.5 leading-snug">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5 stroke-[2.5]" />
                              <span>{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card Bottom / CTA */}
          <div className="pt-6 border-t border-slate-100 mt-4 space-y-2">
            <div className="text-[10px] font-black tracking-wider uppercase text-emerald-700 text-center flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>COMPLETE RESTAURANT MANAGEMENT</span>
            </div>

            {currentTier === 'CORE' ? (
              <div className="w-full py-3 rounded-2xl bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs text-center flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Current Active Edition</span>
              </div>
            ) : (
              <button
                onClick={() => handleActivatePlan('CORE')}
                className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs transition-colors cursor-pointer"
              >
                Switch to JAMANVAAR CORE (₹5,000)
              </button>
            )}
          </div>
        </div>

        {/* CARD 2: JAMANVAAR PRO (₹7,000) - 7 Cols - FLAGSHIP CONNECTED ECOSYSTEM */}
        <div
          className={`lg:col-span-7 bg-gradient-to-b from-[#FFFDFB] via-white to-[#FFFDFB] rounded-3xl p-5 sm:p-7 border-2 flex flex-col justify-between transition-all select-none relative shadow-xl ${
            currentTier === 'PRO'
              ? 'border-[#E66817] ring-4 ring-[#E66817]/20 shadow-2xl'
              : 'border-[#FDBA74] hover:border-[#E66817]'
          }`}
        >
          {/* Recommended Flagship Ribbon */}
          <div className="absolute -top-3.5 right-6 bg-gradient-to-r from-[#E66817] to-[#EA580C] text-white text-[11px] font-black px-4 py-1 rounded-full shadow-lg uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>RECOMMENDED • BEST VALUE</span>
          </div>

          <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-amber-200/60 pb-4">
              <div>
                <span className="text-[10px] font-black tracking-widest uppercase text-[#E66817] block">
                  FLAGSHIP CONNECTED RESTAURANT ECOSYSTEM
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-[#0B253A] flex items-center gap-2">
                  <span>JAMANVAAR PRO</span>
                </h2>
                <span className="text-xs text-slate-700 font-bold block mt-0.5">
                  POS + Restaurant Management + Connected Restaurant Ecosystem
                </span>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <div className="flex items-baseline gap-1 sm:justify-end">
                  <span className="text-3xl sm:text-4xl font-black text-[#0B253A] font-mono">₹7,000</span>
                </div>
                <span className="text-[10px] text-slate-400 block font-sans">per license</span>
              </div>
            </div>

            {/* Positioning Tagline */}
            <p className="text-xs text-slate-700 leading-relaxed font-medium bg-amber-50/40 p-3 rounded-2xl border border-amber-200/70">
              Everything in JAMANVAAR CORE plus wireless Captain ordering, QR table ordering, Kiosk integration, advanced multi-station KDS, real-time multi-device synchronization, advanced analytics, customer intelligence and JAMAN AI Assistant.
            </p>

            {/* Top Prominent Value Badges */}
            <div className="space-y-2">
              <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs font-black text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>✓ EVERYTHING IN CORE IS INCLUDED (183 Base Features)</span>
              </div>

              <div className="p-2.5 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 rounded-xl border border-amber-300 text-xs text-[#0B253A] flex items-center justify-between gap-2 font-black">
                <div className="flex items-center gap-1.5 text-[#E66817]">
                  <Sparkles className="w-4 h-4 text-[#E66817] shrink-0" />
                  <span>⭐ ONLY ₹2,000 MORE THAN CORE</span>
                </div>
                <span className="text-[11px] font-bold text-[#E66817] bg-white px-2.5 py-0.5 rounded-full shadow-2xs border border-amber-200">
                  ⭐ RECOMMENDED • BEST VALUE
                </span>
              </div>
            </div>

            {/* PRO Feature Modules Accordion */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-[#E66817] tracking-wider block">
                  ⭐ PRO CONNECTED MODULES (173 EXCLUSIVE CAPABILITIES):
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllProFeatures(!showAllProFeatures)}
                  className="text-[10px] font-bold text-[#E66817] hover:text-[#EA580C] underline cursor-pointer"
                >
                  {showAllProFeatures ? 'Collapse All PRO' : 'Expand All PRO'}
                </button>
              </div>

              {[
                {
                  id: 'captain',
                  title: '1. Wireless Captain / Waiter App',
                  icon: Smartphone,
                  isFlagship: true,
                  features: [
                    'Captain Login',
                    'Waiter Login',
                    'Staff Profile',
                    'Assigned Tables',
                    'My Tables',
                    'Table Availability',
                    'Table Occupancy',
                    'Table-Side Ordering',
                    'Browse Menu',
                    'Search Dishes',
                    'Add Items',
                    'Modify Quantity',
                    'Item Modifiers',
                    'Special Instructions',
                    'Customer Attachment',
                    'Table Notes',
                    'Send Order to POS',
                    'Send Order to Kitchen',
                    'Course-Based Ordering',
                    'Course Dispatch',
                    'Order Status Tracking',
                    'Preparing Status',
                    'Food Ready Status',
                    'Food Ready Notification',
                    'Bill Request',
                    'View Bill',
                    'Payment Request',
                    'Reorder',
                    'Repeat Previous Order',
                    'Table Transfer',
                    'Table Merge',
                    'Table Split',
                    'Captain Order Attribution',
                    'Waiter Performance',
                    'Orders Handled',
                    'Captain Sales Tracking',
                    'Offline Captain Mode',
                    'Automatic POS Synchronization',
                    'Real-Time Updates'
                  ]
                },
                {
                  id: 'qr_kiosk',
                  title: '2. QR Table Ordering & Kiosk',
                  icon: QrCode,
                  features: [
                    'Table QR Code',
                    'Unique QR per Table',
                    'Scan-to-Order',
                    'Digital Menu',
                    'Digital Categories',
                    'Dish Images',
                    'Dish Descriptions',
                    'Dish Customization',
                    'Modifiers',
                    'Customer Cart',
                    'Quantity Selection',
                    'Special Instructions',
                    'Table Identification',
                    'Order Submission',
                    'POS Order Reception',
                    'Kitchen Order Routing',
                    'Order Status',
                    'QR Order Tracking',
                    'Kiosk Integration',
                    'Kiosk Touch Ordering',
                    'Kiosk Menu',
                    'Kiosk Cart',
                    'Kiosk Order Confirmation',
                    'Kiosk Token Generation',
                    'Kiosk POS Synchronization',
                    'Kiosk KDS Synchronization',
                    'Kiosk Printer Integration',
                    'Multiple Ordering Channels'
                  ]
                },
                {
                  id: 'sync',
                  title: '3. Real-Time Multi-Machine Mesh Sync',
                  icon: Network,
                  features: [
                    'POS ↔ Captain Sync',
                    'POS ↔ KDS Sync',
                    'POS ↔ Kiosk Sync',
                    'Captain ↔ KDS Sync',
                    'Kiosk ↔ KDS Sync',
                    'Real-Time Order Sync',
                    'Real-Time Table Sync',
                    'Real-Time Menu Sync',
                    'Real-Time Availability Sync',
                    'Real-Time Order Status Sync',
                    'Bill Status Synchronization',
                    'Device Presence',
                    'Online / Offline Device Status',
                    'Automatic Reconnection',
                    'Sync Retry',
                    'Offline Queue',
                    'Pending Sync Queue',
                    'Conflict Handling',
                    'Duplicate Prevention',
                    'Event Synchronization',
                    'Device Health Monitoring',
                    'Multi-Machine Restaurant Network'
                  ]
                },
                {
                  id: 'kds',
                  title: '4. Advanced Multi-Station KDS',
                  icon: ChefHat,
                  features: [
                    'Multiple Kitchen Stations',
                    'Main Kitchen',
                    'Tandoor Station',
                    'Curry Station',
                    'Beverage Station',
                    'Dessert Station',
                    'Biryani Station',
                    'Station-Based KOT Routing',
                    'Automatic Order Routing',
                    'Course Routing',
                    'Kitchen Queue',
                    'Priority Orders',
                    'Preparing Orders',
                    'Ready Orders',
                    'Completed Orders',
                    'Food Ready Notifications',
                    'Delayed KOT Detection',
                    'Order Preparation Timer',
                    'Station Performance',
                    'Kitchen Performance',
                    'KOT Reprinting',
                    'KOT Modification',
                    'KOT Cancellation',
                    'Real-Time KDS Updates',
                    'Multi-Screen KDS',
                    'Kitchen Load Visibility'
                  ]
                },
                {
                  id: 'ai',
                  title: '5. JAMANVAAR AI Restaurant Assistant',
                  icon: Bot,
                  features: [
                    "Today's Sales Questions",
                    "Today's Order Questions",
                    'Average Order Value Analysis',
                    'Payment Analysis',
                    'Cash Analysis',
                    'Kitchen Analysis',
                    'Delayed KOT Analysis',
                    'Table Occupancy Analysis',
                    'Menu Performance Analysis',
                    'Top Selling Dish Analysis',
                    'Slow Selling Dish Analysis',
                    'Sales Trend Analysis',
                    'Customer Analysis',
                    'Restaurant Performance Questions',
                    'Operational Insights',
                    'Low Stock Insights',
                    'Low Availability Insights',
                    'Business Summary',
                    'Daily Restaurant Summary',
                    'Management Questions',
                    'Natural Language Restaurant Queries',
                    'Offline Local AI Intelligence',
                    'Local Database-Based Answers'
                  ]
                },
                {
                  id: 'analytics',
                  title: '6. Advanced Analytics + CRM + Live Monitoring',
                  icon: BarChart3,
                  features: [
                    'Advanced Sales Analytics',
                    'Hourly Sales Analysis',
                    'Day-of-Week Analysis',
                    'Sales Heatmaps',
                    'Channel Performance',
                    'POS vs Captain vs Kiosk',
                    'Table Utilization',
                    'Table Turnover',
                    'Average Order Value',
                    'Dish Velocity',
                    'Category Performance',
                    'Gross Sales',
                    'Net Sales',
                    'Discount Analysis',
                    'GST Analysis',
                    'Payment Mix',
                    'Cash Performance',
                    'UPI Performance',
                    'Card Performance',
                    'Customer Lifetime Value',
                    'Repeat Customer Analysis',
                    'Customer Visit Frequency',
                    'Customer Spending Patterns',
                    'Captain Sales Attribution',
                    'Orders Handled by Captain',
                    'Waiter Performance',
                    'KOT Performance',
                    'Kitchen Timing',
                    'Delayed Order Detection',
                    'Low Stock Alerts',
                    'Low Availability Alerts',
                    'Live POS Monitoring',
                    'Live Captain Monitoring',
                    'Live KDS Monitoring',
                    'Live Kiosk Monitoring',
                    'Printer Monitoring',
                    'Device Monitoring',
                    'Sync Monitoring',
                    'Operational Alerts',
                    'Historical Comparisons',
                    'Daily vs Weekly Comparison',
                    'Monthly Performance Analysis',
                    'Restaurant Flow Metrics'
                  ]
                }
              ].map((group) => {
                const Icon = group.icon;
                const isExpanded = expandedProCategory === group.id || showAllProFeatures;

                return (
                  <div
                    key={group.id}
                    className={`rounded-2xl overflow-hidden bg-white shadow-2xs transition-all ${
                      group.isFlagship
                        ? 'border-2 border-[#E66817]/60 ring-2 ring-[#E66817]/10'
                        : 'border border-amber-200/80'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedProCategory(expandedProCategory === group.id ? null : group.id)}
                      className={`w-full px-3.5 py-3 flex items-center justify-between font-black text-xs cursor-pointer transition-colors ${
                        group.isFlagship
                          ? 'bg-gradient-to-r from-[#FFF7F0] to-[#FFFDF9] hover:bg-amber-50 text-[#0B253A]'
                          : 'bg-[#FFFDFB] hover:bg-amber-50/50 text-[#0B253A]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 text-left">
                        <div className="w-6 h-6 rounded-lg bg-orange-100 text-[#E66817] flex items-center justify-center shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="tracking-tight">{group.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
                        <span className="text-[10px] font-mono font-bold text-[#E66817] bg-[#FFF4EB] border border-[#FED7AA] px-2 py-0.5 rounded-full">
                          {group.features.length} features
                        </span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[#E66817]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#E66817]" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-3.5 text-[11px] text-slate-800 bg-white border-t border-amber-100">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
                          {group.features.map((feat, fIdx) => (
                            <div key={fIdx} className="flex items-start gap-1.5 leading-snug">
                              <Check className="w-3.5 h-3.5 text-[#E66817] shrink-0 mt-0.5 stroke-[2.5]" />
                              <span className="font-medium text-slate-700">{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* PRO VALUE SUMMARY BANNER */}
            <div className="p-4 bg-gradient-to-br from-[#0B253A] to-[#1E3A4C] text-white rounded-2xl shadow-md space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <strong className="text-xs font-black tracking-wide text-amber-200">
                  "Everything you need to run a connected modern restaurant."
                </strong>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-semibold text-slate-200">
                {[
                  'Complete POS',
                  'Captain / Waiter App',
                  'QR Table Ordering',
                  'Kiosk',
                  'Advanced KDS',
                  'Real-Time Device Sync',
                  'Advanced Analytics',
                  'Customer Intelligence',
                  'JAMANA AI',
                  'Live Restaurant Monitoring'
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 stroke-[2.5]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card Bottom / Primary CTA */}
          <div className="pt-5 border-t border-amber-200/80 mt-4 space-y-2">
            <div className="text-[10px] font-black tracking-wider uppercase text-[#E66817] text-center flex items-center justify-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#E66817]" />
              <span>RUN + CONNECT + GROW YOUR RESTAURANT</span>
            </div>

            {currentTier === 'PRO' ? (
              <div className="w-full py-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-black text-xs text-center flex items-center justify-center gap-2 shadow-xs">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-sm">Active License: JAMANVAAR PRO Edition</span>
              </div>
            ) : (
              <div className="space-y-1 text-center">
                <button
                  onClick={() => handleActivatePlan('PRO')}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#E66817] via-[#EA580C] to-[#E66817] hover:from-[#EA580C] hover:to-[#C2410C] text-white font-black text-sm uppercase tracking-wider shadow-xl shadow-[#E66817]/30 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>CHOOSE JAMANVAAR PRO — ₹7,000 →</span>
                </button>
                <span className="text-[11px] text-slate-500 font-bold block pt-0.5">
                  "Only ₹2,000 more than Core."
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: WHY RESTAURANTS UPGRADE TO PRO (4 Pillars) */}
      <div className="bg-white rounded-3xl p-6 border border-[#EBE6DD] shadow-2xs space-y-4">
        <div>
          <span className="text-[10px] font-black uppercase text-[#E66817] tracking-widest block">
            COMMERCIAL ADVANTAGE
          </span>
          <h3 className="text-base font-black text-[#0B253A]">Why Restaurants Upgrade to JAMANVAAR PRO</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EBE6DD] space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#E66817] flex items-center justify-center font-black text-xs">
              01
            </div>
            <strong className="text-xs font-black text-[#0B253A] block">
              📱 SERVE FROM THE TABLE
            </strong>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Wireless Captain App for waiters. Take orders table-side and fire KOT tickets directly to the kitchen.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EBE6DD] space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-xs">
              02
            </div>
            <strong className="text-xs font-black text-[#0B253A] block">
              📲 LET CUSTOMERS ORDER
            </strong>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              QR Table Ordering and Self-Service Kiosks. Increase average ticket size without hiring extra staff.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EBE6DD] space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-black text-xs">
              03
            </div>
            <strong className="text-xs font-black text-[#0B253A] block">
              ⚡ CONNECT FLOOR & KITCHEN
            </strong>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              POS ↔ Captain ↔ KDS real-time mesh sync. Zero miscommunication between waiters, kitchen, and billing.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EBE6DD] space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-black text-xs">
              04
            </div>
            <strong className="text-xs font-black text-[#0B253A] block">
              📊 RUN WITH INTELLIGENCE
            </strong>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Advanced analytics, staff tracking, and JAMAN AI Assistant to answer sales and operational questions in seconds.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 3: CORE vs PRO SIDE-BY-SIDE MATRIX */}
      <div className="bg-white rounded-3xl p-6 border border-[#EBE6DD] shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-black text-[#0B253A]">CORE vs PRO — Feature Comparison Matrix</h3>
            <span className="text-[11px] text-slate-500">Every feature is backed by production-grade offline-first code.</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">OFFICIAL FEATURE MATRIX</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#EBE6DD] text-slate-400 font-bold text-[10px] uppercase">
                <th className="py-2.5 px-3">Software Capability</th>
                <th className="py-2.5 px-3 text-center w-36">CORE (₹5,000)</th>
                <th className="py-2.5 px-3 text-center w-48 bg-amber-50/60 text-[#E66817]">PRO (₹7,000)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                { cap: 'Counter POS & Fast Billing', core: '✓ Included', pro: '✓ Included' },
                { cap: 'Payments, Multi-Tender & Split Bill', core: '✓ Included', pro: '✓ Included' },
                { cap: 'Interactive Table Management & Floor Plan', core: '✓ Included', pro: '✓ Included' },
                { cap: 'Kitchen KOT & Basic KDS Spooling', core: '✓ Included', pro: '✓ Included' },
                { cap: 'Kitchen Inventory & Stock Alerts', core: '✓ Included', pro: '✓ Included' },
                { cap: 'Daily Sales & Operational Reports', core: '✓ Included', pro: '✓ Included' },
                { cap: '100% Offline SQLite Local Engine', core: '✓ Included', pro: '✓ Included' },
                { cap: 'Wireless Captain App for Waiters', core: '—', pro: '✓ Full Captain Suite' },
                { cap: 'Table-Side QR Code Ordering', core: '—', pro: '✓ Included' },
                { cap: 'Self-Service Customer Touch Kiosk', core: '—', pro: '✓ Included' },
                { cap: 'Real-Time POS ↔ Captain ↔ KDS Mesh Sync', core: '—', pro: '✓ Instant Mesh Sync' },
                { cap: 'Advanced Multi-Station KDS', core: '—', pro: '✓ Station Routing' },
                { cap: 'Advanced Restaurant Analytics & Heatmaps', core: 'Basic', pro: '✓ Advanced Enterprise' },
                { cap: 'JAMAN AI Restaurant Assistant', core: 'Basic', pro: '✓ Full Conversational AI' },
                { cap: 'Customer CRM & Lifetime Value (LTV)', core: 'Basic', pro: '✓ Advanced Intelligence' },
                { cap: 'Smart Automation & Exception Alerts', core: 'Basic', pro: '✓ Real-Time Notifications' },
                { cap: 'Connected Multi-Device Health Monitoring', core: 'Basic', pro: '✓ Live 6-Node Mesh' }
              ].map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-3 font-bold text-[#0B253A]">{row.cap}</td>
                  <td className="py-2.5 px-3 text-center text-slate-700 font-mono text-[11px]">{row.core}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-[#E66817] bg-amber-50/30 font-mono text-[11px]">
                    {row.pro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: DEALER LICENSE KEY ACTIVATION PORTAL */}
      <div className="bg-white border border-[#EBE6DD] rounded-3xl p-6 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <KeyRound className="w-5 h-5 text-[#E66817]" />
          <div>
            <h3 className="text-sm font-bold text-[#0B253A]">Dealer License Key Activation</h3>
            <p className="text-[11px] text-slate-500">
              POS Dealers can apply new license tokens or upgrade customer restaurant licenses offline.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <input
            type="text"
            value={dealerKeyInput}
            onChange={(e) => setDealerKeyInput(e.target.value)}
            placeholder="Enter Dealer Activation Key (e.g. JAMAN-PRO-2026-AHM-XXXX)..."
            className="w-full sm:flex-1 bg-[#FAF7F2] border border-[#EBE6DD] rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-[#0B253A] placeholder:text-slate-400 focus:outline-none focus:border-[#E66817]"
          />

          <button
            onClick={handleActivateWithDealerKey}
            disabled={!dealerKeyInput.trim()}
            className="w-full sm:w-auto px-6 py-2.5 bg-[#0B253A] hover:bg-[#1E3A4C] disabled:opacity-40 text-white font-bold text-xs rounded-2xl transition-colors shrink-0 shadow-xs cursor-pointer"
          >
            Validate & Apply Key
          </button>
        </div>
      </div>
    </div>
  );
};
