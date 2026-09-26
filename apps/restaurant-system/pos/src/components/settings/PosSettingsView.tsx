import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, ReceiptRepository, PrintQueueRepository, LicenseRepository } from '@jamanvaar/database';
import { PLAN_DEFINITIONS, EntitlementService, applyLicenseCertificate } from '@jamanvaar/business';
import { PlanTier, PrinterRole } from '@jamanvaar/types';
import { PosPrinterService } from '../../services/printerService';
import { formatINR, slipHeader } from '@jamanvaar/utils';
import { sound, ConnectionPanel, type SoundVolume } from '@jamanvaar/ui';
import { DisplaySizeCard } from './DisplaySizeCard';
import { DetectedPrintersPanel } from './DetectedPrintersPanel';
import {
  Settings,
  Printer,
  Server,
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  CheckCircle2,
  Sliders,
  FileText,
  HardDrive,
  Layers,
  ChefHat,
  ShieldCheck,
  Award,
  KeyRound,
  Building,
  Check,
  X,
  AlertTriangle,
  Sparkles,
  Smartphone,
  Copy,
  Terminal,
  Zap,
  Banknote,
  QrCode,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Bot,
  BarChart3,
  ShoppingBag,
  Bell,
  Network,
  ArrowRight,
  TrendingUp,
  Activity,
  Radio,
  UtensilsCrossed,
  LayoutGrid,
  Package,
  Users,
  Clock,
  Volume2,
  VolumeX
} from 'lucide-react';

