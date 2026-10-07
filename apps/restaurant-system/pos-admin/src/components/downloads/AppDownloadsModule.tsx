import React, { useEffect, useState } from 'react';
import { Download, Monitor, Smartphone, Globe, Package, Clock } from 'lucide-react';
import { fetchCloudApplications, type CloudAppCatalogEntry } from '../../cloud/cloudClient';

const PLATFORM_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  windows: Monitor,
  electron: Monitor,
  android: Smartphone,
  web: Globe
};

/**
 * One card per JAMANVAAR app, backed by the real release data Super Admin publishes
 * (ApplicationsPage's "Publish Version" flow) via GET /api/v1/tenant/applications.
 * `downloadUrl` is null until a release is actually published for that app — shown
 * here as a disabled "Not yet available" state, never a fake/placeholder link.
 */
export function AppDownloadsModule() {
  const [apps, setApps] = useState<CloudAppCatalogEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchCloudApplications()
      .then((data) => {
        if (!cancelled) setApps(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the app catalog. Check your connection and try again.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6" data-testid="app-downloads-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy">App Downloads</h1>
        <p className="text-slate-600 mt-1">
          Install JAMANVAAR's desktop and mobile apps directly on your devices — no browser needed, and you'll be
          notified here whenever a new version is published.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-amber-800">
          {error}
        </p>
      )}
      {!apps && !error && (
        <p role="status" className="text-slate-600">
          Loading app catalog…
        </p>
      )}

      {apps && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => {
            const hasRelease = Boolean(app.downloadUrl);
            return (
              <div
                key={app.code}
                className="rounded-2xl border border-jaman-border bg-white p-5 flex flex-col gap-3"
                data-testid={`app-download-card-${app.code}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-bold text-jaman-navy">{app.name}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{app.category}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                      hasRelease ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {app.currentVersion ? `v${app.currentVersion}` : 'Not released'}
                  </span>
                </div>

                <p className="text-sm text-slate-600 flex-1">{app.description}</p>

                <div className="flex items-center gap-2 flex-wrap">
                  {app.supportedPlatforms.map((p) => {
                    const Icon = PLATFORM_ICON[p] || Package;
                    return (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-jaman-cream rounded-full px-2.5 py-1"
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {p === 'electron' ? 'windows' : p}
                      </span>
                    );
                  })}
                </div>

                {hasRelease ? (
                  <a
                    href={app.downloadUrl!}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-jaman-navy text-white font-bold text-sm py-2.5 hover:bg-jaman-navy/90 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="This app hasn't had a version published yet"
                    className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 text-slate-400 font-bold text-sm py-2.5 cursor-not-allowed"
                  >
                    <Clock className="w-4 h-4" />
                    Not yet available
                  </button>
                )}

                {app.releaseNotes && hasRelease && (
                  <p className="text-xs text-slate-500 border-t border-jaman-border pt-2 mt-1 line-clamp-2">
                    {app.releaseNotes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
