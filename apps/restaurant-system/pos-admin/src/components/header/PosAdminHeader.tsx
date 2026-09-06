import React from 'react';
import {
  Search,
  Receipt,
  Scale,
  Bot,
  Bell,
  LogOut,
  Radio,
  Building2
} from 'lucide-react';
import { JAMANVAAR_LOGOS } from '@jamanvaar/ui';
import { formatINR } from '@jamanvaar/utils';

export interface PosAdminHeaderProps {
  restaurantName: string;
  outletName: string;
  isCloudConnected?: boolean;
  onOpenBranchDirectory?: () => void;
  globalSearch: string;
  onOpenGlobalSearch: () => void;
  activeShift?: {
    cashierName?: string;
    openingCash?: number;
    terminalId?: string;
  };
  onOpenEodModal: () => void;
  onOpenReconModal: () => void;
  onOpenAssistant: () => void;
  onOpenNotifDrawer: () => void;
  unreadNotifsCount: number;
  onAdminLogout: () => void;
}

export const PosAdminHeader: React.FC<PosAdminHeaderProps> = ({
  restaurantName,
  outletName,
  isCloudConnected,
  onOpenBranchDirectory,
  globalSearch,
  onOpenGlobalSearch,
  activeShift,
  onOpenEodModal,
  onOpenReconModal,
  onOpenAssistant,
  onOpenNotifDrawer,
  unreadNotifsCount,
  onAdminLogout
}) => {
  return (
    <header className="h-18 sm:h-20 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#EAE3D6] px-4 sm:px-6 lg:px-8 flex items-center justify-between shadow-2xs sticky top-0 z-30 shrink-0 select-none">
      {/* ── 1. Left: Premium Brand Identity Lockup ── */}
      <div className="flex items-center gap-3 sm:gap-4 shrink-0 min-w-0">
        {/* Prominent High-DPI JAMANVAAR Logo */}
        <div className="shrink-0 flex items-center justify-center">
          <img
            src={JAMANVAAR_LOGOS.horizontal}
            alt="JAMANVAAR by KELVIONTECH"
            className="h-10 sm:h-11 md:h-12 w-auto object-contain shrink-0"
            style={{
              imageRendering: '-webkit-optimize-contrast',
              filter:
                'drop-shadow(0 2px 6px rgba(11, 37, 58, 0.08)) drop-shadow(0 1px 3px rgba(230, 104, 23, 0.12))'
            }}
            loading="eager"
            draggable={false}
          />
        </div>

        {/* Elegant vertical hairline separator */}
        <div className="h-8 w-px bg-[#E2D9C8] shrink-0" aria-hidden="true" />

        {/* Secondary Restaurant Identity & Context */}
        <div className="flex flex-col justify-center min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              title={restaurantName || 'JAMANVAAR RESTAURANT'}
              className="text-xs sm:text-[13px] font-extrabold text-[#0B253A] tracking-tight truncate max-w-[130px] sm:max-w-[180px] md:max-w-[220px]"
            >
              {restaurantName || 'JAMANVAAR RESTAURANT'}
            </span>
            <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold tracking-wider uppercase bg-[#0B253A]/[0.05] text-[#0B253A] border border-[#0B253A]/15 shadow-2xs">
              ADMIN
            </span>
          </div>
          {isCloudConnected && onOpenBranchDirectory ? (
            <button
              type="button"
              onClick={onOpenBranchDirectory}
              title="View all branches for this restaurant"
              className="flex items-center gap-1 text-[10px] sm:text-[11px] font-medium text-slate-500 hover:text-[#E66817] truncate max-w-[130px] sm:max-w-[180px] md:max-w-[220px] leading-tight mt-0.5 cursor-pointer transition-colors"
            >
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{outletName || 'Ahmedabad Flagship Store'}</span>
            </button>
          ) : (
            <span
              title={outletName || 'Ahmedabad Flagship Store'}
              className="text-[10px] sm:text-[11px] font-medium text-slate-500 truncate max-w-[130px] sm:max-w-[180px] md:max-w-[220px] leading-tight mt-0.5"
            >
              {outletName || 'Ahmedabad Flagship Store'}
            </span>
          )}
        </div>
      </div>

      {/* ── 2. Center: Dedicated Global Search ── */}
      <div className="hidden md:flex items-center flex-1 max-w-xs lg:max-w-sm xl:max-w-md mx-3 lg:mx-6">
        <div
          onClick={onOpenGlobalSearch}
          className="relative w-full cursor-pointer group"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenGlobalSearch();
            }
          }}
          aria-label="Open global search"
        >
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 group-hover:text-[#E66817] transition-colors" />
          <input
            type="text"
            readOnly
            placeholder="Search orders, invoices, dishes, tables..."
            value={globalSearch}
            className="w-full h-10 bg-white/90 hover:bg-white border border-[#EBE6DD] group-hover:border-[#D8D1C3] focus:border-[#E66817] focus:bg-white rounded-xl pl-10 pr-14 text-xs font-medium text-[#0B253A] placeholder:text-slate-400 focus:outline-none cursor-pointer transition-all shadow-2xs"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-slate-400 border border-[#EBE6DD] bg-[#FAF8F5] px-1.5 py-0.5 rounded shadow-2xs pointer-events-none">
            Ctrl+K
          </kbd>
        </div>
      </div>

      {/* ── 3. Right: Operational Context Group & Core Actions ── */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Mobile Search Trigger */}
        <button
          type="button"
          onClick={onOpenGlobalSearch}
          className="md:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-white hover:bg-[#FAF8F5] text-slate-600 border border-[#EBE6DD] transition-colors shadow-2xs cursor-pointer"
          title="Global Search"
          aria-label="Open search"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* 3A. Consolidated Operational Context Block */}
        <div className="hidden xl:flex items-center gap-2.5 bg-white border border-[#EBE6DD] px-3.5 py-1.5 rounded-xl text-xs select-none h-10 shadow-2xs">
          {/* Status Dot + Terminal */}
          <div className="flex items-center gap-1.5 font-bold text-emerald-800 text-[11px] tracking-wide shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{activeShift?.terminalId || 'POS-01'} ONLINE</span>
          </div>

          <span className="w-px h-4 bg-[#E2D9C8]" aria-hidden="true" />

          {/* Cashier Context */}
          <span
            className="text-slate-700 font-medium text-[11px] truncate max-w-[130px]"
            title={activeShift?.cashierName || 'Amit Dave · Lead Cashier'}
          >
            {activeShift?.cashierName || 'Amit Dave · Lead Cashier'}
          </span>

          <span className="w-px h-4 bg-[#E2D9C8]" aria-hidden="true" />

          {/* Opening Float */}
          <span className="text-[#0B253A] font-mono font-bold text-[11px] shrink-0">
            Float: {formatINR(activeShift?.openingCash || 2000)}
          </span>
        </div>

        {/* 3B. Core Financial Actions (EOD Z-Report & Reconciliation) */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* EOD Z-Report */}
          <button
            type="button"
            onClick={onOpenEodModal}
            className="h-10 flex items-center gap-1.5 bg-[#FFF4ED] hover:bg-[#FFE8D6] text-[#E66817] border border-[#FDBA74]/50 px-3 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-2xs cursor-pointer"
            title="End of Day Financial Z-Report"
          >
            <Receipt className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">EOD Report</span>
          </button>

          {/* Financial Reconciliation */}
          <button
            type="button"
            onClick={onOpenReconModal}
            className="h-10 flex items-center gap-1.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1E40AF] border border-[#BFDBFE]/60 px-3 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-2xs cursor-pointer"
            title="Single-source-of-truth financial data consistency audit"
          >
            <Scale className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
            <span className="hidden sm:inline">Reconciliation</span>
          </button>
        </div>

        {/* 3C. Utilities Group (Assistant, Notifications, Local-First, Logout) */}
        <div className="flex items-center gap-1.5 sm:gap-2 pl-2 border-l border-[#EBE6DD]">
          {/* JAMAN AI Assistant */}
          <button
            type="button"
            onClick={onOpenAssistant}
            className="h-10 flex items-center gap-1.5 bg-white hover:bg-[#FAF8F5] text-[#0B253A] border border-[#EBE6DD] px-3 rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="JAMAN AI Operations Assistant"
          >
            <Bot className="w-4 h-4 text-[#E66817] shrink-0" />
            <span className="hidden lg:inline">Assistant</span>
          </button>

          {/* Notification Bell */}
          <button
            type="button"
            onClick={onOpenNotifDrawer}
            className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-white hover:bg-[#FAF8F5] text-slate-600 hover:text-[#0B253A] border border-[#EBE6DD] transition-colors shadow-2xs cursor-pointer"
            title="Notifications & System Events"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center shadow-xs animate-pulse">
                {unreadNotifsCount}
              </span>
            )}
          </button>

          {/* Local-First Badge */}
          <div
            className="hidden 2xl:flex items-center gap-1.5 px-3 h-10 rounded-xl text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/70 select-none shadow-2xs"
            title="Operating in Local-First mesh mode"
          >
            <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
            <span>LOCAL-FIRST</span>
          </div>

          {/* Admin Logout */}
          <button
            type="button"
            onClick={onAdminLogout}
            title="Sign out of Restaurant Admin"
            className="h-10 flex items-center gap-1.5 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-[#EBE6DD] hover:border-rose-200 px-3 rounded-xl text-xs font-semibold transition-all active:scale-95 shadow-2xs cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default PosAdminHeader;
