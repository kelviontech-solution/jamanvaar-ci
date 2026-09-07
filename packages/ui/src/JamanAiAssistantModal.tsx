import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  JAMAN_AI_CATEGORIES,
  JamanAiCategory,
  JamanAiQuestion,
  JamanAiRegistry
} from "@jamanvaar/business";
import {
  PosAssistantService,
  PosAssistantResponse,
  PosAssistantAction
} from "@jamanvaar/business";
import {
  Sparkles,
  X,
  TrendingUp,
  CreditCard,
  ShoppingBag,
  ChefHat,
  LayoutGrid,
  Utensils,
  Package,
  Users,
  UserCheck,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowRight,
  ArrowLeft,
  Coins,
  Receipt,
  Clock,
  Smartphone,
  ShieldCheck,
  Wifi,
  Send
} from "lucide-react";

export interface JamanAiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  app: "POS" | "ADMIN";
  userRole?: string;
  /** Active POS tab for context-aware quick action defaults */
  posContext?: string;
  onPerformAction?: (action: PosAssistantAction) => void;
  onQueryExecuted?: (intent: string, queryText?: string) => void;
}

/** Map from POS tab name to best AI category */
const CONTEXT_CATEGORY_MAP: Record<string, JamanAiCategory> = {
  MENU: "TODAY",
  TABLES: "TABLES",
  ORDERS: "ORDERS",
  BILLS: "PAYMENTS",
  KOT: "KITCHEN",
  CUSTOMERS: "CUSTOMERS",
  SHIFTS: "TODAY",
  DAYS: "TODAY",
  REPORTS: "INSIGHTS",
  INVENTORY: "INVENTORY",
  SETTINGS: "TODAY"
};

