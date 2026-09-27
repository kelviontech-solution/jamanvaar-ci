import React, { useEffect } from 'react';
import { ReportDesignTheme, ReportSummaryMetrics } from './reportDataEngine';
import { formatINR } from '@jamanvaar/utils';
import { X, Check, Eye, Palette, Sparkles, Layers, FileText, BarChart3, Receipt } from 'lucide-react';

interface ReportDesignSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ReportDesignTheme;
  onSelectTheme: (theme: ReportDesignTheme) => void;
  summary: ReportSummaryMetrics;
  onOpenFullPreview: () => void;
}

interface ThemeConfig {
  id: ReportDesignTheme;
  name: string;
  badge: string;
  description: string;
  icon: React.ElementType;
  primaryColor: string;
  previewBg: string;
  previewBorder: string;
  cardStyle: string;
  highlights: string[];
}

export const REPORT_THEMES: ThemeConfig[] = [
  {
    id: 'MODERN_RESTAURANT',
    name: 'Modern Restaurant',
    badge: 'DEFAULT BRAND STYLE',
    description: 'Signature JAMANVAAR warm cream aesthetic with royal navy typography, soft glass cards & dynamic charts.',
    icon: Sparkles,
    primaryColor: '#E66817',
    previewBg: 'bg-jaman-ivory',
    previewBorder: 'border-jaman-border',
    cardStyle: 'rounded-2xl border border-jaman-border bg-white shadow-xs',
    highlights: ['Warm Cream Background', 'Orange & Navy Brand Accents', 'Visual Donut & Sparklines', 'Modern Glassmorphism']
  },
  {
    id: 'CLASSIC_ACCOUNTING',
    name: 'Classic Accounting',
    badge: 'AUDIT & CA APPROVED',
    description: 'Ultra-clean white layout, formal double-underline balance lines, ledger grid borders, and strong monospace numbers.',
    icon: FileText,
    primaryColor: '#0F172A',
    previewBg: 'bg-white',
    previewBorder: 'border-slate-300',
    cardStyle: 'rounded-lg border-2 border-slate-300 bg-white shadow-none',
    highlights: ['Crisp White Ledger', 'Double Balance Lines', 'Monospace Financial Figures', 'Minimal Chart Distraction']
  },
  {
    id: 'EXECUTIVE_DASHBOARD',
    name: 'Executive Dashboard',
    badge: 'OWNER & DIRECTORS',
    description: 'High-impact oversized KPI callouts, rich gradient highlight cards, prominent comparison variance badges & summary bars.',
    icon: BarChart3,
    primaryColor: '#1E3A8A',
    previewBg: 'bg-slate-50',
    previewBorder: 'border-blue-200',
    cardStyle: 'rounded-2xl border border-blue-100 bg-white shadow-md',
    highlights: ['Large Bold KPIs', 'High-Contrast Highlights', 'Variance & Growth Badges', 'Management Visual Mix']
  },
  {
    id: 'COMPACT_POS',
    name: 'Compact POS / Cashier',
    badge: 'DENSE PRINT & EOD',
    description: 'Maximized information density, tight margins, high row count per page, optimized for daily cashier balancing and thermal printouts.',
    icon: Receipt,
    primaryColor: '#047857',
    previewBg: 'bg-jaman-cream',
    previewBorder: 'border-slate-300',
    cardStyle: 'rounded-lg border border-slate-200 bg-white p-2',
    highlights: ['Dense Space-Saving Rows', 'Zero Wasted Whitespace', 'Thermal Receipt & EOD Ready', 'Fast Scanning Tables']
  },
  {
    id: 'PREMIUM_INSIGHTS',
    name: 'Premium Insights',
    badge: 'LUXURY PRESENTATION',
    description: 'Elevated fine-dining style with regal gold accents, deep navy serif headings, and refined luxury typography.',
    icon: Layers,
    primaryColor: '#B45309',
    previewBg: 'bg-[#FAF8F5]',
    previewBorder: 'border-amber-200',
    cardStyle: 'rounded-2xl border border-amber-200/80 bg-white shadow-sm',
    highlights: ['Gold & Amber Accents', 'Luxury Editorial Styling', 'Sophisticated Proportions', 'Investor Presentation Ready']
  }
];

