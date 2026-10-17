import React, { useState, useMemo } from 'react';
import { formatTime } from '@jamanvaar/utils';
import { ShieldCheck, Search, X } from 'lucide-react';

interface AuditTrailModuleProps {
  auditLogs: any[];
  showToast?: (msg: string) => void;
}

export const AuditTrailModule: React.FC<AuditTrailModuleProps> = ({
  auditLogs,
  showToast
}) => {
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<string>('ALL');
  // #9: owners had to type a search term or already know a category to find "what changed
  // recently" for prices, availability or rewards -- these presets match the real action names
  // those events are logged under, so reviewing them takes one click instead of guessing text.
  // Payment settings are intentionally not included: those changes go through Super
  // Admin-verified cloud settings (PaymentConnectionPanel), not this local audit log, so a
  // preset here would silently show nothing and look broken.
  const RECENT_CHANGE_PRESETS: Array<{ id: string; label: string; actions: string[] }> = [
    { id: 'PRICING', label: 'Pricing & Availability', actions: ['MENU_ITEM_UPDATED', 'MENU_ITEM_CREATED', 'BULK_PRICE_ADJUSTMENT', 'ITEM_AVAILABILITY_CHANGED'] },
    { id: 'REWARDS', label: 'Rewards & Loyalty', actions: ['LOYALTY_REWARD_CREATED', 'LOYALTY_REWARD_REDEEMED', 'LOYALTY_TIER_CREATED', 'LOYALTY_TIER_UPGRADED', 'LOYALTY_PROGRAM_RATE_CHANGED', 'LOYALTY_POINTS_AWARDED', 'CAMPAIGN_CREATED'] }
  ];
  const [recentChangePreset, setRecentChangePreset] = useState<string | null>(null);

  const auditCategories = useMemo(() => {
    return Array.from(new Set(auditLogs.map((l) => l.category).filter(Boolean)));
  }, [auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    const preset = RECENT_CHANGE_PRESETS.find((p) => p.id === recentChangePreset);
    return auditLogs.filter((log) => {
      const matchesSearch =
        !auditSearch ||
        log.username?.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.action?.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.details?.toLowerCase().includes(auditSearch.toLowerCase());

      const matchesCat =
        auditCategoryFilter === 'ALL' || log.category === auditCategoryFilter;

      const matchesPreset = !preset || preset.actions.includes(log.action);

      return matchesSearch && matchesCat && matchesPreset;
    });
  }, [auditLogs, auditSearch, auditCategoryFilter, recentChangePreset]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy tracking-tight">
              Security & Operational Audit Trail
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
              IMMUTABLE LOG
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">
            Immutable log of all user actions, price adjustments, voids, discounts, and inventory movements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white border border-jaman-border text-jaman-navy shadow-2xs">
            {filteredAuditLogs.length} Events Recorded
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recently changed:</span>
        {RECENT_CHANGE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setRecentChangePreset((current) => (current === preset.id ? null : preset.id))}
            className={`min-h-11 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              recentChangePreset === preset.id
                ? 'bg-brand/[0.09] text-brand ring-1 ring-inset ring-brand/40'
                : 'bg-white text-jaman-navy border-jaman-border hover:bg-jaman-cream'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-2xs space-y-0">
        {/* Search & Category Filter Toolbar */}
        <div className="p-4 bg-jaman-cream border-b border-jaman-border flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-500" />
            <span className="font-bold text-sm text-jaman-navy">
              Audit Trail Events ({filteredAuditLogs.length})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search user, action, details..."
                className="w-full bg-white border border-jaman-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-jaman-navy placeholder:text-slate-500 focus:outline-none focus:border-brand"
              />
              {auditSearch && (
                <button
                  type="button"
                  aria-label="Clear audit search"
                  onClick={() => setAuditSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <select
              value={auditCategoryFilter}
              onChange={(e) => setAuditCategoryFilter(e.target.value)}
              className="bg-white border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none focus:border-brand cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {auditCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {(auditSearch || auditCategoryFilter !== 'ALL' || recentChangePreset) && (
              <button
                onClick={() => {
                  setAuditSearch('');
                  setAuditCategoryFilter('ALL');
                  setRecentChangePreset(null);
                }}
                className="text-xs text-brand font-bold hover:underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {filteredAuditLogs.length === 0 ? (
          <div className="py-14 text-center px-4 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-jaman-navy text-sm">No Audit Trail Events Found</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-0.5">
                {auditSearch || auditCategoryFilter !== 'ALL' || recentChangePreset
                  ? 'No events match the current search, category or preset filter.'
                  : 'Operational security events will automatically be recorded here.'}
              </p>
            </div>
            {(auditSearch || auditCategoryFilter !== 'ALL' || recentChangePreset) && (
              <button
                onClick={() => {
                  setAuditSearch('');
                  setAuditCategoryFilter('ALL');
                  setRecentChangePreset(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F6F0] border-b border-jaman-border text-slate-500 uppercase font-bold text-[11px] tracking-wider">
                <tr>
                  <th className="p-4">Timestamp</th>
                  <th className="p-4">Operator</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Operational Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#FDFBF7] transition-colors">
                    <td className="p-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                      {formatTime(log.timestamp)}
                    </td>
                    <td className="p-4 font-bold text-jaman-navy">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-mono">
                        @{log.username}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-bold text-brand text-xs">{log.action}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-0.5 rounded-full bg-jaman-cream border border-jaman-border text-[11px] font-bold text-slate-600">
                        {log.category}
                      </span>
                    </td>
                    <td className="p-4 text-slate-700 max-w-md">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
