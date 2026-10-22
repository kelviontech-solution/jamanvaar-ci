import { csvDownload } from './QrWorkflows';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@jamanvaar/ui';
import { formatINR, formatRestaurantDate } from '@jamanvaar/utils';
import { qrApi } from '../../cloud/cloudClient';
import { requestQrLeave, useQrUnsavedChanges } from './useQrUnsavedChanges';
import { FeatureRequestButton } from './FeatureRequestButton';
import { QR_FIELD } from './qrUi';
import { QrLoyaltySetup } from './QrLoyaltySetup';
const base = '/api/v1/restaurant/qr/crm';
const field = QR_FIELD;
const button = 'min-h-11 rounded-xl border px-4 py-2 font-bold bg-white disabled:opacity-40';
const paymentLabels: Record<string, string> = {
  SUCCESS: 'Paid',
  PAID: 'Paid',
  PENDING: 'Payment due',
  PARTIALLY_PAID: 'Part paid',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Part refunded',
  REFUND_PENDING: 'Refund pending'
};
type Customer = {
  phone: string;
  name: string;
  email: string;
  notes: string;
  points: number;
  spend: number;
  visits: number;
  version: number;
  consent?: { email: boolean; whatsapp: boolean; source: string; at?: string } | null;
};
type Program = { version: number; enabled: boolean; earnPoints: number; perRupeesSpent: number };
type Reward = {
  id?: string;
  version: number;
  name: string;
  description: string;
  pointsCost: number;
  discountAmount: number;
  discountKind?: string;
  isActive: boolean;
  expiresAt?: string | null;
};
export function QrCrm() {
  const [rows, setRows] = useState<Customer[]>([]),
    [total, setTotal] = useState(0),
    [search, setSearch] = useState(''),
    [segment, setSegment] = useState('ALL'),
    [exportSegment, setExportSegment] = useState('ALL'),
    [followup, setFollowup] = useState(''),
    [cursor, setCursor] = useState(''),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0),
    [locked, setLocked] = useState(false);
  const [config, setConfig] = useState<{
      program: Program;
      rewards: Reward[];
      canManageProgram: boolean;
      qrChannelEnabled: boolean;
      phoneVerificationReady: boolean;
    } | null>(null),
    [program, setProgram] = useState<Program | null>(null),
    [reward, setReward] = useState<Reward | null>(null),
    [customer, setCustomer] = useState<Partial<Customer> | null>(null),
    [detail, setDetail] = useState<any>(null),
    [points, setPoints] = useState(''),
    [reason, setReason] = useState('');
  const followupAttempt = useRef<{ identity: string; key: string } | null>(null);
  const mutationBusy = useRef(false);
  const adjustment = useRef<{ identity: string; key: string } | null>(null),
    baseline = useRef('');
  useQrUnsavedChanges(
    (!!customer && JSON.stringify(customer) !== baseline.current) ||
      (!!reward && JSON.stringify(reward) !== baseline.current) ||
      (!!program && JSON.stringify(program) !== JSON.stringify(config?.program)) ||
      !!points ||
      !!reason ||
      !!followup
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setRows([]);
    const timer = setTimeout(() => {
      qrApi<{ rows: Customer[]; total: number; nextCursor: string | null }>(base + '?' + new URLSearchParams({ search, cursor, segment }))
        .then((r) => {
          if (active) {
            setRows(r.rows);
            setTotal(r.total);
            setNext(r.nextCursor);
            setLocked(false);
            setError('');
          }
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            setLocked(/not included|does not enable|subscription/i.test(e.message));
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, cursor, refresh, segment]);
  useEffect(() => {
    let active = true;
    qrApi<any>(base + '/program')
      .then((c) => {
        if (active) setConfig(c);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  async function run(action: () => Promise<void>, message: string) {
    if (mutationBusy.current) return;
    mutationBusy.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setRefresh((r) => r + 1);
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Your draft is retained.');
    } finally {
      mutationBusy.current = false;
      setBusy(false);
    }
  }
  async function open(row: Customer) {
    setError('');
    try {
      setDetail(await qrApi(base + '/customers/' + encodeURIComponent(row.phone)));
      setPoints('');
      setReason('');
      setFollowup('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function edit(row?: Customer) {
    const next = row
      ? { ...row, consent: row.consent || { email: false, whatsapp: false, source: '' } }
      : { phone: '', name: '', email: '', notes: '', consent: { email: false, whatsapp: false, source: '' } };
    baseline.current = JSON.stringify(next);
    setCustomer(next);
  }
  function editReward(row?: Reward) {
    const next = row ? { ...row } : { version: 0, name: '', description: '', pointsCost: 150, discountAmount: 100, isActive: true };
    baseline.current = JSON.stringify(next);
    setReward(next);
  }
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-white p-5 space-y-3">
        <h2 className="sr-only">Customers & loyalty</h2>
        <p className="text-sm text-slate-600">Saved guest details, earned points and rewards in one place.</p>
        <div className="flex flex-wrap gap-3">
          <button className={button} disabled={locked} onClick={() => edit()}>
            Add customer
          </button>
          <button className={button} disabled={!config?.canManageProgram} onClick={() => setProgram({ ...config!.program })}>
            Loyalty program
          </button>
          <button className={button} onClick={() => setRefresh((r) => r + 1)}>
            Refresh customers
          </button>
        </div>
        {config && (
          <p className="text-sm">
            Program {config.program.enabled ? 'active' : 'paused'} / Earn {config.program.earnPoints} points per {formatINR(config.program.perRupeesSpent)}{' '}
            paid.{' '}
            {config.canManageProgram ? 'You can manage the restaurant-wide program.' : 'Only the owner changes restaurant-wide rewards and earning rules.'}
          </p>
        )}
        {config && <QrLoyaltySetup config={config} canManage={config.canManageProgram} onProgram={() => setProgram({...config.program})} onReward={() => editReward()} onChannel={() => {void requestQrLeave().then(ok => {if(ok)window.location.assign(config.phoneVerificationReady ? '?tab=ADVANCED&feature=Settings' : '?tab=SUPPORT');});}} />}
      </section>
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">
          {notice}
        </p>
      )}
      {locked ? (
        <FeatureRequestButton featureCode="QR_LOYALTY" featureLabel="Customer loyalty" />
      ) : (
        <>
          <section className="rounded-2xl border bg-white p-5 space-y-4">
            <label>
              Customer segment
              <select
                aria-label="Customer segment"
                className={field}
                value={segment}
                onChange={(e) => {
                  setSegment(e.target.value);
                  setCursor('');
                }}
              >
                {[
                  ['ALL', 'All customers'],
                  ['RETURNING', 'Returning guests (2+ visits)'],
                  ['POINTS', 'Customers with points'],
                  ['EMAIL', 'Email consent recorded'],
                  ['WHATSAPP', 'WhatsApp consent recorded']
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {config?.canManageProgram && (
              <details className="rounded-xl border p-3 space-y-2"><summary className="cursor-pointer font-bold">Export customer contacts</summary>
                <label>
                  Owner export scope
                  <select aria-label="Owner export scope" className={field} value={exportSegment} onChange={(e) => setExportSegment(e.target.value)}>
                    <option value="ALL">Customer records (no email marketing list)</option>
                    <option value="EMAIL">Consented email contacts</option>
                    <option value="WHATSAPP">Consented WhatsApp contacts</option>
                  </select>
                </label>
                <p className="text-xs">Exports are audited. Do not use a customer-record export for campaigns without channel-specific consent.</p>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const r = await qrApi<any>(base + '/export?segment=' + exportSegment);
                      csvDownload(
                        'qr-customers-' + exportSegment.toLowerCase() + '.csv',
                        ['Name', 'Phone', 'Email', 'Points', 'Visits', 'Spend (INR)', 'Consent recorded', 'Consent source'],
                        r.rows.map((r: any) => [r.name, r.phone, r.email, r.points, r.visits, r.spend, r.consentAt, r.consentSource])
                      );
                    }, 'Customer CSV prepared')
                  }
                >
                  Export customer CSV
                </button>
              </details>
            )}
            <label>
              Find customer by name or phone
              <input
                aria-label="Find loyalty customer"
                className={field}
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCursor('');
                }}
              />
            </label>
            {/* Q05: a failed fetch used to show "0 matching customers" right beside the error
                banner above — a false empty result indistinguishable from a restaurant that
                genuinely has none. Both this count and the empty-state line below now stay
                hidden while an error is active instead of asserting a result that never arrived. */}
            {!error && <p>{total} matching customers</p>}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => (
                <article key={row.phone} className="rounded-xl border p-4 space-y-2">
                  <h3 className="font-bold">{row.name}</h3>
                  <p>{row.phone}</p>
                  <p className="font-bold text-orange-800">{row.points} points</p>
                  <p className="text-sm">
                    {row.visits} paid visits / {formatINR(row.spend || 0)} lifetime spend
                  </p>
                  <div className="flex gap-2">
                    <button className={button} onClick={() => void open(row)}>
                      Points & history
                    </button>
                    <button className={button} onClick={() => edit(row)}>
                      Edit customer
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {loading && <p role="status">Loading customers...</p>}
            {!loading && !error && !rows.length && <p>No customers match. Add a customer or clear your search. New accounts start with zero points.</p>}
            <div className="flex gap-3">
              <button className={button} disabled={!cursor} onClick={() => setCursor('')}>
                First customers
              </button>
              <button className={button} disabled={!next} onClick={() => setCursor(next || '')}>
                More customers
              </button>
            </div>
          </section>
          <section className="rounded-2xl border bg-white p-5 space-y-3">
            <h2 className="font-bold">Rewards guests can choose at checkout</h2>
            <p>Redeeming is optional. Paused rewards cannot be redeemed; existing customer points are preserved.</p>
            <button className={button} disabled={!config?.canManageProgram} onClick={() => editReward()}>
              Add bill reward
            </button>
            <div className="grid gap-3 sm:grid-cols-2">
              {config?.rewards.map((row) => (
                <article key={row.id} className="rounded-xl border p-4">
                  <h3 className="font-bold">{row.name}</h3>
                  <p>{row.description}</p>
                  <p>
                    {row.pointsCost} points / {row.expiresAt && Date.parse(row.expiresAt) <= Date.now() ? 'Expired' : row.isActive ? 'Active' : 'Paused'}
                  </p>
                  {row.discountKind !== 'ITEM' && (
                    <button className={button} disabled={!config?.canManageProgram} onClick={() => editReward(row)}>
                      Edit reward
                    </button>
                  )}
                  {row.discountKind === 'ITEM' && <p>Item reward managed in Restaurant Admin.</p>}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      <Modal
        isOpen={!!customer}
        onClose={async () => {
          if (!busy && (await requestQrLeave())) setCustomer(null);
        }}
        title={customer?.version ? 'Edit customer' : 'Add customer'}
      >
        {customer && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const initial = JSON.parse(baseline.current).consent;
                if (
                  initial &&
                  (initial.email !== customer.consent?.email || initial.whatsapp !== customer.consent?.whatsapp) &&
                  !customer.consent?.source.trim()
                )
                  throw Error('Record the source or reason for this consent change.');
                await qrApi(base + '/customers', {
                  method: 'POST',
                  body: JSON.stringify({
                    phone: customer.phone,
                    name: customer.name,
                    email: customer.email || '',
                    notes: customer.notes || '',
                    ...(customer.consent?.source
                      ? { consent: { email: customer.consent.email, whatsapp: customer.consent.whatsapp, source: customer.consent.source } }
                      : {}),
                    ...(customer.version ? { version: customer.version } : {})
                  })
                });
                setCustomer(null);
              }, 'Customer saved');
            }}
          >
            <label>
              Name
              <input
                className={field}
                required
                maxLength={120}
                value={customer.name || ''}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              />
            </label>
            <label>
              Mobile number
              <input
                className={field}
                required
                readOnly={!!customer.version}
                inputMode="tel"
                value={customer.phone || ''}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              />
            </label>
            <label>
              Email (optional)
              <input className={field} type="email" value={customer.email || ''} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
            </label>
            <label>
              Notes
              <input className={field} maxLength={1000} value={customer.notes || ''} onChange={(e) => setCustomer({ ...customer, notes: e.target.value })} />
            </label>
            <p>Point changes are separate, reasoned ledger events. Creating a profile does not verify the guest's phone.</p>
            <fieldset className="rounded-xl border p-3 space-y-2">
              <legend>Recorded communication consent</legend>
              <p className="text-xs">Only record permission the guest actually provided. These controls do not send messages.</p>
              {(['email', 'whatsapp'] as const).map((channel) => (
                <label key={channel} className="block">
                  <input
                    type="checkbox"
                    checked={customer.consent?.[channel] || false}
                    onChange={(e) =>
                      setCustomer({
                        ...customer,
                        consent: {
                          email: customer.consent?.email || false,
                          whatsapp: customer.consent?.whatsapp || false,
                          source: customer.consent?.source || '',
                          [channel]: e.target.checked
                        }
                      })
                    }
                  />{' '}
                  {channel === 'email' ? 'Email' : 'WhatsApp'} marketing permission
                </label>
              ))}
              <label>
                Evidence / source of permission
                <input
                  className={field}
                  required={!!customer.consent?.email || !!customer.consent?.whatsapp}
                  minLength={3}
                  maxLength={300}
                  value={customer.consent?.source || ''}
                  onChange={(e) =>
                    setCustomer({
                      ...customer,
                      consent: { email: customer.consent?.email || false, whatsapp: customer.consent?.whatsapp || false, source: e.target.value }
                    })
                  }
                />
              </label>
            </fieldset>
            <button className={button} disabled={busy}>
              {busy ? 'Saving…' : 'Save customer'}
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
        )}
      </Modal>
      <Modal
        isOpen={!!program}
        onClose={async () => {
          if (!busy && (await requestQrLeave())) setProgram(null);
        }}
        title="Loyalty program"
      >
        {program && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                setConfig(
                  await qrApi(base + '/program', {
                    method: 'PUT',
                    body: JSON.stringify({
                      version: program.version,
                      enabled: program.enabled,
                      earnPoints: program.earnPoints,
                      perRupeesSpent: program.perRupeesSpent
                    })
                  })
                );
                setProgram(null);
              }, 'Loyalty program saved');
            }}
          >
            <p>These earning rules apply restaurant-wide. Pausing preserves balances and disables new redemption.</p>
            <label className="block">
              <input type="checkbox" checked={program.enabled} onChange={(e) => setProgram({ ...program, enabled: e.target.checked })} /> Enable loyalty program
            </label>
            <label>
              Points earned
              <input
                className={field}
                type="number"
                required
                min={0}
                max={10000}
                step={1}
                value={program.earnPoints}
                onChange={(e) => setProgram({ ...program, earnPoints: Number(e.target.value) })}
              />
            </label>
            <label>
              Per amount spent (INR)
              <input
                className={field}
                type="number"
                required
                min={0.01}
                max={1000000}
                step=".01"
                value={program.perRupeesSpent}
                onChange={(e) => setProgram({ ...program, perRupeesSpent: Number(e.target.value) })}
              />
            </label>
            <button className={button} disabled={busy}>
              {busy ? 'Saving…' : 'Save loyalty program'}
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
        )}
      </Modal>
      <Modal
        isOpen={!!reward}
        onClose={async () => {
          if (!busy && (await requestQrLeave())) setReward(null);
        }}
        title="Bill reward"
      >
        {reward && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                setConfig(
                  await qrApi(base + '/rewards', {
                    method: 'PUT',
                    body: JSON.stringify({
                      id: reward.id,
                      version: reward.version,
                      name: reward.name,
                      description: reward.description,
                      pointsCost: reward.pointsCost,
                      discountAmount: reward.discountAmount,
                      isActive: reward.isActive,
                      expiresAt: reward.expiresAt || null
                    })
                  })
                );
                setReward(null);
              }, 'Reward saved');
            }}
          >
            <label>
              Reward name
              <input required maxLength={120} className={field} value={reward.name} onChange={(e) => setReward({ ...reward, name: e.target.value })} />
            </label>
            <label>
              Description
              <input maxLength={1000} className={field} value={reward.description} onChange={(e) => setReward({ ...reward, description: e.target.value })} />
            </label>
            <label>
              Points required
              <input
                required
                className={field}
                type="number"
                min={1}
                max={1000000}
                step={1}
                value={reward.pointsCost}
                onChange={(e) => setReward({ ...reward, pointsCost: Number(e.target.value) })}
              />
            </label>
            <label>
              Discount (INR)
              <input
                required
                className={field}
                type="number"
                min={0.01}
                max={1000000}
                step=".01"
                value={reward.discountAmount}
                onChange={(e) => setReward({ ...reward, discountAmount: Number(e.target.value) })}
              />
            </label>
            <label>
              <input type="checkbox" checked={reward.isActive} onChange={(e) => setReward({ ...reward, isActive: e.target.checked })} /> Reward active
            </label>
            <label>
              Reward expires (your device local time; blank = no expiry)
              <input
                className={field}
                type="datetime-local"
                value={
                  reward.expiresAt
                    ? new Date(Date.parse(reward.expiresAt) - new Date(reward.expiresAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                    : ''
                }
                onChange={(e) => setReward({ ...reward, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </label>
            <button className={button} disabled={busy}>
              {busy ? 'Saving…' : 'Save reward'}
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
        )}
      </Modal>
      <Modal
        isOpen={!!detail}
        onClose={async () => {
          if (busy || !(await requestQrLeave())) return;
          setDetail(null);
          setPoints('');
          setReason('');
          setFollowup('');
        }}
        title="Customer points & history"
        maxWidth="2xl"
      >
        {detail && (
          <div className="space-y-4">
            <h3 className="font-bold">
              {detail.name} / {detail.phone}
            </h3>
            <p className="text-lg font-bold">{detail.loyaltyPoints} available points</p>
            <form
              className="space-y-3 rounded-xl border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const identity = JSON.stringify([detail.phone, points, reason]);
                if (adjustment.current?.identity !== identity) adjustment.current = { identity, key: crypto.randomUUID() };
                void run(async () => {
                  await qrApi(base + '/customers/' + encodeURIComponent(detail.phone) + '/points', {
                    method: 'POST',
                    body: JSON.stringify({ points: Number(points), reason: reason.trim(), idempotencyKey: adjustment.current!.key, version: detail.version })
                  });
                  setDetail(await qrApi(base + '/customers/' + encodeURIComponent(detail.phone)));
                  setPoints('');
                  setReason('');
                  adjustment.current = null;
                }, 'Point adjustment recorded');
              }}
            >
              <p>Add positive points or subtract with a negative value. A reason is required; the balance cannot fall below zero.</p>
              <label>
                Point adjustment
                <input
                  required
                  className={field}
                  type="number"
                  min={-1000000}
                  max={1000000}
                  step={1}
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                />
              </label>
              <label>
                Reason
                <input required minLength={3} maxLength={300} className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <button className={button} disabled={busy || !Number(points) || reason.trim().length < 3}>
                Record points adjustment
              </button>
            </form>
            {error && <p role="alert">{error}</p>}
            <h3 className="font-bold">Private follow-up notes</h3>
            <p className="text-xs">Internal service notes only. No message is sent to the guest.</p>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const identity = detail.phone + followup;
                if (followupAttempt.current?.identity !== identity) followupAttempt.current = { identity, key: crypto.randomUUID() };
                void run(async () => {
                  setDetail(
                    await qrApi(base + '/customers/' + encodeURIComponent(detail.phone) + '/followup', {
                      method: 'POST',
                      body: JSON.stringify({ version: detail.version, note: followup, idempotencyKey: followupAttempt.current!.key })
                    })
                  );
                  setFollowup('');
                  followupAttempt.current = null;
                }, 'Follow-up recorded');
              }}
            >
              <label>
                Follow-up note
                <textarea className={field} required minLength={3} maxLength={1000} value={followup} onChange={(e) => setFollowup(e.target.value)} />
              </label>
              <button className={button} disabled={busy}>
                Save follow-up
              </button>
            </form>
            {detail.followups
              ?.slice()
              .reverse()
              .map((f: any) => (
                <article key={f.id} className="rounded-xl border p-3">
                  <p>{f.note}</p>
                  <time>{formatRestaurantDate(f.at)}</time>
                </article>
              ))}
            <h3 className="font-bold">Point ledger</h3>
            <p>Opening points: {detail.loyaltyBaseline?.points || 0}</p>
            <ul className="max-h-64 overflow-auto space-y-2">
              {Object.entries(detail.loyaltyLedger || {})
                .sort((a: any, b: any) => Date.parse(b[1].at) - Date.parse(a[1].at))
                .map(([key, event]: any) => (
                  <li key={key} className="rounded-xl border p-3">
                    {event.points > 0 ? '+' : ''}
                    {event.points} points / {event.reason || key.split(':')[0]}
                    <time className="block text-xs">{formatRestaurantDate(event.at)}</time>
                  </li>
                ))}
            </ul>
            <h3 className="font-bold">Verified QR orders in this branch</h3>
            {detail.orders?.map((order: any) => (
              <p key={order.id}>
                {order.token || order.id} / {formatINR(order.total)} / {paymentLabels[order.status] || 'Payment status unavailable'} /{' '}
                {formatRestaurantDate(order.at)}
              </p>
            ))}
            {!detail.orders?.length && (
              <p>No verified QR orders recorded for this customer in this scope. Unverified phone entries do not grant account access.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
