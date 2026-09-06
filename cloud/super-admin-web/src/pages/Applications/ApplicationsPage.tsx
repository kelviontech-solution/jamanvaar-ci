import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { ApplicationSummary } from '../../api/types';
import { Button, Card, Badge, Modal, Input, EmptyState } from '../../components/ui';
import {
  Layers,
  Laptop2,
  Smartphone,
  ChefHat,
  Monitor,
  Download,
  Plus,
  Clock,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Tag
} from 'lucide-react';
import '../../components/shared.css';
import './applications.css';

export function ApplicationsPage() {
  const [apps, setApps] = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Publish release modal state
  const [publishModalApp, setPublishModalApp] = useState<ApplicationSummary | null>(null);
  const [newVersion, setNewVersion] = useState('');
  const [newChannel, setNewChannel] = useState<'STABLE' | 'BETA'>('STABLE');
  const [newPlatforms, setNewPlatforms] = useState<string[]>(['windows']);
  const [newReleaseNotes, setNewReleaseNotes] = useState('');
  const [newDownloadUrl, setNewDownloadUrl] = useState('');
  const [isMandatory, setIsMandatory] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  function loadApplications() {
    setLoading(true);
    api
      .get<ApplicationSummary[]>('/api/v1/applications')
      .then((data) => {
        setApps(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load applications'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadApplications();
  }, []);

  function getAppIcon(code: string) {
    switch (code) {
      case 'POS':
        return <Laptop2 className="w-5 h-5" />;
      case 'RESTAURANT_ADMIN':
        return <Monitor className="w-5 h-5" />;
      case 'CAPTAIN':
        return <Smartphone className="w-5 h-5" />;
      case 'KDS':
        return <ChefHat className="w-5 h-5" />;
      case 'KIOSK':
      case 'KIOSK_ADMIN':
        return <Layers className="w-5 h-5" />;
      default:
        return <Layers className="w-5 h-5" />;
    }
  }

  function openPublishModal(app: ApplicationSummary) {
    setPublishModalApp(app);
    // suggest next version (e.g. 2.4.0 -> 2.4.1)
    const parts = app.currentVersion.split('.');
    if (parts.length === 3 && !isNaN(Number(parts[2]))) {
      setNewVersion(`${parts[0]}.${parts[1]}.${Number(parts[2]) + 1}`);
    } else {
      setNewVersion(app.currentVersion);
    }
    setNewPlatforms(app.supportedPlatforms || ['web']);
    setNewReleaseNotes('');
    setNewDownloadUrl(app.downloadUrl || '');
    setIsMandatory(false);
    setPublishError(null);
  }

  async function handlePublishRelease(e: React.FormEvent) {
    e.preventDefault();
    if (!publishModalApp) return;

    setPublishing(true);
    setPublishError(null);
    try {
      await api.post('/api/v1/applications/releases', {
        appCode: publishModalApp.code,
        version: newVersion.trim(),
        channel: newChannel,
        supportedPlatforms: newPlatforms,
        releaseNotes: newReleaseNotes.trim() || undefined,
        downloadUrl: newDownloadUrl.trim() || undefined,
        isMandatory
      });
      setPublishModalApp(null);
      loadApplications();
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : 'Failed to publish application release');
    } finally {
      setPublishing(false);
    }
  }

  function togglePlatform(platform: string) {
    setNewPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  }

  const totalFleetDevices = apps.reduce((sum, a) => sum + a.totalDevices, 0);
  const totalOnlineDevices = apps.reduce((sum, a) => sum + a.onlineDevices, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Applications & Ecosystem</h1>
          <p className="page-subtitle">
            Central software release registry and client application distribution across POS, Restaurant Admin, Captain, KDS, and Kiosk.
          </p>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="stat-grid">
        <Card className="stat-tile">
          <div className="stat-value">{apps.length}</div>
          <div className="stat-label">Client Applications</div>
        </Card>
        <Card className="stat-tile">
          <div className="stat-value">{totalFleetDevices}</div>
          <div className="stat-label">Registered Terminals</div>
        </Card>
        <Card className="stat-tile">
          <div className="stat-value">{totalOnlineDevices}</div>
          <div className="stat-label">Active / Online Terminals</div>
        </Card>
        <Card className="stat-tile">
          <div className="stat-value">100%</div>
          <div className="stat-label">Offline-First Operational Parity</div>
        </Card>
      </div>

      {loading ? (
        <div className="page-loading">Loading application catalog…</div>
      ) : (
        <div className="apps-grid">
          {apps.map((app) => {
            const isHistoryOpen = Boolean(expandedHistory[app.code]);
            return (
              <div className="app-card" key={app.code}>
                <div className="app-card-header">
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <div className="app-icon-box">{getAppIcon(app.code)}</div>
                    <div>
                      <div className="app-card-title">{app.name}</div>
                      <div className="app-card-category">{app.category}</div>
                    </div>
                  </div>
                  <Badge tone={app.channel === 'STABLE' ? 'success' : 'accent'}>
                    v{app.currentVersion}
                  </Badge>
                </div>

                <p className="app-card-desc">{app.description}</p>

                <div className="app-specs-grid">
                  <div className="app-spec-item">
                    <span className="app-spec-label">Fleet Terminals</span>
                    <span className="app-spec-value">
                      {app.activeDevices} Active ({app.onlineDevices} Online)
                    </span>
                  </div>
                  <div className="app-spec-item">
                    <span className="app-spec-label">Release Channel</span>
                    <span className="app-spec-value">{app.channel}</span>
                  </div>
                </div>

                <div className="app-platforms-row">
                  {app.supportedPlatforms.map((p) => (
                    <span className="platform-pill" key={p}>
                      {p.toUpperCase()}
                    </span>
                  ))}
                  {app.defaultPort && (
                    <span className="platform-pill" style={{ color: 'var(--jv-accent)' }}>
                      PORT {app.defaultPort}
                    </span>
                  )}
                </div>

                <div className="app-card-actions">
                  <Button size="sm" variant="accent" onClick={() => openPublishModal(app)}>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Publish Version</span>
                  </Button>

                  {app.downloadUrl && (
                    <a
                      href={app.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download / Open</span>
                    </a>
                  )}

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 'auto', padding: '0.4rem' }}
                    onClick={() =>
                      setExpandedHistory((prev) => ({ ...prev, [app.code]: !prev[app.code] }))
                    }
                    title="Toggle Release History"
                  >
                    {isHistoryOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {isHistoryOpen && (
                  <div className="release-history-box">
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                      Recent Releases ({app.recentReleases.length})
                    </div>
                    {app.recentReleases.length === 0 ? (
                      <div style={{ color: 'var(--jv-text-muted)' }}>No previous releases recorded.</div>
                    ) : (
                      app.recentReleases.map((rel) => (
                        <div className="release-history-item" key={rel.id}>
                          <span>
                            <strong>v{rel.version}</strong> ({rel.channel})
                          </span>
                          <span>{new Date(rel.releasedAt).toLocaleDateString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Publish Release Modal ── */}
      {publishModalApp && (
        <Modal
          title={`Publish Release — ${publishModalApp.name}`}
          onClose={() => setPublishModalApp(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPublishModalApp(null)} disabled={publishing}>
                Cancel
              </Button>
              <Button variant="accent" onClick={handlePublishRelease} disabled={publishing}>
                {publishing ? 'Publishing…' : 'Publish Release'}
              </Button>
            </>
          }
        >
          <form onSubmit={handlePublishRelease} className="modal-form">
            {publishError && <div className="page-error">{publishError}</div>}

            <div className="form-row">
              <div className="form-field">
                <label>Version Number *</label>
                <Input
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  placeholder="e.g. 2.4.1"
                  required
                />
              </div>
              <div className="form-field">
                <label>Release Channel</label>
                <select
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value as 'STABLE' | 'BETA')}
                  className="input-select"
                >
                  <option value="STABLE">STABLE (Production)</option>
                  <option value="BETA">BETA (Preview)</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <label>Target Platforms</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {['windows', 'electron', 'android', 'web'].map((p) => {
                  const selected = newPlatforms.includes(p);
                  return (
                    <button
                      type="button"
                      key={p}
                      className={`btn btn-sm ${selected ? 'btn-accent' : 'btn-ghost'}`}
                      onClick={() => togglePlatform(p)}
                    >
                      {p.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-field">
              <label>Binary / Setup Download URL</label>
              <Input
                value={newDownloadUrl}
                onChange={(e) => setNewDownloadUrl(e.target.value)}
                placeholder="/releases/jamanvaar-pos-setup-2.4.1.exe or https://..."
              />
            </div>

            <div className="form-field">
              <label>Changelog & Release Notes</label>
              <textarea
                value={newReleaseNotes}
                onChange={(e) => setNewReleaseNotes(e.target.value)}
                rows={3}
                className="input-textarea"
                placeholder="Key features, bug fixes, thermal printer driver updates..."
              />
            </div>

            <div className="form-field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="isMandatory"
                checked={isMandatory}
                onChange={(e) => setIsMandatory(e.target.checked)}
              />
              <label htmlFor="isMandatory" style={{ margin: 0, cursor: 'pointer' }}>
                Mandatory Update (terminals must update before starting shift)
              </label>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
