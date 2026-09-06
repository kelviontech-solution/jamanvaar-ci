import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformSetting } from '../../api/types';
import { Card, Button, Input, Badge } from '../../components/ui';
import { Sliders, Save, ShieldCheck, Wrench, Building2, Bell, AlertTriangle } from 'lucide-react';
import '../../components/shared.css';

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
          {/* Platform Branding */}
          <Card>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
              <Building2 className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Platform Branding</h3>
            </div>
            <form onSubmit={handleSaveBranding} className="modal-form">
              <div className="form-field">
                <label>Platform Name</label>
                <Input value={platformName} onChange={(e) => setPlatformName(e.target.value)} required />
              </div>
              <div className="form-field">
                <label>Parent Company</label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Support Email</label>
                  <Input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} required />
                </div>
                <div className="form-field">
                  <label>Support Phone</label>
                  <Input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <Button type="submit" variant="accent" disabled={saving || loading}>
                  <Save className="w-4 h-4" />
                  <span>Save Branding</span>
                </Button>
              </div>
            </form>
          </Card>

          {/* Onboarding Defaults */}
          <Card>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
              <Sliders className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Onboarding Default Quotas</h3>
            </div>
            <form onSubmit={handleSaveDefaults} className="modal-form">
              <div className="form-field">
                <label>Default Trial Duration (Days)</label>
                <Input
                  type="number"
                  value={trialDurationDays}
                  onChange={(e) => setTrialDurationDays(Number(e.target.value))}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Max Outlets per Trial</label>
                  <Input
                    type="number"
                    value={maxTrialBranches}
                    onChange={(e) => setMaxTrialBranches(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Max Terminals per Trial</label>
                  <Input
                    type="number"
                    value={maxTrialDevices}
                    onChange={(e) => setMaxTrialDevices(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <Button type="submit" variant="accent" disabled={saving || loading}>
                  <Save className="w-4 h-4" />
                  <span>Save Quotas</span>
                </Button>
              </div>
            </form>
          </Card>

          {/* Maintenance & Operational Status */}
          <Card>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
              <Wrench className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Maintenance & Alerts</h3>
            </div>
            <form onSubmit={handleSaveMaintenance} className="modal-form">
              <div className="form-field" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px' }}>
                <input
                  type="checkbox"
                  id="maintenanceToggle"
                  checked={maintenanceMode}
                  onChange={(e) => setMaintenanceMode(e.target.checked)}
                />
                <div>
                  <label htmlFor="maintenanceToggle" style={{ margin: 0, fontWeight: 600, cursor: 'pointer' }}>
                    Platform Maintenance Mode
                  </label>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    When active, tenant admins see a maintenance notice; offline local POS terminals continue operating uninterrupted.
                  </div>
                </div>
              </div>

              <div className="form-field" style={{ marginTop: '1rem' }}>
                <label>Global Status Banner Message</label>
                <textarea
                  value={statusBanner}
                  onChange={(e) => setStatusBanner(e.target.value)}
                  rows={3}
                  className="input-textarea"
                  placeholder="e.g. Scheduled database optimization on Sunday 2:00 AM IST..."
                />
              </div>

              <div style={{ marginTop: '1rem' }}>
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
