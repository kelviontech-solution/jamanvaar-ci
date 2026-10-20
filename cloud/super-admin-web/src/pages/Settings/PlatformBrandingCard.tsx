import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformSetting } from '../../api/types';
import { Card, Button, Input } from '../../components/ui';
import { Building2, Save } from 'lucide-react';

/** Extracted from PlatformSettingsPage.tsx's General tab. */
export function PlatformBrandingCard({ settings, saving, setSaving, onSaved, onDirtyChange }: {
  settings: PlatformSetting[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: (message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [platformName, setPlatformName] = useState('JAMANVAAR SaaS Control Plane');
  const [companyName, setCompanyName] = useState('Kelviontech');
  const [supportEmail, setSupportEmail] = useState('kelviontech@gmail.com');
  const [supportPhone, setSupportPhone] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState({ platformName: '', companyName: '', supportEmail: '', supportPhone: '' });

  useEffect(() => {
    const s = settings.find((x) => x.key === 'platform.branding');
    if (s?.value) {
      const v = {
        platformName: s.value.platformName || '',
        companyName: s.value.companyName || '',
        supportEmail: s.value.supportEmail || '',
        supportPhone: s.value.supportPhone || ''
      };
      setPlatformName(v.platformName);
      setCompanyName(v.companyName);
      setSupportEmail(v.supportEmail);
      setSupportPhone(v.supportPhone);
      setSaved(v);
    }
  }, [settings]);

  // Switching settings tabs used to unmount this card and silently drop an in-progress edit —
  // no dialog, no warning. The parent now asks before switching away while this reports dirty.
  useEffect(() => {
    const dirty = platformName !== saved.platformName || companyName !== saved.companyName || supportEmail !== saved.supportEmail || supportPhone !== saved.supportPhone;
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformName, companyName, supportEmail, supportPhone, saved]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSaving(true);
    try {
      await api.patch('/api/v1/platform/settings/platform.branding', {
        value: { platformName, companyName, supportEmail, supportPhone }
      });
      setSaved({ platformName, companyName, supportEmail, supportPhone });
      onSaved('Platform branding updated');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save branding settings');
    } finally {
      setSaving(false);
    }
  }

  return (
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
      <form onSubmit={handleSave} className="settings-form">
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
        {error && <div className="form-error">{error}</div>}
        <div style={{ marginTop: '0.5rem' }}>
          <Button type="submit" variant="accent" disabled={saving}>
            <Save className="w-4 h-4" />
            <span>Save Branding</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}
