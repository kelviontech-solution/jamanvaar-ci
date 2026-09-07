import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformSetting } from '../../api/types';
import { Card, Button, Input, Badge } from '../../components/ui';
import { Sliders, Save, ShieldCheck, Wrench, Building2, Bell, AlertTriangle } from 'lucide-react';
import '../../components/shared.css';
import './settings.css';

export function PlatformSettingsPage() {
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Form states
  const [platformName, setPlatformName] = useState('JAMANVAAR SaaS Control Plane');
  const [companyName, setCompanyName] = useState('Kelviontech');
  const [supportEmail, setSupportEmail] = useState('support@jamanvaar.app');
  const [supportPhone, setSupportPhone] = useState('+91 98765 43210');

  const [trialDurationDays, setTrialDurationDays] = useState(14);
  const [maxTrialBranches, setMaxTrialBranches] = useState(1);
  const [maxTrialDevices, setMaxTrialDevices] = useState(5);

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');

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
          if (s.key === 'platform.defaults' && s.value) {
            setTrialDurationDays(s.value.trialDurationDays ?? 14);
            setMaxTrialBranches(s.value.maxTrialBranches ?? 1);
            setMaxTrialDevices(s.value.maxTrialDevices ?? 5);
          }
          if (s.key === 'platform.maintenance' && s.value) {
            setMaintenanceMode(Boolean(s.value.maintenanceMode));
            setStatusBanner(s.value.statusBanner || '');
          }
        }
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load platform settings'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/api/v1/platform/settings/platform.branding', {
        value: { platformName, companyName, supportEmail, supportPhone }
      });
      setSuccessToast('Platform branding updated');
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save branding settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDefaults(e: React.FormEvent) {
    e.preventDefault();
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
      setError(err instanceof ApiError ? err.message : 'Failed to save default settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMaintenance(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/api/v1/platform/settings/platform.maintenance', {
        value: { maintenanceMode, statusBanner }
      });
      setSuccessToast('Maintenance settings updated');
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save maintenance settings');
    } finally {
      setSaving(false);
    }
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

      {error && <div className="page-error">{error}</div>}
      {successToast && <div className="page-success">{successToast}</div>}

      {loading ? (
        <div className="page-loading">Loading platform configuration…</div>
      ) : (
        <div className="settings-grid">
          {/* Platform Branding */}
          <Card className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="settings-card-title">Platform Branding</h3>
                <p className="settings-card-desc">Global platform identity displayed across tenant consoles</p>
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
              <div style={{ marginTop: '0.5rem' }}>
                <Button type="submit" variant="accent" disabled={saving || loading}>
                  <Save className="w-4 h-4" />
                  <span>Save Branding</span>
                </Button>
              </div>
            </form>
          </Card>

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
                    When enabled, tenant admins see a maintenance notice in their portals. Offline POS terminals continue operating uninterrupted without loss of local data.
                  </p>
                </div>
              </div>

              <div className="form-field" style={{ marginTop: '0.5rem' }}>
                <label>Global Status Banner Message</label>
                <textarea
                  value={statusBanner}
                  onChange={(e) => setStatusBanner(e.target.value)}
                  rows={3}
                  placeholder="e.g. Scheduled database optimization on Sunday 2:00 AM IST. All offline devices remain operational."
                />
              </div>

              <div style={{ marginTop: '0.5rem' }}>
                <Button type="submit" variant="accent" disabled={saving || loading}>
                  <Save className="w-4 h-4" />
                  <span>Save Status</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
