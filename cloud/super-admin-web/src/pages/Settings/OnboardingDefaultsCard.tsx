import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformSetting } from '../../api/types';
import { Card, Button, Input } from '../../components/ui';
import { Sliders, Save } from 'lucide-react';

/** Extracted from PlatformSettingsPage.tsx's General tab. */
export function OnboardingDefaultsCard({ settings, saving, setSaving, onSaved, onDirtyChange }: {
  settings: PlatformSetting[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: (message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [trialDurationDays, setTrialDurationDays] = useState(14);
  const [maxTrialBranches, setMaxTrialBranches] = useState(1);
  const [maxTrialDevices, setMaxTrialDevices] = useState(5);
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState({ trialDurationDays: 14, maxTrialBranches: 1, maxTrialDevices: 5 });

  useEffect(() => {
    const s = settings.find((x) => x.key === 'platform.defaults');
    if (s?.value) {
      const v = {
        trialDurationDays: s.value.trialDurationDays ?? 14,
        maxTrialBranches: s.value.maxTrialBranches ?? 1,
        maxTrialDevices: s.value.maxTrialDevices ?? 5
      };
      setTrialDurationDays(v.trialDurationDays);
      setMaxTrialBranches(v.maxTrialBranches);
      setMaxTrialDevices(v.maxTrialDevices);
      setSaved(v);
    }
  }, [settings]);

  // See PlatformBrandingCard's identical guard: switching tabs used to unmount this card and
  // silently drop an in-progress edit.
  useEffect(() => {
    const dirty = trialDurationDays !== saved.trialDurationDays || maxTrialBranches !== saved.maxTrialBranches || maxTrialDevices !== saved.maxTrialDevices;
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialDurationDays, maxTrialBranches, maxTrialDevices, saved]);

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
      setSaved({ trialDurationDays: Number(trialDurationDays), maxTrialBranches: Number(maxTrialBranches), maxTrialDevices: Number(maxTrialDevices) });
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
