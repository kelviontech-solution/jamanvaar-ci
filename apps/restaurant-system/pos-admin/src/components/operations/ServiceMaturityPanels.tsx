import { PrinterRecovery } from './PrinterRecovery';
import { useEffect, useState } from 'react';
import { ops, type Person } from './operationsClient';
type Issue = {
  id: string;
  reference: string;
  title: string;
  kind: string;
  steps?: string[];
  deviceId?: string;
  paymentId?: string;
  version?: number;
  assignedTo?: string;
  notes?: string;
};
type Inbox = { cases: Issue[]; limited: boolean };
const money = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v / 100);
function useResource<T>(branch: string, path: string) {
  const [data, setData] = useState<T>(),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void ops<T>(branch, path)
      .then((v) => {
        if (alive) {
          setData(v);
          setError('');
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [branch, path, tick]);
  return { data, error, refresh: () => setTick((t) => t + 1) };
}
export function ServiceMaturityPanels({ branch, task }: { branch: string; task: 'recovery' | 'exceptions' | 'brief' | 'costs' }) {
  const endpoint = { recovery: 'recovery', exceptions: 'payment-exceptions', brief: 'daily-brief', costs: 'historical-costs' }[task];
  const state = useResource<any>(branch, endpoint),
    people = useResource<Person[]>(branch, 'assignees'),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const selected = new URLSearchParams(location.search).get('record');
    if (selected && state.data) {
      const element = document.querySelector<HTMLElement>(`[data-ops-record="${CSS.escape(selected)}"]`);
      element?.scrollIntoView({ block: 'center' });
      element?.focus({ preventScroll: true });
    }
  }, [state.data]);
  async function action(run: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const result: any = await run();
      setNotice(result?.status ? `Current status: ${result.status}` : 'Request recorded. Check the original record for the result.');
      state.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not complete this action');
    } finally {
      setBusy(false);
    }
  }
  const open = (id: string, target = 'history') => {
    const url = new URL(location.href);
    url.searchParams.set('opsTask', target);
    url.searchParams.set(target === 'history' ? 'order' : 'record', id);
    history.replaceState(null, '', url);
    window.dispatchEvent(new CustomEvent('jamanvaar-ops-open-task', { detail: target }));
  };
  const title = { recovery: 'Guided problem recovery', exceptions: 'Payment exception inbox', brief: 'Your branch at a glance', costs: 'Costs frozen at sale' }[
    task
  ];
  return (
    <section className="ops-card">
      <div className="ops-actions">
        <h3>{title}</h3>
        <button onClick={state.refresh}>Refresh</button>
      </div>
      {state.error && <p role="alert">{state.error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!state.data ? (
        <p>Loading branch records…</p>
      ) : (
        <>
          {task === 'recovery' && (
            <>
              <PrinterRecovery />
              <p>Keep the original order, payment and print job references throughout recovery. A retry does not create a replacement sale.</p>
              {state.data.issues.length === 0 && <p>No issues currently detected.</p>}
              {state.data.issues.map((issue: Issue) => (
                <article data-ops-record={issue.id} tabIndex={-1} key={issue.id} className="ops-card">
                  <strong>{issue.title}</strong>
                  <p className="ops-reference">Reference: {issue.reference}</p>
                  <ol>
                    {issue.steps?.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <div className="ops-actions">
                    {issue.kind !== 'DEVICE' && <button onClick={() => open(issue.reference)}>Open original order</button>}
                    {issue.deviceId && (
                      <button
                        disabled={busy}
                        onClick={() => void action(() => ops(branch, `recovery/devices/${encodeURIComponent(issue.deviceId!)}/sync`, {}))}
                      >
                        Request device sync
                      </button>
                    )}
                    {issue.paymentId && (
                      <button
                        disabled={busy}
                        onClick={() => void action(() => ops(branch, `payment-exceptions/${encodeURIComponent(issue.paymentId!)}/check`, {}))}
                      >
                        Check original payment
                      </button>
                    )}
                    <button onClick={() => open(issue.reference, 'support')}>Support diagnostics</button>
                  </div>
                </article>
              ))}
            </>
          )}
          {task === 'exceptions' && (
            <>
              <p>
                These issues come from current payment and order records. They disappear when the underlying issue is resolved. Assigning a case does not mark
                money collected, fulfilled or refunded.
              </p>
              {state.data.limited && <p role="alert">Showing a bounded 90-day sample. Narrow review in the full payment ledger for older records.</p>}
              {(state.data as Inbox).cases.length === 0 && <p>No payment exceptions detected.</p>}
              {(state.data as Inbox).cases.map((issue) => (
                <article data-ops-record={issue.id} tabIndex={-1} className="ops-card" key={issue.id}>
                  <strong>{issue.title}</strong>
                  <p>
                    {issue.kind.replaceAll('_', ' ')} · {issue.reference}
                  </p>
                  <div className="ops-actions">
                    <button onClick={() => open(issue.reference)}>Open order & payment history</button>
                    {issue.paymentId && (
                      <button disabled={busy} onClick={() => void action(() => ops(branch, `payment-exceptions/${issue.paymentId}/check`, {}))}>
                        Check payment status
                      </button>
                    )}
                    {issue.kind === 'PAID_UNFULFILLED' && issue.paymentId && (
                      <button disabled={busy} onClick={() => void action(() => ops(branch, `payment-exceptions/${issue.paymentId}/recover`, {}))}>
                        Retry original kitchen delivery
                      </button>
                    )}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void action(() =>
                        ops(branch, 'payment-exceptions/assign', {
                          id: issue.id,
                          assignedTo: String(f.get('assignedTo')),
                          notes: String(f.get('notes')),
                          expectedVersion: issue.version ?? 0
                        })
                      );
                    }}
                  >
                    <label>
                      Responsible person
                      <select aria-label="Responsible person" name="assignedTo" defaultValue={issue.assignedTo ?? ''}>
                        <option value="">Unassigned</option>
                        {people.data?.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.fullName} · {p.role}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Follow-up note
                      <textarea name="notes" maxLength={2000} defaultValue={issue.notes ?? ''} />
                    </label>
                    <button disabled={busy} type="submit">
                      Save assignment
                    </button>
                  </form>
                </article>
              ))}
            </>
          )}
          {task === 'brief' && (
            <>
              <p>
                {state.data.branch.name} · {state.data.period} · Updated {new Date(state.data.generatedAt).toLocaleTimeString()}
              </p>
              <div className="ops-metrics">
                <article>
                  <strong>{money(state.data.collectionsPaise)}</strong>
                  <span>Confirmed collections</span>
                </article>
                <article>
                  <strong>{money(state.data.refundsPaise)}</strong>
                  <span>Recorded refunds</span>
                </article>
                <article>
                  <strong>{state.data.wait.message}</strong>
                  <span>Approximate kitchen wait · {state.data.wait.sampleCount} preparation samples</span>
                </article>
              </div>
              <h4>Outstanding bills</h4>
              {state.data.outstanding.length === 0 ? (
                <p>No outstanding bills.</p>
              ) : (
                state.data.outstanding.map((o: any) => (
                  <button key={o.externalOrderId} onClick={() => open(o.externalOrderId)}>
                    {o.label} · {money(o.totalAmount)} · Open bill
                  </button>
                ))
              )}
              <h4>Payments needing attention</h4>
              {state.data.exceptions.map((i: Issue) => (
                <button key={i.id} onClick={() => open(i.id, 'exceptions')}>
                  {i.title}
                </button>
              ))}
              <h4>Unresolved complaints</h4>
              {state.data.complaints.map((i: any) => (
                <button key={i.id} onClick={() => open(i.id, 'complaints')}>
                  {i.title}
                </button>
              ))}
              <h4>Stock shortages</h4>
              {state.data.shortages.length === 0 ? (
                <p>No shortages in the current branch stock records.</p>
              ) : (
                state.data.shortages.map((i: any) => <p key={i.id}>{i.name}</p>)
              )}
            </>
          )}
          {task === 'costs' && (
            <>
              <p>{state.data.scope}</p>
              <p>{state.data.excludes}</p>
              {state.data.limited && <p role="status">This report reached its record limit. Totals cover the displayed records only.</p>}
              {state.data.days.length === 0 ? (
                <p>No paid orders with cost history yet.</p>
              ) : (
                <div className="ops-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Sales before tax</th>
                        <th>Discounts</th>
                        <th>Estimated food cost</th>
                        <th>Recorded waste</th>
                        <th>Missing costs</th>
                        <th>Estimated food margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.data.days.map((d: any) => (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td>{money(d.netSalesPaise)}</td>
                          <td>{money(d.discountPaise)}</td>
                          <td>{money(d.estimatedFoodCostPaise)}</td>
                          <td>{money(d.wasteCostPaise)}</td>
                          <td>
                            {d.missingCostLines} order lines, {d.missingWasteCosts} waste records
                          </td>
                          <td>
                            {d.missingCostLines || d.missingWasteCosts
                              ? 'Incomplete costs'
                              : money(d.netSalesPaise - d.estimatedFoodCostPaise - d.wasteCostPaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {state.data.ingredientCosts?.length > 0 && (
                <>
                  <h4>Ingredient cost changes observed in sales</h4>
                  <p>Compare the first and latest recorded cost per stock unit. These snapshots do not include supplier changes before cost recording began.</p>
                  <div className="ops-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Ingredient</th>
                          <th>Stock unit</th>
                          <th>First observed cost</th>
                          <th>Latest observed cost</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.data.ingredientCosts.map((i: any) => (
                          <tr key={i.id}>
                            <td>{i.name}</td>
                            <td>{i.unit}</td>
                            <td>{money(i.firstCostPaise)}</td>
                            <td>{money(i.lastCostPaise)}</td>
                            <td>{money(i.lastCostPaise - i.firstCostPaise)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