export const JamanAiAssistantModal: React.FC<JamanAiAssistantModalProps> = ({
  isOpen,
  onClose,
  app,
  userRole = "CASHIER",
  posContext,
  onPerformAction,
  onQueryExecuted
}) => {
  const defaultCategory = (posContext ? CONTEXT_CATEGORY_MAP[posContext] : undefined) ?? "TODAY";
  const [activeCategory, setActiveCategory] = useState<JamanAiCategory>(defaultCategory);
  const [activeResponse, setActiveResponse] = useState<PosAssistantResponse | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [naturalQuery, setNaturalQuery] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  // Animate slide-in / slide-out
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setIsVisible(true));
      const cat = posContext ? CONTEXT_CATEGORY_MAP[posContext] : "TODAY";
      setActiveCategory(cat ?? "TODAY");
      setActiveResponse(null);
      setSelectedQuestionId(null);
      setNaturalQuery("");
    } else {
      setIsVisible(false);
    }
  }, [isOpen, posContext]);

  // Esc key to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const prioritizedQuestions = useMemo(() => {
    return JamanAiRegistry.getPrioritizedQuestions(app, userRole);
  }, [app, userRole, isOpen]);

  const categoryQuestions = useMemo(() => {
    return prioritizedQuestions.filter((q) => q.category === activeCategory);
  }, [prioritizedQuestions, activeCategory]);

  const criticalAlertQuestions = useMemo(() => {
    return prioritizedQuestions.filter((q) => q.isCriticalAlert);
  }, [prioritizedQuestions]);

  const handleSelectQuestion = useCallback((q: JamanAiQuestion) => {
    setSelectedQuestionId(q.id);
    const resp = PosAssistantService.executeQuery(
      q.formula ? { intent: q.intent, label: q.label, formula: q.formula } : (q.intent as any)
    );
    setActiveResponse(resp);
    onQueryExecuted?.(q.intent as string, q.label);
  }, [onQueryExecuted]);

  const handleExecuteNaturalQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!naturalQuery.trim()) return;
    const resolvedIntent = PosAssistantService.resolveIntent(naturalQuery.trim());
    const resp = PosAssistantService.executeQuery(resolvedIntent);
    setActiveResponse(resp);
    setSelectedQuestionId(null);
    onQueryExecuted?.(resolvedIntent, naturalQuery.trim());
    setNaturalQuery("");
  };

  const handleBackToQuestions = useCallback(() => {
    setActiveResponse(null);
    setSelectedQuestionId(null);
  }, []);

  const renderIcon = (iconName: string, className: string = "w-5 h-5") => {
    switch (iconName) {
      case "trending-up": return <TrendingUp className={className} />;
      case "shopping-bag": return <ShoppingBag className={className} />;
      case "credit-card": return <CreditCard className={className} />;
      case "chef-hat": return <ChefHat className={className} />;
      case "layout-grid": return <LayoutGrid className={className} />;
      case "utensils": return <Utensils className={className} />;
      case "package": return <Package className={className} />;
      case "users": return <Users className={className} />;
      case "user-check": return <UserCheck className={className} />;
      case "sparkles": return <Sparkles className={className} />;
      case "flame": return <Flame className={className} />;
      case "coins": return <Coins className={className} />;
      case "receipt": return <Receipt className={className} />;
      case "rotate-ccw": return <RotateCcw className={className} />;
      case "clock": return <Clock className={className} />;
      case "smartphone": return <Smartphone className={className} />;
      case "alert-triangle": return <AlertTriangle className={className} />;
      case "check-circle": return <CheckCircle2 className={className} />;
      case "wifi": return <Wifi className={className} />;
      default: return <Sparkles className={className} />;
    }
  };

  if (!isOpen && !isVisible) return null;

  return (
    <>
      {/* Scrim overlay — click to close */}
      <div
        className="fixed inset-0 z-[49] bg-black/25 backdrop-blur-[1px]"
        style={{
          opacity: isVisible ? 1 : 0,
          transition: "opacity 250ms ease",
          pointerEvents: isVisible ? "auto" : "none"
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* RIGHT-SIDE DRAWER */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="JAMAN AI Restaurant Intelligence"
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-[#FDFAF5] border-l border-[#EBE6DD] select-none"
        style={{
          width: "min(430px, 100vw)",
          transform: isVisible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: "-8px 0 48px rgba(11, 37, 58, 0.20)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* DRAWER HEADER */}
        <div className="shrink-0 bg-white border-b border-[#EBE6DD] px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FFF4ED] to-[#FFE8D0] border border-[#FDBA74] flex items-center justify-center shadow-sm shrink-0">
                <Sparkles className="w-[18px] h-[18px] text-[#E66817] fill-[#E66817]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-[#0B253A] tracking-tight">JAMAN AI</h2>
                  <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    OFFLINE DB
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  {app === "POS" ? "Restaurant Operations Intelligence" : "Performance & Financial Analytics"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-200 flex items-center justify-center transition-all cursor-pointer shrink-0"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {posContext && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Context:</span>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#0B253A] text-white tracking-wide">
                {posContext}
              </span>
            </div>
          )}
        </div>

        {/* BODY — scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-4 space-y-4">
            {/* CRITICAL ALERTS */}
            {!activeResponse && criticalAlertQuestions.length > 0 && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-black text-rose-800 uppercase tracking-wider">
                  <Flame className="w-3.5 h-3.5 text-rose-600 fill-rose-600 animate-bounce" />
                  <span>Urgent Attention Required</span>
                </div>
                <div className="space-y-1.5">
                  {criticalAlertQuestions.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => handleSelectQuestion(q)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white border border-rose-200 hover:border-rose-400 text-left shadow-2xs transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                          {renderIcon(q.icon, "w-3.5 h-3.5")}
                        </div>
                        <span className="text-xs font-black text-[#0B253A]">{q.label}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ANSWER VIEW */}
            {activeResponse ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleBackToQuestions}
                  className="inline-flex items-center gap-1.5 text-xs font-black text-[#E66817] hover:text-[#EA580C] bg-[#FFF4ED] hover:bg-[#FFE8D6] px-3 py-1.5 rounded-xl border border-[#FDBA74] transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Back to Questions</span>
                </button>

                <div className="bg-white rounded-2xl border border-[#EBE6DD] p-4 shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-2 border-b border-[#F3EFE6] pb-3">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                        Local Intelligence
                      </span>
                      <h3 className="text-base font-black text-[#0B253A] leading-tight mt-0.5">
                        {activeResponse.card?.title || "Report"}
                      </h3>
                    </div>
                    {activeResponse.card?.badge && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FFF4ED] text-[#E66817] border border-[#FDBA74] whitespace-nowrap shrink-0">
                        {activeResponse.card.badge}
                      </span>
                    )}
                  </div>

                  {activeResponse.card?.highlightNumber && (
                    <div className="p-3 rounded-xl bg-[#FBF8F2] border border-[#EBE6DD] flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                          {activeResponse.card.highlightLabel || "Current Value"}
                        </span>
                        <div className="text-2xl font-black text-[#0B253A] font-mono mt-0.5">
                          {activeResponse.card.highlightNumber}
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-[#0B253A] flex items-center justify-center shadow-md">
                        <Sparkles className="w-5 h-5 text-[#E66817]" />
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                    {activeResponse.summaryText}
                  </p>

                  {activeResponse.card?.metrics && activeResponse.card.metrics.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {activeResponse.card.metrics.map((m, idx) => (
                        <div key={idx} className="p-2.5 rounded-xl bg-[#F8F6F0] border border-[#EBE6DD]">
                          <span className="text-[10px] font-bold text-slate-500 block truncate">{m.label}</span>
                          <span className={`text-sm font-black font-mono block mt-0.5 ${m.color || "text-[#0B253A]"}`}>
                            {m.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeResponse.card?.listItems && activeResponse.card.listItems.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-[#F3EFE6]">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                        Ranked Breakdown
                      </span>
                      {activeResponse.card.listItems.map((li, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-xl bg-[#FAF7F2] border border-[#EBE6DD] text-xs font-bold text-[#0B253A]"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#0B253A] text-white text-[9px] flex items-center justify-center font-black shrink-0">
                              {li.rank || idx + 1}
                            </span>
                            <span className="truncate">{li.title}</span>
                          </div>
                          <span className="font-mono text-slate-600 shrink-0 ml-2">{li.meta}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeResponse.card?.actions && activeResponse.card.actions.length > 0 && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-[#F3EFE6]">
                      {activeResponse.card.actions.map((act, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (onPerformAction) onPerformAction(act);
                            onClose();
                          }}
                          className="w-full py-2.5 px-4 rounded-xl bg-[#0B253A] hover:bg-[#163E5E] text-white font-black text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          <span>{act.label}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#E66817]" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* QUESTION CATALOG VIEW */
              <div className="space-y-3">
                {/* Category tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none -mx-4 px-4">
                  {JAMAN_AI_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                        activeCategory === cat.id
                          ? "bg-[#0B253A] text-white shadow-sm"
                          : "bg-white border border-[#EBE6DD] text-slate-600 hover:bg-[#FFF4ED] hover:border-[#FDBA74] hover:text-[#E66817]"
                      }`}
                    >
                      {renderIcon(cat.icon, "w-3 h-3")}
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>

                {/* Section label */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      {JAMAN_AI_CATEGORIES.find((c) => c.id === activeCategory)?.label}
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      {JAMAN_AI_CATEGORIES.find((c) => c.id === activeCategory)?.description}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">
                    {categoryQuestions.length} items
                  </span>
                </div>

                {/* Question buttons */}
                <div className="space-y-2">
                  {categoryQuestions.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => handleSelectQuestion(q)}
                      className="w-full p-3.5 rounded-xl bg-white hover:bg-[#FFF7ED] border border-[#EBE6DD] hover:border-[#E66817] text-left transition-all shadow-2xs hover:shadow-sm flex items-center justify-between group active:scale-[0.98] cursor-pointer min-h-[52px]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#FAF7F2] group-hover:bg-[#FFF4ED] border border-[#EBE6DD] group-hover:border-[#FDBA74] text-[#0B253A] group-hover:text-[#E66817] flex items-center justify-center shrink-0 transition-colors">
                          {renderIcon(q.icon, "w-4 h-4")}
                        </div>
                        <span className="text-xs font-bold text-[#0B253A] group-hover:text-[#E66817] leading-snug">
                          {q.label}
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#E66817] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* NATURAL LANGUAGE QUERY INPUT BAR */}
        <div className="shrink-0 bg-white border-t border-[#EBE6DD] p-3">
          <form onSubmit={handleExecuteNaturalQuery} className="relative flex items-center">
            <input
              type="text"
              value={naturalQuery}
              onChange={(e) => setNaturalQuery(e.target.value)}
              placeholder="Ask anything (e.g. 'sales today', 'slow tables')..."
              className="w-full pl-3.5 pr-10 py-2.5 text-xs font-semibold bg-[#FAF7F2] border border-[#EBE6DD] focus:border-[#E66817] focus:bg-white rounded-xl text-[#0B253A] placeholder:text-slate-400 focus:outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!naturalQuery.trim()}
              className="absolute right-1.5 p-1.5 rounded-lg bg-[#E66817] text-white disabled:opacity-30 disabled:hover:bg-[#E66817] hover:bg-[#c9570f] transition-all cursor-pointer disabled:cursor-not-allowed shadow-2xs"
              title="Ask JAMAN AI"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* FOOTER */}
        <div className="shrink-0 bg-[#F8F6F0] border-t border-[#EBE6DD] px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>100% Offline DB · Zero Cloud Latency</span>
          </div>
          <span className="font-mono text-[9px] text-slate-400">JAMANVAAR OS v2.0</span>
        </div>
      </div>
    </>
  );
};

