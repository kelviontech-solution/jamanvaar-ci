import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformSetting } from '../../api/types';
import { FilterTabs, ConfirmModal, Button } from '../../components/ui';
import '../../components/shared.css';
import './settings.css';
import { InvoiceSellerCard } from './InvoiceSellerCard';
import { KioskWelcomeDesignsCard } from './KioskWelcomeDesignsCard';
import { PlatformBrandingCard } from './PlatformBrandingCard';
import { OnboardingDefaultsCard } from './OnboardingDefaultsCard';
import { MaintenanceModeCard } from './MaintenanceModeCard';
import { TargetedAnnouncementCard } from './TargetedAnnouncementCard';

type SettingsTab = 'GENERAL' | 'BILLING' | 'COMMS' | 'KIOSK';

/** Six unrelated setting groups used to sit in one flat scroll (identity, onboarding defaults,
 * statutory invoice data, two separate broadcast mechanisms, and a whole image library), in an
 * order that put the longest card first and pushed everything else below the fold. Grouped here
 * by what an admin is actually trying to do, matching the FilterTabs pattern already used on
 * Billing/Devices/Notifications. */
const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'GENERAL', label: 'General' },
  { id: 'BILLING', label: 'Billing & Legal' },
  { id: 'COMMS', label: 'Communications' },
  { id: 'KIOSK', label: 'Kiosk Designs' }
];

export function PlatformSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('GENERAL');
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [sellerValue, setSellerValue] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  // Which GENERAL-tab cards currently have an unsaved edit — switching tabs used to unmount
  // them and silently discard it. Keyed by card name so either card being dirty blocks the switch.
  const [dirtyCards, setDirtyCards] = useState<Record<string, boolean>>({});
  const [pendingTab, setPendingTab] = useState<SettingsTab | null>(null);
  const anyDirty = Object.values(dirtyCards).some(Boolean);

  function requestTabChange(next: SettingsTab) {
    if (next === tab) return;
    if (anyDirty) {
      setPendingTab(next);
      return;
    }
    setTab(next);
  }

  function loadSettings() {
    setLoading(true);
    api
      .get<PlatformSetting[]>('/api/v1/platform/settings')
      .then((data) => {
        setSettings(data);
        const billing = data.find((s) => s.key === 'platform.billing');
        if (billing?.value) setSellerValue(billing.value as Record<string, string>);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load platform settings'))
      .finally(() => setLoading(false));
  }

  useEffect(loadSettings, []);

  function showSaved(message: string) {
    setSuccessToast(message);
    setTimeout(() => setSuccessToast(null), 4000);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Settings</h1>
          <p className="page-subtitle">
            Global SaaS parameters, default onboarding quotas, statutory business metadata, and platform maintenance mode.
          </p>
        </div>
      </div>

      {error && <div className="page-error" role="alert">{error}</div>}
      {successToast && <div className="page-success" role="status">{successToast}</div>}

      <div className="toolbar" style={{ marginTop: 8, marginBottom: 20 }}>
        <FilterTabs<SettingsTab> value={tab} onChange={requestTabChange} options={SETTINGS_TABS} />
      </div>

      <ConfirmModal
        isOpen={pendingTab !== null}
        title="Leave without saving?"
        message="You have unsaved changes on this tab. Switching tabs will discard them."
        confirmLabel="Discard & continue"
        tone="danger"
        onConfirm={() => {
          if (pendingTab) setTab(pendingTab);
          setPendingTab(null);
          setDirtyCards({});
        }}
        onClose={() => setPendingTab(null)}
      />

      {loading ? (
        <div className="page-loading">Loading platform configuration…</div>
      ) : error && settings.length === 0 ? (
        // A failed load used to fall through to the cards below anyway, rendering them with
        // hardcoded defaults and an enabled Save button that would overwrite whatever the real,
        // unseen current values are. Block editing until a real load succeeds.
        <div className="page-error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>{error}</span>
          <Button size="sm" variant="ghost" onClick={loadSettings}>Retry</Button>
        </div>
      ) : (
        <>
        {tab === 'GENERAL' && (
        <div className="settings-grid">
          <PlatformBrandingCard settings={settings} saving={saving} setSaving={setSaving} onSaved={showSaved} onDirtyChange={(d) => setDirtyCards((c) => ({ ...c, branding: d }))} />
          <OnboardingDefaultsCard settings={settings} saving={saving} setSaving={setSaving} onSaved={showSaved} onDirtyChange={(d) => setDirtyCards((c) => ({ ...c, defaults: d }))} />
        </div>
        )}

        {tab === 'BILLING' && (
        <div className="settings-grid">
          <InvoiceSellerCard
            className="settings-card-wide"
            value={sellerValue}
            onSaved={(message) => {
              showSaved(message);
              loadSettings();
            }}
          />
        </div>
        )}

        {tab === 'COMMS' && (
        <div className="settings-grid">
          <MaintenanceModeCard settings={settings} saving={saving} setSaving={setSaving} onSaved={showSaved} />
          <TargetedAnnouncementCard settings={settings} saving={saving} setSaving={setSaving} onSaved={showSaved} />
        </div>
        )}

        {tab === 'KIOSK' && (
        <div className="settings-grid">
          <KioskWelcomeDesignsCard />
        </div>
        )}
        </>
      )}
    </div>
  );
}
