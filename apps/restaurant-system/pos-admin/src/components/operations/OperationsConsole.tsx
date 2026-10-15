import { ConfigurationRollback } from './ConfigurationRollback';
import { ServiceConfiguration } from './ServiceConfiguration';
import { ServiceMaturityPanels } from './ServiceMaturityPanels';
import { PrintQueueRepository } from '@jamanvaar/database';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { fetchCloudBranches, type CloudBranch } from '../../cloud/cloudClient';
import {
  ops,
  type OpsContext,
  type Versioned,
  type ServicePolicy,
  type Checklist,
  type MenuReview,
  type Schedule,
  type Complaint,
  type Person,
  type Handover,
  type Approval,
  type Acceptance,
  type Timeline,
  type Comparison,
  type TransferPreview,
  type Planning,
} from './operationsClient';
import { DisplayPreferences, StaffPracticePanel } from '@jamanvaar/ui';
import './operations.css';

const tasks = [
  ['brief', 'Daily brief'],
  ['recurring', 'Recurring menus'],
  ['rollback', 'Restore configuration'],
  ['cashier', 'Cashier & refills'],
  ['recovery', 'Guided recovery'],
  ['exceptions', 'Payment exceptions'],
  ['costs', 'Historical food costs'],
  ['rush', 'Rush hour'],
  ['checklists', 'Open & close'],
  ['service', 'Service controls'],
  ['menu', 'Menu review & schedules'],
  ['planning', 'Food margin & preparation'],
  ['branches', 'Compare branches'],
  ['complaints', 'Guest follow-up'],
  ['approvals', 'Manager approvals'],
  ['handover', 'Handovers'],
  ['transfers', 'Staff & device transfers'],
  ['history', 'Order history'],
  ['acceptance', 'Channel acceptance'],
  ['support', 'Display & support'],
  ['training', 'Staff practice'],
] as const;
type Task = (typeof tasks)[number][0];
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Could not complete this action');
const localDate = (value: Date) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const field = (f: FormData, key: string) => String(f.get(key) ?? '');
const num = (f: FormData, key: string) => Number(field(f, key));
function useData<T>(branch: string, path: string) {
  const [data, set] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, change] = useState(0);
  const loaded = useRef(false);
  const reload = useCallback(() => change((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(!loaded.current);
    setError('');
    void ops<T>(branch, path)
      .then((v) => {
        if (active) {
          loaded.current = true;
          set(v);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branch, path, revision]);
  return { data, error, loading, reload, hasData: data !== undefined };
}
function Load({
  state,
  children,
}: {
  state: { loading: boolean; error: string; reload: () => void; hasData?: boolean };
  children: ReactNode;
}) {
  return state.loading ? (
    <p role="status">Loading current branch records…</p>
  ) : state.error && !state.hasData ? (
    <div role="alert">
      {state.error} <button onClick={state.reload}>Try again</button>
    </div>
  ) : (
    <>
      {state.error && (
        <p role="alert">
          Refresh failed: {state.error} <button onClick={state.reload}>Try again</button>
        </p>
      )}
      {children}
    </>
  );
}
function Card({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="ops-card">
      <h3>{title}</h3>
      {help && (
        <details className="ops-help">
          <summary>About this task</summary>
          <p>{help}</p>
        </details>
      )}
      {children}
    </section>
  );
}
function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="ops-field">
      {label}
      <input {...props} />
    </label>
  );
}
function Check({
  name,
  children,
  checked,
  onChange,
}: {
  name?: string;
  children: ReactNode;
  checked?: boolean;
  onChange?: () => void;
}) {
  return (
    <label className="ops-check">
      <input name={name} type="checkbox" checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}
function Form({
  onSave,
  children,
  label = 'Save changes',
}: {
  onSave: (f: FormData) => Promise<unknown>;
  children: ReactNode;
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await onSave(f);
      setMessage('Saved successfully.');
      window.dispatchEvent(new CustomEvent('jamanvaar-ops-notice', { detail: 'Saved successfully.' }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)}>
      <fieldset disabled={busy}>
        {children}
        <button className="ops-primary" type="submit">
          {busy ? 'Saving…' : label}
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
function Action({ children, run }: { children: ReactNode; run: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <>
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMessage('');
          void run()
            .then(() => setMessage('Done.'))
            .catch((e) => setMessage(errorText(e)))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? 'Working…' : children}
      </button>
      {message && <p role="status">{message}</p>}
    </>
  );
}
function Empty({ children = 'No records yet.' }: { children?: ReactNode }) {
  return <p className="ops-empty">{children}</p>;
}
function DateText({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString()}</time>;
}
function Download({ data, name, label }: { data: unknown; name: string; label: string }) {
  return (
    <button
      onClick={() => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      {label}
    </button>
  );
}

export function OperationsConsole({ branchId }: { branchId?: string | null }) {
  const [branches, setBranches] = useState<CloudBranch[]>([]),
    [chosen, choose] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void fetchCloudBranches()
      .then((rows) => {
        if (alive) {
          setBranches(rows.filter((b) => b.status === 'ACTIVE'));
          if (rows.filter((b) => b.status === 'ACTIVE').length === 1)
            choose(rows.find((b) => b.status === 'ACTIVE')!.id);
        }
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, []);
  const branch = branchId && branchId !== 'all' ? branchId : chosen;
  return (
    <div className="ops-console">
      <header>
        <div>
          <p className="ops-eyebrow">BRANCH OPERATIONS</p>
          <h2>Keep service running smoothly</h2>
          <p>Daily tasks, planned changes and clear follow-up in one place.</p>
        </div>
        {(!branchId || branchId === 'all') && (
          <label className="ops-field">
            Working branch
            <select aria-label="Working branch" value={chosen} onChange={(e) => choose(e.target.value)}>
              <option value="">Choose a branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      {error && <p role="alert">{error}</p>}
      {branch ? (
        <Workspace key={branch} branch={branch} branches={branches} />
      ) : (
        <Empty>Choose one branch to review or change its operations.</Empty>
      )}
    </div>
  );
}
function Workspace({ branch, branches }: { branch: string; branches: CloudBranch[] }) {
  const state = useData<OpsContext>(branch, 'context');
  const [notice, setNotice] = useState('');
  const [focusVersion, setFocusVersion] = useState(0);
  useEffect(() => {
    const listener = (e: Event) => {
      setNotice((e as CustomEvent<string>).detail);
      state.reload();
    };
    window.addEventListener('jamanvaar-ops-notice', listener);
    return () => window.removeEventListener('jamanvaar-ops-notice', listener);
  }, []);
  const [task, setTask] = useState<Task>(() => {
    const value = new URLSearchParams(location.search).get('opsTask');
    return tasks.find((t) => t[0] === value)?.[0] ?? 'rush';
  });
  useEffect(() => {
    const listener = (e: Event) => {
      const value = (e as CustomEvent<string>).detail;
      const found = tasks.find((t) => t[0] === value);
      if (found) {setTask(found[0]);setFocusVersion(v=>v+1);}
    };
    window.addEventListener('jamanvaar-ops-open-task', listener);
    return () => window.removeEventListener('jamanvaar-ops-open-task', listener);
  }, []);
  const [search, setSearch] = useState('');
  const [pinIds, setPins] = useState<string[]>([]);
  const pinKey = 'jamanvaar-ops-pins:' + branch + ':' + (state.data?.viewerId ?? '');
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(pinKey) || '[]');
      setPins(Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);
    } catch {
      setPins([]);
    }
  }, [pinKey]);
  useEffect(() => {
    const timer = setInterval(state.reload, 20000);
    return () => clearInterval(timer);
  }, [state.reload]);
  const select = (next: Task) => {
    setNotice('');
    setTask(next);
    const url = new URL(location.href);
    url.searchParams.set('opsTask', next);
    history.replaceState(null, '', url);
  };
  const togglePin = (id: string) => {
    const next = pinIds.includes(id) ? pinIds.filter((p) => p !== id) : [...pinIds, id];
    setPins(next);
    try {
      localStorage.setItem(pinKey, JSON.stringify(next));
    } catch {
      /* optional local preference */
    }
  };
  const available = tasks.filter(
    (t) =>
      (!['planning', 'approvals', 'costs', 'cashier'].includes(t[0]) || state.data?.apps.includes('POS_ADMIN')) &&
      (!['branches', 'transfers', 'recurring', 'rollback'].includes(t[0]) || state.data?.role === 'OWNER'),
  );
  return (
    <Load state={state}>
      {state.data && (
        <>
          {notice && <p role="status">{notice}</p>}
          <p className="ops-scope">
            <strong>{state.data.branch.name}</strong> · {state.data.branch.timezone} · Branch changes affect
            this branch. Menu publication is restaurant-wide.
          </p>
          <div className="ops-layout">
            <nav aria-label="Operations tasks">
              <label className="ops-mobile-task">Current task<select aria-label="Current operations task" value={task} onChange={e=>select(e.target.value as Task)}>{available.map(([id,label])=><option value={id} key={id}>{pinIds.includes(id)?'★ ':''}{label}</option>)}</select></label>
              <Input
                label="Search by task"
                placeholder="refund, pause ordering, change price…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className={`ops-task-list ${search?'is-search':''}`}>{available
                .filter(
                  ([id, label]) =>
                    !search ||
                    `${id} ${label} ${id === 'approvals' ? 'refund discount' : id === 'menu' ? 'change price publish' : id === 'service' ? 'pause ordering kitchen capacity' : ''}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
                .sort((a, b) => Number(pinIds.includes(b[0])) - Number(pinIds.includes(a[0])))
                .map(([id, label]) => (
                  <div className="ops-nav-row" key={id}>
                    <button aria-current={task === id ? 'page' : undefined} onClick={() => select(id)}>
                      {label}
                    </button>
                    <button
                      aria-label={`${pinIds.includes(id) ? 'Unpin' : 'Pin'} ${label}`}
                      aria-pressed={pinIds.includes(id)}
                      onClick={() => togglePin(id)}
                    >
                      {pinIds.includes(id) ? '★' : '☆'}
                    </button>
                  </div>
                ))}</div>
            </nav>
            <main key={task+String(focusVersion)}>
              <h2>{tasks.find((t) => t[0] === task)?.[1]}</h2>
              {task === 'rollback' && <ConfigurationRollback branch={branch} />}
              {(task === 'recurring' || task === 'cashier') && <ServiceConfiguration branch={branch} view={task} />}
              {(['brief','recovery','exceptions','costs'] as string[]).includes(task) && <ServiceMaturityPanels key={task} branch={branch} task={task as 'brief'|'recovery'|'exceptions'|'costs'} />}
              {task === 'rush' && <Rush branch={branch} context={state.data} select={select} />}
              {task === 'checklists' && <Checklists branch={branch} context={state.data} />}
              {task === 'service' && <Service branch={branch} />}
              {task === 'menu' && <Menu branch={branch} owner={state.data.role === 'OWNER'} />}
              {task === 'planning' && <PlanningView branch={branch} />}
              {task === 'branches' && <Branches branch={branch} branches={branches} />}
              {task === 'complaints' && <Complaints branch={branch} />}
              {task === 'approvals' && <Approvals branch={branch} />}
              {task === 'handover' && <Handovers branch={branch} />}
              {task === 'transfers' && <Transfers branch={branch} branches={branches} context={state.data} />}
              {task === 'history' && <History branch={branch} orders={state.data.orders} />}
              {task === 'acceptance' && <AcceptanceView branch={branch} />}
              {task === 'support' && <Support branch={branch} />}
              {task === 'training' && <StaffPracticePanel />}
            </main>
          </div>
        </>
      )}
    </Load>
  );
}
function Rush({
  branch,
  context,
  select,
}: {
  branch: string;
  context: OpsContext;
  select: (t: Task) => void;
}) {
  const [link, setLink] = useState('');
  const unpaid = context.orders.filter((o) => !['PAID', 'SUCCESS'].includes(o.paymentStatus ?? '')),
    ready = context.orders.filter((o) => o.status === 'READY'),
    preparing = context.orders.filter((o) => !['SERVED', 'COMPLETED', 'READY'].includes(o.status));
  return (
    <>
      <div className="ops-metrics">
        {[
          ['Kitchen backlog', preparing.length],
          ['Ready to serve', ready.length],
          ['Unpaid bills', unpaid.length],
          ['Devices need attention', context.devices.filter((d) => d.health !== 'online').length],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <Card
        title="Service queue"
        help="This list follows canonical branch orders, refreshed every 20 seconds. Payment collection and kitchen status are separate."
      >
        <p>Showing up to 200 oldest open or unpaid orders. Counts above describe the displayed queue.</p>
        <div className="ops-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Table / source</th>
                <th>Progress</th>
                <th>Age</th>
                <th>Collection</th>
              </tr>
            </thead>
            <tbody>
              {context.orders.map((o) => (
                <tr key={o.externalOrderId}>
                  <td>{o.label}</td>
                  <td>{o.tableLabel || o.source}</td>
                  <td>{o.status}</td>
                  <td>{o.ageMinutes} min</td>
                  <td>
                    {o.paymentStatus || 'UNPAID'} · {o.total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!context.orders.length && <Empty>No waiting orders.</Empty>}
        <button onClick={() => select('history')}>Open order history</button>
        <button onClick={() => select('service')}>Pause or manage capacity</button>
      </Card>
      <Card
        title="Customer pickup display"
        help="Create a private TV link showing tokens only. The link expires in 12 hours; creating another link invalidates the old one."
      >
        <Action
          run={async () => {
            const r = await ops<{ token: string }>(branch, 'pickup-link', {});
            setLink(`${location.origin}/restaurant-admin/?pickup=${r.token}`);
          }}
        >
          Create TV display link
        </Action>
        {link && (
          <p>
            <a href={link} target="_blank" rel="noreferrer">
              Open pickup display
            </a>
          </p>
        )}
      </Card>
    </>
  );
}
function Checklists({ branch, context }: { branch: string; context: OpsContext }) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: context.branch.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const state = useData<Versioned<Checklist>>(branch, 'checklist?day=' + date);
  return (
    <Load state={state}>
      {(['OPEN', 'CLOSE'] as const).map((phase) => (
        <Card
          key={phase}
          title={phase === 'OPEN' ? 'Before opening' : 'Before closing'}
          help="A staff confirmation records who reviewed these checks and the current order/device snapshot. It does not automatically settle bills or certify hardware."
        >
          <Form
            label={`Record ${phase === 'OPEN' ? 'opening' : 'closing'} checks`}
            onSave={async (f) => {
              await ops(branch, 'checklist', {
                day: date,
                phase,
                expectedVersion: state.data?.version ?? 0,
                checks: Object.fromEntries(
                  (phase === 'OPEN'
                    ? ['menu', 'devices', 'printers', 'cash']
                    : ['unpaid', 'kitchen', 'requests', 'cash']
                  ).map((k) => [k, f.get(k) === 'on']),
                ),
                notes: field(f, 'notes'),
              });
              state.reload();
            }}
          >
            {(phase === 'OPEN'
              ? [
                  ['menu', `Published menu reviewed (${context.publishedDishes} dishes)`],
                  ['devices', 'Device connections checked'],
                  ['printers', 'Test receipt printed and checked'],
                  ['cash', 'Opening cash counted'],
                ]
              : [
                  ['unpaid', 'Unpaid bills reviewed and assigned'],
                  ['kitchen', 'Kitchen backlog resolved or handed over'],
                  ['requests', 'Guest requests and complaints reviewed'],
                  ['cash', 'Closing cash reconciled'],
                ]
            ).map(([name, label]) => (
              <Check key={name} name={name}>
                {label}
              </Check>
            ))}
            <Input label="Notes / unresolved work" name="notes" maxLength={2000} />
          </Form>
        </Card>
      ))}
      <Card title="Recorded checks">
        {state.data?.data?.history
          .slice()
          .reverse()
          .map((r, i) => (
            <p key={i}>
              <strong>{r.phase}</strong> · <DateText value={r.at} /> · {r.openOrders} open orders · {r.notes}
            </p>
          )) ?? <Empty />}
      </Card>
    </Load>
  );
}
function Service({ branch }: { branch: string }) {
  const state = useData<Versioned<ServicePolicy>>(branch, 'service');
  const [hours, setHours] = useState<ServicePolicy['hours']>([]);
  useEffect(() => {
    if (state.data?.data) setHours(state.data.data.hours);
  }, [state.data]);
  return (
    <Load state={state}>
      {state.data?.data && (
        <Card
          title="Branch service controls"
          help="QR and Kiosk share this policy. Existing orders, paid orders and payment retries continue. Leaving hours empty allows ordering all day. Times follow the branch timezone; capacity counts the shared kitchen backlog."
        >
          <Form
            key={state.data.version}
            onSave={async (f) => {
              await ops(branch, 'service', {
                expectedVersion: state.data!.version,
                pausedUntil: field(f, 'pausedUntil') ? new Date(field(f, 'pausedUntil')).toISOString() : null,
                message: field(f, 'message'),
                channels: (['QR', 'KIOSK'] as const).filter((c) => f.get(c) === 'on'),
                maxPendingOrders: num(f, 'capacity'),
                preparationMinutes: num(f, 'minutes'),
                hours,
              });
              state.reload();
            }}
          >
            <div className="ops-grid">
              <Input
                label="Pause until (your device local time)"
                type="datetime-local"
                name="pausedUntil"
                defaultValue={
                  state.data.data.pausedUntil ? localDate(new Date(state.data.data.pausedUntil)) : ''
                }
              />
              <Input
                label="Message guests see while paused"
                name="message"
                defaultValue={state.data.data.message}
                maxLength={200}
                required
              />
              <Input
                label="Maximum pending kitchen orders (0 = unlimited)"
                type="number"
                name="capacity"
                min="0"
                max="10000"
                defaultValue={state.data.data.maxPendingOrders}
                required
              />
              <Input
                label="Expected preparation minutes"
                type="number"
                name="minutes"
                min="1"
                max="240"
                defaultValue={state.data.data.preparationMinutes}
                required
              />
            </div>
            {(['QR', 'KIOSK'] as const).map((c) => (
              <label className="ops-check" key={c}>
                <input type="checkbox" name={c} defaultChecked={state.data!.data!.channels.includes(c)} />
                Apply policy to {c}
              </label>
            ))}
            <h4>Weekly ordering hours (branch local time)</h4>
            {hours.map((h, i) => (
              <div className="ops-hours" key={i}>
                <label>
                  Day
                  <select
                    aria-label="Day"
                    value={h.day}
                    onChange={(e) =>
                      setHours(hours.map((v, j) => (j === i ? { ...v, day: Number(e.target.value) } : v)))
                    }
                  >
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                      (d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <Input
                  label="Opens"
                  type="time"
                  required
                  value={h.open}
                  onChange={(e) =>
                    setHours(hours.map((v, j) => (j === i ? { ...v, open: e.target.value } : v)))
                  }
                />
                <Input
                  label="Closes"
                  type="time"
                  required
                  value={h.close}
                  onChange={(e) =>
                    setHours(hours.map((v, j) => (j === i ? { ...v, close: e.target.value } : v)))
                  }
                />
                <button type="button" onClick={() => setHours(hours.filter((_, j) => i !== j))}>
                  Remove window
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={hours.length >= 21}
              onClick={() => setHours([...hours, { day: 1, open: '09:00', close: '22:00' }])}
            >
              Add opening window
            </button>
            <p>Clear the pause time to resume immediately.</p>
          </Form>
        </Card>
      )}
    </Load>
  );
}
function Menu({ branch, owner }: { branch: string; owner: boolean }) {
  const review = useData<MenuReview>(branch, 'menu-review'),
    schedules = useData<Schedule[]>(branch, 'menu-schedules');
  const [items, setItems] = useState<{ itemId: string; price: string; availability: string }[]>([]);
  return (
    <>
      <Load state={review}>
        {review.data && (
          <Card
            title="Review before publishing"
            help="Publication affects the shared restaurant menu. Prices, photos, availability, categories, options, taxes and branch overrides are compared with the last published snapshot. Publishing refuses a draft changed after this review."
          >
            <p>
              {review.data.sharedScope} · current version {review.data.version}
            </p>
            {review.data.errors.map((e, i) => (
              <p role="alert" key={i}>
                {e}
              </p>
            ))}
            {review.data.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
            {!review.data.changes.length && <Empty>No draft differences.</Empty>}
            {review.data.changes.map((c) => (
              <details key={c.id}>
                <summary>
                  {c.kind}: {c.name} · {c.affectedBranches.map((b) => b.name).join(', ')}
                </summary>
                {c.fields.map((f) => (
                  <div key={f.field}>
                    <strong>{f.field}</strong>
                    <div className="ops-diff">
                      <pre>{JSON.stringify(f.before, null, 2) ?? '—'}</pre>
                      <pre>{JSON.stringify(f.after, null, 2) ?? '—'}</pre>
                    </div>
                  </div>
                ))}
              </details>
            ))}
            {owner && !review.data.errors.length && (
              <Form
                key={review.data.checksum}
                label="Publish reviewed restaurant menu"
                onSave={async (f) => {
                  if (f.get('confirm') !== 'on') throw new Error('Confirm the restaurant-wide scope');
                  await ops(branch, 'menu-review/publish', { checksum: review.data!.checksum });
                  review.reload();
                }}
              >
                <Check name="confirm">I reviewed the changes and affected branches</Check>
              </Form>
            )}
            <button onClick={review.reload}>Refresh review</button>
          </Card>
        )}
      </Load>
      {owner && review.data && (
        <Card
          title="Schedule a menu change"
          help="Prepare one-time breakfast, lunch or festival changes. Activation updates and publishes the menu atomically. A later manual edit stops the schedule; earlier schedules can be followed by another scheduled change. Time is entered in your device timezone."
        >
          <Form
            label="Schedule reviewed changes"
            onSave={async (f) => {
              if (f.get('scope') !== 'on') throw new Error('Confirm the restaurant-wide scope');
              await ops(branch, 'menu-schedules', {
                reviewedChecksum:review.data!.checksum,
                title: field(f, 'title'),
                activateAt: new Date(field(f, 'activateAt')).toISOString(),
                changes: items.map((i) => ({
                  itemId: i.itemId,
                  ...(i.price !== '' ? { price: Number(i.price) } : {}),
                  ...(i.availability !== '' ? { isAvailable: i.availability === 'yes' } : {}),
                })),
              });
              schedules.reload();
            }}
          >
            <div className="ops-grid">
              <Input label="Schedule name" name="title" maxLength={100} required />
              <Input
                label="Activation (your device local time)"
                name="activateAt"
                type="datetime-local"
                min={localDate(new Date(Date.now() + 60000))}
                required
              />
            </div>
            {items.map((item, index) => (
              <div className="ops-hours" key={index}>
                <label>
                  Dish
                  <select
                    aria-label="Dish"
                    required
                    value={item.itemId}
                    onChange={(e) =>
                      setItems(items.map((v, i) => (i === index ? { ...v, itemId: e.target.value } : v)))
                    }
                  >
                    <option value="">Choose dish</option>
                    {review.data!.items.map((i) => (
                      <option value={i.id} key={i.id}>
                        {i.name} · {i.price}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="New price (blank = unchanged)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.price}
                  onChange={(e) =>
                    setItems(items.map((v, i) => (i === index ? { ...v, price: e.target.value } : v)))
                  }
                />
                <label>
                  Availability
                  <select
                    aria-label="Availability"
                    value={item.availability}
                    onChange={(e) =>
                      setItems(
                        items.map((v, i) => (i === index ? { ...v, availability: e.target.value } : v)),
                      )
                    }
                  >
                    <option value="">Keep current</option>
                    <option value="yes">Available</option>
                    <option value="no">Unavailable</option>
                  </select>
                </label>
                <button type="button" onClick={() => setItems(items.filter((_, i) => i !== index))}>
                  Remove dish
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setItems([...items, { itemId: '', price: '', availability: '' }])}
            >
              Add scheduled dish
            </button>
            <Check name="scope">Apply to the shared restaurant menu and its configured branches</Check>
          </Form>
        </Card>
      )}
      <Load state={schedules}>
        <Card title="Scheduled changes">
          {schedules.data?.length ? (
            schedules.data.map((s) => (
              <article key={s.id}>
                <strong>{s.title}</strong> · <DateText value={s.activateAt} /> · {s.status}
                {s.failureReason && <p role="alert">{s.failureReason}</p>}
                {s.status === 'PENDING' && owner && (
                  <Action
                    run={async () => {
                      await ops(branch, `menu-schedules/${s.id}/cancel`, { expectedVersion: s.version });
                      schedules.reload();
                    }}
                  >
                    Cancel schedule
                  </Action>
                )}
              </article>
            ))
          ) : (
            <Empty />
          )}
        </Card>
      </Load>
    </>
  );
}
function PlanningView({ branch }: { branch: string }) {
  const [days, setDays] = useState(28),
    [buffer, setBuffer] = useState(10);
  const state = useData<Planning>(branch, `planning?days=${days}&buffer=${buffer}`);
  return (
    <>
      <div className="ops-grid">
        <label>
          History window
          <select aria-label="History window" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 28, 60, 90].map((n) => (
              <option value={n} key={n}>
                {n} days
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Preparation buffer %"
          type="number"
          min="0"
          max="100"
          value={buffer}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= 0 && n <= 100) setBuffer(n);
          }}
        />
      </div>
      <Load state={state}>
        {state.data && (
          <>
            <p>{state.data.costBasis}</p>
            <p>
              {state.data.ordersAnalyzed} orders analyzed.{' '}
              {state.data.truncated ? 'Result limited to 50,000 orders; narrow the date range.' : ''}
            </p>
            <Card title="Estimated food margin">
              <div className="ops-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Dish</th>
                      <th>Current price</th>
                      <th>Ingredient cost</th>
                      <th>Food margin</th>
                      <th>Margin %</th>
                      <th>Units</th>
                      <th>Allocated sales*</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.margins.map((i) => (
                      <tr key={i.id}>
                        <td>{i.name}</td>
                        <td>{i.price ?? 'Missing'}</td>
                        <td>{i.estimatedFoodCost ?? 'Recipe / cost missing'}</td>
                        <td>{i.estimatedFoodMargin ?? '—'}</td>
                        <td>{i.marginPercent ?? '—'}</td>
                        <td>{i.units}</td>
                        <td>{i.allocatedSales.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                *Approximate allocation after order discounts; excludes refunded/cancelled orders. Current
                recipe estimates are not accounting profit.
              </p>
            </Card>
            <Card
              title="Preparation suggestions"
              help="Portions use units sold per calendar day in the selected history window, plus your buffer. Peak hour follows branch local time. Review events, weather and stock before preparing food."
            >
              <div className="ops-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Dish</th>
                      <th>Units sold</th>
                      <th>Daily average</th>
                      <th>Suggested portions</th>
                      <th>Peak hour</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.prep.map((i) => (
                      <tr key={i.id}>
                        <td>{i.name}</td>
                        <td>{i.units}</td>
                        <td>{i.averageDaily}</td>
                        <td>{i.suggestedPortions}</td>
                        <td>{i.peakHour === null ? '—' : `${i.peakHour}:00`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </Load>
    </>
  );
}
function Branches({ branch, branches }: { branch: string; branches: CloudBranch[] }) {
  const [source, setSource] = useState(''),
    [preview, setPreview] = useState<Comparison>();
  return (
    <Card
      title="Compare and selectively copy"
      help="Owner-only. Copy service hours, capacity, preparation time or affected channels. Temporary pauses, devices, staff, credentials, payment settings and branch identity are never copied."
    >
      <Form
        label="Compare with this branch"
        onSave={async (f) =>
          setPreview(
            await ops<Comparison>(
              branch,
              'comparison?sourceBranchId=' + encodeURIComponent(field(f, 'source')),
            ),
          )
        }
      >
        <label>
          Copy from
          <select
            aria-label="Copy from"
            name="source"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPreview(undefined);
            }}
            required
          >
            <option value="">Choose source branch</option>
            {branches
              .filter((b) => b.id !== branch)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>
      </Form>
      {preview && (
        <Form
          label="Apply selected settings to working branch"
          onSave={async (f) => {
            await ops(branch, 'comparison/copy', {
              sourceBranchId: preview.source.id,
              sourceVersion: preview.sourceVersion,
              targetVersion: preview.targetVersion,
              fields: preview.fields.filter((i) => f.get(i.field) === 'on').map((i) => i.field),
            });
            setPreview(undefined);
          }}
        >
          {preview.fields.map((f) => (
            <div key={f.field}>
              <Check name={f.field}>
                {f.field} {f.changed ? '(different)' : '(same)'}
              </Check>
              <div className="ops-diff">
                <pre>Source: {JSON.stringify(f.source, null, 2)}</pre>
                <pre>Working branch: {JSON.stringify(f.target, null, 2)}</pre>
              </div>
            </div>
          ))}
        </Form>
      )}
    </Card>
  );
}
function Complaints({ branch }: { branch: string }) {
  const state = useData<Complaint[]>(branch, 'complaints'),
    people = useData<Person[]>(branch, 'assignees');
  const [edit, setEdit] = useState<Complaint>();
  useEffect(()=>{const record=new URLSearchParams(location.search).get('record');if(record&&state.data)setEdit(state.data.find(c=>c.id===record));},[state.data]);
  return (
    <>
      <Card
        title={edit ? 'Update guest follow-up' : 'Create guest follow-up'}
        help="Assign a manager or owner and a due time. Include an existing branch order reference if relevant. Resolution notes are required before closing."
      >
        <Form
          key={edit?.id ?? 'new'}
          label={edit ? 'Save follow-up' : 'Create follow-up'}
          onSave={async (f) => {
            await ops(branch, 'complaints', {
              id: edit?.id,
              expectedVersion: edit?.version ?? 0,
              title: field(f, 'title'),
              orderId: field(f, 'orderId'),
              assignedTo: field(f, 'assignedTo'),
              dueAt: new Date(field(f, 'dueAt')).toISOString(),
              status: field(f, 'status'),
              resolution: field(f, 'resolution'),
            });
            setEdit(undefined);
            state.reload();
          }}
        >
          <Input
            label="Issue / requested action"
            name="title"
            maxLength={200}
            defaultValue={edit?.title}
            required
          />
          <div className="ops-grid">
            <Input label="Order reference (optional)" name="orderId" defaultValue={edit?.orderId} />
            <Input
              label="Due (your device local time)"
              name="dueAt"
              type="datetime-local"
              defaultValue={localDate(edit ? new Date(edit.dueAt) : new Date(Date.now() + 3600000))}
              required
            />
            <label>
              Assigned to
              <select
                aria-label="Assigned to"
                name="assignedTo"
                defaultValue={edit?.assignedTo ?? ''}
                required
              >
                <option value="">Choose a manager</option>
                {people.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select aria-label="Status" name="status" defaultValue={edit?.status ?? 'OPEN'}>
                {['OPEN', 'IN_PROGRESS', 'RESOLVED'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <Input
            label="Resolution / follow-up notes"
            name="resolution"
            maxLength={2000}
            defaultValue={edit?.resolution}
          />
        </Form>
        {edit && <button onClick={() => setEdit(undefined)}>Cancel edit</button>}
      </Card>
      <Load state={state}>
        <Card title="Follow-up queue">
          {state.data?.length ? (
            state.data.map((c) => (
              <article key={c.id}>
                <strong>{c.title}</strong> · {c.status} · Due <DateText value={c.dueAt} />
                {c.status !== 'RESOLVED' && Date.parse(c.dueAt) < Date.now() && <strong> · Overdue</strong>}
                <p>
                  {people.data?.find((p) => p.id === c.assignedTo)?.fullName} · {c.resolution}
                </p>
                <details>
                  <summary>Resolution history</summary>
                  {c.history?.map((event, i) => (
                    <p key={i}>
                      <DateText value={event.at} /> ? {event.status} ? {event.resolution}
                    </p>
                  ))}
                </details>
                <button onClick={() => setEdit(c)}>Update follow-up</button>
              </article>
            ))
          ) : (
            <Empty />
          )}
        </Card>
      </Load>
    </>
  );
}
function Approvals({ branch }: { branch: string }) {
  const state = useData<Approval[]>(branch, 'approvals');
  useEffect(() => {
    const timer = setInterval(state.reload, 10000);
    return () => clearInterval(timer);
  }, [state.reload]);
  return (
    <Load state={state}>
      <Card
        title="Remote manager approvals"
        help="Cashiers request approval from the POS terminal. An authorized branch manager or owner approves the specific pending action. Refund approvals bind the payment, amount and retry key and expire shortly after claim."
      >
        {state.data?.length ? (
          state.data.map((a) => (
            <article key={a.id}>
              <strong>
                {a.action} · {a.requestedBy}
              </strong>
              <p>{a.details}</p>
              <p>
                {a.status} · Expires <DateText value={a.expiresAt} />
              </p>
              {a.status === 'PENDING' && Date.parse(a.expiresAt) > Date.now() && (
                <Form
                  label="Submit decision"
                  onSave={async (f) => {
                    await ops(branch, `approvals/${a.id}/decision`, {
                      expectedVersion: a.version,
                      approved: field(f, 'decision') === 'approve',
                      reason: field(f, 'reason'),
                    });
                    state.reload();
                  }}
                >
                  <Input label="Decision reason" name="reason" maxLength={500} required />
                  <label>
                    Decision
                    <select aria-label="Decision" name="decision">
                      <option value="approve">Approve this action</option>
                      <option value="reject">Reject</option>
                    </select>
                  </label>
                </Form>
              )}
            </article>
          ))
        ) : (
          <Empty>No requests from POS terminals.</Empty>
        )}
      </Card>
    </Load>
  );
}
function Handovers({ branch }: { branch: string }) {
  const state = useData<Handover[]>(branch, 'handovers'),
    people = useData<Person[]>(branch, 'assignees');
  return (
    <>
      <Card
        title="Prepare a branch handover"
        help="The handover freezes the current open-order and complaint list. The named recipient must sign in and acknowledge it; creating a handover does not settle cash or complete orders."
      >
        <Form
          label="Send handover for acknowledgement"
          onSave={async (f) => {
            await ops(branch, 'handovers', {
              expectedVersion: 0,
              recipientId: field(f, 'recipientId'),
              notes: field(f, 'notes'),
              acknowledge: false,
            });
            state.reload();
          }}
        >
          <label>
            Receiving manager
            <select aria-label="Receiving manager" name="recipientId" required>
              <option value="">Choose recipient</option>
              {people.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Cash, guest requests, held work and follow-up notes"
            name="notes"
            maxLength={2000}
            required
          />
        </Form>
      </Card>
      <Load state={state}>
        <Card title="Handover history">
          {state.data?.length ? (
            state.data.map((h) => (
              <article key={h.id}>
                <strong>To {people.data?.find((p) => p.id === h.recipientId)?.fullName}</strong> ·{' '}
                <DateText value={h.createdAt} />
                <p>{h.notes}</p>
                <p>
                  {h.pendingServiceRequests ?? 0} pending service requests ? {h.deviceIssues?.length ?? 0}{' '}
                  devices need review
                </p>
                <p>
                  {h.openOrders.length} open orders · {h.openComplaints.length} complaints ·{' '}
                  {h.acceptedAt ? 'Acknowledged' : 'Awaiting recipient'}
                </p>
                <details>
                  <summary>Outstanding work at handover</summary>
                  {h.openOrders.map((o) => (
                    <p key={o.label}>
                      {o.label} · {o.status} · {o.paymentStatus || 'UNPAID'}
                    </p>
                  ))}
                </details>
                {!h.acceptedAt && (
                  <Action
                    run={async () => {
                      await ops(branch, 'handovers', {
                        id: h.id,
                        expectedVersion: h.version,
                        recipientId: h.recipientId,
                        notes: '',
                        acknowledge: true,
                      });
                      state.reload();
                    }}
                  >
                    Acknowledge as recipient
                  </Action>
                )}
              </article>
            ))
          ) : (
            <Empty />
          )}
        </Card>
      </Load>
    </>
  );
}
function Transfers({
  branch,
  branches,
  context,
}: {
  branch: string;
  branches: CloudBranch[];
  context: OpsContext;
}) {
  const [preview, setPreview] = useState<TransferPreview>(),
    [target, setTarget] = useState(''),
    [record, setRecord] = useState({ kind: 'DEVICE' as 'DEVICE' | 'STAFF', id: '' }),
    [result, setResult] = useState('');
  return (
    <Card
      title="Guided reassignment"
      help="Owner-only. Devices use the existing license-checked replacement flow rather than editing identity files. Staff must hand over active tables. Review pending work before confirming."
    >
      <Form
        label="Review transfer"
        onSave={async (f) => {
          setResult('');
          const r = { kind: field(f, 'kind') as 'DEVICE' | 'STAFF', id: field(f, 'id') };
          const t = field(f, 'target');
          setRecord(r);
          setTarget(t);
          setPreview(await ops<TransferPreview>(branch, 'transfers/preview', { ...r, targetBranchId: t }));
        }}
      >
        <label>
          Record type
          <select aria-label="Record type" name="kind">
            <option value="DEVICE">Device replacement / transfer</option>
            <option value="STAFF">Staff reassignment</option>
          </select>
        </label>
        <Input label="Current record ID" name="id" required list="ops-devices" />
        <datalist id="ops-devices">
          {context.devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name || d.type}
            </option>
          ))}
        </datalist>
        <label>
          Destination branch
          <select aria-label="Destination branch" name="target" required>
            <option value="">Choose destination</option>
            {branches
              .filter((b) => b.id !== branch)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>
      </Form>
      {preview && (
        <div>
          <h4>{preview.name}</h4>
          <p>{preview.explanation}</p>
          <p>
            Open orders: {preview.openOrders ?? '—'} · Pending sync: {preview.pendingSync ?? '—'} · Open
            tables: {preview.openTables ?? '—'}
          </p>
          {preview.blocking ? (
            <p role="alert">Finish pending work and reconnect the original terminal before transferring.</p>
          ) : (
            <Form
              label="Confirm reviewed transfer"
              onSave={async (f) => {
                if (f.get('ack') !== 'on') throw new Error('Confirm you reviewed pending work');
                const r = await ops<{ message: string; activationKey?: string }>(branch, 'transfers', {
                  ...record,
                  targetBranchId: target,
                  expectedVersion: preview.version,
                  acknowledge: true,
                });
                setResult(
                  r.message + (r.activationKey ? ' One-time activation key: ' + r.activationKey : ''),
                );
                setPreview(undefined);
              }}
            >
              <Check name="ack">Pending work is reviewed and this is the correct destination</Check>
            </Form>
          )}
        </div>
      )}
      {result && <p role="status">{result}</p>}
    </Card>
  );
}
function History({ branch, orders }: { branch: string; orders: OpsContext['orders'] }) {
  const [id, setId] = useState(new URLSearchParams(location.search).get('order') ?? ''),
    [selected, setSelected] = useState(new URLSearchParams(location.search).get('order') ?? '');
  return (
    <>
      <Card title="Find a branch order">
        <Form label="Show recorded timeline" onSave={async () => setSelected(id)}>
          <Input
            label="Order reference"
            value={id}
            onChange={(e) => setId(e.target.value)}
            list="ops-order-refs"
            required
          />
          <datalist id="ops-order-refs">
            {orders.map((o) => (
              <option key={o.externalOrderId} value={o.externalOrderId}>
                {o.label}
              </option>
            ))}
          </datalist>
        </Form>
      </Card>
      {selected && <OrderTimeline key={selected} branch={branch} id={selected} />}
    </>
  );
}
function OrderTimeline({ branch, id }: { branch: string; id: string }) {
  const state = useData<Timeline>(branch, 'timeline/' + encodeURIComponent(id));
  return (
    <Load state={state}>
      {state.data && (
        <Card title={`Order ${state.data.label}`}>
          <p>
            {state.data.status} · {state.data.paymentStatus}
          </p>
          <ol>
            {state.data.events.map((e, i) => (
              <li key={i}>
                <DateText value={e.at} /> · <strong>{e.type}</strong> · {e.detail} {e.actor && `· ${e.actor}`}{' '}
                {e.amount !== undefined && `· ${e.amount.toFixed(2)}`}
              </li>
            ))}
          </ol>
          <p>{state.data.note}</p>
          <button onClick={state.reload}>Refresh timeline</button>
        </Card>
      )}
    </Load>
  );
}
function AcceptanceView({ branch }: { branch: string }) {
  const state = useData<Acceptance>(branch, 'acceptance');
  const [selected, setSelected] = useState<Record<string, string>>({});
  return (
    <Load state={state}>
      {state.data && (
        <>
          {state.data.channels.map((source) => {
            const online = state.data!.orders.find((o) => o.id === selected[source])?.online ?? false;
            const record = state.data!.records.find((r) => r.source === source && r.onlinePayment === online);
            return (
              <Card
                key={source}
                title={`${source} acceptance`}
                help="Select a real, paid and served/completed order created after the latest menu publication. Counter routing, kitchen progress and receipt delivery are separate staff checks. Online return is recorded separately from cash acceptance."
              >
                <p>
                  {record?.current ? 'Current verified test recorded' : 'A current test is needed'} · Menu
                  version {state.data!.menuVersion}
                </p>
                <p>
                  Counter acceptance:{' '}
                  {state.data!.records.some((r) => r.source === source && !r.onlinePayment && r.current)
                    ? 'Recorded'
                    : 'Needed'}{' '}
                  · Online payment acceptance:{' '}
                  {state.data!.records.some((r) => r.source === source && r.onlinePayment && r.current)
                    ? 'Recorded'
                    : 'Not yet recorded'}
                </p>
                <Form
                  key={source + String(online)}
                  label={`Record ${source} test`}
                  onSave={async (f) => {
                    await ops(branch, 'acceptance', {
                      source,
                      orderId: field(f, 'orderId'),
                      expectedVersion: record?.version ?? 0,
                      counter: f.get('counter') === 'on',
                      kitchen: f.get('kitchen') === 'on',
                      receipt: f.get('receipt') === 'on',
                      onlineReturn: f.get('onlineReturn') === 'on',
                    });
                    state.reload();
                  }}
                >
                  <label>
                    Completed test order
                    <select
                      aria-label="Completed test order"
                      name="orderId"
                      required
                      value={selected[source] ?? ''}
                      onChange={(e) => setSelected((v) => ({ ...v, [source]: e.target.value }))}
                    >
                      <option value="">Choose test order</option>
                      {state
                        .data!.orders.filter((o) => o.source === source)
                        .map((o) => (
                          <option value={o.id} key={o.id}>
                            {o.label} · {o.online ? 'Online' : 'Counter'}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Check name="counter">Counter received the correct order</Check>
                  <Check name="kitchen">Kitchen received and completed the order</Check>
                  <Check name="receipt">Receipt was received and checked</Check>
                  <Check name="onlineReturn">Online payment app return was verified (online orders)</Check>
                </Form>
              </Card>
            );
          })}
        </>
      )}
    </Load>
  );
}
function Support({ branch }: { branch: string }) {
  const state = useData<unknown>(branch, 'diagnostics');
  return (
    <>
      <DisplayPreferences />
      <Card
        title="Share support diagnostics"
        help="The export contains versions, device connection states and pending sync counts. Customer names, contact details, PINs, credentials, raw logs and payment details are excluded."
      >
        <Load state={state}>
          {!!state.data && (
            <Download
              data={{
                server: state.data,
                localPrintQueue: {
                  scope: 'This admin console only',
                  statusCounts: PrintQueueRepository.getAllJobs().reduce<Record<string, number>>(
                    (counts, job) => ({ ...counts, [job.status]: (counts[job.status] ?? 0) + 1 }),
                    {},
                  ),
                },
              }}
              name="jamanvaar-support-diagnostics.json"
              label="Download sanitized diagnostics"
            />
          )}
        </Load>
      </Card>
    </>
  );
}
