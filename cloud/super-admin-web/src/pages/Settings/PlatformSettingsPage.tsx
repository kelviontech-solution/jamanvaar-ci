import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformSetting } from '../../api/types';
import { FilterTabs } from '../../components/ui';
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
        <FilterTabs<SettingsTab> value={tab} onChange={setTab} options={SETTINGS_TABS} />
      </div>

      {loading ? (
        <div className="page-loading">Loading platform configuration…</div>
      ) : (
        <>
        {tab === 'GENERAL' && (
        <div className="settings-grid">
          <PlatformBrandingCard settings={settings} saving={saving} setSaving={setSaving} onSaved={showSaved} />
          <OnboardingDefaultsCard settings={settings} saving={saving} setSaving={setSaving} onSaved={showSaved} />
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
