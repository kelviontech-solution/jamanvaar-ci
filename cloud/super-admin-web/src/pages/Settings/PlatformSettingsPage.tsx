import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformSetting, AuditLogRow } from '../../api/types';
import { Card, Button, Input, Badge } from '../../components/ui';
import { Sliders, Save, ShieldCheck, Wrench, Building2, Bell, AlertTriangle, History } from 'lucide-react';
import '../../components/shared.css';
import './settings.css';
import { InvoiceSellerCard } from './InvoiceSellerCard';
import { KioskWelcomeDesignsCard } from './KioskWelcomeDesignsCard';

/** ISO timestamp -> the value a datetime-local input wants (local time, no seconds). */
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

export function PlatformSettingsPage() {
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Form states
  const [platformName, setPlatformName] = useState('JAMANVAAR SaaS Control Plane');
  const [companyName, setCompanyName] = useState('Kelviontech');
  const [supportEmail, setSupportEmail] = useState('support@jamanvaar.app');
  const [supportPhone, setSupportPhone] = useState('');

  const [trialDurationDays, setTrialDurationDays] = useState(14);
  const [maxTrialBranches, setMaxTrialBranches] = useState(1);
  const [maxTrialDevices, setMaxTrialDevices] = useState(5);

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  /** What is actually saved (and therefore live for restaurants), as opposed to what the form shows. */
  const [savedMaintenance, setSavedMaintenance] = useState<{ on: boolean; banner: string; startsAt: string; endsAt: string } | null>(null);
  const [sellerValue, setSellerValue] = useState<Record<string, string> | null>(null);
  // A saved maintenance notice only reaches a terminal on its own next heartbeat -- with no
  // visibility into that, "I turned it on and nothing shows up" is indistinguishable from a real
  // bug when the real reason is just that a given terminal has been offline for hours or days
  // (confirmed live: several restaurants' own notification panel already shows exactly that).
  const [fleetReach, setFleetReach] = useState<{ online: number; degraded: number; offline: number; total: number } | null>(null);
  // Every maintenance save is already written to the generic Audit Log by platform-settings.service.ts
  // (action PLATFORM_SETTING_UPDATED, details.key 'platform.maintenance') -- this just surfaces it here
  // instead of sending the admin to the separate Audit Logs page to find their own past announcements.
  const [maintenanceHistory, setMaintenanceHistory] = useState<AuditLogRow[]>([]);
  const [formErrors, setFormErrors] = useState<{ branding?: string; defaults?: string; maintenance?: string }>({});

  const [saving, setSaving] = useState(false);

  function loadSettings() {
    setLoading(true);
    api
      .get<PlatformSetting[]>('/api/v1/platform/settings')
      .then((data) => {
        setSettings(data);
        for (const s of data) {
          if (s.key === 'platform.branding' && s.value) {
            setPlatformName(s.value.platformName || '');
            setCompanyName(s.value.companyName || '');
            setSupportEmail(s.value.supportEmail || '');
            setSupportPhone(s.value.supportPhone || '');
          }
          if (s.key === 'platform.billing' && s.value) setSellerValue(s.value as Record<string, string>);
          if (s.key === 'platform.defaults' && s.value) {
            setTrialDurationDays(s.value.trialDurationDays ?? 14);
            setMaxTrialBranches(s.value.maxTrialBranches ?? 1);
            setMaxTrialDevices(s.value.maxTrialDevices ?? 5);
          }
          if (s.key === 'platform.maintenance' && s.value) {
            setMaintenanceMode(Boolean(s.value.maintenanceMode));
            setStatusBanner(s.value.statusBanner || '');
            setStartsAt(isoToLocalInput(s.value.startsAt));
            setEndsAt(isoToLocalInput(s.value.endsAt));
            setSavedMaintenance({
              on: Boolean(s.value.maintenanceMode),
              banner: s.value.statusBanner || '',
              startsAt: isoToLocalInput(s.value.startsAt),
              endsAt: isoToLocalInput(s.value.endsAt)
            });
          }
        }
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load platform settings'))
      .finally(() => setLoading(false));
  }

  function loadMaintenanceHistory() {
    // The audit API filters by action (substring match) but not by details.key, so this fetches
    // every settings-update event and narrows to maintenance ones client-side.
    api
      .get<{ rows: AuditLogRow[] }>('/api/v1/audit-logs?action=PLATFORM_SETTING_UPDATED&category=SETTINGS&limit=50')
      .then((res) => {
        const rows = res.rows.filter((r) => (r.details as { key?: string } | null)?.key === 'platform.maintenance');
        setMaintenanceHistory(rows.slice(0, 5));
      })
      .catch(() => setMaintenanceHistory([]));
  }

  useEffect(() => {
    loadSettings();
    loadMaintenanceHistory();
    // Cheap: the device list's own healthCounts aggregate is computed platform-wide regardless
    // of page size, so asking for one row still returns the real total.
    api.get<{ extra?: { healthCounts?: Record<string, number> } }>('/api/v1/devices?pageSize=1')
      .then((res) => {
        const h = res.extra?.healthCounts ?? {};
        const online = h.online ?? 0;
        const degraded = h.degraded ?? 0;
        const offline = (h.offline ?? 0) + (h.never_seen ?? 0);
        setFleetReach({ online, degraded, offline, total: online + degraded + offline + (h.revoked ?? 0) });
      })
      .catch(() => setFleetReach(null));
  }, []);

  /** Renders one audit entry's old→new maintenance value as a short human sentence. */
  function describeMaintenanceChange(details: Record<string, unknown> | null): string {
    const newValue = (details?.newValue ?? {}) as { maintenanceMode?: boolean; statusBanner?: string };
    const oldValue = (details?.oldValue ?? {}) as { maintenanceMode?: boolean };
    const turnedOn = Boolean(newValue.maintenanceMode);
    const wasOn = Boolean(oldValue?.maintenanceMode);
    if (turnedOn && !wasOn) return `Turned ON${newValue.statusBanner ? ` — "${newValue.statusBanner}"` : ' (default message)'}`;
    if (!turnedOn && wasOn) return 'Turned OFF';
    if (turnedOn && wasOn) return `Updated while ON${newValue.statusBanner ? ` — "${newValue.statusBanner}"` : ''}`;
    return 'Saved while OFF (no change visible to restaurants)';
  }

  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    setFormErrors((f) => ({ ...f, branding: undefined }));
    setSaving(true);
    try {
      await api.patch('/api/v1/platform/settings/platform.branding', {
        value: { platformName, companyName, supportEmail, supportPhone }
      });
      setSuccessToast('Platform branding updated');
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err) {
      setFormErrors((f) => ({ ...f, branding: err instanceof ApiError ? err.message : 'Failed to save branding settings' }));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDefaults(e: React.FormEvent) {
    e.preventDefault();
    setFormErrors((f) => ({ ...f, defaults: undefined }));
    setSaving(true);
    try {
      await api.patch('/api/v1/platform/settings/platform.defaults', {
        value: {
          trialDurationDays: Number(trialDurationDays),
          maxTrialBranches: Number(maxTrialBranches),
          maxTrialDevices: Number(maxTrialDevices),
          defaultCurrency: 'INR'
        }
      });
      setSuccessToast('Onboarding default quotas updated');
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err) {
      setFormErrors((f) => ({ ...f, defaults: err instanceof ApiError ? err.message : 'Failed to save default settings' }));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMaintenance(e: React.FormEvent) {
    e.preventDefault();
    setFormErrors((f) => ({ ...f, maintenance: undefined }));
    setSaving(true);
    try {
      await api.patch('/api/v1/platform/settings/platform.maintenance', {
        value: { maintenanceMode, statusBanner, startsAt: localInputToIso(startsAt), endsAt: localInputToIso(endsAt) }
      });
      setSavedMaintenance({ on: maintenanceMode, banner: statusBanner, startsAt, endsAt });
      loadMaintenanceHistory();
      setSuccessToast(
        maintenanceMode
          ? 'Maintenance notice saved and live: restaurant apps will show it within a minute.'
          : 'Maintenance notice switched off.'
      );
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err) {
      setFormErrors((f) => ({ ...f, maintenance: err instanceof ApiError ? err.message : 'Failed to save maintenance settings' }));
    } finally {
      setSaving(false);
    }
  }

  const maintenanceDirty =
    savedMaintenance !== null &&
    (savedMaintenance.on !== maintenanceMode ||
      savedMaintenance.banner !== statusBanner ||
      savedMaintenance.startsAt !== startsAt ||
      savedMaintenance.endsAt !== endsAt);

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

      {error && <div className="page-error">{error}</div>}
      {successToast && <div className="page-success">{successToast}</div>}

      {loading ? (
        <div className="page-loading">Loading platform configuration…</div>
      ) : (
        <div className="settings-grid">
          <KioskWelcomeDesignsCard />
          {/* Platform Branding */}
          <Card className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="settings-card-title">Platform Branding</h3>
                <p className="settings-card-desc">The support email and phone appear on every invoice and at the foot of every email the platform sends.</p>
              </div>
            </div>
            <form onSubmit={handleSaveBranding} className="settings-form">
              <div className="form-field">
                <label>Platform Name *</label>
                <Input value={platformName} onChange={(e) => setPlatformName(e.target.value)} required />
              </div>
              <div className="form-field">
                <label>Parent Company *</label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Support Email *</label>
                  <Input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} required />
                </div>
                <div className="form-field">
                  <label>Support Phone</label>
                  <Input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} />
                </div>
              </div>
              {formErrors.branding && <div className="form-error">{formErrors.branding}</div>}
              <div style={{ marginTop: '0.5rem' }}>
                <Button type="submit" variant="accent" disabled={saving || loading}>
                  <Save className="w-4 h-4" />
                  <span>Save Branding</span>
                </Button>
              </div>
            </form>
          </Card>

          <InvoiceSellerCard
            className="settings-card-wide"
            value={sellerValue}
            onSaved={(message) => {
              setSuccessToast(message);
              setTimeout(() => setSuccessToast(null), 4000);
              loadSettings();
            }}
          />

          {/* Onboarding Defaults */}
          <Card className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="settings-card-title">Onboarding Default Quotas</h3>
                <p className="settings-card-desc">Default allocation when new restaurants are provisioned</p>
              </div>
            </div>
            <form onSubmit={handleSaveDefaults} className="settings-form">
              <div className="form-field">
                <label>Default Trial Duration (Days) *</label>
                <Input
                  type="number"
                  value={trialDurationDays}
                  onChange={(e) => setTrialDurationDays(Number(e.target.value))}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Max Outlets per Trial *</label>
                  <Input
                    type="number"
                    value={maxTrialBranches}
                    onChange={(e) => setMaxTrialBranches(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Max Terminals per Trial *</label>
                  <Input
                    type="number"
                    value={maxTrialDevices}
                    onChange={(e) => setMaxTrialDevices(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              {formErrors.defaults && <div className="form-error">{formErrors.defaults}</div>}
              <div style={{ marginTop: '0.5rem' }}>
                <Button type="submit" variant="accent" disabled={saving || loading}>
                  <Save className="w-4 h-4" />
                  <span>Save Quotas</span>
                </Button>
              </div>
            </form>
          </Card>

          {/* Maintenance & Operational Status */}
          <Card className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="settings-card-title">Maintenance & Alerts</h3>
                <p className="settings-card-desc">Global platform announcements and maintenance broadcast</p>
              </div>
            </div>
            <form onSubmit={handleSaveMaintenance} className="settings-form">
              <div className={`maintenance-toggle-box ${maintenanceMode ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  id="maintenanceToggle"
                  className="maintenance-checkbox"
                  checked={maintenanceMode}
                  onChange={(e) => setMaintenanceMode(e.target.checked)}
                />
                <div className="maintenance-content">
                  <h4>Platform Maintenance Mode</h4>
                  <p>
                    When saved as ON, every restaurant app (Restaurant Admin, POS, KDS, Captain, Kiosk) shows this notice at the top of the screen. It never stops billing: terminals keep working offline without losing local data.
                  </p>
                </div>
              </div>

              <div className="form-field" style={{ marginTop: '0.5rem' }}>
                <label>Global Status Banner Message</label>
                <textarea
                  value={statusBanner}
                  onChange={(e) => setStatusBanner(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="e.g. Scheduled database optimization on Sunday 2:00 AM IST. All offline devices remain operational."
                />
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{statusBanner.length}/500. Leave empty to show a standard maintenance message.</div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>Starts at (optional)</label>
                  <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Ends at (optional)</label>
                  <Input type="datetime-local" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} />
                </div>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Without times the notice shows until you switch it off. With times it appears and disappears by itself.
              </div>

              <div
                role="status"
                style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: maintenanceDirty ? '#B45309' : savedMaintenance?.on ? '#047857' : 'inherit' }}
              >
                {maintenanceDirty
                  ? 'You have unsaved changes: restaurants still see the previous state until you press Save.'
                  : savedMaintenance?.on
                    ? 'Saved and active — each terminal picks it up on its own next check-in, not instantly.'
                    : 'Off: no notice is being shown to restaurants.'}
              </div>
              {savedMaintenance?.on && fleetReach && (
                <div className="muted" style={{ fontSize: 12 }}>
                  {fleetReach.online} of {fleetReach.total} terminals are online right now and will show this within a
                  minute. {fleetReach.offline > 0 && (
                    <>
                      {fleetReach.offline} offline terminal{fleetReach.offline === 1 ? '' : 's'} will only see it once they
                      reconnect — if a restaurant says "it's not showing up," check whether their terminal is actually
                      online before assuming a bug.
                    </>
                  )}
                </div>
              )}
              {formErrors.maintenance && <div className="form-error">{formErrors.maintenance}</div>}

              <div style={{ marginTop: '0.5rem' }}>
                <Button type="submit" variant="accent" disabled={saving || loading}>
                  <Save className="w-4 h-4" />
                  <span>Save notice</span>
                </Button>
              </div>
            </form>

            {maintenanceHistory.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--jv-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--jv-text-secondary)', marginBottom: 8 }}>
                  <History className="w-3.5 h-3.5" />
                  <span>Recent announcements</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {maintenanceHistory.map((entry) => (
                    <div key={entry.id} style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span>{describeMaintenanceChange(entry.details)}</span>
                      <span className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {new Date(entry.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
