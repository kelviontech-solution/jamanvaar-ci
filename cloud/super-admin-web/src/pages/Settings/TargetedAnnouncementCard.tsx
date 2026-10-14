import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformSetting, AuditLogRow } from '../../api/types';
import { Card, Button, Input } from '../../components/ui';
import { Megaphone, Save, History } from 'lucide-react';

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

/** The only three device types a targeted announcement can reach -- Captain and KDS are deliberately excluded. */
const ANNOUNCEMENT_TARGET_APPS: Array<{ value: string; label: string }> = [
  { value: 'POS', label: 'POS' },
  { value: 'KIOSK', label: 'Kiosk' },
  { value: 'POS_ADMIN', label: 'Restaurant Admin' }
];

function appLabel(code: string): string {
  return ANNOUNCEMENT_TARGET_APPS.find((a) => a.value === code)?.label ?? code;
}

/** Renders one audit entry's old→new announcement value as a short human sentence. */
function describeAnnouncementChange(details: Record<string, unknown> | null): string {
  const newValue = (details?.newValue ?? {}) as { enabled?: boolean; message?: string; targetApps?: string[] };
  const oldValue = (details?.oldValue ?? {}) as { enabled?: boolean };
  const turnedOn = Boolean(newValue.enabled);
  const wasOn = Boolean(oldValue?.enabled);
  const apps = (newValue.targetApps ?? []).map(appLabel).join(', ');
  if (turnedOn && !wasOn) return `Turned ON for ${apps || 'no apps'}${newValue.message ? ` — "${newValue.message}"` : ''}`;
  if (!turnedOn && wasOn) return 'Turned OFF';
  if (turnedOn && wasOn) return `Updated while ON (${apps})${newValue.message ? ` — "${newValue.message}"` : ''}`;
  return 'Saved while OFF (no change visible to restaurants)';
}

