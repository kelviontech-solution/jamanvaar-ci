import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformSetting, AuditLogRow } from '../../api/types';
import { Card, Button, Input } from '../../components/ui';
import { Wrench, Save, History } from 'lucide-react';

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

/** Extracted from PlatformSettingsPage.tsx's Communications tab. */
export function MaintenanceModeCard({ settings, saving, setSaving, onSaved }: {
  settings: PlatformSetting[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: (message: string) => void;
}) {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  /** What is actually saved (and therefore live for restaurants), as opposed to what the form shows. */
  const [savedMaintenance, setSavedMaintenance] = useState<{ on: boolean; banner: string; startsAt: string; endsAt: string } | null>(null);
  // A saved maintenance notice only reaches a terminal on its own next heartbeat -- with no
  // visibility into that, "I turned it on and nothing shows up" is indistinguishable from a real
  // bug when the real reason is just that a given terminal has been offline for hours or days
  // (confirmed live: several restaurants' own notification panel already shows exactly that).
  const [fleetReach, setFleetReach] = useState<{ online: number; degraded: number; offline: number; total: number } | null>(null);
  // Every maintenance save is already written to the generic Audit Log by platform-settings.service.ts
  // (action PLATFORM_SETTING_UPDATED, details.key 'platform.maintenance') -- this just surfaces it here
  // instead of sending the admin to the separate Audit Logs page to find their own past announcements.
  const [maintenanceHistory, setMaintenanceHistory] = useState<AuditLogRow[]>([]);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const s = settings.find((x) => x.key === 'platform.maintenance');
    if (s?.value) {
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
  }, [settings]);

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSaving(true);
    try {
      await api.patch('/api/v1/platform/settings/platform.maintenance', {
        value: { maintenanceMode, statusBanner, startsAt: localInputToIso(startsAt), endsAt: localInputToIso(endsAt) }
      });
      setSavedMaintenance({ on: maintenanceMode, banner: statusBanner, startsAt, endsAt });
      loadMaintenanceHistory();
      onSaved(
        maintenanceMode
          ? 'Maintenance notice saved and live: restaurant apps will show it within a minute.'
          : 'Maintenance notice switched off.'
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save maintenance settings');
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
      <form onSubmit={handleSave} className="settings-form">
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
        {error && <div className="form-error">{error}</div>}

        <div style={{ marginTop: '0.5rem' }}>
          <Button type="submit" variant="accent" disabled={saving}>
            <Save className="w-4 h-4" />
            <span>Save notice</span>
          </Button>
        </div>
      </form>

      {maintenanceHistory.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--jv-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--jv-text-secondary)', marginBottom: 8 }}>
            <History className="w-3.5 h-3.5" />
            <span>Recent maintenance saves</span>
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
  );
}