export const PosSettingsView: React.FC = () => {
  const {
    isOnline,
    toggleNetworkStatus,
    posTerminalId,
    setIsPrintQueueOpen,
    currentUser,
    updateInstantBillConfig
  } = usePosStore();

  const [activeSettingsTab, setActiveSettingsTab] = useState<'HARDWARE' | 'REPORTS' | 'INSTANT_BILL' | 'DATABASE' | 'LICENSE'>('HARDWARE');
  const [instantBillFeedback, setInstantBillFeedback] = useState('');

  const instantBillCfg = db.restaurant?.instantBillConfig || {
    enabled: true,
    paymentMethod: 'CASH',
    autoPrint: true,
    askConfirmation: false,
    defaultOrderType: 'TAKEAWAY',
    sendKotBeforeBill: false,
    allowedRoles: ['role-super-admin', 'role-manager', 'role-cashier']
  };

  // Printing & Hardware State
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(true);
  const [autoPrintKot, setAutoPrintKot] = useState(true);
  const [autoPrintCustomerReceipt, setAutoPrintCustomerReceipt] = useState(false);
  const [defaultPaperSize, setDefaultPaperSize] = useState<'80mm' | '58mm'>('80mm');
  const [testPrintFeedback, setTestPrintFeedback] = useState('');
  const [syncFeedback, setSyncFeedback] = useState('');
  const [isScanningPrinters, setIsScanningPrinters] = useState(false);

  // Report Branding & Configuration State
  const [reportDefaultDesign, setReportDefaultDesign] = useState<'CLASSIC' | 'MODERN' | 'COMPACT' | 'STATEMENT' | 'BRANDED'>('CLASSIC');
  const [businessCutoffTime, setBusinessCutoffTime] = useState('05:00 AM');
  const [reportIncludeLogo, setReportIncludeLogo] = useState(true);
  const [reportIncludeCashier, setReportIncludeCashier] = useState(true);
  const [reportIncludeTaxes, setReportIncludeTaxes] = useState(true);
  const [reportIncludeTopItems, setReportIncludeTopItems] = useState(true);
  const [reportFeedback, setReportFeedback] = useState('');

  // Licensing & Subscription State
  const [dealerKeyInput, setDealerKeyInput] = useState('');
  const [licenseFeedback, setLicenseFeedback] = useState('');
  const [licenseError, setLicenseError] = useState('');
  const [expandedCoreCategory, setExpandedCoreCategory] = useState<string | null>('pos');
  const [expandedProCategory, setExpandedProCategory] = useState<string | null>('captain');
  const [showAllCoreFeatures, setShowAllCoreFeatures] = useState(false);
  const [showAllProFeatures, setShowAllProFeatures] = useState(false);

  // Sound Settings State (persisted via SoundManager localStorage)
  const initialSoundSettings = sound.getSettings();
  const [soundEnabled, setSoundEnabled] = useState(initialSoundSettings.enabled);
  const [soundVolume, setSoundVolume] = useState<SoundVolume>(initialSoundSettings.volume);
  const [soundTestFeedback, setSoundTestFeedback] = useState('');

  const currentLicense = LicenseRepository.getLicense();
  const currentTier = currentLicense.tier;

  const handleScanPrinters = () => {
    setIsScanningPrinters(true);
    setTimeout(() => {
      const res = PosPrinterService.scanForPrinters();
      setIsScanningPrinters(false);
      setTestPrintFeedback(`${res.totalFound} configured printer${res.totalFound === 1 ? '' : 's'}. ${res.note}`);
      setTimeout(() => setTestPrintFeedback(''), 7000);
    }, 600);
  };

  const handleAssignRole = (printerId: string, role: PrinterRole) => {
    const pr = db.configuredPrinters.find((p) => p.id === printerId);
    if (pr) {
      pr.role = role;
      db.notify();
      setTestPrintFeedback(`✓ Assigned "${pr.name}" to role: ${role} PRINTER`);
      setTimeout(() => setTestPrintFeedback(''), 3000);
    }
  };

  const handleTestPrint = (printerName: string, paperSize: '80mm' | '58mm' = '80mm', printerId?: string) => {
    if (printerId) {
      PosPrinterService.printTestSlip(printerId, paperSize);
    } else {
      const rawPayload = `
========================================
${slipHeader(db.restaurant.name)}
----------------------------------------
TEST PRINT TICKET
TERMINAL: ${posTerminalId}
PLAN: ${currentLicense.planName}
DATE: ${new Date().toLocaleDateString('en-IN')}
TIME: ${new Date().toLocaleTimeString()}
PRINTER: ${printerName} (${paperSize})
STATUS: SUCCESSFUL COMMUNICATION
----------------------------------------
ESC/POS Command Engine Verified OK
========================================
      `.trim();

      PrintQueueRepository.addJob({
        type: 'TEST_PAGE',
        printerName,
        rawPayload,
        paperSize
      });
    }

    setTestPrintFeedback(`Test print job dispatched to ${printerName} (${paperSize})!`);
    setTimeout(() => setTestPrintFeedback(''), 3000);
  };

  const handleForceSync = () => {
    db.notify();
    setSyncFeedback('Synchronized local database across all terminals!');
    setTimeout(() => setSyncFeedback(''), 2500);
  };

  // ENT-001 / SEC-002 fix: this used to call LicenseRepository.activatePlan(tier)
  // directly — any terminal could self-upgrade to PRO with one click, with zero
  // verification, bypassing whatever plan Super Admin actually assigned. Plan
  // changes now require a Super-Admin-signed License Certificate (see
  // handleApplyCertificate below); clicking a tier card only explains that.
  const handleActivateTier = (_tier: PlanTier) => {
    setLicenseError('Plan changes require a signed License Certificate from Super Admin — paste it below.');
  };

  const handleApplyCertificate = async () => {
    setLicenseError('');
    const cert = dealerKeyInput.trim();
    if (!cert) {
      setLicenseError('Please paste a License Certificate issued by Super Admin');
      return;
    }

    const result = await applyLicenseCertificate(cert);
    if (!result.ok) {
      const reasons: Record<typeof result.reason, string> = {
        malformed: 'That does not look like a License Certificate — paste it exactly as Super Admin provided it.',
        'invalid-signature-or-expired': 'This License Certificate is invalid or has expired. Request a new one from Super Admin.',
        'restaurant-mismatch': 'This License Certificate was issued for a different restaurant.'
      };
      setLicenseError(reasons[result.reason]);
      return;
    }

    setLicenseFeedback(`License Certificate applied: activated ${result.license.planName} (verified, signed by Super Admin).`);
    setDealerKeyInput('');
    setTimeout(() => setLicenseFeedback(''), 4000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-jaman-cream p-4 sm:p-6 overflow-y-auto select-none space-y-5">
      {/* Top Header & Settings Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-jaman-navy flex items-center gap-2">
            <Settings className="w-6 h-6 text-jaman-saffron" />
            <span>POS System & License Settings</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure hardware stations, thermal receipt print queues, and restaurant subscription licenses.
          </p>
        </div>

        {/* Settings View Switcher */}
        <div className="bg-white border border-jaman-border p-1 rounded-2xl flex items-center gap-1 shadow-2xs">
          <button
            onClick={() => setActiveSettingsTab('HARDWARE')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSettingsTab === 'HARDWARE'
                ? 'bg-jaman-saffron text-white shadow-xs'
                : 'text-slate-600 hover:text-jaman-navy hover:bg-jaman-cream'
            }`}
          >
            Hardware & Printers
          </button>
          <button
            onClick={() => setActiveSettingsTab('REPORTS')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeSettingsTab === 'REPORTS'
                ? 'bg-jaman-saffron text-white shadow-xs'
                : 'text-slate-600 hover:text-jaman-navy hover:bg-jaman-cream'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Reports & Design</span>
          </button>
          <button
            onClick={() => setActiveSettingsTab('INSTANT_BILL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeSettingsTab === 'INSTANT_BILL'
                ? 'bg-jaman-saffron text-white shadow-xs'
                : 'text-slate-600 hover:text-jaman-navy hover:bg-jaman-cream'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>⚡ Instant Bill</span>
          </button>
          <button
            onClick={() => setActiveSettingsTab('DATABASE')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSettingsTab === 'DATABASE'
                ? 'bg-jaman-saffron text-white shadow-xs'
                : 'text-slate-600 hover:text-jaman-navy hover:bg-jaman-cream'
            }`}
          >
            Local DB & Sync
          </button>
          <button
            onClick={() => setActiveSettingsTab('LICENSE')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeSettingsTab === 'LICENSE'
                ? 'bg-jaman-saffron text-white shadow-xs'
                : 'text-slate-600 hover:text-jaman-navy hover:bg-jaman-cream'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Subscription & License</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Toasts */}
      {reportFeedback && (
        <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-2xl border border-emerald-200 animate-in fade-in">
          ✓ {reportFeedback}
        </div>
      )}
      {instantBillFeedback && (
        <div className="p-3 bg-amber-50 text-amber-900 text-xs font-bold rounded-2xl border border-amber-200 animate-in fade-in">
          ✓ {instantBillFeedback}
        </div>
      )}
      {testPrintFeedback && (
        <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-2xl border border-emerald-200 animate-in fade-in">
          ✓ {testPrintFeedback}
        </div>
      )}
      {syncFeedback && (
        <div className="p-3 bg-blue-50 text-blue-800 text-xs font-bold rounded-2xl border border-blue-200 animate-in fade-in">
          ✓ {syncFeedback}
        </div>
      )}
      {licenseFeedback && (
        <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-2xl border border-emerald-200 animate-in fade-in">
          ✓ {licenseFeedback}
        </div>
      )}
      {licenseError && (
        <div className="p-3 bg-rose-50 text-rose-800 text-xs font-bold rounded-2xl border border-rose-200 animate-in fade-in">
          ⚠ {licenseError}
        </div>
      )}

      {activeSettingsTab === 'HARDWARE' && (
        <div className="bg-white border border-jaman-border rounded-3xl p-5 shrink-0">
          <h2 className="text-base font-extrabold text-jaman-navy mb-3">Connection &amp; Diagnostics</h2>
          <ConnectionPanel appVersion={typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'} />
        </div>
      )}
      {activeSettingsTab === 'HARDWARE' && <DisplaySizeCard />}

      {/* ─────────── SOUND SETTINGS CARD (always visible on HARDWARE tab) ─────────── */}
      {activeSettingsTab === 'HARDWARE' && (
        <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              {soundEnabled ? <Volume2 className="w-5 h-5 text-jaman-saffron" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
              <h3 className="font-bold text-sm text-jaman-navy">Sound Effects</h3>
            </div>
            <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
              AUDIO FEEDBACK
            </span>
          </div>

          <div className="space-y-4 text-xs">
            {/* Enable / Disable Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <strong className="text-jaman-navy block">Enable Sound Feedback</strong>
                <span className="text-slate-500">Click, add, remove, payment, KOT, and notification sounds</span>
              </div>
              <button
                type="button"
                id="sound-enabled-toggle"
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  sound.setEnabled(next);
                  if (next) sound.play('success');
                }}
                className={`relative inline-flex h-7 w-12 items-center rounded-full border-2 transition-all cursor-pointer ${
                  soundEnabled ? 'bg-jaman-saffron border-jaman-saffron' : 'bg-slate-200 border-slate-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  soundEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Volume Control */}
            {soundEnabled && (
              <div className="space-y-2">
                <strong className="text-jaman-navy block">Volume Level</strong>
                <div className="grid grid-cols-3 gap-2">
                  {(['LOW', 'MEDIUM', 'HIGH'] as SoundVolume[]).map((vol) => (
                    <button
                      key={vol}
                      type="button"
                      id={`sound-vol-${vol.toLowerCase()}`}
                      onClick={() => {
                        setSoundVolume(vol);
                        sound.setVolume(vol);
                        sound.play('click');
                      }}
                      className={`py-2 rounded-xl border font-bold transition-all ${
                        soundVolume === vol
                          ? 'bg-jaman-navy text-white border-jaman-navy shadow-xs'
                          : 'bg-jaman-cream border-jaman-border text-slate-600 hover:bg-white hover:border-slate-400'
                      }`}
                    >
                      {vol === 'LOW' ? '🔈 Low' : vol === 'MEDIUM' ? '🔉 Medium' : '🔊 High'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Test Sound Button */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                id="sound-test-btn"
                onClick={() => {
                  if (!soundEnabled) {
                    setSoundTestFeedback('⚠ Sound is disabled. Enable it first.');
                  } else {
                    sound.play('payment');
                    setSoundTestFeedback('▶ Playing test sound…');
                  }
                  setTimeout(() => setSoundTestFeedback(''), 2500);
                }}
                className="px-4 py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Play Test Sound
              </button>
              {soundTestFeedback && (
                <span className={`text-xs font-bold ${
                  soundTestFeedback.startsWith('⚠') ? 'text-amber-600' : 'text-emerald-700'
                }`}>
                  {soundTestFeedback}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: REPORTS & DESIGN CONFIGURATION */}
      {activeSettingsTab === 'REPORTS' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Default Template & Design Selector Card */}
          <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-jaman-saffron" />
                <h3 className="font-bold text-sm text-jaman-navy">Default Report Template & Layout</h3>
              </div>
              <span className="text-[10px] font-black bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full">
                5 TEMPLATES
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <strong className="text-jaman-navy block">Selected Report Design Theme:</strong>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: 'CLASSIC', name: 'Classic Accounting', desc: 'Standard audit tables & borders' },
                  { id: 'MODERN', name: 'Modern Dashboard', desc: 'Colored KPI badges & progress mix' },
                  { id: 'COMPACT', name: 'Compact A4', desc: 'Dense single-sheet printable layout' },
                  { id: 'STATEMENT', name: 'Financial Statement', desc: 'Formal P&L audit structure' },
                  { id: 'BRANDED', name: 'Restaurant Branded', desc: 'Heritage brand banner & logo' }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setReportDefaultDesign(t.id as any);
                      setReportFeedback(`Default report design set to: ${t.name}`);
                      setTimeout(() => setReportFeedback(''), 3000);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      reportDefaultDesign === t.id
                        ? 'bg-jaman-navy text-white border-jaman-navy shadow-xs'
                        : 'bg-jaman-cream border-jaman-border text-jaman-navy hover:bg-white'
                    }`}
                  >
                    <div className="font-extrabold text-xs">{t.name}</div>
                    <div className={`text-[10px] mt-0.5 ${reportDefaultDesign === t.id ? 'text-slate-300' : 'text-slate-500'}`}>
                      {t.desc}
                    </div>
                  </button>
                ))}
              </div>

              {/* Business Cutoff Rule */}
              <div className="p-3 bg-jaman-cream rounded-xl border border-jaman-border space-y-2 mt-3">
                <div className="flex justify-between items-center">
                  <strong className="text-jaman-navy">Business Day Cutoff Time</strong>
                  <select
                    value={businessCutoffTime}
                    onChange={(e) => {
                      setBusinessCutoffTime(e.target.value);
                      setReportFeedback(`Business day cutoff updated to ${e.target.value}`);
                      setTimeout(() => setReportFeedback(''), 3000);
                    }}
                    className="bg-white border border-jaman-border rounded-lg px-2.5 py-1 text-xs font-bold text-jaman-navy focus:outline-none"
                  >
                    <option value="12:00 AM">12:00 AM (Midnight)</option>
                    <option value="04:00 AM">04:00 AM (Night Operations)</option>
                    <option value="05:00 AM">05:00 AM (Standard Restaurant)</option>
                    <option value="06:00 AM">06:00 AM (Breakfast Cutoff)</option>
                  </select>
                </div>
                <span className="text-[11px] text-slate-400 block">
                  Orders billed before this cutoff belong to the previous operating date.
                </span>
              </div>
            </div>
          </div>

          {/* Report Content Options & Branding Card */}
          <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-jaman-saffron" />
                <h3 className="font-bold text-sm text-jaman-navy">Report Output & Branding Inclusions</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">PDF & EXPORT</span>
            </div>

            <div className="space-y-2.5 text-xs">
              {[
                { label: 'Include Restaurant Logo & Header Branding', state: reportIncludeLogo, set: setReportIncludeLogo },
                { label: 'Include Cashier Shift Breakdown & Tenders', state: reportIncludeCashier, set: setReportIncludeCashier },
                { label: 'Include GST & Tax Allocation Statement', state: reportIncludeTaxes, set: setReportIncludeTaxes },
                { label: 'Include Top-Selling Dishes & Menu Velocity', state: reportIncludeTopItems, set: setReportIncludeTopItems }
              ].map((opt, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-jaman-cream rounded-xl border border-jaman-border">
                  <span className="font-bold text-jaman-navy">{opt.label}</span>
                  <button
                    type="button"
                    onClick={() => opt.set(!opt.state)}
                    className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                      opt.state ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        opt.state ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}

              {/* Restaurant Identity Preview */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1 text-slate-600 mt-2">
                <div className="flex justify-between">
                  <span>Legal Entity:</span>
                  <strong className="font-mono text-jaman-navy">{db.restaurant.name}</strong>
                </div>
                <div className="flex justify-between">
                  <span>GSTIN Number:</span>
                  <strong className="font-mono text-jaman-navy">{db.restaurant.gstin || 'Not registered'}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Default Paper Size:</span>
                  <strong className="font-mono text-jaman-navy">A4 (210 x 297 mm)</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: INSTANT BILL SETTINGS */}
      {activeSettingsTab === 'INSTANT_BILL' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Main Instant Bill Configuration Card */}
          <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-jaman-saffron" />
                <h3 className="font-bold text-sm text-jaman-navy">⚡ Instant Bill / Quick Checkout</h3>
              </div>
              <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200">
                1-TAP BILLING
              </span>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Enable Instant Bill Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <strong className="text-jaman-navy block">Enable Instant Bill Shortcut</strong>
                  <span className="text-[11px] text-slate-400">
                    Bypasses payment allocation overview and settles immediately
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateInstantBillConfig({ enabled: !instantBillCfg.enabled });
                    setInstantBillFeedback(`Instant Bill ${!instantBillCfg.enabled ? 'Enabled' : 'Disabled'}`);
                    setTimeout(() => setInstantBillFeedback(''), 3000);
                  }}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                    instantBillCfg.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      instantBillCfg.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Default Payment Channel */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <strong className="text-jaman-navy block">Default Instant Bill Payment Method</strong>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'CASH', label: 'Cash at Counter' },
                    { id: 'UPI_QR', label: 'UPI / Bharat QR' },
                    { id: 'CARD', label: 'Credit / Debit Card' },
                    { id: 'WALLET', label: 'Digital Wallet' },
                    { id: 'HOUSE_ACCOUNT', label: 'House Account' }
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        updateInstantBillConfig({ paymentMethod: m.id as any });
                        setInstantBillFeedback(`Default payment method set to ${m.label}`);
                        setTimeout(() => setInstantBillFeedback(''), 3000);
                      }}
                      className={`p-2 rounded-xl text-left border font-bold transition-all ${
                        instantBillCfg.paymentMethod === m.id
                          ? 'bg-jaman-navy text-white border-jaman-navy shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[11px] block">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto Print After Instant Bill */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <strong className="text-jaman-navy block">Auto-Print Thermal Bill After Settle</strong>
                  <span className="text-[11px] text-slate-400">
                    Immediately send receipt to 80mm thermal hardware queue
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateInstantBillConfig({ autoPrint: !instantBillCfg.autoPrint });
                    setInstantBillFeedback(`Auto-Print ${!instantBillCfg.autoPrint ? 'Enabled' : 'Disabled'}`);
                    setTimeout(() => setInstantBillFeedback(''), 3000);
                  }}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                    instantBillCfg.autoPrint ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      instantBillCfg.autoPrint ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Ask For Confirmation */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <strong className="text-jaman-navy block">Ask For 1-Tap Confirmation Dialog</strong>
                  <span className="text-[11px] text-slate-400">
                    Display compact modal to confirm total before firing printer (Recommended: OFF for max speed)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateInstantBillConfig({ askConfirmation: !instantBillCfg.askConfirmation });
                    setInstantBillFeedback(`Confirmation prompt ${!instantBillCfg.askConfirmation ? 'Enabled' : 'Disabled'}`);
                    setTimeout(() => setInstantBillFeedback(''), 3000);
                  }}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                    instantBillCfg.askConfirmation ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      instantBillCfg.askConfirmation ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Send KOT before Bill */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <strong className="text-jaman-navy block">Send KOT Ticket to Kitchen Stations</strong>
                  <span className="text-[11px] text-slate-400">
                    Automatically route KOT to kitchen displays / printers alongside customer bill
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateInstantBillConfig({ sendKotBeforeBill: !instantBillCfg.sendKotBeforeBill });
                    setInstantBillFeedback(`Kitchen KOT ${!instantBillCfg.sendKotBeforeBill ? 'Enabled' : 'Disabled'}`);
                    setTimeout(() => setInstantBillFeedback(''), 3000);
                  }}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                    instantBillCfg.sendKotBeforeBill ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      instantBillCfg.sendKotBeforeBill ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Configuration Preview & Test Simulator Card */}
          <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-jaman-navy" />
                <h3 className="font-bold text-sm text-jaman-navy">Live Configuration Preview</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">STATUS PREVIEW</span>
            </div>

            <div className="bg-jaman-cream p-4 rounded-2xl border border-jaman-border space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-bold">Instant Bill Status:</span>
                <span className={`font-black px-2 py-0.5 rounded text-[11px] ${
                  instantBillCfg.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {instantBillCfg.enabled ? '● ENABLED' : '○ DISABLED'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-bold">Tender Channel:</span>
                <span className="font-mono font-black text-jaman-navy uppercase">{instantBillCfg.paymentMethod}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-bold">Default Order Type:</span>
                <span className="font-mono font-bold text-slate-700">{instantBillCfg.defaultOrderType || 'TAKEAWAY'}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-bold">Auto Thermal Print:</span>
                <span className="font-bold text-emerald-700">{instantBillCfg.autoPrint ? 'ON' : 'OFF'}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-bold">Confirmation Prompt:</span>
                <span className="font-bold text-slate-700">{instantBillCfg.askConfirmation ? 'ON' : 'OFF (Instant)'}</span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 font-bold">Kitchen KOT Dispatch:</span>
                <span className="font-bold text-slate-700">{instantBillCfg.sendKotBeforeBill ? 'ON' : 'OFF'}</span>
              </div>
            </div>

            {/* Safe Test Simulator Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  handleTestPrint('POS Thermal Receipt 80mm');
                  setInstantBillFeedback('Dispatched safe test receipt to hardware print queue!');
                  setTimeout(() => setInstantBillFeedback(''), 3000);
                }}
                className="w-full py-2.5 bg-jaman-navy hover:bg-jaman-darkBorder text-white font-black text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span>⚡ Test Instant Bill Print (Safe Simulation)</span>
              </button>
              <span className="text-[10px] text-slate-400 text-center block mt-1.5">
                Safe hardware simulation: queues test ticket without creating real accounting invoices.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB: HARDWARE & PRINTERS */}
      {activeSettingsTab === 'HARDWARE' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Auto-Print Rules Card */}
          <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-jaman-saffron" />
                <h3 className="font-bold text-sm text-jaman-navy">Printing & Automation Rules</h3>
              </div>
              <span className="text-[10px] font-bold bg-jaman-saffron/10 text-jaman-saffron px-2 py-0.5 rounded-full">
                AUTO-PRINT
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <strong className="text-jaman-navy block">Auto-Print Receipt on Settlement</strong>
                  <span className="text-[11px] text-slate-400">
                    Automatically queue thermal receipt upon successful payment
                  </span>
                </div>
                <button
                  onClick={() => setAutoPrintReceipt(!autoPrintReceipt)}
                  className={`w-11 h-6 rounded-full p-1 transition-colors ${
                    autoPrintReceipt ? 'bg-jaman-saffron' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      autoPrintReceipt ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <strong className="text-jaman-navy block">Auto-Print KOT on Order Dispatch</strong>
                  <span className="text-[11px] text-slate-400">
                    Send kitchen tickets to station printers automatically
                  </span>
                </div>
                <button
                  onClick={() => setAutoPrintKot(!autoPrintKot)}
                  className={`w-11 h-6 rounded-full p-1 transition-colors ${
                    autoPrintKot ? 'bg-jaman-saffron' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      autoPrintKot ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <strong className="text-jaman-navy block">Default Paper Width</strong>
                  <span className="text-[11px] text-slate-400">Standard counter roll dimension</span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setDefaultPaperSize('80mm')}
                    className={`px-3 py-1 rounded-lg font-mono font-bold transition-colors ${
                      defaultPaperSize === '80mm'
                        ? 'bg-jaman-saffron text-white'
                        : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    80mm
                  </button>
                  <button
                    onClick={() => setDefaultPaperSize('58mm')}
                    className={`px-3 py-1 rounded-lg font-mono font-bold transition-colors ${
                      defaultPaperSize === '58mm'
                        ? 'bg-jaman-saffron text-white'
                        : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    58mm
                  </button>
                </div>
              </div>
            </div>
          </div>

          <DetectedPrintersPanel
            onAdded={() => setTestPrintFeedback('')}
            showToast={(msg) => {
              setTestPrintFeedback(msg);
              setTimeout(() => setTestPrintFeedback(''), 4000);
            }}
          />

          {/* Configured Printers Station */}
          <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-jaman-saffron" />
                <div>
                  <h3 className="font-bold text-sm text-jaman-navy">Printers & Hardware Devices</h3>
                  <span className="text-[10px] text-slate-400">Auto-detected Windows, USB & LAN Thermal Printers</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleScanPrinters}
                  disabled={isScanningPrinters}
                  className="px-2.5 py-1.5 bg-[#FFF4ED] hover:bg-[#FFE8D6] text-jaman-saffron border border-[#FDBA74] rounded-xl font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                  title="Scan for connected physical & network printers"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanningPrinters ? 'animate-spin' : ''}`} />
                  <span>{isScanningPrinters ? 'Scanning...' : 'Scan for Printers'}</span>
                </button>
                <button
                  onClick={() => setIsPrintQueueOpen(true)}
                  className="text-[11px] font-bold text-jaman-navy hover:text-jaman-saffron hover:underline"
                >
                  Print Queue
                </button>
              </div>
            </div>

            <div className="space-y-2.5 text-xs max-h-[420px] overflow-y-auto pr-1">
              {db.configuredPrinters.map((pr) => (
                <div
                  key={pr.id}
                  className="p-3 bg-jaman-cream rounded-2xl border border-jaman-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-jaman-navy text-xs">{pr.name}</strong>
                      <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold">
                        {pr.paperSize}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                        pr.status === 'READY'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        ● {pr.status}
                      </span>
                      {pr.isDefault && (
                        <span className="text-[9px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                      <span>Interface: <strong className="font-mono text-slate-700">{pr.interfaceType}</strong></span>
                      {pr.port && <span>Port: <strong className="font-mono text-slate-700">{pr.port}</strong></span>}
                      {pr.ipAddress && <span>IP: <strong className="font-mono text-slate-700">{pr.ipAddress}</strong></span>}
                      {pr.assignedTerminalId && <span>Terminal: <strong className="font-mono text-slate-700">{pr.assignedTerminalId}</strong></span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {/* Role Reassignment Dropdown */}
                    <select
                      value={pr.role || 'GENERAL'}
                      onChange={(e) => handleAssignRole(pr.id, e.target.value as PrinterRole)}
                      className="bg-white border border-jaman-border rounded-xl px-2 py-1 text-[11px] font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron shadow-2xs"
                      title="Assign printer role"
                    >
                      <option value="RECEIPT">RECEIPT PRINTER</option>
                      <option value="KITCHEN">KITCHEN / KOT PRINTER</option>
                      <option value="TANDOOR">TANDOOR PRINTER</option>
                      <option value="BAR">BAR / BEVERAGES PRINTER</option>
                      <option value="DESSERT">DESSERT PRINTER</option>
                      <option value="REPORT">REPORT PRINTER</option>
                      <option value="GENERAL">GENERAL PRINTER</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleTestPrint(pr.name, pr.paperSize as any, pr.id)}
                      className="px-3 py-1.5 bg-white border border-slate-300 hover:border-jaman-saffron hover:text-jaman-saffron rounded-xl font-black text-xs transition-all active:scale-95 shadow-2xs cursor-pointer"
                    >
                      Test Print
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LOCAL DB & SYNC */}
      {activeSettingsTab === 'DATABASE' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-jaman-navy">Local Storage Health</h3>
              </div>
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                HEALTHY
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Database Engine:</span>
                  <strong className="font-mono text-jaman-navy">Browser LocalStorage (device-local)</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Menu Dishes:</span>
                  <strong className="font-mono text-jaman-navy">{db.menuItems.length} records</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Orders:</span>
                  <strong className="font-mono text-jaman-navy">{db.orders.length} records</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Print Queue Buffer:</span>
                  <strong className="font-mono text-jaman-navy">{db.printJobs.length} jobs</strong>
                </div>
              </div>

              <button
                onClick={handleForceSync}
                className="w-full py-2.5 bg-jaman-navy hover:bg-jaman-darkBorder text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-2xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Force Local Database Synchronization</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-jaman-navy">Offline Resilience Engine</h3>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {isOnline ? 'ONLINE' : 'OFFLINE MODE'}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              JAMANVAAR POS operates with 100% offline capability. When internet connectivity drops, billing, kitchen tickets, thermal printing, and cash registers continue without interruption.
            </p>

            <button
              onClick={toggleNetworkStatus}
              className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors border ${
                isOnline
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              {isOnline ? <WifiOff className="w-4 h-4 text-amber-600" /> : <Wifi className="w-4 h-4 text-emerald-600" />}
              <span>{isOnline ? 'Simulate Offline Mode' : 'Restore Online Mode'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: SUBSCRIPTION & LICENSE (OWNER & DEALER WORKFLOW) */}
      {activeSettingsTab === 'LICENSE' && (
        <div className="space-y-6">
          {/* Active License Details Card */}
          <div className="bg-white border border-jaman-border rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#FFF4ED] border border-[#FDBA74] text-jaman-saffron flex items-center justify-center shadow-xs">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-jaman-navy leading-tight">
                      {currentLicense.planName}
                    </h2>
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                      ✓ {currentLicense.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Restaurant: {currentLicense.restaurantName} • Branch: {currentLicense.branchName}
                  </p>
                </div>
              </div>

              <div className="text-right font-mono">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                  Active Price Tier
                </span>
                <span className="text-xl font-black text-jaman-navy">
                  {formatINR(currentLicense.price)}
                </span>
              </div>
            </div>

            {/* License Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-jaman-cream rounded-2xl border border-jaman-border">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  License Key
                </span>
                <strong className="font-mono text-jaman-navy text-xs block truncate mt-0.5">
                  {currentLicense.licenseKey}
                </strong>
              </div>

              <div className="p-3 bg-jaman-cream rounded-2xl border border-jaman-border">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Terminal ID
                </span>
                <strong className="font-mono text-jaman-navy text-xs block mt-0.5">
                  {currentLicense.terminalId || posTerminalId}
                </strong>
              </div>

              <div className="p-3 bg-jaman-cream rounded-2xl border border-jaman-border">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Allowed Terminals
                </span>
                <strong className="font-mono text-jaman-navy text-xs block mt-0.5">
                  {currentLicense.activeDevicesCount} / {currentLicense.allowedDevicesCount} Active
                </strong>
              </div>

              <div className="p-3 bg-jaman-cream rounded-2xl border border-jaman-border">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Valid Until
                </span>
                <strong className="font-mono text-jaman-navy text-xs block mt-0.5">
                  {new Date(currentLicense.validUntil).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}
                </strong>
              </div>
            </div>
          </div>



          {/* Plan Comparison Cards (CORE vs PRO) */}
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-jaman-navy">Available Software Editions</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Commercial restaurant POS & connected restaurant ecosystem licensing by KELVIONTECH.
                </p>
              </div>
              <span className="text-[11px] font-bold text-slate-500 bg-jaman-cream border border-jaman-border px-3 py-1 rounded-xl w-fit">
                Lifetime License • No Monthly Commissions • 100% Offline-First
              </span>
            </div>

            {/* TWO CARDS GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* CARD 1: JAMANVAAR CORE (₹5,000) - 5 Cols */}
              <div
                className={`lg:col-span-5 bg-white rounded-3xl p-5 sm:p-6 border flex flex-col justify-between transition-all select-none ${
                  currentTier === 'CORE'
                    ? 'border-jaman-navy shadow-md ring-2 ring-jaman-navy/10'
                    : 'border-jaman-border shadow-2xs hover:border-slate-300'
                }`}
              >
                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                    <div>
                      <span className="text-[10px] font-black tracking-wider uppercase text-slate-400 block">
                        FOUNDATION EDITION
                      </span>
                      <h4 className="text-xl sm:text-2xl font-black text-jaman-navy">JAMANVAAR CORE</h4>
                      <span className="text-xs text-slate-600 font-bold block mt-0.5">
                        POS + Complete Restaurant Management
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-2xl sm:text-3xl font-black text-jaman-navy font-mono">₹5,000</span>
                      <span className="text-[10px] text-slate-400 block">per license</span>
                    </div>
                  </div>

                  {/* Positioning Tagline */}
                  <p className="text-xs text-slate-600 leading-relaxed bg-jaman-cream p-3 rounded-2xl border border-jaman-border">
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
                        className="text-[10px] font-bold text-slate-500 hover:text-jaman-navy underline cursor-pointer"
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
                          'Local Device Storage',
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
                      const Icon = group.icon;
                      const isExpanded = expandedCoreCategory === group.id || showAllCoreFeatures;

                      return (
                        <div key={group.id} className="border border-jaman-border rounded-2xl overflow-hidden bg-white shadow-2xs">
                          <button
                            type="button"
                            onClick={() => setExpandedCoreCategory(expandedCoreCategory === group.id ? null : group.id)}
                            className="w-full px-3.5 py-2.5 bg-jaman-cream hover:bg-slate-100 flex items-center justify-between font-bold text-xs text-jaman-navy cursor-pointer transition-colors"
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
                            <div className="p-3 text-[11px] text-slate-700 bg-white border-t border-jaman-border">
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
                      onClick={() => handleActivateTier('CORE')}
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
                    ? 'border-jaman-saffron ring-4 ring-jaman-saffron/20 shadow-2xl'
                    : 'border-[#FDBA74] hover:border-jaman-saffron'
                }`}
              >
                {/* Recommended Flagship Ribbon */}
                <div className="absolute -top-3.5 right-6 bg-gradient-to-r from-jaman-saffron to-[#EA580C] text-white text-[11px] font-black px-4 py-1 rounded-full shadow-lg uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  <span>RECOMMENDED • BEST VALUE</span>
                </div>

                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-amber-200/60 pb-4">
                    <div>
                      <span className="text-[10px] font-black tracking-widest uppercase text-jaman-saffron block">
                        FLAGSHIP CONNECTED RESTAURANT ECOSYSTEM
                      </span>
                      <h4 className="text-2xl sm:text-3xl font-black text-jaman-navy flex items-center gap-2">
                        <span>JAMANVAAR PRO</span>
                      </h4>
                      <span className="text-xs text-slate-700 font-bold block mt-0.5">
                        POS + Restaurant Management + Connected Restaurant Ecosystem
                      </span>
                    </div>

                    <div className="text-left sm:text-right shrink-0">
                      <div className="flex items-baseline gap-1 sm:justify-end">
                        <span className="text-3xl sm:text-4xl font-black text-jaman-navy font-mono">₹7,000</span>
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

                    <div className="p-2.5 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 rounded-xl border border-amber-300 text-xs text-jaman-navy flex items-center justify-between gap-2 font-black">
                      <div className="flex items-center gap-1.5 text-jaman-saffron">
                        <Sparkles className="w-4 h-4 text-jaman-saffron shrink-0" />
                        <span>⭐ ONLY ₹2,000 MORE THAN CORE</span>
                      </div>
                      <span className="text-[11px] font-bold text-jaman-saffron bg-white px-2.5 py-0.5 rounded-full shadow-2xs border border-amber-200">
                        ⭐ RECOMMENDED • BEST VALUE
                      </span>
                    </div>
                  </div>

                  {/* PRO Feature Modules Accordion */}
                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-jaman-saffron tracking-wider block">
                        ⭐ PRO CONNECTED MODULES (173 EXCLUSIVE CAPABILITIES):
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAllProFeatures(!showAllProFeatures)}
                        className="text-[10px] font-bold text-jaman-saffron hover:text-[#EA580C] underline cursor-pointer"
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
                              ? 'border-2 border-jaman-saffron/60 ring-2 ring-jaman-saffron/10'
                              : 'border border-amber-200/80'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setExpandedProCategory(expandedProCategory === group.id ? null : group.id)}
                            className={`w-full px-3.5 py-3 flex items-center justify-between font-black text-xs cursor-pointer transition-colors ${
                              group.isFlagship
                                ? 'bg-gradient-to-r from-[#FFF7F0] to-[#FFFDF9] hover:bg-amber-50 text-jaman-navy'
                                : 'bg-[#FFFDFB] hover:bg-amber-50/50 text-jaman-navy'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 text-left">
                              <div className="w-6 h-6 rounded-lg bg-orange-100 text-jaman-saffron flex items-center justify-center shrink-0">
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <span className="tracking-tight">{group.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
                              <span className="text-[10px] font-mono font-bold text-jaman-saffron bg-[#FFF4EB] border border-[#FED7AA] px-2 py-0.5 rounded-full">
                                {group.features.length} features
                              </span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-jaman-saffron" /> : <ChevronDown className="w-3.5 h-3.5 text-jaman-saffron" />}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="p-3.5 text-[11px] text-slate-800 bg-white border-t border-amber-100">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
                                {group.features.map((feat, fIdx) => (
                                  <div key={fIdx} className="flex items-start gap-1.5 leading-snug">
                                    <Check className="w-3.5 h-3.5 text-jaman-saffron shrink-0 mt-0.5 stroke-[2.5]" />
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
                  <div className="p-4 bg-gradient-to-br from-jaman-navy to-jaman-darkBorder text-white rounded-2xl shadow-md space-y-3">
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
                  <div className="text-[10px] font-black tracking-wider uppercase text-jaman-saffron text-center flex items-center justify-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-jaman-saffron" />
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
                        onClick={() => handleActivateTier('PRO')}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-jaman-saffron via-[#EA580C] to-jaman-saffron hover:from-[#EA580C] hover:to-[#C2410C] text-white font-black text-sm uppercase tracking-wider shadow-xl shadow-jaman-saffron/30 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
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
            <div className="bg-white rounded-3xl p-6 border border-jaman-border shadow-2xs space-y-4">
              <div>
                <span className="text-[10px] font-black uppercase text-jaman-saffron tracking-widest block">
                  COMMERCIAL ADVANTAGE
                </span>
                <h4 className="text-base font-black text-jaman-navy">Why Restaurants Upgrade to JAMANVAAR PRO</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-orange-100 text-jaman-saffron flex items-center justify-center font-black text-xs">
                    01
                  </div>
                  <strong className="text-xs font-black text-jaman-navy block">
                    📱 SERVE FROM THE TABLE
                  </strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Wireless Captain App for waiters. Take orders table-side and fire KOT tickets directly to the kitchen.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-xs">
                    02
                  </div>
                  <strong className="text-xs font-black text-jaman-navy block">
                    📲 LET CUSTOMERS ORDER
                  </strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    QR Table Ordering and Self-Service Kiosks. Increase average ticket size without hiring extra staff.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-black text-xs">
                    03
                  </div>
                  <strong className="text-xs font-black text-jaman-navy block">
                    ⚡ CONNECT FLOOR & KITCHEN
                  </strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    POS ↔ Captain ↔ KDS real-time mesh sync. Zero miscommunication between waiters, kitchen, and billing.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-black text-xs">
                    04
                  </div>
                  <strong className="text-xs font-black text-jaman-navy block">
                    📊 RUN WITH INTELLIGENCE
                  </strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Advanced analytics, staff tracking, and JAMAN AI Assistant to answer sales and operational questions in seconds.
                  </p>
                </div>
              </div>
            </div>

            {/* SECTION 3: CORE vs PRO SIDE-BY-SIDE MATRIX */}
            <div className="bg-white rounded-3xl p-6 border border-jaman-border shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-sm font-black text-jaman-navy">CORE vs PRO — Feature Comparison Matrix</h4>
                  <span className="text-[11px] text-slate-500">Every feature is backed by production-grade offline-first code.</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">OFFICIAL FEATURE MATRIX</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-jaman-border text-slate-400 font-bold text-[10px] uppercase">
                      <th className="py-2.5 px-3">Software Capability</th>
                      <th className="py-2.5 px-3 text-center w-36">CORE (₹5,000)</th>
                      <th className="py-2.5 px-3 text-center w-48 bg-amber-50/60 text-jaman-saffron">PRO (₹7,000)</th>
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
                      { cap: '100% Offline Local Engine', core: '✓ Included', pro: '✓ Included' },
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
                        <td className="py-2.5 px-3 font-bold text-jaman-navy">{row.cap}</td>
                        <td className="py-2.5 px-3 text-center text-slate-700 font-mono text-[11px]">{row.core}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-jaman-saffron bg-amber-50/30 font-mono text-[11px]">
                          {row.pro}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Offline License Certificate Activation */}
            <div className="bg-white border border-jaman-border rounded-3xl p-6 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <KeyRound className="w-5 h-5 text-jaman-saffron" />
                <div>
                  <h4 className="text-sm font-bold text-jaman-navy">Offline License Certificate</h4>
                  <p className="text-[11px] text-slate-500">
                    Paste the signed License Certificate Super Admin generated for this restaurant. It is
                    cryptographically verified — a plan cannot be changed without one.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="text"
                  value={dealerKeyInput}
                  onChange={(e) => setDealerKeyInput(e.target.value)}
                  placeholder="Paste the License Certificate from Super Admin..."
                  className="w-full sm:flex-1 bg-jaman-cream border border-jaman-border rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-jaman-navy placeholder:text-slate-400 focus:outline-none focus:border-jaman-saffron"
                />

                <button
                  onClick={handleApplyCertificate}
                  disabled={!dealerKeyInput.trim()}
                  className="w-full sm:w-auto px-6 py-2.5 bg-jaman-navy hover:bg-jaman-darkBorder disabled:opacity-40 text-white font-bold text-xs rounded-2xl transition-colors shrink-0 shadow-xs cursor-pointer"
                >
                  Verify & Apply Certificate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
