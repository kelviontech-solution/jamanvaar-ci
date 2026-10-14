import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformSetting } from '../../api/types';
import { Card, Button, Input } from '../../components/ui';
import { Sliders, Save } from 'lucide-react';

/** Extracted from PlatformSettingsPage.tsx's General tab. */
export function OnboardingDefaultsCard({ settings, saving, setSaving, onSaved }: {
  settings: PlatformSetting[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: (message: string) => void;
}) {
  const [trialDurationDays, setTrialDurationDays] = useState(14);
  const [maxTrialBranches, setMaxTrialBranches] = useState(1);
  const [maxTrialDevices, setMaxTrialDevices] = useState(5);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const s = settings.find((x) => x.key === 'platform.defaults');
    if (s?.value) {
      setTrialDurationDays(s.value.trialDurationDays ?? 14);
      setMaxTrialBranches(s.value.maxTrialBranches ?? 1);
      setMaxTrialDevices(s.value.maxTrialDevices ?? 5);
    }
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
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
      onSaved('Onboarding default quotas updated');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save default settings');
    } finally {
      setSaving(false);
    }
  }

  return (
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
      <form onSubmit={handleSave} className="settings-form">
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
        {error && <div className="form-error">{error}</div>}
        <div style={{ marginTop: '0.5rem' }}>
          <Button type="submit" variant="accent" disabled={saving}>
            <Save className="w-4 h-4" />
            <span>Save Quotas</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}