/** Extracted from PlatformSettingsPage.tsx's Communications tab. */
export function TargetedAnnouncementCard({ settings, saving, setSaving, onSaved }: {
  settings: PlatformSetting[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: (message: string) => void;
}) {
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementTargetApps, setAnnouncementTargetApps] = useState<string[]>(['POS', 'KIOSK', 'POS_ADMIN']);
  const [announcementStartsAt, setAnnouncementStartsAt] = useState('');
  const [announcementEndsAt, setAnnouncementEndsAt] = useState('');
  const [savedAnnouncement, setSavedAnnouncement] = useState<{ on: boolean; message: string; targetApps: string[]; startsAt: string; endsAt: string } | null>(null);
  const [announcementHistory, setAnnouncementHistory] = useState<AuditLogRow[]>([]);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const s = settings.find((x) => x.key === 'platform.announcement');
    if (s?.value) {
      const targetApps: string[] = Array.isArray(s.value.targetApps) && s.value.targetApps.length > 0
        ? s.value.targetApps
        : ['POS', 'KIOSK', 'POS_ADMIN'];
      setAnnouncementEnabled(Boolean(s.value.enabled));
      setAnnouncementMessage(s.value.message || '');
      setAnnouncementTargetApps(targetApps);
      setAnnouncementStartsAt(isoToLocalInput(s.value.startsAt));
      setAnnouncementEndsAt(isoToLocalInput(s.value.endsAt));
      setSavedAnnouncement({
        on: Boolean(s.value.enabled),
        message: s.value.message || '',
        targetApps,
        startsAt: isoToLocalInput(s.value.startsAt),
        endsAt: isoToLocalInput(s.value.endsAt)
      });
    }
  }, [settings]);

  function loadAnnouncementHistory() {
    api
      .get<{ rows: AuditLogRow[] }>('/api/v1/audit-logs?action=PLATFORM_SETTING_UPDATED&category=SETTINGS&limit=50')
      .then((res) => {
        const rows = res.rows.filter((r) => (r.details as { key?: string } | null)?.key === 'platform.announcement');
        setAnnouncementHistory(rows.slice(0, 5));
      })
      .catch(() => setAnnouncementHistory([]));
  }

  useEffect(() => {
    loadAnnouncementHistory();
  }, []);

  function toggleAnnouncementTargetApp(code: string) {
    setAnnouncementTargetApps((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (announcementEnabled && announcementTargetApps.length === 0) {
      setError('Select at least one app to show the announcement on.');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/api/v1/platform/settings/platform.announcement', {
        value: {
          enabled: announcementEnabled,
          message: announcementMessage,
          targetApps: announcementTargetApps,
          startsAt: localInputToIso(announcementStartsAt),
          endsAt: localInputToIso(announcementEndsAt)
        }
      });
      setSavedAnnouncement({ on: announcementEnabled, message: announcementMessage, targetApps: announcementTargetApps, startsAt: announcementStartsAt, endsAt: announcementEndsAt });
      loadAnnouncementHistory();
      onSaved(
        announcementEnabled
          ? 'Announcement saved and live on the apps you selected.'
          : 'Announcement switched off.'
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the announcement');
    } finally {
      setSaving(false);
    }
  }

  const announcementDirty =
    savedAnnouncement !== null &&
    (savedAnnouncement.on !== announcementEnabled ||
      savedAnnouncement.message !== announcementMessage ||
      savedAnnouncement.startsAt !== announcementStartsAt ||
      savedAnnouncement.endsAt !== announcementEndsAt ||
      savedAnnouncement.targetApps.length !== announcementTargetApps.length ||
      savedAnnouncement.targetApps.some((a) => !announcementTargetApps.includes(a)));

  return (
    <Card className="settings-card">
      <div className="settings-card-header">
        <div className="settings-card-icon">
          <Megaphone className="w-5 h-5" />
        </div>
        <div>
          <h3 className="settings-card-title">Targeted Announcement</h3>
          <p className="settings-card-desc">A lighter-weight notice, scoped to only the apps you pick below</p>
        </div>
      </div>
      <form onSubmit={handleSave} className="settings-form">
        <div className={`announcement-toggle-box ${announcementEnabled ? 'active' : ''}`}>
          <input
            type="checkbox"
            id="announcementToggle"
            className="announcement-checkbox"
            checked={announcementEnabled}
            onChange={(e) => setAnnouncementEnabled(e.target.checked)}
          />
          <div className="announcement-content">
            <h4>Publish an Announcement</h4>
            <p>
              Unlike Maintenance Mode above, this never reaches Captain or KDS — only the apps checked below. Use it
              for product news, promos, or anything that isn't "the platform is down."
            </p>
          </div>
        </div>

        <div className="form-field">
          <label>Shown on</label>
          <div className="announcement-target-apps">
            {ANNOUNCEMENT_TARGET_APPS.map((app) => (
              <label key={app.value} className={`announcement-target-app-chip ${announcementTargetApps.includes(app.value) ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={announcementTargetApps.includes(app.value)}
                  onChange={() => toggleAnnouncementTargetApp(app.value)}
                />
                <span>{app.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-field">
          <label>Announcement Message</label>
          <textarea
            value={announcementMessage}
            onChange={(e) => setAnnouncementMessage(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. New: online payments now support UPI AutoPay. See Settings > Payments to enable it."
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{announcementMessage.length}/500</div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>Starts at (optional)</label>
            <Input type="datetime-local" value={announcementStartsAt} onChange={(e) => setAnnouncementStartsAt(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Ends at (optional)</label>
            <Input type="datetime-local" value={announcementEndsAt} min={announcementStartsAt || undefined} onChange={(e) => setAnnouncementEndsAt(e.target.value)} />
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          Without times the announcement shows until you switch it off.
        </div>

        <div
          role="status"
          style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: announcementDirty ? '#B45309' : savedAnnouncement?.on ? '#1d4ed8' : 'inherit' }}
        >
          {announcementDirty
            ? 'You have unsaved changes: apps still see the previous state until you press Save.'
            : savedAnnouncement?.on
              ? `Saved and active on ${savedAnnouncement.targetApps.map(appLabel).join(', ') || 'no apps'}.`
              : 'Off: no announcement is being shown.'}
        </div>
        {error && <div className="form-error">{error}</div>}

        <div style={{ marginTop: '0.5rem' }}>
          <Button type="submit" variant="accent" disabled={saving}>
            <Save className="w-4 h-4" />
            <span>Save announcement</span>
          </Button>
        </div>
      </form>

      {announcementHistory.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--jv-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--jv-text-secondary)', marginBottom: 8 }}>
            <History className="w-3.5 h-3.5" />
            <span>Recent announcement saves</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {announcementHistory.map((entry) => (
              <div key={entry.id} style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span>{describeAnnouncementChange(entry.details)}</span>
                <span className="muted" style={{ whiteSpace: 'nowrap' }}>
                  {new Date(entry.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
