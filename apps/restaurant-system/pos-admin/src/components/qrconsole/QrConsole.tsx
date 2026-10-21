import {QrReceiptSettings} from './QrReceiptSettings';
import {QrRestaurantPage} from './QrRestaurantPage';
import {QrRestaurantPageQr} from './QrRestaurantPageQr';
import { DisplayPreferences } from '@jamanvaar/ui';
import {OperationsConsole} from '../operations/OperationsConsole';
import {storedAdminBranch} from '../../adminBranchScope';
import { QrOnboarding } from './QrOnboarding';
import { QrAiAssistant } from './QrAiAssistant';
import { QrPaymentWizard, QrReconciliation, QrPickupCalendar } from './QrWorkflows';
import { QrPrintPack } from './QrPrintPack';
import { QR_BEFORE_NAVIGATE, requestQrLeave } from './useQrUnsavedChanges';
import { QrMenuWorkspace } from './QrMenuWorkspace';
import { QrMenuCodes } from './QrMenuCodes';
import {
  QrSetupHealth,
  QrServiceOperations,
  QrPickupOperations,
  QrReservationsInbox,
  QrMenuPerformance,
  QrBrandStudio,
} from "./QrOperations";
import { QrCapabilities } from "./QrCapabilities";
import { SupportTicketsModule } from "../support/SupportTicketsModule";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  QR_PAGES,
  QR_NAVIGATION,
  QR_ADVANCED_SECTIONS,
  currentQrTab,
  currentQrFeature,
  type QrTab,
} from "./qrNavigation";
import "../../qr/workspace.css";
import {
  Lock,
  QrCode,
  CheckCircle2,
  RefreshCw,
  Printer,
  Download,
  Ban,
  RotateCcw,
  Trash2,
  Copy,
  Plus,
  WifiOff,
  Menu,
  X,
  ArrowUpRight,
  Users,
  ReceiptText,
  IndianRupee,
  Clock3,
  ChartNoAxesCombined,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import { copyText, generateQrDataUrl } from "@jamanvaar/utils";
import { CloudApiError } from "../../cloud/cloudClient";
import {
  QrAdminApi,
  type QrBranch,
  type QrOrderRow,
  type QrOverview,
  type QrSettings,
  type QrTableRow,
} from "../../cloud/qrAdminClient";
import { useQrEntitlement } from "./useQrEntitlement";
import { downloadCardPng, printCards, withLogo } from "./qrPrint";
import {
  QrDesignStudio,
  QrOrderingRules,
  QrOperationalOrders,
  QrAnalyticsView,
} from "./QrAdvanced";
import { useDialogFocus } from '@jamanvaar/ui';
import { QrCrm } from './QrCrm';
import { useConfirm } from '@jamanvaar/ui';
import { QR_BUTTON } from './qrUi';

type Tab = QrTab;

const errText = (e: unknown) =>
  e instanceof CloudApiError || e instanceof Error
    ? e.message
    : "Something went wrong";

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Restaurant Admin's QR Ordering. Everything on it comes from the server: the plan answer, the tables, the codes, the
 * orders and every number. A restaurant whose plan does not include QR Ordering sees that it exists and why it is
 * locked, and cannot do anything with it: the server refuses each action, not only this screen.
 */
export function QrConsole({
  onViewPlan,
  showToast,
  layout = "embedded",
  onBack,
}: {
  onViewPlan: () => void;
  showToast: (msg: string) => void;
  layout?: "embedded" | "workspace" | "integrated";
  onBack?: () => void;
}) {
  const { state, refresh } = useQrEntitlement();
  const {confirm:confirmNavigation,confirmDialog:navigationDialog} = useConfirm();
  const [tab, setTab] = useState<Tab>(currentQrTab);
  const [menuOpen, setMenuOpen] = useState(false);
  const [advancedNavigation, setAdvancedNavigation] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const [feature, setFeature] = useState(currentQrFeature);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const workspace = layout !== "embedded";
  const navigate = async (next: Tab, section = "Settings", branchScope?:string) => {
    if (next === tab && (next !== 'ADVANCED' || section === feature) && !branchScope) { setMenuOpen(false); return; }
    if (!window.dispatchEvent(new Event(QR_BEFORE_NAVIGATE, {cancelable:true})) && !(await confirmNavigation({title:'Leave without saving?',message:'Your changes on this page have not been saved.',confirmLabel:'Discard & continue',cancelLabel:'Keep editing',tone:'danger'}))) return;
    setTab(next);
    setFeature(section);
    const url = new URL(location.href);
    url.searchParams.set("tab", next);
    if(branchScope)url.searchParams.set('setupBranch',branchScope);
    if (next === "ADVANCED") url.searchParams.set("feature", section);
    else url.searchParams.delete("feature");
    history.pushState(null, "", url);
    window.dispatchEvent(new Event('jamanvaar-admin-location'));
    setMenuOpen(false);
    if (workspace) window.scrollTo({ top: 0, behavior: "instant" });
  };
  const lastLocation = useRef(location.href);
  useEffect(()=>{lastLocation.current=location.href;},[tab,feature]);
  useEffect(() => {
    const canLeave=async()=>window.dispatchEvent(new Event(QR_BEFORE_NAVIGATE,{cancelable:true})) || await confirmNavigation({title:'Leave without saving?',message:'Your changes have not been saved.',confirmLabel:'Discard & continue',cancelLabel:'Keep editing',tone:'danger'});
    const external=(event:Event)=>{void canLeave().then((event as CustomEvent).detail.resolve);};
    const pop = async () => {
      const destination=location.href,previous=lastLocation.current;
      if(!window.dispatchEvent(new Event(QR_BEFORE_NAVIGATE,{cancelable:true}))){history.pushState(null,'',previous);if(!(await confirmNavigation({title:'Leave without saving?',message:'Your changes have not been saved.',confirmLabel:'Discard & continue',cancelLabel:'Keep editing',tone:'danger'})))return;history.replaceState(null,'',destination);}
      setTab(currentQrTab());setFeature(currentQrFeature());setMenuOpen(false);lastLocation.current=location.href;
    };
    window.addEventListener('popstate',pop);window.addEventListener('jamanvaar-qr-request-leave',external);
    return()=>{window.removeEventListener('popstate',pop);window.removeEventListener('jamanvaar-qr-request-leave',external);};
  }, [confirmNavigation]);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = sidebar.current?.querySelector<HTMLButtonElement>("button");
    first?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuTrigger.current?.focus();
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        sidebar.current?.querySelectorAll<HTMLButtonElement>(
          "button, a[href], input",
        ) ?? [],
      );
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keys);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keys);
    };
  }, [menuOpen]);

  if (state.status === "loading")
    return (
      <div className="p-8 text-sm text-slate-500">Checking your plan…</div>
    );
  if (state.status === "unknown") {
    return (
      <div className="p-8 max-w-xl">
        <div className="flex items-center gap-3 text-slate-700 font-bold">
          <WifiOff className="w-5 h-5" /> QR Ordering
        </div>
        <p className="mt-2 text-sm text-slate-600">{state.message}</p>
        <button
          onClick={refresh}
          className={`${QR_BUTTON} mt-4`}
        >
          Try again
        </button>
      </div>
    );
  }

  const { entitlement, fromCache } = state;
  if (!entitlement.enabled)
    return (
      <LockedView
        message={entitlement.lockedMessage}
        planName={entitlement.planName}
        onViewPlan={onViewPlan}
      />
    );

  const page = QR_PAGES.find((p) => p.id === tab)!;
  const basicPages = new Set<Tab>(['OVERVIEW','ORDERS','SERVICE','MENU','CRM','RESTAURANT_PAGE','WEBSITE_QR','TABLES','ADVANCED','ANALYTICS']);
  const search = toolSearch.trim().toLowerCase();
  const visiblePages = QR_NAVIGATION.filter(page => (advancedNavigation || search || basicPages.has(page.id) || page.id === tab) && (!search || `${page.label} ${page.description} ${page.group}`.toLowerCase().includes(search)));
  const tabs: Array<[Tab, string]> = visiblePages.map((p) => [p.id, p.label]);
  return (
    <div
      className={
        workspace ? `qr-console qr-console--workspace ${layout === 'integrated' ? 'qr-integrated' : ''}` : "qr-console space-y-5"
      }
      data-testid="qr-console"
      data-jv-workspace="qr-admin"
    >
      {workspace && (
        <>
          <button
            ref={menuTrigger}
            className="qr-admin-menu"
            aria-expanded={menuOpen}
            aria-controls="qr-admin-sidebar"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={18} /> Browse workspace
          </button>
          {menuOpen && (
            <button
              className="qr-nav-backdrop"
              aria-label="Close navigation"
              onClick={() => {
                setMenuOpen(false);
                menuTrigger.current?.focus();
              }}
            />
          )}
          <aside
            ref={sidebar}
            id="qr-admin-sidebar"
            className={`qr-admin-sidebar ${menuOpen ? "is-open" : ""}`}
            aria-label="QR workspace sidebar"
          >
            <div className="qr-sidebar-title">
              <span>Restaurant workspace</span>
              <button
                aria-label="Close menu"
                onClick={() => {
                  setMenuOpen(false);
                  menuTrigger.current?.focus();
                }}
              >
                <X size={18} />
              </button>
            </div>
            <nav aria-label="QR administration">
              {onBack && <button type="button" className="qr-btn secondary" onClick={onBack}>← Back to management</button>}
              <label className="qr-tool-search">Find a tool<input type="search" value={toolSearch} onChange={event=>setToolSearch(event.target.value)} placeholder="Payments, hours, reports…" /></label>
              <button type="button" aria-expanded={advancedNavigation} onClick={() => {setAdvancedNavigation(value => !value);setToolSearch('');}} className="qr-btn secondary">{advancedNavigation ? 'Show daily tools' : 'All tools & setup'}</button>
              {!advancedNavigation&&!search&&<p className="qr-nav-hint">Daily tasks first. Payments, design and configuration are in All tools & setup.</p>}
              {!visiblePages.length&&<p className="qr-nav-hint" role="status">No tools match. Try menu, payments or hours.</p>}
              {[...new Set(visiblePages.map(page => page.group))].map((group) => (
                <div className="qr-nav-group" key={group}>
                  <span>{group}</span>
                  {visiblePages.filter((p) => p.group === group).map((p) => (
                    <div key={p.id}>
                      <button
                        aria-current={tab === p.id ? "page" : undefined}
                        onClick={() => navigate(p.id)}
                      >
                        <p.icon size={18} />
                        <span>{p.label}</span>
                      </button>
                      {p.id === "ADVANCED" && tab === "ADVANCED" && (
                        <div className="qr-nav-subpages">
                          {QR_ADVANCED_SECTIONS.map((s) => (
                            <button
                              key={s}
                              aria-current={feature === s ? "page" : undefined}
                              onClick={() => navigate("ADVANCED", s)}
                            >
                              {s === "Settings" ? "Feature controls" : s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </nav>
            <div className="qr-sidebar-license">
              <CheckCircle2 size={16} />
              <div>
                <strong>QR Ordering license active</strong>
                <span>
                  {entitlement.planName || "Licensed restaurant"}
                  {entitlement.validUntil
                    ? ` · ${new Date(entitlement.validUntil).toLocaleDateString("en-IN")}`
                    : ""}
                </span>
                <small>
                  Licenses and device access are managed by your platform
                  administrator.
                </small>
              </div>
            </div>
            <a className="qr-sidebar-link" href="/qr/">
              Product website <ArrowUpRight size={15} />
            </a>
          </aside>
        </>
      )}
      <div className={workspace ? "qr-workspace-page" : ""}>
        {!workspace && (
          <button type="button" className="qr-btn secondary" aria-expanded={advancedNavigation} onClick={()=>setAdvancedNavigation(value=>!value)}>{advancedNavigation?'Show daily tools':'All tools & setup'}</button>
        )}
        {!workspace && (
          <p className="text-xs text-slate-600">
            QR Ordering license active
            {entitlement.planName ? ` · ${entitlement.planName}` : ""}
            {entitlement.validUntil
              ? ` · Valid through ${new Date(entitlement.validUntil).toLocaleDateString("en-IN")}`
              : ""}
            . Your platform administrator manages licenses and device
            reassignment.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {workspace && (
              <span className="qr-page-eyebrow">
                QR ORDERING / {page.group}
              </span>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy">
              {workspace ? page.label : "QR Ordering"}
            </h1>
            <p className="text-sm text-[#4A5568] mt-1">
              {workspace
                ? page.description
                : "Guests scan the code on their table, order from your menu, and the order reaches your counter and kitchen."}
            </p>
          </div>
          <QrAiAssistant />
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" /> QR Ordering active{" "}
            {entitlement.source === "MANUAL_OVERRIDE"
              ? " (special access)"
              : ""}
          </span>
        </div>
        {['MENU','ONBOARDING','BRAND','DESIGN','PAYMENTS','RULES','SETTINGS','ADVANCED'].includes(tab)&&<section aria-label="QR change scope" className="rounded-xl border border-jaman-border border-l-4 border-l-brand/60 bg-white px-4 py-2.5 text-sm"><strong className="text-jaman-navy">{tab==='MENU'||tab==='ONBOARDING'?'Shared restaurant menu':'QR ordering channel'}</strong><p className="mt-0.5 text-xs leading-relaxed text-slate-600">{tab==='MENU'||tab==='ONBOARDING'?'Draft dish, category and price edits are shared with other licensed apps. Preview and publish deliberately; branch availability is a separate override.':tab==='BRAND'||tab==='DESIGN'?'Restaurant-wide QR presentation: this design applies to table QR guests across all branches. Review the live preview before saving. Kiosk welcome designs remain separate.':'Restaurant defaults are inherited until a branch has its own override; other branches are unaffected.'}</p></section>}
        {fromCache && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Showing your last known plan. Connect to the internet to refresh it;
            QR changes need a connection.
          </div>
        )}

        {!workspace && (
          <div
            className="flex flex-wrap gap-1 bg-white border border-jaman-border p-1 rounded-2xl w-fit"
            aria-label="QR administration"
          >
            {tabs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => navigate(id)}
                aria-current={tab === id ? "page" : undefined}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold ${tab === id ? "bg-brand/[0.09] text-brand ring-1 ring-inset ring-brand/40 font-semibold" : "text-slate-600 hover:bg-brand/[0.05]"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === "OVERVIEW" && (
          <div className="space-y-5">
            <Overview navigate={navigate} />
            <section className="rounded-2xl border border-jaman-border bg-white p-5 space-y-3"><h2 className="font-bold text-lg">Set up guest ordering</h2><p className="text-sm text-slate-600">Work through the setup checks below, then open your live table QR to verify the guest experience.</p><div className="flex flex-wrap gap-3">{([['MENU','1. Publish menu'],['TABLES','2. Set up table QR'],['PAYMENTS','3. Check payments'],['BRAND','4. Preview appearance']] as const).map(([id,label]) => <button key={id} type="button" className="min-h-11 rounded-xl border px-4 text-sm font-bold" onClick={() => void navigate(id)}>{label}</button>)}<button type="button" className="min-h-11 rounded-xl border px-4 text-sm font-bold" onClick={() => setAdvancedNavigation(value => !value)}>{advancedNavigation ? 'Show daily tools' : 'All tools & setup'}</button></div></section>
            <QrSetupHealth navigate={(t) => navigate(t as Tab)} />
          </div>
        )}
        {tab === 'RECEIPTS' && <QrReceiptSettings/>}
        {tab === 'OPERATIONS' && <OperationsConsole branchId={storedAdminBranch()}/>}
        {tab === "CRM" && <QrCrm />}
        {tab === "SERVICE" && <QrServiceOperations />}
        {tab === "PICKUP" && <QrPickupOperations />}
        {tab === "PERFORMANCE" && <QrMenuPerformance />}
        {tab === "SUPPORT" && <SupportTicketsModule showToast={showToast} />}
        {tab === "BRAND" && <QrBrandStudio />}
        {tab === 'RESTAURANT_PAGE' && <QrRestaurantPage onNavigate={(next,scope)=>void navigate(next,'Settings',scope)} />}
        {tab === 'WEBSITE_QR' && <QrRestaurantPageQr onNavigate={(next,scope)=>void navigate(next,'Settings',scope)}/>}
        {tab === "TABLES" && <><div className="rounded-xl border border-jaman-border border-l-4 border-l-brand/60 bg-white px-4 py-2.5 my-4 text-sm"><strong className="text-jaman-navy">Table Ordering QR → ordering menu for that table</strong><p className="mt-0.5 text-xs leading-relaxed text-slate-600">Place these cards on dining tables. A fresh scan opens the menu directly and keeps the table number. For a website QR on your entrance or visiting card, use Restaurant Page QR.</p><button type="button" className="qr-btn secondary mt-3" onClick={()=>void navigate('WEBSITE_QR')}>Design Restaurant Page QR</button></div><TablesAndQr showToast={showToast} /></>}
        {tab === "MENU" && <QrMenuWorkspace />}
        {tab === "ADVANCED" && (
          <QrCapabilities
            key={workspace ? feature : 'advanced'}
            onOpenSettings={() => void navigate('ADVANCED', 'Settings')}
            showToast={showToast}
            section={workspace ? feature : undefined}
            hideNavigation={workspace}
          />
        )}
        {tab === 'ONBOARDING' && <QrOnboarding onNavigate={page=>void navigate(page as Tab)}/>}
        {tab === 'ACCEPTANCE' && <QrPaymentWizard/>}
        {tab === 'RECONCILIATION' && <QrReconciliation/>}
        {tab === 'CALENDAR' && <QrPickupCalendar/>}
        {tab === 'RESERVATIONS' && <QrReservationsInbox/>}
        {tab === 'PRINTPACK' && <QrPrintPack/>}
        {tab === "DESIGN" && <QrDesignStudio showToast={showToast} />}
        {tab === "ORDERS" && <QrOperationalOrders showToast={showToast} />}
        {tab === "PAYMENTS" && (
          <div className="space-y-5">
            <QrOrderingRules showToast={showToast} payments />
            <QrAnalyticsView paymentsOnly />
          </div>
        )}
        {tab === "RULES" && <QrOrderingRules showToast={showToast} />}
        {tab === "ANALYTICS" && <QrAnalyticsView />}
        {tab === "SETTINGS" && (
          <div className="space-y-6">
            <Settings showToast={showToast} />
            <div className="rounded-2xl border border-jaman-border bg-white p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-jaman-navy text-sm">
                  Guest page: words, colour and logo
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Edit your heading, messages, colour and logo with a live
                  preview of exactly what guests will see, on Customer
                  Branding.
                </p>
              </div>
              <button
                type="button"
                className="min-h-11 rounded-xl border px-4 text-sm font-bold whitespace-nowrap"
                onClick={() => void navigate("BRAND")}
              >
                Open Customer Branding →
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="qr-navigation-confirm">{navigationDialog}</div>
    </div>
  );
}

function LockedView({
  message,
  planName,
  onViewPlan,
}: {
  message: string | null;
  planName: string | null;
  onViewPlan: () => void;
}) {
  return (
    <div className="max-w-2xl" data-testid="qr-locked">
      <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy flex items-center gap-2">
        <QrCode className="w-7 h-7" /> QR Ordering{" "}
        <Lock className="w-5 h-5 text-slate-500" />
      </h1>
      <div className="mt-5 rounded-2xl border border-jaman-border bg-white p-6">
        <div className="flex items-center gap-2 text-slate-700 font-bold">
          <Lock className="w-4 h-4" />{" "}
          {message ?? "QR Ordering is available on an eligible plan."}
        </div>
        <p className="mt-3 text-sm text-slate-600">
          With QR Ordering, each table gets its own code. Guests scan it with
          their phone, see your menu, and place an order that appears at your
          counter and on your kitchen screen, with no app to install.
        </p>
        {planName && (
          <p className="mt-3 text-xs text-slate-500">
            Your current plan: <b>{planName}</b>
          </p>
        )}
        <button
          onClick={onViewPlan}
          className={`${QR_BUTTON} mt-5`}
        >
          View Plan
        </button>
      </div>
    </div>
  );
}

function useLoad<T>(
  load: () => Promise<T>,
  everyMs?: number,
): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    load()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(errText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    reload();
    if (!everyMs) return;
    const t = setInterval(reload, everyMs);
    return () => clearInterval(t);
  }, [reload, everyMs]);
  return { data, error, reload };
}

function Tile({
  label,
  value,
  icon: Icon = ReceiptText,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
}) {
  return (
    <div className="qr-metric rounded-2xl border border-jaman-border bg-white p-4">
      <span className="qr-metric-icon">
        <Icon size={20} />
      </span>
      <div>
        <strong className="text-2xl font-bold text-jaman-navy">{value}</strong>
        <small className="text-xs text-slate-500 mt-1">{label}</small>
      </div>
    </div>
  );
}

function Overview({ navigate }: { navigate: (t: Tab) => void }) {
  const { data, error } = useLoad<QrOverview>(QrAdminApi.overview, 30000);
  if (error) return <div className="text-sm text-rose-700">{error}</div>;
  if (!data) return <div className="text-sm text-slate-500">Loading…</div>;
  const t = data.today;
  const missingCodes = data.tables - data.activeCodes;
  return (
    <div className="space-y-5">
      {(t.ordersPending > 0 || missingCodes > 0) && (
        <div className="rounded-2xl border border-jaman-saffron/40 bg-jaman-ivory p-4 space-y-2">
          <div className="font-bold text-jaman-navy">Needs attention today</div>
          {t.ordersPending > 0 && (
            <button
              type="button"
              className="block w-full text-left text-sm font-bold text-jaman-navy underline"
              onClick={() => navigate("ORDERS")}
            >
              {t.ordersPending} order{t.ordersPending === 1 ? "" : "s"} waiting
              or in the kitchen — view QR Orders →
            </button>
          )}
          {missingCodes > 0 && (
            <button
              type="button"
              className="block w-full text-left text-sm font-bold text-jaman-navy underline"
              onClick={() => navigate("TABLES")}
            >
              {missingCodes} table{missingCodes === 1 ? "" : "s"} without an
              active QR code — set up Tables & QR →
            </button>
          )}
        </div>
      )}
      <div className="qr-overview-welcome">
        <div>
          <small>MAKE EVERY TABLE FEEL WELCOME</small>
          <h2>A better guest experience starts here.</h2>
          <p>
            Keep your menu fresh, respond to guests and follow orders from the
            first scan to the last plate.
          </p>
        </div>
        <img
          src={`${/^\/qr\//.test(location.pathname) ? "/qr" : "/restaurant-admin"}/assets/qr-experience/dining.webp`}
          alt="A guest enjoying a Gujarati meal while ordering on their phone"
        />
      </div>
      {!data.publicBaseUrlConfigured && (
        <div className="text-sm rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 p-4">
          The ordering website address has not been set up for this platform
          yet, so QR links cannot be created. Please contact support.
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Tables" value={data.tables} icon={Users} />
        <Tile label="Active QR codes" value={data.activeCodes} icon={QrCode} />
        <Tile label="QR orders today" value={t.ordersPlaced} />
        <Tile
          label="Accepted order value today"
          value={inr(t.sales)}
          icon={IndianRupee}
        />
        <Tile
          label="Waiting / in kitchen"
          value={t.ordersPending}
          icon={Clock3}
        />
        <Tile label="Completed" value={t.ordersCompleted} icon={CheckCircle2} />
        <Tile label="Landing sessions today" value={t.scans} icon={ScanLine} />
        <Tile
          label="Average order"
          value={inr(t.averageOrderValue)}
          icon={ChartNoAxesCombined}
        />
      </div>
      <div className="rounded-2xl border border-jaman-border bg-white p-4">
        <div className="font-bold text-jaman-navy mb-2">
          Orders by table today
        </div>
        {t.ordersByTable.length === 0 ? (
          <div className="text-sm text-slate-500">No QR orders yet today.</div>
        ) : (
          <ul className="text-sm divide-y">
            {t.ordersByTable.map((r) => (
              <li key={r.table} className="py-1.5 flex justify-between">
                <span>Table {r.table}</span>
                <b>{r.orders}</b>
              </li>
            ))}
          </ul>
        )}
        <div className="text-[11px] text-slate-500 mt-3">
          Counted by the server from real orders. Order value excludes unpaid
          online drafts and cancellations; paid sales include verified online
          payments and collected counter bills ({inr(t.paidSales)} so far).
        </div>
      </div>
    </div>
  );
}

function TablesAndQr({ showToast }: { showToast: (m: string) => void }) {
  const { confirm, confirmDialog } = useConfirm();
  const tables = useLoad<QrTableRow[]>(QrAdminApi.tables, 20000);
  const branches = useLoad<QrBranch[]>(QrAdminApi.branches);
  const [branchId, setBranchId] = useState<string>(()=>{const value=new URLSearchParams(location.search).get('setupBranch');return value&&value!=='restaurant'?value:'';});
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<QrTableRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [creatingMenuCode, setCreatingMenuCode] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newCapacity, setNewCapacity] = useState("4");
  const [renaming, setRenaming] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const activeBranches = useMemo(
    () => (branches.data ?? []).filter((b) => b.status === "ACTIVE"),
    [branches.data],
  );
  // "Print selected" / "Generate selected" were already correctly disabled with nothing selected;
  // "Print All" / "Download All" had no such guard at all, so they stayed clickable even with zero
  // tables — the only feedback was a toast explaining, after the fact, that the click did nothing.
  const hasActiveQr = useMemo(
    () => (tables.data ?? []).some((r) => r.qr?.status === "ACTIVE"),
    [tables.data],
  );
  const chosenBranch =
    branchId || (activeBranches.length === 1 ? activeBranches[0].id : "");
  useEffect(() => setCreatingMenuCode(false), [chosenBranch]);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      showToast(done);
      tables.reload();
    } catch (e) {
      showToast(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const printOne = async (row: QrTableRow) => {
    try {
      printCards(
        [await QrAdminApi.printData(row.qr!.id).then(withLogo)],
        await QrAdminApi.printDesign(),
      );
    } catch (e) {
      showToast(errText(e));
    }
  };
  const printAll = async () => {
    try {
      const rows = (tables.data ?? []).filter((r) => r.qr?.status === "ACTIVE");
      if (rows.length === 0)
        return showToast("There are no active QR codes to print.");
      printCards(
        await Promise.all(
          rows.map((r) => QrAdminApi.printData(r.qr!.id).then(withLogo)),
        ),
        await QrAdminApi.printDesign(),
      );
    } catch (e) {
      showToast(errText(e));
    }
  };
  const printSelected = async () => {
    try {
      const rows = (tables.data ?? []).filter(
        (r) => selected.has(r.tableId) && r.qr?.status === "ACTIVE",
      );
      if (rows.length === 0)
        return showToast("Tick tables that have an active QR code first.");
      printCards(
        await Promise.all(
          rows.map((r) => QrAdminApi.printData(r.qr!.id).then(withLogo)),
        ),
        await QrAdminApi.printDesign(),
      );
    } catch (e) {
      showToast(errText(e));
    }
  };
  const addTable = () =>
    run(
      "add",
      async () => {
        await QrAdminApi.createTable({
          tableNumber: newNumber.trim(),
          capacity: Math.max(1, Math.floor(Number(newCapacity) || 4)),
          ...(chosenBranch ? { branchId: chosenBranch } : {}),
        });
        setNewNumber("");
        setAdding(false);
      },
      `Table ${newNumber.trim()} added`,
    );
  const downloadAll = async () => {
    try {
      const rows = (tables.data ?? []).filter((r) => r.qr?.status === "ACTIVE");
      if (rows.length === 0)
        return showToast("There are no active QR codes to download.");
      const design = await QrAdminApi.printDesign();
      for (const r of rows)
        await downloadCardPng(
          await QrAdminApi.printData(r.qr!.id).then(withLogo),
          `table-${r.displayNumber}`,
          design,
        );
    } catch (e) {
      showToast(errText(e));
    }
  };

  const generateSelected = async () => {
    const targets = (tables.data ?? []).filter(
      (row) =>
        selected.has(row.tableId) &&
        row.isActive &&
        (!row.qr || row.qr.status === "REVOKED"),
    );
    if (!targets.length)
      return showToast("Select active tables without a QR code.");
    setBusy("bulk");
    let created = 0;
    try {
      // Sequential generation gives partial progress and preserves server-enforced plan limits.
      for (const row of targets) {
        await QrAdminApi.generate(
          row.tableId,
          row.branchId || chosenBranch || undefined,
        );
        created++;
      }
      showToast(`${created} table QR codes generated.`);
    } catch (e) {
      showToast(`${created} codes generated. ${errText(e)}`);
    } finally {
      tables.reload();
      setBusy(null);
    }
  };

  if (tables.error)
    return <div className="text-sm text-rose-700">{tables.error}</div>;
  const rows = tables.data ?? [];
  return (
    <>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {activeBranches.length > 1 && (
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            aria-label="Branch for new codes"
          >
            <option value="">Choose branch for new codes…</option>
            {activeBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => setAdding((a) => !a)}
          className={`${QR_BUTTON}`}
        >
          <Plus className="w-3.5 h-3.5" /> Add table
        </button>
        <button
          onClick={generateSelected}
          disabled={!selected.size || !!busy}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold disabled:opacity-40"
        >
          Generate selected QR codes
        </button>
        <button
          onClick={printSelected}
          disabled={selected.size === 0}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
        >
          <Printer className="w-3.5 h-3.5" /> Print selected ({selected.size})
        </button>
        <button
          onClick={printAll}
          disabled={!hasActiveQr}
          title={hasActiveQr ? undefined : "No active QR codes yet — add a table and generate its code first."}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
        >
          <Printer className="w-3.5 h-3.5" /> Print All
        </button>
        <button
          onClick={downloadAll}
          disabled={!hasActiveQr}
          title={hasActiveQr ? undefined : "No active QR codes yet — add a table and generate its code first."}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" /> Download All
        </button>
        <button
          disabled={!chosenBranch}
          onClick={() => setCreatingMenuCode(true)}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
          title={chosenBranch ? 'Create a menu QR without a fixed table, then view, share or print it' : 'Choose a branch above to create a menu QR'}
        >
          <Plus className="w-3.5 h-3.5" /> Create menu QR
        </button>
      </div>

      {adding && (
        <div className="rounded-2xl border border-brand bg-white p-4 flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold text-slate-600">
            Table number or name
            <input
              value={newNumber}
              maxLength={20}
              onChange={(e) => setNewNumber(e.target.value)}
              className="block mt-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="e.g. 12 or Terrace 1"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Seats
            <input
              type="number"
              min={1}
              max={200}
              value={newCapacity}
              onChange={(e) => setNewCapacity(e.target.value)}
              className="block mt-1 w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            disabled={
              !newNumber.trim() ||
              busy === "add" ||
              (activeBranches.length > 1 && !chosenBranch)
            }
            onClick={addTable}
            className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold disabled:opacity-40"
          >
            Save table
          </button>
          {activeBranches.length > 1 && !chosenBranch ? (
            <span className="text-xs text-amber-700">
              Choose a branch above first.
            </span>
          ) : (
            !newNumber.trim() && (
              <span className="text-xs text-slate-500">
                Enter a table number or name to save.
              </span>
            )
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-sm text-slate-600 rounded-2xl border border-jaman-border bg-white p-6">
          No tables yet. Use <b>Add table</b> above (or add them under Floor /
          Tables); they appear here to receive QR codes.
        </div>
      ) : (
        <div className="rounded-2xl border border-jaman-border bg-white divide-y">
          {rows.map((row) => {
            const q = row.qr;
            return (
              <div
                key={row.tableId}
                className="p-3 flex flex-wrap items-center gap-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(row.tableId)}
                  onChange={() => toggle(row.tableId)}
                  aria-label={`Select table ${row.displayNumber}`}
                  disabled={!row.isActive || busy === "bulk"}
                />
                {renaming?.id === row.tableId ? (
                  <span className="w-40 flex gap-1">
                    <input
                      autoFocus
                      value={renaming.value}
                      maxLength={20}
                      onChange={(e) =>
                        setRenaming({ id: row.tableId, value: e.target.value })
                      }
                      className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => {
                        const v = renaming.value.trim();
                        setRenaming(null);
                        if (v && v !== row.displayNumber)
                          void run(
                            row.tableId,
                            () =>
                              QrAdminApi.updateTable(row.tableId, {
                                tableNumber: v,
                              }),
                            "Table renamed",
                          );
                      }}
                      className="text-xs font-bold text-brand"
                    >
                      Save
                    </button>
                  </span>
                ) : (
                  <div className="w-28 font-bold text-jaman-navy">
                    Table {row.displayNumber}{" "}
                    <button
                      onClick={() =>
                        setRenaming({
                          id: row.tableId,
                          value: row.displayNumber,
                        })
                      }
                      className="text-[11px] font-bold text-slate-500 ml-1"
                      aria-label={`Rename table ${row.displayNumber}`}
                    >
                      edit
                    </button>
                  </div>
                )}
                <div className="w-32 text-xs text-slate-500">
                  {q?.branchName ?? row.zone ?? ""}
                </div>
                <div className="w-24">
                  {!row.isActive ? (
                    <span className="text-slate-500 text-xs font-bold">
                      Table off
                    </span>
                  ) : !q ? (
                    <span className="text-slate-500 text-xs font-bold">
                      No code
                    </span>
                  ) : q.status === "ACTIVE" ? (
                    <span className="text-emerald-700 text-xs font-bold">
                      Active
                    </span>
                  ) : q.status === "DISABLED" ? (
                    <span className="text-amber-700 text-xs font-bold">
                      Disabled
                    </span>
                  ) : (
                    <span className="text-rose-700 text-xs font-bold">
                      Revoked
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 ml-auto">
                  {(!q || q.status === "REVOKED") && (
                    <button
                      disabled={
                        busy === row.tableId ||
                        (activeBranches.length > 1 && !chosenBranch)
                      }
                      onClick={() =>
                        run(
                          row.tableId,
                          () =>
                            QrAdminApi.generate(
                              row.tableId,
                              chosenBranch || undefined,
                            ),
                          `QR code created for table ${row.displayNumber}`,
                        )
                      }
                      className={`${QR_BUTTON}`}
                    >
                      Generate QR
                    </button>
                  )}
                  {q?.status === "ACTIVE" && (
                    <>
                      <button
                        onClick={() => setViewing(row)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold"
                      >
                        View QR
                      </button>
                      <button
                        onClick={() => printOne(row)}
                        className="px-2 py-1.5 rounded-lg border border-slate-300"
                        title="Print"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Regenerate this code?",
                              message: "The printed code will stop working immediately.",
                              confirmLabel: "Regenerate",
                              tone: "danger",
                            })
                          )
                            void run(
                              row.tableId,
                              () => QrAdminApi.regenerate(q.id),
                              "New code created; the old one no longer works",
                            );
                        }}
                        className="px-2 py-1.5 rounded-lg border border-slate-300"
                        title="Regenerate"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          run(
                            row.tableId,
                            () => QrAdminApi.disable(q.id),
                            "Code disabled",
                          )
                        }
                        className="px-2 py-1.5 rounded-lg border border-slate-300"
                        title="Disable"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {q?.status === "DISABLED" && (
                    <button
                      onClick={() =>
                        run(
                          row.tableId,
                          () => QrAdminApi.enable(q.id),
                          "Code enabled",
                        )
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Enable
                    </button>
                  )}
                  <button
                    onClick={() =>
                      run(
                        row.tableId,
                        () =>
                          QrAdminApi.updateTable(row.tableId, {
                            isActive: !row.isActive,
                          }),
                        row.isActive
                          ? `Table ${row.displayNumber} switched off`
                          : `Table ${row.displayNumber} switched on`,
                      )
                    }
                    className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-bold"
                    title="Switch this table on or off"
                  >
                    {row.isActive ? "Turn off" : "Turn on"}
                  </button>
                  {q && q.status !== "REVOKED" && (
                    <button
                      onClick={async () => {
                        if (
                          await confirm({
                            title: "Revoke this code?",
                            message: "The code is revoked permanently and cannot be used again.",
                            confirmLabel: "Revoke code",
                            tone: "danger",
                          })
                        )
                          void run(
                            row.tableId,
                            () => QrAdminApi.revoke(q.id),
                            "Code revoked",
                          );
                      }}
                      className="px-2 py-1.5 rounded-lg border border-rose-200 text-rose-700"
                      title="Revoke"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {chosenBranch ? <QrMenuCodes key={chosenBranch}
        branchId={chosenBranch} branchName={activeBranches.find(branch => branch.id === chosenBranch)?.name || 'Selected branch'}
        creating={creatingMenuCode} onCreate={() => setCreatingMenuCode(true)} onCloseCreate={() => setCreatingMenuCode(false)} showToast={showToast}
      /> : <p className="text-sm text-slate-600">Choose a branch above to view or create menu QR codes without a fixed table.</p>}
      {viewing?.qr?.url && (
        <QrDialog
          row={viewing}
          onClose={() => setViewing(null)}
          showToast={showToast}
        />
      )}
    </div>
    {confirmDialog}
    </>
  );
}

function QrDialog({
  row,
  onClose,
  showToast,
}: {
  row: QrTableRow;
  onClose: () => void;
  showToast: (m: string) => void;
}) {
  const url = row.qr!.url!;
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const {cardRef,dialogId}=useDialogFocus<HTMLDivElement>(true,onClose);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={cardRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={dialogId} className="bg-white rounded-2xl p-6 w-full max-w-sm text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div id={dialogId} className="font-bold text-jaman-navy text-lg">
          Table {row.displayNumber}
        </div>
        <img
          src={generateQrDataUrl(url, {
            size: 260,
            margin: 4,
            color: "#000000",
          })}
          alt={`QR code for table ${row.displayNumber}`}
          className="mx-auto my-3"
          width={260}
          height={260}
        />
        <div className="text-[11px] text-slate-500 break-all">{url}</div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            onClick={async () => {
              const ok = await copyText(url);
              setCopied(ok);
              showToast(ok ? 'Link copied' : 'Copy was blocked. Select and copy the link above.');
              clearTimeout(copiedTimer.current);
              copiedTimer.current = setTimeout(() => setCopied(false), 2500);
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold flex items-center gap-1"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            onClick={async () => {
              try {
                await downloadCardPng(
                  await QrAdminApi.printData(row.qr!.id).then(withLogo),
                  `table-${row.displayNumber}`,
                );
              } catch (e) {
                showToast(errText(e));
              }
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" /> PNG
          </button>
          <button
            onClick={async () => {
              try {
                printCards(
                  [await QrAdminApi.printData(row.qr!.id).then(withLogo)],
                  await QrAdminApi.printDesign(),
                );
              } catch (e) {
                showToast(errText(e));
              }
            }}
            className={`${QR_BUTTON}`}
          >
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </button>
        </div>
        <button onClick={onClose} className="mt-4 text-xs text-slate-500">
          Close
        </button>
      </div>
    </div>
  );
}

const STATUS_WORDS: Record<string, string> = {
  NEW: "Waiting",
  PREPARING: "Preparing",
  CONFIRMED: "Preparing",
  READY: "Ready",
  SERVED: "Served",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function Orders() {
  const { data, error } = useLoad<QrOrderRow[]>(
    () => QrAdminApi.orders(),
    10000,
  );
  if (error) return <div className="text-sm text-rose-700">{error}</div>;
  if (!data) return <div className="text-sm text-slate-500">Loading…</div>;
  if (data.length === 0)
    return (
      <div className="text-sm text-slate-600 rounded-2xl border border-jaman-border bg-white p-6">
        No QR orders yet. They also appear in your counter's order list, marked
        QR.
      </div>
    );
  return (
    <div className="rounded-2xl border border-jaman-border bg-white overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="p-3">Order</th>
            <th>Table</th>
            <th>Status</th>
            <th>Payment</th>
            <th className="text-right">Total</th>
            <th className="p-3 text-right">Placed</th>
          </tr>
        </thead>
        <tbody>
          {data.map((o, i) => (
            <tr key={`${o.orderNumber}-${i}`} className="border-t">
              <td className="p-3 font-bold">{o.orderNumber ?? "-"}</td>
              <td>{o.table ?? "-"}</td>
              <td>{STATUS_WORDS[o.status] ?? o.status}</td>
              <td>
                {o.paymentStatus === "SUCCESS"
                  ? "Paid"
                  : o.paymentMethod === "ONLINE"
                    ? "Online payment pending"
                    : "Pay at counter"}
              </td>
              <td className="text-right">{inr(o.total)}</td>
              <td className="p-3 text-right text-slate-500">
                {new Date(o.placedAt).toLocaleString("en-IN")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SETTING_ROWS: Array<
  [Exclude<keyof QrSettings, "rules">, string, string, boolean?]
> = [
  ["orderingEnabled", "QR ordering", "Turn all QR ordering on or off at once."],
  [
    "tableOrderingEnabled",
    "Table ordering",
    "Codes on tables that identify the table.",
  ],
  [
    "menuOnlyEnabled",
    "Menu-only codes",
    "Codes for menu cards; the guest chooses dine-in with a table number, or takeaway.",
  ],
  [
    "allowCustomerNotes",
    "Customer notes",
    "Let guests add notes to their order.",
  ],
  [
    "allowModifiers",
    "Customisations",
    "Let guests choose add-ons and options.",
  ],
  [
    "allowCash",
    "Pay at counter",
    "Guests pay at the counter when they are done.",
  ],
  [
    "allowOnlinePayment",
    "Online payment",
    "Razorpay mobile checkout. Available to guests once payment collection is active.",
  ],
  [
    "showOrderStatus",
    "Show order status",
    "Guests can follow Received, Preparing, Ready.",
  ],
  [
    "autoAccept",
    "Send straight to the kitchen",
    "When off, the counter accepts each order first.",
  ],
  ["requireCustomerName", "Ask for name", "Guests must enter their name."],
  [
    "requireCustomerPhone",
    "Ask for mobile number",
    "Guests must enter their mobile number.",
  ],
];

function Settings({ showToast }: { showToast: (m: string) => void }) {
  const { data, error, reload } = useLoad<QrSettings>(QrAdminApi.settings);
  const payment = useLoad(QrAdminApi.paymentReadiness);
  const save = async (key: keyof QrSettings, value: boolean) => {
    try {
      await QrAdminApi.saveSettings({ [key]: value });
      showToast("Saved");
      reload();
      payment.reload();
    } catch (e) {
      showToast(errText(e));
    }
  };
  if (error) return <div className="text-sm text-rose-700">{error}</div>;
  if (!data) return <div className="text-sm text-slate-500">Loading…</div>;
  return (
    <div className="rounded-2xl border border-jaman-border bg-white divide-y max-w-2xl">
      <div className="p-4"><DisplayPreferences showButtonSetting={false} /></div>
      <div className="p-4 bg-jaman-ivory rounded-t-2xl" role="status">
        <strong className="block text-sm text-jaman-navy">
          Mobile online payment:{" "}
          {payment.data?.guestAvailable ? "Available" : "Setup needed"}
        </strong>
        <p className="text-xs text-slate-600 mt-1">
          {payment.error ||
            payment.data?.message ||
            "Checking payment collection…"}
        </p>
        {payment.data?.available && !data.allowOnlinePayment && (
          <p className="text-xs text-jaman-saffron mt-1">
            Turn on Online payment below to show it on the guest checkout.
          </p>
        )}
      </div>
      {SETTING_ROWS.map(([key, label, help, unavailable]) => (
        <label
          key={key}
          className={`flex items-center justify-between gap-4 p-4 ${unavailable ? "opacity-50" : ""}`}
        >
          <span>
            <span className="block font-bold text-sm text-jaman-navy">
              {label}
            </span>
            <span className="block text-xs text-slate-500">{help}</span>
          </span>
          <input
            type="checkbox"
            className="w-5 h-5"
            checked={data[key]}
            disabled={unavailable}
            onChange={(e) => void save(key, e.target.checked)}
          />
        </label>
      ))}
    </div>
  );
}