export const ReportDesignSelectorModal: React.FC<ReportDesignSelectorModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
  summary,
  onOpenFullPreview
}) => {
  // Escape closes this dialog like any other in the app, not just its own Close button.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-jaman-border rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-jaman-border bg-jaman-ivory flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center shadow-xs">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-jaman-navy">Report Design System</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200">
                  5 PREBUILT THEMES
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Choose how your restaurant statements, exports, and printable documents are presented.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenFullPreview();
              }}
              className="px-3 py-1.5 bg-white border border-jaman-border hover:bg-slate-50 text-jaman-navy rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-jaman-saffron" />
              <span>Full Preview</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Theme Cards Grid */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {REPORT_THEMES.map((theme) => {
              const isSelected = currentTheme === theme.id;
              const Icon = theme.icon;

              return (
                <div
                  key={theme.id}
                  onClick={() => onSelectTheme(theme.id)}
                  className={`rounded-2xl border-2 transition-all p-4 flex flex-col justify-between cursor-pointer relative ${
                    isSelected
                      ? 'border-jaman-saffron bg-[#FFFDFB] shadow-md ring-2 ring-jaman-saffron/20'
                      : 'border-jaman-border bg-white hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  {/* Selected Badge */}
                  {isSelected && (
                    <div className="absolute top-3 right-3 bg-jaman-saffron text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                      <Check className="w-3 h-3 stroke-[3]" />
                      <span>ACTIVE</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${theme.primaryColor}15`, color: theme.primaryColor }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 pr-12">
                        <h4 className="font-extrabold text-sm text-jaman-navy truncate">{theme.name}</h4>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block truncate">
                          {theme.badge}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                      {theme.description}
                    </p>

                    {/* LIVE MINIATURE PREVIEW CARD WITH REAL DATA */}
                    <div className={`p-3 rounded-xl border ${theme.previewBorder} ${theme.previewBg} space-y-2 select-none`}>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 border-b border-slate-200/60 pb-1">
                        <span>JAMANVAAR • AUDIT</span>
                        <span className="font-mono text-emerald-700">LIVE DATA</span>
                      </div>

                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase font-bold block">Gross Sales</span>
                          <span className="text-sm font-mono font-black text-jaman-navy">
                            {formatINR(summary.grossSales.current)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] text-slate-400 uppercase font-bold block">Orders</span>
                          <span className="text-xs font-mono font-bold text-slate-700">
                            {summary.ordersCount.current} • AOV ₹{summary.avgOrderValue.current}
                          </span>
                        </div>
                      </div>

                      {/* Mini Bar Graphic — was a hardcoded 45/35/20% split
                          under a "LIVE DATA" badge regardless of what the
                          real tender totals above it actually were. */}
                      {(() => {
                        const cash = summary.cashCollected.current;
                        const upi = summary.upiCollected.current;
                        const card = summary.cardCollected.current;
                        const total = cash + upi + card;
                        const cashPct = total > 0 ? Math.round((cash / total) * 100) : 0;
                        const upiPct = total > 0 ? Math.round((upi / total) * 100) : 0;
                        const cardPct = total > 0 ? Math.max(0, 100 - cashPct - upiPct) : 0;
                        return (
                          <div className="pt-1">
                            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                              <div className="bg-emerald-600 h-full" style={{ width: `${cashPct}%` }} title="Cash" />
                              <div className="bg-blue-600 h-full" style={{ width: `${upiPct}%` }} title="UPI" />
                              <div className="bg-indigo-600 h-full" style={{ width: `${cardPct}%` }} title="Card" />
                            </div>
                            <div className="flex justify-between text-[8px] font-mono text-slate-400 pt-0.5">
                              <span>Cash {cashPct}%</span>
                              <span>UPI {upiPct}%</span>
                              <span>Card {cardPct}%</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Features list */}
                    <div className="space-y-1 pt-1">
                      {theme.highlights.map((h, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-600">
                          <div className="w-1 h-1 rounded-full bg-jaman-saffron" />
                          <span>{h}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 mt-3 border-t border-slate-100 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTheme(theme.id);
                        onClose();
                        onOpenFullPreview();
                      }}
                      className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      Preview Full
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTheme(theme.id);
                        onClose();
                      }}
                      className={`flex-1 py-1.5 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-jaman-saffron hover:bg-[#EA580C] text-white'
                      }`}
                    >
                      {isSelected ? '✓ Selected' : 'Use Design'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-jaman-border bg-jaman-cream flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-500">
            Selected theme is stored permanently and applies across all reports, PDF downloads, and A4 printouts.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold rounded-xl transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
