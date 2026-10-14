import { useState } from 'react';
import { api } from '../../api/client';
import type { ApplicationSummary } from '../../api/types';
import { Button, Card } from '../../components/ui';

const pages = [
  { name: 'Restaurant Admin', path: '/restaurant-admin/', title: /restaurant|admin/i },
  { name: 'Kiosk Admin', path: '/kiosk-admin/', title: /admin/i },
  { name: 'POS', path: '/pos/', title: /POS/i },
  { name: 'Kiosk', path: '/kiosk/', title: /kiosk/i },
  { name: 'Captain', path: '/captain/', title: /captain/i },
  { name: 'KDS', path: '/kds/', title: /KDS|kitchen/i },
  { name: 'QR product', path: '/qr/', title: /QR/i },
  { name: 'Platform nested route', path: `${import.meta.env.VITE_ROUTER_BASENAME || ''}/settings/platform`, title: /platform/i }
];
/** Deployment reads use the current origin; no configurable URL can become an SSRF probe. */
export async function inspectFrontendEntry(url: string, expectedTitle: RegExp, request: typeof fetch = fetch) {
  const response = await request(url, { signal: AbortSignal.timeout(8000), cache: 'no-cache' });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw Error('Application entry did not return HTML');
  const document = new DOMParser().parseFromString(await response.text(), 'text/html');
  if (!expectedTitle.test(document.title)) throw Error('This path returned a different application');
  const base = new URL(document.querySelector('base')?.getAttribute('href') || '.', url);
  const scripts = [...document.querySelectorAll('script[type="module"][src]')].map((node) => new URL(node.getAttribute('src')!, base));
  const styles = [...document.querySelectorAll('link[rel="stylesheet"][href]')]
    .map((node) => new URL(node.getAttribute('href')!, base))
    .filter((value) => value.origin === new URL(url).origin);
  if (!scripts.length) throw Error('No application script in the entry page');
  await Promise.all(
    [...scripts.slice(0, 2).map((value) => ({ value, type: /javascript/ })), ...styles.slice(0, 3).map((value) => ({ value, type: /text\/css/ }))].map(
      async ({ value, type }) => {
        if (value.origin !== new URL(url).origin) throw Error('Application script is outside this deployment');
        const asset = await request(value.href, { method: 'HEAD', signal: AbortSignal.timeout(8000), cache: 'no-cache' });
        if (!asset.ok || !type.test(asset.headers.get('content-type') || '')) throw Error('An application asset is missing or has the wrong content type');
      }
    )
  );
  return 'Entry and bundle reachable';
}

export function DeploymentHealthPanel() {
  const [rows, setRows] = useState<Array<{ name: string; result: string; ok: boolean }>>([]),
    [apps, setApps] = useState<ApplicationSummary[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function check() {
    setBusy(true);
    setError('');
    try {
      const [checks, releases] = await Promise.all([
        Promise.all(
          pages.map(async (page) => {
            try {
              return { name: page.name, result: await inspectFrontendEntry(new URL(page.path, location.origin).href, page.title), ok: true };
            } catch (error) {
              return { name: page.name, result: error instanceof Error ? error.message : 'Not verified', ok: false };
            }
          })
        ),
        api.get<ApplicationSummary[]>('/api/v1/applications').catch(() => null)
      ]);
      setRows(checks);
      setApps(releases || []);
      if (!releases) setError('Release metadata could not be verified. Open Applications and check access/connectivity.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2 className="text-lg font-bold">Frontend and release readiness</h2>
      <p className="muted">
        API/database liveness does not establish that application routes load or an installer is available. These checks inspect entries and bundles on this
        origin. Browser execution, external artifact download and signature verification remain release checks.
      </p>
      <Button onClick={() => void check()} disabled={busy}>
        {busy ? 'Checking deployment…' : 'Check frontend entries and releases'}
      </Button>
      {error && <p role="alert">{error}</p>}
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.name} className={row.ok ? 'text-emerald-700' : 'text-amber-700'}>
            <strong>{row.name}:</strong> {row.result}
          </li>
        ))}
      </ul>
      {apps.length > 0 && (
        <div className="table-scroll mt-4">
          <table className="table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Published release</th>
                <th>Installable platforms</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.code}>
                  <td>{app.name}</td>
                  <td>
                    {Object.keys(app.downloadUrls || {}).length ? `${app.currentVersion || 'Version not reported'} · ${app.channel}` : 'No published artifact'}
                  </td>
                  <td>{Object.keys(app.downloadUrls || {}).join(', ') || 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
