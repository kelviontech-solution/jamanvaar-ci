import { useEffect, useState } from 'react';
type Pickup = {
  wait?: {message:string};
  updatedAt: string;
  orders: { token: string; status: 'PREPARING' | 'READY' | 'COLLECTED'; updatedAt: string }[];
};
export function PickupDisplay() {
  const [data, setData] = useState<Pickup>(),
    [error, setError] = useState('');
  const token = new URLSearchParams(location.search).get('pickup') ?? '';
  useEffect(() => {
    let active = true;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_CLOUD_API_BASE_URL ?? ''}/api/v1/pickup-display/${encodeURIComponent(token)}`,
          { cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) },
        );
        if (res.status === 404 && active) setData(undefined);
        if (!res.ok)
          throw new Error(
            res.status === 404
              ? 'This display link has expired. Ask a manager for a new link.'
              : 'Could not refresh. Please check the connection.',
          );
        const next = (await res.json()) as Pickup;
        if (active) {
          setData(next);
          setError('');
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not refresh.');
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);
  return (
    <main
      className="pickup-screen"
      style={{
        minHeight: '100dvh',
        padding: 'clamp(16px,3vw,60px)',
        background: '#0b253a',
        color: 'white',
        fontFamily: 'system-ui',
      }}
    >
      <style>{`.pickup-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}.pickup-token{font-size:clamp(26px,4vw,72px);padding:18px;border-radius:16px;background:#ffffff15;margin:16px 0;text-align:center;overflow-wrap:anywhere}.pickup-ready{color:#9af1c8}.pickup-screen h1{font-size:clamp(28px,4vw,58px);margin-bottom:32px}.pickup-screen h2{font-size:clamp(20px,2vw,34px)}@media(max-width:650px){.pickup-columns{grid-template-columns:1fr}}`}</style>
      <h1>Your order</h1>
      {data?.wait && <p>Approximate kitchen wait: {data.wait.message}</p>}
      {error && (
        <p role="alert">
          {error}
          {data ? ' · Showing the last received status; updates may be delayed.' : ''}
        </p>
      )}
      <div className="pickup-columns">
        {(['PREPARING', 'READY', 'COLLECTED'] as const).map((status) => (
          <section key={status} className={status === 'READY' ? 'pickup-ready' : ''}>
            <h2>
              {status === 'PREPARING' ? 'Preparing' : status === 'READY' ? 'Ready to collect' : 'Collected'}
            </h2>
            {data?.orders
              .filter((o) => o.status === status)
              .map((o) => (
                <div className="pickup-token" key={o.token}>
                  {o.token}
                </div>
              ))}
          </section>
        ))}
      </div>
      {data && <p>Updated {new Date(data.updatedAt).toLocaleTimeString()}</p>}
    </main>
  );
}
